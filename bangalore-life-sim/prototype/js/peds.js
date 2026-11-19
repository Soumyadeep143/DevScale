import * as THREE from '../vendor/three.module.js';

const SKIN = [0x8d5a3c, 0xa8704a, 0x6e4430, 0xc08a5e], CLOTH = [0x2f5d8a, 0xb23a3a, 0x3d7a4a, 0xd0a030, 0x6a4a8a, 0xe8e0d0, 0x444444, 0xc65d2e];
const geo = { body: new THREE.CapsuleGeometry(0.2, 0.6, 3, 8), head: new THREE.SphereGeometry(0.13, 10, 8), leg: new THREE.BoxGeometry(0.11, 0.7, 0.13) };

export function buildPerson(rnd = Math.random) {
  const g = new THREE.Group(), cloth = new THREE.MeshStandardMaterial({ color: CLOTH[Math.floor(rnd() * CLOTH.length)], roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[Math.floor(rnd() * SKIN.length)], roughness: 0.8 });
  const body = new THREE.Mesh(geo.body, cloth); body.position.y = 1.15; body.castShadow = true;
  const head = new THREE.Mesh(geo.head, skin); head.position.y = 1.78;
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.9 });
  const l = new THREE.Mesh(geo.leg, dark), r = new THREE.Mesh(geo.leg, dark); l.position.set(-0.08, 0.38, 0); r.position.set(0.08, 0.38, 0);
  l.geometry.translate && 0; g.add(body, head, l, r); g.userData.legs = [l, r]; g.userData.skin = skin; return g;
}

/** Pedestrians walk along sidewalks following graph edges; some idle at bus stops. */
export class PedSystem {
  constructor(scene, graph, pois) {
    this.scene = scene; this.g = graph; this.peds = []; this.rnd = Math.random; this.t = 0; this.bumped = 0;
    this.stops = pois.filter(p => p.kind === 'bus_stop').map(p => ({ x: p.x, z: -p.y }));
    this.edges = graph.edges.filter(e => e.len > 15 && e.width < 14);
  }
  populate(n, near) {
    while (this.peds.length < n) this.peds.push(this._spawn(near));
    while (this.peds.length > n) { const p = this.peds.pop(); this.scene.remove(p.mesh); }
  }
  _spawn(near, p = null) {
    for (let k = 0; k < 40; k++) {
      const e = this.edges[Math.floor(this.rnd() * this.edges.length)], s = this.rnd() * e.len, q = this.g.sample(e, s);
      if (near) { const d = Math.hypot(q.x - near.x, q.z - near.z); if (d < 40 || d > 260) continue; }
      const side = this.rnd() < 0.5 ? 1 : -1, off = e.width / 2 + 1.4 + this.rnd() * 0.5;
      const ped = p ?? { mesh: buildPerson(this.rnd), phase: this.rnd() * 6.28 };
      Object.assign(ped, { e: e.id, s, side, off, v: 0.9 + this.rnd() * 0.7, idle: 0, down: 0, x: 0, z: 0 });
      if (!p) this.scene.add(ped.mesh);
      this._place(ped); return ped;
    }
    if (p) return p;
    const ped = { mesh: buildPerson(this.rnd), phase: 0, e: 0, s: 0, side: 1, off: 8, v: 1, idle: 0, down: 0, x: 1e5, z: 1e5 }; this.scene.add(ped.mesh); return ped;
  }
  _place(p) {
    const e = this.g.edges[p.e], q = this.g.sample(e, p.s);
    p.x = q.x + q.dz * p.off * p.side; p.z = q.z - q.dx * p.off * p.side; p.hx = q.dx; p.hz = q.dz;
    p.mesh.position.set(p.x, 0, p.z); p.mesh.rotation.y = Math.atan2(q.dx, q.dz);
  }
  update(dt, player, vehiclesNear) {
    this.t += dt;
    for (const p of this.peds) {
      if (player && Math.hypot(p.x - player.x, p.z - player.z) > 300) { this._spawn(player, p); continue; }
      if (p.down > 0) { p.down -= dt; p.mesh.rotation.x = -1.4; p.mesh.position.y = 0.2; if (p.down <= 0) { p.mesh.rotation.x = 0; p.mesh.position.y = 0; } continue; }
      let go = true;
      if (p.idle > 0) { p.idle -= dt; go = false; }
      else if (vehiclesNear) vehiclesNear(p.x + p.hx * 2.2, p.z + p.hz * 2.2, 2.0, () => { go = false; });
      if (go) {
        p.s += p.v * dt;
        const e = this.g.edges[p.e];
        if (p.s >= e.len) {
          const n = this.g.nodes[e.to], opts = n.out.filter(id => id !== e.rev || n.out.length === 1), nid = opts[Math.floor(this.rnd() * opts.length)], ne = this.g.edges[nid];
          p.s = 0; p.e = nid; p.side = this.rnd() < 0.5 ? 1 : -1; p.off = ne.width / 2 + 1.4 + this.rnd() * 0.5;
          if (this.rnd() < 0.25) p.idle = 2 + this.rnd() * 6; // chatting / waiting
        }
        this._place(p);
        const sw = Math.sin(this.t * 6 * p.v + p.phase) * 0.5; p.mesh.userData.legs[0].rotation.x = sw; p.mesh.userData.legs[1].rotation.x = -sw;
      } else { p.mesh.userData.legs[0].rotation.x = p.mesh.userData.legs[1].rotation.x = 0; }
    }
  }
  /** returns number of people overlapping a circle; knocks them down (they get back up) */
  hit(x, z, r, speed) {
    let n = 0;
    for (const p of this.peds) if (!p.down && Math.hypot(p.x - x, p.z - z) < r + 0.3) { n++; if (speed > 2.5) p.down = 3; else p.idle = 1; }
    return n;
  }
}
