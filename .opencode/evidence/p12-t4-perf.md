# P12-T4 — Tăng tốc frontend (baseline → sau khi sửa)

Ngày: 2026-10-04 · Repo: HemTra · Build: `npm run build` (typecheck + vite build + SW injectManifest)

## 1. Kích thước ảnh (file nguồn → dist)

| Ảnh | Trước | Sau | Ghi chú |
|---|---:|---:|---|
| `src/assets/logo.png` → `logo.webp` (960px, q82) | 1,419.57 kB | 123.22 kB | **-91%** — dùng chung header (AppLayout) + POS + BillSheet |
| `src/styles/glass.css` nền `.app-bg` | png 2,113.48 + webp 144.42 | webp 144.42 | bỏ fallback png (image-set → webp-only) |
| `login-logo.png` → `login-logo.webp` | 329.66 kB | 52.60 kB | **-84%** |
| `login-stage.jpg` (fallback của image-set) | 281.91 kB | 0 | webp-only |
| `public/favicon.png` (resize 180×180, palette) | 1,168.15 kB | 13.17 kB | **-98.9%** (favicon source `src/assets/favicon.png` giữ nguyên, không đưa vào build) |

## 2. Bundle & precache

| Chỉ số | Trước | Sau |
|---|---:|---:|
| Bundle chính `index-*.js` | 844.66 kB / **gzip 241.26 kB** | 648.68 kB / **gzip 187.83 kB** (giữ < 250 kB ✓) |
| 5 menu page | gộp trong bundle chính | tách chunk: Dashboard 6.26 gz · Products 7.43 · Pos 6.90 · Bills 4.43 · Users 5.93 kB gzip |
| SW precache (lần đầu tải app) | 26 entry / **7,412.88 KiB** | 38 entry / **3,069.49 KiB** (**-57.5%**) |
| `react-apexcharts` chunk (lazy, chỉ Dashboard) | 954.16 / gzip 273.91 kB | không đổi (đã tách sẵn) |

`vite.config.ts → injectManifest.globPatterns`: thêm `webp` (logo/background/login-logo precache được — đúng tinh thần offline-first §8).

## 3. Số request sau mỗi thao tác lưu (trang Sản phẩm)

| | Trước | Sau |
|---|---|---|
| Lưu nhóm / SP / topping (POST/PATCH) | 1 ghi + **4 GET refetch** (categories, products, toppings, product_toppings) | 1 ghi, **0 GET** — vá list cục bộ (`upsert` + sort lại theo `name`/`sort_order`) |
| Ẩn / bật / xóa | 1 ghi + 4 GET | 1 ghi, 0 GET (patch `is_active` / splice + dọn `links`) |
| Sắp xếp ↑/↓ (2 lần lưu) | 2 ghi + 8 GET | 2 ghi + 0 GET; **lưu lần 1 lỗi → vẫn refetch** (đồng bộ theo server) |
| Refetch còn lại | — | lúc mở trang + nút "Thử lại" khi lỗi mạng |

Bằng chứng code: `src/features/products/ProductsPage.tsx` chỉ còn 1 chỗ `await load()` (đường lỗi `moveCategory`); `SaveOutcome.id` (`api.ts`) trả id đã ghi để page vá list.

## 4. Prefetch route

- `src/app/routes.tsx`: 5 menu page → `React.lazy` (bundle đầu nhẹ hơn).
- `src/app/prefetch.ts` + `AppLayout`: `onMouseEnter`/`onFocus` link menu → `import()` chunk (cùng specifier với `lazy()` → Vite gộp 1 chunk, không tải trùng).
- `AppLayout` bọc `<Outlet/>` bằng `Suspense` → header/nav giữ nguyên khi tải chunk.
- Test: `App.test.tsx` — hover/focus link "Sản phẩm" → `prefetchRoute('/products')`.

## 5. Kiểm chứng

- `npm run lint` · `npm run typecheck` · `npx vitest run` → **535/535 pass** (49 files).
- `npx playwright test e2e/p5-products.spec.ts --project=chromium` → **2/2 pass** (trang Sản phẩm: CRUD + đồng bộ menuCache sau khi bỏ refetch).
- Lưu ý: Playwright trong container này cần `npx playwright install chromium` + `npx playwright install-deps chromium` (đã chạy).
