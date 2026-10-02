/* =====================================================================
 * InputManager — bàn phím + cảm ứng.
 *   Phím: W A S D (↑↓) di chuyển · Shift chạy · C hoặc chạm nhanh Ctrl: khom (Shift+C khi chạy: trượt) · Z bò · Space nhảy/trèo
 *         E tương tác (giữ: ngắm ném) · Q hủy ngắm · R chơi lại · H bảng phím · ←/→ xoay camera
 *   Cảm ứng (điện thoại / máy tính bảng — tự bật khi Device.mobile):
 *     • Cần gạt ảo bên trái: kéo 360°; độ kéo xa quyết định tốc độ — gần tâm: rón rén (không tiếng bước chân),
 *       giữa: đi thường, sát mép: chạy nhanh. Cần gạt "nổi": chạm chỗ nào ở nửa trái thì tâm cần gạt đặt ở đó.
 *     • Vuốt nửa màn hình bên phải: xoay camera TPS sát vai.
 *     • Cụm nút góc phải dưới: Khom/Bò (chạm đổi: đứng → khom → bò → đứng; khi đang chạy: trượt),
 *       Nhảy/Trèo, Ném (giữ: hiện đường cong parabol, kéo cần gạt lên/xuống chỉnh lực, vuốt phải để ngắm; thả: ném),
 *       Tương tác E (chỉ hiện khi có thứ để bắt / đẩy / chui / nhặt).
 *   (Chuột & Pointer Lock do CameraManager xử lý.)
 * ===================================================================== */
import { Sfx } from './AudioManager.js';
import { Device } from './Device.js';

export class InputManager {
  constructor(game) {
    this.keys = new Set(); this.game = game;
    this.stick = { x: 0, z: 0, mag: 0, active: false }; this.touchRun = false;
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['input', 'textarea'].includes((e.target.tagName || '').toLowerCase())) return;
      Sfx.init();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && (game.state === 'play' || e.target.tagName !== 'BUTTON')) e.preventDefault();
      if (!e.repeat) this.onKey(k, e.shiftKey);
      // Ctrl: chỉ tính là "khom" khi chạm nhả riêng phím Ctrl (không kèm phím khác), để Ctrl+phím tắt khác không đổi tư thế
      if (k === 'control') { if (!e.repeat) this.ctrlTap = true; } else this.ctrlTap = false;
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'control' && this.ctrlTap && game.state === 'play') { this.ctrlTap = false; game.toggleStance('crouch'); }
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
  // chạy: Shift, hoặc kéo cần gạt ảo sát mép (≥ 88%)
  get run() { return this.has('shift') || this.touchRun || (this.stick.active && this.stick.mag >= 0.88); }
  // hệ số tốc độ đi analog: kéo cần gạt nhẹ (< 50%) = đi rón rén, chậm và không phát tiếng bước chân
  get analog() { return this.stick.active && this.stick.mag < 0.5 ? 0.5 : 1; }
  // trục thô theo camera: axisX > 0 = bước ngang sang trái màn hình, axisZ > 0 = tiến về phía camera đang nhìn
  get axisX() { return this.stick.active ? this.stick.x : (this.has('a') ? 1 : 0) - (this.has('d') ? 1 : 0); }
  get axisZ() { return this.stick.active ? this.stick.z : (this.has('w', 'arrowup') ? 1 : 0) - (this.has('s', 'arrowdown') ? 1 : 0); }
  // mũi tên trái/phải: xoay camera bằng bàn phím (không cần chuột)
  get turn() { return (this.has('arrowleft') ? 1 : 0) - (this.has('arrowright') ? 1 : 0); }

  /* ---------------------------- điều khiển cảm ứng ---------------------------- */
  setupTouch() {
    const root = document.getElementById('touch');
    if (!root || !Device.mobile) return;
    this.touch = true;
    document.body.classList.add('touch');
    const game = this.game, $ = (id) => document.getElementById(id);
    const zone = $('tMoveZone'), pad = $('tStick'), knob = $('tKnob'), look = $('tLook');
    this.el = { e: $('tE'), eLabel: $('tELabel'), thr: $('tThrow'), stance: $('tStance'), stanceLabel: $('tStanceLabel'), jump: $('tJump'), jumpLabel: $('tJumpLabel') };
    let stickId = null, ox = 0, oy = 0, lookId = null, lx = 0, ly = 0;
    const R = 56; // bán kính kéo tối đa của cần gạt (px)

    // --- cần gạt nổi bên trái ---
    const placePad = (x, y) => { pad.style.left = `${x - pad.offsetWidth / 2}px`; pad.style.top = `${y - pad.offsetHeight / 2}px`; pad.style.bottom = 'auto'; };
    const resetPad = () => { pad.style.left = ''; pad.style.top = ''; pad.style.bottom = ''; knob.style.transform = ''; pad.classList.remove('on', 'run', 'sneak'); };
    const moveStick = (t) => {
      let dx = t.clientX - ox, dy = t.clientY - oy; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const mag = Math.min(1, d / R), live = mag >= 0.12; // vùng chết 12% quanh tâm: tránh trôi khi chỉ đặt ngón tay
      this.stick.mag = live ? mag : 0;
      this.stick.x = live ? -dx / R : 0; this.stick.z = live ? -dy / R : 0;
      pad.classList.toggle('run', this.stick.mag >= 0.88); pad.classList.toggle('sneak', this.stick.mag > 0 && this.stick.mag < 0.5);
    };
    zone.addEventListener('touchstart', (e) => {
      if (stickId !== null) return;
      Sfx.init(); const t = e.changedTouches[0]; stickId = t.identifier;
      placePad(t.clientX, t.clientY); ox = t.clientX; oy = t.clientY;
      this.stick.active = true; this.stick.x = this.stick.z = this.stick.mag = 0; pad.classList.add('on');
      e.preventDefault();
    }, { passive: false });

    // --- vuốt nửa phải: xoay camera ---
    look.addEventListener('touchstart', (e) => {
      if (lookId !== null) return;
      const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) moveStick(t);
        else if (t.identifier === lookId) { game.cam.look(t.clientX - lx, t.clientY - ly, 0.0065); lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.stick.active = false; this.stick.x = this.stick.z = this.stick.mag = 0; resetPad(); }
        if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);

    // --- nút hành động ---
    // nút vẫn cho kéo ngón sang để xoay camera tiếp (như game di động thường làm): ngón đè nút cũng là ngón "nhìn"
    const btn = (el, down, up) => {
      let id = null;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation(); Sfx.init();
        const t = e.changedTouches[0]; id = t.identifier;
        if (lookId === null) { lookId = id; lx = t.clientX; ly = t.clientY; }
        el.classList.add('on'); down();
      }, { passive: false });
      const release = (e) => {
        for (const t of e.changedTouches) if (t.identifier === id) {
          e.preventDefault(); el.classList.remove('on'); id = null;
          if (lookId === t.identifier) lookId = null;
          if (up) up();
        }
      };
      el.addEventListener('touchend', release, { passive: false }); el.addEventListener('touchcancel', release, { passive: false });
    };
    const play = () => game.state === 'play';
    // E: hành động theo ngữ cảnh (bắt gà, đẩy rơm, chui lỗ, nhặt đồ...) — chạm nhanh
    btn(this.el.e, () => { if (!play()) return; const a = game.availableAction(); const real = a && a.type === 'throw' ? a.tap : a; if (real) game.doAction(real); });
    // Ném: giữ để hiện quỹ đạo parabol & căn lực, thả để ném
    btn(this.el.thr, () => { if (play() && game.canThrow()) game.beginAim(); }, () => { if (play() && game.aiming) game.throwItem(); });
    btn(this.el.jump, () => this.onKey(' ', false));
    // Khom / Bò: đứng → khom → bò → đứng; đang chạy thì trượt dài
    btn(this.el.stance, () => {
      if (!play()) return;
      if (this.run && game.slide()) return;
      const st = game.player.stance;
      game.toggleStance(st === 'stand' ? 'crouch' : 'prone'); // khom→bò; bò→đứng
    });
    // nút huỷ ngắm (hiện khi đang ngắm)
    const cancel = $('tCancel'); if (cancel) btn(cancel, () => play() && game.cancelAim());
    // chạm nút bắt đầu nhiệm vụ: vào toàn màn hình + khoá xoay ngang (nếu trình duyệt cho phép)
    document.addEventListener('click', (e) => { if (e.target.closest('#startBtn, #retryBtn, #winNextBtn, .mcard')) Device.enterImmersive(); });
  }

  // cập nhật nút cảm ứng theo ngữ cảnh mỗi khung hình (gọi từ vòng lặp chính)
  updateTouchUI(game) {
    if (!this.touch) return;
    const E = this.el, p = game.player, play = game.state === 'play';
    document.body.classList.toggle('touch-play', play);
    if (!play || !p) return;
    const a = game.availableAction(), real = a && a.type === 'throw' ? a.tap : (a && a.type !== 'aiming' ? a : null);
    const show = (el, on) => { if (el.hidden === on) el.hidden = !on; };
    show(E.e, !!real && !game.aiming);
    if (real) { const t = (real.label || 'Tương tác').replace(/^\[?E\]?\s*[:·-]?\s*/i, ''); if (E.eLabel.textContent !== t) E.eLabel.textContent = t; }
    show(E.thr, game.canThrow() || !!game.aiming);
    E.thr.classList.toggle('lit', !!game.aiming);
    document.body.classList.toggle('t-aiming', !!game.aiming);
    const sl = p.stance === 'stand' ? 'Khom' : p.stance === 'crouch' ? 'Bò' : 'Đứng';
    if (E.stanceLabel.textContent !== sl) E.stanceLabel.textContent = sl;
    E.stance.classList.toggle('lit', p.stance !== 'stand');
    const jl = p.stance === 'stand' && game.vaultTarget() ? 'Trèo' : 'Nhảy';
    if (E.jumpLabel.textContent !== jl) E.jumpLabel.textContent = jl;
  }
}

export { InputManager as Input };
