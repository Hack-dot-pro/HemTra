-- P12-T2 — dọn dữ liệu mẫu / sót lại của quá trình test (cloud project tsnrggxczipzqvvpcbld).
-- Chạy: npx supabase db query --linked -f .opencode/evidence/p12-t2-cleanup.sql
--
-- CÁC PHÁT HIỆN (audit 2026-10-04 — xem p12-t2-sample-data-audit.md):
--   1) stats_daily 2026-10-04 = 595.000₫ / 23 bill nhưng bảng `bills` chỉ còn 3 bill
--      (95.000₫) — số liệu từ bill bị xóa TRƯỚC khi có RPC admin_delete_bill (P12-T10).
--   2) stats_product_* còn "Bia hơi" 21 qty / 525.000₫ — SP đã bị xóa khỏi menu.
--   3) Ảnh mồ côi `bills/2026/10/HT-261001-0004.png` (bill không còn).
--   4) auth user tạm `p12t9-otp-test@example.com` sót từ khi test EF (xóa ở ngoài SQL).
--   5) login_attempts còn 9 dòng lockout cũ (EF tự dọn theo 15 phút, dọn luôn).
--
-- Cách sửa: TÍNH LẠI stats từ bills + bill_items còn sống (đúng ngữ nghĩa trigger
-- fn_stats_on_bill / fn_stats_on_bill_item); dòng món đã bị xóa SP (product_id null)
-- giữ product_key từ stats cũ theo tên (design §5: "SP xóa stats vẫn còn").

begin;

-- 1) Lưu stats cũ để lấy product_key cho món không còn product_id.
create temp table old_monthly on commit drop as select * from public.stats_product_monthly;
create temp table old_alltime on commit drop as select * from public.stats_product_alltime;

truncate public.stats_daily, public.stats_product_monthly, public.stats_product_alltime;

-- 2) stats_daily = sum(total) + đếm bill theo NGÀY GIỜ VN (khớp trigger).
insert into public.stats_daily (date, revenue, bill_count)
select (b.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
       sum(b.total)::bigint,
       count(*)::int
from public.bills b
group by 1;

-- 3) stats sản phẩm — dòng có product_id.
insert into public.stats_product_monthly (month, product_key, name, qty, revenue)
select date_trunc('month', b.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
       i.product_id, max(i.name_snapshot),
       sum(i.qty)::bigint, (sum(i.qty * i.unit_price_snapshot))::bigint
from public.bill_items i
join public.bills b on b.id = i.bill_id
where i.product_id is not null
group by 1, i.product_id;

insert into public.stats_product_alltime (product_key, name, qty, revenue)
select i.product_id, max(i.name_snapshot),
       sum(i.qty)::bigint, (sum(i.qty * i.unit_price_snapshot))::bigint
from public.bill_items i
where i.product_id is not null
group by i.product_id;

-- 4) Dòng món có SP đã xóa (product_id null) — ghép lại product_key theo tên
--    với stats CŨ (chỉ khi bill còn sống → qty/revenue lấy từ bill đó).
insert into public.stats_product_monthly (month, product_key, name, qty, revenue)
select date_trunc('month', b.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
       o.product_key, i.name_snapshot,
       sum(i.qty)::bigint, (sum(i.qty * i.unit_price_snapshot))::bigint
from public.bill_items i
join public.bills b on b.id = i.bill_id
join old_alltime o on o.name = i.name_snapshot
where i.product_id is null
group by 1, o.product_key, i.name_snapshot;

insert into public.stats_product_alltime (product_key, name, qty, revenue)
select o.product_key, i.name_snapshot,
       sum(i.qty)::bigint, (sum(i.qty * i.unit_price_snapshot))::bigint
from public.bill_items i
join old_alltime o on o.name = i.name_snapshot
where i.product_id is null
group by o.product_key, i.name_snapshot;

-- 5) Bảng kiểm chứng (db query chỉ hiển thị bảng CUỐI của multi-statement).
select 'stats_daily' as bang, count(*)::text as dong,
       coalesce(sum(revenue), 0)::text as revenue,
       coalesce(sum(bill_count), 0)::text as qty_or_count
from public.stats_daily
union all
select 'stats_product_monthly', count(*)::text, coalesce(sum(revenue), 0)::text,
       coalesce(sum(qty), 0)::text
from public.stats_product_monthly
union all
select 'stats_product_alltime', count(*)::text, coalesce(sum(revenue), 0)::text,
       coalesce(sum(qty), 0)::text
from public.stats_product_alltime
union all
select 'bills(cong tham chieu)', count(*)::text, coalesce(sum(total), 0)::text, ''
from public.bills;

commit;
