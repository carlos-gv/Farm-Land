// In-memory app state and the staged demo actions. Nothing is persisted: reload = reset.
// No DOM access here, so it can be imported from node tests.
import { D } from './units.js';
import { makeRun, runEndMs, sumGal } from './runs.js';
import { levelAt, planCtx } from './data.js';
import { buildPlan, DAY_MS, dayOf, addDays, dateMs } from './planner.js';
import { summarize } from './report.js';
import { DEFAULT_PREFS, vol, rate as fmtRate, duration } from './units.js';
import { fmtDay, fmtTime } from './dates.js';

export const SCENARIOS = {
  normal: { label: 'Normal', hint: 'Typical July: a few light showers' },
  heatwave: { label: 'Heatwave', hint: '98°F, no rain for 10 days' },
  heavy: { label: 'Heavy rain', hint: 'Storms in the next two weeks' },
};

const freshState = (seed) => ({
  seed,
  prefs: { ...DEFAULT_PREFS },
  scenario: 'normal',
  speed: 60,
  offline: false,
  pending: 0,
  sync: 'synced',
  lastSynced: 0,
  baseMs: seed.demoStartMs,
  accrued: 0,
  running: {},
  runs: seed.runs,
  readings: seed.readings,
  lineVersions: Object.fromEntries(seed.lines.map((l) => [l.id, [{ v: 1, rate_gpm: l.rate_gpm, effective_ms: seed.demoStartMs - 30 * DAY_MS, by: 'Owner', note: 'Initial setup' }]])),
  nextId: 1,
  toast: null,
  version: 0,
});

export function createStore(seed) {
  let state = freshState(seed);
  let lastTick = 0;
  let cache = { key: null, value: null };
  const subs = new Set();
  const nowFn = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const emit = () => { state = { ...state, version: state.version + 1 }; subs.forEach((f) => f()); };
  const set = (patch) => { state = { ...state, ...patch }; emit(); };
  const nowMs = () => state.baseMs + state.accrued;
  const anyRunning = () => Object.keys(state.running).length > 0;

  function tick() {
    const t = nowFn();
    if (anyRunning() && lastTick) state = { ...state, accrued: state.accrued + (t - lastTick) * state.speed };
    lastTick = t;
  }
  const currentLines = (s = state) => s.seed.lines.map((l) => ({ ...l, rate_gpm: s.lineVersions[l.id].at(-1).rate_gpm }));
  const queue = () => { if (state.offline) state = { ...state, pending: state.pending + 1 }; };
  const toast = (msg) => { state = { ...state, toast: { msg, id: Math.random() } }; };

  function overlapFlag(line_id, start, end) {
    return state.runs.some((r) => r.line_id === line_id && r.start_ms < end && runEndMs(r) > start) ? ['overlap'] : [];
  }

  const actions = {
    startRun(line_id) {
      if (state.running[line_id]) return;
      tick();
      state = { ...state, running: { ...state.running, [line_id]: { start_ms: nowMs() } } };
      emit();
    },
    stopRun(line_id) {
      const r = state.running[line_id];
      if (!r) return null;
      tick();
      const seconds = Math.max(1, Math.round((nowMs() - r.start_ms) / 1000));
      const run = actions._record({ line_id, start_ms: r.start_ms, seconds, source: 'timer' });
      const { [line_id]: _, ...rest } = state.running;
      state = { ...state, running: rest };
      toast(`Run saved: ${vol(run.volume_gal, state.prefs)}`);
      emit();
      return run;
    },
    _record({ line_id, start_ms, seconds, source, note = '' }) {
      const line = currentLines().find((l) => l.id === line_id);
      const shares = state.seed.lineSectors.filter((x) => x.line_id === line_id);
      const run = makeRun({
        id: 'u' + String(state.nextId).padStart(3, '0'), line_id, start_ms, seconds, source, rate_gpm: line.rate_gpm,
        shares, note, flags: overlapFlag(line_id, start_ms, start_ms + seconds * 1000),
      });
      state = { ...state, runs: [...state.runs, run].sort((a, b) => a.start_ms - b.start_ms), nextId: state.nextId + 1 };
      queue();
      return run;
    },
    logRun({ line_id, date, time, minutes, takenGal }) {
      const secs = Math.round(Number(minutes) * 60);
      if (!(secs > 0)) return { error: 'Enter a duration above 0 minutes.' };
      const start_ms = dateMs(date, time);
      if (start_ms > nowMs()) return { error: 'The run must start before the demo time now.' };
      const run = actions._record({ line_id, start_ms, seconds: secs, source: 'manual', note: 'Logged afterwards' });
      if (takenGal !== '' && takenGal != null && Number(takenGal) > 0) {
        const line = currentLines().find((l) => l.id === line_id);
        state = { ...state, readings: [...state.readings, { reservoir_id: line.reservoir_id, kind: 'withdrawal_confirmation', gal: D(takenGal), at_ms: start_ms + secs * 1000, note: 'Farmer measured drop', ref_run: run.id }] };
      }
      toast(`Run logged: ${vol(run.volume_gal, state.prefs)}`);
      emit();
      return { run };
    },
    editLineRate(line_id, rate) {
      const r = D(rate);
      if (!r.gt(0)) return { error: 'Enter a rate above 0.' };
      const list = state.lineVersions[line_id];
      if (r.eq(list.at(-1).rate_gpm)) return { error: 'The rate is unchanged.' };
      const v = { v: list.length + 1, rate_gpm: r, effective_ms: nowMs(), by: 'Owner (you)', note: 'Rate changed' };
      state = { ...state, lineVersions: { ...state.lineVersions, [line_id]: [...list, v] } };
      queue();
      toast(`Saved as version ${v.v}. Past runs keep the rate they ran at.`);
      emit();
      return { version: v };
    },
    addReading({ reservoir_id, kind, gal }) {
      const g = D(gal);
      if (!g.gt(0) && kind !== 'level') return { error: 'Enter an amount above 0.' };
      if (g.lt(0)) return { error: 'Enter a positive amount.' };
      const note = kind === 'refill' ? 'Refill added' : 'Gauge reading';
      state = { ...state, readings: [...state.readings, { reservoir_id, kind, gal: g, at_ms: nowMs(), note, ref_run: '' }].sort((a, b) => a.at_ms - b.at_ms) };
      queue();
      toast(kind === 'refill' ? 'Refill added' : 'Level reading saved');
      emit();
      return {};
    },
    setScenario: (scenario) => set({ scenario }),
    setPref: (k, v) => set({ prefs: { ...state.prefs, [k]: v } }),
    setSpeed: (speed) => { tick(); set({ speed }); },
    setOffline(offline) {
      if (offline === state.offline) return;
      if (offline) { set({ offline: true, sync: 'offline' }); return; }
      const n = state.pending;
      set({ offline: false, sync: 'syncing' });
      setTimeout(() => {
        state = { ...state, sync: 'synced', pending: 0, lastSynced: n };
        toast(n ? `Synced. ${n} change${n === 1 ? '' : 's'} uploaded (simulated).` : 'Back online. Nothing to upload.');
        emit();
      }, 1500);
    },
    clearToast: () => set({ toast: null }),
    reset() { state = freshState(seed); cache = { key: null, value: null }; lastTick = 0; emit(); },
    tick() { if (anyRunning()) { tick(); emit(); } else tick(); },
  };

  function derive() {
    const key = [state.scenario, state.runs.length, state.readings.length, Object.values(state.lineVersions).map((v) => v.length).join(''), Math.floor(nowMs() / 3600000)].join('|');
    if (cache.key === key) return cache.value;
    const now = nowMs();
    const lines = currentLines();
    const ctx = planCtx(seed, lines);
    const env = { readings: state.readings, runs: state.runs, lines, reservoirs: seed.reservoirs };
    const levels = Object.fromEntries(seed.reservoirs.map((r) => [r.id, levelAt(r.id, now, env)]));
    const plan = buildPlan({
      ctx, demoDate: seed.farm.demo_date, history: seed.history,
      scenarioRows: seed.scenarios.filter((r) => r.scenario === state.scenario), runs: state.runs, levels0: levels,
    });
    const week = state.runs.filter((r) => r.start_ms > now - 7 * DAY_MS);
    const weekUse = sumGal(week);
    const avgDaily = Object.fromEntries(seed.reservoirs.map((res) => {
      const ids = new Set(lines.filter((l) => l.reservoir_id === res.id).map((l) => l.id));
      return [res.id, sumGal(week.filter((r) => ids.has(r.line_id))).div(7)];
    }));
    const value = { lines, ctx, levels, plan, weekUse, avgDaily, now, today: dayOf(now) };
    value.alerts = buildAlerts(state, value);
    cache = { key, value };
    return value;
  }

  function buildAlerts(s, d) {
    const out = [];
    const sectorsOf = (lineId) => s.seed.lineSectors.filter((x) => x.line_id === lineId).map((x) => s.seed.sectors.find((z) => z.id === x.sector_id).name).join(' + ');
    const lineName = (id) => d.lines.find((l) => l.id === id).name;
    const today = d.plan.days[0];
    for (const it of today.items) {
      out.push({
        id: 'due-' + it.line_id, kind: 'due', level: 'action', line_id: it.line_id,
        title: `Irrigate ${lineName(it.line_id)} today`,
        body: `${fmtTime(it.start_ms)} for ${duration(it.minutes)}, about ${vol(it.gallons, s.prefs)} (${sectorsOf(it.line_id)}).`,
      });
    }
    for (const r of s.seed.reservoirs) {
      const pct = d.levels[r.id].div(r.capacity_gal).mul(100);
      if (pct.lt(s.seed.rules.low_reservoir_pct)) out.push({ id: 'low-' + r.id, kind: 'low', level: 'warn', title: `${r.name} is low`, body: `${pct.toFixed(0)}% full. About ${(d.levels[r.id].div(d.avgDaily[r.id].gt(0) ? d.avgDaily[r.id] : 1)).toFixed(0)} days left at recent use.` });
    }
    const short = d.plan.days.flatMap((x) => x.items).find((i) => i.shortfall_gal.gt(0));
    if (short) {
      const res = s.seed.reservoirs.find((r) => r.id === short.reservoir_id);
      out.push({ id: 'short', kind: 'shortfall', level: 'warn', title: `${res.name} can't cover the plan`, body: `On ${fmtDay(short.date)}, ${lineName(short.line_id)} needs ${vol(short.gallons, s.prefs)} but only ${vol(short.gallons.minus(short.shortfall_gal), s.prefs)} is left. Add a refill or reduce use.` });
    }
    const rainDay = d.plan.days.find((x) => x.offset > 0 && x.offset <= 16 && x.rain_skip);
    if (rainDay) out.push({ id: 'rain', kind: 'rain', level: 'info', title: `Rain expected ${fmtDay(rainDay.date)}`, body: `${rainDay.weather.rain.toString()} in forecast. Irrigation is skipped that day.` });
    const stag = d.plan.days.flatMap((x) => x.items).filter((i) => i.staggered).length;
    if (stag) out.push({ id: 'stagger', kind: 'stagger', level: 'info', title: 'Some lines wait their turn', body: `${stag} planned runs start later so a reservoir stays under its max outflow.` });
    for (const res of s.seed.reservoirs) {
      const live = d.lines.filter((l) => l.reservoir_id === res.id && s.running[l.id]).reduce((a, l) => a.plus(l.rate_gpm), D(0));
      if (live.gt(res.max_outflow_gpm)) out.push({ id: 'flow-' + res.id, kind: 'flow', level: 'warn', title: `${res.name} flow limit exceeded`, body: `Running lines use ${fmtRate(live, s.prefs)}; the limit is ${fmtRate(res.max_outflow_gpm, s.prefs)}.` });
    }
    for (const r of s.runs.filter((x) => x.flags.includes('overlap'))) out.push({ id: 'ov-' + r.id, kind: 'overlap', level: 'warn', title: `Overlapping runs on ${lineName(r.line_id)}`, body: `A run on ${fmtDay(r.start_ms)} overlaps another run on the same line. Both are kept.` });
    return out;
  }

  const range = (days) => {
    const now = nowMs();
    return days ? state.runs.filter((r) => r.start_ms > now - days * DAY_MS) : state.runs;
  };

  return {
    getState: () => state,
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    derive, actions, nowMs, range,
    summarize: (runs) => summarize(runs, { lines: currentLines(), sectors: seed.sectors, reservoirs: seed.reservoirs }),
    runSecondsLive: (line_id) => { const r = state.running[line_id]; return r ? (nowMs() - r.start_ms) / 1000 : 0; },
  };
}
export { addDays };
