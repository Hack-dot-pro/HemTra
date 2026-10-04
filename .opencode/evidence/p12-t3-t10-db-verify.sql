drop table if exists public._p12_scratch;
create table public._p12_scratch (k text primary key, v text);

insert into public._p12_scratch
select '01_trigger_product_toppings', coalesce(string_agg(tgname, ','), 'NONE')
  from pg_trigger where tgrelid = 'public.product_toppings'::regclass and not tgisinternal;

insert into public._p12_scratch
select '02_exec_authenticated', has_function_privilege('authenticated', 'public.admin_delete_bill(uuid)', 'EXECUTE')::text;

insert into public._p12_scratch
select '03_exec_service_role', has_function_privilege('service_role', 'public.admin_delete_bill(uuid)', 'EXECUTE')::text;

insert into public._p12_scratch
select '04_menu_version_before', (select menu_version from public.app_meta where id = 1)::text;

insert into public._p12_scratch
select '05_daily_before', coalesce((select revenue || '/' || bill_count from public.stats_daily where date = '2030-01-05'), 'NONE');

insert into public._p12_scratch
select '06_monthly_before', coalesce((select qty || '/' || revenue from public.stats_product_monthly
  where month = '2030-01-01' and product_key = (select id from public.products order by id limit 1)), 'NONE');

insert into public._p12_scratch
select '07_alltime_before', coalesce((select qty || '/' || revenue from public.stats_product_alltime
  where product_key = (select id from public.products order by id limit 1)), 'NONE');

insert into public.product_toppings (product_id, topping_id)
select p.id, t.id from public.products p cross join public.toppings t limit 1
on conflict do nothing;

insert into public._p12_scratch
select '08_menu_version_after_link', (select menu_version from public.app_meta where id = 1)::text;

insert into public.bills (id, client_uuid, code, total, created_at)
values ('00000000-0000-4000-8000-000000000099', gen_random_uuid(), 'HT-990101-TEST1', 50000, '2030-01-05T04:00:00Z');

insert into public.bill_items (bill_id, product_id, name_snapshot, unit_price_snapshot, qty)
select '00000000-0000-4000-8000-000000000099', id, 'P12 TEST', 25000, 2
  from public.products order by id limit 1;

insert into public._p12_scratch
select '09_daily_after_insert', coalesce((select revenue || '/' || bill_count from public.stats_daily where date = '2030-01-05'), 'NONE');

insert into public._p12_scratch
select '10_monthly_after_insert', coalesce((select qty || '/' || revenue from public.stats_product_monthly
  where month = '2030-01-01' and product_key = (select id from public.products order by id limit 1)), 'NONE');

insert into public._p12_scratch
select '11_alltime_after_insert', coalesce((select qty || '/' || revenue from public.stats_product_alltime
  where product_key = (select id from public.products order by id limit 1)), 'NONE');

insert into public._p12_scratch
select '12_rpc_result', public.admin_delete_bill('00000000-0000-4000-8000-000000000099')::text;

insert into public._p12_scratch
select '13_bill_rows_after_rpc', (select count(*)::text from public.bills where id = '00000000-0000-4000-8000-000000000099');

insert into public._p12_scratch
select '14_bill_items_after_rpc', (select count(*)::text from public.bill_items where bill_id = '00000000-0000-4000-8000-000000000099');

insert into public._p12_scratch
select '15_daily_after_rpc', coalesce((select revenue || '/' || bill_count from public.stats_daily where date = '2030-01-05'), 'NONE');

insert into public._p12_scratch
select '16_monthly_after_rpc', coalesce((select qty || '/' || revenue from public.stats_product_monthly
  where month = '2030-01-01' and product_key = (select id from public.products order by id limit 1)), 'NONE');

insert into public._p12_scratch
select '17_alltime_after_rpc', coalesce((select qty || '/' || revenue from public.stats_product_alltime
  where product_key = (select id from public.products order by id limit 1)), 'NONE');

delete from public.product_toppings
where product_id = (select id from public.products order by id limit 1)
  and topping_id = (select id from public.toppings order by id limit 1);

update public.app_meta
   set menu_version = (select cast(v as int) from public._p12_scratch where k = '04_menu_version_before')
 where id = 1;

delete from public.stats_daily
 where date = '2030-01-05' and revenue = 0 and bill_count = 0
   and (select v from public._p12_scratch where k = '05_daily_before') = 'NONE';

insert into public._p12_scratch
select '18_menu_version_restored', (select menu_version from public.app_meta where id = 1)::text;

insert into public._p12_scratch
select '19_leftover_test_bill', (select count(*)::text from public.bills where code = 'HT-990101-TEST1');

insert into public._p12_scratch
select '20_leftover_scratch_daily', coalesce((select revenue || '/' || bill_count from public.stats_daily where date = '2030-01-05'), 'NONE');

select k, v from public._p12_scratch order by k;
drop table public._p12_scratch;
