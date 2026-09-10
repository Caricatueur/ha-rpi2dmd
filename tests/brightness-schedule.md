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
points. Complete hourly schedules are sorted and returned as exactly 24 rows from
00:00 to 23:00; malformed/incomplete schedules are rejected. Remote integer values
are preserved without rounding. HA writes retain 0–100 and multiples-of-five
validation. UPDATE requires all 24 distinct integer hours and sends them directly
to the API. The legacy change-point conversion remains tested, but is no longer
used by the panel or coordinator.

The coordinator also reads the schedule on its normal 15-second poll. The number
uses those confirmed hourly rows and the current HA hour, with an hourly callback and
no separate scalar cache. A panel schedule GET or UPDATE immediately notifies
entities. A schedule-only failure makes the number unavailable without disabling
other entities whose /status remains healthy. External changes without a panel
GET become visible on the next successful poll, not through push notifications.

The HA timezone helper follows the configured timezone:
https://github.com/home-assistant/core/blob/dev/homeassistant/util/dt.py

Coverage: stale Store versus remote, all 24 hours, external changes at 14h,
PUT/GET ordering and canonical readback, legacy migration, failures, current-hour
transitions, HA Europe/Paris versus UTC, hour callback registration, entity
notification, slider limits, schedule Save/Apply and existing frontend suites.

Physical acceptance: change the schedule in RPI2DMD Web, open HA brightness and
compare all 24 hourly values; check the number after the next poll, Save,
Apply now, an hour boundary, HA timezone and disconnect/reconnect behavior.
No Raspberry image/FIX4 files are part of this change.

Hourly UI follow-up
------------------

The page renders 24 fixed hour labels and numeric inputs (min 0, max 100, step 5).
There are no add/delete controls or editable hours. Save submits 24 {hour, value}
objects; its response and subsequent GET display API-confirmed values. Apply now
retains the current-hour operation. Offline or missing data disables editing and
both write buttons; absent values are not replaced with invented defaults.

The Chromium regression suite brightness-hourly-dom.test.cjs checks actual rows,
labels, input constraints, external hour-14 changes, Save payload/readback,
firmware normalization, invalid values and offline controls.
