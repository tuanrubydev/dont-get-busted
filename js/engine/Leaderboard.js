import { CFG } from '../config.js';
import { SafeStore } from './Protection.js';

/* ============================ Leaderboard (Top 10 Speedrun) ============================
 * Mỗi màn một bảng Top 10, lưu trong localStorage của trình duyệt.
 * Lần đầu mở game, bảng được khởi tạo bằng 10 "cao thủ" giả lập để người chơi có mốc mà phá.
 * ======================================================================================== */
export const Board = {
  NAMES: ['xX_GàVàng_Xx', 'ChóCắnThìChạy', 'TrộmGàKhôngTrộmTim', 'ÔngChủƠiEmXinLỗi', 'Bé.Mít.Speedrun',
    '2k7_TayNhanhHơnNão', 'ĐốngRơmBiếtHết', 'GàRánLàChânÁi', 'BậcThầyNémXương', 'NgườiYêuCủaGàMái'],
  // thời gian giả lập (giây) & ngưỡng hợp lệ theo từng màn — main.js nạp từ meta của các lớp Level
  TIMES: {},
  MIN: {},
  configure(metas) { metas.forEach((m, i) => { this.TIMES[i] = m.simTimes || []; this.MIN[i] = m.minRunTime || CFG.minRunTime; }); },
  minTime(lv) { return this.MIN[lv] !== undefined ? this.MIN[lv] : CFG.minRunTime; },
  key(lv) { return 'dgb-top10-v2-' + lv; },
  tampered: false, // phát hiện bảng bị sửa tay → đã khôi phục
  seed(lv) { return (this.TIMES[lv] || []).map((time, i) => ({ name: this.NAMES[(i + lv * 3) % this.NAMES.length], time, sim: true })); },
  valid(l, lv) { return Array.isArray(l) && l.length <= 10 && l.every((e) => e && typeof e.name === 'string' && e.name.length <= 16 && Number.isFinite(e.time) && e.time >= this.minTime(lv) && e.time < 3600); },
  load(lv) {
    const r = SafeStore.read(this.key(lv));
    if (r.data && this.valid(r.data, lv)) return r.data.slice().sort((a, b) => a.time - b.time);
    if (r.tampered || r.data) this.tampered = true;
    // bản cũ (chưa mã hóa) từ phiên bản trước: nhập lại một lần nếu hợp lệ
    const old = r.tampered ? null : SafeStore.legacy('chicken-thief-top10-v1-' + lv);
    const s = this.valid(old, lv) ? old : this.seed(lv);
    this.save(lv, s); return s;
  },
  save(lv, list) { SafeStore.write(this.key(lv), list); },
  // vị trí (0..9) nếu thời gian này lọt Top 10, ngược lại -1
  placeOf(lv, time) {
    const l = this.load(lv), i = l.findIndex((e) => time < e.time), idx = i < 0 ? l.length : i;
    return idx < 10 ? idx : -1;
  },
  insert(lv, name, time) {
    if (!(time >= this.minTime(lv))) return -1;
    const l = this.load(lv), idx = this.placeOf(lv, time);
    if (idx < 0) return -1;
    l.splice(idx, 0, { name, time, me: true, at: Date.now() });
    this.save(lv, l.slice(0, 10));
    return idx;
  },
  get nick() { try { return localStorage.getItem('chicken-thief-nick') || ''; } catch (_) { return ''; } },
  set nick(v) { try { localStorage.setItem('chicken-thief-nick', v); } catch (_) { /* bỏ qua */ } },
  clean(name) { const s = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16); return s || 'Tên Trộm Ẩn Danh'; },
};

/* Đồng hồ speedrun: chạy từ lúc rời vị trí xuất phát, dừng ngay khi thắng (00:00.00) */
export class SpeedrunTimer {
  constructor() { this.reset(); }
  reset() { this.time = 0; this.running = false; this.stopped = false; }
  update(dt, p) {
    if (this.stopped) return;
    if (!this.running && Math.hypot(p.x - CFG.start.x, p.z - CFG.start.z) > 1.0) this.running = true;
    if (this.running) this.time += dt;
  }
  stop() { this.stopped = true; }
}
