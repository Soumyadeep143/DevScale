import * as THREE from '../vendor/three.module.js';

// Vehicle specs: speeds m/s, accel m/s^2, dims m. Forward = +z in model space, +x = vehicle's LEFT.
export const SPECS = {
  auto:  { name: 'Auto-rickshaw', len: 2.7, wid: 1.45, maxV: 15.3, accel: 2.4, brake: 7, steer: 0.62, wheelbase: 1.9, grip: 5.5, drag: 0.35, fuelCap: 8,  burn: 0.00085 },
  car:   { name: 'Hatchback',     len: 3.9, wid: 1.7,  maxV: 38,   accel: 4.2, brake: 9, steer: 0.58, wheelbase: 2.45, grip: 7.5, drag: 0.22, fuelCap: 35, burn: 0.0011 },
  bike:  { name: 'Scooter',       len: 1.8, wid: 0.7,  maxV: 27,   accel: 3.8, brake: 7, steer: 0.75, wheelbase: 1.3, grip: 6.5, drag: 0.30, fuelCap: 5,  burn: 0.0006 },
  bus:   { name: 'BMTC bus',      len: 11,  wid: 2.5,  maxV: 16,   accel: 1.3, brake: 6, steer: 0.4,  wheelbase: 6, grip: 6, drag: 0.3, fuelCap: 150, burn: 0.003 },
};

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.15, ...o });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); k.castShadow = true; return k; };
const wheel = (r, w, x, y, z) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), mat(0x151515, { roughness: 0.9 })); g.rotation.z = Math.PI / 2; g.position.set(x, y, z); g.castShadow = true; return g; };
const lightMat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c0, emissiveIntensity: 0.6 });
const tailMat = () => new THREE.MeshStandardMaterial({ color: 0x880000, emissive: 0xff1100, emissiveIntensity: 0.3 });

export function buildModel(type, color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.userData.body = body;
  const glass = mat(0x223344, { roughness: 0.15, metalness: 0.4 });
  if (type === 'auto') {
    const yel = mat(0xf2c400), blk = mat(0x1b1b1b), green = mat(color ?? 0x2f9e55);
    body.add(box(1.3, 0.55, 2.0, blk, 0, 0.55, -0.15));            // lower body
    body.add(box(1.35, 0.9, 1.25, green, 0, 1.2, -0.45));          // passenger cabin
    body.add(box(1.5, 0.08, 1.7, yel, 0, 1.72, -0.35));            // canopy
    body.add(box(0.7, 0.55, 0.12, glass, 0, 1.2, 0.5));            // windscreen
    body.add(box(0.55, 0.12, 0.6, blk, 0, 0.4, 1.1));              // nose
    body.add(box(0.2, 0.2, 0.15, lightMat(), 0, 0.75, 1.28));      // headlamp
    body.add(box(1.05, 0.1, 0.55, mat(0x333333), 0, 0.88, 0.5));   // driver seat hint
    const f = wheel(0.25, 0.12, 0, 0.25, 1.1), l = wheel(0.25, 0.12, -0.7, 0.25, -0.75), r = wheel(0.25, 0.12, 0.7, 0.25, -0.75);
    root.add(f, l, r); root.userData.wheels = [f, l, r]; root.userData.cam = { h: 1.6, d: 5.5 };
  } else if (type === 'car') {
    const m = mat(color ?? 0xb02a2a);
    body.add(box(1.7, 0.55, 3.9, m, 0, 0.62, 0)); body.add(box(1.5, 0.5, 2.0, m, 0, 1.12, -0.25)); body.add(box(1.52, 0.42, 1.8, glass, 0, 1.13, -0.25));
    body.add(box(0.35, 0.16, 0.1, lightMat(), -0.55, 0.72, 1.95), box(0.35, 0.16, 0.1, lightMat(), 0.55, 0.72, 1.95));
    body.add(box(0.35, 0.16, 0.1, tailMat(), -0.55, 0.78, -1.95), box(0.35, 0.16, 0.1, tailMat(), 0.55, 0.78, -1.95));
    const ws = [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.2], [0.85, -1.2]].map(([x, z]) => wheel(0.3, 0.22, x, 0.3, z)); ws.forEach(w => root.add(w));
    root.userData.wheels = ws; root.userData.cam = { h: 2.1, d: 6.5 };
  } else if (type === 'bike') {
    const m = mat(color ?? 0x2255aa);
    body.add(box(0.35, 0.35, 1.1, m, 0, 0.55, -0.1)); body.add(box(0.3, 0.7, 0.2, m, 0, 0.9, 0.55)); body.add(box(0.7, 0.06, 0.06, mat(0x222), 0, 1.25, 0.55));
    body.add(box(0.3, 0.1, 0.5, mat(0x222), 0, 0.85, -0.3));
    body.add(box(0.12, 0.12, 0.1, lightMat(), 0, 1.0, 0.68));
    const rider = new THREE.Group();
    rider.add(box(0.38, 0.6, 0.25, mat(0x6a4a8a), 0, 1.3, -0.3)); const h = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(0x111111)); h.position.set(0, 1.75, -0.28); rider.add(h);
    body.add(rider);
    const f = wheel(0.27, 0.1, 0, 0.27, 0.65), r = wheel(0.27, 0.1, 0, 0.27, -0.65); root.add(f, r); root.userData.wheels = [f, r]; root.userData.cam = { h: 1.7, d: 4.5 };
  } else if (type === 'bus') {
    const m = mat(0x1f4fa8), w = mat(0xe9eef5);
    body.add(box(2.5, 2.4, 11, m, 0, 1.65, 0)); body.add(box(2.52, 0.9, 10.6, w, 0, 2.5, 0)); body.add(box(2.4, 0.9, 0.1, glass, 0, 2.3, 5.5));
    body.add(box(0.3, 0.2, 0.1, lightMat(), -0.9, 0.9, 5.52), box(0.3, 0.2, 0.1, lightMat(), 0.9, 0.9, 5.52));
    const ws = [[-1.15, 3.5], [1.15, 3.5], [-1.15, -3], [1.15, -3]].map(([x, z]) => wheel(0.5, 0.3, x, 0.5, z)); ws.forEach(k => root.add(k)); root.userData.wheels = ws; root.userData.cam = { h: 4.5, d: 13 };
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return root;
}

/** Arcade-realistic bicycle model with lateral slip. Heading h: forward=(sin h, cos h), left=(cos h,-sin h). */
export class VehicleBody {
  constructor(type) {
    this.type = type; this.spec = SPECS[type];
    this.x = 0; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0; this.yawRate = 0; this.steer = 0; this.roll = 0;
    this.fuel = this.spec.fuelCap; this.damage = 0; this.speed = 0; this.slip = 0; this.fwdSpeed = 0;
  }
  get fx() { return Math.sin(this.h); } get fz() { return Math.cos(this.h); }
  get lx() { return Math.cos(this.h); } get lz() { return -Math.sin(this.h); }

  /** input: {throttle 0..1, brake 0..1, steer -1..1 (+ = left), hand 0/1}; env: {wet, offroad} */
  step(dt, input, env = {}) {
    const s = this.spec;
    let vf = this.vx * this.fx + this.vz * this.fz, vl = this.vx * this.lx + this.vz * this.lz;
    const dmgF = 1 - Math.min(0.5, this.damage / 200), fuelOk = this.fuel > 0 ? 1 : 0;
    // longitudinal
    let a = 0;
    if (input.throttle > 0) a += input.throttle * s.accel * dmgF * fuelOk * Math.max(0, 1 - Math.pow(Math.max(0, vf) / s.maxV, 3));
    if (input.reverse > 0) a -= input.reverse * s.accel * 0.6 * Math.max(0, 1 - Math.max(0, -vf) / (s.maxV * 0.2));
    if (input.brake > 0) { const b = input.brake * s.brake; a -= Math.sign(vf) * Math.min(b, Math.abs(vf) / dt); }
    a -= vf * s.drag * 0.03 + Math.sign(vf) * 0.15;               // rolling + aero
    if (env.offroad) a -= vf * 1.2;
    if (Math.abs(vf) < 0.05 && !input.throttle && !input.reverse) vf = 0; else vf += a * dt;
    // steering (speed sensitive), bicycle yaw rate
    const target = input.steer * s.steer / (1 + Math.abs(vf) * 0.07);
    this.steer += (target - this.steer) * Math.min(1, dt * 7);
    const yaw = vf * Math.tan(this.steer) / s.wheelbase;
    this.yawRate += (yaw - this.yawRate) * Math.min(1, dt * 12);
    // commit longitudinal change in the OLD frame, then rotate: the world velocity does not rotate with the car,
    // so a change of heading produces a lateral (slip) component that grip must remove.
    this.vx = this.fx * vf + this.lx * vl; this.vz = this.fz * vf + this.lz * vl;
    this.h += this.yawRate * dt;
    vf = this.vx * this.fx + this.vz * this.fz; vl = this.vx * this.lx + this.vz * this.lz;
    const grip = s.grip * (env.wet ? 0.6 : 1) * (input.hand ? 0.12 : 1);   // handbrake/wet reduce grip -> slides
    vl *= Math.exp(-grip * dt);
    if (input.hand) vf *= Math.exp(-0.6 * dt);
    this.vx = this.fx * vf + this.lx * vl; this.vz = this.fz * vf + this.lz * vl;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.fwdSpeed = vf; this.speed = Math.hypot(this.vx, this.vz); this.slip = vl;
    this.roll += ((-this.yawRate * vf * 0.012 - vl * 0.02) * (this.type === 'auto' ? 1.6 : 1) - this.roll) * Math.min(1, dt * 6);
    this.fuel = Math.max(0, this.fuel - this.speed * dt * s.burn * 8 - (input.throttle > 0 ? 0.0002 * dt * 60 : 0.00005 * dt * 60));
  }

  /** collision response: normal pointing away from obstacle */
  bump(nx, nz, depth, restitution = 0.25, softness = 1) {
    this.x += nx * depth; this.z += nz * depth;
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      this.vx -= (1 + restitution) * vn * nx; this.vz -= (1 + restitution) * vn * nz;
      const hit = -vn * softness; if (hit > 1.5) this.damage = Math.min(100, this.damage + hit * hit * 0.35);
      return -vn;
    }
    return 0;
  }
  apply(mesh) {
    mesh.position.set(this.x, 0, this.z); mesh.rotation.y = this.h;
    const b = mesh.userData.body; if (b) b.rotation.z = this.roll;
    for (const w of mesh.userData.wheels ?? []) w.rotation.x += this.fwdSpeed * 0.016 * 3;
  }
}
