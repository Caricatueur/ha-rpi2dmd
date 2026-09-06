/* RPI2DMD HA-4 panel: dependency-free Web Component.
 * All Raspberry communication goes through hass.callWS; no token or API URL
 * is ever present in this browser code. */
const RPI_POLISH_CSS = `
  *{box-sizing:border-box}:host{--rpi-blue:#03a9f4;--rpi-cyan:#22d3ee;--rpi-purple:#a855f7}
  main{max-width:1280px;padding:28px clamp(16px,3vw,42px) 48px}
  .hero{position:relative;overflow:hidden;min-height:280px;border:1px solid color-mix(in srgb,var(--divider-color) 65%,transparent);border-radius:24px;background:linear-gradient(120deg,#080b12 0%,#111827 52%,#102b47 100%);box-shadow:0 18px 48px rgba(0,0,0,.22);isolation:isolate}
  .hero:after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 84% 35%,rgba(34,211,238,.28),transparent 33%),linear-gradient(90deg,rgba(0,0,0,.2),transparent 60%);z-index:-1;pointer-events:none}
  .hero-banner{position:absolute;inset:0 0 0 auto;width:64%;background-image:linear-gradient(90deg,#080b12 0%,rgba(8,11,18,.78) 15%,transparent 48%),url('/rpi2dmd-assets/rpi2dmd-ha-logo.png');background-size:100% 100%,auto 100%;background-position:center,right center;background-repeat:no-repeat;opacity:.82;z-index:-1}
  .hero-content{position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:24px;min-height:280px;padding:30px clamp(22px,4vw,48px)}
  .eyebrow{margin:0 0 8px;color:#67e8f9;font-size:.74rem;font-weight:800;letter-spacing:.2em}.hero h1{margin:0;color:#fff;font-size:clamp(2.1rem,5vw,4rem);letter-spacing:-.045em;line-height:1}.hero .sub{margin:.65rem 0 0;color:#cbd5e1}.hero-meta{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap}.online-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(103,232,249,.35);border-radius:999px;background:rgba(8,47,73,.72);color:#cffafe;font-weight:700;font-size:.84rem;white-space:nowrap}.online-pill i{display:block;width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 13px #34d399}.device{font-weight:700}
  .metric-card{position:relative;overflow:hidden}.metric-card:after{content:"";position:absolute;width:100px;height:100px;right:-38px;bottom:-42px;border-radius:50%;background:rgba(34,211,238,.1)}.metric-head{display:flex;align-items:center;gap:9px}.metric-head h2{margin:0;color:var(--secondary-text-color);font-size:.78rem;letter-spacing:.1em}.metric-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,rgba(34,211,238,.2),rgba(168,85,247,.2));color:var(--rpi-blue);font-weight:800}.card{border-radius:18px;box-shadow:0 8px 26px rgba(0,0,0,.08)}.card strong{margin:16px 0 5px;letter-spacing:-.025em}.nav{border:1px solid var(--divider-color);border-radius:10px;box-shadow:none;font-weight:650;transition:all .16s ease}.nav.active{background:linear-gradient(135deg,var(--rpi-blue),var(--rpi-purple));box-shadow:0 5px 18px rgba(59,130,246,.3)}button{border-radius:10px;transition:transform .16s ease,filter .16s ease,box-shadow .16s ease}button:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 7px 18px rgba(3,169,244,.25)}.category-card,.schedule-row{background:color-mix(in srgb,var(--secondary-background-color) 65%,transparent);border-radius:12px}.disabled-item{opacity:.58}.warning{border:1px solid rgba(245,158,11,.45);border-radius:14px;background:linear-gradient(110deg,rgba(245,158,11,.2),rgba(239,68,68,.12));font-weight:700}.controls input[type=range]{accent-color:var(--rpi-blue)}
  @media(max-width:700px){main{padding:16px 12px 34px}.hero{min-height:350px}.hero-banner{width:100%;height:59%;inset:auto 0 0;background-image:linear-gradient(180deg,#080b12 0%,rgba(8,11,18,.15) 55%),url('/rpi2dmd-assets/rpi2dmd-ha-logo.png');background-size:100% 100%,auto 100%;background-position:center,right center;background-repeat:no-repeat;opacity:.65}.hero-content{align-items:flex-start;flex-direction:column;justify-content:space-between;min-height:350px;padding:24px 20px}.hero-meta{width:100%;align-items:stretch;flex-direction:column}.device{width:100%;justify-content:space-between}.device select{flex:1;min-width:0}.item,.schedule-row,.category-card{align-items:flex-start;flex-direction:column}.actions{width:100%}nav{padding-top:13px}}
`;
const RPI_EXACT_HERO_CSS = `
  .hero{min-height:280px}
  .hero:after{z-index:0}
  .hero-content{position:relative;z-index:1;display:grid;grid-template-columns:minmax(250px,38%) minmax(0,62%);align-items:stretch;gap:18px;min-height:280px;padding:24px clamp(22px,4vw,42px)}
  .hero-copy{display:flex;flex-direction:column;justify-content:center;min-width:0}.hero-art{display:flex;align-items:center;justify-content:center;min-width:0;padding:10px 0}.hero-banner{position:static;display:block;width:100%;height:auto;max-width:100%;max-height:100%;object-fit:contain;object-position:center;background:none;opacity:1;z-index:auto}
  @media(max-width:700px){.hero{min-height:0}.hero-content{display:flex;align-items:stretch;flex-direction:column;gap:8px;min-height:0;padding:24px 20px}.hero-copy{gap:0}.hero-art{width:100%;padding:12px 0 0}.hero-banner{width:100%;height:auto;max-height:none;object-fit:contain}.hero-meta{width:100%;align-items:stretch;flex-direction:column}.device{width:100%;justify-content:space-between}.device select{flex:1;min-width:0}}
`;
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
    this._gifCategories = null;
    this._brightnessSchedule = { enabled: true, points: [] };
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
      if (section === "gif") this._gifCategories = (await this._ws("rpi2dmd/gifs/categories")).categories;
      if (section === "brightness") { const raw=(await this._ws("rpi2dmd/brightness/schedule/get")).schedule || {}; this._brightnessSchedule = raw.points ? raw : { enabled: true, points: Array.isArray(raw)?raw:(raw.schedule||[]) }; }
      if (section === "system") this._status = (await this._ws("rpi2dmd/system")).system;
      this._render();
    } catch (err) { this._showError(err); }
  }
  _showError(err, userMessage = "") {
    const message = err?.message || "";
    console.error("RPI2DMD Home Assistant WebSocket error", message);
    this._error = userMessage || (/unknown command/i.test(message)
      ? "Erreur Home Assistant : commande RPI2DMD indisponible."
      : (message || "RPI2DMD indisponible"));
    this._render();
  }
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
    this.shadowRoot.innerHTML = `<style>${this._css()}${RPI_POLISH_CSS}${RPI_EXACT_HERO_CSS}</style><main>
      <header class="hero"><div class="hero-content"><div class="hero-copy"><p class="eyebrow">HOME ASSISTANT · RPI2DMD</p><h1>RPI2DMD</h1><p class="sub">${this._esc(device?.model || "Raspberry Pi DMD")}</p><div class="hero-meta"><span class="online-pill"><i></i> ${this._status ? "En ligne" : "Connexion…"}</span><label class="device">Appareil <select id="device">${this._devices.map(d => `<option value="${this._esc(d.entry_id)}" ${d.entry_id===this._entry?"selected":""}>${this._esc(this._deviceLabel(d))}</option>`).join("")}</select></label></div></div><div class="hero-art"><img class="hero-banner" src="/rpi2dmd-assets/rpi2dmd-ha-banner.png" alt="RPI2DMD connecté à Home Assistant"></div></div></header>
      <nav aria-label="Navigation">${["dashboard","display","brightness","playlist","mqtt","gif","weather","system","backup"].map(s => `<button class="nav ${this._section===s?"active":""}" data-nav="${s}">${this._label(s)}</button>`).join("")}</nav>
      ${this._error ? `<div class="error" role="alert">${this._esc(this._error)} <button data-action="retry">Réessayer</button></div>` : ""}
      ${this._content()}
    </main>`;
    this._bind();
  }
  _label(s) { return ({dashboard:"Dashboard",display:"Affichage",brightness:"Luminosité",playlist:"Playlist",mqtt:"MQTT",gif:"GIF",weather:"Météo",system:"Système",backup:"Sauvegarde"})[s]; }
  _deviceLabel(device) {
    const name = String(device.name || "RPI2DMD").trim();
    const host = String(device.host || "").trim();
    return name === host || !name ? `RPI2DMD — ${host}` : `${name} — ${host}`;
  }
  _content() {
    if (this._section === "dashboard") return this._dashboard();
    if (this._section === "display") return this._displayPage();
    if (this._section === "brightness") return this._brightnessPage();
    if (this._section === "playlist") return this._playlistPage();
    if (this._section === "mqtt") return this._mqttPage();
    if (this._section === "gif") return this._gifPage();
    if (this._section === "weather") return this._weatherPage();
    if (this._section === "system") return this._systemPage();
    return this._backupPage();
  }
  _card(title, value, detail="", icon="●") { return `<section class="card metric-card"><div class="metric-head"><span class="metric-icon">${icon}</span><h2>${title}</h2></div><strong>${value}</strong><small>${detail}</small></section>`; }
  _dashboard() {
    const s=this._status||{}, mqtt=s.mqtt||{}, display=s.display||{}, power=s.power||{};
    return `<section class="grid cards">${this._card("DISPLAY",display.service_state||"—",display.paused?"En pause":"Actif","▣")}${this._card("MQTT",mqtt.connected?"Connecté":"Hors ligne",mqtt.state||"—","↯")}${this._card("TEMPÉRATURE",s.cpu_temperature_c==null?"—":`${s.cpu_temperature_c} °C`,"CPU","℃")}${this._card("ALIMENTATION",power.undervoltage?"⚠ Sous-tension":"OK",power.throttled_code||"—","⚡")}${this._card("ÉCRAN ACTUEL",s.current_screen?.available?(s.current_screen.id||s.current_screen.type):"—",s.playlist?.mode||"legacy","◈")}${this._card("UPTIME",this._duration(s.uptime_seconds),"Raspberry Pi","◷")}</section>
      ${power.undervoltage?`<p class="warning" role="alert">⚠ SOUS-TENSION DÉTECTÉE — code ${this._esc(power.throttled_code)}</p>`:""}<section class="card quick"><h2>Contrôles rapides</h2>${this._quickControls()}</section>`;
  }
  _quickControls() { return `<div class="controls"><label>Luminosité <input type="range" min="0" max="100" step="5" id="brightness" value="${this._brightness()}"></label>${["clock","date","weather","gif","mqtt"].map(f=>`<label class="toggle"><input type="checkbox" data-flag="${f}" ${this._flag(f)?"checked":""}> ${this._labelFlag(f)}</label>`).join("")}</div>`; }
  _labelFlag(f) { return ({clock:"Heure",date:"Date",weather:"Météo",gif:"GIF",mqtt:"MQTT Display"})[f]; }
  _brightness() { const rows=this._display?.brightness?.schedule||[]; const h=new Date().getHours(); return rows.find(r=>r.hour===h)?.value ?? 0; }
  _displayPage() { return `<section class="card"><h2>Affichage</h2><p class="sub">Les paramètres sont appliqués via l’API transactionnelle.</p>${this._quickControls()}</section>`; }
  _playlistPage() { const items=this._playlist?.items||[]; return `<section class="card"><div class="row"><h2>Playlist</h2><button data-action="playlist-add">Ajouter</button></div>${items.length?items.map((i,n)=>`<article class="item ${i.enabled?"":"disabled-item"}"><div><label class="playlist-state"><input type="checkbox" data-item="${this._esc(i.id)}" data-action="toggle" ${i.enabled?"checked":""}> <b>${i.enabled?"Actif":"Inactif"} [${i.enabled?"ON":"OFF"}]</b></label><p>${n+1} — ${this._esc(i.type)} · ${this._esc(i.title||i.topic||"")} ${i.unit?`(${this._esc(i.unit)})`:""}</p></div><div class="actions"><button data-item="${this._esc(i.id)}" data-action="up" ${n===0?"disabled":""}>↑</button><button data-item="${this._esc(i.id)}" data-action="down" ${n===items.length-1?"disabled":""}>↓</button><button data-item="${this._esc(i.id)}" data-action="duplicate">Dupliquer</button><button data-item="${this._esc(i.id)}" data-action="delete">Supprimer</button></div></article>`).join(""):"<p>Aucune ligne.</p>"}</section>`; }
  _mqttPage() { const m=this._mqtt||{}; return `<section class="card"><h2>MQTT</h2><p>État : ${this._status?.mqtt?.connected?"Connecté":"Hors ligne"}</p><p>Password configuré : ${m.password_configured?"oui":"non"}</p><label>Broker <input id="broker" value="${this._esc(m.broker)}"></label><label>Port <input id="mqtt-port" type="number" value="${m.port||1883}"></label><label>Username <input id="mqtt-user" value="${this._esc(m.username)}"></label><label>Client ID <input id="mqtt-client" value="${this._esc(m.client_id)}"></label><label>Password <input id="mqtt-password" type="password" value="" placeholder="Laisser vide pour conserver"></label><button data-action="mqtt-save">Enregistrer</button> <button data-action="mqtt-test">Tester la connexion</button></section>`; }
  _gifCategoriesList() {
    const raw = this._gifCategories;
    const list = Array.isArray(raw) ? raw : (raw?.categories || raw?.items || []);
    return list.map((x) => typeof x === "string" ? {id:x,name:x,count:0,enabled:true} : {
      id: x.id ?? x.name ?? x.category, name: x.name ?? x.title ?? x.id ?? x.category,
      count: x.count ?? x.total ?? x.gif_count ?? 0, enabled: x.enabled !== false,
    }).sort((a,b)=>String(a.name).localeCompare(String(b.name), undefined, {numeric:true, sensitivity:"base"}));
  }
  _gifPage() {
    const g=this._gifs||{}, categories=this._gifCategoriesList();
    const total=g.total ?? categories.reduce((n,x)=>n+Number(x.count||0),0);
    return `<section class="card"><h2>GIF</h2><p>${categories.length} dossiers · ${total} GIF disponibles</p><div class="category-list">${categories.map(x=>`<article class="category-card"><div><b>${this._esc(x.name)}</b><small>${x.count} GIF</small></div><label class="toggle">Actif <input type="checkbox" data-gif-category="${this._esc(x.id)}" ${x.enabled?"checked":""}></label></article>`).join("") || "<p>Aucune catégorie disponible.</p>"}</div></section>`;
  }
  _weatherPage() { const w=this._weather||{}; return `<section class="card"><h2>Météo</h2><label>Pays <input id="weather-country" value="${this._esc(w.country)}"></label><label>Code postal <input id="weather-zip" value="${this._esc(w.postal_code)}"></label><label>Unité <select id="weather-unit"><option ${w.unit==="metric"?"selected":""}>metric</option><option ${w.unit==="imperial"?"selected":""}>imperial</option></select></label><p>Clé OpenWeatherMap configurée : <b>${w.api_key_configured?"Oui":"Non"}</b></p><label>OpenWeatherMap API Key <input id="weather-api-key" type="password" value="" placeholder="Laisser vide pour conserver la clé actuelle" autocomplete="new-password"></label><button data-action="weather-save">Enregistrer</button></section>`; }
  _scheduleTime(point) { return point.time || `${String(point.hour??0).padStart(2,"0")}:00`; }
  _brightnessPage() { const s=this._brightnessSchedule||{}, points=Array.isArray(s.points)?s.points:[], enabled=s.enabled!==false; return `<section class="card"><div class="row"><h2>Planning luminosité</h2><label class="toggle">Activé <input id="schedule-enabled" type="checkbox" ${enabled?"checked":""}></label></div><p class="sub">Chaque point s'applique jusqu'au suivant et le planning boucle sur 24 heures.</p><div class="schedule-list">${points.map((p,i)=>`<div class="schedule-row"><label>Heure <input type="time" data-schedule-time="${i}" value="${this._esc(this._scheduleTime(p))}"></label><label>Luminosité <input type="number" min="0" max="100" data-schedule-value="${i}" value="${Number(p.value??0)}"> %</label><button data-action="schedule-delete" data-schedule-index="${i}">Supprimer</button></div>`).join("") || "<p>Aucun point configuré.</p>"}</div><div class="actions"><button data-action="schedule-add">Ajouter une heure</button><button data-action="schedule-save">Enregistrer</button><button data-action="schedule-apply">Appliquer maintenant</button></div></section>`; }
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
    this.shadowRoot.querySelectorAll("[data-action=toggle]").forEach(b=>b.onchange=()=>this._toggleItem(b.dataset.item, b.checked));
    this.shadowRoot.querySelectorAll("[data-gif-category]").forEach(b=>b.onchange=()=>this._toggleGifCategory(b.dataset.gifCategory, b.checked));
    this.shadowRoot.querySelector("[data-action=playlist-add]")?.addEventListener("click",()=>this._addItem());
    this.shadowRoot.querySelector("[data-action=mqtt-save]")?.addEventListener("click",()=>this._saveMqtt());
    this.shadowRoot.querySelector("[data-action=mqtt-test]")?.addEventListener("click",()=>this._testMqtt());
    this.shadowRoot.querySelector("[data-action=weather-save]")?.addEventListener("click",()=>this._saveWeather());
    this.shadowRoot.querySelector("[data-action=schedule-add]")?.addEventListener("click",()=>this._scheduleAdd());
    this.shadowRoot.querySelector("[data-action=schedule-save]")?.addEventListener("click",()=>this._scheduleSave());
    this.shadowRoot.querySelector("[data-action=schedule-apply]")?.addEventListener("click",()=>this._scheduleApply());
    this.shadowRoot.querySelector("#schedule-enabled")?.addEventListener("change",()=>{this._brightnessSchedule.enabled=this.shadowRoot.querySelector("#schedule-enabled").checked;});
    this.shadowRoot.querySelectorAll("[data-action=schedule-delete]").forEach(b=>b.onclick=()=>{this._brightnessSchedule.points.splice(Number(b.dataset.scheduleIndex),1);this._render();});
    this.shadowRoot.querySelector("[data-action=export]")?.addEventListener("click",()=>this._export());
    this.shadowRoot.querySelector("#import")?.addEventListener("change",e=>this._import(e.target.files[0]));
  }
  async _move(id,delta){const items=this._playlist?.items||[], i=items.findIndex(x=>x.id===id); if(i<0)return; await this._playlistAction("rpi2dmd/playlist/move",{item_id:id,index:i+delta});}
  async _toggleItem(id, enabled){await this._playlistAction("rpi2dmd/playlist/update",{item_id:id,changes:{enabled:Boolean(enabled)}});}
  async _toggleGifCategory(id, enabled){const current=this._gifCategoriesList().filter(x=>x.enabled).map(x=>x.id);const next=enabled?[...new Set([...current,id])]:current.filter(x=>x!==id);try{await this._ws("rpi2dmd/gifs/categories/update",{enabled_ids:next});await this._loadSection("gif");}catch(e){this._showError(e);}}
  async _playlistAction(type,extra){try{await this._ws(type,extra);await this._loadSection("playlist");}catch(e){this._showError(e,"Impossible de modifier la ligne de playlist.");}}
  async _addItem(){const type=(prompt("Type : gif, time, date, weather ou mqtt","mqtt")||"").toLowerCase();if(!["gif","time","date","weather","mqtt"].includes(type))return;const item={type,enabled:true};if(type==="mqtt"){item.title=prompt("Titre","RPI2DMD")||"RPI2DMD";item.topic=prompt("Topic","")||"";item.unit=prompt("Unité","")||"";item.duration_seconds=Number(prompt("Durée en secondes","5"))||5;}try{await this._ws("rpi2dmd/playlist/add",{item});await this._loadSection("playlist");}catch(e){this._showError(e);}}
  async _saveMqtt(){try{const changes={broker:this.shadowRoot.querySelector("#broker").value,port:Number(this.shadowRoot.querySelector("#mqtt-port").value),username:this.shadowRoot.querySelector("#mqtt-user").value,client_id:this.shadowRoot.querySelector("#mqtt-client").value};const password=this.shadowRoot.querySelector("#mqtt-password").value;if(password)changes.password=password;await this._ws("rpi2dmd/mqtt/update",{changes});await this._refreshStatus();}catch(e){this._showError(e);}}
  async _testMqtt(){try{const result=await this._ws("rpi2dmd/mqtt/test",{body:{use_saved_credentials:true}});alert(`DNS: ${result.result.dns_resolved}\nTCP: ${result.result.reachable}\nAuthentifié: ${result.result.authenticated}\nLatence: ${result.result.latency_ms} ms`);}catch(e){this._showError(e);}}
  async _saveWeather(){try{const key=this.shadowRoot.querySelector("#weather-api-key").value;const changes={country:this.shadowRoot.querySelector("#weather-country").value,postal_code:this.shadowRoot.querySelector("#weather-zip").value,unit:this.shadowRoot.querySelector("#weather-unit").value};if(key)changes.api_key=key;await this._ws("rpi2dmd/weather/update",{changes});this.shadowRoot.querySelector("#weather-api-key").value="";await this._loadSection("weather");}catch(e){this._showError(e);}}
  _scheduleAdd(){this._brightnessSchedule.points=this._brightnessSchedule.points||[];this._brightnessSchedule.points.push({time:"12:00",value:50});this._render();}
  _scheduleReadForm(){const points=[...this.shadowRoot.querySelectorAll("[data-schedule-time]")].map((el,i)=>({time:el.value,value:Number(this.shadowRoot.querySelector(`[data-schedule-value="${i}"]`).value)}));const seen=new Set();for(const p of points){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)||!Number.isInteger(p.value)||p.value<0||p.value>100||seen.has(p.time))throw new Error("Planning invalide : heures uniques et luminosité 0–100 requises");seen.add(p.time);}return points.sort((a,b)=>a.time.localeCompare(b.time));}
  async _scheduleSave(){try{const points=this._scheduleReadForm();await this._ws("rpi2dmd/brightness/schedule/update",{schedule:points,enabled:this._brightnessSchedule.enabled!==false});this._brightnessSchedule.points=points;await this._loadSection("brightness");}catch(e){this._showError(e);}}
  async _scheduleApply(){try{if(this._brightnessSchedule.enabled===false)return;const points=this._scheduleReadForm();const now=new Date();const current=points.filter(p=>p.time<=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`).at(-1)||points.at(-1);if(current)await this._updateDisplay({brightness:{schedule:[{hour:now.getHours(),value:current.value}]}});}catch(e){this._showError(e);}}
  async _export(){try{const data=(await this._ws("rpi2dmd/config/export")).config;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download="rpi2dmd-config.json";a.click();URL.revokeObjectURL(a.href);}catch(e){this._showError(e);}}
  async _import(file){if(!file)return;try{const doc=JSON.parse(await file.text());const validation=(await this._ws("rpi2dmd/config/import/validate",{document:doc})).validation;if(!validation.valid)throw new Error("Configuration invalide");if(confirm("Appliquer cette configuration ?")){await this._ws("rpi2dmd/config/import/apply",{validation_token:validation.validation_token});await this._refreshStatus();} }catch(e){this._showError(e);}}
  _css(){return `:host{display:block;color:var(--primary-text-color);background:var(--primary-background-color);min-height:100vh;font-family:var(--paper-font-body1_-_font-family, sans-serif)}main{max-width:1200px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;align-items:center;gap:16px}.brand{display:flex;align-items:center;gap:16px;min-width:0}.logo{display:block;width:min(360px,42vw);max-height:90px;object-fit:contain}h1{margin:0;font-size:2rem}h2{margin:0 0 12px;font-size:1.1rem}.sub,small{color:var(--secondary-text-color)}nav{display:flex;gap:6px;overflow:auto;padding:20px 0 12px;border-bottom:1px solid var(--divider-color)}button,select,input{font:inherit}button{border:0;border-radius:8px;padding:10px 14px;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.nav{background:var(--secondary-background-color);color:var(--primary-text-color);white-space:nowrap}.nav.active{background:var(--primary-color);color:#fff}.card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:14px;padding:18px;margin:16px 0;box-shadow:var(--ha-card-box-shadow,none)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}.cards .card{margin:0}.card strong{display:block;font-size:1.5rem;margin:8px 0}.controls{display:flex;flex-wrap:wrap;gap:18px;align-items:center}.controls label,.card>label{display:flex;flex-direction:column;gap:6px;margin:10px 0}.toggle{flex-direction:row!important;align-items:center}.row,.item{display:flex;justify-content:space-between;align-items:center;gap:12px}.item{border-top:1px solid var(--divider-color);padding:14px 0;min-width:0}.disabled-item{opacity:.62}.playlist-state{display:flex;align-items:center;gap:8px;overflow-wrap:anywhere}.actions{display:flex;gap:5px;flex-wrap:wrap}.actions button{padding:7px 9px}.error{background:var(--error-color);color:#fff;padding:12px;border-radius:8px;margin:14px 0}.warning{background:var(--warning-color);padding:14px;border-radius:8px;color:var(--primary-text-color)}input,select{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:6px;padding:9px;max-width:100%}.device{display:flex;align-items:center;gap:8px}.category-list{display:grid;gap:12px}.category-card,.schedule-row{display:flex;justify-content:space-between;align-items:center;gap:14px;border:1px solid var(--divider-color);border-radius:10px;padding:14px;min-width:0}.category-card small{display:block;margin-top:5px}.schedule-list{display:grid;gap:10px;margin:14px 0}.schedule-row label{display:flex;align-items:center;gap:8px;min-width:0}.file{display:block;margin-top:20px}@media(max-width:600px){main{padding:14px}.brand{align-items:flex-start}.logo{width:100%;max-width:300px;height:auto}header{align-items:flex-start;flex-direction:column}.device{width:100%}.device select{width:100%}.item,.schedule-row,.category-card{align-items:flex-start;flex-direction:column}.actions{width:100%}nav{padding-top:12px}}
`}
}
customElements.define("rpi2dmd-panel", Rpi2dmdPanel);
