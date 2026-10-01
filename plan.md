# plan.md — Kế hoạch triển khai Hẻm Trà

> Cách dùng: main-coding đọc file này theo `loop.md`. Chỉ tick `[x]` khi **task có bằng chứng** (lệnh + output) và đã ghi `state.json`.
> Mỗi phase kết thúc bằng 2 cổng: **QC** (`qc-test`) rồi **SEC** (`security-audit`). Chưa qua cả hai = phase chưa xong.
> Ký hiệu: 📖 = skill phải đọc · ❓ = cần hỏi user trước khi làm · 🔒 = nhạy cảm bảo mật.

Tài nguyên có sẵn từ user: `Logo.png`, `Favicon.png`, `background.png`, `chart_1.png` (đường), `chart_2.png` (vòng cung), `template.html` (mẫu login).

---

## P0 — Khởi tạo dự án
📖 `AGENT.md`, `design.md §2, §10`
- [x] **P0-T1** Tạo repo, `git init`, `.gitignore` (có `.env*`, `node_modules`, `dist`), `.env.example`
- [x] **P0-T2** Khởi tạo Vite + React 19 + TS; chạy `npm view` chốt phiên bản (design §2.1), ghi vào `design.md`/state; Tailwind v4 qua `@tailwindcss/vite`
- [x] **P0-T3** ESLint + Prettier + `tsc --noEmit` + scripts `lint`, `typecheck`, `test`, `test:e2e`, `build`
- [x] **P0-T4** Cài Vitest + RTL + MSW + Playwright; viết 1 test mẫu chạy xanh
- [x] **P0-T5** Copy tài nguyên vào `src/assets/`; nén ảnh nền (WebP + PNG dự phòng), tạo `THIRD_PARTY.md`
- [x] **P0-T6** Supabase CLI: `supabase init`, chạy được `supabase start` (local)
- [x] **P0-T7** Sinh icon PWA từ `Favicon.png` (192, 512, maskable, apple-touch 180)
- **Gate:** QC ☑ PASS · SEC ☑ PASS (2026-10-01, xem `state.json → loop.last_report`)

## P1 — Backend: database & RLS
📖 `backend/skill.md`, `security/skill.md §RLS`
- [x] **P1-T1** Migration bảng: `profiles`, `app_meta`, `categories`, `products`, `toppings`, `product_toppings`
- [x] **P1-T2** Migration: `bills`, `bill_items`, `login_attempts`
- [x] **P1-T3** Migration thống kê vĩnh viễn: `stats_daily`, `stats_product_monthly`, `stats_product_alltime` + trigger cập nhật khi chèn bill
- [x] **P1-T4** Trigger tăng `menu_version` khi menu thay đổi; bật Realtime cho `app_meta`
- [x] **P1-T5** Hàm `next_bill_code()` (reset theo ngày VN, nguyên tử), hàm `session_fresh()` (JWT ≤ 7 ngày), hàm `is_admin()`
- [x] **P1-T6** 🔒 RLS + policy cho **mọi** bảng theo bảng quyền (design §4.1)
- [x] **P1-T7** RPC `create_bill(...)` (transaction; tính lại giá phía server; idempotent theo `client_uuid`; kiểm tra `menu_version`)
- [x] **P1-T8** Storage bucket private `bills` + policy (đọc: user đã đăng nhập & session_fresh; ghi: qua đường dẫn hợp lệ; không xóa từ client)
- [ ] **P1-T9** Seed: nhóm mặc định (7 nhóm), vài sản phẩm/topping mẫu (chỉ môi trường dev)
- [ ] **P1-T10** Test SQL (`supabase test db`): RLS từng bảng, trigger thống kê, mã bill, idempotency
- **Gate:** QC ☐ · SEC ☐

## P2 — UI/UX nền tảng & màn hình đăng nhập
📖 `uiux/skill.md`, `design.md §7`
- [ ] **P2-T1** Design tokens + `glass.css` (glass card, glass input, glass button) + font Carlito self-host + fallback chuỗi Calibri
- [ ] **P2-T2** Chuyển `template.html` thành component `LoginStage` (giữ nguyên tỉ lệ %, `--ui`, hiệu ứng shake, reduced-motion)
- [ ] **P2-T3** Form đăng nhập: chỉ nhập mật khẩu khi đã có username lưu; nút "Đổi tài khoản"; checkbox "Ghi nhớ"; hiện/ẩn mật khẩu; thông báo lỗi tiếng Việt
- [ ] **P2-T4** Nút **"Tải App"** góc phải trên (Chrome prompt + hướng dẫn iOS); ẩn khi standalone
- [ ] **P2-T5** Nút **"Xóa cache & Tải lại"** trên màn login (logic ở P4; ở đây dựng UI + hook giả lập có test)
- [ ] **P2-T6** Layout sau đăng nhập: nền `background.png` + overlay, sidebar (desktop) / bottom-nav (mobile) 5 menu, trang trống từng menu
- [ ] **P2-T7** Test component + ảnh chụp Playwright (390×844 và 1280×800)
- **Gate:** QC ☐ · SEC ☐

## P3 — Xác thực, bootstrap admin, phiên
📖 `backend/skill.md`, `security/skill.md §Auth`
- ❓ **P3-T0** Hỏi user: `BOOTSTRAP_ADMIN_EMAIL`, thông tin SMTP (Gmail App Password hoặc Resend), domain Pages. **Dừng nếu chưa có.**
- [ ] **P3-T1** 🔒 Cấu hình Supabase Auth: tắt signup công khai, bật Google provider, email OTP (6 số, 10 phút), SMTP riêng
- [ ] **P3-T2** 🔒 Edge Function `bootstrap-admin` (kiểm tra email trùng secret, chỉ chạy khi `bootstrapped=false`)
- [ ] **P3-T3** Màn hình đăng ký lần đầu (Google → OTP → đặt username+mật khẩu); ẩn vĩnh viễn sau bootstrap
- [ ] **P3-T4** 🔒 Edge Function `auth-login` (lockout 5/15 phút theo username+IP, Turnstile sau 3 lần sai, thông báo lỗi chung chung)
- [ ] **P3-T5** Quản lý session: "ghi nhớ" (localStorage) vs tắt (sessionStorage), giới hạn 7 ngày client + `session_fresh()` server, tự đăng xuất khi hết hạn
- [ ] **P3-T6** Khôi phục mật khẩu admin qua Google + OTP; staff hiển thị "Liên hệ admin"
- [ ] **P3-T7** Route guard theo role; đổi mật khẩu bản thân (nhập mật khẩu cũ); `must_change_password` buộc đổi lần đầu
- [ ] **P3-T8** Test: unit (guard, session), Playwright (bootstrap, login sai/đúng, lockout, hết hạn 7 ngày, khôi phục)
- **Gate:** QC ☐ · SEC ☐

## P4 — PWA, offline, chống kẹt cache
📖 `uiux/skill.md`, `security/skill.md §Headers`, `design.md §8`
- [ ] **P4-T1** `vite-plugin-pwa` (`injectManifest`), manifest, precache app shell, `index.html`/`sw.js` no-cache trong `public/_headers`
- [ ] **P4-T2** Dexie: bảng `menuCache` (có `menu_version`, `fetched_at`) và `outbox`
- [ ] **P4-T3** Đồng bộ menu: lúc mở app, `visibilitychange`, `online`, Realtime `app_meta`; so `menu_version`
- [ ] **P4-T4** Banner trạng thái mạng + "giá cập nhật lúc …"; cảnh báo cache > 24 giờ
- [ ] **P4-T5** Outbox bill + đồng bộ idempotent theo `client_uuid`; xử lý `price_drift`
- [ ] **P4-T6** `version.json` + kiểm tra định kỳ; luồng cập nhật SW có xác nhận
- [ ] **P4-T7** Hàm `hardRefresh()` (design §8.7) hoạt động Safari + Chrome; bảo vệ outbox (xác nhận trước khi xóa)
- [ ] **P4-T8** Hoàn thiện nút Tải App & Xóa cache (nối logic thật với UI từ P2)
- [ ] **P4-T9** Test: unit (so version, outbox), Playwright (offline → bán → online → đồng bộ; đổi giá ở tab khác → tab cũ thấy giá mới; hardRefresh)
- **Gate:** QC ☐ · SEC ☐

## P5 — Menu Sản phẩm
📖 `uiux/skill.md`, `backend/skill.md`
- [ ] **P5-T1** CRUD nhóm sản phẩm (thêm/sửa/ẩn, sắp xếp, chọn icon); nhóm mặc định không khóa cứng
- [ ] **P5-T2** Modal thêm/sửa sản phẩm: tên, nhóm, đơn giá, icon, topping áp dụng
- [ ] **P5-T3** CRUD topping (sản phẩm phụ)
- [ ] **P5-T4** Bảng danh sách: tìm kiếm, lọc theo nhóm, bật/tắt bán; xác nhận trước khi ẩn
- [ ] **P5-T5** Validate zod (giá nguyên dương, tên không rỗng, không trùng trong nhóm); lỗi tiếng Việt
- [ ] **P5-T6** Test: unit + Playwright (thêm nhóm → thêm sản phẩm → thấy ngay ở Thanh toán sau đồng bộ)
- **Gate:** QC ☐ · SEC ☐

## P6 — Menu Thanh toán & Bill PNG
📖 `uiux/skill.md`, `design.md §6`
- ❓ **P6-T0** Chốt bộ icon đồ uống (đề xuất Fluent Emoji Flat/Noto); hỏi user nếu thiếu icon
- [ ] **P6-T1** Nạp bộ icon vào `public/icons/drinks/`, map theo nhóm; ghi giấy phép
- [ ] **P6-T2** Lưới sản phẩm theo nhóm (tab/lọc), nút "+" thêm vào bill
- [ ] **P6-T3** Panel bill realtime: tăng/giảm số lượng, ghi chú món, topping dòng con, tổng tiền
- [ ] **P6-T4** Component `BillSheet` đúng layout (logo → mã+SĐT → bảng → tổng → QR FB → lời chúc → địa chỉ)
- [ ] **P6-T5** Sinh QR (`qrcode`) cho `https://www.facebook.com/linh.kh.142`
- [ ] **P6-T6** Xuất PNG (`html-to-image`, 720px, ×2), xử lý font/ảnh Safari
- [ ] **P6-T7** Thanh toán: RPC `create_bill`, upload PNG, mã bill, xử lý lệch `menu_version`
- [ ] **P6-T8** Chia sẻ: Web Share API (Zalo/Messenger) + nút Lưu về máy + fallback
- [ ] **P6-T9** Test: unit (tổng tiền, định dạng VND, mã bill), snapshot bill, Playwright (bán 1 đơn → PNG → xem được)
- **Gate:** QC ☐ · SEC ☐

## P7 — Menu Quản lý bill & dọn 15 ngày
📖 `backend/skill.md`, `security/skill.md §Storage`
- [ ] **P7-T1** Bảng bill (phân trang, lọc ngày, tìm theo mã), không có nút xóa
- [ ] **P7-T2** Modal xem ảnh bill (signed URL ngắn hạn), chia sẻ lại / tải về
- [ ] **P7-T3** 🔒 Edge Function `cleanup-bills` (xóa file Storage qua API trước, rồi xóa dòng DB; không đụng `stats_*`)
- [ ] **P7-T4** pg_cron lịch hằng ngày gọi `cleanup-bills`; hiển thị "tự xóa sau N ngày"
- [ ] **P7-T5** Test: dựng bill giả hết hạn → job xóa đúng; thống kê còn nguyên
- **Gate:** QC ☐ · SEC ☐

## P8 — Dashboard & báo cáo
📖 `uiux/skill.md`, `backend/skill.md`
- [ ] **P8-T1** Thẻ KPI: doanh thu hôm nay, số bill hôm nay, doanh thu tháng (từ `stats_*`)
- [ ] **P8-T2** Chart A đường (mẫu `chart_1.png`): doanh thu theo ngày trong tháng, nhãn số, zoom/pan, brush; chọn tháng
- [ ] **P8-T3** Chart B vòng cung (mẫu `chart_2.png`): % sản phẩm trong tháng + Rank bên trái
- [ ] **P8-T4** Rank top 5 bán chạy nhất & top ít bán chạy nhất (all-time)
- [ ] **P8-T5** Tự cập nhật khi có bill mới (Realtime/invalidate), trạng thái loading/empty/error
- [ ] **P8-T6** Lazy-load ApexCharts; kiểm tra bundle ban đầu
- [ ] **P8-T7** Test: unit (tính %, sắp hạng, tie-break), Playwright (bán → dashboard đổi)
- **Gate:** QC ☐ · SEC ☐

## P9 — Menu Quản lý user
📖 `backend/skill.md`, `security/skill.md §Auth`
- [ ] **P9-T1** Danh sách user (role, người tạo, ngày tạo, trạng thái)
- [ ] **P9-T2** 🔒 Edge Function `admin-users`: tạo user, cấp lại mật khẩu (sinh tạm), đặt mật khẩu, xóa — kiểm quyền phía server
- [ ] **P9-T3** UI thêm user, cấp lại/đổi mật khẩu (admin), xóa (admin, có xác nhận)
- [ ] **P9-T4** Chặn mọi thao tác lên tài khoản admin từ non-admin (cả UI và server)
- [ ] **P9-T5** Test: ma trận quyền (admin/staff × hành động) bằng unit + SQL + Playwright
- **Gate:** QC ☐ · SEC ☐

## P10 — Củng cố bảo mật toàn hệ thống
📖 `security/skill.md` (toàn bộ)
- [ ] **P10-T1** Header an toàn + CSP trong `_headers`; kiểm tra không vỡ chức năng
- [ ] **P10-T2** Rate limit tạo bill/phút, giới hạn kích thước & loại file upload
- [ ] **P10-T3** Quét secret (gitleaks), `npm audit`, kiểm tra thư viện bị bỏ rơi
- [ ] **P10-T4** Kịch bản tấn công thủ công: IDOR bill, nâng quyền staff→admin, sửa JWT, brute-force, XSS ở ghi chú/tên sản phẩm
- [ ] **P10-T5** Cloudflare: rule rate-limit + Turnstile bật thật
- **Gate:** QC ☐ · SEC ☐ (SEC chạy toàn diện, không chỉ diff)

## P11 — E2E toàn luồng & triển khai
📖 `design.md §11, §12`
- [ ] **P11-T1** E2E đầy đủ (design §11) trên Chromium + WebKit (mô phỏng Safari)
- [ ] **P11-T2** Kiểm tra Lighthouse PWA/Perf/A11y; sửa hạng mục dưới ngưỡng
- [ ] **P11-T3** Deploy Cloudflare Pages (build, env, `_headers`); deploy Edge Functions, migrations lên Supabase thật
- [ ] **P11-T4** Smoke test trên URL thật (điện thoại thật hoặc emulator), cài PWA, kiểm tra hardRefresh
- [ ] **P11-T5** Viết `README.md` (cài đặt, biến môi trường, quy trình sao lưu/ping chống Supabase tạm dừng)
- [ ] **P11-T6** Báo cáo cuối cho user + danh sách giả định cần xác nhận
- **Gate:** QC ☐ · SEC ☐ → **Hỏi user**

---

## Định nghĩa hoàn thành (DoD) mỗi task
1. Code chạy, đúng `design.md`  2. Có test cho logic mới  3. `lint` + `typecheck` + `test` xanh (có output)  4. Không đụng ngoài phạm vi task  5. Đã ghi `state.json`.

## Backlog (agent ghi thêm, không tự làm)
- _(trống)_
