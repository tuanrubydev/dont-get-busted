/* =====================================================================
 * InputManager — bàn phím + cảm ứng.
 *   Phím: W A S D (↑↓) di chuyển · Shift chạy · C khom (Shift+C khi chạy: trượt) · Z bò · Space nhảy/trèo
 *         E tương tác (giữ: ngắm ném) · Q hủy ngắm · R chơi lại · H bảng phím · ←/→ xoay camera
 *   Cảm ứng (điện thoại/máy tính bảng): cần điều khiển ảo bên trái, vuốt nửa phải để nhìn quanh, các nút hành động.
 *   (Chuột & Pointer Lock do CameraManager xử lý.)
 * ===================================================================== */
import { Sfx } from './AudioManager.js';

export class InputManager {
  constructor(game) {
    this.keys = new Set(); this.game = game;
    this.stick = { x: 0, z: 0, active: false }; this.touchRun = false;
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['input', 'textarea'].includes((e.target.tagName || '').toLowerCase())) return;
      Sfx.init();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && (game.state === 'play' || e.target.tagName !== 'BUTTON')) e.preventDefault();
      if (!e.repeat) this.onKey(k, e.shiftKey);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'e' && game.state === 'play') game.releaseInteract();
    });
    window.addEventListener('blur', () => { this.keys.clear(); });
    this.setupTouch();
  }

  onKey(k, shift) {
    const game = this.game, play = game.state === 'play';
    if (k === 'e' && play) game.pressInteract();
    if (k === ' ' && play) game.jump();
    if (k === 'c' && play && !(shift && game.slide())) game.toggleStance('crouch'); // Shift + C khi đang chạy: trượt dài
    if (k === 'z' && play) game.toggleStance('prone');
    if (k === 'h') document.body.classList.toggle('show-help');
    if (k === 'q' && play) game.cancelAim();
    if (k === 'r' && ['play', 'result', 'cinematicover', 'winover'].includes(game.state)) game.restartLevel();
    if (k === 'enter' && game.state === 'intro') game.startLevel();
    if (k === 'escape' && game.state === 'leaderboard') game.closeLeaderboard();
  }

  has(...ks) { return ks.some((k) => this.keys.has(k)); }
  get run() { return this.has('shift') || this.touchRun; }
  // trục thô theo camera: axisX > 0 = bước ngang sang trái màn hình, axisZ > 0 = tiến về phía camera đang nhìn
  get axisX() { return this.stick.active ? this.stick.x : (this.has('a') ? 1 : 0) - (this.has('d') ? 1 : 0); }
  get axisZ() { return this.stick.active ? this.stick.z : (this.has('w', 'arrowup') ? 1 : 0) - (this.has('s', 'arrowdown') ? 1 : 0); }
  // mũi tên trái/phải: xoay camera bằng bàn phím (không cần chuột)
  get turn() { return (this.has('arrowleft') ? 1 : 0) - (this.has('arrowright') ? 1 : 0); }

  /* ---------- điều khiển cảm ứng ---------- */
  setupTouch() {
    const root = document.getElementById('touch');
    if (!root || !window.matchMedia('(pointer: coarse)').matches) return;
    document.body.classList.add('touch');
    const game = this.game, pad = document.getElementById('tStick'), knob = document.getElementById('tKnob'), look = document.getElementById('tLook');
    let stickId = null, ox = 0, oy = 0, lookId = null, lx = 0, ly = 0;
    const R = 50;
    pad.addEventListener('touchstart', (e) => {
      Sfx.init(); const t = e.changedTouches[0]; stickId = t.identifier;
      const r = pad.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2;
      this.stick.active = true; e.preventDefault();
    }, { passive: false });
    const moveStick = (t) => {
      let dx = t.clientX - ox, dy = t.clientY - oy; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stick.x = -dx / R; this.stick.z = -dy / R;
    };
    look.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; e.preventDefault(); }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) moveStick(t);
        if (t.identifier === lookId) { game.cam.look(t.clientX - lx, t.clientY - ly, 0.006); lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.stick.active = false; this.stick.x = this.stick.z = 0; knob.style.transform = ''; }
        if (t.identifier === lookId) lookId = null;
      }
    });
    const btn = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); Sfx.init(); el.classList.add('on'); down(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); el.classList.remove('on'); if (up) up(); }, { passive: false });
    };
    btn('tE', () => game.state === 'play' && game.pressInteract(), () => game.state === 'play' && game.releaseInteract());
    btn('tJump', () => this.onKey(' ', false));
    btn('tCrouch', () => (this.touchRun && game.slide()) || this.onKey('c', false));
    btn('tProne', () => this.onKey('z', false));
    btn('tRun', () => { this.touchRun = !this.touchRun; document.getElementById('tRun').classList.toggle('lit', this.touchRun); });
  }
}

export { InputManager as Input };
