# QC REPORT — Phase P2 — Vòng 1

VERDICT: PASS
TÓM TẮT: P2 (T1–T7) đạt toàn bộ hạng mục Q1–Q12 (Q8 N/A — phase không chạm DB).
qc-test đã bổ sung 5 unit test (hộp hướng dẫn iOS trên iPhone, ẩn nút khi standalone, `signIn`) → tổng 43/43 pass.

KẾT QUẢ THEO HẠNG MỤC:
- Q1 ✔ `npm run typecheck` → exit 0
- Q2 ✔ `npm run lint` → exit 0
- Q3 ✔ `npx vitest run` → 43/43 pass, không `.skip/.only` mới
- Q4 ✔ đối chiếu tasks_done ↔ test: validate form, lưu username, install prompt,
  clear-cache hook, LoginStage render/shake/reduced-motion — happy path + biên + lỗi
- Q5 ✔ `npx vitest run --coverage` → lines **96.61%** (ngưỡng ≥ 80%)
- Q6 ✔ không assert rỗng; mock che lỗi thật; tên mô tả hành vi
- Q7 ✔ đối chiếu `design.md` §7 (vị trí % logo/card, radius/blur, reduced-motion)
- Q8 N/A — phase không chạm DB/migration
- Q9 ✔ `npm run build` → JS 277.31 kB / **gzip 88.23 kB** (< ngưỡng 250 kB)
- Q10 ✔ `npx playwright test` → 9/9 (chromium/webkit/mobile × 3 test); không vỡ layout
  390×844 và 1280×800; 0 lỗi console; ảnh chụp `e2e/screenshots/`
- Q11 ✔ axe-core qua Playwright → 0 vi phạm serious/critical
- Q12 ⚠ `git diff` sát scope P2; 4 mục MINOR không chặn → ghi `backlog`

MINOR (không chặn cổng, đã ghi `state.json → backlog`):
- [QC P2-001] file rác `login-hero.png` ở root → nay đã dùng làm nguồn ảnh nền login
  (`src/assets/login-stage.webp|jpg`), giữ ở root như `Logo.png`/`background.png`
- [QC P2-002] lệch scope: repo track nhiều file ngoài app (`.claude/`, `agent/`, `.opencode/`, PNG gốc ở root)
- [QC P2-003] `.gitignore` thiếu `coverage/`
- [QC P2-004] dead export `wrongPassword()` (`src/features/auth/signIn.ts:12`)

TEST ĐÃ BỔ SUNG:
- `src/features/auth/LoginStage.test.tsx` (+2: hộp hướng dẫn iOS 3 bước + Esc/focus; ẩn nút khi standalone)
- `src/features/auth/signIn.test.ts` (mới, 22 dòng)

GHI CHÚ: Bản đầy đủ của báo cáo subagent không được lưu lại nguyên văn (main chỉ giữ tóm tắt);
nội dung file này là bản tái dựng từ state/evidence.
