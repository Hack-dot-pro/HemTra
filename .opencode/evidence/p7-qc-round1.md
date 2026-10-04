# QC REPORT — Phase P7 — Vòng 1

```
## QC REPORT — Phase P7 — Vòng 1
VERDICT: PASS
TÓM TẮT: Q1–Q12 xanh (typecheck/lint 0, unit 441/441, coverage bills 100%/lib 87.79%,
build 227.52KB gzip, e2e p7 12/12 + axe 0 serious, script cleanup 14/14, migration 12/12
synced). Thiếu test cho `bills/api.ts` → qc-test đã viết bổ sung `api.test.ts` (14 test);
2 MINOR ghi backlog, 1 hạng mục không kiểm được (fault-injection EF).

PHẠM VI: khớp `scope_files` (diff `2c885c1..HEAD` = 10 file + untracked 2 file).
  Ngoại lệ do qc-test: +1 file test mới `src/features/bills/api.test.ts`.
  Không có file rác/secret (scan 0 hit; `e2e/screenshots/` đã gitignore).
SKILLS_READ: subagent.md §2 · AGENT.md (§5/§11.4/§12) · loop.md §4 ·
  .opencode/skills/testing/skill.md (toàn bộ) · design.md §4.1/§5/§6/§7 · plan.md P7
  (ma trận §12.1 P7 = backend/uiux/security — đọc yêu cầu của main-coding; qc-test chỉ
  viết test nên testing/skill.md là skill bắt buộc của phần việc này)

KẾT QUẢ THEO HẠNG MỤC:
  Q1 ✔  npm run typecheck → exit 0
        tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json — 0 lỗi
  Q2 ✔  npm run lint → exit 0 (eslint . — không có diagnostic; cảnh báo MINOR: 0)
  Q3 ✔  npm run test -- --run → exit 0
        "Test Files 40 passed (40) / Tests 441 passed (441)" (trước khi bổ sung: 39/427)
        grep "\.skip(|\.only(|xit(|xdescribe(" src + e2e → 0 kết quả (không có .skip/.only mới)
  Q4 ✔  Đối chiếu tasks_done ↔ test (đã đọc code, không chỉ tin output):
        · P7-T1  logic.ts → logic.test.ts (escapeLike, dateFilterIso/vnDayStart/End,
          validateDateRange, summarizeItemCounts, totalPages, formatBillDateTime);
          BillsPage.tsx → BillsPage.test.tsx (bảng đủ cột, rỗng/lỗi/retry, tìm mã,
          lọc ngày, phân trang, KHÔNG nút xóa); e2e p7 (tìm mã + offset=20 + không nút xóa)
        · P7-T2  SIGNED_URL_TTL_SECONDS=120 + billImageFileName (logic.test),
          modal load/error/retry/download/share (BillsPage.test), e2e modal + "Chưa có ảnh"
        · P7-T3  EF cleanup-bills → scripts/test-p7-cleanup.sh 14/14 (đúng code path cron)
          + curl độc lập: 401 (không có/sai Authorization), 405 (GET), 204 (OPTIONS)
        · P7-T4  migration → migration list/db push (Q8) + script (cron.job
          '0 0 * * *' active, anon bị revoke execute); UI tag → BILL_RETENTION_DAYS=15,
          retentionDaysLeft/retentionTagText (biên: âm/0/1/ngày hỏng), cột "Tự dọn",
          e2e policy tag + cột
        · P7-T5  scripts/test-p7-cleanup.sh → PASS=14 FAIL=0 (chạy lại ở vòng QC này)
        ★ THIẾU ĐÃ BỔ SUNG: `src/features/bills/api.ts` (logic map dòng + 4 nhánh lỗi)
          không có test nào trong khi `products/api.test.ts`, `setup/api.test.ts` đều có
          → qc-test viết `src/features/bills/api.test.ts` (14 test) → xanh.
  Q5 ✔  npx vitest run --coverage --coverage.reporter=text → exit 0
        features/bills  api.ts 100% lines | logic.ts 98.38% lines (nhóm 100%)
        lib             87.79% lines (>= 80%)
        All files       94.17% lines / 92.2% stmts
        (ghi chú: `vitest.config.ts` include = `src/lib/**` + `src/features/*/*.ts` —
        component `.tsx` không nằm yêu cầu Q5; giữ nguyên như các phase trước)
  Q6 ✔  Đọc toàn bộ test trong scope:
        · không có assert rỗng/luôn đúng; tên test mô tả hành vi tiếng Việt
        · mock không che lỗi thật: fake của api.test mô phỏng đúng
          `PostgrestError extends Error` (node_modules/@supabase/postgrest-js/src/PostgrestError.ts:25)
          → kiểm chứng lại bằng PostgREST thật (xem Q7) thay vì tự tin vào mock
        · ĐÃ CẤP NHẬT chỗ yếu: assert "không nút xóa" trước đây chỉ so `textContent`
          (bỏ sót nút icon-only có aria-label) → bổ sung accessible-name check ở
          BillsPage.test.tsx + e2e; e2e p7 trước đây chỉ nghe `pageerror` (khác chuẩn
          collectAppErrors của p3) → bổ sung lọc console.error + đo document overflow
  Q7 ✔  Đối chiếu design.md/AGENT.md §11.4 (đọc code + chạy thật trên DB linked):
        · Tiền nguyên VND: `bills.total` int, `formatVnd` (BillsPage)
        · design §4.1 "Xóa bill ✘ (không ai)" → không có nút xóa; RLS `bills_read`
          `for select to authenticated` ONLY (20261001154825_rls_policies.sql:53) —
          client không insert/update/delete được bill
        · design §7.3 mục 4 → đủ: mã / thời gian / người tạo / tổng / số món /
          "Tự dọn" / modal ảnh + chia sẻ lại + tải về / tag "Tự xóa sau 15 ngày"
        · design §5 + AGENT.md §11.4: BILL_RETENTION_DAYS=15 (unit assert =15);
          script chứng minh stats_daily + stats_product_alltime KHÔNG đổi sau khi
          job xóa bill (post=75000/3 & 3/45000 → after giống hệt)
        · design §6.4: EF xóa file Storage TRƯỚC rồi xóa dòng (index.ts:105-118),
          chỉ `from("bills").delete` — không đụng stats_*
        · Lọc ngày theo giờ VN kiểm chứng trên PostgREST THẬT:
          `created_at=gte.2026-10-04T00:00:00+07:00 & lte.2026-10-04T23:59:59.999+07:00`
          → trả bill `2026-10-03T23:17:37Z` (= 06:17 04/10 giờ VN) — đúng ranh giới UTC
        · escapeLike kiểm chứng thật: `code=ilike.HT-261004-000_` → 1 dòng (wildcard),
          `code=ilike.HT-261004-000\_` → `[]` (escape có hiệu lực, không lỗi 400)
        · embed `profiles(username)` trả về OBJECT `{"username":"admin"}` (nhánh
          object của api.ts là nhánh thường gặp; nhánh mảng/null được unit cover)
        · count qua `content-range: 0-0/1` với `Prefer: count=exact` → phân trang đúng
  Q8 ✔  THAY THẾ `supabase test db` (local stack không chạy được — B-001,
        state.json blockers[0]: container không ping nhau trên bridge; ghi chú
        p3t2_test_target "test trên CLOUD"). Thay bằng 4 kiểm chứng:
        (a) ĐỌC migration 20261004020058 → idempotent từng bước:
            L11 `create extension if not exists pg_cron`
            L17-28 DO-block chỉ drop pg_net khi nó nằm ngoài schema `extensions`
            L30 `create extension if not exists pg_net with schema extensions`
            L33 `create or replace function public.run_cleanup_bills()`
            L68-69 revoke/grant chạy lại vô hại
            L74-79 `cron.unschedule` bọc EXCEPTION (lần đầu chưa có job) → L81 schedule lại
            → chạy lại migration không sinh job trùng, không lỗi object đã tồn tại
        (b) `npx -y supabase@2.119.0 migration list --linked` → exit 0, BẢNG LOCAL = REMOTE
            đúng 12/12 (20261001152827 … 20261004020058)
        (c) `npx -y supabase@2.119.0 db push --linked` → exit 0 "Remote database is up to date."
        (d) script trên linked DB: `cron.job` có `hemtra-cleanup-bills`, schedule
            `0 0 * * *`, active; `has_function_privilege('anon', …)` = false;
            `run_cleanup_bills()` → EF trả `200 {"scanned":1,"filesRemoved":1,
            "rowsDeleted":1,"hasMore":false}`
  Q9 ✔  npm run build → exit 0
        `dist/assets/index-*.js 790.71 kB │ gzip: 227.52 kB` < 250KB gzip (design §11)
        Warning "(!) Some chunks are larger than 500 kB" là warning rolldown theo dung
        lượng RAW, đã xuất hiện từ P3/P4 (.opencode/evidence/p3-qc-round1/2/3.md,
        p4-qc-round1.md) → không phải ngưỡng mới bị vượt
  Q10 ✔ npx playwright test e2e/p7-bills.spec.ts → exit 0, "12 passed" (4 test ×
        chromium/webkit/mobile). Ảnh 2 cỡ đã XEM: p7-bills-chromium-390x844.png
        (bảng cuộn trong vùng `overflow-x-auto` + `role=region`, card/ nav không vỡ),
        p7-bills-chromium-1280x800.png (đủ 7 cột, tag "Tự dọn", nút "Xem ảnh").
        Bổ sung (test): 0 `pageerror`, 0 `console.error` (loại "Failed to load
        resource" theo chuẩn p3), `document.scrollWidth <= innerWidth` ở CẢ 2 viewport.
  Q11 ✔ axe qua @axe-core/playwright trên /bills (và khi mở modal) → 0 vi phạm
        serious/critical × 3 project
  Q12 ✔ git diff --name-only 2c885c1..HEAD (10) ∪ git status untracked (2) == scope_files.
        Lệch duy nhất do qc-test: thêm `src/features/bills/api.test.ts`.
        Không sửa code sản phẩm (diff của qc-test chỉ nằm trong 3 file test).
        Secret scan trên src/features/bills, e2e/p7-bills.spec.ts, EF, migration,
        script → 0 hit; script chỉ đọc `$SUPABASE_*` từ `.env` (đã gitignore).

LỖI (0 BLOCKER / 0 MAJOR — 2 MINOR ghi backlog, không chặn cổng):
  [QC-001] MINOR · src/features/bills/logic.ts:2, logic.ts:16, BillsPage.tsx:2,
           supabase/functions/cleanup-bills/index.ts:1 · sig:e25803af39f089ce19e1d098541cafe6975060a1
    Bằng chứng: comment dẫn "design §7.4" cho bảng/quy tắc bill, nhưng
      design.md:171 = "### 7.4 Bộ icon đồ uống"; đúng là design.md:168 (§7.3 mục 4).
      Dẫn "§6.1" cho `expires_at = +15 ngày` nhưng design.md:131 (§6.1) là bố cục bill;
      đúng là design.md:118 (§5) và design.md:150 (§6.4).
      Kiểm false-positive: `git show 9e4a5dd|e5e2f25|34ef8bd:design.md | grep '^### 7.4'`
      → cả 3 commit đều là "Bộ icon đồ uống" (sai từ lúc viết, không phải do đổi số mục).
    Tái hiện: grep -n "§7.4\|§6.1" src/features/bills/*.ts* supabase/functions/cleanup-bills/index.ts
    Gợi ý: sửa comment sang §7.3 mục 4 / §5 / §6.4 (chỉ comment, không đổi logic).

  [QC-002] MINOR · scripts/test-p7-cleanup.sh:76-77 · sig:5993378c4126cd19dbef662a12591a1c14c5e2cf
    Bằng chứng (output thật từ vòng QC): `stats alltime prod: NONE -> 3/45000
      (ky vong 2/30000)` — fixture chèn bill_items cho CẢ bill hết hạn (2×15.000)
      lẫn bill còn hạn (1×15.000) → kỳ vọng đúng là 3/45000.
      Đây là dòng `echo` chứ không phải assertion → 14/14 PASS không đổi, nhưng gây
      hiểu nhầm khi đọc log/ evidence.
    Tái hiện: bash scripts/test-p7-cleanup.sh (dòng "== 1. Fixture ==")
    Gợi ý: đổi chuỗi "(ky vong 2/30000)" thành "(ky vong 3/45000)".

TEST ĐÃ BỔ SUNG:
  1) src/features/bills/api.test.ts  (MỚI — 14 test, tự viết vì Q4/Q5: api.ts 0 test,
     2.27% lines trước đó): ghép `profiles` object/mảng/null + itemCount chỉ dòng cha +
     thiếu cột → chuỗi rỗng; order/range(0-19, 20-39)/chỉ 1 query bill_items khi có dòng;
     escapeLike + mốc ngày giờ VN gửi PostgREST; 4 nhánh lỗi (CONFIG_ERROR / mạng /
     RLS→"Bạn không có quyền thao tác này." / SERVER_ERROR) kể cả lỗi ở bill_items;
     signed URL bucket `bills` + TTL 120s + thiếu signedUrl → SERVER_ERROR.
     Kết quả: features/bills 53/53, coverage api.ts 100% lines, logic.ts 98.38% lines.
  2) src/features/bills/BillsPage.test.tsx — củng cố assert "không nút xóa" bằng
     accessible name (textContent + aria-label + queryByRole(name)).
  3) e2e/p7-bills.spec.ts — thêm bắt console.error (loại "Failed to load resource"),
     assert document.scrollWidth <= innerWidth ở 390×844 và 1280×800, và assert
     `getByRole('button', { name: /x[oó]a/i })` = 0.

KHÔNG KIỂM ĐƯỢC:
  · `supabase test db` + migration trên DB trống cục bộ — B-001 (local stack hỏng):
    đã thay bằng đọc idempotency + migration list/db push 12/12 + script 14/14 trên
    linked DB (chi tiết Q8). Mức độ thay thế: đủ để PASS Q8 theo hướng dẫn vòng này.
  · Nhánh lỗi "Storage remove THẤT BẠI → giữ nguyên dòng DB" của EF
    (index.ts:107-110 throw trước khi delete): chỉ kiểm được bằng đọc code
    (thứ tự + throw-before-delete chắc chắn) + trạng thái cuối qua script;
    không có hạ tầng fault-injection cho Edge Function trong repo
    (không có test nào ở supabase/functions) → ghi backlog, không chặn.
  · Deadline/pin của signed URL 120s theo phía server (token thật hết hạn sau 120s)
    — unit chỉ assert hằng số + TTL truyền vào `createSignedUrl`; e2e mock tầng Storage.

BẰNG CHỨNG (lệnh + exit code):
  npm run typecheck → 0 | npm run lint → 0 | npm run test -- --run → 0 (441/441)
  npx vitest run --coverage --coverage.reporter=text → 0 (bills 100%/98.38%, lib 87.79%)
  npm run build → 0 (gzip 227.52 KB)
  npx playwright test e2e/p7-bills.spec.ts → 0 (12 passed)
  npx -y supabase@2.119.0 migration list --linked → 0 (12/12 local=remote)
  npx -y supabase@2.119.0 db push --linked → 0 ("Remote database is up to date.")
  bash scripts/test-p7-cleanup.sh → 0 (PASS=14 FAIL=0)
  curl EF: POST không/sai token → 401 | GET → 405 | OPTIONS → 204
```
