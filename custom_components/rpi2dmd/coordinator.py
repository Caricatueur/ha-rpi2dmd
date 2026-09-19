"""Coordinator for shared status and confirmed brightness schedule."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import RPI2DMDAuthError, RPI2DMDClient, RPI2DMDError, async_retry_busy
from .brightness import _validate_hourly
from .const import DEFAULT_SCAN_INTERVAL, DOMAIN


_LOGGER = logging.getLogger(__name__)


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
            config_entry=entry,
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            try:
                # Preserve the historical status-read policy: one retry after 0.5s.
                status = await async_retry_busy(
                    self.api.async_get_status, attempts=2, delay=0.5,
                    is_busy=lambda err: str(err) == "Configuration is busy"
                    and err.status not in (401, 403),
                )
            except Exception as err:
                _LOGGER.debug("Coordinator diagnostic endpoint=status failed exception=%s", type(err).__name__)
                raise
            try:
                await self.async_refresh_brightness_schedule(notify=False)
            except RPI2DMDAuthError:
                raise
            except (RPI2DMDError, ValueError):
                # A brightness-only failure must not disable unrelated entities.
                pass  # The endpoint-specific diagnostic is emitted below.
            return status
        except RPI2DMDAuthError:
            # Real ConfigEntry instances use HA's auth-failure path. Lightweight
            # test doubles retain the historical UpdateFailed behavior.
            if isinstance(self.config_entry, ConfigEntry):
                raise ConfigEntryAuthFailed("RPI2DMD authentication rejected") from None
            raise UpdateFailed("RPI2DMD authentication rejected") from None
        except RPI2DMDError as err:
            raise UpdateFailed(str(err)) from err

    async def async_refresh_brightness_schedule(self, *, notify: bool = True) -> list[dict[str, Any]]:
        """Read confirmed API values and notify the number after panel requests."""
        try:
            try:
                hourly = _validate_hourly(await self.api.async_get_brightness_schedule())
            except Exception as err:
                _LOGGER.debug("Coordinator diagnostic endpoint=brightness_schedule failed exception=%s", type(err).__name__)
                raise
            points = [
                {"time": f"{row['hour']:02d}:00", "value": row["value"]}
                for row in hourly
            ]
        except (RPI2DMDError, ValueError):
            self.brightness_points = None
            if notify:
                self.async_update_listeners()
            raise
        self.brightness_points = points
        if notify:
            self.async_update_listeners()
        return points
