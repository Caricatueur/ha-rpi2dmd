#!/usr/bin/env python3
"""Narrow www-data API: status and explicit mode only; broker retains control."""
import grp,json,os,socket,time
from pathlib import Path
from brightness_broker import rpc
from brightness_mode_store import MODES,read_mode,save_mode
SOCKET='/run/rpi2dmd-brightness-web/api.sock'
BROKER='/run/rpi2dmd-brightness/broker.sock'
def request(message,broker=BROKER,store=None):
    if not isinstance(message,dict) or message.get('op') not in ('get','mode','register','set','release'):raise ValueError('operation')
    state=rpc(broker,{'op':'get'})
    if message['op']=='mode':
        mode=message.get('mode')
        if mode not in MODES:raise ValueError('mode')
        previous=state['mode']
        state=rpc(broker,{'op':'mode','mode':mode})
        if state['mode'] != mode:raise ValueError('broker has not confirmed selected mode')
        # Mode selection is acknowledged by the broker. Renderer ACK remains
        # a separate applied/pending state, including during GIF transitions.
        try:
            if store is None:save_mode(mode)
            else:save_mode(mode,store)
        except Exception:
            rpc(broker,{'op':'mode','mode':previous})
            raise
    if message['op'] in ('register','set','release'):
        allowed = {'register': {'op','session'}, 'set': {'op','session','seq','value','ttl','fresh_for'},
                   'release': {'op','session','seq'}}[message['op']]
        if set(message) - allowed: raise ValueError('unexpected field')
        if message['op'] == 'set' and state['mode'] != 'ha': raise ValueError('HA mode is not selected')
        state=rpc(broker,dict(message,source='ha'))
        if message['op'] != 'register':
            end=time.monotonic()+2
            while time.monotonic()<end:
                state=rpc(broker,{'op':'get'})
                if state['engine']=='connected' and not state['pending']:break
                time.sleep(.025)
            # An accepted lease is not an applied value. Return pending explicitly.
    state['broker']='connected'
    state['saved_mode']=read_mode() if store is None else read_mode(store)
    state['fallback_reason']=('affichage en pause' if state.get('requested')==0 and state.get('effective_schedule')==[0]*24 and state['schedule']!=[0]*24 else 'capteur indisponible ou mesure périmée' if state['mode']=='local' and state['source']=='schedule' else 'aucune consigne Home Assistant valide' if state['mode']=='ha' and state['source']=='schedule' else None)
    return state

def serve():
    path=Path(SOCKET)
    if path.exists():path.unlink()
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as listener:
        listener.bind(SOCKET);os.chown(SOCKET,0,grp.getgrnam('www-data').gr_gid);os.chmod(SOCKET,0o660);listener.listen(8)
        while True:
            conn,_=listener.accept()
            with conn:
                conn.settimeout(3)
                try:
                    raw=conn.makefile('rb').readline(1025)
                    if len(raw)>1024:raise ValueError('request too large')
                    reply=request(json.loads(raw))
                except (ValueError,OSError,KeyError) as exc:reply={'ok':False,'error':str(exc)}
                try:conn.sendall(json.dumps(reply).encode()+b'\n')
                except OSError:pass
if __name__=='__main__':serve()
