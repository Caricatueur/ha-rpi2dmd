"""Coordinator for the single status request shared by all entities."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import RPI2DMDClient, RPI2DMDError
from .const import DEFAULT_SCAN_INTERVAL, DOMAIN


class RPI2DMDCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Fetch /status once and share it with every entity."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, api: RPI2DMDClient, info: dict[str, Any]) -> None:
        self.api = api
        self.config_entry = entry
        self.info = info
        super().__init__(
            hass,
            logging.getLogger(DOMAIN),
            name=DOMAIN,
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            return await self.api.async_get_status()
        except RPI2DMDError as err:
            raise UpdateFailed(str(err)) from err
