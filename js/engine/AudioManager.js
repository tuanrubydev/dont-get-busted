/* AudioManager — toàn bộ âm thanh tổng hợp bằng Web Audio API (không dùng file âm thanh). */

// Âm thanh tổng hợp bằng Web Audio API (không dùng file âm thanh). Khởi tạo ở lần bấm phím/nút đầu tiên.
export const Sfx = {
  ctx: null, out: null, buf: null,
  init() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = 0.55; this.out.connect(this.ctx.destination);
        const n = this.ctx.sampleRate * 2; this.buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = this.buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (_) { this.ctx = null; }
  },
  play(name, ...args) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    try { this['_' + name](this.ctx.currentTime + 0.01, ...args); } catch (_) { /* âm thanh là phụ */ }
  },
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  },
  osc(type, t, f0, f1, dur, vol, a = 0.005, dest) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
    this.env(g, t, a, vol, dur); o.connect(g); g.connect(dest || this.out);
    o.start(t); o.stop(t + a + dur + 0.05); return o;
  },
  noise(t, dur, vol, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, a = 0.004) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.buf; s.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
    this.env(g, t, a, vol, dur); s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
  },
  // ---- các tiếng ----
  _jump(t) { this.noise(t, 0.12, 0.12, 'bandpass', 700, 1500, 1.2, 0.01); },
  _land(t) { this.osc('sine', t, 110, 55, 0.12, 0.35); this.noise(t, 0.08, 0.25, 'lowpass', 700, 250); },
  _creak(t) {
    const o = this.osc('sawtooth', t, 180, 120, 0.55, 0.12, 0.05);
    const c = this.ctx, l = c.createOscillator(), g = c.createGain(); l.frequency.value = 17; g.gain.value = 35; l.connect(g); g.connect(o.frequency); l.start(t); l.stop(t + 0.7);
    this.noise(t + 0.5, 0.1, 0.25, 'lowpass', 900, 300);
  },
  _slide(t) { this.noise(t, 0.6, 0.3, 'lowpass', 1800, 500, 0.8, 0.02); },
  _scrape(t) { this.noise(t, 0.45, 0.22, 'bandpass', 380, 260, 3, 0.05); this.osc('sawtooth', t, 90, 70, 0.4, 0.05, 0.05); },
  _rattle(t) { for (let i = 0; i < 9; i++) this.noise(t + i * 0.055, 0.05, 0.3, 'bandpass', 2600 + (i % 3) * 900, 2000, 4, 0.002); this._clang(t, false); },
  _pick(t) { this.osc('triangle', t, 760, 1240, 0.09, 0.18); },
  _whoosh(t) { this.noise(t, 0.28, 0.22, 'bandpass', 500, 1800, 1.4, 0.03); },
  _thud(t) { this.osc('sine', t, 150, 48, 0.2, 0.55); this.noise(t, 0.09, 0.3, 'lowpass', 500, 200); },
  _clang(t, heavy) {
    const base = heavy ? 330 : 520;
    [1, 2.58, 4.25, 6.02].forEach((k, i) => this.osc('sine', t, base * k, base * k * 0.995, (heavy ? 1.3 : 0.9) / (1 + i * 0.5), 0.22 / (1 + i * 0.4), 0.002));
    this.noise(t, 0.05, 0.5, 'highpass', 2500);
    if (heavy) this.osc('square', t, 120, 60, 0.12, 0.25);
  },
  _crack(t) { [0, 0.045, 0.1, 0.13].forEach((d, i) => this.noise(t + d, 0.05, 0.5 - i * 0.08, 'highpass', 1800 + i * 400, 1800, 0.8, 0.002)); },
  _collapse(t) { this.noise(t, 0.8, 0.6, 'lowpass', 900, 140, 0.7, 0.01); this.osc('sine', t, 90, 32, 0.6, 0.6); this._crack(t); },
  _arrow(t) { this.noise(t, 0.16, 0.35, 'bandpass', 3800, 900, 2.5, 0.01); this.osc('sine', t + 0.17, 240, 90, 0.08, 0.5); this.noise(t + 0.17, 0.05, 0.4, 'lowpass', 1200); },
  _siren(t, dur = 2.6) {
    const c = this.ctx, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 820; lfo.frequency.value = 2.2; lg.gain.value = 300;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.08); g.gain.setValueAtTime(0.13, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    o.connect(f); f.connect(g); g.connect(this.out); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },
  _flare(t) { this.noise(t, 1.3, 0.3, 'highpass', 2500, 6000, 0.7, 0.02); this.osc('square', t, 500, 1900, 1.0, 0.07, 0.02); this._siren(t + 0.9, 3.2); },
  _rustle(t) { for (let i = 0; i < 7; i++) this.noise(t + i * 0.13, 0.12, 0.28, 'bandpass', 1200 + (i % 3) * 600, 900, 1.2, 0.02); this.osc('sine', t, 110, 70, 0.9, 0.2, 0.1); },
  _cluck(t) { this.osc('square', t, 640, 420, 0.07, 0.08); this.osc('square', t + 0.11, 700, 380, 0.09, 0.08); },
  _bark(t) { for (const d of [0, 0.22]) { this.osc('sawtooth', t + d, 420, 210, 0.1, 0.18); this.noise(t + d, 0.08, 0.2, 'bandpass', 900, 500, 2); } },
  // jumpscare: tiếng bass tụt sâu + tiếng rít chói tai
  _stinger(t) {
    this.osc('sine', t, 160, 26, 1.1, 0.9, 0.005);
    this.osc('triangle', t, 80, 22, 1.2, 0.6, 0.005);
    this.noise(t, 0.25, 0.5, 'lowpass', 400, 60, 0.5);
    const c = this.ctx, f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400; f.connect(this.out);
    const s1 = this.osc('sawtooth', t, 1800, 3600, 0.7, 0.2, 0.01, f), s2 = this.osc('square', t, 2450, 3300, 0.7, 0.12, 0.01, f);
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 23; vg.gain.value = 140; vib.connect(vg); vg.connect(s1.frequency); vg.connect(s2.frequency);
    vib.start(t); vib.stop(t + 0.8);
  },
  _hit(t) { this.noise(t, 0.14, 0.9, 'lowpass', 1400, 300, 0.8, 0.002); this.osc('sine', t, 120, 38, 0.3, 0.8, 0.002); this._crack(t + 0.01); },
  _victory(t) {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.osc('triangle', t + i * 0.11, f, f, 0.32, 0.22, 0.01));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.osc('triangle', t + 0.62, f, f, 1.3, 0.13, 0.02));
    this.osc('sine', t + 0.62, 130.8, 130.8, 1.3, 0.25, 0.02);
  },
  _firework(t) { this.noise(t, 0.05, 0.3, 'highpass', 3000); this.osc('sine', t, 110, 40, 0.35, 0.4); for (let i = 0; i < 6; i++) this.noise(t + 0.08 + Math.random() * 0.5, 0.03, 0.18, 'highpass', 4000 + Math.random() * 3000, 4000, 1, 0.002); },
  _record(t) { [880, 1108.7, 1318.5, 1760].forEach((f, i) => this.osc('sine', t + i * 0.07, f, f, 0.5, 0.12, 0.005)); },
  trap(type) {
    switch (type) {
      case 'pitfall': this.play('collapse'); break;
      case 'tripwire': this.play('arrow'); break;
      case 'flare': this.play('flare'); break;
      case 'bear': this.play('clang', true); break;
      case 'bucket': this.play('clang', false); break;
      case 'branch': this.play('crack'); break;
    }
  },
  rustle() { this.play('rustle'); },
};


export const AudioManager = Sfx;
