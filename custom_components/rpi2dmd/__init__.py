"""RPI2DMD Home Assistant integration."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers.update_coordinator import UpdateFailed
from homeassistant.helpers import aiohttp_client

from .api import RPI2DMDClient, RPI2DMDError
from .const import CONF_HOST, CONF_TOKEN, DOMAIN
from .coordinator import RPI2DMDCoordinator
from .panel import async_register_panel, async_unregister_panel
from .websocket import async_register

PLATFORMS = [Platform.BINARY_SENSOR, Platform.SENSOR, Platform.SWITCH, Platform.NUMBER, Platform.BUTTON]
_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up one RPI2DMD device."""
    session = aiohttp_client.async_get_clientsession(hass)
    api = RPI2DMDClient(session, entry.data[CONF_HOST], entry.data[CONF_TOKEN])
    try:
        info = await api.async_get_info()
    except RPI2DMDError as err:
        # A previously validated config entry must remain loadable while the
        # Raspberry is rebooting or temporarily unreachable. The coordinator
        # and panel will expose unavailable state and retry automatically.
        _LOGGER.warning("RPI2DMD info unavailable during setup for %s: %s", entry.entry_id, err)
        info = {}
    coordinator = RPI2DMDCoordinator(hass, entry, api, info)
    try:
        await coordinator.async_config_entry_first_refresh()
    except (ConfigEntryNotReady, UpdateFailed) as err:
        _LOGGER.warning("RPI2DMD status unavailable during setup for %s: %s", entry.entry_id, err)
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {"api": api, "coordinator": coordinator}
    await async_register_panel(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload one device."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
        if not hass.data.get(DOMAIN):
            async_unregister_panel(hass)
    return unloaded


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register backend WebSocket commands once per Home Assistant process."""
    async_register(hass)
    return True
