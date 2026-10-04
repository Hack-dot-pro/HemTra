-- P7-T2 bổ sung (SEC P7 · NV5): gắn `bills.image_path` sau khi upload PNG thành công.
-- Trước đây không code nào ghi cột này → luôn '' → nút "Xem ảnh" ở menu Quản lý bill
-- không bao giờ hiện với bill thật (chỉ test fixture mới set được).
-- Bảng `bills` chỉ có policy SELECT (không UPDATE, design §4.1) nên phải qua
-- SECURITY DEFINER + search_path = '' nhưng CHỈ nhận đường dẫn đúng mẫu
-- `YYYY/MM/<mã bill này>.png` và CHỈ khi bill chưa có ảnh → idempotent khi outbox retry.

create or replace function public.set_bill_image(p_code text, p_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_image_path text;
  v_updated integer;
begin
  if p_code is null or p_code = '' then
    raise exception 'set_bill_image: p_code trong';
  end if;
  if p_path is null or p_path = '' then
    raise exception 'set_bill_image: p_path trong';
  end if;

  select id, code, image_path into v_id, v_code, v_image_path
    from public.bills
   where code = p_code;

  if v_id is null then
    raise exception 'set_bill_image: khong tim thay bill %', p_code;
  end if;

  if v_image_path <> '' then
    return false; -- đã gắn từ lần retry trước → không ghi đè
  end if;

  if p_path !~ ('^[0-9]{4}/[0-9]{2}/' || v_code || '\.png$') then
    raise exception 'set_bill_image: duong dan khong khop ma bill %', p_code;
  end if;

  update public.bills
     set image_path = p_path
   where id = v_id
     and image_path = '';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.set_bill_image(text, text) from public, anon;
grant execute on function public.set_bill_image(text, text) to authenticated;
