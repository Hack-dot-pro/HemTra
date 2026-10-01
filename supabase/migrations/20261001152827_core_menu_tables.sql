-- P1-T1: Bảng lõi — profiles, app_meta, categories, products, toppings, product_toppings
-- Nguồn: design.md §5. Quy ước: tiền số nguyên VND, thời gian timestamptz (UTC).
-- LƯU Ý: Supabase default privileges tự GRANT bảng mới cho anon/authenticated
-- (Data API exposed) → mọi bảng phải ENABLE RLS ngay lúc tạo, policy bổ sung ở P1-T6.

-- 1. profiles — 1 dòng = 1 user; id kế thừa auth.users.id
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9._-]{2,30}$'),
  display_name text not null default '',
  role text not null default 'staff' check (role in ('admin', 'staff')),
  must_change_password boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Thông tin user ứng với auth.users; role admin/staff (design §4.1)';

-- 2. app_meta — bảng 1 dòng duy nhất (id=1): bootstrapped, menu_version, schema_version
create table public.app_meta (
  id int primary key default 1 check (id = 1),
  bootstrapped boolean not null default false,
  menu_version bigint not null default 1,
  schema_version int not null default 1,
  updated_at timestamptz not null default now()
);
comment on table public.app_meta is 'Cấu hình hệ thống 1 dòng: cờ bootstrap, menu_version chống giá cũ, phiên bản schema';

-- 3. categories — nhóm sản phẩm, sắp xếp theo sort_order
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  icon text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. products — price là số nguyên VND, luôn dương
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  price integer not null check (price > 0),
  icon text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. toppings — sản phẩm phụ (trân châu, thạch...)
create table public.toppings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  price integer not null check (price > 0),
  icon text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. product_toppings — topping nào áp cho sản phẩm nào (design §5: bảng tùy chọn)
create table public.product_toppings (
  product_id uuid not null references public.products (id) on delete cascade,
  topping_id uuid not null references public.toppings (id) on delete cascade,
  primary key (product_id, topping_id)
);

-- Index theo best practices (fk + truy vấn lặp)
create index idx_products_category_id on public.products (category_id);
create index idx_product_toppings_topping_id on public.product_toppings (topping_id);
create index idx_categories_sort_order on public.categories (sort_order);

-- Trigger updated_at tự cập nhật (menu_version trigger đến ở P1-T4)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger trg_products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger trg_toppings_set_updated_at
  before update on public.toppings
  for each row execute function public.set_updated_at();

create trigger trg_app_meta_set_updated_at
  before update on public.app_meta
  for each row execute function public.set_updated_at();

-- ENABLE RLS NGAY: bảng đã bị default privileges cấp cho anon/authenticated (Data API),
-- deny-by-default tới khi P1-T6 viết policy.
alter table public.profiles enable row level security;
alter table public.app_meta enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.toppings enable row level security;
alter table public.product_toppings enable row level security;

-- Dòng app_meta duy nhất (không seed menu — chỉ môi trường dev ở P1-T9)
insert into public.app_meta (id) values (1)
on conflict (id) do nothing;
