-- P1-T2: Bảng bills, bill_items, login_attempts
-- Nguồn: design.md §5, §6 (mã bill, vòng đời), §8.4 (price_drift).
-- Bill giữ SNAPSHOT tên + giá (bất biến AGENT.md §11.5); product_id nullable,
-- xóa SP không mất dữ liệu bill cũ (on delete set null).

-- 1. bills — không có cờ xóa; cleanup 15 ngày qua job (P7), không xóa từ client
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,                -- idempotent khi sync outbox (design §8.4)
  code text not null unique,                        -- HT-YYMMDD-0001 | HT-YYMMDD-OFF-xxxx
  total integer not null default 0 check (total >= 0),
  phone_note text not null default '',
  image_path text not null default '',              -- bills/YYYY/MM/<code>.png (upload sau)
  price_drift boolean not null default false,       -- lệch giá khi sync — admin thấy (§8.4)
  is_offline boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 days') -- tự dọn sau 15 ngày
);

-- 2. bill_items — snapshot giá tại thời điểm bán; topping là dòng con qua parent_item_id
create table public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  parent_item_id uuid references public.bill_items (id) on delete cascade, -- topping thuộc món
  name_snapshot text not null check (btrim(name_snapshot) <> ''),
  unit_price_snapshot integer not null default 0 check (unit_price_snapshot >= 0),
  qty integer not null check (qty > 0),
  note text not null default '',
  sort_order int not null default 0                 -- thứ tự render ổn định (BillSheet)
);

-- 3. login_attempts — phục vụ lockout 5 lần/15 phút theo username+IP (P3-T4)
create table public.login_attempts (
  id bigint generated always as identity primary key,
  username text not null,                           -- không FK: phải ghi cả username không tồn tại
  ip inet not null,
  success boolean not null,
  at timestamptz not null default now()
);

-- Index (best practices: fk + truy vấn nghiệp vụ)
create index idx_bills_created_at on public.bills (created_at desc);
create index idx_bills_created_by on public.bills (created_by);
create index idx_bills_expires_at on public.bills (expires_at);  -- job cleanup: where expires_at <= now()
create index idx_bill_items_bill_id on public.bill_items (bill_id);
create index idx_bill_items_parent on public.bill_items (parent_item_id) where parent_item_id is not null;
create index idx_bill_items_product_id on public.bill_items (product_id);
create index idx_login_attempts_username_at on public.login_attempts (username, at desc);
create index idx_login_attempts_ip_at on public.login_attempts (ip, at desc);

-- RLS deny-by-default (default privileges đã cấp anon/authenticated → policy ở P1-T6;
-- login_attempts chỉ ghi qua service_role/Edge Function, không đọc từ client)
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.login_attempts enable row level security;
