// 30-day irrigation planner. Pure functions, no UI. Simplified FAO-56 style water balance:
//   ETc = ET0 x Kc(stage);  deficit += ETc - effective rain - irrigation applied;
//   when the deficit reaches the minimum application, irrigate (capped), then convert
//   depth -> volume -> run minutes per line, stagger by reservoir outflow, and track levels.
import { D, Decimal, ACRE_INCH_GAL } from './units.js';

export const DAY_MS = 86400000;
export const dateMs = (dateStr, hm = '00:00') => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = hm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm);
};
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
export const addDays = (dateStr, n) => dayOf(dateMs(dateStr) + n * DAY_MS);

export function stageFor(stages, gdd) {
  const g = Number(gdd);
  return (
    stages.find((s) => g >= Number(s.min_gdd) && g <= Number(s.max_gdd)) ||
    (g < Number(stages[0].min_gdd) ? stages[0] : stages[stages.length - 1])
  );
}

const gainOf = (w) => Decimal.max(0, w.temp.minus(50)).toNumber();

function findStart(occ, earliest, dur, rate, limit) {
  const cands = [earliest, ...occ.filter((o) => o.end > earliest).map((o) => o.end)].sort((a, b) => a - b);
  for (const c of cands) {
    const pts = [c, ...occ.filter((o) => o.start > c && o.start < c + dur).map((o) => o.start)];
    const ok = pts.every(
      (t) => occ.filter((o) => o.start <= t && o.end > t).reduce((a, o) => a + o.rate, 0) + rate <= limit
    );
    if (ok) return c;
  }
  return cands[cands.length - 1];
}

// days: [{offset, date, kind, weather:{rain,et0,temp}, gdd:{sectorId:n}, credits:{sectorId:Decimal inches}}]
export function simulate({ ctx, days, deficits, levels = null, doPlan = true }) {
  const { rules } = ctx;
  const sectorBy = Object.fromEntries(ctx.sectors.map((s) => [s.id, s]));
  const lineBy = Object.fromEntries(ctx.lines.map((l) => [l.id, l]));
  const resBy = Object.fromEntries(ctx.reservoirs.map((r) => [r.id, r]));
  const def = { ...deficits };
  const lv = levels ? { ...levels } : null;
  const occupied = {};
  const lineFree = {};
  const out = [];

  for (const day of days) {
    const { rain, et0 } = day.weather;
    const rainSkip = rain.gte(rules.rain_skip_in);
    const effRain = rain.lt(rules.eff_rain_min_in) ? D(0) : Decimal.min(rain, rules.eff_rain_cap_in);
    const info = {};

    for (const s of ctx.sectors) {
      const st = stageFor(ctx.stagesByCrop[s.crop_id], day.gdd[s.id]);
      const etc = et0.mul(st.kc);
      def[s.id] = Decimal.max(0, def[s.id].plus(etc).minus(effRain).minus(day.credits?.[s.id] ?? 0));
      info[s.id] = { stage: st.stage, sensitivity: st.sensitivity, kc: D(st.kc), etc, eff_rain: effRain, deficit_in: def[s.id] };
    }

    const items = {};
    const notes = [];
    if (doPlan) {
      for (const s of ctx.sectors) {
        const d0 = def[s.id];
        if (d0.lt(rules.min_application_in)) continue;
        if (rainSkip) { notes.push({ kind: 'rain_skip', sector_id: s.id, rain, deficit_in: d0 }); continue; }
        const links = ctx.lineSectors.filter((l) => l.sector_id === s.id);
        if (!links.length) continue;
        const apply = Decimal.min(d0, rules.max_application_in);
        const net = apply.mul(s.area_ac).mul(ACRE_INCH_GAL);
        const sumW = links.reduce((a, l) => a.plus(lineBy[l.line_id].rate_gpm.mul(l.share_pct).div(100)), D(0));
        for (const l of links) {
          const line = lineBy[l.line_id];
          const mins = net.div(sumW.mul(line.eff)).ceil();
          const it = (items[line.id] ??= { line_id: line.id, reservoir_id: line.reservoir_id, minutes: D(0), why: [] });
          it.minutes = it.minutes.plus(mins);
          it.why.push({
            sector_id: s.id, ...info[s.id], rain, et0, deficit_in: d0, apply_in: apply, net_gal: net,
            sum_w_gpm: sumW, eff: line.eff, minutes_add: mins, gdd: day.gdd[s.id],
          });
          for (const k of ctx.lineSectors.filter((x) => x.line_id === line.id)) {
            const sec = sectorBy[k.sector_id];
            const credit = line.rate_gpm.mul(mins).mul(k.share_pct).div(100).mul(line.eff).div(sec.area_ac.mul(ACRE_INCH_GAL));
            def[k.sector_id] = Decimal.max(0, def[k.sector_id].minus(credit));
          }
        }
      }
    }

    if (lv && day.offset >= 1) {
      for (const r of ctx.reservoirs) lv[r.id] = Decimal.min(r.capacity_gal, lv[r.id].plus(r.inflow_gpd));
    }

    const dayStart = dateMs(day.date, rules.start_time);
    const list = Object.values(items).sort((a, b) => a.line_id.localeCompare(b.line_id));
    for (const it of list) {
      const line = lineBy[it.line_id];
      const res = resBy[it.reservoir_id];
      const dur = it.minutes.toNumber() * 60000;
      const rate = line.rate_gpm.toNumber();
      const limit = res.max_outflow_gpm.toNumber();
      const occ = (occupied[res.id] ??= []);
      const earliest = Math.max(dayStart, lineFree[line.id] ?? 0);
      const start = findStart(occ, earliest, dur, rate, limit);
      it.staggered = start > earliest;
      if (it.staggered) {
        const waits = [...new Set(occ.filter((o) => o.end > earliest && o.start < start).map((o) => o.name))];
        it.stagger_reason = `Starts after ${waits.join(' and ')} so ${res.name} stays under ${limit} gpm`;
      }
      it.exceeds_limit = rate > limit;
      occ.push({ start, end: start + dur, rate, name: line.name });
      lineFree[line.id] = start + dur;
      Object.assign(it, { date: day.date, start_ms: start, end_ms: start + dur, rate_gpm: line.rate_gpm, gallons: line.rate_gpm.mul(it.minutes) });
      it.shortfall_gal = D(0);
      if (lv) {
        const have = lv[res.id];
        if (it.gallons.gt(have)) { it.shortfall_gal = it.gallons.minus(have); lv[res.id] = D(0); }
        else lv[res.id] = have.minus(it.gallons);
        it.level_after = lv[res.id];
      }
    }
    list.sort((a, b) => a.start_ms - b.start_ms);

    out.push({
      offset: day.offset, date: day.date, kind: day.kind, weather: day.weather, rain_skip: rainSkip,
      sectors: Object.fromEntries(ctx.sectors.map((s) => [s.id, { ...info[s.id], deficit_after: def[s.id] }])),
      items: list, notes, levels: lv ? { ...lv } : null,
    });
  }
  return { days: out, deficits: def, levels: lv };
}

const weatherOf = (row) => ({ rain: D(row.rain_in), et0: D(row.et0_in), temp: D(row.temp_f) });

// Irrigation actually applied by logged runs, as net depth per sector per date.
export function creditsFromRuns(runs, ctx) {
  const lineBy = Object.fromEntries(ctx.lines.map((l) => [l.id, l]));
  const sectorBy = Object.fromEntries(ctx.sectors.map((s) => [s.id, s]));
  const byDate = {};
  for (const r of runs) {
    const line = lineBy[r.line_id];
    const date = dayOf(r.start_ms);
    for (const sh of r.shares) {
      const net = r.volume_gal.mul(sh.share_pct).div(100).mul(line.eff).div(sectorBy[sh.sector_id].area_ac.mul(ACRE_INCH_GAL));
      const d = (byDate[date] ??= {});
      d[sh.sector_id] = (d[sh.sector_id] ?? D(0)).plus(net);
    }
  }
  return byDate;
}

export function buildPlan({ ctx, demoDate, history, scenarioRows, runs, levels0 }) {
  const hist = Object.fromEntries(history.map((r) => [Number(r.day_offset), weatherOf(r)]));
  const scen = Object.fromEntries(scenarioRows.map((r) => [Number(r.day_offset), { w: weatherOf(r), kind: r.kind }]));
  const credits = creditsFromRuns(runs, ctx);

  const histDays = [];
  const gdd = Object.fromEntries(ctx.sectors.map((s) => [s.id, { 0: s.gdd_now }]));
  for (let off = -1; off >= -14; off--) for (const s of ctx.sectors) gdd[s.id][off] = gdd[s.id][off + 1] - gainOf(hist[off + 1]);
  for (let off = -14; off <= -1; off++) {
    const date = addDays(demoDate, off);
    histDays.push({ offset: off, date, kind: 'history', weather: hist[off], gdd: Object.fromEntries(ctx.sectors.map((s) => [s.id, gdd[s.id][off]])), credits: credits[date] });
  }
  const start = Object.fromEntries(ctx.sectors.map((s) => [s.id, D(ctx.rules.start_deficit_in)]));
  const past = simulate({ ctx, days: histDays, deficits: start, doPlan: false });

  const planDays = [];
  for (let off = 0; off <= 30; off++) {
    const date = addDays(demoDate, off);
    const w = off === 0 ? hist[0] : scen[off].w;
    if (off > 0) for (const s of ctx.sectors) gdd[s.id][off] = gdd[s.id][off - 1] + gainOf(w);
    planDays.push({
      offset: off, date, kind: off === 0 ? 'today' : scen[off].kind, weather: w,
      gdd: Object.fromEntries(ctx.sectors.map((s) => [s.id, gdd[s.id][off]])), credits: credits[date],
    });
  }
  const plan = simulate({ ctx, days: planDays, deficits: past.deficits, levels: levels0 });
  return { days: plan.days, deficitsNow: past.deficits };
}
