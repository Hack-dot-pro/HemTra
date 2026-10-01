-- P1-T4: Trigger tăng menu_version + bật Realtime cho app_meta (design §5, §8)

-- === 1. menu_version: tăng mỗi khi categories/products/toppings thay đổi ===
-- Đúng 3 bảng theo design §5 (product_toppings không mang giá → không bump).
-- SECURITY DEFINER: trigger chạy theo quyền NGƯỜI GHI (staff/Edge Function).
-- Nếu là INVOKER thì UPDATE app_meta bị RLS nuốt (app_meta deny-by-default
-- tới P1-T6) → menu_version không tăng → mất cơ chế chống giá cũ.
-- An toàn: trigger function không gọi trực tiếp được (PG chặn, lỗi 0A000),
-- chỉ trigger mới gọi; nội dung duy nhất là tăng 1 counter.
create or replace function public.fn_bump_menu_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.app_meta set menu_version = menu_version + 1 where id = 1;
  return coalesce(new, old);
end;
$$;

create trigger trg_menu_version_on_categories
  after insert or update or delete on public.categories
  for each row execute function public.fn_bump_menu_version();

create trigger trg_menu_version_on_products
  after insert or update or delete on public.products
  for each row execute function public.fn_bump_menu_version();

create trigger trg_menu_version_on_toppings
  after insert or update or delete on public.toppings
  for each row execute function public.fn_bump_menu_version();

-- === 2. Sửa 2 trigger stats sang SECURITY DEFINER (cùng lý do với trên) ===
-- Trigger stats phải ghi được stats_* bất kể vai trò ghi bill là ai;
-- RLS stats_* chỉ cho đọc (P1-T6), không cho client ghi trực tiếp.
create or replace function public.fn_stats_on_bill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vn_date date;
begin
  vn_date := (new.created_at at time zone 'Asia/Ho_Chi_Minh')::date;
  insert into public.stats_daily as s (date, revenue, bill_count)
  values (vn_date, new.total, 1)
  on conflict (date) do update
    set revenue = s.revenue + excluded.revenue,
        bill_count = s.bill_count + excluded.bill_count;
  return new;
end;
$$;

create or replace function public.fn_stats_on_bill_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bill_created timestamptz;
  vn_month date;
  line_revenue bigint;
begin
  if new.product_id is null then
    return new;
  end if;

  select created_at into bill_created from public.bills where id = new.bill_id;
  if bill_created is null then
    return new;
  end if;

  vn_month := date_trunc('month', bill_created at time zone 'Asia/Ho_Chi_Minh')::date;
  line_revenue := new.qty * new.unit_price_snapshot;

  insert into public.stats_product_monthly as m (month, product_key, name, qty, revenue)
  values (vn_month, new.product_id, new.name_snapshot, new.qty, line_revenue)
  on conflict (month, product_key) do update
    set qty = m.qty + excluded.qty,
        revenue = m.revenue + excluded.revenue,
        name = excluded.name;

  insert into public.stats_product_alltime as a (product_key, name, qty, revenue)
  values (new.product_id, new.name_snapshot, new.qty, line_revenue)
  on conflict (product_key) do update
    set qty = a.qty + excluded.qty,
        revenue = a.revenue + excluded.revenue,
        name = excluded.name;

  return new;
end;
$$;

-- === 3. Realtime: thêm app_meta vào publication (client nghe menu_version) ===
-- Payload UPDATE dạng DEFAULT (PK) đủ để client phát hiện "menu_version đổi" → refetch.
-- Giao hàng realtime cho client vẫn phải qua RLS SELECT (policy ở P1-T6).
alter publication supabase_realtime add table public.app_meta;
