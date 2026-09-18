"""Identity migration contract tests for HA9 (registry APIs are isolated fakes)."""
from types import SimpleNamespace

import pytest

from custom_components.rpi2dmd.identity import (
    IdentityMigrationError,
    async_migrate_instance_identity,
)


class Registry:
    def __init__(self, entities=(), devices=()):
        self.entities = SimpleNamespace(get_entries_for_config_entry_id=lambda _: list(entities))
        self._entities = list(entities)
        self._devices = list(devices)

    def async_get_entity_id(self, domain, platform, unique_id):
        return next((e.entity_id for e in self._entities if e.domain == domain and e.platform == platform and e.unique_id == unique_id), None)

    def async_update_entity(self, entity_id, *, new_unique_id):
        next(e for e in self._entities if e.entity_id == entity_id).unique_id = new_unique_id

    def async_get_devices(self, *, identifiers=None, config_entry_id=None):
        return [d for d in self._devices if (config_entry_id is None or d.config_entry_id == config_entry_id) and (identifiers is None or d.identifiers & identifiers)]

    def async_update_device(self, device_id, *, new_identifiers):
        next(d for d in self._devices if d.id == device_id).identifiers = new_identifiers


@pytest.mark.asyncio
async def test_migration_is_idempotent_and_preserves_entity_ids(monkeypatch):
    entry = SimpleNamespace(domain='rpi2dmd', entry_id='entry', unique_id='old', data={'host': 'old'})
    entity = SimpleNamespace(entity_id='number.rpi2dmd_luminosite', unique_id='old_brightness', domain='number', platform='rpi2dmd')
    device = SimpleNamespace(id='device', config_entry_id='entry', identifiers={('rpi2dmd', 'old')})
    registry = Registry([entity], [device])
    hass = SimpleNamespace(config_entries=SimpleNamespace(async_entry_for_domain_unique_id=lambda *_: None, async_update_entry=lambda e, **kw: setattr(e, 'unique_id', kw['unique_id'])))
    monkeypatch.setattr('custom_components.rpi2dmd.identity.er.async_get', lambda _: registry)
    monkeypatch.setattr('custom_components.rpi2dmd.identity.dr.async_get', lambda _: registry)
    await async_migrate_instance_identity(hass, entry, 'old', 'new')
    assert entry.unique_id == 'new'
    assert entity.entity_id == 'number.rpi2dmd_luminosite' and entity.unique_id == 'new_brightness'
    assert device.id == 'device' and device.identifiers == {('rpi2dmd', 'new')}
    await async_migrate_instance_identity(hass, entry, 'new', 'new')


@pytest.mark.asyncio
@pytest.mark.parametrize('kind', ['entry', 'device', 'entity'])
async def test_collisions_are_rejected_without_mutation(monkeypatch, kind):
    entry = SimpleNamespace(domain='rpi2dmd', entry_id='entry', unique_id='old', data={})
    entity = SimpleNamespace(entity_id='sensor.old', unique_id='old_temperature', domain='sensor', platform='rpi2dmd')
    collision_entity = SimpleNamespace(entity_id='sensor.other', unique_id='new_temperature', domain='sensor', platform='rpi2dmd')
    device = SimpleNamespace(id='device', config_entry_id='entry', identifiers={('rpi2dmd', 'old')})
    other_device = SimpleNamespace(id='other', config_entry_id='other-entry', identifiers={('rpi2dmd', 'new')})
    registry = Registry([entity, collision_entity] if kind == 'entity' else [entity], [device, other_device] if kind == 'device' else [device])
    entries = SimpleNamespace(async_entry_for_domain_unique_id=lambda *_: SimpleNamespace(entry_id='other-entry') if kind == 'entry' else None, async_update_entry=lambda *_args, **_kw: None)
    hass = SimpleNamespace(config_entries=entries)
    monkeypatch.setattr('custom_components.rpi2dmd.identity.er.async_get', lambda _: registry)
    monkeypatch.setattr('custom_components.rpi2dmd.identity.dr.async_get', lambda _: registry)
    with pytest.raises(IdentityMigrationError):
        await async_migrate_instance_identity(hass, entry, 'old', 'new')
    assert entry.unique_id == 'old' and entity.unique_id == 'old_temperature'
