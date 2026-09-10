Brightness source-of-truth regression
====================================

Python 3.12 setup and checks:

```sh
python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
.venv/bin/python -m pytest -q tests
python3 -m compileall -q custom_components tests
node --check custom_components/rpi2dmd/frontend/rpi2dmd-panel.js
NODE_PATH=/tmp/rpi2dmd-dom-test/node_modules node --test tests/*.test.cjs
git diff --check
```

See display-controls.md for the isolated Playwright/Chromium setup. These tests
use real Home Assistant 2024.12.5 classes/helpers and a simulated Raspberry API;
they do not run a physical HA installation or write to a Raspberry.

GET always reads /display/brightness-schedule. The legacy Store's points are
ignored; UPDATE replaces the Store with enabled only, after PUT and successful
GET confirmation. Read failures propagate instead of falling back to local
points. Complete hourly schedules are sorted and compressed with a mandatory
00:00 point; malformed/incomplete schedules are rejected. Remote integer values
are preserved without rounding. HA writes retain 0–100 and multiples-of-five
validation, including cyclic expansion before the first submitted point.

The coordinator also reads the schedule on its normal 15-second poll. The number
uses those confirmed points and the current HA hour, with an hourly callback and
no separate scalar cache. A panel schedule GET or UPDATE immediately notifies
entities. A schedule-only failure makes the number unavailable without disabling
other entities whose /status remains healthy. External changes without a panel
GET become visible on the next successful poll, not through push notifications.

The HA timezone helper follows the configured timezone:
https://github.com/home-assistant/core/blob/dev/homeassistant/util/dt.py

Coverage: stale Store versus remote, compression example, external changes,
PUT/GET ordering and canonical readback, legacy migration, failures, current-hour
transitions, HA Europe/Paris versus UTC, hour callback registration, entity
notification, slider limits, schedule Save/Apply and existing frontend suites.

Physical acceptance: change the schedule in RPI2DMD Web, open HA brightness and
compare the five expected points; check the number after the next poll, Save,
Apply now, an hour boundary, HA timezone and disconnect/reconnect behavior.
No Raspberry image/FIX4 files are part of this change.
