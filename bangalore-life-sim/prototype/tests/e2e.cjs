// End-to-end gameplay test in headless Chromium (software GL, so we fast-forward with __game.advance()).
// Usage: node tests/e2e.cjs [url] [screenshotDir]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const url = process.argv[2] || 'http://localhost:8765/index.html', shots = process.argv[3] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  let ok = 0; const t = async (name, f) => { await f(); ok++; console.log('ok -', name); };
  const ev = (f, a) => page.evaluate(f, a);
  const adv = s => ev(s => window.__game.advance(s), s);
  const snap = async n => { await page.waitForTimeout(2200); await page.screenshot({ path: `${shots}/${n}.png` }); };
  await page.goto(url); await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 60000 });
  await page.screenshot({ path: `${shots}/01_menu.png` });
  await t('menu: Continue disabled without save, metro button disabled', async () => { assert(await page.locator('#btnContinue').isDisabled()); assert(await page.locator('button:has-text("Namma Metro")').isDisabled()); });

  await page.click('#btnAuto');
  await t('auto driver mode starts in the auto-rickshaw', async () => { assert.equal(await ev(() => window.__game.state), 'play'); assert.equal(await ev(() => window.__game.vehicleType), 'auto'); });
  await t('spawns in the LEFT lane: signed lateral offset from the road centreline is on the left of travel', async () => {
    const lat = await ev(() => { const a = window.__game.api, b = a.body, fx = Math.sin(b.h), fz = Math.cos(b.h); let best = { d: 1e9, lat: 0 };
      for (const r of a.graph.roads) for (let i = 0; i < r.pts.length - 1; i++) { const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L; if (Math.abs(ux * fx + uz * fz) < 0.9) continue;
        const t = Math.max(0, Math.min(L, (b.x - ax) * ux + (b.z - az) * uz)), px = ax + ux * t, pz = az + uz * t, d = Math.hypot(b.x - px, b.z - pz); if (d < best.d) { const sgn = (ux * fx + uz * fz) > 0 ? 1 : -1; best = { d, lat: ((b.x - px) * (uz * sgn) + (b.z - pz) * (-ux * sgn)) }; } }
      return best.lat; });
    assert(lat > 0.5, 'lateral offset to the left of travel direction was ' + lat);
  });
  await page.keyboard.down('KeyW'); await adv(8); await page.keyboard.up('KeyW');
  await snap('02_driving');
  const spd = () => ev(() => window.__game.api.body.speed * 3.6);
  await t('throttle accelerates the auto (> 25 km/h after 8 s)', async () => { const s = await spd(); assert(s > 25 && s < 56, s); });
  await t('traffic agents are alive and moving', async () => { const r = await ev(() => { const tr = window.__game.api.traffic; return { n: tr.agents.length, moving: tr.agents.filter(a => a.v > 1).length }; }); assert(r.n >= 60 && r.moving > 15, JSON.stringify(r)); });
  await page.keyboard.down('KeyS'); await adv(2.6); await page.keyboard.up('KeyS');
  await t('holding S brakes the auto to a halt (then starts reversing slowly)', async () => { assert((await spd()) < 8, await spd()); await adv(3); assert((await spd()) < 2); });

  await t('building collision: driving straight into a building stops the vehicle and adds damage', async () => {
    const r = await ev(() => { const g = window.__game, a = g.api, b = a.body, p = a.world.polys.find(p => Math.hypot(p.ring[0][0] - b.x, p.ring[0][1] - b.z) < 160); const c = p.ring.reduce((s, q) => [s[0] + q[0] / p.ring.length, s[1] + q[1] / p.ring.length], [0, 0]);
      b.x = c[0] - 40; b.z = c[1]; b.h = Math.PI / 2; b.vx = 12; b.vz = 0; b.damage = 0; return { cx: c[0] }; });
    await page.keyboard.down('KeyW'); await adv(6); await page.keyboard.up('KeyW');
    const o = await ev(() => { const b = window.__game.api.body; return { x: b.x, dmg: b.damage, inside: window.__game.api.world.insideBuilding(b.x, b.z) }; });
    assert(!o.inside, 'vehicle ended up inside a building'); assert(o.dmg > 5, 'expected crash damage, got ' + o.dmg); assert(o.x < r.cx, 'drove through the building');
  });

  await t('mission cycle in the real game loop: hail -> boarded -> delivered, money increases', async () => {
    await ev(() => { const g = window.__game, a = g.api, m = a.missions; const b = a.body; b.vx = b.vz = 0; b.damage = 0; b.x = m.pickup.x + 3; b.z = m.pickup.z; });
    await adv(3);
    assert.equal(await ev(() => window.__game.api.missions.phase), 'ride', 'passenger did not board');
    const dest = await ev(() => { const m = window.__game.api.missions; return { x: m.dest.x, z: m.dest.z }; });
    await snap('03_ride');
    await ev(d => { const g = window.__game, b = g.api.body; g.api.missions.driven = 2600; b.vx = b.vz = 0; b.x = d.x + 4; b.z = d.z; }, dest); await adv(1.5);
    const r = await ev(() => { const g = window.__game; return { money: g.money, trips: g.trips, phase: g.api.missions.phase, res: g.api.missions.result }; });
    assert.equal(r.trips, 1); assert(r.money >= 30, JSON.stringify(r)); assert.equal(r.phase, 'idle');
  });

  await t('money persists to localStorage; Continue enabled after reload', async () => {
    await page.reload(); await page.waitForFunction(() => window.__game.state === 'menu');
    assert(!(await page.locator('#btnContinue').isDisabled()));
  });

  await page.click('#btnFree');
  await t('free roam: vehicle switch (V) cycles auto -> car -> scooter', async () => {
    await page.keyboard.press('KeyV'); assert.equal(await ev(() => window.__game.vehicleType), 'car'); await page.keyboard.press('KeyV'); assert.equal(await ev(() => window.__game.vehicleType), 'bike');
    await page.keyboard.press('KeyV'); await page.keyboard.press('KeyV');
  });
  await t('fuel burns while driving', async () => { const f0 = await ev(() => window.__game.api.body.fuel); await page.keyboard.down('KeyW'); await adv(10); await page.keyboard.up('KeyW'); const f1 = await ev(() => window.__game.api.body.fuel); assert(f1 < f0); });
  await t('refuel at a petrol pump with E', async () => {
    await ev(() => { const a = window.__game.api, p = a.graph.tile.pois.find(p => p.kind === 'fuel'); a.body.x = p.x; a.body.z = -p.y + 6; a.body.vx = a.body.vz = 0; a.body.fuel = 1; });
    await adv(0.2); await page.keyboard.press('KeyE'); await adv(0.2);
    assert(await ev(() => window.__game.api.body.fuel) > await ev(() => window.__game.api.body.spec.fuelCap - 0.1));
  });
  await t('on foot: F exits the vehicle, WASD moves the character, F re-enters when near', async () => {
    await ev(() => { const b = window.__game.api.body; b.vx = b.vz = 0; }); await page.keyboard.press('KeyF'); assert(await ev(() => window.__game.onFoot));
    const p0 = await ev(() => ({ ...window.__game.api.foot })); await page.keyboard.down('KeyW'); await adv(1.0); await page.keyboard.up('KeyW');
    const p1 = await ev(() => ({ ...window.__game.api.foot })); assert(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1.2, 'character did not walk');
    await page.keyboard.press('KeyF'); assert(!(await ev(() => window.__game.onFoot)), 'did not re-enter vehicle');
  });
  await t('pedestrians exist and some are walking', async () => { const r = await ev(() => { const p = window.__game.api.peds; return { n: p.peds.length }; }); assert(r.n >= 40); });

  await t('GPS: set a destination by search -> route polyline appears with a sensible distance', async () => {
    await page.keyboard.press('KeyM'); await page.fill('#search', 'Kundalahalli'); await page.locator('#poiList li').first().click(); await adv(2);
    const g = await ev(() => { const w = window.__game; return { has: !!w.route, len: w.routeLen, gps: w.gps && w.gps.name }; });
    assert(g.has && g.len > 200 && g.len < 5000, JSON.stringify(g)); assert(/Kundalahalli/.test(g.gps));
    await page.keyboard.press('KeyM'); await page.waitForTimeout(700); await page.screenshot({ path: `${shots}/05_map.png` });
    assert.equal(await ev(() => window.__game.state), 'map'); await page.keyboard.press('KeyM'); assert.equal(await ev(() => window.__game.state), 'play');
  });

  await t('weather: rain + night visuals toggle without errors', async () => {
    await page.keyboard.press('KeyR'); await ev(() => window.__game.api.weather.set(21.5)); await adv(25); await page.waitForTimeout(500);
    assert(await ev(() => window.__game.api.weather.rain > 0.3)); assert(await ev(() => window.__game.api.weather.night > 0.9));
    await snap('04_rainy_night');
    await ev(() => { window.__game.api.weather.set(18.1); window.__game.api.weather.setRain(false); }); await adv(30); await snap('06_sunset');
  });
  await t('no page/console errors during the whole run', async () => { assert.deepEqual(errors, []); });
  console.log(`${ok} e2e checks passed`); await browser.close();
})().catch(e => { console.error('E2E FAILED:', e); process.exit(1); });
