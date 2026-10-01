-- P1-T5: Hàm lõi — next_bill_code(), session_fresh(), is_admin() (design §4.3, §6.2, P1-T5)

-- === 1. Bảng đếm số bill theo ngày (nguyên tử, chống trùng mã HT-YYMMDD-0001) ===
create table public.bill_code_counters (
  day date primary key,
  seq integer not null check (seq > 0),
  created_at timestamptz not null default now()
);

-- RLS deny-by-default: client KHÔNG được đọc/ghi trực tiếp (chỉ qua next_bill_code definer)
alter table public.bill_code_counters enable row level security;

-- === 2. next_bill_code(): cấp mã HT-YYMMDD-0001, reset mỗi ngày theo VN ===
-- SECURITY DEFINER: gọi từ create_bill (definer) — kế thừa ngữ cảnh definer,
-- counter table không có policy cho client.
-- QUYẾT ĐỊNH: revoke execute khỏi PUBLIC/anon/authenticated — client KHÔNG gọi
-- trực tiếp (gọi trực tiếp sẽ làm TRỐNG số: client lấy mã rồi không tạo bill →
-- số nhảy cóc, khách nhìn bill thiếu số). Chỉ create_bill (definer, owner
-- postgres) mới gọi được → mọi mã đều đi kèm bill thật.
create or replace function public.next_bill_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  vn_day date;
  next_seq integer;
begin
  vn_day := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  insert into public.bill_code_counters as c (day, seq)
  values (vn_day, 1)
  on conflict (day) do update set seq = c.seq + 1
  returning seq into next_seq;
  return 'HT-' || to_char(vn_day, 'YYMMDD') || '-' || lpad(next_seq::text, 4, '0');
end;
$$;

revoke execute on function public.next_bill_code() from public, anon, authenticated;

-- === 3. session_fresh(): JWT cũ ≤ 7 ngày (design §4.3: hết hạn → mất quyền) ===
-- SECURITY INVOKER (mặc định): không đụng bảng, chỉ đọc claim iat của request
-- hiện tại → an toàn khi dùng trong RLS policy (không có đường bypass bảng).
create or replace function public.session_fresh()
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when current_setting('request.jwt.claims', true) is null
      or current_setting('request.jwt.claims', true) = ''
      or current_setting('request.jwt.claims', true) = '{}'
    then false
    else extract(epoch from now())
           - (current_setting('request.jwt.claims', true)::jsonb ->> 'iat')::bigint
         < 7 * 24 * 3600
  end;
$$;

-- === 4. is_admin(): đọc role từ profiles, DEF để tránh đệ quy RLS (profiles → is_admin → profiles) ===
-- Dùng trong policy & P9-T5 test; chính bản thân nó không bypass được gì (chỉ trả boolean).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

grant execute on function public.session_fresh() to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
