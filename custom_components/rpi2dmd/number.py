"""Brightness number entity backed by the current hour's 24-value schedule."""

from __future__ import annotations

from datetime import datetime

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
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
        self._value = None

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        await self._async_refresh_value()

    async def _async_refresh_value(self) -> None:
        try:
            display = await self.coordinator.api.async_get_display()
            schedule = display.get("brightness", {}).get("schedule", [])
            hour = datetime.now().hour
            self._value = next((row.get("value") for row in schedule if row.get("hour") == hour), None)
            self.async_write_ha_state()
        except RPI2DMDError:
            self._value = None

    @property
    def native_value(self):
        return self._value

    async def async_set_native_value(self, value: float) -> None:
        hour = datetime.now().hour
        try:
            await self.coordinator.api.async_update_display(
                {"brightness": {"schedule": [{"hour": hour, "value": int(value)}]}}
            )
            await self._async_refresh_value()
            await self.coordinator.async_request_refresh()
        except RPI2DMDError as err:
            raise RuntimeError(str(err)) from err
