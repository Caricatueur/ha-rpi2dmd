const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
async function fixture(t){
  const page=await browser.newPage();t.after(()=>page.close());
  await page.addScriptTag({path:path.resolve('custom_components/rpi2dmd/frontend/rpi2dmd-panel.js')});
  await page.evaluate(async()=>{
    const p=window.p=document.createElement('rpi2dmd-panel');document.body.append(p);
    p._entry='one';p._online=true;p._bannerChecked=true;
    window.remote=Array.from({length:24},(_,hour)=>({time:`${String(hour).padStart(2,'0')}:00`,value:hour<8?0:hour===14?25:50}));
    window.calls=[];
    p._hass={callWS:async msg=>{
      calls.push(msg);
      if(msg.type==='rpi2dmd/brightness/schedule/update'){
        remote=msg.schedule.map(r=>({time:`${String(r.hour).padStart(2,'0')}:00`,value:r.value}));
        // Simulate a firmware-confirmed value different from the submitted form.
        remote[15].value=80;
      }
      return {schedule:{enabled:true,points:structuredClone(remote)}};
    }};
    await p._loadSection('brightness');
  });
  return page;
}
test('24 fixed hours, external change at 14h, save full day and render readback',async t=>{
  const page=await fixture(t);
  const rows=page.locator('.schedule-row');assert.equal(await rows.count(),24);
  assert.deepEqual(await page.locator('[data-schedule-hour]').allTextContents(),Array.from({length:24},(_,h)=>`Heure : ${String(h).padStart(2,'0')}:00`));
  assert.equal(await page.locator('[data-schedule-time], [data-action=schedule-add], [data-action=schedule-delete]').count(),0);
  assert.equal(await page.locator('[data-schedule-value][min="0"][max="100"][step="5"]').count(),24);
  await page.evaluate(async()=>{remote[14].value=100;await p._loadSection('brightness');});
  assert.equal(await page.locator('[data-schedule-value="14"]').inputValue(),'100');
  await page.locator('[data-schedule-value="14"]').fill('0');
  await page.locator('[data-schedule-value="23"]').fill('100');
  await page.locator('[data-action=schedule-save]').click();
  await page.waitForFunction(()=>p.shadowRoot.querySelector('[data-schedule-value="15"]').value==='80');
  const calls=await page.evaluate(()=>window.calls);
  const index=calls.findIndex(c=>c.type.endsWith('/update'));
  assert.equal(calls[index].schedule.length,24);
  assert.deepEqual(calls[index].schedule.map(r=>r.hour),Array.from({length:24},(_,h)=>h));
  assert.deepEqual(calls[index].schedule[14],{hour:14,value:0});
  assert.deepEqual(calls[index].schedule[23],{hour:23,value:100});
  assert.equal(calls[index+1].type,'rpi2dmd/brightness/schedule/get');
  assert.equal(await rows.count(),24);
});
test('invalid brightness prevents writes and offline disables all hourly controls',async t=>{
  const page=await fixture(t);
  for(const value of ['42','-5','105','']){
    await page.locator('[data-schedule-value="14"]').fill(value);
    await page.locator('[data-action=schedule-save]').click();
    assert.equal(await page.evaluate(()=>calls.filter(c=>c.type.endsWith('/update')).length),0);
    assert.ok(await page.evaluate(()=>p._featureErrors.brightness));
  }
  await page.evaluate(()=>{p._online=false;p._render();});
  assert.equal(await page.locator('.schedule-row').count(),24);
  assert.equal(await page.locator('[data-schedule-value]:disabled').count(),24);
  assert.ok(await page.locator('[data-action=schedule-save]').isDisabled());
  assert.ok(await page.locator('[data-action=schedule-apply]').isDisabled());
});
