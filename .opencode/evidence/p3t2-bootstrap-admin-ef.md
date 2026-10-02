# Evidence P3-T2 — Edge Function `bootstrap-admin` + migration `app_meta.admin_email`

Ngày: 2026-10-02 · Agent: main-coding · Plan: `plan.md` P3-T2
Kết quả: **PASS toàn bộ (smoke cloud)** — migration pushed + EF deployed + test end-to-end trên cloud (dev), cloud đã reset về pre-bootstrap.

## 1. Migration `20261002040248_app_meta_admin_email.sql`

Workflow theo `backend/skill.md` §3 (imperative): `supabase migration new app_meta_admin_email` → viết file → `supabase db push` (linked) → `supabase db advisors --linked --type security`.

Nội dung:
- `alter table public.app_meta add column admin_email text` + comment (chỉ `service_role` — design §5/§4.4).
- `revoke select on public.app_meta from authenticated` (hạn mức table-level từ `20261001154825_rls_policies.sql` §2 sẽ lọt cột mới) → `grant select (id, bootstrapped, menu_version, schema_version, updated_at)`.
- `anon` giữ column-level cũ → không đọc được `admin_email`.

Verify grants (`supabase db query --linked` — `has_column_privilege`):

| role | admin_email select | admin_email update | bootstrapped | menu_version |
|---|---|---|---|---|
| authenticated (table select) | **false** | false | true | true |
| anon | **false** | false | true | true |
| service_role | **true** | **true** | true | true |

Advisors security: **0 ERROR**; 15 mục INFO/WARN — tất cả pre-existing, không mục nào do migration mới:
- INFO `rls_enabled_no_policy` ×2 (`bill_code_counters`, `login_attempts`) — chủ đích deny-by-default (ghi trong P1-T6).
- WARN `function_search_path_mutable` (`set_updated_at`), `*_security_definer_function_executable` (`create_bill`/`is_admin`/`rls_auto_enable` — `create_bill`/`is_admin` chủ đích definer theo design; `rls_auto_enable` là function hệ thống không có trong repo), `auth_leaked_password_protection` disabled → ghi backlog cho security audit.

## 2. Edge Function `supabase/functions/bootstrap-admin/index.ts`

- 2 action: `request-otp` / `complete`; `verify_jwt=false` (thêm `[functions.bootstrap-admin]` vào `config.toml`); CORS allowlist (hemtra.pages.dev + localhost:5173).
- **Chống oracle**: `request-otp` trả `{ok:true}` cho mọi email hợp lệ format; chỉ email == `BOOTSTRAP_ADMIN_EMAIL` mới thật sự gọi `signInWithOtp` (lỗi nuốt + log server) → không dò ra được email nào khớp secret.
- `complete`: validate zod → guard `bootstrapped=false` → **verify OTP server-side** (`verifyOtp type:'email'`, không trả session/OTP cho client) → so email secret → check username unique → `admin.updateUserById` (password + `email_confirm:true`) → `PATCH /v1/projects/{ref}/config/auth {disable_signup:true}` → insert `profiles(role=admin)` → update `app_meta(bootstrapped=true, admin_email)` với guard `.eq('bootstrapped', false)`. Thứ tự: fail trước khi ghi cờ → retry được.
- Env secrets (đặt qua `supabase secrets set`): `BOOTSTRAP_ADMIN_EMAIL`, `MGMT_ACCESS_TOKEN` (PAT — PATCH disable_signup, design §4.2.5 + `decisions.p3t1_disable_signup`), `HEMTRA_PROJECT_REF`.
  - **Bài học**: tên secret không được bắt đầu `SUPABASE_` (reserved prefix của runtime) → `SUPABASE_PROJECT_REF` bị từ chối, đổi thành `HEMTRA_PROJECT_REF` + redeploy.
  - **Bài học**: `supabase functions deploy` (Docker bundler) fail DNS trong container (`registry.npmjs.org` không resolve) → dùng `--use-api` (bundle phía Management API) — deploy OK.
- Pinned: `npm:@supabase/supabase-js@2.117.2` (đồng bộ package.json), `npm:zod@3.23.8`.
- ESLint ignore `supabase/functions` + typecheck chỉ include `src/` → EF chạy theo Deno, không đụng gate Node.

## 3. Smoke test cloud — TOÀN BỘ PASS

Base: `https://tsnrggxczipzqvvpcbld.supabase.co/functions/v1/bootstrap-admin`

| # | Test | Kết quả |
|---|---|---|
| a | `action` sai | `400 {"error":"Dữ liệu không hợp lệ"}` |
| b | `request-otp` email **sai** | `200 {"ok":true}` + verify qua `/auth/v1/admin/users`: email lạ **không** được tạo user (anti-oracle OK) |
| c | `complete` OTP `000000` (email đúng) | `401 {"error":"Mã OTP không đúng hoặc đã hết hạn"}` |
| d | `OPTIONS` preflight (Origin localhost:5173) | `204` + CORS headers đúng (echo origin, methods, headers) |
| e | `request-otp` email **đúng** | `200` — OTP 6 số gửi thật qua SMTP Gmail (P3-T1) vào hộp thư admin |
| f | Lấy OTP server-side bằng `POST /auth/v1/admin/generate_link {type:'magiclink'}` → `email_otp` | dùng để test tự động, không cần đọc hộp thư |
| g | `complete` với OTP thật + username `admintest01` + mật khẩu | `200 {"ok":true}` |
| h | Verify trạng thái | `app_meta: bootstrapped=true, admin_email=pquangvinh1999@gmail.com`; `profiles: admintest01 role=admin`; **login password OK** (email thật + mật khẩu vừa đặt); `disable_signup=True`; signup mới → `422 signup_disabled` |
| i | Guard sau bootstrap | cả `request-otp` và `complete` → `409 {"error":"Hệ thống đã được thiết lập"}` |
| j | **RESET về pre-bootstrap** | xóa auth user (cascade profile), `bootstrapped=false`, `admin_email=NULL`, `disable_signup=False`; users còn lại chỉ `t7staff@hem.local` (seed cũ, không đụng) |

## 4. Ghi chú môi trường (không phải lỗi code)

- `supabase start` (local stack) **không chạy được** trên máy dev này: Docker chạy nested (`containerized`), xung đột iptables-legacy/nft → packet container-to-container bị drop (psql TCP timeout, realtime Ecto migrate treo 15s → fail). Trùng blocker B-001 thời P0-T6. **Quyết định: test EF trực tiếp trên cloud (dev)** — cloud API (`db query --linked`, `db push`, `db advisors`, `functions deploy --use-api`, `secrets set`) đều hoạt động.
- Cloud **đã reset** sau test → trạng thái pre-bootstrap để P3-T3 (UI bootstrap lần đầu) chạy thật được.
