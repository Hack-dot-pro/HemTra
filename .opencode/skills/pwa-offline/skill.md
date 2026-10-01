# pwa-offline/skill.md — PWA, cache, đồng bộ offline an toàn giá (P4)

> Bắt buộc đọc khi làm **P4** và nút Tải App / Xóa cache (P2-T4, P2-T5). Nguồn chuẩn: `design.md §8`.
> Headers/CSP: `security/skill.md §2`. UI nút bấm: `uiux/skill.md §3`.

## 1. App shell (P4-T1)

- `vite-plugin-pwa` chế độ `injectManifest`; manifest: tên "Hẻm Trà", `display: standalone`, `theme_color #1e8fe8`, icon 192/512/maskable + apple-touch 180.
- Precache app shell theo hash (Workbox). `index.html` + `sw.js` luôn `Cache-Control: no-cache` qua `public/_headers`.
- **SW không cache** phản hồi API, token, dữ liệu có xác thực (SEC S12).

## 2. Dữ liệu offline — Dexie (P4-T2)

- Bảng `menuCache` (`menu_version`, `fetched_at`, payload menu) + bảng `outbox` (bill chờ sync: snapshot giá, `client_uuid`, ảnh PNG blob).
- Menu do app quản lý trong IndexedDB — không để SW cache API menu.

## 3. Đồng bộ menu — 4 điểm chạm (P4-T3)

Mở app, `visibilitychange`, `online`, Realtime kênh `app_meta` → so `menu_version` server; khác → tải lại menu, cập nhật IndexedDB.
Mặc định giá lấy từ server; cache chỉ là dự phòng.

## 4. Quy tắc chống sai giá (bất biến nghiệp vụ AGENT.md §11.7)

- Online khi bấm thanh toán: gọi RPC kiểm tra `menu_version`; lệch → buộc refresh menu, báo "Giá vừa cập nhật", cho xem lại giỏ. Giá chốt DB **tính lại từ `products`** (RPC `create_bill`), không tin giá client.
- Offline: bán bằng cache, banner "Đang offline — giá cập nhật lúc HH:mm"; bill vào outbox, tự sync khi có mạng, idempotent theo `client_uuid`.
- Sync phát hiện lệch giá → **giữ snapshot** (đã giao khách), gắn cờ `price_drift` cho admin.
- Cache menu > 24h khi offline → cảnh báo nổi bật (vẫn cho bán).

## 5. Cập nhật app + Xóa cache (P4-T6, P4-T7)

- `public/version.json` (no-store); client poll định kỳ; lệch → dọn cache. SW `skipWaiting` **có xác nhận** ("Có phiên bản mới — Cập nhật").
- `hardRefresh()` chạy được Safari + Chrome, đúng thứ tự (`design.md §8.7`): unregister SW → xóa `caches` → xóa bảng menuCache (**giữ outbox** — còn bill chưa sync thì hỏi xác nhận) → xóa `sessionStorage`, giữ `localStorage` username/phiên → `location.replace(url + '?r=' + Date.now())`.
- Safari không hỗ trợ `Clear-Site-Data` → bắt buộc quy trình thủ công trên; PWA iOS vẫn kẹt → hướng dẫn gỡ + thêm lại.
- Nút "Tải App": Chrome/Edge/Android bắt `beforeinstallprompt` → `prompt()`; iOS Safari mở hộp hướng dẫn Chia sẻ → Thêm vào MH chính; ẩn khi standalone (`display-mode: standalone` / `navigator.standalone`).

## 6. Test (P4-T9)

Unit: so version, outbox idempotent theo `client_uuid`, `price_drift`. Playwright: offline → bán → online → đồng bộ; đổi giá tab khác → tab cũ thấy giá mới; `hardRefresh` giữ outbox.
