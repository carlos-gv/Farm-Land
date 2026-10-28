// FarmLand demo: static data in /data, advice computed in the browser.
const STORE_KEY = 'farmland-demo-v1';
const TONE_COLOR = { high: '#b3261e', med: '#b26a00', low: '#3d6b35', rain: '#1f5f8b' };

const state = { crops: {}, scenarios: {}, fields: [], rules: {}, overrides: loadOverrides() };
let map = null, mapLayer = null;

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveOverrides() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.overrides)); } catch { /* storage unavailable */ }
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inches = n => `${n.toFixed(2)} in`;

// Pure decision function: field + crop + scenario + rules -> advice
function advise(field, crop, sc, rules) {
  const stage = crop.stages.find(s => field.gdd >= s.min_gdd && field.gdd <= s.max_gdd) || crop.stages[crop.stages.length - 1];
  const skip = sc.rain_24h_in >= rules.rain_skip_threshold_in;
  const step = rules.round_to_in;
  const water = skip ? 0 : Math.min(rules.max_application_in, Math.round(sc.et_deficit_in * stage.water_factor / step) * step);
  const risk = rules.risk_levels[stage.sensitivity];
  const highDeficit = sc.et_deficit_in >= rules.high_urgency_deficit_in;
  const score = skip ? 0 : risk.score + (highDeficit ? 1 : 0);

  let headline, tone, reasoning;
  if (skip) {
    headline = 'DO NOT IRRIGATE TODAY';
    tone = 'rain';
    reasoning = `${field.name} is in ${stage.stage_name}. ${inches(sc.rain_24h_in)} of rain is expected in the next 24 hours, above the ${inches(rules.rain_skip_threshold_in)} skip threshold, so rainfall covers the crop's needs. Hold irrigation and re-check tomorrow morning. ${stage.description}`;
  } else {
    headline = score >= 4 ? 'IRRIGATE TODAY — HIGH URGENCY' : 'IRRIGATE TODAY';
    tone = score >= 4 ? 'high' : score >= 3 ? 'med' : 'low';
    reasoning = `${field.name} is in ${stage.stage_name}. ${stage.description} ${sc.forecast_summary} The forecast adds a ${inches(sc.et_deficit_in)} water deficit, so apply ${inches(water)} today. ${stage.advice_tip}`;
  }
  return { stage, headline, tone, water, reasoning, score, risk, skip };
}

function currentField(f) {
  const o = state.overrides[f.field_id] || {};
  return {
    ...f, name: f.field_name,
    gdd: o.gdd ?? f.accumulated_gdd,
    scenarioId: o.scenario ?? f.active_scenario_id,
  };
}

function compute(f) {
  const cf = currentField(f);
  const sc = state.scenarios[cf.scenarioId];
  const crop = state.crops[cf.crop_id];
  return { cf, sc, crop, adv: advise(cf, crop, sc, state.rules) };
}

const badgeClass = s => ({ 'CRITICAL RISK': 'crit', MODERATE: 'mod', LOW: 'low' }[s]);

function dynHtml({ cf, sc, crop, adv }) {
  const amount = adv.skip
    ? `Rain expected: <b>${sc.rain_24h_in.toFixed(1)}</b> in in 24h`
    : `Apply <b>${adv.water.toFixed(2)}</b> inches`;
  const days = sc.forecast_3day.map(d =>
    `<div><b>${esc(d.label)}</b>${d.rain_in} in rain · ${d.temp_max_f}°F</div>`).join('');
  return `
    <div class="card-head">
      <img class="thumb" src="${esc(cf.photo_url)}" alt="" loading="lazy" onerror="this.remove()">
      <div class="name"><strong>${esc(cf.name)}</strong><small>${esc(crop.crop_name)} · ${cf.acres} ac · ${esc(cf.irrigation)}</small></div>
      <span class="badge ${badgeClass(adv.stage.sensitivity)}">${esc(adv.risk.label)}</span>
    </div>
    <div class="stage">${esc(adv.stage.stage_name)} · GDD ${cf.gdd}</div>
    <h2 class="headline">${esc(adv.headline)}</h2>
    <div class="amount">${amount}</div>
    <details class="why"><summary>Agronomic Reasoning</summary><p>${esc(adv.reasoning)}</p></details>
    <div class="forecast">${days}</div>`;
}

function cardHtml(f) {
  const c = compute(f);
  const options = Object.values(state.scenarios).map(s =>
    `<option value="${esc(s.scenario_id)}"${s.scenario_id === c.cf.scenarioId ? ' selected' : ''}>${esc(s.scenario_id)} (${esc(s.short_name)})</option>`).join('');
  const maxGdd = c.crop.stages[c.crop.stages.length - 1].max_gdd;
  return `
    <article class="card tone-${c.adv.tone}" data-id="${esc(f.field_id)}">
      <div class="dyn">${dynHtml(c)}</div>
      <div class="sim">
        <h3>⚡ Demo Scenario Simulator</h3>
        <label>Weather scenario</label>
        <select class="scen">${options}</select>
        <label>Crop progress: <span class="gdd-val">${c.cf.gdd}</span> GDD</label>
        <input class="gdd" type="range" min="0" max="${maxGdd}" step="10" value="${c.cf.gdd}">
      </div>
    </article>`;
}

function updateCard(el) {
  const f = state.fields.find(x => x.field_id === el.dataset.id);
  const c = compute(f);
  const dyn = el.querySelector('.dyn');
  const open = dyn.querySelector('details')?.open;
  dyn.innerHTML = dynHtml(c);
  if (open) dyn.querySelector('details').open = true;
  el.className = `card tone-${c.adv.tone}`;
  return c;
}

function sortCards() {
  const box = document.getElementById('cards');
  [...box.children]
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .forEach(el => box.appendChild(el));
  renderSummary();
  if (map) renderMap();
}
const scoreOf = el => compute(state.fields.find(f => f.field_id === el.dataset.id)).adv.score;

function renderSummary() {
  const advs = state.fields.map(f => compute(f).adv);
  const go = advs.filter(a => !a.skip).length;
  document.getElementById('summary').textContent =
    `${go} of ${advs.length} fields need water today · ${advs.length - go} on hold`;
}

function renderCards() {
  const box = document.getElementById('cards');
  box.innerHTML = state.fields.map(cardHtml).join('');
  sortCards();
  box.addEventListener('change', e => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    state.overrides[id] = { ...state.overrides[id] };
    if (e.target.matches('.scen')) state.overrides[id].scenario = e.target.value;
    if (e.target.matches('.gdd')) state.overrides[id].gdd = +e.target.value;
    saveOverrides();
    updateCard(card);
    sortCards();
  });
  box.addEventListener('input', e => {
    if (!e.target.matches('.gdd')) return;
    const card = e.target.closest('.card');
    card.querySelector('.gdd-val').textContent = e.target.value;
    state.overrides[card.dataset.id] = { ...state.overrides[card.dataset.id], gdd: +e.target.value };
    updateCard(card);
  });
}

function renderMap() {
  if (!map) {
    map = L.map('map');
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Tiles © Esri, Maxar, Earthstar Geographics',
    }).addTo(map);
    mapLayer = L.featureGroup().addTo(map);
  }
  mapLayer.clearLayers();
  state.fields.forEach(f => {
    const { cf, adv, crop } = compute(f);
    const color = TONE_COLOR[adv.tone];
    const popup = `<div class="popup"><strong>${esc(cf.name)}</strong>${esc(crop.crop_name)} · ${esc(adv.stage.stage_name)}<br>${esc(adv.headline)}${adv.skip ? '' : `<br>Apply ${adv.water.toFixed(2)} in`}</div>`;
    L.polygon(f.boundary, { color, weight: 2, fillColor: color, fillOpacity: .3 }).bindPopup(popup).addTo(mapLayer);
    L.circleMarker([f.lat, f.lng], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).bindPopup(popup).addTo(mapLayer);
  });
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== `view-${name}`);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'map') {
    renderMap();
    map.invalidateSize();
    map.fitBounds(mapLayer.getBounds(), { padding: [30, 30] });
  }
}

async function init() {
  const get = n => fetch(`data/${n}.json`).then(r => r.json());
  const [crops, scenarios, fields, rules] = await Promise.all(['crops', 'scenarios', 'fields', 'rules'].map(get));
  crops.forEach(c => state.crops[c.crop_id] = c);
  scenarios.forEach(s => state.scenarios[s.scenario_id] = s);
  state.fields = fields;
  state.rules = rules;

  document.getElementById('today').textContent =
    new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  document.querySelector('.tabs').addEventListener('click', e => {
    if (e.target.dataset.view) showView(e.target.dataset.view);
  });
  renderCards();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
