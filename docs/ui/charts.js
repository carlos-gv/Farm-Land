import { html, useState, useEffect, useRef } from './common.js';

const M = { l: 40, r: 6, t: 10, b: 24 };

const niceMax = (v) => {
  if (v <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
};

// bar with only the data end rounded (top), anchored at the baseline
const topRound = (x, y, w, h, r) => {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

// Draw in real pixels so text stays 11px on a phone instead of shrinking with the SVG.
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.clientWidth));
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Stacked bars: days[{label, long, parts:[{id,name,color,gal(number)}], total}]. One axis, volume only.
export function StackedBars({ days, f, height = 210, ariaLabel }) {
  const [ref, W] = useWidth();
  const [on, setOn] = useState(null);
  if (!W) return html`<div class="chart" ref=${ref} style=${`height:${height}px`}></div>`;
  const H = height;
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const max = niceMax(Math.max(...days.map((d) => d.total), 1));
  const slot = iw / days.length, bw = Math.max(6, Math.min(26, slot * 0.66));
  const y = (v) => M.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const a = on != null ? days[on] : null;
  const tipX = on != null ? M.l + slot * (on + 0.5) : 0;
  const every = slot < 30 ? 2 : 1;
  return html`<div class="chart" ref=${ref}>
    <svg width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${ariaLabel}>
      ${ticks.map((t) => html`<g key=${t}>
        <line class="grid-line" x1=${M.l} x2=${W - M.r} y1=${y(t)} y2=${y(t)} />
        <text x=${M.l - 6} y=${y(t) + 4} text-anchor="end">${f.axis(t)}</text>
      </g>`)}
      ${days.map((d, i) => {
        const cx = M.l + slot * (i + 0.5);
        let acc = 0;
        const segs = d.parts.filter((p) => p.gal > 0);
        return html`<g key=${i}>
          ${segs.map((p, k) => {
            const y1 = y(acc + p.gal), y0 = y(acc);
            acc += p.gal;
            const hgt = Math.max(0, y0 - y1);
            return k === segs.length - 1
              ? html`<path d=${topRound(cx - bw / 2, y1, bw, hgt, 4)} fill=${p.color} stroke="var(--surface)" stroke-width="1" />`
              : html`<rect x=${cx - bw / 2} y=${y1} width=${bw} height=${hgt} fill=${p.color} stroke="var(--surface)" stroke-width="1" />`;
          })}
          ${(days.length - 1 - i) % every === 0 && html`<text x=${cx} y=${H - 6} text-anchor="middle">${d.label}</text>`}
          <rect class=${'bar-hit' + (on === i ? ' on' : '')} x=${cx - slot / 2} y=${M.t} width=${slot} height=${ih + 4}
            onPointerEnter=${() => setOn(i)} onPointerDown=${() => setOn(i)} onPointerLeave=${() => setOn(null)} />
        </g>`;
      })}
    </svg>
    ${a && html`<div class="tip" style=${`left:${Math.min(W - 80, Math.max(80, tipX))}px;top:0`}>
      <b>${a.long}</b>
      ${a.parts.map((p) => html`<div class="tr"><span><i class="dot" style=${`background:${p.color}`}></i> ${p.name}</span><span>${f.volShort(p.gal)}</span></div>`)}
      <div class="tr" style="border-top:1px solid var(--line);margin-top:4px;padding-top:4px"><b style="margin:0">Total</b><b style="margin:0">${f.volShort(a.total)}</b></div>
    </div>`}
  </div>`;
}

// Rain gets its own strip under the bars (same x positions) rather than a second y-axis.
export function RainStrip({ days, f, height = 64 }) {
  const [ref, W] = useWidth();
  if (!W) return html`<div class="chart" ref=${ref} style=${`height:${height}px`}></div>`;
  const iw = W - M.l - M.r;
  const slot = iw / days.length, bw = Math.max(6, Math.min(26, slot * 0.66));
  const max = Math.max(1, ...days.map((d) => d.rain));
  const base = height - 10, ph = base - 16;
  return html`<div class="chart" ref=${ref}><svg width=${W} height=${height} viewBox=${`0 0 ${W} ${height}`} role="img" aria-label="Rain per day">
    <text x=${M.l - 6} y=${base - 2} text-anchor="end">Rain</text>
    <line class="grid-line" x1=${M.l} x2=${W - M.r} y1=${base} y2=${base} />
    ${days.map((d, i) => {
      const cx = M.l + slot * (i + 0.5);
      const h = Math.max(2, (d.rain / max) * ph);
      return html`<g key=${i}>
        ${d.rain > 0 && html`<path d=${topRound(cx - bw / 2, base - h, bw, h, 3)} fill="var(--rain)" />`}
        ${d.rain > 0 && html`<text x=${cx} y=${base - h - 3} text-anchor="middle">${f.depth(d.rain)}</text>`}
      </g>`;
    })}
  </svg></div>`;
}

// Level history for one reservoir. Single series, so no legend; the sheet title names it.
export function LevelLine({ points, cap, f, height = 130 }) {
  const [ref, W] = useWidth();
  if (!W) return html`<div class="chart" ref=${ref} style=${`height:${height}px`}></div>`;
  const iw = W - M.l - M.r, ih = height - M.t - 18;
  const t0 = points[0].ms, t1 = points.at(-1).ms;
  const x = (ms) => M.l + ((ms - t0) / (t1 - t0 || 1)) * iw;
  const y = (v) => M.t + ih - (v / cap) * ih;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.ms).toFixed(1)},${y(p.gal).toFixed(1)}`).join('');
  const last = points.at(-1);
  return html`<div class="chart" ref=${ref}><svg width=${W} height=${height} viewBox=${`0 0 ${W} ${height}`} role="img" aria-label="Reservoir level over the last 14 days">
    ${[0, cap / 2, cap].map((t) => html`<g key=${t}><line class="grid-line" x1=${M.l} x2=${W - M.r} y1=${y(t)} y2=${y(t)} /><text x=${M.l - 6} y=${y(t) + 4} text-anchor="end">${f.axis(t)}</text></g>`)}
    <path d=${d} fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />
    <circle cx=${x(last.ms)} cy=${y(last.gal)} r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" />
    <text x=${M.l} y=${height - 3}>${points[0].label}</text>
    <text x=${W - M.r} y=${height - 3} text-anchor="end">${last.label}</text>
  </svg></div>`;
}
