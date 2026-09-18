"""Atomic migration of an RPI2DMD instance identity after physical reauth."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.storage import Store


class IdentityMigrationError(Exception):
    """Migration could not be completed without risking a collision."""


async def async_recover_canonical_entity_ids(hass: HomeAssistant, entry: ConfigEntry) -> int:
    """Rename regenerated ``*_2`` entity ids through the public registry API.

    Deleted registry tombstones are intentionally left to HA: when an entity
    is recreated, ``async_get_or_create`` restores its tombstone metadata.
    """
    registry = er.async_get(hass)
    entries = er.async_entries_for_config_entry(registry, entry.entry_id)
    changes: list[tuple[str, str]] = []
    for item in entries:
        object_id = item.entity_id.split(".", 1)[1]
        if not object_id.endswith("_2"):
            continue
        target = f"{item.domain}.{object_id[:-2]}"
        current = registry.async_get(target)
        if current is not None and current.entity_id != item.entity_id:
            raise IdentityMigrationError("entity_id_collision")
        changes.append((item.entity_id, target))
    changed: list[tuple[str, str]] = []
    try:
        for source, target in changes:
            registry.async_update_entity(source, new_entity_id=target)
            changed.append((source, target))
    except Exception as err:
        for source, target in reversed(changed):
            registry.async_update_entity(target, new_entity_id=source)
        raise IdentityMigrationError("entity_id_recovery_failed") from err
    return len(changed)


async def async_migrate_brightness_schedule(
    hass: HomeAssistant, old_entry_id: str, new_entry_id: str
) -> bool:
    """Copy an existing schedule to a new entry key without deleting source."""
    if old_entry_id == new_entry_id:
        return False
    old_store = Store(hass, 1, f"rpi2dmd.{old_entry_id}.brightness_schedule")
    new_store = Store(hass, 1, f"rpi2dmd.{new_entry_id}.brightness_schedule")
    old_data = await old_store.async_load()
    if old_data is None or await new_store.async_load() is not None:
        return False
    await new_store.async_save(old_data)
    return True


async def async_migrate_instance_identity(
    hass: HomeAssistant, entry: ConfigEntry, old_instance_id: str | None,
    new_instance_id: str,
) -> None:
    """Migrate registry identities while retaining entry/device/entity IDs.

    All collisions are checked before the first registry write. Registry updates
    are rolled back if a later update unexpectedly fails.
    """
    if old_instance_id == new_instance_id:
        return
    if not new_instance_id or not isinstance(new_instance_id, str):
        raise IdentityMigrationError("invalid_instance_id")
    existing = hass.config_entries.async_entry_for_domain_unique_id(
        entry.domain, new_instance_id
    )
    if existing is not None and existing.entry_id != entry.entry_id:
        raise IdentityMigrationError("instance_id_collision")

    entity_registry = er.async_get(hass)
    entities = [
        item for item in er.async_entries_for_config_entry(entity_registry, entry.entry_id)
        if old_instance_id and item.unique_id.startswith(f"{old_instance_id}_")
    ]
    replacements = {
        item.entity_id: f"{new_instance_id}_{item.unique_id[len(old_instance_id) + 1:]}"
        for item in entities
    }
    for item, new_uid in ((item, replacements[item.entity_id]) for item in entities):
        conflict = entity_registry.async_get_entity_id(item.domain, item.platform, new_uid)
        if conflict is not None and conflict != item.entity_id:
            raise IdentityMigrationError("entity_unique_id_collision")

    device_registry = dr.async_get(hass)
    old_identifier = (entry.domain, old_instance_id) if old_instance_id else None
    new_identifier = (entry.domain, new_instance_id)
    old_devices = (
        device_registry.async_get_devices(identifiers={old_identifier}, config_entry_id=entry.entry_id)
        if old_identifier else []
    )
    all_new_devices = device_registry.async_get_devices(identifiers={new_identifier})
    if any(device.id not in {old.id for old in old_devices} for device in all_new_devices):
        raise IdentityMigrationError("device_identifier_collision")

    changed_entities: list[tuple[str, str]] = []
    device_changed = False
    try:
        for item in entities:
            entity_registry.async_update_entity(item.entity_id, new_unique_id=replacements[item.entity_id])
            changed_entities.append((item.entity_id, item.unique_id))
        for device in old_devices:
            identifiers = (set(device.identifiers) - {old_identifier}) | {new_identifier}
            device_registry.async_update_device(device.id, new_identifiers=identifiers)
            device_changed = True
        hass.config_entries.async_update_entry(entry, unique_id=new_instance_id)
    except Exception as err:
        for entity_id, old_uid in reversed(changed_entities):
            entity_registry.async_update_entity(entity_id, new_unique_id=old_uid)
        if device_changed:
            for device in old_devices:
                identifiers = (set(device.identifiers) - {new_identifier}) | {old_identifier}
                device_registry.async_update_device(device.id, new_identifiers=identifiers)
        raise IdentityMigrationError("identity_migration_failed") from err
