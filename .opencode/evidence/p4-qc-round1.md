# QC REPORT — Phase P4 — Vòng 1

- Ngày: 2026-10-03 · Agent: **qc-test** · Gói đầu vào: phase P4, round qc=1, scope `git diff 3599f06..HEAD` (trừ `package-lock.json`), tasks tick: T1–T4, T6–T8 (T5/T9 cố ý không tick)
- Skills đọc: `AGENT.md`, `subagent.md` (§1–2), `state.json`, `plan.md` [P4], `design.md` §8, `.opencode/skills/testing/skill.md`, `.opencode/skills/pwa-offline/skill.md`, `.opencode/evidence/p4-e2e-fix.md`, `.opencode/evidence/p4-t6-wiring.md`
- **Không sửa code, không commit, không viết test mới** (theo gói đầu vào vòng này — xem mục *TEST ĐÃ BỔ SUNG*)

VERDICT: **FAIL**
TÓM TẮT: 12/12 hạng mục có kết quả, xanh phần typecheck/lint/unit/e2e/build/axe/secret, nhưng **3 MAJOR**: (1) `lib/` coverage **79.59% < 80%** và `pwaClient.ts` (logic P4-T6) **không có unit test nào**; (2) unit test gọi **mạng thật** (REST + Realtime WS cloud) làm `vitest --coverage` và `vitest run src/app/App.test.tsx` **exit 1**; (3) thiếu `apple-touch-icon` 180px (design §8.9 + pwa-offline skill §1) — `dist/index.html` không có link. Kèm 4 MINOR (scope diff lệch, dead code, thiếu ảnh viewport).

KẾT QUẢ THEO HẠNG MỤC:

| # | KQ | Lệnh/Cách → exit | Trích output (≤5 dòng) |
|---|---|---|---|
| Q1 | ✔ | `npm run typecheck` → **exit 0** | `> tsc --noEmit` · không có dòng lỗi |
| Q2 | ✔ | `npm run lint` → **exit 0** | `> eslint .` · 0 lỗi/cảnh báo |
| Q3 | ✔ | `npx vitest run` → **exit 0**; `npm run test -- --run` chạy lại → **exit 0** | `Test Files 26 passed (26)` / `Tests 252 passed (252)` (62.13s). Anti-skip: `git diff 3599f06..HEAD \| grep -E '^\+.*(describe\|it\|test)\.(skip\|only)'` → chỉ ra dòng markdown trong evidence (không phải code); `grep -rn '\.skip(\|\.only(' src e2e --include=*.test.*` → rỗng |
| Q4 | ✘ | Đối chiếu T1–T4/T6–T8 ↔ test | T1 (build: precache 21, `_headers` no-cache/no-store ✔) · T2 (Dexie thật trong outbox/hardRefresh/menuSync test ✔) · T3 (menuSync: 4 điểm chạm + dọn listener ✔ + e2e T3) · T4 (isCacheStale biên 24h ✔ + e2e T4) · T7 (hardRefresh 5 case: done/cancel/hỏi/không SW + e2e T7/T8) · T8 (useClearCache mặc định gọi `hardRefresh` thật + LoginStage) — **T6 ✘: `src/lib/pwaClient.ts` không file test nào tham chiếu** (`grep -rn 'pwaClient\|applyPwaUpdate\|checkDeployVersion' src --include=*.test.*` → rỗng) → [QC-001] |
| Q5 | ✘ | `npx vitest run --coverage` → **exit 1** | `Tests 252 passed` nhưng `Errors 1 error` (unhandled) → exit 1; `Lines : 87.61% (460/525)`; bảng per-file: **`lib 79.59`** (<80), features/auth `96.93`; con: `pwaClient 23.52`, `format 25`, `useMenu 75`, `hardRefresh 73.07`, `menuSync 90`, `outbox 97.29`, `version 100`, `db 83.33` → [QC-001] + [QC-002] |
| Q6 | ✘ | Đọc toàn bộ test P4 (`outbox/hardRefresh/version/menuSync.test.ts`, `useClearCache/LoginStage.test`, `e2e/p4-pwa.spec.ts`, `fakeSupabase.ts`) | Assert chặt, tên mô tả hành vi tiếng Việt, dùng Dexie thật (fake-indexeddb) + mock hợp đồng API tầng mạng — **nhưng** `App.test.tsx` render `AppLayout → useMenuSync → getSupabase()` **gọi REST + Realtime WS thật** (`.env` có `VITE_SUPABASE_URL`) → `vitest run src/app/App.test.tsx` **exit 1 2/2 lần** (unhandled `undici WebSocket.#onConnectionEstablished`) → [QC-002]; trái testing/skill §2 ("MSW chỉ mock HTTP ở unit test") + comment ngay trong chính `App.test.tsx` |
| Q7 | ✘ | Đối chiếu `design.md §8` | ✔ §8.1 `sw.ts` chỉ `precacheAndRoute` + `cleanupOutdatedCaches`, **không runtime caching** → API/token không qua SW; `_headers`: `/index.html`,`/sw.js` no-cache, `/version.json` no-store, `/assets/*` immutable. ✔ §8.2 4 điểm chạm. ✔ §8.4/8.5 banner "Đang offline — giá cập nhật lúc HH:mm" + cache >24h (`NetworkBanner`). ✔ §8.6 **không tự reload** — `PwaUpdateBar` role=alert chờ bấm, `registerType:'prompt'`, poll 10' + `online`. ✔ §8.7 thứ tự hardRefresh + **giữ outbox** + hỏi khi còn bill (`hardRefresh.test` + e2e T7). Tiền VND nguyên: `format.ts` `maximumFractionDigits:0` + `Math.round` ✔ (chủ yếu N/A — P4 chưa chốt bill). **✘ §8.9**: thiếu `apple-touch-icon` 180 → [QC-003] |
| Q8 | N/A | (P4 không sinh migration) — đối chiếu `git diff 3599f06..HEAD --stat` | **KHÔNG đạt như giả định**: diff **CÓ** `supabase/migrations/20261002144826_session_fresh_session_based.sql` (56 dòng) → [QC-004]. Đã đối chiếu: đây là migration **P3 SEC-001** (đã push cloud + verify trong `p3-sec-round2.md`, SEC PASS), bị gom vào commit đầu của P4 — không phải migration mới của P4. Không chạy DB test (B-001, P4 không bắt buộc) |
| Q9 | ✔ | `npm run build` → **exit 0**; smoke `vite preview` | `precache 21 entries (4837.78 KiB)` · `dist/sw.js`, `dist/manifest.webmanifest`, `dist/version.json` ✔ · `index-CFGb37gl.js 641.72 kB │ gzip: 185.80 kB` **< 250 KB** (design §11). Warning `(!) Some chunks are larger than 500 kB` là ngưỡng Vite mặc định, pre-existing (P3 QC đã ghi không chặn); WARN mới `inlineDynamicImports option is deprecated` từ plugin build `sw.js` → không chặn. Smoke preview (≤2 phút): `index/version/manifest/sw → 200`; SW `activated`, scope `/`, `controller=true`; `version.json={"version":"murrfz0w"}`; **0 console error / 0 pageerror** |
| Q10 | ✔ | `npx playwright test` → **exit 0** | `81 passed (4.5m)` = 27 test × 3 project (chromium/webkit/mobile-iPhone13 390×844). Không lỗi console: `expect(errors).toEqual([])` trong `collectAppErrors` pass cả 3 project; test P4-T3/T4/T7-T8 xanh cả 3 |
| Q11 | ✔ | axe **chạy trong Q10** (không chạy lại) | `@axe-core/playwright` ở `p2-login`(2) + `p3-guard` + `p3-recovery` + `p3-setup` × 3 project → tất cả pass = **0 vi phạm serious/critical** (`expectNoSeriousA11yViolations → toEqual([])`) |
| Q12 | ✘ | `git diff 3599f06..HEAD --stat` + gitleaks + grep | 44 files (trừ lock). `gitleaks detect -v --redact --exit-code 1` → `39 commits scanned … no leaks found` (**exit 0**); grep secret trong `src/ e2e/ public/ vite*.ts package.json scripts/` → **0** (2 dòng chỉ là tên header CORS `apikey`). **Lệch scope** → [QC-004]; `git status` chỉ ` M package-lock.json` (ngoài scope, đã ghi ở vòng trước) |

LỖI (nguyên nhân FAIL):

- `[QC-001] MAJOR · src/lib/pwaClient.ts:42-99 · sig:171e10b6e4094cf98a0ee7601aa7b10d0c2da6d8`
  - Bằng chứng: `vitest --coverage` → `lib | 76.87 | 72.36 | 65.16 | **79.59**` (< 80% dòng, testing/skill §2); `pwaClient.ts | 22.5 | 0 | 20 | **23.52** | Uncovered 37-98`; không test nào import `pwaClient` (`registerServiceWorker`/`applyPwaUpdate`/`checkDeployVersion`/`startDeployVersionPolling` = 0 test) → thiếu test happy + biên + lỗi cho logic **P4-T6 đã tick**. Kéo thêm: `format.ts 25%` (`formatVnd`/`formatVndNumber` chưa ai test), `useMenu.ts 75%`, `hardRefresh.ts 73.07%`.
  - Tái hiện: `npx vitest run --coverage --coverage.reporter=text`
  - Gợi ý: thêm `src/lib/pwaClient.test.ts` (stub `virtual:pwa-register` đã có sẵn: `src/test/virtualPwaRegister.ts`) case: đăng ký 1 lần, `onNeedRefresh` → `needRefresh`, `applyPwaUpdate` 2 nhánh (`deploy` → `hardRefresh`, SW → `updateSW(true)`), `checkDeployVersion` lệch/trùng/offline(404→null), polling `online`; + test `formatVnd/formatVndNumber` (P6 sắp dùng) → đưa `lib/` vượt 80%.

- `[QC-002] MAJOR · src/app/AppLayout.tsx:31 (useMenuSync) ↔ src/app/App.test.tsx · sig:0c94d29ba255617798410a0b20df33cbeea876e9`
  - Bằng chứng (chạy thật, lặp 2/2): `npx vitest run src/app/App.test.tsx` → `Tests 6 passed (6)` nhưng `Errors 1 error` → **EXIT=1**:
    `TypeError: The "event" argument must be an instance of Event` ❯ `WebSocket.#onConnectionEstablished node:undici/.../websocket.js:529` — tức unit test đã **mở kết nối Realtime WS thật** (supabase-js chỉ kết nối khi `VITE_SUPABASE_URL` được nạp từ `.env`); kèm REST `/rest/v1/app_meta` đi ra cloud. `npx vitest run --coverage` exit 1 cả 2 lần đo.
  - Tái hiện: `npx vitest run src/app/App.test.tsx; echo $?` → 1 · `npx vitest run --coverage; echo $?` → 1 (trong khi `npx vitest run` full → 0 = flaky, khó phát hiện).
  - Vi phạm: testing/skill §2 "MSW chỉ mock HTTP ở unit test"; comment trong chính `App.test.tsx:11` "Không gọi mạng trong unit test"; AGENT §3.9 tinh thần không để test phụ thuộc mạng thật.
  - Gợi ý: mock `../lib/supabase` (`getSupabase → null`) hoặc chạy MSW `setupServer` cho `*/rest/v1/*` + `*/realtime/v1/*` trong `src/test/setup.ts`; chặn WS ở unit = không còn unhandled error → Q5 exit 0.

- `[QC-003] MAJOR · index.html:5 ↔ vite.config.ts:36-46 (manifest) · sig:5dc021b2e13c04e3bf9f43357eb07208d81e3a02`
  - Bằng chứng: `grep -c apple-touch dist/index.html` → **0**; `dist/manifest.webmanifest` chỉ có 4 icon (192/512/maskable×2); `grep -rn "apple-touch-icon" src/ index.html vite.config.ts` → **rỗng**; file `public/icons/apple-touch-icon.png` (180×180, có từ P0-T7) **không được tham chiếu** ở đâu. `vite-plugin-pwa@1.3.0` không tự inject (đã tra `node_modules/vite-plugin-pwa/dist`).
  - Tái hiện: `npm run build && grep -c apple-touch dist/index.html`
  - Vi phạm: `design.md §8.9` ("icon 192/512/maskable **+ apple-touch-icon 180**") + `pwa-offline/skill.md §1` → theo AGENT §12.3 = MAJOR. Hệ quả: iOS "Thêm vào màn hình chính" lấy ảnh chụp trang thay vì icon.
  - Gợi ý: thêm `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` vào `index.html` (precache glob `png` sẽ tự đưa vào SW), build lại.

- `[QC-004] MINOR · git diff 3599f06..HEAD (Q8/Q12 scope) · sig:4da53c2a53f2a5b0a59e8b010ee0772c0fbfcc74`
  - Bằng chứng: range có **4 commit** (không phải 3): thêm `b1bbf25 chore(P3): dong phase`; ngoài scope P4 còn: `supabase/migrations/20261002144826_session_fresh_session_based.sql`, `scripts/test-p1.sh` (+5 assertion SEC-001), `src/lib/session.ts` (comment SEC-001), 5 file evidence P3-*, `plan.md` (tick Gate P3), `state.json`. → giả định "diff không có thư mục `supabase/`" **sai**.
  - Tái hiện: `git diff 3599f06..HEAD --stat -- supabase/ scripts/test-p1.sh src/lib/session.ts`
  - Nhận định: toàn bộ là **dòng sửa P3 SEC-001/002 chưa commit lúc đóng P3**, đã PASS ở `p3-sec-round2.md` (migration đã push + test live) — **không phải code P4 mới, không chặn chất lượng P4**; nhưng sai phạm vi báo cáo → ghi để main-coding giải trình khi commit phase (tách commit P3 hoặc ghi chú trong message).

- `[QC-005] MINOR · src/components/ui/NetworkBanner.tsx:45-50 · sig:af7fa8330db32f264158666a4695ce7257c19c94`
  - Bằng chứng: nhánh `return <div role="status" className="sr-only">…Đã kết nối` **không bao giờ chạy** — dòng 22 đã `if (online && !stale) return null`, dòng 24 xử lý `!online`, dòng 36 xử lý `online && stale`. Dead code, không test nào phát hiện (không có unit test NetworkBanner).
  - Tái hiện: đọc `NetworkBanner.tsx` hoặc `npx vitest --coverage` (nhánh funcs 0).
  - Gợi ý: xóa nhánh chết (hoặc trả về `null` thống nhất).

- `[QC-006] MINOR · e2e/p4-pwa.spec.ts (T4, T7/T8) · sig:e10f3c5960c9b1b8848e2f9fc81480a99d6bbaa7`
  - Bằng chứng: `ls e2e/screenshots/` → 30 ảnh (login/layout/recovery/setup/change-password) — **không có ảnh nào của UI mới P4** (`NetworkBanner`, `PwaUpdateBar`); test P4 chỉ assert visibility, không `page.screenshot`.
  - Vi phạm: testing/skill §3 "mỗi màn hình mới phải có ảnh chụp 2 cỡ" → không kiểm thị lực layout 390×844 / 1280×800 cho banner.
  - Gợi ý: thêm `page.screenshot({ path: e2e/screenshots/menu-banner-<project>-<viewport>.png })` trong test P4-T4 (online + offline) là đủ.

- `[QC-007] MINOR · src/features/auth/useClearCache.ts:18-21 · sig:d8e4de3b15dcd3789f2ace9fc1ce4cc115a1cb42`
  - Bằng chứng: `grep -rn "simulateClearCache" src/` → chỉ còn dòng khai báo — **không test nào dùng nữa** sau P4 (diff `useClearCache.test.ts` đã bỏ import) → dead code; ghi chú plan P4-T8 "simulateClearCache() chỉ còn cho test" **không còn đúng**.
  - Gợi ý: xóa hàm hoặc ghi chú lại trong plan.

TEST ĐÃ BỔ SUNG: **không có** — gói đầu vào vòng này (main-coding/user) giới hạn qc-test ở *kiểm tra + báo cáo, không sửa bất kỳ file code nào*; các test còn thiếu (`pwaClient.test.ts`, unit NetworkBanner, test format) đã nêu ở [QC-001]/[QC-005]/[QC-006] để main-coding viết (đúng testing/skill §1: main viết test cho logic mình viết).

KHÔNG KIỂM ĐƯỢC:
- **Q8 DB thật**: không chạy `scripts/test-p1.sh`/`supabase test db` — B-001 (Docker nested) + P4 không bắt buộc; chỉ đối chiếu static diff (phát hiện [QC-004]).
- **Kiểm thị lực bằng mắt** 2 viewport cho UI P4 (thiếu ảnh → [QC-006]); Q10 chỉ assert bằng selector.
- **Cập nhật SW thật ở tab cũ** (deploy bản 2 → bấm "Cập nhật" → hardRefresh) chỉ smoke được mức SW registered/controlled ở preview; kịch bản 2 bản deploy liên tiếp chưa có e2e (đề nghị cho P11-T4 smoke).

ĐỐI CHIẾU T5 / T9 (ghi chú plan.md có trung thực với code không):

- **P4-T5 (không tick) — TRUNG THỰC.** `grep -rn "enqueueBill|syncOutbox|listPending|countPending|newClientUuid" src/ --include=*.ts | grep -v test | grep -v "src/lib/outbox.ts"` → **rỗng**: lib outbox + 10 unit test (`outbox.test.ts`: idempotent `client_uuid`, `price_drift` giữ snapshot, RPC lỗi → pending + attempts, quá `MAX_SYNC_ATTEMPTS`, lỗi 1 bill không chặn bill sau, upload PNG lỗi/thành công) nhưng chưa nơi nào enqueue/sync ngoài test. Đúng hẹn nối **P6-T7**.
- **P4-T9 (không tick) — TRUNG THỰC.** `e2e/p4-pwa.spec.ts:4-5` ghi đúng "Case offline → bán → online → đồng bộ viết ở P6-T9 khi POS có"; case "đổi giá tab khác" chờ menu UI P5 (chưa có màn POS/menu để bấm). Unit list trong plan (version/outbox/hardRefresh/menuSync) khớp file test tồn tại. **Lưu ý:** plan T9 ghi "unit ✔" là đúng theo danh sách đó, nhưng **không nói gì tới `pwaClient.ts`** — khoảng trống này do QC-001 bắt (liên quan T6, không phải lỗi ghi chú T9).
- Nhẹ: plan P4-T8 ghi "simulateClearCache() chỉ còn cho test" → không đúng nữa ([QC-007], hàm không còn chỗ nào dùng).

GỬI main-coding (để ghi `state.json → loop.last_report`, ≤30 dòng):

```
QC P4 vong 1: VERDICT FAIL - 3 MAJOR + 4 MINOR. Q1 typecheck 0; Q2 lint 0; Q3 vitest 252/252 (khong .skip/.only moi); Q5 coverage exit 1 (unhandled error) + lib 79.59% < 80%; Q9 build xanh (precache 21 entries 4837.78 KiB, gzip 185.80 < 250, smoke preview SW active + version.json=murrfz0w + 0 console error); Q10 e2e 81/81 (27x3 project, 4.5m); Q11 axe 0 serious (chay trong Q10); Q12 gitleaks 39 commits no leaks exit 0. LOI: [QC-001] MAJOR pwaClient.ts khong co unit test -> lib coverage 79.59%; [QC-002] MAJOR App.test goi REST+Realtime WS that (AppLayout.useMenuSync) -> vitest --coverage va vitest run App.test exit 1; [QC-003] MAJOR thieu apple-touch-icon 180 (design 8.9 + skill 1) dist/index.html 0 link; [QC-004] MINOR diff 3599f06..HEAD co file P3 (supabase/migrations session_fresh, test-p1.sh, session.ts) + 4 commit; [QC-005] MINOR NetworkBanner.tsx:45 dead branch; [QC-006] MINOR thieu anh viewport cho UI P4; [QC-007] MINOR simulateClearCache dead code. T5/T9 khong tick = dung (da doi chieu code). Chi tiet: .opencode/evidence/p4-qc-round1.md
```
