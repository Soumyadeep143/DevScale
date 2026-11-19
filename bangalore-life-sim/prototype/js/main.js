import * as THREE from '../vendor/three.module.js';
import { RoadGraph } from './graph.js';
import { World } from './world.js';
import { VehicleBody, SPECS, buildModel } from './vehicles.js';
import { TrafficSystem } from './traffic.js';
import { PedSystem, buildPerson } from './peds.js';
import { Weather } from './weather.js';
import { GameAudio } from './audio.js';
import { AutoMissions } from './missions.js';
import { MapView, toast, $, arrowFor } from './ui.js';

const SAVE_KEY = 'bls_save_v1';
const G = window.__game = { state: 'loading', mode: 'free', vehicleType: 'auto', onFoot: false, money: 0, trips: 0, settings: { traffic: 80, peds: 50 }, cam: 0, keys: {}, interact: false };
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } };
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ money: G.money, trips: G.trips, vehicle: G.vehicleType })); } catch { /* storage may be blocked */ } };

// ---------------------------------------------------------------- renderer / scene
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1400);
function resize() { renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * (G.settings.scale ?? 1)); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

const audio = new GameAudio();
let graph, world, traffic, peds, weather, missions, mapView, tile;
let body, bodyMesh, foot, footMesh, headlight, pickupBeam, destBeam, wpBeam, passengerMesh;
const obstacles = [];

const beam = (c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })); m.position.y = 30; const g = new THREE.Group(); g.add(m); g.visible = false; scene.add(g); return g; };

async function boot() {
  tile = await (await fetch('data/marathahalli.json')).json();
  graph = new RoadGraph(tile); world = new World(scene, graph);
  weather = new Weather(scene, renderer, world);
  traffic = new TrafficSystem(graph, {
    makeMesh: type => { const m = buildModel(type, type === 'car' ? [0xb02a2a, 0xe8e8e8, 0x2f4f8a, 0x222222, 0x8a8a8a, 0x4a7a4a][Math.floor(Math.random() * 6)] : type === 'bike' ? [0x2255aa, 0xaa2222, 0x222, 0x777][Math.floor(Math.random() * 4)] : undefined); scene.add(m); return m; },
    honk: (d, type) => { if (d < 80) audio.honk(type, Math.max(0.02, 0.28 * (1 - d / 80))); },
  });
  peds = new PedSystem(scene, graph, tile.pois);
  missions = new AutoMissions(graph, tile.pois);
  mapView = new MapView(graph, tile);
  headlight = new THREE.SpotLight(0xfff2cc, 0, 70, 0.55, 0.6, 1.2); scene.add(headlight, headlight.target);
  pickupBeam = beam(0xffc928); destBeam = beam(0x2fe0ff); wpBeam = beam(0x4a8cff);
  footMesh = buildPerson(); footMesh.visible = false; scene.add(footMesh);
  // POI landmark pillars (fuel stations / named places) so they are findable in the world
  for (const p of tile.pois) if (p.kind !== 'bus_stop') { const col = p.kind === 'fuel' ? 0xff9f43 : 0xffffff; const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25 })); m.position.set(p.x, 4.5, -p.y); scene.add(m); }
  setupUI(); resize();
  const sv = load(); if (sv) { $('saveInfo').textContent = `₹${sv.money} · ${sv.trips} trips`; } else $('btnContinue').disabled = true;
  if (tile.meta.approximate) $('approxNote').textContent = '⚠ Map geometry is an APPROXIMATE STAND-IN (hand-placed roads/buildings around the Marathahalli bridge), not real OpenStreetMap data. Run tools/osm_pipeline on your machine to load the real map — see README.';
  $('loading').classList.add('hidden'); $('menu').classList.remove('hidden'); G.state = 'menu';
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- game start
function spawnPose() {
  let best = null, bd = 1e9;
  for (const e of graph.edges) { const p = graph.sample(e, e.len / 2); const d = Math.hypot(p.x + 150, p.z - 10) + (p.dx > 0.7 ? 0 : 400); if (d < bd) { bd = d; best = e; } }
  const p = graph.sample(best, best.len / 2), lane = best.width * 0.28;
  return { x: p.x + p.dz * lane, z: p.z - p.dx * lane, h: Math.atan2(p.dx, p.dz) };
}
function setVehicle(type, pose) {
  if (bodyMesh) scene.remove(bodyMesh);
  const old = body; body = new VehicleBody(type); G.vehicleType = type;
  const ps = pose ?? (old ? { x: old.x, z: old.z, h: old.h } : spawnPose()); body.x = ps.x; body.z = ps.z; body.h = ps.h;
  bodyMesh = buildModel(type, type === 'car' ? 0xc0392b : undefined); scene.add(bodyMesh); body.apply(bodyMesh);
}
function startGame(mode, newGame = false) {
  audio.start(); audio.setMaster(+$('setVol').value);
  G.mode = mode; G.state = 'play'; G.onFoot = false; G.gps = null; G.cam = 0; G.camSnap = true;
  if (newGame) { G.money = 0; G.trips = 0; save(); } else { const sv = load(); if (sv && mode !== 'free') { G.money = sv.money; G.trips = sv.trips; } }
  if (mode === 'auto' && G.vehicleType !== 'auto') G.vehicleType = 'auto';
  setVehicle(G.vehicleType, spawnPose());
  traffic.populate(0); traffic.populate(G.settings.traffic, body); peds.populate(0); peds.populate(G.settings.peds, body);
  missions.reset(); pickupBeam.visible = destBeam.visible = false;
  if (mode === 'auto') { missions.offer(body); toast('Find the passenger — yellow beam on your map'); }
  $('modeLbl').textContent = mode === 'auto' ? 'Auto Driver Mode' : 'Free Roam';
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
}

// ---------------------------------------------------------------- UI wiring
function setupUI() {
  const sel = $('vehSel');
  for (const k of ['auto', 'car', 'bike']) { const d = document.createElement('div'); d.className = 'veh' + (k === G.vehicleType ? ' sel' : ''); d.dataset.k = k; d.innerHTML = `<b>${SPECS[k].name}</b><small>${Math.round(SPECS[k].maxV * 3.6)} km/h</small>`; d.onclick = () => { G.vehicleType = k; [...sel.children].forEach(c => c.classList.toggle('sel', c === d)); }; sel.appendChild(d); }
  $('btnNew').onclick = () => startGame('auto', true); $('btnContinue').onclick = () => { const sv = load(); if (sv) G.vehicleType = sv.vehicle ?? 'auto'; startGame('auto'); };
  $('btnAuto').onclick = () => startGame('auto'); $('btnFree').onclick = () => startGame('free');
  $('btnSettings').onclick = () => $('settings').classList.toggle('hidden');
  $('setShadows').onchange = e => { weather.sun.castShadow = e.target.checked; };
  $('setScale').oninput = e => { G.settings.scale = +e.target.value; resize(); };
  $('setTraffic').oninput = e => { G.settings.traffic = +e.target.value; if (G.state !== 'menu') traffic.populate(G.settings.traffic, body); };
  $('setPeds').oninput = e => { G.settings.peds = +e.target.value; if (G.state !== 'menu') peds.populate(G.settings.peds, body); };
  $('setVol').oninput = e => audio.setMaster(+e.target.value);
  $('btnResume').onclick = () => togglePause(false); $('btnQuit').onclick = () => { $('pause').classList.add('hidden'); $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); G.state = 'menu'; save(); };
  // map
  const list = $('poiList'), draw = () => { const q = $('search').value.toLowerCase(); list.innerHTML = ''; for (const p of tile.pois.filter(p => p.kind !== 'bus_stop' && p.name.toLowerCase().includes(q))) { const li = document.createElement('li'); li.textContent = p.name; li.onclick = () => { setGps(p.x, -p.y, p.name); toggleMap(false); }; list.appendChild(li); } };
  $('search').oninput = draw; draw();
  $('clearGps').onclick = () => { G.gps = null; G.userGps = false; };
  $('bigmap').onclick = e => { const r = e.target.getBoundingClientRect(), w = mapView.bigToWorld((e.clientX - r.left) * e.target.width / r.width, (e.clientY - r.top) * e.target.height / r.height); setGps(w.x, w.z, 'Waypoint'); toggleMap(false); };
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    G.keys[e.code] = true; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (G.state !== 'play' && G.state !== 'map') { if (e.code === 'Escape' && G.state === 'pause') togglePause(false); return; }
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyE': G.interact = true; break;
      case 'KeyH': audio.honk(G.vehicleType, 0.4); break;
      case 'KeyC': G.cam = (G.cam + 1) % 3; break;
      case 'KeyM': toggleMap(G.state !== 'map'); break;
      case 'KeyR': weather.setRain(weather.rainTarget < 0.5); toast(weather.rainTarget > 0.5 ? 'Monsoon shower' : 'Clearing up'); break;
      case 'KeyT': weather.speed = weather.speed === 1 ? 20 : weather.speed === 20 ? 90 : 1; toast(`Time ×${weather.speed}`); break;
      case 'BracketLeft': weather.set(weather.hour - 1); break; case 'BracketRight': weather.set(weather.hour + 1); break;
      case 'KeyV': if (G.mode === 'free' && !G.onFoot) { const o = ['auto', 'car', 'bike']; setVehicle(o[(o.indexOf(G.vehicleType) + 1) % 3]); toast(SPECS[G.vehicleType].name); } break;
      case 'KeyF': toggleFoot(); break;
      case 'Escape': if (G.state === 'map') toggleMap(false); else togglePause(true); break;
    }
  });
  addEventListener('keyup', e => { G.keys[e.code] = false; });
  addEventListener('blur', () => { G.keys = {}; });
}
function togglePause(on) { if (on) { G.state = 'pause'; $('pause').classList.remove('hidden'); } else { G.state = 'play'; $('pause').classList.add('hidden'); } }
function toggleMap(on) { G.state = on ? 'map' : 'play'; $('fullmap').classList.toggle('hidden', !on); }
function setGps(x, z, name) { G.gps = { x, z, name }; G.userGps = true; G.gpsT = 99; toast(`GPS: ${name}`); }

function toggleFoot() {
  if (!G.onFoot) { if (body.speed > 3) { toast('Stop first'); return; } G.onFoot = true; body.vx = body.vz = 0; foot = { x: body.x + body.lx * 1.8, z: body.z + body.lz * 1.8, h: body.h }; footMesh.visible = true; }
  else { if (Math.hypot(foot.x - body.x, foot.z - body.z) > 4.5) { toast('Too far from your vehicle'); return; } G.onFoot = false; footMesh.visible = false; }
}

// ---------------------------------------------------------------- simulation
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpV = new THREE.Vector3();
let last = performance.now(), acc = 0, fuelWarn = 0, sigCool = 0, nextOffer = 0;
const input = { throttle: 0, reverse: 0, brake: 0, steer: 0, hand: 0 };

function readInput() {
  const k = G.keys, up = k.KeyW || k.ArrowUp, dn = k.KeyS || k.ArrowDown;
  input.steer = ((k.KeyA || k.ArrowLeft) ? 1 : 0) - ((k.KeyD || k.ArrowRight) ? 1 : 0);
  input.throttle = up ? 1 : 0; input.reverse = 0; input.brake = 0;
  if (dn) { if (body.fwdSpeed > 0.8) input.brake = 1; else input.reverse = 1; }
  if (up && body.fwdSpeed < -0.8) { input.brake = 1; input.throttle = 0; }
  input.hand = k.Space ? 1 : 0;
}
function circlesOf(o) { const n = Math.max(1, Math.min(3, Math.ceil(o.len / o.wid))), r = o.wid / 2, out = [], span = (o.len - o.wid) / 2; for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : (i / (n - 1) * 2 - 1) * span; out.push([o.x + Math.sin(o.h) * t, o.z + Math.cos(o.h) * t, r]); } return out; }

function physics(dt) {
  // vehicle
  if (!G.onFoot) {
    readInput();
    const road = graph.nearestRoad(body.x, body.z), off = !road.road || road.dist > road.road.width / 2 + 3.5;
    body.step(dt, input, { wet: weather.rain > 0.3, offroad: off });
  } else { body.vx *= 0.9; body.vz *= 0.9; body.step(dt, { brake: 1, steer: 0 }, {}); }
  const shell = { x: body.x, z: body.z, h: body.h, len: body.spec.len, wid: body.spec.wid };
  let impact = 0;
  for (const [cx, cz, r] of circlesOf(shell)) {
    const c = world.collideCircle(cx, cz, r); if (c) impact = Math.max(impact, body.bump(c.nx, c.nz, c.depth, 0.2));
  }
  // traffic collisions
  const me = { x: body.x, z: body.z, h: body.h, len: body.spec.len, wid: body.spec.wid }, mine = circlesOf(me);
  traffic.neighbours(body.x, body.z, 9, o => {
    if (o.__player) return; const oc = circlesOf({ x: o.x, z: o.z, h: Math.atan2(o.hx ?? 0, o.hz ?? 1), len: o.len ?? 3, wid: o.wid ?? 1.6 });
    for (const [ax, az, ar] of mine) for (const [bx, bz, br] of oc) {
      const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), rr = ar + br; if (d < rr && d > 1e-4) {
        const nx = dx / d, nz = dz / d, rel = Math.max(0, (o.vx ?? 0) * nx + (o.vz ?? 0) * nz); // closing speed of obstacle
        const imp = body.bump(nx, nz, (rr - d) * 0.9, 0.15, 0.8) + rel * 0.3; impact = Math.max(impact, imp); if (o.hold !== undefined) { o.hold = 1.5; o.v = Math.min(o.v, 1); }
      }
    }
  });
  if (impact > 2.5) { audio.crash(impact); if (impact > 6 && performance.now() - (G.lastCrashToast ?? 0) > 2500) { toast('Crash!'); G.lastCrashToast = performance.now(); } }
  // pedestrians
  if (!G.onFoot && body.speed > 0.5) { const n = peds.hit(body.x + body.fx * body.spec.len * 0.4, body.z + body.fz * body.spec.len * 0.4, body.spec.wid / 2 + 0.2, body.speed); if (n) { body.vx *= 0.7; body.vz *= 0.7; penalty('Pedestrian hit', 150); } }
  // on-foot
  if (G.onFoot) {
    const k = G.keys, run = k.ShiftLeft || k.ShiftRight, sp = run ? 4.6 : 1.8;
    const turn = ((k.KeyA || k.ArrowLeft) ? 1 : 0) - ((k.KeyD || k.ArrowRight) ? 1 : 0), fw = ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0);
    foot.h += turn * 2.2 * dt; foot.x += Math.sin(foot.h) * fw * sp * dt; foot.z += Math.cos(foot.h) * fw * sp * dt;
    const c = world.collideCircle(foot.x, foot.z, 0.4); if (c) { foot.x += c.nx * c.depth; foot.z += c.nz * c.depth; }
    const c2 = Math.hypot(foot.x - body.x, foot.z - body.z); if (c2 < 1.5) { foot.x += (foot.x - body.x) / (c2 || 1) * (1.5 - c2); foot.z += (foot.z - body.z) / (c2 || 1) * (1.5 - c2); }
    footMesh.position.set(foot.x, 0, foot.z); footMesh.rotation.y = foot.h; const sw = fw ? Math.sin(performance.now() * 0.012 * (run ? 1.6 : 1)) * 0.6 : 0; footMesh.userData.legs[0].rotation.x = sw; footMesh.userData.legs[1].rotation.x = -sw;
  }
}
function penalty(msg, amt) { if (performance.now() - (G.penT ?? 0) < 1500) return; G.penT = performance.now(); if (G.mode === 'auto') { G.money = Math.max(0, G.money - amt); toast(`${msg}: −₹${amt}`); } else toast(msg); }

function logic(dt) {
  weather.update(dt, G.onFoot ? tmpV.set(foot.x, 0, foot.z) : tmpV.set(body.x, 0, body.z)); world.updateSignals(traffic.t);
  const player = { x: body.x, z: body.z, vx: body.vx, vz: body.vz, len: body.spec.len, wid: body.spec.wid, __player: true };
  obstacles.length = 0; if (G.onFoot) obstacles.push({ x: body.x, z: body.z, vx: 0, vz: 0, len: body.spec.len, wid: body.spec.wid });
  traffic.update(dt, G.onFoot ? { ...player, x: foot.x, z: foot.z } : player, obstacles);
  peds.update(dt, G.onFoot ? foot : body, (x, z, r, cb) => { traffic.neighbours(x, z, r, o => { if (Math.hypot(o.x - x, o.z - z) < r + (o.wid ?? 1) / 2 && (o.v ?? Math.hypot(o.vx ?? 0, o.vz ?? 0)) > 1) cb(); }); });
  // fuel / refuel
  if (!G.onFoot) {
    const pump = tile.pois.find(p => p.kind === 'fuel' && Math.hypot(p.x - body.x, -p.y - body.z) < 16);
    G.atPump = !!pump && body.speed < 1.5;
    if (G.atPump && G.interact) { const need = body.spec.fuelCap - body.fuel, cost = Math.round(need * 103); if (need < 0.2) toast('Tank already full'); else if (G.mode === 'auto' && G.money < cost) toast(`Need ₹${cost} to refuel`); else { body.fuel = body.spec.fuelCap; if (G.mode === 'auto') G.money -= cost; toast(`Refuelled ${need.toFixed(1)} L${G.mode === 'auto' ? ` (−₹${cost})` : ''}`); audio.ding(); } }
    fuelWarn -= dt; if (body.fuel / body.spec.fuelCap < 0.12 && fuelWarn <= 0) { toast(body.fuel <= 0 ? 'Out of fuel! Walk to a petrol pump (orange pillar)' : 'Low fuel'); fuelWarn = 20; }
  }
  // signal advisory + violation
  const fwdX = body.fx, fwdZ = body.fz; let sigTxt = '';
  if (!G.onFoot) for (const [eid] of graph.sigGroup) {
    const e = graph.edges[eid], end = e.pts[e.pts.length - 1], a = e.pts[e.pts.length - 2], dx = end.x - a.x, dz = end.z - a.z, L = Math.hypot(dx, dz) || 1;
    const rx = end.x - body.x, rz = end.z - body.z, d = Math.hypot(rx, rz);
    if (d < 70 && (dx / L) * fwdX + (dz / L) * fwdZ > 0.8 && (rx * fwdX + rz * fwdZ) > -3) {
      const st = graph.signalState(eid, traffic.t); sigTxt = `Signal ahead ${Math.round(d)} m: ${st === 'G' ? '🟢 green' : st === 'A' ? '🟡 amber' : '🔴 red'}`;
      sigCool -= dt; if (st === 'R' && d < 5 && body.speed > 4 && sigCool <= 0) { sigCool = 8; penalty('Red light jumped', 200); }
    }
  }
  $('signal').textContent = sigTxt; $('signal').classList.toggle('hidden', !sigTxt);
  // missions
  if (G.mode === 'auto') {
    const inAuto = !G.onFoot && G.vehicleType === 'auto';
    const ev = missions.update(dt, { x: body.x, z: body.z, speed: body.speed, inAuto, damage: body.damage, night: weather.night > 0.6, interact: G.interact });
    if (ev === 'boarded') { toast(`Passenger: “${missions.line}” → ${missions.dest.name}`); audio.ding(); G.gps = { ...missions.dest }; G.userGps = false; if (passengerMesh) { scene.remove(passengerMesh); passengerMesh = null; } G.gpsT = 99; }
    if (ev === 'delivered') { const r = missions.result; G.money += r.total; G.trips++; save(); toast(`Fare ₹${r.base}${r.tip ? ` + tip ₹${r.tip}` : ''}${r.penalty ? ` − damage ₹${r.penalty}` : ''} = ₹${r.total}`); audio.ding(); G.gps = null; nextOffer = 4; }
    if (missions.phase === 'idle' && nextOffer > 0) { nextOffer -= dt; if (nextOffer <= 0) { missions.offer(body); toast('New passenger waiting'); } }
    if (missions.phase === 'hail' && !G.userGps) G.gps = { x: missions.pickup.x, z: missions.pickup.z, name: 'Passenger' };
    if (missions.phase === 'hail' && !passengerMesh) { passengerMesh = buildPerson(); passengerMesh.position.set(missions.pickup.x, 0, missions.pickup.z); scene.add(passengerMesh); }
    pickupBeam.visible = missions.phase === 'hail'; if (pickupBeam.visible) pickupBeam.position.set(missions.pickup.x, 0, missions.pickup.z);
    destBeam.visible = missions.phase === 'ride'; if (destBeam.visible) destBeam.position.set(missions.dest.x, 0, missions.dest.z);
    if (G.vehicleType !== 'auto' && missions.phase !== 'idle') G.vehicleType = 'auto';
  }
  wpBeam.visible = !!(G.gps && G.userGps); if (wpBeam.visible) wpBeam.position.set(G.gps.x, 0, G.gps.z);
  // GPS route refresh
  G.gpsT = (G.gpsT ?? 99) + dt;
  if (G.gps && G.gpsT > 1.2) {
    G.gpsT = 0; const a = graph.nearestNode(body.x, body.z), b = graph.nearestNode(G.gps.x, G.gps.z), r = graph.route(a, b);
    if (r) { const poly = [{ x: body.x, z: body.z }, ...graph.routePolyline(r), { x: G.gps.x, z: G.gps.z }]; G.route = poly; G.routeLen = r.length + Math.hypot(graph.nodes[a].x - body.x, graph.nodes[a].z - body.z) + Math.hypot(graph.nodes[b].x - G.gps.x, graph.nodes[b].z - G.gps.z); G.routeSigs = r.edges.filter(id => graph.nodes[graph.edges[id].to].sig).length; }
  }
  if (!G.gps) { G.route = null; }
  G.interact = false;
}

function updateCamera(dt) {
  const t = G.onFoot ? { x: foot.x, z: foot.z, h: foot.h, spec: { len: 1 } } : body, cam = bodyMesh.userData.cam ?? { h: 2, d: 6 };
  const dist = G.onFoot ? 4 : cam.d + (G.cam === 1 ? 9 : 0) + Math.min(2, (G.onFoot ? 0 : body.speed) * 0.05), height = G.onFoot ? 2.2 : cam.h + (G.cam === 1 ? 6 : 0);
  let tx, ty, tz;
  if (G.cam === 2 && !G.onFoot) { tx = t.x + Math.sin(t.h) * 0.4; ty = cam.h * 0.62; tz = t.z + Math.cos(t.h) * 0.4; }
  else { tx = t.x - Math.sin(t.h) * dist; ty = height; tz = t.z - Math.cos(t.h) * dist; }
  const k = (G.cam === 2 || G.camSnap) ? 1 : 1 - Math.exp(-dt * 6); G.camSnap = false; camPos.x += (tx - camPos.x) * k; camPos.y += (ty - camPos.y) * k; camPos.z += (tz - camPos.z) * k;
  camera.position.copy(camPos);
  camLook.set(t.x + Math.sin(t.h) * (G.cam === 2 ? 20 : 8), G.cam === 2 ? ty - 0.2 : 1.2, t.z + Math.cos(t.h) * (G.cam === 2 ? 20 : 8)); camera.lookAt(camLook);
  camera.fov += ((62 + Math.min(14, (G.onFoot ? 0 : body.speed) * 0.35)) - camera.fov) * 0.1; camera.updateProjectionMatrix();
  // headlight follows vehicle at night
  headlight.intensity = G.onFoot ? 0 : Math.max(0, weather.night - 0.2) * 900 + weather.rain * 120;
  headlight.position.set(body.x + body.fx * 1.2, 1, body.z + body.fz * 1.2); headlight.target.position.set(body.x + body.fx * 25, 0, body.z + body.fz * 25);
  bodyMesh.visible = !(G.cam === 2 && !G.onFoot);
}

function updateHUD() {
  const spd = Math.round(body.speed * 3.6); $('spd').textContent = spd;
  $('fuelBar').style.width = (body.fuel / body.spec.fuelCap * 100) + '%'; $('fuelBar').style.background = body.fuel / body.spec.fuelCap < 0.15 ? '#ff5a4a' : '#4cd18a';
  $('dmgBar').style.width = body.damage + '%'; $('clock').textContent = weather.timeString; $('wx').textContent = weather.rain > 0.3 ? 'Rain' : weather.rain > 0.05 ? 'Drizzle' : 'Clear';
  $('moneyV').textContent = G.money; $('money').classList.toggle('hidden', G.mode !== 'auto');
  // mission panel
  const mp = $('mission'); let html = '';
  if (G.mode === 'auto') {
    if (missions.phase === 'hail') { const d = Math.hypot(missions.pickup.x - body.x, missions.pickup.z - body.z); html = `<b>Passenger waiting</b><br>${Math.round(d)} m away — stop beside the yellow beam`; }
    else if (missions.phase === 'ride') { const d = Math.hypot(missions.dest.x - body.x, missions.dest.z - body.z), left = Math.max(0, missions.limit - missions.t); html = `<b>Drop at ${missions.dest.name}</b><br>Meter ₹${missions.fare} · ${(missions.driven / 1000).toFixed(2)} km<br>${Math.round(d)} m to go · tip window ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`; }
    else html = `<b>Auto Driver</b><br>Next passenger shortly…`;
    if (G.vehicleType !== 'auto') html += '<br>Switch to the auto-rickshaw for fares.';
  }
  if (G.atPump) html += `${html ? '<br>' : ''}<b>Petrol pump</b> — press E to refuel`;
  if (G.onFoot) html += `${html ? '<br>' : ''}On foot — F near your vehicle to get back in`;
  mp.innerHTML = html; mp.classList.toggle('hidden', !html);
  // GPS panel
  if (G.gps && G.route) {
    let dist = 0, look = null; for (let i = 1; i < G.route.length; i++) { dist += Math.hypot(G.route[i].x - G.route[i - 1].x, G.route[i].z - G.route[i - 1].z); if (dist > 35 && !look) look = G.route[i]; }
    const remain = Math.round(G.routeLen ?? dist), eta = Math.round(remain / 7 / 60 * 10) / 10 + (G.routeSigs ?? 0) * 0.4;
    let arrow = '↑'; if (look) { const a = Math.atan2(look.x - body.x, look.z - body.z) - body.h; arrow = arrowFor(Math.atan2(Math.sin(a), Math.cos(a))); }
    $('gpsArrow').textContent = arrow; $('gpsTxt').innerHTML = `${G.gps.name}<br>${remain >= 1000 ? (remain / 1000).toFixed(1) + ' km' : remain + ' m'} · ~${eta.toFixed(0)} min`;
  } else { $('gpsArrow').textContent = '•'; $('gpsTxt').textContent = 'No route — press M'; }
  const markers = []; if (G.mode === 'auto') { if (missions.phase === 'hail') markers.push({ x: missions.pickup.x, z: missions.pickup.z, color: '#ffc928' }); if (missions.phase === 'ride') markers.push({ x: missions.dest.x, z: missions.dest.z, color: '#2fe0ff' }); }
  if (G.gps && G.userGps) markers.push({ x: G.gps.x, z: G.gps.z, color: '#4a8cff' });
  const pos = G.onFoot ? foot : body;
  G.mapState = { x: pos.x, z: pos.z, h: pos.h, route: G.route, markers };
  mapView.drawMini($('mini').getContext('2d'), G.mapState);
  if (G.state === 'map') mapView.drawBig($('bigmap').getContext('2d'), G.mapState);
}

/** deterministic fast-forward (used by tests and tooling; does not render) */
G.advance = (secs) => { const n = Math.round(secs * 20); for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) physics(1 / 60); logic(1 / 20); } body.apply(bodyMesh); updateCamera(0.05); updateHUD(); };
G.api = { get foot() { return foot; }, get body() { return body; }, get graph() { return graph; }, get traffic() { return traffic; }, get missions() { return missions; }, get peds() { return peds; }, get weather() { return weather; }, get camera() { return camera; }, get world() { return world; }, get scene() { return scene; } };

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === 'play' || G.state === 'map') {
    acc += dt; while (acc >= 1 / 60) { physics(1 / 60); acc -= 1 / 60; }
    logic(dt); body.apply(bodyMesh); updateCamera(dt); updateHUD();
    audio.setEngine(G.vehicleType, Math.min(1, body.speed / body.spec.maxV), input.throttle, !G.onFoot && body.fuel > 0); audio.setRain(weather.rain);
  } else if (G.state === 'menu') {  // slow orbit behind menu
    weather.update(dt, tmpV.set(0, 0, 0)); world.updateSignals(performance.now() / 1000); const a = now / 12000; camera.position.set(Math.sin(a) * 160, 55, Math.cos(a) * 160); camera.lookAt(0, 8, 0);
  }
  renderer.render(scene, camera);
}
boot().catch(e => { document.getElementById('loading').textContent = 'Failed to load: ' + e.message; console.error(e); });
