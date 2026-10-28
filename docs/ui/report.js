import { html, useState, useStore, Icon, Chip, Seg, Formula, Big, sectorColor } from './common.js';
import { fmtDay, fmtDayTime } from '../lib/dates.js';
import { D, num } from '../lib/units.js';

const RANGES = { 7: 'Last 7 days', 14: 'Last 14 days', 0: 'All demo history' };
const RANGE_OPTS = [{ value: 7, label: '7 days' }, { value: 14, label: '14 days' }, { value: 0, label: 'All history' }];

function RunLine({ run, f, lineName, share }) {
  return html`<div class="run-line stack" style="margin:0">
    <div class="row wrap" style="justify-content:space-between"><b>${fmtDayTime(run.start_ms)}</b>
      <span class="row" style="gap:6px"><${Chip}>${run.source === 'manual' ? 'Logged afterwards' : 'Timer'}<//>${run.flags.includes('overlap') && html`<${Chip} kind="warn" icon="alert">Overlap<//>`}</span></div>
    <div class="small muted">${lineName} · run ${run.id}${share ? ` · ${share.toString()}% of this run goes to this sector` : ''}</div>
    <${Formula} rate=${f.rate(run.rate_gpm)} minutes=${f.minutes(D(run.seconds).div(60))} volume=${f.vol(run.volume_gal)} />
  </div>`;
}

export function Report() {
  const { s, d, f, store } = useStore();
  const [range, setRange] = useState(14);
  const [tab, setTab] = useState('line');
  const [open, setOpen] = useState({});
  const runs = store.range(range);
  const sum = store.summarize(runs);
  const seconds = runs.reduce((a, r) => a + r.seconds, 0);
  const toggle = (k) => setOpen({ ...open, [k]: !open[k] });
  const lineBy = Object.fromEntries(d.lines.map((l) => [l.id, l]));
  const rows = tab === 'line'
    ? d.lines.map((l) => ({ key: l.id, name: l.name, sub: f.rate(l.rate_gpm), t: sum.byLine[l.id], runs: sum.byLine[l.id].runs.map((r) => ({ run: r })) }))
    : tab === 'sector'
      ? s.seed.sectors.map((x) => ({ key: x.id, name: x.name, sub: f.area(x.area_ac), color: sectorColor(x.id), t: sum.bySector[x.id], runs: sum.bySector[x.id].runs.map(({ run, gal }) => ({ run, share: run.shares.find((z) => z.sector_id === x.id).share_pct, gal })) }))
      : s.seed.reservoirs.map((r) => ({ key: r.id, name: r.name, sub: `capacity ${f.vol(r.capacity_gal)}`, t: sum.byRes[r.id], runs: sum.byRes[r.id].runs.map((run) => ({ run })) }));
  const secOf = (t) => (t.seconds != null ? t.seconds : t.runs.reduce((a, x) => a + (x.run ? x.run.seconds : x.seconds), 0));
  const first = runs[0], last = runs.at(-1);
  return html`<div class="stack-lg">
    <div class="page-title no-print"><div><h1>Report</h1><p class="muted">Totals are summed from the individual runs.</p></div>
      <button class="btn primary" type="button" onClick=${() => window.print()}><${Icon} name="print" /> Export PDF</button></div>

    <div class="print-only"><h1>${s.seed.farm.name}: water use report</h1>
      <p>${RANGES[range]}${first ? `, ${fmtDay(first.start_ms)} to ${fmtDay(last.start_ms)}` : ''}. Units: ${f.volUnit}. Demo data, not real field readings.</p></div>

    <div class="row wrap no-print"><${Seg} label="Date range" value=${range} options=${RANGE_OPTS} onChange=${setRange} /></div>

    <div class="grid kpis">
      <div class="card kpi"><div class="label">Total water used</div><div class="value"><${Big} text=${f.vol(sum.total)} /></div></div>
      <div class="card kpi"><div class="label">Runs</div><div class="value">${sum.count}</div></div>
      <div class="card kpi"><div class="label">Time run</div><div class="value" style="font-size:1.4rem">${f.duration(seconds / 60)}</div></div>
      <div class="card kpi"><div class="label">Reservoir draw</div><div class="sub" style="font-size:.95rem;color:var(--ink);font-weight:650">${s.seed.reservoirs.map((r) => html`<div>${r.name}: ${f.volShort(sum.byRes[r.id].gal)}</div>`)}</div></div>
    </div>

    <section class="card">
      <div class="no-print" style="margin-bottom:8px"><${Seg} label="Group by" value=${tab} options=${[{ value: 'line', label: 'By line' }, { value: 'sector', label: 'By sector' }, { value: 'res', label: 'By reservoir' }]} onChange=${setTab} /></div>
      ${rows.map((r) => {
        const k = tab + r.key;
        return html`<div class="rep-row" key=${k}>
          <button type="button" aria-expanded=${!!open[k]} onClick=${() => toggle(k)}>
            <span class="row" style="gap:8px">${r.color && html`<i class="dot" style=${`background:${r.color}`}></i>`}<b>${r.name}</b><span class="muted small">${r.sub}</span></span>
            <span class="right"><b>${f.vol(r.t.gal)}</b></span>
            <span class="small muted">${r.runs.length} run${r.runs.length === 1 ? '' : 's'}${tab !== 'sector' ? ` · ${f.duration(r.t.seconds / 60)}` : ''}</span>
            <span class="small muted right no-print">${open[k] ? 'Hide runs' : 'Show runs and formulas'}</span>
          </button>
          <div class="runs" style=${open[k] ? '' : 'display:none'}>
            ${r.runs.length ? r.runs.map(({ run, share, gal }) => html`<${RunLine} key=${run.id} run=${run} f=${f} lineName=${lineBy[run.line_id].name} share=${share} />`) : html`<p class="muted small">No runs in this range.</p>`}
          </div>
        </div>`;
      })}
      <div class="row" style="justify-content:space-between;border-top:1.5px solid var(--ink-3);padding:12px 4px 0"><b>Total</b><b>${f.vol(sum.total)}</b></div>
    </section>
    <p class="small muted">Values are rounded for display only. Totals use unrounded volumes, so a row can differ from a hand-added total by a rounding step. Volume = rate × minutes for every run.</p>
  </div>`;
}
