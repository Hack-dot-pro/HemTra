# SEC REPORT — Phase P3 — Vòng 1

```
VERDICT: FAIL
PHẠM VI: hẹp (P3, theo loop.md §5) · BỀ MẶT: EF bootstrap-admin, auth-login,
  admin-recovery, change-password, change-recovery-email; routes /setup, /login,
  /recovery, /change-password, /change-recovery-email; RequireAuth/accessGuard
  (role từ profiles); session 7 ngày (localStorage/sessionStorage + session_fresh());
  RLS app_meta + migration 20261002040248; GoTrue config (đọc).
skills_read: [AGENT.md, subagent.md (§3), .opencode/skills/security/skill.md,
  .opencode/skills/auth/skill.md, plan.md (P3), design.md (§4, §5), loop.md (§4.3),
  .opencode/evidence/p2-sec-round1.md (mẫu), .opencode/evidence/p3-qc-round2.md,
  .opencode/evidence/p3t8-smoke.sh (mẫu tạo/xóa user tạm)]
```

TÓM TẮT: S1–S14 xanh (hoặc N-A đúng phạm vi) với bằng chứng tái hiện được trên cloud
thật, **S15 FAIL** — lớp server của "phiên tối đa 7 ngày" không hoạt động (token refresh
làm `iat` mới) + **1 MAJOR nữa** ở S4/S5: GoTrue cho đổi mật khẩu không cần mật khẩu cũ
bypass EF `change-password`. Cloud giữ nguyên trạng thái `pre-bootstrap` sau khi audit
(xem mục 5).

## 0. Đối chiếu scope

- `git diff --name-only 92779bc..HEAD | wc -l` → **75** = `scope_files` ✔ (khớp 100%, trùng QC Q12).
- `git status --short` → chỉ ` M state.json` (QC ghi `loop.last_report`) + `?? .opencode/evidence/p3-qc-round2.md`
  (do QC tạo) → không có file lạ ngoài scope.
- Không sửa bất kỳ file nào trong lúc audit; file duy nhất được ghi = báo cáo này.

## 1. Kết quả theo hạng mục

| # | Kết quả | Lệnh + output ngắn |
|---|---|---|
| S1 | ✔ | `/go/bin/gitleaks detect --no-banner -v` → `35 commits scanned … no leaks found` (exit 0). `gitleaks detect --no-git -v .` (exit 1) → **5 finding: 4 trong `.env` local** (`.env:generic-api-key:13` = `SUPABASE_ACCESS_TOKEN`, `.env:jwt:9/10/21` = anon + service_role + `VITE_…ANON_KEY`) + **1 finding `jwt` trong `dist/assets/index-DecQo9VV.js:21` = `SUPABASE_ANON_KEY`** (key công khai theo design §2.1, mọi bundle đều có → không phải leak). `.gitignore:2:.env` ✔, `git log --all --oneline -- .env` → rỗng (chưa từng commit); `git check-ignore dist` (đã có trong `.gitignore`) → bundle không nằm trong git. **Bundle sạch**: `dist/assets/index-*.js` chứa `SUPABASE_URL/PROJECT_REF/ANON_KEY` (công khai, đúng design §2.1) và **KHÔNG** chứa `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SMTP_APP_PASSWORD`, `SUPABASE_DB_PASSWORD` (đo trực tiếp bằng Python so giá trị `.env` ↔ nội dung `dist/` → `service_role in dist: False`). `grep -rI "service_role" src/ index.html public/` → chỉ 1 dòng test assert *không* chứa. |
| S2 | ✔ | `npm audit --omit=dev` → `found 0 vulnerabilities` (exit 0); `npm audit` (toàn bộ) → `0 vulnerabilities` (exit 0). |
| S3 | ✔ | REST thật 3 role: **anon** `?select=*` → `42501 permission denied for table app_meta`; `?select=admin_email` → denied ✔ (migration `20261002040248` revoke table-level). **authenticated (user tạm)**: `select=*`/`select=admin_email` → `403 permission denied`; `PATCH app_meta {admin_email}`/`{bootstrapped:true}` → `403`; `PATCH profiles {role:'admin'}` → `403`; `POST profiles` → `403`; `DELETE profiles` → `403`; `POST login_attempts` → `403`; `DELETE bills` → `403`. Chức năng không vỡ: anon `?select=id,bootstrapped,menu_version` → `200 [{"id":1,"bootstrapped":false,"menu_version":3}]`. **service_role** → `200 [{"admin_email":null,"bootstrapped":false,"id":1}]`. `bash scripts/test-p1.sh` (QC vòng 2) → `PASS=28 FAIL=0`. Không policy `using(true)` trên cột nhạy cảm (policy `app_meta_read using(true)` nhưng grant theo **cột**, `admin_email` không thuộc grant của anon/authenticated). |
| S4 | ✔ | Token **staff** thật (user tạm, đã xóa) gọi EF admin-only → `change-recovery-email` cả 3 action (`request-current`, `request-new`, `complete`) → **403 `Chỉ admin mới dùng chức năng này`** (kiểm `profiles.role` phía server, `requireAdmin`). EF khác: `change-password` không có tham số id người khác → chỉ đổi được của chính token. |
| S5 | ✔ | Lockout thật: 5 lần sai → lần 6 → **429 `{"error":"Sai mật khẩu quá 5 lần…","locked":true}`**; **không bypass được bằng `X-Forwarded-For`** (lần 7/8 với XFF khác vẫn 429 → gateway không lấy XFF của client; `getClientIp` không bị giả mạo). Token giả → `change-password`/`change-recovery-email` → `401 Phiên đăng nhập không hợp lệ`; token **sửa payload role + ký sai** → GoTrue `403 bad_jwt: token signature is invalid`. Sai mật khẩu với user tồn tại vs không tồn tại → **cùng** `401 {"error":"Tài khoản hoặc mật khẩu không đúng."}` (không oracle). |
| S6 | ✔ (1 nhánh lấy evidence cũ) | Live trên cloud pre-bootstrap: `bootstrap-admin request-otp` email **không** trùng secret → `200 {ok:true}` (anti-oracle); theo code chỉ gọi `signInWithOtp` khi email trùng secret (`bootstrap-admin/index.ts:132-135`) và **không có user nào được tạo** (kiểm lại `GET /auth/v1/admin/users` sau test = không thêm user); email sai format → `400`; `complete` OTP giả → **401 `Mã OTP không đúng hoặc đã hết hạn`**; `action` lạ → `400`; `GET` → `405`. Nhánh *bootstrap lần 2 → 409* **không chạy lại** (cần `bootstrapped=true` = đổi trạng thái cloud, cấm) → dựa evidence `.opencode/evidence/p3t2-bootstrap-admin-ef.md` dòng 51–53 đã chạy trên project này: `bootstrapped=true … disable_signup=True; signup mới → 422 signup_disabled` + `request-otp/complete → 409 "Hệ thống đã được thiết lập"` rồi RESET về pre-bootstrap; code có guard 2 lớp (`bootstrap-admin/index.ts:125,149` + update có `.eq('bootstrapped',false)` dòng 206). |
| S7 | ✔ | `auth-login` payload `"><img src=x onerror=alert(1)>`, `<script>alert(1)</script>` → `401` bình thường (không thực thi, không lỗi SQL); `' OR 1=1--` → **Cloudflare WAF 403** chặn ngay (bảo vệ thêm). `bootstrap-admin complete` với username `<script>alert(1)</script>` / `admin'--` → `400 Dữ liệu không hợp lệ` (zod `^[a-z0-9._-]{2,30}$`, `:83`). `grep -rIn "dangerouslySetInnerHTML\|\beval(\|new Function\|innerHTML" src/` → **rỗng**. Username được truyền parameterized qua supabase-js (`.eq()`), không nối chuỗi SQL. |
| S8 | ✔ (hẹp) | P3 không nhận id tài khoản người khác: `change-password/index.ts:95-99` xác thực token rồi `updateUserById(user.id)` (không tham số id từ body); `change-recovery-email` chỉ đổi được của chính caller + email có `profiles` khác → `409 emailTaken`. Storage/signed URL/IDOR bill → **N-A (P7/P1)**. |
| S9 | N-A | `grep -rIn "supabase.storage\|\.upload(" src/ supabase/functions/` → rỗng; P3 không đụng upload → **N-A (P7/P1)**. |
| S10 | ✔ (hẹp) | Lockout 5/15 phút = **429** sau 5 lần sai (xem S5); `unlock-otp` với username không tồn tại → **`200 {ok:true}` chung chung** (chống dò username), `unlock-verify` OTP sai → `401`. Cloudflare WAF trả 403 cho payload SQL-ish. **GET config (read-only)**: `rate_limit_otp=30`, `rate_limit_email_sent=30`, `rate_limit_verify=30`, `rate_limit_anonymous_users=30`, `mailer_otp_exp=600`, `mailer_otp_length=6` → giới hạn OTP có thật. *Không bắn nhanh OTP thật* (định mức email 30/h, môi trường pre-bootstrap) → xem mục 4. |
| S11 | N-A | `find . -name _headers` → rỗng; `public/` chỉ có `_redirects, favicon, fonts, icons`. CSP/HSTS/… được đặt ở **P4-T1/P10-T1** (`plan.md:63,128`) → chưa deploy Pages → **N-A (P4/P10)**. Phụ trợ: CORS của EF — `Origin: https://evil.example.com` → **không có** header `access-control-allow-origin` (chỉ allowlist `hemtra.pages.dev`, `localhost:5173`, `127.0.0.1:5173` được phản hồi). |
| S12 | N-A | `grep -rIn "serviceWorker" src/ index.html` → rỗng; chưa có SW/manifest (P4-T1) → **N-A (P4)**. |
| S13 | ✔ | `grep -rIn "console\." src/` (loại test) → **rỗng** (0 log). Toàn bộ `setItem` trong src: `hemtra.remember`, `hemtra.login_at`, `hemtra.username` + storage route token của supabase-js (`supabase.ts:47-72`) → **không lưu mật khẩu/OTP**; `grep -rniE "(localStorage\|sessionStorage\|console)\.[a-z]*\([^)]*(password\|otp\|token)"` (loại test) → rỗng. `grep "updateUser\|resetPasswordForEmail" src/` → rỗng. |
| S14 | N-A | P3 không đụng bill/tiền/stats (`git diff --stat` không có file bill/stats; `grep client_uuid\|create_bill src/` → rỗng) → **N-A (P1/P6)**. |
| S15 | **✘** | `src/lib/session.ts:9` `SESSION_MAX_AGE_MS = 7 ngày` + `sessionGuard` (client) ✔; **lớp server FAIL** — xem `[SEC-001]`. Thực nghiệm: login → `iat1=1790951150`, chờ 25 s, `grant_type=refresh_token` → `iat2=1790951175` (**= thời điểm refresh, `now-iat2=0s`**) → `session_fresh()` (`20261001154333_core_functions.sql:44-59`) luôn `< 7*24*3600` → không bao giờ hết hạn phía server. |

Phụ trợ (nền, không thay QC): `npm run typecheck`/`npm run lint` → exit 0 (đã xanh ở QC vòng 2, không chạy lại test); `npx --yes supabase db advisors --linked` → 6 WARN (đánh giá mục 3).

## 2. LỖI

```
[SEC-001] MAJOR · CWE-613 (Insufficient Session Expiration) / OWASP A07 ·
  src/lib/session.ts:1-4 (claim "server vẫn là nơi chặn cuối") +
  supabase/migrations/20261001154333_core_functions.sql:44-59 · sig:77dbf23e6a65f5a1d34f21922c3c2fab533ced97
  Tái hiện (cloud thật, 40 s):
    1) POST /auth/v1/token?grant_type=password  → access_token A (iat1 = 1790951150)
    2) sleep 25
    3) POST /auth/v1/token?grant_type=refresh_token (refresh_token của A) → access_token B
       decode B.payload.iat = 1790951175 (= "now" tại lúc refresh; iat2-iat1 = 25s, now-iat2 = 0s)
    4) GET /rest/v1/products  với B → 200 (RLS `session_fresh()` = true)
  Bằng chứng bổ trợ: unit test trong scripts/test-p1.sh:75 chỉ dựng claim iat CŨ thủ công
    (`$old_claims`) nên luôn pass — không mô phỏng được refresh thật.
  Tác động: "Phiên tối đa 7 ngày" (AGENT.md §11.6, design §4.3(b) "dù client bị sửa")
    chỉ được enforce bởi `login_at` phía CLIENT (`sessionGuard`) — client bị sửa/bỏ
    guard là giữ phiên VÔ HẠN (supabase.ts:87 `autoRefreshToken:true` + refresh token
    không hết hạn) → lớp "chặn cuối" không tồn tại.
  Gợi ý sửa: (a) cho `session_fresh()` đọc **mốc bắt đầu phiên server-side** thay vì
    `iat` — ví dụ SECURITY DEFINER fn so `auth.sessions.created_at` của session hiện tại
    (refresh xoay token trong cùng session, created_at không đổi), `set search_path=''`,
    revoke EXECUTE khỏi anon/authenticated; hoặc (b) ghi `login_at` vào DB lúc đăng nhập
    (EF auth-login đã có service_role) và so trong policy. Giữ lớp client như UX.
    Thêm test: refresh token cũ 7 ngày (giả lập iat/created_at) → RLS từ chối.

[SEC-002] MAJOR · CWE-620 (Unverified Password Change) / OWASP A07 ·
  supabase/functions/change-password/index.ts:112-122 (ép mật khẩu cũ ở tầng app) bị
  bypass qua GoTrue `PUT /auth/v1/user` · sig:f6e459c3e3129b4cf40791aae0a809c7ef4dfa80
  Tái hiện (cloud thật, user tạm — đã xóa):
    GET config → "security_update_password_require_current_password": false
    curl -X PUT "$SUPABASE_URL/auth/v1/user" -H "Authorization: Bearer <access_token>"
         -d '{"password":"Bypass-sec-9988"}'          → 200 (KHÔNG gửi mật khẩu cũ)
    POST /auth/v1/token?grant_type=password {mật khẩu mới} → 200 (đăng nhập được)
    (đã khôi phục mật khẩu tạm rồi xóa user)
  Tác động: design §4.1 + auth/skill.md §3 "đổi mật khẩu bản thân phải nhập mật khẩu
    cũ" bị vô hiệu bằng 1 lệnh API trực tiếp: kẻ có token phiên (mượn máy, XSS, token
    rò rỉ) đổi mật khẩu → chiếm tài khoản vĩnh viễn, đuổi chủ thật; EF `change-password`
    chỉ chặn đường đi của UI. Backlog hiện ghi "flag chỉ là hardening thêm" → **sai**,
    đây là đường bypass thật.
  Bằng chứng: y hệt mọi token hợp lệ (staff/admin) — `PUT /auth/v1/user` là self-service.
  Gợi ý sửa: bật flag ở Supabase Dashboard → Authentication → Settings →
    "Require current password for password updates" (PATCH Management API trả 404 với
    PAT đang có — đã ghi backlog); SAU khi bật phải chạy lại smoke này để xác nhận 401.
    Nếu Dashboard không bật được → coi là ràng buộc thiết kế: thu hồi/thay phiên khi
    phát hiện thay đổi mật khẩu ngoài EF (ghi `auth.users` change) hoặc chặn ở tầng
    Cloudflare theo method PUT /auth/v1/user.

[SEC-003] MINOR (không chặn, ghi backlog) · CWE-284 ·
  RLS chỉ đòi `session_fresh()` cho profiles/bills/menu
  (supabase/migrations/20261001154825_rls_policies.sql:32-56) + signup còn mở pre-bootstrap
  · sig:7312c83fd2d755c2ffb251115c8e8f5076ca822a
  Tái hiện: `POST /auth/v1/signup {email của kẻ tấn công}` → 201 user (KHÔNG có session);
    `POST /auth/v1/token` khi chưa xác nhận → `400 email_not_confirmed` (an toàn).
    Nhưng kẻ tấn công xác nhận được bằng hộp thư CỦA MÌNH → `authenticated` hợp lệ →
    đọc toàn bộ `profiles`/`bills`, ghi được menu (policy chỉ cần `session_fresh()`).
  Tác động: chỉ tồn tại trong cửa sổ pre-bootstrap (`disable_signup=false` — đã đo);
    sau bootstrap thì tắt (evidence p3t2: signup → 422).
  Gợi ý: bootstrap ngay sau khi deploy; hoặc.policy hóa "phải có row profiles" cho
    bảng nhạy cảm (P9/P10 xem lại).

[SEC-004] MINOR (không chặn, ghi backlog) · CWE-755 ·
  supabase/functions/auth-login/index.ts:103-114 (getFailedCount throw → 500) ·
  sig:98d0fa1105f4b3660c604e4ba4e4007f21eb056e
  Tái hiện: `{"action":"login","username":"admin\"; DROP TABLE profiles;--","password":"x"}`
    → `500 {"error":"Lỗi máy chủ, thử lại sau"}` (lặp lại được, 4 lần/4).
    Nguyên nhân: EF tự gọi `GET /rest/v1/login_attempts?username=eq.<chuỗi có "DROP TABLE">`
    → **Cloudflare WAF chặn request nội bộ** (test thẳng: cùng query → `403 CF ... blocked`);
    `getFailedCount` throw → `handleLogin` catch → 500.
  Tác động: chỉ 500 chung chung, không lộ dữ liệu, không bypass lockout (throw xảy ra
    TRƯỚC khi đăng nhập → fail-closed); username hợp lệ không thể chứa ký tự đó
    (zod `^[a-z0-9._-]{2,30}$` ở bootstrap/admin-users) → không ảnh hưởng user thật.
  Gợi ý: bọc `getFailedCount` riêng, coi lỗi đếm như "không đếm được → chặn đăng nhập"
    (đúng hướng fail-closed) thay vì 500; tránh để WAF của nền tảng nuốt query nội bộ.

Không có BLOCKER. 2 MAJOR (SEC-001, SEC-002) → bắt buộc sửa (loop.md §4.3) → cổng FAIL;
2 MINOR ghi `backlog`.
```

## 3. Đánh giá backlog liên quan (yêu cầu của gói đầu vào)

Chạy `npx --yes supabase db advisors --linked` (read-only) → 6 WARN, không có ERROR:

| WARN | Đánh giá | Là lỗi của P3? |
|---|---|---|
| `function_search_path_mutable` — `set_updated_at` | Trigger fn chỉ làm `new.updated_at := now()` (`20261001152827:75-82`), không tham chiếu bảng → không khai thác được; chỉ thiếu `set search_path = ''`. | Không (P1, pre-existing) → **MINOR backlog** thêm `set search_path=''` khi đụng migration sau. |
| `anon_…_security_definer_function_executable` — `rls_auto_enable` | Đã đọc definition qua SQL thật: là **event trigger fn** (`returns event_trigger`), body chỉ `ALTER TABLE … ENABLE row level security` cho bảng `public` mới tạo, `SET search_path TO 'pg_catalog'`, **không bao giờ tắt RLS**. Gọi qua `/rpc/` sẽ fail (event trigger không gọi trực tiếp được) → không có đường khai thác. | Không (function hệ thống, không nằm trong repo) → **không cần thành lỗi**; ghi chú trong backlog. |
| `authenticated_…` — `create_bill`, `is_admin` | Cả hai đều `set search_path = ''` + tham chiếu đủqualify; `is_admin()` chỉ trả boolean theo `auth.uid()` (không tăng quyền); `create_bill` là RPC tính lại giá phía server (đúng design §10) — đã PASS gate P1. | Không → giữ backlog, không phải lỗi P3. |
| `auth_leaked_password_protection` (disabled) | Confirmed bằng GET config: `password_hibp_enabled: false`. Chưa bật được thì cùng nhóm với `security_update_password_require_current_password` (PATCH config 404 với PAT hiện tại) → cần Dashboard. | Không phải lỗi code P3 → **backlog** (đề xuất: bật cả 2 ở Dashboard Authentication → Settings). |
| GoTrue `security_update_password_require_current_password` (backlog cũ: "chỉ hardening thêm") | **Đánh giá lại: KHÔNG phải hardening thêm** — đã chứng minh bypass thật (`[SEC-002]`). | **Có** → elevated thành lỗi MAJOR của cổng này. |

## 4. NGHI VẤN (chưa chứng minh, không chặn)

1. **Timing oracle ở `auth-login`**: user tồn tại phải qua thêm 1 vòng `signInWithPassword`
   (network) → phản hồi có thể chậm hơn user không tồn tại ~100–300 ms. Chưa đo (cần
   statistical sampling) → ghi để P10 đo hoặc bỏ qua (dự án cá nhân).
2. **Không có app-level lockout cho chuỗi mật khẩu sai** ở `change-password` /
   `change-recovery-email` (phụ thuộc rate limit GoTrue). Không thử bắn nhanh để tránh
   đốt quota `rate_limit_verify/rate_limit_anonymous_users=30`.
3. **Thứ tự trong `bootstrap-admin.handleComplete`**: `disablePublicSignup()` chạy
   (`:185`) **trước** khi ghi cờ (`:202`) → nếu bước sau lỗi thì retry được (đúng), nhưng
   nếu disable **thành công** mà bước sau fail → signup tắt khi `bootstrapped=false` →
   `signInWithOtp(shouldCreateUser:true)` của lần retry sẽ fail → luồng bootstrap kẹt
   (availability, phải bật lại bằng MGMT token). Chưa tái hiện được vì không được đổi
   trạng thái cloud.
4. **Cloudflare WAF trước EF có thể chặn cả password chứa chuỗi kiểu SQL** (đã thấy WAF
   chặn body/username `' OR 1=1--` → 403). Chưa thử với password hợp lệ của user thật
   (sẽ phải tạo user tạm + bắn login) → để P10 xác nhận.
5. **`change-recovery-email` `listUsers({page:1, perPage:200})`** (`:184`) — quá 200 user
   thì check `emailTaken` sót. Prototype không chạm → ghi P9/P10.

## 5. KHÔNG KIỂM ĐƯỢC

- **Bootstrap lần 2 (live)**: cần `bootstrapped=true` → đổi trạng thái cloud (e2e 72 test
  phụ thuộc `pre-bootstrap`) → **cấm**; thay bằng evidence `p3t2-bootstrap-admin-ef.md`
  (đã test 409 + 422 trên project này rồi reset) + đọc code guard. Tương tự: happy-path
  `admin-recovery`/`change-recovery-email` với `admin_email` thật (hiện `null`).
- **Bắn nhanh OTP thật (S10)**: `rate_limit_email_sent=30`/h và yêu cầu "≤ 3 email thật"
  → chỉ đọc config rate limit + kiểm nhánh *bị từ chối* (unlock-otp/verify, request-otp
  email lạ không gửi gì). Email thật duy nhất phát sinh trong audit: 2 mail xác nhận từ
  `POST /auth/v1/signup` (đến `example.com`, không đến hộp thư thật) — đã xóa user.
- **S11/S12 trên trang thật**: chưa deploy Cloudflare Pages/PWA → `_headers`/SW chưa tồn
  tại → chuyển **P4/P10**.
- **S9 (Storage)**, **S14 (bill/stats)** → **N-A (P7/P1/P6)** — P3 không đụng bề mặt này.
- **`supabase test db` (local)**: local stack hỏng từ P0 (B-001) → dùng
  `scripts/test-p1.sh` trên DB linked (QC vòng 2: 28/28) + truy vấn REST/SQL thật ở mục 1.
- Header security của EF (không có HSTS/CSP) — EF là API sau Gateway, CSP thuộc `_headers`
  của Pages (P4/P10).

## 6. Trạng thái cloud sau audit (đã dọn sạch)

Tạo/xóa trong lúc audit (theo mẫu `p3t8-smoke.sh`): user tạm `p3sec-staff@example.com`
(+ profile `p3secstaff`), 2 user signup probe → **đã xóa hết**; hàng `login_attempts` do
probe tạo (≥ 14:00 UTC) → **đã xóa**. Kiểm tra cuối:

```
GET /auth/v1/admin/users        → ["t7staff@hem.local"]        (0 user mới)
GET /rest/v1/profiles           → [{"username":"t7staff","role":"staff"}]
GET /rest/v1/app_meta           → bootstrapped=false, admin_email=null, menu_version=3
GET /rest/v1/app_meta (anon)    → [{"bootstrapped":false}]      (setup screen còn hoạt động)
PATCH config / bootstrap-admin thật / OTP thật  → KHÔNG gọi (cấm theo gói đầu vào)
```

`menu_version=3` = giá trị từ trước (audit không đụng menu; lần `INSERT products` fail
FK ngay, không ghi gì).

## 7. Kết luận

- **VERDICT: FAIL** — 2 MAJOR (`SEC-001`, `SEC-002`) bắt buộc sửa theo loop.md §4.3.
- Sửa xong → main-coding chạy **QC lại toàn bộ** trước khi gọi SEC vòng 2 (loop.md §4.1);
  vòng SEC kế tiếp cần: (1) tái hiện refresh→`session_fresh` với fix mới, (2) chạy lại
  `PUT /auth/v1/user` sau khi bật flag.
- 2 MINOR (`SEC-003`, `SEC-004`) + đánh giá advisors → ghi `backlog`, không chặn.
