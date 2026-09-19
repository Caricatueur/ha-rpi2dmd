"""Exercise API error mapping and HA coordinator retry/error reporting."""
import asyncio
import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
import pytest_asyncio
from aiohttp import ClientConnectionError
from homeassistant.config_entries import current_entry
from homeassistant.core import HomeAssistant

from custom_components.rpi2dmd.api import RPI2DMDClient
from custom_components.rpi2dmd.coordinator import RPI2DMDCoordinator


class Response:
    charset = 'utf-8'

    def __init__(self, status=200, message='Configuration is busy'):
        self.status = status
        self.message = message

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def json(self, **kwargs):
        return {'error': {'message': self.message}}

    async def read(self):
        return json.dumps({'ok': True, 'data': {'online': True}}).encode()


@pytest_asyncio.fixture
async def setup(tmp_path):
    hass = HomeAssistant(str(tmp_path))
    session = SimpleNamespace(request=Mock())
    api = RPI2DMDClient(session, 'example.invalid', 'test-token')
    api.async_get_brightness_schedule = AsyncMock(return_value={
        'schedule': [{'hour': h, 'value': 50} for h in range(24)]})
    entry = SimpleNamespace(async_on_unload=Mock(), pref_disable_polling=False)
    token = current_entry.set(entry)
    try:
        coordinator = RPI2DMDCoordinator(hass, entry, api, {})
    finally:
        current_entry.reset(token)
    yield coordinator, session, api
    await coordinator.async_shutdown()
    await hass.async_stop()


@pytest.mark.asyncio
async def test_busy_once_then_success_without_error_log(setup, caplog):
    coordinator, session, api = setup
    session.request.side_effect = [Response(500), Response()]
    with patch('custom_components.rpi2dmd.api.asyncio.sleep', new_callable=AsyncMock) as sleep:
        with caplog.at_level(logging.ERROR):
            await coordinator.async_refresh()
    sleep.assert_awaited_once_with(0.5)
    assert session.request.call_count == 2
    assert all(c.args[0] == 'GET' and c.args[1].endswith('/status') for c in session.request.call_args_list)
    assert coordinator.last_update_success
    assert coordinator.data == {'online': True}
    api.async_get_brightness_schedule.assert_awaited_once()
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


@pytest.mark.asyncio
@pytest.mark.parametrize('second', [Response(500), Response(500, 'Internal server error'),
                                    ClientConnectionError('offline'), TimeoutError()])
async def test_second_failure_uses_normal_ha_failure_state(setup, caplog, second):
    coordinator, session, api = setup
    coordinator.async_set_updated_data({'online': True})
    session.request.side_effect = [Response(500), second]
    with patch('custom_components.rpi2dmd.api.asyncio.sleep', new_callable=AsyncMock) as sleep:
        with caplog.at_level(logging.ERROR):
            await coordinator.async_refresh()
    sleep.assert_awaited_once_with(0.5)
    assert session.request.call_count == 2
    assert not coordinator.last_update_success
    assert coordinator.last_exception is not None
    assert any('Error fetching rpi2dmd data' in r.message for r in caplog.records)
    api.async_get_brightness_schedule.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize('error', [Response(500, 'Internal server error'), Response(401), Response(403),
    Response(500, 'Configuration is busy elsewhere'), ClientConnectionError('offline'), TimeoutError()])
async def test_other_errors_no_retry_and_offline_stays_offline(setup, error):
    coordinator, session, api = setup
    session.request.side_effect = [error]
    with patch('custom_components.rpi2dmd.api.asyncio.sleep', new_callable=AsyncMock) as sleep:
        await coordinator.async_refresh()
    sleep.assert_not_called()
    assert session.request.call_count == 1
    assert not coordinator.last_update_success
    api.async_get_brightness_schedule.assert_not_called()


@pytest.mark.asyncio
async def test_wait_yields_and_retry_does_not_overlap_requests(setup):
    coordinator, session, _ = setup
    active = 0
    peak = 0
    class TrackedResponse(Response):
        async def __aenter__(self):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            return self

        async def __aexit__(self, *args):
            nonlocal active
            active -= 1

    session.request.side_effect = [TrackedResponse(500), TrackedResponse()]
    waiting, release = asyncio.Event(), asyncio.Event()
    real_sleep = asyncio.sleep
    async def controlled_sleep(delay):
        assert delay == 0.5
        assert active == 0  # Failed HTTP context is already closed.
        waiting.set()
        await release.wait()
        await real_sleep(0)
    with patch('custom_components.rpi2dmd.api.asyncio.sleep', side_effect=controlled_sleep):
        task = asyncio.create_task(coordinator.async_request_refresh())
        try:
            await asyncio.wait_for(waiting.wait(), 2)
            assert session.request.call_count == 1
            assert not task.done()
            release.set()
            await asyncio.wait_for(task, 2)
        finally:
            release.set()
            if not task.done():
                task.cancel()
    assert coordinator.last_update_success
    assert session.request.call_count == 2
    assert peak == 1 and active == 0


PLAYLIST_WRITES = [
    ('add', {'item': {'type': 'mqtt', 'topic': 'home/temperature'}}, 'POST', '/playlist/items'),
    ('update', {'item_id': 'one', 'changes': {'icon': 'temperature', 'show_icon': True}}, 'PUT', '/playlist/items/one'),
    ('move', {'item_id': 'one', 'index': 1}, 'POST', '/playlist/items/one/move'),
    ('duplicate', {'item_id': 'one', 'after_id': 'two'}, 'POST', '/playlist/items/one/duplicate'),
    ('delete', {'item_id': 'one'}, 'DELETE', '/playlist/items/one'),
]


async def playlist_command(setup, action, extra):
    from custom_components.rpi2dmd import websocket
    coordinator, _, api = setup
    hass = coordinator.hass
    hass.data['rpi2dmd'] = {'entry': {'api': api, 'coordinator': coordinator}}
    connection = SimpleNamespace(send_result=Mock(), send_error=Mock())
    await websocket._websocket_handler(hass, connection, {
        'id': 1, 'type': f'rpi2dmd/playlist/{action}', 'entry_id': 'entry', **extra,
    })
    return connection


@pytest.mark.asyncio
@pytest.mark.parametrize('action,extra,method,path', PLAYLIST_WRITES)
@pytest.mark.parametrize('conflicts', [1, 2, 3])
async def test_playlist_confirmed_conflicts_are_bounded_and_stay_online(setup, action, extra, method, path, conflicts):
    coordinator, session, api = setup
    coordinator.async_set_updated_data({'online': True})
    successes = []

    class AppliedResponse(Response):
        async def read(self):
            successes.append(True)
            return json.dumps({'ok': True, 'data': {'id': 'one', **extra.get('changes', {})}}).encode()

    session.request.side_effect = [Response(409, 'Conflict')] * conflicts + [AppliedResponse()]
    with patch('custom_components.rpi2dmd.api.asyncio.sleep', new_callable=AsyncMock) as sleep:
        connection = await playlist_command(setup, action, extra)
    assert sleep.await_count == min(conflicts, 2)
    assert all(c.args == (1.0,) for c in sleep.await_args_list)
    assert session.request.call_count == min(conflicts + 1, 3)
    requests = session.request.call_args_list
    assert all(c == requests[0] for c in requests)  # Identical payload, including POSTs.
    assert requests[0].args == (method, api.base_url + path)
    assert coordinator.last_update_success
    assert coordinator.data == {'online': True}
    api.async_get_brightness_schedule.assert_not_called()
    if conflicts < 3:
        assert successes == [True]  # One successful mutation, no duplicate creation.
        connection.send_error.assert_not_called()
        connection.send_result.assert_called_once()
        if action == 'update':
            assert connection.send_result.call_args.args[1]['item'] == {
                'id': 'one', 'icon': 'temperature', 'show_icon': True}
    else:
        assert successes == []
        connection.send_result.assert_not_called()
        connection.send_error.assert_called_once_with(
            1, 'config_busy', 'Le RPI2DMD est temporairement occupé. Réessayez dans quelques secondes.')


@pytest.mark.asyncio
@pytest.mark.parametrize('action,extra,method,path', PLAYLIST_WRITES)
@pytest.mark.parametrize('error,code', [
    (ClientConnectionError('connection refused'), 'cannot_connect'),
    (OSError('DNS/socket'), 'cannot_connect'), (TimeoutError(), 'cannot_connect'),
    (Response(401), 'invalid_auth'), (Response(403), 'invalid_auth'),
    (Response(500), 'api_error'), (Response(503), 'api_error'),
])
async def test_playlist_other_errors_never_retry_or_change_coordinator(setup, action, extra, method, path, error, code):
    coordinator, session, _ = setup
    coordinator.async_set_updated_data({'online': True})
    session.request.side_effect = [error]
    with patch('custom_components.rpi2dmd.api.asyncio.sleep', new_callable=AsyncMock) as sleep:
        connection = await playlist_command(setup, action, extra)
    sleep.assert_not_called()
    assert session.request.call_count == 1
    connection.send_result.assert_not_called()
    assert connection.send_error.call_args.args[1] == code
    # Historically writes are local errors; only failed status polling marks offline.
    assert coordinator.last_update_success


@pytest.mark.asyncio
@pytest.mark.parametrize('action,extra,method,path', PLAYLIST_WRITES)
async def test_network_failure_after_confirmed_conflict_is_not_replayed(setup, action, extra, method, path):
    _, session, _ = setup
    session.request.side_effect = [Response(409), ClientConnectionError('lost reply'), Response()]
    with patch('custom_components.rpi2dmd.api.asyncio.sleep', new_callable=AsyncMock) as sleep:
        connection = await playlist_command(setup, action, extra)
    sleep.assert_awaited_once_with(1.0)
    assert session.request.call_count == 2
    assert connection.send_error.call_args.args[1] == 'cannot_connect'


@pytest.mark.asyncio
async def test_status_remains_available_during_playlist_retry(setup):
    coordinator, session, _ = setup
    coordinator.async_set_updated_data({'online': True})
    active = 0
    class ClosedConflict(Response):
        async def __aenter__(self):
            nonlocal active
            active += 1
            return self
        async def __aexit__(self, *args):
            nonlocal active
            active -= 1
    session.request.side_effect = [ClosedConflict(409), Response(), Response()]
    async def wait_and_poll(delay):
        assert delay == 1.0 and active == 0
        assert coordinator.last_update_success
        await coordinator.async_refresh()
        assert coordinator.last_update_success
    with patch('custom_components.rpi2dmd.api.asyncio.sleep', side_effect=wait_and_poll):
        connection = await playlist_command(setup, 'update', {'item_id': 'one', 'changes': {'icon': None, 'show_icon': False}})
    connection.send_error.assert_not_called()
    assert [c.args[0] for c in session.request.call_args_list] == ['PUT', 'GET', 'PUT']
    assert session.request.call_args_list[1].args[1].endswith('/status')
    assert session.request.call_args_list[2].kwargs['json'] == {'icon': None, 'show_icon': False}
    assert coordinator.last_update_success


@pytest.mark.asyncio
async def test_direct_status_get_has_no_new_conflict_retry(setup):
    from custom_components.rpi2dmd.api import RPI2DMDHTTPError
    _, session, api = setup
    session.request.side_effect = [Response(409)]
    with patch('custom_components.rpi2dmd.api.asyncio.sleep', new_callable=AsyncMock) as sleep:
        with pytest.raises(RPI2DMDHTTPError) as error:
            await api.async_get_status()
    assert error.value.status == 409
    sleep.assert_not_called()
    assert session.request.call_count == 1
