import { html, useStore, ui, Icon, Chip, Seg, Big } from './common.js';
import { SCENARIOS } from '../lib/store.js';
import { D, num } from '../lib/units.js';
import { fmtDay, fmtTime } from '../lib/dates.js';

const KIND = { today: 'Today', forecast: 'Forecast', typical: 'Typical' };

function Item({ it }) {
  const { s, d, f } = useStore();
  const line = d.lines.find((l) => l.id === it.line_id);
  const sectors = s.seed.lineSectors.filter((x) => x.line_id === it.line_id).map((x) => s.seed.sectors.find((z) => z.id === x.sector_id).name).join(' + ');
  const nextDay = new Date(it.end_ms).getUTCDate() !== new Date(it.start_ms).getUTCDate();
  const short = it.shortfall_gal.gt(0);
  return html`<button type="button" class=${'item' + (short ? ' short' : '')} onClick=${() => ui.open({ type: 'why', item: it })}
      aria-label=${`${line.name}, ${fmtTime(it.start_ms)}, ${f.duration(it.minutes)}, ${f.vol(it.gallons)}. Show why`}>
    <div class="grow">
      <div class="row" style="justify-content:space-between;align-items:baseline"><span class="big">${line.name}</span><span class="big">${f.volShort(it.gallons)}</span></div>
      <div class="small muted">${sectors}</div>
      <div style="margin-top:4px"><b>${fmtTime(it.start_ms)}</b> <span class="muted">· ${f.duration(it.minutes)}${nextDay ? ', ends next day' : ''}</span></div>
      <div class="row wrap" style="margin-top:6px;gap:6px">
        ${it.staggered && html`<${Chip} kind="info" icon="wait">Waits for its turn<//>`}
        ${short && html`<${Chip} kind="crit" icon="alert">Short by ${f.vol(it.shortfall_gal)}<//>`}
      </div>
    </div>
    <${Icon} name="chev" />
  </button>`;
}

export function Plan() {
  const { s, d, a, f } = useStore();
  const days = d.plan.days;
  const items = days.flatMap((x) => x.items);
  const total = items.reduce((acc, i) => acc.plus(i.gallons), D(0));
  const short = items.filter((i) => i.shortfall_gal.gt(0));
  return html`<div class="stack-lg">
    <div class="page-title"><div><h1>30-day plan</h1><p class="muted">${SCENARIOS[s.scenario].hint}</p></div>
      <${Seg} label="Weather scenario" value=${s.scenario} options=${Object.entries(SCENARIOS).map(([value, v]) => ({ value, label: v.label }))} onChange=${a.setScenario} /></div>
    <div class="grid kpis">
      <div class="card kpi"><div class="label">Runs planned</div><div class="value">${items.length}</div></div>
      <div class="card kpi"><div class="label">Water planned</div><div class="value"><${Big} text=${f.volShort(total)} /></div></div>
      <div class="card kpi"><div class="label">Rain days skipped</div><div class="value">${days.filter((x) => x.rain_skip).length}</div></div>
      <div class="card kpi"><div class="label">Runs short of water</div><div class="value">${short.length}</div><div class="sub">${short.length ? `First on ${fmtDay(short[0].date)}` : 'Reservoirs cover the plan'}</div></div>
    </div>
    <section class="card" aria-label="Plan by day">
      ${days.map((x) => html`<div class=${'day' + (x.items.length ? '' : ' quiet')} key=${x.date}>
        <div class="day-head">
          <b>${x.offset === 0 ? 'Today' : fmtDay(x.date)}</b>
          ${x.kind !== 'today' && html`<${Chip} kind=${x.kind === 'typical' ? '' : 'info'}>${KIND[x.kind]}<//>`}
          <span class="muted small"><${Icon} name="rain" size=${16} /> ${f.depth(x.weather.rain)} · ET ${f.depth(x.weather.et0)} · ${x.weather.temp.toString()}°F</span>
          ${x.rain_skip && html`<${Chip} kind="info" icon="rain">Rain: irrigation skipped<//>`}
          ${!x.items.length && !x.rain_skip && html`<span class="muted small">No irrigation needed</span>`}
        </div>
        ${x.items.map((it) => html`<${Item} key=${it.line_id} it=${it} />`)}
      </div>`)}
    </section>
    <p class="small muted">Days marked <b>Typical</b> use historical averages because forecasts do not reach that far. Tap any run to see the working.</p>
  </div>`;
}
