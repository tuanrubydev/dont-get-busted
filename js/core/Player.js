/* =====================================================================
 * Player — tên trộm: đi/chạy, khom (C), bò (Z), nhảy (Space), trèo vật thấp, trượt dài (Shift+C),
 * đẩy thùng, nấp bụi, cầm đồ ném / ôm mục tiêu (inventory: holding), dính bẫy (tụt hố / kẹp chân).
 * ===================================================================== */
import { CFG } from '../config.js';
import { clamp, lerp, turnTo, Collision } from '../engine/utils.js';
import { Models } from '../engine/Models.js';
import { Sfx } from '../engine/AudioManager.js';

export class Player {
  constructor(scene, x, z) {
    this.x = x; this.z = z; this.vx = 0; this.vz = 0;
    this.facing = 0; this.hidden = false; this.bush = null;
    this.holding = null; // null | đồ ném (Bone, Rock...) | mục tiêu (target = true: gà, chó cảnh...)
    this.stunT = 0; this.running = false; this.moving = false; this.noiseT = 0; this.stepT = 0; this.inMud = false;
    this.trapped = null; this.sink = 0; // dính bẫy: hố sập (tụt xuống hố) / bẫy kẹp (kẹp chân tại chỗ)
    // tư thế: stand (đứng) | crouch (khom, đi êm) | prone (nằm bò, chui lỗ rào, nấp trong cỏ cao)
    this.stance = 'stand'; this.crouchK = 0; this.proneK = 0;
    this.y = 0; this.vy = 0; this.airborne = false; // nhảy
    this.vault = null;                              // đang trèo qua vật cản
    this.slide = null;                              // đang trượt dài (Shift + C khi chạy)
    this.pushing = null;                            // vật đang bị đẩy
    this.rig = Models.thief(); scene.add(this.rig.group);
    this.walkPhase = 0;
  }
  get speedMul() { return ((this.holding && this.holding.target) ? CFG.player.carry : 1) * (this.inMud ? CFG.player.mudSpeed : 1); }
  get grounded() { return !this.airborne && !this.vault; }
  get low() { return this.stance === 'prone' || !!this.slide; } // đủ thấp để chui gầm / lỗ rào
  get stealth() { return this.slide ? CFG.player.stealth.crouch : CFG.player.stealth[this.stance]; }
  // độ cao mắt (camera bám theo): đứng 1.6 m, khom 1.15 m, bò 0.6 m
  get eyeHeight() { return lerp(lerp(1.6, 1.15, this.crouchK), 0.62, Math.max(this.proneK, this.slideK || 0)) + this.y; }

  setStance(s, game) {
    if (s === this.stance || this.vault || this.airborne) return;
    // đứng dậy khi đang bò dưới lỗ rào: không đủ chỗ
    if (this.stance === 'prone' && s !== 'prone' && game && game.level.solids.some((b) => (b.kind === 'crawl' || b.kind === 'cart') && Collision.pointIn(this.x, this.z, b, CFG.player.radius))) return;
    this.stance = s;
  }

  jump(game) {
    if (!this.grounded || this.stunT > 0 || this.hidden) return false;
    if (this.stance !== 'stand') { this.setStance('stand', game); return false; } // đang khom/bò thì Space để đứng dậy
    this.vy = CFG.player.jumpV * ((this.holding && this.holding.target) ? 0.85 : 1); this.airborne = true;
    Sfx.play('jump');
    return true;
  }

  startVault(v) {
    this.vault = { ...v, t: 0, dur: v.dur || CFG.player.vaultTime, h: v.h || 1.25 }; this.vx = this.vz = 0; this.stance = 'stand'; this.slide = null;
    Sfx.play('creak');
  }

  // trượt dài: lao thấp người về phía trước, chui lọt gầm xe kéo / lỗ dưới hàng rào
  startSlide(dir) {
    if (!this.grounded || this.slide || this.hidden || this.stunT > 0) return false;
    const sp = Math.max(CFG.player.slideSpeed, Math.hypot(this.vx, this.vz) * 1.15);
    this.slide = { t: 0, dx: Math.sin(dir), dz: Math.cos(dir), sp };
    this.stance = 'stand'; this.facing = dir;
    Sfx.play('slide');
    return true;
  }

  update(dt, input, game) {
    const P = CFG.player;
    this.stunT = Math.max(0, this.stunT - dt);
    if (this.trapped) {
      if (this.stunT > 0) { this.x = lerp(this.x, this.trapped.x, Math.min(1, dt * 12)); this.z = lerp(this.z, this.trapped.z, Math.min(1, dt * 12)); }
      else this.trapped = null;
    }
    if (this.trapped && this.stance !== 'stand') this.stance = 'stand';
    this.sink = lerp(this.sink, this.trapped && this.trapped.type === 'pitfall' ? -0.95 : 0, Math.min(1, dt * 9));
    this.crouchK = lerp(this.crouchK, this.stance === 'crouch' ? 1 : 0, Math.min(1, dt * 10));
    this.proneK = lerp(this.proneK, this.stance === 'prone' ? 1 : 0, Math.min(1, dt * 8));

    // trèo hàng rào: bay vòng cung qua đầu rào rồi tiếp đất bên kia (tiếng cọt kẹt kéo chó lại gần)
    if (this.vault) {
      const v = this.vault; v.t += dt;
      const k = Math.min(1, v.t / v.dur), e = k * k * (3 - 2 * k);
      this.x = lerp(v.fx, v.tx, e); this.z = lerp(v.fz, v.tz, e);
      this.y = Math.sin(k * Math.PI) * v.h; // nhấc người qua đỉnh vật cản
      this.facing = turnTo(this.facing, Math.atan2(v.tx - v.fx, v.tz - v.fz), dt * 14);
      if (k >= 1) {
        this.vault = null; this.y = 0;
        game.emitNoise(this.x, this.z, CFG.noise.vault, 'vault');
        game.fx.pop(this, 'Cọt kẹt...', 'pop', 0.9, 2.4);
      }
      this.moving = true; this.running = false;
      this.animate(dt, 2.5);
      return;
    }

    this.slideK = lerp(this.slideK || 0, this.slide ? 1 : 0, Math.min(1, dt * 14));
    if (this.slide) {
      const s = this.slide; s.t += dt;
      const v = s.sp * Math.max(0.25, 1 - s.t / P.slideTime);
      this.vx = s.dx * v; this.vz = s.dz * v;
      this.x += this.vx * dt; this.z += this.vz * dt;
      for (const b of game.level.solids) { if (b.kind === 'crawl' || b.kind === 'cart' || b.kind === 'low') continue; Collision.circleVsAABB(this, P.radius, b); }
      const under = game.level.solids.some((b) => (b.kind === 'crawl' || b.kind === 'cart') && Collision.pointIn(this.x, this.z, b, P.radius));
      if (s.t >= P.slideTime && !under) { this.slide = null; this.stance = 'crouch'; }
      else if (s.t >= P.slideTime + 0.6) { this.slide = null; this.stance = 'prone'; } // kẹt dưới gầm: nằm bò luôn
      this.moving = true; this.running = false;
      this.animate(dt, 3);
      return;
    }
    this.inMud = this.grounded && game.level.mud.some((m) => m.contains(this.x, this.z));
    let ix = 0, iz = 0;
    if (!game.inputLocked) { ix = input.axisX; iz = input.axisZ; }
    const len = Math.hypot(ix, iz);
    if (this.hidden) {
      if (len > 0) game.unhide(); // bước ra khỏi bụi
      else { this.vx = this.vz = 0; this.x = lerp(this.x, this.bush.x, Math.min(1, dt * 10)); this.z = lerp(this.z, this.bush.z, Math.min(1, dt * 10)); }
    }
    // Shift khi đang khom/bò: bật dậy chạy
    if (input.run && len > 0 && this.stance !== 'stand' && !this.hidden) this.setStance('stand', game);
    this.running = !this.hidden && len > 0 && input.run && this.stunT <= 0 && this.stance === 'stand';
    const stanceMul = this.stance === 'prone' ? P.prone : this.stance === 'crouch' ? P.crouch : 1;
    // analog < 1: cần gạt cảm ứng kéo nhẹ → đi rón rén (chậm, không phát tiếng bước chân)
    this.sneak = !this.running && (input.analog ?? 1) < 1;
    const speed = (this.running ? P.run : P.walk * stanceMul * (this.sneak ? input.analog : 1)) * this.speedMul;
    let tvx = 0, tvz = 0;
    if (!this.hidden && this.stunT <= 0 && len > 0) { tvx = (ix / len) * speed; tvz = (iz / len) * speed; }
    // bùn: tăng tốc/giảm tốc rất chậm -> trơn trượt; trên không: gần như giữ nguyên quán tính
    const acc = this.airborne ? 2 : this.inMud ? P.mudAccel : P.accel;
    const k = 1 - Math.exp(-acc * dt);
    this.vx += (tvx - this.vx) * k; this.vz += (tvz - this.vz) * k;
    if (!this.hidden) {
      this.x += this.vx * dt; this.z += this.vz * dt;
      this.pushing = null;
      for (const b of game.level.solids) {
        if ((b.kind === 'crawl' || b.kind === 'cart') && this.stance === 'prone') continue; // chui lỗ rào / gầm xe kéo
        if (b.kind === 'low' && this.y > 0.35) continue;             // nhảy qua khúc gỗ thấp
        if (b.kind === 'push' && this.grounded && this.stance !== 'prone' && len > 0) this.tryPush(b, dt, game);
        Collision.circleVsAABB(this, P.radius, b);
      }
    }
    // nhảy
    if (this.airborne) {
      this.y += this.vy * dt; this.vy -= P.gravity * dt;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0; this.airborne = false;
        Sfx.play('land');
        game.emitNoise(this.x, this.z, CFG.noise.land, 'land');
      }
    }
    const sp = Math.hypot(this.vx, this.vz);
    this.moving = sp > 0.3;
    if (this.moving && this.stunT <= 0) {
      const want = game.state === 'play' && Number.isFinite(game.faceYaw) ? game.faceYaw : Math.atan2(this.vx, this.vz);
      this.facing = turnTo(this.facing, want, dt * 12);
    }
    // tiếng bước chân: chạy thì to, đi thường thì nhỏ, khom/bò thì không có tiếng
    if (this.running && this.moving && this.grounded) {
      this.noiseT -= dt;
      if (this.noiseT <= 0) { this.noiseT = CFG.noise.runEvery; game.emitNoise(this.x, this.z, CFG.noise.run, 'run'); }
    } else this.noiseT = 0;
    if (!this.running && !this.sneak && this.moving && this.grounded && this.stance === 'stand' && !this.inMud) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = CFG.noise.walkEvery; game.emitNoise(this.x, this.z, CFG.noise.walk, 'step'); }
    } else this.stepT = CFG.noise.walkEvery * 0.5;
    this.animate(dt, sp);
  }

  // đi thẳng vào thùng: thùng trượt theo trục người đang đẩy (chậm hơn đi bộ)
  tryPush(b, dt, game) {
    const P = CFG.player, r = P.radius + 0.02;
    const cx = clamp(this.x, b.minX, b.maxX), cz = clamp(this.z, b.minZ, b.maxZ);
    if (Math.hypot(this.x - cx, this.z - cz) > r) return;
    const o = b.ref, dx = o.x - this.x, dz = o.z - this.z;
    const alongX = Math.abs(dx) > Math.abs(dz), dir = alongX ? Math.sign(dx) : Math.sign(dz), v = alongX ? this.vx : this.vz;
    if (v * dir < 0.5) return;                               // phải đi về phía thùng
    const step = Math.min(Math.abs(v), P.pushSpeed) * dt;
    if (o.tryMove(alongX ? dir * step : 0, alongX ? 0 : dir * step, game.level.solids)) {
      this.pushing = o; game.onPushScrape(o, dt);
      this.vx *= 0.6; this.vz *= 0.6;
    }
  }

  animate(dt, sp) {
    const r = this.rig, ck = this.crouchK, pk = Math.max(this.proneK, this.slideK || 0) * (this.slide ? 0 : 1);
    this.walkPhase += dt * (4 + sp * (pk > 0.5 ? 4 : 2.2));
    const swing = this.moving ? Math.sin(this.walkPhase) * Math.min(1, sp / (pk > 0.5 ? 1.3 : 4)) * 0.8 : 0;
    r.legs[0].rotation.x = swing; r.legs[1].rotation.x = -swing;
    const carrying = (this.holding && this.holding.target);
    r.arms[0].rotation.x = carrying ? -2.9 : -swing * 0.8;
    r.arms[1].rotation.x = carrying ? -2.9 : (this.holding ? -0.9 : swing * 0.8);
    if (pk > 0.5 && !carrying) { r.arms[0].rotation.x = -2.6 + swing * 0.6; r.arms[1].rotation.x = -2.6 - swing * 0.6; } // bò: tay quờ phía trước
    if (this.airborne) { r.legs[0].rotation.x = -0.7; r.legs[1].rotation.x = 0.4; }
    if (this.pushing && !carrying) { r.arms[0].rotation.x = -1.5; r.arms[1].rotation.x = -1.5; }
    if (this.slide) { r.legs[0].rotation.x = -1.3; r.legs[1].rotation.x = -1.0; r.arms[0].rotation.x = -0.6; r.arms[1].rotation.x = 0.5; }
    if (this.vault) { r.legs[0].rotation.x = -1.1; r.legs[1].rotation.x = -0.3; r.arms[0].rotation.x = -2.4; r.arms[1].rotation.x = -2.4; }
    if (this.trapped && this.trapped.type === 'bear') { r.legs[0].rotation.x = 0.5; r.arms[0].rotation.x = -1.6; r.arms[1].rotation.x = -1.6; }
    if (this.trapped && this.trapped.type === 'pitfall') { r.arms[0].rotation.x = -2.8; r.arms[1].rotation.x = -2.8; }
    r.group.position.set(this.x, (this.hidden ? -0.55 : 0) + this.sink + this.y + pk * 0.28 + (this.slide ? 0.3 : 0), this.z);
    r.group.rotation.y = this.facing;
    // dáng: rón rén khi đi, chúi người khi chạy, gập người khi khom, nằm sấp khi bò, ngã khi dính bẫy
    let lean = this.trapped ? (this.trapped.type === 'bear' ? 0.5 : 0) : this.stunT > 0 ? -1.2 : (this.running ? 0.28 : (this.moving ? 0.12 : 0));
    if (!this.trapped && this.stunT <= 0) lean = lerp(lerp(lean, 0.5, ck), 1.5, pk);
    if (this.slide) lean = -1.25;               // trượt ngửa người, chân đi trước
    if (this.pushing) lean = 0.45;
    r.body.rotation.x = lerp(r.body.rotation.x, lean, Math.min(1, dt * 10));
    r.body.position.y = this.stunT > 0 ? 0.25 : (this.moving && pk < 0.5 ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0);
    const s = this.hidden ? 0.82 : 1;
    r.group.scale.set(s, s * (1 - ck * 0.25), s);
  }
}
