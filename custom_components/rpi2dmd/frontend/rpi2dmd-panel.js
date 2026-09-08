/* RPI2DMD HA-4 panel: dependency-free Web Component.
 * All Raspberry communication goes through hass.callWS; no token or API URL
 * is ever present in this browser code. */
const RPI_POLISH_CSS = `
  *{box-sizing:border-box}:host{--rpi-blue:#03a9f4;--rpi-cyan:#22d3ee;--rpi-purple:#a855f7}
  main{max-width:1280px;padding:28px clamp(16px,3vw,42px) 48px}
  .hero-content{position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:24px;min-height:280px;padding:30px clamp(22px,4vw,48px)}
  .eyebrow{margin:0 0 8px;color:#67e8f9;font-size:.74rem;font-weight:800;letter-spacing:.2em}.hero h1{margin:0;color:#fff;font-size:clamp(2.1rem,5vw,4rem);letter-spacing:-.045em;line-height:1}.hero .sub{margin:.65rem 0 0;color:#cbd5e1}.hero-meta{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap}.online-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(103,232,249,.35);border-radius:999px;background:rgba(8,47,73,.72);color:#cffafe;font-weight:700;font-size:.84rem;white-space:nowrap}.online-pill i{display:block;width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 13px #34d399}.online-pill.offline{border-color:rgba(248,113,113,.45);background:rgba(69,10,10,.76);color:#fecaca}.online-pill.offline i{background:#f87171;box-shadow:0 0 13px #f87171}.device{font-weight:700}
  .metric-card{position:relative;overflow:hidden}.metric-card:after{content:"";position:absolute;width:100px;height:100px;right:-38px;bottom:-42px;border-radius:50%;background:rgba(34,211,238,.1)}.metric-head{display:flex;align-items:center;gap:9px}.metric-head h2{margin:0;color:var(--secondary-text-color);font-size:.78rem;letter-spacing:.1em}.metric-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,rgba(34,211,238,.2),rgba(168,85,247,.2));color:var(--rpi-blue);font-weight:800}.card{border-radius:18px;box-shadow:0 8px 26px rgba(0,0,0,.08)}.card strong{margin:16px 0 5px;letter-spacing:-.025em}.nav{border:1px solid var(--divider-color);border-radius:10px;box-shadow:none;font-weight:650;transition:all .16s ease}.nav.active{background:linear-gradient(135deg,var(--rpi-blue),var(--rpi-purple));box-shadow:0 5px 18px rgba(59,130,246,.3)}button{border-radius:10px;transition:transform .16s ease,filter .16s ease,box-shadow .16s ease}button:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 7px 18px rgba(3,169,244,.25)}.category-card,.schedule-row{background:color-mix(in srgb,var(--secondary-background-color) 65%,transparent);border-radius:12px}.disabled-item{opacity:.58}.warning{border:1px solid rgba(245,158,11,.45);border-radius:14px;background:linear-gradient(110deg,rgba(245,158,11,.2),rgba(239,68,68,.12));font-weight:700}.success{border:1px solid rgba(34,197,94,.45);border-radius:12px;background:rgba(34,197,94,.16);color:var(--primary-text-color);font-weight:700}.brightness-control{flex:1 1 280px;min-width:min(100%,280px);margin:0!important}.brightness-line{display:flex;align-items:center;justify-content:space-between;gap:12px}.brightness-value{font-variant-numeric:tabular-nums;font-weight:700;color:var(--primary-text-color)}.brightness-slider{position:relative;width:100%;height:28px;margin:2px 0 0}.brightness-track{position:absolute;left:10px;right:10px;top:50%;height:6px;transform:translateY(-50%);border-radius:999px;background:color-mix(in srgb,var(--secondary-text-color) 35%,var(--secondary-background-color))}.brightness-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,var(--rpi-blue),var(--rpi-cyan));pointer-events:none}.brightness-input{position:absolute;inset:0;width:100%;height:28px;padding:0;margin:0;background:transparent;appearance:none;-webkit-appearance:none;cursor:pointer;z-index:1}.brightness-input::-webkit-slider-runnable-track{height:6px;background:transparent;border:0}.brightness-input::-webkit-slider-thumb{width:20px;height:20px;margin-top:-7px;border:2px solid #e0f2fe;border-radius:50%;background:var(--rpi-blue);box-shadow:0 0 0 3px rgba(3,169,244,.2),0 2px 8px rgba(0,0,0,.3);-webkit-appearance:none}.brightness-input::-moz-range-track{height:6px;background:transparent;border:0}.brightness-input::-moz-range-progress{height:6px;background:transparent}.brightness-input::-moz-range-thumb{width:20px;height:20px;border:2px solid #e0f2fe;border-radius:50%;background:var(--rpi-blue);box-shadow:0 0 0 3px rgba(3,169,244,.2),0 2px 8px rgba(0,0,0,.3)}
  @media(max-width:700px){main{padding:16px 12px 34px}.item,.schedule-row,.category-card{align-items:flex-start;flex-direction:column}.actions{width:100%}nav{padding-top:13px}}
`;
const RPI_EXACT_HERO_CSS = `
  .hero{position:relative;overflow:hidden;width:100%;height:clamp(350px,30vw,380px);border:1px solid rgba(148,220,255,.2);border-radius:24px;background-color:#050a12;background-image:url("/rpi2dmd-assets/rpi2dmd-ha-banner-4.png");background-repeat:no-repeat;background-position:center center;background-size:100% 100%;box-shadow:0 20px 54px rgba(2,8,23,.3);isolation:isolate}
  .hero-content{position:relative;z-index:1;display:block;width:100%;height:100%;padding:0}
  .hero-overlay{position:absolute;right:8px;bottom:0px;z-index:2;display:flex;align-items:center;justify-content:flex-end;gap:12px;max-width:calc(100% - 28px);padding:10px 12px;border:1px solid rgba(148,220,255,.24);border-radius:14px;background:rgba(3,10,20,.76);box-shadow:0 10px 30px rgba(0,0,0,.3);backdrop-filter:blur(9px)}
  .hero-overlay .device{display:flex;align-items:center;gap:8px;color:#e0f2fe;font-weight:700;white-space:nowrap}.hero-overlay select{min-width:150px;background:rgba(15,34,54,.92);border-color:rgba(125,211,252,.35);color:#f0f9ff}.hero-overlay .online-pill{padding:7px 10px}
  @media(max-width:700px){.hero{height:clamp(360px,78vw,430px)}.hero-overlay{left:8px;right:8px;bottom:0px;justify-content:space-between;max-width:none;gap:8px}.hero-overlay .device{min-width:0;flex:1}.hero-overlay select{min-width:0;width:100%;flex:1}.hero-overlay .online-pill{flex-shrink:0}}
`;
const ICON_PICKER_CSS = `.mqtt-icon-field{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}.mqtt-icon-preview{width:24px;height:24px;object-fit:contain}.mqtt-icon-empty{color:var(--secondary-text-color)}.icon-picker-backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.5)}.icon-picker{width:min(860px,100%);max-height:90vh;overflow:auto;margin:0}.icon-filters{display:flex;gap:10px;margin:12px 0;flex-wrap:wrap}.icon-filters input{flex:1;min-width:180px}.icon-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-top:14px}.icon-option{display:flex;flex-direction:column;align-items:center;gap:6px;min-height:122px;padding:10px;background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.icon-option small{font-size:.75rem}.icon-tile{display:grid;place-items:center;width:56px;height:56px;border-radius:8px;background:var(--primary-background-color);color:var(--secondary-text-color)}.icon-tile img{max-width:100%;max-height:100%;object-fit:contain}`;
class Rpi2dmdPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._devices = [];
    this._entry = null;
    this._online = false;
    this._section = "dashboard";
    this._status = null;
    this._display = null;
    this._playlist = null;
    this._mqtt = null;
    this._weather = null;
    this._gifs = null;
    this._gifCategories = null;
    this._gifLoading = false;
    this._featureErrors = {};
    this._sectionRequestId = 0;
    this._brightnessSchedule = { enabled: true, points: [] };
    this._iconPickerOpen = false;
    this._iconPickerTarget = null;
    this._icons = [];
    this._iconSearch = "";
    this._iconCategory = "";
    this._iconPreviewCache = {};
    this._busy = false;
    this._timer = null;
    this._bannerChecked = false;
    this._notice = "";
    this._noticeTimer = null;
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
    const wasOnline = this._online;
    try {
      const result = await this._ws("rpi2dmd/status");
      this._online = result.online === true || result.available === true;
      this._status = this._online ? (result.status || {}) : null;
      if (!this._online) {
        this._clearRuntimeData();
        this._error = "Impossible de joindre le RPI2DMD. Les données temps réel sont temporairement indisponibles.";
      } else this._clearError();
      this._render();
      if (this._online && !wasOnline && this._section !== "dashboard") await this._loadSection(this._section);
    } catch (err) {
      this._online = false;
      this._clearRuntimeData();
      this._showError(err, "Impossible de joindre le RPI2DMD. Les données temps réel sont temporairement indisponibles.");
    }
  }
  _clearRuntimeData() { this._status=null; this._display=null; this._playlist=null; this._mqtt=null; this._weather=null; this._gifs=null; this._gifCategories=null; }
  async _loadSection(section) {
    const requestId = ++this._sectionRequestId;
    this._section = section;
    this._featureErrors[section] = "";
    if (section === "gif") {
      this._gifLoading = true;
      this._gifs = null;
      this._gifCategories = null;
    }
    this._render();
    let display;
    let playlist;
    let mqtt;
    let weather;
    let gifs;
    let gifCategories;
    let brightnessSchedule;
    let system;
    try {
      if (section === "display") display = (await this._ws("rpi2dmd/display/get")).display;
      if (section === "playlist") playlist = (await this._ws("rpi2dmd/playlist/get")).playlist;
      if (section === "mqtt") mqtt = (await this._ws("rpi2dmd/mqtt/get")).mqtt;
      if (section === "weather") weather = (await this._ws("rpi2dmd/weather/get")).weather;
      if (section === "gif") {
        gifs = (await this._ws("rpi2dmd/gifs/list", { limit: 100 })).gifs;
        gifCategories = (await this._ws("rpi2dmd/gifs/categories")).categories;
      }
      if (section === "brightness") { const raw=(await this._ws("rpi2dmd/brightness/schedule/get")).schedule || {}; brightnessSchedule = raw.points ? raw : { enabled: true, points: Array.isArray(raw)?raw:(raw.schedule||[]) }; }
      if (section === "system") system = (await this._ws("rpi2dmd/system")).system;
      if (requestId !== this._sectionRequestId || this._section !== section) return;
      if (section === "display") this._display = display;
      if (section === "playlist") this._playlist = playlist;
      if (section === "mqtt") this._mqtt = mqtt;
      if (section === "weather") this._weather = weather;
      if (section === "gif") { this._gifs = gifs; this._gifCategories = gifCategories; }
      if (section === "brightness") this._brightnessSchedule = brightnessSchedule;
      if (section === "system") this._status = system;
      this._featureErrors[section] = "";
      if (this._online) this._clearError();
      this._render();
    } catch (err) {
      if (requestId !== this._sectionRequestId || this._section !== section) return;
      if (section === "gif") this._showFeatureError("gif", err, "Impossible de charger les GIF du RPI2DMD.");
      else this._showFeatureError(section, err);
    } finally {
      if (section === "gif" && requestId === this._sectionRequestId && this._section === section) {
        this._gifLoading = false;
        this._render();
      }
    }
  }
  _showFeatureError(feature, err, userMessage = "") { this._featureErrors[feature] = userMessage || err?.message || "Erreur de chargement"; this._render(); }
  _showError(err, userMessage = "") {
    const message = err?.message || "";
    console.error("RPI2DMD Home Assistant WebSocket error", message);
    this._error = userMessage || (/unknown command/i.test(message)
      ? "Erreur Home Assistant : commande RPI2DMD indisponible."
      : (message || "RPI2DMD indisponible"));
    this._notice = "";
    this._render();
  }
  _clearError() { this._error = ""; }
  _showNotice(message) {
    this._error = "";
    this._notice = message;
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => { this._notice = ""; this._render(); }, 4500);
    this._render();
  }
  async _updateDisplay(changes) {
    if (this._busy) return;
    this._busy = true; this._clearError(); this._render();
    try { this._display = (await this._ws("rpi2dmd/display/update", { changes })).display; await this._refreshStatus(); }
    catch (err) { this._showFeatureError("display", err, "Impossible d'enregistrer l'affichage."); }
    finally { this._busy = false; this._render(); }
  }
  _flag(name) { return (this._display?.flags || {})[name] === true || (this._status?.display?.active_flags || []).includes(name); }
  _esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `<style>${this._css()}${RPI_POLISH_CSS}${RPI_EXACT_HERO_CSS}${ICON_PICKER_CSS}</style><main>
      <header class="hero"><div class="hero-content"><div class="hero-overlay"><span class="online-pill ${this._online?"":"offline"}"><i></i> ${this._online ? "En ligne" : "Hors ligne"}</span><label class="device">Appareil <select id="device">${this._devices.map(d => `<option value="${this._esc(d.entry_id)}" ${d.entry_id===this._entry?"selected":""}>${this._esc(this._deviceLabel(d))}</option>`).join("")}</select></label></div></div></header>
      <nav aria-label="Navigation">${["dashboard","display","brightness","playlist","mqtt","gif","weather","system","backup"].map(s => `<button class="nav ${this._section===s?"active":""}" data-nav="${s}">${this._label(s)}</button>`).join("")}</nav>
      ${this._error ? `<div class="error" role="alert">${this._esc(this._error)} <button data-action="retry">Réessayer</button></div>` : ""}
      ${this._section !== "gif" && this._featureErrors[this._section] ? `<div class="error" role="alert">${this._esc(this._featureErrors[this._section])}</div>` : ""}
      ${this._notice ? `<div class="success" role="status">${this._esc(this._notice)}</div>` : ""}
      ${this._content()}${this._iconPickerOpen ? this._iconPickerMarkup() : ""}
    </main>`;
    this._checkHeroBanner();
    this._bind();
  }
  _checkHeroBanner() {
    if (this._bannerChecked) return;
    this._bannerChecked = true;
    fetch("/rpi2dmd-assets/rpi2dmd-ha-banner-4.png", { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); })
      .catch(() => console.error("RPI2DMD hero banner failed to load"));
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
    const online=this._online===true, s=online?(this._status||{}):{}, mqtt=s.mqtt||{}, display=s.display||{}, power=s.power||{}, screen=s.current_screen||{}, playlist=s.playlist||{};
    const displayKnown=display.service_state!=null||typeof display.paused==="boolean";
    const mqttKnown=typeof mqtt.connected==="boolean";
    const powerKnown=typeof power.undervoltage==="boolean"||typeof power.undervoltage_now==="boolean"||power.throttled_code!=null;
    const screenKnown=screen.available===true;
    return `<section class="grid cards">${this._card("DISPLAY",online&&displayKnown?(display.service_state||"—"):"—",online&&displayKnown?(display.paused===true?"En pause":display.service_state?"Actif":"—"):"—","▣")}${this._card("MQTT",online&&mqttKnown?(mqtt.connected?"Connecté":"Déconnecté"):"—",online&&mqttKnown?(mqtt.state||"—"):"—","↯")}${this._card("TEMPÉRATURE",online&&s.cpu_temperature_c!=null?`${s.cpu_temperature_c} °C`:"—","CPU","℃")}${this._card("ALIMENTATION",online&&powerKnown?(power.undervoltage||power.undervoltage_now?"⚠ Sous-tension":"OK"):"—",online&&powerKnown?(power.throttled_code||"—"):"—","⚡")}${this._card("ÉCRAN ACTUEL",online&&screen.available===true?(screen.id||screen.type||"—"):"—",online&&screenKnown?(playlist.mode||"—"):"—","◈")}${this._card("UPTIME",online&&s.uptime_seconds!=null?this._duration(s.uptime_seconds):"—","Raspberry Pi","◷")}</section>
      ${online&&power.undervoltage?`<p class="warning" role="alert">⚠ SOUS-TENSION DÉTECTÉE — code ${this._esc(power.throttled_code)}</p>`:""}<section class="card quick"><h2>Contrôles rapides</h2>${this._quickControls()}</section>`;
  }
  _quickControls() { const online=this._online===true, brightness=online?this._brightness():0, percentage=online?((Number(brightness)-0)/(100-0))*100:0; return `<div class="controls"><label class="brightness-control"><span class="brightness-line"><span>Luminosité</span><output class="brightness-value" id="brightness-value" for="brightness">${online?`${brightness} %`:"—"}</output></span><div class="brightness-slider"><div class="brightness-track"><div class="brightness-fill" id="brightness-fill" style="width:${percentage}%"></div></div><input class="brightness-input" type="range" min="0" max="100" step="5" id="brightness" value="${brightness}" aria-label="Luminosité" ${online?"":"disabled"}></div></label>${["clock","date","weather","gif","mqtt"].map(f=>`<label class="toggle"><input type="checkbox" data-flag="${f}" ${this._flag(f)?"checked":""} ${online?"":"disabled"}> ${this._labelFlag(f)}</label>`).join("")}</div>`; }
  _labelFlag(f) { return ({clock:"Heure",date:"Date",weather:"Météo",gif:"GIF",mqtt:"MQTT Display"})[f]; }
  _brightness() { const rows=this._display?.brightness?.schedule||[]; const h=new Date().getHours(); return rows.find(r=>r.hour===h)?.value ?? 0; }
  _displayPage() { return `<section class="card"><h2>Affichage</h2><p class="sub">Les paramètres sont appliqués via l’API transactionnelle.</p>${this._quickControls()}</section>`; }
  _itemIcon(item) { return item.icon ?? item.icon_id ?? item.logo ?? ""; }
  _playlistPage() { const items=this._playlist?.items||[]; return `<section class="card"><div class="row"><h2>Playlist</h2><button data-action="playlist-add">Ajouter</button></div>${items.length?items.map((i,n)=>{const icon=this._itemIcon(i); const mqtt=i.type==="mqtt"; return `<article class="item ${i.enabled?"":"disabled-item"}"><div><label class="playlist-state"><input type="checkbox" data-item="${this._esc(i.id)}" data-action="toggle" ${i.enabled?"checked":""}> <b>${i.enabled?"Actif":"Inactif"} [${i.enabled?"ON":"OFF"}]</b></label><p>${n+1} — ${this._esc(i.type)} · ${this._esc(i.title||i.topic||"")} ${i.unit?`(${this._esc(i.unit)})`:""}</p>${mqtt?`<div class="mqtt-icon-field">${icon?`<img class="mqtt-icon-preview" data-icon-preview="${this._esc(icon)}" alt="Icône MQTT">`:`<span class="mqtt-icon-empty">Aucune icône</span>`}<span>Icône : <b>${this._esc(icon||"Aucune")}</b></span><button data-action="icon-picker" data-item="${this._esc(i.id)}">Choisir une icône</button>${icon?`<button data-action="icon-clear" data-item="${this._esc(i.id)}">Aucune icône</button>`:""}</div>`:""}</div><div class="actions"><button data-item="${this._esc(i.id)}" data-action="up" ${n===0?"disabled":""}>↑</button><button data-item="${this._esc(i.id)}" data-action="down" ${n===items.length-1?"disabled":""}>↓</button><button data-item="${this._esc(i.id)}" data-action="duplicate">Dupliquer</button><button data-item="${this._esc(i.id)}" data-action="delete">Supprimer</button></div></article>`;}).join(""):"<p>Aucune ligne.</p>"}</section>`; }
  _iconItems() { const raw=this._icons?.items||this._icons?.icons||this._icons||[]; return (Array.isArray(raw)?raw:[]).map(x=>typeof x==="string"?{id:x,name:x,category:""}:{id:x.id??x.name??x.icon,name:x.name??x.label??x.id,category:x.category??x.group??""}).filter(x=>x.id); }
  _iconPickerMarkup() { const items=this._iconItems(), supplied=Array.isArray(this._icons?.categories)?this._icons.categories:[], cats=[...new Set([...items.map(x=>x.category),...supplied].filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b))); const filtered=items.filter(x=>(!this._iconSearch||`${x.name} ${x.id} ${x.category}`.toLowerCase().includes(this._iconSearch.toLowerCase()))&&(!this._iconCategory||x.category===this._iconCategory)); return `<div class="icon-picker-backdrop" role="presentation"><section class="icon-picker card" role="dialog" aria-label="Choisir une icône"><div class="row"><h2>Choisir une icône</h2><button data-action="icon-close" aria-label="Fermer">×</button></div><div class="icon-filters"><input id="icon-search" type="search" placeholder="Rechercher une icône…" value="${this._esc(this._iconSearch)}"><select id="icon-category"><option value="">Toutes les catégories</option>${cats.map(c=>`<option value="${this._esc(c)}" ${c===this._iconCategory?"selected":""}>${this._esc(c)}</option>`).join("")}</select></div><button data-action="icon-select-none">Aucune icône</button><div class="icon-grid">${filtered.map(x=>`<button class="icon-option" data-action="icon-select" data-icon-id="${this._esc(x.id)}"><span class="icon-tile">${this._iconPreviewCache[x.id]?`<img loading="lazy" src="${this._iconPreviewCache[x.id]}" alt="">`:`<span aria-hidden="true">PNG</span>`}</span><b>${this._esc(x.name)}</b>${x.category?`<small>${this._esc(x.category)}</small>`:""}</button>`).join("")||"<p>Aucune icône trouvée.</p>"}</div></section></div>`; }
  _mqttPage() { const online=this._online===true, m=this._mqtt||{}; return `<section class="card"><h2>MQTT</h2><p>État : ${online?(this._status?.mqtt?.connected?"Connecté":"Déconnecté"):"—"}</p><p>Password configuré : ${online?(m.password_configured?"oui":"non"):"—"}</p><label>Broker <input id="broker" value="${this._esc(m.broker)}" ${online?"":"disabled"}></label><label>Port <input id="mqtt-port" type="number" value="${m.port||1883}" ${online?"":"disabled"}></label><label>Username <input id="mqtt-user" value="${this._esc(m.username)}" ${online?"":"disabled"}></label><label>Client ID <input id="mqtt-client" value="${this._esc(m.client_id)}" ${online?"":"disabled"}></label><label>Password <input id="mqtt-password" type="password" value="" placeholder="Laisser vide pour conserver" ${online?"":"disabled"}></label><button data-action="mqtt-save" ${online?"":"disabled"}>Enregistrer</button> <button data-action="mqtt-test" ${online?"":"disabled"}>Tester la connexion</button></section>`; }
  _gifCategoriesList() {
    const raw = this._gifCategories;
    const list = Array.isArray(raw) ? raw : (raw?.categories || raw?.items || []);
    return list.map((x) => typeof x === "string" ? {id:x,name:x,count:0,enabled:true} : {
      id: x.id ?? x.name ?? x.category, name: x.name ?? x.title ?? x.id ?? x.category,
      count: x.count ?? x.total ?? x.gif_count ?? 0, enabled: x.enabled !== false,
    }).sort((a,b)=>String(a.name).localeCompare(String(b.name), undefined, {numeric:true, sensitivity:"base"}));
  }
  _gifPage() {
    if (this._gifLoading) return `<section class="card"><h2>GIF</h2><p>Chargement des GIF…</p></section>`;
    if (this._featureErrors.gif) return `<section class="card" role="alert"><h2>GIF</h2><p class="error">${this._esc(this._featureErrors.gif)} <button data-action="gif-retry">Réessayer</button></p></section>`;
    const g=this._gifs||{}, categories=this._gifCategoriesList();
    const total=g.total ?? categories.reduce((n,x)=>n+Number(x.count||0),0);
    const summary=categories.length||total ? `${categories.length} dossiers · ${total} GIF disponibles` : "Aucun GIF disponible.";
    return `<section class="card"><h2>GIF</h2><p>${summary}</p><div class="category-list">${categories.map(x=>`<article class="category-card"><div><b>${this._esc(x.name)}</b><small>${x.count} GIF</small></div><label class="toggle">Actif <input type="checkbox" data-gif-category="${this._esc(x.id)}" ${x.enabled?"checked":""}></label></article>`).join("") || "<p>Aucune catégorie disponible.</p>"}</div></section>`;
  }
  _weatherPage() { const w=this._weather||{}; return `<section class="card"><h2>Météo</h2><label>Pays <input id="weather-country" value="${this._esc(w.country)}"></label><label>Code postal <input id="weather-zip" value="${this._esc(w.postal_code)}"></label><label>Unité <select id="weather-unit"><option ${w.unit==="metric"?"selected":""}>metric</option><option ${w.unit==="imperial"?"selected":""}>imperial</option></select></label><p>Clé OpenWeatherMap configurée : <b>${w.api_key_configured?"Oui":"Non"}</b></p><label>OpenWeatherMap API Key <input id="weather-api-key" type="password" value="" placeholder="Laisser vide pour conserver la clé actuelle" autocomplete="new-password"></label><button data-action="weather-save">Enregistrer</button></section>`; }
  _scheduleTime(point) { return point.time || `${String(point.hour??0).padStart(2,"0")}:00`; }
  _brightnessPage() { const s=this._brightnessSchedule||{}, points=Array.isArray(s.points)?s.points:[], enabled=s.enabled!==false; return `<section class="card"><div class="row"><h2>Planning luminosité</h2><label class="toggle">Activé <input id="schedule-enabled" type="checkbox" ${enabled?"checked":""}></label></div><p class="sub">Chaque point s'applique jusqu'au suivant et le planning boucle sur 24 heures.</p><div class="schedule-list">${points.map((p,i)=>`<div class="schedule-row"><label>Heure <input type="time" data-schedule-time="${i}" value="${this._esc(this._scheduleTime(p))}"></label><label>Luminosité <input type="number" min="0" max="100" data-schedule-value="${i}" value="${Number(p.value??0)}"> %</label><button data-action="schedule-delete" data-schedule-index="${i}">Supprimer</button></div>`).join("") || "<p>Aucun point configuré.</p>"}</div><div class="actions"><button data-action="schedule-add">Ajouter une heure</button><button data-action="schedule-save">Enregistrer</button><button data-action="schedule-apply">Appliquer maintenant</button></div></section>`; }
  _systemPage() { const s=this._status||{}; return `<section class="grid cards"><section class="card"><h2>Système</h2><p>Modèle : ${this._esc(s.model)}</p><p>Hostname : ${this._esc(s.hostname)}</p><p>IP : ${this._esc((s.ip_addresses||[]).join(", "))}</p><p>Uptime : ${this._duration(s.uptime_seconds)}</p><p>CPU : ${s.cpu_temperature_c??"—"} °C</p></section><section class="card"><h2>Services</h2><p>Display : ${this._esc(s.services?.display?.state||"—")}</p><p>MQTT : ${this._esc(s.services?.mqtt?.state||"—")}</p><p>NRestarts : ${s.services?.display?.nrestarts??"—"} / ${s.services?.mqtt?.nrestarts??"—"}</p><p>Throttled : ${this._esc(s.power?.throttled_code||"—")}</p></section></section>`; }
  _backupPage() { return `<section class="card"><h2>Sauvegarde</h2><p>Les exports sont sans secrets ni assets.</p><button data-action="export">Exporter configuration</button><label class="file">Importer configuration <input id="import" type="file" accept="application/json"></label><p id="import-result"></p></section>`; }
  _duration(sec) { if (sec == null) return "—"; const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60); return `${h} h ${m} min`; }
  _bind() {
    this.shadowRoot.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>this._loadSection(b.dataset.nav));
    const device=this.shadowRoot.querySelector("#device"); if(device) device.onchange=()=>{this._entry=device.value; this._online=false; this._clearRuntimeData(); this._render(); this._refreshStatus();};
    this.shadowRoot.querySelectorAll("[data-flag]").forEach(el=>el.onchange=()=>this._updateDisplay({flags:{[el.dataset.flag]:el.checked}}));
    const bright=this.shadowRoot.querySelector("#brightness"); const brightValue=this.shadowRoot.querySelector("#brightness-value"); const brightFill=this.shadowRoot.querySelector("#brightness-fill"); if(bright){const updateVisual=()=>{const value=Number(bright.value); const min=Number(bright.min||0); const max=Number(bright.max||100); const percentage=((value-min)/(max-min))*100; if(brightValue) brightValue.textContent=`${value} %`; if(brightFill) brightFill.style.width=`${percentage}%`;}; updateVisual(); bright.addEventListener("input",updateVisual); bright.onchange=()=>this._updateDisplay({brightness:{schedule:[{hour:new Date().getHours(),value:Number(bright.value)}]}});}
    this.shadowRoot.querySelector("[data-action=retry]")?.addEventListener("click",()=>this._refreshStatus());
    this.shadowRoot.querySelector("[data-action=gif-retry]")?.addEventListener("click",()=>this._loadSection("gif"));
    this.shadowRoot.querySelectorAll("[data-action=up],[data-action=down]").forEach(b=>b.onclick=()=>this._move(b.dataset.item,b.dataset.action==="up"?-1:1));
    this.shadowRoot.querySelectorAll("[data-action=duplicate]").forEach(b=>b.onclick=()=>this._playlistAction("rpi2dmd/playlist/duplicate",{item_id:b.dataset.item}));
    this.shadowRoot.querySelectorAll("[data-action=delete]").forEach(b=>b.onclick=()=>{if(confirm("Supprimer cette ligne ?"))this._playlistAction("rpi2dmd/playlist/delete",{item_id:b.dataset.item});});
    this.shadowRoot.querySelectorAll("[data-action=icon-picker]").forEach(b=>b.onclick=()=>this._openIconPicker(b.dataset.item));
    this.shadowRoot.querySelectorAll("[data-action=icon-clear]").forEach(b=>b.onclick=()=>this._setItemIcon(b.dataset.item, null));
    this.shadowRoot.querySelectorAll("[data-icon-preview]").forEach(img=>this._loadIconPreview(img.dataset.iconPreview, img));
    this.shadowRoot.querySelector("[data-action=icon-close]")?.addEventListener("click",()=>{this._iconPickerOpen=false;this._render();});
    this.shadowRoot.querySelector("[data-action=icon-select-none]")?.addEventListener("click",()=>this._setItemIcon(this._iconPickerTarget, null));
    this.shadowRoot.querySelectorAll("[data-action=icon-select]").forEach(b=>b.onclick=()=>this._setItemIcon(this._iconPickerTarget,b.dataset.iconId));
    this.shadowRoot.querySelector("#icon-search")?.addEventListener("input",e=>{this._iconSearch=e.target.value;this._render();});
    this.shadowRoot.querySelector("#icon-category")?.addEventListener("change",e=>{this._iconCategory=e.target.value;this._render();});
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
  async _openIconPicker(itemId){this._iconPickerTarget=itemId;this._iconPickerOpen=true;this._iconSearch="";this._iconCategory="";this._render();try{this._icons=(await this._ws("rpi2dmd/icons/list",{limit:200})).icons||{};this._render();const items=this._iconItems();await Promise.all(items.slice(0,60).map(x=>this._loadIconPreview(x.id)));this._render();}catch(e){this._iconPickerOpen=false;this._showFeatureError("playlist",e,"Impossible de charger les icônes du RPI2DMD.");}}
  async _loadIconPreview(iconId, target=null){if(this._iconPreviewCache[iconId]){if(target)target.src=this._iconPreviewCache[iconId];return;}try{const icon=(await this._ws("rpi2dmd/icons/get",{icon_id:iconId})).icon;const src=`data:${icon.content_type};base64,${icon.data}`;this._iconPreviewCache[iconId]=src;if(target)target.src=src;}catch(e){if(target)target.alt="Icône indisponible";}}
  async _setItemIcon(itemId, iconId){if(!itemId)return;try{await this._ws("rpi2dmd/playlist/update",{item_id:itemId,changes:{icon:iconId,show_icon:Boolean(iconId)}});this._iconPickerOpen=false;this._iconPickerTarget=null;await this._loadSection("playlist");}catch(e){this._showFeatureError("playlist",e,"Impossible d'enregistrer l'icône MQTT.");}}
  async _move(id,delta){const items=this._playlist?.items||[], i=items.findIndex(x=>x.id===id); if(i<0)return; await this._playlistAction("rpi2dmd/playlist/move",{item_id:id,index:i+delta});}
  async _toggleItem(id, enabled){await this._playlistAction("rpi2dmd/playlist/update",{item_id:id,changes:{enabled:Boolean(enabled)}});}
  async _toggleGifCategory(id, enabled){const current=this._gifCategoriesList().filter(x=>x.enabled).map(x=>x.id);const next=enabled?[...new Set([...current,id])]:current.filter(x=>x!==id);try{await this._ws("rpi2dmd/gifs/categories/update",{enabled_ids:next});await this._loadSection("gif");}catch(e){this._showFeatureError("gif",e,"Impossible de modifier les catégories GIF.");}}
  async _playlistAction(type,extra){try{await this._ws(type,extra);await this._loadSection("playlist");}catch(e){this._showFeatureError("playlist",e,"Impossible de modifier la ligne de playlist.");}}
  async _addItem(){const type=(prompt("Type : gif, time, date, weather ou mqtt","mqtt")||"").toLowerCase();if(!["gif","time","date","weather","mqtt"].includes(type))return;const item={type,enabled:true};if(type==="mqtt"){item.title=prompt("Titre","RPI2DMD")||"RPI2DMD";item.topic=prompt("Topic","")||"";item.unit=prompt("Unité","")||"";item.duration_seconds=Number(prompt("Durée en secondes","5"))||5;}try{const result=await this._ws("rpi2dmd/playlist/add",{item});await this._loadSection("playlist");if(type==="mqtt"&&result.item?.id)this._openIconPicker(result.item.id);}catch(e){this._showFeatureError("playlist",e,"Impossible d'ajouter la ligne de playlist.");}}
  async _saveMqtt(){try{const changes={broker:this.shadowRoot.querySelector("#broker").value,port:Number(this.shadowRoot.querySelector("#mqtt-port").value),username:this.shadowRoot.querySelector("#mqtt-user").value,client_id:this.shadowRoot.querySelector("#mqtt-client").value};const password=this.shadowRoot.querySelector("#mqtt-password").value;if(password)changes.password=password;await this._ws("rpi2dmd/mqtt/update",{changes});await this._refreshStatus();}catch(e){this._showFeatureError("mqtt",e,"Impossible d'enregistrer la configuration MQTT.");}}
  async _testMqtt(){try{const result=await this._ws("rpi2dmd/mqtt/test",{body:{use_saved_credentials:true}});alert(`DNS: ${result.result.dns_resolved}\nTCP: ${result.result.reachable}\nAuthentifié: ${result.result.authenticated}\nLatence: ${result.result.latency_ms} ms`);}catch(e){this._showFeatureError("mqtt",e,"Impossible de tester la connexion MQTT.");}}
  async _saveWeather(){try{const key=this.shadowRoot.querySelector("#weather-api-key").value;const changes={country:this.shadowRoot.querySelector("#weather-country").value,postal_code:this.shadowRoot.querySelector("#weather-zip").value,unit:this.shadowRoot.querySelector("#weather-unit").value};if(key)changes.api_key=key;await this._ws("rpi2dmd/weather/update",{changes});this.shadowRoot.querySelector("#weather-api-key").value="";await this._loadSection("weather");}catch(e){this._showFeatureError("weather",e,"Impossible d'enregistrer la météo.");}}
  _scheduleAdd(){this._brightnessSchedule.points=this._brightnessSchedule.points||[];this._brightnessSchedule.points.push({time:"12:00",value:50});this._render();}
  _scheduleReadForm(){const points=[...this.shadowRoot.querySelectorAll("[data-schedule-time]")].map((el,i)=>({time:el.value,value:Number(this.shadowRoot.querySelector(`[data-schedule-value="${i}"]`).value)}));const seen=new Set();for(const p of points){const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(p.time);if(!match)throw new Error(`L'heure « ${p.time||""} » est invalide (format HH:00 attendu).`);if(match[2]!=="00")throw new Error(`L'heure « ${p.time} » est invalide : les minutes doivent être 00.`);if(!Number.isInteger(p.value)||p.value<0||p.value>100)throw new Error(`La luminosité de ${p.time} doit être comprise entre 0 et 100.`);if(p.value%5)throw new Error(`La luminosité ${p.value} % de ${p.time} est invalide : utilisez un multiple de 5.`);if(seen.has(p.time))throw new Error(`Deux lignes utilisent la même heure : ${p.time}.`);seen.add(p.time);}if(!points.length)throw new Error("Le planning doit contenir au moins une heure.");return points.sort((a,b)=>a.time.localeCompare(b.time));}
  async _scheduleSave(){try{const points=this._scheduleReadForm();await this._ws("rpi2dmd/brightness/schedule/update",{schedule:points,enabled:this._brightnessSchedule.enabled!==false});this._brightnessSchedule.points=points;await this._loadSection("brightness");this._showNotice("✓ Planning enregistré");}catch(e){this._showFeatureError("brightness",e,`✕ Impossible d'enregistrer le planning : ${e.message||"vérifiez les champs."}`);}}
  async _scheduleApply(){try{const points=this._scheduleReadForm();const now=new Date();const current=points.filter(p=>p.time<=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`).at(-1)||points.at(-1);if(!current)throw new Error("aucun point horaire disponible");const result=await this._ws("rpi2dmd/display/update",{changes:{brightness:{schedule:[{hour:now.getHours(),value:current.value}]}}});this._display=result.display;await this._refreshStatus();this._showNotice(`✓ Luminosité appliquée : ${current.value} %`);}catch(e){this._showFeatureError("brightness",e,`✕ Impossible d'appliquer la luminosité : ${e.message||"réessayez."}`);}}
  async _export(){try{const data=(await this._ws("rpi2dmd/config/export")).config;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download="rpi2dmd-config.json";a.click();URL.revokeObjectURL(a.href);}catch(e){this._showFeatureError("backup",e,"Impossible d'exporter la configuration.");}}
  async _import(file){if(!file)return;try{const doc=JSON.parse(await file.text());const validation=(await this._ws("rpi2dmd/config/import/validate",{document:doc})).validation;if(!validation.valid)throw new Error("Configuration invalide");if(confirm("Appliquer cette configuration ?")){await this._ws("rpi2dmd/config/import/apply",{validation_token:validation.validation_token});await this._refreshStatus();} }catch(e){this._showFeatureError("backup",e,"Impossible d'importer la configuration.");}}
  _css(){return `:host{display:block;color:var(--primary-text-color);background:var(--primary-background-color);min-height:100vh;font-family:var(--paper-font-body1_-_font-family, sans-serif)}main{max-width:1200px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;align-items:center;gap:16px}.brand{display:flex;align-items:center;gap:16px;min-width:0}.logo{display:block;width:min(360px,42vw);max-height:90px;object-fit:contain}h1{margin:0;font-size:2rem}h2{margin:0 0 12px;font-size:1.1rem}.sub,small{color:var(--secondary-text-color)}nav{display:flex;gap:6px;overflow:auto;padding:20px 0 12px;border-bottom:1px solid var(--divider-color)}button,select,input{font:inherit}button{border:0;border-radius:8px;padding:10px 14px;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.nav{background:var(--secondary-background-color);color:var(--primary-text-color);white-space:nowrap}.nav.active{background:var(--primary-color);color:#fff}.card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:14px;padding:18px;margin:16px 0;box-shadow:var(--ha-card-box-shadow,none)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}.cards .card{margin:0}.card strong{display:block;font-size:1.5rem;margin:8px 0}.controls{display:flex;flex-wrap:wrap;gap:18px;align-items:center}.controls label,.card>label{display:flex;flex-direction:column;gap:6px;margin:10px 0}.toggle{flex-direction:row!important;align-items:center}.row,.item{display:flex;justify-content:space-between;align-items:center;gap:12px}.item{border-top:1px solid var(--divider-color);padding:14px 0;min-width:0}.disabled-item{opacity:.62}.playlist-state{display:flex;align-items:center;gap:8px;overflow-wrap:anywhere}.actions{display:flex;gap:5px;flex-wrap:wrap}.actions button{padding:7px 9px}.error{background:var(--error-color);color:#fff;padding:12px;border-radius:8px;margin:14px 0}.warning{background:var(--warning-color);padding:14px;border-radius:8px;color:var(--primary-text-color)}input,select{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:6px;padding:9px;max-width:100%}.device{display:flex;align-items:center;gap:8px}.category-list{display:grid;gap:12px}.category-card,.schedule-row{display:flex;justify-content:space-between;align-items:center;gap:14px;border:1px solid var(--divider-color);border-radius:10px;padding:14px;min-width:0}.category-card small{display:block;margin-top:5px}.schedule-list{display:grid;gap:10px;margin:14px 0}.schedule-row label{display:flex;align-items:center;gap:8px;min-width:0}.file{display:block;margin-top:20px}@media(max-width:600px){main{padding:14px}.brand{align-items:flex-start}.logo{width:100%;max-width:300px;height:auto}header{align-items:flex-start;flex-direction:column}.device{width:100%}.device select{width:100%}.item,.schedule-row,.category-card{align-items:flex-start;flex-direction:column}.actions{width:100%}nav{padding-top:12px}}
`}
}
customElements.define("rpi2dmd-panel", Rpi2dmdPanel);
