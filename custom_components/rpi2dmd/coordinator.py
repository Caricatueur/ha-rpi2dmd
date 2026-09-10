"""Coordinator for shared status and confirmed brightness schedule."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import RPI2DMDClient, RPI2DMDError
from .brightness import _hourly_to_points
from .const import DEFAULT_SCAN_INTERVAL, DOMAIN


class RPI2DMDCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Share /status and refresh the authoritative brightness schedule."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, api: RPI2DMDClient, info: dict[str, Any]) -> None:
        self.brightness_points: list[dict[str, Any]] | None = None
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
            status = await self.api.async_get_status()
            try:
                await self.async_refresh_brightness_schedule(notify=False)
            except (RPI2DMDError, ValueError):
                # A brightness-only failure must not disable unrelated entities.
                logging.getLogger(DOMAIN).debug("Brightness schedule refresh failed", exc_info=True)
            return status
        except RPI2DMDError as err:
            raise UpdateFailed(str(err)) from err

    async def async_refresh_brightness_schedule(self, *, notify: bool = True) -> list[dict[str, Any]]:
        """Read confirmed API values and notify the number after panel requests."""
        try:
            points = _hourly_to_points(await self.api.async_get_brightness_schedule())
        except (RPI2DMDError, ValueError):
            self.brightness_points = None
            if notify:
                self.async_update_listeners()
            raise
        self.brightness_points = points
        if notify:
            self.async_update_listeners()
        return points
