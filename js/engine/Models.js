/* Vật liệu PBR dùng chung + dựng mô hình bằng khối hình học (không cần file 3D bên ngoài). */
import { THREE } from './three.js';
import { lerp, mulberry32, Collision } from './utils.js';

export const MAT = {};
export function std(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!MAT[key]) MAT[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, metalness: 0, envMapIntensity: 0.45 }, extra || {}));
  return MAT[key];
}
export const lam = std; // tên cũ
export function fur(color, extra) { return std(color, Object.assign({ roughness: 1 }, extra)); }
export function metal(color, extra) { return std(color, Object.assign({ roughness: 0.32, metalness: 0.8, envMapIntensity: 1.1 }, extra)); }
export function basic(color) {
  const k = 'g' + color;
  if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, roughness: 1, metalness: 0 });
  return MAT[k];
}
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 14, 10),
  ico: new THREE.IcosahedronGeometry(1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 10),
};
export function mesh(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
export function pivot(parent, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; }

export const Models = {
  thief() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const hoodie = lam(0x1a1d26), pants = lam(0x23293a), skin = lam(0xe9b892), black = lam(0x0d0e12);
    const legs = [];
    for (const s of [-1, 1]) {
      const p = pivot(body, s * 0.15, 0.55, 0);
      mesh(G.cyl, pants, 0, -0.27, 0, 0.11, 0.55, 0.11, p);
      mesh(G.box, black, 0, -0.55, 0.06, 0.18, 0.1, 0.3, p);
      legs.push(p);
    }
    mesh(G.cyl, hoodie, 0, 0.92, 0, 0.36, 0.78, 0.3, body).geometry = new THREE.CylinderGeometry(0.85, 1, 1, 12);
    mesh(G.sph, skin, 0, 1.52, 0, 0.29, 0.3, 0.29, body);
    mesh(G.cyl, black, 0, 1.55, 0, 0.3, 0.12, 0.3, body);                    // khăn bịt mắt
    for (const s of [-1, 1]) mesh(G.sph, basic(0xffffff), s * 0.1, 1.56, 0.27, 0.055, 0.045, 0.03, body);
    const hat = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    mesh(hat, black, 0, 1.63, 0, 0.31, 0.3, 0.31, body);                     // nón len
    mesh(G.cyl, lam(0x2a2d36), 0, 1.65, 0, 0.32, 0.09, 0.32, body);
    mesh(G.sph, lam(0x3a3e4a), 0, 1.97, 0, 0.08, 0.08, 0.08, body);
    mesh(G.sph, lam(0x8a6a3e), 0, 1.05, -0.36, 0.32, 0.38, 0.26, body);       // bao tải sau lưng
    mesh(G.cyl, lam(0x5e4526), 0, 1.4, -0.36, 0.06, 0.12, 0.06, body);
    const arms = [];
    for (const s of [-1, 1]) {
      const p = pivot(body, s * 0.4, 1.25, 0);
      mesh(G.cyl, hoodie, 0, -0.27, 0, 0.08, 0.55, 0.08, p);
      mesh(G.sph, skin, 0, -0.57, 0, 0.08, 0.08, 0.08, p);
      arms.push(p);
    }
    const hand = pivot(arms[1], 0, -0.6, 0.05);  // chỗ cầm xương
    const carry = pivot(body, 0, 2.05, 0.05);    // chỗ giơ gà trên đầu
    return { group: g, body, legs, arms, hand, carry };
  },

  dog(dark) {
    const g = new THREE.Group(), fur = std(dark ? 0x2a2522 : 0x6b4428, { roughness: 1 }), fur2 = std(dark ? 0x4a3f38 : 0x9a6a40, { roughness: 1 }), black = lam(0x141210);
    mesh(G.box, fur, 0, 0.72, 0, 0.62, 0.52, 1.15, g);
    mesh(G.box, fur2, 0, 0.66, 0.32, 0.5, 0.42, 0.42, g);
    const head = pivot(g, 0, 1.02, 0.66);
    mesh(G.box, fur, 0, 0.05, 0.05, 0.52, 0.46, 0.5, head);
    mesh(G.box, fur2, 0, -0.06, 0.38, 0.28, 0.24, 0.34, head);
    mesh(G.box, black, 0, 0.0, 0.56, 0.12, 0.1, 0.06, head);
    for (const s of [-1, 1]) {
      mesh(G.box, black, s * 0.22, 0.24, -0.02, 0.1, 0.3, 0.2, head).rotation.z = s * 0.35;
      mesh(G.box, basic(0xff2a2a), s * 0.13, 0.12, 0.31, 0.08, 0.06, 0.03, head); // mắt đỏ
    }
    mesh(G.cyl, lam(0xb01e28), 0, 0.88, 0.48, 0.3, 0.08, 0.3, g).rotation.x = 0.5; // vòng cổ
    const tail = pivot(g, 0, 0.92, -0.58);
    mesh(G.cyl, fur, 0, 0.22, -0.08, 0.06, 0.48, 0.06, tail).rotation.x = -0.6;
    const legs = [];
    for (const [x, z] of [[-0.2, 0.4], [0.2, 0.4], [-0.2, -0.42], [0.2, -0.42]]) {
      const p = pivot(g, x, 0.5, z);
      mesh(G.box, fur, 0, -0.25, 0, 0.14, 0.5, 0.14, p);
      legs.push(p);
    }
    return { group: g, head, tail, legs };
  },

  chicken(rooster) {
    // gà mái trắng, hoặc Gà Trống Vàng (mục tiêu): lông vàng óng, mào to, đuôi cong nhiều màu
    const g = new THREE.Group();
    const white = rooster ? lam(0xe8b422, { emissive: 0x3a2600 }) : lam(0xf3efe6);
    const wing = rooster ? lam(0xc98a12, { emissive: 0x2a1a00 }) : lam(0xe6e0d2);
    const red = lam(0xd8323a), yellow = lam(0xf2b632), orange = lam(0xe58a2e);
    const body = new THREE.Group(); g.add(body);
    const k = rooster ? 1.25 : 1;
    body.scale.setScalar(k);
    mesh(G.sph, white, 0, 0.38, 0, 0.3, 0.27, 0.36, body);
    if (rooster) {
      const tails = [lam(0x1f5a3a), lam(0xb8461c), lam(0x2a3a7a)];
      tails.forEach((m, i) => { const t = mesh(G.cone, m, (i - 1) * 0.08, 0.66, -0.34, 0.07, 0.5, 0.05, body); t.rotation.x = -0.5 - i * 0.15; t.rotation.z = (i - 1) * 0.3; });
    } else mesh(G.cone, white, 0, 0.55, -0.32, 0.14, 0.32, 0.1, body).rotation.x = -0.9;
    for (const s of [-1, 1]) mesh(G.sph, wing, s * 0.27, 0.4, -0.02, 0.07, 0.17, 0.24, body);
    const head = pivot(body, 0, 0.62, 0.24);
    mesh(G.sph, white, 0, 0.06, 0, 0.15, 0.16, 0.15, head);
    const comb = rooster ? 1.7 : 1;
    for (let i = 0; i < 3; i++) mesh(G.sph, red, 0, 0.22 + (i === 1 ? 0.03 : 0) * comb, -0.06 + i * 0.07, 0.04 * comb, 0.06 * comb, 0.04 * comb, head);
    mesh(G.cone, yellow, 0, 0.04, 0.18, 0.05, 0.12, 0.05, head).rotation.x = Math.PI / 2;
    mesh(G.sph, red, 0, -0.06, 0.13, 0.03, 0.06 * comb, 0.03, head);
    for (const s of [-1, 1]) mesh(G.sph, basic(0x111111), s * 0.09, 0.1, 0.1, 0.025, 0.025, 0.025, head);
    const legs = [];
    for (const s of [-1, 1]) {
      const p = pivot(g, s * 0.1 * k, 0.16 * k, 0);
      mesh(G.cyl, orange, 0, -0.08, 0, 0.02, 0.18 * k, 0.02, p);
      legs.push(p);
    }
    return { group: g, body, head, legs };
  },

  // Ông chủ trang trại: to con, quần yếm xanh, áo ca rô đỏ, mũ rơm, râu, một tay gậy, một tay đèn pin
  farmer() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const denim = lam(0x2f4d7a), shirt = lam(0xa3262a), skin = lam(0xd9a07a), beard = lam(0x5a4a3c), hat = lam(0xd8b45a), boot = lam(0x2a1d14);
    for (const s of [-1, 1]) {
      mesh(G.cyl, denim, s * 0.2, 0.5, 0, 0.14, 1.0, 0.14, body);
      mesh(G.box, boot, s * 0.2, 0.06, 0.06, 0.24, 0.14, 0.38, body);
    }
    mesh(G.cyl, shirt, 0, 1.35, 0, 0.42, 0.85, 0.34, body);
    mesh(G.box, denim, 0, 1.2, 0.16, 0.6, 0.62, 0.1, body);                       // yếm
    for (const s of [-1, 1]) mesh(G.box, denim, s * 0.18, 1.6, 0.17, 0.08, 0.5, 0.06, body);
    const head = pivot(body, 0, 1.95, 0);
    mesh(G.sph, skin, 0, 0, 0, 0.26, 0.28, 0.26, head);
    mesh(G.sph, beard, 0, -0.12, 0.12, 0.22, 0.18, 0.16, head);
    // lông mày chau lại, mắt đỏ ngầu: khuôn mặt giận dữ
    for (const s of [-1, 1]) {
      mesh(G.sph, basic(0xffffff), s * 0.09, 0.05, 0.22, 0.05, 0.04, 0.03, head);
      mesh(G.sph, basic(0x7a0000), s * 0.09, 0.05, 0.245, 0.025, 0.025, 0.015, head);
      const brow = mesh(G.box, beard, s * 0.1, 0.12, 0.23, 0.13, 0.035, 0.03, head); brow.rotation.z = -s * 0.45;
    }
    mesh(G.box, lam(0x5a1a14), 0, -0.05, 0.25, 0.1, 0.02, 0.02, head);           // miệng mím
    mesh(G.cyl, hat, 0, 0.2, 0, 0.5, 0.04, 0.5, head);
    mesh(G.cyl, hat, 0, 0.32, 0, 0.24, 0.22, 0.24, head);
    const armR = pivot(body, 0.48, 1.7, 0), armL = pivot(body, -0.48, 1.7, 0);
    for (const a of [armR, armL]) { mesh(G.cyl, shirt, 0, -0.3, 0, 0.1, 0.6, 0.1, a); mesh(G.sph, skin, 0, -0.62, 0, 0.1, 0.1, 0.1, a); }
    const stick = pivot(armR, 0, -0.62, 0.05);
    mesh(G.cyl, lam(0x6b4a2b), 0, 0.5, 0, 0.05, 1.4, 0.05, stick);                // gậy
    const torch = pivot(armL, 0, -0.62, 0.12);
    mesh(G.cyl, lam(0x222222), 0, 0, 0.12, 0.06, 0.3, 0.06, torch).rotation.x = Math.PI / 2;
    mesh(G.sph, basic(0xfff6c8), 0, 0, 0.28, 0.06, 0.06, 0.02, torch);
    return { group: g, body, head, armR, armL, stick, torch };
  },

  // Đống rơm: khối nón + bán cầu màu vàng rơm, sợi rơm vương quanh chân

  bone() {
    const g = new THREE.Group(), m = lam(0xf4ecd9, { emissive: 0x3a3428 });
    mesh(G.cyl, m, 0, 0, 0, 0.055, 0.55, 0.055, g).rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(G.sph, m, sx * 0.29, 0, sz * 0.06, 0.08, 0.08, 0.08, g);
    return g;
  },

  bush(seed) {
    const rng = mulberry32(seed), g = new THREE.Group(), greens = [0x1f4426, 0x285431, 0x1a3b21, 0x30603a];
    for (let i = 0; i < 7; i++) {
      const a = rng() * 6.28, d = rng() * 0.6, r = 0.55 + rng() * 0.45;
      mesh(G.ico, std(greens[i % 4], { roughness: 0.95 }), Math.cos(a) * d, 0.45 + rng() * 0.35, Math.sin(a) * d, r, r * 0.85, r, g);
    }
    for (let i = 0; i < 5; i++) { // quả mọng
      const a = rng() * 6.28;
      mesh(G.sph, lam(0x7a2fd0), Math.cos(a) * 0.9, 0.7 + rng() * 0.3, Math.sin(a) * 0.9, 0.06, 0.06, 0.06, g);
    }
    return g;
  },

  kennel() { // ổ chó gỗ mái đỏ, cửa quay về +z (xoay theo dữ liệu màn)
    const g = new THREE.Group(), wood = lam(0x8c6239), roof = lam(0x9b2c25), dark = basic(0x07080b);
    mesh(G.box, wood, 0, 0.75, 0, 2.0, 1.5, 2.0, g);
    const r = new THREE.CylinderGeometry(1, 1, 1, 3); r.rotateZ(Math.PI / 2); r.rotateX(Math.PI / 6);
    mesh(r, roof, 0, 1.85, 0, 2.3, 0.95, 1.55, g).rotation.y = Math.PI / 2;
    mesh(G.box, dark, 0, 0.55, 1.01, 0.85, 1.0, 0.04, g).castShadow = false;               // lỗ cửa tối
    mesh(G.cyl, dark, 0, 1.05, 1.01, 0.43, 0.04, 0.43, g).rotation.x = Math.PI / 2;
    mesh(G.box, lam(0xe8d9b0), 0, 1.75, 1.05, 0.9, 0.24, 0.04, g);                         // bảng tên
    mesh(G.cyl, lam(0xc0392b), 0.9, 0.08, 1.45, 0.28, 0.14, 0.28, g);                      // bát ăn
    return g;
  },

  chime() { // cột chuông gió: các ống kim loại lấp lánh treo dưới thanh ngang
    const g = new THREE.Group(), wood = lam(0x6e5236), chimeMetal = metal(0xcfe8ff, { emissive: 0x16303c, roughness: 0.22 });
    mesh(G.cyl, wood, 0, 1.3, 0, 0.06, 2.6, 0.06, g);
    mesh(G.box, wood, -0.35, 2.55, 0, 0.8, 0.06, 0.06, g);
    const tubes = new THREE.Group(); tubes.position.set(-0.35, 2.5, 0); g.add(tubes);
    [-0.3, -0.1, 0.1, 0.3].forEach((x, i) => mesh(G.cyl, chimeMetal, x, -0.3 - i * 0.06, 0, 0.025, 0.5 + i * 0.12, 0.025, tubes));
    g.userData.tubes = tubes;
    return g;
  },

  peel() {
    const g = new THREE.Group(), y = lam(0xf2d24a), b = lam(0x6b5a2a);
    for (let i = 0; i < 3; i++) {
      const m = mesh(G.sph, y, Math.cos(i * 2.1) * 0.14, 0.03, Math.sin(i * 2.1) * 0.14, 0.09, 0.025, 0.22, g);
      m.rotation.y = -i * 2.1;
    }
    mesh(G.cyl, b, 0, 0.04, 0, 0.04, 0.06, 0.04, g);
    return g;
  },

  bucket() {
    const g = new THREE.Group(), steel = metal(0x5e6570, { roughness: 0.5, envMapIntensity: 0.6 });
    const b = mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 14, 1, true), metal(0x555c66, { roughness: 0.55, envMapIntensity: 0.6, side: THREE.DoubleSide }), 0, 0.25, 0, 1, 1, 1, g);
    b.rotation.z = Math.PI / 2; b.position.y = 0.26;
    mesh(new THREE.TorusGeometry(0.28, 0.02, 4, 16), steel, 0.25, 0.26, 0, 1, 1, 1, g).rotation.y = Math.PI / 2;
    return g;
  },

  branches() {
    const g = new THREE.Group(), wood = lam(0x5a4632);
    for (let i = 0; i < 6; i++) {
      const m = mesh(G.cyl, wood, (i - 2.5) * 0.08, 0.05 + (i % 2) * 0.05, 0, 0.035, 0.9 + (i % 3) * 0.2, 0.035, g);
      m.rotation.z = Math.PI / 2; m.rotation.y = (i - 2.5) * 0.45;
    }
    return g;
  },

  trap() {
    const g = new THREE.Group(), steel = metal(0x9aa1aa, { roughness: 0.4 });
    mesh(new THREE.TorusGeometry(0.36, 0.045, 6, 20), steel, 0, 0.06, 0, 1, 1, 1, g).rotation.x = Math.PI / 2;
    const jaws = [];
    for (const s of [-1, 1]) {
      const j = pivot(g, 0, 0.06, s * 0.02);
      for (let i = 0; i < 6; i++) mesh(G.cone, steel, -0.28 + i * 0.11, 0.1, s * 0.15, 0.04, 0.16, 0.04, j);
      jaws.push({ g: j, s });
    }
    mesh(G.cyl, lam(0x5a5f66), 0, 0.03, 0, 0.12, 0.05, 0.12, g);
    return { group: g, jaws };
  },
};

// Hàng rào gỗ: cột (InstancedMesh) + 2 thanh ngang. Chặn đường đi nhưng thấp nên không che tầm nhìn của chó.
export const FenceKit = {
  build(parent, lines) {
    const posts = [], wood = lam(0x6e5236);
    for (const [x1, z1, x2, z2] of lines) {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i <= n; i++) posts.push([lerp(x1, x2, i / n), lerp(z1, z2, i / n)]);
      for (const y of [0.55, 1.1]) mesh(G.box, wood, (x1 + x2) / 2, y, (z1 + z2) / 2, x1 === x2 ? 0.1 : len, 0.12, x1 === x2 ? len : 0.1, parent);
    }
    const im = new THREE.InstancedMesh(G.box, wood, posts.length), m4 = new THREE.Matrix4();
    posts.forEach(([x, z], i) => { m4.makeScale(0.22, 1.4, 0.22).setPosition(x, 0.7, z); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; parent.add(im);
  },
  solids(lines) {
    return lines.map(([x1, z1, x2, z2]) => Collision.aabb(Math.min(x1, x2) - 0.15, Math.max(x1, x2) + 0.15, Math.min(z1, z2) - 0.15, Math.max(z1, z2) + 0.15, false, 'fence'));
  },
};

// vật liệu thùng gỗ có vân (canvas), dùng chung cho mọi màn
let crateMaterial = null;
export function crateMat() {
  if (crateMaterial) return crateMaterial;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#7a5532'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#4a321c'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
  g.lineWidth = 9; g.beginPath(); g.moveTo(10, 10); g.lineTo(118, 118); g.moveTo(118, 10); g.lineTo(10, 118); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; for (let y = 20; y < 128; y += 22) { g.beginPath(); g.moveTo(8, y); g.lineTo(120, y); g.stroke(); }
  crateMaterial = new THREE.MeshStandardMaterial({ envMapIntensity: 0.45, map: new THREE.CanvasTexture(cv), roughness: 0.88 });
  return crateMaterial;
}

export const isSharedMaterial = (m) => m === crateMaterial;
