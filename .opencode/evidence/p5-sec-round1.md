# SEC REPORT — Phase P5 — Vòng 1

- Ngày: 2026-10-03 · Agent: **security-audit** · Gói đầu vào: phase P5, round 1, checklist S1–S15, prev `.opencode/evidence/p4-sec-round1.md`.
- Điều kiện chạy: QC P5 đã PASS vòng 2 (`.opencode/evidence/p5-qc-round2.md`) → `subagent.md §3` thoả.
- Skills/đọc trước: `AGENT.md` §5 (bằng chứng) + §6 (cấm kỵ), `subagent.md` §0/§1/§3/§3.3, `.opencode/skills/security/skill.md` (toàn bộ, §1 key, §2 chuẩn, §3 lệnh), `plan.md ## P5`, `design.md` §4.1 (bảng quyền), §5 (schema + `menu_version`), §7.3–7.4 (5 menu, emoji icon), `backend/skill.md` (đối chiếu RLS), báo cáo P4.
- Phạm vi thực tế: **2 nguồn** — (a) commit `893b240` (code CRUD P5: `api.ts`, `logic.ts`, `forms.tsx`, `ProductsPage.tsx`, `Modal/ConfirmDialog`, `fakeSupabase`, `zod` dep); (b) working tree 15 file (9 typefix + `ProductsPage.tsx` fix crash/a11y + `sw.ts`/`AppLayout`/`package.json`/`plan`/`state` + xóa 2 ảnh junk). Đối chiếu `scope_files` ↔ `{git diff --name-only HEAD; git ls-files -o --exclude-standard}` = **khớp** (thừa 2 file evidence QC của qc-test + 2 ảnh đã xóa = `off_plan_actions` đã ghi).
- **Không sửa file nào ngoài báo cáo này** (không sửa `state.json` theo đúng lệnh gói đầu vào — tóm tắt ≤30 dòng gửi ở final message để main-coding ghi `loop.last_report`). **Không migration, không đổi DB**: mọi truy vấn DB chỉ `SELECT`/`INSERT…ROLLBACK` trong transaction qua Management API (đã xác nhận không để lại thay đổi).

VERDICT: **PASS**
PHẠM VI: **hẹp** · BỀ MẶT: CRUD client-side 4 bảng menu (`categories/products/toppings/product_toppings`), input mới (tên SP/nhóm/topping, emoji `icon`, giá integer VND), render table/modal Sản phẩm, typefix 9 file, `sw.ts` precache.
TÓM TẮT: 15/15 hạng mục có kết quả (8 ✔ · 6 N-A · 2 ✘ cùng 2 issue MINOR, 0 BLOCKER/MAJOR). **S1** gitleaks 45 commits **0 leak** (+ `gitleaks dir` 5 hit toàn ở file gitignored: `.env` + `dist` JWT role=anon khớp `.env`); **S2** `npm audit` **0 vulnerabilities** (đầy đủ + `--omit=dev`). **S3 xác minh LIVE trên DB prod**: 13/13 bảng bật RLS, 4 bảng menu đúng `*_staff_all … using(session_fresh()) with check(session_fresh())`, **không policy mới/không thêm `using(true)`** (diff `supabase/` = 0 dòng), anon **0 grant**, `admin_email` không cấp cho client, chỉ `service_role` bypass RLS. **S7**: 0 sink HTML (`dangerouslySetInnerHTML/innerHTML/eval` = 0 khớp); 4 payload (`<script>`, `"><img onerror>`, `'; DROP TABLE…`, `<b>`) **escape đúng** khi render qua React (kiểm thực nghiệm) và **nhập được vào DB như data** trong transaction (không lỗi SQL). **S14**: CHECK live `products_price_check(price>0)`, `toppings_price_check`, `*_name_check(btrim<>'')` chặn giá ≤0/tên rỗng; `create_bill` (P1) vẫn tính lại giá server; client **không có** quyền `DELETE bills`/`UPDATE app_meta` → không tự bump `menu_version`. Phát hiện **1 MINOR mới [SEC-005]**: design cấm xóa nhóm (`ProductsPage.tsx:148`) nhưng **chặn ở client thôi** — server vẫn `grant DELETE` + policy `FOR ALL` cho `categories` và FK `products.category_id ON DELETE CASCADE` → đã tái hiện staff DELETE 1 nhóm làm **biến mất toàn bộ SP của nhóm** (rolled back) → backlog. Kế thừa **[SEC-001] MINOR (P4)** `public/_headers` thiếu security headers — sha1 file **giống hệt** P4 (`2eabab27…`) = không đổi, plan **P10-T1** sở hữu. Gate P5 (0 BLOCKER/MAJOR) = **qua**.

---

## KẾT QUẢ THEO HẠNG MỤC (S1–S15)

| # | KQ | Cách kiểm → output (≤5 dòng) | Lý do / kết luận |
|---|---|---|---|
| **S1** Secret | ✔ | `gitleaks detect -v --redact --exit-code 1` → **exit 0**, `INF 45 commits scanned`, `INF no leaks found`. `gitleaks dir .` (bắt file chưa commit) → **5 hit**: `.env:9,10,13,21` (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `VITE_SUPABASE_ANON_KEY`) + `dist/assets/index-Dc2MFUfy.js:23` | 5/5 nằm ở file **gitignored, không track**: `git check-ignore -v .env dist` → `.gitignore:2` + `:9`; `git ls-files \| grep -c "^dist/"` = **0**; `gitleaks detect` 45 commit không hề thấy `.env` → chưa bao giờ bị commit. JWT trong `dist` decode = `{"role":"anon","ref":"tsnrggxczipzqvvpcbld"}` **sha256/payload khớp `VITE_SUPABASE_ANON_KEY`** → anon public theo `security/skill.md §1`. `grep -rc "service_role" dist` = **0**. |
| **S2** Phụ thuộc | ✔ | `npm audit --omit=dev` → `found 0 vulnerabilities`, **exit 0**; `npm audit` (đầy đủ, kể dev) → `{"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}` | Dep mới duy nhất của P5 = `zod@^4.6.5` (`package.json` diff `893b240`) → 0 CVE. |
| **S3** RLS | ✔ **(live)** | `git diff 893b240~1..HEAD --name-only -- supabase/` + `git diff HEAD -- supabase/` → **rỗng (0 dòng)**. `pg_tables` (prod): 13/13 `rowsecurity=true`. `pg_policies`: `categories/products/toppings/product_toppings` → `*_staff_all`, `cmd=ALL`, `roles={authenticated}`, `qual=session_fresh()`, `with_check=session_fresh()` | **Không policy mới, không `using(true)` mới trong P5**; policy `app_meta_read using(true)` là của P1/P3 và **bị column-grant chặn**: `select grantee,cols from information_schema.column_privileges where table_name='app_meta'` → `anon={id,bootstrapped,menu_version}`, `authenticated={id,bootstrapped,menu_version,schema_version,updated_at}` — **không có `admin_email`**. `pg_roles`: `anon/authenticated rolbypassrls=false`, chỉ `service_role=true`. Không có TRUNCATE grant (`role_table_grants` chỉ INSERT,SELECT,UPDATE,DELETE). |
| **S4** Phân quyền | ✔* | Truy vấn live với role giả lập trong `BEGIN…ROLLBACK`: `role=anon → ERROR 42501 permission denied for table products`; `role=authenticated` (không session) → `session_fresh()=false`, `n_products=0`; `UPDATE bills → permission denied`; `UPDATE app_meta.menu_version → permission denied`; `SELECT admin_email → permission denied`; INSERT products khi `fresh=false` → **`ERROR 42501 new row violates row-level security policy for table "products"`** | Mọi "từ chối phía server" đều **server-side** ✔. P5 **không có** hành động admin-only mới (CRUD menu = cả admin & staff theo `design.md §4.1` → EF `admin-users` không đổi). \*Trừ 1 MINOR **[SEC-005]**: "không xóa được nhóm" chỉ chặn ở client → xem mục LỖI. |
| **S5** Xác thực | N-A | `git diff HEAD -- src/features/auth/` → `loginApi.ts` **+1 dòng type** (`error?: string` trong assertion), 3 file test chỉ đổi typing mock (`as const`, `Mock<T>`, `Promise<{…}>`) | 0 đổi hành vi auth/lockout/OTP/token. Lockout 5/15' + OTP giữ nguyên (đã audit P3). |
| **S6** Bootstrap | N-A | `git diff HEAD -- src/features/setup/SetupStage.test.tsx` → **chỉ 6 chỗ `ok: true as const` / `ok: false as const`** | 0 đổi logic bootstrap/EF; `SetupStage.tsx` không đổi. |
| **S7** Injection/XSS | ✔ | `grep -rnE "dangerouslySetInnerHTML\|innerHTML\s*=\|outerHTML\|insertAdjacentHTML\|\beval\(\|new Function\(" src index.html e2e public` → **exit 1, 0 khớp**. `grep -rnE "<img\|src=\|href=\|style=\{" src/features/products/` → **0**. Render thực nghiệm (React 19 `renderToStaticMarkup`, `/tmp/opencode/xss_probe.cjs`) → bảng payload bên dưới | Tên/icon **chỉ đi vào text node + `aria-label`** (`ProductsPage.tsx:308,349,359,362,401,453,463`), React escape cả 2 (bảng payload bên dưới). Không có URL attribute → không có `javascript:` injection. SQLi: **không có chuỗi SQL nào** (`grep "\.rpc(\|sql\`" src` → chỉ `outbox.ts:78 rpc('create_bill',…)` jsonb param của P1); không `.or()/.ilike()/.filter()` với input người dùng (PostgREST builder = prepared params); `filterProducts` dùng `String.includes` → **không có regex injection/ReDoS**. Nhập thật payload XSS/SQLi vào DB qua `INSERT` (transaction, rollback): **lệnh chạy thành công, không lỗi cú pháp SQL** → payload chỉ là *data*. |
| **S8** IDOR | N-A | `git diff --name-only` không có file Storage/signed URL/bill; `grep "from('bills')\|from('bill_items')"` trong `src/features/products/` → **0** | P5 chỉ đụng 4 bảng menu. Đơn nguyên (single-tenant), mọi staff cùng quyền xem/sửa toàn bộ menu theo §4.1 → không có khái niệm "ID của người khác" ở bề mặt này. |
| **S9** Storage | N-A | Không có bucket/upload/EF Storage trong diff | — |
| **S10** Rate limit | N-A | Không sửa EF, lockout, OTP, `rate_limit_*` | CRUD menu không thuộc bề mặt bắn nhanh của S10 (đăng nhập/tạo bill/OTP). *Quan sát:* PostgREST không rate-limit riêng cho menu — ghi nhận, không tính lỗi. |
| **S11** Header | ✘ **MINOR (kế thừa)** | `sha1sum public/_headers` → `2eabab27176a63f3cd3847dea6cded862342e3b3` (**trùng khớp 100%** sig của [SEC-001] P4); `git diff HEAD --name-only -- public/` → rỗng; `grep -c "Content-Security-Policy\|Strict-Transport-Security\|X-Content-Type-Options\|Referrer-Policy\|Permissions-Policy\|X-Frame-Options" public/_headers` → **0** | Vẫn chỉ 5 block Cache-Control. **Không phải lỗi của P5** (0 thay đổi `public/`), giữ nguyên backlog **P10-T1** theo đúng báo cáo P4 → không chặn gate. |
| **S12** Cache/PWA | ✔ | `git diff HEAD -- src/sw.ts` → **chỉ cast type** `self → swScope` (0 đổi logic); đọc `dist/sw.js` thật: precache **21 entry** = shell (`index.html`, `assets/*`, `icons/*`, `fonts/*`, `manifest.webmanifest`); `grep -E "supabase\|rest/v1\|auth/v1\|storage/v1\|version.json" dist/sw.js` → **0** | Precache **không đổi về bản chất** so với P4 (vẫn 21 entry shell, 0 URL API, không `navigateFallback`, không `skipWaiting` tự động, không fetch origin ngoài). `version.json` vẫn không nằm trong precache. |
| **S13** Dữ liệu nhạy cảm | ✔ | `grep -rn "console\." src/features/products/` → **2 chỗ**, đều `console.error('[products api]', error)` (`api.ts:79,100` — object lỗi PostgREST); `grep -rn "localStorage\|sessionStorage" src/features/products/ src/app/AppLayout.tsx` → **0**; `grep -rnE "setItem\([^)]*(token\|password\|senha)" src` → 0 | Không lưu token/mật khẩu; không log PII (tên SP/ giá không bị log — chỉ log lỗi server khi ném). `typefix` 9 file không đưa giá trị nhạy cảm vào log. |
| **S14** Logic nghiệp vụ | ✔ **(live)** | `pg_constraint` (prod): `products_price_check CHECK (price > 0)`, `toppings_price_check CHECK (price > 0)`, `products/categories/toppings_name_check CHECK (btrim(name) <> '')`, `bills_total_check CHECK (total >= 0)`. Thử thật trong `BEGIN…ROLLBACK`: `price=-5000` → **`ERROR 23514 … products_price_check`**; `name='  '` → **`ERROR 23514 … products_name_check`**. `role=authenticated` → `UPDATE bills` → **permission denied** (không có grant DELETE/UPDATE bills) | P5 **chỉ ghi menu** → đã có **2 lớp**: zod client (`.int().positive()`, `logic.ts:22-25`) + **CHECK server**. Giao diện giá sai không đi qua đường nào khác: `grep "from('bills')" src/features/products` = 0. `create_bill` (P1, không đổi) vẫn `v_price := v_prod.price` khi lệch (`create_bill_rpc.sql:138-149`) → giá client sai bị server tính lại + ghi `price_drift`. `app_meta.menu_version` **chỉ trigger tăng**, client không có `UPDATE` grant (đã test) → không tự bump. Stats `stats_*` tách bảng + trigger definer → dọn bill không mất. |
| **S15** Phiên | N-A | `git diff HEAD` trên `supabase.ts`, `session*`, `hardRefresh.ts`, `sessionGuard` → **không có file source nào đổi** (chỉ `hardRefresh.test.ts` + `sessionGuard.hook.test.tsx` đổi typing mock) | 0 đổi cấu hình phiên; `session_fresh()` 7 ngày (P3) vẫn là policy qual duy nhất của 4 bảng menu (xem S3). |

### Bằng chứng S7 — render thực nghiệm 4 payload (React 19, cùng runtime với app)

| Payload | Text node (`{product.name}` / `{product.icon}`) | `aria-label={`Ẩn ${name}`}` |
|---|---|---|
| `<script>alert('xss')</script>` | `&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;` | — |
| `"><img src=x onerror=alert(1)>` | `&quot;&gt;&lt;img src=x onerror=alert(1)&gt;` | `aria-label="Ẩn &quot;&gt;&lt;img src=x onerror=alert(1)&gt;"` |
| `'; DROP TABLE products;--` | `&#x27;; DROP TABLE products;--` | — |
| `Trà "đào" & <b>test</b>` | `Trà &quot;đào&quot; &amp; &lt;b&gt;test&lt;/b&gt;` | — |

- Đường raw-HTML (không dùng trong app) cho thấy nếu có sink thì payload **không** bị escape — app **không có** sink đó (0 khớp grep).
- Nhập payload SQLi thật qua PostgREST/`INSERT` (transaction): **không lỗi cú pháp** → tham số hoá, payload chỉ là dữ liệu; sau `ROLLBACK` kiểm tra lại: `select count(*) where name like '%onerror%' or '%<script>%'` → **0** (DB sạch).

### Bằng chứng S3/S4 — truy vấn live (Management API, mọi lệnh có `BEGIN…ROLLBACK`)

| Thử | Vai trò | Kết quả thật |
|---|---|---|
| `select count(*) from products` | `anon` | `ERROR 42501 permission denied for table products` |
| `session_fresh()` + `count(products)` | `authenticated` (không session) | `{"fresh":false,"n_products":0,"n_bills":0}` |
| `insert into products (…'<script>…')` | `authenticated` (không session) | `ERROR 42501 new row violates row-level security policy for table "products"` |
| `insert into products (price=-5000)` | `authenticated` (fresh) | `ERROR 23514 … products_price_check` |
| `insert into products (name='  ')` | `authenticated` (fresh) | `ERROR 23514 … products_name_check` |
| `update bills set total=1` | `authenticated` (fresh) | `ERROR 42501 permission denied for table bills` |
| `update app_meta set menu_version=999999` | `authenticated` (fresh) | `ERROR 42501 permission denied for table app_meta` |
| `select admin_email from app_meta` | `authenticated` (fresh) | `ERROR 42501 permission denied` (column grant) |
| Sau cùng | `postgres` | `{"cats":7,"prods":0,"menu_version":1}` — **không còn gì của các test** |

---

## LỖI

```
[SEC-005] MINOR · CWE-640/OWASP A01 (Broken Access Control — thiếu enforce phía server)
  · supabase/migrations/20261001154825_rls_policies.sql:16-18,36-37 ·
    supabase/migrations/20261001152827_core_menu_tables.sql:42 ·
    src/features/products/ProductsPage.tsx:148 · src/features/products/api.ts:193
  · sig: ba86dde35a000e105bf57066ba82a07af931a2a5 (rls_policies.sql) /
          57ecdb2115b9d9df7a4afc5b6296b16eedcba34a (core_menu_tables.sql) /
          d815f948cd087c056a34df5f33308d0996c00e9c (ProductsPage.tsx)
  Tái hiện (đã chạy, rollback — DB không đổi):
    begin; set local role authenticated;
      set local request.jwt.claims = '{"sub":"1111…","role":"authenticated","iat":<now>}';
      insert into categories (id,name,icon,sort_order,is_active) values ('9999…','Nhom Kiem Thu SEC','🧪',999,true);
      insert into products (id,category_id,name,price,icon,is_active) values ('8888…','9999…','SP Kiem Thu',12000,'🧋',true);
      delete from categories where id='9999…';
      select (select count(*) from categories where id='9999…') as cat_after,
             (select count(*) from products where category_id='9999…') as prod_after;
    rollback;
    → [{"cat_after":0,"prod_after":0}]   # SP vừa tạo bị CASCADE biến mất
  Tác động: rule nghiệp vụ "Không hỗ trợ xóa nhóm — chỉ ẩn/hiện" (plan P5-T1, design §7.3) CHỈ được chặn ở client
    (ProductsPage.tsx:148 trả message; api.ts:193 không nhận kind='category') → client sửa, hoặc ai có JWT staff
    hợp lệ, gọi thẳng PostgREST DELETE /rest/v1/categories?id=eq.… là xóa được nhóm, kèm ON DELETE CASCADE
    xoá sạch toàn bộ sản phẩm thuộc nhóm đó. Staff vốn được phép xóa SP từng cái nên KHÔNG phải leo thang quyền
    (bill_items chỉ SET NULL + name_snapshot giữ nguyên, stats_* không mất) → mức MINOR, không BLOCKER/MAJOR.
  Bằng chứng: pg_constraint → products_category_id_fkey = "REFERENCES categories(id) ON DELETE CASCADE";
    role_table_grants → authenticated có DELETE trên categories; pg_policies → categories_staff_all FOR ALL.
  Gợi ý hướng sửa (1-2 dòng): thu hồi đúng 1 quyền —
    revoke delete on public.categories from authenticated;   -- giữ INSERT/UPDATE/SELECT
    (hoặc FK ON DELETE RESTRICT + bỏ policy DELETE); chạy lại `supabase test db` + e2e 96/96.
  Lưu ý phạm vi: không phải code P5 sinh ra (migration P1), nhưng P5 là phase đưa bề mặt CRUD menu ra →
    đưa vào backlog, đề xuất **P10-T2 (hardening quyền)**; không chặn gate P5.
```

```
[SEC-001] MINOR · OWASP A05:2021/CWE-693 · public/_headers:1 · sig:2eabab27176a63f3cd3847dea6cded862342e3b3
  (TRÙNG KHỚP 100% với [SEC-001] của báo cáo P4 — file không bị sửa trong P5: git diff HEAD -- public/ rỗng)
  Tái hiện: grep -cE "Content-Security-Policy|Strict-Transport-Security|X-Content-Type-Options|Referrer-Policy|Permissions-Policy|X-Frame-Options" public/_headers → 0
  Tác động: thiếu CSP/HSTS/nosniff/Referrer-Policy/Permissions-Policy → không có lớp phòng vệ thứ 2 chống XSS + clickjacking màn login.
  Trạng thái: KẾ THỪA từ P4, plan **P10-T1** đã sở hữu → giữ nguyên backlog, KHÔNG tính lỗi mới của P5, không chặn gate.
  (Chi tiết + gợi ý CSP đầy đủ: .opencode/evidence/p4-sec-round1.md, mục LỖI.)
```

**Không có BLOCKER/MAJOR.** Gate P5 theo `subagent.md §4.2` (0 BLOCKER/MAJOR, MINOR → backlog) = **qua**.

---

## NGHI VẤN / QUAN SÁT (chưa chứng minh → không chặn)

- **Không có nghi vấn mới.** 2 mục standing của P4 còn nguyên trạng thái, **không reopen** (không thuộc diff P5): **N-002** `public/_redirects` có thể nuốt `/sw.js`+`/version.json` → smoke `curl -I` ở **P11-T4**; **SEC-003** signup pre-bootstrap → theo `p3-sec-round2.md`.
- **Q-1 (quan sát, không tính lỗi):** `api.ts:86` `newId()` có nhánh fallback `Math.random()` khi thiếu `crypto.randomUUID` → UUID dự đoán được. Trong thực tế app chỉ chạy trên HTTPS (secure context) nên nhánh này không kích hoạt, và RLS không dựa vào ID (single-tenant, mọi staff cùng quyền) → không có bề mặt IDOR. Đề nghị ghi backlog nhỏ khi P10 rà.
- **Q-2 (quan sát, thuộc QC/tích hợp):** `saveProduct` ghi lại `product_toppings` bằng `delete().eq('product_id')` rồi `insert` — **không nguyên tử** (nếu insert lỗi giữa chừng thì mất link topping; mỗi lần cũng bump `menu_version`). Không phải rủi ro bảo mật (chỉ dữ liệu menu của chính thiết bị/quán) → chuyển sang QC/P6.
- **Q-3 (quan sát):** `icon` là text tự do tối đa 16 ký tự (`logic.ts:25`), có thể chứa ký tự lạ (ZWJ, RTL override) — render `aria-hidden` ở table, không qua URL/HTML → không có tác động bảo mật.

## KHÔNG KIỂM ĐƯỢC

- **Đăng nhập thật bằng JWT staff**: không có credential tài khoản → kiểm RLS bằng **vai trò `anon`/`authenticated` + `request.jwt.claims` giả lập** trong transaction (đúng cách `session_fresh()` đọc claims). Nhánh `session_id` thật chưa được bắn; nhánh `iat<7d` đã xác nhận `fresh=true`.
- **Header thật trên môi trường Pages**: không deploy → S11 chấm theo nội dung `_headers` (đã xác nhận không đổi) → chờ **P10-T1/P11-T3**.
- **`supabase test db` / `supabase db advisors`**: CLI không được link local (`supabase/.temp/` không có `project-ref`) → thay bằng truy vấn catalog thật qua Management API (`pg_tables`, `pg_policies`, `pg_constraint`, `role_table_grants`, `column_privileges`) + thử `SET ROLE` thật — mạnh hơn test static, và mọi lệnh đều `ROLLBACK`.
- **E2E/XSS trên trình duyệt thật**: không chạy Playwright trong phiên SEC (QC vòng 2 đã chạy 96/96) — phần XSS chứng minh bằng grep 0 sink + render thực nghiệm React.

## SỐ LIỆU

| Hạng mục | Số liệu |
|---|---|
| gitleaks | `detect`: **45 commits / 2.42 MB / 0 leak / exit 0** (8.30.1) · `dir`: **5 hit = 100% file gitignored** (`.env` ×4, `dist` ×1 = anon JWT) |
| npm audit | `found 0 vulnerabilities` **exit 0** — chạy cả bản đầy đủ lẫn `--omit=dev`; breakdown `{total:0}` |
| XSS sink | **0** khớp `dangerouslySetInnerHTML/innerHTML/outerHTML/insertAdjacentHTML/eval/new Function` trên `src+index.html+e2e+public` · payload thử: **4** · ghi DB thành công (rollback) **0 lỗi SQL** |
| DB live | **13/13** bảng bật RLS · **4/4** policy menu = `*_staff_all` + `session_fresh()` (qual & with_check) · policy mới trong P5 = **0** · dòng `supabase/` trong diff P5 = **0** · bypassRLS = **chỉ service_role** |
| Truy vấn live | **10 phép** (6 từ chối đúng chỗ, 2 CHECK bắt đúng, 1 payload vào DB như data, 1 xác minh sạch sau rollback) — 0 thay đổi dữ liệu |
| SW | precache **21** entry shell · URL khớp API = **0** · `version.json` không precache · diff `sw.ts` = **chỉ cast type** |
| Test phụ trợ | `npm run typecheck` → **exit 0** · `npx vitest run` → **299/299 pass (30 files)** |

## GỬI main-coding (để ghi `state.json → loop.last_report`, ≤30 dòng)

```
SEC P5 vong 1: VERDICT PASS - 0 BLOCKER/MAJOR, 2 MINOR (1 moi, 1 ke thua). S1 gitleaks 8.30.1: detect 45 commits/0 leak/exit 0; dir 5 hit = 100% file gitignored (.env x4, dist x1 JWT role=anon khop VITE_SUPABASE_ANON_KEY), 0 service_role. S2 npm audit: 0 vulnerabilities (ca day du va --omit=dev, exit 0; zod 4.6.5 dep moi cua P5). S3 (live DB prod, toan bo BEGIN..ROLLBACK): 13/13 bang RLS on; 4 bang menu van dung *_staff_all using+with check session_fresh(); diff supabase/ = 0 dong -> KHONG policy moi, KHONG using(true) moi; anon 0 grant; admin_email khong cap cho client; chi service_role bypassRLS. S4 (live): anon doc products -> 42501; authenticated khong session -> session_fresh=false/0 dong/insert bi chan 42501; UPDATE bills, UPDATE app_meta.menu_version, SELECT admin_email deu 42501 -> tu choi SERVER-side. S7: 0 sink (dangerouslySetInnerHTML/innerHTML/eval = 0 khop), 4 payload (<script>, "><img onerror>, '; DROP TABLE, <b>) duoc React escape ca text node va aria-label (render thuc nghiem React 19); khong co chuSQL nao (chi rpc create_bill jsonb cua P1), khong .or()/.ilike() input, filterProducts dung includes (khong regex); payload SQLi nhap duoc vao DB la DATA, khong loi SQL. S14 (live): CHECK products_price_check(price>0), toppings_price_check, *_name_check -> gia -5000 va ten rong bi 23514; create_bill P1 van tinh lai gia; client khong co DELETE bills/UPDATE app_meta -> khong tu bump menu_version. S12: sw.ts diff chi cast type; precache 21 entry shell, 0 URL API, khong doi so voi P4. S13: chi 2 console.error (object loi PostgREST), khong luu token/mat khau. S5/S6/S8/S9/S10/S15 N/A dung pham vi (9 file typefix = typing thuan, 0 doi hanh vi; khong dot storage/bill/EF/rate-limit/phan huy/luong xac thuc). MOI: [SEC-005] MINOR rls_policies.sql:16-18,36-37 + core_menu_tables.sql:42 + ProductsPage.tsx:148 - rule "khong xoa nhom, chi an/ hien" chi chan o CLIENT; server van grant DELETE categories + policy FOR ALL + FK products.category_id ON DELETE CASCADE -> da tai hien staff DELETE 1 nhom lam mat toan bo SP cua nhom (rollback, DB sach); khong phai leo thang quyen (staff van duoc xoa SP tung cai, bill_items SET NULL + snapshot, stats khong mat) -> MINOR, de nghi backlog P10-T2 (revoke delete on public.categories from authenticated). Ke thua: [SEC-001] MINOR public/_headers sha1 2eabab27... TRUNG KHOP P4 (khong doi trong P5) -> giu backlog P10-T1. Khong reopen N-002 (P11-T4) va SEC-003 (P3). Quan sat khong tinh loi: newId() fallback Math.random (khong kich hoat tren https, RLS khong dua vao ID); saveProduct xoa+chen product_toppings khong nguyen tu (QC/P6); icon text tu do 16 ky tu. KHONG sua file nao ngoai bao cao (state.json de main-coding ghi). Chi tiet: .opencode/evidence/p5-sec-round1.md
```
