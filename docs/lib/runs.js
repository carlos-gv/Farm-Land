// Run records: volume is always rate x time, computed from the snapshot stored on the run.
import { D, num, rate, vol, minutesText } from './units.js';

export const runVolume = (rateGpm, seconds) => D(rateGpm).mul(seconds).div(60);

export const splitVolume = (volume, shares) =>
  shares.map((s) => ({ sector_id: s.sector_id, gal: D(volume).mul(s.share_pct).div(100) }));

export function makeRun({ id, line_id, start_ms, seconds, source, rate_gpm, shares, note = '', flags = [] }) {
  const r = D(rate_gpm);
  return {
    id, line_id, start_ms, seconds, source, rate_gpm: r, note, flags,
    shares: shares.map((s) => ({ sector_id: s.sector_id, share_pct: D(s.share_pct) })),
    volume_gal: runVolume(r, seconds),
  };
}

export const runEndMs = (run) => run.start_ms + run.seconds * 1000;

// Parts of the "rate x minutes = volume" line, formatted for the current units.
export function formulaParts(run, prefs) {
  return {
    rate: rate(run.rate_gpm, prefs),
    minutes: minutesText(D(run.seconds).div(60)),
    volume: vol(run.volume_gal, prefs),
  };
}

export const sumGal = (runs) => runs.reduce((a, r) => a.plus(r.volume_gal), D(0));
export { num };
