# THIRD_PARTY.md — Tài nguyên bên thứ ba trong dự án Hẻm Trà

> Mọi asset/font/icon/bộ icon mượn ngoài đều ghi vào đây: nguồn + giấy phép + file dùng.
> Quy tắc: ưu tiên giấy phép cho phép nhúng thương mại (MIT / Apache-2.0 / CC0).

## 1. Asset user cung cấp (quán Hẻm Trà — dùng nội bộ, không phân phối lại)

| File gốc | File trong repo | Dùng ở |
|---|---|---|
| `Logo.png` | `src/assets/logo.png` | Bill PNG, header app |
| `Favicon.png` | `src/assets/favicon.png`, `public/favicon.png`, `public/icons/*` | Favicon, icon PWA |
| `background.png` | `src/assets/background.png` (gốc) + `background.webp` (nén 80%, dùng chính) | Nền sau đăng nhập |
| `chart 1.png` | `src/assets/chart-line.png` | Mẫu Chart A (đường) |
| `chart 2.png` | `src/assets/chart-radial.png` | Mẫu Chart B (vòng cung) |
| `login-hero.png` | `src/assets/login-stage.webp` (nén 92%, dùng chính) + `login-stage.jpg` (dự phòng) | Nền màn login (P2-T2) |
| `template.html` (data URI) | `src/assets/login-logo.png` | Logo màn login (P2-T2) |

> Ghi chú: bản nền login trích từ `template.html` (JPEG 1080×1920) bị nhòe → thay bằng ảnh gốc
> `login-hero.png` do user upload (940×1672, PNG). `template.html` chỉ còn dùng để tham khảo + trích logo.

## 2. Font (P2-T1 — ghi khi nhúng)

- Carlito (woff2, self-host `public/fonts/`) — tương thích số đo Calibri, thay cho Inter trong template.
  - Nguồn: Google Fonts (fonts.googleapis.com/css2?family=Carlito) — subset `latin` + `vietnamese`, weight 400/700.
  - Giấy phép: SIL Open Font License 1.1 (OFL) — cho phép nhúng thương mại.
  - File: `carlito-latin-400.woff2`, `carlito-latin-700.woff2`, `carlito-vietnamese-400.woff2`, `carlito-vietnamese-700.woff2`.

## 3. Icon đồ uống (P6-T1 — ghi khi nạp)

- Bộ: _chưa chốt (hỏi user ở P6-T0)_ — dự kiến Fluent Emoji Flat (MIT) hoặc Noto Emoji (Apache-2.0).
