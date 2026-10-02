"""Event-driven ambient brightness with the broker as mode authority."""
from __future__ import annotations

import asyncio
from copy import deepcopy
import math
import logging
from time import monotonic

from homeassistant.core import callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store

DEFAULT_CONFIG = {
    "mode": "schedule", "entity_id": "", "delay": 20, "minimum_change": 5,
    "points": [{"lux": lux, "value": value} for lux, value in
               [(0, 5), (5, 15), (15, 30), (30, 45), (60, 60), (100, 80), (140, 100)]],
}
FALLBACK_SECONDS = 300
_LOGGER = logging.getLogger(__name__)


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("Une valeur numérique finie est requise.")
    return value


def validate_config(raw):
    if not isinstance(raw, dict):
        raise ValueError("Configuration du capteur invalide.")
    result = deepcopy(DEFAULT_CONFIG)
    result.update(raw)
    if result["mode"] not in ("schedule", "ha", "local"):
        raise ValueError("Mode de luminosité invalide.")
    entity = result["entity_id"]
    if not isinstance(entity, str) or (entity and not entity.startswith("sensor.")):
        raise ValueError("Sélectionnez une entité sensor en lx.")
    if not 1 <= number(result["delay"]) <= 3600:
        raise ValueError("La temporisation doit être comprise entre 1 et 3600 secondes.")
    if not 0 <= number(result["minimum_change"]) <= 100:
        raise ValueError("La variation minimale doit être comprise entre 0 et 100 %.")
    points = result["points"]
    if not isinstance(points, list) or not 1 <= len(points) <= 100:
        raise ValueError("Le tableau doit contenir entre 1 et 100 lignes.")
    parsed = {}
    for row in points:
        if not isinstance(row, dict):
            raise ValueError("Ligne invalide.")
        lux, value = number(row.get("lux")), number(row.get("value"))
        if lux < 0 or not 0 <= value <= 100:
            raise ValueError("Lux positifs ou nuls et luminosité entre 0 et 100 % requis.")
        if lux in parsed:
            raise ValueError("Deux lignes utilisent la même valeur de lux.")
        parsed[lux] = value
    result["points"] = [{"lux": lux, "value": value} for lux, value in sorted(parsed.items())]
    return {key: result[key] for key in DEFAULT_CONFIG}


def interpolate(points, lux):
    """Clamp and linearly interpolate; round to an integer panel percentage."""
    if lux <= points[0]["lux"]:
        value = points[0]["value"]
    else:
        value = points[-1]["value"]
        for low, high in zip(points, points[1:]):
            if lux <= high["lux"]:
                value = low["value"] + (high["value"] - low["value"]) * ((lux - low["lux"]) / (high["lux"] - low["lux"]))
                break
    return int(math.floor(value + 0.5))


def read_lux(state):
    if state is None or state.attributes.get("unit_of_measurement") != "lx":
        return None
    try:
        value = float(state.state)
        return value if math.isfinite(value) and value >= 0 else None
    except (TypeError, ValueError):
        return None


class FirmwareRequired:
    """No speculative HTTP call, schedule mutation, subprocess or number service."""
    supported = False

    async def apply(self, value):
        raise RuntimeError("Firmware requis pour la luminosité temporaire.")

    async def release(self):
        raise RuntimeError("Firmware requis pour rendre la main au planning.")


class AmbientController:
    """One subscriber and one serialized command worker per config entry.

    Only engine acknowledgements update last_applied. The production transport
    maintains a RAM lease independently of the command filtering delay.
    """
    def __init__(self, hass, entry_id, transport=None, *, clock=monotonic):
        self.hass = hass
        self.store = Store(hass, 1, f"rpi2dmd.{entry_id}.ambient_brightness")
        self.transport = transport or FirmwareRequired()
        self.clock = clock
        self.config = deepcopy(DEFAULT_CONFIG)
        self.last_lux = None
        self.available = False
        self.invalid_since = None
        self.last_applied = None
        self.last_attempt = None
        self.last_success = None
        self._first_due = None
        self.overridden = False
        self.error = None
        self._unsubscribe = None
        self._timer = None
        self._worker = None
        self._closed = False
        self.ha_sensor_status = None
        self._status_worker = None
        self.command_count = 0
        self._lock = asyncio.Lock()

    async def start(self):
        raw = await self.store.async_load()
        if raw is not None:
            try:
                self.config = validate_config(raw)
            except ValueError:
                self.error = "Configuration sauvegardée invalide ; planning conservé."
        if hasattr(self.transport, "refresh"):
            try:
                state = await self.transport.refresh()
                if state:
                    self.config["mode"] = state["mode"]
            except Exception:
                self.error = "Connexion luminosité indisponible ; nouvelle tentative différée."
        self._subscribe()
        if self._status_worker:
            await self._status_worker

    async def _reconcile(self):
        """Read the broker without writing back a mode or touching sensor settings."""
        if not hasattr(self.transport, "refresh"):
            return
        state = await self.transport.refresh()
        if hasattr(self.transport, "publish_sensor_status") and self.ha_sensor_status is not None:
            await self.transport.publish_sensor_status(self.ha_sensor_status)
        if state and state["mode"] != self.config["mode"]:
            self.config["mode"] = state["mode"]
            self.overridden = False
            self.last_applied = None
            self.last_attempt = None
            self.last_success = None
            self._subscribe()
        if state and state.get("source") != "ha":
            if self.config["mode"] == "ha" and self.last_applied is not None:
                self.last_attempt = None
                self.last_success = None
                self._first_due = self.clock()
            self.last_applied = None
            self.overridden = False

    async def refresh(self):
        """Reconcile UI reads too, so an external mode never becomes a stale draft."""
        async with self._lock:
            try:
                await self._reconcile()
            except Exception:
                self.error = "Connexion luminosité indisponible ; nouvelle tentative différée."
                self._schedule(retry=True)

    async def configure(self, raw=None, *, changes=None):
        # Serialize saved sensor settings, mode selections and command writes.
        async with self._lock:
            if changes is not None:
                if not isinstance(changes, dict) or not changes or set(changes) - set(DEFAULT_CONFIG):
                    raise ValueError("Sélection de luminosité invalide.")
                await self._reconcile()
                raw = {**self.config, **changes}
            config = validate_config(raw)
            state = self.hass.states.get(config["entity_id"])
            if state is not None and state.attributes.get("unit_of_measurement") != "lx":
                raise ValueError("Le capteur doit utiliser l'unité lx.")
            if hasattr(self.transport, "select_mode"):
                # A sensor-only selection does not echo a mode read from the broker.
                if changes is None or "mode" in changes:
                    await self.transport.select_mode(config["mode"])
                if config["mode"] != "ha":
                    self.overridden = False
                    self.last_applied = None
            if config["mode"] == "schedule" and self.overridden:
                await self.transport.release()
                self.overridden = False
                self.last_applied = None
            await self.store.async_save(config)
            changed_sensor = config["entity_id"] != self.config["entity_id"]
            self.config = config
            self.last_attempt = None
            self.last_success = None
            if hasattr(self.transport, "refresh"):
                self.last_applied = None
            if changed_sensor:
                self.last_lux = None
            self.error = None
            self._subscribe()

    def snapshot(self):
        state = getattr(self.transport, "state", None)
        real = hasattr(self.transport, "refresh")
        confirmed = state and state.get("engine") == "connected" and state.get("pending") is False
        return {"controller": {"running": not self._closed,
                               "sensor_subscribed": self._unsubscribe is not None,
                               "commands_acknowledged": self.command_count,
                               "last_success_age": self.clock()-self.last_success if self.last_success is not None else None},
                "firmware": deepcopy(state),
                "target": interpolate(self.config["points"], self.last_lux) if self.available and self.last_lux is not None else None,
                "selected_mode": state.get("mode") if state else self.config["mode"],
                "config": deepcopy(self.config), "last_lux": self.last_lux,
                "available": self.available, "last_applied": (state.get("applied") if confirmed else None) if real else self.last_applied,
                "effective_mode": (state.get("source") if state else "unknown") if real else ("ha" if self.overridden else "schedule"),
                "firmware_required": not self.transport.supported, "error": self.error}

    @callback
    def _subscribe(self):
        if self._unsubscribe:
            self._unsubscribe()
            self._unsubscribe = None
        if self._timer:
            self._timer.cancel()
            self._timer = None
        self.invalid_since = None
        self._first_due = self.clock() + (0 if hasattr(self.transport, "refresh") else self.config["delay"])
        self.available = False
        if self.config["mode"] == "ha" and not self.config["entity_id"]:
            self.error = "Sélectionnez et enregistrez un capteur Home Assistant en lx."
        # One existing subscriber, to the selected entity only; no entity scan.
        if self.config["entity_id"]:
            self._unsubscribe = async_track_state_change_event(
                self.hass, [self.config["entity_id"]], self._changed)
        self.observe(self.hass.states.get(self.config["entity_id"]))

    @callback
    def _changed(self, event):
        if event.data.get("entity_id") == self.config["entity_id"]:
            self.observe(event.data.get("new_state"))

    @callback
    def observe(self, state):
        was_available = self.available
        lux = read_lux(state) if self.config["entity_id"] else None
        self.available = lux is not None
        status = 'not_configured' if not self.config['entity_id'] else 'ok' if self.available else 'unavailable'
        if status != self.ha_sensor_status:
            self.ha_sensor_status = status
            _LOGGER.debug("HA lux sensor status: %s", status)
            if hasattr(self.transport, 'publish_sensor_status') and not self._closed:
                if self._status_worker is None or self._status_worker.done():
                    self._status_worker = self.hass.async_create_task(self._publish_sensor_status())
        if self.available:
            if not was_available and hasattr(self.transport, "refresh"):
                self.last_applied = None
                self.last_attempt = None
                self.last_success = None
                self._first_due = self.clock()
            self.last_lux = lux
            self.invalid_since = None
        elif self.invalid_since is None:
            self.invalid_since = self.clock()
        if self.config["mode"] == "ha" or self._timer is None:
            self._schedule()

    async def _publish_sensor_status(self):
        async with self._lock:
            while not self._closed:
                status = self.ha_sensor_status
                try:
                    await self.transport.publish_sensor_status(status)
                except Exception:
                    # Retry using the existing controller timer/reconnection path.
                    self._schedule(retry=True)
                    return
                if status == self.ha_sensor_status:
                    return

    @callback
    def _schedule(self, retry=False):
        real = hasattr(self.transport, "refresh")
        if self._closed or (not real and (self.config["mode"] != "ha" or not self.transport.supported)):
            return
        if self._timer:
            self._timer.cancel()
        now = self.clock()
        if real and (self.config["mode"] != "ha" or not self.transport.supported):
            wait = 30
        elif not self.available:
            wait = max(0, FALLBACK_SECONDS - (now - self.invalid_since))
            if wait == 0 and not self.overridden and not real:
                self._timer = None
                return
        else:
            wait = max(0, (self._first_due or now) - now) if self.last_attempt is None else max(0, self.config["delay"] - (now - self.last_attempt))
        if retry:
            wait = max(wait, self.config["delay"])
        if real:
            if self.config["mode"] == "ha" and self.available and self.transport.supported:
                target = interpolate(self.config["points"], self.last_lux)
                changed = self.last_applied is None or (target != self.last_applied and abs(target-self.last_applied) >= self.config["minimum_change"])
                next_change = (self._first_due or now) if self.last_attempt is None else self.last_attempt + self.config["delay"]
                next_renewal = self.last_success + self.transport.renewal_seconds if self.last_success is not None else next_change
                wait = max(.05, min(30, (next_change if changed else next_renewal)-now, next_renewal-now))
            else:
                wait = min(wait, 30) if wait > 0 else 30
            if retry and self.error:
                wait = max(10, wait)
        self._timer = self.hass.loop.call_later(wait, self._wake)

    @callback
    def _wake(self):
        self._timer = None
        if self._worker is None or self._worker.done():
            self._worker = self.hass.async_create_task(self._run())

    async def _run(self):
        retry = False
        async with self._lock:
            if self._closed:
                return
            try:
                await self._reconcile()
                if self.config["mode"] != "ha" or not self.transport.supported:
                    self._schedule(retry=True)
                    return
                if not self.available:
                    if self.overridden and self.clock() - self.invalid_since >= FALLBACK_SECONDS:
                        self.last_attempt = self.clock()
                        await self.transport.release()
                        self.overridden = False
                        self.last_applied = None
                else:
                    target = interpolate(self.config["points"], self.last_lux)
                    changed = self.last_applied is None or (target != self.last_applied and abs(target - self.last_applied) >= self.config["minimum_change"])
                    renew = hasattr(self.transport, "renewal_seconds") and (self.last_success is None or self.clock() - self.last_success >= self.transport.renewal_seconds)
                    due = self.clock() >= (self._first_due or 0) if self.last_attempt is None else self.clock() - self.last_attempt >= self.config["delay"]
                    due = due or not hasattr(self.transport, "refresh")
                    if (changed and due) or renew and self.last_success is not None:
                        if not changed or not due:
                            target = self.last_applied
                        if target is None:
                            target = interpolate(self.config["points"], self.last_lux)
                        self.last_attempt = self.clock()
                        await self.transport.apply(target)
                        self.last_applied = target
                        self.last_success = self.clock()
                        self.command_count += 1
                        self.overridden = True
                self.error = None if self.config["entity_id"] else "Sélectionnez et enregistrez un capteur Home Assistant en lx."
            except Exception:
                self.error = "Commande temporaire non confirmée ; nouvelle tentative différée."
                retry = True
        # Capture changes that arrived while awaiting the transport, including loss.
        target = interpolate(self.config["points"], self.last_lux) if self.last_lux is not None else None
        pending = target is not None and (self.last_applied is None or (target != self.last_applied and abs(target - self.last_applied) >= self.config["minimum_change"]))
        if retry or not self.available or pending or hasattr(self.transport, "refresh"):
            self._schedule(retry=True)

    async def stop(self):
        self._closed = True
        if self._unsubscribe:
            self._unsubscribe()
        if self._timer:
            self._timer.cancel()
        if self._status_worker:
            await self._status_worker
        # Do not cancel a command with an ambiguous outcome. Release after it finishes.
        if self._worker:
            await self._worker
        if self.overridden:
            try:
                await self.transport.release()
            except Exception:
                self.error = "Libération non confirmée ; expiration automatique du bail. Dernière consigne valable au plus 300 secondes."
            self.overridden = False
