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
    const p=window.p=document.createElement('rpi2dmd-panel');document.body.append(p);
    p._entry='one';p._online=true;p._section='brightness';p._bannerChecked=true;
    window.calls=[];
    p._ambient={firmware_required:true,last_lux:0,config:{mode:'schedule',entity_id:'sensor.lux',delay:20,minimum_change:5,points:[{lux:0,value:5},{lux:5,value:15},{lux:15,value:30},{lux:30,value:45},{lux:60,value:60},{lux:100,value:80},{lux:140,value:100}]}};
    p._hass={states:{'sensor.lux':{entity_id:'sensor.lux',state:'0',attributes:{unit_of_measurement:'lx'}},'sensor.temperature':{entity_id:'sensor.temperature',state:'20',attributes:{unit_of_measurement:'°C'}}}};
    p._wsWrite=async(type,body)=>{calls.push({type,...body});return {ambient:{...p._ambient,config:body.config||{...p._ambient.config,...body.changes},selected_mode:body.config?.mode||body.changes?.mode||p._ambient.config.mode}};};
    p._render();
  });
  return page;
}
test('modes, lx selector, zero and last valid measure; no sensor polling',async t=>{
  const page=await fixture(t);
  assert.equal(await page.locator('#ambient-mode option').count(),3);
  assert.equal(await page.locator('#ambient-mode option[value=local]').evaluate(el=>el.disabled),true);
  assert.equal(await page.locator('#ambient-entity option').count(),2);
  assert.equal(await page.locator('#ambient-measure').textContent(),'0 lx');
  await page.evaluate(()=>{p._hass.states['sensor.lux'].state='unavailable';p._updateAmbientMeasure();});
  assert.match(await page.locator('#ambient-measure').textContent(),/Indisponible.*0 lx/);
  assert.deepEqual(await page.evaluate(()=>calls),[]);
});
test('add, sort, reject duplicates, remove, save HA config without writing schedule',async t=>{
  const page=await fixture(t);
  await page.locator('#ambient-add').click();
  assert.equal(await page.locator('[data-ambient-lux]').count(),8);
  await page.locator('[data-ambient-lux="7"]').fill('2');
  await page.locator('[data-ambient-lux="7"]').press('Tab');
  assert.equal(await page.locator('[data-ambient-lux="1"]').inputValue(),'2');
  await page.locator('[data-ambient-lux="1"]').fill('0');
  await page.locator('#ambient-save').click();
  assert.match(await page.locator('#ambient-error').textContent(),/uniques/);
  assert.equal(await page.evaluate(()=>calls.length),0);
  await page.locator('[data-ambient-lux="1"]').fill('2');
  await page.locator('[data-ambient-lux="1"]').press('Tab');
  await page.locator('[data-ambient-remove="1"]').click();
  assert.equal(await page.locator('[data-ambient-lux]').count(),7);
  await page.locator('#ambient-mode').selectOption('ha');
  await page.locator('#ambient-save').click();
  const calls=await page.evaluate(()=>window.calls);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].changes,{mode:"ha"});
  assert.equal(calls[1].type,'rpi2dmd/brightness/ambient/update');
  assert.equal('mode' in calls[1].changes,false);
  assert.deepEqual(calls[1].changes.points.map(p=>p.lux),[0,5,15,30,60,100,140]);
});
test('three firmware modes and fallback are distinct; pending brightness is not applied',async t=>{
  const page=await fixture(t);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    p._ambient={...p._ambient,firmware_required:false,selected_mode:'ha',effective_mode:'schedule',last_applied:null,target:42,firmware:{broker:'connected',engine:'disconnected',pending:true,requested:42,sensor_available:true,sensor:{lux:16.7},fallback_reason:'aucune consigne Home Assistant valide'}};
    p._ambient.config.mode='ha';p._render();
  });
  assert.equal(await page.locator('#ambient-mode option[value=local]').evaluate(el=>el.disabled),false);
  const status=await page.locator('#ambient-status').textContent();
  assert.doesNotMatch(status,/Mode sélectionné|Broker|Moteur/);
  assert.match(status,/Source active : Planning/);
  assert.match(status,/Luminosité acquittée : Non confirmée/);
  assert.doesNotMatch(status,/BH1750 : 16.7 lx/);
  assert.doesNotMatch(status,/Cible HA/);
  assert.doesNotMatch(status,/Consigne Raspberry/);
  await page.evaluate(()=>{p._ambient.last_applied=42;p._ambient.effective_mode='ha';p._ambient.firmware.engine='connected';p._ambient.firmware.pending=false;p._render();});
  assert.match(await page.locator('#ambient-status').textContent(),/Luminosité acquittée : 42 %/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);
  await page.locator('#ambient-mode').selectOption('local');await page.locator('#ambient-save').click();
  assert.equal(await page.evaluate(()=>calls[0].changes.mode),'local');
});

test('sensor selection saves immediately and remote mode replaces stale UI while curve draft survives',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{
    p._hass.states['sensor.second']={entity_id:'sensor.second',state:'32',attributes:{unit_of_measurement:'lx'}};
    p._render();
  });
  await page.locator('#ambient-entity').selectOption('sensor.second');
  assert.deepEqual(await page.evaluate(()=>calls[0].changes),{entity_id:'sensor.second'});
  await page.locator('#ambient-delay').fill('60');
  await page.evaluate(async()=>{
    p._ws=async(type)=>type==='rpi2dmd/status'?{online:true,status:{}}:{ambient:{...p._ambient,selected_mode:'ha',config:{...p._ambient.config,mode:'ha',delay:20}}};
    await p._refreshStatus();
  });
  assert.equal(await page.locator('#ambient-mode').inputValue(),'ha');
  assert.equal(await page.locator('#ambient-delay').inputValue(),'60');
  assert.equal(await page.evaluate(()=>calls.length),1);
});

test('visual mode cards use confirmed selection, curve input draft survives refresh, pending ACK stays unconfirmed',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{p._ambient.firmware_required=false;p._ambient.selected_mode='schedule';p._ambient.effective_mode='schedule';p._ambient.firmware={engine:'connected',broker:'connected',pending:false};p._render();});
  assert.equal(await page.locator('[data-ambient-mode][aria-pressed=true]').getAttribute('data-ambient-mode'),'schedule');
  await page.locator('[data-ambient-mode=ha]').click();
  assert.deepEqual(await page.evaluate(()=>calls[0].changes),{mode:'ha'});
  assert.equal(await page.locator('[data-ambient-mode=ha]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-ambient-lux="1"]').fill('6');
  await page.evaluate(()=>{p._ambient=p._ambientMerge({...p._ambient,config:{...p._ambient.config,points:[{lux:0,value:5},{lux:5,value:15}]}});p._render();});
  assert.equal(await page.locator('[data-ambient-lux="1"]').inputValue(),'6');
  await page.evaluate(()=>{p._ambient.last_applied=46;p._ambient.firmware.pending=true;p._render();});
  assert.match(await page.locator('#ambient-status').textContent(),/Luminosité acquittée : Non confirmée/);
  assert.equal(await page.locator('.bd-curve circle').count(),7);
});

test('brightness dashboard layouts fit light/dark desktop, tablet and mobile without overflow',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{
    p._ambient={...p._ambient,firmware_required:false,selected_mode:'ha',effective_mode:'ha',last_applied:46,target:46,available:true,firmware:{engine:'connected',broker:'connected',pending:false,requested:46,sensor_available:true,sensor:{lux:22.5,filtered_lux:22.5,target:38}}};p._ambient.config.mode='ha';
    p._devices=[{entry_id:'one',name:'RPI2DMD'}];p._brightnessSchedule={enabled:true,points:Array.from({length:24},(_,hour)=>({hour,value:hour<8?0:50}))};p._render();
  });
  const fs=require('node:fs');fs.mkdirSync('docs/design-ha',{recursive:true});
  for(const dark of [false,true]){
    await page.evaluate(dark=>{const vars=dark?{'primary-background-color':'#111827','card-background-color':'#1f2937','secondary-background-color':'#263449','primary-text-color':'#f1f5f9','secondary-text-color':'#a6b4c9','divider-color':'#39465b','primary-color':'#38bdf8','text-primary-color':'#082f49'}:{'primary-background-color':'#f5f8fc','card-background-color':'#ffffff','secondary-background-color':'#f1f5f9','primary-text-color':'#172c46','secondary-text-color':'#62758f','divider-color':'#dfe7f0','primary-color':'#0879ce','text-primary-color':'#ffffff'};for(const [k,v] of Object.entries(vars))document.documentElement.style.setProperty('--'+k,v);document.body.style.margin='0';},dark);
    for(const width of [1440,820,390,320]){
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${dark?'dark':'light'} ${width}`);
      assert.equal(await page.locator('.schedule-row').count(),24);
      const cards=await page.locator('#ambient-status .bd-stat').all();assert.equal(cards.length,2);
      const first=await cards[0].boundingBox(),second=await cards[1].boundingBox(),grid=await page.locator('#ambient-status').boundingBox();
      assert.ok(Math.abs(first.y-second.y)<1);assert.ok(Math.abs(second.x+second.width-grid.x-grid.width)<1,'HA cards fill row');
      const header=await page.locator('.hero').boundingBox(),controls=await page.locator('.hero-overlay').boundingBox();assert.ok(controls.y+controls.height<=header.y+header.height+1,'header controls remain visible');
      if(width===1440||width===390)await page.screenshot({path:`docs/design-ha/brightness-${dark?'dark':'light'}-${width}.png`,fullPage:true});
    }
  }
});


test('compact summary follows mode and data, keeps zero, and diagnostics move to System',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{
    p._ambient={...p._ambient,firmware_required:false,selected_mode:'local',effective_mode:'local',target:42,last_applied:0,firmware:{broker:'connected',engine:'connected',pending:false,requested:0,sensor_available:true,sensor:{lux:0,filtered_lux:0,target:0}}};p._render();
  });
  let summary=await page.locator('#ambient-status').textContent();
  assert.match(summary,/BH1750 : 0 lx/);
  assert.match(summary,/Cible BH1750 : 0 %/);
  assert.match(summary,/Consigne Raspberry : 0 %/);
  assert.doesNotMatch(summary,/Cible HA|Mode sélectionné|Broker|Moteur/);
  assert.equal(await page.getByText('Du capteur au DMD',{exact:true}).count(),0);
  assert.equal(await page.locator('.brightness-brand').getAttribute('aria-label'),'RPI2DMD');
  await page.evaluate(()=>{p._ambient.selected_mode='schedule';p._render();});
  assert.match(await page.locator('#ambient-status').textContent(),/Consigne Raspberry : 0 %/);
  assert.doesNotMatch(await page.locator('#ambient-status').textContent(),/Cible HA|Cible BH1750|BH1750 :/);
  await page.evaluate(()=>{p._ambient.selected_mode='ha';p._render();});
  summary=await page.locator('#ambient-status').textContent();
  assert.deepEqual(await page.evaluate(()=>[p._ambient.target,p._ambient.firmware.requested,p._ambient.last_applied]),[42,0,0]);
  assert.match(summary,/Luminosité acquittée : 0 %/);
  assert.doesNotMatch(summary,/Cible HA|Consigne Raspberry/);assert.doesNotMatch(summary,/BH1750 :|Cible BH1750/);
  await page.evaluate(()=>{p._ambient.target=null;p._ambient.firmware.requested=null;p._render();});
  assert.equal(await page.locator('#ambient-status .bd-stat').count(),2);
  assert.equal(await page.evaluate(()=>p._ambient.target),null);
  await page.evaluate(async()=>{
    window.reads=[];p._ws=async(type)=>{reads.push(type);return type==='rpi2dmd/status'?{online:true,status:{}}:{system:{brightness_control:{broker:'connected',engine:'disconnected'}}};};
    await p._loadSection('system');
  });
  assert.deepEqual(await page.evaluate(()=>reads),['rpi2dmd/system']);
  assert.match(await page.locator('.system-diagnostics').textContent(),/BrokerConnecté.*MoteurDéconnecté/);
  assert.equal(await page.evaluate(()=>calls.length),0);
  await page.evaluate(async()=>{await p._refreshStatus();});
  assert.deepEqual(await page.evaluate(()=>reads),['rpi2dmd/system','rpi2dmd/status']);
  assert.match(await page.locator('.system-diagnostics').textContent(),/BrokerConnecté.*MoteurDéconnecté/);
  await page.evaluate(()=>{p._online=false;p._render();});
  assert.doesNotMatch(await page.locator('.system-diagnostics').textContent(),/Connecté/);
});
