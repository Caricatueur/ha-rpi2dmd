const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
async function fixture(t) {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.addScriptTag({ path: path.resolve('custom_components/rpi2dmd/frontend/rpi2dmd-panel.js') });
  await page.evaluate(() => {
    const p = window.p = document.createElement('rpi2dmd-panel'); document.body.append(p);
    p._entry='a'; p._online=true; p._bannerChecked=true;
    p._devices=[{entry_id:'a',name:'A'},{entry_id:'b',name:'B'}];
    p._status={playlist:{mode:'legacy'},power:{undervoltage:true}};
    window.calls=[];
    p._hass={callWS:msg=>new Promise((resolve,reject)=>calls.push({msg,resolve,reject}))};
    p._render();
  });
  return page;
}
function card(page) { return page.locator('.metric-card').filter({has:page.locator('h2', {hasText:'ÉCRAN ACTUEL'})}); }
for (const mode of ['legacy','playlist']) test(`online ${mode} displayed even without current_screen`,async t=>{
  const page=await fixture(t);
  await page.evaluate(mode=>{p._status.playlist.mode=mode;p._render();},mode);
  assert.equal(await card(page).locator('strong').innerText(),mode.toUpperCase());
  assert.equal(await card(page).locator('small').innerText(),'Mode actuel');
  await page.evaluate(()=>{p._status.current_screen={available:true,type:'gif'};p._render();});
  assert.equal(await card(page).locator('small').innerText(),'gif');
  await page.evaluate(()=>{p._status.current_screen.available=false;p._render();});
  assert.equal(await card(page).locator('small').innerText(),'Mode actuel');
});
test('offline masks stale mode, screen and undervoltage',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{p._status.current_screen={available:true,type:'mqtt'};p._online=false;p._render();});
  assert.equal(await card(page).locator('strong').innerText(),'—');
  assert.equal(await card(page).locator('small').innerText(),'—');
  assert.equal(await page.locator('.warning').count(),0);
  assert.equal(await page.locator('rpi2dmd-panel').count(),1);
});
test('refresh button loads only playlist, deduplicates clicks and immediately renders result',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{p._section='playlist';p._playlist={items:[]};p._featureErrors.playlist='ancienne erreur';p._render();});
  await page.locator('[data-action=playlist-refresh]').click();
  assert.equal(await page.locator('[data-action=playlist-refresh]').isDisabled(),true);
  assert.equal(await page.locator('[data-action=playlist-refresh]').innerText(),'Chargement…');
  await page.evaluate(()=>{p._refreshPlaylist();p._refreshPlaylist();});
  assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.msg)),[{type:'rpi2dmd/playlist/get',entry_id:'a'}]);
  await page.evaluate(()=>calls[0].resolve({playlist:{items:[{id:'new',type:'gif',title:'Nouvelle ligne',enabled:true}]}}));
  await page.waitForFunction(()=>!p._playlistLoading());
  assert.match(await page.locator('main').innerText(),/Nouvelle ligne/);
  assert.equal(await page.locator('[data-action=playlist-refresh]').isDisabled(),false);
  assert.equal(await page.locator('[role=alert]').count(),0);
  assert.equal(await page.evaluate(()=>calls.length),1);
});
test('playlist error stays local and successful retry clears it',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{p._loadSection('playlist');});
  await page.evaluate(()=>calls[0].reject(new Error('endpoint failed')));
  await page.waitForFunction(()=>!p._playlistLoading());
  assert.equal(await page.locator('[role=alert]').innerText(),'Impossible de charger la playlist.');
  assert.deepEqual(await page.evaluate(()=>({online:p._online,error:!!p._error,mode:p._status.playlist.mode})),{online:true,error:false,mode:'legacy'});
  await page.locator('[data-action=playlist-refresh]').click();
  await page.evaluate(()=>calls[1].resolve({playlist:{items:[]}}));
  await page.waitForFunction(()=>!p._playlistLoading());
  assert.equal(await page.locator('[role=alert]').count(),0);
});
test('Dashboard → Playlist → GIF → Playlist ignores stale success and error',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{p._loadSection('dashboard');p._loadSection('playlist');p._loadSection('gif');p._loadSection('playlist');});
  assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.msg.type)),['rpi2dmd/playlist/get','rpi2dmd/gifs/list','rpi2dmd/playlist/get']);
  await page.evaluate(()=>calls[2].resolve({playlist:{items:[{id:'fresh',type:'gif',enabled:true}]}}));
  await page.waitForFunction(()=>!p._playlistLoading());
  await page.evaluate(()=>{calls[0].resolve({playlist:{items:[{id:'stale',type:'gif'}]}});calls[1].reject(new Error('stale GIF error'));});
  assert.deepEqual(await page.evaluate(()=>({id:p._playlist.items[0].id,section:p._section,error:!!p._featureErrors.playlist})),{id:'fresh',section:'playlist',error:false});
});
test('device selector isolates playlist and status responses; latest status wins',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{p._loadSection('playlist');p._refreshStatus();}); // A requests.
  await page.locator('#device').selectOption('b'); // B status request, runtime cleared.
  assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.msg.entry_id)),['a','a','b']);
  await page.evaluate(()=>calls[2].resolve({online:true,status:{playlist:{mode:'playlist'},current_screen:{available:true,type:'mqtt'}}}));
  await page.waitForFunction(()=>calls.length===4);
  assert.deepEqual(await page.evaluate(()=>calls[3].msg),{type:'rpi2dmd/playlist/get',entry_id:'b'});
  await page.evaluate(()=>calls[3].resolve({playlist:{items:[{id:'b-item',type:'gif',enabled:true}]}}));
  await page.waitForFunction(()=>!p._playlistLoading());
  await page.evaluate(()=>{calls[0].resolve({playlist:{items:[{id:'a-item'}]}});calls[1].reject(new Error('old A offline'));});
  assert.deepEqual(await page.evaluate(()=>({entry:p._entry,id:p._playlist.items[0].id,online:p._online})),{entry:'b',id:'b-item',online:true});
  await page.evaluate(()=>{p._loadSection('dashboard');});
  assert.equal(await card(page).locator('strong').innerText(),'PLAYLIST');
  assert.equal(await card(page).locator('small').innerText(),'mqtt');
  await page.evaluate(()=>{p._refreshStatus();p._refreshStatus();});
  await page.evaluate(()=>calls[5].resolve({online:true,status:{playlist:{mode:'legacy'}}}));
  await page.waitForFunction(()=>p._status.playlist.mode==='legacy');
  await page.evaluate(()=>calls[4].resolve({online:false,status:{}}));
  assert.equal(await card(page).locator('strong').innerText(),'LEGACY');
  assert.equal(await page.evaluate(()=>p._online),true);
});
test('offline status invalidates in-flight playlist without repopulating runtime',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{p._loadSection('playlist');p._refreshStatus();});
  await page.evaluate(()=>calls[1].resolve({online:false,status:{}}));
  await page.waitForFunction(()=>!p._online);
  await page.evaluate(()=>calls[0].resolve({playlist:{items:[{id:'stale'}]}}));
  assert.equal(await page.evaluate(()=>p._playlist),null);
  assert.equal(await page.evaluate(()=>p._playlistLoading()),false);
});

async function playlistFixture(t) {
  const page=await fixture(t);
  await page.evaluate(()=>{
    window.prompt=()=>{throw new Error('Unexpected prompt');};
    p._section='playlist';p._playlist={items:[
      {id:'first',type:'mqtt',title:'Température',enabled:true},
      {id:'second',type:'time',enabled:false}
    ]};p._render();
  });
  return page;
}
test('playlist type selector has exact types, defaults to MQTT and preserves draft on render',async t=>{
  const page=await playlistFixture(t);
  assert.deepEqual(await page.locator('#playlist-type option').evaluateAll(options=>options.map(o=>[o.value,o.textContent])),[
    ['gif','GIF'],['time','Heure'],['date','Date'],['weather','Météo'],['mqtt','MQTT Display']
  ]);
  assert.equal(await page.locator('#playlist-type').inputValue(),'mqtt');
  await page.locator('[data-playlist-field=topic]').fill('home/temperature');
  await page.locator('#playlist-type').selectOption('gif');
  assert.equal(await page.locator('#playlist-mqtt-fields').isVisible(),false);
  await page.locator('#playlist-type').selectOption('mqtt');
  await page.evaluate(()=>p._render());
  assert.equal(await page.locator('[data-playlist-field=topic]').inputValue(),'home/temperature');
});
test('MQTT add sends entered fields, prevents double submit and exposes icon button after readback',async t=>{
  const page=await playlistFixture(t);
  for(const [field,value] of Object.entries({title:'Salon',topic:'home/salon/temperature',unit:'°C',duration_seconds:'12'}))
    await page.locator(`[data-playlist-field=${field}]`).fill(value);
  await page.locator('[data-action=playlist-add]').click();
  await page.waitForFunction(()=>calls.length===1);
  await page.evaluate(()=>p._addItem());
  assert.equal(await page.locator('[data-action=playlist-add]').isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.msg)),[{type:'rpi2dmd/playlist/add',entry_id:'a',item:{type:'mqtt',enabled:true,title:'Salon',topic:'home/salon/temperature',unit:'°C',duration_seconds:12}}]);
  await page.evaluate(()=>calls[0].resolve({item:{id:'created'}}));
  await page.waitForFunction(()=>calls.length===2);
  await page.evaluate(()=>calls[1].resolve({playlist:{items:[{id:'created',...calls[0].msg.item}]}}));
  await page.waitForFunction(()=>!p._playlistAdding);
  assert.equal(await page.locator('[data-action=icon-picker][data-item=created]').count(),1);
  assert.match(await page.locator('.item').innerText(),/1 — mqtt · Salon/);
  await page.locator('[data-action=icon-picker]').click();
  await page.waitForFunction(()=>calls.length===3);
  assert.equal(await page.evaluate(()=>calls[2].msg.type),'rpi2dmd/icons/list');
});
for(const type of ['gif','time','date','weather']) test(`add ${type} keeps minimal playlist contract`,async t=>{
  const page=await playlistFixture(t);
  await page.locator('#playlist-type').selectOption(type);
  await page.locator('[data-action=playlist-add]').click();
  await page.waitForFunction(()=>calls.length===1);
  assert.deepEqual(await page.evaluate(()=>calls[0].msg.item),{type,enabled:true});
});
test('unapproved type is never sent even if injected into selector',async t=>{
  const page=await playlistFixture(t);
  await page.evaluate(()=>{const select=p.shadowRoot.querySelector('#playlist-type');select.add(new Option('Clock','clock'));select.value='clock';return p._addItem();});
  assert.equal(await page.evaluate(()=>calls.length),0);
});
for(const value of ['', '0', '-1', '1.5']) test(`invalid MQTT duration ${JSON.stringify(value)} is not sent`,async t=>{
  const page=await playlistFixture(t);
  await page.locator('[data-playlist-field=duration_seconds]').fill(value);
  await page.locator('[data-action=playlist-add]').click();
  await page.evaluate(()=>p._addItem());
  assert.equal(await page.evaluate(()=>calls.length),0);
});
for(const [action,id,endpoint,extra] of [
  ['up','second','move',{index:0}],['down','first','move',{index:1}],
  ['duplicate','first','duplicate',{}],['delete','first','delete',{}],
  ['toggle','first','update',{changes:{enabled:false}}],['toggle','second','update',{changes:{enabled:true}}]
]) test(`playlist ${action} ${id} still writes and refreshes`,async t=>{
  const page=await playlistFixture(t);
  page.on('dialog',dialog=>dialog.accept());
  await page.locator(`[data-action=${action}][data-item=${id}]`).click();
  await page.waitForFunction(()=>calls.length===1);
  assert.deepEqual(await page.evaluate(()=>calls[0].msg),{type:`rpi2dmd/playlist/${endpoint}`,entry_id:'a',item_id:id,...extra});
  await page.evaluate(()=>calls[0].resolve({}));
  await page.waitForFunction(()=>calls.length===2);
  assert.equal(await page.evaluate(()=>calls[1].msg.type),'rpi2dmd/playlist/get');
});
test('MQTT icon update preserves icon and show_icon contract',async t=>{
  const page=await playlistFixture(t);
  await page.evaluate(()=>{p._setItemIcon('first','thermometer');});
  await page.waitForFunction(()=>calls.length===1);
  assert.deepEqual(await page.evaluate(()=>calls[0].msg),{type:'rpi2dmd/playlist/update',entry_id:'a',item_id:'first',changes:{icon:'thermometer',show_icon:true}});
});
test('playlist form fits mobile viewport',async t=>{
  const page=await playlistFixture(t);
  await page.setViewportSize({width:360,height:800});
  const bounds=await page.locator('#playlist-add-form').boundingBox();
  for(const input of await page.locator('#playlist-add-form input, #playlist-add-form select, #playlist-add-form button').all()) {
    const box=await input.boundingBox();
    assert.ok(box.x>=bounds.x && box.x+box.width<=bounds.x+bounds.width+1);
  }
});

test('persistent playlist busy remains a local error and icon retry clears it after readback',async t=>{
  const page=await playlistFixture(t);
  await page.evaluate(()=>{p._setItemIcon('first','temperature');});
  await page.waitForFunction(()=>calls.length===1);
  // Backend returns config_busy only after its three confirmed HTTP 409 responses.
  await page.evaluate(()=>calls[0].reject({code:'config_busy',message:'Conflict'}));
  await page.waitForFunction(()=>!!p._featureErrors.playlist);
  assert.equal(await page.locator('[role=alert]').innerText(),'Le RPI2DMD est temporairement occupé. Réessayez dans quelques secondes.');
  assert.equal(await page.locator('.online-pill').innerText(),'En ligne');
  assert.equal(await page.evaluate(()=>!!p._error),false);
  assert.equal(await page.locator('.item').count(),2);
  await page.evaluate(()=>{p._refreshStatus();});
  await page.waitForFunction(()=>calls.length===2);
  await page.evaluate(()=>calls[1].resolve({online:true,status:{playlist:{mode:'playlist'}}}));
  await page.evaluate(()=>{p._setItemIcon('first','temperature');});
  await page.waitForFunction(()=>calls.length===3);
  // A successful server-side 409 → 200 retry produces one successful WS response.
  await page.evaluate(()=>calls[2].resolve({item:{id:'first',icon:'temperature',show_icon:true}}));
  await page.waitForFunction(()=>calls.length===4);
  assert.equal(await page.evaluate(()=>calls[3].msg.type),'rpi2dmd/playlist/get');
  await page.evaluate(()=>{
    p._iconPreviewCache.temperature='data:image/png;base64,';
    calls[3].resolve({playlist:{items:[{id:'first',type:'mqtt',enabled:true,icon:'temperature',show_icon:true}]}});
  });
  await page.waitForFunction(()=>!p._playlistLoading());
  assert.equal(await page.locator('[role=alert]').count(),0);
  assert.equal(await page.locator('.online-pill').innerText(),'En ligne');
  assert.equal(await page.locator('[data-icon-preview=temperature]').count(),1);
  assert.equal(await page.evaluate(()=>p._playlist.items[0].show_icon),true);
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.msg.type==='rpi2dmd/playlist/add').length),0);
});

test('successful pending icon write keeps online during status polling and clears old local error',async t=>{
  const page=await playlistFixture(t);
  await page.evaluate(()=>{p._featureErrors.playlist='ancienne erreur';p._setItemIcon('first',null);});
  await page.waitForFunction(()=>calls.length===1);
  await page.evaluate(()=>{p._refreshStatus();});
  await page.waitForFunction(()=>calls.length===2);
  await page.evaluate(()=>calls[1].resolve({online:true,status:{}}));
  assert.equal(await page.locator('.online-pill').innerText(),'En ligne');
  await page.evaluate(()=>calls[0].resolve({item:{id:'first',icon:null,show_icon:false}}));
  await page.waitForFunction(()=>calls.length===3);
  await page.evaluate(()=>calls[2].resolve({playlist:{items:[{id:'first',type:'mqtt',enabled:true,icon:null,show_icon:false}]}}));
  await page.waitForFunction(()=>!p._playlistLoading());
  assert.equal(await page.locator('[role=alert]').count(),0);
  assert.equal(await page.locator('.online-pill').innerText(),'En ligne');
  assert.equal(await page.locator('[data-icon-preview]').count(),0);
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.msg.type==='rpi2dmd/playlist/update').length),1);
});

for(const code of ['cannot_connect','invalid_auth','api_error']) test(`playlist ${code} keeps historical local error; failed status still goes offline`,async t=>{
  const page=await playlistFixture(t);
  await page.evaluate(()=>{p._setItemIcon('first','temperature');});
  await page.waitForFunction(()=>calls.length===1);
  await page.evaluate(code=>calls[0].reject({code,message:'failure'}),code);
  await page.waitForFunction(()=>!!p._featureErrors.playlist);
  assert.equal(await page.locator('[role=alert]').innerText(),"Impossible d'enregistrer l'icône MQTT.");
  assert.equal(await page.locator('.online-pill').innerText(),'En ligne');
  await page.evaluate(()=>{p._refreshStatus();});
  await page.waitForFunction(()=>calls.length===2);
  await page.evaluate(()=>calls[1].resolve({online:false,status:{}}));
  await page.waitForFunction(()=>!p._online);
  assert.match(await page.locator('main').innerText(),/Impossible de joindre le RPI2DMD/);
});
