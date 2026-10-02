/* Tiện ích toán học, va chạm 2D (AABB) và tìm đường A* dùng chung. */
import { CFG } from '../config.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function angleDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
export function turnTo(cur, target, maxStep) { const d = angleDiff(cur, target); return cur + clamp(d, -maxStep, maxStep); }
// giá trị giả ngẫu nhiên ổn định theo toạ độ đỉnh (làm méo khối đá mà không bị nứt mép)
export function hashN(x, y, z, s) { const v = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719 + s * 91.7) * 43758.5453; return v - Math.floor(v); }
export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// đồng hồ speedrun: Phút:Giây.Phần trăm giây (00:00.00)
export const fmtRun = (s) => {
  if (!Number.isFinite(s)) return '--:--.--';
  const cs = Math.floor(s * 100 + 1e-6), p2 = (n) => String(n).padStart(2, '0');
  return `${p2(Math.floor(cs / 6000))}:${p2(Math.floor(cs / 100) % 60)}.${p2(cs % 100)}`;
};


export const Collision = {
  aabb(minX, maxX, minZ, maxZ, sight, kind) { return { minX, maxX, minZ, maxZ, sight, kind }; },
  // đẩy hình tròn ra khỏi hộp; trả về true nếu có va chạm
  circleVsAABB(p, r, b) {
    const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
    else {
      const l = p.x - b.minX, rr = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z, m = Math.min(l, rr, t, bt);
      if (m === l) p.x = b.minX - r; else if (m === rr) p.x = b.maxX + r; else if (m === t) p.z = b.minZ - r; else p.z = b.maxZ + r;
    }
    return true;
  },
  pointIn(x, z, b, pad = 0) { return x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad; },
  // tia 2D (hướng đã chuẩn hóa) cắt hộp: trả về khoảng cách vào hộp, hoặc Infinity
  rayAABB(ox, oz, dx, dz, b) {
    let tmin = 0, tmax = Infinity;
    for (const [o, d, mn, mx] of [[ox, dx, b.minX, b.maxX], [oz, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return Infinity; continue; }
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    return tmin;
  },
  // khoảng cách nhìn được tối đa theo một hướng (bị chặn bởi vật cản che tầm nhìn)
  rayCast(ox, oz, dx, dz, maxD, solids) {
    let best = maxD;
    for (const b of solids) {
      if (!b.sight) continue;
      const t = Collision.rayAABB(ox, oz, dx, dz, b);
      if (t < best) best = t;
    }
    return best;
  },
};

/* ============================= NavGrid (A*) ============================= */
export class NavGrid {
  constructor(solids) {
    const B = CFG.bounds;
    this.minX = B.minX; this.minZ = B.minZ;
    this.w = B.maxX - B.minX; this.h = B.maxZ - B.minZ;
    this.blocked = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = this.minX + i + 0.5, z = this.minZ + j + 0.5;
        if (solids.some((b) => Collision.pointIn(x, z, b, 0.55))) this.blocked[j * this.w + i] = 1;
      }
    }
  }
  cellOf(x, z) {
    const i = clamp(Math.floor(x - this.minX), 0, this.w - 1), j = clamp(Math.floor(z - this.minZ), 0, this.h - 1);
    return j * this.w + i;
  }
  center(c) { return { x: this.minX + (c % this.w) + 0.5, z: this.minZ + Math.floor(c / this.w) + 0.5 }; }
  nearestFree(c) {
    if (!this.blocked[c]) return c;
    const seen = new Uint8Array(this.blocked.length), q = [c]; seen[c] = 1;
    while (q.length) {
      const cur = q.shift();
      if (!this.blocked[cur]) return cur;
      const x = cur % this.w, z = Math.floor(cur / this.w);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
        const n = nz * this.w + nx;
        if (!seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
    return c;
  }
  lineFree(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(d / 0.3);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (this.blocked[this.cellOf(lerp(a.x, b.x, t), lerp(a.z, b.z, t))]) return false;
    }
    return true;
  }
  findPath(sx, sz, tx, tz) {
    const W = this.w, H = this.h, N = W * H;
    const s = this.nearestFree(this.cellOf(sx, sz));
    const t = this.nearestFree(this.cellOf(tx, tz));
    const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let k = 0;
        for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; }
      }
      return top[1];
    };
    const tx0 = t % W, tz0 = Math.floor(t / W);
    const hfn = (i) => { const dx = Math.abs((i % W) - tx0), dz = Math.abs(Math.floor(i / W) - tz0); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    g[s] = 0; push(hfn(s), s);
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length) {
      const cur = pop();
      if (cur === t) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cz = Math.floor(cur / W);
      for (const [dx, dz, c] of DIRS) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const n = nz * W + nx;
        if (this.blocked[n] || closed[n]) continue;
        if (dx && dz && (this.blocked[cz * W + nx] || this.blocked[nz * W + cx])) continue;
        const ng = g[cur] + c;
        if (ng < g[n]) { g[n] = ng; came[n] = cur; push(ng + hfn(n), n); }
      }
    }
    if (s !== t && came[t] === -1) return [{ x: tx, z: tz }];
    const cells = [];
    for (let c = t; c !== -1 && c !== s; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.center(c));
    if (!this.blocked[this.cellOf(tx, tz)]) { if (pts.length) pts[pts.length - 1] = { x: tx, z: tz }; else pts.push({ x: tx, z: tz }); }
    // làm mượt đường đi (string pulling)
    const out = []; let from = { x: sx, z: sz }, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineFree(from, pts[j])) j--;
      out.push(pts[j]); from = pts[j]; i = j + 1;
    }
    return out;
  }
}
