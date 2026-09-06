# RPI2DMD Home Assistant Integration

Native Home Assistant integration for the local RPI2DMD V2.8 REST API.

## HA-3 initial version

This development version provides:

- Config Flow using the RPI2DMD address and API token;
- one RPI2DMD device with shared 15-second status polling;
- Display and MQTT connection diagnostics;
- Raspberry temperature, uptime and current screen;
- undervoltage/throttling diagnostics;
- brightness control;
- Clock, Date, Weather, GIF and MQTT Display switches;
- a safe refresh-state button;
- playlist/config export/import client methods for the future panel.

RPI2DMD V2.8 API is required. The integration talks to the Apache public API
at `http://HOST/api/v1/`; it never contacts the loopback port 8765 directly.

No token, password, personal IP or credential is included in this repository.

## RPI2DMD Panel

Version 0.2.0 adds one `RPI2DMD` application to the Home Assistant sidebar.
The browser communicates exclusively with the Home Assistant backend through
WebSocket commands; it never contacts the Raspberry Pi and never receives the
RPI2DMD API token or an MQTT password.

The panel contains these internal sections:

- Dashboard
- Display
- Playlist
- MQTT
- GIF
- Weather
- System
- Backup

Playlist editing, MQTT configuration, GIF metadata and configuration
export/import use the already validated RPI2DMD API routes through the existing
integration client. The panel is a native dependency-free Web Component and
requires no Node.js or frontend build step.
