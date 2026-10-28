import { html, useStore, ui, Icon, Chip, sectorColor } from './common.js';
import { ReservoirCard } from './dashboard.js';

export function Farm() {
  const { s, d, f } = useStore();
  const today = d.plan.days[0];
  return html`<div class="stack-lg">
    <div class="page-title"><div><h1>Farm setup</h1><p class="muted">${s.seed.farm.name} · ${s.seed.sectors.length} sectors · ${d.lines.length} lines · ${s.seed.reservoirs.length} reservoirs</p></div></div>

    <section class="stack" aria-labelledby="sec-h"><div class="row wrap" style="justify-content:space-between"><h2 id="sec-h">Sectors</h2><span class="row"><button class="btn sm" disabled>Add sector</button><span class="notdemo">Not in demo</span></span></div>
      <div class="grid cards-3" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
        ${s.seed.sectors.map((x) => {
          const links = s.seed.lineSectors.filter((l) => l.sector_id === x.id);
          return html`<div class="card stack" key=${x.id} style=${`border-top:5px solid ${sectorColor(x.id)}`}>
            <h3>${x.name}</h3>
            <p>${f.area(x.area_ac)} · ${s.seed.cropNames[x.crop_id]}</p>
            <div><${Chip} kind=${today.sectors[x.id].sensitivity === 'CRITICAL RISK' ? 'warn' : ''}>${today.sectors[x.id].stage}<//></div>
            <p class="small muted">Watered by ${links.map((l) => `${d.lines.find((z) => z.id === l.line_id).name}${l.share_pct.lt(100) ? ` (${l.share_pct.toString()}% of its water)` : ''}`).join(', ')}</p>
          </div>`;
        })}
      </div>
    </section>

    <section class="stack" aria-labelledby="line-h"><div class="row wrap" style="justify-content:space-between"><h2 id="line-h">Irrigation lines</h2><span class="row"><button class="btn sm" disabled>Add line</button><span class="notdemo">Not in demo</span></span></div>
      <div class="card" style="padding:0 16px">
        ${d.lines.map((l) => {
          const res = s.seed.reservoirs.find((r) => r.id === l.reservoir_id);
          const links = s.seed.lineSectors.filter((x) => x.line_id === l.id);
          const v = s.lineVersions[l.id].length;
          return html`<button type="button" class="item" key=${l.id} style="border:0;border-top:1px solid var(--line);border-radius:0;margin:0;border-left-color:transparent" onClick=${() => ui.open({ type: 'line', id: l.id })} aria-label=${`${l.name}, ${f.rate(l.rate_gpm)}. Open details`}>
            <div class="grow"><div class="big">${l.name}</div>
              <div class="small muted">${links.map((x) => `${s.seed.sectors.find((z) => z.id === x.sector_id).name}${x.share_pct.lt(100) ? ` ${x.share_pct.toString()}%` : ''}`).join(' + ')} · ${res.name}</div></div>
            ${v > 1 && html`<${Chip} kind="info">v${v}<//>`}
            <div class="right big">${f.rate(l.rate_gpm)}</div><${Icon} name="chev" />
          </button>`;
        })}
      </div>
    </section>

    <section class="stack" aria-labelledby="res-h2"><div class="row wrap" style="justify-content:space-between"><h2 id="res-h2">Reservoirs</h2><span class="row"><button class="btn sm" disabled>Add reservoir</button><span class="notdemo">Not in demo</span></span></div>
      <div class="grid cards-2" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
        ${s.seed.reservoirs.map((r) => html`<div class="card stack" key=${r.id}><${ReservoirCard} res=${r} />
          <button class="btn block" type="button" onClick=${() => ui.open({ type: 'res', id: r.id })}>Add refill or reading</button></div>`)}
      </div>
    </section>
  </div>`;
}
