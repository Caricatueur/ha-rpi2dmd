"""Panel asset URL, cache policy and frontend version consistency."""
import json
from pathlib import Path
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from custom_components.rpi2dmd import panel
from custom_components.rpi2dmd.const import VERSION


@pytest.mark.asyncio
async def test_panel_uses_versioned_module_and_original_static_path():
    hass = SimpleNamespace(data={}, http=SimpleNamespace(async_register_static_paths=AsyncMock()))
    with patch.object(panel.panel_custom, 'async_register_panel', new_callable=AsyncMock) as register:
        await panel.async_register_panel(hass)
        assert register.call_args.kwargs['module_url'] == f'/rpi2dmd-panel.js?v={VERSION}'
        assert register.call_args.kwargs['module_url'] == '/rpi2dmd-panel.js?v=0.4.5'
        paths = hass.http.async_register_static_paths.call_args.args[0]
        assert len(paths) == 4
        js = paths[0]
        assert js.url_path == '/rpi2dmd-panel.js'
        assert Path(js.path) == Path(panel.__file__).parent / 'frontend' / 'rpi2dmd-panel.js'
        assert all(config.cache_headers is False for config in paths)
        await panel.async_register_panel(hass)
        register.assert_awaited_once()
        hass.http.async_register_static_paths.assert_awaited_once()


def test_frontend_version_matches_integration_and_manifest():
    root = Path(panel.__file__).parent
    manifest = json.loads((root / 'manifest.json').read_text())
    js = (root / 'frontend' / 'rpi2dmd-panel.js').read_text()
    version = re.search(r'const FRONTEND_VERSION = "([^"]+)";', js).group(1)
    assert version == VERSION == manifest['version'] == '0.4.5'


@pytest.mark.asyncio
async def test_module_url_tracks_version_constant():
    hass = SimpleNamespace(data={}, http=SimpleNamespace(async_register_static_paths=AsyncMock()))
    with patch.object(panel, 'VERSION', '9.9.9'), \
         patch.object(panel.panel_custom, 'async_register_panel', new_callable=AsyncMock) as register:
        await panel.async_register_panel(hass)
    assert register.call_args.kwargs['module_url'] == '/rpi2dmd-panel.js?v=9.9.9'
    assert hass.http.async_register_static_paths.call_args.args[0][0].url_path == '/rpi2dmd-panel.js'
