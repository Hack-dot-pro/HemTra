#!/usr/bin/env bash
# Smoke cloud EF `change-recovery-email` (P3-T8) — chạy trên project thật.
# Chạy: bash .opencode/evidence/p3t8-smoke.sh   (cần .env ở repo HemTra)
# Quy mô: tạo 2 user tạm (staff + admin) -> chạy đủ contract + happy path ->
# XOA het user tam + tra app_meta.admin_email ve null (khong de quet rac).
set -u
cd /workspaces/HemTra   # chay tu repo (can .env)
set -a; . ./.env; set +a

URL="$SUPABASE_URL"
REST="$SUPABASE_REST_URL"
SERVICE="$SUPABASE_SERVICE_ROLE_KEY"
ANON="$SUPABASE_ANON_KEY"
EF="$URL/functions/v1/change-recovery-email"
# Mat khau sinh NGAU NHIEN moi lan chay (khong luu/khong commit mat khau) —
# user tam chi ton tai trong suot script roi bi cleanup xoa.
STAFF_EMAIL="p3t8-smoke-staff@example.com"
STAFF_PW="P3t8s-$(openssl rand -hex 6)"
ADMIN_EMAIL="p3t8-smoke-admin@example.com"
ADMIN_PW="P3t8a-$(openssl rand -hex 6)"
NEW_EMAIL="p3t8-smoke-admin-moi@example.com"
NEW_PW="P3t8n-$(openssl rand -hex 6)"
PASS=0; FAIL=0

check() { # check "ten" "want" "got"
  if [ "$2" = "$3" ]; then echo "PASS: $1"; PASS=$((PASS+1));
  else echo "FAIL: $1 (want=[$2] got=[$3])"; FAIL=$((FAIL+1)); fi
}
# jf "<json>" "<bieu thon python tren dict d>"
jf() { python3 -c "import sys,json; d=json.loads(sys.argv[1] or '{}'); print($2)" "$1" 2>/dev/null || echo "__ERR__"; }

# postEF "<body-json>" [token] -> "<status> <error|message|ok>" (1 lan curl, khong chay 2 lan)
postEF() {
  local body="$1" tok="${2:-}" raw st bodyjson
  if [ -n "$tok" ]; then
    raw=$(curl -s -X POST "$EF" -H "Content-Type: application/json" -H "Authorization: Bearer $tok" -d "$body" -w $'\n%{http_code}')
  else
    raw=$(curl -s -X POST "$EF" -H "Content-Type: application/json" -d "$body" -w $'\n%{http_code}')
  fi
  st="${raw##*$'\n'}"; bodyjson="${raw%$'\n'*}"
  echo "$st $(jf "$bodyjson" "d.get('error') or d.get('message') or ('ok' if d.get('ok') else '')")"
}
passwordToken() { # passwordToken <email> <pw>
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))"
}
otpFor() { # otpFor <email> — GoTrue tra email_otp (magiclink); verify type=email chiu (da test)
  curl -s -X POST "$URL/auth/v1/admin/generate_link" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H "Content-Type: application/json" -d "{\"type\":\"magiclink\",\"email\":\"$1\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('email_otp',''))"
}
adminGet() { curl -s -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" "$URL/auth/v1/admin/$1"; }
restGet()  { curl -s -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" "$REST/$1"; }

cleanup() {
  echo "-- CLEANUP (xoa user tam + tra app_meta ve null) --"
  for e in "$ADMIN_EMAIL" "$NEW_EMAIL" "$STAFF_EMAIL" "p3t8-smoke-admin-moi@example.com"; do
    id=$(adminGet users | python3 -c "import sys,json;u=[x for x in json.load(sys.stdin).get('users',[]) if x.get('email')=='$e'];print(u[0]['id'] if u else '')" 2>/dev/null)
    if [ -n "$id" ]; then
      curl -s -o /dev/null -w "xoa user $e: %{http_code}\n" -X DELETE -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" "$URL/auth/v1/admin/users/$id"
    fi
  done
  curl -s -o /dev/null -w "xoa profile p3t8smokeadm: %{http_code}\n" -X DELETE -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    "$REST/profiles?username=eq.p3t8smokeadm"
  curl -s -o /dev/null -w "xoa profile p3t8smokestaff: %{http_code}\n" -X DELETE -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    "$REST/profiles?username=eq.p3t8smokestaff"
  curl -s -o /dev/null -w "app_meta.admin_email -> null: %{http_code}\n" -X PATCH -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H "Content-Type: application/json" -d '{"admin_email":null}' "$REST/app_meta?id=eq.1"
}
trap cleanup EXIT

echo "===== P3-T8 SMOKE: EF change-recovery-email ====="
echo "A. CONTRACT (admin_email chua co)"
R=$(postEF '{"action":"request-current","password":"x"}');  check "khong token -> 401" "401 Phiên đăng nhập không hợp lệ, đăng nhập lại" "$R"
R=$(postEF '{"action":"request-current"}');                  check "khong token + body thieu password -> 401" "401 Phiên đăng nhập không hợp lệ, đăng nhập lại" "$R"
R=$(postEF '{"action":"hoat-dong-la"}');                     check "action la (truoc xac thuc) -> 400" "400 Dữ liệu không hợp lệ" "$R"

curl -s -o /dev/null -w "tao user staff: %{http_code}\n" -X POST "$URL/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" -d "{\"email\":\"$STAFF_EMAIL\",\"password\":\"$STAFF_PW\",\"email_confirm\":true}"
STAFF_ID=$(adminGet users | python3 -c "import sys,json;u=[x for x in json.load(sys.stdin).get('users',[]) if x.get('email')=='$STAFF_EMAIL'];print(u[0]['id'] if u else '')")
curl -s -o /dev/null -w "tao profile staff (role=staff): %{http_code}\n" -X POST "$REST/profiles" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"id\":\"$STAFF_ID\",\"username\":\"p3t8smokestaff\",\"display_name\":\"P3T8 Staff\",\"role\":\"staff\",\"must_change_password\":false}"
STAFF_TOK=$(passwordToken "$STAFF_EMAIL" "$STAFF_PW"); echo "staff token len ${#STAFF_TOK}"
R=$(postEF '{"action":"request-current","password":"x"}' "$STAFF_TOK"); check "staff request-current -> 403" "403 Chỉ admin mới dùng chức năng này" "$R"
R=$(postEF '{"action":"request-new","new_email":"x@y.com"}' "$STAFF_TOK"); check "staff request-new -> 403" "403 Chỉ admin mới dùng chức năng này" "$R"
R=$(postEF '{"action":"complete","password":"x","current_token":"123456","new_email":"x@y.com","new_token":"123456","new_password":"abcdef"}' "$STAFF_TOK"); check "staff complete -> 403" "403 Chỉ admin mới dùng chức năng này" "$R"

curl -s -o /dev/null -w "tao user admin: %{http_code}\n" -X POST "$URL/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PW\",\"email_confirm\":true}"
ADMIN_ID=$(adminGet users | python3 -c "import sys,json;u=[x for x in json.load(sys.stdin).get('users',[]) if x.get('email')=='$ADMIN_EMAIL'];print(u[0]['id'] if u else '')")
curl -s -o /dev/null -w "tao profile admin (role=admin): %{http_code}\n" -X POST "$REST/profiles" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"id\":\"$ADMIN_ID\",\"username\":\"p3t8smokeadm\",\"display_name\":\"P3T8 Smoke\",\"role\":\"admin\",\"must_change_password\":false}"
ADMIN_TOK=$(passwordToken "$ADMIN_EMAIL" "$ADMIN_PW"); echo "admin token len ${#ADMIN_TOK}"
if [ ${#ADMIN_TOK} -le 100 ]; then echo "FAIL: lay token admin that bai"; exit 1; fi

R=$(restGet 'app_meta?select=admin_email'); check "admin_email = null truoc smoke" "None" "$(jf "$R" "str(d[0].get('admin_email'))")"
R=$(postEF '{"action":"request-current","password":"x"}' "$ADMIN_TOK"); check "admin_email null: request-current -> 400" "400 Hệ thống chưa cấu hình email khôi phục" "$R"
R=$(postEF '{"action":"request-new","new_email":"x@y.com"}' "$ADMIN_TOK"); check "admin_email null: request-new -> 400" "400 Hệ thống chưa cấu hình email khôi phục" "$R"
R=$(postEF '{"action":"complete","password":"x","current_token":"123456","new_email":"x@y.com","new_token":"123456","new_password":"abcdef"}' "$ADMIN_TOK"); check "admin_email null: complete -> 400" "400 Hệ thống chưa cấu hình email khôi phục" "$R"

echo "B. DAT app_meta.admin_email = $ADMIN_EMAIL (service_role)"
curl -s -o /dev/null -w "patch app_meta: %{http_code}\n" -X PATCH "$REST/app_meta?id=eq.1" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" -d "{\"admin_email\":\"$ADMIN_EMAIL\"}"
R=$(restGet 'app_meta?select=admin_email'); check "app_meta.admin_email da set" "$ADMIN_EMAIL" "$(jf "$R" "d[0].get('admin_email')")"

R=$(postEF '{"action":"request-current"}' "$ADMIN_TOK");                                  check "admin token + thieu password -> 400" "400 Dữ liệu không hợp lệ" "$R"
R=$(postEF '{"action":"complete"}' "$ADMIN_TOK");                                          check "admin token + complete rong -> 400" "400 Dữ liệu không hợp lệ" "$R"
R=$(postEF '{"action":"request-current","password":"sai-mat-khau"}' "$ADMIN_TOK");      check "request-current SAI mat khau -> 401" "401 Mật khẩu admin không đúng" "$R"
R=$(postEF "{\"action\":\"request-new\",\"new_email\":\"$ADMIN_EMAIL\"}" "$ADMIN_TOK"); check "request-new trung email hien tai -> 400" "400 Email mới phải khác email hiện tại" "$R"
R=$(postEF "{\"action\":\"request-new\",\"new_email\":\"$STAFF_EMAIL\"}" "$ADMIN_TOK"); check "request-new email user khac co profile -> 409" "409 Email mới đã được dùng cho tài khoản khác" "$R"
R=$(postEF "{\"action\":\"request-current\",\"password\":\"$ADMIN_PW\"}" "$ADMIN_TOK"); check "request-current DUNG mat khau -> 200" "200 ok" "$R"
R=$(postEF "{\"action\":\"request-new\",\"new_email\":\"$NEW_EMAIL\"}" "$ADMIN_TOK");   check "request-new email moi -> 200 (sinh user tam)" "200 ok" "$R"
R=$(postEF "{\"action\":\"complete\",\"password\":\"$ADMIN_PW\",\"current_token\":\"000000\",\"new_email\":\"$NEW_EMAIL\",\"new_token\":\"111111\",\"new_password\":\"$NEW_PW\"}" "$ADMIN_TOK"); check "complete OTP sai -> 401" "401 Mã OTP không đúng hoặc đã hết hạn" "$R"

echo "C. HAPPY PATH (2 dieu kien: OTP email hien tai + mat khau, roi OTP email moi)"
R=$(postEF "{\"action\":\"request-current\",\"password\":\"$ADMIN_PW\"}" "$ADMIN_TOK"); check "buoc 1: gui OTP email hien tai -> 200" "200 ok" "$R"
OTP_CUR=$(otpFor "$ADMIN_EMAIL"); echo "OTP hien tai = $OTP_CUR"
R=$(postEF "{\"action\":\"request-new\",\"new_email\":\"$NEW_EMAIL\"}" "$ADMIN_TOK");   check "buoc 2: gui OTP email moi -> 200" "200 ok" "$R"
OTP_NEW=$(otpFor "$NEW_EMAIL"); echo "OTP moi = $OTP_NEW"
if [ ${#OTP_CUR} -ne 6 ] || [ ${#OTP_NEW} -ne 6 ]; then echo "FAIL: lay OTP that bai"; FAIL=$((FAIL+1)); fi
R=$(postEF "{\"action\":\"complete\",\"password\":\"$ADMIN_PW\",\"current_token\":\"$OTP_CUR\",\"new_email\":\"$NEW_EMAIL\",\"new_token\":\"$OTP_NEW\",\"new_password\":\"$NEW_PW\"}" "$ADMIN_TOK")
check "complete du 2 dieu kien -> 200" "200 Đã đổi email khôi phục. Hãy đăng nhập bằng mật khẩu mới." "$R"

echo "D. KIEM TRA SAU COMPLETE"
R=$(restGet 'app_meta?select=admin_email'); check "app_meta.admin_email = email moi" "$NEW_EMAIL" "$(jf "$R" "d[0].get('admin_email')")"
R=$(adminGet users)
OWNER=$(jf "$R" "next((u['id'] for u in d.get('users',[]) if u.get('email')=='$NEW_EMAIL'), '')")
check "auth.users.email = email moi (gianh id admin)" "$ADMIN_ID" "$OWNER"
NEW_TOK=$(passwordToken "$NEW_EMAIL" "$NEW_PW")
check "dang nhap mat khau MOI -> ok" "True" "$([ ${#NEW_TOK} -gt 100 ] && echo True || echo False)"
OLD_TOK=$(passwordToken "$ADMIN_EMAIL" "$ADMIN_PW")
check "mat khau/mat khau CU bi huy" "__NONE__" "${OLD_TOK:-__NONE__}"
R=$(restGet 'profiles?select=username'); check "profile admin van con" "1" "$(jf "$R" "str(len([p for p in d if p['username']=='p3t8smokeadm']))")"
LEFT=$(adminGet users | python3 -c "import sys,json;print(sum(1 for u in json.load(sys.stdin).get('users',[]) if u.get('email')=='$NEW_EMAIL'))")
check "khong con user tam (1 user tai email moi)" "1" "$LEFT"

echo "==========================================="
echo "TONG: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
