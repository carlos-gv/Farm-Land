// Totals for the Report and Dashboard screens, always summed from unrounded run volumes.
import { D } from './units.js';
import { splitVolume } from './runs.js';

export function summarize(runs, { lines, sectors, reservoirs }) {
  const zero = () => ({ gal: D(0), seconds: 0, runs: [] });
  const byLine = Object.fromEntries(lines.map((l) => [l.id, zero()]));
  const bySector = Object.fromEntries(sectors.map((s) => [s.id, zero()]));
  const byRes = Object.fromEntries(reservoirs.map((r) => [r.id, zero()]));
  let total = D(0);
  for (const run of runs) {
    const line = lines.find((l) => l.id === run.line_id);
    const a = byLine[run.line_id]; a.gal = a.gal.plus(run.volume_gal); a.seconds += run.seconds; a.runs.push(run);
    const r = byRes[line.reservoir_id]; r.gal = r.gal.plus(run.volume_gal); r.seconds += run.seconds; r.runs.push(run);
    for (const part of splitVolume(run.volume_gal, run.shares)) {
      const s = bySector[part.sector_id]; s.gal = s.gal.plus(part.gal); s.runs.push({ run, gal: part.gal });
    }
    total = total.plus(run.volume_gal);
  }
  return { byLine, bySector, byRes, total, count: runs.length };
}
