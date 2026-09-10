const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const points = [{time:'00:00',value:0},{time:'08:00',value:50},{time:'14:00',value:25},{time:'16:00',value:50},{time:'23:00',value:40}];
function panel() {
  let Panel;
  vm.runInNewContext(fs.readFileSync('custom_components/rpi2dmd/frontend/rpi2dmd-panel.js','utf8'), {
    HTMLElement:class {attachShadow(){this.shadowRoot={};}}, customElements:{define:(name,cls)=>Panel=cls}, console, setTimeout, clearTimeout, Date
  });
  const p=new Panel();p._entry='one';p._online=true;p._render=()=>{};
  return p;
}
test('schedule GET displays remote change points and picks up external changes',async()=>{
  const p=panel();let remote={enabled:true,points};
  p._hass={callWS:async()=>({schedule:remote})};
  await p._loadSection('brightness');
  assert.deepEqual(p._brightnessSchedule,remote);
  for(const point of points)assert.ok(p._brightnessPage().includes(`value="${point.time}"`));
  remote={enabled:true,points:[{time:'00:00',value:75}]};
  await p._loadSection('brightness');assert.deepEqual(p._brightnessSchedule,remote);
});
test('save retains confirmed canonical response even before subsequent GET',async()=>{
  const p=panel();p._scheduleReadForm=()=>points;
  const canonical={enabled:false,points:[{time:'00:00',value:20}]};
  p._wsWrite=async(type,msg)=>{assert.equal(type,'rpi2dmd/brightness/schedule/update');assert.deepEqual(msg.schedule,points);return {schedule:canonical};};
  p._loadSection=async()=>{assert.deepEqual(p._brightnessSchedule,canonical);};
  p._showNotice=()=>{};
  await p._scheduleSave();assert.deepEqual(p._brightnessSchedule,canonical);
});
test('apply now writes only the current hour and slider retains range and offline state',async()=>{
  const p=panel();p._scheduleReadForm=()=>[{time:'00:00',value:65}];
  p._wsWrite=async(type,msg)=>{assert.equal(type,'rpi2dmd/display/update');assert.deepEqual(JSON.parse(JSON.stringify(msg.changes)),{brightness:{schedule:[{hour:new Date().getHours(),value:65}]}});return {display:{}};};
  p._refreshStatus=async()=>{};p._showNotice=()=>{};
  await p._scheduleApply();assert.equal(p._featureErrors.brightness,'');
  assert.match(p._quickControls(),/min="0" max="100" step="5"/);
  p._online=false;assert.match(p._quickControls(),/id="brightness"[^>]*disabled/);
});
