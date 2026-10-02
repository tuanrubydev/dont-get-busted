/* =====================================================================
 * DON'T GET BUSTED! 3D — điểm khởi chạy (entry point)
 * Game: khởi tạo cảnh, vòng lặp chính, luồng màn hình (menu → bảng nhiệm vụ → chơi → thắng/thua),
 * hệ thống tương tác chung (nhặt / ném / đẩy / trèo / nấp), tiếng động & phản ứng của lính canh, bẫy.
 * Mọi thứ riêng của từng màn được giao cho lớp Level tương ứng (js/levels/*) qua các hook của LevelBase.
 * ===================================================================== */
import { THREE } from './engine/three.js';
import { CFG, PROTECT } from './config.js';
import { clamp, turnTo, Collision, NavGrid } from './engine/utils.js';
import { World } from './engine/World.js';
import { CameraManager } from './engine/CameraManager.js';
import { Sfx } from './engine/AudioManager.js';
import { InputManager } from './engine/InputManager.js';
import { Guard, SafeStore } from './engine/Protection.js';
import { Board, SpeedrunTimer } from './engine/Leaderboard.js';
import { FX } from './engine/FX.js';
import { UI } from './engine/UI.js';
import { FogOfWar } from './engine/FogOfWar.js';
import { Highlighter } from './engine/Highlighter.js';
import { Minimap } from './engine/Minimap.js';
import { Player } from './core/Player.js';
import { Bone, ThrowArc, THROWABLES, Rock } from './core/Entities.js';
import { TrapSystem } from './core/TrapSystem.js';
import { LevelManager, REGISTRY, MISSIONS } from './core/LevelManager.js';
import { disposeTree } from './levels/LevelBase.js';

export class Game {
  constructor() {
    this.container = document.getElementById('game');
    this.world = new World(this.container);
    this.ui = new UI(this);
    this.fx = new FX(this);
    this.input = new InputManager(this);
    this.cam = new CameraManager(this);
    this.levels = new LevelManager(this);
    this.timer = new SpeedrunTimer();
    Board.configure(REGISTRY.map((C) => C.meta));
    this.flareLight = new THREE.PointLight(0xff3a2a, 0, 45, 1.6); this.world.scene.add(this.flareLight);
    this.state = 'title';
    this.time = 0; this.last = performance.now();
    this.camShake = 0;
    this.move = { axisX: 0, axisZ: 0, run: false };
    this.progress = this.loadProgress();
    this.dogLabels = new Map();
    this.throwMarker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.7, depthWrite: false }));
    this.world.scene.add(this.throwMarker);
    // đường quỹ đạo ném (chuỗi chấm sáng)
    const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3)); // nhiều điểm hơn cho quỹ đạo dài
    this.arc = new THREE.Points(arcGeo, new THREE.PointsMaterial({ color: 0xfff3c4, size: 0.22, map: this.world.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.arc.frustumCulled = false; this.arc.visible = false;
    this.world.scene.add(this.arc);
    this.fow = new FogOfWar(this);
    this.highlight = new Highlighter(this.world.scene);
    this.minimap = new Minimap(this);
    this.bindButtons();
    this.ui.renderMissions(this.progress);
    if (window.matchMedia('(pointer: coarse)').matches) document.getElementById('touchNote').hidden = false;
    // màn nền cho trang chủ
    this.loadLevel(0);
    this.ui.show('title');
    requestAnimationFrame((t) => this.frame(t));
  }

  loadProgress() {
    const ok = (p) => p && Array.isArray(p.stars) && (!p.best || p.best.every((t) => t === null || t >= CFG.minRunTime));
    const r = SafeStore.read('dgb-progress-v2');
    let p = r.data;
    if (r.tampered || (p && !ok(p))) { Board.tampered = true; p = null; }
    if (!p && !r.tampered) { const old = SafeStore.legacy('chicken-thief-progress'); if (ok(old)) p = old; }
    if (!p) p = { unlocked: 0, stars: [], best: [] };
    p.best = Array.isArray(p.best) ? p.best : [];
    SafeStore.write('dgb-progress-v2', p);
    return p;
  }
  saveProgress() { SafeStore.write('dgb-progress-v2', this.progress); }

  bindButtons() {
    const $ = (id) => document.getElementById(id);
    const on = (id, fn) => $(id).addEventListener('click', () => { Sfx.init(); fn(); });
    on('startBtn', () => this.startLevel());
    on('restartBtn', () => this.restartLevel());
    for (const id of ['retryBtn', 'bossRetryBtn', 'winRetryBtn']) on(id, () => this.restartLevel());
    for (const id of ['menuBtn1', 'menuBtn2', 'bossMenuBtn']) on(id, () => this.openMenu());
    // màn tiếp theo: mở bảng nhiệm vụ của màn kế (nếu có), hết màn thì về menu
    on('winNextBtn', () => { this.commitRun(); if (this.levelIndex + 1 < this.levels.count) this.openIntro(this.levelIndex + 1); else this.openMenu(true); });
    on('lbBtn', () => this.openLeaderboard());
    on('lbBtn2', () => this.openLeaderboard());
    on('lbBack', () => this.closeLeaderboard());
    $('nameForm').addEventListener('submit', (e) => { e.preventDefault(); this.commitRun($('nameInput').value); });
  }

  openMenu(next) {
    this.commitRun();
    this.state = 'title';
    this.ui.el.hud.hidden = true;
    this.ui.renderMissions(this.progress, next);
    const note = document.getElementById('titleNote');
    note.hidden = !next;
    if (next) note.textContent = 'Bạn đã hoàn thành tất cả nhiệm vụ hiện có. Nhiệm vụ mới đang được chuẩn bị, trong lúc chờ hãy thử phá kỷ lục!';
    this.ui.show('title');
  }

  openIntro(i) {
    this.loadLevel(i);
    this.state = 'intro';
    this.ui.el.hud.hidden = true;
    this.ui.showIntro(i);
  }

  openLeaderboard() {
    this.lbReturn = this.state;
    this.state = 'leaderboard';
    const mi = Math.max(0, MISSIONS.findIndex((m) => m.level === this.levelIndex));
    this.ui.showLeaderboard(mi);
  }

  closeLeaderboard() {
    if (this.lbReturn === 'intro') { this.state = 'intro'; this.ui.showIntro(this.levelIndex); }
    else this.openMenu();
  }

  loadLevel(i) {
    this.levelIndex = i;
    this.fx.clear();
    for (const l of this.dogLabels.values()) l.remove();
    this.dogLabels.clear();
    if (this.player) { this.world.scene.remove(this.player.rig.group); disposeTree(this.player.rig.group); }
    this.level = this.levels.loadLevel(i + 1);          // LevelManager đánh số màn từ 1
    this.player = new Player(this.world.scene, CFG.start.x, CFG.start.z);
    this.player.facing = 0;
    this.levelTime = 0; this.timer.reset(); this.spotted = 0; this.bustedT = 0;
    this.gotBone = false; this.aiming = null; this.pendingAim = null; this.trapHit = null; this.failCause = null;
    this.flareLight.intensity = 0;
    document.body.classList.remove('shake');
    this.ui.setLevel(i);
    this.camShake = 0; this.cam.reset();
    this.highlight.clear(); this.highlight.player = this.player;
    this.fow.patch(this.world.scene);
    this.minimap.found = false; this.minimap.pings = []; this.minimap.build();
  }

  startLevel() {
    this.state = 'play';
    this.ui.hideAll();
    this.ui.el.hud.hidden = false;
    this.ui.update(this, 0);
  }

  restartLevel() {
    this.commitRun();
    this.loadLevel(this.levelIndex);
    this.startLevel();
  }

  get inputLocked() { return this.state !== 'play' || !!this.aiming; }

  /* ---------- tương tác ---------- */
  availableAction() {
    const p = this.player, L = this.level;
    if (!p || p.stunT > 0 || this.state !== 'play' || p.vault || p.airborne) return null;
    if (this.aiming) return { type: 'aiming', label: 'Chuột/A-D: hướng · W/S, cuộn: lực · thả để ném · Q hủy' };
    const held = p.holding, thr = !!(held && held.throwable), what = held instanceof Bone ? 'xương' : held && held.conf ? held.conf.name : 'đá';
    const carrying = !!(held && held.target);
    const near = (o, r) => Math.hypot(o.x - p.x, o.z - p.z) < r;
    const item = [...L.bones.filter((b) => b.state === 'ground' && near(b, CFG.boneReach)), ...L.rocks.filter((r) => r.state === 'ground' && near(r, CFG.rockReach))]
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const dist = L.distractors.find((d) => near(d, d.kind === 'barrel' ? 1.5 : 1.8) && d.cool <= 0);
    const crate = !carrying && L.pushables.find((o) => near(o, o.half + 1.25));
    const bush = L.bushes.find((b) => near(b, b.r + 0.7));
    // hành động khi nhấn nhanh (theo thứ tự ưu tiên)
    let tap = null;
    const special = p.hidden ? null : L.interactions(p, near);      // hành động riêng của màn (bắt mục tiêu...)
    if (p.hidden) tap = { type: 'unhide', label: 'Ra khỏi bụi cây' };
    else if (special) tap = special;
    else if (item && item !== held && !carrying) tap = { type: 'pick', label: item instanceof Bone ? 'Trộm khúc xương' : 'Nhặt ' + item.conf.name, ref: item, focus: item.mesh };
    else if (dist) tap = { type: 'distract', label: dist.kind === 'barrel' ? 'Đá thùng phuy' : 'Rung hàng rào thép', ref: dist, focus: dist.group };
    else if (crate) tap = { type: 'shove', label: crate.kind === 'bin' ? 'Đẩy xe rác' : 'Đẩy thùng', ref: crate, focus: crate.group };
    else if (bush) tap = { type: 'hide', label: 'Chui vào bụi cây', ref: bush, focus: bush.group };
    if (!tap) { const v = this.vaultTarget(); if (v) tap = { type: 'vault', label: 'Trèo qua', ref: v, box: v.box }; }
    if (!tap && !thr && p.stance !== 'prone' && this.level.crawlGaps.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 1.6)) tap = { type: 'info', label: 'Bấm [Z] để nằm bò, chui qua lỗ dưới hàng rào', raw: true };
    if (thr) return { type: 'throw', tap, label: tap ? `Nhấn: ${tap.label.replace('Bấm [E] để ', '')} · Giữ: ngắm ném ${what}` : `Giữ để ngắm ném ${what}` };
    return tap;
  }

  jump() {
    const p = this.player;
    if (this.aiming || p.stunT > 0) return;
    if (p.hidden) { this.unhide(); return; }
    const v = p.stance === 'stand' ? this.vaultTarget() : null;
    if (v) { p.startVault(v); return; }        // sát vật cản thấp: Space = trèo qua
    p.jump(this);
  }

  slide() {
    const p = this.player;
    if (this.aiming || !p.running || !p.moving) return false;
    if (!p.startSlide(Math.atan2(p.vx, p.vz))) return false;
    this.emitNoise(p.x, p.z, CFG.noise.slide, 'slide');
    return true;
  }

  // đá thùng phuy / rung lưới thép: tiếng động giả ngay tại chỗ vật đó
  distract(d) {
    if (d.cool > 0) return;
    d.cool = 5; d.wob = 1;
    if (d.kind === 'barrel') { Sfx.play('clang', true); this.fx.pop(d, 'BÙM!', 'clang', 1.2, 1.8); }
    else { Sfx.play('rattle'); this.fx.pop(d, 'LOẢNG XOẢNG!', 'clang', 1.2, 2.4); }
    this.emitNoise(d.x, d.z, CFG.noise.distract, 'distract');
  }

  // tiếng ken két khi đẩy thùng (chó ở gần nghe thấy)
  onPushScrape(o, dt) {
    o.scrapeT = (o.scrapeT || 0) - dt;
    if (o.scrapeT <= 0) { o.scrapeT = 0.7; Sfx.play('scrape'); this.emitNoise(o.x, o.z, CFG.noise.push, 'push'); }
    this.level.navDirty = 0.6;
  }

  // C: khom ⇄ đứng · Z: bò ⇄ đứng
  toggleStance(s) {
    const p = this.player;
    if (p.hidden || p.stunT > 0 || p.vault) return;
    p.setStance(p.stance === s ? 'stand' : s, this);
  }

  // hàng rào gỗ thấp (trong trang trại, rào sân gà) ngay trước mặt: trả về điểm tiếp đất bên kia nếu trèo được
  // Vật cản thấp (< 1.5 m) ngay trước mặt: hàng rào gỗ, rào sân gà, đống củi/thùng phuy, thùng gỗ, xe kéo, khúc gỗ.
  // Trả về điểm tiếp đất bên kia nếu trèo được (dò bằng tia theo hướng nhìn + kiểm tra chỗ đáp trống).
  vaultTarget() {
    const p = this.player, R = CFG.player.vaultReach;
    if (!p.grounded || p.stance === 'prone' || p.hidden || p.slide) return null;
    const fx = Math.sin(this.cam.yaw), fz = Math.cos(this.cam.yaw);
    const H = { fence: 1.4, yard: 0.85, pile: 1.0, low: 0.5 };
    let best = null;
    for (const b of this.level.solids) {
      const hgt = b.h || (b.kind === 'crate' ? b.maxX - b.minX : H[b.kind]);
      if (!hgt || hgt > 1.5) continue;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      let tx, tz, gap, dot;
      if (p.x > b.minX + 0.1 && p.x < b.maxX - 0.1) {          // đứng trước mặt nam/bắc
        const side = Math.sign(p.z - cz) || 1;
        gap = side > 0 ? p.z - b.maxZ : b.minZ - p.z; dot = fz * -side;
        tx = p.x; tz = side > 0 ? b.minZ - 0.75 : b.maxZ + 0.75;
      } else if (p.z > b.minZ + 0.1 && p.z < b.maxZ - 0.1) {   // đứng trước mặt đông/tây
        const side = Math.sign(p.x - cx) || 1;
        gap = side > 0 ? p.x - b.maxX : b.minX - p.x; dot = fx * -side;
        tz = p.z; tx = side > 0 ? b.minX - 0.75 : b.maxX + 0.75;
      } else continue;
      if (gap > R || gap < -0.05 || dot < 0.35) continue;
      const B = CFG.bounds;
      if (tx < B.minX + 0.5 || tx > B.maxX - 0.5 || tz < B.minZ + 0.5 || tz > B.maxZ - 0.5) continue;
      if (this.level.solids.some((o) => o !== b && Collision.pointIn(tx, tz, o, 0.42))) continue;
      if (!best || gap < best.gap) {
        const depth = Math.hypot(tx - p.x, tz - p.z);
        best = { fx: p.x, fz: p.z, tx, tz, gap, box: b, h: hgt + 0.35, dur: 0.55 + depth * 0.13 };
      }
    }
    return best;
  }

  // Nhấn phím: hành động ngay; riêng khi cầm đồ ném được thì "nhấn nhanh" và "giữ" là hai việc khác nhau
  pressInteract() {
    const a = this.availableAction();
    if (!a) return;
    if (a.type === 'throw') {
      this.pendingAim = { t: 0, tap: a.tap };
      if (!a.tap) this.beginAim();
      return;
    }
    this.doAction(a);
  }

  releaseInteract() {
    if (this.aiming) { this.throwItem(); return; }
    const pa = this.pendingAim;
    if (pa) { this.pendingAim = null; if (pa.tap) this.doAction(pa.tap); }
  }

  beginAim() {
    const p = this.player;
    this.pendingAim = null;
    if (p.hidden) this.unhide();
    this.aiming = { angle: this.cam.yaw, dist: CFG.throwStart, fromCam: true }; // ngắm theo hướng camera (tâm ngắm)
    p.vx = p.vz = 0;
  }

  cancelAim() { this.aiming = null; this.pendingAim = null; }

  // đặt đồ đang cầm xuống đất trước chân
  dropHeld() {
    const p = this.player, it = p.holding;
    if (!it || !it.throwable) return;
    p.holding = null;
    it.mesh.parent.remove(it.mesh); this.level.root.add(it.mesh);
    it.x = p.x + Math.sin(p.facing) * 0.6; it.z = p.z + Math.cos(p.facing) * 0.6; it.state = 'ground';
    it.mesh.rotation.set(0, Math.random() * 6, 0); it.mesh.position.set(it.x, 0.14, it.z);
  }

  doAction(a) {
    const p = this.player;
    if (this.level.doAction(a)) return; // màn tự xử lý hành động riêng của nó
    switch (a.type) {
      case 'unhide': this.unhide(); break;
      case 'pick': {
        this.dropHeld();
        const b = a.ref; b.state = 'held'; p.holding = b;
        if (b instanceof Bone) { this.gotBone = true; this.fx.pop(p, 'Có xương rồi!', 'pop', 1.1, 2.9); }
        b.mesh.parent.remove(b.mesh); p.rig.hand.add(b.mesh); b.mesh.position.set(0, 0, 0.05); b.mesh.rotation.set(0, Math.PI / 2, 0); b.mesh.scale.setScalar(1);
        Sfx.play('pick');
        break;
      }
      case 'hide': p.hidden = true; p.bush = a.ref; a.ref.shake = 0.6; Sfx.play('rustle'); break;
      case 'vault': { const v = this.vaultTarget() || a.ref; p.startVault(v); break; }
      case 'distract': this.distract(a.ref); break;
      case 'shove': { // bấm E: đẩy thùng trượt 1.2 m theo hướng từ người tới thùng
        const o = a.ref, dx = o.x - p.x, dz = o.z - p.z, ax = Math.abs(dx) > Math.abs(dz);
        o.slide = { dx: ax ? Math.sign(dx) : 0, dz: ax ? 0 : Math.sign(dz), left: 1.2 };
        p.pushing = o; p.facing = Math.atan2(dx, dz);
        break;
      }
    }
  }

  unhide() {
    const p = this.player;
    if (!p.hidden) return;
    p.hidden = false; if (p.bush) p.bush.shake = 0.5; p.bush = null;
  }

  // điểm rơi theo hướng & độ xa đang ngắm; đồ ném bay vòng qua tường/rào, chỉ không rơi vào trong vật cản
  aimTarget() {
    const p = this.player, B = CFG.bounds, a = this.aiming;
    const fx = Math.sin(a.angle), fz = Math.cos(a.angle);
    for (let d = a.dist; d >= 1; d -= 0.25) {
      const x = clamp(p.x + fx * d, B.minX + 0.6, B.maxX - 0.6), z = clamp(p.z + fz * d, B.minZ + 0.6, B.maxZ - 0.6);
      if (!this.level.solids.some((b) => Collision.pointIn(x, z, b, 0.45))) return { x, z };
    }
    return { x: p.x, z: p.z };
  }

  updateAim(dt) {
    const p = this.player, a = this.aiming, inp = this.input;
    if (a.fromCam) { this.cam.yaw += inp.axisX * dt * 1.9; a.angle = this.cam.yaw; }
    else a.angle += inp.axisX * dt * 1.9;
    a.dist = clamp(a.dist + inp.axisZ * dt * CFG.throwPowerRate, CFG.throwMin, CFG.throwMax);
    this.ui.setPower(a.dist);
    p.facing = a.angle;
    const to = this.aimTarget(), pts = this.arc.geometry.attributes.position, tmp = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < pts.count; i++) { ThrowArc.point(p, to, i / (pts.count - 1), tmp); pts.setXYZ(i, tmp.x, tmp.y, tmp.z); }
    pts.needsUpdate = true;
    this.throwMarker.position.set(to.x, 0.06, to.z);
    this.aimTo = to; // không báo trúng/lệch khi ngắm: người chơi tự căn
  }

  throwItem() {
    const p = this.player, it = p.holding;
    if (!it || !it.throwable) { this.aiming = null; return; }
    this.updateAim(0);
    const to = this.aimTo;
    p.holding = null; this.aiming = null;
    it.mesh.parent.remove(it.mesh); this.level.root.add(it.mesh);
    it.throwTo(p, to);
    Sfx.play('whoosh');
  }
  throwBone() { this.throwItem(); } // tên cũ (giữ để tương thích)

  /* ---------- sự kiện ---------- */
  emitNoise(x, z, radius, kind, ref) {
    const colors = { distract: 0xffb45a, push: 0xc8aa78, slide: 0xbfd2ff, run: 0xbfd2ff, step: 0x9fb2d8, land: 0xbfd2ff, vault: 0xffcf8a, bone: 0xfff3c4, trapnoise: 0xffb36b, rock: 0xd8d8d0, cluck: 0xffffff };
    if (this.minimap) this.minimap.ping(x, z, radius, kind);
    const ringR = Math.min(radius, kind === 'bone' ? 9 : 22);
    if (kind !== 'step') this.fx.ring(x, z, ringR, colors[kind] || 0xffffff, kind === 'trapnoise' ? 1.4 : 0.8, kind === 'run' || kind === 'land' ? 0.35 : 0.7);
    for (const d of this.level.dogs) if (Math.hypot(d.x - x, d.z - z) <= radius) d.hear(x, z, kind, ref, this);
  }

  inZone(x, z) { const Z = this.level.zone; return !!Z && Math.hypot(x - Z.x, z - Z.z) <= Z.r; }

  // Vật ném (xương / đá) chạm đất: trúng vùng kích hoạt của bẫy thì bẫy sập từ xa và hỏng hẳn
  onThrowLanded(item) {
    const trap = TrapSystem.findHit(this.level.traps, item.x, item.z);
    if (trap) {
      if (item instanceof Bone) { item.state = 'gone'; item.mesh.visible = false; this.fx.pop(item, 'Mất xương rồi!', 'pop', 1.6, 1.6); }
      trap.spring(this, 'remote', item);
      return;
    }
    if (item instanceof Bone) { Sfx.play('thud'); this.level.onBaitLanded(item); return; }
    // đá / cành / xô rơi: gây tiếng động giả, chó gần đó tới xem (không ăn được)
    const c = item.conf || THROWABLES.rock;
    Sfx.play(c.sfx, false);
    this.fx.dust(item.x, item.z, 0x6b5a40, 5);
    this.fx.pop(item, c.text, item.kind === 'bucket' ? 'clang' : 'pop', 0.9, 1.4);
    this.emitNoise(item.x, item.z, c.noise, 'rock');
  }

  // bẫy sập: how = 'step' (người giẫm phải) | 'remote' (vật ném trúng)
  onTrap(trap, how) {
    const p = this.player, c = trap.conf;
    Sfx.trap(trap.type);
    this.fx.pop(trap, c.text, 'clang', 1.6, 2.2);
    if (how === 'remote') {
      // bẫy hỏng hẳn, đi qua an toàn; tiếng động kéo chó gần đó tới kiểm tra chỗ bẫy
      this.fx.dust(trap.x, trap.z, 0x6b5a40, trap.type === 'pitfall' ? 8 : 4);
      this.emitNoise(trap.x, trap.z, c.remote, 'trapnoise');
      return;
    }
    this.cancelAim();
    this.minimap.ping(trap.x, trap.z, 20, 'trap');
    this.trapHit = c.name;
    this.failCause = this.failCause || 'trap';
    if (c.stun) { p.stunT = c.stun; p.vx = p.vz = 0; }
    if (trap.type === 'pitfall' || trap.type === 'bear') p.trapped = { x: trap.x, z: trap.z, type: trap.type };
    this.camShake = c.stun >= 2 ? 0.45 : 0.25;
    switch (c.react) {
      case 'alarm': // cả đàn lập tức rượt
        this.fx.ring(trap.x, trap.z, 22, 0xff4a3a, 1.4, 0.7);
        for (const d of this.level.dogs) d.hear(p.x, p.z, 'alarm', null, this);
        break;
      case 'investigate':
        this.fx.ring(trap.x, trap.z, 18, 0xff8a3a, 1.4, 0.7);
        for (const d of this.level.dogs) if (Math.hypot(d.x - trap.x, d.z - trap.z) <= c.radius) d.hear(trap.x, trap.z, 'trapcheck', null, this);
        break;
      case 'nearest': {
        this.fx.ring(trap.x, trap.z, 10, 0xffb36b, 1.0, 0.6);
        const d = [...this.level.dogs].sort((a, b) => Math.hypot(a.x - trap.x, a.z - trap.z) - Math.hypot(b.x - trap.x, b.z - trap.z))[0];
        if (d) d.hear(trap.x, trap.z, 'trapcheck', null, this);
        break;
      }
    }
  }

  onSpotted(dog) {
    this.spotted++;
    this.failCause = this.failCause || 'seen';
    this.fx.pop(dog, 'GÂU GÂU!', 'bark', 1.1, 3.2);
    Sfx.play('bark');
  }

  busted(dog) {
    if (this.state !== 'play') return;
    this.state = 'busted'; this.bustedT = 0;
    this.camShake = 0.7;
    document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake');
    this.ui.el.busted.classList.add('on');
    this.ui.el.prompt.hidden = true;
    this.cancelAim();
    Sfx.play('hit');
    this.bustReason = this.level.bustReason(this.failCause || 'close', this);
  }

  // thất bại đặc biệt do màn quyết định (vd. Màn 1: ôm gà về cổng chính → Ông chủ trang trại xuất hiện)
  failCinematic(kind) {
    if (this.state !== 'play') return;
    const p = this.player;
    this.cancelAim(); this.unhide();
    p.vx = p.vz = 0; p.moving = false;
    if (!this.level.startFailCinematic(kind)) { this.busted(null); return; }
    this.state = 'cinematic';
    this.ui.el.prompt.hidden = true; this.ui.el.toast.hidden = true;
    this.ui.el.hud.hidden = true; // cảnh quay điện ảnh: ẩn HUD
    document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake');
  }

  // hoàn thành điều kiện thắng của màn: dừng đồng hồ, kiểm tra hợp lệ, ghi tiến độ
  win() {
    if (this.state !== 'play') return;
    this.state = 'victory'; this.victoryT = 0; this.fwT = 0;
    this.cancelAim();
    this.ui.el.prompt.hidden = true;
    this.timer.stop();
    const i = this.levelIndex, time = this.runTime, par = this.level.meta.par || 60;
    // kiểm tra hợp lệ: thời gian không phi lý, đồng hồ đã chạy, đang ôm mục tiêu, và điều kiện riêng của màn (vd. đã đẩy đống rơm)
    const p = this.player, valid = this.runOn && time >= Board.minTime(i) && !!(p.holding && p.holding.target) && this.level.validateWin();
    const stars = time <= par ? 3 : time <= par * 1.6 ? 2 : 1;
    if (valid) {
      this.progress.stars[i] = Math.max(this.progress.stars[i] || 0, stars);
      this.progress.best[i] = Math.min(this.progress.best[i] || Infinity, time);
      this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(this.levels.count - 1, i + 1));
      this.saveProgress();
    }
    this.run = { level: i, time, stars: valid ? stars : 0, best: this.progress.best[i], place: valid ? Board.placeOf(i, time) : -1, saved: !valid, invalid: !valid };
    Sfx.play('victory');
    this.fx.sparkle(this.player.x, this.player.z, 40);
    this.fx.pop(this.player, 'Trót lọt!', 'pop', 1.6, 3);
  }

  updateVictory(dt) {
    const p = this.player, H = this.level.exit;
    this.victoryT += dt;
    const t = this.victoryT;
    // tên trộm chạy thêm vài bước về phía lối thoát
    if (t < 1.1) { p.x += Math.sin(H.dir) * dt * 3.2; p.z += Math.cos(H.dir) * dt * 3.2; p.facing = turnTo(p.facing, H.dir, dt * 10); p.moving = true; }
    else p.moving = false;
    p.animate(dt, p.moving ? 3.2 : 0);
    this.fwT -= dt;
    if (t < 4.5 && this.fwT <= 0) {
      this.fwT = 0.28 + Math.random() * 0.3;
      this.fx.firework(H.x + Math.sin(H.dir) * 5 + (Math.random() - 0.5) * 12, 7 + Math.random() * 5, H.z + Math.cos(H.dir) * 5 + (Math.random() - 0.5) * 12);
    }
    if (this.state === 'victory' && t >= 2.4) {
      this.state = 'winover';
      this.ui.el.hud.hidden = true;
      this.ui.showWin(this.run);
      if (this.run.place === 0) { Sfx.play('record'); this.fx.sparkle(p.x, p.z, 60); }
    }
  }

  // ghi danh vào Top 10 (bấm "Ghi danh"; rời màn hình mà chưa ghi thì tự lưu với nickname gần nhất)
  commitRun(name) {
    const r = this.run;
    if (!r || r.saved || r.place < 0) return;
    r.saved = true;
    const nick = Board.clean(name !== undefined ? name : Board.nick);
    Board.nick = nick;
    const idx = Board.insert(r.level, nick, r.time);
    if (this.state === 'winover') this.ui.savedWin(r, idx);
  }

  /* ---------- vòng lặp ---------- */
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (this.state === 'guard') return; // đã khóa: dừng hẳn mô phỏng & vẽ
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now; this.time += dt;
    const L = this.level, p = this.player, st = this.state;
    if (st !== 'play' && this.cam.locked) this.cam.release(); // thả chuột khi hiện bảng/cảnh cắt

    if (st === 'play') {
      this.levelTime += dt;
      this.timer.update(dt, p); // đồng hồ speedrun chạy từ lúc rời vị trí xuất phát
      // đổi phím di chuyển (theo hướng camera) sang hướng trong thế giới
      const inp = this.input;
      this.cam.yaw += (inp.turn || 0) * dt * CFG.camera.keyTurn;
      this.faceYaw = this.cam.yaw; // nhân vật luôn quay mặt theo hướng camera khi di chuyển
      const yaw = this.cam.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
      this.move.axisX = fx * inp.axisZ + fz * inp.axisX;
      this.move.axisZ = fz * inp.axisZ - fx * inp.axisX;
      this.move.run = inp.run;
      p.update(dt, this.move, this);
      for (const d of L.dogs) d.update(dt, this.levelTime, this);
      // điều kiện thắng / thua riêng của màn
      if (L.checkWinCondition()) this.win();
      else { const f = L.checkFailCondition(); if (f) this.failCinematic(f); }
    } else if (st === 'busted') {
      this.bustedT += dt;
      p.animate(dt, 0);
      for (const d of L.dogs) d.animate(dt, this.time);
      if (this.bustedT > 1.4) {
        this.state = 'result';
        this.ui.showResult(this.bustReason);
      }
    } else if (st === 'cinematic' || st === 'cinematicover') {
      const r = L.updateCinematic(dt);
      for (const d of L.dogs) d.update(dt, this.levelTime, this);
      if (st === 'cinematic' && r.over) { this.state = 'cinematicover'; this.ui.showBoss(L.failText); }
    } else if (st === 'victory' || st === 'winover') {
      this.updateVictory(dt);
      for (const d of L.dogs) { d.animate(dt, this.time); d.updateCone(L); }
    } else {
      p.animate(dt, 0);
      for (const d of L.dogs) { if (st === 'title') d.update(dt, this.time, this); else d.animate(dt, this.time); d.updateCone(L); }
    }
    for (const t of L.traps) t.update(dt, this.time, this);
    for (const b of L.bones) b.update(dt, this.time, this);
    for (const r of L.rocks) r.update(dt, this.time, this);
    for (const b of L.bushes) b.update(dt, this.time);
    L.update(dt); // logic riêng của màn (gà, đống rơm, camera an ninh...)
    for (const o of L.pushables) o.update(dt, this);
    for (const o of L.distractors) o.update(dt, this);
    // thùng bị đẩy đứng yên 0.6 giây → dựng lại lưới tìm đường cho chó
    if (L.navDirty > 0) { L.navDirty -= dt; if (L.navDirty <= 0) L.nav = new NavGrid(L.solids); }
    if (p.holding && p.holding.target && p.holding.rig) { const r = p.holding.rig; r.group.rotation.z = Math.sin(this.time * 20) * 0.15; }

    // ngắm ném: giữ phím quá 0.2 giây thì hiện quỹ đạo
    if (this.state === 'play' && this.pendingAim) { this.pendingAim.t += dt; if (this.pendingAim.t > 0.2) this.beginAim(); }
    const aiming = this.state === 'play' && !!this.aiming;
    document.body.classList.toggle('aiming', aiming);
    this.ui.el.power.hidden = !aiming;
    this.throwMarker.visible = aiming; this.arc.visible = aiming;
    if (aiming) { this.updateAim(dt); this.throwMarker.material.opacity = 0.45 + Math.sin(this.time * 6) * 0.25; }

    this.fow.update(dt, ['play', 'busted', 'result'].includes(this.state));
    if (this.state === 'play' || this.state === 'busted') this.minimap.update(dt);
    this.patchT = (this.patchT || 0) - dt;
    if (this.patchT <= 0) { this.patchT = 1; this.fow.patch(this.world.scene); } // vật thể sinh thêm giữa trận (mũi tên...)
    this.cam.update(dt);
    this.world.update(this.time, this.world.camera, this.state === 'title' ? { x: 0, z: 0 } : p);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.fx.update(dt, this.world.camera, w, h);
    this.updateDogLabels(w, h);
    if (['play', 'busted', 'cinematic', 'victory'].includes(this.state)) this.ui.update(this, dt);
    this.world.renderer.render(this.world.scene, this.world.camera);
  }

  // Phát hiện DevTools: khóa ván, xóa màn chơi (kèm vị trí bẫy) khỏi bộ nhớ, ẩn khung 3D
  lockdown() {
    if (this.state === 'guard') return;
    this.state = 'guard';
    this.cam.release();
    this.cancelAim();
    for (const el of document.querySelectorAll('.overlay')) el.hidden = true;
    this.ui.el.hud.hidden = true;
    this.fx.clear();
    this.level.cleanup(false);
    this.container.style.visibility = 'hidden';
    document.getElementById('guardOver').hidden = false;
  }

  updateDogLabels(w, h) {
    const v = new THREE.Vector3();
    for (const d of this.level.dogs) {
      let el = this.dogLabels.get(d);
      if (!el) { el = document.createElement('div'); el.className = 'lbl'; this.fx.layer.appendChild(el); this.dogLabels.set(d, el); }
      let txt = '', cls = 'lbl';
      if (['play', 'busted'].includes(this.state)) {
        if (d.state === 'chase') { txt = '!'; cls = 'lbl alert'; }
        else if (d.state === 'investigate' || d.state === 'search' || d.sus > 0.15) { txt = '?'; cls = 'lbl sus'; }
      }
      el.textContent = txt; el.className = cls;
      if (txt) this.fx.place(el, d.x, 2.3 + Math.abs(Math.sin(this.time * 6)) * 0.15, d.z, this.world.camera, w, h, v);
      else el.style.display = 'none';
    }
  }

  // tương thích: đồng hồ speedrun nằm trong SpeedrunTimer
  get runTime() { return this.timer.time; }
  set runTime(v) { this.timer.time = v; }
  get runOn() { return this.timer.running; }
  set runOn(v) { this.timer.running = v; }
}

function boot() {
  if (!THREE) {
    document.querySelector('#title .lede').textContent = 'Không tải được thư viện Three.js. Hãy kiểm tra kết nối mạng rồi tải lại trang.';
    return;
  }
  const game = new Game();
  Guard.init(game);
  document.getElementById('guardReload').addEventListener('click', () => location.reload());
  if (!PROTECT) { window.game = game; window.__dgb = { CFG, Collision, Bone, Rock, Board }; } // chỉ lộ ra khi phát triển / kiểm thử
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
