import { VehicleBody, SPECS } from '../js/vehicles.js';
import assert from 'node:assert/strict';
let ok = 0; const t = (n, f) => { f(); ok++; console.log('ok -', n); };
const run = (v, secs, inp, env) => { for (let i = 0; i < secs * 60; i++) v.step(1 / 60, inp, env); };

t('auto accelerates to near but below its top speed', () => { const v = new VehicleBody('auto'); run(v, 40, { throttle: 1, steer: 0 }); assert(v.speed > 0.85 * SPECS.auto.maxV && v.speed <= SPECS.auto.maxV + 0.1, v.speed); });
t('auto is slower than hatchback and scooter', () => { const r = {}; for (const k of ['auto', 'car', 'bike']) { const v = new VehicleBody(k); run(v, 30, { throttle: 1, steer: 0 }); r[k] = v.speed; } assert(r.auto < r.bike && r.bike < r.car, JSON.stringify(r)); });
t('braking stops the vehicle and does not reverse it', () => { const v = new VehicleBody('car'); run(v, 10, { throttle: 1, steer: 0 }); run(v, 8, { brake: 1, steer: 0 }); assert(v.speed < 0.05 && v.fwdSpeed >= 0, v.fwdSpeed); });
t('braking distance grows with speed', () => { const d = s => { const v = new VehicleBody('car'); v.vz = s; v.vx = 0; v.h = 0; const z0 = v.z; run(v, 12, { brake: 1, steer: 0 }); return v.z - z0; }; assert(d(20) > 2.5 * d(10)); });
t('steering left turns heading positive (left = +h)', () => { const v = new VehicleBody('car'); v.vz = 10; run(v, 1, { steer: 1 }); assert(v.h > 0.1, v.h); });
t('wet road slides more than dry (higher lateral velocity in a turn)', () => { const f = wet => { const v = new VehicleBody('car'); v.vz = 14; run(v, 0.8, { steer: 1 }, { wet }); return Math.abs(v.slip); }; assert(f(true) > f(false)); });
t('handbrake creates a slide', () => { const v = new VehicleBody('car'); v.vz = 14; run(v, 0.5, { steer: 1, hand: 1 }); assert(Math.abs(v.slip) > 0.5, v.slip); });
t('fuel is consumed and zero fuel kills throttle', () => { const v = new VehicleBody('bike'); const f0 = v.fuel; run(v, 20, { throttle: 1, steer: 0 }); assert(v.fuel < f0); v.fuel = 0; v.vx = v.vz = 0; run(v, 3, { throttle: 1, steer: 0 }); assert(v.speed < 0.3); });
t('bump pushes out and records damage on hard hit', () => { const v = new VehicleBody('car'); v.vz = 15; v.z = 0; const imp = v.bump(0, -1, 0.3); assert(imp > 10 && v.damage > 5 && v.vz <= 0 + 1e-9 + 15 * -0.25 + 1e-6 + 0.01); });
console.log(`${ok} vehicle tests passed`);
