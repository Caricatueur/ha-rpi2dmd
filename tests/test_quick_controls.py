"""Confirmed display writes must not be mistaken for a fresh coordinator snapshot."""
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from custom_components.rpi2dmd import websocket


@pytest.mark.asyncio
@pytest.mark.parametrize('flag', ['clock', 'date', 'weather', 'gif', 'mqtt'])
@pytest.mark.parametrize('initial', [True, False])
async def test_confirmed_write_and_debounced_status_have_distinct_freshness(tmp_path, flag, initial):
    hass = HomeAssistant(str(tmp_path))
    flags = {name: initial for name in ['clock', 'date', 'weather', 'gif', 'mqtt']}

    async def fetch():
        return {'display': {'active_flags': [name for name, active in flags.items() if active]}}

    async def write(changes):
        flags.update(changes['flags'])
        return {'flags': dict(flags)}

    fetch_mock = AsyncMock(side_effect=fetch)
    api = SimpleNamespace(async_update_display=AsyncMock(side_effect=write))
    coordinator = DataUpdateCoordinator(hass, logging.getLogger(__name__), name='controls', update_method=fetch_mock, config_entry=None)
    hass.data['rpi2dmd'] = {'one': {'api': api, 'coordinator': coordinator}}
    try:
        before = await websocket._call(hass, {'type': 'rpi2dmd/status', 'entry_id': 'one'})
        assert (flag in before['status']['display']['active_flags']) is initial
        changes = {'flags': {flag: not initial}}
        confirmed = await websocket._call(hass, {'type': 'rpi2dmd/display/update', 'entry_id': 'one', 'changes': changes})
        assert confirmed['display']['flags'][flag] is not initial
        api.async_update_display.assert_awaited_once_with(changes)
        after = await websocket._call(hass, {'type': 'rpi2dmd/status', 'entry_id': 'one'})
        # Awaiting the debounced request does not guarantee a fresh fetch.
        assert (flag in after['status']['display']['active_flags']) is initial
        assert flags[flag] is not initial
        fetch_mock.assert_awaited_once()
        coordinator._debounced_refresh.async_cancel()
        await coordinator.async_refresh()
        assert (flag in coordinator.data['display']['active_flags']) is not initial
        assert fetch_mock.await_count == 2
    finally:
        coordinator._debounced_refresh.async_cancel()
        await hass.async_stop()
