# pos-bill/skill.md — Thanh toán, BillSheet, xuất PNG, chia sẻ (P6)

> Bắt buộc đọc khi làm **P6**. Nguồn chuẩn: `design.md §6`. RPC + Storage: `backend/skill.md §4`.

## 1. Icon đồ uống (P6-T0/T1 — ❓ hỏi user nếu thiếu)

- Dùng bộ SVG 2D có giấy phép nhúng (Fluent Emoji Flat — MIT, hoặc Noto Emoji — Apache-2.0) → `public/icons/drinks/`, map theo nhóm (trà sữa, trà trái cây, matcha, cà phê, latte, sữa tươi, nước ép, sinh tố, topping…).
- Thiếu icon (vd. trân châu, matcha) → **hỏi user**, không tự vẽ bừa. Ghi nguồn + giấy phép vào `THIRD_PARTY.md`.

## 2. Màn hình POS (P6-T2/T3)

- Lưới sản phẩm theo nhóm (tab/lọc), nút "+" thêm vào bill.
- Panel bill realtime bên phải: tăng/giảm số lượng, ghi chú món (dòng nhỏ nghiêng dưới món), topping là dòng con thụt lề kèm giá, tổng tiền cập nhật tức thì.

## 3. BillSheet — đúng 7 khối, đúng thứ tự (P6-T4 — snapshot test khóa layout)

1. Logo (`Logo.png`) → 2. Mã bill `HT-YYMMDD-0001` + SĐT `0338525677 (Vi) - 0362335733 (Linh)` (+ thời gian) → 3. Bảng `Sản phẩm | SL | Đơn giá | Thành tiền` → 4. **Tổng tiền** in đậm → 5. QR Facebook + nhãn → 6. Lời chúc `Cảm ơn khách hàng thân yêu của Hẻm` → 7. Địa chỉ `Phường Long Nguyên, Thành Phố Hồ Chí Minh`.
- Không tiền mặt/chuyển khoản, giảm giá, tiền thối. Tiền định dạng VND nguyên (`lib/format`).

## 4. Mã bill (P6-T7 — khớp `backend`: `next_bill_code()`)

- Online: RPC cấp số tuần tự theo ngày VN (nguyên tử). Offline: `HT-YYMMDD-OFF-<4 ký tự>`, **giữ nguyên** làm mã chính thức (ảnh đã gửi khách).
- Trước khi chốt online: kiểm tra `menu_version`; lệch → báo "Giá vừa cập nhật", cho xem lại giỏ.

## 5. Xuất PNG + chia sẻ (P6-T5/T6/T8 — nhiều bẫy Safari)

- QR: thư viện `qrcode`, nội dung `https://www.facebook.com/linh.kh.142`, sinh offline được.
- Render bill ra DOM ẩn → `html-to-image.toBlob()` (rộng 720px, `pixelRatio` 2). Safari: chụp **2 lần** (lần 1 nạp font/ảnh), logo/QR dùng data-URL.
- Luồng: `create_bill` → upload PNG `bills/YYYY/MM/<code>.png` (offline → outbox, xem `pwa-offline/skill.md §4`) → `navigator.share({files})` (Zalo/Messenger); không hỗ trợ → nút **Lưu về máy**.
- Lazy-load `html-to-image` + `qrcode` (bundle đầu < 250 KB gzip — `design.md §11`).

## 6. Test (P6-T9)

Unit: tổng tiền, định dạng VND, mã bill online/offline. Snapshot: BillSheet. Playwright: bán 1 đơn → PNG sinh ra → xem được ở Quản lý bill.
