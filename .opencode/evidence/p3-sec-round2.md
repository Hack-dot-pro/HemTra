# SEC REPORT — Phase P3 — Vòng 2

```
VERDICT: PASS
PHẠM VI: hẹp (P3, theo loop.md §5) · BỀ MẶT: xác minh 2 fix của vòng 1
  (SEC-001 session_fresh theo phiên, SEC-002 GoTrue require_current_password)
  + chạy lại checklist S1–S15 ở mức "xác nhận không đổi/với bề mặt P3";
  EF bootstrap-admin, auth-login, change-password, change-recovery-email
  (code KHÔNG đổi so với vòng 1 → giữ evidence vòng 1, ghi rõ "không chạy lại vì XXX").
  P4 (sw.ts, _headers, outbox/menuSync/hardRefresh/pwaClient, e2e/p4-pwa.spec.ts)
  NGOÀI phạm vi vòng này → S11/S12 = N-A (P4/P10).
skills_read: [AGENT.md, subagent.md (§1, §3), .opencode/skills/security/skill.md (toàn bộ),
  .opencode/skills/auth/skill.md (toàn bộ), plan.md [P3-T0…T9 + P4/P10 gate],
  design.md §4/§5, loop.md (§4.1, §4.3), .opencode/evidence/p3-sec-round1.md,
  .opencode/evidence/p3-sec-round1-fix.md, .opencode/evidence/p3-qc-round3.md,
  .opencode/evidence/p3t8-smoke.sh (mẫu tạo/xóa user tạm), scripts/test-p1.sh,
  supabase/migrations/20261002144826_session_fresh_session_based.sql]
```

TÓM TẮT: **2 fix của vòng 1 đã được xác minh lại trên cloud thật** — SEC-001 (mốc 7 ngày
lấy từ `auth.sessions.created_at`, refresh không reset được) và SEC-002
(`PUT /auth/v1/user` chỉ có `password` → **400 current_password_required**).
S1–S15 xanh hoặc N-A đúng lý do; **không có lỗi BLOCKER/MAJOR/MINOR mới**.
2 MINOR cũ (`SEC-003`, `SEC-004`) giữ nguyên mức, **ghi backlog** (không xấu đi).
Cloud giữ `pre-bootstrap`, user tạm đã dọn sạch (mục 6).

## 0. Đối chiếu scope (subagent.md §1)

- `git diff --name-only 92779bc..HEAD | wc -l` → **108**. Gói đầu vào ghi scope = diff này
  **nhưng** commit cuối `6dc40c6` chứa code P4 → tôi tách:
  - **Ngoài phạm vi (P4)**: `src/sw.ts`, `src/lib/menuSync.ts`, `src/lib/outbox.ts`,
    `src/lib/hardRefresh.ts`, `src/lib/pwaClient.ts`, `src/lib/menuTypes.ts`,
    `src/lib/version.ts`, `src/test/virtualPwaRegister.ts`, `public/_headers`,
    `e2e/p4-pwa.spec.ts`, `vite.config.ts` (VitePWA), `src/vite-env.d.ts` (`__BUILD_ID__`)
    → **không audit kỹ**, chỉ đọc lướt (S11/S12 → N-A, ghi NGHI VẤN nếu nghiêm trọng).
  - **Trong phạm vi P3, đổi từ sau báo cáo vòng 1** (`git diff --name-only 3599f06..HEAD`,
    loại evidence/P4) chỉ **4 file**:
    `supabase/migrations/20261002144826_session_fresh_session_based.sql` (fix SEC-001),
    `scripts/test-p1.sh` (+5 assertion), `src/lib/session.ts` (**chỉ comment**),
    `state.json`/evidence (báo cáo).
  - EF `supabase/functions/*` → **không đổi** từ vòng 1 → evidence vòng 1 vẫn còn hiệu lực.
- `git status --short` → chỉ ` M package-lock.json` (144 dòng xóa trường `libc` — **đã có
  trước khi tôi chạy lệnh nào**, kiểm lại được: lần `git status` đầu tiên của tôi chạy
  trước mọi `npm`/`npx`); không file lạ, không `??`. `supabase/.temp/*` do tôi tạo khi
  `supabase link` (để chạy `db query --linked`) nằm trong `.gitignore` của `supabase/`.
- Tôi không sửa bất kỳ file nào ngoài báo cáo này.

## 1. Kết quả theo hạng mục

| # | KQ | Lệnh + output ngắn (thật) |
|---|---|---|
| S1 | ✔ | `/tmp/opencode/bin/gitleaks detect --no-banner` → `36 commits scanned … no leaks found` (**exit 0**). Quét `dist/` (23 file) so sánh giá trị `.env`: `secret leaks in dist: NONE` (không có `SUPABASE_SERVICE_ROLE_KEY`/`SMTP_APP_PASSWORD`/`SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_PASSWORD`). `git log --all --oneline -- .env` → rỗng; `git check-ignore -v .env dist` → cả 2 bị ignore. |
| S2 | ✔ | `npm audit --omit=dev` → `found 0 vulnerabilities` (**exit 0**). |
| S3 | ✔ | REST thật role **anon**: `app_meta?select=*`, `app_meta?select=admin_email`, `profiles?select=*`, `bills?select=id`, `login_attempts?select=id`, `categories?select=id,name` → **HTTP 401 `42501 permission denied`** cả 6; `PATCH app_meta {bootstrapped:true}` → 401 42501; `PATCH profiles {role:admin}` → 401 42501. **service_role** → `200 [{"bootstrapped":false,"admin_email":null,"menu_version":1}]`. `PATH=/tmp/opencode/bin:$PATH bash scripts/test-p1.sh` → **`=== KET QUA: PASS=33 FAIL=0 ===` exit 0** (gồm anon deny, authenticated fresh/hết hạn, `is_admin`, 5 assertion SEC-001 mới, `create_bill` idempotent, cleanup). 12 policy `session_fresh` còn nguyên (xem mục 2). Không policy `using(true)` trên cột nhạy cảm (`admin_email` không thuộc grant anon/authenticated). |
| S4 | ✔ | **Chạy lại thật** (script `/tmp/opencode/sec-r2-s45.sh`, user tạm staff đã xóa): token **staff** gọi `change-recovery-email` → `request-current` / `request-new` / `complete` → **`403 Chỉ admin mới dùng chức năng này`** cả 3 (kiểm `profiles.role` phía server, `requireAdmin`). EF `admin-recovery` không có tham số id người khác; P3 không có EF `admin-users` (`ls supabase/functions/` = 5 fn) → không còn bề mặt admin-only nào khác. |
| S5 | ✔ | **Lockout thật**: 5 lần sai → lần 1–5 = `401 locked:false`, **lần 6 → `429 {"error":"Sai mật khẩu quá 5 lần…","locked":true}`**; lần 7 với `X-Forwarded-For: 198.51.100.9` → **vẫn 429** (không bypass). User không tồn tại → `401` cùng thông điệp (không oracle). Token **ký sai** / **không phải JWT** → EF `change-password` → `401 Phiên đăng nhập không hợp lệ, đăng nhập lại`. Sau khi xóa `login_attempts`, **đăng nhập mật khẩu đúng → 200**. |
| S6 | ✔ (2 nhánh giữ evidence cũ) | **Chạy lại read-only** (không đổi trạng thái cloud): `bootstrap-admin` `request-otp` email **không** trùng secret → `200 {"ok":true}` (anti-oracle, không gửi mail — code chỉ `signInWithOtp` khi trùng secret, `bootstrap-admin/index.ts:132-135`); email sai format → `400 Dữ liệu không hợp lệ`; `complete` OTP giả → `401 Mã OTP không đúng hoặc đã hết hạn`; `action` lạ → `400`; `GET` → `405`; **`GET /auth/v1/admin/users` sau test = `['t7staff@hem.local']` (0 user mới)**. Nhánh *bootstrap lần 2 → 409* **không chạy lại** vì cần `bootstrapped=true` = đổi trạng thái cloud (cấm) → giữ evidence `p3t2-bootstrap-admin-ef.md` (đã test 409 + `disable_signup=True` → signup 422 trên project này rồi reset) + code guard 2 lớp (`:125` và update `.eq('bootstrapped',false)` `:206`). |
| S7 | ✔ | `auth-login` payload `"><img src=x onerror=alert(1)>` → `401 {"error":"Tài khoản hoặc mật khẩu không đúng."}`; `<script>alert(1)</script>` → `401` (cùng thông điệp); `' OR 1=1--` → **`403` Cloudflare WAF** (chặn trước EF). `bootstrap-admin` `username=<script>alert(1)</script>` → `400 Dữ liệu không hợp lệ` (zod). `grep -rIn "dangerouslySetInnerHTML\|\beval(\|new Function\|innerHTML" src/` → **rỗng**. |
| S8 | ✔ (hẹp, code + evidence cũ) | `change-password/index.ts:125` `admin.auth.admin.updateUserById(user.id, …)` — `user.id` lấy từ **token đã xác thực** (`:95-99`), **không nhận id người khác từ body**; `change-recovery-email` chỉ đổi được của chính caller (staff bị 403 — mục S4). Storage/signed URL/IDOR bill → **N-A (P7/P1)**. |
| S9 | N-A | `grep -rIn "supabase.storage\|\.upload(" src/ supabase/functions/` → **rỗng**; P3 không đụng upload → **N-A (P7/P1)**. |
| S10 | ✔ (hẹp) | **GET config auth (read-only)**: `rate_limit_otp=30`, `rate_limit_email_sent=30`, `rate_limit_verify=30`, `rate_limit_anonymous_users=30`, `mailer_otp_exp=600`, `mailer_otp_length=6` → giới hạn OTP có thật. Lockout 5/15 phút → `429` (mục S5). `unlock-otp` username không tồn tại → `200 {"ok":true,…}` chung chung (chống dò username); `unlock-verify` OTP sai → `401`. **Không bắn nhanh OTP thật** (giữ định mức email — xem mục 5). |
| S11 | N-A (P4/P10) | `public/_headers` **đã tồn tại** (commit `6dc40c6`) nhưng nội dung **chỉ có `Cache-Control`** (`/*`, `/assets/*`, `/index.html` no-cache, `/sw.js` no-cache, `/version.json` no-store) — **chưa có CSP/HSTS/X-Content-Type-Options/Referrer-Policy/Permissions-Policy**. Theo `plan.md:62` P4-T1 (`[ ]` chưa tick) chỉ giao `no-cache`, còn **P10-T1** (`plan.md:128`, `[ ]`) mới giao "Header an toàn + CSP" → chưa deploy Pages → **N-A cho P3**, ghi NGHI VẤN (mục 4.1), không chặn cổng P3. CORS (đọc lướt): `OPTIONS` với `Origin: https://evil.example.com` → **không có** `access-control-allow-origin`. |
| S12 | N-A (P4) | `src/sw.ts` **chỉ precache app shell** (`precacheAndRoute(self.__WB_MANIFEST)`), comment ghi "KHÔNG khai báo runtime caching nào → fetch tới /rest/v1, /auth/v1, /storage/v1 đi thẳng mạng"; `grep` trong `sw.ts` không có runtime route/API cache. Chưa deploy → **N-A (P4)**. |
| S13 | ✔ | `grep -rIn "console\." src/ \| grep -v '\.test\.'` → **count=0** (0 log). Toàn bộ `setItem` trong `src/` (loại test): `supabase.ts:55-57` (routing token), `session.ts:37` (`login_at`), `session.ts:65` (`hemtra.remember`), `loginForm.ts:31` (`username`) → **không lưu mật khẩu/OTP**. `grep -rniE "(localStorage\|sessionStorage\|console)\.[a-z]*\([^)]*(password\|otp\|token)" src/` → rỗng. `grep -rn "updateUser\|resetPasswordForEmail" src/` → rỗng (không có đường tự-service ngoài EF). |
| S14 | N-A | `git diff --name-only 92779bc..HEAD \| grep -E "bill\|stats"` → **rỗng**; P3 không đụng bill/tiền/stats → **N-A (P1/P6)** (test-p1 `create_bill` idempotent vẫn 33/33). |
| S15 | ✔ | **Client**: `src/lib/session.ts:12` `SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000`; "ghi nhớ" → `authTargetStore()` = `localStorage`/`sessionStorage` (`supabase.ts:36-40`); `removeItem` xóa cả 2 cửa hàng. **Server**: xác minh live — xem mục 2 (7 kịch bản, 11/11 PASS). |

Phụ trợ (nền, không thay QC): `npx supabase db advisors --linked` → **6 WARN, 0 ERROR**
(**bằng đúng số trước fix**, không còn WARN `authenticated_security_definer_function_executable`
cho `session_fresh`); 6 WARN = `function_search_path_mutable(set_updated_at)`, `anon_…(rls_auto_enable)`,
`authenticated_…(create_bill, is_admin, rls_auto_enable)`, `auth_leaked_password_protection`
→ đã được vòng 1 đánh giá ở mục 3, giữ **backlog**, không phải lỗi P3.

## 2. Xác minh 2 fix của SEC vòng 1

### 2.1 SEC-001 — `session_fresh()` theo phiên server (CWE-613)

**Migration/DB (read-only):**

| Lệnh | Output |
|---|---|
| `supabase db query --linked` → `pg_proc` | `private.session_fresh` **secdef=true**, `proconfig=[search_path=""]`; `public.session_fresh` **secdef=false** (invoker), `[search_path=""]` — **exit 0** |
| `pg_policies where qual/with_check ilike '%session_fresh%'` | **12** (10 bảng public + `storage.objects`×2) — đúng 12 policy cũ, không đổi chỗ gọi |
| `has_function_privilege` | `private.session_fresh()`: anon=**true**, authenticated=true · `session_fresh()` (public): anon=**false**, authenticated=**true** |
| `POST /rest/v1/rpc/private.session_fresh` (anon **và** service_role) | **HTTP 404 `PGRST202`** → schema `private` **không** bị expose (đúng claim của fix) |
| `POST /rest/v1/rpc/session_fresh` (anon, không JWT) | **HTTP 401 `42501 permission denied for function session_fresh`** |

**Thực nghiệm cloud thật (user tạm `p3sec2-staff@example.com` — script
`/tmp/opencode/sec-r2-sess.sh`, `TONG: PASS=11 FAIL=0`, exit 0):**

| # | Bước | Output thật |
|---|---|---|
| A | login → `GET /rest/v1/categories` (phiên mới) | `HTTP 200` + 7 dòng (`Trà trái cây`, `Trà sữa`, …) → **PASS** |
| B | `update auth.sessions set created_at = now()-interval '8 days'` → GET lại | `HTTP 200 body=[]` → **bị lọc** → **PASS** |
| C | `grant_type=refresh_token` khi phiên **đang 8 ngày** → GET bằng token mới | `iat_B-iat_A=5s`, `session_id_giun=YES` → `HTTP 200 body=[]` → **refresh KHÔNG reset hạn** → **PASS** |
| D | `restore created_at = now()` → refresh lại → GET | `iat_C=1790989470`, `now-iat_C=1s` (**iat mới**), `session_id_giun=YES` (**giữ nguyên**) → `HTTP 200` + 7 dòng → **đúng thiết kế: refresh không reset hạn nhưng phiên còn hạn vẫn đọc được** → **PASS** |
| — | decode JWT thật | `session_id` có mặt, `sub` khớp `auth.sessions.user_id` |

→ **SEC-001 ĐÃ ĐÓNG.** Lớp server hoạt động: token `iat` bao nhiêu tươi đi nữa, quá 7 ngày
tính từ `auth.sessions.created_at` là mất quyền; refresh không cứu được phiên hết hạn.

**Test hồi quy**: `PATH=/tmp/opencode/bin:$PATH bash scripts/test-p1.sh` →
`=== KET QUA: PASS=33 FAIL=0 ===` (**exit 0**), gồm 5 assertion mới của fix
(`phien moi=true`, `phien 8 ngay=false`, `session_id khong ton tai=false`,
`het han phien doc menu=0`, `het han phien doc profiles=0`) chạy với **iat tươi**.
*(Lưu ý kỹ thuật: `supabase` binary không có sẵn trong `/tmp/opencode/bin` ở phiên này →
tôi tạo wrapper `#!/usr/bin/env bash exec npx --yes supabase "$@"` ở đó để chạy đúng
lệnh QC đã dùng; lần chạy đầu `command not found` → 0/33, chạy lại wrapper → 33/33.)*

### 2.2 SEC-002 — GoTrue không cho đổi mật khẩu không cần mật khẩu cũ (CWE-620)

| Lệnh | Output |
|---|---|
| `GET https://api.supabase.com/v1/projects/{ref}/config/auth` (Bearer PAT, read-only) | `HTTP 200` → **`security_update_password_require_current_password = True`** |
| `PUT /auth/v1/user` — Bearer **access_token hợp lệ** + body **chỉ** `{"password":"<moi>"}` (**không** có mật khẩu cũ) | **`HTTP 400` `{"code":400,"error_code":"current_password_required","msg":"Current password required when setting new password."}`** |
| `POST /auth/v1/token?grant_type=password` bằng **mật khẩu CŨ** | `HTTP 200` (đăng nhập được → mật khẩu **chưa** bị đổi) |
| `POST /auth/v1/token?grant_type=password` bằng **mật khẩu MỚI** | không có `access_token` → **đăng nhập thất bại** |

→ **SEC-002 ĐÃ ĐÓNG** (vòng 1 reproduce = `200`; nay `400 current_password_required`).
Không ảnh hưởng luồng app: `src/` không gọi `updateUser`/`resetPasswordForEmail` (grep = rỗng);
các EF dùng `admin.auth.admin.updateUserById` (admin API không qua flag) — code EF không đổi.

## 3. LỖI

Không có lỗi mới → không có `SEC-00x` mới.

- Không mở lại `[SEC-001]`/`[SEC-002]` (đã xác minh đóng ở mục 2).
- `[SEC-003]` **MINOR — giữ nguyên, ghi backlog**: `disable_signup = False` (đo read-only
  `GET config/auth` → vẫn `false`; `POST /auth/v1/signup {email:""}` → `422` = endpoint còn sống).
  Cửa sổ pre-bootstrap như vòng 1, **không xấu đi** (signup vẫn chưa bị exploit, không tạo user mới;
  `mailer_autoconfirm=false` → đăng ký chưa xác nhận không lấy được session). sig vòng 1:
  `7312c83fd2d755c2ffb251115c8e8f5076ca822a`.
- `[SEC-004]` **MINOR — giữ nguyên, ghi backlog**: chạy lại payload gốc
  `{"action":"login","username":"admin\"; DROP TABLE profiles;--"}` → **`HTTP 500
  {"error":"Lỗi máy chủ, thử lại sau"}`**, lặp lại 3/3 = **500** (giống hệt vòng 1, fail-closed);
  `profiles` vẫn còn `[{username:t7staff}]` (không có SQL thực thi). sig vòng 1:
  `98d0fa1105f4b3660c604e4ba4e4007f21eb056e`. Gợi ý giữ nguyên: bọc `getFailedCount`.
- Backlog advisors giữ nguyên (mục 1, cuối): `set search_path=''` cho `set_updated_at`;
  `password_hibp_enabled=false` → bật ở Dashboard (đã đo lại `false`).

**Không có BLOCKER, không có MAJOR, MINOR đều đã ở backlog → PASS** (loop.md §4.2, §4.3).

## 4. NGHI VẤN (chưa chứng minh / ngoài phạm vi — không chặn)

1. **`public/_headers` chưa có header an toàn** (CSP/HSTS/X-Content-Type-Options/
   Referrer-Policy/Permissions-Policy) — chỉ có `Cache-Control`. Theo `plan.md` việc này thuộc
   **P4-T1 (một phần) + P10-T1** (cả 2 chưa tick) → **N-A cho P3**; ghi để P4/P10 không quên.
2. **Dist hiện tại không chứa bất kỳ cấu hình Supabase nào** — `dist/assets/index-DZRe1RHr.js`
   không chứa `supabase.co`/`VITE_SUPABASE_*` (khác với artifact `index-DecQo9VV.js` mà QC
   vòng 3 đo). Không phải leak (thực tế là *không* có key nào); nhưng lạ so với QC → để
   **qc-test/build** xác nhận lại ở vòng build kế (`dist` không nằm trong git nên không chặn).
   *(Anon key có xuất hiện trong bundle là bình thường theo design §2.1 — nhưng ở bản build
   hiện tại thì không có gì cả.)*
3. **Giữ nguyên 4 NGHI VẤN của vòng 1 chưa chứng minh được** (code không đổi → vẫn còn):
   timing oracle `auth-login` (~100–300 ms); không có app-level lockout ở
   `change-password`/`change-recovery-email` (phụ thuộc GoTrue rate limit — tôi không bắn
   nhanh để tránh đốt quota); thứ tự `disablePublicSignup()` trước khi ghi cờ trong
   `bootstrap-admin.handleComplete`; `change-recovery-email` `listUsers({page:1,perPage:200})`
   sót check `emailTaken` khi >200 user.
4. **Đã kiểm và SẠCH** (không còn là nghi vấn): `private.session_fresh` được `grant execute`
   cho `PUBLIC` (nên `has_function_privilege(anon)=true`) — nhưng `POST /rest/v1/rpc/private.session_fresh`
   trả **404 PGRST202** với cả anon lẫn service_role → schema `private` không expose, không có đường khai thác qua API.

## 5. KHÔNG KIỂM ĐƯỢC

- **Bootstrap lần 2 (live)**: cần `bootstrapped=true` = đổi trạng thái cloud (e2e 72 test
  phụ thuộc `pre-bootstrap`) → **cấm**; thay bằng evidence `p3t2-bootstrap-admin-ef.md`
  (đã test 409 + 422 rồi reset) + đọc code guard. Tương tự happy-path `admin-recovery` /
  `change-recovery-email` với `admin_email` thật (hiện `null`).
- **Bắn nhanh OTP thật (S10)**: `rate_limit_email_sent=30`/h + yêu cầu "≤3 email thật"
  → chỉ đọc config rate limit + kiểm nhánh bị từ chối (`unlock-otp`/`unlock-verify`,
  `request-otp` email lạ không gửi gì). **Email thật phát sinh trong audit = 0**
  (tạo user qua admin API `email_confirm:true` không gửi mail; không chạy `POST /signup`).
- **S11/S12 trên trang thật**: chưa deploy Cloudflare Pages → header/SW chưa có hiệu lực
  → chuyển **P4/P10**.
- **S9 (Storage)**, **S14 (bill/stats)** → **N-A (P7/P1/P6)** — P3 không đụng bề mặt này.
- **`supabase test db` (local)**: local stack hỏng từ P0 (`B-001`) → dùng `scripts/test-p1.sh`
  trên DB linked (**33/33, exit 0**).
- **Thời gian**: `npm run typecheck`/`lint`/`test`/e2e **không chạy lại** vì QC vòng 3 đã
  PASS toàn bộ **sau** 2 fix (`p3-qc-round3.md`: Q1–Q12 ✔, 214 unit, 72 e2e, 33/33 test-p1)
  và từ đó đến nay không có thay đổi code P3 nào ngoài phần tôi đã đọc/đo ở trên
  (`git diff 3599f06..HEAD` chỉ ra 4 file, xem mục 0).

## 6. Trạng thái cloud sau audit (đã dọn sạch)

Tạo/xóa trong lúc audit (theo mẫu `p3t8-smoke.sh`):
`p3sec2-staff@example.com` + profile `p3sec2staff` (script `sec-r2-sess.sh`),
`p3sec2b-staff@example.com` + profile `p3sec2bstaff` (script `sec-r2-s45.sh`),
3 hàng `login_attempts` do probe S7 tạo → **đã xóa hết**.

Kiểm tra cuối (sau mọi lệnh):

```
GET /auth/v1/admin/users   → ['t7staff@hem.local']                 (0 user tạm)
GET /rest/v1/profiles      → [{"username":"t7staff","role":"staff"}] (0 profile tạm)
SQL: n_users=1  n_sessions=1  n_temp=0  n_temp_profile=0  n_probe_attempts=0  n_bills=0
GET /rest/v1/app_meta (service) → bootstrapped=false, admin_email=null, menu_version=1
GET /rest/v1/app_meta (anon)    → [{"bootstrapped":false}]          (setup screen còn hoạt động)
PATCH config / bootstrap-admin thật / OTP thật / POST /auth/v1/signup  → KHÔNG gọi
```

*Trước khi dọn: `cleanup` của script 2 không bắt được user (lệnh listusers trong trap cho
kết quả rỗng) → tôi phát hiện bằng kiểm tra tay và `DELETE …/admin/users/<id>` → `200`;
đã xác nhận lại `n_temp=0` bằng SQL ở trên.* `menu_version=1` = giá trị từ trước
(audit không đụng menu).

## 7. Kết luận

- **VERDICT: PASS** — không còn BLOCKER/MAJOR; 2 fix của vòng 1 đã xác minh thật trên cloud;
  2 MINOR cũ giữ nguyên mức và **ghi backlog**.
- Ghi cho main-coding: (a) đưa `SEC-003`/`SEC-004` + 4 mục NGHI VẤN §4 vào `backlog`;
  (b) **`state.json` Q-006** (design §4.3 vẫn ghi "so `iat`", cơ chế đã đổi sang
  `auth.sessions.created_at`) vẫn `open` — cần user chọn wording (open_questions, không tự sửa);
  (c) nhắc P4/P10: `_headers` chưa có CSP/HSTS (NGHI VẤN §4.1).
