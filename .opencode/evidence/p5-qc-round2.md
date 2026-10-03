# QC REPORT — Phase P5 — Vòng 2

- Ngày: 2026-10-03 · Agent: **qc-test** · Gói đầu vào: phase P5, round 2, scope 13 file modified + 3 file test/e2e untracked, tasks P5-T1..T6, checklist Q1–Q12 (Q8 N/A — không chạm migration), `prev_report`: `.opencode/evidence/p5-qc-round1.md`
- Skills/tài liệu đọc (khai báo theo AGENT.md §5/§12): `AGENT.md` (§3, §4, §5, §8, §9), `subagent.md` (§0, §2.1–2.3, §4), `loop.md`, `plan.md` (P5 + Gate), `design.md` §4.1, §5, §7.3–7.4, §11, `.opencode/skills/testing/skill.md`, `.opencode/skills/uiux/skill.md` (§3–§4), `.opencode/skills/backend/skill.md` (§4–§6), migration P1 (đối chiếu static)
- **Không sửa code sản phẩm** — chỉ đọc + chạy lệnh + báo cáo; **không thêm file test mới ở vòng này** (regression test của vòng 1 đã đủ)

VERDICT: **PASS**
TÓM TẮT: 12/12 hạng mục có kết quả — **11 xanh + Q8 N/A**, **0 BLOCKER/MAJOR**. [QC-009] vòng 1 **ĐÓNG**: `npx playwright test e2e/p5-a11y.spec.ts` = **6/6 pass, exit 0** (3 project × Q10 đo `scrollWidth ≤ innerWidth` + Q11 axe) và đã mở **đủ 6 ảnh `p5-*`** — 390×844 cả chromium/webkit/mobile không còn tràn ngang (thẻ + bảng nằm trọn trong viewport, bảng cuộn ngang *trong* vùng `overflow-x-auto` = hợp lệ), 1280×800 đủ cột THAO TỔC. Số liệu độc lập: typecheck **0**, lint **0**, unit **299/299** (30 file), coverage `lib` **87.41%** / `products/logic` **100%** / `api.ts` đo riêng **91.22%**, build **exit 0** gzip **217.06 KB < 250 KB**, e2e toàn suite **96/96**. Vòng này có **1 issue mới [QC-012] MINOR** (2 file rác ở root bị xóa ngoài scope_files); [QC-010]/[QC-011] giữ nguyên trạng thái vòng 1 → **chấp nhận backlog** (lý do ở dưới).

KẾT QUẢ THEO HẠNG MỤC:

| # | KQ | Lệnh/Cách → exit | Trích output (≤5 dòng) |
|---|---|---|---|
| Q1 | ✔ | `npm run typecheck` → **exit 0** | `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json` · log 4 dòng, **0 lỗi** (script thật, đã xác minh no-op ở vòng 1) |
| Q2 | ✔ | `npm run lint` → **exit 0** | `eslint .` · 0 lỗi/cảnh báo |
| Q3 | ✔ | `npm run test -- --run` → **exit 0** | `Test Files 30 passed (30)` · `Tests 299 passed (299)` (main 294 + 5 test qc vòng 1). Anti-skip: grep `\.skip(\|\.only(\|xit(\|xdescribe(` → chỉ match `failAndMaybeExit(` (false positive, chữ "Exit"), **0 skip/only mới** |
| Q4 | ✔ | Đối chiếu P5-T1..T6 ↔ unit + e2e (đọc lại `logic.test.ts` 19 it, `api.test.ts` 13 it, `ProductsPage.test.tsx` 5 it, `p5-products.spec.ts` 2 test, `p5-a11y.spec.ts` 2 test) | T1 `swapTargets`+`moveCategory`(unit) · T2 `parseProduct`+`saveCategory` ghi lại `product_toppings` · T3 `parseTopping`+`setActive('toppings')` · T4 `filterProducts`+confirm ẩn/xóa · T5 19 case zod + e2e "Vui lòng nhập tên."/"Trùng tên" · T6 tổng hợp 299 unit + e2e menuCache. **Fix QC-009 có regression test** (`e2e/p5-a11y.spec.ts` Q10) → không lặp lại |
| Q5 | ✔ | `npx vitest run --coverage --coverage.reporter=text` → **exit 0** | `All files … 92.74` lines · `lib **87.41**` · `features/products **100**` · `features/auth 97.53` · `features/setup 100`. Đo riêng `api.ts` (vẫn nằm ngoài `coverage.include`): **91.22% lines** → [QC-010] giữ backlog |
| Q6 | ✔ | Đọc toàn bộ 4 file test của P5 (3 vòng này không có test mới của main) | Mô tả hành vi tiếng Việt; happy + biên + lỗi; assert không rỗng (message chính xác, `toHaveBeenCalledTimes(1)` khi lỗi giữa chừng); mock `fakeSupabase` chèn `errorTables`/`offline` để **ép lỗi thật**, không nuốt (`console.error('[products api]', error)` giữ root cause) |
| Q7 | ✔ | Đối chiếu `design.md §4.1/§5/§7.3/§7.4` | Tiền: `logic.ts:22-23` `.int('Đơn giá phải là số nguyên.').positive('…lớn hơn 0.')` + DB `price integer check (>0)` · Quyền: T1–T5 **cả admin & staff** (không nhánh role nào trong `ProductsPage.tsx`) đúng bảng 4.1 · `menu_version` **chỉ trigger DB tăng**, client không bump · nhóm **không có nút xóa** (ỉẩn/hiện) · icon emoji Q-004 · snapshot giá bill: **N/A** (P5 không đụng `bills`) |
| Q8 | N-A | `git diff --stat -- supabase/` → **0 dòng** | P5 không sinh migration (pack ghi rõ N/A). Đối chiếu static như vòng 1: `menu_version_realtime.sql` có trigger `trg_menu_version_on_{categories,products,toppings}`; `rls_policies.sql` `*_staff_all` (admin+staff CRUD đúng 4.1); `core_menu_tables.sql` price integer >0 |
| Q9 | ✔ | `npm run build` → **exit 0** (chạy **lại sau** Q10 để xác nhận không phụ thuộc 2 file bị xóa ở Q12) | `dist/assets/index-*.js 753.08 kB │ gzip: **217.06 kB**` **< 250 KB** · `precache 21 entries (4950.95 KiB)` · 2 warning pre-existing (chunk >500 kB mặc định Vite + `inlineDynamicImports` của plugin SW) |
| Q10 | ✔ | `npx playwright test` → **exit 0**, `96 passed (7.3m)` + lần chạy lại để bắt exit code `96 passed (7.6m)` **EXIT=0**; `npx playwright test e2e/p5-a11y.spec.ts` → **exit 0**, 6/6 | **Đã xem đủ 6 ảnh `e2e/screenshots/p5-*.png` bằng Read tool**: `*-390x844` (chromium 390×844, webkit 780×1688, mobile 1170×2532) → **không còn tràn ngang**, card + bảng nằm trong viewport, bottom-nav đủ 5 mục; `*-1280x800` (1280×800, 2560×1600, 3840×2400) → sidebar + đủ cột ICON→THAO TỔC. Q10 đo `document.scrollWidth > innerWidth+1` = 0 ở cả 2 viewport × 3 project (vòng 1: scrollWidth **706** vs 390 → đã hết) |
| Q11 | ✔ | axe `AxeBuilder.analyze()` trên `/products` (Q11 test) | `violations.filter(serious\|critical)` = `[]` ở **chromium/webkit/mobile** → **0 vi phạm nghiêm trọng**; region bảng mới có `tabIndex=0 role=region aria-label` → rule `scrollable-region-focusable` không phát sinh |
| Q12 | ✔ * | `git status --short` + `git diff --name-only` + đọc diff | **13 file modified = đúng 13 `scope_files`**; 3 untracked (`e2e/p5-a11y.spec.ts`, `e2e/p5-products.spec.ts`, `ProductsPage.test.tsx`) + 1 evidence = đúng scope. Đọc diff 9 file "ngoài plan P5": **toàn bộ type-only** (`ok as const`, `Mock<…>` typing, cast `swScope`, field `error?: string`) → [QC-011] giữ nguyên. **Deviation mới:** 2 file tracked ở root bị xóa **ngoài scope_files** → [QC-012] MINOR (*); không có secret/file rác mới; `e2e/screenshots/`, `test-results/`, `coverage/` vẫn gitignore |

### Xác nhận đóng [QC-009] (điểm chính của vòng 2)

| Bằng chứng | Kết quả |
|---|---|
| `npx playwright test e2e/p5-a11y.spec.ts` | **exit 0 · 6 passed (27.3s)** — Q10 (tràn ngang) + Q11 (axe) × chromium/webkit/mobile |
| `npx playwright test` (toàn suite) | **96 passed (7.3m)** và chạy lại **96 passed (7.6m) → `EXIT=0`** — 90 test cũ + 6 test P5, **0 fail** (vòng 1: 93 passed + 3 fail). 6 ảnh đã xem ở lần 1, lần 2 script/test y hệt → nội dung không đổi |
| `src/app/AppLayout.tsx:81` | `<main class="min-w-0 flex-1 …">` — flex item co được, hết `min-width:auto` đẩy trang (đúng hướng sửa tôi gợi ý) |
| `src/features/products/ProductsPage.tsx:329-334` | `div.overflow-x-auto` thêm `tabIndex={0} role="region" aria-label="Danh sách sản phẩm"` → bù lại a11y mới sinh ra bởi fix 1 (axe bắt `scrollable-region-focusable` nếu thiếu) |
| 6 ảnh `p5-*.png` (đã xem trực tiếp) | 390×844: không còn ảnh nào bị cắt lìa mép phải (so với vòng 1: `p5-products-chromium-390x844` card + chữ cắt, `webkit-390x844` chụp ở trạng thái cuộn ngang) · 1280×800: đủ 3 project |

### Đánh giá các issue vòng 1

| Issue | Trạng thái | Đánh giá qc-test |
|---|---|---|
| **[QC-009] MAJOR** tràn ngang `/products`@390 | **FIXED → ĐÓNG** | Đã sửa đúng 2 nhánh nguyên nhân (min-w-0 + scrollable focus), có regression test riêng, bằng chứng đo + ảnh như trên |
| **[QC-010] MINOR** `vitest.config.ts:21` `coverage.include` thiếu `src/features/*/api.ts` | **OPEN — chấp nhận backlog** | Lý do: (a) Q5 không bị che — tôi đo riêng `api.ts` = **91.22% lines ≥ 80**; (b) chỉ là cấu hình *hiển thị*, không phải lỗi chất lượng test; (c) đã ghi `state.json → backlog` (dòng "QC-010 MINOR (P5)"). **Đề nghị:** main sửa 1 dòng này trong **P6** (cùng lúc thêm `api.ts` mới) để mọi phase sau tự kiểm — không chặn gate P5 |
| **[QC-011] MINOR** 9 file ngoài `plan.md` P5 | **OPEN — chấp nhận có giải trình** | Đọc lại **toàn bộ diff** cả 9 file ở vòng này: chỉ `as const` ×5, typing `vi.fn/Mock` ×6, `realtimeCb as (() => void)`, cast `swScope`, thêm field `error?: string` (không đổi nhánh đọc) + script `typecheck` ở `package.json` (DoD P0-T3). `npx tsc --noEmit` kiểu cũ exit 0 mà **check 0 file** → vá là bắt buộc. Giữ mức MINOR theo `subagent.md §0/§4.2`, **không tính vi phạm Q12** (nhất quán với vòng 1) |

LỖI (vòng này):

- `[QC-012] MINOR · repo root `image.png` (60.016 B) + `image copy.png` (21.352 B) — `git status`: ` D "image copy.png"`, ` D image.png` · sig:de41e42d89a9a1820544360165d11582e37f6285`
  - Mức độ: **MINOR** — không ảnh hưởng chất lượng phase (0 tham chiếu trong code: grep `image.png`/`image copy` ngoài `.opencode/evidence` + `state.json` = 0; `npm run build` chạy **sau** khi 2 file biến mất vẫn **exit 0**; 2 file này là ảnh rác bị commit nhầm ở `7d54c04`/`893b240` — chính `state.json` P3-T8 từng ghi "Xoá image.png rác"), nhưng là **thay đổi ngoài `scope_files`** nên phải được main giải trình.
  - Bằng chứng: `git status --short` → 15 files changed (13 modified + **2 deleted**) trong khi gói đầu vào chỉ khai 13 modified; root dir mtime `2026-10-03 06:37:58` (xảy ra **trong lúc QC vòng 2 chạy**); `grep -rn "rmSync\|unlink\|rm -f" src e2e scripts` = **0 kết quả** → **không phải lệnh/test của qc-test** (tôi chỉ chạy đọc/lệnh kiểm tra; không có lệnh `rm` nào trong phiên).
  - Tái hiện: `git status --short` · `git ls-tree HEAD --name-only | grep image` (vẫn có trong HEAD).
  - Gợi ý hướng sửa (1–2 dòng): nếu là **dọn rác có chủ đích** → main ghi vào `state.json → off_plan_actions` (đúng AGENT.md §8, "mọi việc ngoài plan") và đưa 2 file này vào `scope_files` của báo cáo; nếu **không phải chủ đích** → `git checkout -- image.png "image copy.png"` để trả lại trạng thái trước khi tick Gate. **Không chặn gate P5** (theo `subagent.md §4.2`, MINOR → backlog).

TEST ĐÃ BỔ SUNG: **không có** (vòng này) — 2 test Q10/Q11 × 3 project của vòng 1 (`e2e/p5-a11y.spec.ts`) đã đóng vai regression test cho [QC-009] và **đã xanh**; 5 unit `ProductsPage.test.tsx` của vòng 1 vẫn xanh (không xóa).

KHÔNG KIỂM ĐƯỢC:
- **Q8 DB thật** (`supabase test db`): B-001 (Docker nested không chạy local stack) + P5 không sinh migration → chỉ đối chiếu static migration/design.
- **Điện thoại/Safari thật**: ảnh `webkit-*` là Playwright WebKit, `mobile-*` là iPhone 13 (Playwright) → độ mờ glass trên Safari thật chờ smoke **P11-T4**; riêng [QC-009] đo bằng pixel/`scrollWidth` ở cả 3 project, không phụ thuộc engine.
- **Cảnh báo công cụ**: `Read tool` trả **sai ảnh** 2 lần khi mở trực tiếp `p5-products-mobile-390x844.png` (trả ảnh landscape 1280×800) → đã kiểm bằng `sharp`/`file` (IHDR = **1170×2532**) và đọc lại bản JPEG chuyển mã `/tmp/opencode/verify-mobile390.jpg` → nội dung đúng (mobile layout, không tràn). Đây là lệch công cụ đọc ảnh, **không** phải lỗi sản phẩm.

GỬI main-coding (để ghi `state.json → loop.last_report`, ≤30 dòng):

```
QC P5 vong 2: VERDICT PASS - 0 BLOCKER/MAJOR, 12/12 co ket qua (Q8 N/A, khong cham migration). QC-009 DA DONG: npx playwright test e2e/p5-a11y.spec.ts = 6/6 exit 0 (Q10 do scrollWidth<=innerWidth + Q11 axe, ca 3 project), toan suite 96/96 (vong 1: 93+3 fail), da xem du 6 anh p5-* khong con tran ngang o 390x844, 1280x800 du cot THAO TOC. So lieu doc lap: typecheck 0, lint 0, unit 299/299 (30 file), coverage lib 87.41% + products/logic 100% + api.ts do rieng 91.22%, build exit 0 gzip 217.06KB < 250KB (chay lai sau Q10). QC-010 MINOR: chap nhan backlog, de nghi sua 1 dong coverage.include trong P6; QC-011 MINOR: doc lai toan bo diff 9 file = type-only, giu nghia chap nhan nhu vong 1. MOI: [QC-012] MINOR repo root image.png + image copy.png bi xoa ngoai scope_files (git status 15 files vs 13 khai; khong phai lenh qc-test - grep rm/unlink = 0; 0 tham chieu code, build van exit 0) -> neu don rac co chu dich thi ghi state off_plan_actions + bo sung scope, neu khong thi git checkout -- tra lai; khong chan gate. Khong bo sung test moi (regression Q10/Q11 da xanh). Chi tiet: .opencode/evidence/p5-qc-round2.md
```
