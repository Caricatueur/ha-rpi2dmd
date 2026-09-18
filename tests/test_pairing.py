"""Pairing with real aiohttp/HA, simulated Raspberry responses and HA platforms."""
import asyncio
import json
from types import MappingProxyType
from unittest.mock import AsyncMock, Mock, patch

from aiohttp import ClientSession, web
import pytest
import pytest_asyncio
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry, ConfigEntries
from homeassistant.data_entry_flow import AbortFlow

from custom_components import rpi2dmd
from custom_components.rpi2dmd.api import RPI2DMDClient, RPI2DMDPairingError, RPI2DMDConnectionError, RPI2DMDTimeoutError
from custom_components.rpi2dmd.config_flow import RPI2DMDConfigFlow

TOKEN = 'test-pairing-secret-' + 'x' * 40
INFO = {'instance_id': 'pairing-test-device', 'rpi2dmd_version': '2.8', 'hostname': 'test-dmd'}


@pytest_asyncio.fixture
async def raspberry():
    state = {'active': True, 'code': '004321', 'status': 200, 'calls': [], 'delay': 0, 'reply': None}

    async def handler(request):
        state['calls'].append((request.method, request.path, request.headers.get('Authorization')))
        if request.path.endswith('/info'):
            return web.json_response({'ok': True, 'data': INFO})
        if request.path.endswith('/pair/status'):
            return web.json_response({'pairing_active': state['active']})
        if request.path.endswith('/pair/start'):
            if state.get('start_status'):
                return web.json_response({'success': False}, status=state['start_status'])
            state['active'] = True
            return web.json_response({'success': True, 'pairing_active': True, 'expires_in': 300})
        if request.path.endswith('/pair/exchange'):
            if state['delay']:
                await asyncio.sleep(state['delay'])
            body = await request.json()
            if not state['active'] or body.get('code') != state['code']:
                return web.json_response({'success': False, 'error': 'Invalid or expired pairing code'}, status=400)
            state['active'] = False
            return web.json_response(state['reply'] if state['reply'] is not None else {'success': True, 'token': TOKEN})
        return web.json_response({'ok': state['status'] == 200, 'data': {'online': True}, 'error': {'message': 'Rejected'}}, status=state['status'])

    app = web.Application()
    app.router.add_route('*', '/api/v1/{tail:.*}', handler)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, '127.0.0.1', 0)
    await site.start()
    host = '127.0.0.1:' + str(site._server.sockets[0].getsockname()[1])
    async with ClientSession() as session:
        yield host, session, state
    await runner.cleanup()


async def run_flow(tmp_path, raspberry, code='004321', duplicate=False):
    host, session, state = raspberry
    hass = HomeAssistant(str(tmp_path))
    flow = RPI2DMDConfigFlow()
    flow.hass = hass
    flow.handler = 'rpi2dmd'
    flow.context = {'source': 'user'}
    flow.async_set_unique_id = AsyncMock()
    flow._abort_if_unique_id_configured = Mock(side_effect=AbortFlow('already_configured') if duplicate else None)
    try:
        with patch('custom_components.rpi2dmd.config_flow.aiohttp_client.async_get_clientsession', return_value=session):
            first = await flow.async_step_user({'host': host})
            if first.get('step_id') != 'pairing':
                return first
            if code is None:
                return first
            if state.get('expire_before_exchange'):
                state['active'] = False
            return await flow.async_step_pairing({'pairing_code': code})
    finally:
        await hass.async_stop()


@pytest.mark.asyncio
async def test_host_requests_physical_code(tmp_path, raspberry):
    raspberry[2]['active'] = False
    result = await run_flow(tmp_path, raspberry, code=None)
    assert result['step_id'] == 'pairing'
    assert ('POST', '/api/v1/pair/start', None) in raspberry[2]['calls']
    assert TOKEN not in str(result)


@pytest.mark.asyncio
@pytest.mark.parametrize('status, error', [(429, 'pairing_rate_limited'), (503, 'pairing_unavailable')])
async def test_start_unavailable_and_rate_limit(tmp_path, raspberry, status, error):
    raspberry[2].update(active=False, start_status=status)
    result = await run_flow(tmp_path, raspberry)
    assert result['errors'] == {'base': error}


@pytest.mark.asyncio
@pytest.mark.parametrize('method', ['async_get_info', 'async_get_status'])
@pytest.mark.parametrize('exception, error', [(RPI2DMDTimeoutError('timeout'), 'pairing_timeout'), (RPI2DMDConnectionError('offline'), 'cannot_connect')])
async def test_flow_connection_errors(tmp_path, raspberry, method, exception, error):
    with patch.object(RPI2DMDClient, method, new=AsyncMock(side_effect=exception)):
        result = await run_flow(tmp_path, raspberry)
    assert result['errors'] == {'base': error}


@pytest.mark.asyncio
async def test_valid_flow_token_internal_only(tmp_path, raspberry, caplog):
    result = await run_flow(tmp_path, raspberry)
    assert result['type'] == 'create_entry'
    assert result['data'] == {'host': raspberry[0], 'token': TOKEN}
    assert result['version'] == 1
    assert 'pairing_code' not in result['data']
    assert TOKEN not in caplog.text
    calls = raspberry[2]['calls']
    assert calls[-1] == ('GET', '/api/v1/status', 'Bearer ' + TOKEN)
    assert all(auth is None for _, path, auth in calls if '/pair/' in path)


@pytest.mark.asyncio
@pytest.mark.parametrize('code', ['999999', 'é12345', '12345', '1234567'])
async def test_invalid_code(tmp_path, raspberry, code, caplog):
    result = await run_flow(tmp_path, raspberry, code)
    assert result['errors'] == {'base': 'invalid_pairing_code'}
    assert TOKEN not in str(result) + caplog.text
    assert all(str(key) != 'token' for key in result['data_schema'].schema)


@pytest.mark.asyncio
async def test_expired_or_inactive(tmp_path, raspberry):
    raspberry[2]['expire_before_exchange'] = True
    result = await run_flow(tmp_path, raspberry)
    assert result['errors'] == {'base': 'pairing_inactive'}
    assert not any('/exchange' in call[1] for call in raspberry[2]['calls'])


@pytest.mark.asyncio
async def test_auth_validation_failed(tmp_path, raspberry, caplog):
    raspberry[2]['status'] = 401
    result = await run_flow(tmp_path, raspberry)
    assert result['errors'] == {'base': 'invalid_auth'}
    assert TOKEN not in str(result) + caplog.text


@pytest.mark.asyncio
async def test_timeout(raspberry):
    host, session, state = raspberry
    state['delay'] = .1
    client = RPI2DMDClient(session, host, '', timeout=.01)
    with pytest.raises(RPI2DMDPairingError, match='pairing_timeout'):
        await client.async_pair('004321')


@pytest.mark.asyncio
async def test_offline():
    # Bind then close a port to obtain an unused local address.
    import socket
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        host = '127.0.0.1:' + str(sock.getsockname()[1])
    async with ClientSession() as session:
        with pytest.raises(RPI2DMDPairingError, match='cannot_connect'):
            await RPI2DMDClient(session, host, '', timeout=.2).async_pair('004321')


@pytest.mark.asyncio
@pytest.mark.parametrize('reply', [{'success': False, 'token': TOKEN}, {'success': True, 'token': 'short'}, [TOKEN], {'success': True, 'token': TOKEN + '\n'}])
async def test_malformed_never_leaks(tmp_path, raspberry, caplog, reply):
    raspberry[2]['reply'] = reply
    result = await run_flow(tmp_path, raspberry)
    assert result['errors'] == {'base': 'invalid_pairing_response'}
    assert TOKEN not in str(result) + caplog.text


@pytest.mark.asyncio
async def test_duplicate_does_not_consume_code(tmp_path, raspberry):
    with pytest.raises(AbortFlow):
        await run_flow(tmp_path, raspberry, duplicate=True)
    assert raspberry[2]['active']


def entry(data, state=None):
    values = dict(version=1, minor_version=1, domain='rpi2dmd', title='Test', data=data,
                  source='user', unique_id=INFO['instance_id'], options={},
                  discovery_keys=MappingProxyType({}))
    try:
        if state is not None:
            values['state'] = state
        return ConfigEntry(**values, subentries_data=())
    except TypeError:
        values.pop('state', None)
        return ConfigEntry(**values)


@pytest.mark.asyncio
@pytest.mark.parametrize('paired', [False, True])
async def test_existing_and_new_entries_setup_reload_persist(tmp_path, raspberry, paired, caplog):
    data = (await run_flow(tmp_path, raspberry))['data'] if paired else {'host': raspberry[0], 'token': TOKEN}
    hass = HomeAssistant(str(tmp_path))
    hass.config_entries = ConfigEntries(hass, {})
    config = entry(data)
    original = dict(config.data)
    coordinator = Mock(async_config_entry_first_refresh=AsyncMock())
    try:
        with patch.object(rpi2dmd.aiohttp_client, 'async_get_clientsession', return_value=raspberry[1]), \
             patch.object(rpi2dmd, 'RPI2DMDCoordinator', return_value=coordinator), \
             patch.object(rpi2dmd, 'async_register_panel', new=AsyncMock()), \
             patch.object(rpi2dmd, 'async_unregister_panel'), \
             patch.object(hass.config_entries, 'async_forward_entry_setups', new=AsyncMock()), \
             patch.object(hass.config_entries, 'async_unload_platforms', new=AsyncMock(return_value=True)), \
             patch.object(RPI2DMDClient, 'async_pair', new=AsyncMock(side_effect=AssertionError('Existing entry must not pair'))):
            assert await rpi2dmd.async_setup_entry(hass, config)
            assert hass.data['rpi2dmd'][config.entry_id]['api'].token == TOKEN
            assert await rpi2dmd.async_unload_entry(hass, config)
            assert await rpi2dmd.async_setup_entry(hass, config)
        assert dict(config.data) == original
        assert config.version == 1
        hass.config_entries._entries[config.entry_id] = config
        await hass.config_entries._store.async_save(hass.config_entries._data_to_save())
        # Recreate the actual HA store/entries and load the saved config_entry.
        restored = ConfigEntries(hass, {})
        await restored.async_initialize()
        assert dict(restored.async_entries('rpi2dmd')[0].data) == original
        assert TOKEN not in caplog.text
    finally:
        await hass.async_stop()
