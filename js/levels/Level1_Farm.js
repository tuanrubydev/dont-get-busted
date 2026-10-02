/* =====================================================================
 * MÀN 1 — Trộm Gà Trống Vàng (Trang trại Đồi Gió, 2 giờ sáng)
 * Toàn bộ logic riêng của trang trại nằm ở đây: cảnh trang trại, chuồng gà & Gà Trống Vàng,
 * ổ chó + xương (ném đi đâu cũng dụ được chó), một đoạn rào biên gãy sát đất (lối thoát bí mật, không đánh dấu), Ông chủ rình ở cổng chính (jumpscare).
 * Các hệ thống chung (người chơi, chó, bẫy, camera, UI...) không biết gì về những thứ này.
 * ===================================================================== */
import { THREE } from '../engine/three.js';
import { CFG } from '../config.js';
import { lerp, turnTo, mulberry32, hashN, Collision } from '../engine/utils.js';
import { G, mesh, std, lam, metal, basic, Models, FenceKit } from '../engine/Models.js';
import { Sfx } from '../engine/AudioManager.js';
import { Bone } from '../core/Entities.js';
import { Vault } from '../core/TrapSystem.js';
import { LevelBase, disposeTree } from './LevelBase.js';

/* ---------- thông số riêng của trang trại ---------- */
export const FARM = {
  // trang trại rộng 60 × 90 m
  bounds: { minX: -30, maxX: 30, minZ: -45, maxZ: 45 },
  start: { x: 0, z: -41, r: 2.6 },
  gate: { x: 0, z: -45, half: 2, trigger: 9 },          // cổng chính & bán kính vùng kích hoạt Ông chủ
  hole: { x: -30, z: -5, w: 2.5 },                      // lỗ hổng hàng rào bí mật (sau đống rơm)
  coop: { z: 42.3 },
  yard: { minX: -4.4, maxX: 4.4, minZ: 36.5, maxZ: 39.8 }, // sân chuồng gà
  // nhà trong trang trại: [x, z, rộng, sâu, loại]
  buildings: [[-24, 8, 8, 14, 'barn'], [24, 2, 6, 8, 'shed'], [24, -32, 5, 6, 'shed']],
};
const GAP = 1.6; // nửa bề rộng khe duy nhất trên tường rơm trước chuồng gà

/* Dữ liệu màn (toạ độ thật, z dương = phía chuồng gà, cổng chính ở mép nam z = -45):
 *   kennel [x,z,hướng cửa] · bone [x,z] · zone [x,z,r] vị trí cột chuông gió trang trí
 *   dogs: post+facing+sweep = chó gác; path(+pause) = chó tuần · walls tường rơm (che tầm nhìn)
 *   fences hàng rào gỗ (chặn đường, không che tầm nhìn) · mud bãi bùn
 *   secret: vị trí 20 bẫy vô hình + tuyến an toàn, mã hóa XOR + Base64 (xem core/TrapSystem.js) */
const DATA = {
    seed: 202,
    kennel: [-15.6, 18.5, Math.PI / 2], bone: [-13.7, 18.6], zone: [13, 7, 1.3],
    walls: [[-30, 29, -18, 29], [-18, 29, -GAP, 29], [GAP, 29, 18, 29], [18, 29, 30, 29]],
    dogs: [
      { post: [0, 31], facing: Math.PI, sweep: 0.75, sweepSpeed: 0.6, range: 13, fov: 100 },
      { path: [[-14, 24], [14, 24]], pause: 2.5, range: 11, fov: 100 },
    ],
    fences: [
      // cánh đồng chó canh: hai bên là dải ngõ cụt; mé tây có một đoạn hàng rào bị gãy
      [-18, -11, -18, 11], [-18, 13.4, -18, 29], [18, -11, 18, 29], [-18, -11, -2, -11], [2, -11, 18, -11],
      // mê cung phía nam
      [-30, -33, 4, -33], [12, -33, 30, -33], [-30, -19, -18, -19], [-10, -19, 30, -19],
      [20, -45, 20, -33], [-22, -33, -22, -19], [0, -33, 0, -29], [6, -19, 6, -13],
    ],
    bushes: [[-16.2, 13], [-6, 15], [1.2, 12], [14, 5], [-14, 3], [-8, -38], [16, -27], [-24, -26], [10, -15], [-24, 22]],
    // tuyến an toàn (dùng khi dựng màn để không đặt vật cản/bẫy lên lối đi) và 20 bẫy vô hình:
    // KHÔNG lưu dạng chữ thường. Toàn bộ nằm trong chuỗi mã hóa secret (XOR + Base64), chỉ giải mã lúc dựng màn.
    clear: [[-16.2, 13, 1.9], [1.2, 12, 1.9], [-13.8, 18, 1.2], [-26.4, -5, 1.6]],
    mud: [[-23, -3.2, 1.6], [-19, 5.5, 1.0]],
    // lỗ hổng dưới hàng rào: chỉ chui qua được khi đang bò (Z); nằm trên một đoạn hàng rào trong fences
    crawl: [[-12, -33], [-12, -11], [-18, 4]],
    crates: [[-11, -4.5, 1.3], [15, -1, 1.3], [-7, 2, 1.2], [9, 11, 1.2], [-20, -40, 1.3], [24, -24, 1.2], [-6, -16, 1.2]],
    bales: [[-9, 9, 'z'], [12, 5, 'x'], [2, -22, 'z'], [-26, -14, 'x']],
    secret: 'OENzN4SzwK/od1ZDe5XzioR9VRdgkKjYth5AUgaY/IeWbUpWMs/x3Zu4S28BNdyEv+pjORgg0vHAvlh/D2uz5diQfikIMMLho9XhAz9MMtuH495FIlpxmKCh8WUwUSLE0LGLByNPcp/XrrDidjQPLf/cpudbZg8/wOmetVh9DFTvur7pSHIEIXDc5JqrWDJVEYzbrrhKbxB0kL+cuEg8C37tvNOpTmQBRGCAv8H7Cit6QaD8x/ZBAE4Hi7LL5Uwvb0C14IfeXxY/XX+CutW8CRplUdS536EgLidwj67Hu0VRMwmQ6YHxCFN+TxOBwpOoZF0mY9nxwehBdxgqn9SC0m5XK3fV7567/h4+Qm/NrNDDJh4HcNGekZkKMUxrhezLxiAVR1jPiIDB4B49QXuOsOfXNnlZMb7xue8TLFF63Oe2jWVnV2KdrvrOkAJWVCzL37yHG20fIY3riLtfcQUstM/aihdwDz7VnLnB7Et1X2u208r5Ln4RL46tyvIfa0toscPamElhQWIn2Oid7wMFYmjh29ihQh4RGYSx0+4eEwV4+cvItlMOASlhmaLA60gEP2r6pIG/Tm9QAZHF0PhaZS4Q8tiJ2F5/PkF8ndDVxUlfPA/oiJ/YJjJQcIbAxdVEVS0KlpiPyEADOEF+g6zjtQhcJmPb5Y+qfzAmc4y/gL1vUDVr0Z6f1v8dPkB0le+OnWcqKDmomJDzDzNHcZj5h5UcSz4o0uCBw/9wIjZ0yvWigXkgaD+47czqES9MZ9qUr/p0KRQ2ruHJ3+EfNSQyosC9hQQIH1jOrs7uECg0IrLRr5UJdxVOwem8w/YBKwk366y7jkV/ESSMqqDyZjkCOvbPv5g4b2hWYoC/1+MPAxVo/Mbbp19xCmyIwNKGBHoFEffJ09hPCABKYJ+4w+0jdUgc5qWbpk9vUXKIw9GSQ3gzDfa8i7YuYUlBdIC41a9MLj1smOKfskxfUAaTqMe7RVVcC/7okL1YHj0wYva0j7dmXTphqP/4rQ4xRQPgpfXSblA3adT6nbiPAFZDfIryiIcMWy44wvWT9BAsTHObk4X4bFZcKdLhg8CRAVVAaMf1voB5IGg/uPDQ6hMqUWTblK/6ajYULcbhv9mQc1AE',
    // hòn đá nhặt được: ném để phá bẫy từ xa hoặc tạo tiếng động giả
    rocks: [[2.6, -39.5], [-2.5, -36], [9.5, -27], [-15, -17], [3, -9], [-10.5, 5], [-4.5, 16.5], [-19.2, 8]],
    // vật tương tác: cành khô & xô rỗng (nhặt ném), thùng gỗ / xe rác (đẩy), thùng phuy (đá), lưới thép (rung), xe kéo (chui gầm)
    props: {
      sticks: [[-9, -21], [6, -25], [-15, 8], [8, 16]],
      buckets: [[14, -14], [-20, -8]],
      crates: [[10, -4], [12, 18]],
      bins: [[-5, -30]],
      barrels: [[15, -8], [12, 20]],
      panels: [[29.6, 18], [-29.6, 26]],
      carts: [[11, -28]],
    },
  };

class Chicken {

  constructor(scene, x, z, rooster = false) {
    this.x = x; this.z = z; this.carried = false; this.rooster = rooster;
    this.rig = Models.chicken(rooster); this.rig.group.position.set(x, 0, z); scene.add(this.rig.group);
    this.target = { x, z }; this.wait = Math.random() * 2; this.facing = Math.random() * 6; this.peck = 0;
  }
  update(dt, time) {
    if (this.carried) return;
    const Y = FARM.yard, r = this.rig;
    this.wait -= dt;
    const dx = this.target.x - this.x, dz = this.target.z - this.z, d = Math.hypot(dx, dz);
    if (d > 0.1 && this.wait <= 0) {
      const sp = 1.2 * dt; this.x += (dx / d) * Math.min(sp, d); this.z += (dz / d) * Math.min(sp, d);
      this.facing = turnTo(this.facing, Math.atan2(dx, dz), dt * 8);
      r.legs[0].rotation.x = Math.sin(time * 18) * 0.6; r.legs[1].rotation.x = -Math.sin(time * 18) * 0.6;
    } else if (this.wait <= 0) {
      this.wait = 0.8 + Math.random() * 2.2;
      this.peck = Math.random() < 0.6 ? 0.9 : 0;
      this.target = { x: lerp(Y.minX + 0.4, Y.maxX - 0.4, Math.random()), z: lerp(Y.minZ + 0.3, Y.maxZ - 0.3, Math.random()) };
    }
    this.peck = Math.max(0, this.peck - dt);
    r.body.rotation.x = this.peck > 0 ? Math.abs(Math.sin(this.peck * 12)) * 0.7 : 0;
    r.group.position.set(this.x, 0, this.z);
    r.group.rotation.y = this.facing;
  }
}


// Đống rơm che lỗ hổng hàng rào bí mật: đẩy được (khi đã ôm Gà Trống Vàng) để mở đường chui ra
// Ông chủ trang trại: nấp sau cổng chính, chỉ xuất hiện khi tên trộm ôm gà tới gần cổng
class Boss {
  constructor(scene) {
    const G0 = FARM.gate;
    this.rig = Models.farmer();
    this.x = G0.x; this.z = G0.z - 2.2; this.facing = 0;
    this.rig.group.position.set(this.x, 0, this.z); this.rig.group.visible = false;
    scene.add(this.rig.group);
    this.spot = new THREE.SpotLight(0xfff1c4, 0, 26, 0.38, 0.5, 1.2);
    this.spot.target = new THREE.Object3D();
    scene.add(this.spot, this.spot.target);
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(1.3, 6, 20, 1, true).translate(0, -3, 0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.rig.torch.add(this.beam); this.beam.position.set(0, 0, 0.3);
    // đèn hắt từ dưới lên mặt (tạo sẵn với cường độ 0 để không phải biên dịch lại shader lúc xuất hiện)
    this.face = new THREE.PointLight(0xff8a4a, 0, 7, 2); scene.add(this.face);
    this.active = false; this.t = 0;
  }
  appear() { this.active = true; this.t = 0; this.rig.group.visible = true; }
  reset() {
    this.active = false; this.rig.group.visible = false; this.spot.intensity = 0; this.beam.material.opacity = 0; this.face.intensity = 0; this.t = 0;
    this.x = FARM.gate.x; this.z = FARM.gate.z - 2.2; this.rig.group.position.set(this.x, 0, this.z);
  }
  headPos(out) { return out.set(this.x, 1.95, this.z); }
  update(dt, player) {
    if (!this.active) return;
    this.t += dt;
    const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz);
    this.facing = Math.atan2(dx, dz);
    const sp = this.t < 0.35 ? 9 : 2.2;                                         // lao ra khỏi bóng tối rồi bước dồn tới
    if (d > 1.3) { const st = Math.min(d - 1.3, sp * dt); this.x += (dx / d) * st; this.z += (dz / d) * st; }
    const r = this.rig;
    r.group.position.set(this.x, 0, this.z); r.group.rotation.y = this.facing;
    r.armR.rotation.x = this.t < 0.75 ? -2.6 * Math.min(1, this.t * 3) : lerp(-2.6, -0.4, Math.min(1, (this.t - 0.75) * 10)); // giơ gậy rồi đập xuống
    r.armL.rotation.x = -1.3;
    r.body.position.y = Math.abs(Math.sin(this.t * 10)) * 0.05;
    this.spot.intensity = 3.5;
    this.spot.position.set(this.x, 1.6, this.z);
    this.spot.target.position.set(player.x, 0.6, player.z);
    this.beam.material.opacity = 0.16;
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    this.face.position.set(this.x + fx * 1.1, 1.1, this.z + fz * 1.1);
    this.face.intensity = Math.min(1, this.t * 4) * (2.6 + Math.random() * 0.4);
  }
}


/* ---------- cảnh tĩnh của trang trại (dựng một lần, giữ lại khi chơi lại cùng màn) ---------- */
class FarmEnvironment {
  constructor(world) {
    this.world = world; this.scene = new THREE.Group(); this.rng = mulberry32(777);
    this.buildLamps(); this.buildGround(); this.buildFence(); this.buildBuildings(); this.buildCoop();
    this.buildMainGate(); this.buildOutskirts(); this.buildTrees(); this.buildFireflies();
  }
  glowTex() { return this.world.glowTex(); }
  // đèn vàng: chuồng gà, cửa nhà kho, lán, cột đèn ở vạch xuất phát & ở khe hàng rào giữa trang trại
  buildLamps() {
    const s = this.scene;
    const warm = (x, y, z, color, intensity, distance) => {
      const l = new THREE.PointLight(color, intensity, distance, 2);
      l.position.set(x, y, z); s.add(l);
      mesh(G.sph, basic(0xfff1c4), x, y, z, 0.16, 0.16, 0.16, s).castShadow = false;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(x, y, z); glow.scale.set(2.4, 2.4, 1); s.add(glow);
      return l;
    };
    const cz = FARM.coop.z, S = CFG.start;
    this.coopLight = warm(0, 3.3, cz - 2.7, 0xffb04a, 2.6, 16);
    warm(-19.7, 3.6, 8, 0xff9a3c, 2.4, 16);
    warm(20.7, 2.8, 2, 0xffc46b, 2.0, 13);
    warm(S.x + 2.8, 3.6, S.z + 0.4, 0xffd27a, 1.8, 13);
    warm(3.2, 3.4, -10.4, 0xffc46b, 1.6, 12);
    mesh(G.cyl, lam(0x2d3240), S.x + 2.8, 1.8, S.z + 0.4, 0.08, 3.6, 0.08, s);
    mesh(G.cyl, lam(0x2d3240), 3.2, 1.7, -10.4, 0.08, 3.4, 0.08, s);
  }


  staticSolids() {
    const B = CFG.bounds, Y = FARM.yard, C = Collision, cz = FARM.coop.z;
    return [
      C.aabb(B.minX - 2, B.minX, B.minZ - 2, FARM.hole.z - FARM.hole.w / 2, false, 'boundary'),
      C.aabb(B.minX - 2, B.minX, FARM.hole.z + FARM.hole.w / 2, B.maxZ + 2, false, 'boundary'),
      C.aabb(B.maxX, B.maxX + 2, B.minZ - 2, B.maxZ + 2, false, 'boundary'),
      C.aabb(B.minX - 2, B.maxX + 2, B.minZ - 2, B.minZ, false, 'boundary'),
      C.aabb(B.minX - 2, B.maxX + 2, B.maxZ, B.maxZ + 2, false, 'boundary'),
      C.aabb(-4.6, 4.6, cz - 2.3, cz + 2.3, true, 'coop'),
      C.aabb(Y.minX - 0.7, -1.2, Y.minZ - 0.6, Y.minZ - 0.4, false, 'yard'),
      C.aabb(1.2, Y.maxX + 0.7, Y.minZ - 0.6, Y.minZ - 0.4, false, 'yard'),
      C.aabb(Y.minX - 0.7, Y.minX - 0.5, Y.minZ - 0.6, cz - 2.3, false, 'yard'),
      C.aabb(Y.maxX + 0.5, Y.maxX + 0.7, Y.minZ - 0.6, cz - 2.3, false, 'yard'),
      ...FARM.buildings.map(([x, z, w, d]) => C.aabb(x - w / 2, x + w / 2, z - d / 2, z + d / 2, true, 'building')),
    ];
  }


  buildGround() {
    const B = CFG.bounds, size = 220, seg = 130;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color(), rng = this.rng;
    const g1 = new THREE.Color(0x1f3d22), g2 = new THREE.Color(0x2b5230), dirt = new THREE.Color(0x3d3322), outside = new THREE.Color(0x16291a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      c.copy(g1).lerp(g2, 0.5 + Math.sin(x * 0.31) * Math.cos(z * 0.27) * 0.35 + rng() * 0.2);
      // mảng đất trơ ngẫu nhiên (không chỉ lối)
      const patch = Math.sin(x * 0.13 + 1.7) * Math.sin(z * 0.11 - 0.6) + Math.sin(x * 0.07 - z * 0.05) * 0.5;
      if (patch > 0.75) c.lerp(dirt, Math.min(0.6, (patch - 0.75) * 2));
      if (x < B.minX - 0.5 || x > B.maxX + 0.5 || z < B.minZ - 0.5 || z > B.maxZ + 0.5) c.lerp(outside, 0.55);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ envMapIntensity: 0.45, vertexColors: true, roughness: 0.96, metalness: 0 }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    // cỏ lún phún phủ khắp trang trại (bẫy nấp trong đó)
    const n = 5200, tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.38, 4).translate(0, 0.19, 0), new THREE.MeshStandardMaterial({ envMapIntensity: 0.45, color: 0x2f5c33, roughness: 0.95 }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const x = lerp(B.minX - 8, B.maxX + 8, rng()), z = lerp(B.minZ - 8, B.maxZ + 8, rng());
      q.setFromAxisAngle(up, rng() * 6.28); const k = 0.6 + rng() * 1.0;
      m4.compose(v.set(x, 0, z), q, sc.set(k, k * (0.7 + rng() * 0.8), k)); tuft.setMatrixAt(i, m4);
    }
    tuft.receiveShadow = true;
    this.scene.add(tuft);
  }


  buildFence() {
    const B = CFG.bounds;
    const G0 = FARM.gate, H = FARM.hole;
    FenceKit.build(this.scene, [
      [B.minX, B.minZ, G0.x - G0.half - 0.5, B.minZ], [G0.x + G0.half + 0.5, B.minZ, B.maxX, B.minZ],   // chừa chỗ cho cổng chính
      [B.minX, B.maxZ, B.maxX, B.maxZ], [B.maxX, B.minZ, B.maxX, B.maxZ],
      [B.minX, B.minZ, B.minX, H.z - H.w / 2], [B.minX, H.z + H.w / 2, B.minX, B.maxZ],
    ]);
    this.buildBrokenSection();
  }


  // Đoạn rào biên bị gãy sát đất (lối thoát bí mật). Nhìn qua giống hệt mọi đoạn rào khác: đủ cột, đủ thanh trên.
  // Khác biệt rất nhỏ: thanh dưới gãy đôi, hai nửa rũ xuống đất; thanh trên võng xuống một chút; vài nhánh cỏ dại mọc che.
  // Đứng / nhảy / trèo đều bị chặn (hộp va chạm 'crawl'), chỉ nằm bò mới lọt qua khe sát mặt đất.
  buildBrokenSection() {
    const s = this.scene, B = CFG.bounds, H = FARM.hole, x = B.minX, z0 = H.z - H.w / 2, z1 = H.z + H.w / 2, wood = lam(0x6e5236);
    // thanh trên: cùng gỗ, cùng tiết diện, chỉ võng xuống ~8 cm ở giữa
    for (const [za, zb, ya, yb] of [[z0, H.z, 1.1, 1.02], [H.z, z1, 1.02, 1.1]]) {
      const r = mesh(G.box, wood, x, (ya + yb) / 2, (za + zb) / 2, 0.1, 0.12, Math.hypot(zb - za, yb - ya) + 0.04, s);
      r.rotation.x = Math.atan2(yb - ya, zb - za);
    }
    // thanh dưới gãy đôi: mỗi nửa còn dính một đầu vào cột, đầu kia chúc xuống sát đất
    const half = H.w / 2;
    for (const [zc, sgn] of [[z0, 1], [z1, -1]]) {
      const piece = new THREE.Group(); piece.position.set(x, 0.55, zc); s.add(piece);
      const m = mesh(G.box, wood, 0, 0, sgn * half * 0.46, 0.1, 0.12, half * 0.92, piece);
      piece.rotation.x = sgn * 0.42; m.castShadow = true;
    }
    // vài mảnh gỗ vụn & cỏ dại mọc che chân rào (cùng màu với cỏ quanh đó)
    const weed = lam(0x2d5a2e), weed2 = lam(0x3d6b3a), chip = lam(0x5a4430);
    for (let i = 0; i < 9; i++) {
      const zz = lerp(z0 - 0.6, z1 + 0.6, i / 8) + Math.sin(i * 7.3) * 0.2, xx = x + 0.35 + Math.cos(i * 3.1) * 0.25;
      const w = mesh(G.cone, i % 2 ? weed : weed2, xx, 0.22, zz, 0.06, 0.45 + (i % 3) * 0.12, 0.06, s); w.rotation.z = Math.sin(i) * 0.35;
    }
    for (const [dz, r] of [[-0.3, 0.6], [0.5, -0.4]]) { const c = mesh(G.box, chip, x + 0.5, 0.03, H.z + dz, 0.08, 0.04, 0.35, s); c.rotation.y = r; }
  }

  buildBuildings() {
    const s = this.scene;
    const roofGeo = () => { const r = new THREE.CylinderGeometry(1, 1, 1, 3); r.rotateZ(Math.PI / 2); r.rotateX(Math.PI / 6); return r; };
    // nhà kho đỏ & lán gỗ nằm TRONG trang trại (chắn đường & che tầm nhìn)
    for (const [x, z, w, d, kind] of FARM.buildings) {
      const g = new THREE.Group(); g.position.set(x, 0, z); s.add(g);
      if (kind === 'barn') {
        mesh(G.box, lam(0x7a2a22), 0, 2.6, 0, w, 5.2, d, g);
        mesh(roofGeo(), lam(0x2b2b33), 0, 5.6, 0, d + 0.4, 4.6, w * 0.6, g).rotation.y = Math.PI / 2;
        mesh(G.box, lam(0xe8e0d0), w / 2 + 0.02, 1.9, 0, 0.1, 3.8, 3.6, g);
        mesh(G.box, basic(0xffa743), w / 2 + 0.06, 1.9, 0, 0.05, 3.4, 3.1, g).castShadow = false;
      } else {
        mesh(G.box, lam(0x6e5236), 0, 1.6, 0, w, 3.2, d, g);
        mesh(G.box, lam(0x3b2a26), 0, 3.35, 0, w + 0.6, 0.25, d + 0.6, g).rotation.z = 0.12;
        mesh(G.box, lam(0x2a1d14), -w / 2 - 0.02, 1.2, 0, 0.06, 2.4, 1.6, g);
      }
    }
    // nhà ở, tháp thóc, máy kéo: bên ngoài hàng rào
    const B = CFG.bounds;
    const house = new THREE.Group(); house.position.set(B.maxX + 10, 0, -20); s.add(house);
    mesh(G.box, lam(0xcfc1a3), 0, 2.2, 0, 7, 4.4, 8, house);
    mesh(roofGeo(), lam(0x3b2a26), 0, 4.9, 0, 9, 4.2, 4.2, house).rotation.y = Math.PI / 2;
    for (const z of [-2, 2]) mesh(G.box, basic(0xffcf7a), -3.52, 2.5, z, 0.05, 1.3, 1.2, house).castShadow = false;
    const silo = new THREE.Group(); silo.position.set(B.maxX + 9, 0, 14); s.add(silo);
    mesh(G.cyl, lam(0x8c96a3), 0, 4.5, 0, 2.6, 9, 2.6, silo);
    mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x6b7480), 0, 9, 0, 2.6, 1.8, 2.6, silo);
    const tr = new THREE.Group(); tr.position.set(B.minX - 7, 0, -30); tr.rotation.y = 0.6; s.add(tr);
    mesh(G.box, lam(0x2f6b3a), 0, 1.2, 0, 1.6, 1.0, 2.8, tr);
    mesh(G.box, lam(0x2f6b3a), 0, 2.0, -0.6, 1.4, 1.2, 1.2, tr);
    for (const [x, z, r] of [[-0.95, 0.9, 0.55], [0.95, 0.9, 0.55], [-1.0, -0.8, 0.9], [1.0, -0.8, 0.9]]) {
      const w = mesh(G.cyl, lam(0x1a1a1a), x, r, z, r, 0.4, r, tr); w.rotation.z = Math.PI / 2;
    }
  }


  buildCoop() {
    const s = this.scene, Y = FARM.yard, cz = FARM.coop.z;
    const coop = new THREE.Group(); coop.position.set(0, 0, cz); s.add(coop);
    mesh(G.box, lam(0x8a5a36), 0, 1.5, 0, 9, 3, 4.6, coop);
    const roof = new THREE.CylinderGeometry(1, 1, 1, 3); roof.rotateZ(Math.PI / 2); roof.rotateX(Math.PI / 6);
    mesh(roof, lam(0x5a2e22), 0, 3.4, 0, 9.8, 2.2, 3.1, coop);
    mesh(G.box, basic(0xffb85a), 0, 1.0, -2.32, 1.3, 1.6, 0.05, coop).castShadow = false;
    mesh(G.box, lam(0x5e3d24), 0, 0.15, -2.9, 1.2, 0.1, 1.4, coop).rotation.x = -0.35;
    for (const x of [-3, 3]) mesh(G.box, basic(0xffcf7a), x, 1.9, -2.32, 0.9, 0.7, 0.05, coop).castShadow = false;
    const white = lam(0xd9d4c7), pick = [];
    const line = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 0.5));
      for (let i = 0; i <= n; i++) pick.push([lerp(x1, x2, i / n), lerp(z1, z2, i / n)]);
      mesh(G.box, white, (x1 + x2) / 2, 0.5, (z1 + z2) / 2, Math.abs(x2 - x1) + 0.08, 0.08, Math.abs(z2 - z1) + 0.08, s);
    };
    const fz = Y.minZ - 0.5, back = cz - 2.3;
    line(Y.minX - 0.6, fz, -1.2, fz); line(1.2, fz, Y.maxX + 0.6, fz);
    line(Y.minX - 0.6, fz, Y.minX - 0.6, back); line(Y.maxX + 0.6, fz, Y.maxX + 0.6, back);
    const im = new THREE.InstancedMesh(G.box, white, pick.length), m4 = new THREE.Matrix4();
    pick.forEach(([x, z], i) => { m4.makeScale(0.1, 0.8, 0.1).setPosition(x, 0.4, z); im.setMatrixAt(i, m4); });
    im.castShadow = true; s.add(im);
    const straw = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ envMapIntensity: 0.45, color: 0x8a7a3e, roughness: 1 }));
    straw.position.set(0, 0.02, (Y.minZ + Y.maxZ) / 2); straw.scale.set(4.4, 1, 1.6); straw.receiveShadow = true; s.add(straw);
  }


  buildMainGate() {
    const s = this.scene, G0 = FARM.gate, wood = lam(0x5a3f28), dark = lam(0x3a2818);
    for (const sx of [-1, 1]) {
      mesh(G.box, dark, G0.x + sx * (G0.half + 0.25), 1.7, G0.z, 0.5, 3.4, 0.5, s);
      mesh(G.box, lam(0x2a1d14), G0.x + sx * (G0.half + 0.25), 3.5, G0.z, 0.7, 0.2, 0.7, s);
    }
    mesh(G.box, dark, G0.x, 3.25, G0.z, G0.half * 2 + 1.2, 0.35, 0.3, s);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const g = cv.getContext('2d'); g.fillStyle = '#3a2818'; g.fillRect(0, 0, 512, 96);
    g.font = '800 54px "Baloo 2", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e8d9b0'; g.fillText('TRANG TRẠI ĐỒI GIÓ', 256, 66);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), new THREE.MeshStandardMaterial({ envMapIntensity: 0.45, map: new THREE.CanvasTexture(cv), roughness: 0.9 }));
    sign.position.set(G0.x, 3.85, G0.z + 0.2); s.add(sign);
    const back = sign.clone(); back.rotation.y = Math.PI; back.position.z = G0.z - 0.2; s.add(back);
    // hai cánh cổng gỗ (bản lề ở hai cột), đóng
    this.gateLeaves = [];
    for (const sx of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(G0.x + sx * G0.half, 0, G0.z); s.add(hinge);
      for (let i = 0; i < 4; i++) mesh(G.box, wood, -sx * (0.25 + i * 0.5), 0.95, 0, 0.42, 1.7, 0.08, hinge);
      mesh(G.box, dark, -sx * G0.half / 2, 1.4, 0.05, G0.half, 0.14, 0.06, hinge);
      mesh(G.box, dark, -sx * G0.half / 2, 0.5, 0.05, G0.half, 0.14, 0.06, hinge);
      this.gateLeaves.push({ hinge, sx });
    }
  }


  buildOutskirts() {
    const s = this.scene, B = CFG.bounds, plank = std(0x5e4630, { roughness: 1 }), plank2 = std(0x4a3726, { roughness: 1 }), roof = std(0x3a3532, { roughness: 0.9 }), rust = metal(0x6a4a34, { roughness: 0.8, envMapIntensity: 0.4 });
    const sheds = [[B.minX - 10, 16, 0.4], [B.maxX + 9, -38, -0.3], [-14, B.maxZ + 10, 0.1], [16, B.minZ - 11, 2.9]];
    this.outskirtSpots = sheds.map(([x, z]) => [x, z, 6]);
    for (const [x, z, r] of sheds) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; s.add(g);
      for (let i = 0; i < 9; i++) { const m = mesh(G.box, i % 2 ? plank : plank2, -2 + i * 0.5, 1.3, -1.6, 0.48, 2.6 + (i % 3) * 0.08, 0.1, g); m.rotation.z = (i % 4 - 1.5) * 0.015; }
      mesh(G.box, plank, 0, 1.3, 1.6, 4.4, 2.6, 0.1, g);
      for (const sx of [-1, 1]) mesh(G.box, plank2, sx * 2.2, 1.3, 0, 0.1, 2.6, 3.2, g);
      const rf = mesh(G.box, roof, 0, 2.85, 0, 4.9, 0.12, 3.8, g); rf.rotation.z = 0.08; rf.rotation.x = 0.04;
      mesh(G.box, basic(0x0b0906), 0.8, 1.05, 1.66, 1.1, 2.0, 0.02, g).castShadow = false;      // cửa tối
      const door = mesh(G.box, plank2, 1.55, 1.05, 2.1, 0.08, 2.0, 1.0, g); door.rotation.y = 0.9;  // cửa xệ
      for (let i = 0; i < 6; i++) mesh(G.cyl, plank, -3.2 + (i % 3) * 0.3, 0.15 + Math.floor(i / 3) * 0.28, 0.6, 0.14, 1.6, 0.14, g).rotation.x = Math.PI / 2; // đống gỗ
    }
    // hàng rào gãy đổ & xe cút kít hỏng
    const rng = mulberry32(4242);
    for (let k = 0; k < 14; k++) {
      const side = k % 4, t = rng();
      const x = side === 0 ? B.minX - 3 - rng() * 6 : side === 1 ? B.maxX + 3 + rng() * 6 : lerp(B.minX, B.maxX, t);
      const z = side === 2 ? B.minZ - 3 - rng() * 6 : side === 3 ? B.maxZ + 3 + rng() * 6 : lerp(B.minZ, B.maxZ, t);
      if (Math.hypot(x - FARM.hole.x + 5, z - FARM.hole.z) < 8 || (Math.abs(x - FARM.gate.x) < 6 && z < B.minZ)) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rng() * 6.28; s.add(g);
      for (const px of [-1.1, 0, 1.1]) { const post = mesh(G.box, plank2, px, 0.6, 0, 0.16, 1.2, 0.16, g); post.rotation.z = (rng() - 0.5) * 0.5; }
      const rail = mesh(G.box, plank, 0, 0.75, 0.05, 2.4, 0.1, 0.08, g); rail.rotation.z = (rng() - 0.5) * 0.6;
      mesh(G.box, plank, 0.6, 0.06, 0.4, 1.4, 0.08, 0.1, g).rotation.y = 0.7;            // thanh rào rơi dưới đất
      this.outskirtSpots.push([x, z, 2.5]);
    }
    const cart = new THREE.Group(); cart.position.set(B.maxX + 6, 0, 26); cart.rotation.y = 1.2; s.add(cart);
    mesh(G.box, plank2, 0, 0.75, 0, 1.4, 0.5, 2.2, cart).rotation.x = 0.2;
    for (const sx of [-1, 1]) { const w = mesh(G.cyl, rust, sx * 0.8, 0.5, -0.3, 0.5, 0.08, 0.5, cart); w.rotation.z = Math.PI / 2; }
    this.outskirtSpots.push([B.maxX + 6, 26, 3]);
  }


  buildTrees() {
    const rng = this.rng, B = CFG.bounds, pines = [], oaks = [];
    const ok = (x, z) => {
      if (x > B.minX - 3 && x < B.maxX + 3 && z > B.minZ - 3 && z < B.maxZ + 3) return false;
      if (Math.hypot(x - FARM.hole.x + 8, z - FARM.hole.z) < 9) return false; // chừa bãi cỏ an toàn
      if (Math.hypot(x - B.maxX - 10, z + 20) < 7 || Math.hypot(x - B.maxX - 9, z - 14) < 5 || Math.hypot(x - B.minX + 7, z + 30) < 4) return false;
      if (Math.abs(x - FARM.gate.x) < 5 && z < B.minZ && z > B.minZ - 12) return false;     // trước cổng chính
      if (this.outskirtSpots.some(([sx, sz, r]) => Math.hypot(x - sx, z - sz) < r)) return false; // lán gỗ bên ngoài
      return true;
    };
    let guard = 0;
    while (pines.length + oaks.length < 330 && guard++ < 8000) {
      const x = (rng() * 2 - 1) * 90, z = (rng() * 2 - 1) * 100;
      if (!ok(x, z)) continue;
      (rng() < 0.68 ? pines : oaks).push({ x, z, k: 0.75 + rng() * 0.85, r: rng() * 6.28, t: rng() });
    }
    this.treeSpots = pines.concat(oaks);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const inst = (geo, mat, list, place, tint) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => {
        const o = place(t);
        q.setFromAxisAngle(up, t.r + (o.r || 0));
        m4.compose(v.set(t.x + (o.dx || 0) * t.k, (o.y || 0) * t.k, t.z + (o.dz || 0) * t.k), q, sc.set(t.k * (o.s || 1), t.k * (o.sy || o.s || 1), t.k * (o.s || 1)));
        im.setMatrixAt(i, m4);
        if (tint) { tint(col, t); im.setColorAt(i, col); }
      });
      im.castShadow = true; im.receiveShadow = true; this.scene.add(im);
      return im;
    };
    const bark = std(0x3a2a1c, { roughness: 1 }), leaf = std(0xffffff, { roughness: 0.95 });
    const pineTint = (c, t) => c.setHex(0x173a26).lerp(new THREE.Color(0x2a4a2a), t.t * 0.7);
    const oakTint = (c, t) => c.setHex(0x23432a).lerp(new THREE.Color(0x3c5a2c), t.t * 0.8);
    // thông: thân + 4 tầng nón lệch xoay
    inst(new THREE.CylinderGeometry(0.22, 0.36, 2.4, 7).translate(0, 1.2, 0), bark, pines, () => ({}));
    [[2.5, 2.6, 2.2], [2.05, 2.3, 3.5], [1.6, 2.0, 4.7], [1.1, 1.7, 5.8]].forEach(([rad, hgt, y], li) => {
      inst(new THREE.ConeGeometry(rad, hgt, 9).translate(0, hgt / 2, 0), leaf, pines, () => ({ y, r: li * 0.7 }), pineTint);
    });
    // cây lá rộng: thân + cành + 5 khối tán tròn chồng lên nhau
    inst(new THREE.CylinderGeometry(0.26, 0.42, 3, 7).translate(0, 1.5, 0), bark, oaks, () => ({}));
    inst(new THREE.CylinderGeometry(0.08, 0.14, 1.8, 5).rotateZ(0.8).translate(0.6, 3, 0), bark, oaks, () => ({}));
    const blob = new THREE.IcosahedronGeometry(1, 1);
    [[0, 4.4, 0, 1.9], [1.3, 3.9, 0.4, 1.3], [-1.1, 3.8, -0.5, 1.4], [0.3, 3.7, -1.3, 1.2], [-0.4, 5.3, 0.5, 1.2]].forEach(([dx, y, dz, s]) => {
      inst(blob, leaf, oaks, () => ({ dx, y, dz, s, sy: s * 0.85 }), oakTint);
    });
    // đá tảng rải rác ngoài hàng rào
    const stones = [];
    for (let k = 0; k < 1500 && stones.length < 120; k++) {
      const x = (rng() * 2 - 1) * 70, z = (rng() * 2 - 1) * 80;
      if (!ok(x, z) || this.treeSpots.some((t) => Math.hypot(t.x - x, t.z - z) < 2.5)) continue;
      stones.push({ x, z, k: 0.35 + rng() * 1.1, r: rng() * 6.28, t: rng() });
    }
    const sg = new THREE.DodecahedronGeometry(1, 1), sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) { const n = 0.8 + hashN(sp.getX(i), sp.getY(i), sp.getZ(i), 3) * 0.35; sp.setXYZ(i, sp.getX(i) * n, sp.getY(i) * n * 0.7, sp.getZ(i) * n); }
    sg.computeVertexNormals();
    inst(sg, std(0xffffff, { roughness: 0.92 }), stones, () => ({ y: 0.25 }), (c, t) => c.setHex(0x5e605c).lerp(new THREE.Color(0x7a786e), t.t));
  }


  buildFireflies() {
    const n = 220, pos = new Float32Array(n * 3), B = CFG.bounds;
    this.flyData = [];
    for (let i = 0; i < n; i++) this.flyData.push({ x: lerp(B.minX, B.maxX, Math.random()), z: lerp(B.minZ, B.maxZ, Math.random()), y: 0.5 + Math.random() * 2.5, ph: Math.random() * 99 });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.flies = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd9ff8a, size: 0.35, map: this.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flies.frustumCulled = false;
    this.scene.add(this.flies);
  }


  update(time) {
    const p = this.flies.geometry.attributes.position;
    this.flyData.forEach((d, i) => p.setXYZ(i, d.x + Math.sin(time * 0.4 + d.ph) * 1.5, d.y + Math.sin(time * 1.3 + d.ph) * 0.4, d.z + Math.cos(time * 0.3 + d.ph) * 1.5));
    p.needsUpdate = true;
    this.flies.material.opacity = 0.6 + Math.sin(time * 3) * 0.25;
  }
}

let sharedEnv = null; // cảnh tĩnh trang trại dùng lại giữa các lần chơi lại (LevelManager quyết định khi nào hủy)

export class Level1_Farm extends LevelBase {
  static meta = {
    goals: ['Trộm Gà Trống Vàng trong chuồng', 'Tẩu thoát khỏi trang trại'],
    code: 'Nhiệm vụ 1', title: 'Trộm Gà Trống Vàng', place: 'Trang trại Đồi Gió · 2 giờ sáng',
    goal: 'Trộm con Gà Trống Vàng trong chuồng gà và tẩu thoát khỏi trang trại an toàn.',
    danger: ['Đàn chó canh thính giác cao, tầm nhìn rộng. Bị phát hiện trước khi có gà là hết đường chạy.', 'Tường rơm bọc kín sân chuồng gà.'],
    win: 'Mang Gà Trống Vàng ra khỏi trang trại mà không bị ai tóm.',
    lose: 'Bị bất kỳ ai tóm được.',
    intel: 'Lũ chó ở đây mê xương hơn mê bắt trộm: có một khúc xương ở ổ chó. Ném nó thật xa, mọi con chó nghe thấy sẽ bỏ chốt chạy tới gặm 6.5 giây. Bạn đã vào bằng cổng chính phía nam.',
    diff: 'Trang trại Đồi Gió', par: 75, minRunTime: 20,
    // 10 "cao thủ" giả lập cho bảng xếp hạng lần đầu
    simTimes: [41.37, 44.82, 47.05, 49.9, 53.18, 57.64, 61.2, 66.75, 74.3, 88.06],
  };
  static bounds = FARM.bounds;
  static start = FARM.start;

  init() {
    super.init();
    const root = this.root, L = DATA, C = Collision;
    // cảnh tĩnh (mặt cỏ, nhà, chuồng gà, cổng, rừng...) — dựng một lần
    if (!sharedEnv) sharedEnv = new FarmEnvironment(this.game.world);
    this.env = sharedEnv; this.scene.add(this.env.scene);
    this.gateOpen = 0; this.applyGate();
    // giải mã vị trí bẫy + tuyến an toàn vào biến cục bộ; dựng xong là bỏ
    let secret = Vault.open(L.secret);
    this.solids = this.env.staticSolids();
    // ổ chó (chặn đường & che tầm nhìn)
    const [kx, kz, kr] = L.kennel, kennel = Models.kennel();
    kennel.position.set(kx, 0, kz); kennel.rotation.y = kr; root.add(kennel);
    this.kennel = { x: kx, z: kz };
    this.solids.push(C.aabb(kx - 1.05, kx + 1.05, kz - 1.05, kz + 1.05, true, 'kennel'));
    this.buildCommon(L, secret);
    secret = null;
    // cột chuông gió (trang trí, rung khi có xương rơi gần) — KHÔNG còn là vùng bắt buộc phải ném trúng
    const [zx, zz, zr] = L.zone;
    this.zone = { x: zx, z: zz, r: zr };
    const chime = Models.chime(); chime.position.set(zx + zr + 0.5, 0, zz + 0.3); root.add(chime); this.chime = chime;
    this.chimeT = 0;
    this.bones = [new Bone(root, L.bone[0], L.bone[1])]; // xương nằm ở ổ chó
    const Y = FARM.yard;
    // ba gà mái trắng + một Gà Trống Vàng (mục tiêu nhiệm vụ)
    this.chickens = [0, 1, 2, 3].map((i) => new Chicken(root, lerp(Y.minX + 1, Y.maxX - 1, i / 3), lerp(Y.minZ + 0.6, Y.maxZ - 0.6, Math.random()), i === 2));
    this.target = this.chickens.find((c) => c.rooster); this.target.target = true;
    this.buildHoleBarrier();
    this.boss = new Boss(root);
    this.exit = { x: FARM.hole.x, z: FARM.hole.z, dir: -Math.PI / 2 };
  }

  // Va chạm của đoạn rào gãy: loại 'crawl' → đi bộ / nhảy / trèo đều KHÔNG qua, chỉ nằm bò (hoặc trượt) mới lọt.
  // Chó không chui được nên bị cản lại bên trong. (Phần nhìn thấy được dựng ở FarmEnvironment.buildBrokenSection.)
  buildHoleBarrier() {
    const H = FARM.hole;
    this.holeBar = Collision.aabb(H.x - 1.2, H.x + 0.45, H.z - H.w / 2, H.z + H.w / 2, false, 'crawl');
    this.solids.push(this.holeBar);
  }
  // đã nằm bò lọt vào lỗ rào: chó ở ngoài không với tới
  shielded(p) {
    const H = FARM.hole;
    return (p.stance === 'prone' || !!p.slide) && p.x < H.x + 0.9 && Math.abs(p.z - H.z) < H.w / 2;
  }

  // dọn màn; keepEnv = true khi chơi lại chính màn này (giữ cảnh tĩnh để tải lại nhanh)
  cleanup(keepEnv) {
    super.cleanup();
    if (this.env) {
      this.scene.remove(this.env.scene);
      if (!keepEnv) { disposeTree(this.env.scene); sharedEnv = null; }
      this.env = null;
    }
  }

  update(dt) {
    const t = this.game.time;
    for (const c of this.chickens) c.update(dt, t);
    if (this.env) this.env.update(t);
    this.chimeT = Math.max(0, this.chimeT - dt);
    const amp = 0.08 + this.chimeT * 0.25;
    this.chime.userData.tubes.children.forEach((tb, i) => { tb.rotation.z = Math.sin(t * (2 + i * 0.4) + i) * amp; });
  }

  /* ---------- thắng / thua ---------- */
  holdingTarget() { const h = this.game.player.holding; return !!(h && h.target); }
  // ôm Gà Trống Vàng chui ra khỏi lỗ hổng hàng rào phía tây
  checkWinCondition() { return this.holdingTarget() && this.game.player.x < FARM.hole.x - 0.6; }
  // ôm gà quay về cổng chính → Ông chủ trang trại xuất hiện
  checkFailCondition() {
    const p = this.game.player;
    return this.holdingTarget() && Math.hypot(p.x - FARM.gate.x, p.z - FARM.gate.z) < FARM.gate.trigger ? 'boss' : null;
  }
  // chỉ có thể tới được phía ngoài rào bằng cách bò qua đoạn rào gãy
  validateWin() { return this.game.player.x < FARM.hole.x - 0.6; }
  bustReason(why, game) {
    return {
      trap: `${game.trapHit} làm ồn cả trang trại, và đàn chó đã tìm tới.`,
      seen: 'Bạn lọt vào tầm nhìn của chó. Đã bị phát hiện thì không thể chạy thoát: chó chạy nhanh hơn bạn.',
      close: 'Bạn đi quá sát một con chó và bị nó đánh hơi thấy.',
      hunt: 'Đàn chó đã đuổi kịp bạn.',
    }[why] || 'Bạn đã bị tóm.';
  }

  /* ---------- tương tác riêng: bắt gà, đẩy đống rơm ---------- */
  interactions(p, near) {
    const held = p.holding;
    const rooster = held && held.target ? null : this.chickens.find((c) => c.rooster && !c.carried && near(c, CFG.interact));
    if (rooster) return { type: 'grab', label: 'Bắt Gà Trống Vàng', ref: rooster, focus: rooster.rig.group };
    return null;
  }
  doAction(a) {
    const g = this.game, p = g.player;
    switch (a.type) {
      case 'grab': {
        g.dropHeld();
        const c = a.ref; c.carried = true; p.holding = c;
        c.rig.group.parent.remove(c.rig.group); p.rig.carry.add(c.rig.group);
        c.rig.group.position.set(0, 0, 0); c.rig.group.rotation.set(0, 0, 0); c.rig.body.rotation.x = 0;
        // Gà Vàng kêu inh ỏi → cả đàn chó (dù ở đâu, dù đang gặm xương) chuyển sang RƯỢT ĐUỔI DỮ DỘI
        g.fx.pop(p, 'Ò Ó O O O!!!', 'clang', 1.4, 2.9);
        Sfx.play('cluck'); setTimeout(() => Sfx.play('cluck'), 160); setTimeout(() => Sfx.play('bark'), 600);
        g.fx.ring(p.x, p.z, 40, 0xff4a3a, 1.6, 0.8);
        if (g.minimap) g.minimap.ping(p.x, p.z, 30, 'alarm');
        for (const d of this.dogs) d.hunt(g);
        g.failCause = 'hunt';
        return true;
      }
    }
    return false;
  }

  /* ---------- xương rơi ở BẤT KỲ đâu: sóng âm kéo cả đàn chó trong bán kính tới đúng điểm rơi (xem LevelBase) ---------- */
  onBaitLanded(bone) {
    const lured = super.onBaitLanded(bone);
    const Z = this.zone;
    if (Math.hypot(bone.x - Z.x, bone.z - Z.z) < 8) this.chimeT = 2.5; // chuông gió gần đó rung lên (chỉ để trang trí)
    return lured;
  }

  /* ---------- bản đồ nhỏ ---------- */
  drawMinimap(c, map) {
    const B = CFG.bounds, G0 = FARM.gate; // rào biên vẽ kín hoàn toàn: bản đồ không tiết lộ lối thoát bí mật
    c.fillStyle = 'rgba(16,30,22,1)'; c.fillRect(map.X(G0.x - G0.half), map.Y(B.minZ) - 3, G0.half * 2 * map.ppm, 6);
    map.label(c, 'Chuồng gà', 0, FARM.coop.z, '#ffd27a');
    map.label(c, 'Ổ chó', DATA.kennel[0], DATA.kennel[1], '#ff9a8a', -11);
    c.fillStyle = '#f4ecd9'; c.beginPath(); c.arc(map.X(DATA.bone[0]), map.Y(DATA.bone[1]), 2.2, 0, 7); c.fill();
    map.label(c, 'Cổng chính', G0.x, B.minZ, '#e9eefb', -9);
  }
  // giữ khoảng đất trước đoạn rào gãy không bị cây / đá lấp (vị trí cũ của đống rơm, nên bố cục cây cảnh không đổi)
  decorKeepClear() { const L = DATA, H = FARM.hole; return [L.bone, L.kennel, [L.zone[0], L.zone[1]], [H.x + 1.4, H.z]]; }
  decorExclude(x, z) { const Y = FARM.yard; return x > Y.minX - 1.5 && x < Y.maxX + 1.5 && z > Y.minZ - 1.5; }

  /* ---------- cảnh cắt: Ông chủ trang trại ở cổng chính ---------- */
  applyGate() {
    const a = this.gateOpen * 1.7;
    for (const { hinge, sx } of this.env.gateLeaves) hinge.rotation.y = sx * -a;
  }
  startFailCinematic(kind) {
    if (kind !== 'boss') return false;
    const g = this.game;
    this.bossT = 0; this.bossHit = false;
    this.boss.appear();
    g.camShake = 0.5;
    g.ui.flash('#fff');
    Sfx.play('stinger');
    for (const d of this.dogs) d.alarmChase(g);
    this.failText = { title: 'BUSTED BY THE FARM OWNER!', troll: 'Cổng chính là một cái bẫy!' };
    return true;
  }
  updateCinematic(dt) {
    const g = this.game, p = g.player, b = this.boss;
    this.bossT += dt;
    b.update(dt, p);
    this.gateOpen = Math.min(1, this.gateOpen + dt * 6); this.applyGate();
    p.facing = turnTo(p.facing, Math.atan2(b.x - p.x, b.z - p.z), dt * 10);
    if (!this.bossHit && this.bossT >= 0.8) {
      this.bossHit = true;
      Sfx.play('hit'); Sfx.play('siren', 2.2);
      g.camShake = 0.35; p.stunT = 9;
      g.ui.flash('#ff2a2a');
      g.fx.pop(p, 'BỐP!', 'clang', 1.2, 2.6);
    }
    p.animate(dt, 0);
    return { over: this.bossT >= 1.5 };
  }
  // giật & zoom thẳng vào khuôn mặt giận dữ của Ông chủ: máy quay ngay sau vai tên trộm, FOV 55 → 25
  cinematicCamera(cm, dt) {
    const p = this.game.player, b = this.boss, dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    cm.moveTo(new THREE.Vector3(p.x - ux * 0.6 + uz * 0.45, 1.85, p.z - uz * 0.6 - ux * 0.45), dt * 16);
    cm.lookAt(b.headPos(this._head || (this._head = new THREE.Vector3())));
    cm.setFov(25, dt * 12);
    return true;
  }
}
