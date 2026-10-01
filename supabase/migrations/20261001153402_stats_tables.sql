-- P1-T3: Bảng thống kê VĨNH VIỄN + trigger cập nhật khi chèn bill (design §5)
-- Bất biến AGENT.md §11.4: bill bị dọn sau 15 ngày nhưng stats_* không được mất
-- → stats độc lập, KHÔNG FK cascade sang bills.
-- Múi giờ nghiệp vụ Asia/Ho_Chi_Minh (AGENT §10): ngày/tháng thống kê theo giờ VN.

create table public.stats_daily (
  date date primary key,                 -- ngày theo Asia/Ho_Chi_Minh
  revenue bigint not null default 0,     -- tổng tất cả bill (kể cả topping)
  bill_count int not null default 0
);

create table public.stats_product_monthly (
  month date not null,                   -- ngày đầu tháng theo giờ VN
  product_key uuid not null,             -- = products.id tại thời điểm bán (không FK: SP xóa stats vẫn còn)
  name text not null,                    -- snapshot tên khi bán
  qty bigint not null default 0,
  revenue bigint not null default 0,
  primary key (month, product_key)
);

create table public.stats_product_alltime (
  product_key uuid primary key,
  name text not null,
  qty bigint not null default 0,
  revenue bigint not null default 0
);

create index idx_stats_product_monthly_month on public.stats_product_monthly (month);
create index idx_stats_product_monthly_qty on public.stats_product_monthly (month, qty desc);

-- === Trigger 1: INSERT bills → stats_daily (ngày VN) ===
create or replace function public.fn_stats_on_bill()
returns trigger
language plpgsql
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

create trigger trg_stats_on_bill
  after insert on public.bills
  for each row execute function public.fn_stats_on_bill();

-- === Trigger 2: INSERT bill_items → stats_product_monthly + alltime ===
-- Dòng topping (product_id null) không tính vào bảng sản phẩm (doanh thu topping
-- đã nằm trong bills.total → stats_daily).
create or replace function public.fn_stats_on_bill_item()
returns trigger
language plpgsql
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
    return new; -- không xảy ra (FK), nhưng an toàn
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

create trigger trg_stats_on_bill_item
  after insert on public.bill_items
  for each row execute function public.fn_stats_on_bill_item();

-- RLS deny-by-default; policy đọc cho admin/staff ở P1-T6
alter table public.stats_daily enable row level security;
alter table public.stats_product_monthly enable row level security;
alter table public.stats_product_alltime enable row level security;
