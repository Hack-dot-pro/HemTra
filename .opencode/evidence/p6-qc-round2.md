# QC REPORT — Phase P6 — Round 2

- **Ngày**: 2026-10-03 · **Agent**: `qc-test` (subagent.md §2) · **Model**: mimo-v2.6-flash-free
- **Gói**: `P6 · round 2 · scope 38 file` (`git diff --name-only b9adb26..HEAD`, đã đối chiếu khớp `scope_files` 38/38)
- **Mục tiêu vòng này**: xác minh 3 fix vòng 1 — [QC-013] drift chặn trước RPC · [QC-014] `maxLength` phone_note · [QC-015] coverage `include`
- **Skills đã đọc**: `frontend-design`, `playwright`, `webapp-testing` (+ rà `subagent.md`/`loop.md`/`plan.md`/`design.md §6,§7.3,§8`)
- **Quyền**: chỉ sửa/thêm **file test**. Không sửa code sản phẩm, không sửa `state.json`, không sửa `plan.md`.
- **File đã sửa trong vòng này**: `src/features/pos/PosPage.test.tsx` (**+3 test**, không đổi app code)

---

## VERDICT: **FAIL**

**Tóm tắt**: 12/12 hạng mục có kết quả — **10 xanh, 1 N/A (Q8), 1 hỏng (Q7)**.
3 fix vòng 1 **đạt về code**: [QC-013](a) chặn drift trước RPC ✅ · [QC-014] `maxLength={MAX_PHONE_NOTE_LENGTH}` ✅ · [QC-015] `coverage.include` đã gồm `src/features/*/*.ts` ✅.
Nhưng **gói fix [QC-013] chưa hoàn chỉnh**: (b)/(c) **không có test nào trong bản giao** (qc tự bổ sung 3 test chạy xanh), và khi viết case **(b)** cho nhánh `serverMismatch` → **FAIL**: bill vẫn in `Σ dòng 35.000 ₫ ≠ Tổng cộng 40.000 ₫` ⇒ **2 MAJOR**.
**Số liệu độc lập (qc tự chạy)**: typecheck `0` · lint `0` · unit **379/379** (37 file) · coverage lines **93,5%** (`lib` 87,80% · `features/pos/*.ts` 98,54%) · build `0` (gzip **224,61 kB** < 250) · e2e **117/117 pass, exit 0** (6,6m) · axe **0 serious/critical** · `.only/.skip` **0**.

---

## BẢNG CHECKLIST Q1–Q12

| # | KQ | Lệnh / cách kiểm | Bằng chứng (trích) |
|---|----|-------------------|--------------------|
| Q1 | ✔ | `npm run typecheck` → **exit 0** | `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json` không output |
| Q2 | ✔ | `npm run lint` → **exit 0** | `eslint .` không output |
| Q3 | ✔ | `npm run test -- --run` → **exit 0**; grep `.only(` / `.skip(` trong `src`+`e2e` | **`Test Files 37 passed` · `Tests 379 passed (379)`** (giao 376 + qc bổ sung 3); anti-skip **0** |
| Q4 | ✖→bù | Đối chiếu từng task P6-T2..T9 với test thật (đọc `checkout.test/PosPage.test/BillSheet.test/outbox.test/billUpload.test/qr.test/exportBillPng.test/logic.test/menuSync.test` + 4 spec e2e) | **(a)** có mặt: `checkout.test.ts:77` describe `P6-QC-013` (4 case) · `PosPage.test.tsx:231` `it('QC-013…')` · `e2e/p6-checkout.spec.ts:119`. **(b)/(c) thiếu hoàn toàn** → qc thêm 3 test (xem mục *TEST ĐÃ BỔ SUNG*). Các case khác đạt: 7 tham số RPC assert (`checkout.test:120-128`), mã OFF regex + `makeOfflineCode`, path `bills/YYYY/MM` UTC+7, `307200` (300 KB) biên, QR `FACEBOOK_URL` (`qr.test`), `p_menu_version` lệch → giữ giỏ (2 test + e2e), `phone_note ≤ 50`, emoji grid (e2e + 60 ảnh) |
| Q5 | ✔ | `npx vitest run --coverage` → **exit 0** | lines **93,5% (749/801)**; `src/lib` **87,80% (295/336)**; `features/pos/*.ts` **98,54% (135/137)**; per-file `checkout 100%`, `exportBillPng 97,77%`, `qr 100%`, `logic 97,91%` ⇒ **[QC-015] đạt** (`vitest.config.ts:21` `include: ['src/lib/**','src/features/*/*.ts']`) |
| Q6 | ✔ | Đọc nội dung test thay cho "chỉ toBeTruthy" | `logic.test` 22 case (happy/biên/lỗi: `qty MAX`, `MAX_NOTE_LENGTH`, `giỏ rỗng`, `line_id không tồn tại`); `exportBillPng.test` 11 case (Safari warm-up, `PNG_EXPORT_EMPTY`, fetch fail → `null`); `menuSync.test` 17 case (`menu_fetch_failed`, version trùng → không tải). **1 `toBeTruthy()` duy nhất** = PNG outbox rỗng `data:image/png;base64,` — có lý do (không đọc được nội dung PNG trong jsdom) |
| Q7 | **✖** | Đối chiếu `design.md §6/§7.3/§8` + `AGENT.md §11.7` (không sai lệch tiền/nhân sự) | HIT: VND nguyên (không `/1000`), `BillSheet` 720px (e2e 1440), regex `HT-YYMMDD-0001`/`-OFF-xxxx`, `billPngPath` UTC+7, `phone_note 50` = RPC `length(p_phone_note)>50 → phone_note_invalid`, storage policy `^[0-9]{4}/[0-9]{2}/HT-…\.png$` + `307200`. **LỆCH → [QC-017]**: nhánh `serverMismatch` vẫn in bill Σ dòng ≠ tổng |
| Q8 | N/A | `git diff --name-only b9adb26..HEAD \| grep -c '^supabase/'` | **0** file migration (P6 không đụng DB) ⇒ không cần `supabase test db`. *(Vẫn nằm `B-001`: local Supabase chưa chạy → các verify DB làm static)* |
| Q9 | ✔ | `npm run build` → **exit 0** | `index-C7MOF3PI.js 779,55 kB │ gzip: 224,61 kB` (**< 250 kB**), `browser-*` 8,85 kB / `es-*` 5,20 kB lazy, precache 24 entry; 2 warning (`supabase/functions/auth-login` config) **có từ trước** |
| Q10 | ✔ | `npx playwright test` → **exit 0**; script tách `/login` @390+1280 | **`117 passed (6.6m)`** × 3 project (chromium/webkit/mobile); 60 ảnh đúng kích thước; `scrollW==innerW` ở cả 390 & 1280; **`consoleErrors=0`** (e2e có assert + script độc lập) |
| Q11 | ✔ | `P6-T2/Q11 axe /pos` + `P5 axe /products` × 3 project | `expect(serious).toEqual([])` pass ⇒ **0 serious/critical** |
| Q12 | ✔ | `git diff --name-only` + `git status --short` + `git diff \| grep -Ei "service_role\|eyJhbGciOi\|…"` | diff = **38 file = `scope_files` 38 file** (khớp tuyệt đối). `git status` cuối vòng: ` M state.json` (sửa sẵn trước QC) · ` M supabase/functions/auth-login/index.ts` (**quyền được cấp**, đã ghi `state.log` "FIX SEC-004") · ` M src/features/pos/PosPage.test.tsx` (**test qc bổ sung**) · `?? .opencode/evidence/p6-qc-round2.md` (**báo cáo này** — qc tạo, ngoài phạm vi kiểm) · **0 file rác khác**. Pattern secret: 2 match = **văn bản báo cáo/state**, không có key thật |

---

## LỖI

### [QC-016] MAJOR — Thiếu test cho case (b)/(c) của fix [QC-013]
- **sig**: `sha1("QC-016|src/features/pos/PosPage.test.tsx|thieu case test (b) in Σ dòng = tổng và (c) price_drift warn trong fix QC-013")` = `e7fbad546f8e727625b39bdbbc4b88161da2b10b`
- **Bằng chứng**: `git diff b9adb26..HEAD -- src/features/pos` — commit sửa [QC-013] chỉ thêm **case (a)** (`checkout.test` 4 case + `PosPage.test` 1 case + e2e 1 case). **Không có test nào** cho: (b) "bill in Σ dòng tiền = Tổng cộng" và (c) "RPC trả `price_drift=true` → cảnh báo, vẫn ghi nhận bill".
- **Mức**: MAJOR theo `loop.md §4.3` (logic mới thiếu test) — đúng yêu cầu "thiếu case → MAJOR kèm sig".
- **Trạng thái**: **qc đã bù 3 test** (mục *TEST ĐÃ BỔ SUNG*), **379/379 xanh** ⇒ main chỉ cần **giữ lại 3 test này + ghi nhận vào state**, không cần sửa code.
- **Không sửa bằng cách khác**: qc không sửa code sản phẩm (quy tắc §2.2.4).

### [QC-017] MAJOR — Nhánh `serverMismatch` vẫn in bill Σ dòng tiền ≠ Tổng cộng
- **sig**: `sha1("QC-017|src/features/pos/PosPage.tsx:155-162|bill in Σ dòng tiền 35000 khác tổng in 40000 (serverMismatch)")` = `0877137b125c7ee543e86ebf70463d323e30307a`
- **Vị trí**: `src/features/pos/PosPage.tsx:155-162` — khi RPC trả `total ≠ billTotal(cart)` (nhánh cảnh báo "tổng server … khác giỏ"), code vẫn `toSheetItems(bill)` + `sheetTotal(bill, result)` → **cột Thành tiền của từng dòng = giá giỏ cũ, Tổng cộng = giá server**.
- **Tái hiện (test qc, chạy 1 lần để lấy output, đã gỡ assertion tạm để giữ suite xanh — theo tiền lệ vòng 1)**:
  - Cart `Trà sữa đào 35.000 + Trân châu 5.000` → RPC trả `{ total: 40000, price_drift: false }` → click Checkout → `BillSheet` render: `Σ Thành tiền = 35.000`, `Tổng cộng = 40.000`.
  - Kết quả chạy: `PosPage.test.tsx` ❌ `expected 35000 to be 40000` (assertion `expect(captured?.lineSum).toBe(captured?.total)`).
- **Reachability (không phải lỗi tưởng)**: `fetchMenu` đọc `app_meta.menu_version` + bảng `products` bằng **`Promise.all` không nguyên tử** (`src/lib/menuSync.ts:74-79`) → snapshot có thể chứa version cũ + giá mới (hoặc ngược) → drift check **bỏ sót** → RPC trả tổng khác. Trigger bump (`20261001153750_…sql`) đã phủ `insert/update/delete` cả 3 bảng ⇒ đường "version khớp nhưng giá lệch" chỉ còn race này (hiếm, nhưng tới được).
- **Hậu quả**: PNG bill gửi khách **không cộng lại ra số in** (sai tiền trên chứng từ) dù staff có cảnh báo → vi phạm `AGENT.md §11.7`.
- **Đề xuất sửa** (main-coding chọn 1): ① RPC trả thêm `items` (giá server) để in theo đó; ② khi lệch → `syncMenu` + re-price giỏ rồi mới in; ③ **không in PNG** ở nhánh lệch (fallback sẵn có `PosPage.tsx:488-490` "Ảnh bill chưa xuất được — bill vẫn đã ghi nhận") + giữ cảnh báo. Kèm test regression `Σ dòng = Tổng cộng`.
- **Ghi chú severity**: đã **cảnh báo** (không âm thầm) và tần suất **hiếm** (race `Promise.all`) — nếu main có counter-evidence (§4.4) chứng minh không tới được thì gửi lại qc-xác minh để hạ cấp, **không tự sửa không báo**.

### Quan sát (không tính lỗi)
- `PosPage.tsx:351` `maxLength={100}` là ô **ghi chú món** (`MAX_NOTE_LENGTH`) — đúng; ô `phone_note` ở `:425` mới là 50 ⇒ **[QC-014] đạt**, vòng 1 báo đúng.
- `create_bill` trả `price_drift` **chỉ ở nhánh offline**; nhánh online client tự cảnh báo qua `serverMismatch`/`findPriceDriftLines` — nhất quán với `create_bill_rpc.sql`.

---

## TEST ĐÃ BỔ SUNG (file: `src/features/pos/PosPage.test.tsx`, +3, không sửa test cũ)
1. `QC-013(b): thanh toán online không lệch → bill in Σ dòng tiền = tổng cộng` — mock `billNodeToPngDataUrl` đọc `[data-testid="bill-sheet"]`, cộng `td` cuối dòng vs ô `Tổng cộng` → **80.000 = 80.000** ✅
2. `QC-013(c): RPC trả price_drift=true → cảnh báo "giá tại quầy khác", vẫn ghi nhận bill` — assert chữ + `role=status` + `border-amber-300/40` + RPC gọi 1 lần ✅
3. `QC-013(c): RPC trả tổng khác giỏ → cảnh báo "tổng server … khác giỏ" (p_menu_version vẫn gửi)` — assert message + `p_menu_version: 7` + `p_is_offline: false` ✅
- **Kết quả**: file 18/18 pass; toàn repo **379/379**; typecheck 0; lint 0.
- Case **(b) cho nhánh `serverMismatch`** viết ra là **FAIL** → nằm ở [QC-017]; assertion tạm đã gỡ, suite để xanh.

---

## KHÔNG KIỂM ĐƯỢC / GIỚI HẠN
- **Q8 = N/A** (0 file migration) — verify DB dạng static, không chạy `supabase test db` (kế thừa `B-001`, local Supabase chưa start).
- **Safari/iPhone thật** không có trong môi trường → ảnh + e2e chạy chromium/webkit/mobile-emulation; thiết bị thật để **P11-T4**.
- **e2e (117 pass) + build chạy trước khi qc bổ sung 3 unit test** — diff chỉ ở file test, không đụng app code/build; đã build lại sau sửa: exit 0, gzip 224,61 kB.
- Xem ảnh `e2e/screenshots` bằng mắt chỉ một phần; phần lớn kiểm bằng programmatic (kích thước/`scrollWidth`/`consoleErrors`/axe).

---

## GỬI main-coding
```
VERDICT FAIL — 2 MAJOR, 0 MINOR.
[QC-016] MAJOR sig=e7fbad54… thiếu test case (b)/(c) của fix [QC-013]; qc đã bù 3 test (379/379 xanh) → main giữ lại + ghi state.
[QC-017] MAJOR sig=0877137b… PosPage.tsx:155-162: nhánh serverMismatch vẫn in bill Σ 35.000 ≠ Tổng cộng 40.000.
   Reachable qua race Promise.all trong menuSync.ts:74-79 (version+giá đọc không nguyên tử).
   Sửa chọn 1: RPC trả items để in | re-price sau syncMenu | không in PNG ở nhánh lệch (fallback :488-490). Kèm regression test Σ=Tổng cộng.
3 fix vòng 1: [QC-013](a) ✅ / [QC-014] ✅ / [QC-015] ✅ — không reopen.
Số liệu độc lập: typecheck 0 · lint 0 · unit 379/379 · cov lines 93.5% (lib 87.80%, pos .ts 98.54%) · build gzip 224.61 kB · e2e 117/117 exit 0 · axe 0 serious.
Q8 N/A (0 migration). Diff 38/38 = scope; git status: 2 file authorized + 1 test qc + báo cáo qc; secret 0 (2 match là text báo cáo).
Báo cáo: .opencode/evidence/p6-qc-round2.md
```
