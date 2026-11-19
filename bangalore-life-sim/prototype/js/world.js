import * as THREE from '../vendor/three.module.js';

// Builds the static city from the game tile and answers collision queries against buildings.
const LANE = 3.3;

function ribbon(pts, half, y, pos, idx) {
  const n = pts.length, base = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    // miter: blend with incoming/outgoing segment normals
    let nx = -dz, nz = dx, m = 1;
    if (i > 0 && i < n - 1) {
      const d1x = p[0] - a[0], d1z = p[1] - a[1], l1 = Math.hypot(d1x, d1z) || 1, d2x = b[0] - p[0], d2z = b[1] - p[1], l2 = Math.hypot(d2x, d2z) || 1;
      const n1x = -d1z / l1, n1z = d1x / l1, n2x = -d2z / l2, n2z = d2x / l2;
      let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      m = Math.min(1.6, 1 / Math.max(0.5, mx * n1x + mz * n1z)); nx = mx; nz = mz;
    }
    pos.push(p[0] + nx * half * m, y, p[1] + nz * half * m, p[0] - nx * half * m, y, p[1] - nz * half * m);
    if (i < n - 1) { const k = base + i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
}
function offsetPoly(pts, off) { // lateral offset polyline
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [p[0] - dz / L * off, p[1] + dx / L * off];
  });
}
function dashes(pts, off, y, len, gap, w, pos, idx) {
  const line = offsetPoly(pts, off); let carry = 0, draw = true, cur = [line[0]];
  const flush = () => { if (cur.length >= 2) ribbon(cur, w / 2, y, pos, idx); };
  for (let i = 0; i < line.length - 1; i++) {
    let a = line[i]; const b = line[i + 1]; let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / (d || 1), uz = (b[1] - a[1]) / (d || 1);
    while (d > 0) {
      const lim = (draw ? len : gap) - carry, step = Math.min(lim, d);
      a = [a[0] + ux * step, a[1] + uz * step]; d -= step; carry += step;
      if (draw) cur.push(a);
      if (carry >= (draw ? len : gap) - 1e-6) { if (draw) flush(); draw = !draw; carry = 0; cur = draw ? [a] : []; }
    }
  }
  if (draw) flush();
}
function mk(posArr, idxArr, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3)); g.setIndex(idxArr); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}
function windowTextures() {
  const mk2 = (lit) => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = lit ? '#000' : '#ffffff'; x.fillRect(0, 0, 256, 256);
    let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const on = rnd() < 0.45;
      x.fillStyle = lit ? (on ? '#ffd98a' : '#000') : (on ? '#6d8aa0' : '#4a5560');
      x.fillRect(i * 64 + 14, j * 64 + 14, 36, 34);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 16, 1 / 12.8); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  return { map: mk2(false), emissive: mk2(true) };
}

export class World {
  constructor(scene, graph) {
    this.scene = scene; this.graph = graph; const tile = graph.tile;
    this.group = new THREE.Group(); scene.add(this.group);
    this.mats = {};
    this._ground(tile); this._roads(); this._buildings(tile); this._parks(tile); this._trees(); this._lamps(); this._signalsMeshes();
  }

  _ground() {
    const g = new THREE.PlaneGeometry(9000, 9000); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: 0x8b8466, roughness: 1 });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.position.y = -0.02; this.group.add(mesh); this.mats.ground = m;
  }

  _roads() {
    const asphalt = { p: [], i: [] }, side = { p: [], i: [] }, mark = { p: [], i: [] }, yel = { p: [], i: [] };
    const rank = { trunk: 0.006, primary: 0.004, tertiary: 0.002, secondary: 0.003 };
    for (const r of this.graph.roads) {
      if (r.pts.length < 2) continue;
      const half = r.width / 2, y = 0.03 + (rank[r.hw] ?? 0.001);
      ribbon(r.pts, half + 2.2, 0.012, side.p, side.i);
      ribbon(r.pts, half, y, asphalt.p, asphalt.i);
      if (r.oneway) { for (let k = 1; k < r.lanes; k++) dashes(r.pts, -half + k * LANE, y + 0.006, 3, 5, 0.14, mark.p, mark.i); continue; }
      if (r.lanes >= 4) {
        ribbon(offsetPoly(r.pts, 0.14), 0.07, y + 0.006, yel.p, yel.i); ribbon(offsetPoly(r.pts, -0.14), 0.07, y + 0.006, yel.p, yel.i);
        for (let k = 1; k < r.lanes / 2; k++) { dashes(r.pts, k * LANE, y + 0.006, 3, 5, 0.14, mark.p, mark.i); dashes(r.pts, -k * LANE, y + 0.006, 3, 5, 0.14, mark.p, mark.i); }
      } else dashes(r.pts, 0, y + 0.006, 3, 4, 0.14, mark.p, mark.i);
      ribbon(offsetPoly(r.pts, half - 0.25), 0.06, y + 0.006, mark.p, mark.i); ribbon(offsetPoly(r.pts, -half + 0.25), 0.06, y + 0.006, mark.p, mark.i);
    }
    this.mats.road = new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mats.side = new THREE.MeshStandardMaterial({ color: 0x9a968a, roughness: 0.95 });
    this.mats.mark = new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mats.yel = new THREE.MeshStandardMaterial({ color: 0xe6c229, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (const [d, mat] of [[side, this.mats.side], [asphalt, this.mats.road], [mark, this.mats.mark], [yel, this.mats.yel]]) if (d.p.length) this.group.add(mk(d.p, d.i, mat));
  }

  _buildings(tile) {
    const tex = windowTextures();
    this.mats.wall = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.85 });
    this.mats.roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const palette = { res: [0xe9dcc4, 0xd9b99b, 0xc9d3c1, 0xe7c6c0, 0xd8d2c8, 0xb9c6d6], office: [0xa9bdcc, 0xc9ced2, 0x93a7b8, 0xd1c9bd], hospital: [0xf2f2f2] };
    const W = { p: [], n: [], u: [], c: [] }, Rf = { p: [], n: [], c: [] };
    this.polys = []; this.bgrid = new Map(); this.bcs = 40;
    tile.buildings.forEach(b => {
      const ring = b.pts.map(([x, y]) => [x, -y]);
      const shape = new THREE.Shape(b.pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const col = new THREE.Color(palette[b.kind]?.[(b.id * 7) % (palette[b.kind]?.length || 1)] ?? 0xdddddd).multiplyScalar(0.92 + ((b.id * 13) % 10) * 0.012);
      const roofCol = new THREE.Color(0x777168).lerp(col, 0.25);
      const pos = geo.attributes.position.array, nrm = geo.attributes.normal.array, uv = geo.attributes.uv.array;
      for (const gr of geo.groups) {
        const tgtW = gr.materialIndex === 1;
        for (let i = gr.start; i < gr.start + gr.count; i++) {
          if (tgtW) { W.p.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); W.n.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]); W.u.push(uv[i * 2], uv[i * 2 + 1]); W.c.push(col.r, col.g, col.b); }
          else { Rf.p.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); Rf.n.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]); Rf.c.push(roofCol.r, roofCol.g, roofCol.b); }
        }
      }
      geo.dispose();
      const idx = this.polys.length; this.polys.push({ ring, h: b.h });
      const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
      for (let cx = Math.floor(Math.min(...xs) / this.bcs); cx <= Math.floor(Math.max(...xs) / this.bcs); cx++)
        for (let cz = Math.floor(Math.min(...zs) / this.bcs); cz <= Math.floor(Math.max(...zs) / this.bcs); cz++) {
          const k = cx * 100003 + cz; (this.bgrid.get(k) || this.bgrid.set(k, []).get(k)).push(idx);
        }
    });
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(W.p, 3)); wg.setAttribute('normal', new THREE.Float32BufferAttribute(W.n, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(W.u, 2)); wg.setAttribute('color', new THREE.Float32BufferAttribute(W.c, 3));
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(Rf.p, 3)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(Rf.n, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(Rf.c, 3));
    for (const [g, m] of [[wg, this.mats.wall], [rg, this.mats.roof]]) { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh); }
  }

  _parks(tile) {
    const m = new THREE.MeshStandardMaterial({ color: 0x4d7a3a, roughness: 1 });
    for (const p of tile.parks) {
      const s = new THREE.Shape(p.pts.map(([x, y]) => new THREE.Vector2(x, y))); const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, m); mesh.position.y = 0.01; mesh.receiveShadow = true; this.group.add(mesh);
    }
    this.parkRings = tile.parks.map(p => p.pts.map(([x, y]) => [x, -y]));
  }

  /** closest-boundary push-out for a circle. Returns null or {nx,nz,depth}. */
  collideCircle(x, z, r) {
    const cx = Math.floor(x / this.bcs), cz = Math.floor(z / this.bcs), seen = new Set();
    let px = 0, pz = 0, depth = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = this.bgrid.get((cx + i) * 100003 + cz + j); if (!l) continue;
      for (const bi of l) {
        if (seen.has(bi)) continue; seen.add(bi);
        const ring = this.polys[bi].ring; let best = Infinity, bx = 0, bz = 0, inside = false;
        for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
          const [ax, az] = ring[a], [qx, qz] = ring[b];
          if ((az > z) !== (qz > z) && x < (qx - ax) * (z - az) / (qz - az) + ax) inside = !inside;
          const dx = qx - ax, dz = qz - az, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
          const ex = ax + t * dx, ez = az + t * dz, d = Math.hypot(x - ex, z - ez);
          if (d < best) { best = d; bx = ex; bz = ez; }
        }
        if (inside || best < r) {
          let nx = x - bx, nz = z - bz; const nl = Math.hypot(nx, nz);
          if (inside) { nx = -nx; nz = -nz; }
          if (nl < 1e-6) { nx = 0; nz = 1; } else { nx /= nl; nz /= nl; }
          const d = inside ? best + r : r - best;
          if (d > depth) { depth = d; px = nx; pz = nz; }
        }
      }
    }
    return depth > 0 ? { nx: px, nz: pz, depth } : null;
  }
  insideBuilding(x, z) { const c = this.collideCircle(x, z, 0.01); return !!c; }

  _trees() {
    const g = this.graph, spots = [];
    let s = 99; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (const r of g.roads) {
      if (r.hw === 'service') continue;
      let acc = 0;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az);
        for (acc += L; acc > 14; acc -= 14) {
          const t = 1 - acc / L + 0.0, k = Math.max(0, Math.min(1, t)), x = ax + (bx - ax) * k, z = az + (bz - az) * k;
          const side = rnd() < 0.5 ? 1 : -1, off = r.width / 2 + 3.6, nx = -(bz - az) / L, nz = (bx - ax) / L;
          const px = x + nx * off * side, pz = z + nz * off * side;
          if (rnd() < 0.55 && !this.insideBuilding(px, pz) && g.nearestRoad(px, pz).dist > r.width / 2 + 3) spots.push([px, pz, 0.8 + rnd() * 0.7]);
        }
      }
    }
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 3, 6); trunk.translate(0, 1.5, 0);
    const crown = new THREE.IcosahedronGeometry(2.1, 1); crown.translate(0, 4.2, 0);
    const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5a4632 }), spots.length);
    const cm = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 1, flatShading: true }), spots.length);
    const M = new THREE.Matrix4(), col = new THREE.Color();
    spots.forEach(([x, z, sc], i) => { M.makeScale(sc, sc, sc).setPosition(x, 0, z); tm.setMatrixAt(i, M); cm.setMatrixAt(i, M); cm.setColorAt(i, col.setHSL(0.27 + rnd() * 0.06, 0.45, 0.28 + rnd() * 0.1)); });
    tm.castShadow = cm.castShadow = true; this.group.add(tm, cm); this.treeCount = spots.length;
  }

  _lamps() {
    const spots = [];
    for (const r of this.graph.roads) {
      if (!['trunk', 'primary', 'tertiary'].includes(r.hw)) continue;
      let acc = 0;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az);
        for (acc += L; acc > 45; acc -= 45) {
          const k = Math.max(0, Math.min(1, 1 - acc / L)), x = ax + (bx - ax) * k, z = az + (bz - az) * k, nx = -(bz - az) / L, nz = (bx - ax) / L, off = r.width / 2 + 1.4;
          spots.push([x + nx * off, z + nz * off, Math.atan2(-nx, -nz)]);
        }
      }
    }
    const pole = new THREE.CylinderGeometry(0.08, 0.12, 8, 6); pole.translate(0, 4, 0);
    const head = new THREE.BoxGeometry(0.5, 0.15, 1.6); head.translate(0, 8, 0.7);
    this.mats.lamp = new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd27a, emissiveIntensity: 0 });
    const pm = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.5, roughness: 0.6 }), spots.length);
    const hm = new THREE.InstancedMesh(head, this.mats.lamp, spots.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, a], i) => { q.setFromAxisAngle(up, a); M.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1)); pm.setMatrixAt(i, M); hm.setMatrixAt(i, M); });
    this.group.add(pm, hm);
  }

  _signalsMeshes() {
    this.signalHeads = [];
    const g = this.graph, box = new THREE.BoxGeometry(0.45, 1.2, 0.35);
    for (const [eid] of g.sigGroup) {
      const e = g.edges[eid], end = e.pts[e.pts.length - 1], a = e.pts[e.pts.length - 2];
      let dx = end.x - a.x, dz = end.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const lx = dz, lz = -dx; // left of travel
      const px = end.x - dx * 3.5 + lx * (e.width / 2 + 1.2), pz = end.z - dz * 3.5 + lz * (e.width / 2 + 1.2);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x333 })); pole.position.set(px, 2.1, pz);
      const head = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x00ff55, emissiveIntensity: 1.2 })); head.position.set(px, 4.4, pz);
      head.rotation.y = Math.atan2(-dx, -dz); this.group.add(pole, head); this.signalHeads.push({ eid, mesh: head });
    }
  }
  updateSignals(t) {
    for (const s of this.signalHeads) {
      const st = this.graph.signalState(s.eid, t); s.mesh.material.emissive.setHex(st === 'G' ? 0x00ff55 : st === 'A' ? 0xffb000 : 0xff2200);
    }
  }
  setNight(n, wet) { // n: 0 day .. 1 night
    this.mats.wall.emissiveIntensity = n * 0.9; this.mats.lamp.emissiveIntensity = n * 3;
    this.mats.road.roughness = wet ? 0.35 : 0.92; this.mats.road.color.setHex(wet ? 0x26272a : 0x3a3b3e); this.mats.ground.color.setHex(wet ? 0x5f5a45 : 0x8b8466);
  }
}
