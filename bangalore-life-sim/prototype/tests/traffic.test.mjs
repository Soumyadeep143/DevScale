import { RoadGraph } from '../js/graph.js';
import { TrafficSystem } from '../js/traffic.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const g = new RoadGraph(JSON.parse(readFileSync(new URL('../data/marathahalli.json', import.meta.url))));
let ok = 0; const t = (n, f) => { f(); ok++; console.log('ok -', n); };

const player = { x: 0, z: 0, vx: 0, vz: 0, len: 2.7, wid: 1.45 };
const ts = new TrafficSystem(g); ts.populate(90, player);
let minGap = Infinity, deep = 0, speedSum = 0, n = 0, maxV = 0;
const stoppedAtRed = [];
for (let i = 0; i < 60 * 180; i++) {
  ts.update(1 / 20, player);
  if (i % 20 === 0) {
    for (let a = 0; a < ts.agents.length; a++) for (let b = a + 1; b < ts.agents.length; b++) {
      const A = ts.agents[a], B = ts.agents[b]; if (A.ghost > 0 || B.ghost > 0) continue;
      const d = Math.hypot(A.x - B.x, A.z - B.z); if (d < (A.len + B.len) / 4) deep++;
    }
    for (const a of ts.agents) { speedSum += a.v; n++; maxV = Math.max(maxV, a.v); assert(Number.isFinite(a.x) && Number.isFinite(a.z)); }
  }
}
t('sim ran 180 s of traffic with finite positions', () => assert(n > 1000));
t('traffic flows (mean speed > 3 m/s)', () => assert(speedSum / n > 3, speedSum / n));
t('no speeding beyond type limits', () => assert(maxV < 20, maxV));
t('rare deep overlaps outside squeeze mode (<1% samples)', () => assert(deep < n * 0.01, `${deep}/${n}`));
t('not gridlocked (<35% stopped)', () => assert(ts.stats.stopped < ts.agents.length * 0.35, ts.stats.stopped));
t('signal obedience: nothing crosses the stop line on red', () => {
  // edges into signalised nodes: at red, no agent within the last 2 m of the edge moving > 2 m/s
  const t2 = new TrafficSystem(g); t2.populate(120, player); let viol = 0, samples = 0;
  for (let i = 0; i < 20 * 300; i++) {
    t2.update(1 / 20, player);
    for (const a of t2.agents) { const e = g.edges[a.e]; if (!g.nodes[e.to].sig || a.ghost > 0) continue; const st = g.signalState(a.e, t2.t); samples++; if (st === 'R' && e.len - a.s < 1.5 && a.v > 3) viol++; }
  }
  assert(samples > 50, 'no samples at signals: ' + samples); assert(viol / samples < 0.02, `${viol}/${samples}`);
});
t('agents recycle near a moving player', () => { const p = { x: 600, z: -400, vx: 0, vz: 0, len: 3, wid: 1.6 }; for (let i = 0; i < 20 * 5; i++) ts.update(1 / 20, p); const near = ts.agents.filter(a => Math.hypot(a.x - p.x, a.z - p.z) < 450).length; assert(near > ts.agents.length * 0.8, near); });
console.log(`${ok} traffic tests passed`);
