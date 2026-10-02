/* UI — HUD, bảng nhiệm vụ, thắng/thua, bảng xếp hạng, nhãn tương tác, thanh lực ném. */
import { THREE } from './three.js';
import { CFG } from '../config.js';
import { fmtRun } from './utils.js';
import { Board } from './Leaderboard.js';
import { MISSIONS } from '../core/LevelManager.js';

export class UI {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.el = {
      hud: $('hud'), title: $('title'), intro: $('intro'), result: $('result'), busted: $('busted'),
      bossOver: $('bossOver'), winOver: $('winOver'), lbOver: $('lbOver'),
      speed: $('speed'), speedTime: $('speedTime'),
      status: $('status'), statusText: $('statusText'),
      prompt: $('prompt'), power: $('power'), promptText: $('promptText'), toast: $('toast'), flash: $('flash'),
    };
    this.lastBag = ''; this.toastT = 0;
  }
  show(name) { for (const n of ['title', 'intro', 'result', 'bossOver', 'winOver', 'lbOver']) this.el[n].hidden = n !== name; }
  hideAll() { this.show(null); }

  renderMissions(progress, pulse) {
    const root = this.$('missionCards'); root.innerHTML = '';
    MISSIONS.forEach((M) => {
      const b = document.createElement('button'); b.className = 'mcard' + (pulse && M.soon ? ' pulse' : ''); b.type = 'button';
      b.disabled = !!M.soon;
      b.innerHTML = '<span class="n"></span><span class="t"></span><span class="p"></span><span class="g"></span><span class="rec"></span>';
      b.querySelector('.n').textContent = M.code;
      b.querySelector('.t').textContent = M.title;
      b.querySelector('.p').textContent = M.place;
      b.querySelector('.g').textContent = M.goal;
      if (M.soon || M.beta) { const s = document.createElement('span'); s.className = 'soon'; s.textContent = M.soon ? 'Sắp ra mắt' : 'Bản thử'; b.appendChild(s); }
      if (!M.soon) {
        const best = progress.best[M.level], stars = progress.stars[M.level] || 0;
        b.querySelector('.rec').textContent = best ? `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}  Kỷ lục của bạn ${fmtRun(best)}` : 'Chưa hoàn thành';
        b.addEventListener('click', () => this.game.openIntro(M.level));
      }
      root.appendChild(b);
    });
  }

  showIntro(i) {
    const M = MISSIONS.find((m) => m.level === i), L = M;
    this.$('iDiff').textContent = `${M.code} · ${L.diff}`;
    this.$('iTitle').textContent = M.title;
    this.$('iPlace').textContent = M.place;
    this.$('iGoal').textContent = M.goal;
    const ul = this.$('iDanger'); ul.innerHTML = '';
    for (const d of M.danger) { const li = document.createElement('li'); li.textContent = d; ul.appendChild(li); }
    this.$('iWin').textContent = M.win;
    this.$('iLose').textContent = M.lose;
    this.$('iIntel').textContent = M.intel;
    const top = Board.load(i)[0];
    this.$('iRecord').textContent = top ? `Kỷ lục Top 1 hiện tại: ${fmtRun(top.time)} (${top.name})` : '';
    this.show('intro');
    this.$('startBtn').focus();
  }

  setLevel(i) {
    // HUD không còn khung nhiệm vụ: mục tiêu chỉ hiện ở Bảng nhiệm vụ trước trận, trong trận người chơi tự khám phá
    void i;
    this.el.busted.classList.remove('on');
    this.el.toast.hidden = true; this.toastT = 0;
  }

  setPower(d) {
    const k = (d - CFG.throwMin) / (CFG.throwMax - CFG.throwMin);
    this.$('powerFill').style.width = (6 + k * 94).toFixed(1) + '%';
    this.$('powerVal').textContent = d.toFixed(1) + ' m';
  }
  toast(msg, secs = 2.6) { this.el.toast.textContent = msg; this.el.toast.hidden = false; this.toastT = secs; }
  flash(color) { const f = this.el.flash; f.style.background = color || '#fff'; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

  showResult(reason) {
    this.$('rEyebrow').textContent = 'Nhiệm vụ thất bại · Bạn đã bị tóm';
    this.$('rTitle').textContent = 'BUSTED!';
    this.$('rText').textContent = reason;
    this.show('result');
    this.$('retryBtn').focus();
  }

  // màn hình thất bại đặc biệt (chữ do màn cung cấp, vd. "BUSTED BY THE FARM OWNER!")
  showBoss(text) {
    if (text) { this.$('bossTitle').textContent = text.title; this.$('bossTroll').textContent = text.troll; }
    this.show('bossOver'); this.$('bossRetryBtn').focus();
  }

  // bảng Top 10: list đã lưu; pending = { idx, time } là dòng của người chơi chưa ghi danh; mark = vị trí vừa ghi danh
  renderBoard(tbody, list, pending, mark) {
    tbody.innerHTML = '';
    const rows = list.map((e) => ({ ...e }));
    if (pending) rows.splice(pending.idx, 0, { name: Board.nick || '???', time: pending.time, pending: true });
    rows.slice(0, 10).forEach((e, i) => {
      const tr = document.createElement('tr');
      if (e.pending || i === mark) tr.className = 'me';
      if (i === 0) tr.classList.add('gold');
      for (const v of [i + 1, e.name, fmtRun(e.time)]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
      if (e.me && !e.pending && i !== mark) tr.classList.add('mine');
      tbody.appendChild(tr);
    });
    if (!rows.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 3; td.textContent = 'Chưa có ai.'; tr.appendChild(td); tbody.appendChild(tr); }
  }

  showWin(run) {
    const M = MISSIONS.find((m) => m.level === run.level), L = M;
    this.$('wEyebrow').textContent = `${M.code} · ${M.title}`;
    this.$('wTime').textContent = fmtRun(run.time);
    this.$('wPb').textContent = fmtRun(run.best);
    this.$('wPar').textContent = fmtRun(L.par);
    this.$('wStars').textContent = '★'.repeat(run.stars) + '☆'.repeat(3 - run.stars);
    this.$('wBoardTitle').textContent = `Top 10 Speedrun · ${M.code}`;
    const rec = this.$('newRecord');
    rec.hidden = run.place !== 0;
    this.$('invalidRun').hidden = !run.invalid;
    const form = this.$('nameForm'), list = Board.load(run.level);
    form.hidden = run.place < 0;
    this.$('notTop').hidden = run.place >= 0 || run.invalid;
    if (run.place < 0) this.$('wCut').textContent = fmtRun(list[list.length - 1].time);
    else {
      this.$('wRank').textContent = '#' + (run.place + 1);
      const inp = this.$('nameInput'); inp.value = Board.nick;
    }
    this.renderBoard(this.$('wBoard'), list, run.place >= 0 ? { idx: run.place, time: run.time } : null, -1);
    this.show('winOver');
    if (run.place >= 0) { const inp = this.$('nameInput'); setTimeout(() => { inp.focus(); inp.select(); }, 60); }
    else this.$('winRetryBtn').focus();
  }

  savedWin(run, idx) {
    this.$('nameForm').hidden = true;
    this.renderBoard(this.$('wBoard'), Board.load(run.level), null, idx);
    this.$('winRetryBtn').focus();
  }

  showLeaderboard(sel) {
    const tabs = this.$('lbTabs'); tabs.innerHTML = '';
    MISSIONS.forEach((M, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (i === sel ? ' on' : '');
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === sel ? 'true' : 'false');
      b.textContent = M.soon ? `${M.code} (sắp ra mắt)` : M.code;
      b.addEventListener('click', () => this.showLeaderboard(i));
      tabs.appendChild(b);
    });
    const M = MISSIONS[sel];
    this.$('lbWarn').hidden = !Board.tampered;
    this.$('lbSub').textContent = M.soon ? `${M.title} · ${M.place}` : `${M.title} · tính từ lúc rời vạch xuất phát tới lúc tẩu thoát`;
    this.$('lbTable').hidden = !!M.soon;
    this.$('lbSoon').hidden = !M.soon;
    if (!M.soon) this.renderBoard(this.$('lbBoard'), Board.load(M.level), null, -1);
    this.$('lbWarn').hidden = !Board.tampered;
    this.show('lbOver');
    this.lbSel = sel;
  }

  update(game, dt) {
    const p = game.player, el = this.el;
    el.speedTime.textContent = fmtRun(game.runTime);
    if (this.lastStance !== p.stance) {
      this.lastStance = p.stance;
      this.$('stProne').classList.toggle('on', p.stance === 'prone');
    }
    // trạng thái di chuyển & thanh thể lực chạy nhanh
    const mode = p.stance === 'prone' ? 'prone' : p.running ? 'run' : 'walk';
    if (this.lastMode !== mode) { this.lastMode = mode; this.$('stStand').classList.toggle('on', mode === 'walk'); this.$('stRun').classList.toggle('on', mode === 'run'); }
    const k = p.staminaK;
    if (Math.abs((this.lastSta ?? -1) - k) > 0.004) { this.lastSta = k; this.$('staFill').style.transform = `scaleX(${k.toFixed(3)})`; }
    this.$('stamina').classList.toggle('low', p.exhausted || k < 0.25);
    el.speed.classList.toggle('waiting', !game.runOn);
    el.speed.classList.toggle('stopped', game.state === 'victory');
    // trạng thái bị phát hiện
    const dogs = game.level.dogs;
    let cls = '', txt = 'Chưa bị phát hiện';
    if (game.state === 'boss') { cls = 'alarm'; txt = 'ÔNG CHỦ TRANG TRẠI!'; }
    else if (dogs.some((d) => d.state === 'chase')) { cls = 'alarm'; txt = 'BỊ PHÁT HIỆN! Chạy mau!'; }
    else if (p.hidden) { cls = 'hidden'; txt = 'Đang nấp trong bụi cây'; }
    else if (dogs.some((d) => d.sus > 0.15 || d.state === 'investigate' || d.state === 'search')) { cls = 'sus'; txt = 'Chó đang nghi ngờ...'; }
    else if (p.running) { cls = 'sus'; txt = 'Đang chạy: gây tiếng ồn'; }
    el.status.className = 'glass ' + cls;
    el.statusText.textContent = txt;
    // gợi ý tương tác
    const act = game.state === 'play' ? game.availableAction() : null;
    const tap = act && act.type === 'throw' ? act.tap : act;
    const world = tap && (tap.focus || tap.box) ? tap : null;
    game.highlight.set(world ? (world.focus || world.box) : null);
    game.highlight.update(game.time);
    const tag = this.$('worldTag');
    if (world) {
      const keys = tap.type === 'vault' ? '<kbd>Space</kbd><kbd>E</kbd>' : '<kbd>E</kbd>';
      const txt = tap.label.replace('Bấm [E] để ', '');
      if (tag.dataset.t !== keys + txt) { tag.dataset.t = keys + txt; tag.innerHTML = keys; tag.appendChild(document.createTextNode(' ' + txt)); }
      const a = game.highlight.anchor;
      game.fx.place(tag, a.x, a.y, a.z, game.world.camera, game.container.clientWidth, game.container.clientHeight, this._v || (this._v = new THREE.Vector3()));
      tag.hidden = tag.style.display === 'none';
    } else tag.hidden = true;
    // thanh nhắc dưới đáy: chỉ còn cho việc ngắm/ném và các gợi ý không gắn với vật nào
    let bottom = null;
    if (act && act.type === 'throw') bottom = { label: `Giữ [E]: ngắm ném ${game.player.holding.conf ? game.player.holding.conf.name : 'xương'}${world ? '' : (act.tap ? ' · Nhấn: ' + act.tap.label : '')}`, raw: true };
    else if (act && !world) bottom = act;
    el.prompt.hidden = !bottom;
    if (bottom) { el.promptText.textContent = bottom.label; el.prompt.classList.toggle('raw', !!bottom.raw); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) el.toast.hidden = true; }
  }
}
