/* =====================================================================
 * LevelBase — lớp cơ sở cho mọi màn chơi.
 *   Vòng đời chuẩn: init() → update(delta) mỗi khung → checkWinCondition() / checkFailCondition() → cleanup()
 *   Trạng thái dùng chung mà các hệ thống khác đọc: root (nhóm 3D của màn), solids (vật cản AABB), nav (A*),
 *   dogs (lính canh), traps, bushes, mud, rocks (đồ ném), bones (mồi), pushables, distractors, crawlGaps.
 *   Các "hook" có giá trị mặc định để màn con ghi đè: interactions(), doAction(), onBaitLanded(), bustReason(),
 *   drawMinimap(), cinematic (startFailCinematic / updateCinematic / cinematicCamera), exit...
 *   Hàm dựng dùng chung: buildCommon() tạo tường rơm, hàng rào + lỗ chui, thùng, cuộn rơm, đồ tương tác,
 *   xe kéo, cây/đá/cỏ trang trí, bụi cây, bùn, bẫy, đồ ném, lính canh, lưới tìm đường.
 * ===================================================================== */
import { THREE } from '../engine/three.js';
import { CFG } from '../config.js';
import { clamp, lerp, mulberry32, hashN, Collision, NavGrid } from '../engine/utils.js';
import { MAT, G, mesh, std, lam, metal, FenceKit, crateMat, isSharedMaterial } from '../engine/Models.js';
import { Bush, Mud, Rock, Pushable, Distractor } from '../core/Entities.js';
import { TrapSystem } from '../core/TrapSystem.js';
import { Dog } from '../core/Dog.js';
import { Device } from '../engine/Device.js';

// giải phóng geometry / material của một nhánh cảnh (bỏ qua đồ dùng chung trong MAT, G)
export function disposeTree(obj) {
  const sharedGeo = new Set(Object.values(G)), sharedMat = new Set(Object.values(MAT));
  obj.traverse((o) => {
    if (o.geometry && !sharedGeo.has(o.geometry)) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (sharedMat.has(m) || isSharedMaterial(m) || m.userData.keep) continue;
      m.dispose();
    }
  });
}

export class LevelBase {
  // thông tin nhiệm vụ (bảng nhiệm vụ, thẻ chọn màn, bảng xếp hạng); màn con ghi đè
  static meta = { code: 'Nhiệm vụ ?', title: '?', place: '', goal: '', danger: [], win: '', lose: '', intel: '', diff: '', par: 60, simTimes: [] };

  constructor(game) {
    this.game = game; this.root = null;
    this.solids = []; this.dogs = []; this.traps = []; this.bushes = []; this.mud = []; this.rocks = []; this.bones = [];
    this.pushables = []; this.distractors = []; this.crawlGaps = []; this.navDirty = 0;
    this.exit = { x: 0, z: 0, dir: 0 };       // nơi tẩu thoát (camera ăn mừng, pháo hoa)
    this.titleOrbit = { r: 62, h: 40 };        // camera bay vòng ở màn hình chính
  }
  get meta() { return this.constructor.meta; }
  get scene() { return this.game.world.scene; }

  /* ---------- vòng đời (màn con ghi đè) ---------- */
  init() { this.root = new THREE.Group(); this.scene.add(this.root); }
  update(delta) { void delta; }
  checkWinCondition() { return false; }
  checkFailCondition() { return null; }
  // dọn màn: gỡ khỏi cảnh và giải phóng bộ nhớ GPU (geometry, material, texture)
  cleanup() {
    if (this.root) { this.scene.remove(this.root); disposeTree(this.root); this.root = null; }
    this.solids = []; this.dogs = []; this.traps = []; this.bushes = []; this.mud = []; this.rocks = []; this.bones = [];
    this.pushables = []; this.distractors = []; this.crawlGaps = [];
  }

  /* ---------- hook mặc định ---------- */
  staticSolids() {
    const B = CFG.bounds, C = Collision;
    return [
      C.aabb(B.minX - 2, B.minX, B.minZ - 2, B.maxZ + 2, false, 'boundary'), C.aabb(B.maxX, B.maxX + 2, B.minZ - 2, B.maxZ + 2, false, 'boundary'),
      C.aabb(B.minX - 2, B.maxX + 2, B.minZ - 2, B.minZ, false, 'boundary'), C.aabb(B.minX - 2, B.maxX + 2, B.maxZ, B.maxZ + 2, false, 'boundary'),
    ];
  }
  interactions(p, near) { void p; void near; return null; } // hành động riêng của màn (bắt mục tiêu...)
  doAction(a) { void a; return false; }
  validateWin() { return true; }
  /* Mồi xương chạm đất / chạm bất kỳ bề mặt nào (DYNAMIC DOG ATTRACTION):
   *  - không cần trúng một vị trí cố định nào: điểm rơi chính là điểm hẹn của đàn chó
   *  - rơi lên nóc thùng / sát tường thì lăn xuống ô đất trống gần nhất để chó tới được
   *  - phát sóng âm bán kính CFG.bait.radius; mọi con chó trong vòng → ATTRACTED, chạy thẳng tới đúng chỗ xương */
  onBaitLanded(bone) {
    const g = this.game, B = CFG.bait;
    if (this.solids.some((b) => b.kind !== 'boundary' && Collision.pointIn(bone.x, bone.z, b, 0.35))) {
      const c = this.nav.center(this.nav.nearestFree(this.nav.cellOf(bone.x, bone.z)));
      bone.x = c.x; bone.z = c.z;
    }
    g.fx.ring(bone.x, bone.z, B.radius, 0xfff3c4, 1.6, 0.55);   // sóng âm lan rộng
    g.fx.ring(bone.x, bone.z, 6, 0x8fe3ff, 1.0, 0.7);
    if (g.minimap) g.minimap.ping(bone.x, bone.z, B.radius, 'bone');
    const lured = this.dogs.filter((d) => Math.hypot(d.x - bone.x, d.z - bone.z) <= B.radius);
    for (const d of lured) d.hear(bone.x, bone.z, 'bone', bone, g);
    g.fx.pop(bone, lured.length ? (lured.length > 1 ? `Thơm quá! (${lured.length} con)` : 'Thơm quá!') : 'Xa quá, không con nào nghe thấy', 'pop', 1.1, 1.8);
    return lured;
  }
  bustReason(why, game) {
    return {
      trap: `${game.trapHit} làm ồn, và lính canh đã tìm tới.`,
      seen: 'Bạn lọt vào tầm nhìn của lính canh. Đã bị phát hiện thì không thể chạy thoát.',
      close: 'Bạn đi quá sát lính canh và bị phát hiện.',
    }[why] || 'Bạn đã bị tóm.';
  }
  drawMinimap(ctx, map) { void ctx; void map; }
  minimapDiscover(p) { void p; return false; }
  decorKeepClear() { return []; }
  decorExclude(x, z) { void x; void z; return false; }
  // cảnh cắt khi thất bại đặc biệt (vd. Ông chủ ở cổng): trả về true nếu màn tự xử lý
  startFailCinematic(kind) { void kind; return false; }
  updateCinematic(dt) { void dt; return { over: true }; }
  cinematicCamera(cam, dt) { void cam; void dt; return false; }
  resetCinematic() {}

  /* ---------- dựng nội dung chung từ dữ liệu màn ---------- */
  buildCommon(L, secret) {
    const root = this.root, C = Collision;
    // thùng gỗ
    for (const [x, z, s] of L.crates || []) {
      const m = mesh(G.box, crateMat(), x, s / 2, z, s, s, s, root); m.rotation.y = 0;
      this.solids.push(C.aabb(x - s / 2, x + s / 2, z - s / 2, z + s / 2, true, 'crate'));
    }
    // cuộn rơm nằm
    for (const [x, z, axis] of L.bales || []) {
      const g = new THREE.Group(); g.position.set(x, 0.8, z); root.add(g);
      const c = mesh(G.cyl, lam(0xcfa23e), 0, 0, 0, 0.8, 1.4, 0.8, g);
      const e1 = mesh(G.cyl, lam(0xa77f2a), 0, 0.71, 0, 0.72, 0.02, 0.72, g), e2 = mesh(G.cyl, lam(0xa77f2a), 0, -0.71, 0, 0.72, 0.02, 0.72, g);
      g.rotation[axis === 'x' ? 'z' : 'x'] = Math.PI / 2;
      const hx = axis === 'x' ? 0.75 : 0.8, hz = axis === 'x' ? 0.8 : 0.75;
      this.solids.push(C.aabb(x - hx, x + hx, z - hz, z + hz, true, 'bale'));
      void c; void e1; void e2;
    }
    // tường rơm vuông 2 tầng
    for (const [x1, z1, x2, z2] of L.walls || []) {
      const alongZ = x1 === x2, len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 2)), seg = len / n;
      const im = new THREE.InstancedMesh(G.box, lam(0xd9b24c), n * 2), tw = new THREE.InstancedMesh(G.box, lam(0x8a6a2a), n * 4);
      const m4 = new THREE.Matrix4(); let k = 0, t = 0;
      for (let i = 0; i < n; i++) {
        for (let lv = 0; lv < 2; lv++) {
          const cx = alongZ ? x1 + (lv ? 0.05 : 0) : x1 + (i + 0.5) * seg, cz = alongZ ? z1 + (i + 0.5) * seg : z1;
          const sx = alongZ ? 1 : seg - 0.04, sz = alongZ ? seg - 0.04 : 1;
          m4.makeScale(sx, 0.98, sz).setPosition(cx, 0.5 + lv, cz); im.setMatrixAt(k++, m4);
          for (const o of [-0.45, 0.45]) {
            m4.makeScale(alongZ ? 1.02 : 0.05, 1.0, alongZ ? 0.05 : 1.02).setPosition(cx + (alongZ ? 0 : o), 0.5 + lv, cz + (alongZ ? o : 0)); tw.setMatrixAt(t++, m4);
          }
        }
      }
      im.castShadow = tw.castShadow = true; im.receiveShadow = true; root.add(im, tw);
      // hộp va chạm khớp đúng chiều dài tường (không lấn vào khe cổng), dày 1 mét
      const tx = alongZ ? 0.5 : 0, tz = alongZ ? 0 : 0.5;
      this.solids.push(C.aabb(Math.min(x1, x2) - tx, Math.max(x1, x2) + tx, Math.min(z1, z2) - tz, Math.max(z1, z2) + tz, true, 'wall'));
    }
    // hàng rào gỗ tạo ngõ ngách & ngõ cụt
    // các lỗ hổng dưới hàng rào: tách đoạn rào ra, chừa khe 1.4 m chỉ còn thanh ngang trên (phải bò mới chui qua)
    const { lines, gaps } = LevelBase.splitCrawl(L.fences || [], L.crawl || []);
    FenceKit.build(root, lines);
    this.solids.push(...FenceKit.solids(lines));
    this.crawlGaps = gaps;
    for (const g of gaps) this.buildCrawlGap(root, g);
    const PP = L.props || {};
    this.pushables = [...(PP.crates || []).map(([x, z]) => new Pushable(root, x, z, 'crate')), ...(PP.bins || []).map(([x, z]) => new Pushable(root, x, z, 'bin'))];
    for (const o of this.pushables) this.solids.push(o.solid);
    this.distractors = [...(PP.barrels || []).map(([x, z]) => new Distractor(root, x, z, 'barrel')), ...(PP.panels || []).map(([x, z]) => new Distractor(root, x, z, 'panel'))];
    for (const o of this.distractors) if (o.solid) this.solids.push(o.solid);
    for (const [x, z] of PP.carts || []) this.buildCart(root, x, z);
    this.decorate(L, root, secret);
    this.nav = new NavGrid(this.solids);
    this.nav = new NavGrid(this.solids);
    this.bushes = (L.bushes || []).map(([x, z], i) => new Bush(root, x, z, 31 + i * 7));
    this.mud = [...(L.mud || []), ...(this.extraMud || [])].map(([x, z, r]) => new Mud(root, x, z, r));
    this.traps = TrapSystem.build(root, secret.traps);
    const P = L.props || {};
    this.rocks = [...(L.rocks || []).map(([x, z]) => new Rock(root, x, z, 'rock')),
      ...(P.sticks || []).map(([x, z]) => new Rock(root, x, z, 'stick')), ...(P.buckets || []).map(([x, z]) => new Rock(root, x, z, 'bucket'))];
    this.dogs = (L.dogs || []).map((d, i) => new Dog(root, d, i));
  }

  // Chi tiết môi trường cho bản đồ bớt trống: cây lá rộng & tảng đá (có va chạm, không che tầm nhìn chó),
  // bụi cỏ cao (đi xuyên qua được). Sinh tất định theo seed, luôn tránh xa tuyến đi, bẫy, đồ nhặt được và vật cản.
  decorate(L, root, secret) {
    const rng = mulberry32((L.seed || 1) * 97 + 13), B = CFG.bounds;
    const segD = (px, pz, a, b) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1;
      const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / l, 0, 1);
      return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
    };
    const routeD = (x, z) => { let d = Infinity; for (const r of secret.routes) for (let i = 0; i + 1 < r.length; i++) d = Math.min(d, segD(x, z, r[i], r[i + 1])); return d; };
    const dogPaths = (L.dogs || []).flatMap((d) => (d.path ? [d.path] : [[d.post, d.post]]));
    const dogD = (x, z) => { let d = Infinity; for (const pth of dogPaths) for (let i = 0; i + 1 < pth.length; i++) d = Math.min(d, segD(x, z, pth[i], pth[i + 1])); return d; };
    const PR = L.props || {};
    const pts = [...(L.crawl || []), ...Object.values(PR).flat(), ...(L.rocks || []), ...(L.bushes || []), [CFG.start.x, CFG.start.z], ...this.decorKeepClear()];
    // Bẫy KHÔNG nằm trong danh sách "chừa khoảng trống" (nếu chừa, các khoảng đất trống tròn sẽ để lộ vị trí bẫy).
    // Chỉ cấm đặt khối có va chạm đè đúng lên tâm bẫy (≤ 1 m) để bẫy không bị chôn trong gốc cây/tảng đá —
    // khoảng cách này nhỏ hơn mật độ cây cảnh ngẫu nhiên nên nhìn bằng mắt không phân biệt được.
    const trapPts = [...secret.traps.map((t) => [t[0], t[1]]), ...secret.traps.filter((t) => t[4] === 'tripwire').map((t) => [t[2], t[3]])];
    const ptD = (x, z) => Math.min(Math.min(...pts.map(([px, pz]) => Math.hypot(px - x, pz - z))), Math.min(Infinity, ...trapPts.map(([px, pz]) => Math.hypot(px - x, pz - z) + 1.6)));
    const inYard = (x, z) => this.decorExclude(x, z); // vùng riêng của màn không được đặt đồ trang trí
    const solidPad = (x, z, pad) => this.solids.some((b) => Collision.pointIn(x, z, b, pad));
    const mudD = (x, z) => Math.min(Infinity, ...(L.mud || []).map(([mx, mz, r]) => Math.hypot(mx - x, mz - z) - r));
    const pick = (n, test, tries = 4000) => {
      const out = [];
      for (let k = 0; k < tries && out.length < n; k++) {
        const x = lerp(B.minX + 1.5, B.maxX - 1.5, rng()), z = lerp(B.minZ + 1.5, B.maxZ - 1.5, rng());
        if (test(x, z, out)) out.push([x, z, rng()]);
      }
      return out;
    };
    const far = (list, x, z, d) => list.every(([ox, oz]) => Math.hypot(ox - x, oz - z) > d);
    // cây lá rộng trong trang trại
    const trees = pick(14, (x, z, out) => routeD(x, z) > 3.4 && dogD(x, z) > 3 && ptD(x, z) > 3.2 && !solidPad(x, z, 1.4) && !inYard(x, z) && mudD(x, z) > 1.5 && far(out, x, z, 8));
    const rocks = pick(22, (x, z, out) => routeD(x, z) > 2.4 && dogD(x, z) > 2.4 && ptD(x, z) > 2.4 && !solidPad(x, z, 1.2) && !inYard(x, z) && mudD(x, z) > 1 && far(out, x, z, 4) && far(trees, x, z, 3));
    const bark = std(0x3a2a1c, { roughness: 1 }), stone = std(0x6d6f6a, { roughness: 0.92 }), moss = std(0x3e5a32, { roughness: 1 });
    const leafCols = [0x23432a, 0x2e4f2c, 0x3a5a2e];
    for (const [x, z, t] of trees) {
      const g = new THREE.Group(), k = 0.85 + t * 0.4; g.position.set(x, 0, z); g.scale.setScalar(k); g.rotation.y = t * 6.28; root.add(g);
      mesh(new THREE.CylinderGeometry(0.24, 0.4, 3.2, 8), bark, 0, 1.6, 0, 1, 1, 1, g);
      mesh(new THREE.CylinderGeometry(0.07, 0.13, 1.7, 5), bark, 0.55, 2.9, 0, 1, 1, 1, g).rotation.z = 0.8;
      mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.5, 5), bark, -0.5, 3.1, 0.2, 1, 1, 1, g).rotation.z = -0.85;
      const leaf = std(leafCols[Math.floor(t * 3)], { roughness: 0.95 });
      [[0, 4.6, 0, 1.9], [1.3, 4.0, 0.4, 1.35], [-1.2, 4.0, -0.4, 1.4], [0.3, 3.9, -1.3, 1.2], [-0.3, 5.5, 0.4, 1.25], [0.6, 4.4, 1.2, 1.1]].forEach(([dx, y, dz, s]) => mesh(G.ico, leaf, dx, y, dz, s, s * 0.85, s, g));
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + t; mesh(G.cone, moss, Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45, 0.12, 0.3, 0.12, g); } // rễ / cỏ gốc
      this.solids.push(Collision.aabb(x - 0.4 * k, x + 0.4 * k, z - 0.4 * k, z + 0.4 * k, false, 'tree'));
    }
    // tảng đá lớn nhỏ (khối đa diện méo + rêu)
    for (const [x, z, t] of rocks) {
      const s = 0.45 + t * 0.6, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = t * 9; root.add(g);
      const geo = new THREE.DodecahedronGeometry(1, 1), pp = geo.attributes.position;
      for (let i = 0; i < pp.count; i++) { const n = 0.82 + hashN(pp.getX(i), pp.getY(i), pp.getZ(i), t) * 0.3; pp.setXYZ(i, pp.getX(i) * n, pp.getY(i) * n, pp.getZ(i) * n); }
      geo.computeVertexNormals();
      mesh(geo, stone, 0, s * 0.45, 0, s, s * 0.75, s * 0.9, g);
      if (t > 0.35) mesh(geo, stone, s * 0.9, s * 0.22, s * 0.3, s * 0.45, s * 0.38, s * 0.45, g);
      mesh(G.sph, moss, 0, s * 0.95, 0, s * 0.55, s * 0.12, s * 0.5, g).castShadow = false;
      this.solids.push(Collision.aabb(x - s * 0.95, x + s * 0.95, z - s * 0.85, z + s * 0.85, false, 'boulder'));
    }
    // bụi cỏ cao: mỗi bụi 7 lá dài, mọc tự do (không chừa khoảng trống quanh bẫy để khỏi lộ vị trí bẫy)
    // khúc gỗ đổ (nhảy qua được), đống thùng phuy / củi (chắn đường), vũng bùn thêm
    const logs = pick(7, (x, z, out) => routeD(x, z) > 2.6 && dogD(x, z) > 2.6 && ptD(x, z) > 2.6 && !solidPad(x, z, 1.6) && !inYard(x, z) && mudD(x, z) > 1 && far(out, x, z, 6) && far(trees, x, z, 3) && far(rocks, x, z, 2.5));
    const piles = pick(6, (x, z, out) => routeD(x, z) > 2.8 && dogD(x, z) > 2.8 && ptD(x, z) > 2.8 && !solidPad(x, z, 1.4) && !inYard(x, z) && mudD(x, z) > 1 && far(out, x, z, 7) && far([...trees, ...rocks, ...logs], x, z, 3));
    this.extraMud = pick(4, (x, z, out) => routeD(x, z) > 2.8 && dogD(x, z) > 2 && ptD(x, z) > 3 && !solidPad(x, z, 1.8) && !inYard(x, z) && mudD(x, z) > 3 && far(out, x, z, 8) && far([...trees, ...rocks, ...logs, ...piles], x, z, 3)).map(([x, z, t]) => [x, z, 0.9 + t * 0.8]);
    const logMat = std(0x5a4128, { roughness: 1 }), cut = std(0xa8865a, { roughness: 0.9 });
    for (const [x, z, t] of logs) {
      const ang = t > 0.5 ? 0 : Math.PI / 2, len = 1.8 + t * 0.8, g = new THREE.Group(); g.position.set(x, 0.24, z); g.rotation.y = ang; root.add(g);
      mesh(G.cyl, logMat, 0, 0, 0, 0.24, len, 0.24, g).rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) mesh(G.cyl, cut, s * len / 2, 0, 0, 0.2, 0.02, 0.2, g).rotation.z = Math.PI / 2;
      mesh(G.sph, std(0x3e5a32, { roughness: 1 }), 0.2, 0.2, 0, 0.35, 0.06, 0.18, g).castShadow = false;
      const hx = ang ? 0.26 : len / 2, hz = ang ? len / 2 : 0.26;
      this.solids.push(Collision.aabb(x - hx, x + hx, z - hz, z + hz, false, 'low'));
    }
    const barrel = std(0x5c3b22, { roughness: 0.8 }), hoop = metal(0x3a3d40, { roughness: 0.6, envMapIntensity: 0.5 }), wood2 = std(0x7a5a3a, { roughness: 1 });
    for (const [x, z, t] of piles) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = t * 6; root.add(g);
      if (t < 0.5) { // thùng phuy gỗ
        for (const [bx, bz] of [[-0.4, 0], [0.4, 0.1], [0, 0.6]]) {
          mesh(G.cyl, barrel, bx, 0.5, bz, 0.34, 1, 0.34, g);
          for (const y of [0.18, 0.82]) mesh(G.cyl, hoop, bx, y, bz, 0.355, 0.05, 0.355, g);
        }
      } else { // đống củi
        for (let i = 0; i < 9; i++) mesh(G.cyl, wood2, 0, 0.13 + Math.floor(i / 3) * 0.24, -0.3 + (i % 3) * 0.3 - Math.floor(i / 3) * 0.05, 0.12, 1.5, 0.12, g).rotation.z = Math.PI / 2;
      }
      this.solids.push(Collision.aabb(x - 0.85, x + 0.85, z - 0.85, z + 0.85, false, 'pile'));
    }
    const clumps = pick(Device.mobile ? 260 : 420, (x, z) => !solidPad(x, z, 0.3) && !inYard(x, z) && far([...(L.rocks || []), ...(L.bone ? [L.bone] : [])], x, z, 1.2) && mudD(x, z) > 0.3, 9000);
    const blade = new THREE.ConeGeometry(0.035, 1, 3).translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(blade, std(0xffffff, { roughness: 0.9, side: THREE.DoubleSide }), clumps.length * 7);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    const gc = [new THREE.Color(0x3d6b3a), new THREE.Color(0x5a7a3a), new THREE.Color(0x2f5a33), new THREE.Color(0x7a7a42)];
    let n = 0;
    for (const [x, z, t] of clumps) {
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + t * 6, d = 0.08 + ((i * 37 + t * 100) % 10) * 0.025;
        e.set((Math.sin(a * 3.1) * 0.35), a, Math.cos(a * 2.3) * 0.35); q.setFromEuler(e);
        m4.compose(v.set(x + Math.cos(a) * d, 0, z + Math.sin(a) * d), q, sc.set(1, 0.42 + ((i * 13 + t * 50) % 10) * 0.035, 1));
        im.setMatrixAt(n, m4); im.setColorAt(n, c.copy(gc[(i + Math.floor(t * 4)) % 4])); n++;
      }
    }
    im.castShadow = true; im.receiveShadow = true; root.add(im);
    this.grass = im;
    this.grassHash = new Map();
    for (const [x, z] of clumps) { const k = Math.floor(x / 2) + ',' + Math.floor(z / 2); if (!this.grassHash.has(k)) this.grassHash.set(k, []); this.grassHash.get(k).push([x, z]); }
  }

  // tách các đoạn hàng rào có lỗ chui
  static splitCrawl(fences, crawl) {
    const lines = [], gaps = [], half = 0.7;
    for (const f of fences) {
      let segs = [f];
      for (const [px, pz] of crawl) {
        const next = [];
        for (const s of segs) {
          const [x1, z1, x2, z2] = s, horiz = z1 === z2;
          const on = horiz ? Math.abs(pz - z1) < 0.3 && px > Math.min(x1, x2) + half && px < Math.max(x1, x2) - half
            : Math.abs(px - x1) < 0.3 && pz > Math.min(z1, z2) + half && pz < Math.max(z1, z2) - half;
          if (!on) { next.push(s); continue; }
          if (horiz) { const a = Math.min(x1, x2), b = Math.max(x1, x2); next.push([a, z1, px - half, z1], [px + half, z1, b, z1]); gaps.push({ x: px, z: z1, horiz: true, half }); }
          else { const a = Math.min(z1, z2), b = Math.max(z1, z2); next.push([x1, a, x1, pz - half], [x1, pz + half, x1, b]); gaps.push({ x: x1, z: pz, horiz: false, half }); }
        }
        segs = next;
      }
      lines.push(...segs);
    }
    return { lines, gaps };
  }

  // lỗ chui: thanh ngang trên còn nguyên, thanh dưới gãy, đất bị bới lõm xuống
  buildCrawlGap(root, g) {
    const wood = std(0x6e5236), dark = std(0x5a4430, { roughness: 1 }), dirt = std(0x3a2c1c, { roughness: 1 });
    const L = g.half * 2;
    mesh(G.box, wood, g.x, 1.1, g.z, g.horiz ? L : 0.1, 0.12, g.horiz ? 0.1 : L, root);
    const b1 = mesh(G.box, dark, g.x + (g.horiz ? -0.35 : 0.08), 0.32, g.z + (g.horiz ? 0.08 : -0.35), g.horiz ? 0.6 : 0.1, 0.1, g.horiz ? 0.1 : 0.6, root); b1.rotation[g.horiz ? 'z' : 'x'] = 0.6;
    const b2 = mesh(G.box, dark, g.x + (g.horiz ? 0.4 : -0.1), 0.05, g.z + (g.horiz ? -0.25 : 0.4), g.horiz ? 0.55 : 0.1, 0.06, g.horiz ? 0.1 : 0.55, root); b2.rotation.y = 0.5;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.85, 18).rotateX(-Math.PI / 2), dirt);
    hole.position.set(g.x, 0.02, g.z); hole.scale.set(g.horiz ? 1 : 0.7, 1, g.horiz ? 0.7 : 1); hole.receiveShadow = true; root.add(hole);
    // chặn đi bộ, nhưng khi bò thì người chơi bỏ qua hộp này (xem Player.update); chó không chui được
    const t = 0.15;
    this.solids.push(Collision.aabb(g.horiz ? g.x - g.half : g.x - t, g.horiz ? g.x + g.half : g.x + t, g.horiz ? g.z - t : g.z - g.half, g.horiz ? g.z + t : g.z + g.half, false, 'crawl'));
  }

  // xe kéo gỗ gầm cao: trèo qua được (E/Space) hoặc bò / trượt chui qua gầm
  buildCart(root, x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI / 2; root.add(g);
    const wood = std(0x6a4c30, { roughness: 1 }), dark = std(0x3e2c1c, { roughness: 1 }), iron = metal(0x3a3a3a, { roughness: 0.6, envMapIntensity: 0.5 });
    mesh(G.box, wood, 0, 0.95, 0, 1.7, 0.12, 2.8, g);                                   // sàn xe
    for (const sx of [-1, 1]) mesh(G.box, dark, sx * 0.85, 1.12, 0, 0.08, 0.32, 2.8, g);  // thành xe
    for (const [sx, sz] of [[-1, -0.9], [1, -0.9], [-1, 0.9], [1, 0.9]]) {
      const w = mesh(G.cyl, wood, sx * 0.95, 0.45, sz, 0.45, 0.1, 0.45, g); w.rotation.z = Math.PI / 2;
      mesh(G.cyl, iron, sx * 0.95, 0.45, sz, 0.47, 0.06, 0.47, g).rotation.z = Math.PI / 2;
    }
    mesh(G.box, dark, 0, 0.75, 2.0, 0.1, 0.1, 1.6, g).rotation.x = 0.35;                 // càng xe
    mesh(G.box, std(0xcfa23e, { roughness: 1 }), 0.2, 1.15, 0.4, 1.0, 0.3, 1.0, g);      // rơm trên xe
    // xoay 90°: xe nằm dọc trục x (dài 2.8, rộng 1.7)
    const s = Collision.aabb(x - 1.4, x + 1.4, z - 0.85, z + 0.85, false, 'cart'); s.h = 1.25;
    this.solids.push(s);
  }

  // người chơi có đang nằm trong bụi cỏ cao không (để nấp khi bò)
  inGrass(x, z) {
    const m = this.grassHash; if (!m) return false;
    const cx = Math.floor(x / 2), cz = Math.floor(z / 2);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = m.get((cx + i) + ',' + (cz + j));
      if (list && list.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 0.8)) return true;
    }
    return false;
  }
}
