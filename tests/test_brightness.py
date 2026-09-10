"""Regression tests using real HA helpers and a simulated Raspberry API."""
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
import pytest_asyncio
from homeassistant.config_entries import current_entry
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from custom_components.rpi2dmd import websocket
from custom_components.rpi2dmd.api import RPI2DMDConnectionError
from custom_components.rpi2dmd.brightness import _hourly_to_points, _schedule_to_hourly
from custom_components.rpi2dmd.coordinator import RPI2DMDCoordinator
from custom_components.rpi2dmd.number import RPI2DMDNumber

POINTS = [dict(time=t, value=v) for t, v in
          [('00:00', 0), ('08:00', 50), ('14:00', 25), ('16:00', 50), ('23:00', 40)]]
HOURLY = [dict(hour=h, value=v) for h, v in enumerate([0]*8+[50]*6+[25]*2+[50]*7+[40])]


@pytest_asyncio.fixture
async def runtime(tmp_path):
    hass = HomeAssistant(str(tmp_path))
    api = SimpleNamespace(async_get_brightness_schedule=AsyncMock(return_value={'schedule': deepcopy(HOURLY)}),
                          async_update_brightness_schedule=AsyncMock(),
                          async_update_display=AsyncMock(), async_get_status=AsyncMock(return_value={'online': True}))
    entry = SimpleNamespace(entry_id='one', unique_id='one', async_on_unload=Mock(), pref_disable_polling=False)
    token = current_entry.set(entry)
    try:
        coordinator = RPI2DMDCoordinator(hass, entry, api, {})
    finally:
        current_entry.reset(token)
    coordinator.async_set_updated_data({'online': True})
    hass.data['rpi2dmd'] = {'one': {'api': api, 'coordinator': coordinator}}
    store = SimpleNamespace(async_load=AsyncMock(return_value={'enabled': False, 'points': [{'time': '00:00', 'value': 100}]}),
                            async_save=AsyncMock())
    with patch.object(websocket, '_schedule_store', return_value=store):
        yield hass, api, coordinator, store
    await hass.async_stop()


async def call(runtime, action, **kwargs):
    return await websocket._call(runtime[0], {'type': f'rpi2dmd/brightness/schedule/{action}', 'entry_id': 'one', **kwargs})


def test_hourly_changes_and_round_trip():
    assert _hourly_to_points(HOURLY) == POINTS
    assert _hourly_to_points({'schedule': list(reversed(HOURLY))}) == POINTS
    assert _schedule_to_hourly(POINTS) == HOURLY
    assert _hourly_to_points(_schedule_to_hourly(POINTS)) == POINTS
    cyclic = [{'time': '08:00', 'value': 50}, {'time': '23:00', 'value': 40}]
    assert _hourly_to_points(_schedule_to_hourly(cyclic)) == [{'time': '00:00', 'value': 40}] + cyclic
    assert _hourly_to_points([{'hour': h, 'value': 42} for h in range(24)]) == [{'time': '00:00', 'value': 42}]
    assert _hourly_to_points({'points': POINTS}) == POINTS


@pytest.mark.parametrize('bad', [None, {}, [], HOURLY[:-1], HOURLY+[HOURLY[0]],
    [None]*24, [{'hour': True, 'value': 0}]+HOURLY[1:],
    [{'hour': 0, 'value': False}]+HOURLY[1:], [{'hour': 0, 'value': 101}]+HOURLY[1:]])
def test_malformed_remote_rejected(bad):
    with pytest.raises(ValueError):
        _hourly_to_points(bad)


@pytest.mark.parametrize('bad', [[{'time': '08:30', 'value': 50}], [{'time': '00:00', 'value': 42}],
    [{'time': '24:00', 'value': 50}], [{'time': '00:00', 'value': 105}], POINTS+[POINTS[0]]])
def test_write_validation(bad):
    with pytest.raises(ValueError):
        _schedule_to_hourly(bad)


@pytest.mark.asyncio
async def test_get_remote_over_legacy_store_and_external_change(runtime):
    _, api, coordinator, store = runtime
    assert (await call(runtime, 'get'))['schedule'] == {'enabled': False, 'points': POINTS}
    changed = [{'hour': h, 'value': 75} for h in range(24)]
    api.async_get_brightness_schedule.return_value = {'schedule': changed}
    assert (await call(runtime, 'get'))['schedule']['points'] == [{'time': '00:00', 'value': 75}]
    assert coordinator.brightness_points == [{'time': '00:00', 'value': 75}]
    store.async_save.assert_not_called()


@pytest.mark.asyncio
async def test_update_write_read_confirm_and_legacy_migration(runtime):
    _, api, _, store = runtime
    calls = []
    async def write(schedule):
        calls.append('write')
        assert schedule == HOURLY
        api.async_get_brightness_schedule.return_value = {'schedule': deepcopy(schedule)}
    async def read():
        calls.append('read')
        return api.async_get_brightness_schedule.return_value
    api.async_update_brightness_schedule.side_effect = write
    api.async_get_brightness_schedule.side_effect = read
    assert (await call(runtime, 'update', schedule=POINTS, enabled=True))['schedule'] == {'enabled': True, 'points': POINTS}
    assert calls == ['write', 'read']
    store.async_save.assert_awaited_once_with({'enabled': True})
    # Firmware normalization must win over the submitted form.
    api.async_update_brightness_schedule.side_effect = None
    api.async_get_brightness_schedule.return_value = {'schedule': [{'hour': h, 'value': 20} for h in range(24)]}
    assert (await call(runtime, 'update', schedule=POINTS))['schedule']['points'] == [{'time': '00:00', 'value': 20}]


@pytest.mark.asyncio
@pytest.mark.parametrize('stage', ['write', 'read'])
async def test_update_failure_no_false_confirmation(runtime, stage):
    _, api, _, store = runtime
    method = api.async_update_brightness_schedule if stage == 'write' else api.async_get_brightness_schedule
    method.side_effect = RPI2DMDConnectionError('offline')
    with pytest.raises(RPI2DMDConnectionError):
        await call(runtime, 'update', schedule=POINTS)
    store.async_save.assert_not_called()
    if stage == 'write':
        api.async_get_brightness_schedule.assert_not_called()


@pytest.mark.asyncio
async def test_number_poll_external_change_hour_and_offline(runtime):
    _, api, coordinator, _ = runtime
    entity = RPI2DMDNumber(coordinator)
    coordinator.data = await coordinator._async_update_data()
    with patch('custom_components.rpi2dmd.number.dt_util.now', return_value=datetime(2026, 9, 10, 7, 59, 59)) as now:
        assert entity.native_value == 0
        now.return_value = datetime(2026, 9, 10, 8)
        assert entity.native_value == 50
        api.async_get_brightness_schedule.return_value['schedule'][8]['value'] = 80
        coordinator.data = await coordinator._async_update_data()
        assert entity.native_value == 80
        now.return_value = datetime(2026, 9, 10, 23, 59, 59)
        assert entity.native_value == 40
        now.return_value = datetime(2026, 9, 11, 0)
        assert entity.native_value == 0
        now.return_value = datetime(2026, 9, 11, 8)
        api.async_get_brightness_schedule.side_effect = RPI2DMDConnectionError('offline')
        coordinator.data = await coordinator._async_update_data()
        assert entity.native_value is None
        assert not entity.available
        assert coordinator.last_update_success  # Other entities retain /status availability.
        api.async_get_brightness_schedule.side_effect = None
        await call(runtime, 'get')
        assert entity.native_value == 80
        coordinator.last_update_success = False
        assert entity.native_value is None
        assert not entity.available
    assert (entity.native_min_value, entity.native_max_value, entity.native_step) == (0, 100, 5)


@pytest.mark.asyncio
async def test_ha_timezone_for_value_and_write(runtime):
    hass, api, coordinator, _ = runtime
    await hass.config.async_set_time_zone('Europe/Paris')
    await call(runtime, 'get')
    entity = RPI2DMDNumber(coordinator)
    coordinator.async_request_refresh = AsyncMock()
    real_datetime = datetime
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return real_datetime(2026, 9, 10, 6, tzinfo=timezone.utc).astimezone(tz)
    try:
        with patch.object(dt_util.dt, 'datetime', FrozenDateTime):
            assert dt_util.now().hour == 8
            assert entity.native_value == 50
            await entity.async_set_native_value(75)
            api.async_update_display.assert_awaited_once_with({'brightness': {'schedule': [{'hour': 8, 'value': 75}]}})
            assert entity.native_value == 50  # API readback wins, not the requested 75.
    finally:
        await hass.config.async_set_time_zone('UTC')


@pytest.mark.asyncio
async def test_hour_callback_and_panel_get_notify_entity(runtime):
    hass, _, coordinator, _ = runtime
    entity = RPI2DMDNumber(coordinator)
    entity.hass = hass
    entity.async_write_ha_state = Mock()
    with patch('custom_components.rpi2dmd.number.async_track_time_change', return_value=Mock()) as track:
        await entity.async_added_to_hass()
        assert track.call_args.kwargs == {'minute': 0, 'second': 0}
        track.call_args.args[1](datetime(2026, 9, 10, 8))
        entity.async_write_ha_state.assert_called_once()
        entity.async_write_ha_state.reset_mock()
        await call(runtime, 'get')
        entity.async_write_ha_state.assert_called_once()
        await entity.async_will_remove_from_hass()
