import { html, useState, useStore, ui, Icon, Gauge, Chip, Big, SECTOR_SLOT } from './common.js';
import { StackedBars, RainStrip } from './charts.js';
import { addDays, dayOf, dateMs } from '../lib/planner.js';
import { fmtMonthDay, fmtDay, fmtTime, fmtWeekday } from '../lib/dates.js';
import { D, num } from '../lib/units.js';
import { AlertList } from './sheets.js';

export function usageDays(store, s, d, n = 14) {
  const out = [];
  const history = Object.fromEntries(s.seed.history.map((r) => [Number(r.day_offset), Number(r.rain_in)]));
  for (let o = 1 - n; o <= 0; o++) {
    const date = addDays(d.today, o);
    const sum = store.summarize(s.runs.filter((r) => dayOf(r.start_ms) === date));
    const parts = s.seed.sectors.map((sec) => ({ id: sec.id, name: sec.name, color: `var(--${SECTOR_SLOT[sec.id]})`, gal: sum.bySector[sec.id].gal.toNumber() }));
    const offFromDemo = Math.round((dateMs(date) - dateMs(s.seed.farm.demo_date)) / 86400000);
    out.push({ date, label: fmtMonthDay(date), long: fmtDay(date), parts, total: sum.total.toNumber(), rain: history[offFromDemo] ?? 0 });
  }
  return out;
}

export function ReservoirCard({ res }) {
  const { s, d, f } = useStore();
  const level = d.levels[res.id];
  const pct = level.div(res.capacity_gal).mul(100);
  const low = pct.lt(s.seed.rules.low_reservoir_pct);
  const avg = d.avgDaily[res.id];
  const daysLeft = avg.gt(0) ? level.div(avg) : null;
  const lines = d.lines.filter((l) => l.reservoir_id === res.id);
  return html`<div class="stack">
    <div class="row wrap" style="justify-content:space-between">
      <h3>${res.name}</h3>
      ${low ? html`<${Chip} kind="crit" icon="alert">Low<//>` : html`<${Chip} kind="good" icon="check">OK<//>`}
    </div>
    <div class="row" style="align-items:baseline;gap:12px"><span class="pct">${num(pct, 0)}%</span><span class="muted small">${f.vol(level)} of ${f.vol(res.capacity_gal)}</span></div>
    <${Gauge} pct=${pct.toNumber()} low=${low} label=${`${res.name} level`} />
    <p class="small muted">${daysLeft ? `About ${num(daysLeft, 0)} days left at recent use, without refills.` : 'No recent use.'}</p>
    <p class="small muted">Max outflow ${f.rate(res.max_outflow_gpm)} · ${lines.map((l) => l.name).join(', ')}</p>
  </div>`;
}

export function Dashboard() {
  const { s, d, f, store } = useStore();
  const [asTable, setAsTable] = useState(false);
  const days = usageDays(store, s, d, 14);
  const week = D(d.weekUse);
  const fortnight = store.summarize(store.range(14));
  const next = d.plan.days.flatMap((x) => x.items)[0];
  const lineName = (id) => d.lines.find((l) => l.id === id).name;
  const attention = d.alerts.filter((a) => a.level !== 'info').length;
  const upcoming = d.plan.days.slice(0, 7);

  return html`<div class="stack-lg">
    <div class="page-title"><h1>Dashboard</h1><span class="muted small">Last 14 days to ${fmtDay(d.today)}</span></div>

    <div class="grid kpis">
      <div class="card kpi"><div class="label">Used, last 7 days</div><div class="value"><${Big} text=${f.volShort(week)} /></div><div class="sub">${f.volShort(week.div(7))} per day</div></div>
      <div class="card kpi"><div class="label">Used, last 14 days</div><div class="value"><${Big} text=${f.volShort(fortnight.total)} /></div><div class="sub">${fortnight.count} runs logged</div></div>
      <div class="card kpi"><div class="label">Next irrigation</div>
        <div class="value" style="font-size:1.35rem">${next ? lineName(next.line_id) : 'None planned'}</div>
        <div class="sub">${next ? `${next.date === d.today ? 'Due today' : fmtDay(next.date)}, ${fmtTime(next.start_ms)}` : 'Nothing in 30 days'}</div></div>
      <button class="card kpi btnlike" type="button" onClick=${() => ui.open('alerts')}><div class="label">Needs attention</div><div class="value">${attention}</div><div class="sub">${d.alerts.length} alerts in total. Tap to open</div></button>
    </div>

    <div class="grid dash-main">
      <section class="card" aria-labelledby="usage-h">
        <header><h2 id="usage-h">Water used per day <span class="muted small">(${f.volUnit})</span></h2>
          <button class="link no-print" type="button" onClick=${() => setAsTable(!asTable)}>${asTable ? 'Show chart' : 'Show as table'}</button></header>
        ${asTable
          ? html`<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Day</th>${s.seed.sectors.map((x) => html`<th class="r">${x.name}</th>`)}<th class="r">Total</th><th class="r">Rain</th></tr></thead>
              <tbody>${days.map((x) => html`<tr><td>${x.long}</td>${x.parts.map((p) => html`<td class="r">${f.volShort(p.gal)}</td>`)}<td class="r"><b>${f.volShort(x.total)}</b></td><td class="r">${f.depth(x.rain)}</td></tr>`)}</tbody></table></div>`
          : html`<div class="legend">${s.seed.sectors.map((x) => html`<span><i class="dot" style=${`background:var(--${SECTOR_SLOT[x.id]})`}></i>${x.name}</span>`)}</div>
              <${StackedBars} days=${days} f=${f} ariaLabel="Water used per day, stacked by sector" />
              <${RainStrip} days=${days} f=${f} />`}
      </section>

      <section class="card stack" aria-labelledby="res-h">
        <header style="margin-bottom:0"><h2 id="res-h">Reservoirs</h2></header>
        ${s.seed.reservoirs.map((r, i) => html`<div style=${i ? 'border-top:1px solid var(--line);padding-top:16px' : ''}><${ReservoirCard} res=${r} /></div>`)}
      </section>
    </div>

    <section class="card" aria-labelledby="week-h">
      <header><h2 id="week-h">Next 7 days</h2><a class="link" href="#/plan">Open the 30-day plan</a></header>
      <div class="strip">
        ${upcoming.map((x) => {
          const mins = x.items.reduce((a, i) => a.plus(i.minutes), D(0));
          return html`<a class=${'daychip' + (x.items.length ? ' irr' : '')} href="#/plan" style="text-decoration:none;color:inherit">
            <b>${x.offset === 0 ? 'Today' : fmtWeekday(x.date)}</b><span class="muted">${fmtMonthDay(x.date)}</span>
            <span><${Icon} name="rain" size=${16} /> ${f.depth(x.weather.rain)}</span>
            <span>${x.items.length ? `${x.items.length} run${x.items.length > 1 ? 's' : ''}, ${num(mins.div(60), 1, true)} h` : x.rain_skip ? 'Skip: rain' : 'No irrigation'}</span>
          </a>`;
        })}
      </div>
    </section>

    <div class="grid dash-bottom">
      <section class="card" aria-labelledby="line-h">
        <header><h2 id="line-h">Use by line, last 14 days</h2><a class="link" href="#/report">Full report</a></header>
        <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Line</th><th class="r">Rate</th><th class="r">Time run</th><th class="r">Used</th></tr></thead>
          <tbody>${d.lines.map((l) => {
            const t = fortnight.byLine[l.id];
            return html`<tr><td>${l.name}</td><td class="r">${f.rate(l.rate_gpm)}</td><td class="r">${f.duration(t.seconds / 60)}</td><td class="r">${f.volShort(t.gal)}</td></tr>`;
          })}</tbody>
          <tfoot><tr><td colSpan="3">Total</td><td class="r">${f.volShort(fortnight.total)}</td></tr></tfoot></table></div>
      </section>
      <section class="card" aria-labelledby="al-h">
        <header><h2 id="al-h">Alerts</h2><button class="link" type="button" onClick=${() => ui.open('alerts')}>See all</button></header>
        <${AlertList} alerts=${d.alerts.slice(0, 3)} />
      </section>
    </div>
  </div>`;
}
