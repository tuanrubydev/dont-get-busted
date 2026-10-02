# Don't Get Busted! 3D

Game lén lút (stealth puzzle) + speedrun 3D chạy trên trình duyệt, viết bằng **ES Modules** (JavaScript thuần, không cần bước build). Three.js r128 tải qua CDN cdnjs; mọi mô hình dựng bằng khối hình học, âm thanh tổng hợp bằng Web Audio API.

Phần `<head>` của `index.html` có đủ thẻ SEO: title, description, keywords, robots, Open Graph, Twitter Card, favicon SVG và dữ liệu có cấu trúc `VideoGame` (JSON-LD). Ảnh `og:image` / `twitter:image` hiện là ảnh giữ chỗ: khi xuất bản, hãy thay bằng ảnh 1200×630 thật.

## Cấu trúc thư mục

```
web-game/
├── index.html                 # trang chính: meta SEO + khung UI; chỉ nhúng three.min.js và js/main.js
├── css/style.css              # toàn bộ giao diện: HUD, overlay, minimap, tâm ngắm, bảng xếp hạng, nút cảm ứng
├── js/
│   ├── main.js                # entry point: lớp Game (vòng lặp, luồng màn hình, tương tác chung, tiếng động)
│   ├── config.js              # cấu hình dùng chung (CFG) + cờ PROTECT
│   ├── engine/
│   │   ├── three.js           # cầu nối tới window.THREE
│   │   ├── World.js           # renderer, scene, camera, ánh trăng + bóng mềm, sương mù, bầu trời
│   │   ├── CameraManager.js   # camera sát vai phải, Pointer Lock, rung, zoom FOV, cảnh cắt
│   │   ├── AudioManager.js    # Web Audio: bẫy, bước chân, jumpscare, còi, pháo hoa...
│   │   ├── InputManager.js    # bàn phím (W A S D, Shift, C, Z, Space, E...) + điều khiển cảm ứng
│   │   ├── Protection.js      # chặn F12 / chuột phải / bôi đen, bẫy debugger, lưu trữ mã hóa (SafeStore)
│   │   ├── Leaderboard.js     # Top 10 theo màn + đồng hồ speedrun (SpeedrunTimer)
│   │   ├── UI.js, FX.js       # HUD & các bảng; hiệu ứng hạt, chữ nổi, pháo hoa
│   │   ├── FogOfWar.js, Minimap.js, Highlighter.js  # tầm nhìn giới hạn, bản đồ nhỏ, viền sáng vật tương tác
│   │   ├── Models.js          # vật liệu PBR + mô hình khối (tên trộm, chó, gà...) + hàng rào
│   │   └── utils.js           # toán, va chạm AABB, tìm đường A*
│   ├── core/
│   │   ├── Player.js          # tên trộm: khom / bò / nhảy / trèo / trượt / đẩy, cầm đồ & mục tiêu
│   │   ├── Dog.js             # AI lính canh (chó, bảo vệ): gác, tuần, nghe, rượt
│   │   ├── TrapSystem.js      # 20 bẫy vô hình (giải mã từ chuỗi secret) + phá bẫy bằng vật ném
│   │   ├── Entities.js        # xương, đá/cành/xô, bụi cây, bùn, thùng đẩy, thùng phuy, lưới thép
│   │   └── LevelManager.js    # danh sách màn (REGISTRY), loadLevel(n), dọn bộ nhớ màn cũ
│   └── levels/
│       ├── LevelBase.js       # lớp cơ sở: init(), update(delta), checkWinCondition(), checkFailCondition(), cleanup()
│       ├── Level1_Farm.js     # Màn 1: trang trại, chuồng gà, ổ chó + xương, đống rơm, Ông chủ ở cổng
│       └── Level2_Urban.js    # Màn 2 (khung mẫu, chơi thử được): bảo vệ tuần tra, camera an ninh, chó cảnh
├── archive/                   # các bản cũ một-file (Rừng Thú Săn, Don't Get Busted! bản một file)
├── Dockerfile, docker-compose.yml, nginx.conf
```

## Chạy game

ES Modules không chạy khi mở file trực tiếp (`file://`), cần một máy chủ web:

| Cách | Lệnh | Địa chỉ |
|---|---|---|
| Docker (bản đóng gói) | `docker compose up -d --build` | http://localhost:8080 |
| Docker (dev, sửa là thấy) | `docker compose --profile dev up dev` | http://localhost:5173 |
| Không cần Docker | `python3 -m http.server 8000` (chạy trong thư mục này) | http://localhost:8000 |

Khi phát triển, đặt `export const PROTECT = false;` trong `js/config.js` để tắt bẫy debugger / chặn phím (nếu không, mở DevTools sẽ khóa ván chơi). Khi đó `window.game` cũng được để lộ cho việc kiểm thử.

## Thêm một màn chơi mới

1. Tạo `js/levels/Level3_Ten.js` với lớp `export class Level3_Ten extends LevelBase`.
2. Khai báo `static meta` (tên, địa điểm, mục tiêu, cảnh báo, `goals` trên HUD, `par`, `simTimes` cho bảng xếp hạng), `static bounds`, `static start`.
3. Viết `init()`: gọi `super.init()`, dựng cảnh vào `this.root`, đặt `this.solids = this.staticSolids()`, rồi `this.buildCommon(DATA, secret)` để có sẵn hàng rào, thùng, bụi cây, đồ ném, lính canh, bẫy, lưới tìm đường.
4. Ghi đè các hook cần thiết: `update(delta)`, `checkWinCondition()`, `checkFailCondition()`, `interactions()` / `doAction()` (bắt mục tiêu), `drawMinimap()`, `bustReason()`, cảnh cắt (`startFailCinematic` / `updateCinematic` / `cinematicCamera`).
5. Thêm lớp vào `REGISTRY` trong `js/core/LevelManager.js`. Màn hình chọn nhiệm vụ, bảng nhiệm vụ và bảng xếp hạng tự cập nhật.

Mọi thứ của màn được gắn vào `level.root`; `cleanup()` gỡ và giải phóng geometry / material khi chuyển màn.

## Nhiệm vụ 2 (khung mẫu)

Khu đô thị Sao Mai: bế chú chó cảnh trong vườn toà nhà cao cấp rồi mang lên xe tải ở góc đông nam. Có 3 bảo vệ (1 gác cổng vườn, 2 tuần tra; chạy chậm hơn bạn một chút) và 2 camera an ninh quét qua lại: lọt vào ống kính đủ lâu là hú còi, mọi bảo vệ lao tới. Chưa có bẫy và cư dân.

## Chuỗi nhiệm vụ

| Nhiệm vụ | Bối cảnh | Trạng thái |
|---|---|---|
| 1. Trộm Gà Trống Vàng | Trang trại Đồi Gió, 2 giờ sáng | Chơi được |
| 2. Trộm Chó Cảnh | Khu đô thị, nửa đêm | Bản thử (khung mẫu chơi được) |
| 3. ??? | Đang lên kế hoạch | Sắp ra mắt |

Trước mỗi nhiệm vụ có **Bảng nhiệm vụ** (mục tiêu, cảnh báo, điều kiện thắng/thua, tin tình báo).

## Nhiệm vụ 1: luật chơi

- Không có gợi ý chỉ đường. Tự quan sát, thất bại, ghi nhớ.
- Đàn chó canh có thính giác tốt, tầm nhìn rộng, chạy nhanh hơn bạn 15% và không mất dấu.
- Xương trong ổ chó là thứ duy nhất làm chúng rời vị trí, nếu ném đúng chỗ.
- **20 bẫy vô hình** (không nhìn thấy cho tới khi sập: chỉ biết vị trí bằng cách giẫm phải hoặc ném thử vật vào), 5 loại: hố sập (tụt xuống hố 2 giây, cả đàn rượt), dây vấp (nỏ bắn tên "SÚY!", chó tới kiểm tra), mìn pháo sáng (pháo đỏ, khói màu, còi rít, cả đàn rượt), bẫy kẹp gấu (kẹp chân 2,5 giây, chó gần đó tới), xô sắt / cành khô ("CLANG!" / "CẠCH!", con chó gần nhất tới xem).
- **Phá bẫy từ xa**: ném xương hoặc hòn đá (nhặt rải rác trên bản đồ) trúng bẫy thì bẫy sập và hỏng hẳn, đi qua an toàn, nhưng tiếng động vẫn kéo chó gần đó tới kiểm tra. Ném xương vào bẫy là mất xương. Chó không ăn đá.
- **Ôm gà quay về cổng chính**: Ông chủ trang trại bước ra từ bóng tối (jumpscare) → *BUSTED BY THE FARM OWNER!*
- Lối thoát thật nằm ở nơi khác trong trang trại. Chỉ khi đã ôm gà mới mở được.

## Kỹ năng lén lút

| Phím | Kỹ năng | Ghi chú |
|---|---|---|
| `C` | Khom (bật/tắt) | Đi chậm, **không có tiếng bước chân**, chó khó thấy hơn (tầm nhìn chó còn 70%), camera hạ thấp |
| `Z` | Nằm bò (bật/tắt) | Rất chậm, chó chỉ thấy ở 45% tầm nhìn; nằm trong **bụi cỏ cao** thì chỉ bị phát hiện khi chó đánh hơi sát; chui qua **lỗ dưới hàng rào** |
| `Space` | Nhảy | Nhảy qua khúc gỗ đổ, vũng bùn, chỗ nghi có bẫy (lơ lửng thì bẫy không sập); tiếp đất có tiếng động nhỏ |
| `Shift` | Chạy nhanh | Nhanh nhưng ồn, kéo chó lại gần |
| `E` gần rào thấp | Trèo qua hàng rào | Tạo đường tắt, nhưng tiếng "cọt kẹt" kéo chó; không trèo được rào biên, tường rơm |

## Vượt chướng ngại & tương tác vật thể

- **Trèo qua** (`Space` hoặc `E` khi áp sát): mọi vật thấp hơn 1,5 m (hàng rào gỗ, rào sân gà, thùng gỗ, đống củi, thùng phuy, xe kéo, khúc gỗ). Không trèo được tường rơm, rào biên, nhà, cuộn rơm lớn. Trèo có tiếng "cọt kẹt".
- **Chui gầm**: nằm bò (`Z`) hoặc trượt dài (`Shift` + `C` khi đang chạy) để lọt qua lỗ dưới hàng rào và gầm xe kéo trong mê cung phía nam.
- **Nhặt để ném** (`E`): hòn đá (tiếng vừa), cành khô (tiếng nhỏ), xô rỗng (tiếng rất to). Ném trúng bẫy thì phá bẫy từ xa.
- **Đẩy** thùng gỗ / xe rác: đi thẳng vào để đẩy trượt, hoặc bấm `E` để đẩy một đoạn. Thùng che được tầm nhìn của chó; đẩy có tiếng ken két.
- **Tiếng động giả** (`E`): đá thùng phuy rỗng hoặc rung tấm lưới thép ở rào biên, chó trong bán kính 13 m chạy tới xem.
- Vật trong tầm tương tác có **viền sáng** và nhãn nổi trên đầu, ví dụ `[E] Nhặt hòn đá`, `[Space][E] Trèo qua`, `[E] Đẩy thùng`.

Đi bộ bình thường cũng có tiếng bước chân nhỏ (bán kính 3 m). Phím `Ctrl` không được dùng để khom vì `Ctrl+W` sẽ đóng tab trình duyệt (trình duyệt không cho trang web chặn tổ hợp này).

## Tầm nhìn & bản đồ nhỏ

- **Sương chiến tranh**: chỉ thấy rõ trong nón 120° phía trước (theo hướng camera) và vòng 3 m quanh người; sau lưng và sau tường, nhà, bụi cây bị phủ tối. Nón tầm nhìn của chó ở vùng tối cũng bị ẩn.
- **Minimap** góc dưới phải: hàng rào, nhà, chuồng gà, ổ chó, cổng chính; vị trí & hướng nhìn của bạn; vòng sóng âm mỗi khi bạn gây tiếng động; dấu X ở bẫy đã sập. **Lối thoát bí mật chỉ hiện trên bản đồ khi bạn đã tự tìm ra nó.**

## Speedrun & Top 10

- Đồng hồ `00:00.00` chạy từ lúc rời vị trí xuất phát, dừng ngay khi tẩu thoát.
- Mỗi màn có bảng Top 10 lưu trong `localStorage` của trình duyệt, khởi tạo sẵn 10 cao thủ giả lập. Lọt Top 10 thì nhập nickname để ghi danh; phá Top 1 thì hiện **NEW RECORD!**
- Xem bảng bất kỳ lúc nào: nút **Leaderboard / Top 10** ở Menu chính hoặc Bảng nhiệm vụ.

## Bảo vệ phía trình duyệt

- Vị trí 20 bẫy và các tuyến an toàn được lưu dưới dạng chuỗi mã hóa (XOR + Base64), chỉ giải mã vào biến cục bộ lúc dựng màn. Không có biến nào (dữ liệu màn, bẫy…) nằm ở phạm vi toàn cục.
- Chặn chuột phải, bôi đen, F12, `Ctrl/Cmd+Shift+I/J/C`, `Ctrl+U`, `Cmd+Option+I/J/C/U`; bẫy `debugger` mỗi giây: nếu DevTools đang mở, ván chơi bị khóa và màn chơi bị xóa khỏi bộ nhớ.
- Bảng xếp hạng & tiến độ lưu trong `localStorage` dạng mã hóa kèm mã kiểm; sửa tay thì bị loại và khôi phục. Thành tích dưới 20 giây (nhanh hơn mức có thể đi hết quãng đường) bị báo *Invalid Speedrun Time detected!* và không được ghi.
- Khi phát triển, đặt `PROTECT = false` trong `js/config.js` để tắt bẫy debugger và chặn phím.
- Mã nguồn chia thành mô-đun ES, mỗi mô-đun có phạm vi riêng nên không biến nào lộ ra `window`; nhưng người chơi vẫn tải được từng file .js, nên đừng coi đây là bảo mật thật.
- Đây chỉ là rào cản làm nản lòng: người rành kỹ thuật vẫn vượt qua được (tắt breakpoint trong DevTools, tải file bằng công cụ khác…). Muốn chống gian lận bảng xếp hạng thật sự cần máy chủ kiểm tra kết quả.

## Điều khiển

| Phím / chuột | Tác dụng |
|---|---|
| `W A S D` (`↑/↓`) | Đi tới/lui, bước ngang theo hướng camera |
| Chuột (bấm để khóa) / `←` `→` | Nhìn quanh / xoay camera |
| `Shift` | Chạy nhanh (gây tiếng ồn) |
| `E` (nhấn) | Trộm xương, nhặt đá, bắt gà, chui/ra bụi cây, đẩy đống rơm, trèo rào |
| `Space` | Nhảy (đang khom/bò thì đứng dậy) |
| `C` / `Z` | Khom / nằm bò |
| `H` | Hiện/ẩn bảng phím tắt |
| `E` (giữ) | Ngắm ném xương/đá theo tâm ngắm: chuột hoặc `A/D` xoay; `W/S` hoặc cuộn chuột chỉnh lực ném 1–28 m (thanh Lực ném); thả phím để ném, `Q` hủy |
| Cuộn chuột | Kéo camera gần/xa |
| `R` | Chơi lại |

## Đồ họa & camera

- Vật liệu PBR (`MeshStandardMaterial`): cỏ/đất nhám, lông chó và rơm rất nhám, xô sắt, bẫy kẹp, mìn, dây thép là kim loại bóng nhẹ; bản đồ môi trường (PMREM) tạo ánh phản chiếu đêm.
- Ánh trăng đổ bóng mềm (PCF Soft, 2048×2048, khung bóng bám theo người chơi), Hemisphere + Ambient light, tone mapping ACES.
- Sương mù `FogExp2(#1a2634, 0.015)` cùng vòm trời chuyển màu khớp sương.
- Rừng thông nhiều tầng tán và cây lá rộng tán khối, tảng đá, bụi cỏ cao; trong trang trại có thêm cây và tảng đá có va chạm (đặt tránh xa mọi lối đi, bẫy và đồ nhặt được).
- Camera sau vai kiểu game bắn súng góc nhìn thứ 3: lệch vai phải 0,6 m, cao 1,6 m, sau lưng 2,2 m (cuộn chuột 1,8–4,5 m), FOV 55°, tự rút ngắn khi sát tường. Bấm vào màn chơi để khóa chuột (Pointer Lock), `Esc` để thả; hoặc giữ chuột kéo, hoặc `←/→`. Nhân vật luôn quay mặt theo hướng camera khi di chuyển; ngắm ném theo tâm ngắm.

## Lưu trữ

- `archive/rung-thu-san.html`: game trước đó (Rừng Thú Săn).
- `archive/dont-get-busted-single-file.html`: bản một file trước khi tách mô-đun (mở thẳng bằng trình duyệt là chơi được).
