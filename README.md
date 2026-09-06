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
