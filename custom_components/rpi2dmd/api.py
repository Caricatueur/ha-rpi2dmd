"""Async client for the public RPI2DMD API."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote

from aiohttp import ClientError, ClientSession

from .const import API_PREFIX, DEFAULT_TIMEOUT

_LOGGER = logging.getLogger(__name__)


class RPI2DMDError(Exception):
    """Base API error."""


class RPI2DMDConnectionError(RPI2DMDError):
    """The device could not be reached."""


class RPI2DMDAuthError(RPI2DMDError):
    """The API rejected authentication."""


class RPI2DMDHTTPError(RPI2DMDError):
    """The API returned a non-success response."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


class RPI2DMDClient:
    """Small aiohttp-only client; it never contacts the loopback API port."""

    def __init__(
        self,
        session: ClientSession,
        host: str,
        token: str,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self._session = session
        self.host = host.strip().rstrip("/")
        self.token = token
        self.timeout = timeout

    @property
    def base_url(self) -> str:
        return f"http://{self.host}{API_PREFIX}"

    async def _request(
        self,
        method: str,
        path: str,
        *,
        body: Mapping[str, Any] | None = None,
        params: Mapping[str, str] | None = None,
        authenticated: bool = True,
    ) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        if authenticated:
            headers["Authorization"] = f"Bearer {self.token}"
        if body is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"
        gif_debug = path.startswith("/gifs")
        started = time.monotonic()
        try:
            async with asyncio.timeout(self.timeout):
                async with self._session.request(
                    method,
                    f"{self.base_url}{path}",
                    headers=headers,
                    params=params,
                    json=body,
                ) as response:
                    if response.status in (401, 403):
                        if gif_debug:
                            _LOGGER.debug("GIF DEBUG request=%s endpoint=%s status=%s duration=%.2fs failure=auth", method, path, response.status, time.monotonic() - started)
                        raise RPI2DMDAuthError("API authentication rejected")
                    if response.status >= 400:
                        if gif_debug:
                            _LOGGER.debug("GIF DEBUG request=%s endpoint=%s status=%s duration=%.2fs failure=http", method, path, response.status, time.monotonic() - started)
                        try:
                            payload = await response.json(content_type=None)
                            message = payload.get("error", {}).get("message", "API error")
                        except (ValueError, TypeError):
                            message = "API error"
                        raise RPI2DMDHTTPError(response.status, str(message))
                    # Mutation endpoints may legitimately return 204 (or an
                    # empty 200/201 body). Do not require JSON when the HTTP
                    # contract intentionally has no response document.
                    raw = await response.read()
                    if not raw.strip():
                        if gif_debug:
                            _LOGGER.debug("GIF DEBUG request=%s endpoint=%s status=%s duration=%.2fs response=empty", method, path, response.status, time.monotonic() - started)
                        return {}
                    try:
                        payload = json.loads(raw.decode(response.charset or "utf-8"))
                    except (UnicodeDecodeError, ValueError, TypeError) as err:
                        if gif_debug:
                            _LOGGER.debug("GIF DEBUG request=%s endpoint=%s status=%s duration=%.2fs failure=invalid_json error=%s", method, path, response.status, time.monotonic() - started, type(err).__name__)
                        raise RPI2DMDError("Invalid JSON response") from err
                    if not isinstance(payload, dict) or payload.get("ok") is not True:
                        if gif_debug:
                            _LOGGER.debug("GIF DEBUG request=%s endpoint=%s status=%s duration=%.2fs failure=malformed_json", method, path, response.status, time.monotonic() - started)
                        raise RPI2DMDError("Malformed API response")
                    data = payload.get("data")
                    result = data if isinstance(data, dict) else {}
                    if gif_debug:
                        count = result.get("total", result.get("count"))
                        if count is None:
                            values = result.get("categories", result.get("items"))
                            count = len(values) if isinstance(values, list) else None
                        _LOGGER.debug("GIF DEBUG request=%s endpoint=%s status=%s duration=%.2fs response=dict count=%s", method, path, response.status, time.monotonic() - started, count)
                    return result
        except RPI2DMDError:
            raise
        except (asyncio.TimeoutError, ClientError, OSError) as err:
            if gif_debug:
                _LOGGER.debug("GIF DEBUG request=%s endpoint=%s duration=%.2fs failure=%s", method, path, time.monotonic() - started, type(err).__name__)
            raise RPI2DMDConnectionError("Unable to connect to RPI2DMD") from err

    async def async_get_info(self) -> dict[str, Any]:
        return await self._request("GET", "/info", authenticated=False)

    async def async_get_status(self) -> dict[str, Any]:
        return await self._request("GET", "/status")

    async def async_get_system(self) -> dict[str, Any]:
        return await self._request("GET", "/system")

    async def async_get_display(self) -> dict[str, Any]:
        return await self._request("GET", "/display")

    async def async_update_display(self, changes: Mapping[str, Any]) -> dict[str, Any]:
        return await self._request("PUT", "/display", body=changes)

    async def async_get_brightness_schedule(self) -> dict[str, Any]:
        return await self._request("GET", "/display/brightness-schedule")

    async def async_update_brightness_schedule(self, schedule: list[Mapping[str, Any]]) -> dict[str, Any]:
        return await self._request("PUT", "/display/brightness-schedule", body={"schedule": schedule})

    async def async_get_clock(self) -> dict[str, Any]:
        return await self._request("GET", "/clock")

    async def async_update_clock(self, changes: Mapping[str, Any]) -> dict[str, Any]:
        return await self._request("PUT", "/clock", body=changes)

    async def async_get_date(self) -> dict[str, Any]:
        return await self._request("GET", "/date")

    async def async_update_date(self, changes: Mapping[str, Any]) -> dict[str, Any]:
        return await self._request("PUT", "/date", body=changes)

    async def async_get_weather(self) -> dict[str, Any]:
        return await self._request("GET", "/weather")

    async def async_update_weather(self, changes: Mapping[str, Any]) -> dict[str, Any]:
        return await self._request("PUT", "/weather", body=changes)

    async def async_get_network(self) -> dict[str, Any]:
        return await self._request("GET", "/network")

    async def async_update_network(self, changes: Mapping[str, Any]) -> dict[str, Any]:
        return await self._request("PUT", "/network", body=changes)

    async def async_get_mqtt(self) -> dict[str, Any]:
        return await self._request("GET", "/mqtt")

    async def async_update_mqtt(self, changes: Mapping[str, Any]) -> dict[str, Any]:
        return await self._request("PUT", "/mqtt", body=changes)

    async def async_get_mqtt_status(self) -> dict[str, Any]:
        return await self._request("GET", "/mqtt/status")

    async def async_get_playlist(self) -> dict[str, Any]:
        return await self._request("GET", "/playlist")

    async def async_add_playlist_item(self, item: Mapping[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "/playlist/items", body=item)

    async def async_update_playlist_item(self, item_id: str, changes: Mapping[str, Any]) -> dict[str, Any]:
        return await self._request("PUT", f"/playlist/items/{item_id}", body=changes)

    async def async_delete_playlist_item(self, item_id: str) -> dict[str, Any]:
        return await self._request("DELETE", f"/playlist/items/{item_id}")

    async def async_move_playlist_item(self, item_id: str, index: int) -> dict[str, Any]:
        return await self._request("POST", f"/playlist/items/{item_id}/move", body={"index": index})

    async def async_duplicate_playlist_item(self, item_id: str, after_id: str | None = None) -> dict[str, Any]:
        body = {} if after_id is None else {"after_id": after_id}
        return await self._request("POST", f"/playlist/items/{item_id}/duplicate", body=body)

    async def async_get_gif_categories(self) -> dict[str, Any]:
        return await self._request("GET", "/gifs/categories")

    async def async_update_gif_categories(self, enabled_ids: list[str]) -> dict[str, Any]:
        return await self._request("PUT", "/gifs/categories", body={"enabled_ids": enabled_ids})

    async def async_get_gifs(self, *, category: str | None = None, search: str | None = None, limit: int = 50, offset: int = 0) -> dict[str, Any]:
        params: dict[str, str] = {"limit": str(limit), "offset": str(offset)}
        if category:
            params["category"] = category
        if search:
            params["search"] = search
        return await self._request("GET", "/gifs", params=params)

    async def async_get_fonts(self) -> dict[str, Any]:
        return await self._request("GET", "/fonts")

    async def async_get_icons(self, *, search: str | None = None, category: str | None = None, limit: int = 50, offset: int = 0) -> dict[str, Any]:
        params: dict[str, str] = {"limit": str(limit), "offset": str(offset)}
        if search:
            params["search"] = search
        if category:
            params["category"] = category
        return await self._request("GET", "/icons", params=params)

    async def async_get_icon(self, icon_id: str) -> dict[str, str]:
        """Return one validated PNG as an HA-safe data payload.

        The browser never receives the Raspberry URL or API authorization;
        the image is fetched through the existing authenticated client.
        """
        safe_id = quote(str(icon_id), safe="")
        try:
            async with asyncio.timeout(self.timeout):
                async with self._session.request(
                    "GET",
                    f"{self.base_url}/icons/{safe_id}",
                    headers={"Accept": "image/png", "Authorization": f"Bearer {self.token}"},
                ) as response:
                    if response.status in (401, 403):
                        raise RPI2DMDAuthError("API authentication rejected")
                    if response.status >= 400:
                        raise RPI2DMDHTTPError(response.status, "Icon asset unavailable")
                    content_type = response.headers.get("Content-Type", "image/png").split(";", 1)[0].lower()
                    if content_type != "image/png":
                        raise RPI2DMDError("Icon asset is not a PNG")
                    data = await response.read()
                    if not data:
                        raise RPI2DMDError("Icon asset is empty")
                    return {"content_type": "image/png", "data": base64.b64encode(data).decode("ascii")}
        except RPI2DMDError:
            raise
        except (asyncio.TimeoutError, ClientError, OSError) as err:
            raise RPI2DMDConnectionError("Unable to connect to RPI2DMD") from err

    async def async_pause(self) -> dict[str, Any]:
        return await self._request("POST", "/display/pause", body={})

    async def async_resume(self) -> dict[str, Any]:
        return await self._request("POST", "/display/resume", body={})

    async def async_display_test(self, body: Mapping[str, Any] | None = None) -> dict[str, Any]:
        return await self._request("POST", "/display/test", body=body)

    async def async_test_mqtt(self, body: Mapping[str, Any] | None = None) -> dict[str, Any]:
        return await self._request("POST", "/mqtt/test", body=body)

    async def async_get_config_export(self) -> dict[str, Any]:
        return await self._request("GET", "/config/export")

    async def async_validate_import(self, document: Mapping[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "/config/import/validate", body={"document": document})

    async def async_import_config(self, validation_token: str) -> dict[str, Any]:
        return await self._request("POST", "/config/import", body={"validation_token": validation_token, "confirm": True})
