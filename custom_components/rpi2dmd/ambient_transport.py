"""Authenticated REST transport to the firmware's restricted brightness bridge."""
import asyncio
from uuid import uuid4

from .api import RPI2DMDError


class AmbientTransport:
    renewal_seconds = 60

    def __init__(self, api, info):
        self.api = api
        self.supported = info.get('capabilities', {}).get('brightness_control') == 1
        self.state = None
        self.session = uuid4().hex
        self.seq = 0
        self.registered = False
        self.ha_sensor_status = None
        self._status_session = None

    def _invalidate(self):
        self.state = None
        self.registered = False
        # The broker retires superseded sessions; reconnect with a fresh epoch.
        self.session = uuid4().hex
        self.seq = 0

    async def refresh(self):
        try:
            if not self.supported:
                info = await self.api.async_get_info()
                self.supported = info.get('capabilities', {}).get('brightness_control') == 1
            if self.supported:
                previous = self.state
                state = await self.api.async_get_brightness_control()
                if previous and any(state.get(key, 0) < previous.get(key, 0) for key in ("epoch", "generation")):
                    self._invalidate()
                self.state = state
            return self.state
        except Exception:
            self._invalidate()
            raise

    async def select_mode(self, mode):
        if not self.supported:
            raise RPI2DMDError('Firmware brightness API unavailable')
        try:
            self.state = await self.api.async_brightness_control({'op': 'mode', 'mode': mode})
            if self.state.get('mode') != mode or self.state.get('saved_mode') != mode:
                raise RPI2DMDError('Brightness mode not confirmed')
        except Exception:
            self._invalidate()
            raise

    async def _command(self, message, source, value=None):
        try:
            self.state = await self.api.async_brightness_control(self._sensor_metadata(message))
            for _ in range(5):
                s = self.state
                if (s.get('engine') == 'connected' and s.get('pending') is False
                        and s.get('source') == source and type(s.get('applied')) is int
                        and (value is None or s['applied'] == value)):
                    return
                await asyncio.sleep(.2)
                await self.refresh()
            raise RPI2DMDError('Brightness engine acknowledgement pending')
        except Exception:
            self._invalidate()
            raise

    def _sensor_metadata(self, message):
        if self.ha_sensor_status is not None and self.state is not None and 'ha_sensor_status' in self.state:
            return {**message, 'ha_sensor_status': self.ha_sensor_status}
        return message

    async def publish_sensor_status(self, status):
        if status not in ('ok', 'not_configured', 'unavailable'):
            raise ValueError('Invalid HA sensor status')
        self.ha_sensor_status = status
        # A legacy bridge omits this field: keep its working command contract.
        if not self.supported or self.state is None or 'ha_sensor_status' not in self.state:
            return
        if self._status_session == self.session and self.state.get('ha_sensor_status') == status:
            return
        try:
            reply = await self.api.async_brightness_control({'op': 'sensor_status', 'ha_sensor_status': status})
            if reply.get('ha_sensor_status') != status:
                raise RPI2DMDError('HA sensor status not confirmed')
            self._status_session = self.session
            if self.state is not None:
                self.state['ha_sensor_status'] = status
        except Exception:
            self._invalidate()
            raise

    async def apply(self, value):
        try:
            if not self.registered:
                self.state = await self.api.async_brightness_control(self._sensor_metadata({'op': 'register', 'session': self.session}))
                self.registered = True
            self.seq += 1
            # A fresh set renews freshness for an unchanged, still-valid HA state.
            await self._command({'op': 'set', 'session': self.session, 'seq': self.seq,
                                 'value': value, 'ttl': 300, 'fresh_for': 300}, 'ha', value)
        except Exception:
            self._invalidate()
            raise

    async def release(self):
        if self.registered and self.seq:
            await self._command({'op': 'release', 'session': self.session, 'seq': self.seq}, 'schedule')
