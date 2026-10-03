# SEC REPORT — Phase P6 — Vòng 1

- **Ngày**: 2026-10-03 (UTC) · **Agent**: `security-audit` (subagent.md §3) · **Model**: mimo-v2.6-flash-free
- **Gói**: `phase P6 · round 1 (sec_round=0) · scope 38 file` — `git diff --name-only b9adb26..HEAD | wc -l` = **38 ✔ khớp** + 11 entry chưa commit (`plan.md` tick gate QC, `state.json`, 6 file `src/features/pos/*` = fix QC-016/017, `supabase/functions/auth-login/index.ts` = fix SEC-004, 2 evidence QC round2/3) — **không có file lạ ngoài gói**.
- **skills_read (trước khi làm việc)**: `AGENT.md` (§3/§5/§6/§8/§11/§12) · `subagent.md` (toàn bộ) · `loop.md` · `plan.md` [P6 + P10-T1..T5] · `design.md` §4/§6/§8/§9 · `.opencode/skills/security/skill.md` · `.opencode/skills/pos-bill/skill.md` · `.opencode/skills/backend/skill.md` · `.opencode/skills/pwa-offline/skill.md` · `.opencode/skills/auth/skill.md` · `supabase/migrations/20261001155441_create_bill_rpc.sql` · `20261001160204_storage_bills_bucket.sql` · `20261002144826_session_fresh_session_based.sql`
- **Điều kiện chạy**: QC P6 **PASS vòng 3** (`p6-qc-round3.md`) ✔ · **Quyền**: chỉ đọc + chạy lệnh kiểm tra + ghi báo cáo này; **không sửa file code nào** (test tự chạy: `typecheck exit 0`, `388/388` pass).
- **Dọn dẹp test trên cloud**: mọi SQL chạy trong `BEGIN … ROLLBACK` (0 bill/0 product/0 stats sót — đã đếm lại); 1 user test Auth + 6 object Storage test đã xóa (đã đếm lại: bucket còn đúng 1 file cũ `HT-261001-0004.png` của dự án, Auth còn đúng `t7staff@hem.local`); 5 dòng `login_attempts` do probe tạo đã xóa.

---

## VERDICT: **PASS**

**Tóm tắt**: 15/15 hạng mục có kết quả — **10 ✔ · 5 ✘ (toàn bộ mức MINOR, 0 BLOCKER/MAJOR)**. Tấn công thủ công trên 4 bề mặt P6 (RPC `create_bill`, Storage upload, EF `auth-login` đã deploy, render BillSheet) **đều có payload + output thật**: server vẫn tính lại giá online, idempotent theo `client_uuid`, không xóa/sửa được bill & stats từ client; upload chặn traversal/size/upsert/delete; lockout 5/15′ vẫn khóa ở lần 6 sau fix SEC-004. 3 phát hiện **MINOR mới** ([SEC-006]/[SEC-007]/[SEC-008]) + 1 MINOR kế thừa không đổi (`_headers`) → **ghi backlog theo loop.md §4.3, không chặn gate P6**.

## PHẠM VI: **hẹp** (không audit toàn hệ thống — P10/P11 mới toàn diện) · BỀ MẶT: POS `PosPage`/`checkout`/`logic`/`BillSheet`/`exportBillPng` · RPC `create_bill` + policy `bills` bucket (DB prod, transaction) · EF `auth-login` (HTTPS thật) · outbox IndexedDB · PWA/SW · secret/dependency.

---

## KẾT QUẢ S1–S15

| # | KQ | Lệnh / cách kiểm | Output (trích) |
|---|----|------------------|----------------|
| S1 | ✔ | `gitleaks detect --source . -v` (8.30.1) | `54 commits scanned` · `no leaks found` · **exit 0**. Quét riêng `gitleaks dir .` → 6 hit = 5 ở `.env` (gitignored, `git ls-files` chỉ có `.env.example`) + 1 JWT **`role=anon`** trong `dist/assets/index-jp0io2G7.js`. Quét thủ công 5 secret trong `.env` ↔ 42 file `dist/public/index.html` → **0 hit** (anon key có mặt = được phép) |
| S2 | ✔ | `npm audit --omit=dev` · `npm audit` | `found 0 vulnerabilities` (cả 2, **exit 0**) |
| S3 | ✔ | `pg_tables.rowsecurity` (live) + REST anon + `git diff b9adb26..HEAD -- supabase/` | **13/13 bảng `rowsecurity=true`**; diff migration P6 = **0 file** (không policy mới, không `using(true)`); anon GET `/rest/v1/{bills,products,profiles,stats_daily,app_meta}` → **401 `42501 permission denied`**; anon `rpc/create_bill` → **404 PGRST202**; anon `GET /storage/v1/object/bills/…` → **404 Bucket not found** |
| S4 | N-A | Đối chiếu `plan.md` P6 ↔ thay đổi | P6 không thêm EF/hành động admin-only; thay đổi EF duy nhất = `auth-login` (fix SEC-004, không đổi phân quyền). Anon không gọi được `create_bill` (dòng S3) |
| S5 | ✔ | **Thật qua HTTPS** `https://tsnrgg…functions.supabase.co/auth-login` | 6 lần `login` sai → `401 ×5` rồi **`429 {"…quá 5 lần…","locked":true}`**; sai mật khẩu user không tồn tại vs user có thật → **cùng** `401 {"error":"Tài khoản hoặc mật khẩu không đúng."}` (0 oracle); `unlock-otp` với username không tồn tại/`admin` → **luôn `200 {"ok":true,…}`**; `unlock-verify` OTP sai (user có/không) → **cùng `401 {"error":"Mã OTP không đúng hoặc đã hết hạn"}`**; `GET` → `405`; `action=x` → `400`; CORS: `Origin: https://evil.example.com` → **không có `access-control-allow-origin`**, `https://hemtra.pages.dev` → ACAO đúng. **SEC-004 đã deploy**: `functions list` → `auth-login ACTIVE v2 UPDATED_AT 2026-10-03 12:06:17 UTC` > mtime file `12:05:36` |
| S6 | N-A | `supabase functions list` | `bootstrap-admin v4, UPDATED_AT 2026-10-02` — không đổi trong P6; đã PASS gate P3 |
| S7 | ✔ | `grep -rn "dangerouslySetInnerHTML\|innerHTML=\|eval(" src/` + render thật React 19 | **0 sink**. Payload vào `BillSheet` (ghi chú món/đơn, tên SP, topping, SĐT): `node -e renderToStaticMarkup` → `<script>` ⇒ `&lt;script&gt;`, `"><img onerror>` ⇒ `&quot;&gt;&lt;img…`, `'; DROP…` ⇒ `&#x27;; DROP…` — **escape toàn bộ**; input kẹp `maxLength` 100 (note) / 50 (`phone_note` khớp RPC); QR = data-URL nội bộ (không nhận input), logo = asset bundle |
| S8 | ✔ | Đọc `bills_objects_read` + signed URL thật | Sign URL 60s của chính file mình → `200` đọc được; policy `bucket_id='bills' AND session_fresh()`; **không** token/`expires` dài; P6 chưa có code đọc ảnh (P7) → kiểm lại ở P7/P10. Lưu ý single-tenant: mọi staff đọc được mọi bill (đúng design) |
| S9 | ✘ **MINOR** | **Thật trên cloud** (session Auth thật, user test tạm): traversal / MIME / size / upsert / delete / squatting | Traversal `../`, `2026/10/../..`, `/etc/passwd.png`, `…/sub/…` → **403/404**; `text/html` → **415 invalid_mime_type**; 320 KB → **413**; 200 KB PNG → 200; **upsert ghi đè → 403** (`new row violates row-level security policy`), trùng path không upsert → **409**; **DELETE từ client → 403 Access denied** → riêng 2 lỗ MINOR: **[SEC-006]** upload mã bill **chưa phát sinh** `HT-261003-9998.png` → **200**; **[SEC-007]** nội dung `<svg onload=alert(1)/>` + `Content-Type: image/png` → **200**, mimetype lưu `image/png` |
| S10 | ✘ **MINOR** | **SQL live** (transaction, rollback): 14 lần gọi `create_bill` | Online → dừng ở **`lan_9: rate_limited`** (10 bill/phút ✔); cùng thao tác với `p_is_offline=true` → **`KHONG_BI_CHAN_14_BILL_OFFLINE`** → **[SEC-008]** (rate limit chỉ tính nhánh online — code cố ý, comment `create_bill_rpc.sql:66`) |
| S11 | ✘ **MINOR (kế thừa)** | `sha1sum public/_headers` + `git diff b9adb26..HEAD -- public/` | `2eabab27176a63f3cd3847dea6cded862342e3b3` — **trùng 100% sig [SEC-001] P4/P5**; `grep -c "CSP\|HSTS\|X-Content-Type…"` → **0**; diff `public/` = **rỗng** → không xấu đi, giữ backlog **P10-T1** |
| S12 | ✔ | Đọc `src/sw.ts` + `vite.config.ts` (injectManifest) | Chỉ `precacheAndRoute(__WB_MANIFEST)` + `cleanupOutdatedCaches`, **0 runtime caching** → `/rest/v1`,`/auth/v1`,`/storage/v1` đi thẳng mạng; `skipWaiting` **chỉ khi** message `SKIP_WAITING`; `src/sw.ts` **không đổi** trong P6 |
| S13 | ✔ | `grep -rn "console." src/` (không test) + schema Dexie `db.ts` | **0 `console.log/info/warn`**; chỉ 2 `console.error` (PostgREST error object) ở `products/api.ts` + 1 ở EF (chỉ `error.message`). IndexedDB `outbox` = `{items, phone_note, is_offline, offline_code, created_at, menu_version, png(data URL), status…}` — **không token/không mật khẩu**; `localStorage` chỉ `hemtra.username/remember/login_at` + session do supabase-js quản lý; không log `price_drift`/`phone_note` |
| S14 | ✔ | **SQL live** (`BEGIN…ROLLBACK`, claims `role=authenticated` giả lập + role test) | **(a) giá client sai bị tính lại**: gửi `unit_price=1, qty=2` → `{"total":70000,…}`, `bill_items = "__sec_test_prod__ x2 @35000"`; **(b) idempotent**: gọi 2 lần cùng `client_uuid` → cùng `id`, lần 2 `duplicate:true`, `count=1`; **(c) không xóa/sửa bill**: `DELETE/UPDATE bills`, `DELETE bill_items`, `DELETE stats_daily`, `INSERT bills` trực tiếp → **`BLOCKED: permission denied`**; **(d) stats chỉ tăng qua trigger** và vẫn còn sau rollback. Lưu ý offline → xem **[SEC-008]** |
| S15 | ✔ | Đọc `src/lib/session.ts`, `supabase.ts`, `auth/skill.md` | `SESSION_MAX_AGE_MS = 7 ngày`; `routedAuthStorage`: ghi nhớ → `localStorage`, không ghi nhớ → `sessionStorage`; **không lưu mật khẩu** (chỉ username); server `session_fresh()` theo `auth.sessions.created_at` (migration `20261002144826`) — không đổi trong P6 |

**Tool**: `gitleaks 8.30.1` → 54 commits / **0 leak** / exit 0 (dir: 6 hit = gitignored `.env` ×5 + anon JWT ×1) · `npm audit [--omit=dev]` → **0 vulnerabilities** / exit 0 · `npm run typecheck` → **exit 0** · `npm run test -- --run` → **388/388, exit 0**.

---

## LỖI (0 BLOCKER · 0 MAJOR · **3 MINOR mới** — không chặn gate, ghi backlog)

**[SEC-006] MINOR · CWE-639 (Authorization Bypass Through User-Controlled Key) / OWASP A01:2021 · `supabase/migrations/20261001160204_storage_bills_bucket.sql:17-22` (policy `bills_objects_insert`) · bề mặt `src/lib/billUpload.ts:27`, nuốt lỗi ở `src/features/pos/PosPage.tsx:159-161` · sig:`2b09fd327f74e6c9`**
- **Tái hiện** (session Auth thật, user test tạm, đã dọn): `POST /storage/v1/object/bills/2026/10/HT-261003-9998.png` với PNG ngụy trang → **`HTTP 200 {"Key":"bills/2026/10/HT-261003-9998.png"}`** trong khi mã `…-9998` **chưa được `next_bill_code()` cấp** (counter hôm nay mới `seq=2`). Policy chỉ bắt `bucket_id + session_fresh() + regex` — **không** ràng buộc `bills.created_by = auth.uid()` hay "mã đã tồn tại".
- **Tác động**: mọi session hợp lệ chiếm được đường dẫn của bill bất kỳ; chủ thật sau đó upload → **409 KeyAlreadyExists** và **không ghi đè được** (`upsert` → 403, không có UPDATE policy) → `PosPage` nuốt lỗi thành "Ảnh bill chưa xuất được"; với outbox thì bill kẹt `pending` (sau 5 lượt `attempts` bị bỏ qua, `countPending` > 0 mãi). Ảnh sai hiện ở menu Quản lý bill (P7). Không xóa/đọc trộm được, không mất dữ liệu DB.
- **Bằng chứng phụ**: `DELETE …/HT-261003-9301.png` → `403 Access denied`; `upsert=true` lần 2 → `403 … row-level security policy`; `409` khi upload trùng không upsert.
- **Hướng sửa**: thêm vào `with check`: `and exists (select 1 from public.bills b where b.code = split_part(name,'/',3)[:-4]… and b.created_by = auth.uid())` (role `authenticated` đã có `SELECT bills` → policy chạy được); hoặc tối thiểu: `exists (… b.code = <mã trong path>)`. **Đề xuất đưa vào P7 (trước T2 đọc ảnh) hoặc P10-T4.**

**[SEC-007] MINOR · CWE-434 (Unrestricted Upload of File with Dangerous Type) / OWASP A03:2021 · `supabase/migrations/20261001160204_storage_bills_bucket.sql:3-5,17-22` + `src/lib/billUpload.ts:27-30` · sig:`3d43011e1c1b15ad`**
- **Tái hiện**: `POST /storage/v1/object/bills/2026/10/HT-261003-9102.png` body = `<svg onload=alert(1)/>` header `Content-Type: image/png` → **`HTTP 200`**, metadata object: `"mimetype":"image/png"`. Ngược lại `Content-Type: text/html` → `415 invalid_mime_type` → storage **chỉ kiểm header khai báo, không sniff magic bytes**.
- **Tác động**: thấp — file vẫn phục vụ với `Content-Type: image/png` (trình duyệt không thực thi trong `<img>`), bucket private; nhưng là upload không kiểm nội dung, rủi ro tăng khi `_headers` chưa có CSP (SEC-001).
- **Hướng sửa**: kiểm magic bytes `89 50 4E 47` ở `createBillUploader` (client, chặn sớm) + kiểm lại phía server khi P7 dựng luồng đọc/hiển thị (hoặc EF proxy upload); gộp vào **P10-T2 (giới hạn loại file upload)**.

**[SEC-008] MINOR · CWE-770 (Allocation of Resources Without Limits) / OWASP A04:2021 · `supabase/migrations/20261001155441_create_bill_rpc.sql:66-72` (rate limit "chi tinh online"), `:74-83` (bỏ kiểm `menu_version`), `:128-151` (chấp nhận giá client), `:100-106` (backdate ≤7 ngày) · sig:`35126ce22b897bce`**
- **Tái hiện** (SQL live, `BEGIN…ROLLBACK`): (1) 14 bill liên tiếp với `p_is_offline=true` → **`KHONG_BI_CHAN_14_BILL_OFFLINE`**; cùng script online → **`lan_9: rate_limited`**; (2) `p_is_offline=true, unit_price=0` khi **đang online** → `{"total":0,"is_offline":true,"price_drift":true}`; (3) `p_created_at = now()-3 days` → `created_at=2026-09-30…` và `stats_daily` nhận `2026-09-30: revenue=0 bills=1`. **Không cần chứng minh offline** — server không có cách nào kiểm chứng.
- **Tác động**: client tự quyết "đang offline" nên thoát được rate limit, kiểm `menu_version`, và chốt giá tùy ý + lùi ngày ≤7 ngày → làm sai số liệu thống kê; **mọi lệch giá đều gắn `price_drift`** (phát hiện được ở admin), không mất dữ liệu, không leo thang quyền, không ảnh hưởng nhánh online đúng thiết kế (`design.md §8.3` vẫn tính lại giá) → xếp MINOR theo tiền lệ [SEC-005] P5. *Lưu ý: nhánh giá snapshot offline là **theo design §8.4**; vấn đề duy nhất ở đây là `is_offline` **không được xác minh** nên ai cũng dùng được khi đang online.*
- **Hướng sửa**: áp rate limit cho **cả** nhánh offline với ngưỡng riêng (vd. 60 bill/giờ/người — shop offline thật không vượt) và/hoặc chặn `p_is_offline=true` khi IP từng gọi online trong phút hiện tại; **ghi rõ vào backlog P10-T2** (rate limit tạo bill/phút) — nếu không, rate limit hiện tại vô hiệu với kẻ chủ đích.

**Kế thừa, không phải lỗi của P6** (giữ nguyên mức, xem mục backlog): `[SEC-001] MINOR public/_headers:1 · sig sha1 `2eabab27…` (không đổi so với P4/P5) — [SEC-003]/[SEC-005] từ P3/P5 — không reopen.

---

## NGHI VẤN (chưa chứng minh / ngoài phạm vi — **không chặn**)

1. **SEC-004 fail-closed chưa tái hiện bằng fault**: nhánh `getFailedCount → null → 429 MSG.countFail` chỉ kích hoạt khi query nội bộ lỗi; không có cách gây lỗi DB từ ngoài → kiểm bằng đọc code (`index.ts:106-124,166-170`) + mốc deploy (`v2 @ 2026-10-03 12:06:17 UTC` > mtime file). Không phát hiện bypass lockout: 6 lần sai thật vẫn khóa.
2. **Timing oracle `auth-login`** (kế thừa `p3-sec-round2 §4`): user không tồn tại bỏ qua `signInWithPassword` → có thể lệch ~100–300 ms. Code đường login không đổi trong P6 → giữ nguyên, đo lại ở **P10**.
3. **Ảnh bill là client sinh + client upload** → PNG không phải bằng chứng chống giả mạo (kẻ tấn công tự sửa DOM/devtools trước khi chụp); nguồn sự thật là dòng `bills/bill_items` phía server. Đây là hệ quả thiết kế (`design.md §6.3`), cần ghi nhận khi P7 hiển thị ảnh làm "chứng".
4. **Mã offline `HT-YYMMDD-OFF-xxxx`**: 4 ký tự từ `crypto.randomUUID()` → không đoán trước được để squatting (khác mã online tuần tự); chưa đo xác suất trùng.
5. **P7 signed URL**: chưa có code phát hành → chưa kiểm thời hạn/chia sẻ lại; smoke `curl -I` + kiểm `expiresIn` ngắn ở **P7-T2**.
6. **`_redirects` nuot `/sw.js`,`/version.json`** (N-002, P4) — chưa đổi, giữ ở **P11-T4**.

---

## ĐÁNH GIÁ BACKLOG LIÊN QUAN (giữ nguyên / chưa xấu đi / đề nghị thêm)

| Mục backlog | Trạng thái sau vòng này | Kết luận |
|---|---|---|
| `SEC-001` `_headers` thiếu CSP/HSTS/nosniff/Referrer/Permissions-Policy → **P10-T1** | sha1 file **trùng khớp 100%** P4/P5, diff `public/` rỗng | **Giữ nguyên, chưa xấu đi** (S11 ✘ MINOR kế thừa) |
| `N-002` `_redirects` nuot sw/version → **P11-T4** | file không đổi | **Giữ nguyên** |
| `SEC-003` signup còn mở + policy → P9/P10 | không đụng config Auth | **Giữ nguyên** |
| `SEC-005` DELETE `categories` chỉ chặn client → **P10-T2** | grants/policy không đổi (diff `supabase/` = 0) | **Giữ nguyên, chưa xấu đi** |
| **P10-T2** "Rate limit tạo bill/phút, giới hạn kích thước & loại file upload" | Rate limit online **có thật** (10/phút) nhưng **bỏ nhánh offline** → [SEC-008]; loại file **không sniff bytes** → [SEC-007] | **Giữ mục + mở rộng phạm vi**: (i) rate limit áp cả `is_offline`, (ii) kiểm magic bytes PNG |
| **P10-T4** "Kịch bản tấn công thủ công: IDOR bill…" | Chưa có case chiếm đường dẫn Storage | **Thêm case [SEC-006]** (upload mã chưa phát sinh + 409 người thật) |
| `QC-002` smoke EF · `QC-008` backdrop · "môi trường dev không chạy local Supabase" · advisors 6 WARN | không liên quan P6 | **Giữ nguyên** |
| **[SEC-006]** (mới) | — | **Đề nghị backlog mới**: sửa policy `bills_objects_insert` — đặt ở **P7 (trước T2)** hoặc P10-T4 |
| **[SEC-007]** (mới) | — | **Đề nghị gộp vào P10-T2** |
| **[SEC-008]** (mới) | — | **Đề nghị gộp vào P10-T2** (không tách vòng lặp) |

**Không có BLOCKER/MAJOR → gate P6 theo `loop.md §4.2` = qua.** Main-coding **không cần sửa code ở vòng này**; 3 MINOR mới chỉ cần được ghi vào `state.json → backlog` (theo mục này) trước khi chốt phase.

*Không sửa file nào ngoài báo cáo này (`git status` trước/sau: chỉ thêm `.opencode/evidence/p6-sec-round1.md`).*
