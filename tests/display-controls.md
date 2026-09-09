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
