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
 await page.evaluate(()=>{
  window.p=document.createElement('rpi2dmd-panel');document.body.append(p);
  p._entry='one';p._online=true;p._bannerChecked=true;
  p._hass={states:{'sensor.lux':{state:'0',attributes:{friendly_name:'Salon <lux>',unit_of_measurement:'lx'}}}};
  window.setMode=(mode,changes={})=>{
   p._dashboardAmbient={selected_mode:mode,effective_mode:mode,config:{mode,entity_id:'sensor.lux'},available:true,last_lux:0,last_applied:0,schedule_hour:7,firmware:{engine:'connected',pending:false,requested:99,schedule:Array(24).fill(50),sensor_available:true,sensor:{lux:0,target:99}},...changes};p._render();
  };
  setMode('schedule');
 });return page;
}
test('navigation removed, quick controls preserved, mode contexts and zero ACK',async t=>{
 const page=await fixture(t);
 assert.equal(await page.locator('[data-nav=display]').count(),0);
 assert.equal(await page.locator('#brightness, input[type=range]').count(),0);
 assert.equal(await page.locator('[data-flag]').count(),5);
 let text=await page.locator('.smart-brightness').innerText();
 assert.match(text,/Planning en cours\s+50 %/);assert.match(text,/Luminosité appliquée\s+0 %/);
 await page.evaluate(()=>setMode('local'));text=await page.locator('.smart-brightness').innerText();
 assert.match(text,/BH1750\s+0 lx/);assert.doesNotMatch(text,/Planning en cours|Cible|Consigne|Source active/);
 await page.evaluate(()=>setMode('ha'));text=await page.locator('.smart-brightness').innerText();
 assert.match(text,/Capteur HA\s+Salon <lux>/);assert.match(text,/Mesure HA\s+0 lx/);
 assert.equal(await page.locator('.smart-brightness [role=alert]').count(),0);
 assert.doesNotMatch(text,/Source active|Cible|Consigne|Planning en cours|99/);
 await page.evaluate(()=>{p._ws=async()=>({schedule:{points:[]},ambient:p._dashboardAmbient});});
 await page.locator('.smart-brightness [data-nav=brightness]').click();
 assert.equal(await page.evaluate(()=>p._section),'brightness');
});
test('HA missing/unavailable sensors, fallback, pending and offline never show a target as applied',async t=>{
 const page=await fixture(t);
 await page.evaluate(()=>setMode('ha',{config:{mode:'ha',entity_id:''},available:false,effective_mode:'schedule'}));
 assert.equal(await page.locator('.smart-brightness [role=alert]').innerText(),'Pas de capteur sélectionné sur HA — utilisation du planning');
 await page.evaluate(()=>setMode('ha',{available:false,effective_mode:'schedule'}));
 assert.equal(await page.locator('.smart-brightness [role=alert]').innerText(),'Capteur Home Assistant indisponible — utilisation du planning');
 assert.match(await page.locator('.smart-brightness').innerText(),/Mesure HA\s+Indisponible/);
 await page.evaluate(()=>setMode('ha',{effective_mode:'schedule'}));
 assert.match(await page.locator('.smart-brightness').innerText(),/Repli planning/);
 assert.equal(await page.locator('.smart-brightness [role=alert]').count(),0);
 await page.evaluate(()=>{p._dashboardAmbient.firmware.pending=true;p._render();});
 assert.match(await page.locator('.smart-brightness').innerText(),/Luminosité appliquée\s+Non confirmée/);
 await page.evaluate(()=>{p._online=false;p._render();});
 assert.match(await page.locator('.smart-brightness').innerText(),/Mode actif\s+Indisponible/);
 assert.equal(await page.locator('[data-flag]:disabled').count(),5);
});
test('existing status request supplies current summary without extra requests',async t=>{
 const page=await fixture(t);
 const calls=await page.evaluate(async()=>{
  const calls=[];p._hass.callWS=async msg=>{calls.push(msg.type);return {online:true,status:{},ambient:{...p._dashboardAmbient,last_applied:35}};};
  await p._refreshStatus();return calls;
 });
 assert.deepEqual(calls,['rpi2dmd/status']);
 assert.match(await page.locator('.smart-brightness').innerText(),/Luminosité appliquée\s+35 %/);
});
test('dashboard light/dark at desktop and mobile widths has no overflow',async t=>{
 const page=await fixture(t);
 for(const dark of [false,true])for(const width of [1440,820,390,320]){
  await page.setViewportSize({width,height:1000});
  await page.evaluate(dark=>{
   document.body.style.margin='0';
   const vars={'primary-background-color':dark?'#111827':'#f8fafc','secondary-background-color':dark?'#1f2937':'#eef2f7','card-background-color':dark?'#182234':'#fff','primary-text-color':dark?'#f1f5f9':'#172033','secondary-text-color':dark?'#aab8cc':'#526175','divider-color':dark?'#39465a':'#dbe4ee','primary-color':'#0284c7'};
   for(const [key,value] of Object.entries(vars))p.style.setProperty('--'+key,value);
   setMode('ha');
  },dark);
  assert.equal(await page.evaluate(()=>p.shadowRoot.querySelector('main').scrollWidth<=p.shadowRoot.querySelector('main').clientWidth),true,`${width} dark=${dark}`);
  assert.equal(await page.evaluate(()=>{const el=p.shadowRoot.querySelector('.smart-brightness');return el.scrollWidth<=el.clientWidth;}),true);
 }
});
