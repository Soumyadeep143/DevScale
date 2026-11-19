import { RoadGraph } from '../js/graph.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const tile = JSON.parse(readFileSync(new URL('../data/marathahalli.json', import.meta.url)));
const g = new RoadGraph(tile);
let ok = 0; const t = (n, f) => { f(); ok++; console.log('ok -', n); };

t('graph loads', () => { assert(g.nodes.length > 100 && g.edges.length > 200); });
t('twoway edges are paired', () => { const e = g.edges.find(e => e.twoway); const r = g.edges[e.rev]; assert(r && r.from === e.to && r.to === e.from); });
t('every node has an outgoing edge (no dead-end trap)', () => { assert(g.nodes.every(n => n.out.length > 0)); });
t('A* connects far corners', () => {
  const a = g.nearestNode(-800, 900), b = g.nearestNode(800, -900);
  const r = g.route(a, b); assert(r && r.length > 2000 && r.length < 6000, `len ${r && r.length}`);
  // edges chain
  let cur = a; for (const id of r.edges) { assert.equal(g.edges[id].from, cur); cur = g.edges[id].to; } assert.equal(cur, b);
});
t('route length >= straight line', () => { const a = g.nearestNode(0, 0), b = g.nearestNode(300, 300), r = g.route(a, b); assert(r.length >= Math.hypot(g.nodes[a].x - g.nodes[b].x, g.nodes[a].z - g.nodes[b].z) - 1e-6); });
t('signals: opposing axes never both green', () => {
  assert(g.sigGroup.size >= 6);
  for (let time = 0; time < 120; time += 0.5) {
    const states = new Map();
    for (const [eid, grp] of g.sigGroup) { const n = g.edges[eid].to; const s = g.signalState(eid, time); const k = n + ':' + grp; states.set(k, s); }
    for (const n of g.tile.signals) { const a = states.get(n + ':0'), b = states.get(n + ':1'); assert(!(a === 'G' && b === 'G') && !(a === 'A' && b === 'G') && !(a === 'G' && b === 'A'), `conflict ${time}`); }
  }
});
t('nearestRoad finds ORR centre at origin', () => { const r = g.nearestRoad(0, 0); assert(r.dist < 1 && r.road); });
t('onRoad false far from roads', () => { assert(!g.onRoad(5000, 5000)); assert(g.onRoad(0, 0)); });
t('sample returns point on edge', () => { const e = g.edges[10]; const p = g.sample(e, e.len / 2); assert(Number.isFinite(p.x) && Math.abs(Math.hypot(p.dx, p.dz) - 1) < 1e-6); });
console.log(`${ok} graph tests passed`);
