#!/usr/bin/env bash
# Smoke cloud EF `profile-update` (P12-T9) — chạy trên project thật.
# Chạy: bash .opencode/evidence/p12-t9-smoke.sh   (cần .env ở repo HemTra)
# Quy mô: tạo 2 user tạm (admin tạm + staff) -> đặt app_meta.admin_email = email tạm
#         -> đủ contract + happy path (display_name / username / mật khẩu / avatar)
#         -> XOA user tam, XOA anh avatar, TRA app_meta.admin_email ve truoc do.
# Lấy OTP không cần mailbox: auth/v1/admin/generate_link (type=magiclink) tra email_otp
# (mẹo đã dùng ở p3t8-smoke.sh — verifyOtp type=email chịu mã này).
set -u
cd /workspaces/HemTra
set -a; . ./.env; set +a

URL="$SUPABASE_URL"
REST="$SUPABASE_REST_URL"
SERVICE="$SUPABASE_SERVICE_ROLE_KEY"
ANON="$SUPABASE_ANON_KEY"
EF="$URL/functions/v1/profile-update"

TMP_EMAIL="p12t9-smoke-admin@example.com"
TMP_STAFF_EMAIL="p12t9-smoke-staff@example.com"
TMP_USER="p12t9smoke"
TMP_STAFF_USER="p12t9smokestaff"
TMP_PW="P12t9s-$(openssl rand -hex 6)"
TMP_NEW_PW="P12t9n-$(openssl rand -hex 6)"

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "PASS: $1"; PASS=$((PASS+1));
  else echo "FAIL: $1 (want=[$2] got=[$3])"; FAIL=$((FAIL+1)); fi; }
jf() { python3 -c "import sys,json; d=json.loads(sys.argv[1] or '{}'); print($2)" "$1" 2>/dev/null || echo "__ERR__"; }

# postEF "<body>" [token] -> "<status> <error|message|ok>"
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
passwordToken() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))"
}
otpFor() {
  curl -s -X POST "$URL/auth/v1/admin/generate_link" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H "Content-Type: application/json" -d "{\"type\":\"magiclink\",\"email\":\"$1\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('email_otp',''))"
}
adminGet() { curl -s -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" "$URL/auth/v1/admin/$1"; }
restGet()  { curl -s -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" "$REST/$1"; }
restPost() { curl -s -X POST -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" -d "$2" "$REST/$1"; }
restPatch(){ curl -s -X PATCH -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" -d "$2" "$REST/$1"; }
# Storage list: prefix la "thu muc" (khong khop file phang) -> dung root + search.
listAvatar() { curl -s -X POST "$URL/storage/v1/object/list/avatars" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" -d "{\"prefix\":\"\",\"limit\":20,\"search\":\"$1.\"}"; }

META=$(restGet "app_meta?select=admin_email")
OLD_ADMIN_EMAIL=$(jf "$META" "d[0]['admin_email'] or ''")
[ -z "$OLD_ADMIN_EMAIL" ] && OLD_ADMIN_EMAIL="__EMPTY__"
UID_TMP=""

cleanup() {
  echo "-- CLEANUP --"
  # anh avatar cua user tam
  if [ -n "$UID_TMP" ]; then
    curl -s -o /dev/null -X DELETE -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
      "$URL/storage/v1/object/avatars/$UID_TMP.png" -w "xoa avatar png: %{http_code}\n"
    curl -s -o /dev/null -X DELETE -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
      "$URL/storage/v1/object/avatars/$UID_TMP.jpg" -w "xoa avatar jpg: %{http_code}\n"
  fi
  for e in "$TMP_EMAIL" "$TMP_STAFF_EMAIL"; do
    id=$(adminGet users | python3 -c "import sys,json;u=[x for x in json.load(sys.stdin).get('users',[]) if x.get('email')=='$e'];print(u[0]['id'] if u else '')" 2>/dev/null)
    if [ -n "$id" ]; then
      curl -s -o /dev/null -w "xoa user $e: %{http_code}\n" -X DELETE -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" "$URL/auth/v1/admin/users/$id"
    fi
  done
  if [ "$OLD_ADMIN_EMAIL" = "__EMPTY__" ]; then
    restPatch "app_meta?id=eq.1" '{"admin_email":null}' >/dev/null
  else
    restPatch "app_meta?id=eq.1" "{\"admin_email\":\"$OLD_ADMIN_EMAIL\"}" >/dev/null
  fi
  echo "da tra app_meta.admin_email = $OLD_ADMIN_EMAIL"
}
trap cleanup EXIT

echo "== Tao user tam =="
# 1) auth user admin tam
raw=$(curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" -d "{\"email\":\"$TMP_EMAIL\",\"password\":\"$TMP_PW\",\"email_confirm\":true}")
UID_TMP=$(jf "$raw" "d.get('id','')")
check "tao auth admin tam" "__UUID__" "$([ -n "$UID_TMP" ] && echo __UUID__ || echo EMPTY)"
# 2) profiles role=admin
restPost "profiles" "{\"id\":\"$UID_TMP\",\"username\":\"$TMP_USER\",\"display_name\":\"P12 T9 Smoke\",\"role\":\"admin\"}" >/dev/null
# 3) auth user staff tam
raw=$(curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" -d "{\"email\":\"$TMP_STAFF_EMAIL\",\"password\":\"$TMP_PW\",\"email_confirm\":true}")
UID_STAFF=$(jf "$raw" "d.get('id','')")
restPost "profiles" "{\"id\":\"$UID_STAFF\",\"username\":\"$TMP_STAFF_USER\",\"display_name\":\"Staff Tam\",\"role\":\"staff\"}" >/dev/null

# 4) dat app_meta.admin_email = email tam (target OTP)
restPatch "app_meta?id=eq.1" "{\"admin_email\":\"$TMP_EMAIL\"}" >/dev/null
check "dat admin_email tam" "$TMP_EMAIL" "$(restGet 'app_meta?select=admin_email' | jf "$(restGet 'app_meta?select=admin_email')" "d[0]['admin_email']")"

ADMIN_TOKEN=$(passwordToken "$TMP_EMAIL" "$TMP_PW")
STAFF_TOKEN=$(passwordToken "$TMP_STAFF_EMAIL" "$TMP_PW")
check "login admin tam" "ok" "$([ -n "$ADMIN_TOKEN" ] && echo ok || echo EMPTY)"
check "login staff tam" "ok" "$([ -n "$STAFF_TOKEN" ] && echo ok || echo EMPTY)"

echo "== Contract =="
check "request-otp khong token -> 401" "401 Phiên đăng nhập không hợp lệ, đăng nhập lại" "$(postEF '{"action":"request-otp"}')"
check "apply khong token -> 401" "401 Phiên đăng nhập không hợp lệ, đăng nhập lại" "$(postEF '{"action":"apply","token":"123456","display_name":"X"}')"
check "request-otp staff -> 403" "403 Chỉ admin mới được sửa hồ sơ này" "$(postEF '{"action":"request-otp"}' "$STAFF_TOKEN")"
check "apply staff -> 403" "403 Chỉ admin mới được sửa hồ sơ này" "$(postEF '{"action":"apply","token":"123456","display_name":"X"}' "$STAFF_TOKEN")"
check "apply sai OTP -> 401" "401 Mã OTP không đúng hoặc đã hết hạn" "$(postEF '{"action":"apply","token":"000000","display_name":"X"}' "$ADMIN_TOKEN")"
check "apply khong field -> 400" "400 Chưa có thay đổi nào" "$(postEF '{"action":"apply","token":"123456"}' "$ADMIN_TOKEN")"
check "apply OTP sai dinh dang -> 400" "400 Dữ liệu không hợp lệ" "$(postEF '{"action":"apply","token":"abc","display_name":"X"}' "$ADMIN_TOKEN")"
check "action la khoi -> 400" "400 Dữ liệu không hợp lệ" "$(postEF '{"action":"xoa"}' "$ADMIN_TOKEN")"

echo "== request-otp (gui OTP som nhat — truoc khi generate_link ton quota 60s/email) =="
check "request-otp admin -> 200" "200 Đã gửi mã OTP tới email admin." "$(postEF '{"action":"request-otp"}' "$ADMIN_TOKEN")"
check "request-otp lien tuc -> 429" "429 Quá nhiều yêu cầu gửi OTP — thử lại sau ít phút." "$(postEF '{"action":"request-otp"}' "$ADMIN_TOKEN")"
sleep 61  # GoTrue chan gui trung 60s/email -> cho het quarantine truoc khi generate_link

echo "== Happy path: display_name =="
OTP=$(otpFor "$TMP_EMAIL")
check "lay OTP duoc" "__OTP__" "$([ -n "$OTP" ] && echo __OTP__ || echo EMPTY)"
check "doi display_name -> 200" "200 Đã cập nhật hồ sơ" "$(postEF "{\"action\":\"apply\",\"token\":\"$OTP\",\"display_name\":\"P12 Đã Sửa\"}" "$ADMIN_TOKEN")"
check "display_name da ghi" "P12 Đã Sửa" "$(restGet "profiles?id=eq.$UID_TMP&select=display_name" | jf "$(restGet "profiles?id=eq.$UID_TMP&select=display_name")" "d[0]['display_name']")"
check "OTP da dung 1 lan (dung lai -> 401)" "401 Mã OTP không đúng hoặc đã hết hạn" "$(postEF "{\"action\":\"apply\",\"token\":\"$OTP\",\"display_name\":\"Lan Nua\"}" "$ADMIN_TOKEN")"

echo "== username =="
OTP=$(otpFor "$TMP_EMAIL")
check "username trung admin goc -> 409" "409 Tên đăng nhập đã tồn tại" "$(postEF "{\"action\":\"apply\",\"token\":\"$OTP\",\"username\":\"hemtra\"}" "$ADMIN_TOKEN")"
OTP=$(otpFor "$TMP_EMAIL")
check "username hop le -> 200" "200 Đã cập nhật hồ sơ" "$(postEF "{\"action\":\"apply\",\"token\":\"$OTP\",\"username\":\"p12t9smoke2\"}" "$ADMIN_TOKEN")"
check "username da ghi" "p12t9smoke2" "$(restGet "profiles?id=eq.$UID_TMP&select=username" | jf "$(restGet "profiles?id=eq.$UID_TMP&select=username")" "d[0]['username']")"

echo "== mat khau =="
OTP=$(otpFor "$TMP_EMAIL")
check "doi mat khau -> 200" "200 Đã cập nhật hồ sơ" "$(postEF "{\"action\":\"apply\",\"token\":\"$OTP\",\"password\":\"$TMP_NEW_PW\"}" "$ADMIN_TOKEN")"
check "dang nhap bang mat khau moi" "ok" "$([ -n "$(passwordToken "$TMP_EMAIL" "$TMP_NEW_PW")" ] && echo ok || echo EMPTY)"
# Doi mat khau huy session cu -> login lai de cac case sau tiep tuc.
ADMIN_TOKEN=$(passwordToken "$TMP_EMAIL" "$TMP_NEW_PW")
check "login lai sau doi mat khau" "ok" "$([ -n "$ADMIN_TOKEN" ] && echo ok || echo EMPTY)"

echo "== avatar =="
PNG="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
OTP=$(otpFor "$TMP_EMAIL")
check "upload avatar png -> 200" "200 Đã cập nhật hồ sơ" "$(postEF "{\"action\":\"apply\",\"token\":\"$OTP\",\"avatar_data_url\":\"$PNG\"}" "$ADMIN_TOKEN")"
check "avatar_path = <uid>.png" "$UID_TMP.png" "$(restGet "profiles?id=eq.$UID_TMP&select=avatar_path" | jf "$(restGet "profiles?id=eq.$UID_TMP&select=avatar_path")" "d[0]['avatar_path']")"
check "file avatar hien ra" "$UID_TMP.png" "$(jf "$(listAvatar "$UID_TMP")" "','.join(sorted(x['name'] for x in d)) if d else ''")"
SIGN=$(curl -s -X POST "$URL/storage/v1/object/sign/avatars/$UID_TMP.png" -H "apikey: $ANON" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"expiresIn":600}')
check "signed URL cho admin (policy SELECT)" "ok" "$([ -n "$(jf "$SIGN" "d.get('signedURL') or d.get('signedUrl') or ''")" ] && echo ok || echo EMPTY)"

JPG="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=="
OTP=$(otpFor "$TMP_EMAIL")
check "upload avatar jpg (doi duoi) -> 200" "200 Đã cập nhật hồ sơ" "$(postEF "{\"action\":\"apply\",\"token\":\"$OTP\",\"avatar_data_url\":\"$JPG\"}" "$ADMIN_TOKEN")"
LIST=$(curl -s -X POST "$URL/storage/v1/object/list/avatars" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" -d "{\"prefix\":\"$UID_TMP.\",\"limit\":10}")
check "file cu (.png) bi don (chi con jpg)" "$UID_TMP.jpg" "$(jf "$(listAvatar "$UID_TMP")" "','.join(sorted(x['name'] for x in d)) if d else ''")"

echo "== avatar loi =="
OTP=$(otpFor "$TMP_EMAIL")
check "dataURL khong phai anh -> 400" "400 Ảnh đại diện không hợp lệ (PNG/JPG/WEBP, tối đa 500KB)" \
  "$(postEF "{\"action\":\"apply\",\"token\":\"$OTP\",\"avatar_data_url\":\"data:text/plain;base64,aGk=\"}" "$ADMIN_TOKEN")"

echo
echo "TOTAL: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
