# QC REPORT — Phase P6 — Round 3 (vòng cuối)

- **Ngày**: 2026-10-03 · **Agent**: `qc-test` (subagent.md §2) · **Model**: mimo-v2.6-flash-free
- **Gói**: `P6 · round 3 · scope 38 file` (`git diff --name-only b9adb26..HEAD` = **38/38 khớp**) + 8 file chưa commit (đúng danh sách gói)
- **Mục tiêu vòng này**: (1) xác minh 2 MAJOR vòng 2 — [QC-016] test thiếu · [QC-017] bill in Σ ≠ Tổng; (2) chạy lại toàn bộ Q1–Q12
- **Skills đã đọc (trước khi làm việc)**: `AGENT.md` (§3, §5, §8, §12) · `subagent.md` (toàn bộ) · `loop.md` · `plan.md` [P6] (+P4-T5/T9) · `design.md` §6/§7.3/§8 · `.opencode/skills/pos-bill/skill.md` · `.opencode/skills/testing/skill.md` · `.opencode/skills/pwa-offline/skill.md` · `.opencode/skills/backend/skill.md` (§4 `create_bill`) · `.opencode/skills/uiux/skill.md` · `supabase/migrations/20261001155441_create_bill_rpc.sql`
- **Quyền**: chỉ đọc + chạy lệnh + sửa/thêm **file test**. Không sửa code sản phẩm, không sửa `state.json`/`plan.md`, không tick task.
- **File test đã sửa trong vòng này**: `src/features/pos/PosPage.test.tsx` (hoist helper `captureSheetOnce` ra module scope, +1 test offline Σ=Tổng, +2 assert chặn pass im lặng)

---

## VERDICT: **PASS**

**Tóm tắt**: 12/12 hạng mục có kết quả — **11 xanh, 1 N/A (Q8)**. Cả [QC-016] lẫn [QC-017] **đều CLOSED**: reproducer vòng 2 tái hiện được trên code *trước* fix (Σ 35.000 ≠ Tổng 40.000) và **đã hết hiện tượng** trên code hiện tại — không còn đường in bill Σ ≠ Tổng cộng ở nhánh online lẫn offline. Không có BLOCKER/MAJOR/MINOR mới.
**Số liệu độc lập (qc tự chạy, lần cuối sau khi bổ sung test)**: typecheck `0` · lint `0` · unit **388/388** (37 file) · coverage lines **93,68%** (`lib` **87,79%** · `features/pos` **98,74%**, `checkout.ts` 100%, `logic.ts` 98,38%) · build `0` (gzip **224,85 kB** < 250) · e2e **117/117 pass, exit 0** (6,0m) · axe **0 serious/critical** · `.only/.skip` **0**.

---

## BẢNG CHECKLIST Q1–Q12

| # | KQ | Lệnh / cách kiểm | Bằng chứng (trích) |
|---|----|------------------|--------------------|
| Q1 | ✔ | `npm run typecheck` → **exit 0** | `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json` không output |
| Q2 | ✔ | `npm run lint` → **exit 0** | `eslint .` không output |
| Q3 | ✔ | `npm run test -- --run` → **exit 0**; `grep -rn "\.only(\|\.skip("` `src`+`e2e` | **`Test Files 37 passed` · `Tests 388 passed (388)`** (giao 387 + qc bổ sung 1); anti-skip/only **0** (grep không match) |
| Q4 | ✔ | Đối chiếu từng task P6-T0…T9 + P4-T5/T9 ↔ test thật | T2 `PosPage.test` lưới ×2 + `e2e/p6-pos` · T3 `logic.test` 25 case + panel ×8 · T4 `BillSheet.test` 5 (snapshot khóa 7 khối) · T5 `qr.test` 4 (`FACEBOOK_URL` khớp §6.1.5) · T6 `exportBillPng.test` 11 · T7 `checkout.test` 18 + `billUpload.test` 6 + `PosPage.test` online/offline · T8 `PosPage.test` chia sẻ ×3 · T9 `e2e/p6-checkout` (PNG 1440px magic bytes, offline→sync) · P4-T5 `outbox.test` + e2e offline→online · P4-T9 `e2e/p6-price-refresh`. **Logic mới vòng 3 có test**: `repriceBill` ×3 (happy/biên/lỗi), `resolvePrintableBill` ×4 (happy/biên/lỗi/lỗi hạ tầng), `PosPage` QC-017 ×2 + qc bổ sung 1 (offline) |
| Q5 | ✔ | `npx vitest run --coverage --coverage.reporter=text` → **exit 0** | lines **93,68% (773/823)**; `src/lib` **87,79%** ≥80; `features/pos` **98,74%** ≥80; `checkout.ts` **100%**, `logic.ts` **98,38%** ⇒ [QC-015] vẫn đạt (`vitest.config.ts:21` `include: ['src/lib/**','src/features/*/*.ts']`) |
| Q6 | ✔ | Đọc toàn bộ test mới thay vì "chỉ toBeTruthy" | `resolvePrintableBill` 4 case phân rẽ rõ ràng (được trả bill + tổng đúng / cache cũ → null / SP biến mất → null / không có cache + syncMenu ném lỗi → null); `repriceBill` kiểm cả bất biến "không mutate state cũ". **1 chỗ yếu tự sửa**: `PosPage.test` nhánh `price_drift` chỉ có `expect(captured?.lineSum).toBe(captured?.total)` → pass im lặng nếu `captured=null`; qc đã thêm `not.toBeNull()` + assert đúng 35.000/35.000. Còn lại 0 assert rỗng; `toBeTruthy()` duy nhất = PNG data-URL (đã giải trình ở `checkout.test:184`) |
| Q7 | ✔ | Đối chiếu `design.md §6/§7.3/§8` + `AGENT.md §10/§11` | Tiền nguyên VND (`format.ts` `Math.round`, `maximumFractionDigits: 0`) · bill 720px ×2 = PNG 1440 (`e2e/p6-checkout.spec.ts:106`) · 7 khối đúng thứ tự (snapshot 187 dòng) · mã `HT-YYMMDD-0001` / `-OFF-[A-Za-z0-9]{4}` khớp regex RPC (`checkout.test:84`) · `phone_note` `maxLength={MAX_PHONE_NOTE_LENGTH}` = **50** = `length(p_phone_note)>50 → phone_note_invalid` · online lấy giá/tên **server** (PASS 1), offline **giữ snapshot** + `price_drift` (§8.4) · outbox idempotent `client_uuid` · banner offline + cache >24h (`isCacheStale` test 24h) · QR `https://www.facebook.com/linh.kh.142`. Quyền bảng 4.1: P6 không đổi màn quyền — N/A nội bộ, RPC vẫn yêu cầu `auth.uid()` |
| Q8 | N/A | `git diff --name-only b9adb26..HEAD \| grep -c '^supabase/'` + `npx supabase status` | **0** file migration mới (P6 không đụng DB) ⇒ không cần `supabase test db`. Local stack **không chạy được** (`No such container: supabase_db_HemTra` — kế thừa backlog `B-001`). File `supabase/functions/auth-login/index.ts` sửa trong gói là **Edge Function**, không phải migration |
| Q9 | ✔ | `npm run build` → **exit 0** | `index-jp0io2G7.js 780,30 kB │ gzip: 224,85 kB` (**< 250 kB** theo `design.md §11`), precache 24 entry; warning "chunk > 500 kB" là cảnh báo mặc định của Vite theo kích thước *minified*, có từ trước, không vượt ngưỡng gzip đã đặt |
| Q10 | ✔ | `npx playwright test` → **exit 0**; ảnh 2 viewport; script console độc lập của qc (test tạm, đã xoá) | **`117 passed (6.0m)`** × 3 project (chromium/webkit/mobile); **60 ảnh** `e2e/screenshots/*` đều mới trong 2h; không tràn ngang 390×844 & 1280×800 (test Q10 pass); `pageErrors=[]` trong `p6-pos.spec:118` + `p6-checkout.spec:74`; **`CONSOLE_ERRORS=[]` ở chromium lẫn webkit** khi thao tác /pos (thêm SP → topping → tổng 40.000) |
| Q11 | ✔ | axe trong e2e (`p5-a11y.spec:82`, `p6-pos.spec:136`) × 3 project | `expect(serious).toEqual([])` pass ⇒ **0 serious/critical** trên `/products` và `/pos` |
| Q12 | ✔ | `git diff --name-only b9adb26..HEAD` · `git status --short` · `git diff \| grep -Ei "service_role\|eyJ…"` | Diff = **38 file = scope 38 file** (khớp tuyệt đối). `git status` cuối vòng: 6 file `src/features/pos/*` (3 code fix + 3 test — đúng gói) · ` M state.json` (**authorized**, main ghi trước QC) · ` M supabase/functions/auth-login/index.ts` (**authorized** — fix nợ SEC-004, đã ghi `state.log`) · `?? .opencode/evidence/p6-qc-round2.md` (**báo cáo qc**, không tính) · test `PosPage.test.tsx` do qc sửa. **0 file rác/ảnh mới**; pattern secret: mọi match là **văn bản báo cáo/state** ("service_role" trong mô tả), **không có key/JWT thật** (`eyJ…` 0 match). Không đụng `AGENT.md`/`design.md`/`loop.md`; `plan.md` chỉ có tick của main |

---

## XÁC MINH HAI LỖÍ VÒNG 2

### [QC-016] MAJOR (sig `e7fbad546f8e727625b39bdbbc4b88161da2b10b`) → **CLOSED**
- **3 test qc bổ sung vòng 2 còn nguyên trong repo** (`PosPage.test.tsx`): `QC-013(b)` Σ dòng = Tổng cộng (2 ly + topping = 80.000) · `QC-013(c)` `price_drift=true` → amber + `role=status` + RPC 1 lần · test cảnh báo "tổng server … khác giỏ" (nâng cấp thành test QC-017, giữ nguyên `p_menu_version: 7` / `p_is_offline: false`).
- **Test mới của main đối chiếu thật**: `logic.test.ts` `repriceBill` **×3** · `checkout.test.ts` `resolvePrintableBill` **×4** · `PosPage.test.tsx` QC-017 **×2** → tổng số test repo **387 → 388** (qc +1).
- **Kết quả**: `npx vitest run src/features/pos/PosPage.test.tsx` → **20/20 pass**, toàn repo **388/388 exit 0**.
- **state.log** có mục `FIX QC-016 + QC-017` kèm `skills_read` đầy đủ (AGENT.md §12.2) ⇒ điều kiện "main giữ lại + ghi nhận" đã thoả.

### [QC-017] MAJOR (sig `0877137b125c7ee543e86ebf70463d323e30307a`) → **CLOSED**
- **Tái hiện trên code TRƯỚC fix** (worktree sạch từ `git archive HEAD` ở `/tmp/opencode/prefix`, chép test vào — không đụng repo):
  ```
  npx vitest run src/features/pos/Qc017Repro.test.tsx   → exit 1
  IN_RA: {"lineSum":35000,"total":40000}
  AssertionError: expected 35000 to be 40000
  ```
  ⇒ reproducer vòng 2 **chạy thật được** (bill vẫn in Σ 35.000 ≠ Tổng 40.000).
- **Cùng kịch bản trên code hiện tại**: `IN_RA: null` — `data-testid="bill-sheet"` **không được render**, `billNodeToPngDataUrl` không gọi, `uploadMock` không gọi, giỏ về `0 món`, hiện amber `Ảnh bill chưa xuất được — bill vẫn đã ghi nhận.` và message `…chưa xuất ảnh bill, kiểm tra giỏ rồi bán lại.` (test `PosPage.test.tsx:336` pass).
- **Nhánh đồng nhất được**: `syncMenu` ghi cache giá 40.000 → in bill, **Σ dòng = Tổng cộng = 40.000**, `uploadMock` gọi 1 lần (test `PosPage.test.tsx:363` pass).
- **Không còn đường in Σ ≠ Tổng** — rà toàn bộ 3 điểm render (`grep renderBillPng`):
  1. `PosPage.tsx:146-158` online, **có gate** `sheetBill = serverMismatch ? await resolvePrintableBill(...) : bill`; `sheetBill === null` → bỏ qua `renderBillPng` + upload (`PosPage.tsx:144`), `setLastSale(png=null)` (`:163`).
  2. `PosPage.tsx:177-183` offline: `total: sheetTotal(bill, null)` = `billTotal(bill)` (`checkout.ts:195-197`) trong khi Σ dòng bảng = `Σ(unit+topping)×qty` = đúng `billTotal` (`logic.ts:166-174`, `BillSheet.tsx:97,105`) ⇒ **bằng nhau theo xây dựng**; RPC offline cũng cộng theo snapshot (`create_bill_rpc.sql` nhánh `p_is_offline`) ⇒ PNG khớp DB. Test regression do qc bổ sung xác nhận **80.000 = 80.000**.
  3. Không component nào khác render `BillSheet` (`grep BillSheet` chỉ `PosPage.tsx`).
- **Khớp `create_bill_rpc.sql` PASS 1?** ✔ Đúng hướng: online server lấy `v_price := v_prod.price / v_name := v_prod.name` (không tin giá client), `v_total = Σ qty×(price+topping)` — bằng công thức `lineTotal` của client. `resolvePrintableBill` chỉ trả bill khi `billTotal(repriced) === serverTotal` (`checkout.ts:217`), tức **bằng chứng tối thiểu bill in ra khớp tổng đã ghi DB**; thiếu SP/topping (`missing`) hoặc menu không tải lại được → `null` → không in (`checkout.ts:214-216`).
- **Bypass?** Không tìm thấy: mọi nhánh in đều đi qua gate duy nhất ở `PosPage.tsx:140-144` hoặc nhánh offline tự đồng nhất; `setSheet(null)` trong `finally` (`:209`) nên không còn sheet cũ trong DOM. Lỗi `syncMenu` được nuốt thành `null` (`checkout.ts:218-220`) → không in, không ném ra UI.

---

## LỖI

**Không có.** 0 BLOCKER · 0 MAJOR · 0 MINOR mới. Không reopen QC-013/014/015/016/017.

## QUAN SÁT (không tính lỗi — ghi cho backlog cân nhắc)
- **Đường hiếm còn lại (chưa phải lỗi)**: nếu `serverMismatch === false` thì code **không** re-price, tức bill in theo *giá cache* — chỉ khác DB khi tổng server **tình cờ bằng** tổng cache dù giá từng dòng lệch. Điều này chỉ tới được qua race `Promise.all` trong `fetchMenu` (`menuSync.ts:74-79`, đọc `menu_version` + `products` không nguyên tử — đã nêu ở vòng 2) **và** hai thay đổi giá bù trừ nhau đúng bằng 0 trong cửa sổ đó. Khi đó: tổng tiền in vẫn đúng, DB vẫn đúng (server tính lại), chỉ giá *từng dòng* trên PNG khác bill_items. Ảnh hưởng rất thấp, không vi phạm `AGENT.md §11.7` (giá trong DB không sai). Gợi ý (không bắt buộc, để main cân nhắc vào backlog): luôn gọi `resolvePrintableBill` khi online thay vì chỉ khi `serverMismatch`.
- `isMenuStale` (wrapper của `isCacheStale`) chưa có test riêng — logic thật (`isCacheStale`) đã có test (`menuSync.test.ts:54-59`); wrapper 4 dòng, không phải logic mới của P6.

## TEST ĐÃ BỔ SUNG (file: `src/features/pos/PosPage.test.tsx`)
1. **`QC-017 (regression): offline in bill Σ dòng tiền = Tổng cộng (giá snapshot, không lệch)`** — 2 ly + topping, `navigator.onLine=false` → capture sheet lúc chụp PNG → **80.000 = 80.000**, `rpcMock` không gọi (đóng kín nhánh offline theo yêu cầu (iii)).
2. **Chặn assert rỗng** ở test `QC-013(c) price_drift`: thêm `expect(captured).not.toBeNull()` + `lineSum/total = 35.000` (trước đó `captured?.x === captured?.y` pass im lặng khi `captured=null`).
3. **Hoist `captureSheetOnce`/`Captured` ra module scope** để dùng chung cho online + offline (giữ nguyên mọi assertion cũ).
- **Kết quả cuối**: file **20/20 pass**, toàn repo **388/388**, typecheck 0, lint 0.

## KHÔNG KIỂM ĐƯỢC / GIỚI HẠN
- **Q8 = N/A** (0 migration mới) — không chạy `supabase test db`; local Supabase chưa start (backlog `B-001`) → verify `create_bill_rpc.sql` dạng **static đọc SQL**.
- **e2e 117/117 + build chạy trước khi qc bổ sung 1 unit test** — thay đổi chỉ ở file test (không đụng app code); đã chạy lại **typecheck/lint/unit/coverage/build** sau bổ sung (đều exit 0, gzip 224,85 kB không đổi).
- Test console độc lập (`e2e/qc-q10-console.spec.ts`) là **test tạm**, chạy xong 2/2 pass rồi **xoá** (không tính vào 117).
- Safari/iPhone thật không có trong môi trường (e2e dùng chromium/webkit/mobile-emulation) — kế thừa giới hạn P11-T4.
- `state.json → loop.last_report` **do main-coding ghi** (qc bị cấm sửa state — subagent.md §0/§2.2).

---

## GỬI main-coding
```
VERDICT PASS — 0 BLOCKER/MAJOR/MINOR mới; 11 xanh + Q8 N/A.
[QC-016] CLOSED (sig e7fbad54…): 3 test qc vòng 2 còn nguyên + main thêm
  repriceBill×3 / resolvePrintableBill×4 / PosPage QC-017×2; repo 388/388.
[QC-017] CLOSED (sig 0877137b…): tái hiện trên code TRƯỚC fix = IN_RA {35000,40000} FAIL;
  code hiện tại = không render bill-sheet (nhánh lệch) / Σ=Tổng=40.000 (nhánh đồng nhất)
  / offline Σ=Tổng=80.000. Không bypass: 3 điểm render đều qua gate hoặc tự đồng nhất.
  Khớp create_bill PASS 1 (server tính lại; client chỉ in khi Σ == serverTotal).
Số liệu độc lập: typecheck 0 · lint 0 · unit 388/388 (37 file) · cov lines 93.68%
  (lib 87.79%, features/pos 98.74%, checkout 100%) · build gzip 224.85 kB ·
  e2e 117/117 exit 0 (6.0m) · axe 0 serious · console /pos = 0 (chromium+webkit) ·
  .only/.skip 0 · diff 38/38 = scope · git status 2 file authorized + test qc + báo cáo qc ·
  secret thật 0.
Quan sát (không chặn): xem mục QUAN SÁT — đường "tổng bằng nhưng giá dòng lệch" chỉ
  qua race menuSync + giá bù trừ; gợi ý cân nhắc luôn re-price khi online (backlog).
Bổ sung test: PosPage.test.tsx +1 test offline Σ=Tổng, +2 assert chống pass im lặng.
Báo cáo: .opencode/evidence/p6-qc-round3.md
```
