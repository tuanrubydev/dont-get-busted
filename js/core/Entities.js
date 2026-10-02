/* Vật thể trong màn dùng chung: quỹ đạo ném, xương (mồi), bụi cây, bùn, đồ ném (đá/cành/xô),
 * thùng gỗ / xe rác đẩy được, thùng phuy & lưới thép gây tiếng động giả. */
import { THREE } from '../engine/three.js';
import { CFG } from '../config.js';
import { clamp, lerp, Collision } from '../engine/utils.js';
import { G, mesh, std, lam, metal, Models, crateMat } from '../engine/Models.js';

// Quỹ đạo ném: dùng chung cho đường ngắm và đường bay thật, nên xương rơi đúng chỗ đã ngắm.
export const ThrowArc = {
  height(d) { return 1.4 + d * 0.2; },
  // thời gian bay: ném mạnh hơn → bay nhanh hơn (≈1.6 lần bản cũ)
  duration(d) { return 0.3 + d * 0.022; },
  point(from, to, k, out) {
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    out.x = lerp(from.x, to.x, k); out.z = lerp(from.z, to.z, k);
    out.y = lerp(1.5, 0.15, k) + Math.sin(k * Math.PI) * ThrowArc.height(d);
    return out;
  },
};

export class Bone {
  constructor(scene, x, z) {
    this.x = x; this.z = z;
    this.state = 'ground';  // ground | held | flying | eating | gone
    this.throwable = true;
    this.eaters = new Set();
    this.mesh = Models.bone(); this.mesh.position.set(x, 0.12, z); this.mesh.rotation.y = Math.random() * 6;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.5, depthWrite: false }));
    this.ring.position.set(x, 0.03, z);
    scene.add(this.mesh, this.ring);
    this.fly = null; this._p = { x: 0, y: 0, z: 0 };
  }
  get available() { return this.state === 'ground' || this.state === 'eating'; }
  throwTo(from, to) {
    this.state = 'flying';
    this.fly = { from: { x: from.x, z: from.z }, to, t: 0, dur: ThrowArc.duration(Math.hypot(to.x - from.x, to.z - from.z)) };
  }
  // chó bắt đầu/ngừng gặm
  addEater(dog) { this.eaters.add(dog); this.state = 'eating'; }
  removeEater(dog, finished) {
    this.eaters.delete(dog);
    if (!this.eaters.size && this.state === 'eating') {
      this.state = finished ? 'gone' : 'ground';
      if (finished) this.mesh.visible = false;
    }
  }
  update(dt, time, game) {
    this.ring.visible = false; // không tô sáng xương: người chơi tự tìm
    if (this.state === 'ground') {
      this.mesh.position.set(this.x, 0.14 + Math.sin(time * 3) * 0.03, this.z);
      this.ring.material.opacity = 0.3 + Math.sin(time * 4) * 0.2;
      this.ring.position.set(this.x, 0.03, this.z);
    } else if (this.state === 'flying') {
      const f = this.fly; f.t += dt;
      const k = Math.min(1, f.t / f.dur), p = ThrowArc.point(f.from, f.to, k, this._p);
      this.x = p.x; this.z = p.z;
      this.mesh.position.set(p.x, p.y, p.z);
      this.mesh.rotation.x += dt * 14;
      if (k >= 1) { this.state = 'ground'; this.mesh.rotation.x = 0; game.onThrowLanded(this); }
    } else if (this.state === 'eating') {
      let left = 0;
      for (const d of this.eaters) left = Math.max(left, d.timer);
      this.mesh.scale.setScalar(clamp(left / CFG.eatTime, 0.25, 1));
      this.mesh.position.set(this.x, 0.12, this.z);
    }
  }
}

export class Bush {
  constructor(scene, x, z, seed) {
    this.x = x; this.z = z; this.r = 1.15; this.shake = 0;
    this.group = Models.bush(seed); this.group.position.set(x, 0, z); scene.add(this.group);
  }
  update(dt, time) {
    this.shake = Math.max(0, this.shake - dt);
    const k = this.shake > 0 ? Math.sin(time * 40) * 0.08 * this.shake : 0;
    this.group.rotation.z = k; this.group.scale.setScalar(1 + Math.abs(k) * 0.5);
  }
}

export class Mud {
  constructor(scene, x, z, r) {
    this.x = x; this.z = z; this.r = r;
    const geo = new THREE.CircleGeometry(r, 28); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 1; i < p.count; i++) { const k = 0.85 + Math.sin(i * 1.7) * 0.1 + Math.random() * 0.08; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ envMapIntensity: 0.45, color: 0x3a2818, roughness: 0.22, metalness: 0.05 }));
    m.position.set(x, 0.025, z); m.receiveShadow = true; scene.add(m);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * 6.28, d = Math.random() * r * 0.7;
      const b = new THREE.Mesh(G.sph, new THREE.MeshStandardMaterial({ envMapIntensity: 0.45, color: 0x2c1e12, roughness: 0.4 }));
      b.position.set(x + Math.cos(a) * d, 0.02, z + Math.sin(a) * d); b.scale.set(0.25 + Math.random() * 0.3, 0.06, 0.25 + Math.random() * 0.3);
      scene.add(b);
    }
  }
  contains(x, z) { return Math.hypot(x - this.x, z - this.z) < this.r * 0.88; }
}

// Vật nhặt được để ném: hòn đá, cành khô, xô rỗng. Ném trúng bẫy thì phá bẫy từ xa; rơi xuống đất thì gây tiếng động giả
// (chó không ăn được). Mỗi loại một kiểu tiếng: đá "CỘP!" vừa, cành "CẠCH!" nhỏ, xô "LOẢNG XOẢNG!" rất to.
export const THROWABLES = {
  rock: { name: 'hòn đá', text: 'CỘP!', noise: 8, sfx: 'thud', y: 0.14 },
  stick: { name: 'cành khô', text: 'CẠCH!', noise: 6, sfx: 'crack', y: 0.06 },
  bucket: { name: 'xô rỗng', text: 'LOẢNG XOẢNG!', noise: 13, sfx: 'clang', y: 0.0 },
};
export class Rock {
  constructor(scene, x, z, kind = 'rock') {
    this.x = x; this.z = z; this.state = 'ground'; this.throwable = true; this.kind = kind; this.conf = THROWABLES[kind];
    if (kind === 'stick') {
      this.mesh = new THREE.Group();
      mesh(G.cyl, std(0x6a4e32, { roughness: 1 }), 0, 0, 0, 0.035, 1.0, 0.035, this.mesh).rotation.z = Math.PI / 2;
      mesh(G.cyl, std(0x6a4e32, { roughness: 1 }), 0.25, 0.02, 0.1, 0.02, 0.35, 0.02, this.mesh).rotation.set(0, 0.7, Math.PI / 2);
      this.mesh.rotation.y = x * 2.1 + z;
    } else if (kind === 'bucket') {
      this.mesh = Models.bucket(); this.mesh.rotation.y = x + z;
    } else {
      this.mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), lam(0x8a8a86)); this.mesh.castShadow = true;
    }
    this.mesh.position.set(x, this.conf.y, z);
    scene.add(this.mesh); this.fly = null; this._p = { x: 0, y: 0, z: 0 };
  }
  get available() { return false; }
  throwTo(from, to) { this.state = 'flying'; this.fly = { from: { x: from.x, z: from.z }, to, t: 0, dur: ThrowArc.duration(Math.hypot(to.x - from.x, to.z - from.z)) }; }
  update(dt, time, game) {
    if (this.state !== 'flying') { if (this.state === 'ground') this.mesh.position.set(this.x, this.conf.y, this.z); return; }
    const f = this.fly; f.t += dt;
    const k = Math.min(1, f.t / f.dur), p = ThrowArc.point(f.from, f.to, k, this._p);
    this.x = p.x; this.z = p.z; this.mesh.position.set(p.x, p.y, p.z); this.mesh.rotation.x += dt * 12;
    if (k >= 1) { this.state = 'ground'; this.mesh.rotation.x = 0; game.onThrowLanded(this); }
  }
}

// Thùng gỗ nhẹ / xe rác: đi thẳng vào để đẩy trượt (hoặc bấm E để đẩy một đoạn). Che được tầm nhìn của chó.
export class Pushable {
  constructor(root, x, z, kind) {
    this.kind = kind; this.x = x; this.z = z;
    this.half = kind === 'bin' ? 0.55 : 0.55; this.h = kind === 'bin' ? 1.3 : 1.1;
    this.group = new THREE.Group(); root.add(this.group);
    if (kind === 'bin') { // xe rác có bánh
      mesh(G.box, std(0x2f5a3a, { roughness: 0.6 }), 0, 0.68, 0, 1.0, 1.1, 1.0, this.group);
      mesh(G.box, std(0x244a2e, { roughness: 0.6 }), 0, 1.26, -0.05, 1.08, 0.08, 1.12, this.group).rotation.x = -0.06;
      for (const sx of [-1, 1]) mesh(G.cyl, std(0x151515), sx * 0.4, 0.1, -0.42, 0.1, 0.06, 0.1, this.group).rotation.z = Math.PI / 2;
    } else {
      const m = mesh(G.box, crateMat(), 0, 0.55, 0, 1.1, 1.1, 1.1, this.group); m.material = crateMat();
      mesh(G.box, std(0x4a321c), 0, 1.12, 0, 0.9, 0.04, 0.15, this.group);
    }
    this.solid = Collision.aabb(x - this.half, x + this.half, z - this.half, z + this.half, true, 'push');
    this.solid.h = this.h; this.solid.ref = this;
    this.sync();
    this.slide = null; this.scrapeT = 0;
  }
  sync() {
    const s = this.solid, hf = this.half;
    s.minX = this.x - hf; s.maxX = this.x + hf; s.minZ = this.z - hf; s.maxZ = this.z + hf;
    this.group.position.set(this.x, 0, this.z);
  }
  // thử dịch chuyển (dx, dz); bị vật khác chặn thì không đi
  tryMove(dx, dz, solids) {
    const nx = this.x + dx, nz = this.z + dz, hf = this.half - 0.02, B = CFG.bounds;
    if (nx - hf < B.minX + 0.2 || nx + hf > B.maxX - 0.2 || nz - hf < B.minZ + 0.2 || nz + hf > B.maxZ - 0.2) return false;
    for (const o of solids) {
      if (o === this.solid) continue;
      if (nx + hf > o.minX && nx - hf < o.maxX && nz + hf > o.minZ && nz - hf < o.maxZ) return false;
    }
    this.x = nx; this.z = nz; this.sync(); this.moved = true;
    return true;
  }
  update(dt, game) {
    if (this.slide) {
      const s = this.slide, st = Math.min(s.left, 2.2 * dt);
      if (!this.tryMove(s.dx * st, s.dz * st, game.level.solids)) this.slide = null;
      else { s.left -= st; if (s.left <= 0) this.slide = null; }
      game.onPushScrape(this, dt);
    }
    this.group.rotation.z = this.slide ? Math.sin(game.time * 40) * 0.01 : 0;
  }
}

// Đồ gây tiếng động giả: thùng phuy rỗng (đá vào) hoặc tấm hàng rào lưới thép (rung)
export class Distractor {
  constructor(root, x, z, kind) {
    this.kind = kind; this.x = x; this.z = z; this.cool = 0; this.wob = 0;
    this.group = new THREE.Group(); this.group.position.set(x, 0, z); root.add(this.group);
    if (kind === 'barrel') {
      const steel = metal(0x4e5a52, { roughness: 0.55, envMapIntensity: 0.6 });
      mesh(G.cyl, steel, 0, 0.5, 0, 0.33, 1.0, 0.33, this.group);
      for (const y of [0.15, 0.5, 0.85]) mesh(G.cyl, metal(0x3a423c, { roughness: 0.5 }), 0, y, 0, 0.345, 0.04, 0.345, this.group);
      mesh(G.cyl, std(0x6a3a22, { roughness: 1 }), 0, 1.0, 0, 0.3, 0.02, 0.3, this.group); // rỉ sét
      this.solid = Collision.aabb(x - 0.36, x + 0.36, z - 0.36, z + 0.36, false, 'pile'); this.solid.h = 1.0;
    } else { // lưới thép áp sát hàng rào biên
      const steel = metal(0x8a929a, { roughness: 0.45 });
      this.group.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      for (const sx of [-1.4, 1.4]) mesh(G.cyl, steel, sx, 0.9, 0, 0.04, 1.8, 0.04, this.group);
      this.mesh = new THREE.Group(); this.group.add(this.mesh);
      for (let i = 0; i <= 10; i++) { mesh(G.box, steel, -1.4 + i * 0.28, 0.9, 0, 0.012, 1.6, 0.012, this.mesh).castShadow = false; }
      for (let j = 0; j <= 6; j++) { mesh(G.box, steel, 0, 0.1 + j * 0.27, 0, 2.8, 0.012, 0.012, this.mesh).castShadow = false; }
      mesh(G.box, std(0x8a2a22), 0, 1.4, 0.03, 0.6, 0.32, 0.01, this.mesh); // biển "CẤM VÀO"
    }
  }
  update(dt, game) {
    this.cool = Math.max(0, this.cool - dt);
    this.wob = Math.max(0, this.wob - dt);
    const k = this.wob > 0 ? Math.sin(game.time * (this.kind === 'barrel' ? 22 : 45)) * this.wob : 0;
    if (this.kind === 'barrel') this.group.rotation.z = k * 0.25;
    else this.mesh.position.z = k * 0.08;
  }
}
