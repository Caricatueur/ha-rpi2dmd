"""Config flow for RPI2DMD."""

from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_HOST
from homeassistant.helpers import aiohttp_client

from .api import RPI2DMDAuthError, RPI2DMDClient, RPI2DMDConnectionError, RPI2DMDError
from .const import (
    CONF_TOKEN,
    DOMAIN,
    ERROR_CANNOT_CONNECT,
    ERROR_INVALID_AUTH,
    ERROR_UNKNOWN,
    ERROR_UNSUPPORTED_VERSION,
)


class RPI2DMDConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle user setup and duplicate-device protection."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors: dict[str, str] = {}
        if user_input is not None:
            host = str(user_input[CONF_HOST]).strip().rstrip("/")
            token = str(user_input[CONF_TOKEN]).strip()
            session = aiohttp_client.async_get_clientsession(self.hass)
            client = RPI2DMDClient(session, host, token)
            try:
                info = await client.async_get_info()
                version = str(info.get("rpi2dmd_version", ""))
                if not version.startswith("2."):
                    raise ValueError(ERROR_UNSUPPORTED_VERSION)
                status = await client.async_get_status()
                if not status.get("online"):
                    raise ValueError(ERROR_UNKNOWN)
            except RPI2DMDAuthError:
                errors["base"] = ERROR_INVALID_AUTH
            except RPI2DMDConnectionError:
                errors["base"] = ERROR_CANNOT_CONNECT
            except ValueError as err:
                errors["base"] = str(err)
            except RPI2DMDError:
                errors["base"] = ERROR_UNKNOWN
            except Exception:  # noqa: BLE001 - UI must never expose a traceback
                errors["base"] = ERROR_UNKNOWN
            else:
                stable_id = info.get("instance_id")
                if not isinstance(stable_id, str) or not stable_id:
                    errors["base"] = ERROR_UNKNOWN
                else:
                    await self.async_set_unique_id(stable_id)
                    self._abort_if_unique_id_configured()
                    return self.async_create_entry(
                        title=str(info.get("hostname") or host),
                        data={"host": host, "token": token},
                    )
        schema = vol.Schema({vol.Required(CONF_HOST): str, vol.Required(CONF_TOKEN): str})
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)
