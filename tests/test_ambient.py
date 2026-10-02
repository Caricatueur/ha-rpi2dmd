"""Ambient controller with real HA events and a simulated future renderer transport."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from homeassistant.core import HomeAssistant, State

from custom_components.rpi2dmd.ambient import (
    AmbientController, DEFAULT_CONFIG, interpolate, read_lux, validate_config,
)


def test_interpolation_and_clamps():
    points = DEFAULT_CONFIG['points']
    for lux, expected in [(-1, 5), (0, 5), (2.5, 10), (10, 23), (45, 53), (140, 100), (1e12, 100)]:
        assert interpolate(points, lux) == expected
    assert interpolate([{'lux': 10, 'value': 42}], 100) == 42


def test_sort_and_defaults():
    config = validate_config({'points': list(reversed(DEFAULT_CONFIG['points']))})
    assert config == DEFAULT_CONFIG
    config['points'][0]['value'] = 99
    assert DEFAULT_CONFIG['points'][0]['value'] == 5


@pytest.mark.parametrize('patch', [
    {'points': []}, {'points': [{'lux': 0, 'value': 10}]*2},
    {'points': [{'lux': -1, 'value': 10}]}, {'points': [{'lux': 1, 'value': 101}]},
    {'points': [{'lux': float('nan'), 'value': 10}]},
    {'points': [{'lux': 1, 'value': True}]}, {'delay': 0}, {'delay': float('inf')},
    {'minimum_change': -1}, {'mode': 'invalid'}, {'entity_id': 123}, {'entity_id': 'number.light'},
])
def test_invalid_configuration(patch):
    with pytest.raises(ValueError):
        validate_config(patch)


@pytest.mark.parametrize('raw', ['unknown', 'unavailable', 'nan', 'inf', '-1', ''])
def test_invalid_measurement(raw):
    assert read_lux(State('sensor.lux', raw, {'unit_of_measurement': 'lx'})) is None


def test_zero_and_units():
    assert read_lux(State('sensor.lux', '0', {'unit_of_measurement': 'lx'})) == 0
    assert read_lux(State('sensor.lux', '12', {'unit_of_measurement': '%'})) is None


@pytest_asyncio.fixture
async def runtime(tmp_path):
    hass = HomeAssistant(str(tmp_path))
    now = [100.0]
    transport = SimpleNamespace(supported=True, apply=AsyncMock(), release=AsyncMock())
    c = AmbientController(hass, 'one', transport, clock=lambda: now[0])
    c.store = SimpleNamespace(async_load=AsyncMock(return_value=None), async_save=AsyncMock())
    hass.states.async_set('sensor.lux', '0', {'unit_of_measurement': 'lx'})
    await c.start()
    await c.configure({**deepcopy(DEFAULT_CONFIG), 'mode': 'ha', 'entity_id': 'sensor.lux'})
    yield hass, c, transport, now
    await c.stop()
    await hass.async_stop()


async def measure(runtime, value):
    hass, c, _, _ = runtime
    hass.states.async_set('sensor.lux', str(value), {'unit_of_measurement': 'lx'})
    await hass.async_block_till_done()


async def tick(runtime, seconds):
    _, c, _, now = runtime
    now[0] += seconds
    if c._timer:
        c._timer.cancel()
    c._wake()
    await c._worker


@pytest.mark.asyncio
async def test_start_event_threshold_and_no_schedule_write(runtime):
    _, c, t, _ = runtime
    assert c.last_lux == 0
    t.apply.assert_not_called()
    await tick(runtime, 20)
    t.apply.assert_awaited_once_with(5)
    await measure(runtime, 1)
    await tick(runtime, 20)
    assert t.apply.await_count == 1  # 2% change suppressed
    await measure(runtime, 5)
    await tick(runtime, 20)
    assert t.apply.call_args.args == (15,)
    await measure(runtime, 5)
    await tick(runtime, 20)
    assert t.apply.await_count == 2
    assert c.store.async_save.await_count == 1  # only explicit configuration
    assert set(vars(t)) == {'supported', 'apply', 'release'}  # no persistent API available


@pytest.mark.asyncio
async def test_unavailable_fallback_reconnect(runtime):
    _, c, t, _ = runtime
    await tick(runtime, 20)
    await measure(runtime, 'unavailable')
    assert c.last_lux == 0
    await tick(runtime, 299)
    t.release.assert_not_called()
    await measure(runtime, 'unknown')  # does not restart the five-minute timer
    await tick(runtime, 1)
    t.release.assert_awaited_once()
    assert c.snapshot()['effective_mode'] == 'schedule'
    await tick(runtime, 300)
    assert t.release.await_count == 1
    await measure(runtime, 0)
    await tick(runtime, 20)
    assert t.apply.await_count == 2
    assert c.snapshot()['effective_mode'] == 'ha'


@pytest.mark.asyncio
async def test_brief_loss_does_not_switch_modes(runtime):
    await tick(runtime, 20)
    await measure(runtime, 'unknown')
    await tick(runtime, 100)
    await measure(runtime, 0)
    await tick(runtime, 20)
    runtime[2].release.assert_not_called()
    assert runtime[2].apply.await_count == 1


@pytest.mark.asyncio
async def test_single_flight_coalesces_and_mode_change_waits(runtime):
    _, c, t, _ = runtime
    entered, finish = asyncio.Event(), asyncio.Event()
    async def slow(value):
        entered.set()
        await finish.wait()
    t.apply.side_effect = slow
    c._wake()
    await entered.wait()
    c.observe(State("sensor.lux", "140", {"unit_of_measurement": "lx"}))
    c._wake()
    assert t.apply.await_count == 1
    switch = asyncio.create_task(c.configure({**c.config, 'mode': 'schedule'}))
    await asyncio.sleep(0)
    assert not switch.done()
    finish.set()
    await c._worker
    await switch
    t.release.assert_awaited_once()
    assert c.config['mode'] == 'schedule'
    assert not c.overridden


@pytest.mark.asyncio
async def test_failed_command_retried_without_confirming(runtime):
    _, c, t, _ = runtime
    t.apply.side_effect = OSError('offline')
    await tick(runtime, 20)
    assert c.last_applied is None and c.error
    t.apply.side_effect = None
    await tick(runtime, 20)
    assert c.last_applied == 5
    assert c.error is None


@pytest.mark.asyncio
async def test_unsupported_firmware_is_inert_and_persists_per_device(runtime):
    hass, _, _, _ = runtime
    c = AmbientController(hass, 'second')
    await c.start()
    config = {**deepcopy(DEFAULT_CONFIG), 'mode': 'ha', 'entity_id': 'sensor.lux'}
    await c.configure(config)
    assert c._timer is None and c.last_lux == 0
    assert c.snapshot()['firmware_required'] is True
    assert c.snapshot()['effective_mode'] == 'schedule'
    await c.stop()
    restored = AmbientController(hass, 'second')
    await restored.start()
    assert restored.config == config
    other = AmbientController(hass, 'third')
    await other.start()
    assert other.config['mode'] == 'schedule'
    await restored.stop()
    await other.stop()


@pytest.mark.asyncio
async def test_timing_window_does_not_restart_on_each_event(runtime):
    _, c, _, now = runtime
    assert c._first_due == 120
    now[0] = 110
    await measure(runtime, 30)
    assert c._first_due == 120
    assert 9 <= c._timer.when() - c.hass.loop.time() <= 10
    await tick(runtime, 10)
    await measure(runtime, 100)
    assert 19 <= c._timer.when() - c.hass.loop.time() <= 20


@pytest.mark.asyncio
async def test_websocket_configuration_and_validation(runtime):
    from custom_components.rpi2dmd.websocket import _call
    hass, c, _, _ = runtime
    hass.data['rpi2dmd'] = {'one': {'api': object(), 'coordinator': object(), 'ambient': c}}
    result = await _call(hass, {'type': 'rpi2dmd/brightness/ambient/get', 'entry_id': 'one'})
    assert result['ambient']['last_lux'] == 0
    with pytest.raises(ValueError):
        await _call(hass, {'type': 'rpi2dmd/brightness/ambient/update', 'entry_id': 'one', 'config': {'mode': 'invalid'}})
    assert c.config['mode'] == 'ha'
