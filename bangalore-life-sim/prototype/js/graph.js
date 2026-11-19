// Road graph, routing (A*), spatial queries and traffic-signal timing. Pure logic: no THREE import.
// World coordinates: x = east, z = south (z = -north). Heading h: forward = (sin h, cos h), LEFT = (cos h, -sin h).
// India drives on the LEFT, so vehicles use positive offsets along `left`.

export class RoadGraph {
  constructor(tile) {
    this.tile = tile;
    this.roads = tile.roads.map(r => ({ ...r, pts: r.pts.map(([x, y]) => [x, -y]) }));
    this.nodes = tile.graph.nodes.map(n => ({ x: n.x, z: -n.y, sig: !!n.sig, out: [], inn: [] }));
    this.edges = [];   // directed edges
    for (const e of tile.graph.edges) {
      const pts = e.pts.map(([x, y]) => ({ x, z: -y }));
      const road = this.roads[e.road];
      this._add(e.a, e.b, pts, road, e.len);
      if (!e.oneway) this._add(e.b, e.a, pts.slice().reverse(), road, e.len, true);
    }
    for (const e of this.edges) if (e.twoway) e.rev = this.edges.find(o => o.from === e.to && o.to === e.from && o.road === e.road && Math.abs(o.len - e.len) < 1e-6)?.id ?? -1;
    this._signalGroups();
    this._buildSegGrid();
  }

  _add(a, b, pts, road, len, isRev = false) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const e = { id: this.edges.length, from: a, to: b, pts, cum, len: cum[cum.length - 1] || len, road, twoway: !road.oneway,
                speed: road.speed / 3.6, width: road.width, rev: -1 };
    this.edges.push(e); this.nodes[a].out.push(e.id); this.nodes[b].inn.push(e.id);
  }

  /** point and unit direction at arc length s along directed edge e */
  sample(e, s, out = {}) {
    s = Math.max(0, Math.min(e.len, s));
    let i = 1;
    while (i < e.cum.length - 1 && e.cum[i] < s) i++;
    const a = e.pts[i - 1], b = e.pts[i], seg = e.cum[i] - e.cum[i - 1] || 1, t = (s - e.cum[i - 1]) / seg;
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
    out.dx = (b.x - a.x) / seg; out.dz = (b.z - a.z) / seg;
    return out;
  }

  nearestNode(x, z) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i], d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** A* over directed edges. Returns {edges:[ids], length} or null. */
  route(fromNode, toNode) {
    if (fromNode === toNode) return { edges: [], length: 0 };
    const N = this.nodes, g = new Map([[fromNode, 0]]), prev = new Map(), open = [[this._h(fromNode, toNode), fromNode]], closed = new Set();
    while (open.length) {
      let k = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[k][0]) k = i;
      const [, u] = open.splice(k, 1)[0];
      if (u === toNode) {
        const es = []; let c = u;
        while (prev.has(c)) { const eid = prev.get(c); es.push(eid); c = this.edges[eid].from; }
        es.reverse();
        return { edges: es, length: g.get(u) };
      }
      if (closed.has(u)) continue;
      closed.add(u);
      for (const eid of N[u].out) {
        const e = this.edges[eid], ng = g.get(u) + e.len + (N[e.to].sig ? 25 : 0) * 0; // signal delay handled in ETA, not cost
        if (ng < (g.get(e.to) ?? Infinity)) { g.set(e.to, ng); prev.set(e.to, eid); open.push([ng + this._h(e.to, toNode), e.to]); }
      }
    }
    return null;
  }
  _h(a, b) { const A = this.nodes[a], B = this.nodes[b]; return Math.hypot(A.x - B.x, A.z - B.z); }

  /** polyline (array of {x,z}) for a route */
  routePolyline(r) {
    const out = [];
    for (const eid of r.edges) for (const p of this.edges[eid].pts) { const l = out[out.length - 1]; if (!l || l.x !== p.x || l.z !== p.z) out.push({ x: p.x, z: p.z }); }
    return out;
  }

  // ---- spatial grid over road segments
  _buildSegGrid() {
    this.cs = 40; this.segGrid = new Map();
    this.roads.forEach((r, ri) => {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const x0 = Math.floor(Math.min(ax, bx) / this.cs), x1 = Math.floor(Math.max(ax, bx) / this.cs);
        const z0 = Math.floor(Math.min(az, bz) / this.cs), z1 = Math.floor(Math.max(az, bz) / this.cs);
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
          const k = cx * 100003 + cz; (this.segGrid.get(k) || this.segGrid.set(k, []).get(k)).push([ri, ax, az, bx, bz]);
        }
      }
    });
  }
  /** nearest road centreline: {dist, road, along-lateral info}. Searches +-1 cell. */
  nearestRoad(x, z) {
    let best = { dist: Infinity, road: null };
    const cx = Math.floor(x / this.cs), cz = Math.floor(z / this.cs);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.segGrid.get((cx + i) * 100003 + cz + j); if (!list) continue;
      for (const [ri, ax, az, bx, bz] of list) {
        const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
        const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
        const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
        if (d < best.dist) best = { dist: d, road: this.roads[ri] };
      }
    }
    return best;
  }
  /** is the point on a drivable surface (road or kerb strip)? */
  onRoad(x, z) { const r = this.nearestRoad(x, z); return r.road && r.dist < r.road.width / 2 + 2.2; }

  // ---- signals: two phases per junction, grouped by incoming axis
  _signalGroups() {
    this.sigGroup = new Map();
    this.nodes.forEach((n, i) => {
      if (!n.sig) return;
      let ref = null;
      for (const eid of n.inn) {
        const e = this.edges[eid], a = e.pts[e.pts.length - 2], b = e.pts[e.pts.length - 1];
        const d = Math.atan2(b.z - a.z, b.x - a.x);
        if (ref === null) ref = d;
        this.sigGroup.set(eid, Math.abs(Math.cos(d - ref)) > 0.7 ? 0 : 1);
      }
    });
  }
  /** 'G' | 'A' | 'R' for directed edge eid at time t (seconds). 60 s cycle: 25 G + 3 A, then the other axis. */
  signalState(eid, t) {
    const g = this.sigGroup.get(eid); if (g === undefined) return 'G';
    const c = (t + (g ? 30 : 0)) % 60;
    return c < 25 ? 'G' : c < 28 ? 'A' : 'R';
  }
}

export function bearingTurn(prev, cur, next) { // signed turn angle in radians (+ = turn left in world x/z top view... see ui)
  const a1 = Math.atan2(cur.x - prev.x, cur.z - prev.z), a2 = Math.atan2(next.x - cur.x, next.z - cur.z);
  let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d;
}
