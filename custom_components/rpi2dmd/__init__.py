"""RPI2DMD Home Assistant integration."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import aiohttp_client

from .api import RPI2DMDClient, RPI2DMDError
from .const import CONF_HOST, CONF_TOKEN, DOMAIN
from .coordinator import RPI2DMDCoordinator

PLATFORMS = [Platform.BINARY_SENSOR, Platform.SENSOR, Platform.SWITCH, Platform.NUMBER, Platform.BUTTON]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up one RPI2DMD device."""
    session = aiohttp_client.async_get_clientsession(hass)
    api = RPI2DMDClient(session, entry.data[CONF_HOST], entry.data[CONF_TOKEN])
    try:
        info = await api.async_get_info()
    except RPI2DMDError as err:
        raise ConfigEntryNotReady(str(err)) from err
    coordinator = RPI2DMDCoordinator(hass, entry, api, info)
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {"api": api, "coordinator": coordinator}
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload one device."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return unloaded
