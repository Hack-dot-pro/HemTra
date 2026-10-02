# P3-T4 — Edge Function `auth-login` + `signIn()` thật + luồng OTP khôi phục (2026-10-02)

## Quyết định user đi kèm (state.json → decisions)

- `turnstile`: **bỏ Turnstile** khỏi T4, design.md, plan.md, auth/skill.md, security/skill.md (dùng cá nhân, chưa có key).
- `lockout_otp_unlock`: sai ≥ 5 lần → khóa 5/15 phút theo cặp (username, IP) → UI tự hiện "Gửi OTP khôi phục lượt đăng nhập" → `unlock-otp` / `unlock-verify` xóa lượt sai.
- `session_7d_note`: phiên 7 ngày = P3-T5 (task kế tiếp).

## Skills đã đọc (AGENT.md §12.2)

`auth/skill.md`, `backend/skill.md`, `security/skill.md` (§2), `testing/skill.md`, `design.md §4.3` (evidence `skills_read` 13:24:13) + bổ sung `uiux/skill.md` khi sửa UI LoginStage (unlock dùng lại class `field/link/submit/hint/shake` sẵn có, nhãn + focus + shake tiếng Việt).

## Hợp đồng EF `auth-login` (verify_jwt=false)

POST `/functions/v1/auth-login`

| action | body | thành công | lỗi |
|---|---|---|---|
| `login` | `{username, password}` | 200 `{ok:true, session}` | 401 `{error: MSG.invalid, locked:false}` · 429 `{error: MSG.locked, locked:true}` · 400 `{error:'Dữ liệu không hợp lệ'}` |
| `unlock-otp` | `{username}` | **LUÔN** 200 `{ok:true, message}` (chống dò username) | 400 |
| `unlock-verify` | `{username, token: 6 số}` | 200 `{ok:true, message}` | 401 `{error: MSG.otp}` · 400 |

- Lấy email Auth qua `profiles.username → admin.getUserById` (admin gốc có email thật; staff `<username>@hem.local` — không nhận mail → nhận thông điệp chung, chờ 15 phút/liên hệ admin).
- Không ghi `login_attempts` khi đang khóa (tránh 429 tự kéo dài khóa); thành công ghi dòng `success=true`; prune dòng > 24h.
- Chỉ báo `locked=true` khi 429 hoặc body có `locked:true` (không lộ gì thêm).

## Triển khai

- `supabase/functions/auth-login/index.ts` (zod hai đầu, CORS như `bootstrap-admin`, `service_role` chỉ trong EF, env do runtime cấp).
- `supabase/config.toml`: `[functions.auth-login] verify_jwt = false`.
- Frontend: `src/lib/http.ts` (transport + thông điệp lỗi dùng chung) → refactor `src/features/setup/api.ts`/`logic.ts` dùng chung → `src/features/auth/loginApi.ts` → `signIn()` gọi thật (xóa dead export `wrongPassword()` — đóng backlog QC P2-004) → `LoginStage` trạng thái khóa: nút gửi OTP → ô OTP 6 số (focus tự động, lọc ký tự không phải số) → nút khôi phục → hiện hint; DI `onUnlockSend`/`onUnlockVerify` kiểu `onSignIn`.
- deploy: `npx supabase functions deploy auth-login --use-api` (project `tsnrggxczipzqvvpcbld`).

## Smoke cloud — 19/19 PASS (script `/tmp/opencode/smoke-p3t4.sh`, key không nằm trong repo)

- Điều kiện sai: GET → 405 · thiếu field → 400 · action lạ → 400.
- Lockout: sai lần 1–5 → 401 chung chung `locked:false`; lần 6 → 429 `locked:true` (khóa **cả khi mật khẩu đúng** — xác nhận hành vi).
- OTP: `unlock-otp` user không có mail → 200 generic · `unlock-otp` user lạ → 200 (không phân biệt) · `unlock-verify` token sai → 401 · token < 6 số → 400.
- CORS: OPTIONS → 204 + `access-control-allow-origin` echo origin hợp lệ.
- Thành công: tạo user tạm `p3t4smoke` (admin API) + `profiles` → `login` đúng → 200 có `session.access_token` → login sai 1 lần → 401.
- Dọn: user tạm + profile + toàn bộ `login_attempts` của smoke → 0 dòng còn lại.

## Hạn chế của smoke (biết trước, không chặn task)

- `unlock-verify` **đường thành công** (xóa lượt sai) chưa smoke end-to-end được vì cần mã OTP trong mailbox thật (không có); đường lỗi 401/400 đã smoke, đường thành công phủ bằng unit test contract (`loginApi.test.ts`) và logic xóa tập trung ở 1 câu lệnh delete.
- OTP `unlock-otp` gửi thật qua GoTrue (template đã cấu hình từ P3-T1) nhưng staff `@hem.local` không nhận mail → theo design, chỉ hiện thông điệp chung.

## Kiểm chứng

- `npm run typecheck` 0 lỗi · `npm run lint` 0 lỗi
- `vitest` 106/106 (mới: `loginApi.test.ts` 9, `signIn.test.ts` 5, LoginStage +3 luồng khóa/OTP) — coverage lines **97.61%**
- `npm run build` — gzip 91.78KB (< 250KB)
- `npx playwright test` 15/15 (không thêm e2e trạng thái khóa: sẽ tạo dòng `login_attempts` thật + cần user thật → unit test phủ)
- `gitleaks detect --source .` 26 commits, 0 leak

## File chính

EF: `supabase/functions/auth-login/index.ts`, `supabase/config.toml` · FE: `src/lib/http.ts`, `src/features/setup/{api,api.test,logic}.ts`, `src/features/auth/{loginApi,loginApi.test,signIn,signIn.test,LoginStage,LoginStage.test}.{ts,tsx}` · docs: `design.md` (§2/§4.3/§9), `plan.md` (P3-T4 tick, P10-T5), `auth/skill.md`, `security/skill.md`.
