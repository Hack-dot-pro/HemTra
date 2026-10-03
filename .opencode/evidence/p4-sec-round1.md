# SEC REPORT — Phase P4 — Vòng 1

- Ngày: 2026-10-03 · Agent: **security-audit** · Gói đầu vào: phase P4, round sec=1 (vào vòng này `state.loop.sec_round=0`, đã ghi thành `1` sau báo cáo)
- QC đã PASS vòng 2 (`.opencode/evidence/p4-qc-round2.md`) → điều kiện chạy SEC (subagent.md §3) thoả.
- Phạm vi commit P4: `6dc40c6` (code PWA, trộn phần dọn dẹp P3 session_fresh đã được QC-004 giải trình → **không phải việc của vòng này**), `dc8249c`, `298c998`, `f9cc529` (+ evidence `ad79e3a`).
- Skills đọc trước khi kiểm: `AGENT.md`, `subagent.md` (§1, §3), `.opencode/skills/security/skill.md` (toàn bộ — lưu ý file có §1–§4, §2 = chuẩn headers/key/XSS, §3 = lệnh kiểm, §4 = quy trình audit), `.opencode/skills/pwa-offline/skill.md` (§1 SW không cache API, §5 cập nhật/hardRefresh), `design.md` §8 (§8.4 banner, §8.6 cập nhật, §8.7 hardRefresh, §8.9 manifest), `plan.md ## P4`, evidence `p4-e2e-fix.md`, `p4-t6-wiring.md`, `p4-qc-round2.md`.
- **Không sửa code, không commit, không `supabase start`, không deploy/patch cloud.** Chỉ đọc + chạy lệnh dò/đọc + báo cáo (evidence file này + `state.json → loop.last_report`).

VERDICT: **PASS**
PHẠM VI: **hẹp** (diff P4, trọng tâm `src/lib/{pwaClient,hardRefresh,version,outbox,menuSync,db,useMenu}.ts`, `src/sw.ts`, `PwaUpdateBar/NetworkBanner`, `main.tsx`, `AppLayout.tsx`, `features/auth/{useClearCache,useInstallPrompt,install}.ts`, `vite.config.ts`, `public/_headers`, `index.html`, `e2e/p4-pwa.spec.ts`) · BỀ MẶT: Service Worker/Cache, chuỗi cập nhật app, IndexedDB (menuCache/outbox), header edge, storage phiên khi `hardRefresh`.

TÓM TẮT: 15/15 hạng mục có kết quả (5 ✔ · 9 N-A · 1 ✘MINOR; 0 BLOCKER/MAJOR). S1 gitleaks **41 commits / 0 leak / exit 0**; S2 `npm audit` **0 vulnerabilities** (cả dev lẫn `--omit=dev`); S6 **0** `dangerouslySetInnerHTML/innerHTML=/eval`; 9 hạng mục N-A đúng phạm vi P4 (không migration/EF/DB/storage/rate-limit/definer/RPC). Phát hiện **1 MINOR [SEC-001]**: `public/_headers` chỉ có Cache-Control, thiếu CSP/HSTS/nosniff/Referrer-Policy/Permissions-Policy/X-Frame-Options → backlog, plan **P10-T1** đã sở hữu việc này, không chặn gate P4. Mục "Phạm vi PWA": SW **không cache API**, **không tự skipWaiting**, không fetch origin ngoài, `pwaClient` **không tự reload**, `version.json` chỉ build id + builtAt. 2 điểm S15 kiểm được: **(a)** `hardRefresh()` **không đụng `localStorage`** (token khi "ghi nhớ", `hemtra.username`, `hemtra.login_at` giữ nguyên) nhưng **CÓ `sessionStorage.clear()`** → user "không ghi nhớ" bị đăng xuất; **(b)** outbox IndexedDB **không chứa token/mật khẩu**. Mức (a) khớp `design.md §8.7` + skill §5 nhưng trái gói đầu vào → ghi **N-001 open_question**, không tính là lỗ hổng.

---

## KẾT QUẢ THEO HẠNG MỤC (S1–S15)

> Lưu ý ánh xạ: bảng dưới dùng **đánh số của gói đầu vào P4** (S7 = header/CSP, S11 = grants, S12 = definer, S13 = EF/verify_jwt). Tương ứng với `subagent.md §3.1`: S7↔S11 (Header), và S12/S13 của subagent (Cache/PWA, dữ liệu nhạy cảm) được kiểm đầy đủ ở mục **Phạm vi PWA** + **S15** bên dưới — không bỏ sót hạng mục nào của checklist gốc.

| # | KQ | Cách kiểm → output (≤5 dòng) | Lý do / kết luận |
|---|---|---|---|
| **S1** Secret | ✔ | `/tmp/opencode/bin/gitleaks detect -v --redact --exit-code 1` → **exit 0**; `INF 41 commits scanned` · `INF no leaks found` (gitleaks 8.30.1, 2.31 MB) | 0 leak toàn repo kể cả 4 commit P4. Bundle: `grep -rlo "eyJhbGciOiJ" dist` → chỉ `dist/assets/index-G2TkteuH.js` (1 token); decode payload = `{"role":"anon","iss":"supabase"}` và **sha256 khớp `VITE_SUPABASE_ANON_KEY` trong `.env`** → anon public theo thiết kế. `grep -rc "service_role" dist` → 0. `.env` bị `.gitignore:2`, `git ls-files` không track; `.env.example` chỉ placeholder `<anon-key>`. `dist/` + `test-results/` không được track. |
| **S2** Dependency | ✔ | `npm audit` → **found 0 vulnerabilities, exit 0**; `npm audit --json` → `{"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}`; `npm audit --omit=dev` → 0 | Đủ (kể cả dev). Deps mới của P4 (`package.json` diff `6dc40c6`): `dexie`, `dexie-react-hooks`, `workbox-precaching`, `vite-plugin-pwa`, `workbox-build`, `workbox-window`, `fake-indexeddb` — 0 CVE. |
| **S3** RLS | N-A | `git diff ad79e3a~10..HEAD --stat -- supabase/` → **1 file, +56 dòng** = `supabase/migrations/20261002144826_session_fresh_session_based.sql`; `git diff --stat dc8249c~1..f9cc529 -- supabase/` → **rỗng (exit 0)** | File P3 (SEC-001) đã commit từ trước trong commit trộn `6dc40c6` (giải trình QC-004), **không đụng lại**: 3 commit P4 sau đó = **0 dòng** `supabase/`. P4 không sinh migration. |
| **S4** Secret hardcode | ✔ | `grep -rniE "apikey\|service_role\|SUPABASE_SERVICE\|password\s*=\|VITE_[A-Z_]*KEY" src public index.html vite.config.ts` → **18 hit, tất cả là tên biến/chuỗi test** (`must_change_password`, `passwordError`, `expect(call.url).not.toContain('service_role')`…) — **không có literal key** | Chỉ `src/lib/supabase.ts:8` `import.meta.env.VITE_SUPABASE_ANON_KEY` + `src/lib/http.ts:19` `apikey: supabaseAnonKey` (anon public theo `security/skill.md §1`); 1 fixture test `password = 'mat-khau-cu-123'` (`ChangeRecoveryEmailPage.test.tsx:55`) là chuỗi giả, không phải credential. `grep "supabase.co" src public index.html` → **0** (URL cũng lấy từ env). Không có service_role/đối chiếu thay thế hardcode (xem S1). |
| **S5** Xác thực | N-A* | Không đụng auth/EF/rate-limit trong 4 commit P4 (`git diff --name-only` không có `supabase/functions/`) | *Hai điểm P4 chạm tới storage phiên được kiểm riêng ở **S15(a)(b)** bên dưới. |
| **S6** XSS | ✔ | `grep -rnE "dangerouslySetInnerHTML\|innerHTML\s*=\|outerHTML\|insertAdjacentHTML\|\beval\(" src index.html vite.config.ts e2e` → **exit 1 (0 khớp)**; `grep -rn "importScripts\|new Function" src` → 0 | `PwaUpdateBar.tsx` (chuỗi `"Có phiên bản mới — Cập nhật?"`, `"Để sau"`, `"Cập nhật"`, `"Đã sẵn sàng dùng offline."`) và `NetworkBanner.tsx` (chuỗi formatClockTime + cảnh báo) chỉ render **text React thuần**, không có biến dữ liệu người dùng nào đi qua HTML parser. |
| **S7** CSP/Headers | ✘ **MINOR** | `cat public/_headers` → **14 dòng, chỉ 5 block Cache-Control**; `grep -c "Content-Security-Policy\|Strict-Transport-Security\|X-Content-Type-Options\|Referrer-Policy\|Permissions-Policy\|X-Frame-Options" public/_headers index.html dist/index.html` → **0** | Thiếu toàn bộ nhóm header an toàn mà `security/skill.md §2` liệt kê; docs Cloudflare Pages (developers.cloudflare.com/pages/configuration/headers) **không công bố security header mặc định nào** (HSTS chỉ bật ở zone SSL/TLS) → coi như cần khai báo tường minh. → **[SEC-001] MINOR**. Lưu ý: P4-T1 chỉ yêu cầu no-cache (đã ✔), việc harden đầy đủ thuộc **plan P10-T1** → không chặn gate. |
| **S8** IDOR | N-A | P4 không sửa RLS/policy/signed URL; không có thay đổi `supabase/` ngoài file P3 cũ | — |
| **S9** Storage | N-A | Không đụng bucket/upload (`git diff --name-only` không có file Storage EF) | — |
| **S10** Rate limit | N-A | Không sửa EF/lockout/OTP/rate limit | — |
| **S11** Grants (migration) | N-A | Không sinh/đổi migration trong P4 (xem S3) | — |
| **S12** Definer | N-A | Không sửa function/RPC/`SECURITY DEFINER` nào | — |
| **S13** EF/verify_jwt | N-A | Không sửa Edge Function; không thêm route Functions → `public/_headers` áp được cho mọi trang tĩnh (docs: `_headers` không áp cho Pages Functions — ở đây không có `functions/`) | — |
| **S14** RPC nghiệp vụ | N-A | Không sửa `create_bill`/RPC; `src/lib/outbox.ts` chỉ *gọi* RPC sẵn có (idempotent `client_uuid`) | Idempotency + `price_drift` do unit `outbox.test.ts` phủ (Q4/Q6 của QC) |
| **S15** Session/auth | ✔* | Xem **2 điểm S15(a)(b)** bên dưới — `hardRefresh.ts:41-47,75,80` · `supabase.ts:24-70` · `db.ts:34-48` | *Đạt yêu cầu bảo mật (không rò token/không lưu mật khẩu); **điểm (a) có 1 lệch hành vi so với gói đầu vào** → N-001 (open_question, không phải lỗ hổng) |

---

## S15 — 2 ĐIỂM P4 ĐỤNG TỚI (bắt buộc kiểm)

### (a) `hardRefresh()` có đụng/xóa localStorage/sessionStorage token không?

- **`localStorage`: KHÔNG bị đụng.** `src/lib/hardRefresh.ts` chỉ gọi: `getRegistrations().unregister()` (dòng 57–62) → `caches.delete()` mọi key (64–71) → `db.menuCache.clear()` (74–78) → `clearSessionStorage()` (80) → `location.replace(...&r=timestamp)` (82–84). **Không có lệnh nào chạm `localStorage`.** Vì vậy giữ nguyên: `hemtra.remember`, `hemtra.login_at`, `hemtra.username` (khi "ghi nhớ" bật) **và token** (lúc "ghi nhớ" bật token nằm ở `localStorage` qua `routedAuthStorage` → `authTargetStore()`, `src/lib/supabase.ts:24-45`). Bằng chứng test: `src/lib/hardRefresh.test.ts:90` `outbox KHÔNG bị xóa`, `:91` `clearSessionStorage` gọi đúng 1 lần; e2e `e2e/p4-pwa.spec.ts:207` `localStorage.getItem('hemtra.username') === 'linh'` sau hardRefresh.
- **`sessionStorage`: CÓ bị xóa** (`sessionStorage.clear()`, `hardRefresh.ts:41-47`). Hệ quả thật: khi người dùng **không** chọn "ghi nhớ", token Supabase nằm ở `sessionStorage` (`supabase.ts:28-31` `authTargetStore()` = `isRemembered() ? localStorage : sessionStorage`) → `hardRefresh()` **xóa luôn phiên** → phải đăng nhập lại. Áp đúng cho 2 đường: nút "Xóa cache & Tải lại" (`useClearCache.ts:10-12`) **và** `applyPwaUpdate()` lý do `deploy` (`pwaClient.ts:64-68`).
- **Đánh giá:** đây là hành vi **được `design.md §8.7` + `pwa-offline/skill.md §5` quy định tường minh** ("xóa `sessionStorage`; giữ `localStorage` chứa username/phiên"), nên **không phải vi phạm design, không rò rỉ secret, không mất outbox** → **không tính là lỗ hổng**. Nhưng nó **trái với gói đầu vào SEC vòng này** ("hardRefresh phải KHÔNG đụng storage auth") → ghi **N-001** hỏi user, subagent không tự diễn giải (subagent.md §4.5). Mức nghiêm trọng nếu coi là lỗi: UX/đăng xuất oan (đường `deploy` đăng xuất, đường `service-worker` thì không — không nhất quán), không phải CWE về bảo mật.

### (b) Outbox IndexedDB có chứa token/mật khẩu không?

- **KHÔNG.** Schema `src/lib/db.ts:25-48`: `payload = { items, phone_note, is_offline, offline_code, created_at, menu_version }` + `png: Blob | null`, `code`, `status`, `attempts`, `last_error`, `price_drift`, `client_uuid` — đúng tham số RPC `create_bill` (`outbox.ts:78-86`), **không có field token/senha**. Bảng `menuCache` (`db.ts:51,56-59`) chỉ `menu_version/fetched_at/categories/products/toppings`.
- Kiểm chéo: `grep -rnE "setItem\([^)]*(token|password|senha)" src` → **0**; `grep -rn "token" src/lib/db.ts src/lib/menuTypes.ts` → **0**. IndexedDB chỉ chứa dữ liệu bán hàng + PNG bill (nội dung nghiệp vụ trên chính thiết bị của chủ quán) — theo thiết kế `design.md §8.4`.

---

## MỤC RIÊNG — PHẠM VI PWA (S12-cache/SW, chuỗi cập nhật, không tự reload)

| Điểm kiểm | Kết luận | Bằng chứng |
|---|---|---|
| **SW không cache response API** | ✔ | `src/sw.ts:15-16` chỉ `precacheAndRoute(self.__WB_MANIFEST)` + `cleanupOutdatedCaches()`, **không khai báo runtime caching nào** (chú thích dòng 1–4). Đối chiếu build thật: `dist/sw.js` → **21 URL precache**, lọc `/v1\|rest\|auth\|storage\|api\|supabase` → **0** (toàn shell: `index.html`, `assets/*.js/css`, `icons/*`, `fonts/*`, `manifest.webmanifest`). `version.json` **không** nằm trong precache → luôn ra network + `no-store`. |
| **navigateFallback loại trừ API?** | ✔ (an toàn) — kèm 1 quan sát | `dist/sw.js` **không có** `navigateFallback`/`NavigationRoute`/`createHandlerBoundToURL(...)` được gọi (match chuỗi chỉ thấy định nghĩa method trong thư viện workbox) → **không có route điều hướng nào khớp `/rest/v1`, `/auth/v1`, `/storage/v1`** → API không bao giờ đi vào cache. *Quan sát (không phải lỗi bảo mật):* cũng vì **không có** navigation fallback nên offline ở route sâu (F5 tại `/dashboard`) SW không phục vụ `index.html` — server `_redirects` chỉ giúp lúc online. Đề nghị ghi cho QC/P11, không thuộc phạm vi SEC. |
| **Không fetch URL ngoài origin** | ✔ | `src/sw.ts` không `importScripts`, không `fetch()` tuyệt đối; mọi entry precache là đường dẫn tương đối (same-origin). `grep -rnE "fetch\(['\"]https?://" src/lib src/components src/app src/features/auth` → **0**. |
| **skipWaiting chỉ khi xác nhận** | ✔ | `vite.config.ts:41` `registerType: 'prompt'`; `src/sw.ts:20-23` **chỉ** `if (data?.type === 'SKIP_WAITING') void self.skipWaiting()` — handler `activate` (25–27) chỉ `clients.claim()`, **không** skipWaiting. Bản build: `dist/sw.js` → ``e.data?.type===`SKIP_WAITING`&&self.skipWaiting()`` (1 chỗ duy nhất). Handler không kiểm nguồn gửi message, nhưng postMessage tới SW chỉ đến từ client/SW **cùng origin** → không phải lỗ hổng. |
| **`pwaClient` không tự reload** | ✔ | `onNeedRefresh` → `setState({needRefresh:true, reason:'service-worker'})` (`pwaClient.ts:46-48`), `onOfflineReady` → state (`:49-51`) — **không** `location.reload()`. `checkDeployVersion` (`:74-81`) chỉ `setState` + trả boolean. `applyPwaUpdate` (`:64-71`) chỉ chạy **sau khi người dùng bấm** "Cập nhật" (`PwaUpdateBar.tsx:34-40`); lý do `service-worker` → `updateServiceWorker(true)` (gửi SKIP_WAITING), lý do `deploy` → `hardRefresh()`. Không `eval`/`innerHTML` trong toàn bộ file. |
| **`version.json` không lộ thông tin nội bộ** | ✔ | Sinh ở `vite.config.ts:18-22`: `{"version":"<buildId36>","builtAt":"<ISO>"}` — file thật `dist/version.json` = `{"version":"murspn19","builtAt":"2026-10-03T02:51:34.039Z"}`. Không env, không URL, không build metadata nhạy cảm. |
| **Cập nhật deploy có mất phiên?** | ✔* | `applyPwaUpdate` (reason `deploy`) → `hardRefresh()` → **không xóa `localStorage`** (token khi "ghi nhớ" giữ) nhưng xóa `sessionStorage` → xem **S15(a)** + **N-001**. |
| **`startDeployVersionPolling`** | ✔ | `version.ts:27` `fetch(VERSION_URL,{cache:'no-store'})` → không thể bị cache lậu; lỗi/không phải JSON → `null` (`:32-34`) = **im lặng đúng thiết kế**; chỉ ghi biến module `pollTimer` + listener `online` (`pwaClient.ts:84-99`), không ghi đè biến nhạy; `registerServiceWorker()` có guard chống đăng ký 2 lần (`:43`). *Quan sát nhỏ:* `startDeployVersionPolling` **không** có guard như vậy → nếu bị gọi 2 lần sẽ leak 1 `setInterval` (main.tsx chỉ gọi 1 lần; test có `stop()`) — không phải vấn đề bảo mật. |
| **Không log token/PII ra console** | ✔ | `grep -rn "console\.(log\|info\|debug\|warn\|error)"` trên **15 file** P4 trọng tâm → **0**. |
| **`index.html` no-cache + precache** | ✔ | `public/_headers:7-8` `/index.html` `no-cache`; `:10-11` `/sw.js` `no-cache`; `:13-14` `/version.json` `no-store`; `:4-5` `/assets/*` `immutable`; `:1-2` `/*` `max-age=0, must-revalidate`. Khớp `pwa-offline/skill.md §1` + P4-T1. |

---

## LỖI

```
[SEC-001] MINOR · OWASP:A05:2021 (Security Misconfiguration)/CWE-693 (Protection Mechanism Failure)
  · public/_headers:1 · sig:2eabab27176a63f3cd3847dea6cded862342e3b3 (sha1 file tại thời điểm audit)
  Tái hiện: cat public/_headers            # → chỉ 5 block Cache-Control, 14 dòng
            grep -cE "Content-Security-Policy|Strict-Transport-Security|X-Content-Type-Options|Referrer-Policy|Permissions-Policy|X-Frame-Options" public/_headers index.html
            # → 0
            grep -c "crossorigin" dist/index.html   # → 2 (script+link, không có inline script → script-src 'self' khả thi)
  Tác động: app chạy mà KHÔNG có CSP → lớp phòng vệ thứ 2 chống XSS/inline-script injection không tồn tại; thiếu X-Frame-Options/frame-ancestors → clickjacking màn login; thiếu nosniff/Referrer-Policy/Permissions-Policy.
  Bằng chứng: skill §2 yêu cầu "Headers qua public/_headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy"; docs Cloudflare Pages (developers.cloudflare.com/pages/configuration/headers) chỉ mô tả cú pháp _headers, KHÔNG liệt kê security header mặc định nào (HSTS phải bật ở zone SSL/TLS) → không thể coi là "CF tự cấp".
  Gợi ý hướng sửa (1–2 dòng): thêm vào public/_headers —
    /*
      X-Content-Type-Options: nosniff
      X-Frame-Options: SAMEORIGIN
      Referrer-Policy: strict-origin-when-cross-origin
      Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
      Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; manifest-src 'self'; worker-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co
    (mỗi dòng < 2000 ký tự theo giới hạn _headers; HSTS: bật Strict-Transport-Security ở Cloudflare SSL/TLS → Edge Certificates/HSTS)
  Lưu ý phạm vi: plan P10-T1 ("Header an toàn + CSP trong _headers; kiểm tra không vỡ chức năng") đã sở hữu việc này → **đưa vào backlog, không chặn gate P4**; khi thêm phải chạy lại e2e 84/84 để chắc CSP không vỡ app (html-to-image P6, ApexCharts P8 sẽ cần nới img-src/style-src nếu chưa có).
```

**Không có BLOCKER/MAJOR.** Gate P4 theo `subagent.md §4.2` (0 BLOCKER/MAJOR, MINOR → backlog) = **qua**.

---

## NGHI VẤN / CẦN XÁC NHẬN (chưa chứng minh → không chặn)

- **N-001 · `hardRefresh()` xóa `sessionStorage` → user "không ghi nhớ" bị đăng xuất khi cập nhật deploy.** Đã chứng minh bằng code (`hardRefresh.ts:41-47`, `pwaClient.ts:64-68`, `supabase.ts:28-45`) nhưng **chưa xác định được đây là hành vi mong muốn hay không**: code **khớp `design.md §8.7` + skill §5**, gói đầu vào SEC thì yêu cầu ngược lại. Đề nghị main-coding ghi `state.json → open_questions` hỏi user: (1) giữ nguyên theo design (mặc định đề xuất — an toàn hơn, đúng tài liệu), hay (2) bỏ `clearSessionStorage()`/chỉ xóa key cache để không đụng phiên. Không tính là lỗ hổng (xóa token không rò rỉ gì; chỉ là đăng xuất).
- **N-002 · `public/_redirects` = `/* /index.html 200` (file từ P2, ngoài diff P4) có thể nuốt `/sw.js` + `/version.json` trên Pages thật.** Docs Cloudflare: *"Redirects are always followed, regardless of whether or not an asset matches the incoming request"* (developers.cloudflare.com/pages/configuration/redirects) → nếu áp dụng nguyên văn, `/sw.js` bị rewrite thành HTML → trình duyệt từ chối đăng ký SW (MIME) và `/version.json` trả HTML → `fetchRemoteVersion` trả `null` (im lặng, đúng nhánh lỗi). Chưa deploy (Cloud pre-bootstrap) nên **không chứng minh được**. Đề nghị: smoke ở **P11-T4** với `curl -I <domain>/sw.js` (phải `content-type: application/javascript` + `cache-control: no-cache`), `curl -I <domain>/version.json` (phải `application/json` + `no-store`), và `curl -I <domain>/dashboard` (SPA fallback 200). Đây là rủi ro **chức năng cơ chế chống kẹt cache**, không phải rủi ro rò rỉ.

## QUAN SÁT NGOÀI LỀ (không phải lỗi bảo mật, không tính vào verdict)

1. Không có navigation fallback trong SW (xem bảng trên) → offline ở route sâu không phục vụ được `index.html`.
2. `startDeployVersionPolling()` không có guard chống gọi nhiều lần (gọi 1 lần ở `main.tsx:11`).
3. Working tree trước phiên này đã có 2 file dirty (đều có mtime trước khi audit chạy): `package-lock.json` (−144 dòng `libc` — main-coding ghi ở `p4-e2e-fix.md §5` "để riêng cho bước dọn backlog") và `state.json` (1 dòng backlog QC-008). Tôi **không tạo** 2 diff đó; tôi chỉ **nối thêm** vào `state.json` theo `AGENT.md §8` + `subagent.md §6` (log, `loop.sec_round=1`, `loop.last_report`) và tạo file evidence này. **Không sửa file code nào, không commit** (`git status`: chỉ `package-lock.json`, `state.json`, `?? .opencode/evidence/p4-sec-round1.md`).
4. Backlog cũ **SEC-003, SEC-004 (P3)**: ngoài scope P4, **không reopen**, giữ nguyên MINOR như `p3-sec-round2.md`.

---

## SỐ LIỆU

| Hạng mục | Số liệu |
|---|---|
| S1 gitleaks | **41 commits** scanned (2.31 MB), **0 leak**, **exit 0** (gitleaks 8.30.1); token trong `dist` = **1**, role `anon` (khớp `.env`), `service_role` = **0** |
| S2 npm audit | `found 0 vulnerabilities` (**exit 0**), breakdown `{info:0,low:0,moderate:0,high:0,critical:0,total:0}` — chạy cả bản đầy đủ (kể cả dev) và `--omit=dev` |
| S6 XSS | **0** khớp `dangerouslySetInnerHTML/innerHTML=/outerHTML/insertAdjacentHTML/eval/new Function` trên `src + index.html + vite.config.ts + e2e` |
| Phạm vi | 4 commit P4 trong phạm vi (`6dc40c6, dc8249c, 298c998, f9cc529`); gitleaks quét **toàn 41 commit** của repo; `git diff ad79e3a~10..HEAD --stat -- supabase/` = **1 file P3** (`session_fresh…sql`), 3 commit P4 còn lại = **0 dòng** |
| SW | precache **21 entries**, URL khớp API = **0**, `navigateFallback` = **0**, `skipWaiting` tự kích hoạt = **0** (chỉ qua message `SKIP_WAITING`) |

## KHÔNG KIỂM ĐƯỢC

- **Header thật trên môi trường Pages** (không deploy được — cloud pre-bootstrap, đúng lệnh cấm) → S7 đánh giá dựa trên nội dung `_headers` + docs chính thức; xác nhận cuối ở **P10-T1/P11-T3**.
- **Hành vi `_redirects` thật** (N-002) → chờ smoke P11-T4.
- **2 lần deploy thật liên tiếp** (bấm "Cập nhật" ở tab cũ) → e2e T6 chỉ mock `version.json` (đã ghi ở `p4-qc-round2.md`) → giữ ở P11-T4.
- **DB/RLS/EF**: không chạy (`supabase start` bị cấm; B-001 Docker nested) → các hạng mục đánh N/A theo diff, không phải theo test sống.

## GỬI main-coding (để ghi `state.json → loop.last_report`, ≤30 dòng)

```
SEC P4 vong 1: VERDICT PASS - 0 BLOCKER/MAJOR, 1 MINOR. S1 gitleaks 8.30.1: 41 commits, 0 leaks, exit 0 (dist co 1 JWT role=anon khop .env, 0 service_role; .env bi gitignore, khong track). S2 npm audit: 0 vulnerabilities (ca dev va --omit=dev, exit 0). S6 XSS: 0 dangerouslySetInnerHTML/innerHTML/eval; PwaUpdateBar + NetworkBanner chi text React. S3/S5/S8/S9/S10/S11/S12/S13/S14 N/A dung pham vi P4 (diff supabase/ chi con file P3 session_fresh tu commit tron 6dc40c6 - da giai trinh QC-004; 3 commit P4 sau do = 0 dong). S15(a): hardRefresh KHONG dot localStorage (giu token khi ghi remember + hemtra.username + login_at) NHUNG CO sessionStorage.clear() -> user khong ghi nho bi dang xuat khi bam Xoa cache hoac khi cap nhat deploy; day la hanh vi design.md §8.7 + skill §5 yeu cau, khong ro ri gi -> khong tinh lo hong, ghi N-001 open_question hoi user (khong reopen/vac code). S15(b): outbox IndexedDB chi payload bill (items/phone_note/offline_code/menu_version + png),0 token/mat khau. Pham vi PWA: sw.ts chi precache 21 entry shell, 0 URL API, KHONG navigateFallback -> API khong bi cache, KHONG skipWaiting tu dong (chi qua message SKIP_WAITING, registerType=prompt), khong fetch origin ngoai; pwaClient onNeedRefresh/checkDeployVersion chi set state (khong reload/eval), version.json chi version+builtAt va khong nam trong precache (luon no-store); poll loi mang im lam dung thiet ke. MOI: [SEC-001] MINOR public/_headers:1 - chi co Cache-Control, thieu CSP/HSTS/X-Content-Type-Options/Referrer-Policy/Permissions-Policy/X-Frame-Options (CF docs khong cong bo default security header); de nghi them block /* + bat HSTS o zone, rang buoc phai chay lai e2e khi them; plan P10-T1 da so huy -> backlog, khong chan gate P4. NGHI VAN: N-002 public/_redirects (/* /index.html 200, tu P2) co the nuot /sw.js + /version.json tren Pages that (docs: redirects always followed) -> smoke curl -I o P11-T4. Chi tiet: .opencode/evidence/p4-sec-round1.md
```
