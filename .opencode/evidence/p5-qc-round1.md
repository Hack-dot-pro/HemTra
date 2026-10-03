# QC REPORT — Phase P5 — Vòng 1

- Ngày: 2026-10-03 · Agent: **qc-test** · Gói đầu vào: phase P5, round 1, tasks P5-T1..T6, checklist Q1–Q12 (Q8 N/A — P5 không chạm migration, đối chiếu design thay thế), `prev_report`: vòng đầu phase P5 (không có báo cáo trước)
- Skills/tài liệu đọc (khai báo theo AGENT.md §5/§12): `AGENT.md` (§0/§3/§5/§8/§11/§12), `subagent.md` (§0, §2.1–2.3), `loop.md` (§4.2–4.3, §5), `plan.md` (P5 + P4 liên quan), `design.md` §4.1, §5, §7.3–7.4, §11, `.opencode/skills/testing/skill.md`, `.opencode/skills/uiux/skill.md` (§3–§4 — mục qc-test kiểm Q10/Q11), `.opencode/skills/backend/skill.md` (§4–§6), migration P1 (`core_menu_tables`, `menu_version_realtime`, `rls_policies`)
- **Không sửa code sản phẩm** — chỉ đọc + chạy lệnh + báo cáo; chỉ thêm **file test** (2 file, ghi ở cuối)

VERDICT: **FAIL**
TÓM TẮT: 12/12 hạng mục có kết quả; **11 xanh/N-A, Q10 FAIL** — `/products` **tràn ngang trang ở 390×844** (`document.scrollWidth 706` vs `innerWidth 390`, cả 3 project), ảnh chụp P5 cũng thấy card/chữ bị cắt lìa mép phải → **[QC-009] MAJOR**. Không có lỗi khối khác: typecheck/lint 0, unit **299/299** (main 294 + **5 test tôi bổ sung** cho T1 sắp xếp/ẩn nhóm chưa có test), coverage `lib` 87.41% & `products/logic.ts` 100%, build xanh (gzip 217.04 KB < 250 KB), e2e **93 passed + 3 failed** (3 fail chính là test đo tràn ngang tôi thêm — bằng chứng QC-009; 90 test cũ **đều xanh**), axe `/products` **0 serious/critical**.

KẾT QUẢ THEO HẠNG MỤC:

| # | KQ | Lệnh/Cách → exit | Trích output (≤5 dòng) |
|---|---|---|---|
| Q1 | ✔ | `npm run typecheck` → **exit 0** | `> tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json` · 0 dòng lỗi. **Tự xác minh script cũ là no-op**: `tsconfig.json` có `"files": []` + chạy `npx tsc --noEmit` (cũ) → **exit 0 trong khi không check file nào** → main-coding sửa script + 23 lỗi type là đúng, không phải "vá test cho qua" |
| Q2 | ✔ | `npm run lint` → **exit 0** | `> eslint .` · 0 lỗi/cảnh báo (chạy cả sau khi thêm 2 file test mới) |
| Q3 | ✔ | `npm run test -- --run` → **exit 0** | Trước bổ sung: `Test Files 29 passed (29)` / `Tests 294 passed (294)` · Sau bổ sung: **`30 passed / 299 passed`**. Anti-skip: `grep -rn "\.skip\|\.only\|xit(\|xdescribe("` `src e2e` → chỉ match `swScope.skipWaiting()` và `failAndMaybeExit()` (false positive), **0 `.skip/.only` mới** |
| Q4 | ✘→✔ | Đối chiếu P5-T1..T5 ↔ `src/features/products/*.test.ts` + `e2e/p5-products.spec.ts` | Chi tiết ở dưới — **thiếu test cho T1 "sắp xếp ↑/↓" và "ẩn nhóm"** (chỉ có `swapTargets` thuần, không ai gọi `moveCategory`) → **đã viết thêm `ProductsPage.test.tsx` (5 test, xanh)** → lấp lỗ hở |
| Q5 | ✔ | `npx vitest run --coverage --coverage.reporter=text` → **exit 0** | `lib \| … \| **87.41**` lines (≥80) · `features/products/logic.ts **100/100/100/100**` · `All files Lines 92.74%`. Đo riêng `api.ts` (chưa nằm trong `coverage.include`): **91.22% lines** → [QC-010] MINOR (cấu hình) |
| Q6 | ✔ | Đọc `logic.test.ts` (19 it), `api.test.ts` (11 it), `ProductsPage.test.tsx` (5 it), `e2e/p5-products.spec.ts` (2 test) | Mô tả hành vi tiếng Việt; happy + biên + lỗi (`price NaN/-5000/35000.5`, `sort_order -1/1.5`, `swapTargets` đầu/cuối/id không tồn tại, `excludeId`/`categoryId`); assert không rỗng (kiểm message chính xác `'Tên sản phẩm đã tồn tại trong nhóm này.'`, `toHaveBeenCalledTimes(1)` khi lỗi giữa chừng); mock `fakeSupabase` **chèn** `offline`/`errorTables` để ép lỗi thật, không nuốt lỗi (`console.error('[products api]', error)` giữ nguyên root cause) |
| Q7 | ✔ | Đối chiếu `design.md §4.1/§5/§7.3/§7.4` | Tiền: zod `.int().positive()` + DB `price integer check (price > 0)` + e2e thấy `35.000 ₫` ✔ · Quyền: T1–T5 cho **cả admin & staff** đúng bảng 4.1 (không gán role nào chặn) · `menu_version` **chỉ trigger DB tăng**, client không bump (`api.ts:3`) ✔ · nhóm **không có nút xóa** (chỉ ẩn/hiện) ✔ · icon = emoji Q-004 (`EMOJI_SUGGESTIONS`, `maxLength 16`) ✔ · snapshot giá bill: **N/A** (P5 không đụng `bills`) |
| Q8 | N-A | `git diff --stat -- supabase/` → **0 dòng** | P5 không sinh migration (pack ghi rõ Q8 N/A). **Đối chiếu design thay thế (static):** `20261001153750_menu_version_realtime.sql` có trigger `trg_menu_version_on_{categories,products,toppings}`; `20261001154825_rls_policies.sql:36-42` có `categories/products/toppings/product_toppings_staff_all` → đúng bảng 4.1 (admin+staff CRUD); `20261001152827_core_menu_tables.sql:44,55` price integer >0 |
| Q9 | ✔ | `npm run build` → **exit 0** | `precache 21 entries (4950.88 KiB)` · `dist/assets/index-BXGEHTI4.js 753.00 kB │ gzip: **217.04 kB**` **< 250 KB** (design §11). Warning 2 loại pre-existing (chunk >500 kB mặc định Vite + `inlineDynamicImports` của plugin SW). *Quan sát:* gzip P4→P5 **185.71 → 217.04 KB (+31.3)**, chỉ còn ~33 KB headroom → P6/P8 bắt buộc lazy-load ApexCharts/html-to-image (đã ghi ở plan P8-T6) |
| Q10 | ✘ | `npx playwright test` → **exit 1** (tiêu chí: `subagent.md Q10` + `uiux/skill.md §4` "Không vỡ ở 390×844 và 1280×800") | `93 passed (7.3m)` + **`3 failed`** = 3 project cùng 1 lỗi tràn ngang. 90 test cũ (gồm 6 test P5 × 3 project, 6 ảnh `p5-products-{chromium,webkit,mobile}-{390x844,1280x800}.png`) **đều xanh**. Đã mở xem **đủ 6 ảnh**: 1280×800 cả 3 project **đủ, không vỡ**; **390×844 → [QC-009]** |
| Q11 | ✔ | axe mới `e2e/p5-a11y.spec.ts` → 3/3 pass (trong 93 passed) | `AxeBuilder.analyze()` trên `/products` (tab Sản phẩm, bảng + filter) → filter `serious\|critical` `toEqual([])` ở **chromium/webkit/mobile**. Ảnh suite cũ (`p2-login`, `p3-guard`, `p3-recovery`, `p3-setup`) cũng xanh trong lần chạy này → **0 vi phạm nghiêm trọng** |
| Q12 | ✔ | `git status --short` + `git diff --name-only` + `git diff` từng file | **Khớp 100% scope**: 12 file modified + `e2e/p5-products.spec.ts` (untracked) = đúng 13 `scope_files`, **không thừa/thiếu**. Đã đọc toàn bộ diff 9 file "ngoài phạm vi P5" → **toàn bộ là sửa type, 0 đổi hành vi** (`ok as const`, typing `vi.fn<…>`, cast `swScope`, thêm field `error?: string` ở `loginApi.ts`), `e2e/screenshots/` + `test-results/` nằm trong `.gitignore` → không file rác/secret. Kèm [QC-011] MINOR về mức độ (xem dưới) |

### Q4 — Đối chiếu từng task ↔ test thực có

| Task | Test unit | Test e2e | Đánh giá |
|---|---|---|---|
| **P5-T1** CRUD nhóm + sắp xếp + icon | `logic.test`: `parseCategory` (trim/emoji/sort_order -1/1.5/NaN, trùng tên, sửa chính nó), `nextSortOrder`, `swapTargets` (kề, biên đầu/cuối, id sai) · `api.test`: `saveCategory` thêm/sửa, `setActive('category')` · **`ProductsPage.test` (mới)**: `moveCategory` hoán đổi 2 lần lưu, nút biên bị disabled, lỗi lần 1 → dừng | `p5-products` T1: thêm nhóm "Trà sữa" → status "Đã lưu nhóm." | **Đủ sau khi bổ sung** (trước đó `moveCategory` + ẩn nhóm **không có test nào**) |
| **P5-T2** Modal sản phẩm | `logic.test`: `parseProduct` happy/biên/lỗi (giá, nhóm rỗng, trùng trong nhóm, khác nhóm OK, sửa chính nó) · `api.test`: thêm SP + **xóa link cũ/chèn bộ mới**, sửa 1 hàng | T1: validate lỗi → lưu → dòng `Trà đào · Trà sữa · 35.000 ₫`; T2: sửa SP ghi `product_toppings` (`store.links[0]`) | Đủ |
| **P5-T3** CRUD topping | `logic.test`: `parseTopping` · `api.test`: thêm/sửa topping, `setActive('toppings')`, `remove('toppings')` | T2: thêm "Trân châu" → panel `+5.000 ₫` | Đủ |
| **P5-T4** Bảng: tìm kiếm/lọc/bật-tắt bán/confirm | `logic.test`: `filterProducts` (query trim+không phân biệt HOA/thường, lọc nhóm, kết hợp, rỗng, không khớp) · **`ProductsPage.test` (mới)**: ẩn **nhóm** qua `ConfirmDialog` (chưa xác nhận thì `setActive` chưa gọi; hủy → không gọi api) | T2: search thu hẹp → "Không tìm thấy sản phẩm khớp." → xóa query đủ 2 dòng; T1: **ẩn SP** có confirm + biến mất khỏi `menuCache`; T2: **xóa SP** có confirm | Đủ (ẩn *nhóm/topping* nay có unit; ẩn *SP* có e2e) |
| **P5-T5** Validate zod tiếng Việt | `logic.test` 19 case (mọi nhánh lỗi + message tiếng Việt) | T1: "Vui lòng nhập tên." + "Vui lòng nhập đơn giá."; T2: trùng "trà đào" (khác hoa/thường) bị chặn, modal không đóng | Đủ |
| **P5-T6** Test tổng hợp | 299/299 | 2 test × 3 project + 6 ảnh; "thấy ở Thanh toán" kiểm qua `menuCache` (nguồn POS đọc) — đúng ghi chú, case *bán hàng* để P6-T9 | Đủ theo phạm vi P5 |

LỖI:

- `[QC-009] MAJOR · src/features/products/ProductsPage.tsx:330 (`min-w-[640px]`) + src/app/AppLayout.tsx:81 (`main` flex-1 thiếu `min-w-0`) · sig:91408073c209d997a7a69b89366c4e63bad1be89`
  - Mức độ: **MAJOR** — vi phạm tiêu chí PASS của `subagent.md` **Q10** và `uiux/skill.md §4` ("Không vỡ ở **390×844** và **1280×800**") → theo `AGENT.md §12.3`, code trái skill đã đọc = MAJOR trở lên (không phải lỗi style).
  - Bằng chứng (đo, không suy đoán): `npx playwright test e2e/p5-a11y.spec.ts` → 3/3 project fail Q10: `{innerWidth: 390, scrollWidth: 706, offenders: [main right=706, div.mx-auto right=690, section.right=690]}`. Chạy diag các route khác ở cùng viewport: `/dashboard` `/bills` `/users` `/pos` = **390/390** (không tràn) → **chỉ `/products`**. Ảnh `e2e/screenshots/p5-products-chromium-390x844.png` + `p5-products-mobile-390x844.png`: thẻ kính + câu mô tả + bảng **cắt lìa mép phải**; `p5-products-webkit-390x844.png` chụp ra ở trạng thái **đã cuộn ngang** (thừa nhận bằng chứng thị giác).
  - Nguyên nhân: `<main className="flex-1 …">` là flex item `min-width:auto` → min-content = 640px của bảng (`overflow-x-auto` **không** chặn min-content lan lên); tổng 16+16 (padding main) + 16+16 (p-4 card) + 640 ≈ **674 → 706**.
  - Tái hiện: `npx playwright test e2e/p5-a11y.spec.ts` (3 fail) — hoặc mở `/products` ở DevTools 390px → thanh cuộn ngang trang.
  - Gợi ý hướng sửa (1–2 dòng): thêm `min-w-0` vào `<main>` (`src/app/AppLayout.tsx:81`) — file P2 nên cần ghi giải trình trong state; **hoặc** bỏ/giảm `min-w-[640px]` ở `ProductsPage.tsx:330` để bảng co theo container (giữ `overflow-x-auto`). Không sửa code ở vòng này (qc-test cấm sửa code sản phẩm).

- `[QC-010] MINOR · vitest.config.ts:21 (coverage.include) · sig:ee7f5cdfae551af5413fbae468ff634a80a68957`
  - Bằng chứng: `coverage.include = ['src/lib/**', 'src/features/*/logic.ts', …]` → `src/features/products/api.ts` (198 dòng logic P5) **không nằm trong báo cáo coverage mặc định**; số main-coding công bố (lines 92.56%) không phản ánh `api.ts`. Tôi đo riêng: `npx vitest run src/features/products --coverage --coverage.include='src/features/products/**'` → `api.ts 91.22% lines` (đạt, không phải lỗi chất lượng).
  - Tái hiện: lệnh trên.
  - Gợi ý: thêm `'src/features/*/api.ts'` vào `coverage.include` để mọi phase sau tự kiểm.

- `[QC-011] MINOR · phạm vi — 9 file ngoài `plan.md` P5 (package.json, `src/features/auth/*`×4, `src/lib/*test`×2, `src/sw.ts`, `src/features/setup/*`) · sig:517888653d14e5f081f5810ea9df30ab15482134`
  - Bằng chứng: đã đọc **toàn bộ** diff 9 file → chỉ có: `tsc --noEmit` → `-p tsconfig.app.json && -p tsconfig.node.json` (và `build` gọi `npm run typecheck`), `ok as const` ×5, `vi.fn<…>`/`Mock<…>` typing ×6, `realtimeCb as (() => void)`, cast `swScope` ở `sw.ts`, thêm field `error?: string` (không đổi nhánh đọc). `npx tsc --noEmit` với config cũ **exit 0 mà check 0 file** → vá là bắt buộc, không phải "sửa test để pass".
  - Kết luận theo `subagent.md §0`: **MINOR có giải trình**, **không tính là vi phạm Q12** (đúng quyền "sửa file test để test pass" + sửa tooling DoD ở `plan.md P0-T3`); ghi ở đây để minh bạch. Nếu user coi mọi file nằm ngoài `scope_files` là vi phạm bất kể nội dung → elevate lên mức khác, qc-test sẽ hỏi user ở cổng (không tự quyết).

XÁC MINH CÁC ĐIỂM MAIN-CODING THỪA NHẬN:

| Điểm | Kết luận |
|---|---|
| `typecheck` cũ là no-op | **ĐÚNG** — `tsconfig.json:3` `"files": []`; `npx tsc --noEmit` exit 0 không check file nào. Script mới **exit 0 thật** (đã tự chạy) |
| Fix crash `ProductsPage` (derived state khi `lists=null`) | **ĐÚNG cấu trúc**: guard `if (!lists && loadError)` / `if (!lists)` ở dòng 215–238 **trước** khi tính `categories/filterProducts` (dòng 242–246); e2e cũ không còn fail trắng trang |
| 90/90 e2e trước đó | **ĐÚNG** — chạy lại toàn bộ: 90 test cũ xanh (trong 93 passed) |
| 294 unit | **ĐÚNG** (trước khi tôi thêm 5 test) |

TEST ĐÃ BỔ SUNG:
- `src/features/products/ProductsPage.test.tsx` — 5 unit test: hoán đổi `sort_order` khi bấm ↓ (gọi `saveCategory` đúng 2 lần với đúng args), biên bật/tắt nút ↑↓, lỗi lần lưu thứ nhất → hiện message tiếng Việt + **không** gọi lần hai, ẩn nhóm qua confirm (chưa xác nhận thì chưa gọi `setActive`), hủy confirm → không gọi api. → `npx vitest run src/features/products` = **37 passed**; tổng **299/299**, typecheck + lint vẫn 0.
- `e2e/p5-a11y.spec.ts` — 2 test × 3 project: **(a)** Q10 đo `document.scrollWidth` ở 390×844 & 1280×800 (hiện **fail** = bằng chứng QC-009), **(b)** Q11 axe trên `/products` (pass, 0 serious/critical). Sau khi main sửa QC-009, test (a) sẽ xanh — **giữ lại làm regression test**, đừng xóa.

KHÔNG KIỂM ĐƯỢC:
- **Q8 DB thật** (`supabase test db`/`scripts/test-p1.sh`): B-001 (Docker nested không chạy được local stack) + P5 không sinh migration → chỉ đối chiếu static migration/design (đã ghi ở Q8).
- **Điện thoại/Safari thật**: ảnh `webkit-*` là Playwright WebKit (P4 đã chứng minh không render `backdrop-filter`) → độ mờ glass trên Safari thật chờ smoke **P11-T4**; riêng lỗi tràn ngang [QC-009] **không phụ thuộc engine** (đo bằng pixel ở cả 3 project).
- **`forms.tsx` (405 dòng) = 0% unit**: validate lõi nằm ở `logic.ts` (100%) và luồng modal có e2e đầy đủ → chấp nhận được; ghi chú cho các phase sau nếu muốn bao phủ sâu.

GỬI main-coding (để ghi `state.json → loop.last_report`, ≤30 dòng):

```
QC P5 vong 1: VERDICT FAIL - 1 MAJOR, 2 MINOR. So lieu: typecheck 0 (da xac minh script cu tsconfig files:[] check 0 file la that), lint 0, unit 299/299 (main 294 + 5 test qc bo sung cho T1 sap xep/ẩn nhom), coverage lib 87.41% + products/logic 100% + api.ts 91.22% (do rieng), build OK gzip 217.04KB < 250KB, e2e 93 passed + 3 failed (90 test cu xanh het; 3 fail = test do tràn ngang toi them), axe /products 0 serious, diff 13 file = dung scope (9 file ngoai P5 la sua type thuan - doc toan bo diff, khong doi hanh vi -> MINOR giai trinh khong tinh vi pham). MOI: [QC-009] MAJOR ProductsPage.tsx:330 (min-w-[640px]) + AppLayout.tsx:81 (main flex-1 thieu min-w-0) -> /products tràn ngang trang o 390x844: document.scrollWidth=706 vs innerWidth=390 ca chromium/webkit/mobile (cac route khac = 390); anh p5-products-chromium-390x844 + mobile-390x844 thay the/thu cat lech mép phai, webkit-390x844 anh cuộn ngang. Giai phap: them min-w-0 vao <main> (file P2 can giai trinh) HOAC bo min-w-[640px] o bang. Re-test: npx playwright test e2e/p5-a11y.spec.ts. [QC-010] MINOR vitest.config.ts:21 coverage.include thieu src/features/products/api.ts. Test bo sung: src/features/products/ProductsPage.test.tsx (5 unit), e2e/p5-a11y.spec.ts (6 test - GIU LAI lam regression). Chi tiet: .opencode/evidence/p5-qc-round1.md
```
