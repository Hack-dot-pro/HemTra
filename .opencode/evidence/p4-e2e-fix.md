# E2E P4: sửa 4 test fail (3 chromium + 1 webkit)

- Ngày: 2026-10-03 · Agent: main-coding · Skills đọc: pwa-offline, uiux, security, testing (ghi `skills_read` 2026-10-03T09:35)
- Bối cảnh: sau khi đóng P3, chạy toàn bộ e2e (3 project: chromium/webkit/mobile) → 78/81 pass, 4 fail.
- Nguyên tắc: **mock tầng mạng bằng `page.route()` theo hợp đồng API thật; không mock code app** (app chạy thật).

## 1. 3 test fail chromium — thiếu mock `app_meta` (P4 làm lộ)

- Fail: `e2e/p2-login.spec.ts:49`, `e2e/p3-guard.spec.ts:38`, `e2e/p3-guard.spec.ts:68`.
- Nguyên nhân: `injectAuth()` (e2e/helpers.ts) chỉ mock `**/rest/v1/profiles`. Từ P4, `AppLayout` + `useMenuSync` query `**/rest/v1/app_meta` (so `menu_version`) → request thật đi ra cloud, không có session backend → 401 → console `Failed to load resource: ... 401` → `collectAppErrors` bắt được → assert `errors.toEqual([])` fail.
- Fix (e2e/helpers.ts), thêm vào `injectAuth`:
  - `**/rest/v1/app_meta*` → `[{ id: 1, menu_version: 7, bootstrapped: false }]`
  - `**/rest/v1/categories*`, `**/rest/v1/products*`, `**/rest/v1/toppings*` → `[]`
  - Mọi route đều kèm CORS headers (`access-control-allow-origin/allow-headers/allow-methods/expose-headers`) — WebKit bắt lỗi "access control checks" nếu response giả thiếu CORS (hợp đồng lấy từ `mockMenuRest` trong `e2e/p4-pwa.spec.ts`).
- Sau fix: 3 test pass, và `waitForResponse(app_meta)` của test phần 2 dùng lại chính route này.

## 2. 1 test fail webkit — `p3-auth.spec.ts` "nhân viên không có link..."

- Fail: `expect(errors).toEqual([])` với 2 lỗi **intermittent**, luôn xuất hiện ngay trước `page.goto('/change-recovery-email')` (goto lần 2, doc1 → doc2):
  1. **pageerror** (unhandled rejection): `Fetch API cannot load https://tsnrggxczipzqvvpcbld.supabase.co/rest/v1/app_meta?select=menu_version&id=eq.1 due to access control checks.`
     - Không có Playwright `request` event nào cho GET đó → fetch bị hủy ngay khi document teardown; stack chỉ toàn native fetch/`fetchWithRetry` (postgrest trong `@supabase/supabase-js`); thêm `.catch` vào `run()` của `startMenuSync` **không** làm biến mất → không phải branch app chưa catch, mà là rejection sinh ra trong lúc tear-down nên continuation của app không kịp chạy.
  2. **console error**: `WebSocket connection to 'wss://.../realtime/v1/websocket?apikey=...' failed: WebSocket is closed before the connection is established.`
     - Kênh realtime (`defaultRealtimeSubscriber` của `menuSync`) bị đóng khi đang handshake vì trang bị điều hướng.
- Kết luận nguyên nhân: **teardown race của test** — test goto lần 2 chỉ ~200–400ms sau khi AppLayout mount, đúng lúc menu sync (Dexie lạnh lần đầu) còn bay và WebSocket realtime chưa kết nối xong. Cả 2 lỗi chỉ xảy ra khi điều hướng giữa chung; ở doc2 (không goto thêm) không có lỗi. Không phải lỗi chức năng: `syncMenu` đã try/catch, `run()` đã `.catch` → khi trang còn sống lỗi được nuốt và trả menu mặc định.

## 3. Fix (giữ nguyên tính nghiêm của assertion — không filter message)

Thêm helper `waitForMenuSyncReady(page)` trong `e2e/p3-auth.spec.ts`, gọi **trước** `page.goto('/dashboard')` để đăng ký listener, và await **trước** goto lần 2:

- `page.waitForResponse`: đợi `GET /rest/v1/app_meta` trả **200** (menu sync hoàn tất);
- `page.on('websocket')` (lọc theo url `/realtime/v1/websocket`): đợi frame `phx_join` được gửi (`framesent`) — xác nhận socket realtime đã kết nối thật; timeout 10s → fail rõ ràng nếu không join;
- Sau 2 luồng ổn định mới goto → không còn fetch bị hủy / WS đóng giữa handshake.

Kiểm chứng: chạy riêng test trên webkit **4 lần liên tiếp → 4/4 pass** (6.9–8.3s).

## 4. Kết quả sau sửa

| Kiểm tra | Kết quả |
|---|---|
| `npx playwright test` (chromium + webkit + mobile) | **81/81 passed**, exit 0, 4.5m |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run` | 26 files / **252 tests passed** |

- Toàn bộ instrumentation debug tạm thời đã gỡ: `e2e/helpers.ts` chỉ còn mock menu (backup so sánh `git diff`), `src/lib/menuSync.ts` **không đổi** (`git diff` = 0).
- Biến môi trường: đã cài Playwright browser chromium + webkit + OS deps (không thuộc code).

## 5. Liên quan

- Q-006 / design §4.3: chưa đụng tới (backlog).
- `package-lock.json` (−144 dòng) để riêng cho bước dọn backlog (kế hoạch bước 4).
