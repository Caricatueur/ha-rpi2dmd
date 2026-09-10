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
