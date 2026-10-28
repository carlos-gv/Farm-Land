// Exact conversions and display formatting. Stored values are never rounded;
// rounding (half up) happens only here, at display time.
import Decimal from '../vendor/decimal.mjs';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export const D = (v) => (v instanceof Decimal ? v : new Decimal(v));

export const GAL_TO_L = D('3.785411784');
export const ACRE_TO_HA = D('0.40468564224');
export const ACRE_INCH_GAL = D('27154.285');
export const IN_TO_MM = D('25.4');

export const DEFAULT_PREFS = { vol: 'gal', area: 'ac', depth: 'in' };

const group = (s) => {
  const neg = s.startsWith('-');
  const [i, f] = (neg ? s.slice(1) : s).split('.');
  return (neg ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
};

export function num(x, dp = 0, trim = false) {
  let s = D(x).toFixed(dp);
  if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
  if (trim && s.includes('.')) s = s.replace(/\.?0+$/, '');
  return group(s);
}

export const volUnit = (p) => (p.vol === 'L' ? 'L' : 'gal');
export const rateUnit = (p) => (p.vol === 'L' ? 'L/min' : 'gpm');

export const volValue = (gal, p) => (p.vol === 'L' ? D(gal).mul(GAL_TO_L) : D(gal));
export const vol = (gal, p, dp = 0) => `${num(volValue(gal, p), dp)} ${volUnit(p)}`;
export const volShort = (gal, p) => {
  const v = volValue(gal, p);
  if (v.abs().gte(1e6)) return `${num(v.div(1e6), 2)} M ${volUnit(p)}`;
  if (v.abs().gte(1e4)) return `${num(v.div(1e3), 0)} k ${volUnit(p)}`;
  return `${num(v, 0)} ${volUnit(p)}`;
};
export const rate = (gpm, p) => `${num(p.vol === 'L' ? D(gpm).mul(GAL_TO_L) : gpm, p.vol === 'L' ? 1 : 1, true)} ${rateUnit(p)}`;
export const area = (ac, p) => (p.area === 'ha' ? `${num(D(ac).mul(ACRE_TO_HA), 1, true)} ha` : `${num(ac, 1, true)} ac`);
export const depth = (inch, p) => {
  if (p.depth === 'mm') {
    const mm = D(inch).mul(IN_TO_MM);
    return `${num(mm, mm.abs().gte(10) ? 0 : 1, true)} mm`;
  }
  return `${num(inch, 2)} in`;
};

export const minutesText = (m) => `${num(m, 2, true)} min`;
export function duration(minutes) {
  const t = D(minutes).toDecimalPlaces(0).toNumber();
  const h = Math.floor(t / 60), m = t % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
