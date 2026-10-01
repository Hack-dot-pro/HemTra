# uiux/skill.md — Giao diện Glassmorphism Hẻm Trà (P2, P5–P8 phần UI)

> Bắt buộc đọc khi làm UI bất kỳ phase nào. Nguồn chuẩn: `design.md §7`, mẫu sống `template.html`.

## 1. Ngôn ngữ thiết kế (bất biến trừ khi user đổi)

- Màu: `#1e8fe8` / `#1b6fd1`. Font: `Calibri, Carlito, sans-serif` — Carlito woff2 self-host trong `public/fonts/` (template đang dùng Inter → phải đổi).
- Thẻ kính: `bg-white/15`, `border-white/30`, `backdrop-blur-xl`, chữ trắng, tương phản ≥ 4.5:1.
- Sau đăng nhập: nền `background.png` + overlay `rgba(8,30,60,.45)` + `backdrop-blur` (ảnh gốc sáng chói, không dùng trực tiếp).
- Mọi text user-facing + comment quan trọng: **tiếng Việt**. Biến/hàm: tiếng Anh.

## 2. Chuyển `template.html` → component (P2-T2 — giữ pixel, đừng "sáng tạo lại")

- Sân khấu 9:16: logo `left 56.9% / top 29.5% / width 27.4%`; thẻ kính `left 52.7% / top 42.6% / width 41.3%`; mọi cỡ scale theo `--ui`.
- Giữ: ô nhập bo tròn viền trắng mờ + icon ngăn vạch, nút trắng-xanh `#1b6fd1`, hiệu ứng `shake` khi lỗi, `prefers-reduced-motion`.
- Thêm so với template: font Carlito, checkbox "Ghi nhớ", nút "Tải App" góc phải trên, link "Quên mật khẩu".
- Tách `glass.css`: `.glass-card`, `.glass-input`, `.glass-btn` + design tokens (màu, radius, blur) dùng chung toàn app.

## 3. Pattern màn hình

- **Login (P2-T3):** chỉ hiện ô mật khẩu khi đã có username lưu; nút "Đổi tài khoản"; hiện/ẩn mật khẩu; lỗi tiếng Việt chung chung (không lộ user tồn tại — xem `security/skill.md`).
- **Layout sau login (P2-T6):** sidebar desktop / bottom-nav mobile, 5 menu; mỗi menu có trang trống định tuyến sẵn.
- **CRUD (P5):** modal thêm/sửa (tên, nhóm, đơn giá, icon, topping); bảng có tìm kiếm + lọc nhóm + bật/tắt bán; hành động ẩn/xóa luôn có confirm.
- **Bảng dữ liệu (P7):** phân trang, lọc ngày, tìm theo mã; **không nút xóa bill**; tag "tự xóa sau N ngày"; modal xem ảnh qua signed URL ngắn hạn.
- **Validate:** zod 2 đầu (client + Edge Function), giá = số nguyên dương, tên không rỗng/không trùng trong nhóm, lỗi tiếng Việt.

## 4. A11y + responsive (qc-test kiểm Q10/Q11 theo mục này)

- Nhãn form đầy đủ, focus rõ, hỗ trợ bàn phím cho modal/menu, tôn trọng `prefers-reduced-motion`.
- Không vỡ ở **390×844** và **1280×800**, không lỗi console (ảnh chụp Playwright mỗi màn hình mới).
- Icon Lucide cho UI; icon đồ uống 2D theo `pos-bill/skill.md §1` (thiếu icon → hỏi user, không tự vẽ).
