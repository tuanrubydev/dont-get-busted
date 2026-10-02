/* =====================================================================
 * Device — nhận diện thiết bị & tối ưu cho web mobile.
 *   Device.mobile / tablet / touch      : điện thoại / máy tính bảng / có màn cảm ứng
 *   Device.profile                      : cấu hình đồ hoạ khởi điểm (pixelRatio, shadow map, khử răng cưa)
 *   Device.blockBrowserGestures()       : chặn chạm đúp phóng to, véo phóng to, vuốt tải lại trang, cuộn trang
 *   Device.watchOrientation()           : bật lớp nhắc "xoay ngang màn hình" khi cầm dọc
 *   Device.enterImmersive()             : toàn màn hình + khoá xoay ngang (trình duyệt nào hỗ trợ thì dùng)
 *   Device.toggleFullscreen()           : nút "Toàn màn hình" ở góc HUD (PC & mobile) — ẩn thanh URL / tab trình duyệt
 *   QualityScaler                       : tự hạ / nâng độ phân giải & bóng đổ theo FPS thực tế
 * ===================================================================== */

const ua = navigator.userAgent || '';
const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
const touchPoints = navigator.maxTouchPoints || 0;
// iPadOS 13+ tự nhận là "Macintosh" → nhận ra bằng số điểm chạm
const iPadOS = /Macintosh/.test(ua) && touchPoints > 1;
const mobileUA = /Android|iPhone|iPod|Windows Phone|Mobi|Opera Mini|IEMobile/i.test(ua);
const tabletUA = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobi))/i.test(ua) || iPadOS;
const shortSide = Math.min(screen.width || innerWidth, screen.height || innerHeight);

export const Device = {
  touch: coarse || touchPoints > 0,
  // máy cảm ứng có màn nhỏ / UA di động → dùng bộ điều khiển cảm ứng; laptop cảm ứng có chuột vẫn chơi bằng phím
  mobile: mobileUA || tabletUA || (coarse && shortSide <= 1024),
  tablet: tabletUA || (coarse && shortSide >= 600 && shortSide <= 1024),
  ios: /iPhone|iPad|iPod/.test(ua) || iPadOS,

  // cấu hình đồ hoạ khởi điểm: mobile giới hạn pixelRatio ≤ 1.5, bóng đổ 1024 (máy yếu xuống 512 qua QualityScaler)
  get profile() {
    const dpr = window.devicePixelRatio || 1;
    if (this.mobile) {
      const lowMem = (navigator.deviceMemory || 4) <= 3 || (navigator.hardwareConcurrency || 4) <= 4;
      return { pixelRatio: Math.min(dpr, lowMem ? 1.25 : 1.5), minPixelRatio: 0.75, maxPixelRatio: Math.min(dpr, 1.5),
        shadow: lowMem ? 512 : 1024, minShadow: 512, antialias: false, softShadows: false, targetFps: 60 };
    }
    return { pixelRatio: Math.min(dpr, 2), minPixelRatio: 1, maxPixelRatio: Math.min(dpr, 2), shadow: 2048, minShadow: 1024, antialias: true, softShadows: true, targetFps: 60 };
  },

  // chặn mọi thao tác mặc định của trình duyệt mobile có thể làm hỏng ván chơi
  blockBrowserGestures() {
    // vùng được phép cuộn (danh sách bảng xếp hạng, bảng nhiệm vụ dài...)
    const scrollable = (el) => !!(el && el.closest && el.closest('.overlay, .scroll'));
    // véo / phóng to kiểu Safari
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    // nhiều ngón (véo phóng to) & vuốt kéo trang (pull-to-refresh, cuộn) khi không ở vùng được phép cuộn
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1 || !scrollable(e.target)) e.preventDefault();
    }, { passive: false });
    // chạm đúp phóng to: bỏ cú chạm thứ hai nếu đến quá nhanh (iOS cũ không tôn trọng touch-action)
    let lastEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = performance.now();
      if (now - lastEnd < 320 && !e.target.closest('input, textarea')) e.preventDefault();
      lastEnd = now;
    }, { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    // menu giữ lâu (lưu ảnh, chọn chữ) trên mobile
    document.addEventListener('contextmenu', (e) => { if (this.touch) e.preventDefault(); });
  },

  // màn hình dọc → hiện lời nhắc xoay ngang (chỉ trên thiết bị di động)
  watchOrientation(onChange) {
    const mq = window.matchMedia('(orientation: portrait)');
    const apply = () => {
      const portrait = this.mobile && mq.matches;
      document.body.classList.toggle('portrait', portrait);
      if (onChange) onChange(portrait);
    };
    if (mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
    window.addEventListener('resize', apply);
    apply();
  },
  get portrait() { return document.body.classList.contains('portrait'); },

  // trình duyệt có cho trang web vào toàn màn hình không (iPhone Safari: không — dùng "Thêm vào MH chính" để tràn viền)
  get canFullscreen() {
    const el = document.documentElement;
    return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(el.requestFullscreen || el.webkitRequestFullscreen);
  },
  get isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
  async toggleFullscreen() {
    if (this.isFullscreen) {
      try { if (document.exitFullscreen) await document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) { /* bỏ qua */ }
      return;
    }
    if (this.mobile) return this.enterImmersive();
    const el = document.documentElement;
    try { if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' }); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen(); } catch (e) { /* bị chặn */ }
  },

  // toàn màn hình + khoá ngang: phải gọi trong một cú chạm của người chơi; trình duyệt không hỗ trợ thì bỏ qua êm
  async enterImmersive() {
    if (!this.mobile) return;
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen && !document.webkitFullscreenElement) el.webkitRequestFullscreen();
    } catch (e) { /* iOS Safari không cho toàn màn hình trang web: vẫn chơi bình thường */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { /* không hỗ trợ khoá xoay */ }
  },
};

/* --------------------------------------------------------------------
 * QualityScaler — cân bằng đồ hoạ động: đo FPS trung bình mỗi ~2 giây,
 *   < 50 FPS  → hạ pixelRatio 0.25 (tới mức tối thiểu), rồi hạ bóng đổ 1024 → 512
 *   ≥ 58 FPS liên tục ~8 giây → nâng dần lại (không vượt mức tối đa của thiết bị)
 * Giữ game quanh 60 FPS, đỡ nóng máy & tụt pin. Bỏ qua khung hình khi tab bị ẩn / đang tải màn.
 * -------------------------------------------------------------------- */
export class QualityScaler {
  constructor(world, profile) {
    this.world = world; this.P = profile;
    this.ratio = profile.pixelRatio; this.shadow = profile.shadow;
    this.acc = 0; this.frames = 0; this.good = 0; this.cool = 0;
  }
  // dt: thời gian thực của khung hình (giây)
  update(dt) {
    if (dt <= 0 || dt > 0.5 || document.hidden) return; // khung hình bị treo vì tải màn / đổi tab: không tính
    this.acc += dt; this.frames++;
    if (this.acc < 2) return;
    const fps = this.frames / this.acc; this.acc = 0; this.frames = 0;
    this.fps = fps;
    if (this.cool > 0) { this.cool--; return; } // vừa đổi xong: chờ một nhịp đo cho ổn định
    if (fps < 50) {
      this.good = 0;
      if (this.ratio > this.P.minPixelRatio + 0.01) this.setRatio(this.ratio - 0.25);
      else if (this.shadow > this.P.minShadow) this.setShadow(this.shadow / 2);
    } else if (fps >= 58) {
      if (++this.good >= 4) {
        this.good = 0;
        if (this.shadow < this.P.shadow) this.setShadow(this.shadow * 2);
        else if (this.ratio < this.P.maxPixelRatio - 0.01) this.setRatio(this.ratio + 0.25);
      }
    } else this.good = 0;
  }
  setRatio(r) {
    this.ratio = Math.max(this.P.minPixelRatio, Math.min(this.P.maxPixelRatio, r));
    this.world.setPixelRatio(this.ratio); this.cool = 1;
  }
  setShadow(s) { this.shadow = s; this.world.setShadowSize(s); this.cool = 1; }
}
