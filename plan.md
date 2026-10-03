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
- [x] **P1-T9** Seed: nhóm mặc định (7 nhóm), vài sản phẩm/topping mẫu (chỉ môi trường dev)
- [x] **P1-T10** Test SQL (`supabase test db`): RLS từng bảng, trigger thống kê, mã bill, idempotency
- **Gate:** QC ☑ PASS · SEC ☑ PASS (2026-10-02, xem `state.json → loop.last_report`)

## P2 — UI/UX nền tảng & màn hình đăng nhập
📖 `uiux/skill.md`, `design.md §7`
- [x] **P2-T1** Design tokens + `glass.css` (glass card, glass input, glass button) + font Carlito self-host + fallback chuỗi Calibri
- [x] **P2-T2** Chuyển `template.html` thành component `LoginStage` (giữ nguyên tỉ lệ %, `--ui`, hiệu ứng shake, reduced-motion)
- [x] **P2-T3** Form đăng nhập: chỉ nhập mật khẩu khi đã có username lưu; nút "Đổi tài khoản"; checkbox "Ghi nhớ"; hiện/ẩn mật khẩu; thông báo lỗi tiếng Việt
- [x] **P2-T4** Nút **"Tải App"** góc phải trên (Chrome prompt + hướng dẫn iOS); ẩn khi standalone
- [x] **P2-T5** Nút **"Xóa cache & Tải lại"** trên màn login (logic ở P4; ở đây dựng UI + hook giả lập có test)
- [x] **P2-T6** Layout sau đăng nhập: nền `background.png` + overlay, sidebar (desktop) / bottom-nav (mobile) 5 menu, trang trống từng menu
- [x] **P2-T7** Test component + ảnh chụp Playwright (390×844 và 1280×800)
- **Gate:** QC ☑ PASS (2026-10-02, 43/43 unit + 9/9 e2e, xem `state.json → loop.last_report`) · SEC ☑ PASS (2026-10-02, 0 lỗi, `.opencode/evidence/p2-sec-round1.md`)

## P3 — Xác thực, bootstrap admin, phiên
📖 `backend/skill.md`, `security/skill.md §Auth`
- [x] **P3-T0** Hỏi user: `BOOTSTRAP_ADMIN_EMAIL`, thông tin SMTP (Gmail App Password hoặc Resend), domain Pages. **Dừng nếu chưa có.** → đủ 2026-10-02 (lưu ở `state.json → decisions`, không commit secret)
- [x] **P3-T1** 🔒 Cấu hình Supabase Auth: OTP email 6 số/hết hạn 10 phút, `site_url`/redirect (đã xong qua Management API), SMTP riêng, tắt signup công khai **sau khi bootstrap** (design §4.2.5). *Không dùng Google OAuth (chốt 2026-10-02)* → xong 2026-10-02 (SMTP Gmail + 7 subject/template VI; smoke OTP+recover 200; evidence p3t1-smtp-email-config.md)
- [x] **P3-T2** 🔒 Edge Function `bootstrap-admin` (kiểm tra email trùng secret, chỉ chạy khi `bootstrapped=false`)
- [x] **P3-T3** Màn hình đăng ký lần đầu (nhập email admin → OTP → đặt username+mật khẩu); ẩn vĩnh viễn sau bootstrap → xong 2026-10-02 (route `/setup` 2 bước gọi EF `bootstrap-admin`, link "Thiết lập lần đầu" trên login chỉ hiện khi `bootstrapped=false`; 92 unit + 15 e2e xanh, coverage lines 97.88%, gitleaks 0 leak)
- [x] **P3-T4** 🔒 Edge Function `auth-login` (lockout 5/15 phút theo username+IP, sai 5 lần thì UI kích hoạt OTP khôi phục lượt đăng nhập qua `unlock-otp`/`unlock-verify`, thông báo lỗi chung chung; *bỏ Turnstile* 2026-10-02) → xong 2026-10-02 (EF deploy cloud, smoke 19/19 PASS, signIn() thật, LoginStage luồng OTP; 106 unit + 15 e2e xanh, coverage lines 97.61%, gitleaks 0 leak)
- [x] **P3-T5** Quản lý session: "ghi nhớ" (localStorage) vs tắt (sessionStorage), giới hạn 7 ngày client + `session_fresh()` server, tự đăng xuất khi hết hạn → xong 2026-10-02 (client: `lib/supabase.ts` tạo client + storage route theo cờ "ghi nhớ", `lib/session.ts` login_at/apply/end, `sessionGuard` tự đăng xuất khi quá 7 ngày → về `/login` gợi ý; server `session_fresh()` đã có từ P1; 133 unit + 15 e2e xanh, coverage lines 95.66%, build gzip 147.46KB, gitleaks 0 leak)
- [x] **P3-T6** Khôi phục mật khẩu admin qua OTP email — EF `admin-recovery` **bắt buộc email trùng `app_meta.admin_email`**; staff hiển thị "Liên hệ admin" — xong 2026-10-02 (EF deployed cloud, smoke 11/11 contract + anti-oracle; route `/recovery` 2 bước OTP+password mới, nút "Quên mật khẩu" → `/recovery`, staff note tĩnh; happy path chưa smoke — cloud pre-bootstrap `admin_email=null`, không mailbox; 152 unit + 21 e2e xanh, coverage 96.22%, gzip 148.34KB, gitleaks 0)
- [x] **P3-T7** Route guard theo role; đổi mật khẩu bản thân (nhập mật khẩu cũ); `must_change_password` buộc đổi lần đầu — xong 2026-10-02 (RequireAuth đọc `profiles.role`+cờ qua `accessGuard` — không tin claim; 5 menu cả 2 role theo §4.1; EF `change-password` xác thực token + mật khẩu cũ server-side, smoke cloud 17/17 gồm happy path user tạm; màn `/change-password` + link desktop/mobile; 184 unit + 36 e2e xanh, coverage 96.27%, gzip 149.84KB, gitleaks 0; GoTrue flag `security_update_password_require_current_password` chưa set được — API 404 trên hosted, xem backlog)
- [x] **P3-T8** 🔒 Đổi email khôi phục (chuyển giao admin) — EF `change-recovery-email` + form: **(1)** OTP email hiện tại **+ mật khẩu admin hiện tại**, **(2)** OTP email mới → đặt mật khẩu mới + ghi đè `app_meta.admin_email` (design §4.4, Q-005) → xong 2026-10-02 (EF deployed smoke cloud 28/28 gồm happy path 2 điều kiện; route `/change-recovery-email` 3 bước + link admin-only qua `AuthProfileContext`; 214 unit + 36 e2e xanh, coverage 96.17%, gzip 151.47KB, gitleaks 0; evidence `.opencode/evidence/p3t8-doi-email-khoi-phuc.md`)
- [x] **P3-T9** Test: unit (guard, session), Playwright (bootstrap, login sai/đúng, lockout, hết hạn 7 ngày, khôi phục, đổi email khôi phục) → xong 2026-10-02 (thêm `e2e/p3-auth.spec.ts` 11 test × 3 project = 33, mock tầng mạng theo hợp đồng EF — gồm cả bootstrap lần 2/email lạ bị từ chối, token sửa/hết hạn; unit guard/session giữ từ P3-T5/T7; tổng **69 e2e + 214 unit** xanh, typecheck/lint 0; evidence `.opencode/evidence/p3t9-test-auth.md`)
- **Gate:** QC ☑ PASS (2026-10-02, vòng 3, xem `state.json → loop.last_report`) · SEC ☑ PASS (2026-10-03, vòng 2, `.opencode/evidence/p3-sec-round2.md`)

## P4 — PWA, offline, chống kẹt cache
📖 `uiux/skill.md`, `security/skill.md §Headers`, `design.md §8`
- [x] **P4-T1** `vite-plugin-pwa` (`injectManifest`), manifest, precache app shell, `index.html`/`sw.js` no-cache trong `public/_headers` → xong 2026-10-03 (config `vite.config.ts`: strategies injectManifest, `src/sw.ts`, `injectRegister:false`, manifest đủ icon 192/512/maskable; build thật: precache 21 entries 4837.78 KiB, `dist/sw.js`+`manifest.webmanifest`+`version.json`; `_headers`: `/index.html`+`/sw.js` no-cache, `/version.json` no-store, `/assets/*` immutable)
- [x] **P4-T2** Dexie: bảng `menuCache` (có `menu_version`, `fetched_at`) và `outbox` → xong 2026-10-03 (`src/lib/db.ts`: `menuCache` (id/menu_version/fetched_at/categories/products/toppings) + `outbox` (client_uuid khóa chính, payload, png, status, attempts, last_error, price_drift); unit dùng module Dexie thật — không bịa schema tay)
- [x] **P4-T3** Đồng bộ menu: lúc mở app, `visibilitychange`, `online`, Realtime `app_meta`; so `menu_version` → xong 2026-10-03 (`src/lib/menuSync.ts` 4 điểm chạm + `useMenuSync()` trong AppLayout; unit menuSync.test asserts đúng 1 listener visibilitychange/online + callback realtime; e2e `p4-pwa.spec.ts` T3: mở app sau đăng nhập → ghi menu vào IndexedDB)
- [x] **P4-T4** Banner trạng thái mạng + "giá cập nhật lúc …"; cảnh báo cache > 24 giờ → xong 2026-10-03 (`src/components/ui/NetworkBanner.tsx`: offline / giá cập nhật lúc HH:mm / cache >24h; e2e T4: offline → banner, có mạng → hết)
- [x] **P4-T5** Outbox bill + đồng bộ idempotent theo `client_uuid`; xử lý `price_drift` — **nối POS ở P6-T7 xong 2026-10-03** (đã enqueue bill offline thật + `useOutboxSync` mount/event online/sau bán + `createBillUploader` upload PNG sau khi có mã; unit P6-T7 xác nhận outbox row + payload): `src/lib/outbox.ts` (`enqueueBill`/`syncOutbox` idempotent theo `client_uuid`, cờ `price_drift`, unit `outbox.test.ts`) nhưng chưa có code nào enqueue/sync ngoài test → nối luồng bán ở **P6-T7** (bán chưa có trong P4)
- [x] **P4-T6** `version.json` + kiểm tra định kỳ; luồng cập nhật SW có xác nhận → xong 2026-10-03 (plugin `hemtra:version-json` sinh `dist/version.json` no-store; `pwaClient.ts`: `registerServiceWorker()` + `startDeployVersionPolling()` 10 phút + khi `online`, `PwaUpdateBar` chờ người dùng bấm — không tự reload; **đã nối** `main.tsx` + render `PwaUpdateBar` ở AppLayout 2026-10-03; smoke build thật qua `vite preview`: SW active + page controlled, `version.json`=id build, manifest OK, 0 console error)
- [x] **P4-T7** Hàm `hardRefresh()` (design §8.7) hoạt động Safari + Chrome; bảo vệ outbox (xác nhận trước khi xóa) → xong 2026-10-03 (`src/lib/hardRefresh.ts` đúng thứ tự unregister SW → xóa caches → xóa `menuCache` **giữ outbox** → `confirmPending` khi còn bill chờ; unit `hardRefresh.test.ts` 5 case; e2e T7/T8: còn bill chưa sync → hỏi, xóa menu cache nhưng GIỮ outbox + username)
- [x] **P4-T8** Hoàn thiện nút Tải App & Xóa cache (nối logic thật với UI từ P2) → xong 2026-10-03 (`LoginStage` dùng `useInstallPrompt()` + `useClearCache()` — runner mặc định `clearCacheAndReload()` gọi `hardRefresh()` thật, không còn runner giả lập; unit LoginStage.test + useClearCache.test)
- [x] **P4-T9** Test: unit (so version, outbox), Playwright (offline → bán → online → đồng bộ; đổi giá ở tab khác → tab cũ thấy giá mới; hardRefresh) → **đủ 2026-10-03** (offline→bán→online→đồng bộ: `p6-checkout.spec.ts` ×3 project; đổi giá tab khác: `p6-price-refresh.spec.ts` ×3 project — visibility sync so `menu_version` 7→8; hardRefresh/unit: đã xong từ P4) — **một phần**: unit ✔ (version/outbox/hardRefresh/menuSync, tổng 252 xanh); Playwright có T3/T4/T7-T8 (81/81 xanh); case "offline → bán → online → đồng bộ" ghi ở **P6-T9** khi POS có (ghi rõ trong `e2e/p4-pwa.spec.ts` header), case "đổi giá tab khác" chờ menu UI ở **P5** rồi làm e2e chéo tab
- **Gate:** QC ☑ PASS (2026-10-03, vòng 2, `.opencode/evidence/p4-qc-round2.md`) · SEC ☑ PASS (2026-10-03, vòng 1, `.opencode/evidence/p4-sec-round1.md`) — *T5 (nối outbox vào POS) và T9 (2 case e2e) hoãn sang P6-T7/P6-T9 + P5 theo ghi chú từng task; xong 2 task này mới chốt `status: done` của phase*

## P5 — Menu Sản phẩm
📖 `uiux/skill.md`, `backend/skill.md`
- [x] **P5-T1** CRUD nhóm sản phẩm (thêm/sửa/ẩn, sắp xếp, chọn icon); nhóm mặc định không khóa cứng → xong 2026-10-03 (tab Nhóm: thêm/sửa/ẩn + ↑↓ `swapTargets`; icon emoji Q-004; không khóa nhóm mặc định — chỉ "Không hỗ trợ xóa nhóm — chỉ ẩn/hiện")
- [x] **P5-T2** Modal thêm/sửa sản phẩm: tên, nhóm, đơn giá, icon, topping áp dụng → xong 2026-10-03 (`forms.tsx` ProductModal: select nhóm, giá, emoji, checklist topping; sửa SP ghi lại `product_toppings` — unit `api.test.ts` "xóa link cũ, chèn bộ mới")
- [x] **P5-T3** CRUD topping (sản phẩm phụ) → xong 2026-10-03 (ToppingModal + panel; unit api.test/logic.test; e2e thêm Trân châu → "+5.000 ₫")
- [x] **P5-T4** Bảng danh sách: tìm kiếm, lọc theo nhóm, bật/tắt bán; xác nhận trước khi ẩn → xong 2026-10-03 (`filterProducts` search+lọc nhóm; ToggleButton qua `ConfirmDialog` "Ẩn khỏi menu bán?"; xóa SP có confirm "Xóa vĩnh viễn?")
- [x] **P5-T5** Validate zod (giá nguyên dương, tên không rỗng, không trùng trong nhóm); lỗi tiếng Việt → xong 2026-10-03 (zod 4.6.5, lỗi field + form tiếng Việt, aria-invalid; unit `logic.test.ts` happy/biên/lỗi; e2e thấy "Vui lòng nhập tên." + trùng tên "trà đào" bị chặn)
- [x] **P5-T6** Test: unit + Playwright (thêm nhóm → thêm sản phẩm → thấy ngay ở Thanh toán sau đồng bộ) → xong 2026-10-03 (unit tổng **294/294** → **299/299** sau QC bổ sung `ProductsPage.test.tsx`; e2e `p5-products.spec.ts` 2 test × 3 project — "thấy ở Thanh toán" kiểm bằng **menuCache** (nguồn dữ liệu POS đọc): menu_version bump → sync ghi SP vào IndexedDB, ẩn SP → biến mất khỏi menuCache; case *bán hàng* chờ P6-T9; + `e2e/p5-a11y.spec.ts` 6 test Q10/Q11 từ QC; ảnh 390×844+1280×800 ×3 project; **tổng e2e 96/96**; typecheck thật 0 — xem bên dưới)
- **Gate:** QC ☑ PASS (2026-10-03, vòng 2, `.opencode/evidence/p5-qc-round2.md`) · SEC ☑ PASS (2026-10-03, vòng 1, `.opencode/evidence/p5-sec-round1.md` — 0 BLOCKER/MAJOR; SEC-005 MINOR server vẫn cho `DELETE categories` (rule "không xóa nhóm" chỉ ở client) → backlog **P10-T2**; SEC-001 MINOR headers kế thừa → P10-T1)
  - *Ghi chú main-coding 2026-10-03:* (1) e2e bắt **crash thật** `ProductsPage.tsx` (derived state chạy khi `lists=null` → trắng trang) — đã sửa (đưa sau guard + `tsc -p app` bắt lỗi TS18047). (2) Phát hiện `npm run typecheck` cũ (`tsc --noEmit` với tsconfig solution `files:[]`) **check 0 file** — đã sửa script (`-p tsconfig.app.json && -p tsconfig.node.json`) và vá 23 lỗi type thật lộ ra (loginApi.ts, sw.ts, 6 file test — chủ yếu typing mock vitest, không đổi hành vi). Bằng chứng: typecheck 0, lint 0, 294 unit, 90 e2e, build OK.

## P6 — Menu Thanh toán & Bill PNG
📖 `uiux/skill.md`, `design.md §6`
- [x] **P6-T0** Chốt bộ icon đồ uống (đề xuất Fluent Emoji Flat/Noto); hỏi user nếu thiếu icon → xong 2026-10-03 (Q-004: **emoji Unicode** lưu trong cột `icon`, không file assets; `design.md §7.4` đã cập nhật)
- [x] **P6-T1** Nạp bộ icon vào `public/icons/drinks/`, map theo nhóm; ghi giấy phép → **HỦ theo Q-004** (emoji Unicode — không nạp PNG/SVG; nếu sau này muốn ảnh thật mới quay lại, xem `design.md §7.4`)
- [x] **P6-T2** Lưới sản phẩm theo nhóm (tab/lọc), nút "+" thêm vào bill → xong 2026-10-03 (`src/features/pos/PosPage.tsx`: tab nhóm aria-pressed theo `activeCategories`+`productsOfCategory`, thẻ SP icon emoji/giá VND, nút Thêm aria-label; menu cache IndexedDB qua `useMenuSnapshot` — bán được offline; unit `PosPage.test.tsx` 2 test lưới + e2e `p6-pos.spec.ts`)
- [x] **P6-T3** Panel bill realtime: tăng/giảm số lượng, ghi chú món, topping dòng con, tổng tiền → xong 2026-10-03 (`src/features/pos/logic.ts` thuần: `addProduct` gộp dòng đơn giản/merge, `changeQty` kẹp 99/về 0 xóa, `setNote` ≤100, `toggleTopping`, `lineTotal`=(giá+topping)×qty, `toppingsForProduct` theo link; panel + Modal topping + SĐT/ghi chú đơn (`phone_note` cho T7); unit logic 22 + PosPage 8; menu cache mở rộng `product_toppings` (optional, fetchMenu +5 query — offline cũng chọn đúng topping); e2e p6-pos: thêm bill → topping dòng con → tổng 40.000 ₫, 0 tràn ngang, axe 0 serious, 6 ảnh)
- [x] **P6-T4** Component `BillSheet` đúng layout (logo → mã+SĐT → bảng → tổng → QR FB → lời chúc → địa chỉ) → xong 2026-10-03 (`src/features/pos/BillSheet.tsx`: rộng 720px nền trắng chữ đen Calibri/Carlito, bảng 4 cột — topping là **dòng con `<tr>`** thụt lề để cột SL/Đơn giá/Thành tiền khớp tổng, ghi chú italic dưới món, tổng dùng `formatVnd`/`formatVndNumber` theo `format.ts`; QR là ô placeholder chờ T5/T7; logo `src/assets/logo.png` theo THIRD_PARTY.md; unit `BillSheet.test.tsx` 5 test — snapshot khóa layout + thứ tự DOM 9 phần tử + math bảng)
- [x] **P6-T5** Sinh QR (`qrcode`) cho `https://www.facebook.com/linh.kh.142` → xong 2026-10-03 (`npm i qrcode` + `@types/qrcode`, audit 0 vuln; `src/features/pos/qr.ts` **dynamic import** theo skill §5 bundle đầu <250KB; unit `qr.test.ts` 4 test — data-URL PNG, deterministic, width khác → ảnh khác; **nối vào flow render bill ở P6-T7**)
- [x] **P6-T6** Xuất PNG (`html-to-image`, 720px, ×2), xử lý font/ảnh Safari → xong 2026-10-03 (`npm i html-to-image` 1.11.13; `src/features/pos/exportBillPng.ts`: dynamic import, `billNodeToBlob` pixelRatio 2/width 720/nền trắng/cacheBust, **Safari chụp 2 lần** (lần 1 ấm nạp font/ảnh, lỗi bỏ qua) qua `isSafariCapture`, `downloadBlob` fallback Lưu về máy; unit 5 test mock html-to-image — jsdom không có canvas, PNG thật để Playwright ở T9)
- [x] **P6-T7** Thanh toán: RPC `create_bill`, upload PNG, mã bill, xử lý lệch `menu_version` → xong 2026-10-03 (`src/features/pos/checkout.ts`: `createBillOnline` đủ 7 tham số RPC — lệch `menu_version` → `MenuVersionChangedError` + `syncMenu` + cảnh báo "Giá vừa cập nhật" GIỮ giỏ, `rate_limited` → lỗi riêng; `makeOfflineCode` khớp regex server + `enqueueOfflineBill` (P4 outbox); `toSheetItems`; **cập nhật `MAX_PHONE_NOTE_LENGTH` 100→50** đúng `phone_note_invalid` của RPC. PosPage: nút **Thanh toán** (khi offline banner "Đang offline — giá cập nhật lúc HH:mm" + cảnh báo cache >24h theo pwa-offline §4), render BillSheet DOM ẩn → `billNodeToBlob` → online: upload `bills/YYYY/MM/<code>.png` ngay (`createBillUploader` — path khớp regex policy, UTC+7, chặn PNG >300KB), offline: PNG + payload vào outbox pending, sync qua `useOutboxSync` (mount + event online + sau bán). Unit mới: `checkout.test.ts` 10, `billUpload.test.ts` 6, `PosPage.test.tsx` +3 (online/mã bill/upload, lệch version, offline outbox) → **tổng 362/362**; e2e 105/105; build gzip 222.82KB (qrcode + html-to-image tách chunk lazy)
- [x] **P6-T8** Chia sẻ: Web Share API (Zalo/Messenger) + nút Lưu về máy + fallback → xong 2026-10-03 (PosPage: `navigator.canShare({files})` → `navigator.share({files, title})` file `HT-….png`; AbortError im lặng; không hỗ trợ → ẩn nút Chia sẻ chỉ còn **Lưu về máy** (`downloadBlob`); PNG chưa xuất được → cảnh báo "bill vẫn đã ghi nhận"; unit +3 → **365/365**)
- [x] **P6-T9** Test: unit (tổng tiền, định dạng VND, mã bill), snapshot bill, Playwright (bán 1 đơn → PNG → xem được) → xong 2026-10-03 (unit đã đủ từ T2–T8: `billTotal`/`formatVnd`/`makeOfflineCode`+RPC mapping/`BillSheet` snapshot → **365/365**; e2e mới `p6-checkout.spec.ts` 2 test ×3 project: bán online → RPC đủ 7 tham số → upload `bills/YYYY/MM/<code>.png` → **Lưu về máy tải PNG đúng magic bytes + bề rộng 1440 (=720×2)**; **offline → bán (mã OFF + PNG data URL vào outbox) → online → sync create_bill + upload** (nop P4-T9); phát hiện & fix 3 bẫy WebKit/đời thực: chunk lazy chưa nạp lúc offline (preload khi mở POS), logo fetch offline (warm data-URL + `onImageErrorHandler`), **WebKit IDB/FileReader không nhận blob canvas → toàn bộ PNG đi data URL (`toPng`)**;  ảnh 2 viewport `p6-checkout-*`; **tổng e2e 114/114**)
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
- [ ] **P10-T5** Cloudflare: rule rate-limit cho màn đăng nhập (*Turnstile đã bỏ* — quyết định 2026-10-02; lockout 5/15 phút ở EF đã có)
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
