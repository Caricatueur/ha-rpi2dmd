import asyncio,json,logging,os,secrets,shutil,sys,tempfile
from pathlib import Path
from aiohttp import web,ClientSession
from homeassistant.core import HomeAssistant
from homeassistant import bootstrap,loader
from homeassistant.helpers import entity_registry as er,device_registry as dr
logging.basicConfig(level=logging.WARNING)
REPO=Path(__file__).resolve().parents[1];EVIDENCE=REPO/'docs/validation/fresh-install'
async def main():
 temp=Path(tempfile.mkdtemp(prefix='rpi2dmd-fresh-ha-'));report={'method':'Real HA bootstrap, real config flow and entity platforms; isolated synthetic Raspberry HTTP API','production_used':False,'tests':[]}
 hass=None;runner=None
 try:
  assert not (temp/'custom_components').exists() and not (temp/'.storage').exists()
  dest=temp/'custom_components/rpi2dmd';dest.parent.mkdir();shutil.copytree(REPO/'custom_components/rpi2dmd',dest,ignore=shutil.ignore_patterns('__pycache__'))
  report['tests'].append('Clean configuration: no component, registry, cache or ambient Store before installation')
  sys.path.insert(0,str(temp));os.chdir(temp)
  token=secrets.token_hex(32);mode='schedule';seq=0
  info={'instance_id':'fresh-install-test-device','rpi2dmd_version':'2.8-dev','hostname':'fresh-test','model':'Synthetic Raspberry API','capabilities':{'brightness_control':1}}
  state={'mode':mode,'saved_mode':mode,'source':'schedule','requested':30,'applied':30,'pending':False,'engine':'connected','broker':'connected','epoch':1,'generation':1,'ha_sensor_status':None,'sensor_available':True,'sensor':{'lux':32,'filtered_lux':32,'target':46}}
  schedule=[{'hour':h,'value':30} for h in range(24)]
  async def handler(request):
   path=request.path;body=await request.json() if request.can_read_body else {}
   if path.endswith('/info'):data=info
   elif path.endswith('/pair/start'):return web.json_response({'success':True,'pairing_active':True,'expires_in':300})
   elif path.endswith('/pair/status'):return web.json_response({'pairing_active':True})
   elif path.endswith('/pair/exchange'):
    assert body['code']=='123456';return web.json_response({'success':True,'token':token})
   else:
    if request.headers.get('Authorization')!='Bearer '+token:return web.json_response({'ok':False},status=401)
    if path.endswith('/status'):data={'online':True,'hostname':'fresh-test','cpu_temperature_c':40,'uptime_seconds':100,'services':{'display':{'state':'active'},'mqtt':{'state':'active'}},'mqtt':{'connected':True},'power':{},'display':{'active_flags':['clock','date','gif']}}
    elif path.endswith('/brightness-schedule'):data={'schedule':schedule}
    elif path.endswith('/brightness-control'):
     op=body.get('op')
     if op=='mode':
      m=body['mode'];state.update(mode=m,saved_mode=m,source=m if m!='ha' else 'schedule',applied=46 if m=='local' else 30,requested=46 if m=='local' else 30)
     if 'ha_sensor_status'in body:state['ha_sensor_status']=body['ha_sensor_status']
     if op=='register':state['epoch']+=1
     if op=='set':state.update(source='ha',requested=body['value'],applied=body['value'],pending=False)
     if op=='release':state.update(source='schedule',requested=30,applied=30)
     data=state.copy()
    elif path.endswith('/system'):data={'hostname':'fresh-test'}
    elif path.endswith('/display'):data={'flags':{'clock':True,'date':True,'gif':True}}
    else:data={}
   return web.json_response({'ok':True,'data':data})
  app=web.Application();app.router.add_route('*','/api/v1/{tail:.*}',handler);runner=web.AppRunner(app,access_log=None);await runner.setup();site=web.TCPSite(runner,'127.0.0.1',0);await site.start();port=site._server.sockets[0].getsockname()[1]
  hass=HomeAssistant(str(temp));loader.async_setup(hass)
  result=await bootstrap.async_from_config_dict({'homeassistant':{'name':'Fresh validation','latitude':0,'longitude':0,'elevation':0,'unit_system':'metric','time_zone':'UTC'},'http':{'server_host':'127.0.0.1','server_port':18123},'frontend':{},'config':{}},hass)
  assert result is hass;await hass.async_start()
  integration=await loader.async_get_integration(hass,'rpi2dmd');assert integration.manifest['version']=='0.5.1';report['ha_version']=__import__('homeassistant.const',fromlist=['__version__']).__version__
  report['tests'].append('Manifest 0.5.1 loaded from clean copied component')
  first=await hass.config_entries.flow.async_init('rpi2dmd',context={'source':'user'},data={'host':f'127.0.0.1:{port}'})
  assert first['step_id']=='pairing',first
  done=await hass.config_entries.flow.async_configure(first['flow_id'],{'pairing_code':'123456'});assert done['type']=='create_entry',done
  await hass.async_block_till_done();entry=done['result'];assert entry.state.value=='loaded',entry.state
  import custom_components.rpi2dmd as component
  assert str(component.__file__).startswith(str(dest)),component.__file__
  entities=list(er.async_entries_for_config_entry(er.async_get(hass),entry.entry_id))
  devices=list(dr.async_entries_for_config_entry(dr.async_get(hass),entry.entry_id))
  assert len(entities)==14 and len(devices)==1,(len(entities),len(devices));report['entities']=len(entities);report['devices']=len(devices);report['tests'].append('Real config flow -> loaded integration, 14 entities and one device')
  duplicate=await hass.config_entries.flow.async_init('rpi2dmd',context={'source':'user'},data={'host':f'127.0.0.1:{port}'})
  assert duplicate['type']=='abort' and duplicate['reason']=='already_configured';report['tests'].append('Second add aborts without duplicate device')
  from custom_components.rpi2dmd.websocket import _call
  runtime=hass.data['rpi2dmd'][entry.entry_id];ambient=runtime['ambient'];assert ambient.config['entity_id']=='' and ambient.ha_sensor_status=='not_configured'
  for m in ['schedule','local','ha']:
   await ambient.configure(changes={'mode':m});assert state['mode']==m
  assert state['source']=='schedule';report['tests'].append('Three modes work without legacy configuration; BH1750 selectable; empty HA selection falls back')
  hass.states.async_set('sensor.fresh_lux','32',{'unit_of_measurement':'lx','friendly_name':'Fresh lux'})
  await ambient.configure(changes={'entity_id':'sensor.fresh_lux'});await ambient._run();assert ambient.ha_sensor_status=='ok' and ambient.last_applied==46
  assert state['source']=='ha' and state['applied']==46;report['tests'].append('New lux entity selection -> 32 lx -> 46% acknowledged')
  result=await _call(hass,{'type':'rpi2dmd/brightness/schedule/get','entry_id':entry.entry_id});assert len(result['schedule']['points'])==24
  async with ClientSession() as session:
   async with session.get('http://127.0.0.1:18123/rpi2dmd-panel.js?v=0.5.1') as response:
    assert response.status==200;js=await response.text();assert 'const FRONTEND_VERSION = "0.5.1"' in js
    assert 'Planning horaire' in js and 'Capteur BH1750' in js and 'Home Assistant' in js
  report['tests'].append('HTTP serves frontend 0.5.1; 24-hour schedule available')
  payload=temp/'frontend-validation.json';payload.write_text(json.dumps(ambient.snapshot()))
  process=await asyncio.create_subprocess_exec('node',str(REPO/'tests/fresh-install-frontend.cjs'),str(payload),env=os.environ.copy(),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
  stdout,stderr=await process.communicate();assert process.returncode==0,stderr.decode()
  report['tests'].append('Fresh HTTP frontend renders three enabled modes, HA sensor selector, curve and schedule without cache')
  report['result']='OK';report['physical_raspberry_used']=False
 finally:
  if hass:await hass.async_stop()
  if runner:await runner.cleanup()
  shutil.rmtree(temp);report['cleaned_up']=not temp.exists();EVIDENCE.mkdir(parents=True,exist_ok=True);(EVIDENCE/'result.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report))
if __name__ == '__main__':
 asyncio.run(main())
