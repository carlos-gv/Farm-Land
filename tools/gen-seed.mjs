// Generates docs/data/*.csv. Run: node tools/gen-seed.mjs
// Past runs come from the same planner the app uses (run on the history weather), with small jitter.
import { writeFileSync, mkdirSync } from 'node:fs';
import { D } from '../docs/lib/units.js';
import { simulate, dateMs, addDays, dayOf, hhmm } from '../docs/lib/planner.js';
import { toCsv } from '../docs/lib/csv.js';

const OUT = new URL('../docs/data/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const DEMO_DATE = '2026-07-13';

const farm = [{ name: 'Boise Valley Farm', lat: 43.615, lon: -116.2023, tz: 'America/Denver', demo_date: DEMO_DATE, demo_time: '06:10' }];
const sectors = [
  { id: 'S1', name: 'North Pivot', area_ac: 40, crop_id: 'POT-01', gdd_now: 780, fallback_weekly_in: 1.5 },
  { id: 'S2', name: 'East Block', area_ac: 25, crop_id: 'POT-01', gdd_now: 520, fallback_weekly_in: 1.5 },
  { id: 'S3', name: 'West Corn', area_ac: 30, crop_id: 'CORN-01', gdd_now: 1150, fallback_weekly_in: 1.6 },
];
const lines = [
  { id: 'L1', name: 'Pivot 1', rate_gpm: 1200, reservoir_id: 'R1', system: 'Pivot', efficiency: 0.85 },
  { id: 'L2', name: 'East Drip 1', rate_gpm: 200, reservoir_id: 'R2', system: 'Drip', efficiency: 0.9 },
  { id: 'L3', name: 'Shared Lateral', rate_gpm: 400, reservoir_id: 'R2', system: 'Sprinkler', efficiency: 0.75 },
  { id: 'L4', name: 'Pivot 2', rate_gpm: 800, reservoir_id: 'R1', system: 'Pivot', efficiency: 0.85 },
  { id: 'L5', name: 'East Drip 2', rate_gpm: 200, reservoir_id: 'R2', system: 'Drip', efficiency: 0.9 },
];
const lineSectors = [
  { line_id: 'L1', sector_id: 'S1', share_pct: 100 },
  { line_id: 'L2', sector_id: 'S2', share_pct: 100 },
  { line_id: 'L3', sector_id: 'S2', share_pct: 45 },
  { line_id: 'L3', sector_id: 'S3', share_pct: 55 },
  { line_id: 'L4', sector_id: 'S3', share_pct: 100 },
  { line_id: 'L5', sector_id: 'S2', share_pct: 100 },
];
const reservoirs = [
  { id: 'R1', name: 'Main Pond', capacity_gal: 6000000, max_outflow_gpm: 2200, planned_inflow_gpd: 430000, refill_gal: 900000 },
  { id: 'R2', name: 'Well Tank', capacity_gal: 2500000, max_outflow_gpm: 700, planned_inflow_gpd: 400000, refill_gal: 450000 },
];
const rules = [
  ['rain_skip_in', 0.5], ['min_application_in', 0.5], ['max_application_in', 1.5], ['start_time', '06:00'],
  ['start_deficit_in', 0.2], ['eff_rain_min_in', 0.1], ['eff_rain_cap_in', 1.0], ['low_reservoir_pct', 25],
].map(([key, value]) => ({ key, value }));

const crops = [];
const addCrop = (id, name, stages) => stages.forEach((s) => crops.push({ crop_id: id, crop_name: name, stage: s[0], min_gdd: s[1], max_gdd: s[2], kc: s[3], sensitivity: s[4], tip: s[5] }));
addCrop('POT-01', 'Russet Potato', [
  ['Vegetative', 0, 300, 0.55, 'LOW', 'Light, infrequent watering encourages deeper roots.'],
  ['Tuber Initiation', 301, 600, 0.85, 'MODERATE', 'Keep soil evenly moist to set tuber count.'],
  ['Tuber Bulking', 601, 1300, 1.15, 'CRITICAL RISK', 'A deficit of more than 48 hours risks grade downgrades.'],
  ['Maturation', 1301, 2000, 0.75, 'LOW', 'Overwatering now invites rot and skin problems.'],
]);
addCrop('CORN-01', 'Sweet Corn', [
  ['Emergence', 0, 400, 0.4, 'LOW', 'Small, frequent applications are enough.'],
  ['Rapid Vegetative', 401, 1000, 0.8, 'MODERATE', 'Stress now cuts ear size potential.'],
  ['Tasseling & Silking', 1001, 1400, 1.15, 'CRITICAL RISK', 'Even 2 days of stress can cut yield sharply.'],
  ['Grain Fill', 1401, 1800, 0.9, 'MODERATE', 'Keep moisture steady until harvest.'],
]);

// ---- weather (inches, deg F). Demo values, not real observations.
const wx = [];
const H_T = [86, 88, 90, 91, 87, 83, 82, 85, 88, 90, 92, 91, 89, 88, 90];
const H_E = [0.26, 0.27, 0.29, 0.3, 0.27, 0.22, 0.2, 0.25, 0.28, 0.3, 0.31, 0.3, 0.28, 0.27, 0.29];
const history = H_T.map((t, i) => ({ day_offset: i - 14, rain_in: { 5: 0.4, 10: 0.12 }[i] ?? 0, et0_in: H_E[i], temp_f: t }));
const scen = (name, f) => { for (let d = 1; d <= 30; d++) { const r = f(d); wx.push({ scenario: name, day_offset: d, kind: d <= 16 ? 'forecast' : 'typical', rain_in: r[0], et0_in: r[1], temp_f: r[2] }); } };
const wob = (d, a) => Math.round(Math.sin(d * 1.7) * a * 100) / 100;
scen('normal', (d) => d <= 16 ? [{ 4: 0.25, 9: 0.62, 14: 0.12 }[d] ?? 0, +(0.27 + wob(d, 0.02)).toFixed(2), Math.round(87 + wob(d, 3))] : [0.04, 0.27, 86]);
scen('heatwave', (d) => d <= 10 ? [0, +(0.38 + wob(d, 0.015)).toFixed(2), 98 + (d % 3)] : d <= 16 ? [0, 0.33, 92] : [0.02, 0.31, 90]);
scen('heavy', (d) => d <= 16 ? [{ 1: 1.2, 2: 0.6, 5: 0.9, 8: 0.7, 11: 0.5, 13: 1.0, 15: 0.6 }[d] ?? 0, 0.17, 72 + (d % 4)] : [0.1, 0.22, 80]);

// ---- past runs from the planner
const ctx = {
  sectors: sectors.map((s) => ({ ...s, area_ac: D(s.area_ac) })),
  lines: lines.map((l) => ({ ...l, rate_gpm: D(l.rate_gpm), eff: D(l.efficiency) })),
  lineSectors: lineSectors.map((l) => ({ ...l, share_pct: D(l.share_pct) })),
  reservoirs: reservoirs.map((r) => ({ ...r, capacity_gal: D(r.capacity_gal), max_outflow_gpm: D(r.max_outflow_gpm), inflow_gpd: D(r.planned_inflow_gpd) })),
  stagesByCrop: Object.fromEntries([...new Set(crops.map((c) => c.crop_id))].map((id) => [id, crops.filter((c) => c.crop_id === id)])),
  rules: Object.fromEntries(rules.map((r) => [r.key, r.key === 'start_time' ? r.value : D(r.value)])),
};
const hw = Object.fromEntries(history.map((r) => [r.day_offset, { rain: D(r.rain_in), et0: D(r.et0_in), temp: D(r.temp_f) }]));
const gdd = Object.fromEntries(sectors.map((s) => [s.id, { 0: s.gdd_now }]));
for (let o = -1; o >= -14; o--) for (const s of sectors) gdd[s.id][o] = gdd[s.id][o + 1] - Math.max(0, hw[o + 1].temp.toNumber() - 50);
const days = [];
for (let o = -14; o <= -1; o++) days.push({ offset: o, date: addDays(DEMO_DATE, o), kind: 'history', weather: hw[o], gdd: Object.fromEntries(sectors.map((s) => [s.id, gdd[s.id][o]])) });
const sim = simulate({ ctx, days, deficits: Object.fromEntries(sectors.map((s) => [s.id, D(0.3)])) });

let seed = 7;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const runs = [];
let n = 0;
for (const day of sim.days) for (const it of day.items) {
  n++;
  const secs = Math.round(it.minutes.toNumber() * 60 * (0.97 + rnd() * 0.07));
  runs.push({ id: 'r' + String(n).padStart(3, '0'), line_id: it.line_id, start_ms: it.start_ms + Math.round((rnd() - 0.5) * 20) * 60000, seconds: secs, source: n % 3 === 0 ? 'manual' : 'timer', rate_gpm_snapshot: lines.find((l) => l.id === it.line_id).rate_gpm, note: n % 3 === 0 ? 'Logged afterwards' : '' });
}
const iso = (ms) => new Date(ms).toISOString().slice(0, 19);
const runRows = runs.map((r) => ({ ...r, start_iso: iso(r.start_ms) }));

// ---- reservoir readings, simulated from the runs
const readings = [];
const lineRes = Object.fromEntries(lines.map((l) => [l.id, l.reservoir_id]));
const t0 = dateMs(addDays(DEMO_DATE, -14), '06:00');
const start = { R1: 4300000, R2: 1900000 };
for (const r of reservoirs) {
  readings.push({ reservoir_id: r.id, kind: 'level', gal: start[r.id], at_iso: iso(t0), note: 'Opening reading', ref_run: '' });
  for (let o = -14; o <= -2; o += 2) readings.push({ reservoir_id: r.id, kind: 'refill', gal: r.refill_gal, at_iso: iso(dateMs(addDays(DEMO_DATE, o), '22:00')), note: r.id === 'R1' ? 'Canal delivery' : 'Well pumping', ref_run: '' });
}
const levelAt = (rid, ms) => {
  let lvl = start[rid];
  const cap = reservoirs.find((r) => r.id === rid).capacity_gal;
  const ev = [
    ...runs.filter((r) => lineRes[r.line_id] === rid).map((r) => ({ t: r.start_ms, d: -(Number(r.rate_gpm_snapshot) * r.seconds) / 60 })),
    ...readings.filter((x) => x.reservoir_id === rid && x.kind === 'refill').map((x) => ({ t: Date.parse(x.at_iso + 'Z'), d: Number(x.gal) })),
  ].filter((e) => e.t > t0 && e.t <= ms).sort((a, b) => a.t - b.t);
  for (const e of ev) lvl = Math.min(cap, lvl + e.d);
  return lvl;
};
for (const r of reservoirs) {
  for (const [o, hm] of [[-7, '18:00'], [-1, '20:00']]) {
    const at = dateMs(addDays(DEMO_DATE, o), hm);
    readings.push({ reservoir_id: r.id, kind: 'level', gal: Math.round(levelAt(r.id, at) / 1000) * 1000, at_iso: iso(at), note: 'Gauge reading', ref_run: '' });
  }
}
const conf = runs.filter((r) => r.line_id === 'L1' && r.start_ms > dateMs(addDays(DEMO_DATE, -5))).at(0);
if (conf) {
  const vol = (Number(conf.rate_gpm_snapshot) * conf.seconds) / 60;
  readings.push({ reservoir_id: 'R1', kind: 'withdrawal_confirmation', gal: Math.round((vol * 1.012) / 100) * 100, at_iso: iso(conf.start_ms + conf.seconds * 1000 + 3600000), note: 'Farmer measured drop in pond', ref_run: conf.id });
}
readings.sort((a, b) => a.at_iso.localeCompare(b.at_iso));

const w = (name, rows, cols) => writeFileSync(OUT + name, toCsv(rows, cols));
w('farm.csv', farm, ['name', 'lat', 'lon', 'tz', 'demo_date', 'demo_time']);
w('sectors.csv', sectors, ['id', 'name', 'area_ac', 'crop_id', 'gdd_now', 'fallback_weekly_in']);
w('lines.csv', lines, ['id', 'name', 'rate_gpm', 'reservoir_id', 'system', 'efficiency']);
w('line_sectors.csv', lineSectors, ['line_id', 'sector_id', 'share_pct']);
w('reservoirs.csv', reservoirs, ['id', 'name', 'capacity_gal', 'max_outflow_gpm', 'planned_inflow_gpd']);
w('crops.csv', crops, ['crop_id', 'crop_name', 'stage', 'min_gdd', 'max_gdd', 'kc', 'sensitivity', 'tip']);
w('rules.csv', rules, ['key', 'value']);
w('runs.csv', runRows, ['id', 'line_id', 'start_iso', 'seconds', 'source', 'rate_gpm_snapshot', 'note']);
w('reservoir_readings.csv', readings, ['reservoir_id', 'kind', 'gal', 'at_iso', 'note', 'ref_run']);
w('weather_history.csv', history, ['day_offset', 'rain_in', 'et0_in', 'temp_f']);
w('weather_scenarios.csv', wx, ['scenario', 'day_offset', 'kind', 'rain_in', 'et0_in', 'temp_f']);
console.log('runs', runs.length, 'readings', readings.length);
