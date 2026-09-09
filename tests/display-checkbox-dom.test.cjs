// Requires Playwright + Chromium; see display-controls.md for the isolated setup.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const flags = ['clock', 'date', 'weather', 'gif', 'mqtt'];
async function fixture(t, initial = true) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addScriptTag({ path: path.resolve(process.env.PANEL_SOURCE || 'custom_components/rpi2dmd/frontend/rpi2dmd-panel.js') });
  await page.evaluate(({ flags, initial }) => {
    const p = window.p = document.createElement('rpi2dmd-panel');
    document.body.append(p);
    p._entry = 'test'; p._online = true; p._section = 'display'; p._bannerChecked = true;
    p._display = { flags: Object.fromEntries(flags.map(f => [f, initial])) };
    window.serverFlags = { ...p._display.flags };
    p._status = { display: { active_flags: initial ? flags : [] } };
    window.calls = []; window.trace = [];
    window.sample = stage => {
      const pending = p._displayWriteState().pending.gif;
      return { stage, confirmed: p._display.flags.gif, optimistic: pending?.value ?? null,
        pending: pending?.value ?? null, logical: p._flag('gif'),
        checked: p.shadowRoot.querySelector('[data-flag=gif]')?.checked ?? null };
    };
    p._hass = { callWS: msg => {
      if (msg.type === 'rpi2dmd/status') return Promise.resolve({ online: true,
        status: { display: { active_flags: flags.filter(f => serverFlags[f]) } } });
      return new Promise((resolve, reject) => calls.push({ msg, resolve, reject, at: Date.now() }));
    } };
    window.finish = (index, fail = false) => {
      const call = calls[index];
      if (fail) call.reject(new Error('simulated write failure'));
      else {
        Object.assign(serverFlags, call.msg.changes.flags);
        call.resolve({ display: { flags: { ...serverFlags } } });
      }
    };
    p._render();
    const render = p._render.bind(p);
    p._render = (...args) => {
      trace.push(sample('B before render'));
      const start = performance.now(); render(...args);
      trace.push({ ...sample('C after render'), duration: performance.now() - start });
    };
    // Capture the actual currentTarget, not a synthetic event or a markup string.
    window.bindProbe = flag => {
      const input = p.shadowRoot.querySelector(`[data-flag=${flag}]`);
      window.clickedInput = input;
      const change = input.onchange;
      input.onchange = event => {
        trace.push({ ...sample('B change entry'), currentTargetChecked: event.currentTarget.checked });
        change(event);
        window.immediate = { logical: p._flag(flag), checked: p.shadowRoot.querySelector(`[data-flag=${flag}]`).checked,
          sameNode: input === p.shadowRoot.querySelector(`[data-flag=${flag}]`),
          currentTargetChecked: event.currentTarget.checked };
      };
    };
    trace.push(sample('A before click'));
  }, { flags, initial });
  return page;
}
async function check(page, flag, wanted) {
  const state = await page.evaluate(flag => ({ logical: p._flag(flag),
    checked: p.shadowRoot.querySelector(`[data-flag=${flag}]`).checked }), flag);
  assert.equal(state.logical, wanted, `${flag} logical value`);
  assert.equal(state.checked, wanted, `${flag} DOM checked property`);
}
for (const flag of flags) for (const initial of [true, false]) {
  test(`${flag} ${initial} → ${!initial}: trusted click updates live DOM synchronously`, async t => {
    const page = await fixture(t, initial);
    await page.evaluate(flag => bindProbe(flag), flag);
    await page.locator(`[data-flag=${flag}]`).click();
    const immediate = await page.evaluate(() => immediate);
    assert.deepEqual(immediate, { logical: !initial, checked: !initial, sameNode: true, currentTargetChecked: !initial });
    const state = await page.evaluate(flag => ({ confirmed: p._display.flags[flag], pending: p._displayWriteState().pending[flag].value }), flag);
    assert.deepEqual(state, { confirmed: initial, pending: !initial });
    await page.evaluate(() => p._refreshStatus()); // Old coordinator state while pending.
    await check(page, flag, !initial);
    await page.waitForFunction(() => calls.length === 1);
    await page.evaluate(() => finish(0));
    await page.waitForFunction(flag => !p._displayWriteState().pending[flag], flag);
    await check(page, flag, !initial);
    assert.equal(await page.evaluate(flag => p._display.flags[flag], flag), !initial);
  });
}
test('GIF remains OFF for ten seconds without any second interaction; records A–E trace', async t => {
  const page = await fixture(t);
  await page.evaluate(() => bindProbe('gif'));
  await page.locator('[data-flag=gif]').click();
  await check(page, 'gif', false); // T+0, response deliberately held for ten seconds.
  for (const delay of [1000, 4000, 5000]) {
    await new Promise(resolve => setTimeout(resolve, delay));
    await check(page, 'gif', false); // Only reads, no render/slider/navigation.
  }
  await page.evaluate(() => { trace.push(sample('T+10')); finish(0); });
  await page.waitForFunction(() => !p._displayWriteState().pending.gif);
  await page.evaluate(async () => { trace.push(sample('D success')); await p._refreshStatus(); trace.push(sample('E coordinator')); });
  const trace = await page.evaluate(() => trace);
  for (const row of trace.filter(row => row.logical === false)) assert.equal(row.checked, false);
  assert.ok(trace.filter(row => row.stage === 'C after render').every(row => row.duration < 100));
  t.diagnostic(JSON.stringify(trace));
});
test('five rapid OFF clicks: five DOM properties false, one transaction', async t => {
  const page = await fixture(t);
  for (const flag of flags) {
    await page.locator(`[data-flag=${flag}]`).click();
    await check(page, flag, false);
  }
  await page.waitForFunction(() => calls.length > 0);
  assert.deepEqual(await page.evaluate(() => calls.map(c => c.msg.changes.flags)), [Object.fromEntries(flags.map(f => [f, false]))]);
  await page.evaluate(() => finish(0));
  await page.waitForFunction(() => Object.keys(p._displayWriteState().pending).length === 0);
  for (const flag of flags) await check(page, flag, false);
});
test('failure immediately restores DOM and displays local error; retry also works', async t => {
  const page = await fixture(t);
  await page.locator('[data-flag=gif]').click();
  await page.waitForFunction(() => calls.length === 1);
  await page.evaluate(() => finish(0, true));
  await page.waitForFunction(() => !p._displayWriteState().pending.gif);
  await check(page, 'gif', true);
  assert.equal(await page.evaluate(() => !!p._error), false);
  assert.match(await page.locator('[role=alert]').innerText(), /Impossible de modifier GIF/);
  await page.locator('[data-flag=gif]').click();
  await check(page, 'gif', false);
  assert.equal(await page.locator('[role=alert]').count(), 0);
});
test('label click and Space activation work without replacing the focused input', async t => {
  const page = await fixture(t);
  await page.evaluate(() => bindProbe('gif'));
  await page.locator('label.toggle').filter({ hasText: /^\s*GIF\s*$/ }).click();
  await check(page, 'gif', false);
  assert.equal(await page.evaluate(() => immediate.sameNode), true);
  await page.locator('[data-flag=gif]').focus();
  await page.keyboard.press('Space');
  await check(page, 'gif', true);
  assert.equal(await page.evaluate(() => p.shadowRoot.activeElement === clickedInput), true);
});
