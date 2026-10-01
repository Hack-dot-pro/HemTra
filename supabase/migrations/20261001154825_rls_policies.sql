-- P1-T6: RLS + policy cho MỌI bảng theo ma tran quyen (design §4.1, §4.3)
-- Nguyen tac: grant MINIMUM (khong ghi default-privilege ngầm), policy deny-by-default,
-- moi doc/ghi deu qua session_fresh() (het han 7 ngay = mat quyen), ghi bang he
-- thong/audit chi bang service_role (EF) — client khong co quyen ghi.

-- === 1. Quyen: anon ===
-- anon chi doc 2 cot app_meta (man hinh setup dang ky truoc khi co tai khoan:
-- bootstrapped + menu_version). Con lai: khong gi.
revoke all on all tables in schema public from anon;
grant select (id, bootstrapped, menu_version) on public.app_meta to anon;

-- === 2. Quyen: authenticated ===
-- Bang MENU: doc/ghi duoc (staff CRUD §4.1) — khong TRUNCATE/TRIGGER (RLS khong
-- dieu tiet duoc TRUNCATE nen phai revoke rieng).
revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete
  on public.categories, public.products, public.toppings, public.product_toppings
  to authenticated;

-- Bang chi DOC (ghi/audit di qua EF service_role; bills/stats ghi bang trigger definer):
grant select
  on public.app_meta, public.profiles, public.bills, public.bill_items,
     public.stats_daily, public.stats_product_monthly, public.stats_product_alltime
  to authenticated;
-- login_attempts + bill_code_counters: khong quyen gi (EF / next_bill_code definer).

-- Tuong lai: doi moi bang vao public deu khong nhan quyen ngầm — phai grant ro rang.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- === 3. Policy ===
-- app_meta: public thong (anon setup screen + staff doc menu_version, realtime changed)
create policy "app_meta_read" on public.app_meta
  for select to anon, authenticated using (true);

-- Menu (4 bang): staff session con han — doc + ghi
create policy "categories_staff_all" on public.categories
  for all to authenticated using (session_fresh()) with check (session_fresh());
create policy "products_staff_all" on public.products
  for all to authenticated using (session_fresh()) with check (session_fresh());
create policy "toppings_staff_all" on public.toppings
  for all to authenticated using (session_fresh()) with check (session_fresh());
create policy "product_toppings_staff_all" on public.product_toppings
  for all to authenticated using (session_fresh()) with check (session_fresh());

-- profiles: danh sach user doc duoc boi moi staff session con han (§4.1).
-- Khong co insert/update/delete policy: tao/sua/xoa user di qua admin-users EF
-- (service_role); mat khau di qua auth API. Grant chi select (xem §2).
create policy "profiles_read" on public.profiles
  for select to authenticated using (session_fresh());

-- bills + bill_items: doc danh sach/chi tiet. Ghi/chi tiet CHI qua create_bill (definer)
-- → khong co insert/update/delete policy = client bat buoc goi RPC (tinh lai gia S14).
create policy "bills_read" on public.bills
  for select to authenticated using (session_fresh());
create policy "bill_items_read" on public.bill_items
  for select to authenticated using (session_fresh());

-- stats_*: chi doc (ghi bang trigger definer)
create policy "stats_daily_read" on public.stats_daily
  for select to authenticated using (session_fresh());
create policy "stats_product_monthly_read" on public.stats_product_monthly
  for select to authenticated using (session_fresh());
create policy "stats_product_alltime_read" on public.stats_product_alltime
  for select to authenticated using (session_fresh());

-- login_attempts + bill_code_counters: khong policy → deny moi phep (client khong quyen).

-- === 4. Function: thu hoi quyen execute khong can thiet ===
-- Trigger function: client khong goi truc tiep duoc (PG chan 0A000) — revoke cho sach,
-- trigger van chay (kiem tra tay sau khi push).
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.fn_bump_menu_version() from public, anon, authenticated;
revoke execute on function public.fn_stats_on_bill() from public, anon, authenticated;
revoke execute on function public.fn_stats_on_bill_item() from public, anon, authenticated;
-- session_fresh: chi authenticated (dung trong policy); is_admin: chi authenticated.
revoke execute on function public.session_fresh() from public, anon;
grant execute on function public.session_fresh() to authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
-- next_bill_code da revoke toan bo o T5 (chi create_bill definer goi).
