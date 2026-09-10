"""Brightness number entity backed by the current hour's 24-value schedule."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api import RPI2DMDError
from .const import DOMAIN
from .entity import RPI2DMDEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    async_add_entities([RPI2DMDNumber(hass.data[DOMAIN][entry.entry_id]["coordinator"])])


class RPI2DMDNumber(RPI2DMDEntity, NumberEntity):
    """Current-hour brightness; the API retains the full schedule."""

    _attr_name = "Luminosité"
    _attr_native_min_value = 0
    _attr_native_max_value = 100
    _attr_native_step = 5
    _attr_mode = NumberMode.SLIDER

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "brightness")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(async_track_time_change(
            self.hass, self._hour_changed, minute=0, second=0
        ))

    @callback
    def _hour_changed(self, now) -> None:
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        return super().available and self.coordinator.brightness_points is not None

    @property
    def native_value(self):
        if not self.available:
            return None
        time = dt_util.now().strftime("%H:00")
        return next(
            (point["value"] for point in reversed(self.coordinator.brightness_points)
             if point["time"] <= time), None
        )

    async def async_set_native_value(self, value: float) -> None:
        hour = dt_util.now().hour
        try:
            await self.coordinator.api.async_update_display(
                {"brightness": {"schedule": [{"hour": hour, "value": int(value)}]}}
            )
            await self.coordinator.async_refresh_brightness_schedule()
            await self.coordinator.async_request_refresh()
        except RPI2DMDError as err:
            raise RuntimeError(str(err)) from err
