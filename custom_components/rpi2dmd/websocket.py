"""Home Assistant WebSocket bridge for the RPI2DMD panel.

The browser receives only sanitized API data. API tokens and Authorization
headers remain inside the integration's existing client objects.
"""

from __future__ import annotations

from collections.abc import Mapping
import logging
import re
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .api import RPI2DMDAuthError, RPI2DMDConnectionError, RPI2DMDError
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


def _entries(hass: HomeAssistant):
    return hass.config_entries.async_entries(DOMAIN)


def _runtimes(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    """Return only loaded config-entry runtimes.

    Keep this filtering local to the WebSocket bridge so technical metadata
    accidentally stored alongside entry data can never be treated as a
    device. The HA-3 entity platforms continue to use their existing layout.
    """
    domain_data = hass.data.get(DOMAIN, {})
    if not isinstance(domain_data, Mapping):
        return {}
    return {
        entry_id: runtime
        for entry_id, runtime in domain_data.items()
        if isinstance(entry_id, str)
        and isinstance(runtime, Mapping)
        and "api" in runtime
        and "coordinator" in runtime
    }


def _runtime(hass: HomeAssistant, entry_id: str) -> dict[str, Any]:
    runtime = _runtimes(hass).get(entry_id)
    if not runtime:
        raise ValueError("RPI2DMD config entry is not loaded")
    return dict(runtime)


def _entry_id(msg: Mapping[str, Any]) -> str:
    value = msg.get("entry_id")
    if not isinstance(value, str) or not value:
        raise ValueError("entry_id is required")
    return value


def _safe_weather(data: Mapping[str, Any]) -> dict[str, Any]:
    """Keep weather credentials out of every browser-facing response."""
    result = dict(data)
    configured = bool(result.get("api_key_configured"))
    for key in ("api_key", "apikey", "password", "token"):
        if key in result:
            configured = configured or bool(result[key])
            result.pop(key, None)
    result["api_key_configured"] = configured
    return result


def _schedule_store(hass: HomeAssistant, entry_id: str) -> Store:
    return Store(hass, 1, f"{DOMAIN}.{entry_id}.brightness_schedule")


def _schedule_to_hourly(points: Any) -> list[dict[str, int]]:
    """Validate UI points and expand them to the API's 24 hourly values."""
    if not isinstance(points, list) or not points:
        raise ValueError("Le planning doit contenir au moins une heure.")
    parsed: dict[int, int] = {}
    for index, point in enumerate(points, start=1):
        if not isinstance(point, Mapping):
            raise ValueError(f"La ligne {index} du planning est invalide.")
        raw_time = point.get("time")
        if isinstance(raw_time, str):
            match = re.fullmatch(r"([01]\d|2[0-3]):([0-5]\d)", raw_time)
            if not match:
                raise ValueError(f"L'heure « {raw_time} » est invalide (format HH:00 attendu).")
            hour = int(match.group(1))
            if match.group(2) != "00":
                raise ValueError(f"L'heure « {raw_time} » est invalide : les minutes doivent être 00.")
        else:
            hour = point.get("hour")
            if isinstance(hour, bool) or not isinstance(hour, int) or not 0 <= hour <= 23:
                raise ValueError(f"L'heure de la ligne {index} doit être comprise entre 00:00 et 23:00.")
        value = point.get("value")
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"La luminosité de la ligne {index} doit être un entier.")
        if not 0 <= value <= 100:
            raise ValueError(f"La luminosité de la ligne {index} doit être comprise entre 0 et 100.")
        if value % 5:
            raise ValueError(f"La luminosité {value} % de la ligne {index} est invalide : utilisez un multiple de 5.")
        if hour in parsed:
            raise ValueError(f"Deux lignes utilisent la même heure : {hour:02d}:00.")
        parsed[hour] = value
    ordered = sorted(parsed.items())
    return [
        {"hour": hour, "value": next((value for point_hour, value in reversed(ordered) if point_hour <= hour), ordered[-1][1])}
        for hour in range(24)
    ]


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
        runtimes = _runtimes(hass)
        for entry in _entries(hass):
            runtime = runtimes.get(entry.entry_id)
            coordinator = runtime.get("coordinator") if runtime else None
            info = getattr(coordinator, "info", {})
            if not isinstance(info, Mapping):
                info = {}
            result.append(
                {
                    "entry_id": entry.entry_id,
                    "name": getattr(entry, "title", None) or info.get("hostname") or "RPI2DMD",
                    "model": info.get("model"),
                    "host": entry.data.get("host"),
                    "available": bool(coordinator and getattr(coordinator, "available", False)),
                }
            )
        return {"devices": result}

    entry_id = _entry_id(msg)
    runtime = _runtime(hass, entry_id)
    api = runtime["api"]
    coordinator = runtime["coordinator"]

    if command == "rpi2dmd/status":
        try:
            await coordinator.async_request_refresh()
        except Exception:  # Coordinator records the failure and marks itself unavailable.
            _LOGGER.debug("RPI2DMD status refresh failed for entry %s", entry_id, exc_info=True)
        available = bool(getattr(coordinator, "available", False))
        return {
            "entry_id": entry_id,
            "online": available,
            "available": available,
            "status": coordinator.data if available else {},
        }
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
    if command == "rpi2dmd/icons/list":
        return {"entry_id": entry_id, "icons": await api.async_get_icons(search=msg.get("search"), category=msg.get("category"), limit=int(msg.get("limit", 100)), offset=int(msg.get("offset", 0)))}
    if command == "rpi2dmd/icons/get":
        icon_id = msg.get("icon_id")
        if not isinstance(icon_id, str) or not icon_id:
            raise ValueError("icon_id is required")
        return {"entry_id": entry_id, "icon": await api.async_get_icon(icon_id)}
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
    if command == "rpi2dmd/gifs/categories/update":
        return {"entry_id": entry_id, "categories": await api.async_update_gif_categories(msg.get("enabled_ids", []))}
    if command == "rpi2dmd/brightness/schedule/get":
        stored = await _schedule_store(hass, entry_id).async_load() or {}
        remote = await api.async_get_brightness_schedule()
        stored_points = stored.get("points")
        points = stored_points if isinstance(stored_points, list) else (
            remote.get("points", remote.get("schedule", remote)) if isinstance(remote, Mapping) else remote
        )
        return {"entry_id": entry_id, "schedule": {"enabled": stored.get("enabled", True), "points": points if isinstance(points, list) else []}}
    if command == "rpi2dmd/brightness/schedule/update":
        enabled = bool(msg.get("enabled", True))
        points = msg.get("schedule", [])
        hourly_schedule = _schedule_to_hourly(points)
        await api.async_update_brightness_schedule(hourly_schedule)
        await _schedule_store(hass, entry_id).async_save({"enabled": enabled, "points": points})
        return {"entry_id": entry_id, "schedule": {"enabled": enabled, "points": points}}
    if command == "rpi2dmd/weather/get":
        return {"entry_id": entry_id, "weather": _safe_weather(await api.async_get_weather())}
    if command == "rpi2dmd/weather/update":
        return {"entry_id": entry_id, "weather": _safe_weather(await api.async_update_weather(msg.get("changes", {})))}
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
    except Exception as err:  # pragma: no cover - defensive HA boundary
        _LOGGER.exception("RPI2DMD WebSocket command %s failed", msg.get("type"))
        connection.send_error(msg["id"], "unknown_error", "RPI2DMD command failed")
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
    "rpi2dmd/icons/list",
    "rpi2dmd/icons/get",
    "rpi2dmd/mqtt/get",
    "rpi2dmd/mqtt/update",
    "rpi2dmd/mqtt/test",
    "rpi2dmd/gifs/list",
    "rpi2dmd/gifs/categories",
    "rpi2dmd/gifs/categories/update",
    "rpi2dmd/brightness/schedule/get",
    "rpi2dmd/brightness/schedule/update",
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
