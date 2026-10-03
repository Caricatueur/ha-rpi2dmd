const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
const flags=['clock','date','weather','gif','mqtt'];
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
async function fixture(t,initial){
 const page=await browser.newPage();t.after(()=>page.close());
 await page.addScriptTag({path:path.resolve(process.env.PANEL_SOURCE||'custom_components/rpi2dmd/frontend/rpi2dmd-panel.js')});
 await page.evaluate(({flags,initial})=>{
  window.p=document.createElement('rpi2dmd-panel');document.body.append(p);
  p._entry='one';p._online=true;p._bannerChecked=true;
  window.raspberry=Object.fromEntries(flags.map(f=>[f,initial]));
  window.coordinator={...raspberry};window.writes=[];
  // A stale visual state is replaced by the initial status read, not copied into a command.
  p._status={display:{active_flags:initial?[]:flags}};
  p._hass={callWS:msg=>{
   if(msg.type==='rpi2dmd/status')return Promise.resolve({online:true,status:{display:{active_flags:flags.filter(f=>coordinator[f])}}});
   if(msg.type==='rpi2dmd/display/get')return Promise.resolve({display:{flags:{...raspberry}}});
   if(msg.type==='rpi2dmd/display/update')return new Promise((resolve,reject)=>writes.push({msg,resolve,reject}));
   throw Error('Unexpected command '+msg.type);
  }};
  window.finish=(index,fail=false)=>{
   if(fail)writes[index].reject(Error('simulated command failure'));
   else{Object.assign(raspberry,writes[index].msg.changes.flags);writes[index].resolve({display:{flags:{...raspberry}}});}
  };
  p._render();
 },{flags,initial});
 await page.evaluate(()=>p._refreshStatus());return page;
}
async function state(page,flag){return page.evaluate(flag=>({checked:p.shadowRoot.querySelector(`[data-flag=${flag}]`).checked,logical:p._flag(flag),confirmed:p._display?.flags?.[flag]??null,pending:p._displayWriteState().pending[flag]?.value??null,raspberry:raspberry[flag],coordinator:coordinator[flag],commands:writes.length}),flag);}
for(const flag of flags)for(const initial of [true,false]){
 test(`${flag}: initial Raspberry status ${initial}, deferred ${initial} -> ${!initial}, stale HA snapshot and resync`,async t=>{
  const page=await fixture(t,initial);
  const before=await state(page,flag);assert.equal(before.checked,initial);assert.equal(before.raspberry,initial);assert.equal(before.confirmed,null);
  await page.locator(`[data-flag=${flag}]`).click();
  assert.equal((await state(page,flag)).pending,!initial);
  await page.waitForFunction(()=>writes.length===1);
  assert.deepEqual(await page.evaluate(()=>writes[0].msg.changes),{flags:{[flag]:!initial}});
  // No response yet: the Raspberry is unchanged, the UI holds the desired state.
  await page.evaluate(()=>p._refreshStatus());
  let current=await state(page,flag);assert.equal(current.checked,!initial);assert.equal(current.raspberry,initial);assert.equal(current.commands,1);
  await page.evaluate(()=>finish(0));
  await page.waitForFunction(flag=>!p._displayWriteState().pending[flag]&&!p._displayWriteState().running,flag);
  current=await state(page,flag);assert.equal(current.checked,!initial);assert.equal(current.confirmed,!initial);assert.equal(current.raspberry,!initial);assert.equal(current.coordinator,initial);
  // This is the production-test error: /display and the checkbox are confirmed,
  // while an awaited /status still returns the coordinator's previous snapshot.
  const cached=await page.evaluate(()=>p._ws('rpi2dmd/status'));assert.equal(cached.status.display.active_flags.includes(flag),initial);
  const direct=await page.evaluate(()=>p._ws('rpi2dmd/display/get'));assert.equal(direct.display.flags[flag],!initial);
  await page.evaluate(()=>{Object.assign(coordinator,raspberry);return p._refreshStatus();});
  current=await state(page,flag);assert.equal(current.checked,!initial);assert.equal(current.coordinator,!initial);assert.equal(current.commands,1);
 });
}
for(const flag of flags){
 test(`${flag}: command failure restores confirmed Raspberry value; next trusted click succeeds once`,async t=>{
  const page=await fixture(t,true);
  await page.locator(`[data-flag=${flag}]`).click();await page.waitForFunction(()=>writes.length===1);
  await page.evaluate(()=>finish(0,true));
  await page.waitForFunction(flag=>!p._displayWriteState().pending[flag]&&!p._displayWriteState().running,flag);
  let current=await state(page,flag);assert.equal(current.checked,true);assert.equal(current.raspberry,true);assert.equal(current.commands,1);
  assert.match(await page.evaluate(()=>p._featureErrors.display),/Impossible de modifier/);
  await page.locator(`[data-flag=${flag}]`).click();await page.waitForFunction(()=>writes.length===2);
  assert.deepEqual(await page.evaluate(()=>writes[1].msg.changes),{flags:{[flag]:false}});
  await page.evaluate(()=>finish(1));await page.waitForFunction(()=>!p._displayWriteState().running);
  current=await state(page,flag);assert.equal(current.checked,false);assert.equal(current.raspberry,false);assert.equal(current.commands,2);
 });
}
