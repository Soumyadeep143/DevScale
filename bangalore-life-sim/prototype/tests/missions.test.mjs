import { RoadGraph } from '../js/graph.js';
import { AutoMissions, fareFor } from '../js/missions.js';
import { readFileSync } from 'node:fs';
const lcg = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
import assert from 'node:assert/strict';
const tile = JSON.parse(readFileSync(new URL('../data/marathahalli.json', import.meta.url)));
const g = new RoadGraph(tile); let ok = 0; const t = (n, f) => { f(); ok++; console.log('ok -', n); };
t('tariff: 30 up to 2 km, 15/km beyond, night x1.5', () => { assert.equal(fareFor(0), 30); assert.equal(fareFor(2000), 30); assert.equal(fareFor(4000), 60); assert.equal(fareFor(4000, true), 90); });
t('full mission cycle', () => {
  const m = new AutoMissions(g, tile.pois, lcg(1));
  const p = m.offer({ x: 0, z: 0 }); assert(p && m.phase === 'hail');
  assert.equal(m.update(0.5, { x: 0, z: 0, speed: 0, inAuto: true, damage: 0 }), null, 'too far to board');
  let ev = null; for (let i = 0; i < 30 && !ev; i++) ev = m.update(0.1, { x: p.x, z: p.z, speed: 0, inAuto: true, damage: 0 });
  assert.equal(ev, 'boarded'); assert(m.route && m.route.length > 400, 'route ' + m.route?.length);
  // drive the route length at 8 m/s then stop at destination
  let delivered = null; const L = m.route.length;
  for (let i = 0; i < L / 8 * 10 && !delivered; i++) m.update(0.1, { x: 0, z: 0, speed: 8, inAuto: true, damage: 0 });
  delivered = m.update(0.1, { x: m.dest.x, z: m.dest.z, speed: 0, inAuto: true, damage: 0 });
  assert.equal(delivered, 'delivered'); assert(m.result.total >= 30 && m.result.onTime, JSON.stringify(m.result));
});
t('damage reduces payout; leaving the auto blocks drop-off', () => {
  const m = new AutoMissions(g, tile.pois, lcg(5)); const p = m.offer({ x: 0, z: 0 }); m.board({ damage: 0 }); m.t = m.limit + 1; m.driven = 5000;
  assert.equal(m.update(0.1, { x: m.dest.x, z: m.dest.z, speed: 0, inAuto: false, damage: 0 }), null);
  assert.equal(m.update(0.1, { x: m.dest.x, z: m.dest.z, speed: 0, inAuto: true, damage: 20 }), 'delivered');
  assert(m.result.penalty > 0 && m.result.tip === 0 && m.result.total < m.result.base);
});
console.log(`${ok} mission tests passed`);
