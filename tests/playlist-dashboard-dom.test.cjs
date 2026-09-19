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

async function previewFixture(t, {cached=0,count=60}={}) {
  const page=await playlistFixture(t);
  await page.clock.install({time:new Date("2026-01-01T00:00:00Z")});
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.evaluate(({cached,count})=>{
    window.previews={active:0,peak:0,started:[],times:[],pending:[],messages:[]};
    for(let i=0;i<cached;i++)p._iconPreviewCache[`icon-${i}`]='data:image/png;base64,AA==';
    const load=p._loadIconPreview.bind(p);
    p._loadIconPreview=async(...args)=>{
      previews.active++;previews.peak=Math.max(previews.peak,previews.active);
      try{return await load(...args);}finally{previews.active--;}
    };
    p._hass.callWS=msg=>{
      previews.messages.push(msg);
      if(msg.type==='rpi2dmd/icons/list')return Promise.resolve({icons:{items:Array.from({length:count},(_,i)=>({id:`icon-${i}`,name:`Icon ${i}`,category:i<30?'A':'B'}))}});
      if(msg.type==='rpi2dmd/icons/get') {
        previews.started.push(msg.icon_id);previews.times.push(Date.now());
        return new Promise((resolve,reject)=>previews.pending.push({resolve,reject}));
      }
      if(msg.type==='rpi2dmd/status')return Promise.resolve({online:true,status:{}});
      if(msg.type==='rpi2dmd/playlist/update') {
        Object.assign(p._playlist.items.find(i=>i.id===msg.item_id),msg.changes);
        return Promise.resolve({item:{id:msg.item_id,...msg.changes}});
      }
      if(msg.type==='rpi2dmd/playlist/get')return Promise.resolve({playlist:p._playlist});
      throw new Error('Unexpected command');
    };
    window.finishPreview=async(code=null)=>{
      const request=previews.pending.shift();
      if(!request)throw new Error('No pending preview');
      if(code)request.reject({code});else request.resolve({icon:{content_type:'image/png',data:'AA=='}});
      for(let i=0;i<15;i++)await Promise.resolve();
    };
  },{cached,count});
  await page.evaluate(()=>p._openIconPicker('first'));
  return page;
}
async function drainPage(page) {
  for(let i=0;i<20;i++) {
    if(!await page.evaluate(()=>previews.pending.length))break;
    await page.evaluate(()=>finishPreview());
    await page.clock.runFor(200);
  }
}

test('60 icons load one at a time with 200ms pacing and only 12 initial previews',async t=>{
  const page=await previewFixture(t);
  assert.equal(await page.evaluate(()=>previews.started.length),1);
  await page.evaluate(()=>{for(let i=0;i<10;i++)p._render();});
  await page.evaluate(()=>finishPreview());
  assert.equal(await page.locator('[data-picker-preview="icon-0"] img').count(),1);
  assert.equal(await page.evaluate(()=>previews.started.length),1);
  await page.clock.runFor(199);
  assert.equal(await page.evaluate(()=>previews.started.length),1);
  await page.clock.runFor(1);
  assert.equal(await page.evaluate(()=>previews.started.length),2);
  await drainPage(page);
  await page.clock.runFor(5000);
  assert.equal(await page.evaluate(()=>previews.started.length),12);
  assert.equal(await page.locator('[data-action=icon-select]').count(),12);
  for(let pageNumber=1;pageNumber<5;pageNumber++) {
    await page.locator('[data-action=icon-next]').click();
    await drainPage(page);
  }
  assert.deepEqual(await page.evaluate(()=>({peak:previews.peak,total:previews.started.length,unique:new Set(previews.started).size,paced:previews.times.every((time,i)=>i===0||time-previews.times[i-1]>=200)})),{peak:1,total:60,unique:60,paced:true});
});

for(const code of ['temporary_unavailable','cannot_connect']) test(`temporary ${code} backs off 2s then retries without permanent failure`,async t=>{
  const page=await previewFixture(t);
  await page.evaluate(code=>finishPreview(code),code);
  assert.equal(await page.evaluate(()=>p._iconPreviewFailed.size),0);
  await page.evaluate(()=>{p._render();p._refreshStatus();});
  await page.clock.runFor(1999);
  assert.equal(await page.evaluate(()=>previews.started.length),1);
  assert.equal(await page.locator('.online-pill').innerText(),'En ligne');
  await page.clock.runFor(1);
  assert.deepEqual(await page.evaluate(()=>previews.started),['icon-0','icon-0']);
  await page.evaluate(()=>finishPreview());
  await page.clock.runFor(200);
  assert.deepEqual(await page.evaluate(()=>previews.started),['icon-0','icon-0','icon-1']);
  assert.equal(await page.locator('[data-picker-preview="icon-0"] img').count(),1);
  assert.equal(await page.locator('[role=alert]').count(),0);
});

test('permanent failure is skipped but next download still waits 200ms',async t=>{
  const page=await previewFixture(t);
  await page.evaluate(()=>finishPreview('icon_unavailable'));
  assert.equal(await page.evaluate(()=>p._iconPreviewFailed.size),1);
  await page.clock.runFor(199);
  assert.equal(await page.evaluate(()=>previews.started.length),1);
  await page.clock.runFor(1);
  assert.deepEqual(await page.evaluate(()=>previews.started),['icon-0','icon-1']);
  await drainPage(page);
  await page.evaluate(()=>p._render());
  assert.equal(await page.evaluate(()=>previews.started.length),12);
});

test('cache survives renders, reopening and switching back to the same device',async t=>{
  const page=await previewFixture(t,{cached:10});
  await drainPage(page);
  assert.deepEqual(await page.evaluate(()=>previews.started),['icon-10','icon-11']);
  await page.evaluate(()=>{p._closeIconPicker();p._entry='b';p._render();});
  await page.evaluate(()=>{p._entry='a';p._render();return p._openIconPicker('first');});
  await page.clock.runFor(5000);
  assert.equal(await page.evaluate(()=>previews.started.length),2);
  assert.equal(await page.locator('.icon-tile img').count(),12);
});

test('closing picker cancels paced work and backoff retries',async t=>{
  const page=await previewFixture(t);
  await page.evaluate(()=>finishPreview('temporary_unavailable'));
  await page.locator('[data-action=icon-close]').click();
  await page.clock.runFor(5000);
  assert.equal(await page.evaluate(()=>previews.started.length),1);
});

test('filter changes discard old pending previews and reset pagination',async t=>{
  const page=await previewFixture(t);
  await page.locator('#icon-category').selectOption('B');
  await page.evaluate(()=>finishPreview());
  await page.clock.runFor(200);
  assert.deepEqual(await page.evaluate(()=>previews.started),['icon-0','icon-30']);
  await drainPage(page);
  await page.locator('[data-action=icon-next]').click();
  await page.evaluate(()=>finishPreview());
  await page.locator('#icon-search').fill('Icon 59');
  await page.clock.runFor(200);
  assert.equal(await page.evaluate(()=>previews.started.at(-1)),'icon-59');
  assert.equal(await page.evaluate(()=>p._iconPage),0);
  assert.equal(await page.locator('[data-action=icon-select]').count(),1);
});

test('MQTT row preview has priority, paints without render and selection still updates playlist',async t=>{
  const page=await previewFixture(t);
  await page.evaluate(()=>{
    p._playlist.items[0].icon='assigned';p._render();
    window.renders=0;const render=p._render.bind(p);p._render=(...args)=>{renders++;return render(...args);};
  });
  await page.evaluate(()=>finishPreview());
  await page.clock.runFor(200);
  assert.deepEqual(await page.evaluate(()=>previews.started),['icon-0','assigned']);
  await page.evaluate(()=>finishPreview());
  assert.equal(await page.locator('[data-icon-preview=assigned]').getAttribute('src'),'data:image/png;base64,AA==');
  assert.equal(await page.evaluate(()=>renders),0);
  await page.evaluate(()=>p._refreshStatus());
  await page.locator('[data-action=icon-select][data-icon-id="icon-0"]').click();
  assert.deepEqual(await page.evaluate(()=>previews.messages.find(m=>m.type==='rpi2dmd/playlist/update').changes),{icon:'icon-0',show_icon:true});
  assert.equal(await page.locator('[data-icon-preview="icon-0"]').getAttribute('src'),'data:image/png;base64,AA==');
  assert.equal(await page.locator('[role=alert]').count(),0);
  assert.equal(await page.evaluate(()=>previews.peak),1);
});

test('device switch discards queued old previews and stale catalogs',async t=>{
  const page=await previewFixture(t);
  await page.evaluate(()=>{p._entry='b';p._clearRuntimeData();p._render();});
  await page.evaluate(()=>finishPreview());
  await page.clock.runFor(5000);
  assert.equal(await page.evaluate(()=>previews.started.length),1);
  assert.equal(await page.locator('[role=dialog]').count(),0);
});

test('late icon catalog cannot reopen a closed picker',async t=>{
  const page=await playlistFixture(t);
  await page.locator('[data-action=icon-picker][data-item=first]').click();
  await page.locator('[data-action=icon-close]').click();
  await page.evaluate(()=>calls[0].resolve({icons:{items:[{id:'stale'}]}}));
  assert.equal(await page.locator('[role=dialog]').count(),0);
  assert.equal(await page.evaluate(()=>calls.length),1);
});

test('authentication failure does not trigger repeated automatic preview requests',async t=>{
  const page=await previewFixture(t);
  await page.evaluate(()=>finishPreview('invalid_auth'));
  await page.clock.runFor(10000);
  assert.equal(await page.evaluate(()=>previews.started.length),1);
  assert.equal(await page.evaluate(()=>p._iconPreviewFailed.size),0);
});

test('frontend version is visible on every page and logged only once per module load',async t=>{
  const page=await browser.newPage();t.after(()=>page.close());
  const messages=[];
  page.on('console',message=>{if(message.type()==='info')messages.push(message.text());});
  await page.addScriptTag({path:path.resolve('custom_components/rpi2dmd/frontend/rpi2dmd-panel.js')});
  await page.evaluate(()=>{
    window.p=document.createElement('rpi2dmd-panel');document.body.append(p);
    p._bannerChecked=true;p._render();
  });
  for(const section of ['dashboard','playlist','system']) {
    await page.evaluate(section=>{p._section=section;p._render();},section);
    assert.equal(await page.locator('footer').innerText(),'Interface HA : 0.4.5');
  }
  assert.deepEqual(messages,['[RPI2DMD] frontend 0.4.5 loaded']);
});
