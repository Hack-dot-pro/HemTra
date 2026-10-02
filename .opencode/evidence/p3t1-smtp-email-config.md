# P3-T1 — Cấu hình SMTP + email (bằng chứng)

Ngày: 2026-10-02. Project ref: `tsnrggxczipzqvvpcbld`. Management API: `PATCH/GET /v1/projects/{ref}/config/auth`.

## 1. Probe限制 trước khi có SMTP (API chặn free tier + default provider)

| PATCH body | Kết quả |
|---|---|
| subjects + templates (không SMTP) | **400** `Email template modification is not available for free tier projects using the default email provider. Please upgrade your plan or configure a custom SMTP provider.` |
| `smtp_sender_name` + `rate_limit_email_sent` | **401** `Custom SMTP required to configure SMTP_SENDER_NAME or RATE_LIMIT_EMAIL_SENT. Missing SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS fields.` |
| `smtp_admin_email` / `smtp_user` riêng lẻ | 200 nhưng bị bỏ qua (GET vẫn `null`) |

→ Kết luận: toàn bộ tuỳ biến email (tên người gửi, tiêu đề, nội dung) MIỄN PHÍ nhưng khoá sau custom SMTP.

## 2. PATCH thành công sau khi có SMTP (200, verify GET)

- `smtp_host=smtp.gmail.com`, `smtp_port=465`, `smtp_user=pquangvinh1999@gmail.com`, `smtp_pass` set (mask `***(64)` — không in ra log)
- `smtp_sender_name=Hẻm Trà`, `smtp_admin_email=pquangvinh1999@gmail.com`
- `rate_limit_email_sent=2 → 30` (custom SMTP cho phép; built-in chỉ 2/giờ)
- `mailer_otp_length=6`, `mailer_otp_exp=600`, `disable_signup=false`, `site_url=https://hemtra.pages.dev` giữ nguyên

Tiêu đề (user chốt "Giữ nguyên" 2026-10-02), `*_custom_contents` đều `true`:

| Key | Giá trị |
|---|---|
| `mailer_subjects_confirmation` | Xác nhận đổi mới admin system |
| `mailer_subjects_magic_link` | Mã đăng nhập Hẻm Trà |
| `mailer_subjects_recovery` | Xác nhận thay đổi mật khẩu |
| `mailer_subjects_reauthentication` | Xác nhận thay đổi email khôi phục |
| `mailer_subjects_email_change` | Xác nhận email khôi phục mới |
| `mailer_subjects_password_changed_notification` | Mật khẩu đã được thay đổi |
| `mailer_subjects_email_changed_notification` | Email khôi phục đã được thay đổi |

Nội dung: HTML `Calibri/Carlito`, header "Hẻm Trà" xanh lá, mã OTP `{{ .Token }}` cỡ 28px letter-spacing 6px, "hết hạn 10 phút", footer "Email tự động, vui lòng không trả lời."

## 3. Smoke test GỬI THẤT BẠI — App Password sai

- `POST {SUPABASE_URL}/auth/v1/otp` `{email: pquangvinh1999@gmail.com, create_user: true}` → **500** `Error sending confirmation email` (error_id `01a0fa9c-bd2a-760b-8ca2-2b7fe9ad065f`)
- Test trực tiếp SMTP `smtp.gmail.com:465` AUTH LOGIN (node tls, cả `SMTP_APP_PASSWORD` có dấu cách lẫn strip): **`535-5.7.8 Username and Password not accepted`** ở cả 2 lần → không phải lỗi GoTrue, là credentials bị Gmail từ chối.
- Đếm: `airou mfuz gkli nuol` = **17 ký tự** (5+4+4+4); App Password Google luôn **16 ký tự** (4×4) → sai chính tả/ sai chuỗi.
- Management API Logs endpoint: 404/410/400 (biến đổi API, không dùng được để xem chi tiết lỗi GoTrue).
- Không phát sinh user thừa từ smoke test: `GET /auth/v1/admin/users` → 1 user (`t7staff@hem.local`, đã confirm từ trước).

## 4. Sửa `.env`

- Dòng `SMTP_APP_PASSWORD` không có dấu nháy → `source .env` fail shell (`mfuz: command not found`). Đã bọc thành `SMTP_APP_PASSWORD="..."` → `source` OK (len 20 gồm nháy? — len 20 là giá trị có nháy trong bash echo, thực tế password giữ nguyên).

## 5. Vòng lặp App Password (2026-10-02) — kết luận: password ĐÚNG, script test SAI

- Password cũ (17 ký tự) → 535. User thay password mới 16 ký tự (format `4+4+4+4`, chữ thường, 0 ký tự ẩn) → **vẫn 535**.
- Nguyên nhân thật: script test đọc `SMTP_APP_PASSWORD` **kèm 2 dấu nháy kép** (`"..."`) sau khi tôi bọc nháy vào `.env` → AUTH LOGIN gửi `"<pass>"` → Gmail 535. Password của user đúng.
- Fix: strip `^"|"$` trước khi dùng. Test lại:
  - `AUTH LOGIN` trên 465 → **`235 2.7.0 Accepted`**
  - Gửi mail đầy đủ `MAIL FROM → RCPT → DATA` → **`250 2.0.0 OK`** (mail thật "HemTra SMTP test" đến hộp thư user)
- Re-PATCH `smtp_pass` (đã strip nháy) → 200, GET verify `smtp_pass` len 64.

## 6. Smoke test cuối cùng — PASS

| Test | Kết quả |
|---|---|
| `POST /auth/v1/otp` (create_user) | **200** — mail "Mã đăng nhập Hẻm Trà" gửi được |
| `POST /auth/v1/recover` (sau `smtp_max_frequency`=60s) | **200** — mail "Xác nhận thay đổi mật khẩu" gửi được |
| Danh sách user | user test `pquangvinh1999@gmail.com` đã **xóa** (200) → chỉ còn `t7staff@hem.local` |

## 7. Config cuối (GET verify, snapshot `/tmp/opencode/final-auth.json`)

`smtp_host=smtp.gmail.com`, `smtp_port=465`, `smtp_user=pquangvinh1999@gmail.com`, `smtp_pass` set (64, masked), `smtp_sender_name=Hẻm Trà`, `smtp_admin_email=pquangvinh1999@gmail.com`, `rate_limit_email_sent=30`, `mailer_otp_length=6`, `mailer_otp_exp=600`, `disable_signup=false` (cố ý, xem `decisions.p3t1_disable_signup`), `site_url=https://hemtra.pages.dev`, `uri_allow_list=https://hemtra.pages.dev/**`, `mailer_autoconfirm=false`, **7 subjects + 7 templates custom** (`*_custom_contents=true`).

- [x] User thay App Password → `.env` (đã bọc nháy, `source` OK)
- [x] Re-PATCH `smtp_pass` → 200
- [x] Smoke OTP + recovery → 200, email đến hộp thư
- [x] Tick `P3-T1` trong `plan.md`
