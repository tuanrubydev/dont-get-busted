/* =====================================================================
 * MÀN 2 — Trộm Chó Cảnh ở Khu Đô Thị (KHUNG MẪU, chơi thử được)
 * Logic riêng của màn này, hoàn toàn tách khỏi Màn 1:
 *   - Bảo vệ tuần tra (dùng chung AI lính canh core/Dog.js nhưng mô hình người, chạy chậm hơn bạn)
 *   - Camera an ninh quét qua lại: nhìn thấy bạn đủ lâu thì hú còi, mọi bảo vệ lao tới
 *   - Chó cảnh trong vườn của toà nhà cao cấp; mang lên xe tải ở góc đông nam là thắng
 * Muốn mở rộng (dân cư, cửa khoá, thang máy...) chỉ cần sửa file này.
 * ===================================================================== */
import { THREE } from '../engine/three.js';
import { CFG } from '../config.js';
import { lerp, angleDiff, turnTo, Collision } from '../engine/utils.js';
import { G, mesh, pivot, std, metal, basic } from '../engine/Models.js';
import { Sfx } from '../engine/AudioManager.js';
import { LevelBase } from './LevelBase.js';

const CITY = {
  bounds: { minX: -25, maxX: 25, minZ: -30, maxZ: 30 },
  start: { x: 0, z: -27, r: 2.6 },
  garden: { minX: -6, maxX: 6, minZ: 16, maxZ: 26 },     // vườn chó cảnh (hàng rào cây thấp, cổng ở mép nam)
  van: { x: 20.5, z: -24, r: 2.6 },                      // xe tải tẩu thoát
};

// toà nhà [x, z, rộng, sâu, số tầng] — chặn đường & che tầm nhìn
const BUILDINGS = [[-15, -12, 12, 12, 5], [15, -10, 12, 14, 6], [-15, 13, 12, 12, 4], [12, 27, 18, 5, 8], [-16, 27, 14, 5, 3]];
// xe đỗ ven đường [x, z, hướng] — thấp hơn 1.5 m nên trèo qua được
const CARS = [[-6.5, -18, 0], [6.5, -6, 0], [-6.5, 6, 0], [6.5, 12, Math.PI], [19, 5, Math.PI / 2]];

// bảo vệ: dùng chung AI lính canh, đổi mô hình người, tiếng hô và chạy chậm hơn bạn một chút (chạy hết sức thì thoát được)
const GUARD = { model: guardModel, shout: 'ĐỨNG LẠI!', speedMul: 0.85 };
const DATA = {
  seed: 77,
  dogs: [
    // bảo vệ gác cổng vườn, đảo mắt qua lại
    { ...GUARD, post: [0, 13.6], facing: Math.PI, sweep: 0.9, sweepSpeed: 0.5, range: 12, fov: 90 },
    // bảo vệ tuần dọc trục đường chính và con hẻm phía tây
    { ...GUARD, path: [[-3, -14], [-3, 4], [3, 4], [3, -14]], pause: 1.5, range: 11, fov: 90 },
    { ...GUARD, path: [[-22, -24], [-22, 6]], pause: 2, range: 10, fov: 90 },
  ],
  bushes: [[-9, -1], [9, 1.5], [-21.5, -8], [21, 15], [-3.5, 22], [10.5, -24]],
  rocks: [[1.5, -24], [-9, -22], [9, -18]],
  props: { bins: [[-9.5, 19], [21, -3]], barrels: [[-21, 20], [9, 19.5]], crates: [[21.5, -16]] },
  // camera gắn ở góc toà nhà (đặt ngay ngoài khối nhà để tầm nhìn không bị chính toà nhà che)
  cameras: [{ x: 8.6, z: -2.6, facing: -Math.PI / 2, sweep: 0.8, speed: 0.55 }, { x: -8.6, z: 6.4, facing: Math.PI / 2, sweep: 0.7, speed: 0.45 }],
};

/* ---------- mô hình riêng của khu đô thị ---------- */
function guardModel(index) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const uni = std(index % 2 ? 0x24324a : 0x1e2a3e), skin = std(0xd9a07a), cap = std(0x141c2a), belt = std(0x0e0e10);
  const legs = [];
  for (const s of [-1, 1]) { const p = pivot(g, s * 0.16, 0.85, 0); mesh(G.cyl, uni, 0, -0.42, 0, 0.12, 0.85, 0.12, p); legs.push(p); }
  mesh(G.cyl, uni, 0, 1.3, 0, 0.36, 0.8, 0.3, body);
  mesh(G.box, belt, 0, 0.95, 0, 0.7, 0.08, 0.5, body);
  mesh(G.box, std(0xd8c060, { emissive: 0x2a2000 }), 0.15, 1.5, 0.27, 0.12, 0.1, 0.02, body); // phù hiệu
  const head = pivot(g, 0, 1.92, 0);
  mesh(G.sph, skin, 0, 0, 0, 0.25, 0.27, 0.25, head);
  mesh(G.cyl, cap, 0, 0.2, 0, 0.27, 0.12, 0.27, head);
  mesh(G.box, cap, 0, 0.16, 0.24, 0.3, 0.03, 0.18, head);
  for (const s of [-1, 1]) mesh(G.sph, basic(0x111111), s * 0.08, 0.04, 0.22, 0.03, 0.03, 0.02, head);
  const torch = pivot(g, 0.45, 1.25, 0.25);
  mesh(G.cyl, std(0x222222), 0, 0, 0, 0.05, 0.3, 0.05, torch).rotation.x = Math.PI / 2;
  mesh(G.sph, basic(0xfff6c8), 0, 0, 0.16, 0.05, 0.05, 0.02, torch);
  return { group: g, head, tail: new THREE.Object3D(), legs };
}

function poodleModel() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const fluff = std(0xf4eef0, { roughness: 1 }), pink = std(0xff8fb8, { roughness: 0.8 });
  mesh(G.sph, fluff, 0, 0.42, 0, 0.32, 0.26, 0.42, body);
  mesh(G.sph, fluff, 0, 0.62, 0.38, 0.2, 0.2, 0.2, body);
  mesh(G.sph, fluff, 0, 0.82, 0.4, 0.15, 0.15, 0.15, body);            // búi lông trên đầu
  mesh(G.sph, std(0x222222), 0, 0.6, 0.57, 0.04, 0.04, 0.04, body);   // mũi
  for (const s of [-1, 1]) mesh(G.sph, fluff, s * 0.17, 0.6, 0.33, 0.08, 0.15, 0.08, body);
  mesh(G.cyl, pink, 0, 0.52, 0.27, 0.2, 0.05, 0.2, body).rotation.x = 0.4; // vòng cổ hồng
  mesh(G.sph, fluff, 0, 0.6, -0.45, 0.11, 0.11, 0.11, body);          // đuôi bông
  const legs = [];
  for (const [x, z] of [[-0.14, 0.25], [0.14, 0.25], [-0.14, -0.25], [0.14, -0.25]]) {
    const p = pivot(g, x, 0.3, z); mesh(G.cyl, fluff, 0, -0.15, 0, 0.05, 0.3, 0.05, p); mesh(G.sph, fluff, 0, -0.28, 0, 0.08, 0.06, 0.08, p); legs.push(p);
  }
  return { group: g, body, legs };
}

// chó cảnh: đi lững thững trong vườn; mục tiêu nhiệm vụ (target = true)
class Poodle {
  constructor(root) {
    const A = CITY.garden;
    this.x = 0; this.z = 21; this.carried = false; this.target = true;
    this.rig = poodleModel(); this.rig.group.position.set(this.x, 0, this.z); root.add(this.rig.group);
    this.dest = { x: this.x, z: this.z }; this.wait = 1; this.facing = 0; this.A = A;
  }
  update(dt, time) {
    if (this.carried) return;
    const A = this.A, dx = this.dest.x - this.x, dz = this.dest.z - this.z, d = Math.hypot(dx, dz);
    this.wait -= dt;
    if (d > 0.1 && this.wait <= 0) {
      const sp = 1.4 * dt; this.x += (dx / d) * Math.min(sp, d); this.z += (dz / d) * Math.min(sp, d);
      this.facing = turnTo(this.facing, Math.atan2(dx, dz), dt * 8);
      this.rig.legs.forEach((l, i) => { l.rotation.x = Math.sin(time * 16 + (i % 2) * Math.PI) * 0.6; });
    } else if (this.wait <= 0) {
      this.wait = 1 + Math.random() * 2;
      this.dest = { x: lerp(A.minX + 1.2, A.maxX - 1.2, Math.random()), z: lerp(A.minZ + 1.5, A.maxZ - 1.2, Math.random()) };
    }
    this.rig.group.position.set(this.x, 0, this.z); this.rig.group.rotation.y = this.facing;
  }
}

// camera an ninh: quét qua lại; nhìn thấy bạn đủ lâu (thanh nghi ngờ đầy) thì báo động
class SecurityCam {
  constructor(root, c) {
    Object.assign(this, { x: c.x, z: c.z, base: c.facing, sweep: c.sweep, speed: c.speed });
    this.facing = c.facing; this.range = 14; this.fov = (50 * Math.PI) / 180; this.sus = 0; this.alarmed = false;
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); root.add(g);
    mesh(G.cyl, metal(0x5a5f66, { roughness: 0.5 }), 0, 1.6, 0, 0.06, 3.2, 0.06, g);
    this.head = pivot(g, 0, 3.2, 0);
    mesh(G.box, std(0xdedede, { roughness: 0.5 }), 0, 0, 0.12, 0.22, 0.2, 0.42, this.head);
    mesh(G.cyl, std(0x111111), 0, 0, 0.35, 0.07, 0.08, 0.07, this.head).rotation.x = Math.PI / 2;
    this.led = mesh(G.sph, basic(0xff2020), 0.08, 0.07, 0.3, 0.025, 0.025, 0.025, this.head);
    // nón quan sát (quạt tam giác bị vật cản cắt), giống chó canh nhưng màu xanh
    this.rays = 22;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((this.rays + 2) * 3), 3));
    const idx = []; for (let i = 1; i <= this.rays; i++) idx.push(0, i, i + 1);
    geo.setIndex(idx);
    this.cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
    this.cone.material.userData.fowAlpha = true; this.cone.frustumCulled = false; root.add(this.cone);
  }
  canSee(p, level) {
    if (p.hidden) return false;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    if (d > this.range * (p.stealth || 1) || d < 0.5) return false;
    if (p.stance === 'prone' && level.inGrass(p.x, p.z)) return false;
    if (Math.abs(angleDiff(this.facing, Math.atan2(dx, dz))) > this.fov / 2) return false;
    return Collision.rayCast(this.x, this.z, dx / d, dz / d, d, level.solids) >= d - 0.05;
  }
  update(dt, time, game) {
    const level = game.level;
    this.facing = this.base + Math.sin(time * this.speed) * this.sweep;
    this.head.rotation.y = this.facing;
    const see = game.state === 'play' && this.canSee(game.player, level);
    this.sus = see ? this.sus + dt * 1.4 : Math.max(0, this.sus - dt * 0.5);
    if (this.sus >= 1 && !this.alarmed) {
      this.alarmed = true;
      Sfx.play('siren', 3);
      game.fx.pop(this, 'BÁO ĐỘNG!', 'clang', 1.6, 3.6);
      game.failCause = game.failCause || 'camera';
      for (const d of level.dogs) d.hear(game.player.x, game.player.z, 'alarm', null, game);
    }
    this.led.material = basic(Math.sin(time * 8) > 0 || this.sus > 0.1 ? 0xff2020 : 0x330000);
    // vẽ nón
    const pos = this.cone.geometry.attributes.position, y = 0.08;
    pos.setXYZ(0, this.x, y, this.z);
    for (let i = 0; i <= this.rays; i++) {
      const a = this.facing - this.fov / 2 + (this.fov * i) / this.rays, dx = Math.sin(a), dz = Math.cos(a);
      const len = Collision.rayCast(this.x, this.z, dx, dz, this.range, level.solids);
      pos.setXYZ(i + 1, this.x + dx * len, y, this.z + dz * len);
    }
    pos.needsUpdate = true; this.cone.geometry.computeBoundingSphere();
    const m = this.cone.material;
    m.color.setHex(this.alarmed ? 0xff2a2a : this.sus > 0.1 ? 0xffa040 : 0x5ab4ff);
    m.opacity = this.alarmed ? 0.3 : 0.14 + this.sus * 0.15;
  }
}

export class Level2_Urban extends LevelBase {
  static meta = {
    goals: ['Bế chú chó cảnh trong vườn', 'Mang chó lên xe tải tẩu thoát'],
    code: 'Nhiệm vụ 2', title: 'Trộm Chó Cảnh', place: 'Khu đô thị Sao Mai · nửa đêm',
    goal: 'Bắt cóc chú chó cảnh quý tộc trong vườn toà nhà cao cấp và mang ra xe tải ở góc đông nam.',
    danger: ['Bảo vệ tuần tra và gác cổng vườn. Họ chạy chậm hơn bạn một chút, nhưng có đèn pin.', 'Camera an ninh quét qua lại: lọt vào ống kính đủ lâu là hú còi, mọi bảo vệ lao tới.', 'Bản thử nghiệm: chưa có cư dân.'],
    win: 'Mang chó cảnh lên xe tải mà không bị bảo vệ tóm.',
    lose: 'Bị bảo vệ tóm được.',
    intel: 'Thùng rác và xe rác gây tiếng động rất to. Bãi cỏ cao cạnh các toà nhà đủ để nằm bò ẩn nấp.',
    diff: 'Khu đô thị (bản thử)', par: 70, minRunTime: 15, beta: true,
    simTimes: [33.4, 36.9, 40.15, 43.8, 47.2, 51.66, 55.9, 61.3, 68.45, 79.9],
  };
  static bounds = CITY.bounds;
  static start = CITY.start;

  init() {
    super.init();
    const root = this.root, C = Collision;
    this.titleOrbit = { r: 46, h: 34 };
    this.buildCity(root);
    this.solids = this.staticSolids();
    for (const [x, z, w, d] of BUILDINGS) this.solids.push(C.aabb(x - w / 2, x + w / 2, z - d / 2, z + d / 2, true, 'building'));
    for (const [x, z, r] of CARS) {
      const along = Math.abs(Math.sin(r)) > 0.5, hx = along ? 2.1 : 0.95, hz = along ? 0.95 : 2.1;
      const s = C.aabb(x - hx, x + hx, z - hz, z + hz, false, 'car'); s.h = 1.4; this.solids.push(s);
    }
    // hàng rào cây quanh vườn (cao 1.1 m, trèo được), chừa cổng 2.4 m ở mép nam
    const A = CITY.garden, hedge = (a, b, c, d) => { const s = C.aabb(a, b, c, d, false, 'hedge'); s.h = 1.1; this.solids.push(s); this.hedgeMesh(root, s); };
    hedge(A.minX - 0.4, A.minX, A.minZ, A.maxZ); hedge(A.maxX, A.maxX + 0.4, A.minZ, A.maxZ);
    hedge(A.minX - 0.4, -1.2, A.minZ - 0.4, A.minZ); hedge(1.2, A.maxX + 0.4, A.minZ - 0.4, A.minZ);
    this.buildCommon(DATA, { traps: [], routes: [] });
    this.poodle = new Poodle(root);
    this.cams = DATA.cameras.map((c) => new SecurityCam(root, c));
    this.exit = { x: CITY.van.x, z: CITY.van.z, dir: Math.PI / 2 };
  }

  update(dt) {
    const t = this.game.time;
    this.poodle.update(dt, t);
    for (const c of this.cams) c.update(dt, t, this.game);
  }

  checkWinCondition() {
    const p = this.game.player, h = p.holding;
    return !!(h && h.target) && Math.hypot(p.x - CITY.van.x, p.z - CITY.van.z) < CITY.van.r;
  }

  interactions(p, near) {
    const d = this.poodle;
    if (!d.carried && !(p.holding && p.holding.target) && near(d, CFG.interact)) return { type: 'grabPet', label: 'Bế chó cảnh', ref: d, focus: d.rig.group };
    return null;
  }
  doAction(a) {
    if (a.type !== 'grabPet') return false;
    const g = this.game, p = g.player, d = a.ref;
    g.dropHeld();
    d.carried = true; p.holding = d;
    d.rig.group.parent.remove(d.rig.group); p.rig.carry.add(d.rig.group);
    d.rig.group.position.set(0, -0.3, 0); d.rig.group.rotation.set(0, 0, 0);
    g.fx.pop(p, 'Gâu gâu!', 'pop', 1.1, 2.9);
    Sfx.play('bark');
    g.emitNoise(p.x, p.z, 7, 'cluck'); // chó cảnh sủa: to hơn gà
    return true;
  }

  bustReason(why, game) {
    return {
      camera: 'Camera an ninh đã ghi hình bạn và hú còi. Bảo vệ ập tới.',
      trap: `${game.trapHit} làm ồn, bảo vệ đã tìm tới.`,
      seen: 'Bảo vệ đã nhìn thấy bạn và đuổi kịp.',
      close: 'Bạn đi quá sát một bảo vệ.',
    }[why] || 'Bạn đã bị bảo vệ tóm.';
  }

  drawMinimap(c, map) {
    const A = CITY.garden, V = CITY.van;
    c.strokeStyle = '#4fa86a'; c.lineWidth = 1.5; c.strokeRect(map.X(A.minX), map.Y(A.maxZ), (A.maxX - A.minX) * map.ppm, (A.maxZ - A.minZ) * map.ppm);
    map.label(c, 'Vườn chó cảnh', 0, (A.minZ + A.maxZ) / 2, '#ffd27a');
    map.label(c, 'Xe tải', V.x - 1, V.z, '#7ee0a1', -8);
    c.fillStyle = '#7ee0a1'; c.fillRect(map.X(V.x) - 4, map.Y(V.z) - 3, 8, 6);
    for (const cam of DATA.cameras) { c.fillStyle = '#5ab4ff'; c.beginPath(); c.arc(map.X(cam.x), map.Y(cam.z), 2.5, 0, 7); c.fill(); }
    map.label(c, 'Xuất phát', CITY.start.x, CITY.start.z, '#e9eefb', 8);
  }
  decorKeepClear() { return [[0, 21], [CITY.van.x, CITY.van.z], ...DATA.cameras.map((c) => [c.x, c.z])]; }
  decorExclude(x, z) {
    const A = CITY.garden;
    if (Math.abs(x) < 5 || Math.abs(z - 2) < 3) return true;                    // đường nhựa
    return x > A.minX - 1.5 && x < A.maxX + 1.5 && z > A.minZ - 1.5 && z < A.maxZ + 1.5;
  }

  /* ---------- dựng khu phố ---------- */
  hedgeMesh(root, s) {
    const m = mesh(G.box, std(0x24502e, { roughness: 1 }), (s.minX + s.maxX) / 2, 0.55, (s.minZ + s.maxZ) / 2, s.maxX - s.minX, 1.1, s.maxZ - s.minZ, root);
    m.receiveShadow = true;
  }
  buildCity(root) {
    const B = CITY.bounds, ground = new THREE.Group(); root.add(ground);
    const plane = (w, d, color, x, z, y = 0, rough = 0.95) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), std(color, { roughness: rough }));
      m.position.set(x, y, z); m.receiveShadow = true; ground.add(m); return m;
    };
    plane(160, 160, 0x1a1f22, 0, 0, -0.01);                                    // nền ngoài khu
    plane(B.maxX - B.minX, B.maxZ - B.minZ, 0x2e4a32, 0, 0, 0);                 // bãi cỏ
    plane(10, B.maxZ - B.minZ, 0x2a2c30, 0, 0, 0.01, 0.75);                     // đường nhựa trục dọc
    plane(B.maxX - B.minX, 6, 0x2a2c30, 0, 2, 0.012, 0.75);                     // đường ngang
    plane(12, 6, 0x6a6a64, 0, 21, 0.015);                                       // lối sỏi trong vườn
    for (let z = B.minZ + 2; z < B.maxZ; z += 4) plane(0.18, 1.8, 0xd8d0a0, 0, z, 0.02, 0.6); // vạch kẻ đường
    // toà nhà: khối + cửa sổ sáng / tối ngẫu nhiên
    for (const [x, z, w, d, fl] of BUILDINGS) {
      const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
      const h = fl * 3;
      mesh(G.box, std(0x4a4f58, { roughness: 0.85 }), 0, h / 2, 0, w, h, d, g);
      mesh(G.box, std(0x2e3238), 0, h + 0.15, 0, w + 0.3, 0.3, d + 0.3, g);
      const lit = std(0x000000, { emissive: 0xffc878, roughness: 1 }), dark = std(0x10151c, { roughness: 0.3, metalness: 0.4 });
      for (let f = 0; f < fl; f++) for (let i = 0; i < Math.floor(w / 2.2); i++) {
        const wx = -w / 2 + 1.1 + i * 2.2, on = ((x * 7 + z * 3 + f * 5 + i * 11) % 7) < 2;
        for (const s of [-1, 1]) mesh(G.box, on ? lit : dark, wx, 1.6 + f * 3, s * (d / 2 + 0.02), 1.1, 1.3, 0.04, g).castShadow = false;
      }
    }
    // xe đỗ
    const carCols = [0x7a1e22, 0x1e3a6a, 0xb8b8b0, 0x2a2a2a, 0x3a5a3a];
    CARS.forEach(([x, z, r], i) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; root.add(g);
      const paint = metal(carCols[i % 5], { roughness: 0.35, metalness: 0.6, envMapIntensity: 0.9 });
      mesh(G.box, paint, 0, 0.6, 0, 1.8, 0.7, 4.0, g);
      mesh(G.box, paint, 0, 1.15, -0.2, 1.6, 0.5, 2.0, g);
      mesh(G.box, std(0x0c1018, { roughness: 0.2, metalness: 0.5 }), 0, 1.16, -0.2, 1.62, 0.36, 1.9, g);
      for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) mesh(G.cyl, std(0x111111), wx, 0.35, wz, 0.35, 0.25, 0.35, g).rotation.z = Math.PI / 2;
      for (const s of [-0.55, 0.55]) mesh(G.box, basic(0x553a20), s, 0.65, -2.01, 0.3, 0.12, 0.02, g);
    });
    // xe tải tẩu thoát (cửa sau mở, đèn xi nhan nháy)
    const V = CITY.van, van = new THREE.Group(); van.position.set(V.x + 2.4, 0, V.z); van.rotation.y = -Math.PI / 2; root.add(van);
    mesh(G.box, std(0xe8e4dc, { roughness: 0.6 }), 0, 1.3, 0, 2.2, 2.2, 5, van);
    mesh(G.box, std(0x0c0c0c), 0, 1.3, -2.52, 1.9, 1.9, 0.04, van);
    for (const [wx, wz] of [[-1.1, 1.6], [1.1, 1.6], [-1.1, -1.6], [1.1, -1.6]]) mesh(G.cyl, std(0x111111), wx, 0.4, wz, 0.4, 0.3, 0.4, van).rotation.z = Math.PI / 2;
    this.vanLight = mesh(G.sph, basic(0xffa020), 1.05, 1.2, -2.5, 0.1, 0.1, 0.05, van);
    const zone = new THREE.Mesh(new THREE.RingGeometry(V.r - 0.25, V.r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7ee0a1, transparent: true, opacity: 0.35, depthWrite: false }));
    zone.position.set(V.x, 0.03, V.z); root.add(zone);
    this.solids_van = Collision.aabb(V.x + 1.3, V.x + 3.5, V.z - 2.5, V.z + 2.5, true, 'building');
    // đèn đường
    for (const [x, z] of [[-5.5, -20], [5.5, -10], [-5.5, 0], [5.5, 9], [-2, 15]]) {
      mesh(G.cyl, metal(0x3a3d42, { roughness: 0.5 }), x, 2.2, z, 0.07, 4.4, 0.07, root);
      mesh(G.sph, basic(0xffe0a0), x, 4.4, z, 0.18, 0.12, 0.18, root).castShadow = false;
      const l = new THREE.PointLight(0xffd29a, 1.9, 15, 2); l.position.set(x, 4.3, z); root.add(l);
    }
  }

  staticSolids() { const s = super.staticSolids(); if (this.solids_van) s.push(this.solids_van); return s; }
}
