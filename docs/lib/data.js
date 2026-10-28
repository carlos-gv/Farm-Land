// Turns the CSV seed into typed objects, and computes reservoir levels from readings + runs.
import { parseCsv } from './csv.js';
import { D, Decimal } from './units.js';
import { makeRun } from './runs.js';

export const FILES = ['farm', 'sectors', 'lines', 'line_sectors', 'reservoirs', 'crops', 'rules', 'runs', 'reservoir_readings', 'weather_history', 'weather_scenarios'];
const wall = (iso) => Date.parse(iso + 'Z'); // timestamps are farm wall-clock times

export async function loadSeed(read) {
  const raw = {};
  await Promise.all(FILES.map(async (f) => { raw[f] = parseCsv(await read(f + '.csv')); }));
  return shapeSeed(raw);
}

export function shapeSeed(raw) {
  const farm = raw.farm[0];
  const sectors = raw.sectors.map((s) => ({ ...s, area_ac: D(s.area_ac), gdd_now: Number(s.gdd_now), fallback_weekly_in: D(s.fallback_weekly_in) }));
  const lines = raw.lines.map((l) => ({ ...l, rate_gpm: D(l.rate_gpm), eff: D(l.efficiency) }));
  const lineSectors = raw.line_sectors.map((l) => ({ ...l, share_pct: D(l.share_pct) }));
  const reservoirs = raw.reservoirs.map((r) => ({
    ...r, capacity_gal: D(r.capacity_gal), max_outflow_gpm: D(r.max_outflow_gpm), inflow_gpd: D(r.planned_inflow_gpd),
  }));
  const stagesByCrop = {};
  const cropNames = {};
  for (const c of raw.crops) {
    (stagesByCrop[c.crop_id] ??= []).push({ ...c, min_gdd: Number(c.min_gdd), max_gdd: Number(c.max_gdd), kc: D(c.kc) });
    cropNames[c.crop_id] = c.crop_name;
  }
  for (const k in stagesByCrop) stagesByCrop[k].sort((a, b) => a.min_gdd - b.min_gdd);
  const rules = Object.fromEntries(raw.rules.map((r) => [r.key, r.key === 'start_time' ? r.value : D(r.value)]));
  const runs = raw.runs
    .map((r) => makeRun({
      id: r.id, line_id: r.line_id, start_ms: wall(r.start_iso), seconds: Number(r.seconds), source: r.source,
      rate_gpm: r.rate_gpm_snapshot, shares: lineSectors.filter((x) => x.line_id === r.line_id), note: r.note,
    }))
    .sort((a, b) => a.start_ms - b.start_ms);
  const readings = raw.reservoir_readings.map((r) => ({ ...r, gal: D(r.gal), at_ms: wall(r.at_iso) })).sort((a, b) => a.at_ms - b.at_ms);
  return {
    farm, sectors, lines, lineSectors, reservoirs, stagesByCrop, cropNames, rules, runs, readings,
    history: raw.weather_history, scenarios: raw.weather_scenarios,
    demoStartMs: wall(`${farm.demo_date}T${farm.demo_time}:00`),
  };
}

// Level = last "level" reading, plus refills, minus run volume drawn after that reading.
export function levelAt(rid, ms, { readings, runs, lines, reservoirs }) {
  const res = reservoirs.find((r) => r.id === rid);
  const lineIds = new Set(lines.filter((l) => l.reservoir_id === rid).map((l) => l.id));
  const base = readings.filter((x) => x.reservoir_id === rid && x.kind === 'level' && x.at_ms <= ms).at(-1);
  let lvl = base ? base.gal : D(0);
  const from = base ? base.at_ms : -Infinity;
  for (const x of readings) if (x.reservoir_id === rid && x.kind === 'refill' && x.at_ms > from && x.at_ms <= ms) lvl = lvl.plus(x.gal);
  for (const r of runs) if (lineIds.has(r.line_id) && r.start_ms > from && r.start_ms <= ms) lvl = lvl.minus(r.volume_gal);
  return Decimal.min(res.capacity_gal, Decimal.max(0, lvl));
}

export function planCtx(seed, lines) {
  return {
    sectors: seed.sectors, lines, lineSectors: seed.lineSectors, reservoirs: seed.reservoirs,
    stagesByCrop: seed.stagesByCrop, rules: seed.rules,
  };
}
