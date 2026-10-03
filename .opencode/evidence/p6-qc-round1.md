# QC REPORT — Phase P6 — Vòng 1

- Ngày: 2026-10-03 · Agent: **qc-test** · Gói đầu vào: phase P6, round 1, scope 31 file (khớp `git diff --name-only b9adb26..HEAD` = 32 file, thêm `package-lock.json` đối tác `package.json`), tasks `P6-T0, T1(huỷ theo Q-004), T2..T9, P4-T5, P4-T9`, checklist Q1–Q12 (**Q8 N/A — P6 không có migration mới**), `prev_report`: vòng 1 chưa có
- Skills/tài liệu đọc (khai báo theo AGENT.md §5/§12): `AGENT.md` (§3, §4, §5, §8, §11, §12), `subagent.md` (§0, §1, §2.1–2.3, §4), `loop.md`, `plan.md` [P6], `design.md` §6, §7.3–7.4, §8, §11, `.opencode/skills/pos-bill/skill.md`, `.opencode/skills/testing/skill.md`, `.opencode/skills/pwa-offline/skill.md` §4, `.opencode/skills/uiux/skill.md`, `.opencode/skills/backend/skill.md` §4, `supabase/migrations/20261001155441_create_bill_rpc.sql` (đối chiếu static)
- **Không sửa code sản phẩm** — chỉ đọc + chạy lệnh + báo cáo; **thêm 6 unit test** vào file test có sẵn `src/features/pos/exportBillPng.test.ts` (logic P6-T9 chưa có test — xem mục TEST ĐÃ BỔ SUNG); 1 test tái hiện lỗi chạy tạm ở `/tmp`-scope rồi **đã xóa** (không nằm trong repo)

VERDICT: **FAIL**
TÓM TẮT: 12/12 hạng mục có kết quả — **10 xanh + Q8 N/A + 1 hỏng (Q7)**. Có **1 MAJOR [QC-013]**: bill PNG in ra **không cộng được thành tổng** khi giá đổi giữa lúc đang mở POS — dòng tiền in theo giá **cũ** trong giỏ, tổng lấy từ **server** (mới), không có cảnh báo nào (bằng chứng tái hiện ở dưới: `printed_line_sum 35000` vs `printed_total 40000`, `mismatch: true`). Kèm **2 MINOR** ([QC-014] `maxLength` ô SĐT/ghi chú đơn = 100 nhưng RPC kẹp 50; [QC-015] `vitest.config.ts` `coverage.include` chưa gồm `src/features/pos/*.ts` → 3 module logic mới của P6 nằm ngoài báo cáo coverage mặc định). Số liệu độc lập: typecheck **0**, lint **0**, unit **371/371** (37 file, +6 test qc), coverage `lib` **88.15%** / `pos/logic` **97.91%** / tổng **93.04% lines**, build **exit 0** gzip **223.64 KB < 250 KB** (qrcode + html-to-image **tách chunk lazy thật**, xác minh bằng sourcemap), e2e **114/114 exit 0**.

KẾT QUẢ THEO HẠNG MỤC:

| # | KQ | Lệnh/Cách → exit | Trích output (≤5 dòng) |
|---|---|---|---|
| Q1 | ✔ | `npm run typecheck` → **exit 0** | `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json` · **0 lỗi** (chạy lại sau khi thêm test → vẫn 0) |
| Q2 | ✔ | `npm run lint` → **exit 0** | `eslint .` · 0 lỗi/cảnh báo (chạy lại sau khi thêm test → vẫn 0) |
| Q3 | ✔ | `npm run test -- --run` → **exit 0** | `Test Files 37 passed (37)` · `Tests 371 passed (371)` (main 365 + 6 qc). Anti-skip: `grep -rn "\.only(\|\.skip("` src e2e → **0** (chỉ có `swScope.skipWaiting()` = API hợp lệ) |
| Q4 | ✘→✔ | Đối chiếu `tasks_done` ↔ test (đọc `logic.test.ts` 22 it, `PosPage.test.tsx` 17 it, `BillSheet.test.tsx` 5 it + snapshot, `qr.test.ts` 4 it, `checkout.test.ts` 10 it, `billUpload.test.ts` 6 it, `outbox.test.ts` 12 it, `menuSync.test.ts` 19 it, e2e 3 spec P6) | T2/T3 logic+PosPage+`p6-pos` · T4 snapshot 7 khối · T5 `qr` · **T6 thiếu test cho `warmBillImage`/nhúng `<img>`/`preloadBillPngLib` (P6-T9) → qc bổ sung 6 test, file 53.33% → 97.77%** · T7 `checkout`+`billUpload`+`outbox` · T8 3 test Web Share · T9 e2e PNG 1440px + offline→sync · T0/T1 N/A (Q-004 chốt emoji / huỷ nạp PNG) |
| Q5 | ✔ | `npx vitest run --coverage` → **exit 0** (+ 1 lần đo override `--coverage.include='src/features/pos/**'`) | `Lines 93.04% (656/705)` · `Branches 85.12%` · **`src/lib` 88.15% (290/329) ≥ 80** · `logic.ts 97.91%` · P6: `billUpload 100` `checkout 100` `qr 100` `useOutbox 100` `db 100` `menuSync 90` `outbox 87.5` `exportBillPng 97.77` (sau bổ sung) → [QC-015] MINOR vì 4 file pos này **không hiện** trong báo cáo mặc định |
| Q6 | ✔ | Đọc toàn bộ 11 file test của scope | Mô tả hành vi tiếng Việt, happy + biên + lỗi; assert cụ thể (`toHaveBeenCalledTimes(1)`, `toMatch(OFFLINE_CODE_PATTERN)`, magic bytes PNG, `scrollWidth`); mock **chỉ ở biên mạng/canvas** (`supabase`, `html-to-image`) — logic tiền/outbox/menu chạy **thật** trên fake-indexeddb; **không** có assert rỗng/luôn đúng, không `.skip` để lách |
| Q7 | ✘ | Đối chiếu `design.md §6/§7.3/§8` + RPC migration | Đạt: tiền nguyên VND (`logic.ts:166-174`), **7 tham số RPC** khớp `create_bill` (P1-T7), `phone_note ≤ 50` (`logic.ts:11` + migration:43 `length>50 → phone_note_invalid`), mã `HT-YYMMDD-0001`/`-OFF-xxxx` regex + e2e, path `bills/YYYY/MM` UTC+7 + ≤300KB, BillSheet 7 khối/720px/pixelRatio 2 (e2e 1440px), QR Facebook, `menu_version` lệch → refresh + **GIỮ giỏ**, emoji Q-004. **Lệch: [QC-013] MAJOR** — bill in sai tiền (chi tiết dưới) |
| Q8 | N-A | `git diff --name-only b9adb26..HEAD -- supabase/` → **0 file** | P6 **không có migration mới** (pack yêu cầu ghi rõ) → không chạy `supabase test db`; đối chiếu static RPC/Storage policy như trên |
| Q9 | ✔ | `npm run build` → **exit 0** | `dist/assets/index-*.js 775.77 kB │ gzip: **223.64 kB**` **< 250 KB** · `precache 24 entries` · 2 warning pre-existing (chunk >500 kB mặc định Vite, `inlineDynamicImports` của plugin SW) |
| Q10 | ✔ | `npx playwright test` → **exit 0**, `114 passed (7.7m)` + xem ảnh bằng Read tool | `e2e/screenshots/p6-pos-chromium-390x844.png` (2 cột SP + panel bill dọc, **không tràn**), `p6-checkout-chromium-1280x800.png` (sidebar + lưới + bill sticky, **Đã lưu HT-261003-0001.png**) · test `Q10: /pos không tràn ngang` ×3 project = 0 lỗi · `pageErrors` = `[]` |
| Q11 | ✔ | axe `AxeBuilder.analyze()` trên `/pos` (test `P6-T2/Q11`) | `violations.filter(serious\|critical)` = `[]` ở chromium/webkit/mobile → **0 vi phạm nghiêm trọng** |
| Q12 | ✔* | `git diff --name-only b9adb26..HEAD` + `git status --porcelain` + đọc diff | **32 file = 31 `scope_files` + `package-lock.json`** (đối tác `package.json` thêm `qrcode`/`html-to-image`/`@types/qrcode` — deviation có nguyên nhân, không phải phạm vi tràn) · 0 file rác, `git diff` P6 **0 match** pattern secret (`service_role`/`eyJhbGciOi`/`SUPABASE_ACCESS_TOKEN`) · `git status` sau QC: chỉ `M src/features/pos/exportBillPng.test.ts` (test qc-test bổ sung) |

LỖI (vòng này):

- `[QC-013] MAJOR · src/features/pos/PosPage.tsx:122-141 (+ checkout.ts:170-171, migration 20261001155441:142-149) · sig:1f08c81d70840cc577f24316dfbdae734840b65c`
  - Mức độ: **MAJOR** — hóa đơn PNG là artefact khách nhìn/thanh toán: Σ dòng tiền không bằng tổng in, **âm thầm** (không cảnh báo, không cờ `price_drift`), và PNG lưu vào Storage sẽ lệch với bill trong DB.
  - Bằng chứng (test tái hiện chạy thật — file tạm, đã xóa sau khi ghi output):
    ```
    QC-013 EVIDENCE {
      p_menu_version: 8, sent_unit_price: 35000,
      printed_unit_price: 35000, printed_line_sum: 35000,
      printed_total: 40000, mismatch: true,
      warning_shown: 'Đã tạo bill HT-261003-0001.'
    }
    ```
  - Nguyên nhân (đọc code):
    1. `PosPage.tsx:128-129` — bill in: `items: toSheetItems(bill)` (**snapshot giá trong giỏ**) + `total: sheetTotal(bill, result)` → `checkout.ts:171` **lấy `result.total` của server**.
    2. RPC online **luôn tính lại theo `products`** (`create_bill_rpc.sql:142-149`) và **không bao giờ set `price_drift` ở nhánh online** (`v_drift := true` chỉ ở nhánh offline, dòng 139/178) → server trả `price_drift=false`, client không cảnh báo.
    3. `PosPage.tsx:122` gửi `menuVersion: menu.menu_version` = **phiên bản MỚI nhất** của snapshot → server **không** ném `menu_version_changed`, nên **không đi nhánh cảnh báo + `syncMenu`** (dòng 168-173). Ngược lại, khi nhánh đó **có** chạy (cache cũ hơn server), `syncMenu` chỉ tải menu chứ **không re-price giỏ** → lần bấm thứ 2 rơi vào đúng kịch bản trên.
  - Tái hiện: bỏ `menu_version 7/giá 35.000` vào menu cache → POS → "Thêm" → ghi đè cache `v8/40.000` (mô phỏng `syncMenu` sau khi admin đổi giá — đúng luồng `e2e/p6-price-refresh.spec.ts`) → bấm Thanh toán (RPC trả `total: 40000`) →BillSheet nhận `items[0].unit_price=35000` nhưng `total=40000`.
  - Gợi ý hướng sửa (1–2 dòng): trước khi gọi RPC (hoặc sau `syncMenu`), **re-price từng dòng giỏ từ snapshot hiện tại** (giữ `qty/note/toppings`, cập nhật `unit_price` + tên) và/hoặc so sánh giá dòng với snapshot — lệch thì hiện cảnh báo "Giá đã đổi" + chặn chốt; phương án đối chiếu: cho RPC trả lại `items` đã tính để in bill đúng số của server.

- `[QC-014] MINOR · src/features/pos/PosPage.tsx:409 · sig:09ca073ccaef5c5b4c94716b341917dabc2c364c`
  - Mức độ: **MINOR** — `maxLength={100}` cho ô "SĐT / ghi chú đơn" trong khi `MAX_PHONE_NOTE_LENGTH = 50` (`logic.ts:11`) và RPC từ chối `>50`. Nhập ký tự thứ 51 **biến mất im lặng**, không có thông báo/gợi ý.
  - Bằng chứng: `PosPage.tsx:409 maxLength={100}` vs `logic.ts:139-141 setPhoneNote → value.slice(0, 50)` vs `create_bill_rpc.sql:43 if length(p_phone_note) > 50 then raise 'phone_note_invalid'`. (Ô ghi chú món `PosPage.tsx:335 maxLength={100}` là **đúng** `MAX_NOTE_LENGTH=100`.)
  - Tái hiện: mở POS → nhập >50 ký tự vào ô SĐT/ghi chú → input dừng ở 50, không hint.
  - Gợi ý hướng sửa: `maxLength={50}` + (tùy chọn) hiện `maxLength`/hint "tối đa 50 ký tự".

- `[QC-015] MINOR · vitest.config.ts:21 · sig:9ef80bf20bff5c0f6db8a71545ed719c47af0de5`
  - Mức độ: **MINOR** — `coverage.include` = `src/lib/**`, `src/features/*/logic.ts`, `src/features/*/api.ts`, auth, setup → **không** gồm `src/features/pos/{checkout,exportBillPng,qr}.ts`. 3 module logic mới của P6 **không hiện** trong `vitest --coverage` mặc định (phải đo override mới thấy; trước khi qc bổ sung `exportBillPng` chỉ **53.33%** mà không ai thấy).
  - Bằng chứng: `npx vitest run --coverage` → bảng chỉ có `pos/logic.ts`; `--coverage.include='src/features/pos/**'` → `checkout 100 / qr 100 / exportBillPng 97.77 / PosPage 90.29`.
  - Tái hiện: 2 lệnh trên.
  - Gợi ý hướng sửa: thêm `'src/features/*/*.ts'` (hoặc `'src/features/pos/*.ts'`) vào `coverage.include`. Lưu ý: main **đã** đóng [QC-010] vòng P5 trong chính P6 (line 21 có `src/features/*/api.ts`), nhưng mẫu "theo cặp logic+api" vẫn không khớp `pos` (3 file logic nằm ở `features/pos/*.ts` không phải `logic.ts`/`api.ts`) → cùng căn nguyên, cần 1 dòng nữa.

Quan sát (không tính lỗi, ghi để main cân nhắc):
- `plan.md` [P6-T7] ghi "cảnh báo cache **>20h** theo pwa-offline §4" nhưng skill §4 + `design §8.5` + code (`CACHE_STALE_MS = 24h`) đều là **24h** → plan trích sai số; code đúng skill/design.
- Vite warning "chunks > 500 kB" là raw size của `index` (775.77 kB) — **pre-existing từ P3** (P5 cũng có), ngưỡng dự án là **gzip < 250 KB** → không vượt.
- `e2e/p6-price-refresh.spec.ts` chỉ assert lưới giá mới cập nhật; **không** assert giỏ/_bill đã re-price → chính nó là điều kiện cần của [QC-013].

TEST ĐÃ BỔ SUNG: `src/features/pos/exportBillPng.test.ts` **+6 test** (11/11 pass, exit 0) — 4 test `warmBillImage` (happy + cache, src rỗng/data-URL, `!ok`, fetch ném), 1 test `<img>` ngoài bill được thay data-URL **trước** khi `toPng` (ảnh `data:` giữ nguyên, fetch đúng 1 lần), 1 test `preloadBillPngLib` nạp được module `html-to-image`. Sau bổ sung: `exportBillPng.ts` **53.33% → 97.77% lines**; tổng unit **365 → 371**. (Test tái hiện [QC-013] chạy **tạm** để lấy output, **đã xóa** — không để test khẳng định lỗi trong repo; main sửa xong viết lại thành regression test.)

KHÔNG KIỂM ĐƯỢC:
- **Q8 DB thật** (`supabase test db`): P6 không sinh migration + B-001 (môi trường dev không chạy được `supabase start` local) → chỉ đối chiếu static `create_bill` RPC và policy Storage với code client.
- **Ảnh PNG bill trên Safari/iPhone thật**: e2e `webkit`/`mobile` dùng Playwright WebKit (đã bắt 3 bẫy data-URL/IDB ở P6-T9) — nghiệm thu Safari thật chờ smoke **P11-T4**.
- **[QC-013] ngoài unit repro tạm**: chưa có e2e cho kịch bản "đổi giá giữa lúc đang chốt đơn" (chính vì thiếu test này lỗi lọt) → đề nghị main thêm e2e khi sửa.

GỬI main-coding (để ghi `state.json → loop.last_report`, ≤30 dòng):

```
QC P6 vong 1: VERDICT FAIL - 12/12 co ket qua (Q8 N/A, P6 khong co migration moi), 10 xanh + Q7 hong. [QC-013] MAJOR: bill PNG in sai tien khi gia doi giua luc dang mo POS - dong tien in theo gia CU trong gio (35.000) nhung tong lay tu server (40.000), khong canh bao (printed_line_sum 35000 vs printed_total 40000, mismatch true; p_menu_version gui 8 -> server khong nhan menu_version_changed; RPC online khong bao gio dat price_drift). Goc: PosPage.tsx:128-129 items=toSheetItems(bill) + total=sheetTotal(bill,result) (checkout.ts:171), create_bill_rpc.sql:142-149 tinh lai gia, syncMenu (PosPage.tsx:169) khong re-price gio. 2 MINOR: [QC-014] PosPage.tsx:409 maxLength=100 vs MAX_PHONE_NOTE_LENGTH=50 (ky tu thua bien mat im lang); [QC-015] vitest.config.ts:21 coverage.include thieu src/features/pos/*.ts -> checkout/qr/exportBillPng nam ngoai bao cao mac dinh (da dong QC-010 bang features/*/api.ts, can 1 dong nua cho pos). So lieu doc lap: typecheck 0, lint 0, unit 371/371 (37 file, +6 test qc), coverage lib 88.15% + pos/logic 97.91% + toan 93.04% lines, build exit 0 gzip 223.64KB < 250KB (qrcode browser-*.js 8.85KB + html-to-image es-*.js 5.20KB tach chunk lazy that, xac minh bang sourcemap), e2e 114/114 exit 0 (7.7m), axe /pos 0 serious, anh p6 2 viewport xem tay khong tran. Q12: 32 file = 31 scope + package-lock (doi tac package.json), 0 secret/ranh. TEST BO SUNG: exportBillPng.test.ts +6 (warmBillImage/nhung img/preload) -> file 53.33% -> 97.77%; test tai hien QC-013 chay tam da xoa. Chi tiet: .opencode/evidence/p6-qc-round1.md
```
