"""RPI2DMD informational sensors."""

from __future__ import annotations

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfTemperature, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity import RPI2DMDEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    async_add_entities(
        [
            RPI2DMDTemperatureSensor(coordinator),
            RPI2DMDUptimeSensor(coordinator),
            RPI2DMDCurrentScreenSensor(coordinator),
        ]
    )


class RPI2DMDTemperatureSensor(RPI2DMDEntity, SensorEntity):
    _attr_name = "Température Raspberry"
    _attr_device_class = SensorDeviceClass.TEMPERATURE
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS
    _attr_entity_category = "diagnostic"

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "cpu_temperature")

    @property
    def native_value(self):
        return self._status().get("cpu_temperature_c")


class RPI2DMDUptimeSensor(RPI2DMDEntity, SensorEntity):
    _attr_name = "Uptime"
    _attr_native_unit_of_measurement = UnitOfTime.SECONDS
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_entity_category = "diagnostic"

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "uptime")

    @property
    def native_value(self):
        return self._status().get("uptime_seconds")


class RPI2DMDCurrentScreenSensor(RPI2DMDEntity, SensorEntity):
    _attr_name = "Écran actuel"

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "current_screen")

    @property
    def native_value(self):
        screen = self._status().get("current_screen", {})
        if screen.get("available") and screen.get("type"):
            return screen.get("id") or screen.get("type")
        playlist = self._status().get("playlist", {})
        return playlist.get("mode") if playlist else None

    @property
    def extra_state_attributes(self):
        screen = self._status().get("current_screen", {})
        renderer = self._status().get("current_renderer", {})
        return {"type": screen.get("type"), "renderer": renderer.get("name")}
