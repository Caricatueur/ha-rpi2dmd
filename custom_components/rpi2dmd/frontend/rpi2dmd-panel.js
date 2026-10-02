/* RPI2DMD HA-4 panel: dependency-free Web Component.
 * All Raspberry communication goes through hass.callWS; no token or API URL
 * is ever present in this browser code. */
const FRONTEND_VERSION = "0.5.0";
console.info(`[RPI2DMD] frontend ${FRONTEND_VERSION} loaded`);

const RPI_POLISH_CSS = `
  *{box-sizing:border-box}:host{--rpi-blue:#03a9f4;--rpi-cyan:#22d3ee;--rpi-purple:#a855f7}
  main{max-width:1280px;padding:28px clamp(16px,3vw,42px) 48px}
  .hero-content{position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:24px;min-height:280px;padding:30px clamp(22px,4vw,48px)}
  .eyebrow{margin:0 0 8px;color:#67e8f9;font-size:.74rem;font-weight:800;letter-spacing:.2em}.hero h1{margin:0;color:#fff;font-size:clamp(2.1rem,5vw,4rem);letter-spacing:-.045em;line-height:1}.hero .sub{margin:.65rem 0 0;color:#cbd5e1}.hero-meta{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap}.online-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(103,232,249,.35);border-radius:999px;background:rgba(8,47,73,.72);color:#cffafe;font-weight:700;font-size:.84rem;white-space:nowrap}.online-pill i{display:block;width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 13px #34d399}.online-pill.offline{border-color:rgba(248,113,113,.45);background:rgba(69,10,10,.76);color:#fecaca}.online-pill.offline i{background:#f87171;box-shadow:0 0 13px #f87171}.device{font-weight:700}
  .metric-card{position:relative;overflow:hidden}.metric-card:after{content:"";position:absolute;width:100px;height:100px;right:-38px;bottom:-42px;border-radius:50%;background:rgba(34,211,238,.1)}.metric-head{display:flex;align-items:center;gap:9px}.metric-head h2{margin:0;color:var(--secondary-text-color);font-size:.78rem;letter-spacing:.1em}.metric-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,rgba(34,211,238,.2),rgba(168,85,247,.2));color:var(--rpi-blue);font-weight:800}.card{border-radius:18px;box-shadow:0 8px 26px rgba(0,0,0,.08)}.card strong{margin:16px 0 5px;letter-spacing:-.025em}.nav{border:1px solid var(--divider-color);border-radius:10px;box-shadow:none;font-weight:650;transition:all .16s ease}.nav.active{background:linear-gradient(135deg,var(--rpi-blue),var(--rpi-purple));box-shadow:0 5px 18px rgba(59,130,246,.3)}button{border-radius:10px;transition:transform .16s ease,filter .16s ease,box-shadow .16s ease}button:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 7px 18px rgba(3,169,244,.25)}.category-card,.schedule-row{background:color-mix(in srgb,var(--secondary-background-color) 65%,transparent);border-radius:12px}.disabled-item{opacity:.58}.warning{border:1px solid rgba(245,158,11,.45);border-radius:14px;background:linear-gradient(110deg,rgba(245,158,11,.2),rgba(239,68,68,.12));font-weight:700}.success{border:1px solid rgba(34,197,94,.45);border-radius:12px;background:rgba(34,197,94,.16);color:var(--primary-text-color);font-weight:700}.brightness-control{flex:1 1 280px;min-width:min(100%,280px);margin:0!important}.brightness-line{display:flex;align-items:center;justify-content:space-between;gap:12px}.brightness-value{font-variant-numeric:tabular-nums;font-weight:700;color:var(--primary-text-color)}.brightness-slider{position:relative;width:100%;height:28px;margin:2px 0 0}.brightness-track{position:absolute;left:10px;right:10px;top:50%;height:6px;transform:translateY(-50%);border-radius:999px;background:color-mix(in srgb,var(--secondary-text-color) 35%,var(--secondary-background-color))}.brightness-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,var(--rpi-blue),var(--rpi-cyan));pointer-events:none}.brightness-input{position:absolute;inset:0;width:100%;height:28px;padding:0;margin:0;background:transparent;appearance:none;-webkit-appearance:none;cursor:pointer;z-index:1}.brightness-input::-webkit-slider-runnable-track{height:6px;background:transparent;border:0}.brightness-input::-webkit-slider-thumb{width:20px;height:20px;margin-top:-7px;border:2px solid #e0f2fe;border-radius:50%;background:var(--rpi-blue);box-shadow:0 0 0 3px rgba(3,169,244,.2),0 2px 8px rgba(0,0,0,.3);-webkit-appearance:none}.brightness-input::-moz-range-track{height:6px;background:transparent;border:0}.brightness-input::-moz-range-progress{height:6px;background:transparent}.brightness-input::-moz-range-thumb{width:20px;height:20px;border:2px solid #e0f2fe;border-radius:50%;background:var(--rpi-blue);box-shadow:0 0 0 3px rgba(3,169,244,.2),0 2px 8px rgba(0,0,0,.3)}
  .ambient-card table{width:100%;table-layout:fixed;border-collapse:collapse}.ambient-card th,.ambient-card td{padding:6px 3px;text-align:left;overflow-wrap:anywhere}.ambient-card input[data-ambient-lux],.ambient-card input[data-ambient-value]{width:100%;min-width:0}.ambient-card td button{max-width:100%;padding:9px 6px;font-size:.85rem}
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

const BRIGHTNESS_DESIGN_CSS = `
.brightness-view .hero{height:108px;border-radius:18px;background-image:radial-gradient(circle,rgba(103,232,249,.16) 1px,transparent 1.5px),linear-gradient(115deg,#071523,#12233e 60%,#1d1838);background-size:8px 8px,100% 100%;border-color:rgba(125,211,252,.25);box-shadow:0 6px 22px rgba(2,8,23,.12)}.brightness-view .hero-content{min-height:0;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 24px}.brightness-brand{min-width:0}.brightness-brand b{display:block;color:#e0f2fe;font-size:clamp(1.35rem,3vw,1.85rem);font-weight:850;letter-spacing:.06em;text-shadow:0 0 16px rgba(34,211,238,.25)}.brightness-brand b span{color:#67e8f9}.brightness-brand small{display:block;margin-top:7px;color:#b7c9e0;font-size:.74rem;letter-spacing:.12em}.brightness-view .hero-overlay{position:static;max-width:none;border:0;box-shadow:none;border-radius:0;padding:0;background:transparent;backdrop-filter:none;flex-shrink:0}.brightness-view .hero-overlay .device{color:#e0f2fe}.system-diagnostics{display:grid;gap:14px}.system-diagnostics p{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0;padding:12px;border-radius:10px;background:var(--secondary-background-color)}.system-diagnostics span{display:flex;align-items:center;gap:8px}.system-diagnostics b{font-size:.9rem}.system-diagnostics ha-icon{--mdc-icon-size:20px;color:var(--primary-color)}
@media(max-width:760px){.brightness-view .hero{height:auto;min-height:146px}.brightness-view .hero-content{flex-direction:column;align-items:stretch;gap:18px;padding:18px}.brightness-view .hero-overlay{justify-content:space-between;gap:10px}.brightness-view .hero-overlay .device{min-width:0;flex:1}.brightness-view .hero-overlay select{min-width:0;width:100%}}
.brightness-dashboard{--bd-accent:var(--primary-color,#0284c7);--bd-muted:var(--secondary-text-color,#64748b);--bd-line:var(--divider-color,#dbe4ee);--bd-surface:var(--card-background-color,#fff);--bd-soft:var(--secondary-background-color,#f1f5f9)}
.brightness-dashboard .card{margin:0;padding:22px;border-radius:16px;box-shadow:0 4px 18px rgba(0,0,0,.04);min-width:0}.brightness-heading{display:flex;align-items:center;gap:14px;margin:26px 0 20px}.brightness-heading h1{font-size:clamp(1.8rem,4vw,2.5rem);letter-spacing:-.035em}.brightness-heading p{margin:5px 0 0}.bd-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:13px;background:color-mix(in srgb,var(--bd-accent) 12%,var(--bd-surface));color:var(--bd-accent);flex-shrink:0}.bd-icon ha-icon{--mdc-icon-size:25px}.bd-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:18px}.bd-stat{display:flex;align-items:flex-start;gap:10px;padding:16px!important}.bd-stat .bd-icon{width:34px;height:34px}.bd-stat .bd-icon ha-icon{--mdc-icon-size:20px}.bd-stat p{margin:0;min-width:0;overflow-wrap:anywhere}.bd-stat small{display:block;margin-bottom:7px;font-size:.76rem}.bd-stat b{font-size:1.05rem;display:block;line-height:1.35}.bd-stat em{display:block;font-style:normal;font-size:.75rem;color:var(--bd-muted);margin-top:5px}.bd-good{color:var(--success-color,#168451)}.bd-warn{color:var(--warning-color,#b77910)}.bd-layout{align-items:start;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:18px}.bd-span{grid-column:1/-1}.bd-section-title{display:flex;gap:10px;align-items:center;margin-bottom:8px}.bd-section-title h2{margin:0;font-size:1.12rem}.bd-description{margin:0 0 18px;color:var(--bd-muted);font-size:.9rem;line-height:1.55}.bd-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.bd-mode{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:20px 12px;background:var(--bd-soft);color:var(--primary-text-color);border:1px solid var(--bd-line);box-shadow:none;min-width:0;min-height:146px}.bd-mode ha-icon{--mdc-icon-size:28px}.bd-mode b{font-size:.95rem}.bd-mode small{line-height:1.45;font-weight:400}.bd-mode[aria-pressed=true]{background:var(--bd-accent);color:var(--text-primary-color,#fff);border-color:var(--bd-accent)}.bd-mode[aria-pressed=true] small{color:inherit;opacity:.9}.brightness-dashboard button:focus-visible,.brightness-dashboard input:focus-visible,.brightness-dashboard select:focus-visible{outline:3px solid var(--bd-accent);outline-offset:3px}.bd-details{display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;margin:18px 0}.bd-details p{margin:0;font-size:.88rem;line-height:1.6}.bd-details b{display:block;font-size:1rem}.bd-alert{display:flex;align-items:flex-start;gap:10px;padding:13px 15px;border:1px solid color-mix(in srgb,var(--bd-accent) 25%,var(--bd-line));border-radius:10px;background:color-mix(in srgb,var(--bd-accent) 7%,var(--bd-surface));font-size:.86rem;line-height:1.5;margin-top:12px;overflow-wrap:anywhere}.bd-alert.warning{background:color-mix(in srgb,var(--warning-color,#b77910) 9%,var(--bd-surface));border-color:color-mix(in srgb,var(--warning-color,#b77910) 30%,var(--bd-line));font-weight:400}.bd-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}.bd-fields label,.bd-entity{display:flex;flex-direction:column;gap:8px;font-size:.88rem}.bd-entity select{width:100%;min-width:0}.bd-entity small{overflow-wrap:anywhere}.bd-measure{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px;margin-top:14px;border-radius:10px;background:var(--bd-soft)}.bd-measure output{font-weight:700;font-size:1.2rem;text-align:right}.bd-curve{width:100%;height:auto;display:block;margin:14px 0;color:var(--bd-accent)}.bd-curve text{fill:var(--bd-muted);font:11px sans-serif}.bd-curve line{stroke:var(--bd-line)}.ambient-card table{border:1px solid var(--bd-line);border-radius:10px;overflow:hidden}.ambient-card th{background:var(--bd-soft);font-size:.8rem}.ambient-card td,.ambient-card th{padding:7px}.ambient-card tr+tr td{border-top:1px solid var(--bd-line)}.ambient-card th:last-child{width:72px}.ambient-card td button{background:color-mix(in srgb,var(--error-color,#db3545) 9%,var(--bd-surface));color:var(--error-color,#db3545);width:42px;min-height:40px}.ambient-card td button ha-icon{--mdc-icon-size:18px}.bd-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.bd-actions button{min-height:42px}.bd-secondary{background:var(--bd-soft);color:var(--bd-accent);border:1px solid var(--bd-line)}.bd-schedule .schedule-list{grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.bd-schedule .schedule-row{display:flex;flex-direction:column;align-items:stretch;padding:0;gap:0;overflow:hidden;background:var(--bd-soft)}.bd-schedule [data-schedule-hour]{font-size:.7rem;text-align:center;padding:8px 2px;color:var(--bd-accent);background:color-mix(in srgb,var(--bd-accent) 9%,var(--bd-surface));font-weight:700}.bd-schedule .schedule-row label{display:flex;gap:4px;padding:7px;align-items:center}.bd-schedule input{width:100%;min-width:0;padding:8px 3px;text-align:center;font-variant-numeric:tabular-nums}.bd-schedule .schedule-row.current{border-color:var(--bd-accent)}.bd-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}#ambient-error:not(:empty){padding:12px;border-radius:9px;background:color-mix(in srgb,var(--error-color,#db3545) 10%,var(--bd-surface));color:var(--error-color,#db3545)}
.bd-summary.bd-ha-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-width:1100px){.bd-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.bd-schedule .schedule-list{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:760px){.bd-layout{grid-template-columns:1fr}.bd-span{grid-column:auto}.brightness-dashboard .card{padding:18px}.bd-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.bd-stat{padding:12px!important}.bd-schedule .schedule-list{grid-template-columns:repeat(6,minmax(0,1fr))}}
@media(max-width:480px){.bd-modes{gap:6px}.bd-mode{padding:14px 6px;min-height:152px}.bd-mode b{font-size:.8rem}.bd-mode small{font-size:.73rem}.bd-details{gap:14px}.bd-fields{grid-template-columns:1fr}.bd-schedule .schedule-list{grid-template-columns:repeat(4,minmax(0,1fr))}.bd-measure{flex-wrap:wrap}.bd-stat .bd-icon{display:none}.bd-actions button{flex:1 1 140px}}
`;

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
    this._playlistDraft = { type: "mqtt", title: "RPI2DMD", topic: "", unit: "", duration_seconds: "5" };
    this._playlistAdding = false;
    this._mqtt = null;
    this._weather = null;
    this._gifs = null;
    this._gifCategories = null;
    this._gifLoading = false;
    this._featureErrors = {};
    this._sectionRequestId = 0;
    this._statusRequestId = 0;
    this._playlistRequest = null;
    this._brightnessSchedule = { enabled: true, points: [] };
    this._iconPickerOpen = false;
    this._iconPickerTarget = null;
    this._icons = [];
    this._iconSearch = "";
    this._iconCategory = "";
    this._iconPreviewCache = {};
    this._iconPreviewEntry = null;
    this._iconPreviewCaches = new Map();
    this._iconPreviewTimer = null;
    this._iconPreviewNextAt = 0;
    this._iconPage = 0;
    this._iconPreviewActive = 0;
    this._iconPreviewPending = new Set();
    this._iconPreviewFailed = new Set();
    this._iconPreviewAuthBlocked = new Set();
    this._iconPickerRequest = 0;
    this._displayWrites = new Map();
    this._writeTail = Promise.resolve();
    this._lastWriteAt = 0;
    this._timer = null;
    this._bannerChecked = false;
    this._notice = "";
    this._noticeTimer = null;
  }

  set hass(value) {
    this._hass = value;
    this._updateAmbientMeasure();
    if (!this._timer) {
      this._loadDevices();
      this._timer = setInterval(() => this._refreshStatus(), 15000);
    }
  }
  get hass() { return this._hass; }
  set narrow(value) { this._narrow = value; this._render(); }
  set panel(value) { this._panel = value; }
  disconnectedCallback() { this._closeIconPicker(); if (this._timer) clearInterval(this._timer); this._timer = null; }

  async _ws(type, extra = {}) {
    if (!this._hass || this._entry === null && type !== "rpi2dmd/devices") throw new Error("Home Assistant indisponible");
    return this._hass.callWS({ type, ...extra, ...(type === "rpi2dmd/devices" ? {} : { entry_id: extra.entry_id ?? this._entry }) });
  }
  async _wsWrite(type, extra = {}, entry = this._entry) {
    const run = this._writeTail.then(async () => {
      const wait = Math.max(0, 1000 - (Date.now() - this._lastWriteAt));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      try {
        return await this._ws(type, { ...(typeof extra === "function" ? extra() : extra), entry_id: entry });
      } finally {
        this._lastWriteAt = Date.now();
      }
    });
    this._writeTail = run.catch(() => undefined);
    return run;
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
    const entry = this._entry;
    const requestId = ++this._statusRequestId;
    const wasOnline = this._online;
    try {
      const result = await this._ws("rpi2dmd/status");
      if (entry !== this._entry || requestId !== this._statusRequestId) return;
      this._online = result.online === true || result.available === true;
      this._status = this._online ? (result.status || {}) : null;
      if (!this._online) {
        this._clearRuntimeData();
        this._error = "Impossible de joindre le RPI2DMD. Les données temps réel sont temporairement indisponibles.";
      } else this._clearError();
      if (this._online && this._section === "brightness" && this._ambient) {
        const live = await this._ws("rpi2dmd/brightness/ambient/get");
        if (entry !== this._entry || requestId !== this._statusRequestId) return;
        this._ambient = this._ambientMerge(live.ambient);
      }
      this._render();
      if (this._online && !wasOnline && this._section !== "dashboard") await this._loadSection(this._section);
    } catch (err) {
      if (entry !== this._entry || requestId !== this._statusRequestId) return;
      this._online = false;
      this._clearRuntimeData();
      this._showError(err, "Impossible de joindre le RPI2DMD. Les données temps réel sont temporairement indisponibles.");
    }
  }
  _clearRuntimeData() { this._ambient=null; this._systemBrightness=null; this._closeIconPicker(); ++this._sectionRequestId; this._playlistRequest=null; this._status=null; this._display=null; this._playlist=null; this._mqtt=null; this._weather=null; this._gifs=null; this._gifCategories=null; }
  _playlistLoading() {
    return this._playlistRequest?.entry === this._entry && this._playlistRequest?.requestId === this._sectionRequestId;
  }
  _refreshPlaylist() {
    if (this._section !== "playlist" || this._playlistLoading()) return;
    return this._loadSection("playlist");
  }
  async _loadSection(section) {
    const entry = this._entry;
    const requestId = ++this._sectionRequestId;
    this._section = section;
    if (section === "playlist") this._playlistRequest = { entry, requestId };
    this._featureErrors[section] = "";
    if (section === "gif") {
      this._gifLoading = true;
      this._gifs = null;
      this._gifCategories = null;
    }
    this._render();
    const displayState = this._displayWriteState();
    const displayRevision = displayState.revision;
    let display;
    let playlist;
    let mqtt;
    let weather;
    let gifs;
    let gifCategories;
    let brightnessSchedule;
    let ambient;
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
      if (section === "brightness") { const raw=(await this._ws("rpi2dmd/brightness/schedule/get")).schedule || {}; brightnessSchedule = raw.points ? raw : { enabled: true, points: Array.isArray(raw)?raw:(raw.schedule||[]) }; ambient=(await this._ws("rpi2dmd/brightness/ambient/get")).ambient; }
      if (section === "system") system = (await this._ws("rpi2dmd/system")).system;
      if (entry !== this._entry || requestId !== this._sectionRequestId || this._section !== section) return;
      if (section === "display" && displayState === this._displayWriteState() && displayRevision === displayState.revision) this._display = display;
      if (section === "playlist") this._playlist = playlist;
      if (section === "mqtt") this._mqtt = mqtt;
      if (section === "weather") this._weather = weather;
      if (section === "gif") { this._gifs = gifs; this._gifCategories = gifCategories; }
      if (section === "brightness") { this._brightnessSchedule = brightnessSchedule; this._ambient = ambient; this._ambientDirty = new Set(); }
      if (section === "system") { this._status = system; this._systemBrightness = system?.brightness_control; }
      this._featureErrors[section] = "";
      if (this._online) this._clearError();
      this._render();
    } catch (err) {
      if (entry !== this._entry || requestId !== this._sectionRequestId || this._section !== section) return;
      if (section === "gif") this._showFeatureError("gif", err, "Impossible de charger les GIF du RPI2DMD.");
      else if (section === "playlist") this._showFeatureError("playlist", err, "Impossible de charger la playlist.");
      else this._showFeatureError(section, err);
    } finally {
      if (section === "playlist" && this._playlistRequest?.entry === entry && this._playlistRequest?.requestId === requestId) {
        this._playlistRequest = null;
        if (entry === this._entry && requestId === this._sectionRequestId && this._section === section) this._render();
      }
      if (section === "gif" && requestId === this._sectionRequestId && this._section === section) {
        this._gifLoading = false;
        this._render();
      }
    }
  }
  _showFeatureError(feature, err, userMessage = "") { console.debug("RPI2DMD feature request failed", feature, err?.message || "unknown error"); this._featureErrors[feature] = err?.code === "config_busy" ? "Le RPI2DMD est temporairement occupé. Réessayez dans quelques secondes." : userMessage || err?.message || "Erreur de chargement"; this._render(); }
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
  _clearFeatureError(feature) { this._featureErrors[feature] = ""; }
  _showNotice(message) {
    this._error = "";
    this._notice = message;
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => { this._notice = ""; this._render(); }, 4500);
    this._render();
  }
  _displayWriteState() {
    if (!this._displayWrites.has(this._entry)) this._displayWrites.set(this._entry, {
      entry: this._entry, pending: {}, queued: {}, timer: null, running: false, revision: 0, draft: null,
    });
    return this._displayWrites.get(this._entry);
  }
  _updateDisplay(changes) {
    const state = this._displayWriteState();
    const values = { ...changes.flags };
    if (changes.brightness) {
      values.brightness = changes.brightness;
      state.draft = null;
    }
    for (const [key, value] of Object.entries(values)) {
      const confirmed = state.pending[key]?.confirmed ?? (key === "brightness"
        ? this._display?.brightness : this._flag(key));
      state.pending[key] = { value, confirmed };
      state.queued[key] = state.pending[key];
    }
    state.revision++;
    this._clearFeatureError("display");
    this._render({ displayFlagsOnly: !changes.brightness });
    // Trailing debounce; the payload is sampled only when the serialized slot opens.
    clearTimeout(state.timer);
    state.timer = setTimeout(() => this._flushDisplay(state), 250);
  }
  async _flushDisplay(state) {
    if (state.running || !Object.keys(state.queued).length) return;
    const entry = state.entry;
    state.running = true;
    let sent = {};
    try {
      const result = await this._wsWrite("rpi2dmd/display/update", () => {
        sent = state.queued;
        state.queued = {};
        const changes = { flags: {} };
        for (const [key, item] of Object.entries(sent)) {
          if (key === "brightness") changes.brightness = item.value;
          else changes.flags[key] = item.value;
        }
        if (!Object.keys(changes.flags).length) delete changes.flags;
        return { changes };
      }, entry);
      state.revision++;
      if (this._entry === entry) this._display = result.display;
      for (const [key, item] of Object.entries(sent)) {
        const confirmed = key === "brightness" ? result.display.brightness : result.display.flags[key];
        if (state.pending[key] === item) delete state.pending[key];
        else if (state.pending[key]) state.pending[key].confirmed = confirmed;
      }
      if (this._entry === entry) this._render();
      // The bridge already requests a coordinator refresh after the transaction.
      if (this._entry === entry) await this._refreshStatus();
    } catch (err) {
      state.revision++;
      for (const [key, item] of Object.entries(sent)) {
        if (this._entry === entry) {
          this._display ||= {};
          if (key === "brightness") this._display.brightness = item.confirmed;
          else { this._display.flags ||= {}; this._display.flags[key] = item.confirmed; }
        }
        if (state.pending[key] === item) delete state.pending[key];
      }
      if (this._entry === entry) this._showFeatureError("display", err,
        `Impossible de modifier ${Object.keys(sent).map(key => key === "brightness" ? "la luminosité" : this._labelFlag(key)).join(", ")}.`);
    } finally {
      state.running = false;
      if (Object.keys(state.queued).length) this._flushDisplay(state);
    }
  }
  _flag(name) {
    const pending = this._displayWriteState().pending[name];
    if (pending) return pending.value;
    const confirmed = this._display?.flags?.[name];
    return typeof confirmed === "boolean" ? confirmed : (this._status?.display?.active_flags || []).includes(name);
  }
  _esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  _render({ displayFlagsOnly = false } = {}) {
    if (!this.shadowRoot) return;
    if (displayFlagsOnly && this.shadowRoot.querySelector("[data-flag]") && !this.shadowRoot.querySelector(".error")) {
      // Keep the native input being activated in place. Update its live property,
      // rather than replacing the entire shadow DOM during the change event.
      this.shadowRoot.querySelectorAll("[data-flag]").forEach(input => {
        input.checked = this._flag(input.dataset.flag);
      });
      return;
    }
    this.shadowRoot.innerHTML = `<style>${this._css()}${RPI_POLISH_CSS}${RPI_EXACT_HERO_CSS}${ICON_PICKER_CSS}${BRIGHTNESS_DESIGN_CSS}</style><main class="${this._section==="brightness"?"brightness-view":""}">
      <header class="hero"><div class="hero-content">${this._section==="brightness"?'<div class="brightness-brand" aria-label="RPI2DMD"><b>RPI<span>2DMD</span></b><small>HOME ASSISTANT · LUMINOSITÉ</small></div>':""}<div class="hero-overlay"><span class="online-pill ${this._online?"":"offline"}"><i></i> ${this._online ? "En ligne" : "Hors ligne"}</span><label class="device">Appareil <select id="device">${this._devices.map(d => `<option value="${this._esc(d.entry_id)}" ${d.entry_id===this._entry?"selected":""}>${this._esc(this._deviceLabel(d))}</option>`).join("")}</select></label></div></div></header>
      <nav aria-label="Navigation">${["dashboard","display","brightness","playlist","mqtt","gif","weather","system","backup"].map(s => `<button class="nav ${this._section===s?"active":""}" data-nav="${s}">${this._label(s)}</button>`).join("")}</nav>
      ${this._error ? `<div class="error" role="alert">${this._esc(this._error)} <button data-action="retry">Réessayer</button></div>` : ""}
      ${this._section !== "gif" && this._featureErrors[this._section] ? `<div class="error" role="alert">${this._esc(this._featureErrors[this._section])}</div>` : ""}
      ${this._notice ? `<div class="success" role="status">${this._esc(this._notice)}</div>` : ""}
      ${this._content()}${this._iconPickerOpen ? this._iconPickerMarkup() : ""}
      <footer class="sub"><small>Interface HA : ${FRONTEND_VERSION}</small></footer>
    </main>`;
    if (this._section !== "brightness") this._checkHeroBanner();
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
    const currentMode=online && ["legacy", "playlist"].includes(playlist.mode) ? playlist.mode.toUpperCase() : "—";
    const currentType=online && screen.available!==false && typeof screen.type==="string" ? screen.type.trim() : "";
    const currentDetail=currentType ? this._esc(currentType) : currentMode!=="—" ? "Mode actuel" : "—";
    return `<section class="grid cards">${this._card("DISPLAY",online&&displayKnown?(display.service_state||"—"):"—",online&&displayKnown?(display.paused===true?"En pause":display.service_state?"Actif":"—"):"—","▣")}${this._card("MQTT",online&&mqttKnown?(mqtt.connected?"Connecté":"Déconnecté"):"—",online&&mqttKnown?(mqtt.state||"—"):"—","↯")}${this._card("TEMPÉRATURE",online&&s.cpu_temperature_c!=null?`${s.cpu_temperature_c} °C`:"—","CPU","℃")}${this._card("ALIMENTATION",online&&powerKnown?(power.undervoltage||power.undervoltage_now?"⚠ Sous-tension":"OK"):"—",online&&powerKnown?(power.throttled_code||"—"):"—","⚡")}${this._card("ÉCRAN ACTUEL",currentMode,currentDetail,"◈")}${this._card("UPTIME",online&&s.uptime_seconds!=null?this._duration(s.uptime_seconds):"—","Raspberry Pi","◷")}</section>
      ${online&&power.undervoltage?`<p class="warning" role="alert">⚠ SOUS-TENSION DÉTECTÉE — code ${this._esc(power.throttled_code)}</p>`:""}<section class="card quick"><h2>Contrôles rapides</h2>${this._quickControls()}</section>`;
  }
  _quickControls() { const online=this._online===true, brightness=online?this._brightness():0, percentage=online?((Number(brightness)-0)/(100-0))*100:0; return `<div class="controls"><label class="brightness-control"><span class="brightness-line"><span>Luminosité</span><output class="brightness-value" id="brightness-value" for="brightness">${online?`${brightness} %`:"—"}</output></span><div class="brightness-slider"><div class="brightness-track"><div class="brightness-fill" id="brightness-fill" style="width:${percentage}%"></div></div><input class="brightness-input" type="range" min="0" max="100" step="5" id="brightness" value="${brightness}" aria-label="Luminosité" ${online?"":"disabled"}></div></label>${["clock","date","weather","gif","mqtt"].map(f=>`<label class="toggle"><input type="checkbox" data-flag="${f}" ${this._flag(f)?"checked":""} ${online?"":"disabled"}> ${this._labelFlag(f)}</label>`).join("")}</div>`; }
  _labelFlag(f) { return ({clock:"Heure",date:"Date",weather:"Météo",gif:"GIF",mqtt:"MQTT Display"})[f]; }
  _brightness() { const state=this._displayWriteState(); if(state.draft !== null)return state.draft; const rows=(state.pending.brightness?.value ?? this._display?.brightness)?.schedule||[]; const h=new Date().getHours(); return rows.find(r=>r.hour===h)?.value ?? 0; }
  _displayPage() { return `<section class="card"><h2>Affichage</h2><p class="sub">Les paramètres sont appliqués via l’API transactionnelle.</p>${this._quickControls()}</section>`; }
  _itemIcon(item) { return item.icon ?? item.icon_id ?? item.logo ?? ""; }
  _playlistAddForm() {
    const d = this._playlistDraft;
    return `<form id="playlist-add-form" class="playlist-add-form"><h3>Nouvelle ligne</h3>
      <div class="controls"><label>Type <select id="playlist-type" data-playlist-field="type">${[["gif","GIF"],["time","Heure"],["date","Date"],["weather","Météo"],["mqtt","MQTT Display"]].map(([value,label])=>`<option value="${value}" ${d.type===value?"selected":""}>${label}</option>`).join("")}</select></label>
      <button type="submit" data-action="playlist-add" ${this._playlistAdding?"disabled":""}>${this._playlistAdding?"Ajout…":"Ajouter"}</button></div>
      <div id="playlist-mqtt-fields" ${d.type==="mqtt"?"":"hidden"}><div class="controls">
        <label>Titre <input data-playlist-field="title" value="${this._esc(d.title)}"></label>
        <label>Topic <input data-playlist-field="topic" value="${this._esc(d.topic)}"></label>
        <label>Unité <input data-playlist-field="unit" value="${this._esc(d.unit)}"></label>
        <label>Durée en secondes <input type="number" min="1" step="1" required data-playlist-field="duration_seconds" value="${this._esc(d.duration_seconds)}" ${d.type==="mqtt"?"":"disabled"}></label>
      </div><p class="sub">Icône optionnelle : choisissez-la après l’ajout, via « Choisir une icône » sur la ligne.</p></div>
    </form>`;
  }
  _playlistPage() { const items=this._playlist?.items||[]; return `<section class="card"><div class="row"><h2>Playlist</h2><div class="actions"><button data-action="playlist-refresh" ${this._playlistLoading()?"disabled":""}>${this._playlistLoading()?"Chargement…":"Rafraîchir"}</button></div></div>${this._playlistAddForm()}${items.length?items.map((i,n)=>{const icon=this._itemIcon(i); const mqtt=i.type==="mqtt"; return `<article class="item ${i.enabled?"":"disabled-item"}"><div><label class="playlist-state"><input type="checkbox" data-item="${this._esc(i.id)}" data-action="toggle" ${i.enabled?"checked":""}> <b>${i.enabled?"Actif":"Inactif"} [${i.enabled?"ON":"OFF"}]</b></label><p>${n+1} — ${this._esc(i.type)} · ${this._esc(i.title||i.topic||"")} ${i.unit?`(${this._esc(i.unit)})`:""}</p>${mqtt?`<div class="mqtt-icon-field">${icon?`<img class="mqtt-icon-preview" data-icon-preview="${this._esc(icon)}" alt="Icône MQTT">`:`<span class="mqtt-icon-empty">Aucune icône</span>`}<span>Icône : <b>${this._esc(icon||"Aucune")}</b></span><button data-action="icon-picker" data-item="${this._esc(i.id)}">Choisir une icône</button>${icon?`<button data-action="icon-clear" data-item="${this._esc(i.id)}">Aucune icône</button>`:""}</div>`:""}</div><div class="actions"><button data-item="${this._esc(i.id)}" data-action="up" ${n===0?"disabled":""}>↑</button><button data-item="${this._esc(i.id)}" data-action="down" ${n===items.length-1?"disabled":""}>↓</button><button data-item="${this._esc(i.id)}" data-action="duplicate">Dupliquer</button><button data-item="${this._esc(i.id)}" data-action="delete">Supprimer</button></div></article>`;}).join(""):"<p>Aucune ligne.</p>"}</section>`; }
  _iconItems() { const raw=this._icons?.items||this._icons?.icons||this._icons||[]; return (Array.isArray(raw)?raw:[]).map(x=>typeof x==="string"?{id:x,name:x,category:""}:{id:x.id??x.name??x.icon,name:x.name??x.label??x.id,category:x.category??x.group??""}).filter(x=>x.id); }
  _iconPickerMarkup() { const items=this._iconItems(), supplied=Array.isArray(this._icons?.categories)?this._icons.categories:[], cats=[...new Set([...items.map(x=>x.category),...supplied].filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b))); const filtered=items.filter(x=>(!this._iconSearch||`${x.name} ${x.id} ${x.category}`.toLowerCase().includes(this._iconSearch.toLowerCase()))&&(!this._iconCategory||x.category===this._iconCategory)); return `<div class="icon-picker-backdrop" role="presentation"><section class="icon-picker card" role="dialog" aria-label="Choisir une icône"><div class="row"><h2>Choisir une icône</h2><button data-action="icon-close" aria-label="Fermer">×</button></div><div class="icon-filters"><input id="icon-search" type="search" placeholder="Rechercher une icône…" value="${this._esc(this._iconSearch)}"><select id="icon-category"><option value="">Toutes les catégories</option>${cats.map(c=>`<option value="${this._esc(c)}" ${c===this._iconCategory?"selected":""}>${this._esc(c)}</option>`).join("")}</select></div><button data-action="icon-select-none">Aucune icône</button><div class="icon-grid">${filtered.slice(this._iconPage*12,(this._iconPage+1)*12).map(x=>`<button class="icon-option" data-action="icon-select" data-icon-id="${this._esc(x.id)}"><span class="icon-tile" data-picker-preview="${this._esc(x.id)}">${this._iconPreviewCache[x.id]?`<img loading="lazy" src="${this._iconPreviewCache[x.id]}" alt="">`:`<span aria-hidden="true">PNG</span>`}</span><b>${this._esc(x.name)}</b>${x.category?`<small>${this._esc(x.category)}</small>`:""}</button>`).join("")||"<p>Aucune icône trouvée.</p>"}</div><div class="actions"><button data-action="icon-prev" ${this._iconPage===0?"disabled":""}>Précédent</button><span>Page ${this._iconPage+1} / ${Math.max(1,Math.ceil(filtered.length/12))}</span><button data-action="icon-next" ${(this._iconPage+1)*12>=filtered.length?"disabled":""}>Suivant</button></div></section></div>`; }
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
  _brightnessPage() {
    const s=this._brightnessSchedule||{}, points=Array.isArray(s.points)?s.points:[];
    const ready=this._online===true && points.length===24;
    return `<div class="brightness-dashboard"><div class="brightness-heading"><span class="bd-icon"><ha-icon icon="mdi:brightness-6"></ha-icon></span><div><h1>Luminosité</h1><p class="sub">Mesurer, ajuster et confirmer la luminosité du DMD.</p></div></div>${this._ambientPage()}<section class="card bd-schedule"><div class="row"><div class="bd-section-title"><ha-icon icon="mdi:clock-outline"></ha-icon><h2>Planning horaire</h2></div><label class="toggle">Activé <input id="schedule-enabled" type="checkbox" ${s.enabled!==false?"checked":""} ${ready?"":"disabled"}></label></div><p class="sub">24 valeurs de 0 à 100 %, par pas de 5 %. Le planning est conservé dans les trois modes et assure le repli.</p><div class="schedule-list">${Array.from({length:24},(_,hour)=>{
      const time=`${String(hour).padStart(2,"0")}:00`, point=points.find(p=>this._scheduleTime(p)===time);
      return `<div class="schedule-row ${hour===new Date().getHours()?"current":""}"><span data-schedule-hour="${hour}">Heure : ${time}</span><label><span class="bd-visually-hidden">Luminosité</span><input type="number" min="0" max="100" step="5" aria-label="Luminosité à ${time}" data-schedule-value="${hour}" value="${point?Number(point.value):""}" ${ready&&point?"":"disabled"}> %</label></div>`;
    }).join("")}</div><div class="bd-actions"><button data-action="schedule-save" ${ready?"":"disabled"}>Enregistrer</button><button data-action="schedule-apply" ${ready?"":"disabled"}>Appliquer maintenant</button></div><p class="bd-description" style="margin-top:14px">La sélection du mode se fait dans les cartes ci-dessus.</p></section>${this._ambient?.config?"</div>":""}</div>`;
  }
  _systemPage() { const s=this._status||{}, f=this._online?(this._systemBrightness||this._ambient?.firmware||{}):{}; const connection=v=>v==="connected"?"Connecté":v==="disconnected"?"Déconnecté":"Indisponible"; return `<section class="grid cards"><section class="card"><h2>Système</h2><p>Modèle : ${this._esc(s.model)}</p><p>Hostname : ${this._esc(s.hostname)}</p><p>IP : ${this._esc((s.ip_addresses||[]).join(", "))}</p><p>Uptime : ${this._duration(s.uptime_seconds)}</p><p>CPU : ${s.cpu_temperature_c??"—"} °C</p></section><section class="card"><h2>Services</h2><p>Display : ${this._esc(s.services?.display?.state||"—")}</p><p>MQTT : ${this._esc(s.services?.mqtt?.state||"—")}</p><p>NRestarts : ${s.services?.display?.nrestarts??"—"} / ${s.services?.mqtt?.nrestarts??"—"}</p><p>Throttled : ${this._esc(s.power?.throttled_code||"—")}</p></section><section class="card"><h2>Diagnostic luminosité</h2><div class="system-diagnostics"><p><span><ha-icon icon="mdi:lan"></ha-icon>Broker</span><b>${connection(f.broker)}</b></p><p><span><ha-icon icon="mdi:cog-outline"></ha-icon>Moteur</span><b>${connection(f.engine)}</b></p></div><small class="sub">Dernier état reçu du contrôleur de luminosité.</small></section></section>`; }
  _backupPage() { return `<section class="card"><h2>Sauvegarde</h2><p>Les exports sont sans secrets ni assets.</p><button data-action="export">Exporter configuration</button><label class="file">Importer configuration <input id="import" type="file" accept="application/json"></label><p id="import-result"></p></section>`; }
  _duration(sec) { if (sec == null) return "—"; const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60); return `${h} h ${m} min`; }
  _ambientPage() {
    const a=this._ambient;
    if (!a?.config) return "";
    const c=a.config;
    const entities=Object.values(this._hass?.states||{}).filter(s=>s.entity_id.startsWith("sensor.")&&s.attributes.unit_of_measurement==="lx");
    if(c.entity_id&&!entities.some(s=>s.entity_id===c.entity_id)) entities.push({entity_id:c.entity_id,attributes:{}});
    const f=a.firmware||{}, sensor=f.sensor||{}, names={schedule:"Planning",local:"BH1750",ha:"Home Assistant"};
    const mode=a.selected_mode||c.mode, source=names[a.effective_mode]||"Non confirmée";
    const percent=v=>v==null?"—":`${v} %`, lux=v=>Number.isFinite(v)?`${Number(v.toFixed(1))} lx`:"—";
    const applied=f.engine==="connected"&&f.pending===false?a.last_applied:null;
    const ack=applied==null?"Non confirmée":percent(applied);
    const metric=(icon,label,value,note="",tone="")=>`<section class="card bd-stat"><span class="bd-icon"><ha-icon icon="${icon}"></ha-icon></span><p><small>${label} </small><b class="${tone}">${this._esc(value)}</b>${note?`<em>${this._esc(note)}</em>`:""}</p></section>`;
    return `<div id="ambient-status" class="bd-summary ${mode==="ha"?"bd-ha-summary":""}">
      ${metric("mdi:access-point","Source active :",source,a.effective_mode!==mode?"Source de repli":"Source sélectionnée",a.effective_mode!==mode?"bd-warn":"bd-good")}
      ${metric("mdi:brightness-6","Luminosité acquittée :",ack,f.pending?"Consigne en attente":applied==null?"Acquittement indisponible":"Confirmation du moteur",applied==null?"bd-warn":"bd-good")}
      ${mode==="local"&&f.sensor_available&&Number.isFinite(sensor.lux)?metric("mdi:white-balance-sunny","BH1750 :",lux(sensor.lux),Number.isFinite(sensor.filtered_lux)?`Filtrés : ${lux(sensor.filtered_lux)}`:""):""}
      ${mode!=="ha"&&f.requested!=null?metric("mdi:send-outline","Consigne Raspberry :",percent(f.requested),f.pending?"En attente d’acquittement":"Consigne courante"):""}
      ${mode==="local"&&f.sensor_available&&sensor.target!=null?metric("mdi:chart-line","Cible BH1750 :",percent(sensor.target),"Calculée sur le Raspberry"):""}
    </div><div class="bd-layout">
    <section class="card bd-span"><div class="bd-section-title"><ha-icon icon="mdi:tune"></ha-icon><h2>Mode de luminosité</h2></div><p class="bd-description">Une seule source pilote le DMD. Le mode et le capteur sont enregistrés dès leur sélection.</p>
      <label class="bd-visually-hidden">Mode <select id="ambient-mode"><option value="schedule" ${c.mode==="schedule"?"selected":""}>Planning horaire</option><option value="ha" ${c.mode==="ha"?"selected":""}>Capteur Home Assistant</option><option value="local" ${c.mode==="local"?"selected":""} ${a.firmware_required?"disabled":""}>Capteur local Raspberry — BH1750</option></select></label>
      <div class="bd-modes" role="group" aria-label="Mode de luminosité">${[["schedule","mdi:clock-outline","Planning horaire","Valeurs programmées pour chaque heure"],["local","mdi:white-balance-sunny","Capteur BH1750","Mesure locale sur le Raspberry"],["ha","mdi:home-assistant","Home Assistant","Capteur HA, avec repli au planning"]].map(([id,icon,title,desc])=>`<button class="bd-mode" data-ambient-mode="${id}" aria-pressed="${mode===id}" ${id==="local"&&a.firmware_required?"disabled":""}><ha-icon icon="${icon}"></ha-icon><b>${title}</b><small>${desc}</small></button>`).join("")}</div>
      ${a.firmware_required?'<div class="bd-alert warning">Firmware requis : la configuration peut être préparée, mais le panneau reste piloté par son planning horaire.</div>':""}
    </section>
    <section class="card ambient-card"><div class="bd-section-title"><ha-icon icon="mdi:home-assistant"></ha-icon><h2>Capteur Home Assistant</h2></div><p class="bd-description">HA mesure les lux, calcule une cible et renouvelle une consigne temporaire. Ces réglages concernent uniquement le mode Home Assistant.</p>
      ${a.error?`<div class="bd-alert warning" role="status">${this._esc(a.error)}</div>`:""}
      <label class="bd-entity">Entité de luminosité<select id="ambient-entity"><option value="">Sélectionner un capteur</option>${entities.map(s=>`<option value="${this._esc(s.entity_id)}" ${s.entity_id===c.entity_id?"selected":""}>${this._esc(s.attributes.friendly_name||s.entity_id)}</option>`).join("")}</select><small>${this._esc(c.entity_id||"Aucun capteur sélectionné")}</small></label>
      <div class="bd-measure"><span>Mesure ambiante</span><output id="ambient-measure">—</output></div>
      <div class="bd-fields"><label>Temporisation (secondes)<input id="ambient-delay" type="number" min="1" max="3600" value="${c.delay}"></label><label>Variation minimale (%)<input id="ambient-minimum" type="number" min="0" max="100" value="${c.minimum_change}"></label></div>
      <div class="bd-section-title"><ha-icon icon="mdi:chart-line"></ha-icon><h2>Courbe lux → luminosité</h2></div><p class="bd-description">Interpolation entre les points. La courbe BH1750 reste gérée par le Raspberry.</p>${this._ambientCurve(c.points)}
      <table><thead><tr><th scope="col">Lux</th><th scope="col">DMD (%)</th><th scope="col"><span class="bd-visually-hidden">Actions</span></th></tr></thead><tbody>${c.points.map((r,i)=>`<tr><td><input aria-label="Lux ligne ${i+1}" data-ambient-lux="${i}" type="number" min="0" step="any" value="${r.lux}"></td><td><input aria-label="Luminosité ligne ${i+1}" data-ambient-value="${i}" type="number" min="0" max="100" step="any" value="${r.value}"></td><td><button title="Supprimer le point ${i+1}" aria-label="Supprimer le point ${i+1}" data-ambient-remove="${i}"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></td></tr>`).join("")}</tbody></table>
      <div class="bd-actions"><button id="ambient-add" class="bd-secondary">+ Ajouter un point</button><button id="ambient-save">Enregistrer la courbe et les réglages</button></div><p role="alert" id="ambient-error"></p>
      <div class="bd-alert"><ha-icon icon="mdi:information-outline"></ha-icon><span>Si HA ou le capteur devient indisponible, le planning reprend à l’expiration de la consigne, au plus tard après 5 minutes. Le mode HA reste sélectionné.</span></div></section>`;
  }
  _ambientCurve(points) {
    const valid=points.filter(p=>p.lux!==""&&p.value!==""&&Number.isFinite(Number(p.lux))&&Number.isFinite(Number(p.value))&&p.lux>=0&&p.value>=0&&p.value<=100).slice().sort((a,b)=>a.lux-b.lux);
    if(!valid.length)return "";
    const max=Math.max(1,...valid.map(p=>Number(p.lux))), x=l=>40+Number(l)/max*350,y=v=>135-Number(v)*1.1;
    const coords=valid.map(p=>`${x(p.lux)},${y(p.value)}`).join(" ");
    return `<svg class="bd-curve" viewBox="0 0 420 165" role="img" aria-label="Courbe lux vers luminosité, de 0 à ${max} lux et de 0 à 100 pour cent"><line x1="40" y1="25" x2="40" y2="135"/><line x1="40" y1="135" x2="390" y2="135"/>${[0,50,100].map(v=>`<line x1="40" y1="${y(v)}" x2="390" y2="${y(v)}" stroke-dasharray="3 4"/><text x="6" y="${y(v)+4}">${v}%</text>`).join("")}<polygon points="40,135 ${coords} ${x(valid.at(-1).lux)},135" fill="currentColor" opacity=".08"/><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="2.5"/>${valid.map(p=>`<circle cx="${x(p.lux)}" cy="${y(p.value)}" r="3.5" fill="currentColor"><title>${p.lux} lx → ${p.value} %</title></circle>`).join("")}<text x="40" y="156">0 lx</text><text x="390" y="156" text-anchor="end">${max} lx</text></svg>`;
  }

  _updateAmbientMeasure() {
    const out=this.shadowRoot?.querySelector("#ambient-measure");
    if(!out)return;
    const id=this.shadowRoot.querySelector("#ambient-entity")?.value;
    const state=this._hass?.states?.[id], raw=state?.state;
    const valid=state?.attributes.unit_of_measurement==="lx" && raw!=null && raw.trim()!=="" && Number.isFinite(Number(raw)) && Number(raw)>=0;
    this._ambientMeasures ??= new Map();
    if(valid)this._ambientMeasures.set(id,Number(raw));
    const last=this._ambientMeasures.get(id) ?? (id===this._ambient?.config.entity_id?this._ambient.last_lux:null);
    out.textContent=valid?`${Number(raw)} lx`:`Indisponible${last!=null?` — dernière mesure : ${last} lx`:""}`;
  }
  _ambientRead() {
    const root=this.shadowRoot;
    const numeric=el=>{if(!el||el.value.trim()===""||!Number.isFinite(Number(el.value)))throw new Error("Tous les champs numériques sont requis.");return Number(el.value);};
    const points=[...root.querySelectorAll("[data-ambient-lux]")].map(el=>({lux:numeric(el),value:numeric(root.querySelector(`[data-ambient-value="${el.dataset.ambientLux}"]`))})).sort((a,b)=>a.lux-b.lux);
    if(!points.length||points.some((r,i)=>r.lux<0||r.value<0||r.value>100||(i>0&&r.lux===points[i-1].lux)))throw new Error("Lux uniques et positifs ou nuls ; luminosité entre 0 et 100 %.");
    const delay=numeric(root.querySelector("#ambient-delay")), minimum_change=numeric(root.querySelector("#ambient-minimum"));
    if(delay<1||delay>3600||minimum_change<0||minimum_change>100)throw new Error("Temporisation : 1 à 3600 s ; variation : 0 à 100 %.");
    return {mode:root.querySelector("#ambient-mode").value,entity_id:root.querySelector("#ambient-entity").value,delay,minimum_change,points};
  }
  _ambientMerge(live) {
    const config={...live.config};
    for(const key of this._ambientDirty||[]) config[key]=this._ambient.config[key];
    return {...live,config};
  }
  async _ambientSelect(changes) {
    const entry=this._entry;
    try {
      const result=await this._wsWrite("rpi2dmd/brightness/ambient/update",{changes},entry);
      if(entry!==this._entry)return;
      this._ambient=this._ambientMerge(result.ambient);
      this._render();
      this._showNotice("Sélection enregistrée ; mode confirmé par le Raspberry");
    } catch(e) {
      if(entry!==this._entry)return;
      try {const live=await this._ws("rpi2dmd/brightness/ambient/get");if(entry!==this._entry)return;this._ambient=this._ambientMerge(live.ambient);this._render();}catch(_){}
      this.shadowRoot.querySelector("#ambient-error").textContent=e.message;
    }
  }
  _ambientEdit(action) {
    try {const c=this._ambientRead();action(c);(this._ambientDirty??=new Set()).add("points");this._ambient.config=c;this._render();}
    catch(e){this.shadowRoot.querySelector("#ambient-error").textContent=e.message;}
  }
  async _ambientSave() {
    const entry=this._entry;
    try {const {points,delay,minimum_change}=this._ambientRead();const result=await this._wsWrite("rpi2dmd/brightness/ambient/update",{changes:{points,delay,minimum_change}});if(entry!==this._entry)return;this._ambient=result.ambient;this._ambientDirty=new Set();this._render();this._showNotice("Configuration luminosité enregistrée");}
    catch(e){if(entry===this._entry)this.shadowRoot.querySelector("#ambient-error").textContent=e.message;}
  }
  _bind() {
    this._updateAmbientMeasure();
    this.shadowRoot.querySelector("#ambient-entity")?.addEventListener("change",event=>{this._ambientSelect({entity_id:event.target.value});});
    this.shadowRoot.querySelectorAll("[data-ambient-mode]").forEach(button=>button.addEventListener("click",()=>this._ambientSelect({mode:button.dataset.ambientMode})));
    this.shadowRoot.querySelector("#ambient-mode")?.addEventListener("change",event=>{this._ambientSelect({mode:event.target.value});});
    for(const [id,key] of [["ambient-delay","delay"],["ambient-minimum","minimum_change"]]) this.shadowRoot.querySelector(`#${id}`)?.addEventListener("input",event=>{const value=event.target.value;(this._ambientDirty??=new Set()).add(key);this._ambient.config[key]=value.trim()===""?"":Number(value);});
    this.shadowRoot.querySelector("#ambient-save")?.addEventListener("click",()=>this._ambientSave());
    this.shadowRoot.querySelector("#ambient-add")?.addEventListener("click",()=>this._ambientEdit(c=>c.points.push({lux:c.points.at(-1).lux+10,value:c.points.at(-1).value})));
    this.shadowRoot.querySelectorAll("[data-ambient-remove]").forEach(el=>el.addEventListener("click",()=>this._ambientEdit(c=>{if(c.points.length<2)throw new Error("Conservez au moins une ligne.");c.points.splice(Number(el.dataset.ambientRemove),1);})));
    this.shadowRoot.querySelectorAll("[data-ambient-lux], [data-ambient-value]").forEach(el=>{
      el.addEventListener("input",()=>{const key=el.hasAttribute("data-ambient-lux")?"lux":"value",i=Number(el.dataset.ambientLux??el.dataset.ambientValue);(this._ambientDirty??=new Set()).add("points");this._ambient.config.points[i][key]=el.value.trim()===""?"":Number(el.value);});
      el.addEventListener("change",()=>this._ambientEdit(()=>{}));
    });

    this.shadowRoot.querySelector("[data-action=playlist-refresh]")?.addEventListener("click",()=>this._refreshPlaylist());
    this.shadowRoot.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>this._loadSection(b.dataset.nav));
    const device=this.shadowRoot.querySelector("#device"); if(device) device.onchange=()=>{this._entry=device.value; this._online=false; this._clearRuntimeData(); this._render(); this._refreshStatus();};
    this.shadowRoot.querySelectorAll("[data-flag]").forEach(el=>el.onchange=(event)=>{if(!event.isTrusted)return;const input=event.currentTarget;const wanted=input.checked;this._updateDisplay({flags:{[input.dataset.flag]:wanted}});});
    const bright=this.shadowRoot.querySelector("#brightness"); const brightValue=this.shadowRoot.querySelector("#brightness-value"); const brightFill=this.shadowRoot.querySelector("#brightness-fill"); if(bright){const updateVisual=()=>{const value=Number(bright.value); const min=Number(bright.min||0); const max=Number(bright.max||100); const percentage=((value-min)/(max-min))*100; if(brightValue) brightValue.textContent=`${value} %`; if(brightFill) brightFill.style.width=`${percentage}%`;}; updateVisual(); bright.addEventListener("input",()=>{this._displayWriteState().draft=Number(bright.value);updateVisual();}); bright.onchange=(event)=>{if(!event.isTrusted)return;this._updateDisplay({brightness:{schedule:[{hour:new Date().getHours(),value:Number(bright.value)}]}});};}
    this.shadowRoot.querySelector("[data-action=retry]")?.addEventListener("click",()=>this._refreshStatus());
    this.shadowRoot.querySelector("[data-action=gif-retry]")?.addEventListener("click",()=>this._loadSection("gif"));
    this.shadowRoot.querySelectorAll("[data-action=up],[data-action=down]").forEach(b=>b.onclick=()=>this._move(b.dataset.item,b.dataset.action==="up"?-1:1));
    this.shadowRoot.querySelectorAll("[data-action=duplicate]").forEach(b=>b.onclick=()=>this._playlistAction("rpi2dmd/playlist/duplicate",{item_id:b.dataset.item}));
    this.shadowRoot.querySelectorAll("[data-action=delete]").forEach(b=>b.onclick=()=>{if(confirm("Supprimer cette ligne ?"))this._playlistAction("rpi2dmd/playlist/delete",{item_id:b.dataset.item});});
    this.shadowRoot.querySelectorAll("[data-action=icon-picker]").forEach(b=>b.onclick=()=>this._openIconPicker(b.dataset.item));
    this.shadowRoot.querySelectorAll("[data-action=icon-clear]").forEach(b=>b.onclick=()=>this._setItemIcon(b.dataset.item, null));
    this._scheduleIconPreviews();
    this.shadowRoot.querySelector("[data-action=icon-prev]")?.addEventListener("click",()=>{this._iconPage--;this._render();});
    this.shadowRoot.querySelector("[data-action=icon-next]")?.addEventListener("click",()=>{this._iconPage++;this._render();});
    this.shadowRoot.querySelector("[data-action=icon-close]")?.addEventListener("click",()=>{this._closeIconPicker();this._render();});
    this.shadowRoot.querySelector("[data-action=icon-select-none]")?.addEventListener("click",()=>this._setItemIcon(this._iconPickerTarget, null));
    this.shadowRoot.querySelectorAll("[data-action=icon-select]").forEach(b=>b.onclick=()=>this._setItemIcon(this._iconPickerTarget,b.dataset.iconId));
    this.shadowRoot.querySelector("#icon-search")?.addEventListener("input",e=>{this._iconSearch=e.target.value;this._iconPage=0;this._render();});
    this.shadowRoot.querySelector("#icon-category")?.addEventListener("change",e=>{this._iconCategory=e.target.value;this._iconPage=0;this._render();});
    this.shadowRoot.querySelectorAll("[data-action=toggle]").forEach(b=>b.onchange=(event)=>{if(!event.isTrusted)return;this._toggleItem(b.dataset.item, b.checked);});
    this.shadowRoot.querySelectorAll("[data-gif-category]").forEach(b=>b.onchange=(event)=>{if(!event.isTrusted)return;this._toggleGifCategory(b.dataset.gifCategory, b.checked);});
    this.shadowRoot.querySelector("#playlist-add-form")?.addEventListener("submit",event=>{event.preventDefault();this._addItem();});
    this.shadowRoot.querySelectorAll("[data-playlist-field]").forEach(input=>input.addEventListener("input",()=>{
      this._playlistDraft[input.dataset.playlistField]=input.value;
    }));
    this.shadowRoot.querySelector("#playlist-type")?.addEventListener("change",event=>{
      this._playlistDraft.type=event.target.value;
      this.shadowRoot.querySelector("#playlist-mqtt-fields").hidden=event.target.value!=="mqtt";
      this.shadowRoot.querySelector('[data-playlist-field="duration_seconds"]').disabled=event.target.value!=="mqtt";
    });
    this.shadowRoot.querySelector("[data-action=mqtt-save]")?.addEventListener("click",()=>this._saveMqtt());
    this.shadowRoot.querySelector("[data-action=mqtt-test]")?.addEventListener("click",()=>this._testMqtt());
    this.shadowRoot.querySelector("[data-action=weather-save]")?.addEventListener("click",()=>this._saveWeather());
    this.shadowRoot.querySelector("[data-action=schedule-save]")?.addEventListener("click",()=>this._scheduleSave());
    this.shadowRoot.querySelector("[data-action=schedule-apply]")?.addEventListener("click",()=>this._scheduleApply());
    this.shadowRoot.querySelector("#schedule-enabled")?.addEventListener("change",()=>{this._brightnessSchedule.enabled=this.shadowRoot.querySelector("#schedule-enabled").checked;});
    this.shadowRoot.querySelector("[data-action=export]")?.addEventListener("click",()=>this._export());
    this.shadowRoot.querySelector("#import")?.addEventListener("change",e=>this._import(e.target.files[0]));
  }
  _closeIconPicker() {
    clearTimeout(this._iconPreviewTimer);
    this._iconPreviewTimer=null;
    this._iconPickerOpen=false;
    this._iconPickerTarget=null;
    ++this._iconPickerRequest;
  }
  async _openIconPicker(itemId) {
    const request=++this._iconPickerRequest, entry=this._entry;
    this._iconPickerTarget=itemId;
    this._iconPickerOpen=true;
    this._icons=[];
    this._iconSearch="";
    this._iconCategory="";
    this._iconPage=0;
    this._iconPreviewFailed.clear();
    this._iconPreviewAuthBlocked.delete(entry);
    this._render();
    const current=()=>this._iconPickerOpen && this._iconPickerRequest===request && this._entry===entry;
    try {
      const result=await this._ws("rpi2dmd/icons/list",{limit:200,entry_id:entry});
      if(!current())return;
      this._icons=result.icons||{};
      this._render();
    } catch(e) {
      if(!current())return;
      this._closeIconPicker();
      this._showFeatureError("playlist",e,"Impossible de charger les icônes du RPI2DMD.");
    }
  }
  _paintIconPreview(iconId, src) {
    this.shadowRoot.querySelectorAll("[data-icon-preview],[data-picker-preview]").forEach(target=>{
      if((target.dataset.iconPreview??target.dataset.pickerPreview)!==String(iconId))return;
      if(target.tagName==="IMG") {
        if(src)target.src=src;
        else target.alt="Icône indisponible";
      } else if(src) {
        if(target.querySelector("img")?.getAttribute("src")===src)return;
        const img=document.createElement("img");
        img.src=src;
        img.alt="";
        target.replaceChildren(img);
      }
    });
  }
  _scheduleIconPreviews() {
    clearTimeout(this._iconPreviewTimer);
    this._iconPreviewTimer=null;
    if(!this.isConnected || !this._online)return;
    if(this._iconPreviewEntry!==this._entry) {
      if(this._iconPreviewEntry!==null)this._iconPreviewCaches.set(this._iconPreviewEntry,this._iconPreviewCache);
      this._iconPreviewCache=this._iconPreviewCaches.get(this._entry)||(this._iconPreviewEntry===null?this._iconPreviewCache:{});
      this._iconPreviewEntry=this._entry;
      this._iconPreviewFailed.clear();
    }
    // Playlist thumbnails come first. Only the current 12-tile page is rendered.
    const ids=new Set([...this.shadowRoot.querySelectorAll("[data-icon-preview]")].map(el=>el.dataset.iconPreview));
    if(this._iconPickerOpen) {
      this.shadowRoot.querySelectorAll("[data-picker-preview]").forEach(el=>ids.add(el.dataset.pickerPreview));
    }
    for(const id of ids) {
      if(this._iconPreviewCache[id]) { this._paintIconPreview(id,this._iconPreviewCache[id]); continue; }
      const entry=this._entry, key=JSON.stringify([entry,id]);
      if(this._iconPreviewFailed.has(key))continue;
      if(this._iconPreviewActive || this._iconPreviewAuthBlocked.has(entry))return;
      const delay=this._iconPreviewNextAt-Date.now();
      if(delay>0) {
        this._iconPreviewTimer=setTimeout(()=>this._scheduleIconPreviews(),delay);
        return;
      }
      this._iconPreviewActive=1;
      this._iconPreviewPending.add(key);
      Promise.resolve().then(()=>this._loadIconPreview(id,null,entry)).then(src=>{
        if(this._entry===entry)this._paintIconPreview(id,src);
      }).catch(err=>{
        if(err?.code==="icon_unavailable")this._iconPreviewFailed.add(key);
        else if(err?.code==="invalid_auth")this._iconPreviewAuthBlocked.add(entry);
        else this._iconPreviewNextAt=Date.now()+2000;
        if(this._entry===entry)this._paintIconPreview(id,null);
      }).finally(()=>{
        this._iconPreviewNextAt=Math.max(this._iconPreviewNextAt,Date.now()+200);
        this._iconPreviewActive=0;
        this._iconPreviewPending.delete(key);
        this._scheduleIconPreviews();
      });
      return;
    }
  }
  async _loadIconPreview(iconId, target=null, entry=this._entry) {
    const cache=entry===this._entry?this._iconPreviewCache:this._iconPreviewCaches.get(entry);
    if(cache?.[iconId]) { if(target)target.src=cache[iconId]; return cache[iconId]; }
    const icon=(await this._ws("rpi2dmd/icons/get",{icon_id:iconId,entry_id:entry})).icon;
    if(icon?.content_type!=="image/png" || typeof icon.data!=="string" || !icon.data) {
      throw {code:"icon_unavailable"};
    }
    const src=`data:image/png;base64,${icon.data}`;
    const destination=entry===this._entry?this._iconPreviewCache:(this._iconPreviewCaches.get(entry)||{});
    destination[iconId]=src;
    this._iconPreviewCaches.set(entry,destination);
    if(target)target.src=src;
    return src;
  }
  async _setItemIcon(itemId, iconId){if(!itemId)return;try{await this._wsWrite("rpi2dmd/playlist/update",{item_id:itemId,changes:{icon:iconId,show_icon:Boolean(iconId)}});this._clearFeatureError("playlist");this._closeIconPicker();await this._loadSection("playlist");}catch(e){this._showFeatureError("playlist",e,"Impossible d'enregistrer l'icône MQTT.");}}
  async _move(id,delta){const items=this._playlist?.items||[], i=items.findIndex(x=>x.id===id); if(i<0)return; await this._playlistAction("rpi2dmd/playlist/move",{item_id:id,index:i+delta});}
  async _toggleItem(id, enabled){await this._playlistAction("rpi2dmd/playlist/update",{item_id:id,changes:{enabled:Boolean(enabled)}});}
  async _toggleGifCategory(id, enabled){const current=this._gifCategoriesList().filter(x=>x.enabled).map(x=>x.id);const next=enabled?[...new Set([...current,id])]:current.filter(x=>x!==id);try{await this._wsWrite("rpi2dmd/gifs/categories/update",{enabled_ids:next});this._clearFeatureError("gif");await this._loadSection("gif");}catch(e){this._showFeatureError("gif",e,"Impossible de modifier les catégories GIF.");}}
  async _playlistAction(type,extra){try{await this._wsWrite(type,extra);this._clearFeatureError("playlist");await this._loadSection("playlist");}catch(e){this._showFeatureError("playlist",e,"Impossible de modifier la ligne de playlist.");}}
  async _addItem() {
    const type=this.shadowRoot.querySelector("#playlist-type")?.value;
    if(this._playlistAdding || !["gif","time","date","weather","mqtt"].includes(type))return;
    const item={type,enabled:true};
    if(type==="mqtt") {
      const duration=Number(this._playlistDraft.duration_seconds);
      if(!Number.isInteger(duration) || duration<1) {
        this.shadowRoot.querySelector("#playlist-add-form")?.reportValidity();
        return;
      }
      Object.assign(item,{title:this._playlistDraft.title,topic:this._playlistDraft.topic,unit:this._playlistDraft.unit,duration_seconds:duration});
    }
    this._playlistAdding=true;
    this._render();
    try {
      await this._wsWrite("rpi2dmd/playlist/add",{item});
      this._clearFeatureError("playlist");
      await this._loadSection("playlist");
    } catch(e) {
      this._showFeatureError("playlist",e,"Impossible d'ajouter la ligne de playlist.");
    } finally {
      this._playlistAdding=false;
      this._render();
    }
  }
  async _saveMqtt(){try{const changes={broker:this.shadowRoot.querySelector("#broker").value,port:Number(this.shadowRoot.querySelector("#mqtt-port").value),username:this.shadowRoot.querySelector("#mqtt-user").value,client_id:this.shadowRoot.querySelector("#mqtt-client").value};const password=this.shadowRoot.querySelector("#mqtt-password").value;if(password)changes.password=password;await this._wsWrite("rpi2dmd/mqtt/update",{changes});this._clearFeatureError("mqtt");await this._refreshStatus();}catch(e){this._showFeatureError("mqtt",e,"Impossible d'enregistrer la configuration MQTT.");}}
  async _testMqtt(){try{const result=await this._ws("rpi2dmd/mqtt/test",{body:{use_saved_credentials:true}});alert(`DNS: ${result.result.dns_resolved}\nTCP: ${result.result.reachable}\nAuthentifié: ${result.result.authenticated}\nLatence: ${result.result.latency_ms} ms`);}catch(e){this._showFeatureError("mqtt",e,"Impossible de tester la connexion MQTT.");}}
  async _saveWeather(){try{const key=this.shadowRoot.querySelector("#weather-api-key").value;const changes={country:this.shadowRoot.querySelector("#weather-country").value,postal_code:this.shadowRoot.querySelector("#weather-zip").value,unit:this.shadowRoot.querySelector("#weather-unit").value};if(key)changes.api_key=key;await this._wsWrite("rpi2dmd/weather/update",{changes});this._clearFeatureError("weather");this.shadowRoot.querySelector("#weather-api-key").value="";await this._loadSection("weather");}catch(e){this._showFeatureError("weather",e,"Impossible d'enregistrer la météo.");}}
  _scheduleReadForm(){
    if(this._online!==true)throw new Error("Le Raspberry est hors ligne.");
    return Array.from({length:24},(_,hour)=>{
      const el=this.shadowRoot.querySelector(`[data-schedule-value="${hour}"]`), time=`${String(hour).padStart(2,"0")}:00`;
      if(!el||el.disabled||el.value.trim()==="")throw new Error(`La luminosité de ${time} est manquante.`);
      const value=Number(el.value);
      if(!Number.isInteger(value)||value<0||value>100)throw new Error(`La luminosité de ${time} doit être comprise entre 0 et 100.`);
      if(value%5)throw new Error(`La luminosité ${value} % de ${time} est invalide : utilisez un multiple de 5.`);
      return {hour,value};
    });
  }
  async _scheduleSave(){try{const points=this._scheduleReadForm();const result=await this._wsWrite("rpi2dmd/brightness/schedule/update",{schedule:points,enabled:this._brightnessSchedule.enabled!==false});this._brightnessSchedule=result.schedule;this._clearFeatureError("brightness");await this._loadSection("brightness");this._showNotice("✓ Planning enregistré");}catch(e){this._showFeatureError("brightness",e,`✕ Impossible d'enregistrer le planning : ${e.message||"vérifiez les champs."}`);}}
  async _scheduleApply(){try{const points=this._scheduleReadForm();const now=new Date();const current=points.find(p=>p.hour===now.getHours());if(!current)throw new Error("aucun point horaire disponible");const result=await this._wsWrite("rpi2dmd/display/update",{changes:{brightness:{schedule:[{hour:now.getHours(),value:current.value}]}}});this._display=result.display;this._clearFeatureError("brightness");await this._refreshStatus();this._showNotice(`✓ Consigne de planning envoyée : ${current.value} %`);}catch(e){this._showFeatureError("brightness",e,`✕ Impossible d'appliquer la luminosité : ${e.message||"réessayez."}`);}}
  async _export(){try{const data=(await this._ws("rpi2dmd/config/export")).config;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download="rpi2dmd-config.json";a.click();URL.revokeObjectURL(a.href);}catch(e){this._showFeatureError("backup",e,"Impossible d'exporter la configuration.");}}
  async _import(file){if(!file)return;try{const doc=JSON.parse(await file.text());const validation=(await this._ws("rpi2dmd/config/import/validate",{document:doc})).validation;if(!validation.valid)throw new Error("Configuration invalide");if(confirm("Appliquer cette configuration ?")){await this._wsWrite("rpi2dmd/config/import/apply",{validation_token:validation.validation_token});this._clearFeatureError("backup");await this._refreshStatus();} }catch(e){this._showFeatureError("backup",e,"Impossible d'importer la configuration.");}}
  _css(){return `:host{display:block;color:var(--primary-text-color);background:var(--primary-background-color);min-height:100vh;font-family:var(--paper-font-body1_-_font-family, sans-serif)}main{max-width:1200px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;align-items:center;gap:16px}.brand{display:flex;align-items:center;gap:16px;min-width:0}.logo{display:block;width:min(360px,42vw);max-height:90px;object-fit:contain}h1{margin:0;font-size:2rem}h2{margin:0 0 12px;font-size:1.1rem}.sub,small{color:var(--secondary-text-color)}nav{display:flex;gap:6px;overflow:auto;padding:20px 0 12px;border-bottom:1px solid var(--divider-color)}button,select,input{font:inherit}button{border:0;border-radius:8px;padding:10px 14px;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.nav{background:var(--secondary-background-color);color:var(--primary-text-color);white-space:nowrap}.nav.active{background:var(--primary-color);color:#fff}.card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:14px;padding:18px;margin:16px 0;box-shadow:var(--ha-card-box-shadow,none)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}.cards .card{margin:0}.card strong{display:block;font-size:1.5rem;margin:8px 0}.controls{display:flex;flex-wrap:wrap;gap:18px;align-items:center}.controls label,.card>label{display:flex;flex-direction:column;gap:6px;margin:10px 0}.toggle{flex-direction:row!important;align-items:center}.row,.item{display:flex;justify-content:space-between;align-items:center;gap:12px}.item{border-top:1px solid var(--divider-color);padding:14px 0;min-width:0}.disabled-item{opacity:.62}.playlist-add-form{margin:16px 0}.playlist-add-form h3{margin:0}.playlist-add-form label{min-width:0;max-width:100%}.playlist-state{display:flex;align-items:center;gap:8px;overflow-wrap:anywhere}.actions{display:flex;gap:5px;flex-wrap:wrap}.actions button{padding:7px 9px}.error{background:var(--error-color);color:#fff;padding:12px;border-radius:8px;margin:14px 0}.warning{background:var(--warning-color);padding:14px;border-radius:8px;color:var(--primary-text-color)}input,select{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:6px;padding:9px;max-width:100%}.device{display:flex;align-items:center;gap:8px}.category-list{display:grid;gap:12px}.category-card,.schedule-row{display:flex;justify-content:space-between;align-items:center;gap:14px;border:1px solid var(--divider-color);border-radius:10px;padding:14px;min-width:0}.category-card small{display:block;margin-top:5px}.schedule-list{display:grid;gap:10px;margin:14px 0}.schedule-row label{display:flex;align-items:center;gap:8px;min-width:0}.file{display:block;margin-top:20px}@media(max-width:600px){main{padding:14px}.brand{align-items:flex-start}.logo{width:100%;max-width:300px;height:auto}header{align-items:flex-start;flex-direction:column}.device{width:100%}.device select{width:100%}.item,.schedule-row,.category-card{align-items:flex-start;flex-direction:column}.actions{width:100%}nav{padding-top:12px}}
`}
}
customElements.define("rpi2dmd-panel", Rpi2dmdPanel);
