# QC REPORT — Phase P7 — Vòng 2

```
## QC REPORT — Phase P7 — Vòng 2
VERDICT: PASS
TÓM TẮT: Q1–Q12 xanh — typecheck/lint 0, unit 446/446 (40 file), coverage features/bills 100%
  lines + lib 87.97% lines + billUpload.ts 100% (21/21 dòng, 10/10 nhánh), build 227.61KB gzip,
  e2e TOÀN PHẦN 129/129, script cleanup PASS=14, migration 13/13 synced + db push "up to date".
  2 MINOR vòng 1 (QC-001/002) xác nhận ĐÃ SỬA; 4 MINOR (0 BLOCKER / 0 MAJOR) ghi backlog.
  qc-test bổ sung test cho delta: chuỗi retry 409, shape storage THẬT, wire set_bill_image
  ở unit PosPage + e2e (trước đó e2e mock "tức mắt" không assert).

PHẠM VI: khớp gói đầu vào. DELTA 5 file = supabase/migrations/20261004040500_set_bill_image.sql,
  src/lib/billUpload.ts, src/lib/billUpload.test.ts, src/features/pos/PosPage.test.tsx,
  e2e/p6-checkout.spec.ts (+ NV5).
  `git status --porcelain` = 13 modified + 6 untracked. Phân bổ:
    · delta của vòng 2 (5) ✔
    · P7-T4/T5 + e2e/p7-bills, BillsPage/logic/api, script cleanup, migration cron — đã có từ
      vòng 1 (chỉ chạy regression)
    · sửa QC-001 (comment design) + QC-002 (echo) — xác nhận lại ở mục Q7/LỖI
    · plan.md + state.json = bookkeeping của main (qc-test KHÔNG đụng)
  LỆCH DO qc-test: chỉ 3 FILE TEST (xem mục TEST ĐÃ BỔ SUNG) — không sửa code sản phẩm.
SKILLS_READ: subagent.md §2 · AGENT.md (§5, §11.4, §12) · loop.md §4.1–4.3 ·
  .opencode/skills/testing/skill.md (toàn bộ) · design.md §3/§4.1/§5/§6.3/§6.4/§7.3 · plan.md P7

KẾT QUẢ THEO HẠNG MỤC:
  Q1 ✔  npm run typecheck → exit 0 (tsc app + tsc node, 0 diagnostic)
        ⚠ nhưng KHÔNG cover e2e/ (xem QC-004) — hạng mục vẫn PASS vì đúng lệnh quy định.
  Q2 ✔  npm run lint → exit 0 (eslint . không diagnostic; cảnh báo MINOR: 0)
  Q3 ✔  npm run test -- --run → exit 0 — "Test Files 40 passed / Tests 446 passed"
        (vòng 1: 441 → đầu vòng 2: 443 do main +2 → qc-test +3 = 446)
        grep -E "(\.skip\(|\.only\(|\bxit\(|\bxdescribe\(" src e2e → 0 kết quả (không có .skip/.only)
  Q4 ✔  Đối chiếu tasks_done ↔ test (ĐỌC code, không chỉ tin output):
        · migration set_bill_image → db query --linked (Q8d): anon 42501 / authenticated chạy được /
          bill không tồn tại → exception / gọi lần 2 → RET=false (idempotent) /
          regex nhận `2026/10/<mã>.png`, từ chối mã khác → script cleanup 14/14
        · linkBillImage (billUpload.ts:22-25) → billUpload.test happy: assert ĐÚNG
          `rpc('set_bill_image', {p_code, p_path})` + lỗi rpc → `image_link_failed`
        · 409 không nuốt lỗi khác (billUpload.ts:38-43): test status 500 (qc-test) + 'row too large'
          → vẫn `png_upload_failed`, rpc không được gọi; 409 → đi gắn ảnh
        · rpc lỗi → outbox retry (Q4a, đọc outbox.ts:122-138): `uploadPng` ném →
          `attempts+1`, `last_error`, status vẫn pending (outbox.test "upload PNG lỗi → giữ pending")
          + chuỗi 2 lần gọi do qc-test bổ sung: lần 1 rpc lỗi → reject;
          lần 2 upload trả trùng file → vẫn gắn thành công
        · NV5 wire (upload → gắn ảnh): unit PosPage linkMock assert args + e2e linkCalls assert
          ở CẢ luồng online và luồng offline/outbox
        · regression NV5 (image_path được đọc): bills/api.ts select `image_path` → api.test +
          e2e p7 modal "Xem ảnh"/"Chưa có ảnh"
        ★ THIẾU ĐÃ BỔ SUNG: nhánh "trùng file shape THẬT" không test nào phủ
          (test của main mock `status:409` short-circuit nên regex-true không chạy) → +1 test.
          Chuỗi retry 2 bước và wiring e2e cũng không có → đã bổ sung (mục TEST ĐÃ BỔ SUNG).
  Q5 ✔  npx vitest run --coverage → exit 0
        features/bills | 100% lines (api.ts 100%, logic.ts 98.38% — dòng 45, nhóm 100%)
        lib           | 87.97% lines (≥ 80%)   All files | 94.2% lines / 92.24% stmts
        billUpload.ts (delta) = 21/21 dòng, 10/10 nhánh = 100% (kiểm bằng coverage-final.json;
        text reporter ẩn file 100% nên không hiện trong bảng)
  Q6 ✔  Đọc toàn bộ test trong delta + test mới:
        · không assert rỗng/luôn đúng; tên test mô tả hành vi tiếng Việt
        · PHÁT HIỆN mock sai lỗi thật (→ QC-003): storage THẬT trả HTTP 400 khi trùng file,
          test của main mock `status:409` = contract không có thật
        · e2e `set_bill_image` trước đây fulfill thẳng không assert (khác với mock create_bill
          có ghi body + assert hợp đồng) → qc-test đã ghi body + assert p_code/p_path (Q4c)
        · PosPage mock trước đây trả `{data:true}` cứng cho set_bill_image → qc-test đổi thành
          spy linkMock và assert được lời gọi
  Q7 ✔  Đối chiếu design.md/AGENT.md §11.4 (đọc code + DB linked):
        · design §6.4 "…ảnh vào Storage → hiện ở menu Quản lý bill" → NV5 chính là chỗ này
          (trước đây image_path không ai ghi → nút "Xem ảnh" không hiện với bill thật)
        · design §5: `bills.image_path`, `expires_at (= +15 ngày)` — BILL_RETENTION_DAYS=15 (unit assert)
        · design §7.3 mục 4: đủ mã/thời gian/người tạo/tổng/số món/tag "tự xóa sau N ngày"/
          modal ảnh + chia sẻ/tải về + KHÔNG nút xóa (BillsPage + e2e + ảnh đã xem)
        · design §4.1 "Xóa bill ✘ (không ai)": db query as role authenticated →
          `update bills set image_path=image_path …` → "permission denied for table bills";
          `delete … where code='HT-000000-0000'` (predicate 0 dòng) → cùng lỗi;
          pg_policies(bills) = CHỈ `bills_read` (SELECT, authenticated) → migration KHÔNG nới lỏng
        · bất biến §11.4: script 14/14 — stats_daily 75000/3 và stats_product_alltime 3/45000
          GIỮ NGUYÊN sau khi job xóa bill + file
        · tiền nguyên VND: migration/`set_bill_image` không đụng `total`/`bill_items`/`stats_*`
        · design §6.3: upload `bills/YYYY/MM/<code>.png` — regex `set_bill_image` buộc đúng mẫu
        · QC-001/002 vòng 1 KIỂM LẠI: grep "§7.4\|§6.1" src/features/bills/* +
          supabase/functions/cleanup-bills/index.ts → 0 hit (exit 1); comment còn lại trỏ đúng
          §7.3 mục 4 / §5 / §6.4; scripts/test-p7-cleanup.sh:77 = "(ky vong 3/45000)" và output
          THẬT "3/45000" khớp. → 2 MINOR vòng 1 xong. (Phát hiện 1 chỗ sót cùng loại → QC-006)
  Q8 ✔  THAY THẾ `supabase test db` (B-001: local stack hỏng) đúng hướng dẫn vòng này:
        (a) ĐỌC migration 20261004040500 idempotent: chỉ `create or replace function` (chạy lại
            vô hại), `revoke/grant` chạy lại vô hại, KHÔNG create table/index/policy →
            không sinh object trùng, không đụng data
        (b) `supabase migration list --linked` → exit 0, LOCAL = REMOTE 13/13
            (20261001152827 … 20261004040500)
        (c) `supabase db push --linked` → exit 0 "Remote database is up to date."
        (d) `supabase db query --linked` (SELECT/DO trong transaction + ROLLBACK, KHÔNG đổi dữ liệu):
            · pg_proc: security_definer=t, proconfig=`search_path=""`,
              acl=`{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}` (anon vắng mặt)
            · has_function_privilege: anon=false, authenticated=true, service_role/postgres=true
            · runtime role=anon → `permission denied for function set_bill_image` (=42501)
            · runtime role=authenticated → gọi được, bill không tồn tại →
              `set_bill_image: khong tim thay bill …`
            · bill đã có ảnh → `RET=false` (idempotent, không ghi đè); regex đúng/sai mã → true/false
            · trạng thái DB sau QC: 1 bill, image_path `2026/10/HT-261004-0001.png` (KHÔNG đổi),
              stats_daily 25000/1 (không đổi), bill_items=1
        (e) probe Storage (service_role, file tạm `2026/10/__qc-r2-probe.png`, đã xóa, list=0):
            POST lần 1 → 200, POST lần 2 (x-upsert:false) → HTTP 400 +
            `{"statusCode":"409","error":"Duplicate","message":"The resource already exists","code":"KeyAlreadyExists"}`
  Q9 ✔  npm run build → exit 0 — `dist/assets/index-*.js 790.93 kB │ gzip: 227.61 kB` < 250KB
        (ngưỡng design §11; warning chunk >500kB raw là warning rolldown cũ từ P3/P4 — không mới)
  Q10 ✔ npx playwright test (TOÀN BỘ) → exit 0, "129 passed (10.8m)"
        (lần chạy đầu 123/129 — 6 fail do biến `linkCalls` chưa khai báo trong spec của qc-test →
         đã sửa → 129/129; p6-checkout 9/9, p7-bills 12/12).
        Ảnh ĐÃ XEM: p7-bills-chromium-1280x800.png (đủ 7 cột gồm "Tự dọn", tag policy,
        nút "Xem ảnh", không vỡ), p7-bills-chromium-390x844.png (bảng cuộn trong region
        overflow-x-auto, nav/bottom-nav nguyên vẹn), p6-checkout-chromium-1280x800.png
        ("Đã lưu HT-261003-0001.png về máy." — luồng PNG vẫn chạy sau khi thêm RPC).
        Test tự assert: 0 pageerror, 0 console.error (loại "Failed to load resource"),
        document.scrollWidth ≤ innerWidth ở cả 390×844 và 1280×800.
  Q11 ✔ axe qua @axe-core/playwright → 0 vi phạm serious/critical × 3 project
        (p5-a11y /products, p6-pos /pos, p7-bills /bills + modal ảnh)
  Q12 ✔ git status: 13 modified + 6 untracked, khớp phạm vi nêu ở trên; không file rác
        (coverage/ đã bị xoá bởi reporter, e2e/screenshots + test-results gitignored —
         `git check-ignore` xác nhận), không secret (grep key/secret/password/service_role
         trên src+e2e+supabase+scripts → chỉ thấy biến env đã gitignore).
        qc-test chỉ sửa 3 file test; KHÔNG sửa code sản phẩm, plan.md, state.json.

LỖI (0 BLOCKER / 0 MAJOR — 4 MINOR ghi backlog, không chặn cổng):
  [QC-003] MINOR · src/lib/billUpload.ts:40 (+ src/lib/billUpload.test.ts:54,110)
           · sig:b72ba365a34557578139490193291c04a771f02e
    Bằng chứng: `error.status === 409` KHÔNG BAO GIỜ đúng với Storage project hiện tại.
      Probe thật: POST trùng path (x-upsert:false) → HTTP 400, body
      {"statusCode":"409","error":"Duplicate","message":"The resource already exists","code":"KeyAlreadyExists"}.
      storage-js handleError (node_modules/@supabase/storage-js/dist/index.mjs:316-331):
      status = parseInt(response.status)=400, statusCode = err.statusCode="409".
      → nhánh sống sót duy nhất là regex `/already exists|duplicate/i` trên message; nhưng test
        của main mock `{message, status:409}` → `status===409` short-circuit → regex-true
        (đường production) không test nào phủ trước khi qc-test bổ sung.
      Hậu quả hôm nay: 0 lỗi runtime (regex bắt được) — nhưng gỡ regex là retry hỏng im lặng.
    Tái hiện: curl POST 2 lần cùng path vào bucket `bills` (đo ở mục Q8e) +
      `npx vitest run src/lib/billUpload.test.ts -t "409"`
    Gợi ý: kiểm `error.statusCode === '409' || error.code === 'KeyAlreadyExists' || error.status === 409`
      (giữ regex làm fallback), và sửa mock ở test:54,110 về shape thật (status 400 + statusCode "409").

  [QC-004] MINOR · tsconfig.app.json:22 (`"include": ["src"]`),
           tsconfig.node.json:20 (`"include": ["vite.config.ts"]`)
           · sig:5482fa78b6e8d07886359089147c84587433bd21
    Bằng chứng: `npm run typecheck` = exit 0 NGAY KHI e2e/*.spec.ts có biến chưa khai báo →
      `npx playwright test` → 6/129 fail: `ReferenceError: linkCalls is not defined`
      (e2e/p6-checkout.spec.ts:108/216). Lỗi type ở e2e chỉ lộ lúc chạy Playwright (~11 phút).
    Tái hiện: thêm biến lạ vào e2e/*.spec.ts → `npm run typecheck` vẫn 0 → chạy playwright mới fail.
    Gợi ý: thêm `"e2e"` + `"playwright.config.ts"` vào include của tsconfig.node.json
      (hoặc tsconfig solution riêng cho e2e) để Q1 phủ luôn e2e.

  [QC-005] MINOR · src/features/pos/PosPage.tsx:153-160 · sig:52a5d4646ce364389e2f0c71e9ae6f5ee9c42f63
    Bằng chứng: luồng ONLINE (PosPage.handleCheckout) gọi `createBillUploader` rồi `catch { png = null }`
      — nếu `set_bill_image` lỗi thì: bill ĐÃ tạo, image_path vẫn '', ẢNH BỊ BỎ
      (last-sale không có PNG) và KHÔNG CÓ RETRY (outbox chỉ phục vụ luồng offline,
      outbox.ts:122-138). Mô tả delta "rpc lỗi → outbox retry" chỉ đúng với bán offline.
      Điều kiện xảy ra thấp (rpc lỗi khi upload đã thành công) nhưng design §6.4 yêu cầu
      ảnh phải hiện ở menu Quản lý bill.
    Tái hiện: đọc PosPage.tsx:150-165 + outbox.ts:122-138; unit mô phỏng rpc reject ở luồng online.
    Gợi ý: khi link/upload lỗi ở luồng online vẫn enqueue outbox để sync lại ảnh
      (create_bill idempotent đã có sẵn), hoặc ghi rõ chấp nhận vào backlog.

  [QC-006] MINOR · supabase/migrations/20261004020058_cron_cleanup_bills.sql:1-2
           (lẻ của QC-001 — cùng chữ ký lỗi e25803af39f089ce19e1d098541cafe6975060a1)
    Bằng chứng: comment dẫn `design §5 "pg_cron: dọn bill > 15 ngày (gọi cleanup-bills)", §6.1`
      — chuỗi trích nằm ở design.md:56 = mục §3 "Sơ đồ tổng thể" (không phải §5);
      `§6.1` = "Bố cục bill" (design.md:131) — đúng phải là §6.4 "Vòng đời" (design.md:150).
      Vòng 1 chỉ grep `src/features/bills/*` + `cleanup-bills/index.ts` nên lọt file này.
      (Các §6.1 trong src/features/pos/* là ĐÚNG — §6.1 bố cục bill.)
    Tái hiện: grep -n "§6.1\|§5" supabase/migrations/20261004020058_cron_cleanup_bills.sql
    Gợi ý: sửa comment sang `design §3` + `§6.4` (chỉ comment, KHÔNG đổi SQL — migration đã push).

TEST ĐÃ BỔ SUNG (3 file test của qc-test — chạy xanh):
  1) src/lib/billUpload.test.ts (+3 test → 11 test, file 100% dòng + 100% nhánh):
     · "retry sau khi gắn ảnh thất bại: lần 1 rpc lỗi → ném; lần 2 upload 409 + rpc OK → gắn được"
       — chuỗi 2 bước chứng minh outbox retry thực sự gắn được ảnh (lần 2 KHÔNG ném png_upload_failed).
     · "upload lỗi khác 409 (status 500) → vẫn ném png_upload_failed, không đi gắn ảnh"
       — bảo đảm 409 không nuốt lỗi khác (rpc.not.toHaveBeenCalled()).
     · "shape THẬT của storage khi trùng file → vẫn coi là đã có và đi gắn ảnh"
       — mock theo kết quả probe thật (HTTP 400 + statusCode "409" + code KeyAlreadyExists),
       phủ nhánh regex-true mà trước đó không test nào chạy tới.
  2) src/features/pos/PosPage.test.tsx: đổi nhánh `set_bill_image` trong mock thành spy `linkMock`
     + assert sau thanh toán online: `linkMock` gọi đúng 1 lần với
     `('set_bill_image', { p_code:'HT-261003-0001', p_path:/^\d{4}\/\d{2}\/HT-261003-0001\.png$/ })`
     → test FAIL ngay nếu app quên gọi RPC (trước đây mock trả kết quả cứng = không bắt được).
  3) e2e/p6-checkout.spec.ts: route `**/rest/v1/rpc/set_bill_image` giờ GHI LẠI body (như cách
     mock `create_bill` vẫn làm) và assert ở 2 test:
     · bán online: linkCalls=1, p_code đúng mã bill, p_path khớp đường dẫn VỪA upload
       (`uploads[0].endsWith('/bills/'+p_path)`).
     · offline → sync: outbox cũng phải gọi set_bill_image với mã OFF + path đúng mẫu.
     (Chạy lại: p6-checkout 9/9; toàn bộ e2e 129/129.)

KHÔNG KIỂM ĐƯỢC:
  · `supabase test db` + migration trên DB trống cục bộ — B-001 (local stack hỏng, state.json):
    đã thay bằng đọc idempotency + migration list/db push 13/13 + db query privilege/behavior
    trên linked DB (Q8a–d). Đủ để PASS Q8 theo hướng dẫn vòng này.
  · Luồng POS THẬT → REST THẬT → `bills.image_path` được ghi (end-to-end không mock):
    e2e dùng token giả nên RPC phải mock; không tạo thêm bill thật ngoài script P7-T5
    (đã có bằng chứng gián tiếp: db query privilege/behavior + bill HT-261004-0001 đã có
     image_path + probe Storage 400/KeyAlreadyExists). Ghi backlog: 1 test tích hợp
     (login thật → bán 1 đơn → kiểm image_path) nếu muốn chặn hồi quy kiểu này.
  · Nhánh lỗi "Storage remove THẤT BẠI → giữ dòng DB" của EF (p7-qc-round1) — vẫn chỉ đọc code,
    không có hạ tầng fault-injection cho Edge Function.
  · Signed URL 120s hết hạn phía server — unit chỉ assert hằng số/TTL (vòng 1).

BẰNG CHỨNG (lệnh + exit code):
  npm run typecheck → 0 | npm run lint → 0 | npm run test -- --run → 0 (40 file, 446/446)
  npx vitest run --coverage --coverage.reporter=text → 0
    (features/bills 100% lines, lib 87.97% lines, All files 94.2% lines; billUpload.ts 100%/100%)
  npm run build → 0 (dist/assets/index-*.js 790.93 kB │ gzip 227.61 kB)
  npx playwright test → 0 (129 passed, 10.8m)   [p6-checkout 9/9, p7-bills 12/12, axe 0 serious]
  npx -y supabase@2.119.0 migration list --linked → 0 (13/13 LOCAL = REMOTE)
  npx -y supabase@2.119.0 db push --linked → 0 ("Remote database is up to date.")
  npx -y supabase@2.119.0 db query --linked → 0 (pg_proc/ACL, pg_policies, role anon/authenticated)
  bash scripts/test-p7-cleanup.sh → 0 (PASS=14 FAIL=0; echo "(ky vong 3/45000)" khớp output)
  grep "§7.4\|§6.1" src/features/bills/* supabase/functions/cleanup-bills/index.ts → exit 1 (0 hit)
  probe Storage: POST #1 → 200, POST #2 → 400 {"statusCode":"409",…}, DELETE → 200, list → 0
```
