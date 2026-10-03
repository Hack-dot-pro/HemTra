#!/usr/bin/env bash
# P1-T10: Bo test SQL cho phase P1 — chay tren DB linked (thay the `supabase test db`
# bi loi vi `supabase start` khong ket noi duoc network trong sandbox — xem state.json B-001).
# Moi assertion tra ve marker OK:/BAD: de grep. Script tu don du lieu test cuoi cung.
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

SUB="e666cb8a-d503-4baf-bfd7-3f04d4d6a99d"   # t7staff profile id = auth.uid()
NOW_IAT=$(date +%s)
OLD_IAT=$((NOW_IAT - 8 * 86400))
PASS=0; FAIL=0
FIX_CAT="aaaaaaaa-0000-4000-8000-0000000000f1"
FIX_PROD="aaaaaaaa-0000-4000-8000-0000000000f2"
FIX_TOP="aaaaaaaa-0000-4000-8000-0000000000f3"

q() { supabase db query "$1" --linked 2>&1; }
chk() { # chk <label> <sql> <pattern>
  local out; out=$(q "$2")
  if printf '%s' "$out" | grep -q "$3"; then
    echo "PASS  $1"; PASS=$((PASS+1))
  else
    echo "FAIL  $1"; printf '%s\n' "$out" | head -4 | sed 's/^/      /'; FAIL=$((FAIL+1))
  fi
}
chk_err() { # chk_err <label> <sql> <err-pattern>
  local out; out=$(q "$2")
  if printf '%s' "$out" | grep -qiE "$3"; then
    echo "PASS  $1"; PASS=$((PASS+1))
  else
    echo "FAIL  $1 (khong co loi ky vong: $3)"; printf '%s\n' "$out" | head -4 | sed 's/^/      /'; FAIL=$((FAIL+1))
  fi
}
fresh_claims="set request.jwt.claims = '{\"sub\":\"$SUB\",\"iat\":${NOW_IAT}}';"
old_claims="set request.jwt.claims = '{\"sub\":\"$SUB\",\"iat\":${OLD_IAT}}';"
# SEC-001: session_fresh doc auth.sessions.created_at khi JWT co session_id
SESS_NEW="aaaaaaaa-0000-4000-8000-0000000000a1"   # phien moi tao (het han sau 7 ngay)
SESS_OLD="aaaaaaaa-0000-4000-8000-0000000000a2"   # phien da 8 ngay
SESS_GONE="aaaaaaaa-0000-4000-8000-0000000000a3"  # session_id khong ton tai
sess_new_claims="set request.jwt.claims = '{\"sub\":\"$SUB\",\"session_id\":\"$SESS_NEW\",\"iat\":${NOW_IAT}}';"
sess_old_claims="set request.jwt.claims = '{\"sub\":\"$SUB\",\"session_id\":\"$SESS_OLD\",\"iat\":${NOW_IAT}}';"
sess_gone_claims="set request.jwt.claims = '{\"sub\":\"$SUB\",\"session_id\":\"$SESS_GONE\",\"iat\":${NOW_IAT}}';"

echo "== 0. Don du lieu test cu + fixture =="
q "delete from public.bills;
delete from public.product_toppings where product_id = '$FIX_PROD';
truncate public.stats_daily, public.stats_product_monthly, public.stats_product_alltime;
delete from public.products where category_id = '$FIX_CAT';
delete from public.categories where id = '$FIX_CAT';
delete from public.toppings where id = '$FIX_TOP';
delete from public.products where name in ('T7Prod', 'T7Prod2');
delete from public.categories where name = 'T7Cat';
delete from public.toppings where name = 'T7Top';
update public.app_meta set menu_version = 1;" >/dev/null
q "insert into public.categories (id, name, sort_order) values ('$FIX_CAT', 'T10Cat', 99);
insert into public.products (id, category_id, name, price) values ('$FIX_PROD', '$FIX_CAT', 'T10Prod', 20000);
insert into public.toppings (id, name, price) values ('$FIX_TOP', 'T10Top', 2000);
insert into public.product_toppings values ('$FIX_PROD', '$FIX_TOP');
select case when (select count(*) from public.categories) = 8 then 'OK:fixture' else 'BAD:fixture' end as r;" | grep -q OK:fixture \
  && { echo "PASS  fixture"; PASS=$((PASS+1)); } || { echo "FAIL  fixture"; FAIL=$((FAIL+1)); }

echo "== 1. RLS: anon =="
chk "anon doc app_meta 3 cot" "set role anon; select id, bootstrapped, menu_version from public.app_meta; reset role;" 'bootstrapped'
chk_err "anon doc products bi chan" "set role anon; select * from public.products; reset role;" 'permission denied for table products'
chk_err "anon doc profiles bi chan" "set role anon; select * from public.profiles; reset role;" 'permission denied for table profiles'
chk_err "anon doc bills bi chan" "set role anon; select * from public.bills; reset role;" 'permission denied for table bills'

echo "== 2. RLS: authenticated fresh/het han =="
chk "fresh doc menu (8 nhom)" "set role authenticated; $fresh_claims select 'OK:n' || count(*) from public.categories; reset request.jwt.claims; reset role;" 'OK:n8'
chk "het han doc menu = 0" "set role authenticated; $old_claims select case when count(*)=0 then 'OK:expired' else 'BAD' end as r from public.categories; reset request.jwt.claims; reset role;" 'OK:expired'
chk "fresh doc profiles (t7staff)" "set role authenticated; $fresh_claims select username from public.profiles; reset request.jwt.claims; reset role;" 't7staff'
chk "het han doc profiles = 0" "set role authenticated; $old_claims select case when count(*)=0 then 'OK:p0' else 'BAD' end as r from public.profiles; reset request.jwt.claims; reset role;" 'OK:p0'
chk_err "auth truncate products bi chan" "set role authenticated; $fresh_claims truncate public.products; reset request.jwt.claims; reset role;" 'permission denied for table products'
chk_err "auth insert bills truc tiep bi chan" "set role authenticated; $fresh_claims insert into public.bills (client_uuid, code, total) values (gen_random_uuid(), 'X', 1); reset request.jwt.claims; reset role;" 'permission denied for table bills'
chk_err "auth doc login_attempts bi chan" "set role authenticated; $fresh_claims select * from public.login_attempts; reset request.jwt.claims; reset role;" 'permission denied for table login_attempts'

echo "== 3. is_admin / session_fresh =="
chk "is_admin: staff = false" "set role authenticated; $fresh_claims select case when public.is_admin() = false then 'OK:notadmin' else 'BAD' end as r; reset request.jwt.claims; reset role;" 'OK:notadmin'
q "update public.profiles set role='admin' where id='$SUB';" >/dev/null
chk "is_admin: admin = true" "set role authenticated; $fresh_claims select case when public.is_admin() = true then 'OK:admin' else 'BAD' end as r; reset request.jwt.claims; reset role;" 'OK:admin'
q "update public.profiles set role='staff' where id='$SUB';" >/dev/null
chk "session_fresh: het han = false" "set role authenticated; $old_claims select case when public.session_fresh() = false then 'OK:sf' else 'BAD' end as r; reset request.jwt.claims; reset role;" 'OK:sf'
# --- SEC-001: mốc 7 ngày lấy từ auth.sessions.created_at (không còn là iat vì refresh cấp iat mới) ---
q "insert into auth.sessions (id, user_id, created_at)
   values ('$SESS_NEW', '$SUB', now()),
          ('$SESS_OLD', '$SUB', now() - interval '8 days');" >/dev/null
chk "session_fresh: phien moi = true" "set role authenticated; $sess_new_claims select case when public.session_fresh() = true then 'OK:sfnew' else 'BAD' end as r; reset request.jwt.claims; reset role;" 'OK:sfnew'
chk "session_fresh: phien 8 ngay = false" "set role authenticated; $sess_old_claims select case when public.session_fresh() = false then 'OK:sfold' else 'BAD' end as r; reset request.jwt.claims; reset role;" 'OK:sfold'
chk "session_fresh: session_id khong ton tai = false" "set role authenticated; $sess_gone_claims select case when public.session_fresh() = false then 'OK:sfgone' else 'BAD' end as r; reset request.jwt.claims; reset role;" 'OK:sfgone'
chk "het han phien doc menu = 0" "set role authenticated; $sess_old_claims select case when count(*)=0 then 'OK:expired' else 'BAD' end as r from public.categories; reset request.jwt.claims; reset role;" 'OK:expired'
chk "het han phien doc profiles = 0" "set role authenticated; $sess_old_claims select case when count(*)=0 then 'OK:p0' else 'BAD' end as r from public.profiles; reset request.jwt.claims; reset role;" 'OK:p0'
q "delete from auth.sessions where id in ('$SESS_NEW', '$SESS_OLD');" >/dev/null

echo "== 4. Menu CRUD (fresh) + menu_version tang =="
chk "tao san pham" "set role authenticated; $fresh_claims insert into public.products (category_id, name, price) values ('$FIX_CAT', 'T10New', 11000); select 'OK:ins'; reset request.jwt.claims; reset role;" 'OK:ins'
chk "menu_version tang sau insert" "select case when menu_version >= 2 then 'OK:mv' || menu_version else 'BAD' || menu_version end as r from public.app_meta;" 'OK:mv'
chk "sua san pham" "set role authenticated; $fresh_claims update public.products set price = 12000 where name = 'T10New'; select 'OK:upd'; reset request.jwt.claims; reset role;" 'OK:upd'
chk "xoa san pham" "set role authenticated; $fresh_claims delete from public.products where name = 'T10New'; select 'OK:del'; reset request.jwt.claims; reset role;" 'OK:del'

echo "== 5. create_bill + trigger stats + idempotent =="
UUID1="bbbbbbbb-0000-4000-8000-000000000001"
ITEMS="[{\"product_id\":\"$FIX_PROD\",\"qty\":2,\"toppings\":[{\"topping_id\":\"$FIX_TOP\",\"qty\":1}]}]"
chk "create_bill tong 42000" "set role authenticated; $fresh_claims
  select public.create_bill('$UUID1', '$ITEMS'::jsonb, (select menu_version from public.app_meta), false, null, '') as r;
  reset request.jwt.claims; reset role;" 'total:42000'
chk "stats_daily +42000 / 1 bill" "select case when revenue = 42000 and bill_count = 1 then 'OK:daily' else 'BAD:' || revenue || '/' || bill_count end as r from public.stats_daily;" 'OK:daily'
chk "stats san pham (topping loai)" "select case when revenue = 40000 and qty = 2 then 'OK:prod' else 'BAD' end as r from public.stats_product_alltime;" 'OK:prod'
chk "idempotent: goi lai trung uuid" "set role authenticated; $fresh_claims
  select public.create_bill('$UUID1', '$ITEMS'::jsonb, (select menu_version from public.app_meta), false, null, '') as r;
  reset request.jwt.claims; reset role;" 'duplicate:true'
chk_err "menu_version lech bi tu choi" "set role authenticated; $fresh_claims
  select public.create_bill(gen_random_uuid(), '$ITEMS'::jsonb, (select menu_version from public.app_meta) - 1, false, null, '');
  reset request.jwt.claims; reset role;" 'menu_version_changed'
chk_err "khong JWT bi tu choi" "set role authenticated; select public.create_bill(gen_random_uuid(), '[]'::jsonb, null, false, null, ''); reset role;" 'unauthorized'
chk_err "anon khong execute create_bill" "set role anon; select public.create_bill(gen_random_uuid(), '[]'::jsonb, null, false, null, ''); reset role;" 'permission denied for function create_bill'

echo "== 6. next_bill_code dang ma =="
chk "ma HT-YYMMDD-0001" "select case when public.next_bill_code() ~ '^HT-[0-9]{6}-[0-9]{4}\$' then 'OK:code' else 'BAD' end as r;" 'OK:code'

echo "== 7. Don du lieu test =="
q "delete from public.bills;
truncate public.stats_daily, public.stats_product_monthly, public.stats_product_alltime;
delete from public.product_toppings where product_id = '$FIX_PROD';
delete from auth.sessions where id in ('$SESS_NEW', '$SESS_OLD');
delete from public.products where category_id = '$FIX_CAT';
delete from public.categories where id = '$FIX_CAT';
delete from public.toppings where id = '$FIX_TOP';
update public.app_meta set menu_version = 1;
select case when (select count(*) from public.categories) = 7
             and (select count(*) from public.bills) = 0
             and (select count(*) from public.products) = 0
             and (select menu_version from public.app_meta) = 1
            then 'OK:clean' else 'BAD:clean' end as r;" | grep -q OK:clean \
  && { echo "PASS  cleanup"; PASS=$((PASS+1)); } || { echo "FAIL  cleanup"; FAIL=$((FAIL+1)); }

echo
echo "=== KET QUA: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ]
