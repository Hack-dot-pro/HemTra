-- Fix DELETE requires a WHERE clause under safeupdate and grant execute to authenticated
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

  -- 4) Kiểm tra vét cạn: nếu không còn bill nào trên hệ thống -> reset toàn bộ stats
  -- WHERE true bắt buộc để tuân thủ Postgres safeupdate
  if not exists (select 1 from public.bills limit 1) then
    delete from public.stats_daily where true;
    delete from public.stats_product_monthly where true;
    delete from public.stats_product_alltime where true;
  elsif not exists (
    select 1 from public.bills
     where (created_at at time zone 'Asia/Ho_Chi_Minh')::date >= v_month
       and (created_at at time zone 'Asia/Ho_Chi_Minh')::date < (v_month + interval '1 month')::date
     limit 1
  ) then
    -- Không còn bill nào trong tháng -> xóa toàn bộ thống kê tháng đó
    delete from public.stats_product_monthly where month = v_month;
  end if;

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
