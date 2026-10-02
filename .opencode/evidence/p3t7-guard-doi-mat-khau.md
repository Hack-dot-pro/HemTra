# Evidence P3-T7 — Route guard theo role + đổi mật khẩu bản thân + `must_change_password`

- Ngày: 2026-10-02
- Kỹ năng đọc trước khi code: `auth` (§3/§4/§5), `backend`, `security`, `testing`, `uiux` (state.json `evidence` skills_read).

## 1. Route guard — `RequireAuth` + `accessGuard`

- `src/features/auth/accessGuard.ts` (logic thuần, unit-tested):
  - `loadAccessProfile()` — đọc `profiles.role` + `must_change_password` theo `session.user.id` (RLS `profiles_read` qua `session_fresh()`). Trả `null` khi chưa đăng nhập / không có row / role ∉ {admin, staff} → guard về `/login`. **Lỗi query (mạng) thì ném lên** → UI hiện "Thử lại", không đá ra login chỉ vì mạng chập chờn.
  - `evaluateAccess(profile, path)` — `null` → `login`; `must_change_password` → `change-password` (trừ chính `/change-password` → `allow`, tránh vòng lặp); còn lại → `allow`.
- `src/app/RequireAuth.tsx` — bọc toàn bộ route sau đăng nhập (kể cả index + `/change-password`). Kết quả gắn với `pathname` đã kiểm → không chớp nhoáng trang cũ khi đổi route; đang kiểm tra hiện "Đang tải…" (không chớp login).
- **Role**: design §4.1 *"Mọi staff vào đủ 5 menu"* → **không menu nào bị chặn theo role**; guard kiểm role là giá trị hợp lệ từ `profiles` (không tin claim client — auth/skill §4). Ma trận admin/staff × hành động (ẩn nút + từ chối server) thuộc P9/P3-T9.
- Index `/` → `/dashboard` (trước đây nhảy `/login` vì P2 chưa có guard).

## 2. Đổi mật khẩu bản thân — EF `change-password`

- `supabase/functions/change-password/index.ts` (deployed, `verify_jwt=false` — tự xác thực token để trả lỗi tiếng Việt đúng nghĩa):
  1. `Authorization: Bearer <user access_token>` → `auth.getUser` → thiếu/sai/hết hạn → `401 Phiên đăng nhập không hợp lệ, đăng nhập lại`.
  2. zod: `current_password` (1–256), `new_password` (6–256); `new == current` → `400 Mật khẩu mới phải khác mật khẩu cũ`.
  3. Kiểm mật khẩu CŨ bằng `signInWithPassword` server-side (GoTrue 429 map → `429 Quá nhiều yêu cầu`); sai → `401 Mật khẩu cũ không đúng`.
  4. `admin.updateUserById(id, {password: mới})` → `200 {ok, message:'Đã đổi mật khẩu'}`.
  5. `profiles.must_change_password = false` (service_role; lỗi → log, không chặn — user đã đổi xong, ghi evidence).
- **Chỉ đổi được của chính token** (không nhận id từ body) — đổi người khác là EF `admin-users` (P9). Không cộng dồn lockout 5/15 (đó là của `auth-login`).
- Client: `changePasswordApi` — lấy access_token hiện tại, `supabasePost(..., {Authorization})` (http.ts mở rộng param headers); 2xx+`ok` → thành công, lỗi → `messageFromBody`.

## 3. Màn hình + lối vào

- `ChangePasswordPage` — 3 ô (cũ / mới / xác nhận), validate client (khớp `setup/logic`), shake/focus, DI `api` cho test; thành công → "Đã đổi mật khẩu." → Tiếp tục → `/dashboard`. Copy khác nhau khi `forced` (từ guard) vs tự nguyện.
- Lối vào: link **"Đổi mật khẩu"** ở sidebar desktop (`mt-auto`, icon KeyRound — không phải 1 trong 5 menu §7.3) + link nhỏ góc phải trên mobile (bottom-nav giữ đúng 5 mục).
- Route `/change-password` nằm trong `RequireAuth` + `AppLayout`.

## 4. Smoke cloud EF — **17/17 PASS** (`/tmp/opencode/smoke-p3t7.sh`)

Cloud pre-bootstrap (không có user thật) → tạo **user tạm** bằng `service_role` (email confirm, profile `role=staff, must_change_password=true`), test xong `DELETE user`:

GET→405 · OPTIONS→CORS · không token→401 (đúng thông điệp) · token rác→401 · sai mật khẩu cũ→401 `Mật khẩu cũ không đúng` · new<6→400 · new==cũ→400 (đúng thông điệp) · **hợp lệ→200 `Đã đổi mật khẩu`** · **`must_change_password` đã = false** · **đăng nhập bằng mật khẩu mới OK, mật khẩu cũ bị hủy**.

## 5. Kiểm chứng tổng

- Unit **184/184** (mới: accessGuard 10, changePasswordApi 6, ChangePasswordPage 8, RequireAuth 6, App +2 → 5; sửa App.test mock guard) — typecheck 0, lint 0.
- Coverage lines **96.27%** · build gzip **149.84 KB** (<250) · e2e **36/36** · gitleaks **0**.

## 6. Hạn chế / ghi chú

- **e2e bơm phiên** (`e2e/helpers.ts injectAuth`): cloud không có tài khoản thật → set token giả + `login_at` + `page.route()` đáp `profiles` (maybeSingle nhận mảng 1 dòng). Guard/session/layout/a11y chạy **thật**, mock ở tầng dữ liệu REST; test tích hợp thật cần local stack (B-001) hoặc tài khoản thật (P3-T9). Test P2 layout đã cập nhật theo (guard chặn khi chưa đăng nhập).
- **GoTrue `security_update_password_require_current_password` chưa set được**: `PATCH /auth/v1/admin/config` → 404 trên hosted (project key không đủ quyền; cần management API PAT hoặc Dashboard). EF đã chặn đổi mật khẩu không qua mật khẩu cũ ở tầng app; flag này chỉ là hardening thêm → giữ backlog, hướng dẫn cài tay Dashboard khi có quyền.
- `signInWithPassword` để kiểm mật khẩu cũ cùng đường với `auth-login` — cùng điều kiện lỗi (email chưa confirm…) với luồng đăng nhập đã chạy thật trên cloud.
