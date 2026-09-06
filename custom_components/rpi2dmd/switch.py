"""Display feature switches."""

from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api import RPI2DMDError
from .const import DOMAIN, SWITCH_FLAGS
from .entity import RPI2DMDEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    async_add_entities([RPI2DMDFlagSwitch(coordinator, flag, name) for flag, name in SWITCH_FLAGS.items()])


class RPI2DMDFlagSwitch(RPI2DMDEntity, SwitchEntity):
    """Toggle exactly one Display API flag."""

    def __init__(self, coordinator, flag: str, name: str) -> None:
        super().__init__(coordinator, f"switch_{flag}")
        self._flag = flag
        self._attr_name = name

    @property
    def is_on(self) -> bool:
        return self._flag in self._status().get("display", {}).get("active_flags", [])

    async def _async_set(self, value: bool) -> None:
        try:
            await self.coordinator.api.async_update_display({"flags": {self._flag: value}})
            await self.coordinator.async_request_refresh()
        except RPI2DMDError as err:
            raise RuntimeError(str(err)) from err

    async def async_turn_on(self, **kwargs) -> None:
        await self._async_set(True)

    async def async_turn_off(self, **kwargs) -> None:
        await self._async_set(False)
