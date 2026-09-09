const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('custom_components/rpi2dmd/frontend/rpi2dmd-panel.js', 'utf8');
const flags = ['clock', 'date', 'weather', 'gif', 'mqtt'];
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
function setup(t) {
  t.mock.timers.enable({apis:['setTimeout', 'Date'], now:10000});
  let Panel;
  vm.runInNewContext(source, {HTMLElement:class {attachShadow(){this.shadowRoot={};}}, customElements:{define:(name, cls)=>Panel=cls}, console, setTimeout, clearTimeout, Date});
  const p = new Panel();
  p._entry='one'; p._online=true;
  p._display={flags:Object.fromEntries(flags.map(f=>[f,true])),brightness:{schedule:[{hour:new Date().getHours(),value:50}]}};
  p._status={display:{active_flags:flags}};
  p._render=()=>{p.html=p._quickControls();};
  p._refreshStatus=async()=>{p._status={display:{active_flags:flags}};p._render();};
  const calls=[];
  p._hass={callWS:async msg=>{const d=deferred();calls.push({msg,at:Date.now(),...d});return d.promise;}};
  p._render();
  return {p,calls};
}
async function advance(t,ms){t.mock.timers.tick(ms);await tick();}
function checked(p,f){return new RegExp(`data-flag="${f}" checked`).test(p.html);}
function success(p,call){call.resolve({display:{...p._display,flags:{...p._display.flags,...call.msg.changes.flags},...(call.msg.changes.brightness?{brightness:call.msg.changes.brightness}:{})}});}
for (const flag of flags) test(`${flag}: immediate OFF/ON, stale coordinator, success`,async t=>{
  const {p,calls}=setup(t);
  for(const value of [false,true]){
    p._updateDisplay({flags:{[flag]:value}});
    assert.equal(checked(p,flag),value); // Synchronous, before timers or network.
    await p._refreshStatus(); assert.equal(checked(p,flag),value);
    await advance(t,1000);
    const call=calls.at(-1); success(p,call);await tick();
    assert.equal(checked(p,flag),value);
    assert.equal(p._displayWriteState().pending[flag],undefined);
    assert.equal(p._error,undefined);
  }
});
test('rapid five toggles coalesce into one transaction; last intention wins',async t=>{
  const {p,calls}=setup(t);
  for(const flag of flags){p._updateDisplay({flags:{[flag]:false}});assert.equal(checked(p,flag),false);await advance(t,100);}
  assert.equal(calls.length,0);
  await advance(t,250);assert.equal(calls.length,1);
  assert.deepEqual({...calls[0].msg.changes.flags},Object.fromEntries(flags.map(f=>[f,false])));
  success(p,calls[0]);await tick();
  assert.equal(Object.keys(p._displayWriteState().pending).length,0);
});
test('coalesces while waiting for write slot and serializes subsequent writes',async t=>{
  const {p,calls}=setup(t);p._lastWriteAt=Date.now();
  p._updateDisplay({flags:{gif:false}});await advance(t,250);
  p._updateDisplay({flags:{gif:true,mqtt:false}});await advance(t,750);
  assert.equal(calls.length,1);assert.equal(calls[0].msg.changes.flags.gif,true);
  p._updateDisplay({flags:{gif:false}});await advance(t,250);
  success(p,calls[0]);await tick();assert.equal(checked(p,'gif'),false);
  await advance(t,999);assert.equal(calls.length,1);
  await advance(t,1);assert.equal(calls.length,2);
  assert.ok(calls[1].at-calls[0].at>=1000);
  success(p,calls[1]);await tick();assert.equal(checked(p,'gif'),false);
});
test('failure rolls back locally; newer intent survives earlier failure',async t=>{
  const {p,calls}=setup(t);
  p._updateDisplay({flags:{gif:false}});await advance(t,250);
  calls[0].reject(new Error('simulated failure'));await tick();
  assert.equal(checked(p,'gif'),true);assert.match(p._featureErrors.display,/GIF/);
  assert.equal(p._error,undefined);assert.equal(p._displayWriteState().pending.gif,undefined);
  p._updateDisplay({flags:{gif:false}});await advance(t,1000);
  p._updateDisplay({flags:{gif:true}});
  calls[1].reject(new Error('simulated failure'));await tick();
  assert.equal(checked(p,'gif'),true);assert.equal(p._displayWriteState().pending.gif.value,true);
  await advance(t,1000);success(p,calls[2]);await tick();
});
test('stale display GET cannot overwrite a completed write',async t=>{
  const {p,calls}=setup(t);const stale=structuredClone(p._display);
  const loading=p._loadSection('display');await tick();
  p._updateDisplay({flags:{gif:false}});await advance(t,250);
  success(p,calls[1]);await tick();calls[0].resolve({display:stale});await loading;
  assert.equal(checked(p,'gif'),false);
});
test('slider input updates value/fill immediately, survives render, writes only on change',async t=>{
  const {p,calls}=setup(t);const listeners={};
  const bright={value:'50',min:'0',max:'100',addEventListener:(n,fn)=>listeners[n]=fn};
  const output={},fill={style:{}};
  p.shadowRoot={querySelectorAll:()=>[],querySelector:sel=>({'#brightness':bright,'#brightness-value':output,'#brightness-fill':fill}[sel])};
  p._bind();bright.value='80';listeners.input();
  assert.equal(output.textContent,'80 %');assert.equal(fill.style.width,'80%');
  p._render();assert.match(p.html,/id="brightness" value="80"/);assert.equal(calls.length,0);
  bright.onchange({isTrusted:true});assert.equal(p._brightness(),80);
  await advance(t,250);assert.equal(calls.length,1);success(p,calls[0]);await tick();
  assert.equal(p._brightness(),80);
});
test('queued writes remain bound to original device',async t=>{
  const {p,calls}=setup(t);p._updateDisplay({flags:{gif:false}});
  p._entry='two';await advance(t,250);
  assert.equal(calls[0].msg.entry_id,'one');success(p,calls[0]);await tick();
  assert.equal(p._display.flags.gif,true);
});
test('rollback uses latest successful transaction when user toggles again in flight',async t=>{
  const {p,calls}=setup(t);
  p._updateDisplay({flags:{gif:false}});await advance(t,250);
  p._updateDisplay({flags:{gif:true}});
  success(p,calls[0]);await tick();assert.equal(checked(p,'gif'),true);
  await advance(t,1000);calls[1].reject(new Error('simulated failure'));await tick();
  assert.equal(checked(p,'gif'),false);assert.equal(p._displayWriteState().pending.gif,undefined);
});
test('real render and bound checkbox handler update markup before any API write',async t=>{
  const {p,calls}=setup(t);
  const el={dataset:{flag:'gif'},checked:false};
  p.shadowRoot={querySelectorAll:sel=>sel==='[data-flag]'?[el]:[],querySelector:()=>null};
  p._bind();const change=el.onchange;
  p._render=Object.getPrototypeOf(p)._render;p._checkHeroBanner=()=>{};
  p._section='display';
  const start=performance.now();change({isTrusted:true});
  assert.ok(performance.now()-start<100);
  assert.doesNotMatch(p.shadowRoot.innerHTML,/data-flag="gif" checked/);
  assert.equal(calls.length,0);
});
