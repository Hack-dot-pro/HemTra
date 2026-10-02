## QC REPORT — Phase P3 — Vòng r=1

VERDICT: FAIL

TÓM TẮT: Q1–Q9, Q11, Q12 xanh (typecheck/lint 0, 214/214 unit, coverage 96.17% dòng, build OK, DB linked 28/28, axe 0 vi phạm); nhưng cổng `npm run test:e2e` **không ổn định** — fail đúng 1 test `e2e/p3-auth.spec.ts:405` ở 3/5 lần chạy → Q10 ✘, 1 MAJOR + 2 MINOR.

KẾT QUẢ THEO HẠNG MỤC:

- Q1 ✔ `npm run typecheck` → exit 0 (0 lỗi, không output)
- Q2 ✔ `npm run lint` → exit 0 (0 lỗi)
- Q3 ✔ `npm run test -- --run` → exit 0 · `Test Files 22 passed (22)` / `Tests 214 passed (214)`; `git diff 92779bc..HEAD | grep -E '\+\s*(it|test)\(.*\.(skip|only)'` → `NO_NEW_SKIP_ONLY`
- Q4 ✔ đối chiếu `tasks_done` ↔ test → mỗi logic mới có test (bảng dưới); EF phủ bằng smoke (evidence p3t2/p3t4/p3t6/p3t7/p3t8) + e2e hợp đồng → 2 MINOR về happy path EF (QC-002)
- Q5 ✔ `npx vitest run --coverage` → exit 0 · `Lines : 96.17% (302/314)`; file thấp nhất trong scope `src/lib/supabase.ts` **85.71%** > 80% (setup/api+logic+useBootstrapStatus 100%, accessGuard 100%, sessionGuard 100%, recoveryApi 100%)
- Q6 ✔ đọc test: assert chính xác URL/body/Authorization/mapping lỗi (`changeRecoveryEmailApi.test.ts:45,46,50`), `expect(fn).not.toHaveBeenCalled()` khi thiếu session; không mock che logic app (e2e mock **tầng mạng** theo hợp đồng EF, code app chạy thật); không find `.only/.skip` · 2 `toBeTruthy()` ở `session.test.ts:47,60` là assert hiện diện, cạnh assert exact ở dòng 46/59–61 → không phải assert rỗng
- Q7 ✔ đối chiếu `design.md §4.1–4.4` + Q-005 → đúng toàn bộ (dưới)
- Q8 ✔ (adapt theo B-001) `bash scripts/test-p1.sh` → exit 0 · `=== KET QUA: PASS=28 FAIL=0 ===` (gồm `session_fresh: het han = false`, `anon doc app_meta 3 cot`, `khong JWT bi tu choi`); `npx supabase db query --linked` → `admin_email` chỉ grant cho `postgres`/`service_role`, `anon`/`authenticated` chỉ có `bootstrapped` (migration `20261002040248` áp dụng đúng). ✗ phần local: `supabase test db` không chạy được → xem KHÔNG KIỂM ĐƯỢC
- Q9 ✔ `npm run build` → exit 0 · `dist/assets/index-*.js 535.25 kB │ gzip: 151.47 kB` < 250 KB gzip (design §11). Cảnh báo `(!) Some chunks are larger than 500 kB` là ngưỡng mặc định của Vite, không vượt ngưỡng dự án → không chặn
- Q10 ✘ `npm run test:e2e` → **exit 1 ở 3/5 lần chạy** (69 test × chromium/webkit/mobile): `1 failed` (webkit), `2 failed` (webkit+mobile), `69 passed`, `69 passed` (có instrument), `1 failed` (mobile) → lỗi `[QC-001]`; ảnh 390×844 + 1280×800 có đủ (`login-*`, `layout-*`, `setup-*`, `recovery-*`, `change-password-forced-*` — mỗi cặp đủ 2 viewport × 3 project)
- Q11 ✔ axe qua `@axe-core/playwright` ở 4 spec (`p2-login.spec.ts:27`, `p3-guard.spec.ts:38`, `p3-recovery.spec.ts:22`, `p3-setup.spec.ts:54`) → `expect(serious).toEqual([])` pass trong lần chạy xanh 69/69 → 0 vi phạm serious/critical
- Q12 ✔ `git diff --stat 92779bc..HEAD` → **74 file** khớp scope; `git status` chỉ còn `?? supabase/.env.example` (đã biết, ngoài scope); grep secret trong diff (`eyJ…`/hex 40 ký tự) → 0 match; sửa `design.md`/`plan.md`/`auth+security skill.md` có quyết định user ghi trong `state.json → decisions.turnstile` và `decisions.admin_transfer` (Q-005); `skills_read` có đủ cho P3-T4/T5 (state.json evidence)

Q4 — tasks_done ↔ test:

| Task | Logic mới | Test |
|---|---|---|
| T1/T2 | EF `bootstrap-admin`, migration `admin_email` | `setup/api.test.ts` (5), `SetupStage.test.tsx`, e2e `p3-auth.spec.ts:359,375,405` + smoke evidence p3t2; grant DB verified (Q8) |
| T3 | route `/setup`, `useBootstrapStatus`, `SetupStage` | `setup/{api,logic,useBootstrapStatus,SetupStage}.test` (đủ happy/boundary/lỗi), e2e `p3-setup.spec.ts` ×3 project |
| T4 | EF `auth-login` (lockout, unlock-otp/verify), `loginApi`, `signIn` | `loginApi.test.ts` (10: 200/401/401 rỗng/429 locked/500/mạng/unlock×3), `signIn.test.ts` (7), `LoginStage.test.tsx` (+khóa/OTP), e2e `p3-auth.spec.ts:107,138`, smoke 19/19 |
| T5 | `lib/session`, `sessionGuard`, storage route ghi nhớ | `session.test.ts` (12), `sessionGuard.test.ts` (8, biên đúng 7 ngày/+1ms), `sessionGuard.hook.test.tsx` (3), e2e `p3-auth.spec.ts:200` |
| T6 | EF `admin-recovery`, `recoveryApi`, `/recovery` | `recoveryApi.test.ts` (7), `RecoveryStage.test.tsx` (11), e2e `p3-recovery.spec.ts`, smoke 11/11 |
| T7 | `accessGuard`, `RequireAuth`, `AuthProfileContext`, EF `change-password`, `/change-password`, `must_change_password` | `accessGuard.test.ts` (10), `RequireAuth.test.tsx` (7), `changePasswordApi.test.ts` (6), `ChangePasswordPage.test.tsx` (8), `App.test.tsx`, e2e `p3-guard.spec.ts` (5) |
| T8 | EF `change-recovery-email`, `changeRecoveryEmailApi`, `/change-recovery-email` | `changeRecoveryEmailApi.test.ts` (11), `ChangeRecoveryEmailPage.test.tsx` (16), e2e `p3-auth.spec.ts:279,335`, smoke `.opencode/evidence/p3t8-smoke.sh` 28/28 |
| T9 | e2e auth | `e2e/p3-auth.spec.ts` 11 test × 3 project = 33 |

Q7 — đối chiếu design §4.1–4.4 + Q-005:

- §4.1 (bảng quyền): `App.test.tsx:37` 5 menu cả 2 role; `App.test.tsx:51` staff không thấy link đổi email khôi phục; e2e `p3-auth.spec.ts:335` staff bị chặn client (0 lần gọi EF); "đổi mật khẩu của chính mình (nhập mật khẩu cũ)" → EF `change-password` xác thực mật khẩu cũ server-side (smoke 17/17).
- §4.2: EF `bootstrap-admin` chỉ chạy khi `bootstrapped=false`, email phải khớp secret; ghi `admin_email` + `bootstrapped=true`; e2e `p3-auth.spec.ts:375` (bootstrap lần 2 → 409) và `:405` (/setup tự ẩn, login hết link); cột `admin_email` không grant cho anon/authenticated (Q8 query).
- §4.3: lockout 5/15 phút theo cặp (username, IP) — `supabase/functions/auth-login/index.ts:103-116,153-156`; "ghi nhớ" → localStorage, tắt → sessionStorage (`session.test.ts:41-63`); 7 ngày client (`sessionGuard.test.ts` đúng 7 ngày ok / +1ms expired) + server `session_fresh()` (P1, `scripts/test-p1.sh` PASS); thông báo lỗi chung chung (`loginApi.test.ts:401` giữ nguyên thông điệp server).
- §4.4: `admin-recovery/index.ts:84-88` bắt buộc email khớp `app_meta.admin_email`; `change-recovery-email/index.ts:229-256` server tự kiểm **đủ 2 điều kiện theo thứ tự** (mật khẩu admin hiện tại → OTP email hiện tại → OTP email mới) rồi mới đổi mật khẩu + ghi đè `admin_email` (`:277-299`, có rollback); thiếu điều kiện nào → 401/400, không thay đổi gì (smoke 28/28 gồm happy path).
- Q-005 (2 điều kiện đổi email khôi phục): đúng thứ tự, cả 2 do server kiểm — khớp `state.json → decisions.admin_transfer`.
- Tiền VND nguyên / snapshot giá / mã bill: **N/A** — P3 không đụng tiền hay bill (đã phủ P1, `scripts/test-p1.sh` PASS=28).

LỖI:

- `[QC-001] MAJOR · e2e/p3-auth.spec.ts:416 · sig:a5af527d58db9fa392425563eb629aa762b7fc24`
  Bằng chứng (lỗi thật, 2 lần chạy cổng):
  ```
  1) [webkit] › e2e/p3-auth.spec.ts:405:1 › P3-T9: bootstrap xong → /setup tự ẩn vĩnh viễn…
    + Array [ "Fetch API cannot load https: /tsnrggxczipzqvvpcbld.supabase.co/rest/v1/app_meta?select=bootstrapped&id=eq.1&limit=1 due to access control checks.", (×2)
  1 failed / 68 passed (4.1m)   → exit 1
  2 failed / 67 passed (4.1m)   → exit 1 (webkit + mobile)
  ```
  Cõng Instrument (test listener tạm, đã xóa) cho thấy request **không bị bỏ sót**: `DBG-REQ ×4`, `DBG-ROUTE-HIT ×4`, `DBG-RES 200 acao=* ×4` nhưng WebKit vẫn log 2 lỗi CORS; test chạy riêng (`p3-auth.spec.ts` 33/33) và 8/8 vòng lặp giả lập sạch → flaky theo điều kiện chạy, không phải lỗi logic nghiệp vụ.
  Tái hiện: `npm run test:e2e` chạy ≥3 lần (fail 3/5); nhanh hơn: `npx playwright test e2e/p2-login.spec.ts e2e/p3-auth.spec.ts --project=webkit` (fail 2/5).
  Gợi ý hướng sửa (test-side, qc-test không sửa code): trước `page.goto('/login')` lần 2, chờ 2 request `app_meta` của document `/setup` hoàn tất (`await page.waitForResponse(/app_meta/)` ×2 hoặc `waitForLoadState('networkidle')`) để không còn response về trong lúc đổi document; nếu WebKit vẫn phát lỗi dù fulfill có `access-control-allow-origin: *` → báo lại để xử lý ở tầng Playwright/WebKit, **không** filter bớt assertion. Cổng chỉ tick khi `npm run test:e2e` xanh 3 lần liên tiếp.

- `[QC-002] MINOR · supabase/functions/admin-recovery/index.ts (happy path) · sig:ef-smoke-happy-unc`
  Bằng chứng: evidence `p3t6-admin-recovery.md` — "happy path chưa smoke — cloud pre-bootstrap `admin_email=null`, không mailbox"; evidence `p3t4-auth-login.md` — "`unlock-verify` đường thành công chưa smoke end-to-end"; script smoke của T2/T4/T6/T7 nằm `/tmp/opencode/...` (không replay được), chỉ `p3t8-smoke.sh` có trong repo.
  Tái hiện: `ls .opencode/evidence/p3t*.sh` → chỉ `p3t8-smoke.sh`.
  Gợi ý: commit script smoke cho 5 EF vào `scripts/` (đọc secret từ env, có bước RESET cloud) để QC/SEC chạy lại được — làm ở P11 cũng được, ghi `backlog`.

- `[QC-003] MINOR · .env.example:20 · sig:env-example-noeol`
  Bằng chứng: `git diff 92779bc..HEAD -- .env.example` → `+SMTP_APP_PASSWORD=` `\ No newline at end of file`.
  Tái hiện: `tail -c 1 .env.example | xxd` → không có `0a`.
  Gợi ý: thêm newline cuối (prettier sẽ bắt lỗi này ở file text khi có commit sau).

TEST ĐÃ BỔ SUNG: không (Q4/Q6 đạt — không thiếu test). Instrumentation gỡ sạch, `git status` chỉ còn `?? supabase/.env.example` (đã biết).

KHÔNG KIỂM ĐƯỢC:
- `supabase test db` (local): CLI không có trong PATH của môi trường QC + local stack hỏng từ P0 (B-001) → thay bằng `scripts/test-p1.sh` trên DB linked (28/28); **migration trên DB trống chưa kiểm được** (chỉ xác minh migration đã áp + grant đúng trên cloud dev).
- Smoke EF thật (T2/T4/T6/T7) không chạy lại: cần secret/mailbox và sẽ làm đổi trạng thái cloud đang pre-bootstrap (e2e phụ thuộc `bootstrapped=false`) → chỉ đọc evidence.
- Q10: chỉ kiểm file ảnh tồn tại đủ 2 viewport × 3 project, không soi từng ảnh bằng mắt.
