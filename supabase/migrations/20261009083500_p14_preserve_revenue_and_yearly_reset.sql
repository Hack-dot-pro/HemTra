-- P14-T1 & P14-T2: Bảo toàn dữ liệu doanh thu & Tự động reset định kỳ hằng năm
-- 1. Cập nhật hàm admin_delete_bill: loại bỏ xóa vét cạn toàn bộ stats để tránh mất doanh thu khi bill cũ đã tự dọn sau 7 ngày
-- 2. Tạo hàm reset_yearly_revenue và lên lịch pg_cron chạy vào 00:00 UTC ngày 01/02 hằng năm

-- ============================================================================
-- 1. admin_delete_bill (P14-T1)
-- ============================================================================
create or replace function public.admin_delete_bill(p_bill_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill record;
  v_date date;
  v_month date;
  v_item record;
  v_rows integer;
begin
  select id, code, total, created_at
    into v_bill
    from public.bills
   where id = p_bill_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'bill_not_found');
  end if;

  v_date := (v_bill.created_at at time zone 'Asia/Ho_Chi_Minh')::date;
  v_month := date_trunc('month', v_bill.created_at at time zone 'Asia/Ho_Chi_Minh')::date;

  -- 1) Trừ thống kê theo sản phẩm
  for v_item in
    select product_id, qty, unit_price_snapshot
      from public.bill_items
     where bill_id = p_bill_id
       and product_id is not null
  loop
    update public.stats_product_monthly
       set qty = qty - v_item.qty,
           revenue = revenue - v_item.qty * v_item.unit_price_snapshot
     where month = v_month
       and product_key = v_item.product_id;

    update public.stats_product_alltime
       set qty = qty - v_item.qty,
           revenue = revenue - v_item.qty * v_item.unit_price_snapshot
     where product_key = v_item.product_id;

    delete from public.stats_product_monthly
     where month = v_month
       and product_key = v_item.product_id
       and (qty <= 0 or revenue <= 0);

    delete from public.stats_product_alltime
     where product_key = v_item.product_id
       and (qty <= 0 or revenue <= 0);
  end loop;

  -- 2) Trừ doanh thu + số bill ngày
  update public.stats_daily
     set revenue = revenue - v_bill.total,
         bill_count = bill_count - 1
   where date = v_date;

  delete from public.stats_daily
   where date = v_date
     and (revenue <= 0 or bill_count <= 0);

  -- 3) Xóa bill (bill_items cascade on delete bill_id)
  delete from public.bills
   where id = p_bill_id;
  get diagnostics v_rows = row_count;

  -- Lưu ý: Không kiểm tra "not exists in bills" để xóa stats cả tháng/năm,
  -- vì các bill cũ hơn 7 ngày đã được tự động dọn dẹp để giảm tải Storage.

  return jsonb_build_object(
    'ok', true,
    'code', v_bill.code,
    'total', v_bill.total,
    'date', v_date,
    'rows', v_rows
  );
end;
$$;

revoke execute on function public.admin_delete_bill(uuid) from public, anon;
grant execute on function public.admin_delete_bill(uuid) to service_role, authenticated;

-- ============================================================================
-- 2. reset_yearly_revenue & pg_cron (P14-T2)
-- ============================================================================
create or replace function public.reset_yearly_revenue()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff_date date;
  v_daily_deleted integer := 0;
  v_monthly_deleted integer := 0;
begin
  -- Mốc chốt: Ngày đầu tiên của năm hiện tại (Asia/Ho_Chi_Minh).
  -- Khi chạy vào ngày 01/02 hàng năm (sau khi tháng 1 kết thúc),
  -- v_cutoff_date sẽ là ngày 01/01 của năm hiện tại.
  -- Dọn dẹp dữ liệu của năm trước đó (< v_cutoff_date) để làm sạch hệ thống,
  -- đảm bảo hệ thống chỉ giữ trọn vẹn dữ liệu từ ngày 01/01 của năm mới.
  v_cutoff_date := (date_trunc('year', now() at time zone 'Asia/Ho_Chi_Minh'))::date;

  -- 1) Xóa stats_daily cũ trước năm hiện tại
  delete from public.stats_daily
   where date < v_cutoff_date;
  get diagnostics v_daily_deleted = row_count;

  -- 2) Xóa stats_product_monthly cũ trước năm hiện tại
  delete from public.stats_product_monthly
   where month < v_cutoff_date;
  get diagnostics v_monthly_deleted = row_count;

  -- 3) Đồng bộ lại stats_product_alltime theo phạm vi dữ liệu còn lại
  delete from public.stats_product_alltime where true;
  insert into public.stats_product_alltime (product_key, name, qty, revenue)
  select product_key, name, sum(qty), sum(revenue)
    from public.stats_product_monthly
   group by product_key, name;

  return jsonb_build_object(
    'ok', true,
    'cutoff_date', v_cutoff_date,
    'daily_deleted', v_daily_deleted,
    'monthly_deleted', v_monthly_deleted
  );
end;
$$;

revoke execute on function public.reset_yearly_revenue() from public, anon, authenticated;
grant execute on function public.reset_yearly_revenue() to postgres, service_role;

-- Lên lịch chạy vào 00:00 UTC ngày 01/02 hàng năm (07:00 sáng giờ VN sau khi hết tháng 1)
do $$
begin
  perform cron.unschedule('hemtra-yearly-revenue-reset');
exception when others then
  null;
end $$;

select cron.schedule(
  'hemtra-yearly-revenue-reset',
  '0 0 1 2 *',
  'select public.reset_yearly_revenue()'
);
