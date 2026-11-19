// Auto-rickshaw passenger missions: hail -> pickup -> ride (metered) -> drop-off -> payout.
// Pure logic (no rendering) so it can be unit-tested; main.js draws markers and routes from this state.

// Approximate Bengaluru auto tariff (verify against the current Transport Dept. notification before shipping):
export const TARIFF = { baseFare: 30, baseMetres: 2000, perKm: 15, nightMultiplier: 1.5, waitingPerMin: 0 };
export const fareFor = (metres, night = false) =>
  Math.ceil((TARIFF.baseFare + Math.max(0, metres - TARIFF.baseMetres) / 1000 * TARIFF.perKm) * (night ? TARIFF.nightMultiplier : 1));

const LINES = ['Sir, a little fast please.', 'Slow down, I am not late!', 'Take the left turn ahead.', 'Traffic is bad today, no?', 'Meter on madi, please.', 'Drop me near the signal.'];

export class AutoMissions {
  constructor(graph, pois, rnd = Math.random) { this.g = graph; this.rnd = rnd; this.dests = pois.filter(p => !['bus_stop', 'fuel'].includes(p.kind)).map(p => ({ name: p.name, x: p.x, z: -p.y })); this.reset(); }
  reset() { this.phase = 'idle'; this.pickup = null; this.dest = null; this.dwell = 0; this.driven = 0; this.t = 0; this.limit = 0; this.damage0 = 0; this.fare = 0; this.route = null; this.line = ''; }

  /** choose a hail point on a road, 150-700 m from `near` */
  offer(near) {
    const cands = this.g.edges.filter(e => e.len > 30 && e.road.hw !== 'trunk');
    for (let i = 0; i < 200; i++) {
      const e = cands[Math.floor(this.rnd() * cands.length)], s = e.len * (0.2 + this.rnd() * 0.6), p = this.g.sample(e, s);
      const x = p.x + p.dz * (e.width / 2 + 1.6), z = p.z - p.dx * (e.width / 2 + 1.6), d = Math.hypot(x - near.x, z - near.z);
      if (d > 150 && d < 700) { this.pickup = { x, z, edge: e.id }; this.phase = 'hail'; this.dwell = 0; this.line = LINES[Math.floor(this.rnd() * LINES.length)]; return this.pickup; }
    }
    return null;
  }

  /** returns an event string or null: 'boarded' | 'delivered' | 'failed' */
  update(dt, st) { // st: {x,z,speed,inAuto,damage,night}
    this.t += dt;
    if (this.phase === 'hail' && st.inAuto) {
      const d = Math.hypot(st.x - this.pickup.x, st.z - this.pickup.z);
      this.dwell = (d < 9 && st.speed < 2.5) ? this.dwell + dt : 0;
      if (this.dwell > 1.0 || (st.interact && d < 12 && st.speed < 5)) return this.board(st);
    } else if (this.phase === 'ride') {
      this.driven += st.speed * dt; this.fare = fareFor(this.driven, st.night);
      if (!st.inAuto) return null;
      const d = Math.hypot(st.x - this.dest.x, st.z - this.dest.z);
      if (d < 16 && st.speed < 3) return this.deliver(st);
    }
    return null;
  }
  board(st) {
    const far = this.dests.filter(d => Math.hypot(d.x - this.pickup.x, d.z - this.pickup.z) > 450);
    this.dest = far[Math.floor(this.rnd() * far.length)] ?? this.dests[0];
    const a = this.g.nearestNode(this.pickup.x, this.pickup.z), b = this.g.nearestNode(this.dest.x, this.dest.z), r = this.g.route(a, b);
    this.route = r; this.phase = 'ride'; this.driven = 0; this.t = 0; this.damage0 = st.damage; this.fare = fareFor(0);
    this.limit = (r ? r.length : 1500) / 6.5 + 45;       // ~23 km/h average allowed incl. signals
    return 'boarded';
  }
  deliver(st) {
    const base = fareFor(this.driven, st.night), onTime = this.t <= this.limit, tip = onTime ? Math.ceil(base * 0.2) : 0;
    const dmg = Math.max(0, st.damage - this.damage0), penalty = Math.min(base, Math.round(dmg * 3));
    this.result = { base, tip, penalty, total: base + tip - penalty, metres: Math.round(this.driven), seconds: Math.round(this.t), onTime };
    this.phase = 'idle'; return 'delivered';
  }
}
