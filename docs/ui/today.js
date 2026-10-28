import { html, useStore, ui, Icon, Chip, Formula } from './common.js';
import { AlertList } from './sheets.js';
import { clock, fmtDay, fmtTime, fmtDayTime } from '../lib/dates.js';
import { D } from '../lib/units.js';

function LineCard({ line }) {
  const { s, d, a, f, store } = useStore();
  const running = s.running[line.id];
  const secs = running ? Math.max(0, Math.round(store.runSecondsLive(line.id))) : 0;
  const due = d.alerts.find((x) => x.kind === 'due' && x.line_id === line.id);
  const planned = d.plan.days[0].items.find((i) => i.line_id === line.id);
  const res = s.seed.reservoirs.find((r) => r.id === line.reservoir_id);
  const sectors = s.seed.lineSectors.filter((x) => x.line_id === line.id)
    .map((x) => `${s.seed.sectors.find((z) => z.id === x.sector_id).name}${x.share_pct.lt(100) ? ` ${x.share_pct.toString()}%` : ''}`).join(' + ');
  const last = [...s.runs].reverse().find((r) => r.line_id === line.id);
  return html`<article class=${'card line-card' + (running ? ' running' : '')} aria-label=${line.name}>
    <div class="row wrap" style="justify-content:space-between">
      <h3>${line.name}</h3>
      ${running ? html`<${Chip} kind="info" icon="play">Running<//>` : due ? html`<${Chip} kind="warn" icon="alert">Due now<//>` : html`<${Chip}>Idle<//>`}
    </div>
    <p class="small muted">${sectors} · ${res.name} · ${f.rate(line.rate_gpm)}</p>
    ${running
      ? html`<div class="timer" role="timer" aria-label="Elapsed time">${clock(secs)}</div>
          <${Formula} rate=${f.rate(line.rate_gpm)} minutes=${f.minutes(D(secs).div(60))} volume=${f.vol(D(line.rate_gpm).mul(secs).div(60))} />
          <button class="btn stop block" type="button" onClick=${() => a.stopRun(line.id)}><${Icon} name="stop" /> Stop and save</button>`
      : html`${planned && html`<p><b>Planned:</b> ${fmtTime(planned.start_ms)}, ${f.duration(planned.minutes)}, about ${f.vol(planned.gallons)}.</p>`}
          <button class=${'btn block ' + (due ? 'primary' : '')} type="button" onClick=${() => a.startRun(line.id)}><${Icon} name="play" /> Start ${line.name}</button>`}
    ${last && html`<p class="small muted">Last run ${fmtDayTime(last.start_ms)}: ${f.duration(D(last.seconds).div(60))}, ${f.vol(last.volume_gal)}</p>`}
  </article>`;
}

export function Today() {
  const { s, d, f } = useStore();
  const attention = d.alerts.filter((x) => x.kind === 'due' || x.level === 'warn');
  return html`<div class="stack-lg">
    <div class="page-title"><div><h1>Today</h1><p class="muted">${fmtDay(d.now)}, ${fmtTime(d.now)}</p></div>
      <button class="btn primary" type="button" onClick=${() => ui.open('log')}><${Icon} name="plus" /> Log a run</button></div>
    <div><${Chip} kind="info" icon="clock">Demo clock ${s.speed === 60 ? '60× while a line runs' : 'real time'}<//></div>
    ${attention.length ? html`<section aria-label="Due now"><${AlertList} alerts=${attention} /></section>`
      : html`<div class="alert"><${Icon} name="check" /><div><b>Nothing is due today</b><p>Enjoy the quiet. The next planned run is in the Plan tab.</p></div></div>`}
    <div class="grid cards-3" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr))">${d.lines.map((l) => html`<${LineCard} key=${l.id} line=${l} />`)}</div>
  </div>`;
}
