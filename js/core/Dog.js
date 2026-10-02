/* =====================================================================
 * Dog — lính canh có AI (chó trang trại, bảo vệ khu đô thị...): gác / tuần tra, nón tầm nhìn bị vật cản cắt,
 * nghi ngờ (?), điều tra tiếng động, gặm mồi, rượt đuổi không mất dấu (!).
 * ===================================================================== */
import { THREE } from '../engine/three.js';
import { CFG } from '../config.js';
import { angleDiff, turnTo, Collision } from '../engine/utils.js';
import { Models } from '../engine/Models.js';

export class Dog {
  // Chó canh nghiêm ngặt:
  //  - tầm nhìn rộng & xa, nghi ngờ đầy chỉ trong ~0.2–0.3 giây
  //  - đã rượt là bám theo vị trí thật của tên trộm (không mất dấu, nấp bụi cũng vô ích), chạy nhanh hơn người 15%
  //  - mọi chuyển động gác/tuần đều tất định (không ngẫu nhiên) để màn chơi là một bài đố có lời giải cố định
  constructor(scene, cfg, index) {
    this.cfg = cfg;
    this.range = cfg.range; this.fov = (cfg.fov * Math.PI) / 180;
    this.guard = !!cfg.post;
    const start = this.guard ? { x: cfg.post[0], z: cfg.post[1] } : { x: cfg.path[0][0], z: cfg.path[0][1] };
    this.x = start.x; this.z = start.z;
    this.home = start;
    this.baseFacing = this.guard ? cfg.facing : Math.atan2(cfg.path[1][0] - start.x, cfg.path[1][1] - start.z);
    this.facing = this.baseFacing; this.wantFacing = this.facing;
    this.wp = 1; this.state = this.guard ? 'guard' : 'patrol';
    this.sus = 0; this.path = []; this.repath = 0; this.timer = 0;
    this.boneRef = null; this.eatBone = null; this.investigateKind = null; this.seesPlayer = false; this.searchBase = this.facing;
    this.moving = false; this.phase = 0;
    // màn có thể thay mô hình (vd. bảo vệ khu đô thị): cfg.model(index) trả về { group, head, tail, legs }
    this.rig = cfg.model ? cfg.model(index) : Models.dog(index % 2 === 1); scene.add(this.rig.group);
    this.shout = cfg.shout || 'GÂU!'; this.speedMul = cfg.speedMul || 1;
    // nón tầm nhìn: quạt tam giác, mỗi tia bị vật cản cắt ngắn
    this.rays = 30;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((this.rays + 2) * 3), 3));
    const idx = []; for (let i = 1; i <= this.rays; i++) idx.push(0, i, i + 1);
    geo.setIndex(idx);
    this.cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    this.cone.material.userData.fowAlpha = true; // không thấy nón tầm nhìn của chó khi chó nằm ngoài tầm mắt bạn
    this.cone.frustumCulled = false; this.cone.renderOrder = 3;
    scene.add(this.cone);
  }

  get speed() {
    const D = CFG.dog;
    if (this.state === 'investigate') return (this.investigateKind === 'bone' || this.investigateKind === 'trap' ? D.rush : D.investigate) * this.speedMul;
    return ({ patrol: D.patrol, back: D.back, chase: D.chase }[this.state] || 0) * this.speedMul;
  }

  // đang lao tới chỗ xương thì chỉ chú ý mùi xương: tầm nhìn hẹp và gần hơn
  get viewRange() { return this.state === 'investigate' && this.investigateKind === 'bone' ? this.range * 0.45 : this.range; }
  get viewFov() { return this.state === 'investigate' && this.investigateKind === 'bone' ? this.fov * 0.6 : this.fov; }

  canSee(p, level) {
    if (this.state === 'eat') return false;
    if (p.hidden) return false;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    const sense = (this.state === 'guard' ? CFG.dog.guardSense : CFG.dog.closeSense) * (p.stance === 'prone' ? 0.75 : 1);
    if (d < sense) return true; // đứng sát quá thì chó đánh hơi được
    // nằm bò trong bụi cỏ cao: chó chỉ phát hiện khi đánh hơi ở cự ly sát
    if (p.stance === 'prone' && !p.airborne && level.inGrass(p.x, p.z)) return false;
    // khom / bò thì khó thấy hơn: tầm nhìn hiệu dụng của chó ngắn lại
    if (d > this.viewRange * (p.airborne || p.vault ? 1.15 : p.stealth)) return false;
    if (Math.abs(angleDiff(this.facing, Math.atan2(dx, dz))) > this.viewFov / 2) return false;
    return Collision.rayCast(this.x, this.z, dx / d, dz / d, d, level.solids) >= d - 0.05;
  }

  // kind: alarm (cả đàn lao vào rượt) · trapcheck (bỏ dở mọi việc, kể cả gặm xương, chạy tới chỗ bẫy)
  //       bone · trapnoise (bẫy sập từ xa) · rock (đá rơi) · run · cluck
  hear(x, z, kind, ref, game) {
    if (kind === 'alarm') { this.alarmChase(game); return; }
    if (this.state === 'chase') return;
    if (kind === 'trapcheck') {
      if (this.state === 'eat') this.leaveBone(false);
      this.sus = Math.max(this.sus, 0.5);
      this.investigate(x, z, 'trap', null, game);
      return;
    }
    if (this.state === 'eat') return;
    if (kind === 'bone') { this.investigate(x, z, 'bone', ref, game); return; }
    if (this.state === 'investigate' && this.investigateKind === 'bone') return; // đang theo mùi xương
    this.sus = Math.max(this.sus, 0.35);
    this.investigate(x, z, kind, ref, game);
  }

  alarmChase(game) {
    if (this.state === 'eat') this.leaveBone(false);
    if (this.state !== 'chase') game.fx.pop(this, this.shout, 'bark', 1, 3.2);
    this.state = 'chase'; this.investigateKind = null; this.repath = 0; this.sus = 1;
  }

  startChase(game) {
    if (this.state === 'chase') return;
    this.state = 'chase'; this.investigateKind = null; this.repath = 0; this.sus = 1;
    game.onSpotted(this);
  }

  leaveBone(finished) {
    if (this.eatBone) this.eatBone.removeEater(this, finished);
    this.eatBone = null; this.rig.head.rotation.x = 0;
    if (this.eatLabel) { this.eatLabel.t = this.eatLabel.life; this.eatLabel = null; }
  }

  investigate(x, z, kind, ref, game) {
    this.state = 'investigate'; this.investigateKind = kind; this.boneRef = kind === 'bone' ? ref : null;
    this.path = game.level.nav.findPath(this.x, this.z, x, z);
  }

  goHome(game) {
    this.state = 'back'; this.investigateKind = null;
    const h = this.guard ? this.home : this.nearestWaypoint();
    this.path = game.level.nav.findPath(this.x, this.z, h.x, h.z);
  }

  nearestWaypoint() {
    let best = 0, bd = Infinity;
    this.cfg.path.forEach(([x, z], i) => { const d = Math.hypot(x - this.x, z - this.z); if (d < bd) { bd = d; best = i; } });
    this.wp = best;
    return { x: this.cfg.path[best][0], z: this.cfg.path[best][1] };
  }

  followPath(dt, speed) {
    this.moving = false;
    while (this.path.length) {
      const t = this.path[0], dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.2) { this.path.shift(); continue; }
      const step = Math.min(d, speed * dt);
      this.x += (dx / d) * step; this.z += (dz / d) * step;
      this.wantFacing = Math.atan2(dx, dz); this.moving = true;
      return false;
    }
    return true;
  }

  update(dt, time, game) {
    const p = game.player, level = game.level, D = CFG.dog;
    const see = this.canSee(p, level);
    this.seesPlayer = see;
    const pd = Math.hypot(p.x - this.x, p.z - this.z);

    // thanh nghi ngờ: đầy rất nhanh (≈0.2–0.3 giây) khi tên trộm lọt vào nón tầm nhìn
    if (this.state !== 'eat' && this.state !== 'chase') {
      if (see) this.sus += dt * (D.susBase + (1 - Math.min(1, pd / this.range)) * D.susNear);
      else this.sus = Math.max(0, this.sus - dt * 0.6);
      if (this.sus >= 1) this.startChase(game);
    }

    const speed = this.speed * (level.mud.some((m) => m.contains(this.x, this.z)) ? 0.8 : 1);

    switch (this.state) {
      case 'guard': {
        // quét đầu qua lại theo nhịp cố định (sin của thời gian màn chơi)
        this.moving = false;
        const c = this.cfg;
        this.wantFacing = this.baseFacing + Math.sin(time * (c.sweepSpeed || 0.6) + (c.phase || 0)) * (c.sweep || 0);
        break;
      }
      case 'patrol': {
        const w = this.cfg.path[this.wp];
        if (!this.path.length) this.path = [{ x: w[0], z: w[1] }];
        if (this.followPath(dt, speed)) {
          this.wp = (this.wp + 1) % this.cfg.path.length; this.path = [];
          if (this.cfg.pause) { this.state = 'pause'; this.timer = this.cfg.pause; this.searchBase = this.facing; }
        }
        break;
      }
      case 'pause': // dừng ở đầu tuyến, ngó quanh
        this.moving = false; this.timer -= dt;
        this.wantFacing = this.searchBase + Math.sin((this.cfg.pause - this.timer) * 2.2) * 0.9;
        if (this.timer <= 0) this.state = 'patrol';
        break;
      case 'investigate': {
        if (this.followPath(dt, speed)) {
          const b = this.boneRef;
          if (b && b.available && Math.hypot(b.x - this.x, b.z - this.z) < 2) {
            this.state = 'eat'; this.eatBone = b; this.timer = CFG.eatTime; b.addEater(this);
            this.wantFacing = Math.atan2(b.x - this.x, b.z - this.z);
            this.sus = 0;
            this.eatLabel = game.fx.pop(this, 'Gặm xương...', 'eat', 999);
          } else { this.state = 'search'; this.timer = D.search; this.searchBase = this.facing; this.investigateKind = null; }
        }
        break;
      }
      case 'search':
        this.moving = false; this.timer -= dt;
        this.wantFacing = this.searchBase + Math.sin((D.search - this.timer) * 2.4) * 1.4;
        if (this.timer <= 0) this.goHome(game);
        break;
      case 'eat':
        this.moving = false; this.timer -= dt;
        this.rig.head.rotation.x = 0.5 + Math.sin(time * 14) * 0.15;
        if (this.eatLabel) this.eatLabel.el.textContent = `Gặm xương ${Math.ceil(Math.max(0, this.timer))}s`;
        if (this.timer <= 0) { this.leaveBone(true); this.goHome(game); }
        break;
      case 'back':
        if (this.followPath(dt, speed)) {
          if (this.guard) this.state = 'guard';
          else { this.state = 'patrol'; this.wp = (this.wp + 1) % this.cfg.path.length; this.path = []; }
        }
        break;
      case 'chase': // bám theo vị trí thật, không bao giờ mất dấu
        this.repath -= dt;
        if (this.repath <= 0) { this.repath = 0.25; this.path = level.nav.findPath(this.x, this.z, p.x, p.z); }
        if (pd < 3) this.path = [{ x: p.x, z: p.z }];
        this.followPath(dt, speed);
        break;
    }

    for (const b of level.solids) Collision.circleVsAABB(this, D.radius, b);
    this.facing = turnTo(this.facing, this.wantFacing, dt * (this.state === 'chase' ? 9 : 4.5));
    if (pd < D.catchDist && (this.state === 'chase' || !p.hidden) && this.state !== 'eat') game.busted(this);

    this.animate(dt, time);
    this.updateCone(level);
  }

  animate(dt, time) {
    const r = this.rig;
    r.group.position.set(this.x, 0, this.z);
    r.group.rotation.y = this.facing;
    const run = this.state === 'chase' || this.investigateKind === 'bone';
    this.phase += dt * (this.moving ? (run ? 20 : 10) : 0);
    r.legs.forEach((l, i) => { l.rotation.x = this.moving ? Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * (run ? 0.9 : 0.5) : 0; });
    r.tail.rotation.z = Math.sin(time * (this.state === 'eat' ? 16 : 6)) * 0.5;
    r.group.position.y = this.moving ? Math.abs(Math.sin(this.phase)) * (run ? 0.12 : 0.05) : 0;
  }

  updateCone(level) {
    const pos = this.cone.geometry.attributes.position, y = 0.07;
    this.cone.visible = this.state !== 'eat';
    if (!this.cone.visible) return;
    const range = this.viewRange, fov = this.viewFov;
    pos.setXYZ(0, this.x, y, this.z);
    for (let i = 0; i <= this.rays; i++) {
      const a = this.facing - fov / 2 + (fov * i) / this.rays;
      const dx = Math.sin(a), dz = Math.cos(a);
      const len = Collision.rayCast(this.x, this.z, dx, dz, range, level.solids);
      pos.setXYZ(i + 1, this.x + dx * len, y, this.z + dz * len);
    }
    pos.needsUpdate = true;
    this.cone.geometry.computeBoundingSphere();
    const m = this.cone.material;
    if (this.state === 'chase') { m.color.setHex(0xff1f1f); m.opacity = 0.36; }
    else if (this.sus > 0.1 || this.state === 'investigate' || this.state === 'search') { m.color.setHex(0xff9a2e); m.opacity = 0.2 + this.sus * 0.14; }
    else { m.color.setHex(0xff5a4a); m.opacity = 0.15; }
  }

  dispose(scene) { scene.remove(this.rig.group, this.cone); this.cone.geometry.dispose(); this.cone.material.dispose(); }
}
