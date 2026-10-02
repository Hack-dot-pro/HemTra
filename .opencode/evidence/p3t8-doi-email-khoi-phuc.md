# Evidence P3-T8 — Đổi email khôi phục ("đổi key admin"): EF `change-recovery-email` + form 3 bước

- Ngày: 2026-10-02
- Kỹ năng đọc trước khi code: `auth` (§2/§4/§5), `backend` (§1/§2/§5), `security` (§1/§2), `testing` (§1/§2/§3), `uiux` (§1/§3/§4) — khai báo `skills_read` trong `state.json → evidence`.
- Nguồn chuẩn: `design.md §4.4` + `state.json → decisions.admin_transfer` (Q-005, 2 điều kiện).

## 1. Edge Function `change-recovery-email` (đã commit `7d54c04`, deployed cloud `ACTIVE` v1, `verify_jwt=false`)

Hợp đồng 3 `action` — server tự kiểm **đủ 2 điều kiện**, không tin client:

| action | body | thành công | lỗi thường |
|---|---|---|---|
| `request-current` | `{password}` | `200 {ok}` + OTP gửi tới **email hiện tại** (`app_meta.admin_email`) | `401 sai mật khẩu` · `400 noAdminEmail` · `403 notAdmin` · `429` |
| `request-new` | `{new_email}` | `200 {ok}` + OTP gửi tới **email mới** (sinh user tạm, `shouldCreateUser=true`) | `400 sameEmail` · `409 emailTaken` (email đã có `profiles`) · `403` |
| `complete` | `{password, current_token, new_email, new_token, new_password}` | `200 {ok, message}` — kiểm **mật khẩu + OTP hiện tại + OTP mới** → ghi `app_meta.admin_email` → `updateUserById(email mới, password mới)` | `401 OTP sai/hết hạn` · `401 sai mật khẩu` · `409` · `403` |

- Quyền: `requireAdmin` = `auth.getUser(token)` + đọc `profiles.role` bằng `service_role` (không tin claim) → staff luôn `403`.
- Bất biến: email mới trùng user **có profiles** → `409` và **không gửi OTP**; user tạm sinh ở `request-new` bị **xoá trước khi đổi email**; `updateUserById` lỗi → rollback `app_meta.admin_email` về giá trị cũ.
- Invariant chống bàn tay thừa: password grant phải trả về **cùng id** với token gọi → sai → `403`.

## 2. Smoke cloud — **28/28 PASS**, exit 0

- Script (lưu lại để chạy lại được): `.opencode/evidence/p3t8-smoke.sh` (bản cũ trong `/tmp` đã bị mất khi phiên trước ngắt).
- Chạy: `bash .opencode/evidence/p3t8-smoke.sh` → output `.opencode/evidence/p3t8-smoke.out` (28 PASS / 0 FAIL).
- Phủ: không token→401 · action lạ→400 · body thiếu→400/401 · **staff 3 action →403** · `admin_email=null` → 3 action `400 noAdminEmail` · sai mật khẩu→401 · trùng email hiện tại→400 · email user khác có `profiles`→409 · OTP sai→401 · **happy path 2 điều kiện→200**.
- Sau happy path: `app_meta.admin_email` = email mới · `auth.users.email` đổi (cùng id) · đăng nhập mật khẩu **mới 200** · mật khẩu cũ bị huỷ · profile admin còn · user tạm đã xoá (đúng 1 user ở email mới).
- **Tự dọn**: script xoá user tạm + profile tạm và trả `app_meta.admin_email = null` (trap EXIT) → cloud về đúng trạng thái pre-bootstrap (chỉ còn `t7staff@hem.local` + 1 profile `staff` còn sót từ smoke P3-T7, không thuộc task này).
- **Cách lấy OTP thật**: không có mailbox → dùng `POST /auth/v1/admin/generate_link {type:'magiclink'}` (GoTrue trả `email_otp`) rồi EF `verifyOtp(type:'email')` **xác nhận tương thích** (verify 200, trả session). Mỗi OTP chỉ dùng 1 lần (test reuse → 401).

## 3. Frontend — form 3 bước + link admin-only

| File | Nội dung |
|---|---|
| `src/features/auth/changeRecoveryEmailApi.ts` | 3 method, luôn gửi `Authorization: Bearer <user access_token>`; lỗi lấy nguyên từ server; `NO_SESSION` khi chưa đăng nhập |
| `src/features/auth/ChangeRecoveryEmailPage.tsx` | 3 bước (mật khẩu hiện tại → OTP hiện tại + email mới → OTP mới + mật khẩu mới), validate zod-style ở `setup/logic` (6 số, email, mật khẩu ≥6, xác nhận khớp), shake/focus, cooldown gửi lại 60s, quay lại bước trước giữ dữ liệu, DI `api` cho test |
| Thành công | `endAuthSession()` (server đã xoá phiên cũ — smoke thấy `session_not_found` với token cũ) → màn "Đăng nhập lại" → `/login` với `state.changeEmailDone` |
| `src/app/authProfileContext.ts` + `RequireAuth.tsx` | Profiles **đã kiểm** được chia sẻ cho subtree (không đọc lại, không dùng Outlet context vì không lan qua nhiều tầng) |
| `AppLayout.tsx` | Link **"Đổi email khôi phục"** admin-only ở sidebar desktop + góc phải mobile (staff không thấy — server vẫn 403 chặn cuối) |
| `routes.tsx` | Route `/change-recovery-email` trong `RequireAuth` + `AppLayout` |
| `LoginStage.tsx` | Gợi ý "Đã đổi email khôi phục. Hãy đăng nhập bằng mật khẩu mới." khi đến từ `/login` + `state.changeEmailDone` |

## 4. Kiểm chứng tổng

- `npm run typecheck` → 0 lỗi · `npm run lint` → 0 lỗi.
- `npm run test -- --run` → **214/214** (mới: `changeRecoveryEmailApi` 11, `ChangeRecoveryEmailPage` 16, `RequireAuth` +1 context, `App` +1 staff, `LoginStage` +1 hint).
- Coverage lines **96.17%** · build gzip **151.47 KB** (<250).
- `npx playwright test` → **36/36** (chromium/webkit/mobile) — sau khi cài lại browser + `install-deps` (cache codespace trống).
- `gitleaks detect -v --redact` → **31 commits, 0 leak**; `--no-git` chỉ bắt `.env` local + `dist/` (đều gitignore). `npm audit --omit=dev` → 0.

## 5. Hạn chế / ghi chú

- **Chưa có Playwright case đổi email khôi phục** → thuộc `P3-T9` (cloud pre-bootstrap không có mailbox thật; e2e cần bơm phiên như P3-T7).
- `request-new` sinh user tạm; người dùng **bỏ dở** giữa chừng thì user tạm còn (không có `profiles`, không có mật khẩu) → lần `request-new` sau vẫn cho phép; chỉ `complete` mới xoá. Chấp nhận được, ghi giám sát ở SEC gate P3.
- Cloud hiện `bootstrapped=false`, `admin_email=null` — mọi số liệu smoke chạy trên user tạm đã xoá.
- Dọn kèm commit này: `image.png` (screenshot lạ do commit `7d54c04`, không file nào tham chiếu → xoá); `supabase/.env.example` là bản sao `.env.example` root, **để untracked**, không commit.
