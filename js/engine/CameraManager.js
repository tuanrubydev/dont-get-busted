/* =====================================================================
 * CameraManager — camera góc nhìn thứ 3 sát vai phải (kiểu game bắn súng), FOV 55°.
 *   Chuột: bấm vào màn chơi để khóa con trỏ (Pointer Lock), rê để nhìn quanh, Esc để thả;
 *          hoặc giữ chuột kéo; cuộn để kéo camera gần/xa (khi đang ngắm: chỉnh lực ném).
 *   Tự rút ngắn khi sát tường, hạ thấp khi khom/bò; rung màn hình (shake), zoom FOV mượt.
 *   Chế độ khác: bay vòng ở màn hình chính, lùi xa ăn mừng khi thắng, cảnh cắt do màn chơi điều khiển.
 * ===================================================================== */
import { THREE } from './three.js';
import { CFG } from '../config.js';
import { clamp, lerp, turnTo, Collision } from './utils.js';
import { Sfx } from './AudioManager.js';

export class CameraManager {
  constructor(game) {
    this.game = game; this.camera = game.world.camera;
    this.yaw = 0; this.pitch = CFG.camera.pitch; this.dist = CFG.camera.dist; this.cur = this.dist;
    this.pos = null; this.locked = false; this.drag = null;
    const cv = game.world.renderer.domElement; this.cv = cv;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      Sfx.init();
      if (e.pointerType === 'touch') return;
      if (game.state === 'play' && !this.locked && cv.requestPointerLock) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* trình duyệt chặn */ } }
      this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => { this.drag = null; });
    document.addEventListener('mousemove', (e) => { if (this.locked && game.state === 'play') this.look(e.movementX || 0, e.movementY || 0, CFG.camera.sens); });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.locked || !['play', 'busted', 'intro'].includes(game.state)) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag = { x: e.clientX, y: e.clientY };
      this.look(dx, dy, CFG.camera.dragSpeed);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv;
      document.body.classList.toggle('mouse-locked', this.locked);
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (game.aiming) { game.aiming.dist = clamp(game.aiming.dist + (e.deltaY > 0 ? -1 : 1) * 1.2, CFG.throwMin, CFG.throwMax); return; }
      this.dist = clamp(this.dist * (e.deltaY > 0 ? 1.1 : 0.9), CFG.camera.minDist, CFG.camera.maxDist);
    }, { passive: false });
  }

  look(dx, dy, k) {
    const C = CFG.camera;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch + dy * k * 0.8, C.minPitch, C.maxPitch);
  }
  release() { if (this.locked && document.exitPointerLock) document.exitPointerLock(); this.drag = null; }
  reset() {
    this.yaw = 0; this.pitch = CFG.camera.pitch; this.cur = this.dist; this.pos = null;
    this.camera.fov = CFG.camera.fov; this.camera.updateProjectionMatrix();
  }

  /* ---------- tiện ích cho cảnh cắt của màn chơi ---------- */
  moveTo(v, k) { if (!this.pos) this.pos = v.clone(); this.pos.lerp(v, Math.min(1, k)); this.camera.position.copy(this.pos); this.applyShake(); }
  lookAt(v) { this.camera.lookAt(v); }
  setFov(f, k) {
    const cam = this.camera;
    if (Math.abs(cam.fov - f) < 0.01) return;
    cam.fov = lerp(cam.fov, f, Math.min(1, k));
    cam.updateProjectionMatrix();
  }
  applyShake() {
    const s = this.game.camShake;
    if (s > 0) this.camera.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(s * 0.5));
  }

  update(dt) {
    const g = this.game, cam = this.camera, p = g.player, fog = g.world.scene.fog, L = g.level;
    const fov = CFG.camera.fov;
    if (g.state === 'title') {
      const a = g.time * 0.06, O = L.titleOrbit;
      cam.position.set(Math.sin(a) * O.r, O.h, Math.cos(a) * O.r);
      cam.lookAt(0, 0, 0);
      fog.density = CFG.fog.title;
      this.setFov(fov, 1);
      return;
    }
    fog.density = CFG.fog.play;
    g.camShake = Math.max(0, g.camShake - dt);
    if ((g.state === 'cinematic' || g.state === 'cinematicover') && L.cinematicCamera(this, dt)) return;
    if (g.state === 'victory' || g.state === 'winover') {
      // ăn mừng: lùi xa, ngước lên ngắm pháo hoa
      this.yaw = turnTo(this.yaw, L.exit.dir + 0.5, dt * 1.2);
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      this.moveTo(new THREE.Vector3(p.x - fx * 9, 4.2, p.z - fz * 9), dt * 2.5);
      cam.lookAt(p.x + fx * 2.5, 3.2, p.z + fz * 2.5);
      this.setFov(fov, dt * 4);
      return;
    }
    // góc nhìn sau vai: camera sát lưng, lệch vai phải, ngang tầm mắt (hạ thấp khi khom / bò, nâng khi nhảy)
    const K = CFG.camera, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), cp = Math.cos(this.pitch), spt = Math.sin(this.pitch);
    const rx = -fz, rz = fx;                                      // vector sang phải màn hình
    const head = (p.eyeHeight !== undefined ? p.eyeHeight : K.height) + (p.sink || 0) * 0.6;
    // tránh camera xuyên tường / nhà: rút ngắn khoảng cách nếu có vật che giữa vai và camera
    const sight = L.solids;
    let sh = K.shoulder;
    const shBlock = Collision.rayCast(p.x, p.z, rx, rz, sh + 0.25, sight);
    if (shBlock < sh + 0.25) sh = Math.max(0, shBlock - 0.25);
    const ox = p.x + rx * sh, oz = p.z + rz * sh;
    const back = Collision.rayCast(ox, oz, -fx, -fz, this.dist * cp + 0.3, sight);
    const target = clamp(Math.min(this.dist, (back - 0.3) / Math.max(cp, 0.2)), 0.6, this.dist);
    this.cur = target < this.cur ? target : lerp(this.cur, target, Math.min(1, dt * 4));
    const d = this.cur;
    this.moveTo(new THREE.Vector3(ox - fx * cp * d, Math.max(0.35, head + spt * d), oz - fz * cp * d), dt * 22); // gần như cứng
    cam.lookAt(ox + fx * cp * 14, head - spt * 14, oz + fz * cp * 14);
    this.setFov(fov, dt * 4);
  }
}
