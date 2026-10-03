# P3 — Sửa lỗi SEC vòng 1 (main-coding)

Nguồn: `.opencode/evidence/p3-sec-round1.md` (VERDICT FAIL — 2 MAJOR, 2 MINOR).
Chỉ sửa đúng các lỗi trong báo cáo (subagent.md §4.3); không thêm tính năng.

## SEC-001 · MAJOR · session_fresh() không hết hạn phía server (CWE-613)

**Nguyên nhân đo được:** refresh token cấp `iat` mới (`iat2-iat1 = 25s`, `now-iat2 = 0`)
→ `session_fresh()` so `iat` luôn true → client bị sửa giữ phiên vô hạn.

**Sửa:** migration `supabase/migrations/20261002144826_session_fresh_session_based.sql`
- Bản **SECURITY DEFINER** đặt ở schema **không expose** `private` (đúng remediation advisor 0029
  `authenticated_security_definer_function_executable`): đọc `auth.sessions.created_at`
  của phiên trong claim `session_id` (khớp cả `sub`); quá 7 ngày → `false`; `set search_path = ''`.
- `public.session_fresh()` = bọc **SECURITY INVOKER** (`select private.session_fresh();`)
  → **12 policy (10 bảng public + 2 storage) và test không phải đổi chỗ gọi**;
  PostgREST không expose `private` nên không gọi được qua `/rest/v1/rpc`.
- Session bị xóa (đăng xuất/đổi mật khẩu) → token mất quyền ngay (side effect tốt).
- Claim **không có** `session_id` (token legacy / bộ test giả lập claim) → giữ kiểm tra `iat` như cũ;
  token do GoTrue ký không thể thiếu `session_id` (đã đo) nên không mở đường bỏ hạn.
- ACL: `grant usage on schema private to authenticated` + `grant execute` (private & public);
  `revoke … from public, anon` trên bọc public (= rls_policies:76-77).

**Áp dụng:** migration đã có trong history (`migration list`: local = remote, `20261002144826`) →
chạy lại nội dung file bằng `supabase db query --linked` (exit 0) để DB khớp đúng file hiện tại.
Xác minh khái niệm: `pg_proc` → `private.session_fresh` `prosecdef=true`, `public.session_fresh`
`prosecdef=false`; `pg_policies` còn đúng **12** policy tham chiếu `session_fresh`.

**Advisor:** `npx supabase db advisors --linked` → **6 WARN, 0 ERROR — bằng đúng số trước fix**
(không còn WARN `authenticated_security_definer_function_executable` cho `session_fresh`).
6 WARN còn lại là của P1/pre-existing đã được SEC vòng 1 đánh giá (xem backlog).

**Tái hiện (cloud thật, user tạm — đã xóa):**

| # | Bước | Kết quả |
|---|---|---|
| A | login → GET `/rest/v1/categories` (phiên thường) | `200 [Trà trái cây]` |
| B | `update auth.sessions set created_at = now()-interval '8 days'` → GET lại | `200 []` (RLS lọc hết) |
| C | restore `created_at = now()` → GET lại | `200 [Trà trái cây]` |
| D | `grant_type=refresh_token` → GET | `200`; `session_id` **giữ nguyên**, `iat` mới, vẫn đọc được |
| E | `POST /auth/v1/logout` (xóa session) → GET bằng token cũ | `200 []`, `auth.sessions` còn `0` dòng |
| — | decode JWT thật | `session_id` có mặt; refresh không đổi `session_id` |

**Test hồi quy:** `scripts/test-p1.sh` +5 assertion (phien moi=true, phien 8 ngay=false,
session_id không tồn tại=false, hết hạn phien không đọc được menu/profiles) →
`PATH=/tmp/opencode/bin:$PATH bash scripts/test-p1.sh` → `=== KET QUA: PASS=33 FAIL=0 ===` (exit 0;
trước đó 28/28 — không assertion cũ bị bỏ).

**Bằng chứng bổ sung:** `pg_get_functiondef('private.session_fresh()'::regprocedure)` →
`SECURITY DEFINER`, `SET search_path TO ''`, nhánh `session_id` + `s.created_at > now() - interval '7 days'`;
`public.session_fresh()` → `SECURITY INVOKER`, thân chỉ `select private.session_fresh();`;
`routine_privileges` → EXECUTE bọc public: `authenticated`, `postgres`, `service_role` (không có `anon`).
Chạy lại bảng A–G **sau khi chuyển schema `private`** → cùng kết quả (A/C/D 200 có dữ liệu,
B/F `[]`, E 400, G 0 dòng).

## SEC-002 · MAJOR · GoTrue cho đổi mật khẩu không cần mật khẩu cũ (CWE-620)

**Sửa (cấu hình, không đụng code):** Management API — `PATCH /v1/projects/{ref}/config/auth`
`{"security_update_password_require_current_password": true}` → `HTTP 200`;
GET lại → `security_update_password_require_current_password = true`.
(Vòng SEC 1 báo 404 → do sai endpoint/verb; GET/PATCH cùng path với PAT này trả 200.)

**Tái hiện (cloud thật):**

| Lúc | Lệnh | Kết quả |
|---|---|---|
| Trước fix | `PUT /auth/v1/user` (Bearer access_token, `{"password":"Bypass-sec-9988"}`) | **200**, login bằng mật khẩu mới 200 |
| Sau fix | cùng lệnh (bước E trong bảng trên) | **400 `{"error_code":"current_password_required","msg":"Current password required when setting new password."}`** |

Không ảnh hưởng luồng app: EF (`change-password`, `admin-recovery`, `bootstrap-admin`,
`change-recovery-email`) đều dùng `admin.auth.admin.updateUserById` (admin API không qua flag);
src/ không gọi `updateUser`/`resetPasswordForEmail` (grep = rỗng); e2e mock tầng mạng.

## MINOR → backlog (không chặn, subagent.md §4.2)

- `SEC-003` (CWE-284): RLS chỉ đòi `session_fresh()` + signup còn mở pre-bootstrap → cửa sổ
  pre-bootstrap; tắt signup sau bootstrap (đã có guard P3-T2) + xem lại policy ở P9/P10.
- `SEC-004` (CWE-755): username chứa chuỗi SQL bị CF WAF chặn query nội bộ của EF `auth-login`
  → 500 fail-closed → bọc `getFailedCount`, coi lỗi đếm là "không đếm được → chặn".
- Advisors: `set_updated_at` thiếu `set search_path=''`; `password_hibp_enabled=false` → bật ở
  Dashboard; `GoTrue flag require_current_password` **đã bật** (hết backlog cũ).

## Cloud sau khi sửa (giữ nguyên pre-bootstrap)

`users = [t7staff@hem.local]` (user tạm đã xóa) · `sessions = 1` (của t7staff) ·
`app_meta = bootstrapped=false, admin_email=null, menu_version=1` · `categories = 7`.
Không gọi bootstrap/OTP thật; chỉ PATCH config auth (2 mục trên) + migration session_fresh.

## Chưa sửa / cần user

- `design.md §4.3` vẫn ghi "RLS … so `iat` của JWT" — cơ chế đã đổi sang `auth.sessions.created_at`
  (yêu cầu "7 ngày, server chặn cuối" giữ nguyên). **Không tự sửa design.md** → ghi `open_questions`
  chờ user duyệt wording.
