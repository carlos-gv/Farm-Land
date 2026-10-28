// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { D, num, vol, rate, area, depth, duration, GAL_TO_L, ACRE_TO_HA, ACRE_INCH_GAL } from '../docs/lib/units.js';
import { runVolume, splitVolume, makeRun, sumGal } from '../docs/lib/runs.js';
import { loadSeed, levelAt, planCtx } from '../docs/lib/data.js';
import { buildPlan } from '../docs/lib/planner.js';

const root = new URL('../docs/data/', import.meta.url).pathname;
const seed = await loadSeed(async (f) => fs.readFileSync(root + f, 'utf8'));
const metric = { vol: 'L', area: 'ha', depth: 'mm' };
const us = { vol: 'gal', area: 'ac', depth: 'in' };

test('run volume is rate x minutes, exactly', () => {
  assert.equal(runVolume(600, 750).toString(), '7500'); // 600 gpm x 12.5 min
  assert.equal(runVolume('12.5', 90).toString(), '18.75'); // 12.5 gpm x 1.5 min
  assert.equal(runVolume(900, 1).toString(), '15');
});

test('sector split sums back to the run volume', () => {
  const parts = splitVolume(D(9000), [{ sector_id: 'S2', share_pct: D(45) }, { sector_id: 'S3', share_pct: D(55) }]);
  assert.deepEqual(parts.map((p) => p.gal.toString()), ['4050', '4950']);
  const odd = splitVolume(runVolume(333, 777), [{ sector_id: 'a', share_pct: D('33.33') }, { sector_id: 'b', share_pct: D('66.67') }]);
  assert.equal(odd[0].gal.plus(odd[1].gal).toString(), runVolume(333, 777).toString());
});

test('conversions are exact and round-trip', () => {
  assert.equal(D(1000).mul(GAL_TO_L).toString(), '3785.411784');
  assert.equal(D(1000).mul(GAL_TO_L).div(GAL_TO_L).toString(), '1000');
  assert.equal(D(1).mul(ACRE_TO_HA).toString(), '0.40468564224');
  assert.equal(D(40).mul(1).mul(ACRE_INCH_GAL).toString(), '1086171.4');
});

test('formatting rounds half up and never shows negative zero', () => {
  assert.equal(num('0.125', 2), '0.13');
  assert.equal(num('2.5', 0), '3');
  assert.equal(num('-0.0001', 2), '0.00');
  assert.equal(num('1234567.891', 0), '1,234,568');
  assert.equal(vol(7500, us), '7,500 gal');
  assert.equal(vol(1000, metric), '3,785 L');
  assert.equal(rate(12.5, us), '12.5 gpm');
  assert.equal(area(40, metric), '16.2 ha');
  assert.equal(depth('0.25', metric), '6.4 mm');
  assert.equal(depth('0.5', metric), '13 mm');
  assert.equal(duration(860), '14 h 20 min');
});

test('unit toggle is display only: stored values do not change', () => {
  const r = makeRun({ id: 'x', line_id: 'L1', start_ms: 0, seconds: 750, source: 'timer', rate_gpm: 600, shares: [{ sector_id: 'S1', share_pct: 100 }] });
  const before = r.volume_gal.toString();
  vol(r.volume_gal, metric);
  assert.equal(r.volume_gal.toString(), before);
});

test('seed: shares sum to 100 per line, run volumes recompute from raw rate x seconds', () => {
  for (const l of seed.lines) assert.equal(seed.lineSectors.filter((x) => x.line_id === l.id).reduce((a, x) => a.plus(x.share_pct), D(0)).toString(), '100');
  for (const r of seed.runs) assert.equal(r.volume_gal.toString(), D(r.rate_gpm).mul(r.seconds).div(60).toString());
  const bySector = seed.runs.flatMap((r) => splitVolume(r.volume_gal, r.shares)).reduce((a, p) => a.plus(p.gal), D(0));
  assert.equal(bySector.toString(), sumGal(seed.runs).toString());
});

const planFor = (scenario) => {
  const ctx = planCtx(seed, seed.lines);
  const levels0 = Object.fromEntries(seed.reservoirs.map((r) => [r.id, levelAt(r.id, seed.demoStartMs, seed)]));
  return buildPlan({ ctx, demoDate: seed.farm.demo_date, history: seed.history, scenarioRows: seed.scenarios.filter((r) => r.scenario === scenario), runs: seed.runs, levels0 });
};

test('plan: every item gallons = line rate x whole minutes', () => {
  for (const sc of ['normal', 'heatwave', 'heavy']) for (const d of planFor(sc).days) for (const i of d.items) {
    assert.equal(i.gallons.toString(), i.rate_gpm.mul(i.minutes).toString());
    assert.ok(i.minutes.isInteger() && i.minutes.gt(0));
  }
});

test('plan: concurrent lines never exceed a reservoir max outflow', () => {
  for (const sc of ['normal', 'heatwave']) {
    const items = planFor(sc).days.flatMap((d) => d.items);
    for (const res of seed.reservoirs) {
      const mine = items.filter((i) => i.reservoir_id === res.id);
      for (const p of mine) {
        const flow = mine.filter((q) => q.start_ms <= p.start_ms && q.end_ms > p.start_ms).reduce((a, q) => a + q.rate_gpm.toNumber(), 0);
        assert.ok(flow <= res.max_outflow_gpm.toNumber(), `${sc} ${res.id} ${flow}`);
      }
    }
  }
});

test('plan: scenarios behave differently', () => {
  const count = (sc, from = 0, to = 16) => planFor(sc).days.filter((d) => d.offset >= from && d.offset <= to).reduce((a, d) => a + d.items.length, 0);
  assert.ok(count('heatwave') > count('normal'));
  assert.equal(count('heavy', 1, 16), 0, 'heavy rain: no irrigation during the wet forecast days');
  const short = (sc) => planFor(sc).days.flatMap((d) => d.items).filter((i) => i.shortfall_gal.gt(0)).length;
  assert.equal(short('normal'), 0);
  assert.ok(short('heatwave') > 0);
});

test('plan: days 17 to 30 are typical, 1 to 16 forecast', () => {
  const p = planFor('normal');
  assert.equal(p.days.find((d) => d.offset === 16).kind, 'forecast');
  assert.equal(p.days.find((d) => d.offset === 17).kind, 'typical');
  assert.equal(p.days.length, 31);
});
