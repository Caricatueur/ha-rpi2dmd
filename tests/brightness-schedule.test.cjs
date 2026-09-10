const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const points = Array.from({length:24},(_,hour)=>({time:`${String(hour).padStart(2,'0')}:00`,value:hour<8?0:hour<14?50:hour<16?25:hour<23?50:40}));
const hourly = points.map((p,hour)=>({hour,value:p.value}));
function panel() {
  let Panel;
  vm.runInNewContext(fs.readFileSync('custom_components/rpi2dmd/frontend/rpi2dmd-panel.js','utf8'), {
    HTMLElement:class {attachShadow(){this.shadowRoot={};}}, customElements:{define:(name,cls)=>Panel=cls}, console, setTimeout, clearTimeout, Date
  });
  const p=new Panel();p._entry='one';p._online=true;p._render=()=>{};
  return p;
}
test('schedule GET displays 24 remote hours and picks up external changes',async()=>{
  const p=panel();let remote={enabled:true,points};
  p._hass={callWS:async()=>({schedule:remote})};
  await p._loadSection('brightness');
  assert.deepEqual(p._brightnessSchedule,remote);
  for(const point of points)assert.ok(p._brightnessPage().includes(`Heure : ${point.time}`));
  remote={enabled:true,points:points.map((p,h)=>({...p,value:h===14?75:p.value}))};
  await p._loadSection('brightness');assert.deepEqual(p._brightnessSchedule,remote);
});
test('save retains confirmed canonical response even before subsequent GET',async()=>{
  const p=panel();p._scheduleReadForm=()=>hourly;
  const canonical={enabled:false,points:points.map(p=>({...p,value:20}))};
  p._wsWrite=async(type,msg)=>{assert.equal(type,'rpi2dmd/brightness/schedule/update');assert.deepEqual(msg.schedule,hourly);return {schedule:canonical};};
  p._loadSection=async()=>{assert.deepEqual(p._brightnessSchedule,canonical);};
  p._showNotice=()=>{};
  await p._scheduleSave();assert.deepEqual(p._brightnessSchedule,canonical);
});
test('apply now writes only the current hour and slider retains range and offline state',async()=>{
  const p=panel();p._scheduleReadForm=()=>hourly.map(p=>({...p,value:65}));
  p._wsWrite=async(type,msg)=>{assert.equal(type,'rpi2dmd/display/update');assert.deepEqual(JSON.parse(JSON.stringify(msg.changes)),{brightness:{schedule:[{hour:new Date().getHours(),value:65}]}});return {display:{}};};
  p._refreshStatus=async()=>{};p._showNotice=()=>{};
  await p._scheduleApply();assert.equal(p._featureErrors.brightness,'');
  assert.match(p._quickControls(),/min="0" max="100" step="5"/);
  p._online=false;assert.match(p._quickControls(),/id="brightness"[^>]*disabled/);
});
