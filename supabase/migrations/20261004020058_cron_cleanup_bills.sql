-- P7-T4: pg_cron gọi Edge Function cleanup-bills hằng ngày (design §3 sơ đồ
-- "pg_cron: dọn bill > 15 ngày (gọi cleanup-bills)", §6.4 vòng đời; plan P7-T4).
--
-- Job chỉ ĐẶT LỊCH; việc xóa do EF cleanup-bills (P7-T3) làm với service_role:
-- xóa file Storage trước, xóa dòng bills/bill_items sau, KHÔNG đụng stats_*
-- (bất biến AGENT.md §11.4). Cron gọi bằng net.http_post nên không có user JWT
-- -> EF để verify_jwt=false, bảo vệ bằng CRON_SECRET (xem config.toml).

-- pg_cron = lịch (cron.schedule), pg_net = net.http_post. Cả hai đã có sẵn
-- trong catalog của Supabase, chỉ chưa bật cho project.
create extension if not exists pg_cron;

-- pg_net: cài vào schema `extensions` (không exposed qua PostgREST) thay vì
-- `public` — linter `extension_in_public` WARN nếu để public. pg_net không
-- hỗ trợ ALTER EXTENSION SET SCHEMA nên nếu đã lỡ cài ở chỗ khác phải cài lại;
-- object vẫn nằm nguyên trong schema `net` nên net.http_post không đổi chỗ.
do $$
begin
  if exists (
    select 1
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'pg_net'
       and n.nspname <> 'extensions'
  ) then
    drop extension pg_net cascade;
  end if;
end $$;

create extension if not exists pg_net with schema extensions;

-- Hàm mà job cron gọi. Trả về request_id của pg_net (0 = đã xếp hàng gửi đi).
create or replace function public.run_cleanup_bills()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_secret text;
begin
  -- Secret đọc từ vault: schema vault không nằm trong exposed schemas của
  -- PostgREST và chỉ role postgres được USAGE -> client không đọc/ghép được.
  -- Fail-closed: thiếu secret thì raise -> job lỗi ghi vào cron.job_run_details,
  -- KHÔNG bao giờ gọi EF mà không có secret (EF cũng tự 401).
  select decrypted_secret
    into v_secret
    from vault.decrypted_secrets
   where name = 'hemtra_cron_secret';
  if v_secret is null or v_secret = '' then
    raise exception 'cron secret chua duoc cau hinh (vault: hemtra_cron_secret)';
  end if;

  -- URL functions/v1 là thông tin công khai (VITE_SUPABASE_URL), không phải secret.
  return net.http_post(
    url := 'https://tsnrggxczipzqvvpcbld.supabase.co/functions/v1/cleanup-bills',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    )
  );
end;
$$;

-- Client KHÔNG được gọi trực tiếp (chỉ cron/postgres) — theo mẫu revoke của
-- next_bill_code (migrations 20261001154333). Function không lộ secret ra ngoài
-- nhưng vẫn là đường gọi server-side, thu hẹp tối đa.
revoke execute on function public.run_cleanup_bills() from public, anon, authenticated;
grant execute on function public.run_cleanup_bills() to postgres;

-- Lịch hằng ngày 00:00 UTC = 07:00 giờ VN (pg_cron chạy theo timezone của
-- server = UTC trên Supabase). Idempotent: unschedule trước rồi schedule lại
-- nên chạy migration lần nữa không sinh job trùng.
do $$
begin
  perform cron.unschedule('hemtra-cleanup-bills');
exception when others then
  null; -- lần đầu chưa có job nào để hủy
end $$;

select cron.schedule('hemtra-cleanup-bills', '0 0 * * *', 'select public.run_cleanup_bills()');
