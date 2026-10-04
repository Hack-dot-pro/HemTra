# Báo cáo Kiểm thử An ninh & Bảo mật (SEC) — Phase P11 (Vòng 1)

- **Thời điểm**: 2026-10-04T08:30:00Z
- **Kết quả tổng quát**: **PASS**

## 1. Secret Scanning & Dependencies
- `gitleaks detect`: 0 secret rò rỉ trong lịch sử git.
- `npm audit`: 0 lỗ hổng bảo mật trong các dependency production & development.

## 2. Server-side RBAC & Database RLS
- 14 migration đã áp dụng trên Supabase Cloud DB.
- RLS nghiêm ngặt:
  - Bảng `categories`, `products`, `toppings`, `product_toppings`: Authenticated xem/ghi, chặn client xóa danh mục.
  - Bảng `bills` và `bill_items`: Chỉ đọc, không có policy UPDATE/DELETE cho authenticated user. Xóa bill chỉ thông qua Edge Function `cleanup-bills` với Service Role theo lịch pg_cron 15 ngày.
  - Bảng `profiles`: RLS chặn tự sửa role. Chỉ Edge Function `admin-users` (Service Role) được phân quyền admin/staff.

## 3. Storage & Header Security
- Storage bucket `bills`: Private, chính sách upload yêu cầu bill hợp lệ và đúng định dạng PNG qua `isPngBlob` (magic bytes `89 50 4E 47`), giới hạn dung lượng <= 300KB.
- File `_headers`: Cấu hình CSP nghiêm ngặt, HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin.
- Rate-limiting: Chặn brute-force login (5 lần sai / 15 phút), kiểm soát tạo bill (10 đơn/phút online, 60 đơn/phút offline).
