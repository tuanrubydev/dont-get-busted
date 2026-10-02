/* =====================================================================
 * Cấu hình dùng chung cho mọi màn chơi.
 * Thông số riêng của từng màn (bản đồ, chó, bẫy, mục tiêu...) nằm trong js/levels/*.
 * ===================================================================== */

// đặt false khi phát triển: tắt bẫy debugger / chặn phím, và để lộ window.game cho việc kiểm thử
export const PROTECT = true;

export const CFG = {
  // biên bản đồ & điểm xuất phát của MÀN ĐANG CHƠI (LevelManager ghi đè khi tải màn)
  bounds: { minX: -30, maxX: 30, minZ: -45, maxZ: 45 },
  start: { x: 0, z: -41, r: 2.6 },
  // camera góc nhìn thứ 3 kiểu game bắn súng: sát sau lưng, lệch sang vai phải, ngang tầm đầu/vai
  camera: { dist: 2.2, minDist: 1.8, maxDist: 4.5, height: 1.6, shoulder: 0.6, pitch: 0.08, minPitch: -0.5, maxPitch: 0.85,
    sens: 0.0022, dragSpeed: 0.005, keyTurn: 2.4, fov: 55 },
  fog: { play: 0.015, title: 0.0055 },
  // 3 kiểu di chuyển: đi bộ (walk) · chạy nhanh (run = 1.8 × đi bộ, tốn thể lực, rất ồn) · bò trườn (prone: hệ số tốc độ)
  // stealth: hệ số tầm nhìn của chó khi nhìn thấy bạn ở tư thế đó
  player: { walk: 4.3, run: 7.74, carry: 0.88, radius: 0.42, accel: 18, mudAccel: 2.4, mudSpeed: 0.55, stun: 1.4,
    prone: 0.32, stealth: { stand: 1, prone: 0.45 },
    // thể lực chạy nhanh (giây): cạn thì phải đi bộ cho tới khi hồi lại tối thiểu `resume`
    stamina: { max: 21, drain: 1, regen: 0.5, resume: 3 },
    jumpV: 4.8, gravity: 14, vaultTime: 0.85, vaultReach: 1.0, slideSpeed: 8.6, slideTime: 0.7, pushSpeed: 1.8 },
  // chó rượt nhanh hơn người chạy 15% (7.2 × 1.15): bị phát hiện ngoài bụi cây là chắc chắn bị bắt
  // hunt: RƯỢT ĐUỔI DỮ DỘI sau khi Gà Vàng kêu — nhanh hơn người ôm gà đi bộ (3.8 m/s) nhưng chậm hơn khi ôm gà chạy nhanh (6.8 m/s)
  dog: { patrol: 2.6, back: 3.2, investigate: 4.5, rush: 6.0, chase: 8.3, hunt: 6.1, huntDelay: 0.7, radius: 0.5, catchDist: 0.95, closeSense: 2.0, guardSense: 2.6, search: 2.6, susBase: 3.5, susNear: 6 },
  // tiếng ồn (bán kính, mét): đi thường có tiếng bước chân nhỏ, bò thì im lặng; chạy, tiếp đất, trèo rào thì to
  noise: { run: 7, runEvery: 0.32, walk: 3, walkEvery: 0.5, land: 4.5, vault: 6, cluck: 4.5, rock: 8, slide: 4.5, push: 4, distract: 13 },
  // tầm nhìn của người chơi (sương chiến tranh): nón phía trước + một vòng nhỏ quanh người
  view: { fov: 120, range: 34, near: 3.2, dark: 0.2 },
  // 5 loại bẫy ngụy trang (20 cái mỗi màn). react: alarm = cả đàn lập tức rượt;
  // investigate = chó trong bán kính chạy tới kiểm tra (kể cả đang gặm xương); nearest = con gần nhất tới xem.
  // remote: bán kính tiếng động khi bẫy bị vật ném làm sập từ xa (chó tới kiểm tra chỗ bẫy, không rượt người)
  traps: {
    pitfall: { name: 'Hố sập', text: 'RẦM!', stun: 2.0, react: 'alarm', remote: 18 },
    tripwire: { name: 'Dây vấp', text: 'SÚY!', stun: 0.5, react: 'investigate', radius: 35, remote: 16 },
    flare: { name: 'Mìn pháo sáng', text: 'PÍIIIP!', stun: 0.6, react: 'alarm', remote: 30 },
    bear: { name: 'Bẫy kẹp gấu', text: 'CLANG!', stun: 2.5, react: 'investigate', radius: 30, remote: 18 },
    bucket: { name: 'Xô sắt', text: 'CLANG!', stun: 0.3, react: 'nearest', remote: 14 },
    branch: { name: 'Cành khô', text: 'CẠCH!', stun: 0, react: 'nearest', remote: 10 },
  },
  rockReach: 1.8,
  // kiểm tra hợp lệ speedrun mặc định (mỗi màn có thể đặt riêng qua meta.minRunTime)
  minRunTime: 20,
  // ném: từ thả nhẹ sát chân (1 m) tới ném cực mạnh 28 m (gấp đôi trước); vận tốc bay ~1.6x
  throwMin: 1, throwMax: 28, throwStart: 12, throwPowerRate: 13,
  eatTime: 6,     // thời gian gặm trung bình (dùng cho hiệu ứng xương nhỏ dần)
  // MỒI XƯƠNG: rơi xuống BẤT KỲ đâu → phát sóng âm bán kính `radius`; mọi con chó trong vòng này chuyển sang
  // ATTRACTED, bỏ chốt gác, chạy thẳng tới đúng điểm rơi rồi gặm / sục sạo 6.5 giây
  bait: { radius: 28, eatMin: 6.5, eatMax: 6.5, reach: 2.2 },
  interact: 1.5,
  boneReach: 1.2,
};
