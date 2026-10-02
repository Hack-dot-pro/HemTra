# auth/skill.md — Xác thực, phiên, phân quyền, quản lý user (P3, P9)

> Bắt buộc đọc khi làm **P3, P9** và mọi chỗ đụng session/quyền. Nguồn chuẩn: `design.md §4`.
> RLS chi tiết: `backend/skill.md §5`. Lockout/OTP khôi phục lượt đăng nhập: `security/skill.md §2`.

## 1. Cấu hình Supabase Auth (P3-T1 — cần thông tin user ở P3-T0, chưa có thì DỪNG)

- Tắt signup công khai sau bootstrap; bật Google provider; Email OTP 6 số, hết hạn 10 phút, giới hạn lần thử.
- SMTP riêng (Gmail App Password hoặc Resend free) — thông tin do **user cung cấp**, không tự bịa (`design.md §4.5`).
- Username ánh xạ email nội bộ `<username>@hem.local` (lowercase, unique, không gửi mail thật).

## 2. Edge Functions (Deno; `service_role` chỉ ở đây — không bao giờ xuống client)

| Function | Nhiệm vụ | Bẫy thường gặp |
|---|---|---|
| `bootstrap-admin` | Chỉ chạy khi `app_meta.bootstrapped=false`; kiểm tra email Google **trùng secret `BOOTSTRAP_ADMIN_EMAIL`**; xong ghi `profiles.role='admin'` + `bootstrapped=true` | Quên kiểm tra đã bootstrap → người lạ chiếm admin |
| `auth-login` | Kiểm tra lockout (username+IP, 5 lần/15 phút) → `signInWithPassword` phía server → trả session; sai 5 lần → `unlock-otp`/`unlock-verify` khôi phục lượt bằng OTP email; lỗi chung chung | Trả về lỗi phân biệt user tồn tại/không; `unlock-otp` phải LUÔN trả 200 chung chung (chống dò username) |
| `admin-users` | Tạo user, cấp lại/đặt mật khẩu (sinh tạm), xóa — kiểm quyền **phía server**; chặn mọi tác động lên tài khoản admin từ non-admin | Chỉ kiểm quyền ở UI (bypass bằng gọi API trực tiếp) |
| `recovery` | Admin: Google OAuth lại → OTP → đặt mật khẩu mới. Staff: hiện "Liên hệ admin" | Mở self-recovery cho staff |

## 3. Phiên 7 ngày — 2 lớp (P3-T5)

- Client: "ghi nhớ" bật → `localStorage`, tắt → `sessionStorage`; lưu `login_at`; hết hạn tự đăng xuất. Chỉ nhớ username, **không lưu mật khẩu**.
- Server: `session_fresh()` so `iat` JWT ≤ 7 ngày trong RLS — client bị sửa vẫn mất quyền.
- Đổi mật khẩu bản thân phải nhập mật khẩu cũ; `must_change_password=true` buộc đổi ở lần đăng nhập kế.

## 4. Route guard + ma trận quyền (P3-T7, P9)

- Guard theo role từ `profiles` (không tin claim client). Chuẩn đối chiếu: `design.md §4.1` — staff được thêm user staff nhưng không xóa/đổi mật khẩu ai; không ai xóa bill; không non-admin nào đụng tài khoản admin.
- UI ẩn nút chưa đủ — mọi hành động admin-only phải bị từ chối **phía server** (SEC S4 kiểm bằng token staff gọi trực tiếp).

## 5. Test (P3-T8, P9-T5)

Unit: guard, session expiry 7 ngày, ma trận quyền admin/staff × hành động. Playwright: bootstrap lần đầu → ẩn vĩnh viễn; bootstrap lần 2/email lạ bị từ chối; login sai/đúng; lockout sau 5 sai; token sửa/hết hạn bị từ chối; khôi phục admin.
