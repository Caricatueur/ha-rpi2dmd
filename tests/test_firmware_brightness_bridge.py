"""Exercise the deployed narrow bridge against a broker RPC double."""
import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock

import pytest


@pytest.fixture
def bridge(monkeypatch):
    broker=ModuleType('brightness_broker');broker.rpc=Mock()
    modes=ModuleType('brightness_mode_store');modes.MODES=('schedule','local','ha')
    modes.read_mode=Mock(return_value='ha');modes.save_mode=Mock()
    monkeypatch.setitem(sys.modules,'brightness_broker',broker)
    monkeypatch.setitem(sys.modules,'brightness_mode_store',modes)
    path=Path(__file__).resolve().parents[1]/'firmware/brightness-ha/brightness_web_service.py'
    spec=importlib.util.spec_from_file_location('brightness_web_test',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    state={'ok':True,'mode':'ha','source':'ha','engine':'connected','pending':False,'requested':42,'applied':42,'schedule':[50]*24}
    def rpc(path,message):
        if message['op']=='mode':state['mode']=message['mode']
        return dict(state)
    broker.rpc.side_effect=rpc
    return module,broker,modes,state


def test_source_is_forced_ha_and_commands_never_save(bridge):
    m,b,modes,_=bridge
    for message in ({'op':'register','session':'s'}, {'op':'set','session':'s','seq':1,'value':42,'ttl':300,'fresh_for':300}, {'op':'release','session':'s','seq':1}):
        assert m.request(message)['applied']==42
        assert any(call.args[1]==dict(message,source='ha') for call in b.rpc.call_args_list)
    modes.save_mode.assert_not_called()


@pytest.mark.parametrize('message',[{'op':'attach'},{'op':'plan','values':[1]*24},{'op':'set','source':'local'},{'op':'set','engine':1}])
def test_private_operations_and_source_injection_rejected(bridge,message):
    with pytest.raises(ValueError):bridge[0].request(message)


def test_set_rejected_outside_ha(bridge):
    m,b,modes,state=bridge;state['mode']='local'
    with pytest.raises(ValueError):m.request({'op':'set','session':'s','seq':1,'value':42,'ttl':300,'fresh_for':300})
    assert not any(c.args[1]['op']=='set' for c in b.rpc.call_args_list)


def test_pending_is_explicit_and_never_persisted(bridge,monkeypatch):
    m,_,modes,state=bridge;state.update(pending=True,applied=None)
    ticks=iter([0,0,3]);monkeypatch.setattr(m.time,'monotonic',lambda:next(ticks))
    monkeypatch.setattr(m.time,'sleep',lambda _:None)
    result=m.request({'op':'set','session':'s','seq':1,'value':42,'ttl':300,'fresh_for':300})
    assert result['pending'] and result['applied'] is None
    modes.save_mode.assert_not_called()


def test_mode_saved_after_broker_ack(bridge):
    m,_,modes,state=bridge
    m.request({'op':'mode','mode':'ha'});modes.save_mode.assert_called_once_with('ha')


def test_selected_mode_persists_during_renderer_transition(bridge):
    m,_,modes,state=bridge;state.update(engine='disconnected',pending=True,applied=None)
    result=m.request({'op':'mode','mode':'ha'})
    modes.save_mode.assert_called_once_with('ha')
    assert result['mode']=='ha' and result['pending'] and result['applied'] is None


def test_failed_persistence_rolls_mode_back(bridge):
    m,b,modes,state=bridge;state['mode']='local';modes.save_mode.side_effect=OSError('disk failure')
    with pytest.raises(OSError):m.request({'op':'mode','mode':'ha'})
    assert b.rpc.call_args.args[1]=={'op':'mode','mode':'local'}
