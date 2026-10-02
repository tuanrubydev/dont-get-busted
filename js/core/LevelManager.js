/* =====================================================================
 * LevelManager — trình quản lý & chuyển màn chơi.
 *   LevelManager.loadLevel(1) / loadLevel(2) ... (đánh số từ 1, theo thứ tự trong REGISTRY)
 *   Trước khi tải màn mới: gọi cleanup() của màn cũ → gỡ khỏi cảnh, giải phóng geometry / material / texture
 *   (chơi lại CHÍNH màn đó thì màn được giữ lại cảnh tĩnh để tải nhanh hơn).
 *   Thêm màn mới: viết một lớp kế thừa LevelBase trong js/levels/ rồi thêm vào REGISTRY.
 * ===================================================================== */
import { CFG } from '../config.js';
import { Level1_Farm } from '../levels/Level1_Farm.js';
import { Level2_Urban } from '../levels/Level2_Urban.js';

export const REGISTRY = [Level1_Farm, Level2_Urban];

// thẻ nhiệm vụ ở màn hình chính: các màn đã có + một chỗ trống "sắp ra mắt"
export const MISSIONS = [
  ...REGISTRY.map((Cls, i) => ({ ...Cls.meta, level: i })),
  { code: `Nhiệm vụ ${REGISTRY.length + 1}`, title: '???', place: 'Đang lên kế hoạch', soon: true },
];

export class LevelManager {
  constructor(game) { this.game = game; this.current = null; this.index = -1; }

  get count() { return REGISTRY.length; }

  // n: số thứ tự màn, bắt đầu từ 1
  loadLevel(n) {
    const index = n - 1, Cls = REGISTRY[index];
    if (!Cls) throw new Error(`Không có màn ${n}`);
    const prev = this.current;
    if (prev) prev.cleanup(prev.constructor === Cls); // dọn màn cũ (giữ cảnh tĩnh nếu chơi lại cùng màn)
    // biên bản đồ & điểm xuất phát của màn mới: mọi hệ thống chung (va chạm, tìm đường, minimap...) đọc từ CFG
    Object.assign(CFG.bounds, Cls.bounds);
    Object.assign(CFG.start, Cls.start);
    const level = new Cls(this.game);
    level.init();
    this.current = level; this.index = index;
    return level;
  }
}
