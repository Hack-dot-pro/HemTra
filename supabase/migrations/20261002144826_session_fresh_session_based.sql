-- SEC-001 (P3, security-audit vòng 1): session_fresh() hết hạn theo PHIÊN SERVER.
--
-- Vấn đề: refresh token cấp iat MỚI (đo được trên cloud: iat2 - iat1 = thời gian chờ
--   refresh, now - iat2 = 0s) → so iat không còn là mốc bắt đầu phiên → lớp server của
--   "phiên tối đa 7 ngày" (AGENT.md §11.6, design §4.3) mất hiệu lực; client bị sửa
--   (autoRefreshToken:true) giữ được phiên VÔ HẠN.
-- Cách sửa: mốc 7 ngày = auth.sessions.created_at của phiên trong claim session_id
--   (refresh giữ nguyên session_id — đã đo: iat nhảy, session_id không đổi).
--   Token không có session_id (claim legacy / bộ test giả lập claim) → giữ kiểm tra iat.
--   Session bị xóa (đăng xuất, thay phiên) → token mất quyền ngay (side effect tốt).
--
-- SECURITY DEFINER đặt ở schema KHÔNG expose `private` (advisor 0029
--   authenticated_security_definer_function_executable): `private` không thuộc exposed
--   schema của PostgREST → không gọi được qua /rest/v1/rpc. `public.session_fresh`
--   chỉ là bọc SECURITY INVOKER (mặc định) để 12 policy + test không phải đổi chỗ gọi.
create schema if not exists private;

create or replace function private.session_fresh()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(current_setting('request.jwt.claims', true), '') in ('', '{}')
      then false
    when (current_setting('request.jwt.claims', true)::jsonb ->> 'session_id') is not null
      then exists (
        select 1
        from auth.sessions s
        where s.id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'session_id')
          and s.user_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
          and s.created_at > now() - interval '7 days'
      )
    else coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'iat')::bigint, 0)
         > extract(epoch from now())::bigint - 7 * 24 * 3600
  end;
$$;

-- Bọc public: SECURITY INVOKER (mặc định) — chỉ ủy quyền sang bản private.
create or replace function public.session_fresh()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.session_fresh();
$$;

-- ACL: policy của authenticated gọi qua bọc public; anon/không role không dùng
-- (rls_policies:76-77). Schema private cần USAGE để EXECUTE có hiệu lực.
grant usage on schema private to authenticated;
grant execute on function private.session_fresh() to authenticated;
revoke execute on function public.session_fresh() from public, anon;
grant execute on function public.session_fresh() to authenticated;
