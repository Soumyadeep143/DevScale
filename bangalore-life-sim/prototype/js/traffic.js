// Traffic AI: agents follow the directed road graph, keep left, obey signals, follow leaders (IDM),
// and misbehave a little (filtering two-wheelers, honking, squeezing through deadlocks).
export const AGENT_TYPES = {
  auto: { len: 2.7, wid: 1.45, maxV: 13.5, accel: 2.0, w: 0.30 },
  car:  { len: 4.0, wid: 1.7,  maxV: 15.5, accel: 2.2, w: 0.35 },
  bike: { len: 1.9, wid: 0.7,  maxV: 15.0, accel: 3.0, w: 0.30 },
  bus:  { len: 11,  wid: 2.5,  maxV: 12.0, accel: 1.2, w: 0.05 },
};
const rng = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(4242);

export class TrafficSystem {
  /** hooks: {makeMesh(type)->obj|null, honk(dist)} */
  constructor(graph, hooks = {}) {
    this.g = graph; this.hooks = hooks; this.agents = []; this.t = 0; this.cell = 20; this.hash = new Map();
    this.drivable = graph.edges.filter(e => e.len > 25 && e.speed > 5);
    this.rnd = rng; this.stats = { stopped: 0, honks: 0 };
  }
  pickType() { let r = this.rnd(), acc = 0; for (const [k, v] of Object.entries(AGENT_TYPES)) { acc += v.w; if (r <= acc) return k; } return 'car'; }

  populate(n, near) {
    while (this.agents.length < n) this.agents.push(this._spawn(near));
    while (this.agents.length > n) { const a = this.agents.pop(); a.mesh?.parent?.remove(a.mesh); }
  }
  _spawn(near, a = null) {
    const type = a?.type ?? this.pickType(), spec = AGENT_TYPES[type];
    for (let tries = 0; tries < 60; tries++) {
      const e = this.drivable[Math.floor(this.rnd() * this.drivable.length)], s = this.rnd() * e.len;
      const p = this.g.sample(e, s);
      if (near) { const d = Math.hypot(p.x - near.x, p.z - near.z); if (d < 90 || d > 330) continue; }
      if (this._occupied(p.x, p.z, spec.len + 4)) continue;
      const ag = a ?? { type, spec, mesh: this.hooks.makeMesh?.(type) ?? null };
      Object.assign(ag, { e: e.id, s, v: Math.min(e.speed, spec.maxV) * 0.5, lane: 0, pers: 0.8 + this.rnd() * 0.35, wob: this.rnd() * 6.28, stuck: 0, ghost: 0, x: p.x, z: p.z, hx: p.dx, hz: p.dz, honkT: 0, hold: 0 });
      this._laneFor(ag);
      return ag;
    }
    if (a) return a;
    return { type, spec, mesh: this.hooks.makeMesh?.(type) ?? null, e: 0, s: 0, v: 0, lane: 0, pers: 1, wob: 0, stuck: 0, ghost: 0, x: 1e5, z: 1e5, hx: 0, hz: 1, honkT: 0, hold: 0 };
  }
  _laneFor(a) {
    const e = this.g.edges[a.e], hw = e.width / 2;
    if (a.type === 'bike') a.laneBase = e.twoway ? hw * (0.15 + this.rnd() * 0.55) : (this.rnd() - 0.5) * hw * 1.3;
    else if (a.type === 'bus') a.laneBase = e.twoway ? hw * 0.5 : hw * 0.25;
    else a.laneBase = e.twoway ? hw * (0.35 + this.rnd() * 0.3) : (this.rnd() - 0.5) * hw * 1.1;
    if (a.type === 'auto' && e.twoway) a.laneBase = hw * (0.2 + this.rnd() * 0.5);
    if (a.lane === 0) a.lane = a.laneBase;
  }
  _occupied(x, z, r) { for (const a of this.agents) if (Math.abs(a.x - x) < r && Math.abs(a.z - z) < r) return true; return false; }

  _rebuild(extras) {
    this.hash.clear();
    const add = o => { const k = Math.floor(o.x / this.cell) * 100003 + Math.floor(o.z / this.cell); (this.hash.get(k) || this.hash.set(k, []).get(k)).push(o); };
    for (const a of this.agents) add(a); for (const o of extras) add(o);
  }
  neighbours(x, z, r, fn) {
    const c = Math.ceil(r / this.cell), cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let i = -c; i <= c; i++) for (let j = -c; j <= c; j++) { const l = this.hash.get((cx + i) * 100003 + cz + j); if (l) for (const o of l) fn(o); }
  }

  /** dt seconds; obstacles: extra {x,z,vx,vz,len,wid} objects (player, parked, etc.) */
  update(dt, player, obstacles = []) {
    this.t += dt;
    this._rebuild(player ? [player, ...obstacles] : obstacles);
    let stopped = 0;
    for (const a of this.agents) {
      // recycle far-away agents near the player
      if (player && !a.hold) { const d = Math.hypot(a.x - player.x, a.z - player.z); if (d > 420) { this._spawn(player, a); continue; } }
      const e = this.g.edges[a.e], sp = a.spec;
      const hx = a.hx, hz = a.hz, lx = hz, lz = -hx;
      const vTarget = Math.min(e.speed * a.pers, sp.maxV) * (a.type === 'bike' ? 1.1 : 1);
      let v0 = vTarget;
      // slow for the end of the edge (junction approach / sharp turn)
      const toEnd = e.len - a.s;
      if (toEnd < 14) v0 = Math.min(v0, 5 + toEnd * 0.5);
      // IDM free-road + interaction with nearest leader (and virtual leader for red signals)
      let gap = Infinity, vLead = 0;
      if (!a.ghost) this.neighbours(a.x, a.z, 22, o => {
        if (o === a) return;
        const rx = o.x - a.x, rz = o.z - a.z, f = rx * hx + rz * hz; if (f <= 0 || f > 22) return;
        const l = rx * lx + rz * lz, half = (sp.wid + (o.wid ?? 1.6)) / 2 + (a.type === 'bike' ? 0.1 : 0.35) + Math.min(0.9, f * 0.04);
        if (Math.abs(l) > half) return;
        const g = f - (sp.len + (o.len ?? 3)) / 2;
        if (g < gap) { gap = g; vLead = (o.vx ?? 0) * hx + (o.vz ?? 0) * hz; if (o.v !== undefined) vLead = o.v * (o.hx * hx + o.hz * hz); }
      });
      const st = this.g.signalState(a.e, this.t);
      if (st !== 'G' && this.g.nodes[e.to].sig) {
        const sd = toEnd - 3.5; const brakeD = a.v * a.v / (2 * 3.5);
        if (sd > -2 && (st === 'R' || sd > brakeD + 1)) { if (sd < gap) { gap = Math.max(0.1, sd); vLead = 0; } }
      }
      const amax = sp.accel, bcomf = 3.2;
      let acc = amax * (1 - Math.pow(a.v / Math.max(0.5, v0), 4));
      if (gap < Infinity) {
        const sStar = 2 + Math.max(0, a.v * 1.1 + a.v * (a.v - vLead) / (2 * Math.sqrt(amax * bcomf)));
        acc -= amax * (sStar / Math.max(0.1, gap)) ** 2;
      }
      acc = Math.max(-9, Math.min(amax, acc));
      if (a.hold > 0) { a.hold -= dt; acc = -9; }
      a.v = Math.max(0, a.v + acc * dt);
      a.s += a.v * dt;
      // stuck handling: after 7 s without moving, "squeeze through" for a few seconds, honking
      if (a.v < 0.15 && !a.hold) { a.stuck += dt; if (a.stuck > 7 && gap < 3) { a.ghost = 4; a.stuck = 0; } } else a.stuck = 0;
      if (a.ghost > 0) { a.ghost -= dt; a.v = Math.max(a.v, 1.5); }
      if (gap < 2.5 && a.v < 0.5) { a.honkT += dt; if (a.honkT > 2.5 + this.rnd() * 3) { a.honkT = 0; this.stats.honks++; if (player) this.hooks.honk?.(Math.hypot(a.x - player.x, a.z - player.z), a.type); } } else a.honkT = Math.max(0, a.honkT - dt);
      if (a.v < 0.3) stopped++;
      // advance to next edge
      while (a.s >= e.len) {
        const node = this.g.nodes[this.g.edges[a.e].to];
        const opts = node.out.filter(id => id !== this.g.edges[a.e].rev || node.out.length === 1);
        const nid = opts[Math.floor(this.rnd() * opts.length)];
        a.s -= this.g.edges[a.e].len; a.e = nid; this._laneFor(a); break;
      }
      const ce = this.g.edges[a.e]; a.s = Math.min(a.s, ce.len);
      const p = this.g.sample(ce, a.s);
      // lateral: keep left lane, bikes weave slowly
      const wob = a.type === 'bike' ? Math.sin(this.t * 0.7 + a.wob) * 0.5 : 0;
      a.lane += ((a.laneBase + wob) - a.lane) * Math.min(1, dt * 1.5);
      a.x = p.x + p.dz * a.lane; a.z = p.z - p.dx * a.lane;
      // smooth heading toward path direction
      const k = Math.min(1, dt * 6); a.hx += (p.dx - a.hx) * k; a.hz += (p.dz - a.hz) * k; const hl = Math.hypot(a.hx, a.hz) || 1; a.hx /= hl; a.hz /= hl;
      a.vx = a.hx * a.v; a.vz = a.hz * a.v; a.len = sp.len; a.wid = sp.wid;
      if (a.mesh) { a.mesh.position.set(a.x, 0, a.z); a.mesh.rotation.y = Math.atan2(a.hx, a.hz); }
    }
    this.stats.stopped = stopped;
  }
}
