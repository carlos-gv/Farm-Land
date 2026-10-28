import { h } from '../vendor/preact.mjs';
import htm from '../vendor/htm.mjs';
import { useState, useEffect, useRef } from '../vendor/hooks.mjs';
import * as U from '../lib/units.js';

export const html = htm.bind(h);
export { h, useState, useEffect, useRef };

// ---- store + ui-state singletons ---------------------------------------
let store;
export const setStore = (s) => { store = s; };
export const getStore = () => store;

export function useStore() {
  const [, bump] = useState(0);
  useEffect(() => store.subscribe(() => bump((n) => n + 1)), []);
  const s = store.getState();
  return { s, d: store.derive(), a: store.actions, store, f: fmt(s.prefs) };
}

const uiState = { sheet: null };
const uiSubs = new Set();
export const ui = {
  get: () => uiState.sheet,
  open: (sheet) => { uiState.sheet = sheet; uiSubs.forEach((f) => f()); },
  close: () => { uiState.sheet = null; uiSubs.forEach((f) => f()); },
};
export function useUi() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); uiSubs.add(f); return () => uiSubs.delete(f); }, []);
  return uiState.sheet;
}

// ---- formatters bound to the current unit preferences --------------------
export const fmt = (p) => ({
  vol: (g, dp) => U.vol(g, p, dp),
  volShort: (g) => U.volShort(g, p),
  axis: (g) => {
    const v = U.volValue(g, p);
    return v.gte(1e6) ? `${U.num(v.div(1e6), 1, true)}M` : v.gte(1e3) ? `${U.num(v.div(1e3), 0)}k` : U.num(v, 0);
  },
  rate: (r) => U.rate(r, p),
  area: (a) => U.area(a, p),
  depth: (i) => U.depth(i, p),
  volUnit: U.volUnit(p),
  rateUnit: U.rateUnit(p),
  num: U.num,
  duration: U.duration,
  minutes: U.minutesText,
});

// ---- icons ---------------------------------------------------------------
const P = {
  dashboard: 'M3 3h8v10H3zM13 3h8v6h-8zM13 13h8v8h-8zM3 17h8v4H3z',
  today: 'M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z',
  plan: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  farm: 'M12 21v-8M12 13c0-4 3-6 7-6 0 4-3 6-7 6zM12 16c0-3-2-5-6-5 0 3 2 5 6 5z',
  report: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  bell: 'M6 17v-6a6 6 0 0 1 12 0v6l2 2H4zM10 21h4',
  gear: 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  play: 'M7 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  info: 'M12 8v.5M12 11v6',
  offline: 'M2 9a15 15 0 0 1 6-3M22 9a15 15 0 0 0-6-3M5 13a10 10 0 0 1 4-2M19 13a10 10 0 0 0-4-2M9 17a5 5 0 0 1 6 0M3 3l18 18',
  sync: 'M20 11a8 8 0 0 0-14-4M4 13a8 8 0 0 0 14 4M5 3v4h4M19 21v-4h-4',
  close: 'M6 6l12 12M18 6L6 18',
  rain: 'M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.5 3.5 0 0 1 0 7H7zM9 19l-1 2M13 19l-1 2M17 19l-1 2',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19',
  chev: 'M9 6l6 6-6 6',
  clock: 'M12 7v5l3 2',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  wait: 'M12 7v5l3 2',
};
const CIRCLED = new Set(['gear', 'info', 'clock', 'sun', 'wait']);
export function Icon({ name, size, label }) {
  const style = size ? `width:${size}px;height:${size}px` : null;
  return html`<svg class="icon" viewBox="0 0 24 24" style=${style} aria-hidden=${label ? 'false' : 'true'} role=${label ? 'img' : null} aria-label=${label || null}>
    ${CIRCLED.has(name) && html`<circle cx="12" cy="12" r=${name === 'gear' ? 4 : name === 'sun' ? 4 : 9} />`}
    <path d=${P[name]} />
  </svg>`;
}

// ---- small components -----------------------------------------------------
// Big number with the unit set small, so long values do not wrap on phones.
export function Big({ text }) {
  const i = text.lastIndexOf(' ');
  return html`${text.slice(0, i)} <small>${text.slice(i + 1)}</small>`;
}

export function Seg({ value, options, onChange, label }) {
  return html`<div class="seg" role="radiogroup" aria-label=${label}>
    ${options.map((o) => html`<button type="button" role="radio" aria-checked=${value === o.value} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
  </div>`;
}

export function Formula({ rate, minutes, volume }) {
  return html`<div class="formula" aria-label=${`${rate} times ${minutes} equals ${volume}`}>
    <span>${rate}</span><span class="op">×</span><span>${minutes}</span><span class="op">=</span><span class="res">${volume}</span>
  </div>`;
}

export function Gauge({ pct, low, label }) {
  const w = Math.max(0, Math.min(100, pct));
  return html`<div class=${'gauge' + (low ? ' low' : '')} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(w)} aria-label=${label}><i style=${`width:${w}%`}></i></div>`;
}

export function Chip({ kind = '', icon, children, onClick }) {
  const Tag = onClick ? 'button' : 'span';
  return html`<${Tag} class=${`chip ${kind}${onClick ? ' btnlike' : ''}`} onClick=${onClick} type=${onClick ? 'button' : null}>${icon && html`<${Icon} name=${icon} />`}${children}<//>`;
}

export function Sheet({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('[data-autofocus], input, select, button')?.focus();
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, []);
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${title} ref=${ref}>
      <div class="sheet-head"><h2>${title}</h2><button class="iconbtn" type="button" onClick=${onClose} aria-label="Close"><${Icon} name="close" /></button></div>
      ${children}
    </div>
  </div>`;
}

export const sectorColor = (id) => ({ S1: 'var(--s1)', S2: 'var(--s2)', S3: 'var(--s3)' }[id] || 'var(--ink-3)');
export const SECTOR_SLOT = { S1: 's1', S2: 's2', S3: 's3' };
