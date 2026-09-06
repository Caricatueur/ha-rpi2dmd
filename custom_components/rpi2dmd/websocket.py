"""Home Assistant WebSocket bridge for the RPI2DMD panel.

The browser receives only sanitized API data. API tokens and Authorization
headers remain inside the integration's existing client objects.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .api import RPI2DMDAuthError, RPI2DMDConnectionError, RPI2DMDError
from .const import DOMAIN


def _entries(hass: HomeAssistant):
    return hass.config_entries.async_entries(DOMAIN)


def _runtime(hass: HomeAssistant, entry_id: str) -> dict[str, Any]:
    runtime = hass.data.get(DOMAIN, {}).get(entry_id)
    if not runtime:
        raise ValueError("RPI2DMD config entry is not loaded")
    return runtime


def _entry_id(msg: Mapping[str, Any]) -> str:
    value = msg.get("entry_id")
    if not isinstance(value, str) or not value:
        raise ValueError("entry_id is required")
    return value


def _send_error(connection, msg_id: int, err: Exception) -> None:
    if isinstance(err, RPI2DMDAuthError):
        code = "invalid_auth"
    elif isinstance(err, RPI2DMDConnectionError):
        code = "cannot_connect"
    elif isinstance(err, ValueError):
        code = "invalid_format"
    else:
        code = "api_error"
    connection.send_error(msg_id, code, str(err))


async def _call(hass: HomeAssistant, msg: Mapping[str, Any]) -> Any:
    command = msg["type"]
    if command == "rpi2dmd/devices":
        result = []
        for entry in _entries(hass):
            runtime = hass.data.get(DOMAIN, {}).get(entry.entry_id)
            info = runtime["coordinator"].info if runtime else {}
            result.append(
                {
                    "entry_id": entry.entry_id,
                    "name": entry.title or info.get("hostname") or "RPI2DMD",
                    "model": info.get("model"),
                    "host": entry.data.get("host"),
                    "available": bool(runtime and runtime["coordinator"].available),
                }
            )
        return {"devices": result}

    entry_id = _entry_id(msg)
    runtime = _runtime(hass, entry_id)
    api = runtime["api"]
    coordinator = runtime["coordinator"]

    if command == "rpi2dmd/status":
        await coordinator.async_request_refresh()
        return {"entry_id": entry_id, "status": coordinator.data}
    if command == "rpi2dmd/display/get":
        return {"entry_id": entry_id, "display": await api.async_get_display()}
    if command == "rpi2dmd/display/update":
        result = await api.async_update_display(msg.get("changes", {}))
        await coordinator.async_request_refresh()
        return {"entry_id": entry_id, "display": result}
    if command == "rpi2dmd/playlist/get":
        return {"entry_id": entry_id, "playlist": await api.async_get_playlist()}
    if command == "rpi2dmd/playlist/add":
        return {"entry_id": entry_id, "item": await api.async_add_playlist_item(msg.get("item", {}))}
    if command == "rpi2dmd/playlist/update":
        return {"entry_id": entry_id, "item": await api.async_update_playlist_item(msg["item_id"], msg.get("changes", {}))}
    if command == "rpi2dmd/playlist/delete":
        return {"entry_id": entry_id, "result": await api.async_delete_playlist_item(msg["item_id"])}
    if command == "rpi2dmd/playlist/move":
        return {"entry_id": entry_id, "playlist": await api.async_move_playlist_item(msg["item_id"], int(msg["index"]))}
    if command == "rpi2dmd/playlist/duplicate":
        return {"entry_id": entry_id, "item": await api.async_duplicate_playlist_item(msg["item_id"], msg.get("after_id"))}
    if command == "rpi2dmd/mqtt/get":
        return {"entry_id": entry_id, "mqtt": await api.async_get_mqtt(), "mqtt_status": await api.async_get_mqtt_status()}
    if command == "rpi2dmd/mqtt/update":
        return {"entry_id": entry_id, "mqtt": await api.async_update_mqtt(msg.get("changes", {}))}
    if command == "rpi2dmd/mqtt/test":
        return {"entry_id": entry_id, "result": await api.async_test_mqtt(msg.get("body"))}
    if command == "rpi2dmd/gifs/list":
        return {"entry_id": entry_id, "gifs": await api.async_get_gifs(category=msg.get("category"), search=msg.get("search"), limit=int(msg.get("limit", 50)), offset=int(msg.get("offset", 0)))}
    if command == "rpi2dmd/gifs/categories":
        return {"entry_id": entry_id, "categories": await api.async_get_gif_categories()}
    if command == "rpi2dmd/weather/get":
        return {"entry_id": entry_id, "weather": await api.async_get_weather()}
    if command == "rpi2dmd/weather/update":
        return {"entry_id": entry_id, "weather": await api.async_update_weather(msg.get("changes", {}))}
    if command == "rpi2dmd/system":
        return {"entry_id": entry_id, "system": await api.async_get_system()}
    if command == "rpi2dmd/config/export":
        return {"entry_id": entry_id, "config": await api.async_get_config_export()}
    if command == "rpi2dmd/config/import/validate":
        return {"entry_id": entry_id, "validation": await api.async_validate_import(msg["document"])}
    if command == "rpi2dmd/config/import/apply":
        return {"entry_id": entry_id, "result": await api.async_import_config(msg["validation_token"])}
    raise ValueError("Unknown RPI2DMD WebSocket command")


async def _websocket_handler(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Dispatch one of the registered panel commands."""
    try:
        result = await _call(hass, msg)
    except (RPI2DMDError, ValueError, KeyError, TypeError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)


WEBSOCKET_COMMANDS = (
    "rpi2dmd/devices",
    "rpi2dmd/status",
    "rpi2dmd/display/get",
    "rpi2dmd/display/update",
    "rpi2dmd/playlist/get",
    "rpi2dmd/playlist/add",
    "rpi2dmd/playlist/update",
    "rpi2dmd/playlist/delete",
    "rpi2dmd/playlist/move",
    "rpi2dmd/playlist/duplicate",
    "rpi2dmd/mqtt/get",
    "rpi2dmd/mqtt/update",
    "rpi2dmd/mqtt/test",
    "rpi2dmd/gifs/list",
    "rpi2dmd/gifs/categories",
    "rpi2dmd/weather/get",
    "rpi2dmd/weather/update",
    "rpi2dmd/system",
    "rpi2dmd/config/export",
    "rpi2dmd/config/import/validate",
    "rpi2dmd/config/import/apply",
)


def _command_handler(command: str):
    """Build a handler with a literal WebSocket command schema.

    Home Assistant indexes registered handlers by the literal value of the
    schema's ``type`` field. A generic ``str`` validator is not a command
    registration for any concrete message type.
    """

    @websocket_api.websocket_command(
        vol.All(
            vol.Schema(
                {vol.Required("type"): command, vol.Required("id"): int},
                extra=vol.ALLOW_EXTRA,
            )
        )
    )
    @websocket_api.async_response
    async def handler(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
        await _websocket_handler(hass, connection, msg)

    return handler


def async_register(hass: HomeAssistant) -> None:
    """Register the single WebSocket command dispatcher once."""
    if hass.data.get("rpi2dmd_websocket_registered"):
        return
    for command in WEBSOCKET_COMMANDS:
        websocket_api.async_register_command(hass, _command_handler(command))
    hass.data["rpi2dmd_websocket_registered"] = True
