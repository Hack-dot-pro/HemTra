#!/usr/bin/env python3
"""P12-T10 — kiểm chứng EF delete-bills trên cloud (toàn bộ DB qua PostgREST).

Tạo user test tạm (1 admin + 1 staff), bill test 2030-01-05 + ảnh Storage test,
rồi gọi EF với: không token / token sai / sai mật khẩu / staff / thiếu bill_id /
đúng mật khẩu. Dọn sạch ở finally.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = "/workspaces/HemTra"
env = {}
with open(os.path.join(ROOT, ".env")) as fh:
    for line in fh:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"').strip("'")

URL = env["SUPABASE_URL"]
REST = env["SUPABASE_REST_URL"]
SERVICE = env["SUPABASE_SERVICE_ROLE_KEY"]
ANON = env["SUPABASE_ANON_KEY"]

ADMIN_EMAIL = "p12-admin-test@hem.local"
STAFF_EMAIL = "p12-staff-test@hem.local"
ADMIN_PASSWORD = "P12adminTest!2345"
STAFF_PASSWORD = "P12staffTest!2345"
BILL_ID = "00000000-0000-4000-8000-00000000d10e"
IMAGE_PATH = "2030/01/HT-261001-TEST1.png"
BILL_CODE = "HT-261001-TEST1"

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS  " if cond else "FAIL  ") + name + (f"  [{detail}]" if detail else ""))


def http(method, url, body=None, headers=None):
    req = urllib.request.Request(url, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    data = None
    if body is not None:
        data = body if isinstance(body, (bytes, bytearray)) else json.dumps(body).encode()
        if "Content-Type" not in (headers or {}):
            req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=60) as resp:
            raw = resp.read().decode()
            try:
                parsed = json.loads(raw) if raw else None
            except Exception:
                parsed = raw
            return resp.status, parsed
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            parsed = json.loads(raw) if raw else None
        except Exception:
            parsed = raw
        return exc.code, parsed


def rest(method, table, params="", body=None, extra_headers=None):
    headers = {"apikey": SERVICE, "Authorization": "Bearer " + SERVICE}
    if extra_headers:
        headers.update(extra_headers)
    return http(method, f"{REST}{table}{params}", body=body, headers=headers)


def api(method, path, body=None, headers=None, token=None):
    hdrs = {"apikey": ANON, "Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    if token:
        hdrs["Authorization"] = "Bearer " + token
    return http(method, URL + path, body=body, headers=hdrs)


def sign_in(email, password):
    status, body = api(
        "POST",
        "/auth/v1/token?grant_type=password",
        {"email": email, "password": password},
        headers={"Authorization": "Bearer " + ANON},
    )
    if status != 200:
        raise RuntimeError(f"sign-in failed {status}: {body}")
    return body["access_token"], body["user"]["id"]


def snapshot_stats():
    _, daily = rest("GET", "stats_daily", "?date=eq.2030-01-05&select=*")
    _, monthly = rest("GET", "stats_product_monthly", "?month=eq.2030-01-01&select=*")
    _, alltime = rest("GET", "stats_product_alltime", "?select=*")
    return {"daily": daily, "monthly": monthly, "alltime": alltime}


admin_token = None
staff_token = None
admin_uid = None
staff_uid = None

try:
    # 1) user test tạm
    status, body = api(
        "POST",
        "/auth/v1/admin/users",
        {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "email_confirm": True},
        headers={"Authorization": "Bearer " + SERVICE},
    )
    check("tao admin test user", status in (200, 201), f"{status}")
    admin_uid = body.get("id") if isinstance(body, dict) else None

    status, body = api(
        "POST",
        "/auth/v1/admin/users",
        {"email": STAFF_EMAIL, "password": STAFF_PASSWORD, "email_confirm": True},
        headers={"Authorization": "Bearer " + SERVICE},
    )
    check("tao staff test user", status in (200, 201), f"{status}")
    staff_uid = body.get("id") if isinstance(body, dict) else None

    # 2) profiles (service_role)
    status, body = rest(
        "POST",
        "profiles",
        body=[
            {"id": admin_uid, "username": "p12testadmin", "display_name": "P12 test admin", "role": "admin"},
            {"id": staff_uid, "username": "p12teststaff", "display_name": "P12 test staff", "role": "staff"},
        ],
        extra_headers={"Prefer": "return=representation"},
    )
    check("tao profiles admin/staff", status in (200, 201), f"{status} {body}")

    # 3) stats TRƯỚC khi tạo bill test
    stats_before = snapshot_stats()

    # 4) bill test + items (trigger stats INSERT chạy)
    status, body = rest(
        "POST",
        "bills",
        body={
            "id": BILL_ID,
            "client_uuid": "00000000-0000-4000-8000-00000000c10e",
            "code": BILL_CODE,
            "total": 70000,
            "image_path": IMAGE_PATH,
            "created_at": "2030-01-05T04:00:00Z",
        },
        extra_headers={"Prefer": "return=representation"},
    )
    check("tao bill test (trigger stats)", status in (200, 201), f"{status} {body}")

    status, products = rest("GET", "products", "?select=id,name,price&order=id&limit=1")
    pid = products[0]["id"]
    status, body = rest(
        "POST",
        "bill_items",
        body={
            "bill_id": BILL_ID,
            "product_id": pid,
            "name_snapshot": products[0]["name"],
            "unit_price_snapshot": products[0]["price"],
            "qty": 2,
        },
    )
    check("tao bill_items test", status in (200, 201), f"{status} {body}")

    _, daily_after_insert = rest("GET", "stats_daily", "?date=eq.2030-01-05&select=revenue,bill_count")
    check(
        "stats_daily tang khi chen bill test",
        daily_after_insert and daily_after_insert[0]["revenue"] == 70000,
        str(daily_after_insert),
    )

    # 5) upload ảnh test
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    status, _ = http(
        "POST",
        f"{URL}/storage/v1/object/bills/{IMAGE_PATH}",
        body=png,
        headers={"apikey": SERVICE, "Authorization": "Bearer " + SERVICE, "Content-Type": "image/png"},
    )
    check("upload anh test len Storage", status in (200, 201), str(status))

    # 6) đăng nhập
    admin_token, admin_uid = sign_in(ADMIN_EMAIL, ADMIN_PASSWORD)
    staff_token, staff_uid = sign_in(STAFF_EMAIL, STAFF_PASSWORD)
    check("dang nhap admin/staff test", bool(admin_token and staff_token))

    EF = "/functions/v1/delete-bills"
    payload = {"bill_id": BILL_ID, "password": ADMIN_PASSWORD}

    status, body = api("POST", EF, payload)
    check("A. khong token -> 401", status == 401, f"{status} {body}")

    status, body = api("POST", EF, payload, token="garbage.token.here")
    check("B. token sai -> 401", status == 401, f"{status} {body}")

    status, body = api("POST", EF, {"bill_id": BILL_ID, "password": "sai-mat-khau"}, token=admin_token)
    check(
        "C. admin + sai mat khau -> 401 Viet",
        status == 401 and "Mật khẩu admin không đúng" in str(body.get("error")),
        f"{status} {body}",
    )
    _, still = rest("GET", "bills", f"?id=eq.{BILL_ID}&select=id")
    check("C. bill van con sau sai mat khau", len(still) == 1, str(len(still)))

    status, body = api("POST", EF, {"bill_id": BILL_ID, "password": STAFF_PASSWORD}, token=staff_token)
    check(
        "D. staff -> 403 chi admin",
        status == 403 and "admin" in str(body.get("error", "")).lower(),
        f"{status} {body}",
    )

    status, body = api("POST", EF, {"password": ADMIN_PASSWORD}, token=admin_token)
    check("E. thieu bill_id -> 400", status == 400, f"{status} {body}")

    status, body = api("POST", EF, payload, token=admin_token)
    check(
        "F. admin + dung mat khau -> 200 ok",
        status == 200 and body.get("ok") is True and body.get("code") == BILL_CODE,
        f"{status} {body}",
    )

    _, bills_left = rest("GET", "bills", f"?id=eq.{BILL_ID}&select=id")
    _, items_left = rest("GET", "bill_items", f"?bill_id=eq.{BILL_ID}&select=id")
    check("G. xoa bill + bill_items", len(bills_left) == 0 and len(items_left) == 0,
          f"bills={len(bills_left)} items={len(items_left)}")

    # Kiểm qua bảng storage.objects (GET object endpoint trả 400 khi thiếu
    # tham số signed, không đáng tin làm assertion)
    import subprocess

    proc = subprocess.run(
        ["npx", "--yes", "supabase", "db", "query", "--linked",
         "select count(*)::int as n from storage.objects where bucket_id='bills' and name = '"
         + IMAGE_PATH + "';"],
        cwd=ROOT, capture_output=True, text=True, env={**os.environ, **env}, timeout=180,
    )
    leftover_obj = None
    seen_header = False
    for line in proc.stdout.splitlines():
        if not line.strip().startswith("│"):
            continue
        cells = [c.strip() for c in line.strip("│").split("│")]
        if cells == ["n"]:
            seen_header = True
            continue
        if seen_header and len(cells) == 1 and cells[0].isdigit():
            leftover_obj = int(cells[0])
    check("H. anh Storage da xoa (0 object)", leftover_obj == 0, f"n={leftover_obj} {proc.stdout[-300:]}")

    stats_after = snapshot_stats()
    check(
        "I. stats_daily/monthly/alltime ve truoc test",
        stats_before == stats_after,
        "before=" + json.dumps(stats_before, sort_keys=True)[:160]
        + " after=" + json.dumps(stats_after, sort_keys=True)[:160],
    )

finally:
    # Dọn sạch
    rest("DELETE", "bill_items", f"?bill_id=eq.{BILL_ID}")
    rest("DELETE", "bills", f"?id=eq.{BILL_ID}")
    rest("DELETE", "profiles", "?username=in.(p12testadmin,p12teststaff)")
    rest("DELETE", "stats_daily", "?date=eq.2030-01-05&revenue=eq.0&bill_count=eq.0")
    if admin_uid:
        api("DELETE", f"/auth/v1/admin/users/{admin_uid}", headers={"Authorization": "Bearer " + SERVICE})
    if staff_uid:
        api("DELETE", f"/auth/v1/admin/users/{staff_uid}", headers={"Authorization": "Bearer " + SERVICE})
    http(
        "DELETE",
        f"{URL}/storage/v1/object/bills/{IMAGE_PATH}",
        body=b"[]",
        headers={"apikey": SERVICE, "Authorization": "Bearer " + SERVICE, "Content-Type": "application/json"},
    )
    # verify không còn gì của user test
    _, left = rest("GET", "profiles", "?username=in.(p12testadmin,p12teststaff)&select=id")
    print("--- CLEANUP --- profiles con lai:", left)

failed = [r for r in results if not r[1]]
print(f"\n=== {len(results) - len(failed)}/{len(results)} PASS ===")
for name, _, detail in failed:
    print("FAILED:", name, detail)
sys.exit(1 if failed else 0)
