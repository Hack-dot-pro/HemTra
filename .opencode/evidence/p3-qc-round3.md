## QC REPORT — Phase P3 — Vòng r=3

VERDICT: PASS

TÓM TẮT: Q1–Q12 xanh. Vòng này QC lại **toàn bộ** sau 2 fix do SEC báo (loop.md §4.1):
SEC-001 (migration `session_fresh` theo phiên) đã **áp lên cloud thật** (migration list
local = remote) và `scripts/test-p1.sh` chạy **33/33** (trước fix 28) với 5 assertion mới
chính xác là kịch bản SEC-001 (iat tươi + session 8 ngày → `false`); SEC-002 đã xác minh
read-only (config GET → flag `true`). `src/lib/session.ts` chỉ đổi comment → không có
logic mới ngoài phần test SQL. Chạy e2e **1 lần**: 72/72 exit 0 (4.3m).

skills_read: [supabase (skill), subagent.md §2, AGENT.md, plan.md (P3-T0…T9),
design.md (§4.3), loop.md (§4.1), state.json (Q-006, loop.last_report),
.opencode/evidence/p3-qc-round2.md, .opencode/evidence/p3-sec-round1.md,
.opencode/evidence/p3-sec-round1-fix.md, scripts/test-p1.sh,
supabase/migrations/20261002144826_session_fresh_session_based.sql]

## 0. Đối chiếu scope (subagent.md §1)

- `git diff --name-only 92779bc..HEAD | wc -l` → **75** ✔ khớp gói đầu vào (75 file).
- `git status --short` → ` M scripts/test-p1.sh`, ` M src/lib/session.ts`, ` M state.json`
  + `??` 4 file mới (`p3-qc-round2.md`, `p3-sec-round1.md`, `p3-sec-round1-fix.md`,
  `20261002144826_session_fresh_session_based.sql`) → **khớp 100%** gói đầu vào.
- Lệch nhỏ cần ghi (không phải vi phạm): `scripts/test-p1.sh` **không nằm trong 75 file
  đã commit** (file tồn tại từ trước 92779bc) — thay đổi của nó nằm ở working tree chưa
  commit; `src/lib/session.ts`/`state.json` có cả diff đã commit lẫn diff working tree.
  → Khi commit phase cần `git add` đủ 3 file ` M` + 4 file `??`, nếu không test SEC-001
  và migration sẽ không vào được history.

## 1. Kết quả theo hạng mục

| # | KQ | Lệnh → exit · output ngắn |
|---|---|---|
| Q1 | ✔ | `npm run typecheck` → **exit 0** (`tsc --noEmit`, không lỗi) |
| Q2 | ✔ | `npm run lint` → **exit 0** (eslint, không lỗi) |
| Q3 | ✔ | `npm run test -- --run` → **exit 0** · `Test Files 22 passed (22)` / `Tests 214 passed (214)`. Anti-skip: `git diff 92779bc..HEAD \| grep -E '^\+.*\.(skip\|only)\('` → rỗng; `grep -rn '\.skip(\|\.only(' src --include=*.test.*` → rỗng |
| Q4 | ✔ | Đối chiếu `tasks_done` (P3-T0…T9, plan.md:49-58 **đều `[x]`**) ↔ test: unit 214 (guard/session/api/form), e2e 24×3=72 (setup, login, lockout, hết hạn 7 ngày, khôi phục, đổi email). **Logic mới của vòng này = migration `session_fresh`** → 5 assertion mới `scripts/test-p1.sh:87-91` (happy: phiên mới `true`; biên: phiên 8 ngày `false`, `session_id` không tồn tại `false`; lỗi/impact: hết hạn phiên không đọc được `categories`/`profiles`) → `bash scripts/test-p1.sh` **33/33, exit 0**. `src/lib/session.ts` chỉ đổi comment (`git diff` chỉ 2 dòng `//`) → không có logic TS mới → không cần unit test mới |
| Q5 | ✔ | `npx vitest run --coverage` → **exit 0** · `Lines 96.17% (302/314)`; lấy per-file bằng `--coverage.reporter=json-summary`: `src/lib` **thấp nhất 85.71%** (`supabase.ts`) , `session.ts` 93.54, `http.ts` 94.44; `features/auth` thấp nhất **91.3%**; `features/setup` **100%** (`logic.ts` 100, `api.ts` 100, `useBootstrapStatus.ts` 100) → **đạt ≥80% dòng** cho `lib/` + `features/*/logic`. *Lưu ý kỹ thuật:* reporter `text` của vitest 5 **ẩn file 100%** (nên bảng text thiếu 7 file) → dùng `json-summary` để có số đầy đủ; thư mục `coverage/` **không nằm trong `.gitignore`** → tôi đã tự xóa để `git status` sạch (không sửa `.gitignore`, ghi mục LƯU Ý) |
| Q6 | ✔ | Đọc test mới `scripts/test-p1.sh:36-42,83-92`: fixture `auth.sessions` thật (`created_at = now()` / `now()-8 days`), claim gồm `sub` + `session_id` + `iat` **tươi** (đúng kịch bản refresh của SEC-001), assert `true`/`false` + 2 assert RLS đọc được/không đọc được, có dọn fixture ở `:92` và ở mục 7 (`:124`) → **không assert rỗng/luôn đúng, không mock**; test cũ `:82` (iat thiếu) vẫn giữ nhánh fallback → không che lỗi thật |
| Q7 | ✔ (kèm deviation đã ghi) | `design.md §4.3:93` vẫn ghi "RLS … so **`iat`** của JWT với 7 ngày" — cơ chế đã đổi sang `auth.sessions.created_at` do SEC-001. **Xử lý: không im lặng bỏ qua** → xác nhận `state.json → open_questions Q-006` (`status: "open"`, chờ user chọn sửa 1 câu trong design.md hay ghi chú riêng); theo AGENT.md §4 + subagent.md §5 QC không tự sửa design.md → **không block Q7**: yêu cầu nghiệp vụ "phiên tối đa 7 ngày, server chặn cuối, client bị sửa vẫn mất quyền" (design §4.3(b), AGENT.md §11.6) **giữ nguyên và nay mới thực sự đúng** (trước fix lớp server không hoạt động); chỉ đổi *cơ thể* hàm. Các mục Q7 còn lại của P3: tiền VND nguyên / snapshot giá / mã bill → test-p1 `:103-118` vẫn xanh (`total:42000`, `^HT-[0-9]{6}-[0-9]{4}$`); phân quyền theo bảng 4.1 → e2e `p3-guard` + `accessGuard` 100% dòng. **Đề nghị main-coding đưa Q-006 vào vòng hỏi user kế tiếp, không được quên** |
| Q8 | ✔ (adapt theo B-001) | `supabase test db` (local) **N/A** — local stack hỏng từ P0 (state `B-001`) → thay bằng **DB linked**: `PATH=/tmp/opencode/bin:$PATH bash scripts/test-p1.sh` → **exit 0 · `=== KET QUA: PASS=33 FAIL=0 ===`** (trước fix 28 → +5 assertion mới, không assertion cũ bị bỏ). `supabase migration list --linked` → **exit 0, local = remote**, `20261002144826` có ở cả 2 cột → migration **đã áp**. Migration trên DB trống vẫn chưa kiểm được (xem KHÔNG KIỂM ĐƯỢC) |
| Q9 | ✔ | `npm run build` → **exit 0** · `dist/assets/index-DecQo9VV.js 535.25 kB │ gzip: 151.47 kB` < 250 KB gzip (design §11); cảnh báo `(!) Some chunks are larger than 500 kB` là ngưỡng Vite mặc định → không chặn |
| Q10 | ✔ | `npm run test:e2e` → **1 lần duy nhất, exit 0 · 72 passed (4.3m), 0 failed**; `grep -ci "access control checks"` trong log = **0**; test tự assert console sạch (`expect(errors).toEqual([])` xuất hiện 22 chỗ) → 0 lỗi console; `e2e/screenshots/` = **30 ảnh** = 5 nhóm × 2 viewport (390×844, 1280×800) × 3 project (chromium/mobile/webkit) → không vỡ layout |
| Q11 | ✔ | axe `@axe-core/playwright` ở 4 spec (`p2-login:27`, `p3-guard:38`, `p3-recovery:22`, `p3-setup:54`, 8 chỗ `AxeBuilder`) — chạy chung trong lần e2e duy nhất, `expect(serious).toEqual([])` (`impact === 'serious' \|\| 'critical'`) → **0 vi phạm serious/critical** |
| Q12 | ✔ | `git diff --stat 92779bc..HEAD` → `75 files changed, 8486 insertions(+), 111 deletions(-)` = scope; `git status --short` chỉ 3 ` M` + 4 `??` đúng gói (**không còn ` M package-lock.json`** như lưu ý vòng 2 — đã được trả về); file lạ chỉ `coverage/` do tôi tạo khi đo Q5 → **đã xóa**. Secret: `/go/bin/gitleaks detect --no-banner -v` → `35 commits scanned … no leaks found` (**exit 0**); `git diff 92779bc..HEAD \| grep -E '^\+.*(eyJ…\|[a-f0-9]{40})'` → chỉ ra **sig hash của lỗi cũ** (evidence) + hash trong state.json, không có JWT/secret thật; `npm audit --omit=dev` → `found 0 vulnerabilities` |

## 2. Xác minh 2 fix của SEC (chỉ đọc, không lặp việc SEC đã làm)

| Fix | Cách xác minh | Kết quả |
|---|---|---|
| **SEC-001** migration session-based | (1) `supabase migration list --linked` → local = remote, có `20261002144826`; (2) `supabase db query --linked` trên cloud: `pg_proc` → **`private.session_fresh() prosecdef=true`**, **`session_fresh() (public) prosecdef=false`**; `pg_policies where qual/with_check ilike '%session_fresh%'` → **12** (đúng 12 policy cũ, không đổi chỗ gọi); `has_function_privilege` → `anon=false`, `authenticated=true`; (3) `bash scripts/test-p1.sh` → **33/33 exit 0**, trong đó `session_fresh: phien 8 ngay = false` chạy với **iat tươi** = đúng kịch bản refresh của SEC-001 | **ĐÃ ÁP + HỒI QUY XANH** |
| **SEC-002** `require_current_password` | `GET https://api.supabase.com/v1/projects/{ref}/config/auth` (read-only, Bearer PAT) → HTTP 200, **`security_update_password_require_current_password = true`** (`mailer_autoconfirm = false` → cloud vẫn pre-bootstrap) | **FLAG ĐÃ BẬT** |

## 3. LỖI

Không có lỗi BLOCKER/MAJOR/MINOR mới → không có `QC-00x`.
Không mở lại `[QC-001]`/`[QC-002]`/`[QC-003]` (vòng 2 đã đóng/backlog, không tái hiện).

## 4. LƯU Ý (không chặn)

- `design.md §4.3` lệch cơ chế so với code (xem Q7) → **`state.json Q-006` đang `open`**, cần user quyết định; tôi không tự sửa design.md.
- `.gitignore` không có `coverage/` → `vitest --coverage` để lại thư mục untracked (dễ bị `git add .` lỡ tay). Ghi backlog MINOR kiểu `[QC-002]`, không sửa file ở vòng này.
- `scripts/test-p1.sh` chưa có case **`session_id` thuộc user khác `sub`** (nhánh `s.user_id = sub` trong migration `:33`) → gợi ý thêm 1 assertion ở vòng sau; không chặn (case đó chỉ *thắt chặt* hơn).
- Cloud vẫn pre-bootstrap (`users = 1` = `t7staff@hem.local`, `sessions = 3`, `bootstrapped=false`) sau toàn bộ vòng QC → không tạo/xóa user, không gọi bootstrap/OTP thật, không PATCH config.

## TEST ĐÃ BỔ SUNG

Không thêm file test mới. Logic mới của vòng này đã có test:
- 5 assertion SEC-001 trong `scripts/test-p1.sh:87-91` (do main-coding thêm, tôi chạy xác nhận 33/33).
- `src/lib/session.ts` chỉ đổi comment → không có logic TS mới cần test.

## KHÔNG KIỂM ĐƯỢC

- `supabase test db` (migration trên **DB trống**): local stack hỏng từ P0 (`B-001`) → thay bằng script trên DB linked (33/33) + đối chiếu `migration list` + đọc nội dung migration.
- **PUT /auth/v1/user** trả `400 current_password_required`: tái hiện cần access_token hợp lệ → phải tạo user tạm (cấm trong môi trường pre-bootstrap, e2e phụ thuộc) → chỉ xác minh **config flag read-only = true**; bằng chứng tái hiện 400 nằm ở `.opencode/evidence/p3-sec-round1-fix.md:66`.
- Smoke EF thật (T2/T4/T6/T7) + Q10 bằng mắt từng ảnh: như vòng 2 (cần secret/mailbox, đổi trạng thái cloud) → chỉ đọc evidence + `ls` số ảnh.
