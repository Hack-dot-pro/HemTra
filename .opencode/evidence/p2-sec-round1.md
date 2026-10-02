# SEC REPORT — Phase P2 — Vòng 1

```
VERDICT: PASS
PHẠM VI: hẹp (P2 = frontend thuần, theo loop.md §5) · BỀ MẶT: form đăng nhập
  (loginForm.ts, LoginStage.tsx, signIn.ts stub), localStorage/sessionStorage,
  useClearCache (giả lập), nút Tải App (install prompt), routing routes.tsx,
  assets/CSS/font, public/_redirects, build dist/
skills_read: [subagent.md, AGENT.md, loop.md, .opencode/skills/security/skill.md]
```

## 0. Đối chiếu scope (bắt buộc)

- `git status --short` + `git diff HEAD --stat` → working tree **khớp 100%** scope_files[working tree]:
  `THIRD_PARTY.md, plan.md, state.json, src/app/AppLayout.tsx, src/assets/login-stage.jpg,
  src/assets/login-stage.webp (??), src/features/auth/{login-stage.css, LoginStage.test.tsx,
  signIn.test.ts (??)}, login-hero.png (??)` + `.opencode/evidence/` (untracked, do subagent tạo).
- `git show d7ed769 --name-status` → **lệch minor so với scope_files[commit]** (không phải lỗi bảo mật):
  ngoài danh sách còn `M package-lock.json`, `M src/main.tsx`, `M state.json`,
  `D src/App.tsx`, `D src/App.test.tsx`, `D src/index.css` (đổi chỗ App → `src/app/`,
  `index.css` → `src/styles/`). Không có file nào ngoài khối UI của P2.
- Không có thay đổi nào trong `supabase/` (`git show d7ed769 --name-only | grep '^supabase/'` → rỗng;
  `git status --short supabase/` → rỗng).

## 1. Kết quả theo hạng mục

| # | Kết quả | Lệnh + output ngắn |
|---|---|---|
| S1 | ✔ | `gitleaks detect -v --redact` → `20 commits scanned … no leaks found` (exit 0). `gitleaks detect --no-git -v --redact .` → 3 finding, **tất cả nằm trong `.env` local đã gitignore** (`git check-ignore -v .env` → `.gitignore:2:.env`; `git log --all --oneline -- .env` → rỗng = chưa từng commit). `git grep -IE "(SUPABASE_\|eyJ[A-Za-z0-9_-]{20,}\|sk_live\|AIza)"` → chỉ `/.env.example` (placeholder `<anon-key>`), `.opencode/skills/*` (tài liệu), `package-lock.json:integrity sha512-…` (hash, không phải key). **dist/ sạch**: build lại (`npm run build` exit 0) rồi grep thật cả 5 giá trị key trong `.env` + pattern `eyJ{20,}\|sk_live\|AIza{15,}\|SERVICE_ROLE` trên `dist/` → 0 hit; binary `login-hero.png`, `src/assets/*.{png,jpg,webp}`, `public/fonts/*.woff2` → 0 hit. |
| S2 | ✔ | `npm audit --omit=dev` → `found 0 vulnerabilities` (exit 0); `npm audit` (toàn bộ) cũng `0 vulnerabilities`. |
| S3 | N-A | P2 không đụng DB: `git show d7ed769 --name-only \| grep '^supabase/'` → rỗng, `git status supabase/` → rỗng. Không migration mới trong phase → không có gì để kiểm RLS mới; RLS đã xác minh ở P1 (prev: 28/28 test). |
| S4 | N-A | `grep -rIn "createClient\|fetch(\|supabase\.\|axios" src/` → **rỗng** (không client/network nào). `src/features/auth/signIn.ts:7-10` là stub `return { ok: true }` — chưa có API/Edge Function để gọi; server-side auth/PHQ ở **P3-T4**. |
| S5 | N-A | Không tồn tại xác thực server/token trong phase này (signIn stub, không JWT/lockout) — lockout 5/15 phút + token hết hạn/sửa được kiểm ở P3/P10 (prev P1 đã có `session_fresh()`). |
| S6 | N-A | Bootstrap admin thuộc **P3**; không có endpoint bootstrap trong diff P2. |
| S7 | ✔ | Harness S7 riêng (vitest/jsdom, chạy ngoài repo: `/tmp/opencode/sec/`) → **5/5 pass**: 4 payload `<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>`, `' OR 1=1--`, `<svg/onload=alert(document.cookie)>` nhập vào ô Tài khoản + Mật khẩu rồi submit, **và** đặt làm saved-username render lại placeholder `Mật khẩu của <payload>` → 0 element `script/img/iframe/object/embed`, 0 attribute `on*` inline, spy `window.alert` không gọi, không lỗi, không `role=alert`. Giá trị round-trip đúng dạng data (`placeholder === "Mật khẩu của "+payload`). `grep -rIn "dangerouslySetInnerHTML\|innerHTML\|\beval(\|new Function\|document.write" src/` → **rỗng**; e2e `npx playwright test` → 9/9 pass với assertion `expect(errors).toEqual([])` (0 console error). |
| S8 | N-A | 5 trang (`Dashboard/Products/Pos/Bills/Users`) là stub text-only (`src/features/pos/PosPage.tsx` chỉ `<h1>+<p>`), không ID/dữ liệu/bill nào để truy cập chéo; signed URL/Storage không thuộc phase. |
| S9 | N-A | Không có upload/Storage trong P2 (không `supabase.storage`, không input file). Bucket/policy đã xác minh ở P1 (P1-T8). |
| S10 | N-A | Không có endpoint để bắn rate limit; `signIn` stub không gọi mạng. Rate limit tạo bill đã có ở P1 (`create_bill`), lockout đăng nhập kiểm ở P3-T4/P10. |
| S11 | N-A | **Theo plan**: `plan.md:62` (P4-T1) và `plan.md:128` (P10-T1) đặt `public/_headers` (CSP/HSTS/no-cache) — chưa đến phase. Xác nhận `find dist -name _headers` → rỗng (đúng, chưa có). Không chặn cổng. |
| S12 | ✔ (hẹp) | `find dist public src -name 'sw.js' -o -name '*.webmanifest'` + `grep -rIn "serviceWorker\|manifest" src/ index.html public/` → **rỗng**: phase này chưa có SW/manifest (P4-T1). `public/_redirects` = đúng 1 dòng `/* /index.html 200` (SPA fallback thuần, không có cache-control/token nào); không có gì cache token/API. |
| S13 | ✔ | `grep -rIn "localStorage\|sessionStorage" src/` → **chỉ** `loginForm.ts:25,30,36,37` + comment `useClearCache.ts:9` + test; storage key duy nhất `export const USERNAME_KEY = 'hemtra.username'` (`loginForm.ts:8`) — **không lưu mật khẩu/token**. Harness: sau đăng nhập `Object.keys(allStorage()) === ['hemtra.username']`, `JSON.stringify(storage)` không chứa `mat-khau-bi-mat-123`; tắt "Ghi nhớ" → chỉ `sessionStorage`, `localStorage` null. `grep -rIn "console\." src/` → **rỗng** (0 log, nên không log PII/secret). Không `dangerouslySetInnerHTML`/`eval`. |
| S14 | N-A | Không có logic tiền/bill: `grep -rIn "client_uuid\|price\|create_bill\|VND" src/features/` → rỗng; 5 trang stub. Server tính lại giá (`create_bill`) đã xác minh ở P1. |
| S15 | N-A | **P3-T5 chưa làm** → chưa có phiên/`login_at`/JWT để kiểm. Những gì P2 thật sự sở hữu đã kiểm ở S13: checkbox "Ghi nhớ" chỉ đổi nơi giữ **username** (`loginForm.ts:28-32` localStorage vs sessionStorage), không ảnh hưởng phiên. |

Phụ trợ (không phải checklist SEC nhưng là lệnh trong commands_hint, làm bằng chứng nền):
`npm run typecheck` → exit 0 · `npm run lint` → exit 0 · `npm run test -- --run` → **43/43 pass**
· `npm run build` → exit 0 (js 277.31 kB / gzip 88.23 kB) · `npx playwright test` → **9/9 pass** (0 console error).

## 2. LỖI

**Không có.** Không BLOCKER/MAJOR/MINOR nào thuộc checklist S1–S15 ở phạm vi hẹp P2 → không cần backlog mới từ SEC.

## 3. NGHI VẤN (chưa chứng minh, không chặn)

1. `gitignore` cover hẹp: `.gitignore:2-4` chỉ có `.env`, `.env.local`, `.env.*.local` — file `.env.production`/`.env.staging` (nếu sinh sau) **không** bị ignore. Hiện chưa có file nào như vậy → ghi `backlog` (đề xuất: thêm `.env.*` nhưng giữ `.env.example`).
2. `.env` local chứa `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_ACCESS_TOKEN` (gitleaks bắt ở chế độ `--no-git`). Đã gitignore, chưa từng commit (`git log --all -- .env` rỗng) → không vi phạm AGENT.md §6; nhắc duy trì quy tắc và ưu tiên dọn khỏi working dir khi không dùng.
3. `src/app/routes.tsx:13-28` không có auth guard + `signIn` stub luôn thành công → ai cũng mở được `/dashboard|/products|/pos|/bills|/users`. **Đúng kế hoạch** (guard = P3-T7, trang rỗng không dữ liệu) → ghi để P3 xác nhận lại khi gắn phiên thật.

## 4. KHÔNG KIỂM ĐƯỢC

- Server-side (S3/S4/S5/S6/S10/S14/S15 phần backend): ngoài bề mặt P2 (frontend thuần, không network call) — chuyển sang **P3/P10**.
- Header thật từ Cloudflare Pages (S11): `_headers` chưa tồn tại → kiểm lại ở **P4-T1/P10-T1**.
- Tấn công runtime trên trình duyệt thật cho payload (S7): đã thay bằng harness jsdom 5 test + e2e 9 test (0 console error); nếu cần chứng minh mạnh hơn, thêm case XSS vào `e2e/p2-login.spec.ts` ở vòng QC kế tiếp (không thuộc quyền của security-audit).
