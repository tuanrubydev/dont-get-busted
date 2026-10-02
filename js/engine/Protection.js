/* =====================================================================
 * Bảo vệ phía trình duyệt (chỉ là rào cản làm nản lòng, không tuyệt đối):
 *   SafeStore — lưu localStorage dạng mã hóa + mã kiểm (checksum); bị sửa tay thì bỏ & khôi phục
 *   Guard     — chặn chuột phải, bôi đen, phím tắt DevTools / xem mã nguồn, bẫy debugger
 * Mã nguồn chia mô-đun ES nên không có biến nào nằm ở phạm vi toàn cục (window).
 * ===================================================================== */
import { PROTECT } from '../config.js';

export const SafeStore = {
  SALT: 'dgb-2026|chicken|v2',
  // băm 53 bit (cyrb53) → chuỗi hex
  hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  },
  pack(obj) { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let b = ''; bytes.forEach((x, i) => { b += String.fromCharCode(x ^ ((i * 13 + 91) & 255)); }); return btoa(b); },
  unpack(d) { const b = atob(d), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i) ^ ((i * 13 + 91) & 255); return JSON.parse(new TextDecoder().decode(u)); },
  write(key, obj) {
    try { const d = this.pack(obj); localStorage.setItem(key, JSON.stringify({ v: 2, d, h: this.hash(key + '|' + d + '|' + this.SALT) })); } catch (_) { /* bỏ qua */ }
  },
  // trả về { data } nếu hợp lệ, { tampered: true } nếu bị sửa, {} nếu chưa có
  read(key) {
    let raw; try { raw = localStorage.getItem(key); } catch (_) { return {}; }
    if (!raw) return {};
    try {
      const o = JSON.parse(raw);
      if (!o || o.v !== 2 || typeof o.d !== 'string' || o.h !== this.hash(key + '|' + o.d + '|' + this.SALT)) return { tampered: true };
      return { data: this.unpack(o.d) };
    } catch (_) { return { tampered: true }; }
  },
  legacy(key) { try { const v = JSON.parse(localStorage.getItem(key)); localStorage.removeItem(key); return v; } catch (_) { return null; } },
};

export const Guard = {
  init(game) {
    this.game = game;
    if (!PROTECT) return;
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName || '')) e.preventDefault(); });
    document.addEventListener('dragstart', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      const c = e.code, mod = e.ctrlKey || e.metaKey;
      const block = e.key === 'F12' || c === 'F12'
        || (mod && e.shiftKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyK'].includes(c))   // Ctrl/Cmd+Shift+I/J/C/K
        || (e.metaKey && e.altKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyU'].includes(c)) // Cmd+Option+I/J/C/U (macOS)
        || (mod && !e.shiftKey && c === 'KeyU')                                   // Ctrl+U: xem mã nguồn
        || (mod && c === 'KeyS');                                                 // Ctrl+S: lưu trang
      if (block) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    // bẫy debugger: DevTools đóng thì lệnh debugger không làm gì (≈0 ms); DevTools mở thì trình duyệt dừng lại ở đây
    setInterval(() => {
      const t = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - t > 100) game.lockdown();
    }, 1000);
  },
};
