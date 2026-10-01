# release/skill.md — E2E toàn luồng, Lighthouse, deploy, smoke test (P11)

> Bắt buộc đọc khi làm **P11**. Xong phase này thì **hỏi user** (báo cáo cuối + giả định cần xác nhận).
> Nguồn chuẩn: `design.md §11, §12`.

## 1. E2E đầy đủ (P11-T1)

Chạy ma trận `testing/skill.md §3` trên **Chromium + WebKit** (mô phỏng Safari). WebKit fail mà Chromium pass → nghi ngờ quirk Safari (font, `html-to-image`, PWA) trước khi đổ lỗi code.

## 2. Lighthouse (P11-T2)

Chạy PWA + Performance + A11y cho trang login và 1 trang sau login. Hạng mục dưới ngưỡng → sửa (lazy-load chart/PNG lib, nén ảnh, precache) rồi đo lại, ghi số trước/sau vào evidence.

## 3. Deploy (P11-T3)

- **Cloudflare Pages:** build sạch → cấu hình env (chỉ `anon` key + URL công khai) → `public/_headers` đi kèm (CSP, HSTS, no-cache `index.html`/`sw.js`).
- **Supabase thật:** `supabase db push` migrations → deploy Edge Functions → bật pg_cron `cleanup-bills` → kiểm tra RLS/Auth config khớp P3 (signup tắt, SMTP, Google provider).
- Thứ tự: deploy backend trước, smoke API thật, rồi mới deploy frontend.

## 4. Smoke test URL thật (P11-T4)

Trên điện thoại thật hoặc emulator: mở URL → login → bán 1 đơn thật → PNG xem được → cài PWA → `hardRefresh` hoạt động. Ghi thiết bị + trình duyệt + kết quả từng bước.

## 5. README + bàn giao (P11-T5/T6)

- `README.md`: cài đặt, biến môi trường, sao lưu, **ping định kỳ chống Supabase tạm dừng** (free ~1 tuần không hoạt động), hạn mức free hiện hành (kiểm lại, không đoán).
- Báo cáo cuối: phase đã xong, Gate QC/SEC, danh sách giả định chờ xác nhận (`state.json → open_questions` status `assumed`), backlog còn lại. Rồi **hỏi user**.
