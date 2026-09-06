/* RPI2DMD HA-4 panel: dependency-free Web Component.
 * All Raspberry communication goes through hass.callWS; no token or API URL
 * is ever present in this browser code. */
class Rpi2dmdPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._devices = [];
    this._entry = null;
    this._section = "dashboard";
    this._status = null;
    this._display = null;
    this._playlist = null;
    this._mqtt = null;
    this._weather = null;
    this._gifs = null;
    this._busy = false;
    this._timer = null;
  }

  set hass(value) {
    this._hass = value;
    if (!this._timer) {
      this._loadDevices();
      this._timer = setInterval(() => this._refreshStatus(), 15000);
    }
  }
  get hass() { return this._hass; }
  set narrow(value) { this._narrow = value; this._render(); }
  set panel(value) { this._panel = value; }
  disconnectedCallback() { if (this._timer) clearInterval(this._timer); this._timer = null; }

  async _ws(type, extra = {}) {
    if (!this._hass || this._entry === null && type !== "rpi2dmd/devices") throw new Error("Home Assistant indisponible");
    return this._hass.callWS({ type, ...extra, ...(type === "rpi2dmd/devices" ? {} : { entry_id: this._entry }) });
  }
  async _loadDevices() {
    try {
      const result = await this._ws("rpi2dmd/devices");
      this._devices = result.devices || [];
      if (this._entry === null && this._devices.length) this._entry = this._devices[0].entry_id;
      await this._refreshStatus();
      this._render();
    } catch (err) { this._showError(err); }
  }
  async _refreshStatus() {
    if (this._entry === null) return;
    try {
      this._status = (await this._ws("rpi2dmd/status")).status;
      this._render();
    } catch (err) { this._showError(err); }
  }
  async _loadSection(section) {
    this._section = section;
    this._render();
    try {
      if (section === "display") this._display = (await this._ws("rpi2dmd/display/get")).display;
      if (section === "playlist") this._playlist = (await this._ws("rpi2dmd/playlist/get")).playlist;
      if (section === "mqtt") this._mqtt = (await this._ws("rpi2dmd/mqtt/get")).mqtt;
      if (section === "weather") this._weather = (await this._ws("rpi2dmd/weather/get")).weather;
      if (section === "gif") this._gifs = (await this._ws("rpi2dmd/gifs/list", { limit: 100 })).gifs;
      if (section === "system") this._status = (await this._ws("rpi2dmd/system")).system;
      this._render();
    } catch (err) { this._showError(err); }
  }
  _showError(err) { this._error = err?.message || "RPI2DMD indisponible"; this._render(); }
  _clearError() { this._error = ""; }
  async _updateDisplay(changes) {
    if (this._busy) return;
    this._busy = true; this._clearError(); this._render();
    try { this._display = (await this._ws("rpi2dmd/display/update", { changes })).display; await this._refreshStatus(); }
    catch (err) { this._showError(err); }
    finally { this._busy = false; this._render(); }
  }
  _flag(name) { return (this._display?.flags || {})[name] === true || (this._status?.display?.active_flags || []).includes(name); }
  _esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  _render() {
    if (!this.shadowRoot) return;
    const device = this._devices.find(d => d.entry_id === this._entry);
    this.shadowRoot.innerHTML = `<style>${this._css()}</style><main>
      <header><div><h1>RPI2DMD</h1><p class="sub">${this._esc(device?.model || "RPI2DMD")}</p></div>
      <label class="device">Appareil <select id="device">${this._devices.map(d => `<option value="${this._esc(d.entry_id)}" ${d.entry_id===this._entry?"selected":""}>${this._esc(d.name)} — ${this._esc(d.host)}</option>`).join("")}</select></label></header>
      <nav aria-label="Navigation">${["dashboard","display","playlist","mqtt","gif","weather","system","backup"].map(s => `<button class="nav ${this._section===s?"active":""}" data-nav="${s}">${this._label(s)}</button>`).join("")}</nav>
      ${this._error ? `<div class="error" role="alert">${this._esc(this._error)} <button data-action="retry">Réessayer</button></div>` : ""}
      ${this._content()}
    </main>`;
    this._bind();
  }
  _label(s) { return ({dashboard:"Dashboard",display:"Affichage",playlist:"Playlist",mqtt:"MQTT",gif:"GIF",weather:"Météo",system:"Système",backup:"Sauvegarde"})[s]; }
  _content() {
    if (this._section === "dashboard") return this._dashboard();
    if (this._section === "display") return this._displayPage();
    if (this._section === "playlist") return this._playlistPage();
    if (this._section === "mqtt") return this._mqttPage();
    if (this._section === "gif") return this._gifPage();
    if (this._section === "weather") return this._weatherPage();
    if (this._section === "system") return this._systemPage();
    return this._backupPage();
  }
  _card(title, value, detail="") { return `<section class="card"><h2>${title}</h2><strong>${value}</strong><small>${detail}</small></section>`; }
  _dashboard() {
    const s=this._status||{}, mqtt=s.mqtt||{}, display=s.display||{}, power=s.power||{};
    return `<section class="grid cards">${this._card("DISPLAY",display.service_state||"—",display.paused?"En pause":"Actif")}${this._card("MQTT",mqtt.connected?"Connecté":"Hors ligne",mqtt.state||"—")}${this._card("TEMPÉRATURE",s.cpu_temperature_c==null?"—":`${s.cpu_temperature_c} °C`,"CPU")}${this._card("ALIMENTATION",power.undervoltage?"⚠ Sous-tension":"OK",power.throttled_code||"—")}${this._card("ÉCRAN ACTUEL",s.current_screen?.available?(s.current_screen.id||s.current_screen.type):"—",s.playlist?.mode||"legacy")}${this._card("UPTIME",this._duration(s.uptime_seconds),"Raspberry Pi")}</section>
      ${power.undervoltage?`<p class="warning" role="alert">⚠ SOUS-TENSION DÉTECTÉE — code ${this._esc(power.throttled_code)}</p>`:""}<section class="card quick"><h2>Contrôles rapides</h2>${this._quickControls()}</section>`;
  }
  _quickControls() { return `<div class="controls"><label>Luminosité <input type="range" min="0" max="100" step="5" id="brightness" value="${this._brightness()}"></label>${["clock","date","weather","gif","mqtt"].map(f=>`<label class="toggle"><input type="checkbox" data-flag="${f}" ${this._flag(f)?"checked":""}> ${this._labelFlag(f)}</label>`).join("")}</div>`; }
  _labelFlag(f) { return ({clock:"Heure",date:"Date",weather:"Météo",gif:"GIF",mqtt:"MQTT Display"})[f]; }
  _brightness() { const rows=this._display?.brightness?.schedule||[]; const h=new Date().getHours(); return rows.find(r=>r.hour===h)?.value ?? 0; }
  _displayPage() { return `<section class="card"><h2>Affichage</h2><p class="sub">Les paramètres sont appliqués via l’API transactionnelle.</p>${this._quickControls()}</section>`; }
  _playlistPage() { const items=this._playlist?.items||[]; return `<section class="card"><div class="row"><h2>Playlist</h2><button data-action="playlist-add">Ajouter</button></div>${items.length?items.map((i,n)=>`<article class="item"><div><b>${i.enabled?"☑":"☐"} ${n+1} — ${this._esc(i.type)}</b><p>${this._esc(i.title||i.topic||"")} ${i.unit?`(${this._esc(i.unit)})`:""}</p></div><div class="actions"><button data-item="${this._esc(i.id)}" data-action="up" ${n===0?"disabled":""}>↑</button><button data-item="${this._esc(i.id)}" data-action="down" ${n===items.length-1?"disabled":""}>↓</button><button data-item="${this._esc(i.id)}" data-action="duplicate">Dupliquer</button><button data-item="${this._esc(i.id)}" data-action="toggle">${i.enabled?"Désactiver":"Activer"}</button><button data-item="${this._esc(i.id)}" data-action="delete">Supprimer</button></div></article>`).join(""):"<p>Aucune ligne.</p>"}</section>`; }
  _mqttPage() { const m=this._mqtt||{}; return `<section class="card"><h2>MQTT</h2><p>État : ${this._status?.mqtt?.connected?"Connecté":"Hors ligne"}</p><p>Password configuré : ${m.password_configured?"oui":"non"}</p><label>Broker <input id="broker" value="${this._esc(m.broker)}"></label><label>Port <input id="mqtt-port" type="number" value="${m.port||1883}"></label><label>Username <input id="mqtt-user" value="${this._esc(m.username)}"></label><label>Client ID <input id="mqtt-client" value="${this._esc(m.client_id)}"></label><label>Password <input id="mqtt-password" type="password" value="" placeholder="Laisser vide pour conserver"></label><button data-action="mqtt-save">Enregistrer</button> <button data-action="mqtt-test">Tester la connexion</button></section>`; }
  _gifPage() { const g=this._gifs||{}; const list=g.items||[]; return `<section class="card"><h2>GIF</h2><p>${g.total??list.length} GIF disponibles</p><div class="gif-list">${list.map(x=>`<article><b>${this._esc(x.name)}</b><small>${this._esc(x.category||"")} · ${x.width||"?"}×${x.height||"?"}</small></article>`).join("")}</div></section>`; }
  _weatherPage() { const w=this._weather||{}; return `<section class="card"><h2>Météo</h2><label>Pays <input id="weather-country" value="${this._esc(w.country)}"></label><label>Code postal <input id="weather-zip" value="${this._esc(w.postal_code)}"></label><label>Unité <select id="weather-unit"><option ${w.unit==="metric"?"selected":""}>metric</option><option ${w.unit==="imperial"?"selected":""}>imperial</option></select></label><button data-action="weather-save">Enregistrer</button></section>`; }
  _systemPage() { const s=this._status||{}; return `<section class="grid cards"><section class="card"><h2>Système</h2><p>Modèle : ${this._esc(s.model)}</p><p>Hostname : ${this._esc(s.hostname)}</p><p>IP : ${this._esc((s.ip_addresses||[]).join(", "))}</p><p>Uptime : ${this._duration(s.uptime_seconds)}</p><p>CPU : ${s.cpu_temperature_c??"—"} °C</p></section><section class="card"><h2>Services</h2><p>Display : ${this._esc(s.services?.display?.state||"—")}</p><p>MQTT : ${this._esc(s.services?.mqtt?.state||"—")}</p><p>NRestarts : ${s.services?.display?.nrestarts??"—"} / ${s.services?.mqtt?.nrestarts??"—"}</p><p>Throttled : ${this._esc(s.power?.throttled_code||"—")}</p></section></section>`; }
  _backupPage() { return `<section class="card"><h2>Sauvegarde</h2><p>Les exports sont sans secrets ni assets.</p><button data-action="export">Exporter configuration</button><label class="file">Importer configuration <input id="import" type="file" accept="application/json"></label><p id="import-result"></p></section>`; }
  _duration(sec) { if (sec == null) return "—"; const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60); return `${h} h ${m} min`; }
  _bind() {
    this.shadowRoot.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>this._loadSection(b.dataset.nav));
    const device=this.shadowRoot.querySelector("#device"); if(device) device.onchange=()=>{this._entry=device.value; this._loadSection(this._section);};
    this.shadowRoot.querySelectorAll("[data-flag]").forEach(el=>el.onchange=()=>this._updateDisplay({flags:{[el.dataset.flag]:el.checked}}));
    const bright=this.shadowRoot.querySelector("#brightness"); if(bright) bright.onchange=()=>this._updateDisplay({brightness:{schedule:[{hour:new Date().getHours(),value:Number(bright.value)}]}});
    this.shadowRoot.querySelector("[data-action=retry]")?.addEventListener("click",()=>this._refreshStatus());
    this.shadowRoot.querySelectorAll("[data-action=up],[data-action=down]").forEach(b=>b.onclick=()=>this._move(b.dataset.item,b.dataset.action==="up"?-1:1));
    this.shadowRoot.querySelectorAll("[data-action=duplicate]").forEach(b=>b.onclick=()=>this._playlistAction("rpi2dmd/playlist/duplicate",{item_id:b.dataset.item}));
    this.shadowRoot.querySelectorAll("[data-action=delete]").forEach(b=>b.onclick=()=>{if(confirm("Supprimer cette ligne ?"))this._playlistAction("rpi2dmd/playlist/delete",{item_id:b.dataset.item});});
    this.shadowRoot.querySelectorAll("[data-action=toggle]").forEach(b=>b.onclick=()=>this._toggleItem(b.dataset.item));
    this.shadowRoot.querySelector("[data-action=playlist-add]")?.addEventListener("click",()=>this._addItem());
    this.shadowRoot.querySelector("[data-action=mqtt-save]")?.addEventListener("click",()=>this._saveMqtt());
    this.shadowRoot.querySelector("[data-action=mqtt-test]")?.addEventListener("click",()=>this._testMqtt());
    this.shadowRoot.querySelector("[data-action=weather-save]")?.addEventListener("click",()=>this._saveWeather());
    this.shadowRoot.querySelector("[data-action=export]")?.addEventListener("click",()=>this._export());
    this.shadowRoot.querySelector("#import")?.addEventListener("change",e=>this._import(e.target.files[0]));
  }
  async _move(id,delta){const items=this._playlist?.items||[], i=items.findIndex(x=>x.id===id); if(i<0)return; await this._playlistAction("rpi2dmd/playlist/move",{item_id:id,index:i+delta});}
  async _toggleItem(id){const item=(this._playlist?.items||[]).find(x=>x.id===id);if(item)await this._playlistAction("rpi2dmd/playlist/update",{item_id:id,changes:{enabled:!item.enabled}});}
  async _playlistAction(type,extra){try{await this._ws(type,extra);await this._loadSection("playlist");}catch(e){this._showError(e);}}
  async _addItem(){const type=(prompt("Type : gif, time, date, weather ou mqtt","mqtt")||"").toLowerCase();if(!["gif","time","date","weather","mqtt"].includes(type))return;const item={type,enabled:true};if(type==="mqtt"){item.title=prompt("Titre","RPI2DMD")||"RPI2DMD";item.topic=prompt("Topic","")||"";item.unit=prompt("Unité","")||"";item.duration_seconds=Number(prompt("Durée en secondes","5"))||5;}try{await this._ws("rpi2dmd/playlist/add",{item});await this._loadSection("playlist");}catch(e){this._showError(e);}}
  async _saveMqtt(){try{const changes={broker:this.shadowRoot.querySelector("#broker").value,port:Number(this.shadowRoot.querySelector("#mqtt-port").value),username:this.shadowRoot.querySelector("#mqtt-user").value,client_id:this.shadowRoot.querySelector("#mqtt-client").value};const password=this.shadowRoot.querySelector("#mqtt-password").value;if(password)changes.password=password;await this._ws("rpi2dmd/mqtt/update",{changes});await this._refreshStatus();}catch(e){this._showError(e);}}
  async _testMqtt(){try{const result=await this._ws("rpi2dmd/mqtt/test",{body:{use_saved_credentials:true}});alert(`DNS: ${result.result.dns_resolved}\nTCP: ${result.result.reachable}\nAuthentifié: ${result.result.authenticated}\nLatence: ${result.result.latency_ms} ms`);}catch(e){this._showError(e);}}
  async _saveWeather(){try{await this._ws("rpi2dmd/weather/update",{changes:{country:this.shadowRoot.querySelector("#weather-country").value,postal_code:this.shadowRoot.querySelector("#weather-zip").value,unit:this.shadowRoot.querySelector("#weather-unit").value}});await this._loadSection("weather");}catch(e){this._showError(e);}}
  async _export(){try{const data=(await this._ws("rpi2dmd/config/export")).config;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download="rpi2dmd-config.json";a.click();URL.revokeObjectURL(a.href);}catch(e){this._showError(e);}}
  async _import(file){if(!file)return;try{const doc=JSON.parse(await file.text());const validation=(await this._ws("rpi2dmd/config/import/validate",{document:doc})).validation;if(!validation.valid)throw new Error("Configuration invalide");if(confirm("Appliquer cette configuration ?")){await this._ws("rpi2dmd/config/import/apply",{validation_token:validation.validation_token});await this._refreshStatus();} }catch(e){this._showError(e);}}
  _css(){return `:host{display:block;color:var(--primary-text-color);background:var(--primary-background-color);min-height:100vh;font-family:var(--paper-font-body1_-_font-family, sans-serif)}main{max-width:1200px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;align-items:center;gap:16px}h1{margin:0;font-size:2rem}h2{margin:0 0 12px;font-size:1.1rem}.sub,small{color:var(--secondary-text-color)}nav{display:flex;gap:6px;overflow:auto;padding:20px 0 12px;border-bottom:1px solid var(--divider-color)}button,select,input{font:inherit}button{border:0;border-radius:8px;padding:10px 14px;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.nav{background:var(--secondary-background-color);color:var(--primary-text-color);white-space:nowrap}.nav.active{background:var(--primary-color);color:#fff}.card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:14px;padding:18px;margin:16px 0;box-shadow:var(--ha-card-box-shadow,none)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}.cards .card{margin:0}.card strong{display:block;font-size:1.5rem;margin:8px 0}.controls{display:flex;flex-wrap:wrap;gap:18px;align-items:center}.controls label,.card>label{display:flex;flex-direction:column;gap:6px;margin:10px 0}.toggle{flex-direction:row!important;align-items:center}.row,.item{display:flex;justify-content:space-between;align-items:center;gap:12px}.item{border-top:1px solid var(--divider-color);padding:14px 0}.actions{display:flex;gap:5px;flex-wrap:wrap}.actions button{padding:7px 9px}.error{background:var(--error-color);color:#fff;padding:12px;border-radius:8px;margin:14px 0}.warning{background:var(--warning-color);padding:14px;border-radius:8px;color:var(--primary-text-color)}input,select{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:6px;padding:9px}.device{display:flex;align-items:center;gap:8px}.gif-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.gif-list article{border:1px solid var(--divider-color);border-radius:8px;padding:12px}.gif-list small{display:block;margin-top:5px}.file{display:block;margin-top:20px}@media(max-width:600px){main{padding:14px}header{align-items:flex-start;flex-direction:column}.device{width:100%}.device select{width:100%}.item{align-items:flex-start;flex-direction:column}.actions{width:100%}nav{padding-top:12px}}`}
}
customElements.define("rpi2dmd-panel", Rpi2dmdPanel);
