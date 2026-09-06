"""Constants for the RPI2DMD Home Assistant integration."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "rpi2dmd"
NAME: Final = "RPI2DMD"
VERSION: Final = "0.1.0"
DEFAULT_SCAN_INTERVAL: Final = 15
DEFAULT_TIMEOUT: Final = 10
API_PREFIX: Final = "/api/v1"
CONF_HOST: Final = "host"
CONF_TOKEN: Final = "token"

PLATFORMS: Final = ("binary_sensor", "sensor", "switch", "number", "button")

ATTR_INFO: Final = "info"
ATTR_DISPLAY: Final = "display"
ATTR_BRIGHTNESS: Final = "brightness"

SWITCH_FLAGS: Final = {
    "clock": "Heure",
    "date": "Date",
    "weather": "Météo",
    "gif": "GIF",
    "mqtt": "MQTT Display",
}

ERROR_CANNOT_CONNECT: Final = "cannot_connect"
ERROR_INVALID_AUTH: Final = "invalid_auth"
ERROR_UNSUPPORTED_VERSION: Final = "unsupported_version"
ERROR_UNKNOWN: Final = "unknown"
