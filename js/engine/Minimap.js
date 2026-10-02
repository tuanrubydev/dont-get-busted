import { CFG } from '../config.js';
import { Device } from './Device.js';

/* ================================ Minimap ================================
 * Bản đồ nhỏ góc dưới bên phải (bắc = phía chuồng gà ở trên): hàng rào, nhà, chuồng gà, cổng chính,
 * ổ chó; lối thoát bí mật chỉ hiện khi người chơi đã tự tìm thấy. Mũi tên = vị trí & hướng nhìn,
 * vòng sóng âm = tiếng động bạn vừa gây ra, dấu X = bẫy đã sập.
 * ======================================================================== */
export class Minimap {
  constructor(game) {
    this.game = game; this.el = document.getElementById('minimap');
    this.ppm = 3; this.pad = 3; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    // mobile: bản đồ gọn (rộng ≤ 92 px, ~60% bản PC) để không che tầm nhìn 3D
    this.compact = Device.mobile;
    this.ctx = this.el.getContext('2d');
    this.base = document.createElement('canvas');
    this.pings = []; this.found = false; this.skip = 0;
  }
  // kích thước theo biên bản đồ của màn hiện tại (mỗi màn một cỡ)
  resize() {
    const B = CFG.bounds, maxW = this.compact ? 92 : 200, maxH = this.compact ? 132 : 288;
    this.ppm = Math.min(maxW / (B.maxX - B.minX + this.pad * 2), maxH / (B.maxZ - B.minZ + this.pad * 2));
    this.W = Math.round((B.maxX - B.minX + this.pad * 2) * this.ppm); this.H = Math.round((B.maxZ - B.minZ + this.pad * 2) * this.ppm);
    this.el.width = this.W * this.dpr; this.el.height = this.H * this.dpr;
    this.el.style.width = this.W + 'px'; this.el.style.height = this.H + 'px';
    this.base.width = this.el.width; this.base.height = this.el.height;
  }
  X(x) { return (x - CFG.bounds.minX + this.pad) * this.ppm; }
  Y(z) { return (CFG.bounds.maxZ - z + this.pad) * this.ppm; }
  // lớp tĩnh (vẽ lại khi vào màn hoặc khi tìm thấy lối thoát)
  build() {
    this.resize();
    const L = this.game.level, c = this.base.getContext('2d'), B = CFG.bounds;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.W, this.H);
    c.fillStyle = 'rgba(16,30,22,.92)'; c.fillRect(this.X(B.minX), this.Y(B.maxZ), (B.maxX - B.minX) * this.ppm, (B.maxZ - B.minZ) * this.ppm);
    for (const m of L.mud) { c.fillStyle = 'rgba(70,52,30,.9)'; c.beginPath(); c.arc(this.X(m.x), this.Y(m.z), m.r * this.ppm, 0, 7); c.fill(); }
    const box = (b, fill) => { c.fillStyle = fill; c.fillRect(this.X(b.minX), this.Y(b.maxZ), (b.maxX - b.minX) * this.ppm, (b.maxZ - b.minZ) * this.ppm); };
    for (const b of L.solids) {
      if (b.kind === 'boundary' || b.kind === 'push') continue; // thùng đẩy được vẽ động ở update()
      const col = { car: '#3a4a6a', hedge: '#2e6a3a', fence: '#8a6a44', crawl: '#8a6a44', yard: '#cfc8b8', wall: '#d9b24c', building: '#7a3a30', coop: '#9a6a3c', kennel: '#b0453a', crate: '#6a5236', bale: '#c9a040', hay: '#e9c46a', tree: '#2f5a33', boulder: '#6d6f6a', low: '#5a4128', pile: '#5c3b22', cart: '#7a5a3a' }[b.kind] || '#666';
      box(b, col);
    }
    for (const bu of L.bushes) { c.fillStyle = '#2e6a3a'; c.beginPath(); c.arc(this.X(bu.x), this.Y(bu.z), 1.1 * this.ppm, 0, 7); c.fill(); }
    // hàng rào biên
    c.strokeStyle = '#a07a50'; c.lineWidth = this.compact ? 1.2 : 2; c.strokeRect(this.X(B.minX), this.Y(B.maxZ), (B.maxX - B.minX) * this.ppm, (B.maxZ - B.minZ) * this.ppm);
    c.font = `700 ${this.compact ? 6.5 : 10}px "Be Vietnam Pro", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    // nhãn & điểm mốc riêng của từng màn (chuồng gà, cổng chính, lối thoát...)
    if (L.drawMinimap) L.drawMinimap(c, this);
  }
  label(c, t, x, z, col, dy = 0) { if (this.compact) dy *= 0.6; c.lineWidth = this.compact ? 2 : 3; c.strokeStyle = 'rgba(5,10,8,.9)'; c.strokeText(t, this.X(x), this.Y(z) + dy); c.fillStyle = col; c.fillText(t, this.X(x), this.Y(z) + dy); }
  ping(x, z, r, kind) {
    const col = { distract: '255,180,90', push: '200,170,120', slide: '191,210,255', run: '191,210,255', step: '160,180,220', land: '191,210,255', vault: '255,207,138', trapnoise: '255,140,90', trap: '255,80,60', alarm: '255,60,60', rock: '230,230,220', bone: '255,243,196', cluck: '255,255,255' }[kind] || '255,255,255';
    this.pings.push({ x, z, r: Math.min(r, 30), col, t: 0, life: kind === 'step' ? 0.6 : 1.3 });
    if (this.pings.length > 24) this.pings.shift();
  }
  update(dt) {
    const g = this.game, p = g.player, L = g.level;
    // màn có điểm bí mật: chỉ vẽ lên bản đồ khi người chơi đã tự tìm thấy
    if (!this.found && L.minimapDiscover && L.minimapDiscover(p)) { this.found = true; this.build(); }
    for (const q of this.pings) q.t += dt;
    this.pings = this.pings.filter((q) => q.t < q.life);
    if ((this.skip = (this.skip + 1) % 2)) return;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.el.width, this.el.height); c.drawImage(this.base, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // thùng gỗ / xe rác (có thể đã bị đẩy đi chỗ khác)
    for (const o of L.pushables) { const s = o.solid; c.fillStyle = o.kind === 'bin' ? '#2f5a3a' : '#8a6a44'; c.fillRect(this.X(s.minX), this.Y(s.maxZ), (s.maxX - s.minX) * this.ppm, (s.maxZ - s.minZ) * this.ppm); }
    // bẫy đã sập
    c.strokeStyle = '#ff5a4a'; c.lineWidth = 2;
    for (const t of L.traps) if (t.triggered) { const x = this.X(t.x), y = this.Y(t.z); c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3); c.moveTo(x + 3, y - 3); c.lineTo(x - 3, y + 3); c.stroke(); }
    // sóng âm
    for (const q of this.pings) {
      const k = q.t / q.life;
      c.strokeStyle = `rgba(${q.col},${(1 - k) * 0.9})`; c.lineWidth = 1.5;
      c.beginPath(); c.arc(this.X(q.x), this.Y(q.z), Math.max(1, q.r * this.ppm * (0.25 + 0.75 * k)), 0, 7); c.stroke();
    }
    // người chơi: nón nhìn + mũi tên theo hướng camera
    const yaw = g.cam.yaw, half = (CFG.view.fov * Math.PI) / 360, px = this.X(p.x), py = this.Y(p.z);
    const dir = (a, d) => [px + Math.sin(a) * d, py - Math.cos(a) * d];
    c.fillStyle = 'rgba(255,240,190,.13)'; c.beginPath(); c.moveTo(px, py);
    for (let i = 0; i <= 12; i++) { const [x, y] = dir(yaw - half + (2 * half * i) / 12, 14 * this.ppm); c.lineTo(x, y); }
    c.closePath(); c.fill();
    const k = this.compact ? 0.7 : 1, [ax, ay] = dir(yaw, 7 * k), [bx, by] = dir(yaw + 2.5, 5 * k), [cx, cy] = dir(yaw - 2.5, 5 * k);
    c.fillStyle = (p.holding && p.holding.target) ? '#ffd166' : '#7ee0a1'; c.strokeStyle = '#06100a'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(cx, cy); c.closePath(); c.fill(); c.stroke();
  }
}
