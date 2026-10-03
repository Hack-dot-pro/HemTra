# P4: nối PWA thật vào app (registerServiceWorker + version poll + PwaUpdateBar)

- Ngày: 2026-10-03 · Agent: main-coding
- Skills đọc (trước khi code): `pwa-offline`, `uiux`, `security`, `testing` (state.json → evidence `skills_read` 2026-10-03T09:35)

## Code đổi (2 file)

1. `src/main.tsx` — gọi 1 lần khi app khởi động:
   - `registerServiceWorker()` (P4-T6, `src/lib/pwaClient.ts` → `registerSW({ immediate: true })`, `registerType: prompt` — luôn hỏi người dùng, không tự reload);
   - `startDeployVersionPolling()` — check ngay + mỗi 10 phút + khi sự kiện `online`, GET `/version.json` (`cache: no-store`) so với `__BUILD_ID__` → lệch thì bật thanh "Có phiên bản mới".
2. `src/app/AppLayout.tsx` — render `<PwaUpdateBar />` (P4-T6 UI): role=alert "Có phiên bản mới — Cập nhật?" (Cập nhật / Để sau) hoặc role=status "Đã sẵn sàng dùng offline."; fixed top, không đè NetworkBanner (banner in-flow `mb-3`).

## Vì sao e2e/dev không bị nhiễu

- `vite.config.ts`: `VitePWA devOptions.enabled = false` → module `virtual:pwa-register` ở dev là **stub noop** (`vite-plugin-pwa/dist/client/dev/register.js`) → không đăng ký SW, không lỗi console trên dev server của Playwright.
- Poll `/version.json`: dev không có file này → 404/parse lỗi → `fetchRemoteVersion` trả `null` → không hiện thông báo (đúng thiết kế "lỗi mạng → im lặng").

## Kiểm chứng (build thật, không phải dev)

| Bước | Kết quả |
|---|---|
| `npm run typecheck` / `npm run lint` | exit 0 / exit 0 |
| `npx vitest run` | 26 files / 252 tests passed |
| `npx playwright test` (3 project) | **81/81 passed** (4.4m) |
| `npm run build` | PWA injectManifest: precache **21 entries (4837.78 KiB)**, `dist/sw.js`, `manifest.webmanifest`, `version.json` |
| `vite preview` + Playwright smoke (chromium) | `navigator.serviceWorker.getRegistrations()` → 1 reg scope `/`, **active**, `controller=true` (trang được SW kiểm soát); `GET /version.json` = `{"version":"murqt4bb"}` = `__BUILD_ID__`; `manifest.webmanifest` 200; **0 console error / 0 pageerror** |

## Đối chiếu plan P4 (tick lần này)

- Tick: **T1, T2, T3, T4, T6, T7, T8** (đủ bằng chứng ở trên + evidence `p4-e2e-fix.md` cho e2e).
- Không tick (ghi chú trong plan.md):
  - **T5** — lib outbox (`enqueueBill`/`syncOutbox` idempotent + `price_drift`, unit xong) nhưng chưa có nơi nào enqueue/sync ngoài test → nối ở **P6-T7** khi POS có luồng bán.
  - **T9** — unit ✔, Playwright có T3/T4/T7-T8; case "offline → bán → online → đồng bộ" đã ghi ở **P6-T9** (header `e2e/p4-pwa.spec.ts`), case "đổi giá tab khác" chờ menu UI **P5**.
