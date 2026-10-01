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
| `template.html` | (tham khảo, không ship) | Mẫu màn hình login |

## 2. Font (P2-T1 — ghi khi nhúng)

- Carlito (woff2, self-host `public/fonts/`) — tương thích số đo Calibri. Giấy phép: OFL _(xác nhận khi tải)_.

## 3. Icon đồ uống (P6-T1 — ghi khi nạp)

- Bộ: _chưa chốt (hỏi user ở P6-T0)_ — dự kiến Fluent Emoji Flat (MIT) hoặc Noto Emoji (Apache-2.0).
