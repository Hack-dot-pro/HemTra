# SEC REPORT — Phase P7 — Vòng 2

- **Ngày**: 2026-10-04 (UTC) · **Agent**: `security-audit` (subagent.md §3) · **Model**: mimo-v2.6-flash-free
- **Gói**: `phase P7 · round 2 · tasks_done [P7-T1..T5] + sửa NV5 vòng 1 (không code nào ghi bills.image_path) + 3 MINOR của QC vòng 2`
- **prev_report**: `.opencode/evidence/p7-sec-round1.md` (VERDICT PASS · 1 MINOR SEC-006 kế thừa + 7 NGHI VẤN)
- **skills_read (trước khi làm việc)**: `subagent.md` (§1 + §3 checklist SEC + §3.3 mẫu) · `AGENT.md` (§5, §11.4, §12) · `.opencode/skills/security/skill.md` (toàn bộ) · `design.md` §4.1/§5/§6.2/§6.3/§6.4/§9 · `p7-sec-round1.md` (toàn bộ) · đọc kèm: `loop.md` (thang độ lỗi), `p7-qc-round2.md` (cổng QC), `plan.md` [P7]
- **Điều kiện chạy**: QC P7 **PASS vòng 2** (`p7-qc-round2.md`) ✔ · quyền: chỉ đọc + chạy lệnh kiểm tra + ghi báo cáo này; **không sửa file code nào**.
- **Dọn test trên cloud (đã đếm lại cuối phiên)**: 1 user Auth tạm (`t7sec2-tmp@hem.local`) đã xóa → `users = 2` (`pquangvinh1999@gmail.com`, `t7staff@hem.local`) · `profiles = 2` (admin, t7staff) · **11 fixture bill tạm đã xóa** (`HT-261004-9001..9005`, `9008`, `9011`, `.*`, `A)` + 205 bill hết hạn của test batch) → `bills = 1, bill_items = 1, sum(total) = 25000` · `stats_daily` về đúng **1 dòng `2026-10-04 = 25000/1`** (đã trừ tay 9+1 dòng fixture trigger) · bucket còn đúng **2 file cũ** (`2026/10/HT-261001-0004.png` 70 B tạo 2026-10-01, `2026/10/HT-261004-0001.png` 34036 B tạo 2026-10-03) — file squatting `HT-261004-9999.png` đã xóa · `login_attempts = 5` · `cron.job = 1` · secret tạm trong `/tmp/opencode` đã xóa.

---

```
## SEC REPORT — Phase P7 — Vòng 2
VERDICT: PASS
PHẠM VI: hẹp · BỀ MẶT: RPC mới `public.set_bill_image` (SECURITY DEFINER, grant cho
  authenticated) · `src/lib/billUpload.ts` (`linkBillImage` + nuốt lỗi 409 khi upload trùng)
  · trang /bills (đọc + signed URL 120 s) · EF `cleanup-bills` + pg_cron/pg_net · bucket
  `bills` (private) · comment migration `20261004020058` · test/e2e mock RPC (không đổi
  hành vi app) · secret/dependency.
```

**Tóm tắt**: 15/15 hạng mục có kết quả — **7 ✔ · 5 N-A · 3 ✘ (đều MINOR: 2 mới + 1 kế thừa đã "thực tế hóa", 0 BLOCKER / 0 MAJOR)**. Trọng tâm vòng 2 là RPC `set_bill_image` bị tấn công thật bằng **18 payload** qua cả `set role authenticated` trên DB linked lẫn REST `/rest/v1/rpc/` với JWT thật: mọi payload sai (p_code rỗng, p_path rỗng, mã khác, mã không tồn tại, traversal `../../`, `.jpg`, path không chứa mã, trailing space/newline) đều bị **400/P0001 raise**; `anon` → **42501**; `service_role` → chạy được; **ghi đè bill đã có ảnh → `false` và giá trị cũ giữ nguyên**; `SET image_path=''` → raise; `pg_policies bills` **vẫn chỉ `bills_read` SELECT** và `UPDATE/INSERT/DELETE` bằng authenticated vẫn **42501 permission denied for table bills** (cả SQL lẫn REST 403). 3 chỗ chưa được chặn đúng: **(1)** path **sai tháng** `1999/01/<mã>.png` được chấp nhận `true` và ghi thật; **(2)** RPC **không có gate `session_fresh()`** (trong cùng phiên: `fresh=false` nhưng `rpc=true`); **(3)** [SEC-006] upload mã chưa phát sinh vẫn **200** — và nay tác động **đã thực tế hóa** vì NV5 nối luồng ghi `image_path` + `createBillUploader` nuốt 409 rồi đi gắn ảnh. Regression vòng 1 (S3/S4/S8/S9/S13/S14) xanh; `scripts/test-p7-cleanup.sh` **PASS=14 FAIL=0**; batch limit tái kiểm với **205 bill** → `200/hasMore:true` rồi `5/hasMore:false`.

---

## KẾT QUẢ S1–S15

| # | KQ | Lệnh / cách kiểm | Output (trích) |
|---|----|------------------|----------------|
| S1 | ✔ | (a) `gitleaks detect --source . --no-banner --redact` (binary `/tmp/opencode/bin/gitleaks`, 8.24.3); (b) `--no-git` + `--report-format json`; (c) `grep` pattern secret trong **delta** | (a) `58 commits scanned` · `no leaks found` · **exit 0**. (b) **6 hit = 5 ở `.env`** (jwt dòng 9/10/21, generic-api-key 13/22) **+ 1 JWT `role=anon` ở `dist/assets/index-BuaC8qlY.js`** — kiểm tay: `git check-ignore -v .env dist` → `.gitignore:2` / `.gitignore:9`; `git log --all --oneline -- .env` → rỗng; **không commit**. (c) migration `20261004040500`/`20261004020058`, `billUpload.ts`, `billUpload.test.ts`, `PosPage.test.tsx`, `p6-checkout.spec.ts` → chỉ khớp **tên vault** `hemtra_cron_secret` (`020058:48`), **không giá trị**; `grep -c "CRON_SECRET\|hemtra_cron_secret" dist/assets/*.js` → **0** |
| S2 | ✔ | `npm audit --omit=dev` | `found 0 vulnerabilities` · **exit 0** |
| S3 | ✘ | (a) `pg_policies where tablename='bills'`; (b) `set role authenticated` + `UPDATE/INSERT/DELETE`; (c) REST JWT thật; (d) `pg_proc`/`has_function_privilege`; (e) `pg_tables where not rowsecurity` | (a) **chỉ `bills_read` / SELECT / `session_fresh()`** ✔. (b) `update/delete/insert` → **`42501 permission denied for table bills`** (3/3). (c) `PATCH`+`DELETE …/bills?code=eq.HT-261004-0001` → **HTTP 403 `42501`** ✔. (d) `set_bill_image`: `prosecdef=true`, `proconfig=[search_path=""]`, owner `postgres`, EXECUTE: postgres/T, authenticated/**T**, anon/**F**; `run_cleanup_bills`: anon F, authenticated **F** ✔. (e) **0 bảng public thiếu RLS**. → ✘ vì **[SEC-009]**: cùng `set role authenticated`, `set_bill_image('HT-261004-9008','1999/01/HT-261004-9008.png')` → **`true`** và dòng bill bị ghi thật (viết vượt policy chỉ-SELECT với input không hợp lệ) |
| S4 | ✔ | EF thật: GET không auth / POST sai secret / `X-Cron-Secret` / OPTIONS origin lạ / gọi đúng đường cron | GET không auth → **405 `{"error":"Chỉ chấp nhận POST."}`**; POST `Bearer wrong-secret-abc` → **401**; POST chỉ `X-Cron-Secret: anything` → **401**; `Origin: https://evil.example.com` → **không có `access-control-allow-origin`**; gọi đúng đường cron qua `run_cleanup_bills()` (đọc vault, không in secret) → `net._http_response id=13,14` **`200 {"scanned":…,"hasMore":false}`** |
| S5 | N-A | `git diff --name-only HEAD \| grep -iE "session\|auth\|login\|rate\|otp\|bootstrap\|lockout"` | **NONE** — P7-v2 không đụng auth/lockout/token (đã PASS ở P3) |
| S6 | N-A | Cùng trên + không migration bootstrap | Không đụng `bootstrap-admin` / `app_meta.bootstrapped` |
| S7 | ✔ | (a) grep sink XSS trong delta; (b) tấn công **code → regex** (`v_code` ghép vào pattern plpgsql); (c) đối chiếu nguồn cấp `code` | (a) `grep -rn "dangerouslySetInnerHTML\|innerHTML\|eval(\|new Function" src/features/bills src/lib/billUpload.ts e2e/p6-checkout.spec.ts` → **0**. (b) **tái hiện được nhưng KHÔNG reachable**: chèn bill `code='.*'` (chỉ `postgres` mới làm được) → `set_bill_image('.*','2026/10/evil.png')` → **`true`** (regex thành `…/\.*\.png$`); `code='A)'` → **`2201B invalid regular expression: parentheses () not balanced`** (fail-closed, không thực thi). (c) `code` không đến từ input người dùng: online = `next_bill_code()` → `'HT-'\|\|to_char(vn_day,'YYMMDD')\|\|'-'\|\|lpad(...)`; offline `p_offline_code` bị chặn `!~ '^HT-[0-9]{6}-OFF-[A-Za-z0-9]{4}$'` (`20261001155441:87`); `authenticated` **INSERT bills → 42501** (dòng S3) → **không tạo được code chứa metachar** → không xếp lỗi; filter `code` vẫn `ilike + escapeLike` (`api.ts:84`) |
| S8 | ✔ | Signed URL **thật** theo đúng dòng client `api.ts createSignedUrl(path,120)` (token JWT thật) | claims `{"iat":1791094157,"exp":1791094277}` → **delta = 120 s đúng**; GET ngay → **200 `image/png` 34036 B**; sign `expiresIn:1` + chờ 3 s → **400 `{"statusCode":"400","error":"InvalidJWT","message":"\"exp\" claim timestamp check failed"}`**; anon GET thẳng không ký → **400 `NoSuchKey`** (không lộ sự tồn tại) |
| S9 | ✘ | DELETE/upsert/sai loại/quá lớn từ JWT thật + rà code client + **test squatting** | `DELETE …/bills/2026/10/HT-261004-0001.png` → **400 `{"statusCode":"403","code":"AccessDenied"}`**; `.txt` → **415 `InvalidMimeType`**; 400 KB → **413 `EntityTooLarge`**; `?upsert=true` file đang có → **409 `KeyAlreadyExists`** và `HT-261004-0001.png` **vẫn 34036 B**; bucket `public=false, file_size_limit=307200, allowed_mime_types=[image/png]`; code client **chỉ `.upload()`** (`billUpload.ts:34`) + `.createSignedUrl()`, **0 `.remove()`/`.delete()` storage**, `BillsPage` không nút xóa. → ✘ vì **[SEC-006] còn hiệu lực**: `POST …/bills/2026/10/HT-261004-9999.png` (mã **chưa bao giờ** được `next_bill_code()` cấp) → **HTTP 200 `{"Key":"bills/2026/10/HT-261004-9999.png",…}`** (file tạm đã xóa) |
| S10 | N-A | Đối chiếu diff ↔ checklist | Không thêm endpoint đăng nhập/OTP/tạo bill → không có bề mặt rate-limit mới; EF `cleanup-bills` vẫn bắt buộc secret 44 ký tự + `safeEqual` |
| S11 | N-A | `git diff --stat -- public/ src/sw.ts index.html vite.config.ts` + `sha1sum` | **Rỗng** (không đổi bề mặt header). `sha1sum public/_headers` = `2eabab27176a63f3cd3847dea6cded862342e3b3` — **trùng 100%** sig vòng 1/`[SEC-001]` P4 → không xấu đi, vẫn backlog P10-T1 |
| S12 | N-A | Cùng trên (SW/manifest/vite) | **Rỗng** — không đổi bề mặt SW trong P7-v2 (đã PASS ở P6) |
| S13 | ✔ | Đọc log code delta + quét log DB thật + bundle | `net._http_response` (`count=14`): `content ilike '%Bearer%'` → **0**, `headers ilike '%hemtra_cron_secret%'` → **0**; nội dung chỉ `{"scanned":…}`; EF `console.log` = `JSON.stringify(summary)` (`index.ts:137`) — delta chỉ đổi **comment**; `grep console.log src/features/bills src/lib/billUpload.ts` → **0**; `grep -c CRON_SECRET dist/assets/*.js` → **0**; CORS evil origin → không ACAO |
| S14 | ✔ | `bash scripts/test-p7-cleanup.sh` + 2 lần EF với **205 bill hết hạn** | script → **`=== KET QUA: PASS=14 FAIL=0 ===` exit 0** (cron `0 0 * * *` active, anon revoke, `request_id=14 → 200 {"scanned":1,"filesRemoved":1,"rowsDeleted":1,…}`, bill hết hạn gone / **bill còn hạn `OK:kept`**, file Storage `list 1 → 0`, `stats_daily 75000/12` & `alltime 3/45000` không đổi). Batch: chèn **205** bill hết hạn → lần 1 **`{"scanned":200,"filesRemoved":0,"rowsDeleted":200,"hasMore":true}`**, lần 2 **`{"scanned":5,…,"hasMore":false}`**, `expired_left=0`; bill thật `HT-261004-0001` còn nguyên; stats về `25000/1` |
| S15 | ✘ | Đọc `private.session_fresh()` + **demo trong cùng 1 phiên DB** | `set role authenticated; set request.jwt.claims to '{"…","session_id":"99999999-…"}'; select public.session_fresh(), public.set_bill_image('HT-261004-9011','2026/10/HT-261004-9011.png')` → **`fresh=false, rpc_result=true`** + `image_path` **được ghi thật** → ✘ vì **[SEC-010]**: RPC không có gate 7 ngày (khác `bills_read` / `bills_objects_insert` đều gọi `session_fresh()`) |

**Tool**: `gitleaks 8.24.3` → 58 commits / **0 leak** / exit 0 · `--no-git` → 6 hit (5 `.env` gitignored + 1 anon JWT `dist`) · `npm audit --omit=dev` → **0 vulnerabilities** / exit 0 · `npx supabase@2.119.0 migration list --linked` → **13/13 khớp, 0 drift** · `db advisors --linked` → **7 WARN** (vòng trước 6 → **+1 = `set_bill_image` "Signed-In Users Can Execute SECURITY DEFINER Function"** = đúng ý đồ của hàm, không phải lỗi mới; `function_search_path_mutable` **không** đánh dấu `set_bill_image`) · phụ trợ (QC đã PASS, chạy lại cho chắc): `npm run typecheck` exit 0 · `npm run lint` exit 0 · `npm run test -- --run` → **446/446 pass**.

---

## ĐỐI CHIẾU SCOPE (bắt buộc theo subagent.md §1)

- Gói đầu vào không liệt kê `scope_files` tường minh → tự đối chiếu với mô tả delta + báo cáo QC vòng 2.
- `git status --porcelain` = **13 modified + 7 untracked**. Phân bổ:
  - **DELTA vòng 2 (5)** ✔ khớp `p7-qc-round2.md`: `supabase/migrations/20261004040500_set_bill_image.sql`, `src/lib/billUpload.ts`, `src/lib/billUpload.test.ts`, `src/features/pos/PosPage.test.tsx`, `e2e/p6-checkout.spec.ts`;
  - **P7-T4/T5 + sửa QC vòng 1** (đã có từ vòng 1, chỉ regression): `e2e/p7-bills.spec.ts`, `src/features/bills/*`, `scripts/test-p7-cleanup.sh`, `supabase/migrations/20261004020058_cron_cleanup_bills.sql`, `supabase/functions/cleanup-bills/index.ts`;
  - **sửa 3 MINOR QC vòng 2**: comment design trong `20261004020058` (**đã đọc: chỉ thay `§6.1/§7.4` → `§5 + §6.4/§7.3` ở dòng 1-5 comment, `run_cleanup_bills`/schedule SQL không đổi** — đối chiếu bằng `migration list --linked` 13/13 + advisors không đổi số WARN của `run_cleanup_bills`) và `cleanup-bills/index.ts` (**`git diff` = 4 dòng comment đầu file, không dòng code nào đổi**);
  - `plan.md` + `state.json` = bookkeeping của main (security-audit không đụng);
  - báo cáo của subagent: `.opencode/evidence/p7-qc-round1.md`, `p7-qc-round2.md`, `p7-sec-round1.md`.
- **Khớp 100%; không file lạ, không file rác/secret.** `security-audit` không sửa bất kỳ file nào ngoài báo cáo này (`git status` trước/sau: chỉ thêm `.opencode/evidence/p7-sec-round2.md`).

---

## LỖI (0 BLOCKER · 0 MAJOR · **3 MINOR** — không chặn gate, ghi backlog)

### [SEC-009] MINOR · CWE-20 (Improper Input Validation) / OWASP A04:2021 · `supabase/migrations/20261004040500_set_bill_image.sql:39-46` · sig:`d21c9bed64e17928` (sha1 file)

*(`p7-sec-round1.md` ghi "regex nhận `YYYY/MM/<mã>.png`" — thực tế **không ràng buộc YYYY/MM với tháng tạo bill**, và **không kiểm file có thật**.)*

- **Tái hiện** (JWT thật `t7sec2-tmp`, bill fixture chưa có ảnh, đã xóa sau test):
  ```
  POST /rest/v1/rpc/set_bill_image   {"p_code":"HT-261004-9008","p_path":"1999/01/HT-261004-9008.png"}
  → HTTP 200  true
  → select image_path → 1999/01/HT-261004-9008.png      (đã dọn, khôi phục baseline)
  ```
  Cùng payload qua `set role authenticated` → `true`. Kiểm đối chứng: `2026/05/HT-261004-9002.png` → **`true`**.
- **Không có đường sửa**: `image_path` đã ghi → thử đổi/gỡ → `false` (idempotent chặn ở dòng 35) và `authenticated` **không có `GRANT UPDATE ON public.bills`** (42501) → giá trị sai giữ nguyên suốt đời bill.
- **Tác động**: (1) ảnh của bill đó **không bao giờ hiện được** trên menu Quản lý bill; (2) file PNG thật client upload ở `2026/10/<mã>.png` thành **orphan vĩnh viễn** — EF chỉ xóa đúng `image_path` (`cleanup-bills/index.ts:106-108`), không quét theo prefix; (3) kết hợp [SEC-006], kẻ squatting chọn được tháng tùy ý.
- **Bằng chứng phụ**: `session_fresh` không được gọi (xem SEC-010); `pg_get_functiondef` chỉ đọc/ghi `public.bills`, **không bảng khác, không `EXECUTE`/dynamic SQL**.
- **Gợi ý hướng sửa** (1 dòng mỗi ý): ràng buộc tháng theo bill — `p_path !~ to_char(v_created_at at time zone 'Asia/Ho_Chi_Minh','YYYY/MM') || '/' || v_code || '\.png$'`; và/hoặc xác minh object có thật `exists (select 1 from storage.objects where bucket_id='bills' and name=p_path)` trước khi ghi.

### [SEC-010] MINOR · CWE-613 (Insufficient Session Expiration) / AGENT.md §11.6 · `supabase/migrations/20261004040500_set_bill_image.sql:8-51` (hàm không gọi `session_fresh()`) · sig:`d21c9bed64e17928`

- **Tái hiện (trong CÙNG 1 phiên DB, 1 lệnh)**:
  ```
  set role authenticated;
  set request.jwt.claims to '{"sub":"00000000-…","role":"authenticated","session_id":"99999999-…","iat":1790000000}';
  select public.session_fresh() as fresh, public.set_bill_image('HT-261004-9011','2026/10/HT-261004-9011.png') as rpc_result;
  → fresh=false | rpc_result=true        và image_path được ghi thật
  ```
- **Đối chiếu bất đối xứng**: `bills_read` (policy) và `bills_objects_insert` (policy storage) **đều** yêu cầu `session_fresh()`; `create_bill` cũng vậy → riêng `set_bill_image` chỉ dựa vào `grant execute`.
- **Tác động**: client bị sửa bật `autoRefreshToken` giữ được phiên vô hạn; sau 7 ngày RLS chặn đọc `bills` + chặn upload Storage (SEC-001 P3) nhưng **vẫn ghi được `image_path`** cho bill chưa có ảnh → lỗ thủng trên lớp server của "phiên tối đa 7 ngày".
- **Gợi ý hướng sửa**: 2 dòng đầu hàm — `if not public.session_fresh() then raise exception 'phien het han'; end if;` (hoặc thêm `and public.session_fresh()` vào điều kiện `update`).

### [SEC-006] MINOR · **kế thừa P6/P7-v1 — VẪN CÒN HIỆU LỰC, TÁC ĐỘNG ĐÃ THỰC TẾ HÓA** · CWE-639 / OWASP A01:2021 · `supabase/migrations/20261001160204_storage_bills_bucket.sql:16-22` (policy `bills_objects_insert`) · sig:`2b09fd327f74e6c9` (sha1 `0653c825e34466e0` — file **không đổi**)

- **Tái hiện (vòng 2, JWT thật)**:
  ```
  POST /storage/v1/object/bills/2026/10/HT-261004-9999.png   (PNG 70 B, mã CHƯA được cấp)
  → HTTP 200 {"Key":"bills/2026/10/HT-261004-9999.png","Id":"8a27e1e4-…"}
  ```
  (đã xóa file sau test; `bill_code_counters` ngày 2026-10-04 vẫn `seq=1` → mã `…-9999` chưa từng được `next_bill_code()` cấp).
- **Vì sao vòng 1 xếp MINOR "chưa xảy ra"**: `grep` toàn repo khi đó **không có code nào ghi `bills.image_path`** → `BillsPage` luôn thấy `''` → hiển thị "Chưa có ảnh". **NV5 của vòng 2 chính là code ghi `image_path`** → **NGHI VẤN 5 vòng 1 ĐÓNG (đã sửa đúng chủ đích)**, nhưng đổi lại tác động của SEC-006 **không còn là tiềm tàng**.
- **Chuỗi khai thác (từng mắt xích đều có bằng chứng)**:
  1. Kẻ squatting upload PNG giả vào `bills/2026/10/HT-261004-0007.png` trước khi mã `0007` phát sinh → **200** (reproduced trên);
  2. Bill thật ra mã `…-0007` → `createBillUploader` upload cùng path → **409 `KeyAlreadyExists`** (reproduced: `?upsert=true` → `409 Duplicate/KeyAlreadyExists`);
  3. `billUpload.ts:38-50` coi 409 = "đã upload rồi" → **`linkBillImage(code, path)`** (`:50`) → `set_bill_image` trả `true` → `bills.image_path` = đường dẫn của kẻ squatting → menu Quản lý bill **hiển thị PNG của kẻ tấn công như ảnh bill thật**. (Mắt xích 3 xác nhận bằng đọc code + unit `linkMock`/`linkCalls` do QC vòng 2 bổ sung — **chưa chạy end-to-end tạo bill thật trên cloud** để không làm lệch stats.)
- **Tác động**: toàn bộ session hợp lệ (staff/admin) chiếm được đường dẫn PNG của **bill bất kỳ chưa phát sinh**; chủ thật không ghi đè được (409 persist) và nay **ảnh giả hiện ra**. Không mất bill/stats (bill vẫn do `create_bill` server-side tính).
- **Gợi ý hướng sửa**: thêm vào `with check`: `and exists (select 1 from public.bills b where split_part(name,'/',3) = b.code || '.png')` (chặt hơn: `b.created_by = auth.uid()`); đồng thời khi `linkBillImage` nhận 409 thì xác minh object thuộc mình trước khi gắn. **Đề nghị gộp SEC-006 + SEC-009 + SEC-010 vào một migration ở backlog P10-T4.**

---

## NGHI VẤN (chưa chứng minh / chưa có kênh khai thác — **không chặn**)

1. **[SEC-010] Chưa dựng được "phiên > 7 ngày thật"** để tái hiện end-to-end (cần `auth.sessions.created_at` older 7 ngày + JWT còn hạn — không chờ được và không sửa dữ liệu auth của người thật). Bằng chứng hiện có mới ở mức: hàm không gọi `session_fresh()` + `fresh=false/rpc=true` trong cùng phiên. → xác nhận lại ở P10 khi có thể bơm phiên.
2. **(kế thừa NV1) `net.http_request_queue` / `net._http_response` vẫn READ được bởi `anon` + `authenticated`**: tái kiểm vòng 2 → `relrowsecurity=false` cả 2 bảng, `has_table_privilege(anon|authenticated, …,'SELECT')=true`, `has_schema_privilege(…,'net','USAGE')=true`, hàng queue `count=0`, response `count=14` **không chứa** Bearer/tên secret; vẫn chưa có kênh đọc từ PostgREST (OpenAPI không expose `net.*`). → **vẫn đề nghị vá phòng thủ trước P10**: `revoke select … from anon, authenticated; revoke usage on schema net …;` + bật RLS.
3. **(kế thừa NV2) TTL 120 s không phải ranh giới truy cập thật**: signed URL hết hạn → `InvalidJWT` ✔ nhưng staff session mới vẫn `GET /storage/v1/object/bills/<path>` **không ký → 200** (policy `bills_objects_read`) — đúng thiết kế single-tenant `design.md §4.1`.
4. **(kế thừa NV3) Spec ≠ impl tên header**: gói mô tả `X-Cron-Secret`, code dùng `Authorization: Bearer` → tái kiểm `X-Cron-Secret` riêng vẫn **401**; **đừng "sửa" theo mô tả sai**.
5. **(kế thừa NV4) `rls_auto_enable`** vẫn `SECURITY DEFINER` EXECUTE cho `authenticated` và nằm trong advisors WARN → ngoài diff P7, ghi P10 rà.
6. **(kế thừa NV7) Không đọc được log runtime EF**: CLI 2.119.0 không có `functions logs`, Management API `logs.all` → 410 → bù bằng `net._http_response` + `cron.job_run_details` + đọc toàn bộ `console.*` (không thấy secret).
7. **(kế thừa NV6) PNG do client sinh + client upload** là ảnh không chống giả mạo; nguồn sự thật là `bills/bill_items` — P7-v2 chỉ đọc/ghép lại ảnh → không đổi nhận định.
8. **MỚI — nuốt lỗi 409 theo regex message**: `billUpload.ts:47` dùng `/already exists|duplicate/i` trên `error.message`; nếu Storage/project khác trả thông điệp chứa 2 chuỗi này cho lỗi **không phải** trùng file (upload hỏng) thì client sẽ **bỏ qua lỗi + gắn ảnh vào path không tồn tại** → ảnh hỏng và outbox ngừng retry. Đã thử các lỗi thật trên project này (415 sai mime, 413 quá lớn, 409 trùng, 403 khi xóa) → **chỉ 409 chứa chuỗi đó** → chưa tái hiện được nhánh sai.
9. **Advisors +1 WARN** (`set_bill_image` callable by `authenticated`) — đúng ý đồ (bills không có UPDATE policy nên phải DEFINER), có `search_path=''`; ghi để P10 rà tổng thể (hiện 7 WARN, vòng trước 6).

---

## KẾT LUẬN CỔNG

- **0 BLOCKER · 0 MAJOR · 3 MINOR** (2 mới `[SEC-009]`, `[SEC-010]` + 1 kếinheritdoc `[SEC-006]` đã nâng từ "tác động tiềm tàng" → "tác động thực tế") → theo `loop.md §4.3`: **gate P7 SEC vòng 2 = PASS**, cả 3 ghi `state.json → backlog` (đề nghị gộp sửa ở **P10-T4** bằng 1 migration + 1 thay `billUpload.ts`).
- **NGHI VẤN 9 mục không chặn**; nên đưa mục 1 (phiên > 7 ngày) và mục 2 (revoke `net.*`) vào backlog.
- **Đóng 1 NGHI VẤN vòng 1**: NV5 (`bills.image_path` chưa code nào ghi) **đã được NV5 của main-coding sửa** — số liệu: `HT-261004-0001.image_path = 2026/10/HT-261004-0001.png` do client ghi qua RPC (bill fixture dùng để test cũng ghi được).
- **Không sửa file nào ngoài báo cáo này** — `git status` cuối phiên = đúng danh sách của gói, chỉ thêm `.opencode/evidence/p7-sec-round2.md`; cloud đã về baseline (bills=1, stats `2026-10-04 = 25000/1`, 2 file Storage cũ, 2 user, profiles=2, login_attempts=5, cron.job=1).
