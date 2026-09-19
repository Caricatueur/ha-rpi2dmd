"""Async client for the public RPI2DMD API."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import time
from ipaddress import IPv6Address
from collections.abc import Awaitable, Callable, Mapping
from typing import Any
from urllib.parse import quote

from aiohttp import ClientError, ClientSession

from .const import API_PREFIX, DEFAULT_TIMEOUT

_LOGGER = logging.getLogger(__name__)


class RPI2DMDError(Exception):
    """Base API error."""


class RPI2DMDConnectionError(RPI2DMDError):
    """The device could not be reached."""


class RPI2DMDTimeoutError(RPI2DMDConnectionError):
    """The request exceeded its time limit."""


class RPI2DMDAuthError(RPI2DMDError):
    """The API rejected authentication."""


class RPI2DMDPairingError(RPI2DMDError):
    """A fixed, non-sensitive config-flow error key."""


class RPI2DMDHTTPError(RPI2DMDError):
    """The API returned a non-success response."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


async def async_retry_busy(
    operation: Callable[[], Awaitable[dict[str, Any]]],
    *,
    attempts: int,
    delay: float,
    is_busy: Callable[[RPI2DMDHTTPError], bool],
) -> dict[str, Any]:
    """Retry only confirmed busy HTTP responses, after closing each request."""
    for attempt in range(attempts):
        try:
            return await operation()
        except RPI2DMDHTTPError as err:
            if not is_busy(err) or attempt == attempts - 1:
                raise
            await asyncio.sleep(delay)
    raise ValueError("At least one attempt is required")


def normalize_host(host: str, port: int | None = None) -> str:
    """Return an HTTP authority, accepting historical hosts and bare IPv6."""
    value = str(host).strip().rstrip("/")
    explicit_port = None
    try:
        if value.startswith("["):
            match = re.fullmatch(r"\[([^\]]+)\](?::([0-9]+))?", value)
            if not match:
                raise ValueError
            address, explicit_port = match.groups()
            IPv6Address(address)
            authority = f"[{address}]"
        elif value.count(":") > 1:
            IPv6Address(value)
            authority = f"[{value}]"
        else:
            match = re.fullmatch(r"([A-Za-z0-9.-]+)(?::([0-9]+))?", value)
            if not match:
                raise ValueError
            authority, explicit_port = match.groups()
        selected_port = port if port is not None else explicit_port
        if selected_port is not None:
            selected_port = int(selected_port)
            if not 1 <= selected_port <= 65535:
                raise ValueError
            if selected_port != 80:
                authority += f":{selected_port}"
        return authority
    except (TypeError, ValueError):
        raise RPI2DMDConnectionError("Invalid RPI2DMD address") from None


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
        self.host = normalize_host(host)
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
                            error = payload.get("error") if isinstance(payload, dict) else None
                            message = error.get("message", "API error") if isinstance(error, dict) else "API error"
                        except (ValueError, TypeError):
                            message = "API error"
                        message = message if isinstance(message, str) else "API error"
                        if self.token:
                            message = message.replace(self.token, "[redacted]")
                        raise RPI2DMDHTTPError(response.status, message)
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
        except asyncio.TimeoutError:
            raise RPI2DMDTimeoutError("RPI2DMD request timed out") from None
        except (ClientError, OSError) as err:
            if gif_debug:
                _LOGGER.debug("GIF DEBUG request=%s endpoint=%s duration=%.2fs failure=%s", method, path, time.monotonic() - started, type(err).__name__)
            raise RPI2DMDConnectionError("Unable to connect to RPI2DMD") from err

    async def async_get_info(self) -> dict[str, Any]:
        return await self._request("GET", "/info", authenticated=False)

    async def async_pair(self, code: str) -> str:
        """Exchange a temporary code without logging or forwarding response errors."""
        try:
            async with asyncio.timeout(self.timeout):
                async with self._session.get(
                    f"{self.base_url}/pair/status", allow_redirects=False
                ) as response:
                    if response.status == 429:
                        raise RPI2DMDPairingError("pairing_rate_limited")
                    if response.status >= 500:
                        raise RPI2DMDPairingError("pairing_unavailable")
                    if response.status != 200:
                        raise RPI2DMDPairingError("pairing_inactive")
                    state = await response.json()
                    if not isinstance(state, dict) or not state.get("pairing_active"):
                        raise RPI2DMDPairingError("pairing_inactive")
                async with self._session.post(
                    f"{self.base_url}/pair/exchange", json={"code": code},
                    allow_redirects=False,
                ) as response:
                    if response.status == 429:
                        raise RPI2DMDPairingError("pairing_rate_limited")
                    if response.status >= 500:
                        raise RPI2DMDPairingError("pairing_unavailable")
                    if response.status == 410:
                        raise RPI2DMDPairingError("pairing_expired")
                    if response.status != 200:
                        raise RPI2DMDPairingError("invalid_pairing_code")
                    payload = await response.json()
                    token = payload.get("token") if isinstance(payload, dict) else None
                    if payload.get("success") is not True or not isinstance(token, str) or not 32 <= len(token) <= 512 or not token.isascii() or any(c.isspace() for c in token):
                        raise RPI2DMDPairingError("invalid_pairing_response")
                    return token
        except RPI2DMDPairingError:
            raise
        except TimeoutError:
            raise RPI2DMDPairingError("pairing_timeout") from None
        except (ClientError, OSError):
            raise RPI2DMDPairingError("cannot_connect") from None
        except (ValueError, TypeError, AttributeError):
            raise RPI2DMDPairingError("invalid_pairing_response") from None

    async def async_start_pairing(self) -> None:
        """Request the physical display only; never receive the six digits."""
        try:
            async with asyncio.timeout(self.timeout):
                async with self._session.get(f"{self.base_url}/pair/status", allow_redirects=False) as response:
                    if response.status == 429:
                        raise RPI2DMDPairingError("pairing_rate_limited")
                    if response.status >= 500:
                        raise RPI2DMDPairingError("pairing_unavailable")
                    if response.status == 200:
                        state = await response.json()
                        if isinstance(state, dict) and state.get("pairing_active") is True:
                            return  # Reuse a physical code already requested from the Web.
                async with self._session.post(f"{self.base_url}/pair/start", json={}, allow_redirects=False) as response:
                    if response.status == 429:
                        raise RPI2DMDPairingError("pairing_rate_limited")
                    if response.status != 200:
                        raise RPI2DMDPairingError("pairing_unavailable")
                    payload = await response.json()
                    if not isinstance(payload, dict) or payload.get("success") is not True or payload.get("pairing_active") is not True:
                        raise RPI2DMDPairingError("pairing_unavailable")
        except RPI2DMDPairingError:
            raise
        except TimeoutError:
            raise RPI2DMDPairingError("pairing_timeout") from None
        except (ClientError, OSError):
            raise RPI2DMDPairingError("cannot_connect") from None
        except (ValueError, TypeError):
            raise RPI2DMDPairingError("pairing_unavailable") from None

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

    async def _playlist_write(
        self, method: str, path: str, *, body: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        # Never replay a POST after an ambiguous timeout/connection failure.
        return await async_retry_busy(
            lambda: self._request(method, path, body=body),
            attempts=3, delay=1.0, is_busy=lambda err: err.status == 409,
        )

    async def async_add_playlist_item(self, item: Mapping[str, Any]) -> dict[str, Any]:
        return await self._playlist_write("POST", "/playlist/items", body=item)

    async def async_update_playlist_item(self, item_id: str, changes: Mapping[str, Any]) -> dict[str, Any]:
        return await self._playlist_write("PUT", f"/playlist/items/{item_id}", body=changes)

    async def async_delete_playlist_item(self, item_id: str) -> dict[str, Any]:
        return await self._playlist_write("DELETE", f"/playlist/items/{item_id}")

    async def async_move_playlist_item(self, item_id: str, index: int) -> dict[str, Any]:
        return await self._playlist_write("POST", f"/playlist/items/{item_id}/move", body={"index": index})

    async def async_duplicate_playlist_item(self, item_id: str, after_id: str | None = None) -> dict[str, Any]:
        body = {} if after_id is None else {"after_id": after_id}
        return await self._playlist_write("POST", f"/playlist/items/{item_id}/duplicate", body=body)

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
