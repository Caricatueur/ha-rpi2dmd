"""Discovery, manual setup and reauthentication using the same physical pairing."""
from __future__ import annotations

import re
import asyncio
import socket

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_HOST
from homeassistant.data_entry_flow import AbortFlow
from homeassistant.helpers import aiohttp_client
try:
    from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo
except ImportError:  # HA <= 2024.12 compatibility for the preserved HA7 venv
    try:
        from homeassistant.components.zeroconf import ZeroconfServiceInfo
    except ImportError:
        from typing import Any
        ZeroconfServiceInfo = Any

from .api import (
    RPI2DMDAuthError,
    RPI2DMDClient,
    RPI2DMDConnectionError,
    RPI2DMDError,
    RPI2DMDPairingError,
    RPI2DMDTimeoutError,
    normalize_host,
)
from .const import DOMAIN
from .identity import IdentityMigrationError, async_migrate_instance_identity


async def _discovery_hosts(info: ZeroconfServiceInfo) -> list[str]:
    """Prefer a resolvable mDNS name, then IPv4, then IPv6."""
    port = info.port
    candidates: list[str] = []
    hostname = str(getattr(info, "hostname", "") or "").rstrip(".")
    if hostname.lower().endswith(".local"):
        try:
            await asyncio.wait_for(
                asyncio.to_thread(socket.getaddrinfo, hostname, port, type=socket.SOCK_STREAM),
                timeout=1.0,
            )
            candidates.append(normalize_host(hostname, port))
        except (OSError, asyncio.TimeoutError, RPI2DMDConnectionError):
            pass
    addresses = list(getattr(info, "ip_addresses", []) or [])
    if not addresses and getattr(info, "ip_address", None):
        addresses = [info.ip_address]
    for address in addresses:
        value = str(address)
        if ":" not in value:
            candidate = normalize_host(value, port)
            if candidate not in candidates:
                candidates.append(candidate)
    for address in addresses:
        value = str(address)
        if ":" in value:
            candidate = normalize_host(value, port)
            if candidate not in candidates:
                candidates.append(candidate)
    return candidates


def _error_key(err: Exception) -> str:
    """Expose fixed UI keys, never server responses or credentials."""
    if isinstance(err, RPI2DMDPairingError):
        return str(err)
    if isinstance(err, RPI2DMDAuthError):
        return "invalid_auth"
    if isinstance(err, RPI2DMDTimeoutError):
        return "pairing_timeout"
    if isinstance(err, RPI2DMDConnectionError):
        return "cannot_connect"
    return "unknown"


def _is_network_title(title: str, host: str) -> bool:
    """Recognize an automatically generated address title, not user labels."""
    value = str(title or "").strip().rstrip(".")
    normalized_host = str(host or "").strip().rstrip(".")
    if value == normalized_host:
        return True
    if value.startswith("[") and value.endswith("]"):
        return True
    if "." in value and all(part.isdigit() for part in value.split(".")):
        return True
    return ":" in value


class RPI2DMDConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Keep VERSION 1 entries and the HA7 code-only exchange contract."""

    VERSION = 1

    def __init__(self):
        self._pairing_client = None
        self._pairing_info = {}
        self._pending_token = None

    async def _async_prepare(self, host):
        """Confirm identity using public info, never mDNS TXT identity."""
        client = RPI2DMDClient(
            aiohttp_client.async_get_clientsession(self.hass), host, ""
        )
        info = await client.async_get_info()
        if not str(info.get("rpi2dmd_version", "")).startswith("2."):
            raise RPI2DMDPairingError("unsupported_version")
        instance_id = info.get("instance_id")
        if not isinstance(instance_id, str) or not instance_id.strip():
            raise RPI2DMDPairingError("invalid_device")
        if self._pairing_info and instance_id != self._pairing_info["instance_id"]:
            raise AbortFlow("unique_id_mismatch")
        await self.async_set_unique_id(instance_id)
        if self.source not in (config_entries.SOURCE_REAUTH, config_entries.SOURCE_ZEROCONF):
            self._abort_if_unique_id_configured(updates={CONF_HOST: client.host})
        self._pairing_client, self._pairing_info = client, info
        self._pending_token = None
        self.context["title_placeholders"] = {"name": self._name}

    @property
    def _name(self):
        return str(self._pairing_info.get("hostname") or self._pairing_client.host)

    async def _async_start(self):
        """Only called after an explicit user submission, never in a loop."""
        await self._pairing_client.async_start_pairing()
        self._pending_token = None
        return await self.async_step_pairing()

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            try:
                await self._async_prepare(user_input.get(CONF_HOST, ""))
                return await self._async_start()
            except AbortFlow:
                raise
            except Exception as err:
                errors["base"] = _error_key(err)
        return self.async_show_form(
            step_id="user", data_schema=vol.Schema({vol.Required(CONF_HOST): str}),
            errors=errors,
        )

    async def async_step_zeroconf(self, discovery_info: ZeroconfServiceInfo):
        try:
            hosts = await _discovery_hosts(discovery_info)
            if not hosts:
                raise RPI2DMDConnectionError("No usable discovery address")
            last_error = None
            for host in hosts:
                try:
                    await self._async_prepare(host)
                    break
                except Exception as err:
                    last_error = err
            else:
                raise last_error or RPI2DMDConnectionError("Unable to reach device")
            # The public /info identity is authoritative. Resolve an existing
            # entry only after that validation, then update its endpoint/title
            # without touching its token or creating a second entry.
            existing = self.hass.config_entries.async_entry_for_domain_unique_id(
                DOMAIN, self.unique_id
            )
            if existing is not None and existing.entry_id != self.context.get("entry_id"):
                old_host = str(existing.data.get(CONF_HOST, ""))
                if normalize_host(old_host) not in hosts or existing.unique_id == self.unique_id:
                    updates = dict(existing.data)
                    updates[CONF_HOST] = self._pairing_client.host
                    title = existing.title
                    if _is_network_title(title, old_host):
                        title = self._pairing_client.host
                    if updates != dict(existing.data) or title != existing.title:
                        self.hass.config_entries.async_update_entry(
                            existing, data=updates, title=title
                        )
                    raise AbortFlow("already_configured")
                existing.async_start_reauth_if_available(self.hass)
                raise AbortFlow("already_configured")
        except AbortFlow:
            raise
        except Exception as err:
            return self.async_abort(reason=_error_key(err))
        return await self.async_step_discovery_confirm()

    async def async_step_discovery_confirm(self, user_input=None):
        return await self._async_confirm("discovery_confirm", user_input)

    async def async_step_reauth(self, entry_data):
        # Read the live entry on confirmation, including any DHCP update.
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input=None):
        errors = {}
        if user_input is not None:
            try:
                await self._async_prepare(self._get_reauth_entry().data[CONF_HOST])
                return await self._async_start()
            except AbortFlow:
                raise
            except Exception as err:
                errors["base"] = _error_key(err)
        return self.async_show_form(
            step_id="reauth_confirm", data_schema=vol.Schema({}), errors=errors,
        )

    async def _async_confirm(self, step_id, user_input):
        errors = {}
        if user_input is not None:
            try:
                # Revalidate identity/address before restarting or after a long
                # discovery confirmation; a DHCP lease might have changed.
                host = self._pairing_client.host
                if self.source == config_entries.SOURCE_REAUTH:
                    host = self._get_reauth_entry().data[CONF_HOST]
                await self._async_prepare(host)
                return await self._async_start()
            except AbortFlow:
                raise
            except Exception as err:
                errors["base"] = _error_key(err)
        return self.async_show_form(
            step_id=step_id, data_schema=vol.Schema({}), errors=errors,
            description_placeholders={"name": self._name},
        )

    async def async_step_pairing_restart(self, user_input=None):
        return await self._async_confirm("pairing_restart", user_input)

    async def async_step_pairing(self, user_input=None):
        errors = {}
        if user_input is not None:
            if user_input.get("restart_pairing"):
                return await self.async_step_pairing_restart()
            try:
                code = str(user_input.get("pairing_code", "")).strip()
                if not re.fullmatch(r"[0-9]{6}", code):
                    raise RPI2DMDPairingError("invalid_pairing_code")
                client = self._pairing_client
                # An exchange consumes the code. On a transient status failure,
                # retry validation of the received token, not another exchange.
                if self._pending_token is None:
                    self._pending_token = await client.async_pair(code)
                client.token = self._pending_token
                if not (await client.async_get_status()).get("online"):
                    raise RPI2DMDPairingError("invalid_auth")
                data = {"host": client.host, "token": self._pending_token}
                if self.source == config_entries.SOURCE_REAUTH:
                    entry = self._get_reauth_entry()
                    await async_migrate_instance_identity(
                        self.hass, entry, entry.unique_id, self.unique_id
                    )
                    return self.async_update_reload_and_abort(
                        entry, data_updates=data,
                    )
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=self._name, data=data)
            except AbortFlow:
                raise
            except Exception as err:
                errors["base"] = _error_key(err)
                if isinstance(err, RPI2DMDAuthError):
                    self._pending_token = None
        return self.async_show_form(
            step_id="pairing",
            data_schema=vol.Schema({
                vol.Optional("pairing_code"): str,
                vol.Optional("restart_pairing", default=False): bool,
            }),
            errors=errors,
        )
