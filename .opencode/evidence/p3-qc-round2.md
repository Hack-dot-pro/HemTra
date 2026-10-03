## QC REPORT — Phase P3 — Vòng r=2

VERDICT: PASS

TÓM TẮT: Q1–Q12 xanh. Cổng Q10 đã ổn định: `npm run test:e2e` chạy **3 lần liên tiếp đều exit 0 · 72/72 passed** (3.9m / 3.4m / 3.6m), thêm 3 lần webkit-subset cũng xanh → đóng `[QC-001]` (fix `fe5cc89` xác minh đúng). Còn 1 MINOR cũ đã vào backlog (QC-002) + 1 lưu ý môi trường không chặn (package-lock local).

KẾT QUẢ THEO HẠNG MỤC:

- Q1 ✔ `npm run typecheck` → exit 0 (`tsc --noEmit`, không lỗi)
- Q2 ✔ `npm run lint` → exit 0 (eslint, không lỗi)
- Q3 ✔ `npm run test -- --run` → exit 0 · `Test Files 22 passed (22)` / `Tests 214 passed (214)`; anti-skip `git diff 92779bc..HEAD | grep -E '\+\s*(it|test)\(.*\.(skip|only)'` → `NO_NEW_SKIP_ONLY`
- Q4 ✔ đối chiếu `tasks_done` ↔ test: **không có code sản phẩm nào đổi sau vòng 1** (chỉ `fe5cc89` đổi `e2e/p3-auth.spec.ts` + `.env.example` + state.json) → bảng Q4 của vòng 1 còn nguyên giá trị; test tách đôi của `fe5cc89` giữ đủ 2 ý của test cũ (trang `/setup` tự chuyển + login hết link), không mất case → 24 test e2e × 3 project = 72
- Q5 ✔ `npx vitest run --coverage` → exit 0 · `Lines 96.17% (302/314)`; bảng text: `lib 90.47%` (thấp nhất `src/lib/supabase.ts` **85.71%** > 80), `features/auth 97.53%`, `features/setup 100%` → đạt ngưỡng ≥80% dòng cho `lib/` + `features/*/logic`
- Q6 ✔ đọc lại file test duy nhất đổi vòng này (`e2e/p3-auth.spec.ts`): 2 test mới `:407` và `:417` — mỗi test **chỉ 1 lần `page.goto`** (không còn goto lần 2 hủy request), assert cụ thể (`toHaveURL(/\/login$/)`, `toHaveCount(0)`, `expect(errors).toEqual([])`); filter `Failed to load resource` (dòng 22) **không** nuốt chữ ký QC-001 vì thông điệp `Fetch API cannot load … access control checks` không khớp filter → nếu lỗi cũ quay lại vẫn bắt được. Không assert rỗng, không mock che logic (mock tầng mạng theo hợp đồng EF)
- Q7 ✔ `design.md §4.1–4.4` + Q-005: không có diff product code mới so với vòng 1 → kết luận vòng 1 còn nguyên; kiểm lại hạ nguồn: grant `app_meta.admin_email` chỉ `postgres`/`service_role`, `anon`/`authenticated` chỉ `bootstrapped,id,menu_version(,schema_version,updated_at)`; migration `20261002040248` là bản mới nhất đã áp. Tiền VND nguyên / snapshot giá / mã bill → **N/A** (P3 không đụng tiền/bill, phủ P1)
- Q8 ✔ (adapt theo B-001) `bash scripts/test-p1.sh` → exit 0 · `=== KET QUA: PASS=28 FAIL=0 ===`. *Phương pháp:* máy QC không còn binary `supabase` trong PATH và `supabase/.temp/project-ref` đã mất → dùng shim `/tmp/opencode/bin/supabase` (`npx --yes supabase` + tự thêm `--project-ref $SUPABASE_PROJECT_REF` đọc từ `.env`), **không sửa file nào trong repo** → chạy thật trên DB linked. ✗ `supabase test db` (local) vẫn N/A — local stack hỏng từ P0 (B-001)
- Q9 ✔ `npm run build` → exit 0 · `dist/assets/index-DecQo9VV.js 535.25 kB │ gzip: 151.47 kB` < 250 KB gzip (design §11); cảnh báo `(!) Some chunks are larger than 500 kB` là ngưỡng Vite mặc định, không phải ngưỡng dự án → không chặn
- Q10 ✔ **`npm run test:e2e` 3 lần liên tiếp — cả 3 xanh** (chi tiết dưới); ảnh `e2e/screenshots/` đủ 30 = 5 nhóm × 2 viewport (390×844, 1280×800) × 3 project; test tự assert không lỗi console (`collectAppErrors` + `expect(errors).toEqual([])`) → 0 lỗi console
- Q11 ✔ axe qua `@axe-core/playwright` ở 4 spec (`p2-login:27`, `p3-guard:38`, `p3-recovery:22`, `p3-setup:54`) — `expect(serious).toEqual([])` chạy trong 3 lần xanh → 0 vi phạm serious/critical
- Q12 ✔ `git diff --name-only 92779bc..HEAD` → **75 file** khớp `scope_files` (vòng 1 là 74, +1 = `.opencode/evidence/p3-qc-round1.md` do commit `3599f06`); `git status` chỉ còn ` M package-lock.json` (xem LƯU Ý); không còn file untracked (`?? supabase/.env.example` đã không còn tồn tại); grep secret trong diff (`eyJ…`/hex 40 ký tự) → chỉ ra các mật khẩu giả trong test (`mat-khau-cu-123`, `moi-5678`) — không có secret thật; sửa `design.md`/`plan.md`/`.opencode/skills/{auth,security}` có quyết định user ghi `state.json → decisions` (turnstile, admin_transfer, p3t2_test_target, lockout_otp_unlock, session_7d_note…); `skills_read` đủ cho P3 (14 event, có `auth/backend/security/testing/uiux`)

Q10 — 3 lần liên tiếp (yêu cầu đóng QC-001):

| Lần | Lệnh | exit | Kết quả | Thời gian | `access control checks` |
|---|---|---|---|---|---|
| 1 | `npm run test:e2e` | 0 | **72 passed / 0 failed** | 3.9m | 0 |
| 2 | `npm run test:e2e` | 0 | **72 passed / 0 failed** | 3.4m | 0 |
| 3 | `npm run test:e2e` | 0 | **72 passed / 0 failed** | 3.6m | 0 |

Bổ trợ (tái hiện nhanh của vòng 1: webkit-subset fail 2/5): `npx playwright test e2e/p2-login.spec.ts e2e/p3-auth.spec.ts --project=webkit` ×3 → exit 0 cả 3, `15 passed` mỗi lần (44.4s / 39.7s / 36.2s), 0 lần log `access control checks`. Không có `flaky`/`retry` nào trong 6 lần chạy.

Xác minh fix của `fe5cc89`:
- `git show fe5cc89 -- .env.example` → `+SMTP_APP_PASSWORD=` không còn `\ No newline at end of file`; `tail -c 1 .env.example | xxd` → `00000000: 0a` ✔ (đóng `[QC-003]`)
- `git show fe5cc89 -- e2e/p3-auth.spec.ts` → test cũ `:405` tách thành 2 test, mỗi test 1 `page.goto` duy nhất (`/setup` test 1, `/login` test 2), test 2 thêm `waitForLoadState('networkidle')` trước khi kết luận → không còn goto lần 2 hủy request `app_meta`; bằng chứng thực nghiệm: 3 full run + 3 webkit run đều 0 lỗi CORS ✔ (đóng `[QC-001]`)
- `[QC-002]` xác nhận nhanh: `ls .opencode/evidence/*.sh scripts/*smoke*` → chỉ `p3t8-smoke.sh`, chưa có script smoke cho EF T2/T4/T6/T7 → vẫn ở `backlog` (MINOR, không chặn), **không mở lại**.

LỖI: không có lỗi BLOCKER/MAJOR/MINOR mới. `[QC-001]` (MAJOR, `sig:a5af527d58db9fa392425563eb629aa762b7fc24`) ĐÓNG — không tái hiện trong 6 lần chạy. `[QC-003]` đã fix.

LƯU Ý (không chặn, không phải lỗi code):
- `package-lock.json` đang có diff cục bộ **chưa commit** (−102 dòng, toàn bộ là bỏ trường `"libc": ["glibc"/"musl"]` của các optional dependency do npm trên máy này tái tạo lock). Không nằm trong diff của phase, không secret → **không chặn Q12**; khuyên `git checkout -- package-lock.json` trước khi commit phase để tránh churn kiểu máy.
- Môi trường QC phải dựng lại để chạy được cổng: `npx playwright install chromium webkit` + `install-deps` (trước đó `~/.cache/ms-playwright` trống → 72/72 fail ngay ở launch, không phải lỗi test), và shim `supabase` (xem Q8). Không tạo/đổi file nào trong repo.

TEST ĐÃ BỔ SUNG: không (Q4/Q6 đạt — không thiếu test; thay đổi test duy nhất do main-coding thực hiện trong `fe5cc89`).

KHÔNG KIỂM ĐƯỢC:
- `supabase test db` (local): CLI local + local stack hỏng từ P0 (B-001) → thay bằng `scripts/test-p1.sh` trên DB linked (28/28); migration trên **DB trống** chưa kiểm được (chỉ xác minh migration đã áp + grant đúng trên cloud dev).
- Smoke EF thật (T2/T4/T6/T7) không chạy lại: cần secret/mailbox và sẽ làm đổi trạng thái cloud đang pre-bootstrap (e2e phụ thuộc `bootstrapped=false`) → chỉ đọc evidence (QC-002 vẫn backlog).
- Q10: kiểm ảnh tồn tại đủ 2 viewport × 3 project bằng `ls`, không soi từng ảnh bằng mắt.
