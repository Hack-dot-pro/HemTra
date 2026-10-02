-- P3-T2: Them app_meta.admin_email — email admin goc, chi service_role doc/ghi
-- (design §5, §4.4: key cho luong khôi phục / doi key admin)
alter table public.app_meta add column admin_email text;

comment on column public.app_meta.admin_email is
  'Email admin goc (chung minh quyen so huu — §4.4). Chi service_role doc/ghi, khong grant cho anon/authenticated.';

-- authenticated hien dang co grant SELECT table-level tren app_meta
-- (supabase/migrations/20261001154825_rls_policies.sql §2) → neu de nguyen thi
-- admin_email se bi lo cho client. Thu hoi, cap lai column-level tru admin_email.
revoke select on public.app_meta from authenticated;
grant select (id, bootstrapped, menu_version, schema_version, updated_at)
  on public.app_meta to authenticated;

-- anon: khong doi — da la column-level (id, bootstrapped, menu_version),
-- admin_email khong thuoc grant nen khong doc duoc.
-- service_role: van duoc toan quyen qua default privileges cua Supabase (EF dung).
