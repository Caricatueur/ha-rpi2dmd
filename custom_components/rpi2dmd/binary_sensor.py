"""RPI2DMD diagnostic binary sensors."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity import RPI2DMDEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    async_add_entities(
        [
            RPI2DMDServiceSensor(coordinator, "display_service", "Display"),
            RPI2DMDServiceSensor(coordinator, "mqtt_service", "MQTT"),
            RPI2DMDMQTTSensor(coordinator),
            RPI2DMDUndervoltageSensor(coordinator),
        ]
    )


class RPI2DMDServiceSensor(RPI2DMDEntity, BinarySensorEntity):
    """Display or MQTT systemd service state."""

    _attr_entity_category = "diagnostic"

    def __init__(self, coordinator, key: str, name: str) -> None:
        super().__init__(coordinator, key)
        self._service_key = "display" if key.startswith("display") else "mqtt"
        self._attr_name = name

    @property
    def is_on(self) -> bool:
        return self._status().get("services", {}).get(self._service_key, {}).get("state") == "active"


class RPI2DMDMQTTSensor(RPI2DMDEntity, BinarySensorEntity):
    """MQTT broker connection state."""

    _attr_name = "MQTT connecté"
    _attr_entity_category = "diagnostic"

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "mqtt_connected")

    @property
    def is_on(self) -> bool:
        return bool(self._status().get("mqtt", {}).get("connected", False))


class RPI2DMDUndervoltageSensor(RPI2DMDEntity, BinarySensorEntity):
    """Current undervoltage diagnostic."""

    _attr_name = "Sous-tension"
    _attr_entity_category = "diagnostic"

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "undervoltage")

    @property
    def is_on(self) -> bool:
        return bool(self._status().get("power", {}).get("undervoltage_now", self._status().get("power", {}).get("undervoltage", False)))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        power = self._status().get("power", {})
        return {key: power.get(key) for key in ("throttled_code", "undervoltage_occurred", "throttled_occurred") if key in power}
