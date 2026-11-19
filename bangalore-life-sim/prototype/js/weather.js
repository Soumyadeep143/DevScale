import * as THREE from '../vendor/three.module.js';

// Day/night cycle, clouds-as-overcast, rain. Hours in [0,24). Sunrise ~06:15, sunset ~18:20 (Bengaluru, ~12.9N).
const lerpC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

export class Weather {
  constructor(scene, renderer, world) {
    this.scene = scene; this.renderer = renderer; this.world = world; this.hour = 8.5; this.rain = 0; this.rainTarget = 0; this.speed = 1; this.night = 0;
    this.sun = new THREE.DirectionalLight(0xffffff, 2); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 400; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.5;
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b6248, 0.8);
    scene.add(this.sun, this.sun.target, this.hemi); scene.fog = new THREE.Fog(0xbcd0e0, 120, 900); scene.background = new THREE.Color(0x87b4e0);
    // rain: line segments around the camera
    const N = 3500, pos = new Float32Array(N * 6); this.rainN = N; this.rainPos = pos;
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 80, y = Math.random() * 40, z = (Math.random() - 0.5) * 80; pos.set([x, y, z, x, y - 0.8, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.5 })); this.rainMesh.frustumCulled = false; this.rainMesh.visible = false; scene.add(this.rainMesh);
  }
  set(hour) { this.hour = ((hour % 24) + 24) % 24; }
  setRain(on) { this.rainTarget = on ? 1 : 0; }
  update(dt, focus) {
    this.hour = (this.hour + dt * this.speed / 60) % 24;      // 1 real minute = 1 game hour at speed 1 (60 s/h)
    this.rain += (this.rainTarget - this.rain) * Math.min(1, dt * 0.4);
    const h = this.hour, ang = (h - 6.25) / 12.1 * Math.PI, el = Math.sin(ang);   // elevation -1..1
    const day = THREE.MathUtils.smoothstep(el, -0.08, 0.25), glow = Math.max(0, 1 - Math.abs(el) * 4) * (el > -0.2 ? 1 : 0);
    this.night = 1 - day;
    const moon = el < 0, dir = new THREE.Vector3(Math.cos(ang) * 0.9 * (moon ? -1 : 1), Math.max(0.3, Math.abs(el)), -0.35).normalize();
    this.sun.position.copy(focus).addScaledVector(dir, 200); this.sun.target.position.copy(focus);
    const overcast = this.rain * 0.7;
    this.sun.intensity = moon ? 0.45 * (1 - overcast * 0.5) : (0.05 + day * 2.4) * (1 - overcast * 0.75) + 0.2 * (1 - day);   // moonlight at night
    this.sun.color.copy(moon ? new THREE.Color(0x8fa8ff) : lerpC(0xffffff, 0xff9a55, glow * 0.9));
    this.hemi.intensity = (0.75 + day * 0.55) * (1 - overcast * 0.2); this.hemi.color.copy(lerpC(0x4a5a8a, 0xbfd8ff, day)); this.hemi.groundColor.copy(lerpC(0x2a2a32, 0x6b6248, day));
    let sky = lerpC(0x070b18, 0x87b4e0, day).lerp(new THREE.Color(0xff8a50), glow * 0.45);
    sky = sky.lerp(lerpC(0x20242a, 0x8a949c, day), overcast); this.scene.background.copy(sky); this.scene.fog.color.copy(sky);
    this.scene.fog.near = 90 - overcast * 40; this.scene.fog.far = 900 - overcast * 550 - this.night * 250;
    this.renderer.toneMappingExposure = 1;
    this.world.setNight(this.night, this.rain > 0.3);
    this.rainMesh.visible = this.rain > 0.05; this.rainMesh.material.opacity = 0.15 + this.rain * 0.4;
    if (this.rainMesh.visible) {
      this.rainMesh.position.set(focus.x, 0, focus.z); const p = this.rainPos, fall = 28 * dt;
      for (let i = 0; i < this.rainN; i++) { let y = p[i * 6 + 1] - fall; if (y < 0) y += 40; p[i * 6 + 1] = y; p[i * 6 + 4] = y - 0.9; }
      this.rainMesh.geometry.attributes.position.needsUpdate = true;
    }
  }
  get timeString() { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
}
