import { html, useState, useStore, ui, useUi, Icon, Chip, Sheet, Seg, Formula, Gauge, sectorColor } from './common.js';
import { LevelLine } from './charts.js';
import { SCENARIOS } from '../lib/store.js';
import { D, num, GAL_TO_L, ACRE_INCH_GAL } from '../lib/units.js';
import { levelAt } from '../lib/data.js';
import { addDays, dateMs, hhmm } from '../lib/planner.js';
import { splitVolume } from '../lib/runs.js';
import { fmtDay, fmtDayTime, fmtTime, fmtMonthDay, dateInput, timeInput } from '../lib/dates.js';

const LEVEL_LABEL = { action: 'Do now', warn: 'Warning', info: 'Heads-up' };
const LEVEL_ICON = { action: 'today', warn: 'alert', info: 'info' };

export function AlertList({ alerts }) {
  if (!alerts.length) return html`<p class="muted">Nothing needs attention right now.</p>`;
  return html`<div class="stack">${alerts.map((a) => html`<div class=${'alert ' + a.level} key=${a.id}>
    <${Icon} name=${LEVEL_ICON[a.level]} />
    <div><b>${a.title}</b><span class="small muted" style="font-weight:700">${LEVEL_LABEL[a.level]}</span><p>${a.body}</p></div>
  </div>`)}</div>`;
}

// Number input with its own gal / L toggle. Reports the value in gallons.
function VolumeInput({ label, value, onChange, hint }) {
  const { s } = useStore();
  const [unit, setUnit] = useState(s.prefs.vol);
  const toGal = (v) => (unit === 'L' && v !== '' ? D(v).div(GAL_TO_L).toString() : v);
  return html`<label class="field"><span>${label}</span>
    <div class="row">
      <input class="input" type="number" inputmode="decimal" min="0" step="any" value=${value.raw} onInput=${(e) => onChange({ raw: e.target.value, gal: toGal(e.target.value) })} />
      <${Seg} label="Unit for this field" value=${unit} options=${[{ value: 'gal', label: 'gal' }, { value: 'L', label: 'L' }]} onChange=${(u) => { setUnit(u); onChange({ raw: value.raw, gal: u === 'L' && value.raw !== '' ? D(value.raw).div(GAL_TO_L).toString() : value.raw }); }} />
    </div>${hint && html`<span class="small muted" style="margin-top:4px">${hint}</span>`}</label>`;
}

function LogSheet({ preset }) {
  const { s, d, a, f } = useStore();
  const yesterday = addDays(d.today, -1);
  const [line, setLine] = useState(preset || 'L3');
  const [date, setDate] = useState(yesterday);
  const [time, setTime] = useState('06:00');
  const [minutes, setMinutes] = useState('12.5');
  const [taken, setTaken] = useState({ raw: '', gal: '' });
  const [error, setError] = useState('');
  const l = d.lines.find((x) => x.id === line);
  const secs = Math.round(Number(minutes) * 60);
  const ok = secs > 0;
  const volume = ok ? l.rate_gpm.mul(secs).div(60) : D(0);
  const shares = s.seed.lineSectors.filter((x) => x.line_id === line);
  const start = dateMs(date, time);
  const overlap = ok && s.runs.some((r) => r.line_id === line && r.start_ms < start + secs * 1000 && r.start_ms + r.seconds * 1000 > start);
  const save = () => {
    const res = a.logRun({ line_id: line, date, time, minutes, takenGal: taken.gal });
    if (res.error) setError(res.error); else ui.close();
  };
  return html`<${Sheet} title="Log a run" onClose=${ui.close}>
    <div class="stack">
      <label class="field"><span>Line</span><select class="input" value=${line} onChange=${(e) => setLine(e.target.value)}>${d.lines.map((x) => html`<option value=${x.id}>${x.name} (${f.rate(x.rate_gpm)})</option>`)}</select></label>
      <div class="grid cols-2">
        <label class="field"><span>Date</span><input class="input" type="date" max=${dateInput(d.now)} value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
        <label class="field"><span>Start time</span><input class="input" type="time" value=${time} onInput=${(e) => setTime(e.target.value)} /></label>
      </div>
      <label class="field"><span>Duration (minutes)</span><input class="input" type="number" inputmode="decimal" min="0" step="any" value=${minutes} onInput=${(e) => setMinutes(e.target.value)} /></label>
      ${ok && html`<${Formula} rate=${f.rate(l.rate_gpm)} minutes=${f.minutes(D(secs).div(60))} volume=${f.vol(volume)} />
        <div class="small muted">${splitVolume(volume, shares).map((p) => `${s.seed.sectors.find((z) => z.id === p.sector_id).name} ${f.vol(p.gal)}`).join(' · ')}</div>`}
      ${overlap && html`<div class="alert warn"><${Icon} name="alert" /><div><b>This overlaps another run on ${l.name}.</b><p>Both runs are kept and flagged, so nothing is double counted by accident.</p></div></div>`}
      <${VolumeInput} label="Water taken from the reservoir (optional)" value=${taken} onChange=${setTaken} hint="A second check: what you measured leaving the reservoir." />
      ${error && html`<p class="err" role="alert">${error}</p>`}
      <button class="btn primary block" type="button" onClick=${save} disabled=${!ok}>Save run</button>
    </div>
  <//>`;
}

function AlertsSheet() {
  const { d } = useStore();
  return html`<${Sheet} title="Alerts" onClose=${ui.close}><${AlertList} alerts=${d.alerts} /><//>`;
}

async function sendTest(d) {
  if (!('Notification' in window)) return 'This browser has no notifications. The in-app banner on Today is the reminder here.';
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'Notifications are blocked. Allow them in browser settings, or use the in-app banner.';
  const due = d.alerts.find((a) => a.kind === 'due');
  const title = due ? due.title : 'FarmLand reminder';
  const body = due ? due.body : 'Nothing is due right now. This is a test.';
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'farmland-test' });
  else new Notification(title, { body });
  return 'Notification sent.';
}

function SettingsSheet() {
  const { s, d, a } = useStore();
  const [note, setNote] = useState('');
  return html`<${Sheet} title="Settings and demo controls" onClose=${ui.close}>
    <div class="stack-lg">
      <section class="stack"><h3>Units</h3>
        <div class="row wrap"><span style="min-width:72px">Volume</span><${Seg} label="Volume unit" value=${s.prefs.vol} options=${[{ value: 'gal', label: 'Gallons' }, { value: 'L', label: 'Liters' }]} onChange=${(v) => a.setPref('vol', v)} /></div>
        <div class="row wrap"><span style="min-width:72px">Area</span><${Seg} label="Area unit" value=${s.prefs.area} options=${[{ value: 'ac', label: 'Acres' }, { value: 'ha', label: 'Hectares' }]} onChange=${(v) => a.setPref('area', v)} /></div>
        <div class="row wrap"><span style="min-width:72px">Depth</span><${Seg} label="Depth unit" value=${s.prefs.depth} options=${[{ value: 'in', label: 'Inches' }, { value: 'mm', label: 'Millimeters' }]} onChange=${(v) => a.setPref('depth', v)} /></div>
        <p class="small muted">Display only. Stored values never change when you switch units.</p>
      </section>
      <section class="stack"><h3>Weather scenario</h3>
        <${Seg} label="Weather scenario" value=${s.scenario} options=${Object.entries(SCENARIOS).map(([value, v]) => ({ value, label: v.label }))} onChange=${a.setScenario} />
        <p class="small muted">${SCENARIOS[s.scenario].hint}. Canned demo weather.</p>
      </section>
      <section class="stack"><h3>Demo clock</h3>
        <${Seg} label="Demo clock speed" value=${s.speed} options=${[{ value: 1, label: 'Real time' }, { value: 60, label: '60× faster' }]} onChange=${a.setSpeed} />
        <p class="small muted">At 60×, one real second counts as one minute while a line is running, so a 12-minute run takes 12 seconds.</p>
      </section>
      <section class="stack"><h3>Connection</h3>
        <label class="switch"><input type="checkbox" role="switch" checked=${s.offline} onChange=${(e) => a.setOffline(e.target.checked)} /> Simulate offline</label>
        <p class="small muted">Changes made offline are counted and "uploaded" when you switch back. Sync is simulated in this demo.</p>
      </section>
      <section class="stack"><h3>Reminders</h3>
        <button class="btn" type="button" onClick=${async () => setNote(await sendTest(d))}><${Icon} name="bell" /> Send test notification</button>
        ${note && html`<p class="small" role="status">${note}</p>`}
      </section>
      <section class="stack"><h3>Demo data</h3>
        <button class="btn" type="button" onClick=${() => { a.reset(); ui.close(); }}><${Icon} name="undo" /> Reset demo</button>
        <p class="small muted">Everything you add lives in this tab only. Reloading also resets it.</p>
      </section>
    </div>
  <//>`;
}

function WhySheet({ item }) {
  const { s, d, f } = useStore();
  const line = d.lines.find((l) => l.id === item.line_id);
  const day = d.plan.days.find((x) => x.date === item.date);
  const sec = (id) => s.seed.sectors.find((z) => z.id === id);
  return html`<${Sheet} title=${`Why: ${line.name}, ${fmtDay(item.date)}`} onClose=${ui.close}>
    <div class="stack">
      <${Formula} rate=${f.rate(item.rate_gpm)} minutes=${f.minutes(item.minutes)} volume=${f.vol(item.gallons)} />
      <p class="small muted">${fmtTime(item.start_ms)} to ${fmtTime(item.end_ms)}${new Date(item.end_ms).getUTCDate() !== new Date(item.start_ms).getUTCDate() ? ' the next day' : ''}. Planned minutes are rounded up to a whole minute, then volume = rate × minutes.</p>
      ${item.staggered && html`<div class="alert"><${Icon} name="wait" /><div><b>Waits for its turn</b><p>${item.stagger_reason}.</p></div></div>`}
      ${item.shortfall_gal.gt(0) && html`<div class="alert crit"><${Icon} name="alert" /><div><b>Not enough water</b><p>The reservoir will be short by ${f.vol(item.shortfall_gal)} when this run starts.</p></div></div>`}
      ${item.why.map((w) => {
        const sector = sec(w.sector_id);
        return html`<section key=${w.sector_id} class="stack">
          <div class="row wrap" style="justify-content:space-between"><h3>${sector.name}</h3><${Chip} kind=${w.sensitivity === 'CRITICAL RISK' ? 'warn' : ''}>${w.stage}${w.sensitivity === 'CRITICAL RISK' ? ', critical stage' : ''}<//></div>
          <div class="why-step"><h3>1. Weather (${day.kind === 'typical' ? 'typical for the date' : 'forecast'})</h3><span>Reference ET ${f.depth(w.et0)} per day, rain ${f.depth(w.rain)}</span></div>
          <div class="why-step"><h3>2. Crop water use = ET × crop factor (Kc)</h3><div class="formula"><span>${f.depth(w.et0)}</span><span class="op">×</span><span>${w.kc.toString()}</span><span class="op">=</span><span class="res">${f.depth(w.etc)}</span></div></div>
          <div class="why-step"><h3>3. Water deficit before irrigating</h3><span>${f.depth(w.deficit_in)} (crop use since the last irrigation, minus effective rain)</span></div>
          <div class="why-step"><h3>4. Apply the deficit, up to ${f.depth(s.seed.rules.max_application_in)}</h3><span class="res"><b>${f.depth(w.apply_in)}</b> over ${f.area(sector.area_ac)}</span></div>
          <div class="why-step"><h3>5. Depth to water volume</h3><div class="formula"><span>${f.depth(w.apply_in)}</span><span class="op">×</span><span>${f.area(sector.area_ac)}</span><span class="op">×</span><span>${num(ACRE_INCH_GAL, 3, true)} gal per acre-inch</span><span class="op">=</span><span class="res">${f.vol(w.net_gal)}</span></div></div>
          <div class="why-step"><h3>6. Minutes for ${line.name}</h3><div class="formula"><span>${f.vol(w.net_gal)}</span><span class="op">÷</span><span>(${f.rate(w.sum_w_gpm)} to this sector × ${w.eff.toString()} efficiency)</span><span class="op">=</span><span class="res">${f.minutes(w.minutes_add)}</span></div></div>
        </section>`;
      })}
    </div>
  <//>`;
}

function LineSheet({ id }) {
  const { s, d, a, f } = useStore();
  const line = d.lines.find((l) => l.id === id);
  const versions = s.lineVersions[id];
  const editable = id === 'L3';
  const [rate, setRate] = useState(String(line.rate_gpm.plus(20).toString()));
  const [error, setError] = useState('');
  const res = s.seed.reservoirs.find((r) => r.id === line.reservoir_id);
  const runs = s.runs.filter((r) => r.line_id === id);
  const shares = s.seed.lineSectors.filter((x) => x.line_id === id);
  const stored = runs.reduce((acc, r) => acc.plus(r.volume_gal), D(0));
  return html`<${Sheet} title=${line.name} onClose=${ui.close}>
    <div class="stack-lg">
      <section class="stack">
        <div class="row wrap"><${Chip}>${line.system}<//><${Chip}>Efficiency ${line.eff.mul(100).toString()}%<//><${Chip}>${res.name}<//></div>
        <p>${shares.map((x) => `${s.seed.sectors.find((z) => z.id === x.sector_id).name} ${x.share_pct.toString()}%`).join(' · ')}</p>
        <div class="kpi"><div class="label">Current rate</div><div class="value">${f.rate(line.rate_gpm)}</div></div>
      </section>
      <section class="stack"><h3>Change the rate</h3>
        ${editable ? html`
          <label class="field"><span>New rate (${f.rateUnit})</span><input class="input" type="number" inputmode="decimal" min="0" step="any" value=${rate} onInput=${(e) => setRate(e.target.value)} data-autofocus /></label>
          ${error && html`<p class="err" role="alert">${error}</p>`}
          <button class="btn primary" type="button" onClick=${() => { const r = a.editLineRate(id, f.volUnit === 'L' ? D(rate || 0).div(GAL_TO_L) : rate || 0); if (r.error) setError(r.error); else setError(''); }}>Save as new version</button>
          <p class="small muted">Editing creates a new version. Nothing is overwritten, and past runs keep the rate they ran at.</p>`
        : html`<div class="row"><button class="btn" type="button" disabled>Edit rate</button><span class="notdemo">Not in demo</span></div><p class="small muted">In this demo, only Shared Lateral can be edited.</p>`}
      </section>
      <section class="stack"><h3>Version history</h3>
        ${[...versions].reverse().map((v) => html`<div class="run-line" key=${v.v}><div class="row wrap" style="justify-content:space-between"><b>Version ${v.v}</b><span>${f.rate(v.rate_gpm)}</span></div><div class="small muted">${v.note}, by ${v.by}${v.v === 1 ? '' : `, effective ${fmtDayTime(v.effective_ms)}`}</div></div>`)}
        <p class="small">${runs.length} past runs on this line: <b>${f.vol(stored)}</b> in total, each stored at the rate it ran at. Editing the rate does not change this number.</p>
      </section>
    </div>
  <//>`;
}

const KIND = { level: 'Level reading', refill: 'Refill', withdrawal_confirmation: 'Measured withdrawal' };

function ReservoirSheet({ id }) {
  const { s, d, a, f } = useStore();
  const res = s.seed.reservoirs.find((r) => r.id === id);
  const [refill, setRefill] = useState({ raw: '', gal: '' });
  const [reading, setReading] = useState({ raw: '', gal: '' });
  const [error, setError] = useState('');
  const env = { readings: s.readings, runs: s.runs, lines: d.lines, reservoirs: s.seed.reservoirs };
  const points = [];
  for (let o = -13; o <= 0; o++) {
    const ms = o === 0 ? d.now : dateMs(addDays(d.today, o), '20:00');
    points.push({ ms, gal: levelAt(id, ms, env).toNumber(), label: fmtMonthDay(ms) });
  }
  const mine = s.readings.filter((r) => r.reservoir_id === id).slice(-8).reverse();
  const level = d.levels[id];
  const submit = (kind, v, reset) => {
    const r = a.addReading({ reservoir_id: id, kind, gal: v.gal === '' ? '0' : v.gal });
    if (r.error) setError(r.error); else { setError(''); reset({ raw: '', gal: '' }); }
  };
  return html`<${Sheet} title=${res.name} onClose=${ui.close}>
    <div class="stack-lg">
      <section class="stack">
        <div class="kpi"><div class="label">Estimated level now</div><div class="value">${f.vol(level)}</div><div class="sub">${num(level.div(res.capacity_gal).mul(100), 0)}% of ${f.vol(res.capacity_gal)} · max outflow ${f.rate(res.max_outflow_gpm)}</div></div>
        <${LevelLine} points=${points} cap=${res.capacity_gal.toNumber()} f=${f} />
        <p class="small muted">Level = last gauge reading + refills − water used by runs since.</p>
      </section>
      <section class="stack"><h3>Add a refill</h3>
        <${VolumeInput} label="Amount added" value=${refill} onChange=${setRefill} />
        <button class="btn primary" type="button" onClick=${() => submit('refill', refill, setRefill)}>Add refill</button>
      </section>
      <section class="stack"><h3>Record a gauge reading</h3>
        <${VolumeInput} label="Level on the gauge" value=${reading} onChange=${setReading} hint="This sets the level. Runs and refills after it are added on top." />
        <button class="btn" type="button" onClick=${() => submit('level', reading, setReading)}>Save reading</button>
      </section>
      ${error && html`<p class="err" role="alert">${error}</p>`}
      <section class="stack"><h3>Recent entries</h3>
        ${mine.map((r, i) => {
          const run = r.ref_run && s.runs.find((x) => x.id === r.ref_run);
          const diff = run ? r.gal.minus(run.volume_gal).div(run.volume_gal).mul(100) : null;
          return html`<div class="run-line" key=${i}><div class="row wrap" style="justify-content:space-between"><b>${KIND[r.kind]}</b><span>${f.vol(r.gal)}</span></div>
            <div class="small muted">${fmtDayTime(r.at_ms)} · ${r.note}</div>
            ${run && html`<div class="small" style="margin-top:6px">Computed from the run (rate × time): ${f.vol(run.volume_gal)}. Measured: ${f.vol(r.gal)}. Difference <b>${diff.gt(0) ? '+' : ''}${num(diff, 1)}%</b>.</div>`}
          </div>`;
        })}
      </section>
    </div>
  <//>`;
}

export function SheetHost() {
  const sheet = useUi();
  if (!sheet) return null;
  if (sheet === 'alerts') return html`<${AlertsSheet} />`;
  if (sheet === 'settings') return html`<${SettingsSheet} />`;
  if (sheet === 'log') return html`<${LogSheet} />`;
  if (sheet.type === 'log') return html`<${LogSheet} preset=${sheet.line_id} />`;
  if (sheet.type === 'why') return html`<${WhySheet} item=${sheet.item} />`;
  if (sheet.type === 'line') return html`<${LineSheet} id=${sheet.id} />`;
  if (sheet.type === 'res') return html`<${ReservoirSheet} id=${sheet.id} />`;
  return null;
}
