# design.md — Thiết kế & công nghệ hệ thống Hẻm Trà

Phiên bản: 1.0 · Loại dự án: prototype cá nhân, chi phí 0đ · Ngôn ngữ UI: tiếng Việt

---

## 1. Mục tiêu
Hệ thống web/PWA quản lý doanh thu quán Hẻm Trà: đăng nhập, quản lý sản phẩm, thanh toán và xuất bill PNG, quản lý bill, báo cáo xếp hạng, quản lý user. Dùng được trên điện thoại (ưu tiên) và máy tính, **có chế độ offline an toàn**.

## 2. Quyết định kiến trúc

| Hạng mục | Lựa chọn | Lý do |
|---|---|---|
| Frontend | **React 19 + TypeScript + Vite** | Yêu cầu; build nhanh, PWA plugin tốt |
| CSS | **Tailwind CSS v4** (`@tailwindcss/vite`) + CSS Glassmorphism tự viết | Yêu cầu. Cố định bản `4.x` đã kiểm chứng ổn định (xem 2.1) |
| Backend | **Supabase** (Auth, Postgres + RLS, Storage, Realtime, Edge Functions, pg_cron) | Gom một chỗ, miễn phí, đủ cho prototype |
| Hosting | **Cloudflare Pages** (static, miễn phí, băng thông không giới hạn) | Chỉ host frontend + `_headers`; **không dùng Workers** (Supabase Edge Functions đã đủ → bớt một hệ thống) |
| Bảo vệ biên | Cloudflare WAF/Rate-limit rule (free) + **Turnstile** (free) | Chống bot ở màn đăng nhập |
| Lưu ảnh bill | **Supabase Storage** (bucket private `bills`) | Yêu cầu |
| Biểu đồ | **ApexCharts** (`react-apexcharts`, lazy-load) | Có `radialBar` + `line` có zoom/pan/brush đúng mẫu `chart_1/2.png` |
| Xuất PNG | `html-to-image` + Web Share API (fallback tải về) | Chạy client, không tốn server |
| QR | `qrcode` | Sinh QR link Facebook offline |
| PWA | `vite-plugin-pwa` (Workbox, `injectManifest`) | Kiểm soát cache chính xác |
| Dữ liệu offline | **Dexie** (IndexedDB) | Cache menu + outbox bill |
| State/data | TanStack Query + Zustand | Cache server-state tách khỏi UI-state |
| Form/validate | react-hook-form + zod | Dùng chung schema client và Edge Function |
| Icon | Lucide (UI) + **bộ icon đồ uống 2D** (xem 7.4) | Yêu cầu |
| Font | `Calibri, Carlito, sans-serif`, nhúng Carlito (woff2, self-host) | Calibri không có trên iOS/Android; Carlito tương thích số đo |
| Test | Vitest + React Testing Library + MSW; Playwright (E2E); test RLS bằng SQL (`supabase test db`) | Đã thống nhất |

### 2.1 Phiên bản (kiểm chứng trước khi chốt)
Nguyên tắc ưu tiên **ổn định & tốc độ**, không nhất thiết bản mới nhất. Ở task `P0-T2`, agent chạy `npm view <pkg> version` và `npm view <pkg> peerDependencies`, chọn bản ổn định mới nhất **không có peer-dependency xung đột**, rồi ghi bản đã chốt vào bảng dưới (không tự đoán số phiên bản).

| Gói | Ràng buộc | Bản chốt (P0-T2, `npm view` 2026-10-01, không xung đột peer) |
|---|---|---|
| react / react-dom | `^19` | 19.3.0 |
| tailwindcss + @tailwindcss/vite | `^4` (dùng 4.3 nếu `npm view` xác nhận tồn tại và build sạch; nếu lỗi thì lùi 4.x gần nhất; ghi lý do) | 4.3.3 (đúng 4.3, build sạch) |
| react-apexcharts | bản hỗ trợ React 19 (kiểm tra `peerDependencies`) | 2.1.1 (peer `react>=16.8`, chốt ở P8 khi cài) |
| vite, vite-plugin-pwa | bản tương thích nhau (kiểm tra peer) | vite 8.3.2 + pwa 1.3.0 (peer vite ^8, chốt pwa ở P4 khi cài) |
| @supabase/supabase-js | v2 mới nhất ổn định | 2.117.2 |

## 3. Sơ đồ tổng thể

```
 Điện thoại/PC (PWA React 19)
   │  UI Glassmorphism · Dexie (menu cache + outbox) · Service Worker
   │
   ├─ Cloudflare Pages ── phát file tĩnh, _headers (no-cache cho sw.js/index.html)
   │
   └─ Supabase
        ├─ Auth (Email OTP 6 số qua SMTP; username+password nội bộ)
        ├─ Postgres + RLS (products, bills, stats, …)
        ├─ Storage: bucket private `bills` (PNG)
        ├─ Realtime: kênh app_meta (menu_version)
        ├─ Edge Functions: auth-login, bootstrap-admin, admin-users, recovery, cleanup-bills
        └─ pg_cron: dọn bill > 15 ngày (gọi cleanup-bills)
```

## 4. Xác thực & phân quyền

### 4.1 Vai trò
`admin` (duy nhất 1, gốc) · `staff` (do user tạo). Mọi staff vào đủ 5 menu.

| Hành động | admin | staff |
|---|:--:|:--:|
| Xem Dashboard / Bill / Sản phẩm / Thanh toán | ✔ | ✔ |
| Thêm/sửa sản phẩm, nhóm, topping | ✔ | ✔ |
| Tạo bill, xuất PNG | ✔ | ✔ |
| Xóa bill | ✘ (không ai) | ✘ |
| Thêm user mới (role staff) | ✔ | ✔ |
| Cấp lại / đổi mật khẩu **người khác** | ✔ | ✘ |
| Xóa user | ✔ | ✘ |
| Đổi mật khẩu **của chính mình** (nhập mật khẩu cũ) | ✔ | ✔ |
| Tác động lên tài khoản admin | ✔ (chính mình) | ✘ |

> Giả định ghi lại (chờ user xác nhận ở cuối dự án): staff được *thêm* user mới (theo ý "trừ khi user đó tạo 1 user khác") nhưng không được xóa hay đổi mật khẩu ai.

### 4.2 Bootstrap admin (lần đầu)
1. Màn hình đăng ký chỉ hiện khi `app_meta.bootstrapped = false`.
2. Nhập **địa chỉ email admin**; Edge Function `bootstrap-admin` kiểm tra email **trùng secret `BOOTSTRAP_ADMIN_EMAIL`** (chống người lạ chiếm quyền admin trước), và chưa có admin.
3. Gửi **OTP 6 số** đến email đó (Supabase Auth email OTP, hết hạn 10 phút, giới hạn lần thử) qua SMTP riêng.
4. Xác minh OTP → đặt `username` + mật khẩu cho admin → ghi `profiles.role = 'admin'`, `app_meta.bootstrapped = true`, và **`app_meta.admin_email` = email vừa xác minh** (email này là "key admin" cho khôi phục/đổi về sau, §4.4).
   > **Không dùng Google OAuth** (chốt 2026-10-02): OTP gửi vào đúng hộp thư đã chứng minh quyền sở hữu email; bỏ được cấu hình Google Cloud Console/OAuth client. Toàn bộ luồng chỉ cần SMTP (§4.5).
5. Từ đây: Supabase **tắt signup công khai**; route đăng ký trả 404.
6. **Secret theo môi trường**: `BOOTSTRAP_ADMIN_EMAIL` chỉ có hiệu lực tới khi `bootstrapped=true`. Môi trường test set = email dev (lấy mẫu OTP), **PROD set = email người vận hành** để họ tự bootstrap lần đầu. Sau bootstrap có thể xoá/đổi secret mà không ảnh hưởng hệ thống (xem Q-005, `state.json → decisions.admin_transfer`).

### 4.3 Đăng nhập thường ngày
- Frontend chỉ nhập **mật khẩu**; `username` được nhớ ở localStorage sau lần đầu (có nút "Đổi tài khoản"). Không bao giờ lưu mật khẩu.
- Username ánh xạ sang email nội bộ `"<username>@hem.local"` trong Supabase Auth (không gửi mail tới đó).
- Gọi Edge Function `auth-login` (kiểm tra lockout/Turnstile → `signInWithPassword` phía server → trả session).
- **Ghi nhớ đăng nhập**: bật → session ở `localStorage`; tắt → `sessionStorage`.
- **Giới hạn 7 ngày**: (a) client kiểm tra `login_at`; (b) RLS thêm hàm `session_fresh()` so `iat` của JWT với 7 ngày → quá hạn là mất quyền truy cập dù client bị sửa.

### 4.4 Khôi phục mật khẩu & đổi email khôi phục
- **Admin — "Quên mật khẩu"**: nhập email admin → Edge Function `admin-recovery` **bắt buộc email trùng `app_meta.admin_email`** → OTP 6 số → đặt mật khẩu mới.
  > Nếu không ràng buộc này thì bất kỳ email nào cũng reset được mật khẩu admin = lỗ hổng nghiêm trọng.
- **Admin — Đổi email khôi phục ("đổi key admin", làm được bất cứ lúc nào khi đã đăng nhập)** — phải qua **đúng 2 điều kiện, theo thứ tự**:
  1. **Chứng minh quyền sở hữu hiện tại**: OTP gửi tới email **hiện tại** (`app_meta.admin_email`) **và** nhập đúng mật khẩu admin hiện tại.
  2. **Xác thực email mới**: OTP gửi tới email **mới** → đặt **mật khẩu mới** → ghi đè `app_meta.admin_email` = email mới.
  - Thực hiện qua Edge Function `change-recovery-email`: server tự kiểm **cả 2 OTP + mật khẩu**, không tin client; thiếu bất kỳ điều kiện nào → từ chối, không thay đổi gì.
  - Mật khẩu mới có hiệu lực ngay; email cũ không còn dùng được để khôi phục.
- **Staff**: không tự khôi phục; admin cấp lại trong menu User (sinh mật khẩu tạm, buộc đổi ở lần đăng nhập kế).

### 4.5 SMTP
Mailer mặc định của Supabase bị giới hạn rất thấp. Dùng **SMTP riêng miễn phí** (Gmail App Password hoặc Resend free). Cấu hình ở `P3-T1`; thông tin SMTP do **user cung cấp** (agent phải hỏi, không tự bịa).

## 5. Cơ sở dữ liệu (tóm tắt; chi tiết/migration trong `backend/skill.md`)

| Bảng | Mục đích |
|---|---|
| `profiles` | id (= auth.users.id), username (unique, lowercase), display_name, role, must_change_password, created_by, created_at |
| `app_meta` | key/value: `bootstrapped`, `menu_version` (int tăng tự động), `schema_version`, `admin_email` (email admin gốc — **chỉ `service_role` đọc/ghi**, không grant cho anon/authenticated; xem §4.4) |
| `categories` | nhóm sản phẩm (mở rộng được), icon, sort_order, is_active |
| `products` | category_id, name, price (int VND), icon, is_active, updated_at |
| `toppings` | name, price, icon, is_active (sản phẩm phụ) |
| `product_toppings` | (tùy chọn) topping áp cho sản phẩm/nhóm nào |
| `bills` | id, client_uuid (unique, chống trùng khi sync), code (unique), total, phone_note, image_path, created_by, created_at, expires_at (= +15 ngày), is_offline |
| `bill_items` | bill_id, product_id (nullable), name_snapshot, unit_price_snapshot, qty, note, parent_item_id (topping thuộc món) |
| `stats_daily` | date, revenue, bill_count — **vĩnh viễn** |
| `stats_product_monthly` | month, product_key, name, qty, revenue — **vĩnh viễn** |
| `stats_product_alltime` | product_key, name, qty, revenue — **vĩnh viễn** |
| `login_attempts` | username, ip, success, at — phục vụ lockout |

**Quan trọng:** bill bị xóa sau 15 ngày nhưng báo cáo/ranking "từ trước đến nay" phải còn. Vì vậy thống kê được cập nhật **bằng trigger khi chèn bill** vào các bảng `stats_*`, độc lập với bảng `bills`.

`menu_version`: trigger tăng số này mỗi khi `categories/products/toppings` thay đổi → cơ chế chống giá cũ (mục 8).

## 6. Quy tắc bill

### 6.1 Bố cục (từ trên xuống, canh giữa, rộng xuất 720 px, `pixelRatio` 2)
1. **Logo** — `Logo.png`
2. **Mã bill** `HT-YYMMDD-0001` (số thứ tự reset theo ngày VN) + SĐT: `0338525677 (Vi) - 0362335733 (Linh)` (+ thời gian)
3. **Bảng sản phẩm**: `Sản phẩm | SL | Đơn giá | Thành tiền`; dòng ghi chú ngay dưới món (chữ nhỏ, nghiêng); topping là dòng con thụt lề kèm giá
4. **Tổng tiền** (in đậm, cuối bảng)
5. **QR** trỏ tới `https://www.facebook.com/linh.kh.142` (+ nhãn "Facebook")
6. **Lời chúc**: `Cảm ơn khách hàng thân yêu của Hẻm`
7. **Địa chỉ** (cuối bill): `Phường Long Nguyên, Thành Phố Hồ Chí Minh`

Không có thông tin tiền mặt/chuyển khoản, giảm giá, tiền thối.

### 6.2 Mã bill
- Online: RPC `next_bill_code()` cấp số tuần tự theo ngày (nguyên tử, không trùng).
- Offline: mã tạm `HT-YYMMDD-OFF-<4 ký tự>` và **giữ nguyên** làm mã chính thức (ảnh đã gửi cho khách nên không đổi). `is_offline = true`.

### 6.3 Xuất & chia sẻ
Render bill ra DOM ẩn → `html-to-image.toBlob()` → (1) upload Supabase Storage `bills/YYYY/MM/<code>.png` (hoặc xếp outbox nếu offline) → (2) `navigator.share({files})` để chia sẻ Zalo/Messenger; nếu thiết bị không hỗ trợ thì nút **Lưu về máy**. Lưu ý Safari: gọi chụp ảnh 2 lần (lần đầu để nạp font/ảnh) và dùng ảnh dạng data-URL cho logo/QR.

### 6.4 Vòng đời
Thanh toán → ghi bill + items (transaction) → trigger cập nhật `stats_*` → ảnh vào Storage → hiện ở menu Quản lý bill. Sau 15 ngày `cleanup-bills` xóa dòng `bills/bill_items` **và** file trong Storage (qua Storage API, không xóa bằng SQL).

## 7. Giao diện

### 7.1 Ngôn ngữ thiết kế
Bám `template.html` (màn hình login): sân khấu 9:16, logo tại `left 56.9% / top 29.5% / width 27.4%`, thẻ kính tại `left 52.7% / top 42.6% / width 41.3%`, mọi kích thước scale theo `--ui`, ô nhập bo tròn viền trắng mờ có icon ngăn bằng vạch, nút trắng-xanh nhạt `#1b6fd1`, hiệu ứng `shake` khi lỗi, tôn trọng `prefers-reduced-motion`. Màu chủ đạo `#1e8fe8` / `#1b6fd1`.
Thay đổi so với template: **font Calibri/Carlito** (template đang dùng Inter), thêm checkbox "Ghi nhớ", nút **"Tải App"** góc phải trên, liên kết "Quên mật khẩu".

### 7.2 Sau đăng nhập
Nền `background.png` (ảnh sáng, chói) + **overlay tối** `rgba(8,30,60,.45)` + `backdrop-blur`. Thành phần: sidebar/bottom-nav 5 mục, thẻ kính (`bg-white/15`, `border-white/30`, `backdrop-blur-xl`), chữ trắng, tương phản ≥ 4.5:1.

### 7.3 Năm menu
1. **Dashboard** — KPI: doanh thu hôm nay, số bill hôm nay (+ doanh thu tháng). 
   - **Chart A (đường, mẫu `chart_1.png`)**: doanh thu theo tháng, hiển thị số trên điểm, có phóng to/thu nhỏ, kéo cuộn khi zoom, thanh brush bên dưới, đường cong spline màu xanh phát sáng, nền kính.
   - **Chart B (vòng cung, mẫu `chart_2.png`)**: tỷ lệ % sản phẩm bán chạy trong tháng (radialBar nhiều vòng, nhãn giữa "TOP N"). Cạnh trái là **Rank** của tháng; % = qty sản phẩm / tổng qty tháng.
   - **Rank top 5 bán chạy nhất** (all-time) và **top ít bán chạy nhất** (all-time, chỉ tính sản phẩm đã từng bán ≥ 1).
2. **Sản phẩm** — modal thêm sản phẩm; nhóm mặc định (Trà trái cây, Trà sữa, Cà phê, Latte, Sữa tươi, Nước ép, Sinh tố) **không khóa cứng**, thêm/sửa/ẩn nhóm; sản phẩm có đơn giá + topping; bảng danh sách có tìm kiếm/lọc.
3. **Thanh toán** — lưới sản phẩm (icon 2D theo nhóm; bấm "+" thêm vào bill) bên trái; **panel bill realtime** bên phải hiển thị đúng layout 6.1; nút Thanh toán → xuất PNG → chia sẻ/lưu.
4. **Quản lý bill** — bảng (mã, thời gian, người tạo, tổng, số món), nút mở modal xem ảnh PNG, chia sẻ lại/tải về; **không có nút xóa**; tag "tự xóa sau N ngày".
5. **Quản lý user** — danh sách, thêm user, cấp lại mật khẩu, đổi mật khẩu, xóa (theo bảng quyền 4.1).

### 7.4 Bộ icon đồ uống
Dùng bộ SVG 2D **có giấy phép cho phép nhúng** (ví dụ Fluent Emoji Flat — MIT, hoặc Noto Emoji — Apache-2.0), tải về `public/icons/drinks/` và ánh xạ theo nhóm (trà sữa, trà trái cây, matcha, cà phê, latte, sữa tươi, nước ép, sinh tố, topping…). Chỗ nào bộ icon thiếu (vd. trân châu, matcha) → agent **hỏi user**, không tự vẽ bừa. Ghi nguồn + giấy phép vào `THIRD_PARTY.md`.

## 8. PWA & Offline an toàn giá (yêu cầu then chốt)

**Nguy cơ:** sửa giá/thêm món nhưng thiết bị còn cache cũ → bán sai giá. **Giải pháp nhiều lớp:**

1. **Phân tầng cache**
   - *App shell* (JS/CSS/ảnh tĩnh): precache theo hash (Workbox). `index.html` và `sw.js` luôn `Cache-Control: no-cache` (qua `_headers`).
   - *API/menu*: **không** để Service Worker cache phản hồi API. Menu nằm ở IndexedDB do app quản lý, có `menu_version` + `fetched_at`.
2. **Đồng bộ menu (online):** khi mở app, khi tab hiện lại (`visibilitychange`), khi có mạng trở lại và qua **Realtime** kênh `app_meta`, so `menu_version` ở server; khác → tải lại menu và cập nhật IndexedDB. Mặc định giá lấy từ server; cache chỉ là phương án dự phòng.
3. **Khi bấm thanh toán (online):** gọi RPC kiểm tra `menu_version` hiện tại; nếu lệch → buộc làm mới menu, báo "Giá vừa cập nhật" và cho xem lại giỏ trước khi chốt. Giá chốt trong DB được **tính lại phía server từ bảng `products`** (không tin giá client) — giá client chỉ để hiển thị.
4. **Offline:** bán bằng menu đã cache, hiện banner "Đang offline — giá cập nhật lúc HH:mm"; bill đi vào **outbox** (Dexie) với snapshot giá + `client_uuid` + ảnh PNG; tự đồng bộ khi có mạng (idempotent theo `client_uuid`). Nếu server phát hiện giá lệch khi sync, **giữ giá snapshot trên bill** (đã giao cho khách), gắn cờ `price_drift` để admin thấy.
5. **Cache cũ quá hạn:** cache menu > 24 giờ khi offline → cảnh báo nổi bật (vẫn cho bán).
6. **Cập nhật app:** Service Worker `skipWaiting` có xác nhận ("Có phiên bản mới — Cập nhật"); `GET /version.json` (no-store) kiểm tra định kỳ; lệch → tự dọn cache.
7. **Nút "Xóa cache & Tải lại"** (ở màn login và trong cài đặt), chạy được trên **Safari lẫn Chrome**:
   - `navigator.serviceWorker.getRegistrations()` → `unregister()`
   - `caches.keys()` → `caches.delete()`
   - xóa bảng cache menu trong IndexedDB (**không xóa outbox** — nếu còn bill chưa đồng bộ thì hỏi xác nhận)
   - xóa `sessionStorage`; giữ `localStorage` chứa username/phiên (trừ khi người dùng chọn "xóa tất cả")
   - `location.replace(url + '?r=' + Date.now())`
   - Safari không hỗ trợ `Clear-Site-Data` nên bắt buộc dùng quy trình thủ công trên; trên iOS PWA đã cài, chỉ dẫn thêm "gỡ và thêm lại" khi vẫn kẹt.
8. **Nút "Tải App" (góc phải trên màn login):**
   - Chrome/Edge/Android: bắt `beforeinstallprompt`, hiện nút → `prompt()`.
   - iOS Safari (không có prompt): nút mở hộp hướng dẫn *Chia sẻ → Thêm vào MH chính*.
   - Ẩn khi đã chạy standalone (`display-mode: standalone` / `navigator.standalone`).
9. **Manifest:** tên "Hẻm Trà", `display: standalone`, `theme_color #1e8fe8`, icon 192/512/maskable + `apple-touch-icon` 180 sinh từ `Favicon.png`.

## 9. Bảo mật (tóm tắt; chi tiết `security/skill.md`)
RLS bật mọi bảng · signup công khai tắt · `service_role` chỉ ở Edge Function · lockout 5 lần/15 phút (username + IP) · Turnstile sau 3 lần sai · giới hạn tạo bill/phút · CSP + HSTS + header an toàn qua `_headers` · bucket `bills` private + signed URL ngắn hạn · validate zod hai đầu · phiên 7 ngày · không log dữ liệu nhạy cảm · `npm audit` + quét secret trong CI.

## 10. Cấu trúc thư mục dự án

```
.
├─ AGENT.md  plan.md  design.md  loop.md  subagent.md  state.json
├─ .opencode/skills/{security,backend,uiux}/skill.md
├─ public/ (icons/, fonts/, _headers, version.json)
├─ src/
│  ├─ app/ (router, providers)   ├─ features/{auth,dashboard,products,pos,bills,users}
│  ├─ components/ui/             ├─ lib/{supabase,db(dexie),sw,bill,format}
│  ├─ styles/ (tailwind.css, glass.css)   └─ assets/ (Logo, background, Favicon)
├─ supabase/ (migrations/, functions/, tests/, config.toml)
├─ e2e/ (Playwright)           └─ THIRD_PARTY.md
```

## 11. Chất lượng & hiệu năng
- Mục tiêu: LCP < 2.5 s trên 4G; JS ban đầu < 250 KB gzip (ApexCharts và html-to-image tải lười).
- Unit test: logic tiền, mã bill, đồng bộ outbox, phân quyền, tính % ranking. Coverage tối thiểu 80% cho `lib/` và `features/*/logic`.
- E2E: bootstrap → login → thêm sản phẩm → bán → xuất PNG → xem bill → tạo user → offline → đồng bộ lại.
- A11y: nhãn form, focus rõ, tương phản, hỗ trợ `prefers-reduced-motion`.

## 12. Giới hạn miễn phí cần lưu ý
Supabase free: tạm dừng dự án sau ~1 tuần không hoạt động (cần ping/đăng nhập định kỳ), dung lượng DB 500 MB, Storage 1 GB (bill PNG nên < 200 KB và tự dọn 15 ngày). Cloudflare Pages free: 500 lượt build/tháng. Agent phải kiểm tra lại hạn mức hiện hành trước khi triển khai.

## 13. Open Questions (agent không được tự quyết)
- ~~Email Google bootstrap (`BOOTSTRAP_ADMIN_EMAIL`)?~~ — đã trả lời 2026-10-02: xem `state.json → decisions.bootstrap_admin_email`; không dùng Google OAuth, chỉ OTP email.
- Thông tin SMTP gửi OTP? — cần user
- Staff được thêm user hay không (xem 4.1)? — chờ xác nhận
- Bộ icon cụ thể và icon còn thiếu? — hỏi ở `P6`
