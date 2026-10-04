# Báo cáo Kiểm thử An ninh & Bảo mật (SEC) — Phase P10 (Vòng 1)

- **Thời điểm**: 2026-10-04T07:51:00Z
- **Kết quả tổng quát**: **PASS** (0 BLOCKER, 0 MAJOR, 0 MINOR)

## 1. Secret Scanning & Dependency Vulnerabilities
- `gitleaks detect --source . -v --redact`: Đã quét qua toàn bộ 60 commits — **0 leaks detected**.
- `npm audit`: **0 vulnerabilities**.

## 2. Security Headers & CSP (P10-T1)
- Đã cấu hình đầy đủ trong `public/_headers` (kế thừa vào `dist/_headers`):
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
  - `Content-Security-Policy`: Cho phép domain `self`, Supabase HTTPS/WSS, data/blob URL hợp lệ cho ảnh bill/QR; cấm frame-ancestors.

## 3. Rate Limit & File Type Hardening (P10-T2)
- **Sniffing Magic Bytes (SEC-007)**: Bổ sung `isPngBlob()` trong `src/lib/billUpload.ts` kiểm tra 4 byte đầu `[0x89, 0x50, 0x4E, 0x47]`.
- **Dung lượng file**: Chặn file upload > 300KB (`BILL_PNG_MAX_BYTES`).
- **Rate Limit DB**:
  - `create_bill`: Tối đa 10 bill/phút online; 60 bill/phút cho đồng bộ offline.
  - Edge function `auth-login`: Lockout 5 lần thử sai / 15 phút theo cặp `(username, ip)`.

## 4. Kiểm thử Kịch bản Tấn công Thực tế (P10-T4)
Chạy trực tiếp trên database qua `scripts/test_p10_security.js` với 8 kịch bản tấn công:
1. `SEC-005`: Staff cố tình gửi yêu cầu `DELETE` vào `public.categories` -> Bị chặn 403 Forbidden (42501 permission denied).
2. `IDOR bills`: Staff cố tình gửi `DELETE` hoặc `UPDATE` vào `public.bills` -> Bị chặn 403 Forbidden.
3. `Privilege Escalation`: Staff cố cập nhật `role` trong `public.users` thành `admin` -> Không có hiệu lực (chỉ Edge Function Service Role có quyền).
4. `JWT Tampering`: Gửi request với JWT giả mạo / sai signature -> Bị từ chối 401 Unauthorized.
5. `SEC-006 Storage Squatting`: Tải ảnh lên mã bill chưa tồn tại trong bảng `bills` -> Bị RLS Storage từ chối.
6. `SEC-009/010`: Staff gọi `set_bill_image` cho bill do người khác tạo -> Bị RPC từ chối `permission_denied`.
7. `SEC-008`: Cố tình gọi `create_bill` liên tục vượt ngưỡng 10 bills/phút -> RPC trả về `rate_limited`.
8. `XSS Sink Audit`: Toàn bộ source code frontend không sử dụng `dangerouslySetInnerHTML`, `innerHTML`, hoặc `eval`.
