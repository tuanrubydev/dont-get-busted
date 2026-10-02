import { THREE } from './three.js';
import { CFG } from '../config.js';
import { lerp, Collision } from './utils.js';

/* ============================ Tầm nhìn giới hạn (Fog of War) ============================
 * Mỗi khung hình vẽ một "bản đồ nhìn thấy" từ trên xuống (canvas → texture):
 *   trắng = trong nón nhìn phía trước tên trộm và không bị che, đen = sau lưng / sau tường, nhà, bụi cây.
 * Mọi vật liệu trong cảnh được chèn thêm vài dòng shader: điểm nào rơi vào vùng đen thì bị phủ tối.
 * Nón tầm nhìn của chó cũng bị ẩn ở vùng tối (không nhìn xuyên tường được).
 * ======================================================================================== */
export class FogOfWar {
  constructor(game) {
    this.game = game;
    this.minX = -45; this.minZ = -60; this.w = 90; this.h = 120; this.ppm = 4;
    this.cv = document.createElement('canvas'); this.cv.width = this.w * this.ppm; this.cv.height = this.h * this.ppm;
    this.ctx = this.cv.getContext('2d');
    this.ctx.fillStyle = '#fff'; this.ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.uniforms = {
      uFowTex: { value: this.tex }, uFowMin: { value: new THREE.Vector2(this.minX, this.minZ) },
      uFowSize: { value: new THREE.Vector2(this.w, this.h) }, uFowDark: { value: CFG.view.dark }, uFowOn: { value: 0 },
    };
    this.on = 0; this.frameSkip = 0;
  }
  // chèn shader vào mọi vật liệu Standard (tối dần) và vật liệu nón tầm nhìn (mờ hẳn)
  patch(root) {
    const U = this.uniforms;
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || !m.userData) continue;
        if (m.userData.fow) continue;
        const alpha = !!m.userData.fowAlpha;
        if (!m.isMeshStandardMaterial && !alpha) continue;
        m.userData.fow = true;
        m.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, U);
          sh.vertexShader = 'varying vec2 vFowXZ;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec4 fowWP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fowWP = instanceMatrix * fowWP;
  #endif
  fowWP = modelMatrix * fowWP;
  vFowXZ = fowWP.xz;`);
          sh.fragmentShader = 'uniform sampler2D uFowTex;\nuniform vec2 uFowMin;\nuniform vec2 uFowSize;\nuniform float uFowDark;\nuniform float uFowOn;\nvarying vec2 vFowXZ;\n' +
            sh.fragmentShader.replace('#include <dithering_fragment>', `vec2 fowUV = ( vFowXZ - uFowMin ) / uFowSize;
  float fowV = texture2D( uFowTex, vec2( fowUV.x, 1.0 - fowUV.y ) ).r;
  fowV = mix( 1.0, fowV, uFowOn );
  ${alpha ? 'gl_FragColor.a *= fowV;' : 'gl_FragColor.rgb *= mix( uFowDark, 1.0, fowV );'}
  #include <dithering_fragment>`);
        };
        m.customProgramCacheKey = () => (alpha ? 'fowA' : 'fow');
        m.needsUpdate = true;
      }
    });
  }
  // tia nhìn 2D: vật cản che tầm nhìn (tường rơm, nhà, ổ chó, thùng...) + bụi cây
  ray(ox, oz, dx, dz, maxD, solids, bushes) {
    let d = Collision.rayCast(ox, oz, dx, dz, maxD, solids);
    for (const b of bushes) {
      const r = b.r * 0.85, fx = b.x - ox, fz = b.z - oz;
      if (fx * fx + fz * fz < r * r) continue;           // đang đứng trong bụi: không bị chính nó che
      const t = fx * dx + fz * dz; if (t < 0 || t > d) continue;
      const q = fx * fx + fz * fz - t * t; if (q > r * r) continue;
      d = Math.min(d, t - Math.sqrt(r * r - q));
    }
    return d;
  }
  update(dt, active) {
    const target = active ? 1 : 0;
    this.on = lerp(this.on, target, Math.min(1, dt * (active ? 3 : 6)));
    this.uniforms.uFowOn.value = this.on;
    if (this.on < 0.01 || (this.frameSkip = (this.frameSkip + 1) % 2)) return; // vẽ lại 30 lần/giây là đủ
    const g = this.game, p = g.player, L = g.level, V = CFG.view, c = this.ctx, S = this.ppm;
    const X = (x) => (x - this.minX) * S, Z = (z) => (z - this.minZ) * S;
    c.filter = 'none';
    c.fillStyle = '#000'; c.fillRect(0, 0, this.cv.width, this.cv.height);
    try { c.filter = 'blur(5px)'; } catch (_) { /* trình duyệt không hỗ trợ: mép cứng */ }
    c.fillStyle = '#fff';
    const yaw = g.cam.yaw, half = (V.fov * Math.PI) / 360, n = 96, solids = L.solids, bushes = L.bushes;
    c.beginPath(); c.moveTo(X(p.x), Z(p.z));
    for (let i = 0; i <= n; i++) {
      const a = yaw - half + (2 * half * i) / n, dx = Math.sin(a), dz = Math.cos(a);
      const d = Math.min(V.range, this.ray(p.x, p.z, dx, dz, V.range, solids, bushes) + 0.9); // +0.9: mặt vật che vẫn sáng
      c.lineTo(X(p.x + dx * d), Z(p.z + dz * d));
    }
    c.closePath(); c.fill();
    c.beginPath(); c.arc(X(p.x), Z(p.z), V.near * S, 0, Math.PI * 2); c.fill();
    c.filter = 'none';
    this.tex.needsUpdate = true;
  }
}
