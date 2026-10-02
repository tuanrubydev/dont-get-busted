/* =====================================================================
 * Hệ thống bẫy vô hình:
 *   Vault  — giải mã chuỗi "secret" (vị trí bẫy + tuyến an toàn) của màn, chỉ vào biến cục bộ lúc dựng màn
 *   Trap   — 5 loại bẫy (hố sập, dây vấp, mìn pháo sáng, bẫy kẹp gấu, xô sắt/cành khô).
 *            ẨN TUYỆT ĐỐI: khi còn "armed", bẫy CHỈ là toạ độ toán học (tâm + bán kính, hoặc đoạn thẳng với dây vấp)
 *            dùng cho phép thử khoảng cách — không có Mesh, Group, bóng đổ, vật liệu hay texture nào trong cảnh.
 *            Mô hình 3D chỉ được dựng ra ĐÚNG LÚC bẫy sập (giẫm phải = step, hoặc bị vật ném trúng = remote → hỏng hẳn).
 *   TrapSystem.build / findHit — tạo bẫy từ dữ liệu đã giải mã, tìm bẫy trúng điểm rơi của vật ném
 * ===================================================================== */
import { THREE } from '../engine/three.js';
import { CFG } from '../config.js';
import { clamp, lerp, mulberry32, Collision } from '../engine/utils.js';
import { G, mesh, std, lam, metal, basic, Models } from '../engine/Models.js';

export const Vault = {
  K: [68, 71, 66, 33, 102, 97, 114, 109, 45, 50, 48, 50, 54, 35, 103, 97],
  open(str) {
    const bin = atob(str), K = this.K;
    let s = '';
    for (let i = 0; i < bin.length; i++) s += String.fromCharCode(bin.charCodeAt(i) ^ K[i % K.length] ^ ((i * 31 + 7) & 255));
    return JSON.parse(s);
  },
};

/* =============================== Trap =============================== */
export class Trap {
  // 5 loại bẫy ngụy trang, chỉ nhận ra khi quan sát kỹ:
  //   pitfall  hố sập dưới lớp lá khô         → sụp xuống hố, khựng 2s, cả đàn chó rượt
  //   tripwire dây thép mảnh giữa 2 cọc thấp   → nỏ trong bụi bắn tên găm xuống đất "SÚY!", chó chạy tới kiểm tra
  //   flare    mìn pháo sáng, chỉ hở nút bấm   → pháo sáng đỏ bay lên + còi rít, cả đàn chó rượt
  //   bear     bẫy kẹp gấu dưới mớ cỏ dại      → kẹp chân 2.5s, chó gần đó chạy tới
  //   bucket / branch  xô sắt, cành khô         → "CLANG!" / "CẠCH!", con chó gần nhất tới xem
  // Ném xương/đá trúng bẫy: bẫy sập từ xa và hỏng hẳn (đi qua an toàn), nhưng vẫn gây tiếng động.
  constructor(root, def) {
    this.root = root;
    if (def[4] === 'tripwire') {
      [this.x1, this.z1, this.x2, this.z2] = def; this.type = 'tripwire';
      this.x = (this.x1 + this.x2) / 2; this.z = (this.z1 + this.z2) / 2;
    } else { [this.x, this.z, this.type] = def; }
    this.conf = CFG.traps[this.type];
    this.state = 'armed'; this.t = 0;
    // KHÔNG tạo bất kỳ đối tượng 3D nào ở đây: bẫy chưa sập không tồn tại trong render pipeline
    // (không thể thấy bằng mọi góc nhìn / độ phân giải, cũng không lộ qua bóng đổ hay cây cảnh).
    this.group = null;
    if (this.type === 'tripwire') {
      const ang = Math.atan2(this.x2 - this.x1, this.z2 - this.z1);
      this.shooter = { x: this.x + Math.cos(ang) * 6, z: this.z - Math.sin(ang) * 6 }; // nỏ giấu bên đường, bắn vuông góc với dây
    }
  }

  // dựng mô hình bẫy — chỉ gọi một lần, ngay khi bẫy sập
  build() {
    this.group = new THREE.Group(); this.root.add(this.group);
    const g = this.group, x = this.x, z = this.z, rng = mulberry32(Math.round(x * 31 + z * 17));
    switch (this.type) {
      case 'pitfall': {
        this.hole = mesh(new THREE.CylinderGeometry(0.85, 0.7, 1.2, 16, 1, true), std(0x1a1208, { roughness: 1, side: THREE.DoubleSide }), x, -0.58, z, 1, 1, 1, g);
        this.holeFloor = mesh(new THREE.CircleGeometry(0.7, 16).rotateX(-Math.PI / 2), basic(0x050403), x, -1.15, z, 1, 1, 1, g);
        this.rim = mesh(new THREE.RingGeometry(0.85, 1.15, 20).rotateX(-Math.PI / 2), lam(0x3b2c1a), x, 0.015, z, 1, 1, 1, g);
        this.hole.visible = this.holeFloor.visible = this.rim.visible = false;
        this.cover = new THREE.Group(); this.cover.position.set(x, 0.02, z); g.add(this.cover);
        mesh(new THREE.CircleGeometry(0.9, 18).rotateX(-Math.PI / 2), lam(0x3f3420), 0, 0, 0, 1, 1, 1, this.cover);
        const leaf = [0x6b4f22, 0x7a5a26, 0x54401e, 0x8a6a2a];
        for (let i = 0; i < 16; i++) {
          const a = rng() * 6.28, d = rng() * 0.8;
          const m = mesh(G.sph, lam(leaf[i % 4]), Math.cos(a) * d, 0.03, Math.sin(a) * d, 0.16, 0.015, 0.09, this.cover);
          m.rotation.y = rng() * 6.28;
        }
        break;
      }
      case 'tripwire': {
        const steel = metal(0xa3abb3, { roughness: 0.3 }), wood = lam(0x4a3522);
        for (const [px, pz] of [[this.x1, this.z1], [this.x2, this.z2]]) mesh(G.cyl, wood, px, 0.2, pz, 0.04, 0.4, 0.04, g);
        const len = Math.hypot(this.x2 - this.x1, this.z2 - this.z1), ang = Math.atan2(this.x2 - this.x1, this.z2 - this.z1);
        this.wires = [];
        for (const s of [-1, 1]) {
          const piv = new THREE.Group(); piv.position.set(s < 0 ? this.x1 : this.x2, 0.16, s < 0 ? this.z1 : this.z2); piv.rotation.y = ang + (s < 0 ? 0 : Math.PI); g.add(piv);
          const w = mesh(G.cyl, steel, 0, 0, len / 4, 0.008, len / 2, 0.008, piv); w.rotation.x = Math.PI / 2; w.castShadow = false;
          this.wires.push(piv);
        }
        break;
      }
      case 'flare': {
        mesh(G.cyl, metal(0x4a4e52, { roughness: 0.42 }), x, 0.015, z, 0.09, 0.03, 0.09, g);
        mesh(G.cyl, lam(0x5a1414), x, 0.04, z, 0.035, 0.03, 0.035, g);
        for (let i = 0; i < 5; i++) { const a = i * 1.26; mesh(G.cone, lam(0x2c4a26), x + Math.cos(a) * 0.18, 0.1, z + Math.sin(a) * 0.18, 0.04, 0.2, 0.04, g); }
        break;
      }
      case 'bear': {
        const t = Models.trap(); this.rig = t;
        t.group.position.set(x, -0.03, z); g.add(t.group);
        for (const j of t.jaws) j.g.rotation.x = j.s * 1.3;
        this.weeds = new THREE.Group(); this.weeds.position.set(x, 0, z); g.add(this.weeds);
        for (let i = 0; i < 11; i++) {
          const a = rng() * 6.28, d = rng() * 0.42;
          const w = mesh(G.cone, lam(i % 3 ? 0x2d5a2e : 0x6a6a2a), Math.cos(a) * d, 0.2, Math.sin(a) * d, 0.05, 0.4 + rng() * 0.25, 0.05, this.weeds);
          w.rotation.z = (rng() - 0.5) * 0.5;
        }
        break;
      }
      case 'bucket': this.rig = { group: Models.bucket() }; this.rig.group.position.set(x, 0, z); this.rig.group.rotation.y = x * 1.7 + z; g.add(this.rig.group); break;
      case 'branch': this.rig = { group: Models.branches() }; this.rig.group.position.set(x, 0, z); this.rig.group.rotation.y = x * 1.7 + z; g.add(this.rig.group); break;
    }
  }

  // vùng kích hoạt (bán kính r của vật chạm vào)
  hitTest(px, pz, r) {
    if (this.type === 'tripwire') {
      const dx = this.x2 - this.x1, dz = this.z2 - this.z1, l2 = dx * dx + dz * dz;
      const t = clamp(((px - this.x1) * dx + (pz - this.z1) * dz) / l2, 0, 1);
      return Math.hypot(px - this.x1 - dx * t, pz - this.z1 - dz * t) < 0.15 + r;
    }
    const reach = { pitfall: 0.75, flare: 0.35, bear: 0.42, bucket: 0.45, branch: 0.55 }[this.type];
    return Math.hypot(px - this.x, pz - this.z) < reach + r;
  }

  update(dt, time, game) {
    const p = game.player;
    if (this.state === 'armed') {
      // nhảy qua thì không sập; tiếp đất đúng chỗ thì sập
      if (game.state === 'play' && !p.hidden && p.stunT <= 0 && p.y < 0.05 && !p.vault && this.hitTest(p.x, p.z, 0.22)) this.spring(game, 'step');
      return;
    }
    this.t += dt;
    const k = Math.min(1, this.t * 8);
    switch (this.type) {
      case 'pitfall': this.cover.position.y = 0.02 - Math.min(1.2, this.t * 3); this.cover.scale.setScalar(Math.max(0.01, 1 - this.t * 1.5)); break;
      case 'bear': for (const j of this.rig.jaws) j.g.rotation.x = j.s * lerp(1.3, 0.05, k); break;
      case 'bucket': {
        const g = this.rig.group, kk = Math.min(1, this.t * 2.5);
        g.position.set(this.x + this.kickX * kk * 1.6, 0, this.z + this.kickZ * kk * 1.6); g.rotation.x = kk * 6;
        break;
      }
      case 'tripwire': this.wires.forEach((w) => { w.rotation.x = lerp(w.rotation.x, 1.35, Math.min(1, dt * 10)); }); break;
      case 'flare': if (this.flare) this.updateFlare(dt); break;
    }
  }

  spring(game, how, at) {
    if (this.state !== 'armed') return;
    this.state = 'sprung'; this.t = 0; this.triggered = true; this.how = how;
    this.build(); // lúc này bẫy mới thật sự xuất hiện trong cảnh
    const hit = at || game.player;
    // hố đã sập từ xa thì lộ miệng hố: đi vòng qua được, không rơi xuống nữa
    if (this.type === 'pitfall' && how === 'remote') game.level.solids.push(Collision.aabb(this.x - 0.75, this.x + 0.75, this.z - 0.75, this.z + 0.75, false, 'pit'));
    switch (this.type) {
      case 'pitfall': this.hole.visible = this.holeFloor.visible = this.rim.visible = true; game.fx.dust(this.x, this.z, 0x6b5232, 26); break;
      case 'bear': this.weeds.children.forEach((w) => { w.rotation.z = (Math.random() - 0.5) * 2.6; w.scale.y = 0.5; }); break;
      case 'bucket': { const f = Math.atan2(this.x - hit.x, this.z - hit.z) || game.player.facing; this.kickX = Math.sin(f); this.kickZ = Math.cos(f); break; }
      case 'branch': this.rig.group.children.forEach((c, i) => { c.rotation.z += (i % 2 ? 0.6 : -0.6); c.position.y = 0.03; c.scale.y = 0.5; }); break;
      case 'tripwire': game.fx.arrow(this.shooter, how === 'step' ? { x: game.player.x, z: game.player.z } : { x: this.x, z: this.z }); break;
      case 'flare': this.launchFlare(game); break;
    }
    game.onTrap(this, how);
  }

  launchFlare(game) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: game.world.glowTex(), color: 0xff3a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.set(3, 3, 1);
    const light = game.flareLight; // đèn dùng chung (tạo sẵn, tránh biên dịch lại shader giữa trận)
    this.root.add(sprite);
    this.flare = { sprite, light, y: 0.3, smokeT: 0 };
    this.game = game;
  }

  updateFlare(dt) {
    const f = this.flare, t = this.t;
    f.y = t < 1.3 ? 0.3 + t * 15 : Math.max(2, 19.8 - (t - 1.3) * 0.9);
    const flick = 0.85 + Math.random() * 0.3;
    f.sprite.position.set(this.x, f.y, this.z); f.sprite.scale.setScalar(3 * flick);
    f.light.position.set(this.x, f.y, this.z);
    f.light.intensity = t > 14 ? Math.max(0, 3.2 - (t - 14) * 1.5) : 3.2 * flick;
    f.smokeT -= dt;
    if (f.smokeT <= 0 && t < 2) { f.smokeT = 0.05; this.game.fx.smoke(this.x, f.y - 0.6, this.z); }
    if (t > 16) { f.sprite.visible = false; }
  }
}

// Hòn đá: vật ném phụ để phá bẫy từ xa hoặc tạo tiếng động giả (chó không ăn đá)

export const TrapSystem = {
  build(root, list) { return (list || []).map((t) => new Trap(root, t)); },
  findHit(traps, x, z, r = 0.25) { return traps.find((t) => t.state === 'armed' && t.hitTest(x, z, r)); },
};
