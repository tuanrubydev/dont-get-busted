import { THREE } from './three.js';
import { clamp } from './utils.js';

/* ============================ Highlighter ============================
 * Viền sáng quanh vật có thể tương tác (< 1.8 m): mỗi khối của vật được nhân bản thành một lớp vỏ
 * mặt sau, phình ra theo pháp tuyến vài cm (kỹ thuật "inverted hull"). Với vật cản để trèo
 * (hàng rào, thùng...) thì vẽ khung hộp phát sáng theo đúng kích thước vùng va chạm.
 * ==================================================================== */
export class Highlighter {
  constructor(scene) {
    this.scene = scene; this.cache = new Map(); this.cur = null; this.anchor = new THREE.Vector3(); this.has = false;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffd27a) }, uTime: { value: 0 }, uThick: { value: 0.035 } },
      vertexShader: 'uniform float uThick;\nvoid main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); mv.xyz += n * uThick; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uTime;\nvoid main(){ gl_FragColor = vec4(uColor, 0.72 + 0.25 * sin(uTime * 6.0)); }',
      side: THREE.BackSide, transparent: true, depthWrite: false,
    });
    this.mat.userData.keep = true; // dùng chung giữa các màn: không giải phóng khi dọn màn
    const bg = new THREE.BoxGeometry(1, 1, 1);
    this.frame = new THREE.Group();
    this.frame.add(new THREE.LineSegments(new THREE.EdgesGeometry(bg), new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 })));
    this.frame.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.frame.visible = false; scene.add(this.frame);
    this._box = new THREE.Box3();
  }
  shells(obj) {
    if (this.cache.has(obj)) return this.cache.get(obj);
    const list = [];
    obj.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.userData.shell || !m.geometry || !m.geometry.attributes.normal) return;
      const s = new THREE.Mesh(m.geometry, this.mat); s.userData.shell = true; s.renderOrder = 2; s.castShadow = false;
      s.visible = false; m.add(s); list.push(s);
    });
    this.cache.set(obj, list);
    return list;
  }
  set(target) {
    if (target === this.cur) return;
    if (this.cur && this.cache.has(this.cur)) for (const s of this.cache.get(this.cur)) s.visible = false;
    this.frame.visible = false; this.cur = target; this.has = !!target;
    if (!target) return;
    if (target.minX !== undefined) { this.frame.visible = true; return; }
    for (const s of this.shells(target)) s.visible = true;
  }
  clear() { this.set(null); this.cache.clear(); }
  update(time) {
    this.mat.uniforms.uTime.value = time;
    const t = this.cur; if (!t) return;
    if (t.minX !== undefined) {
      const hh = t.h || (t.kind === 'crate' ? t.maxX - t.minX : { fence: 1.4, yard: 0.85, pile: 1.0, low: 0.5 }[t.kind] || 1);
      this.frame.position.set((t.minX + t.maxX) / 2, hh / 2, (t.minZ + t.maxZ) / 2);
      this.frame.scale.set(t.maxX - t.minX + 0.06, hh + 0.06, t.maxZ - t.minZ + 0.06);
      const p = this.player;
      this.anchor.set(clamp(p.x, t.minX, t.maxX), hh + 0.55, clamp(p.z, t.minZ, t.maxZ));
    } else {
      this._box.setFromObject(t);
      this.anchor.set((this._box.min.x + this._box.max.x) / 2, this._box.max.y + 0.45, (this._box.min.z + this._box.max.z) / 2);
    }
  }
}
