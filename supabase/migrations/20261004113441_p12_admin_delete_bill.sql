-- P12-T10: RPC xóa bill thủ công BY ADMIN (quyết định user 2026-10-04 — xem
-- state.json → decisions.p12_user_requests_2026_10_04).
-- Khác với job cleanup-bills (P7: KHÔNG đụng stats_*), xóa bill thủ công được
-- user chọn là TRỪ thống kê tương ứng ở Dashboard (stats_daily, stats_product_monthly,
-- stats_product_alltime) — đối xứng đúng với trigger INSERT trg_stats_on_bill /
-- trg_stats_on_bill_item.
-- Bảo mật: SECURITY DEFINER + search_path = '' (mẫu backend skill §5);
-- CHỈ service_role gọi được (EF delete-bills đã xác thực admin + mật khẩu server-side),
-- revoke toàn bộ khỏi public/anon/authenticated để client không gọi trực tiếp.
-- Trigger stats chỉ chạy AFTER INSERT → xóa dòng không tự trừ → phải trừ ở đây.

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

  -- 1) Trừ thống kê theo sản phẩm (chỉ dòng có product_id — đúng như trigger INSERT
  --    đã bỏ qua dòng topping/product_id null). Đối xứng: qty/revenue giảm đúng số đã cộng.
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

    -- Không còn lượt bán nào của SP trong tháng/all-time → xóa dòng (tránh rank % âm).
    delete from public.stats_product_monthly
     where month = v_month
       and product_key = v_item.product_id
       and qty <= 0;

    delete from public.stats_product_alltime
     where product_key = v_item.product_id
       and qty <= 0;
  end loop;

  -- 2) Trừ doanh thu + số bill ngày (stats_daily là nguồn KPI/Chart A).
  update public.stats_daily
     set revenue = revenue - v_bill.total,
         bill_count = bill_count - 1
   where date = v_date;

  -- 3) Xóa bill (bill_items cascade on delete bill_id).
  delete from public.bills
   where id = p_bill_id;
  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'code', v_bill.code,
    'total', v_bill.total,
    'date', v_date,
    'rows', v_rows
  );
end;
$$;

-- Chỉ service_role (Edge Function) gọi được; client không có EXECUTE.
revoke execute on function public.admin_delete_bill(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_bill(uuid) to service_role;
