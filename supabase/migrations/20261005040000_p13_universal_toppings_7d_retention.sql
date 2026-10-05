-- P13: Topping tự do cho mọi món chính + Giảm thời gian lưu bill xuống 7 ngày
-- 1. Default expires_at của bảng bills chuyển từ 15 ngày sang 7 ngày
alter table public.bills alter column expires_at set default (now() + interval '7 days');

-- 2. Cập nhật hàm create_bill:
-- - Không khóa cứng topping theo product_toppings (bất kỳ topping active nào đều có thể chọn cho mọi món)
-- - expires_at = v_created + interval '7 days'
create or replace function public.create_bill(
  p_client_uuid uuid,
  p_items jsonb,                       -- [{product_id, qty, note?, unit_price?, name?, toppings:[{topping_id, qty, unit_price?, name?}]}]
  p_menu_version bigint default null,  -- chi bat buoc khi online (kiem tra so voi app_meta.menu_version)
  p_is_offline boolean default false,
  p_offline_code text default null,    -- HT-YYMMDD-OFF-xxxx (client sinh khi offline)
  p_phone_note text default '',
  p_created_at timestamptz default null -- thoi diem tao bill offline (client); online bo qua
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.bills%rowtype;
  v_menu_version bigint;
  v_total bigint := 0;
  v_drift boolean := false;
  v_code text;
  v_bill_id uuid;
  v_created timestamptz;
  v_item record;
  v_topping record;
  v_prod public.products%rowtype;
  v_top public.toppings%rowtype;
  v_pid uuid;
  v_name text;
  v_price integer;
  v_qty integer;
  v_note text;
  v_main_id uuid;
  v_i integer := 0;
  v_j integer := 0;
begin
  -- === Xac minh quyen & session hop le ===
  if v_uid is null then
    raise exception 'unauthorized';
  end if;
  if not public.session_fresh() then
    raise exception 'session_expired';
  end if;

  if p_client_uuid is null then
    raise exception 'client_uuid_required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required';
  end if;
  if p_phone_note is null or length(p_phone_note) > 50 then
    raise exception 'phone_note_invalid';
  end if;

  -- === Idempotent: bill da tao (sync lai outbox) -> tra lai bill cu ===
  select * into v_existing from public.bills where client_uuid = p_client_uuid;
  if found then
    return jsonb_build_object(
      'id', v_existing.id,
      'code', v_existing.code,
      'total', v_existing.total,
      'price_drift', v_existing.price_drift,
      'duplicate', true,
      'menu_version', (select menu_version from public.app_meta where id = 1)
    );
  end if;

  -- === Rate limit (SEC-008): online toi da 10 bill/phut; offline sync toi da 60 bill/phut ===
  if not p_is_offline then
    if (select count(*) from public.bills
        where created_by = v_uid and created_at > now() - interval '1 minute') >= 10 then
      raise exception 'rate_limited';
    end if;
  else
    if (select count(*) from public.bills
        where created_by = v_uid and is_offline = true and created_at > now() - interval '1 minute') >= 60 then
      raise exception 'rate_limited';
    end if;
  end if;

  -- === Online: menu_version khong lech (lech = gia cu dang tren man hinh) ===
  if not p_is_offline then
    select menu_version into v_menu_version from public.app_meta where id = 1;
    if p_menu_version is null then
      raise exception 'menu_version_required';
    end if;
    if p_menu_version <> v_menu_version then
      raise exception 'menu_version_changed';
    end if;
  end if;

  -- === Ma bill ===
  if p_is_offline then
    if p_offline_code is null or p_offline_code !~ '^HT-[0-9]{6}-OFF-[A-Za-z0-9]{4}$' then
      raise exception 'offline_code_invalid';
    end if;
    if exists (select 1 from public.bills where code = p_offline_code) then
      raise exception 'code_exists';
    end if;
    v_code := p_offline_code;
  else
    v_code := public.next_bill_code();
  end if;

  -- === Thoi diem tao (offline giu gio goc, toi da tre 7 ngay de chong sua clock) ===
  if p_is_offline and p_created_at is not null
     and p_created_at >= now() - interval '7 days'
     and p_created_at <= now() + interval '5 minutes' then
    v_created := p_created_at;
  else
    v_created := now();
  end if;

  -- === PASS 1: tinh tong, phat hien lech gia (online khong tin gia client) ===
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item.value->>'qty')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 999 then
      raise exception 'item_qty_invalid';
    end if;
    v_note := coalesce(v_item.value->>'note', '');
    if length(v_note) > 100 then
      raise exception 'item_note_invalid';
    end if;
    if v_item.value->'toppings' is not null
       and jsonb_typeof(v_item.value->'toppings') <> 'array' then
      raise exception 'item_toppings_invalid';
    end if;
    if (v_item.value->>'product_id')::uuid is null then
      raise exception 'item_product_required';
    end if;

    select * into v_prod from public.products where id = (v_item.value->>'product_id')::uuid;

    if p_is_offline then
      -- Offline: gia/ten la snapshot cua may ban (da giao cho khach roi)
      v_price := (v_item.value->>'unit_price')::integer;
      if v_price is null or v_price < 0 then
        raise exception 'item_unit_price_required';
      end if;
      v_name := coalesce(v_item.value->>'name', v_prod.name, '');
      if btrim(v_name) = '' then
        raise exception 'item_name_required';
      end if;
      if not found or v_prod.price <> v_price then
        v_drift := true;  -- SP da xoa hoac gia da doi khi sync -> giu snapshot, go co (§8.4)
      end if;
    else
      -- Online: chi lay gia server (S14: khong tin gia client)
      if not found then
        raise exception 'product_unavailable';
      end if;
      if not v_prod.is_active then
        raise exception 'product_unavailable';
      end if;
      v_price := v_prod.price;
      v_name := v_prod.name;
    end if;

    v_total := v_total + v_qty * v_price;

    -- Toppings
    if v_item.value ? 'toppings' then
      for v_topping in select * from jsonb_array_elements(v_item.value->'toppings') loop
        v_qty := (v_topping.value->>'qty')::integer;
        if v_qty is null or v_qty < 1 or v_qty > 999 then
          raise exception 'item_qty_invalid';
        end if;
        if (v_topping.value->>'topping_id')::uuid is null then
          raise exception 'topping_required';
        end if;
        select * into v_top from public.toppings
          where id = (v_topping.value->>'topping_id')::uuid;

        if p_is_offline then
          v_price := (v_topping.value->>'unit_price')::integer;
          if v_price is null or v_price < 0 then
            raise exception 'item_unit_price_required';
          end if;
          v_name := coalesce(v_topping.value->>'name', v_top.name, '');
          if btrim(v_name) = '' then
            raise exception 'item_name_required';
          end if;
          if not found or v_top.price <> v_price then
            v_drift := true;
          end if;
        else
          if not found then
            raise exception 'topping_not_available';
          end if;
          if not v_top.is_active then
            raise exception 'topping_not_available';
          end if;
          -- P13: Topping tự do: không khóa cứng vào product_toppings
          v_price := v_top.price;
          v_name := v_top.name;
        end if;
        v_total := v_total + v_qty * v_price;
      end loop;
    end if;
  end loop;

  if v_total > 2147483647 then
    raise exception 'total_too_large';
  end if;

  -- === Tao bill (expires_at giam xuong 7 ngay) ===
  insert into public.bills
    (client_uuid, code, total, phone_note, price_drift, is_offline, created_by, created_at, expires_at)
  values
    (p_client_uuid, v_code, v_total::integer, coalesce(p_phone_note, ''), v_drift,
     p_is_offline, v_uid, v_created, v_created + interval '7 days')
  returning id into v_bill_id;

  -- === PASS 2: ghi bill_items (snapshot ten + gia) ===
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    v_j := 0;
    v_qty := (v_item.value->>'qty')::integer;
    v_note := coalesce(v_item.value->>'note', '');

    select * into v_prod from public.products where id = (v_item.value->>'product_id')::uuid;
    if p_is_offline then
      v_pid := case when found then v_prod.id else null end;  -- SP da xoa -> FK null, ten van con
      v_price := (v_item.value->>'unit_price')::integer;
      v_name := coalesce(v_item.value->>'name', v_prod.name, '');
    else
      v_pid := v_prod.id;
      v_price := v_prod.price;
      v_name := v_prod.name;
    end if;

    insert into public.bill_items
      (bill_id, product_id, parent_item_id, name_snapshot, unit_price_snapshot, qty, note, sort_order)
    values (v_bill_id, v_pid, null, v_name, v_price, v_qty, v_note, v_i * 10)
    returning id into v_main_id;

    if v_item.value ? 'toppings' then
      for v_topping in select * from jsonb_array_elements(v_item.value->'toppings') loop
        v_j := v_j + 1;
        v_qty := (v_topping.value->>'qty')::integer;
        select * into v_top from public.toppings
          where id = (v_topping.value->>'topping_id')::uuid;
        if p_is_offline then
          v_price := (v_topping.value->>'unit_price')::integer;
          v_name := coalesce(v_topping.value->>'name', v_top.name, '');
        else
          v_price := v_top.price;
          v_name := v_top.name;
        end if;
        insert into public.bill_items
          (bill_id, product_id, parent_item_id, name_snapshot, unit_price_snapshot, qty, note, sort_order)
        values (v_bill_id, null, v_main_id, v_name, v_price, v_qty, '', v_i * 10 + v_j);
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'id', v_bill_id,
    'code', v_code,
    'total', v_total::integer,
    'price_drift', v_drift,
    'duplicate', false,
    'menu_version', (select menu_version from public.app_meta where id = 1)
  );
end;
$$;
