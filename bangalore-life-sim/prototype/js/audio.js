// Procedural audio (WebAudio): engine per vehicle type, horns, rain noise, ambient city bed.
export class GameAudio {
  constructor() { this.ctx = null; this.on = true; }
  start() {
    if (this.ctx) return; const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    this.ctx = new C(); const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
    // engine: sawtooth + square through lowpass, amplitude tremolo for the 2-stroke/auto "putt-putt"
    this.eng = { o1: c.createOscillator(), o2: c.createOscillator(), g: c.createGain(), f: c.createBiquadFilter(), lfo: c.createOscillator(), lg: c.createGain() };
    this.eng.o1.type = 'sawtooth'; this.eng.o2.type = 'square'; this.eng.f.type = 'lowpass'; this.eng.f.frequency.value = 700; this.eng.g.gain.value = 0;
    this.eng.lfo.frequency.value = 14; this.eng.lg.gain.value = 0.35; this.eng.lfo.connect(this.eng.lg); this.eng.lg.connect(this.eng.g.gain);
    this.eng.o1.connect(this.eng.f); this.eng.o2.connect(this.eng.f); this.eng.f.connect(this.eng.g); this.eng.g.connect(this.master);
    [this.eng.o1, this.eng.o2, this.eng.lfo].forEach(o => o.start());
    // noise bed (rain / city)
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const mkNoise = (type, freq, gain) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = c.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(this.master); s.start(); return g; };
    this.rainG = mkNoise('highpass', 1800, 0); this.cityG = mkNoise('lowpass', 400, 0.05);
  }
  setEngine(type, speedFrac, throttle, active) {
    if (!this.ctx || !this.on) return; const e = this.eng, t = this.ctx.currentTime;
    const base = type === 'auto' ? 38 : type === 'bike' ? 55 : type === 'bus' ? 30 : 48, span = type === 'auto' ? 90 : 120;
    const f = base + (active ? (0.15 + speedFrac) * span * (0.6 + 0.4 * throttle) : 0);
    e.o1.frequency.setTargetAtTime(f, t, 0.08); e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    e.lfo.frequency.setTargetAtTime(type === 'auto' ? 8 + speedFrac * 26 : 20 + speedFrac * 60, t, 0.1);
    e.f.frequency.setTargetAtTime(350 + speedFrac * 900 + throttle * 300, t, 0.1);
    e.g.gain.setTargetAtTime(active ? 0.12 + throttle * 0.1 : 0, t, 0.1);
  }
  honk(type = 'auto', vol = 0.35) {
    if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime;
    const freqs = type === 'bike' ? [520, 650] : type === 'bus' ? [180, 230] : type === 'car' ? [420, 520] : [360, 470];
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + 0.22); g.gain.linearRampToValueAtTime(0, t + 0.3);
    g.connect(this.master);
    for (const f of freqs) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; o.connect(lp); lp.connect(g); o.start(t); o.stop(t + 0.32); }
  }
  crash(intensity) {
    if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.25); g.gain.setValueAtTime(Math.min(0.6, intensity / 25), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.32);
  }
  ding() { if (!this.ctx) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.5); }
  setRain(a) { if (this.ctx) this.rainG.gain.setTargetAtTime(a * 0.12, this.ctx.currentTime, 0.5); }
  setMaster(v) { if (this.ctx) this.master.gain.value = v; }
}
