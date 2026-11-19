// HUD, minimap, full map (search + click-to-navigate), toasts.
const ROAD_COL = { trunk: '#f2c14e', primary: '#f2e2a6', secondary: '#ffffff', tertiary: '#e8e8e8', residential: '#cfd3d8', service: '#aab', unclassified: '#cfd3d8' };

export class MapView {
  constructor(graph, tile) {
    this.g = graph; this.tile = tile; this.S = 0.55;
    const [minx, miny, maxx, maxy] = tile.meta.bbox_m; this.pad = 80;
    this.x0 = minx - this.pad; this.z0 = -maxy - this.pad; this.w = (maxx - minx + 2 * this.pad); this.h = (maxy - miny + 2 * this.pad);
    this.off = document.createElement('canvas'); this.off.width = Math.ceil(this.w * this.S); this.off.height = Math.ceil(this.h * this.S);
    this._paint(this.off.getContext('2d'));
  }
  px(x, z) { return [(x - this.x0) * this.S, (z - this.z0) * this.S]; }
  _paint(c) {
    c.fillStyle = '#262b30'; c.fillRect(0, 0, this.off.width, this.off.height);
    c.fillStyle = '#2f4a34'; for (const r of this.g.tile.parks) { c.beginPath(); r.pts.forEach(([x, y], i) => { const [a, b] = this.px(x, -y); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.fill(); }
    c.fillStyle = '#3a4048'; for (const b of this.g.tile.buildings) { c.beginPath(); b.pts.forEach(([x, y], i) => { const [a, bb] = this.px(x, -y); i ? c.lineTo(a, bb) : c.moveTo(a, bb); }); c.fill(); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const order of [['service', 'residential', 'unclassified'], ['tertiary', 'secondary'], ['primary'], ['trunk']])
      for (const r of this.g.roads) { if (!order.includes(r.hw)) continue; c.strokeStyle = ROAD_COL[r.hw] ?? '#ccc'; c.lineWidth = Math.max(1.5, r.width * this.S * 0.75); c.beginPath(); r.pts.forEach(([x, z], i) => { const [a, b] = this.px(x, z); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.stroke(); }
  }
  _route(c, poly, scale, tx) {
    if (!poly || poly.length < 2) return; c.strokeStyle = '#2fb4ff'; c.lineWidth = 5 * scale; c.lineJoin = 'round'; c.beginPath();
    poly.forEach((p, i) => { const [a, b] = tx(p.x, p.z); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.stroke();
  }
  _markers(c, st, scale, tx) {
    for (const m of st.markers ?? []) { const [a, b] = tx(m.x, m.z); c.fillStyle = m.color; c.beginPath(); c.arc(a, b, 7 * scale, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
  }
  drawMini(ctx, st) { // rotating, player-centred
    const W = ctx.canvas.width, k = 0.8, [px, pz] = this.px(st.x, st.z); ctx.save(); ctx.clearRect(0, 0, W, W);
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2, 0, 7); ctx.clip();
    ctx.translate(W / 2, W / 2); ctx.rotate(Math.PI + st.h); ctx.scale(k, k); ctx.translate(-px, -pz);   // heading-up
    ctx.drawImage(this.off, 0, 0); const tx = (x, z) => this.px(x, z); this._route(ctx, st.route, 1 / k * 0.8, tx); this._markers(ctx, st, 1 / k, tx);
    ctx.restore();
    ctx.save(); ctx.translate(W / 2, W / 2); ctx.fillStyle = '#ff4a3a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 5); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  drawBig(ctx, st) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height, sc = Math.min(cw / this.off.width, ch / this.off.height); this.bigScale = sc;
    ctx.clearRect(0, 0, cw, ch); ctx.drawImage(this.off, 0, 0, this.off.width * sc, this.off.height * sc);
    const tx = (x, z) => { const [a, b] = this.px(x, z); return [a * sc, b * sc]; };
    this._route(ctx, st.route, 1, tx);
    ctx.font = '11px system-ui'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    for (const p of this.tile.pois) { if (p.kind === 'bus_stop') continue; const [a, b] = tx(p.x, -p.y); ctx.fillStyle = p.kind === 'fuel' ? '#ff9f43' : '#ffc928'; ctx.beginPath(); ctx.arc(a, b, 4, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.strokeText(p.name, a + 7, b + 4); ctx.fillText(p.name, a + 7, b + 4); }
    this._markers(ctx, st, 1, tx);
    const [a, b] = tx(st.x, st.z); ctx.save(); ctx.translate(a, b); ctx.rotate(Math.PI - st.h); ctx.fillStyle = '#ff4a3a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  bigToWorld(cx, cy) { const sc = this.bigScale; return { x: cx / sc / this.S + this.x0, z: cy / sc / this.S + this.z0 }; }
}

export function toast(msg) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.getElementById('toasts').appendChild(d); setTimeout(() => d.remove(), 4600);
}
export const $ = id => document.getElementById(id);
export function arrowFor(rel) { // rel>0 = target is to the left
  const a = Math.abs(rel); if (a < 0.4) return '↑'; if (a > 2.3) return '↶'; return rel > 0 ? (a > 1.1 ? '⬅' : '↖') : (a > 1.1 ? '➡' : '↗');
}
