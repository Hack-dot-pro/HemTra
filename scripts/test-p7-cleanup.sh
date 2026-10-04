#!/usr/bin/env bash
# P7-T5: dựng bill giả hết hạn → job cleanup-bills (EF qua pg_cron/net.http_post)
# xóa đúng file Storage + dòng bills/bill_items, KHÔNG đụng stats_* (AGENT.md §11.4).
# Chạy trên DB linked (thay `supabase test db` — B-001: supabase start không chạy
# được trong sandbox, xem state.json). Mỗi assertion in PASS/FAIL; script tự dọn
# fixture cuối cùng.
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

SB="npx -y supabase@2.119.0"
PASS=0; FAIL=0

# Fixture cố định (uuid có pattern để dễ dọn, code không đụng bill thật)
CAT7="aaaaaaaa-0000-4000-8000-0000000000c7"
PROD7="aaaaaaaa-0000-4000-8000-0000000000d7"
BILL_EXP="aaaaaaaa-0000-4000-8000-0000000000e7"
BILL_FRESH="aaaaaaaa-0000-4000-8000-0000000000e8"
CODE_EXP="HT-260901-0001"
CODE_FRESH="HT-261004-0002"
IMG_PATH="2026/09/${CODE_EXP}.png"

q() { $SB db query "$1" --linked 2>&1; }
chk() { # chk <label> <sql> <pattern>
  local out; out=$(q "$2")
  if printf '%s' "$out" | grep -q "$3"; then
    echo "PASS  $1"; PASS=$((PASS+1))
  else
    echo "FAIL  $1"; printf '%s\n' "$out" | head -5 | sed 's/^/      /'; FAIL=$((FAIL+1))
  fi
}
val() { # val <sql> → chuỗi ô cuối cùng trong bảng output (dấu bảng đã lược)
  q "$1" | grep -oE '[A-Za-z0-9_/,.-]+' | grep -viE '^(column|v|val|sum|r)$' | tail -1
}
# Kiểm tra object có trong bucket bằng list API — KHÔNG dùng GET vì Cloudflare
# còn trả bản 200 đã cache (cf-cache-status: HIT) sau khi object đã bị xóa thật.
# Trả về 1 = còn file, 0 = đã mất.
list_has() { # list_has <prefix> <basename>
  curl -s -X POST "$SUPABASE_URL/storage/v1/object/list/bills" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" -d "{\"prefix\":\"$1\"}" \
    | jq -r --arg n "$2" '[.[] | select(.name == $n)] | length'
}

echo "== 0. Dọn fixture cũ + chuẩn bị PNG 1x1 =="
q "delete from public.bills where id in ('$BILL_EXP','$BILL_FRESH');
delete from public.products where id = '$PROD7';
delete from public.categories where id = '$CAT7';" >/dev/null
IMG_FILE=$(mktemp /tmp/p7t5-XXXX.png)
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d > "$IMG_FILE"

# 1) Snapshot stats TRƯỚC khi chèn bill giả
before_daily=$(val "select coalesce(sum(revenue),0)||'/'||coalesce(sum(bill_count),0) from public.stats_daily;")
before_at=$(val "select coalesce((select qty||'/'||revenue from public.stats_product_alltime where product_key='$PROD7'),'NONE');")

echo "== 1. Fixture: category + product + bill hết hạn + bill còn hạn =="
q "insert into public.categories (id, name, sort_order) values ('$CAT7','T7T5Cat',98);
insert into public.products (id, category_id, name, price) values ('$PROD7','$CAT7','T7T5Spa',15000);
insert into public.bills (id, client_uuid, code, total, phone_note, image_path, created_by, created_at, expires_at)
values ('$BILL_EXP','aaaaaaaa-0000-4000-8000-0000000001e7','$CODE_EXP',30000,'0338525677','$IMG_PATH',null,
        now() - interval '16 days', now() - interval '1 day');
insert into public.bill_items (bill_id, product_id, name_snapshot, unit_price_snapshot, qty, sort_order)
select '$BILL_EXP','$PROD7','T7T5Spa',15000,2,0;
insert into public.bills (id, client_uuid, code, total, phone_note, image_path, created_by, created_at, expires_at)
values ('$BILL_FRESH','aaaaaaaa-0000-4000-8000-0000000001e8','$CODE_FRESH',20000,'', '', null,
        now(), now() + interval '15 days');
insert into public.bill_items (bill_id, product_id, name_snapshot, unit_price_snapshot, qty, sort_order)
select '$BILL_FRESH','$PROD7','T7T5Spa',15000,1,0;
select case when (select count(*) from public.bills where id in ('$BILL_EXP','$BILL_FRESH')) = 2
  then 'OK:fixture' else 'BAD:fixture' end as r;" | grep -q OK:fixture \
  && { echo "PASS  fixture 2 bill"; PASS=$((PASS+1)); } || { echo "FAIL  fixture 2 bill"; FAIL=$((FAIL+1)); }

# 2) Stats PHẢI tăng đúng khi chèn bill (trigger P1-T3)
post_daily=$(val "select coalesce(sum(revenue),0)||'/'||coalesce(sum(bill_count),0) from public.stats_daily;")
post_at=$(val "select coalesce((select qty||'/'||revenue from public.stats_product_alltime where product_key='$PROD7'),'NONE');")
echo "    stats daily: ${before_daily} -> ${post_daily} (ky vong +50000/+2)"
echo "    stats alltime prod: ${before_at} -> ${post_at} (ky vong 3/45000)"

echo "== 2. Upload PNG bill hết hạn vào bucket bills =="
upload_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "$SUPABASE_URL/storage/v1/object/bills/$IMG_PATH" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: image/png" --data-binary @"$IMG_FILE")
[ "$upload_code" = "201" ] || [ "$upload_code" = "200" ] \
  && { echo "PASS  upload PNG ($upload_code)"; PASS=$((PASS+1)); } \
  || { echo "FAIL  upload PNG ($upload_code)"; FAIL=$((FAIL+1)); }
has_before=$(list_has "2026/09" "$CODE_EXP.png")

echo "== 3. Lịch pg_cron đã đăng ký =="
chk "cron job hemtra-cleanup-bills hang ngay 07:00 VN" \
  "select case when count(*) = 1 then 'OK:job' else 'BAD:'||count(*) end as r from cron.job where jobname='hemtra-cleanup-bills' and schedule='0 0 * * *' and active;" \
  "OK:job"
chk "ham run_cleanup_bills khong cho anon goi" \
  "select case when has_function_privilege('anon','public.run_cleanup_bills()','execute') then 'BAD:anon' else 'OK:deny' end as r;" \
  "OK:deny"

echo "== 4. Chay dung code path cua cron (run_cleanup_bills -> EF cleanup-bills) =="
rid_raw=$(q "select 'RID:'||public.run_cleanup_bills() as r;")
rid=$(printf '%s' "$rid_raw" | grep -oE 'RID:[0-9]+' | head -1 | cut -d: -f2)
if [ -z "$rid" ]; then
  echo "FAIL  goi run_cleanup_bills (khong nhan request_id)"; printf '%s\n' "$rid_raw" | head -5
  FAIL=$((FAIL+1)); rid=""
else
  echo "PASS  run_cleanup_bills -> request_id=$rid"; PASS=$((PASS+1))
fi

resp=""
if [ -n "$rid" ]; then
  for _ in $(seq 1 15); do
    resp=$(q "select coalesce((select status_code||' '||content from net._http_response where id=$rid),'WAIT');")
    printf '%s' "$resp" | grep -q 'WAIT' || break
    sleep 2
  done
fi
resp_value=$(printf '%s' "$resp" | tr -s ' ' | tr -d '│┌┐└┘─├┤┼┬┴' | grep -vE '^\s*$' | tail -1)
printf '    response: %s\n' "$resp_value"
printf '%s' "$resp" | grep -q '"scanned":' && printf '%s' "$resp" | grep -q '"rowsDeleted":' \
  && { echo "PASS  EF tra ve summary (scanned/rowsDeleted)"; PASS=$((PASS+1)); } \
  || { echo "FAIL  EF khong tra summary"; FAIL=$((FAIL+1)); }
printf '%s' "$resp" | grep -qE '200 *\{' \
  && { echo "PASS  HTTP 200"; PASS=$((PASS+1)); } \
  || { echo "FAIL  HTTP khong phai 200"; FAIL=$((FAIL+1)); }

echo "== 5. Ket qua xoa =="
chk "bill het han da bi xoa" \
  "select case when count(*) = 0 then 'OK:gone' else 'BAD:'||count(*) end as r from public.bills where id='$BILL_EXP';" \
  "OK:gone"
chk "bill_items cua bill het han da bi xoa (cascade)" \
  "select case when count(*) = 0 then 'OK:items-gone' else 'BAD:'||count(*) end as r from public.bill_items where bill_id='$BILL_EXP';" \
  "OK:items-gone"
chk "bill con han van con (khong xoa lan)" \
  "select case when count(*) = 1 then 'OK:kept' else 'BAD:'||count(*) end as r from public.bills where id='$BILL_FRESH';" \
  "OK:kept"
has_after=$(list_has "2026/09" "$CODE_EXP.png")
[ "$has_before" = "1" ] && [ "$has_after" = "0" ] \
  && { echo "PASS  file Storage da xoa (list 1 -> 0)"; PASS=$((PASS+1)); } \
  || { echo "FAIL  file Storage (truoc=$has_before sau=$has_after)"; FAIL=$((FAIL+1)); }

echo "== 6. Stats van nguyen sau khi xoa bill (AGENT.md §11.4) =="
after_daily=$(val "select coalesce(sum(revenue),0)||'/'||coalesce(sum(bill_count),0) from public.stats_daily;")
after_at=$(val "select coalesce((select qty||'/'||revenue from public.stats_product_alltime where product_key='$PROD7'),'NONE');")
[ "$after_daily" = "$post_daily" ] \
  && { echo "PASS  stats_daily khong doi ($after_daily)"; PASS=$((PASS+1)); } \
  || { echo "FAIL  stats_daily doi: $post_daily -> $after_daily"; FAIL=$((FAIL+1)); }
[ "$after_at" = "$post_at" ] \
  && { echo "PASS  stats_product_alltime khong doi ($after_at)"; PASS=$((PASS+1)); } \
  || { echo "FAIL  stats_product_alltime doi: $post_at -> $after_at"; FAIL=$((FAIL+1)); }

echo "== 7. Don fixture (tra lai stats nhu truoc khi chay) =="
q "delete from public.bills where id in ('$BILL_EXP','$BILL_FRESH');
delete from public.products where id = '$PROD7';
delete from public.categories where id = '$CAT7';
-- bo dung dong stats ma fixture vua cong vao (stats la vinh vien -> phai tru tay)
update public.stats_daily
   set revenue = revenue - 30000, bill_count = bill_count - 1
 where date = ((now() - interval '16 days') at time zone 'Asia/Ho_Chi_Minh')::date;
update public.stats_daily
   set revenue = revenue - 20000, bill_count = bill_count - 1
 where date = (now() at time zone 'Asia/Ho_Chi_Minh')::date;
delete from public.stats_daily where revenue = 0 and bill_count = 0;
delete from public.stats_product_monthly where product_key = '$PROD7';
delete from public.stats_product_alltime where product_key = '$PROD7';
select 'OK:cleanup' as r;" | grep -q OK:cleanup \
  && { echo "PASS  cleanup fixture"; PASS=$((PASS+1)); } || { echo "FAIL  cleanup fixture"; FAIL=$((FAIL+1)); }
curl -s -o /dev/null -X DELETE "$SUPABASE_URL/storage/v1/object/bills/$IMG_PATH" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
rm -f "$IMG_FILE"

echo "=== KET QUA: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ]
