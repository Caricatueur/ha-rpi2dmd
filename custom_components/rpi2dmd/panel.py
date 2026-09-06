"""Sidebar panel registration for the RPI2DMD integration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

PANEL_PATH = "/rpi2dmd-panel.js"
LOGO_PATH = "/rpi2dmd-assets/rpi2dmd-ha-logo.png"
PANEL_URL = "rpi2dmd"


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the static Web Component and one sidebar panel."""
    if hass.data.get("rpi2dmd_panel_registered"):
        return
    js_path = str(Path(__file__).parent / "frontend" / "rpi2dmd-panel.js")
    logo_path = str(Path(__file__).parent / "frontend" / "assets" / "rpi2dmd-ha-logo.png")
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(PANEL_PATH, js_path, False),
            StaticPathConfig(LOGO_PATH, logo_path, False),
        ]
    )
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="rpi2dmd-panel",
        frontend_url_path=PANEL_URL,
        sidebar_title="RPI2DMD",
        sidebar_icon="mdi:led-strip-variant",
        module_url=PANEL_PATH,
        require_admin=False,
        config={},
        config_panel_domain="rpi2dmd",
    )
    hass.data["rpi2dmd_panel_registered"] = True


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the sidebar panel when the last entry is unloaded."""
    if not hass.data.get("rpi2dmd_panel_registered"):
        return
    frontend.async_remove_panel(hass, PANEL_URL)
    hass.data.pop("rpi2dmd_panel_registered", None)
