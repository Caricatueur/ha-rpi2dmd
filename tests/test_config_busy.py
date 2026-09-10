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
    with patch('custom_components.rpi2dmd.coordinator.asyncio.sleep', new_callable=AsyncMock) as sleep:
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
    with patch('custom_components.rpi2dmd.coordinator.asyncio.sleep', new_callable=AsyncMock) as sleep:
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
    with patch('custom_components.rpi2dmd.coordinator.asyncio.sleep', new_callable=AsyncMock) as sleep:
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
    with patch('custom_components.rpi2dmd.coordinator.asyncio.sleep', side_effect=controlled_sleep):
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
