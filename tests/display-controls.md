Display controls regression checks
==================================

Run `node --test tests/display-controls.test.cjs` (Node 24 or newer).
The tests use a controlled clock and delayed WebSocket responses, including
failures. They exercise the actual panel methods, generated checkbox markup,
bound handlers, slider input and the existing write queue. They do not measure
browser paint latency or contact a physical device.

Contract audit: the local API extraction at
`/home/nuc/rpi2dmd-audit/.ha5-gif-integration/api-extracted.py`
contains `validate_display`, which passes the flags object to `validate_flags`.
That validator accepts multiple boolean flag entries. `put_display` applies all
validated changes with one `cfg.commit_display` call and returns the display
view. The HA bridge passes `changes` unchanged to `PUT /display` and requests a
coordinator refresh. The existing flag names are clock/date/weather/gif/mqtt.
No Raspberry Pi files were changed or remote writes performed for this audit.

Every click renders immediately. A 250 ms trailing debounce groups changes;
additional intentions replace values by key until the serialized write slot
opens. Five clicks 100 ms apart produce one flags transaction. Clicks separated
by more than the debounce can produce multiple transactions, always serialized.
A write already sent cannot be replaced: subsequent intentions form the next
batch. They retain visual priority over the earlier response. A successful
response advances the rollback baseline for later intentions. Failed writes
restore that baseline and show a Display error without setting the global error.

Pending state is per device. Explicit confirmed false values take priority over
status active_flags, and display GET responses started before a mutation's
completion are discarded. Slider input keeps a local draft and updates the value
and fill without a write; change commits through the same optimistic queue.

Live retest: verify actual browser paint (<100 ms), the five controls in both
directions, rapid clicks, slider dragging, and final coordinator state on the
physical device. Automated timing assertions cover synchronous DOM generation,
not rendering on Home Assistant hardware.

Checkbox DOM follow-up (ha5-checkbox-render-fix)
------------------------------------------------

The previous tests primarily inspected generated HTML, not native DOM properties.
The additional suite runs the actual custom element in Chromium with trusted
mouse/keyboard events and controlled WebSocket responses. Install its test-only
dependency outside the repository:

```sh
npm install --prefix /tmp/rpi2dmd-dom-test playwright@1.63.0
/tmp/rpi2dmd-dom-test/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/rpi2dmd-dom-test/node_modules node --test tests/display-checkbox-dom.test.cjs
```

Chromium also needs its usual platform shared libraries. In this validation
environment missing libnspr4/libnss3 packages were downloaded and extracted under
`/tmp/rpi2dmd-dom-test/libs`, without changing system packages or the Raspberry.
The invocation additionally used
`LD_LIBRARY_PATH=/tmp/rpi2dmd-dom-test/libs/usr/lib/x86_64-linux-gnu`.

Diagnosis before correction:

- Engine: HTMLElement + shadow DOM, custom `_render()` assigning full `innerHTML`.
- `_updateDisplay` already calls `_render()` synchronously for both booleans.
- Pending is an object whose `value` may be false; its presence check is valid.
  The confirmed fallback uses an explicit boolean type check, and `??` preserves
  false. The generated `checked` attribute is included only for true.
- Chromium did NOT reproduce logical=false with DOM checked=true on 3e3e6a1.
  Therefore the exact cause of the reported physical visual lag and its
  ON→OFF asymmetry is still unconfirmed; neither a false fallback nor a missing
  render was demonstrated. Browser paint or the actual loaded frontend version
  cannot be established from this isolated test.
- The reproducible issue is destruction of the activated checkbox by full
  shadow DOM replacement. The node-identity regression test fails on 3e3e6a1
  (`sameNode=false`) and passes after the change. This establishes the narrower
  rendering correction, not proof of the physical symptom's cause.

The correction reads `event.currentTarget.checked` and asks `_render` to update
Display checkbox properties in place on flag-only changes. No microtask, timer,
API response or other interaction is required. Full rendering remains available
for page changes, success, rollback, and clearing a visible error. No slider,
queue, debounce, coalescing, rate-limit or Raspberry code changed.

The slider's input handler updates its own output/fill directly. Its change
handler calls `_updateDisplay`, triggering a full render. That full render could
expose an already updated checkbox state in the reported environment, but the
previous checkbox handler also triggered a full render, so this observation
alone does not establish missing invalidation.

Observed GIF trace (before correction and after correction both have these
logical/DOM values; only node preservation differs):

| Stage | Confirmed | Optimistic | Pending | Computed | DOM checked | currentTarget.checked |
|---|---|---|---|---|---|---|
| A before click | true | absent | absent | true | true | — |
| B change entry, before local update | true | absent | absent | true | false | false |
| B state updated, before render | true | false | false | false | false | — |
| C after render | true | false | false | false | false | — |
| D WebSocket success | false | absent | absent | false | false | — |
| E coordinator refresh | false | absent | absent | false | false | — |

There is no observed stage with logical=false and checked=true. The suite prints
its detailed trace, including render duration. After the correction the measured
optimistic render in the ten-second test took about 0.1 ms. This measures DOM
update, not physical display paint latency.

Results: 14 browser tests pass, including independent ON→OFF and OFF→ON for all
five flags, stale coordinator data, success, failure/visible local error, retry,
label activation, Space/focus preservation, five rapid OFF clicks in one write,
and a real ten-second wait with only read-only checks at T+0/1/5/10. The existing
13 tests also pass, including serialization/rate limiting and slider behavior.
The ten-second test deliberately holds the API response until after T+10.
A physical retest is still required to confirm the reported visual symptom.
