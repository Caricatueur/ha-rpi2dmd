"""Transport contract, lease renewal, acknowledgement and reconnect tests."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from aiohttp import ClientSession, web
from homeassistant.core import HomeAssistant

from custom_components.rpi2dmd.api import RPI2DMDClient, RPI2DMDError, RPI2DMDAuthError
from custom_components.rpi2dmd.ambient_transport import AmbientTransport
from custom_components.rpi2dmd.ambient import AmbientController, DEFAULT_CONFIG

INFO = {'capabilities': {'brightness_control': 1}}
STATE = {'mode':'ha','saved_mode':'ha','source':'ha','requested':5,'applied':5,
         'engine':'connected','broker':'connected','pending':False,'generation':1}


@pytest_asyncio.fixture
async def rest():
    data = {'state': deepcopy(STATE), 'calls': [], 'status':200}
    async def handler(request):
        body = await request.json() if request.method == 'PUT' else None
        data['calls'].append((request.method,request.path,request.headers.get('Authorization'),body))
        if request.path.endswith('/info'):
            return web.json_response({'ok':True,'data':INFO})
        if request.headers.get('Authorization') != 'Bearer test-secret':
            return web.json_response({'ok':False},status=401)
        if data['status'] != 200:
            return web.json_response({'ok':False},status=data['status'])
        if body and 'ha_sensor_status' in body:
            data['state']['ha_sensor_status']=body['ha_sensor_status']
        if data.get('emulate') and body:
            if body['op']=='mode':data['state'].update(mode=body['mode'],saved_mode=body['mode'])
            elif body['op']=='set':data['state'].update(source='ha',requested=body['value'],applied=body['value'],pending=False,engine='connected')
            elif body['op']=='register':data['state']['epoch']=data['state'].get('epoch',0)+1
            elif body['op']=='release':data['state'].update(source='schedule',requested=50,applied=50)
        return web.json_response({'ok':True,'data':data['state']})
    app=web.Application();app.router.add_route('*','/api/v1/{tail:.*}',handler)
    runner=web.AppRunner(app);await runner.setup()
    site=web.TCPSite(runner,'127.0.0.1',0);await site.start()
    port=site._server.sockets[0].getsockname()[1]
    async with ClientSession() as session:
        api=RPI2DMDClient(session,f'127.0.0.1:{port}','test-secret')
        yield AmbientTransport(api,INFO),data
    await runner.cleanup()


@pytest.mark.asyncio
async def test_authenticated_transport_fresh_unchanged_lease(rest):
    t,d=rest
    await t.apply(5);await t.apply(5)
    sets=[c for c in d['calls'] if c[3] and c[3]['op']=='set']
    assert [c[3]['seq'] for c in sets]==[1,2]
    assert all(c[1]=='/api/v1/display/brightness-control' and c[2]=='Bearer test-secret' for c in d['calls'])
    assert all(c[3]['ttl']==300 and c[3]['fresh_for']==300 for c in sets)
    assert sum(c[3] is not None and c[3]['op']=='register' for c in d['calls'])==1


@pytest.mark.asyncio
@pytest.mark.parametrize('patch',[{'pending':True},{'applied':6},{'engine':'disconnected'},{'source':'schedule'},{'applied':None}])
async def test_sent_command_never_implies_applied(rest,patch):
    t,d=rest;d['state'].update(patch)
    with pytest.raises(RPI2DMDError):await t.apply(5)
    assert t.state is None and not t.registered


@pytest.mark.asyncio
async def test_connection_error_and_recovery(rest):
    t,d=rest;d['status']=503
    with pytest.raises(RPI2DMDError):await t.apply(5)
    d['status']=200;await t.apply(5)
    assert t.state['applied']==5
    old_session=t.session
    d['status']=401
    with pytest.raises(RPI2DMDAuthError):await t.refresh()
    assert t.state is None and t.session != old_session and t.seq == 0


@pytest.mark.asyncio
async def test_capability_rechecked_after_offline_setup(rest):
    t,_=rest;t.supported=False
    await t.refresh();assert t.supported


@pytest.mark.asyncio
async def test_modes_release_and_saved_mode(rest):
    t,d=rest
    for mode in ('schedule','local','ha'):
        d['state'].update(mode=mode,saved_mode=mode)
        await t.select_mode(mode)
    await t.apply(5)
    d['state'].update(source='schedule',applied=50)
    await t.release()
    assert d['calls'][-1][3]['op']=='release'
    d['state']['saved_mode']='local'
    with pytest.raises(RPI2DMDError):await t.select_mode('ha')


@pytest.mark.asyncio
async def test_real_controller_renews_without_changing_value_or_store(tmp_path,rest):
    t,d=rest;hass=HomeAssistant(str(tmp_path));now=[100.]
    c=AmbientController(hass,'lease',t,clock=lambda:now[0])
    c.store=SimpleNamespace(async_load=AsyncMock(return_value={**deepcopy(DEFAULT_CONFIG),'mode':'ha','entity_id':'sensor.lux','delay':3600}),async_save=AsyncMock())
    hass.states.async_set('sensor.lux','0',{'unit_of_measurement':'lx'})
    try:
        await c.start();await c._run()
        assert len([x for x in d['calls'] if x[3] and x[3]['op']=='set'])==1
        now[0]+=60;await c._run()
        assert len([x for x in d['calls'] if x[3] and x[3]['op']=='set'])==2
        c.store.async_save.assert_not_called()
        assert 0 < c._timer.when()-hass.loop.time() <= 30
        d['state'].update(mode='local',source='local',applied=30)
        now[0]+=30;await c._run()
        assert c.config['mode']=='local' and c._unsubscribe is not None
        assert len([x for x in d['calls'] if x[3] and x[3]['op']=='set'])==2
        assert c.snapshot()['last_applied']==30
    finally:
        await c.stop();await hass.async_stop()

@pytest_asyncio.fixture
async def permanent(tmp_path, rest):
    t,d=rest
    d['emulate']=True
    d['state'].update(mode='ha',saved_mode='ha',source='schedule',requested=50,applied=50,epoch=3,generation=100,ha_sensor_status=None)
    hass=HomeAssistant(str(tmp_path));now=[100.]
    hass.states.async_set('sensor.node130','32',{'unit_of_measurement':'lx'})
    hass.states.async_set('sensor.other','0',{'unit_of_measurement':'lx'})
    c=AmbientController(hass,'permanent',t,clock=lambda:now[0])
    c.store=SimpleNamespace(async_load=AsyncMock(return_value={**deepcopy(DEFAULT_CONFIG),'mode':'local','entity_id':'sensor.node130'}),async_save=AsyncMock())
    await c.start()
    yield hass,c,t,d,now
    await c.stop();await hass.async_stop()


@pytest.mark.asyncio
async def test_saved_sensor_activated_from_broker_and_unchanged_renewal(permanent):
    hass,c,t,d,now=permanent
    assert c.available and c.last_lux==32 and c.config['mode']=='ha'
    await c._run();assert c.last_applied==46
    now[0]+=60;await c._run()
    sets=[r[3] for r in d['calls'] if r[3] and r[3]['op']=='set']
    assert [r['value'] for r in sets]==[46,46]
    c.store.async_save.assert_not_called()
    assert not any(r[3] and r[3]['op']=='mode' for r in d['calls'])


@pytest.mark.asyncio
async def test_external_modes_read_now_without_echo_and_constant_sensor_reactivated(permanent):
    _,c,t,d,_=permanent
    await c._run()
    for mode in ('schedule','ha','local','ha'):
        d['state'].update(mode=mode,saved_mode=mode,source='schedule',applied=50)
        await c.refresh()
        assert c.config['mode']==mode
        assert bool(c._unsubscribe)==bool(c.config['entity_id'])
        await c._run()
        if mode=='ha':assert c.snapshot()['last_applied']==46
    assert not any(r[3] and r[3]['op']=='mode' for r in d['calls'])
    assert c.config['entity_id']=='sensor.node130'


@pytest.mark.asyncio
async def test_sensor_selection_persists_and_applies_without_mode_write(permanent):
    _,c,t,d,_=permanent
    await c._run()
    await c.configure(changes={'entity_id':'sensor.other'})
    await c._run()
    assert c.last_lux==0 and c.last_applied==5
    assert c.config['entity_id']=='sensor.other'
    c.store.async_save.assert_awaited_once()
    assert not any(r[3] and r[3]['op']=='mode' for r in d['calls'])


@pytest.mark.asyncio
async def test_sensor_loss_and_constant_return_reacquire_without_manual_mode(permanent):
    hass,c,t,d,now=permanent
    await c._run()
    hass.states.async_set('sensor.node130','unavailable',{'unit_of_measurement':'lx'})
    await hass.async_block_till_done();now[0]+=300
    d['state'].update(source='schedule',requested=50,applied=50)
    await c._run();assert c.snapshot()['effective_mode']=='schedule'
    assert c.config['mode']=='ha'
    hass.states.async_set('sensor.node130','32',{'unit_of_measurement':'lx'})
    await hass.async_block_till_done();await c._run()
    assert c.last_applied==46 and c.snapshot()['effective_mode']=='ha'


@pytest.mark.asyncio
async def test_broker_restart_and_connection_return_reacquire_immediately(permanent):
    _,c,t,d,now=permanent
    await c._run();session=t.session
    d['state'].update(source='schedule',applied=50,generation=1,epoch=1)
    await c._run()
    assert t.session!=session and c.last_applied==46
    d['status']=503;await c._run()
    assert c.snapshot()['last_applied'] is None
    assert c._timer.when()-c.hass.loop.time()>=9
    d['status']=200;d['state'].update(source='schedule',applied=50)
    await c._run();assert c.last_applied==46


@pytest.mark.asyncio
async def test_saving_curve_settings_cannot_echo_stale_mode(permanent):
    _,c,t,d,_=permanent
    await c._run()
    d['state'].update(mode='local',saved_mode='local',source='local',applied=7)
    await c.configure(changes={'delay':60,'points':deepcopy(DEFAULT_CONFIG['points'])})
    assert c.config['mode']=='local' and c.config['entity_id']=='sensor.node130'
    assert c.config['delay']==60
    assert not any(r[3] and r[3]['op']=='mode' for r in d['calls'])


@pytest.mark.asyncio
async def test_explicit_status_events_and_no_periodic_status_traffic(permanent):
    hass,c,t,d,now=permanent
    assert c.ha_sensor_status=='ok' and d['state']['ha_sensor_status']=='ok'
    await c._run()
    sets=[r[3] for r in d['calls'] if r[3] and r[3]['op']=='set']
    assert sets[-1]['ha_sensor_status']=='ok'
    initial_status_calls=len([r for r in d['calls'] if r[3] and r[3]['op']=='sensor_status'])
    now[0]+=60;await c._run()
    assert len([r for r in d['calls'] if r[3] and r[3]['op']=='sensor_status'])==initial_status_calls
    for value in ('unavailable','unknown','garbage','-1','nan','inf'):
        hass.states.async_set('sensor.node130',value,{'unit_of_measurement':'lx'})
        await hass.async_block_till_done()
        assert c.ha_sensor_status=='unavailable' and d['state']['ha_sensor_status']=='unavailable'
    hass.states.async_set('sensor.node130','32',{'unit_of_measurement':'lx'})
    await hass.async_block_till_done()
    assert d['state']['ha_sensor_status']=='ok'
    await c.configure(changes={'entity_id':''});await hass.async_block_till_done()
    assert c.ha_sensor_status=='not_configured' and d['state']['ha_sensor_status']=='not_configured'
    await c.configure(changes={'entity_id':'sensor.other'});await hass.async_block_till_done()
    assert d['state']['ha_sensor_status']=='ok'


@pytest.mark.asyncio
async def test_metadata_republished_after_bridge_restart_and_network_return(permanent):
    _,c,t,d,_=permanent
    d['state']['ha_sensor_status']=None
    await c.refresh();assert d['state']['ha_sensor_status']=='ok'
    d['status']=503;await c.refresh()
    d['status']=200;d['state']['ha_sensor_status']=None
    await c.refresh();assert d['state']['ha_sensor_status']=='ok'
    c.store.async_save.assert_not_called()


@pytest.mark.asyncio
async def test_sensor_status_follows_selected_entity_in_other_modes(permanent):
    hass,c,t,d,_=permanent
    d['state'].update(mode='local',saved_mode='local',source='local')
    await c.refresh()
    timer=c._timer
    hass.states.async_set('sensor.node130','unknown',{'unit_of_measurement':'lx'})
    await hass.async_block_till_done()
    assert c._timer is timer
    assert d['state']['ha_sensor_status']=='unavailable'
    assert not any(r[3] and r[3]['op']=='set' for r in d['calls'])
    assert not any(r[3] and r[3]['op']=='mode' for r in d['calls'])


@pytest.mark.asyncio
@pytest.mark.parametrize('value,unit,status,lux', [
    ('32','lx','ok',32), ('0','lx','ok',0),
    ('unavailable','lx','unavailable',None), ('unknown','lx','unavailable',None),
    ('garbage','lx','unavailable',None), ('32','invalid','unavailable',None),
])
async def test_sensor_status_values(permanent,value,unit,status,lux):
    hass,c,t,d,_=permanent
    hass.states.async_set('sensor.node130',value,{'unit_of_measurement':unit})
    await hass.async_block_till_done()
    assert c.ha_sensor_status==status and d['state']['ha_sensor_status']==status
    if lux is not None:
        await c._run()
        assert c.last_lux==lux and c.last_applied==(46 if lux==32 else 5)
    else:
        assert c.snapshot()['target'] is None


@pytest.mark.asyncio
async def test_missing_sensor_and_no_sensor_at_start(permanent):
    _,c,t,d,_=permanent
    await c.configure(changes={'entity_id':'sensor.missing'})
    await c.hass.async_block_till_done()
    assert c.ha_sensor_status=='unavailable'
    await c.configure(changes={'entity_id':''})
    other=AmbientController(c.hass,'empty',t)
    other.store=SimpleNamespace(async_load=AsyncMock(return_value=None),async_save=AsyncMock())
    try:
        await other.start()
        assert other.ha_sensor_status=='not_configured'
        assert d['state']['ha_sensor_status']=='not_configured'
        assert other.snapshot()['target'] is None
    finally:
        await other.stop()


@pytest.mark.asyncio
async def test_quick_sensor_return_resends_command_immediately(permanent):
    hass,c,t,d,now=permanent
    await c._run();count=c.command_count
    hass.states.async_set('sensor.node130','unavailable',{'unit_of_measurement':'lx'})
    await hass.async_block_till_done()
    now[0]+=1
    hass.states.async_set('sensor.node130','32',{'unit_of_measurement':'lx'})
    await hass.async_block_till_done();await c._run()
    assert c.command_count==count+1 and c.last_applied==46
    assert d['state']['ha_sensor_status']=='ok'


@pytest.mark.asyncio
async def test_new_session_republishes_even_when_remote_status_matches(permanent):
    _,c,t,d,_=permanent
    session=t.session;t._invalidate()
    await c.refresh()
    assert t.session!=session
    assert d['calls'][-1][3]=={'op':'sensor_status','ha_sensor_status':'ok'}


@pytest.mark.asyncio
async def test_legacy_bridge_keeps_existing_command_contract(rest):
    t,d=rest;d['emulate']=True
    await t.refresh();await t.publish_sensor_status('ok');await t.apply(5)
    assert t.state['applied']==5
    commands=[r[3] for r in d['calls'] if r[3]]
    assert [r['op'] for r in commands]==['register','set']
    assert all('ha_sensor_status' not in r for r in commands)


@pytest.mark.asyncio
async def test_previous_entity_events_ignored_after_selection(permanent):
    hass,c,t,d,_=permanent
    await c.configure(changes={'entity_id':'sensor.other'})
    await hass.async_block_till_done()
    hass.states.async_set('sensor.node130','unavailable',{'unit_of_measurement':'lx'})
    await hass.async_block_till_done();await c._run()
    assert c.ha_sensor_status=='ok' and c.last_lux==0 and c.last_applied==5
