/* Hiệu ứng: vòng tiếng động, chữ nổi, bụi, khói pháo sáng, mũi tên, pháo hoa, tia lấp lánh. */
import { THREE } from './three.js';
import { G, mesh, lam, metal } from './Models.js';
import { Sfx } from './AudioManager.js';

export class FX {
  constructor(game) {
    this.game = game; this.items = []; this.labels = []; this.parts = []; this.layer = document.getElementById('labels');
    this.ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
  }
  ring(x, z, radius, color, life = 0.8, opacity = 0.7) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.position.set(x, 0.09, z); this.game.world.scene.add(m);
    this.items.push({ m, t: 0, life, radius, opacity });
  }
  // chữ nổi bám theo một vật (obj có x, z) hoặc một điểm cố định
  pop(anchor, text, cls, life = 1.2, height = 2.4) {
    const el = document.createElement('div'); el.className = 'lbl ' + cls; el.textContent = text;
    this.layer.appendChild(el);
    const l = { el, anchor, t: 0, life, height, rise: cls !== 'eat' };
    this.labels.push(l); return l;
  }
  // phần tử hiệu ứng chung: obj gắn vào parent, step(it, dt, k) gọi mỗi khung, k = t/life
  add(obj, life, step, parent) {
    (parent || this.game.world.scene).add(obj);
    const it = { obj, t: 0, life, step, parent: parent || this.game.world.scene };
    this.parts.push(it); return it;
  }
  sprite(color, opacity, additive) {
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: this.game.world.glowTex(), color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  }
  // bụi đất tung lên (hố sập, đá rơi)
  dust(x, z, color, n) {
    for (let i = 0; i < n; i++) {
      const s = this.sprite(color, 0.6), a = Math.random() * 6.28, sp = 0.6 + Math.random() * 1.6;
      s.position.set(x + Math.cos(a) * 0.3, 0.2, z + Math.sin(a) * 0.3);
      const v = { x: Math.cos(a) * sp, y: 0.6 + Math.random() * 1.4, z: Math.sin(a) * sp }, s0 = 0.5 + Math.random() * 0.5;
      this.add(s, 0.9 + Math.random() * 0.8, (it, dt, k) => {
        s.position.x += v.x * dt; s.position.y += v.y * dt; s.position.z += v.z * dt; v.y -= dt * 1.2; v.x *= 0.96; v.z *= 0.96;
        s.scale.setScalar(s0 + k * 1.8); s.material.opacity = 0.6 * (1 - k);
      });
    }
  }
  // khói màu bốc lên từ pháo sáng
  smoke(x, y, z) {
    const s = this.sprite([0xff6a5a, 0xff9a8a, 0xd8404a][Math.floor(Math.random() * 3)], 0.55);
    s.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
    const drift = (Math.random() - 0.5) * 0.6;
    this.add(s, 3.2, (it, dt, k) => { s.position.y += dt * (0.8 - k * 0.5); s.position.x += drift * dt; s.scale.setScalar(0.8 + k * 3.2); s.material.opacity = 0.5 * (1 - k); });
  }
  // mũi tên từ nỏ giấu bên đường bay tới, găm xuống đất (giữ lại tới hết màn)
  arrow(from, to) {
    const g = new THREE.Group(), wood = lam(0x8a6a3e), steel = metal(0xb0b8c0), red = lam(0xc0392b);
    mesh(G.cyl, wood, 0, 0, 0, 0.022, 0.8, 0.022, g).rotation.x = Math.PI / 2;
    mesh(G.cone, steel, 0, 0, 0.46, 0.05, 0.14, 0.05, g).rotation.x = Math.PI / 2;
    for (const r of [0, Math.PI / 2]) { const f = mesh(G.box, red, 0, 0, -0.34, 0.01, 0.11, 0.14, g); f.rotation.z = r; }
    const A = new THREE.Vector3(from.x, 0.75, from.z), B = new THREE.Vector3(to.x, 0.12, to.z);
    g.position.copy(A); g.lookAt(B);
    const root = this.game.level.root;
    this.add(g, 0.18, (it, dt, k) => { g.position.lerpVectors(A, B, k); if (k >= 1) { this.dust(to.x, to.z, 0x6b5a40, 5); } }, root).keep = true;
  }
  // pháo hoa ăn mừng: một chùm hạt sáng nổ tung rồi rơi xuống
  firework(x, y, z) {
    const n = 70, pos = new Float32Array(n * 3), vel = [];
    const color = [0xffd166, 0xff6b9a, 0x7ee0a1, 0x8fd3ff, 0xffffff, 0xff9f43][Math.floor(Math.random() * 6)];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const u = Math.random() * 2 - 1, a = Math.random() * 6.28, r = Math.sqrt(1 - u * u), sp = 5 + Math.random() * 3;
      vel.push([Math.cos(a) * r * sp, u * sp, Math.sin(a) * r * sp]);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.5, map: this.game.world.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pts.frustumCulled = false;
    this.add(pts, 1.8, (it, dt, k) => {
      const p = geo.attributes.position;
      for (let i = 0; i < n; i++) { const v = vel[i]; v[1] -= dt * 4.5; v[0] *= 0.97; v[1] *= 0.97; v[2] *= 0.97; p.setXYZ(i, p.getX(i) + v[0] * dt, p.getY(i) + v[1] * dt, p.getZ(i) + v[2] * dt); }
      p.needsUpdate = true; pts.material.opacity = 1 - k * k; pts.material.size = 0.5 * (1 - k * 0.5);
    });
    Sfx.play('firework');
  }
  // tia lấp lánh bay lên quanh một điểm
  sparkle(x, z, n) {
    for (let i = 0; i < n; i++) {
      const s = this.sprite([0xffe27a, 0xffffff, 0x9cffc0][i % 3], 1, true), a = Math.random() * 6.28, r = Math.random() * 1.6;
      s.position.set(x + Math.cos(a) * r, 0.3 + Math.random() * 1.5, z + Math.sin(a) * r);
      const vy = 0.8 + Math.random() * 1.8, ph = Math.random() * 6;
      this.add(s, 1.2 + Math.random(), (it, dt, k) => { s.position.y += vy * dt; s.scale.setScalar(0.35 * (1 - k) * (0.6 + Math.abs(Math.sin(it.t * 14 + ph)))); });
    }
  }
  clear() {
    for (const it of this.items) { this.game.world.scene.remove(it.m); it.m.material.dispose(); }
    this.items = [];
    for (const it of this.parts) { it.parent.remove(it.obj); if (it.obj.material && it.obj.material.dispose) it.obj.material.dispose(); }
    this.parts = [];
    for (const l of this.labels) l.el.remove();
    this.labels = [];
  }
  update(dt, camera, w, h) {
    this.items = this.items.filter((it) => {
      it.t += dt; const k = it.t / it.life;
      if (k >= 1) { this.game.world.scene.remove(it.m); it.m.material.dispose(); return false; }
      it.m.scale.setScalar(0.3 + it.radius * k); it.m.material.opacity = it.opacity * (1 - k);
      return true;
    });
    this.parts = this.parts.filter((it) => {
      if (it.done) return true;
      it.t += dt; const k = Math.min(1, it.t / it.life);
      it.step(it, dt, k);
      if (k < 1) return true;
      if (it.keep) { it.done = true; return true; }
      it.parent.remove(it.obj);
      if (it.obj.material && it.obj.material.dispose) it.obj.material.dispose();
      if (it.obj.geometry && !Object.values(G).includes(it.obj.geometry)) it.obj.geometry.dispose();
      return false;
    });
    const v = new THREE.Vector3();
    this.labels = this.labels.filter((l) => {
      l.t += dt;
      if (l.t >= l.life) { l.el.remove(); return false; }
      this.place(l.el, l.anchor.x, l.height + (l.rise ? l.t * 1.2 : 0), l.anchor.z, camera, w, h, v);
      l.el.style.opacity = l.t > l.life - 0.3 ? (l.life - l.t) / 0.3 : 1;
      return true;
    });
  }
  place(el, x, y, z, camera, w, h, v) {
    v.set(x, y, z).project(camera);
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = ((v.x + 1) / 2) * w + 'px';
    el.style.top = ((1 - v.y) / 2) * h + 'px';
  }
}
