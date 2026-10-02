# Don't Get Busted! 3D

Game lén lút (stealth puzzle) + speedrun 3D chạy trên trình duyệt, gói gọn trong **một file**: `public/index.html` (Three.js r128 tải qua CDN cdnjs, mọi mô hình dựng bằng khối hình học, âm thanh tổng hợp bằng Web Audio API, không cần file ngoài).

Phần `<head>` đã có đủ thẻ SEO: title, description, keywords, robots, Open Graph, Twitter Card, favicon SVG và dữ liệu có cấu trúc `VideoGame` (JSON-LD). Ảnh `og:image` / `twitter:image` hiện là ảnh giữ chỗ: khi xuất bản, hãy thay bằng ảnh 1200×630 thật (đường dẫn tuyệt đối).

## Chuỗi nhiệm vụ

| Nhiệm vụ | Bối cảnh | Trạng thái |
|---|---|---|
| 1. Trộm Gà Trống Vàng | Trang trại Đồi Gió, 2 giờ sáng | Chơi được |
| 2. Trộm Chó Cảnh | Khu đô thị, nửa đêm | Sắp ra mắt |
| 3. ??? | Đang lên kế hoạch | Sắp ra mắt |

Trước mỗi nhiệm vụ có **Bảng nhiệm vụ** (mục tiêu, cảnh báo, điều kiện thắng/thua, tin tình báo).

## Nhiệm vụ 1: luật chơi

- Không có gợi ý chỉ đường. Tự quan sát, thất bại, ghi nhớ.
- Đàn chó canh có thính giác tốt, tầm nhìn rộng, chạy nhanh hơn bạn 15% và không mất dấu.
- Xương trong ổ chó là thứ duy nhất làm chúng rời vị trí, nếu ném đúng chỗ.
- **20 bẫy ngụy trang**, 5 loại: hố sập (tụt xuống hố 2 giây, cả đàn rượt), dây vấp (nỏ bắn tên "SÚY!", chó tới kiểm tra), mìn pháo sáng (pháo đỏ, khói màu, còi rít, cả đàn rượt), bẫy kẹp gấu (kẹp chân 2,5 giây, chó gần đó tới), xô sắt / cành khô ("CLANG!" / "CẠCH!", con chó gần nhất tới xem).
- **Phá bẫy từ xa**: ném xương hoặc hòn đá (nhặt rải rác trên bản đồ) trúng bẫy thì bẫy sập và hỏng hẳn, đi qua an toàn, nhưng tiếng động vẫn kéo chó gần đó tới kiểm tra. Ném xương vào bẫy là mất xương. Chó không ăn đá.
- **Ôm gà quay về cổng chính**: Ông chủ trang trại bước ra từ bóng tối (jumpscare) → *BUSTED BY THE FARM OWNER!*
- Lối thoát thật nằm ở nơi khác trong trang trại. Chỉ khi đã ôm gà mới mở được.

## Speedrun & Top 10

- Đồng hồ `00:00.00` chạy từ lúc rời vị trí xuất phát, dừng ngay khi tẩu thoát.
- Mỗi màn có bảng Top 10 lưu trong `localStorage` của trình duyệt, khởi tạo sẵn 10 cao thủ giả lập. Lọt Top 10 thì nhập nickname để ghi danh; phá Top 1 thì hiện **NEW RECORD!**
- Xem bảng bất kỳ lúc nào: nút **Leaderboard / Top 10** ở Menu chính hoặc Bảng nhiệm vụ.

## Chạy game

| Cách | Lệnh | Địa chỉ |
|---|---|---|
| Docker (bản đóng gói) | `docker compose up -d --build` | http://localhost:8080 |
| Docker (dev, sửa là thấy) | `docker compose --profile dev up dev` | http://localhost:5173 |
| Không cần Docker | mở thẳng `public/index.html` bằng trình duyệt | — |

## Điều khiển

| Phím / chuột | Tác dụng |
|---|---|
| `W A S D` / mũi tên | Di chuyển theo hướng camera |
| `Shift` | Chạy nhanh (gây tiếng ồn) |
| `Space` / `E` (nhấn) | Trộm xương, nhặt đá, bắt gà, chui/ra bụi cây, đẩy đồ vật |
| `Space` / `E` (giữ) | Ngắm ném xương/đá: `A/D` xoay hướng, `W/S` xa gần, thả phím để ném, `Q` hủy |
| Kéo chuột / cuộn chuột | Xoay camera góc nhìn thứ 3 / thu phóng |
| `R` | Chơi lại |

## Cấu trúc mã trong `index.html`

| Phần | Vai trò |
|---|---|
| `CFG`, `LEVELS`, `MISSIONS` | Cấu hình; dữ liệu màn (chó, hàng rào, bụi, 20 bẫy, đá, đống rơm...); chuỗi nhiệm vụ |
| `Collision`, `NavGrid` | Va chạm, tia nhìn bị vật cản chặn; tìm đường A* cho chó |
| `FarmWorld`, `FenceKit`, `Models` | Trang trại đêm, cổng chính, bãi cỏ an toàn; dựng nhân vật bằng khối |
| `Trap`, `Rock`, `Haystack`, `Boss` | Bẫy ngụy trang (giẫm / phá từ xa), đá ném, đống rơm, Ông chủ trang trại |
| `Player`, `Dog` | Tên trộm (bị kẹp / tụt hố), chó canh (gác, tuần, nghe, kiểm tra bẫy, gặm xương, rượt) |
| `Sfx` | Âm thanh Web Audio: bẫy, ném, jumpscare (bass drop + rít), còi, pháo hoa, chiến thắng |
| `Board` | Bảng Top 10 speedrun theo màn |
| `FX`, `UI`, `Input`, `Game` | Hạt bụi/khói/pháo hoa, HUD, phím/chuột, vòng lặp, camera (zoom FOV 60→25 khi bị bắt) |

Lời giải không được ghi ở đây. Màn chơi đã được kiểm tra bằng "người chơi tự động": làm đúng trình tự thì thoát được; ôm gà về cổng chính, ném xương lệch, đi thẳng không dùng xương hay giẫm hố sập đều thua.

## Lưu trữ

`archive/rung-thu-san.html` là game trước đó (Rừng Thú Săn).
