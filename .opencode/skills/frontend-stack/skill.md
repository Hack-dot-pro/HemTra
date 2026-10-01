# frontend-stack/skill.md — Khởi tạo dự án P0 (Vite + React + TS + Tailwind + test infra)

> Bắt buộc đọc khi làm **P0-T2 → P0-T7**. Nguồn chuẩn: `design.md §2, §2.1, §10`.

## 1. Chốt phiên bản (P0-T2 — không tự đoán số)

Chạy `npm view <pkg> version` + `npm view <pkg> peerDependencies` cho từng gói,
chọn bản ổn định mới nhất **không xung đột peer**, ghi bản đã chốt vào `design.md §2.1` + `state.json → decisions.versions_locked`.

| Gói | Ràng buộc |
|---|---|
| react / react-dom | `^19` |
| tailwindcss + @tailwindcss/vite | `^4` (thử 4.3 trước; lỗi build → lùi 4.x gần nhất, ghi lý do) |
| react-apexcharts | bản hỗ trợ React 19 (kiểm `peerDependencies`) |
| vite, vite-plugin-pwa | bản tương thích nhau (kiểm peer) |
| @supabase/supabase-js | v2 mới nhất ổn định (pin + commit lockfile) |

Khởi tạo: Vite React-TS template → gắn `@tailwindcss/vite` → smoke `npm run dev` + `build` xanh mới xong T2.

## 2. Scripts chuẩn (P0-T3 — mọi phase sau đều dùng)

```json
{ "lint": "eslint .", "typecheck": "tsc --noEmit", "test": "vitest run",
  "test:e2e": "playwright test", "build": "tsc --noEmit && vite build" }
```

ESLint (react, hooks, a11y plugin) + Prettier. `tsc` strict, `noUnusedLocals`. Không `any` lọt trừ khi có `eslint-disable` + lý do 1 dòng.

## 3. Test infra (P0-T4)

Vitest + React Testing Library + MSW + Playwright. Viết 1 test mẫu chạy xanh làm mốc
(chi tiết cách viết test: xem `testing/skill.md`).

## 4. Tài nguyên + icon (P0-T5, P0-T7)

- Copy `Logo.png`, `Favicon.png`, `background.png`, `chart_1/2.png`, `template.html` (tham khảo) vào `src/assets/`.
- Nén ảnh nền: WebP + PNG dự phòng (`<picture>`). Ghi nguồn + giấy phép mọi asset mượn vào `THIRD_PARTY.md`.
- Sinh icon PWA từ `Favicon.png`: 192, 512 (+ maskable), apple-touch 180 → `public/icons/`.

## 5. Supabase local (P0-T6)

`supabase init` → `supabase link --project-ref tsnrggxczipzqvvpcbld` → `supabase start` chạy được, `supabase status` xanh.
Docker chưa chạy thì dừng, báo user (loop.md §6.7) — không fake output.

## 6. Cấm kỵ P0

- Đoán version, `-f`/`--force` khi npm conflict (hỏi user).
- Commit `.env` thật — chỉ `.env.example` (xem `security/skill.md §1`).
- Quên `THIRD_PARTY.md` khi thêm asset/icon/font.
