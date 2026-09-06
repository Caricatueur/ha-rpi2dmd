"""Shared entity helpers."""

from __future__ import annotations

from typing import Any

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import RPI2DMDCoordinator


class RPI2DMDEntity(CoordinatorEntity[RPI2DMDCoordinator]):
    """Base entity tied to one RPI2DMD config entry/device."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: RPI2DMDCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._entity_key = key
        instance_id = coordinator.config_entry.unique_id or coordinator.config_entry.entry_id
        self._attr_unique_id = f"{instance_id}_{key}"
        info = coordinator.info
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, str(instance_id))},
            name="RPI2DMD",
            manufacturer="RPI2DMD",
            model=info.get("model") or "RPI2DMD",
            sw_version=info.get("rpi2dmd_version"),
        )

    @property
    def available(self) -> bool:
        return super().available and bool(self.coordinator.data)

    def _status(self) -> dict[str, Any]:
        return self.coordinator.data or {}
