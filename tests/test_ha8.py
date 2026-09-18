"""HA8 qualification using real HA flow/entry helpers and simulated device I/O."""
from ipaddress import ip_address
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from aiohttp import ClientSession, web
import pytest
import pytest_asyncio
from homeassistant.config_entries import ConfigEntries
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import AbortFlow
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo

from custom_components import rpi2dmd
from custom_components.rpi2dmd.api import (
    RPI2DMDClient, RPI2DMDAuthError, RPI2DMDConnectionError,
    RPI2DMDHTTPError, RPI2DMDPairingError, normalize_host,
)
from custom_components.rpi2dmd.config_flow import RPI2DMDConfigFlow
from custom_components.rpi2dmd.coordinator import RPI2DMDCoordinator
from test_pairing import INFO, TOKEN, entry, raspberry  # existing HA7 fixture retained


@pytest_asyncio.fixture
async def ha(tmp_path):
    hass = HomeAssistant(str(tmp_path))
    hass.config_entries = ConfigEntries(hass, {})
    hass.data["integrations"] = {}
    session_patch = patch('custom_components.rpi2dmd.config_flow.aiohttp_client.async_get_clientsession', return_value=Mock())
    session_patch.start()
    yield hass
    session_patch.stop()
    await hass.async_stop()


def flow(hass, source='zeroconf', config=None):
    result = RPI2DMDConfigFlow()
    result.hass, result.handler = hass, 'rpi2dmd'
    result.context = {'source': source}
    if config:
        hass.config_entries._entries[config.entry_id] = config
        result.context['entry_id'] = config.entry_id
        result.context['unique_id'] = config.unique_id
    return result


def discovery(host):
    address, port = host.rsplit(':', 1)
    return ZeroconfServiceInfo(
        ip_address=ip_address(address), ip_addresses=[ip_address(address)],
        port=int(port), hostname='test-dmd.local.', type='_rpi2dmd._tcp.local.',
        name='Test._rpi2dmd._tcp.local.',
        properties={'id': 'untrusted-txt-identity', 'api': '1', 'version': '2.8-dev', 'path': '/api/v1'},
    )


@pytest.mark.asyncio
async def test_discovery_confirmation_pairing_identity_and_no_leak(ha, raspberry, caplog):
    host, session, state = raspberry
    state['active'] = False
    current = flow(ha)
    with patch('custom_components.rpi2dmd.config_flow.aiohttp_client.async_get_clientsession', return_value=session):
        result = await current.async_step_zeroconf(discovery(host))
        assert result['step_id'] == 'discovery_confirm'
        assert current.unique_id == INFO['instance_id']
        assert not result['data_schema'].schema
        assert not any('/pair/' in path for _, path, _ in state['calls'])
        result = await current.async_step_discovery_confirm({})
        assert result['step_id'] == 'pairing'
        assert ('POST', '/api/v1/pair/start', None) in state['calls']
        result = await current.async_step_pairing({'pairing_code': state['code']})
    assert result['type'] == 'create_entry'
    assert result['data'] == {'host': host, 'token': TOKEN}
    assert TOKEN not in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize('old_host', ['192.0.2.8', None])
async def test_discovery_duplicate_updates_real_entry_only(ha, raspberry, old_host):
    host, session, state = raspberry
    config = entry({'host': old_host or host, 'token': TOKEN})
    ha.config_entries._entries[config.entry_id] = config
    current = flow(ha)
    with patch('custom_components.rpi2dmd.config_flow.aiohttp_client.async_get_clientsession', return_value=session):
        with pytest.raises(AbortFlow, match='already_configured'):
            await current.async_step_zeroconf(discovery(host))
    assert config.data == {'host': host, 'token': TOKEN}
    assert len(ha.config_entries.async_entries('rpi2dmd')) == 1
    assert not any('/pair/' in path for _, path, _ in state['calls'])


@pytest.mark.asyncio
@pytest.mark.parametrize('info,error', [({},'unsupported_version'), ({'rpi2dmd_version':'2.8'},'invalid_device'), ({'rpi2dmd_version':'1.0','instance_id':'x'},'unsupported_version')])
async def test_discovery_invalid_device(ha, info, error):
    current = flow(ha)
    with patch.object(RPI2DMDClient,'async_get_info',new=AsyncMock(return_value=info)):
        result = await current.async_step_zeroconf(discovery('192.0.2.9:80'))
    assert result['type'] == 'abort' and result['reason'] == error


@pytest.mark.asyncio
async def test_discovery_unreachable(ha):
    with patch.object(RPI2DMDClient,'async_get_info',new=AsyncMock(side_effect=RPI2DMDConnectionError('offline'))):
        result = await flow(ha).async_step_zeroconf(discovery('192.0.2.9:80'))
    assert result['reason'] == 'cannot_connect'


@pytest.mark.asyncio
async def test_reauth_success_same_entry_device_token_replaced(ha, raspberry, caplog):
    host, session, state = raspberry
    config = entry({'host': host, 'token': 'old-synthetic-token', 'extra': 'preserved'})
    current = flow(ha, 'reauth', config)
    with patch('custom_components.rpi2dmd.config_flow.aiohttp_client.async_get_clientsession', return_value=session), patch.object(ha.config_entries, 'async_schedule_reload') as reload:
        result = await current.async_step_reauth(dict(config.data))
        assert result['step_id'] == 'reauth_confirm' and not state['calls']
        assert (await current.async_step_reauth_confirm({}))['step_id'] == 'pairing'
        result = await current.async_step_pairing({'pairing_code': state['code']})
        reload.assert_called_once_with(config.entry_id)
    assert result['type'] == 'abort' and result['reason'] == 'reauth_successful'
    assert config.data['token'] == TOKEN and config.data['extra'] == 'preserved'
    assert config.unique_id == INFO['instance_id']
    assert len(ha.config_entries.async_entries('rpi2dmd')) == 1
    assert TOKEN not in str(result) + caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize('mode,error', [('invalid','invalid_pairing_code'), ('expired','pairing_inactive'), ('unreachable','cannot_connect')])
async def test_reauth_failure_preserves_entry_and_restart(ha, raspberry, mode, error):
    host, session, state = raspberry
    config = entry({'host': host, 'token': 'old-synthetic-token'})
    current = flow(ha, 'reauth', config)
    with patch('custom_components.rpi2dmd.config_flow.aiohttp_client.async_get_clientsession', return_value=session):
        await current.async_step_reauth_confirm({})
        if mode == 'expired': state['active'] = False
        if mode == 'unreachable':
            with patch.object(RPI2DMDClient,'async_pair',new=AsyncMock(side_effect=RPI2DMDConnectionError('offline'))):
                result = await current.async_step_pairing({'pairing_code':state['code']})
        else:
            result = await current.async_step_pairing({'pairing_code':'999999' if mode=='invalid' else state['code']})
        assert result['errors']['base'] == error
        assert config.data['token'] == 'old-synthetic-token'
        calls = len(state['calls'])
        assert (await current.async_step_pairing({'restart_pairing':True}))['step_id'] == 'pairing_restart'
        assert len(state['calls']) == calls  # displaying confirmation never starts pairing
        assert (await current.async_step_pairing_restart({}))['step_id'] == 'pairing'
        with patch.object(ha.config_entries,'async_schedule_reload'):
            result = await current.async_step_pairing({'pairing_code':state['code']})
        assert result['reason'] == 'reauth_successful'


@pytest.mark.asyncio
async def test_reauth_unreachable_before_start_and_identity_mismatch(ha, raspberry):
    host, session, state = raspberry
    config = entry({'host':host,'token':'old-synthetic-token'})
    current = flow(ha,'reauth',config)
    with patch.object(RPI2DMDClient,'async_get_info',new=AsyncMock(side_effect=RPI2DMDConnectionError('offline'))):
        assert (await current.async_step_reauth_confirm({}))['errors']['base']=='cannot_connect'
    with patch.object(RPI2DMDClient,'async_get_info',new=AsyncMock(return_value={**INFO,'instance_id':'different-device'})):
        # HA9 intentionally permits a new identity here; migration is gated
        # until physical pairing and token validation complete.
        with patch.object(RPI2DMDClient, 'async_start_pairing', new=AsyncMock()):
            assert (await current.async_step_reauth_confirm({}))['step_id'] == 'pairing'
    assert config.data['token']=='old-synthetic-token' and not state['calls']


@pytest.mark.asyncio
async def test_status_retry_does_not_exchange_consumed_code_again(ha, raspberry):
    host, session, state = raspberry
    current = flow(ha,'user')
    with patch('custom_components.rpi2dmd.config_flow.aiohttp_client.async_get_clientsession',return_value=session):
        await current.async_step_user({'host':host})
        with patch.object(RPI2DMDClient,'async_get_status',new=AsyncMock(side_effect=RPI2DMDConnectionError('offline'))):
            assert (await current.async_step_pairing({'pairing_code':state['code']}))['errors']['base']=='cannot_connect'
        assert (await current.async_step_pairing({'pairing_code':state['code']}))['type']=='create_entry'
    assert sum('/pair/exchange' in path for _,path,_ in state['calls'])==1


@pytest.mark.parametrize('host,authority', [
    ('192.0.2.1','192.0.2.1'), ('RPI2DMD.local','RPI2DMD.local'),
    ('192.0.2.1:8080','192.0.2.1:8080'), ('::1','[::1]'),
    ('2001:db8::8','[2001:db8::8]'), ('[2001:db8::8]','[2001:db8::8]'),
    ('[::1]:8080','[::1]:8080'), ('fe80::1%eth0','[fe80::1%eth0]'),
])
def test_address_urls(host,authority):
    assert RPI2DMDClient(Mock(),host,'').base_url == f'http://{authority}/api/v1'


@pytest.mark.parametrize('host',['http://bad','x/path','user:pass@host','[::1','host:99999',''])
def test_invalid_address(host):
    with pytest.raises(RPI2DMDConnectionError): normalize_host(host)


@pytest.mark.asyncio
@pytest.mark.parametrize('payload',[[],None,{'error':'bad'}, {'error':None}, {'error':[]}, {'error':{'message':['bad']}}])
async def test_malformed_http_error_is_normalized(payload):
    class Response:
        status = 400
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def json(self, **kwargs): return payload
    context=Response()
    client=RPI2DMDClient(Mock(request=Mock(return_value=context)),'example.invalid',TOKEN)
    with pytest.raises(RPI2DMDHTTPError) as error:
        await client.async_get_status()
    assert error.value.status==400 and TOKEN not in str(error.value)


@pytest.mark.asyncio
async def test_error_token_redacted():
    class Response:
        status = 503
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def json(self, **kwargs): return {'error': {'message': TOKEN}}
    context=Response()
    with pytest.raises(RPI2DMDHTTPError) as error:
        await RPI2DMDClient(Mock(request=Mock(return_value=context)),'example.invalid',TOKEN).async_get_status()
    assert TOKEN not in str(error.value)


@pytest.mark.asyncio
@pytest.mark.parametrize('endpoint',['status','brightness'])
async def test_coordinator_auth_failure_triggers_real_ha_reauth(ha,endpoint):
    config = entry({'host':'example.invalid','token':TOKEN}, state=ConfigEntryState.SETUP_IN_PROGRESS)
    api=SimpleNamespace(async_get_status=AsyncMock(return_value={'online':True}),async_get_brightness_schedule=AsyncMock(return_value={'schedule':[{'hour':h,'value':50} for h in range(24)]}))
    getattr(api,'async_get_status' if endpoint=='status' else 'async_get_brightness_schedule').side_effect=RPI2DMDAuthError('rejected')
    coordinator=RPI2DMDCoordinator(ha,config,api,INFO)
    with pytest.raises(ConfigEntryAuthFailed):
        await coordinator.async_config_entry_first_refresh()
    with patch.object(type(config),'async_start_reauth_if_available') as reauth:
        await coordinator.async_refresh()
        reauth.assert_called_once_with(ha)
    await coordinator.async_shutdown()


@pytest.mark.asyncio
async def test_setup_propagates_auth_failure(ha,raspberry):
    host,session,state=raspberry
    state['status']=401
    config = entry({'host':host,'token':TOKEN}, state=ConfigEntryState.SETUP_IN_PROGRESS)
    with patch.object(rpi2dmd.aiohttp_client,'async_get_clientsession',return_value=session):
        with pytest.raises(ConfigEntryAuthFailed):
            await rpi2dmd.async_setup_entry(ha,config)
    assert config.entry_id not in ha.data.get('rpi2dmd',{})
