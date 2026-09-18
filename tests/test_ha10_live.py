"""HA10 live-recovery contracts against the HA 2026.9.2 registries."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from ipaddress import ip_address
from types import MappingProxyType

import pytest
import pytest_asyncio
from homeassistant.config_entries import ConfigEntries, ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo

from custom_components.rpi2dmd.identity import (
    async_migrate_brightness_schedule,
    async_recover_canonical_entity_ids,
)
from custom_components import rpi2dmd
from custom_components.rpi2dmd.api import RPI2DMDClient
from custom_components.rpi2dmd.config_flow import RPI2DMDConfigFlow
from test_pairing import entry as make_entry


@pytest_asyncio.fixture
async def hass_ha10(tmp_path):
    hass = HomeAssistant(str(tmp_path))
    hass.config_entries = ConfigEntries(hass, {})
    dr.async_setup(hass)
    await dr.async_load(hass, load_empty=True)
    await er.async_load(hass, load_empty=True)
    cfg = make_entry({"host": "127.0.0.1", "token": "synthetic"})
    hass.config_entries._entries[cfg.entry_id] = cfg
    hass.data["_ha10_entry"] = cfg
    yield hass
    await hass.async_stop()


@pytest.mark.asyncio
async def test_entity_category_diagnostic_is_real_enum(hass_ha10):
    registry = er.async_get(hass_ha10)
    entry = hass_ha10.data["_ha10_entry"]
    created = registry.async_get_or_create(
        "sensor", "rpi2dmd", "e0aa_temperature",
        config_entry=entry, entity_category=EntityCategory.DIAGNOSTIC,
    )
    assert created.entity_category is EntityCategory.DIAGNOSTIC


@pytest.mark.asyncio
async def test_canonical_entity_recovery_is_idempotent(hass_ha10):
    registry = er.async_get(hass_ha10)
    entry = hass_ha10.data["_ha10_entry"]
    created = registry.async_get_or_create(
        "sensor", "rpi2dmd", "e0aa_current_screen",
        config_entry=entry, suggested_object_id="rpi2dmd_ecran_actuel_2",
    )
    assert created.entity_id.endswith("_2")
    assert await async_recover_canonical_entity_ids(hass_ha10, entry) == 1
    assert registry.async_get("sensor.rpi2dmd_ecran_actuel") is not None
    assert await async_recover_canonical_entity_ids(hass_ha10, entry) == 0


@pytest.mark.asyncio
async def test_setup_wires_both_recovery_helpers(hass_ha10):
    entry = hass_ha10.data["_ha10_entry"]
    coordinator = Mock(async_config_entry_first_refresh=AsyncMock())
    recover = AsyncMock()
    schedule = AsyncMock()
    with patch.object(rpi2dmd, "RPI2DMDCoordinator", return_value=coordinator), \
         patch.object(rpi2dmd, "async_register_panel", new=AsyncMock()), \
         patch.object(hass_ha10.config_entries, "async_forward_entry_setups", new=AsyncMock()), \
         patch.object(rpi2dmd, "async_recover_canonical_entity_ids", new=recover), \
         patch.object(rpi2dmd, "async_migrate_brightness_schedule", new=schedule), \
         patch.object(rpi2dmd, "LEGACY_BRIGHTNESS_SCHEDULE_MIGRATIONS", {"old-entry": entry.entry_id}), \
         patch.object(rpi2dmd.aiohttp_client, "async_get_clientsession", return_value=Mock()), \
         patch.object(RPI2DMDClient, "async_get_info", new=AsyncMock(return_value={"instance_id": "e0aa", "rpi2dmd_version": "2.8"})):
        assert await rpi2dmd.async_setup_entry(hass_ha10, entry)
    recover.assert_awaited_once_with(hass_ha10, entry)
    schedule.assert_awaited_once_with(
        hass_ha10, "old-entry", entry.entry_id
    )


@pytest.mark.asyncio
async def test_brightness_migration_preserves_source_and_is_idempotent(hass_ha10, monkeypatch):
    stores = {"rpi2dmd.old.brightness_schedule": {"enabled": True}}

    class FakeStore:
        def __init__(self, _hass, _version, key):
            self.key = key
        async def async_load(self):
            return stores.get(self.key)
        async def async_save(self, value):
            stores[self.key] = value

    monkeypatch.setattr("custom_components.rpi2dmd.identity.Store", FakeStore)
    assert await async_migrate_brightness_schedule(hass_ha10, "old", "new")
    assert stores["rpi2dmd.old.brightness_schedule"] == {"enabled": True}
    assert stores["rpi2dmd.new.brightness_schedule"] == {"enabled": True}
    assert not await async_migrate_brightness_schedule(hass_ha10, "old", "new")


def _ha10_discovery():
    return ZeroconfServiceInfo(
        ip_address=ip_address("192.0.2.99"),
        ip_addresses=[ip_address("2001:db8::99"), ip_address("192.0.2.99")],
        port=80, hostname="RPI2DMD.local.", type="_rpi2dmd._tcp.local.",
        name="RPI2DMD._rpi2dmd._tcp.local.", properties={},
    )


def _configured_entry(hass, *, title, host):
    hass.config_entries._entries.pop(hass.data["_ha10_entry"].entry_id, None)
    entry = ConfigEntry(
        version=1, minor_version=1, domain="rpi2dmd", title=title,
        data={"host": host, "token": "synthetic"}, source="user",
        unique_id="e0aa71d54fbb79a4", options={},
        discovery_keys=MappingProxyType({}), subentries_data=(),
    )
    hass.config_entries._entries[entry.entry_id] = entry
    return entry


@pytest.mark.asyncio
async def test_zeroconf_updates_existing_host_title_and_keeps_token(hass_ha10, monkeypatch):
    entry = _configured_entry(hass_ha10, title="[2001:db8::99]", host="[2001:db8::99]")
    monkeypatch.setattr(
        "custom_components.rpi2dmd.config_flow._discovery_hosts",
        AsyncMock(return_value=["RPI2DMD.local", "192.0.2.99", "[2001:db8::99]"]),
    )
    flow = RPI2DMDConfigFlow()
    flow.hass = hass_ha10
    flow.handler = "rpi2dmd"
    flow.context = {"source": "zeroconf"}
    with patch.object(RPI2DMDClient, "async_get_info", new=AsyncMock(return_value={
        "instance_id": "e0aa71d54fbb79a4", "rpi2dmd_version": "2.8"
    })), patch("custom_components.rpi2dmd.config_flow.aiohttp_client.async_get_clientsession", return_value=Mock()):
        with pytest.raises(Exception) as raised:
            await flow.async_step_zeroconf(_ha10_discovery())
    assert "already_configured" in str(raised.value)
    assert entry.entry_id in {item.entry_id for item in hass_ha10.config_entries.async_entries("rpi2dmd")}
    assert entry.unique_id == "e0aa71d54fbb79a4"
    assert entry.data["host"] == "RPI2DMD.local"
    assert entry.data["token"] == "synthetic"
    assert entry.title == "RPI2DMD.local"
    assert len(hass_ha10.config_entries.async_entries("rpi2dmd")) == 1


@pytest.mark.asyncio
async def test_zeroconf_custom_title_is_preserved(hass_ha10, monkeypatch):
    entry = _configured_entry(hass_ha10, title="Salon DMD", host="[2001:db8::1]")
    monkeypatch.setattr("custom_components.rpi2dmd.config_flow._discovery_hosts", AsyncMock(return_value=["RPI2DMD.local"]))
    flow = RPI2DMDConfigFlow(); flow.hass = hass_ha10; flow.handler = "rpi2dmd"; flow.context = {"source": "zeroconf"}
    with patch.object(RPI2DMDClient, "async_get_info", new=AsyncMock(return_value={"instance_id": "e0aa71d54fbb79a4", "rpi2dmd_version": "2.8"})), patch("custom_components.rpi2dmd.config_flow.aiohttp_client.async_get_clientsession", return_value=Mock()):
        with pytest.raises(Exception):
            await flow.async_step_zeroconf(_ha10_discovery())
    assert entry.title == "Salon DMD"
    assert entry.data["token"] == "synthetic"
