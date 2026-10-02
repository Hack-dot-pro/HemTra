# Evidence P3-T6 — Khôi phục mật khẩu admin qua OTP (EF `admin-recovery` + `/recovery`)

- Ngày: 2026-10-02
- Quyết định gối đầu: Q-005 `decided` (state.json `decisions.admin_transfer`) — recovery **bắt buộc email trùng `app_meta.admin_email`**; không Google OAuth (P3-T1 `auth_method`).
- Kỹ năng đã đọc trước khi code: `auth`, `backend`, `security(§Auth)`, `testing`, `uiux` (xem state.json `evidence` skills_read).

## 1. Edge Function `admin-recovery`

File: `supabase/functions/admin-recovery/index.ts` (deployed cloud, `verify_jwt=false` trong `supabase/config.toml`).

Hợp đồng (POST `/functions/v1/admin-recovery`, JSON):

| action | body | Thành công | Lỗi |
|---|---|---|---|
| `request-otp` | `{email}` | **LUÔN** `200 {ok:true}` (anti-oracle) | `400 {error}` email sai format |
| `verify` | `{email, token, password}` | `200 {ok:true, message}` | `401 {error:'Mã OTP không đúng hoặc đã hết hạn'}` (OTP sai / email ≠ `app_meta.admin_email` / user không tồn tại — thông điệp **giống hệt nhau**), `400 {error}` (token < 6 số / password < 6 ký tự) |

Chi tiết thực hiện `verify`:
1. Zod validate → 400 `Dữ liệu không hợp lệ`.
2. Đọc `app_meta.admin_email` (service_role) — **khớp email đầu vào**; nếu lệch → 401 ngay (trước khi gọi GoTrue).
3. `verifyOtp({email, type:'email', token})` → session; lấy `user.id`.
4. `admin.auth.admin.updateUserById(user.id, {password})` → 200 `{ok:true, message:'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.'}`.

Không phát hiện email qua lỗi khác nhau: email không tồn tại / sai admin_email / OTP sai đều trả cùng một 401. (Timing side-channel còn lại: check `admin_email` trước `verifyOtp` — chấp nhận cho dự án cá nhân, ghi nhận tại đây.)

## 2. Smoke trên cloud (`/tmp/opencode/smoke-p3t6.sh`) — 11/11 PASS

Cloud đang **pre-bootstrap** (`app_meta.admin_email = null`) nên chỉ test được hợp đồng + đường lỗi:

1. `GET` → 405 `{error:'Chỉ chấp nhận POST'}` ✓
2. `request-otp` email sai format → 400 ✓
3. `request-otp` thiếu `email` → 400 ✓
4. `verify` token < 6 ký tự → 400 ✓
5. `verify` password < 6 ký tự → 400 ✓
6. `action` lạ → 400 ✓
7. `request-otp` email bất kỳ (`admin@gmail.com` / `khac@gmail.com`) → **200 `{ok:true}`** (anti-oracle; `admin_email=null` nên không gửi mail) ✓
8. `verify` email A → 401 đúng thông điệp ✓
9. `verify` email B → 401 **giống hệt** email A ✓ (anti-oracle)
10. `OPTIONS` → 204 + CORS header (ALLOWED_ORIGINS) ✓
11. (xem script) contract đầy đủ ✓

**Hạn chế — happy path CHƯA smoke được**: `admin_email` chưa được set (bootstrap chưa chạy lần nào thật) + môi trường không có mailbox → không thể gửi/nhận OTP thật. Đường `verify` đúng chỉ verify được khi có OTP hợp lệ. Khi bootstrap admin lần đầu (P3-T2 flow với email thật), test lại full.

## 3. Frontend

- `src/features/auth/recoveryApi.ts` — `requestRecoveryOtp(email)` → `{action:'request-otp'}`, `verifyRecovery({email,token,password})` → `{action:'verify'}`; map `config/network` lỗi (`CONFIG_ERROR`/`NETWORK_ERROR`), 2xx + `ok:true` → success (message lấy `body.message`, mặc định `''`), lỗi → `messageFromBody` (đọc `body.error`, fallback `SERVER_ERROR`).
- `src/features/auth/RecoveryStage.tsx` — 2 bước: **(1)** email admin → **(2)** OTP 6 số + mật khẩu mới (min 6, toggle hiện/ẩn). Tái dùng helper `setup/logic` (`validateEmail/validateOtp/validatePassword`, `canResend`, `resendCooldownSeconds`, `RESEND_COOLDOWN_MS=60s`), pattern shake/focus như `SetupStage`, DI `api?: RecoveryApi`. Ghi chú **staff** hiển thị ngay màn đầu: *"Chỉ admin tự khôi phục. Nhân viên liên hệ admin để được cấp lại mật khẩu."* Anti-oracle: EF luôn `ok` ở bước gửi → hiển thị chung *"Mã OTP đã được gửi đến email admin"*. Thành công → `navigate('/login', {replace:true, state:{recoveryDone:true}})`.
- `src/app/routes.tsx` — `<Route path="/recovery" ...>` (top-level, không qua AppLayout).
- `src/features/auth/LoginStage.tsx` — nút "Quên mật khẩu" → `navigate('/recovery')` (bỏ hint cũ "Liên hệ admin..."); đọc `location.state.recoveryDone` → hint *"Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới."*; effect clear state tăng thêm `recoveryDone`.

## 4. Kiểm chứng

- Unit: **152/152** (mới: `recoveryApi.test.ts` 7, `RecoveryStage.test.tsx` 11, `LoginStage.test` +2 đổi) — `npm run typecheck` 0, `npm run lint` 0.
- Coverage: lines **96.22%** (từ 95.66%) — `npx vitest run --coverage`.
- Build: gzip **148.34 KB** (< 250KB).
- E2E: **21/21** (`e2e/p3-recovery.spec.ts` ×2 viewport ×2 project: cấu trúc + a11y axe 0 serious/critical + 0 console error + screenshot; điều hướng login ↔ recovery). **Không gửi OTP thật trong e2e** (GoTrue rate limit, không mailbox).
- `gitleaks detect` 0 leak.

## 5. Quyết định / lưu ý cho task sau

- Q-005 đóng ở đây: recovery đã khóa email == `app_meta.admin_email`.
- Anti-oracle là chủ đích: bước 1 không phân biệt email đúng/sai.
- `verify` 401 dùng chung một thông điệp cho mọi nguyên nhân (chống dò).
- P3-T7 kế tiếp: route guard theo role + đổi mật khẩu bản thân + `must_change_password`.
