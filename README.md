# Hẻm Trà POS — Phần Mềm Bán Hàng & Quản Lý Quán Trà Sữa PWA

Ứng dụng web tiến bộ (Progressive Web App - PWA) chuyên dụng cho quán trà sữa/cà phê, tối ưu hóa trải nghiệm bán hàng nhanh tại quầy, quản lý menu linh hoạt, xuất hóa đơn điện tử dạng ảnh PNG, bảo mật phân quyền đa cấp và hoạt động liên tục ngay cả khi mất kết nối mạng (Offline-first).

---

## 1. Điểm Nổi Bật & Tính Năng Chính

- **Offline-First & Auto Sync**: Hoạt động mượt mà khi mất kết nối Internet. Dữ liệu menu được lưu trong IndexedDB (Dexie). Các đơn hàng tạo ngoại tuyến được lưu trong Outbox và tự động đồng bộ lên máy chủ ngay khi có mạng trở lại.
- **Bán hàng nhanh tại quầy (POS)**: Lựa chọn nhóm món, sản phẩm, topping kèm theo, ghi chú đơn hàng và thanh toán tức thì.
- **Xuất ảnh hóa đơn (Bill PNG)**: Chụp hóa đơn chuẩn kích thước 720×2 (1440px), kiểm tra magic bytes chuẩn PNG, tải về máy hoặc chia sẻ qua Web Share API.
- **Quản lý hóa đơn & Tự động dọn dẹp**: Xem danh sách hóa đơn theo thời gian, tìm kiếm mã đơn, xem ảnh bill. Cơ chế tự động dọn dẹp (cleanup) sau 15 ngày qua Edge Function và pg_cron giúp tiết kiệm dung lượng lưu trữ.
- **Báo cáo & Thống kê trực quan (Dashboard)**: Theo dõi doanh thu ngày, doanh thu tháng, số lượng đơn hàng, biểu đồ spline kết hợp brush timeline (ApexCharts) và xếp hạng Top 5 món bán chạy nhất/ít nhất.
- **Quản lý tài khoản & Phân quyền (RBAC)**: Phân quyền quản trị viên (`admin`) và nhân viên thu ngân (`staff`). Hỗ trợ tạo tài khoản, cấp lại mật khẩu tạm thời, đặt mật khẩu trực tiếp và xóa tài khoản.
- **Bảo mật toàn diện**: Tích hợp Content Security Policy (CSP), chống IDOR, kiểm soát rate limit tạo đơn (10 đơn/phút online, 60 đơn/phút offline), chống dò mật khẩu brute-force (khóa 15 phút sau 5 lần thử sai).

---

## 2. Kiến Trúc & Công Nghệ

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, React Router v7.
- **Lưu trữ cục bộ & PWA**: Dexie.js (IndexedDB), Workbox (Service Worker precaching & background cache), HTML-to-Image, QRCode.
- **Backend & Cơ sở dữ liệu**: Supabase (PostgreSQL với RLS nghiêm ngặt, GoTrue Auth, Storage bucket private).
- **Serverless Compute**: Supabase Edge Functions (Deno / TypeScript) xử lý logic nhạy cảm (xác thực, quản lý user qua Service Role, dọn dẹp bill).
- **Hạ tầng hosting**: Cloudflare Pages (tốc độ cao, tối ưu header bảo mật qua `_headers`).

---

## 3. Cấu Hình Tài Khoản Mặc Định Hệ Thống

Hệ thống đã được thiết lập sẵn tài khoản quản trị tối cao (`admin`):
- **Email quản trị**: `nguyentuongvi190501@gmail.com`
- **Tên đăng nhập**: `admin` hoặc `nguyentuongvi190501@gmail.com`
- **Mật khẩu khởi tạo tạm thời**: `123456`
- **Khả năng đăng nhập**: Hỗ trợ đăng nhập đồng thời trên nhiều thiết bị (điện thoại, máy tính bảng, máy tính quầy thu ngân).
- **Đổi mật khẩu**: Quản trị viên có thể tự đổi mật khẩu bất kỳ lúc nào tại menu **"Đổi mật khẩu"** trên thanh điều hướng.

---

## 4. Yêu Cầu Môi Trường & Cài Đặt

### 4.1. Yêu cầu hệ thống
- **Node.js**: >= 20.x
- **npm**: >= 10.x
- **Supabase CLI**: (tùy chọn nếu muốn deploy DB/Edge Functions)

### 4.2. Cài đặt các gói phụ thuộc
```bash
npm install
```

### 4.3. Cấu hình biến môi trường
Tạo file `.env` từ `.env.example` và điền thông tin dự án Supabase:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://tsnrggxczipzqvvpcbld.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

# Admin & Edge Function Secrets (dành cho scripts kiểm thử / triển khai)
SUPABASE_URL=https://tsnrggxczipzqvvpcbld.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
BOOTSTRAP_ADMIN_EMAIL=nguyentuongvi190501@gmail.com
```

### 4.4. Khởi chạy ứng dụng phát triển (Development)
```bash
npm run dev
```
Ứng dụng sẽ chạy tại địa chỉ: `http://localhost:5173`.

---

## 5. Kiểm Thử & Đảm Bảo Chất Lượng (QA / Testing)

Hệ thống được kiểm thử tự động toàn diện qua các bộ test:

```bash
# 1. Chạy toàn bộ 507 Unit Tests
npm run test

# 2. Kiểm tra lỗi cú pháp (Lint) & kiểu dữ liệu (TypeScript)
npm run lint
npm run typecheck

# 3. Kiểm tra bảo mật (Secret leak scan & Dependency audit)
npm audit
gitleaks detect --source . -v

# 4. Chạy kiểm thử kịch bản tấn công bảo mật trực tiếp trên Database
node --env-file=.env scripts/test_p10_security.js

# 5. Chạy toàn bộ E2E Playwright Tests (Chromium, WebKit, Mobile)
npx playwright test
```

---

## 6. Quy Trình Triển Khai (Deployment)

### 6.1. Build mã nguồn Frontend
```bash
npm run build
```
Thư mục xuất bản là `dist/`. File cấu hình `_headers` được tự động chuyển vào `dist/_headers` đảm bảo các quy chuẩn bảo mật CSP, HSTS và chống iframe clickjacking.

### 6.2. Triển khai Cloudflare Pages
- **Framework preset**: `Vite`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Environment variables**: Cấu hình `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` trong Settings > Environment variables của Cloudflare Pages.

### 6.3. Triển khai Cơ sở dữ liệu & Edge Functions (Supabase)
```bash
# Đẩy các migration lên Supabase Remote
npx supabase db push

# Triển khai các Edge Functions
npx supabase functions deploy auth-login --no-verify-jwt
npx supabase functions deploy admin-users --no-verify-jwt
npx supabase functions deploy cleanup-bills --no-verify-jwt
npx supabase functions deploy bootstrap-admin --no-verify-jwt
```

---

## 7. Hướng Dẫn Duy Trì Dự Án Supabase (Tránh Bị Tạm Dừng / Pause)

Gói miễn phí (Free Tier) của Supabase sẽ tự động tạm dừng (pause) dự án nếu không có truy vấn nào phát sinh trong khoảng 7 ngày liên tiếp. Để duy trì hệ thống hoạt động 24/7:

### Phương pháp 1: Thiết lập Cron Job tự động ping qua GitHub Actions
Tạo file workflow `.github/workflows/keep-alive.yml`:
```yaml
name: Supabase Keep Alive Ping
on:
  schedule:
    - cron: '0 4 */3 * *' # Chạy mỗi 3 ngày lúc 04:00 AM UTC
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase REST API
        run: |
          curl -s -X GET "https://tsnrggxczipzqvvpcbld.supabase.co/rest/v1/app_meta?select=id" \
            -H "apikey: ${{ secrets.VITE_SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.VITE_SUPABASE_ANON_KEY }}"
```

### Phương pháp 2: Sử dụng Dịch vụ Uptime miễn phí
Cấu hình monitor trên các dịch vụ như **UptimeRobot**, **Cron-job.org**, hoặc **BetterStack**:
- **URL cần ping**: `https://tsnrggxczipzqvvpcbld.supabase.co/rest/v1/app_meta?select=id`
- **Method**: `GET`
- **HTTP Header**:
  - `apikey`: `<VITE_SUPABASE_ANON_KEY>`
  - `Authorization`: `Bearer <VITE_SUPABASE_ANON_KEY>`
- **Tần suất**: Mỗi 2 hoặc 3 ngày.

---

## 8. Sao Lưu Dữ Liệu (Backup & Recovery)

### 8.1. Sao lưu Schema và Dữ liệu qua Supabase CLI
```bash
# Sao lưu dữ liệu bảng (data-only)
npx supabase db dump --data-only -f backup_data_$(date +%Y%m%d).sql

# Sao lưu toàn bộ schema
npx supabase db dump -f backup_schema_$(date +%Y%m%d).sql
```

### 8.2. Khôi phục dữ liệu khi cần
```bash
psql "<POSTGRES_CONNECTION_STRING>" -f backup_data_YYYYMMDD.sql
```