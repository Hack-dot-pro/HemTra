# dashboard/skill.md — KPI, charts, ranking (P8)

> Bắt buộc đọc khi làm **P8**. Nguồn chuẩn: `design.md §7.3`. Ảnh mẫu: `chart_1.png` (đường), `chart_2.png` (vòng cung).

## 1. Nguồn số liệu (đọc từ `stats_*`, không query `bills` trực tiếp)

- KPI: doanh thu hôm nay, số bill hôm nay (`stats_daily`), doanh thu tháng.
- Chart theo tháng (`stats_product_monthly`); rank all-time (`stats_product_alltime`) — sống sót sau khi bill bị dọn 15 ngày.

## 2. Chart A — đường doanh thu (P8-T2, bám `chart_1.png`)

- Doanh thu theo ngày trong tháng, **hiện số trên điểm**, đường spline xanh phát sáng, nền kính.
- Zoom/pan + kéo cuộn khi zoom + thanh brush bên dưới; bộ chọn tháng.

## 3. Chart B — vòng cung % + Rank (P8-T3/T4, bám `chart_2.png`)

- `radialBar` nhiều vòng: % = qty sản phẩm / tổng qty tháng; nhãn giữa "TOP N".
- Cạnh trái: **Rank tháng**. Dưới: top 5 bán chạy nhất + top ít bán chạy nhất **all-time** (chỉ tính SP đã bán ≥ 1).
- Tie-break xếp hạng phải deterministic (thứ tự phụ theo tên/mã) — có unit test khóa.

## 4. Tươi dữ liệu + trạng thái (P8-T5)

- Tự cập nhật khi có bill mới (Realtime/invalidate query). Đủ 3 trạng thái: loading / empty / error (lỗi tiếng Việt).

## 5. Hiệu năng (P8-T6 — `design.md §11`)

- Lazy-load ApexCharts (chỉ tải khi vào Dashboard). JS ban đầu < 250 KB gzip; kiểm tra bundle sau khi gắn chart (`npm run build` + đọc báo cáo size).
- Tính %/rank ở `features/dashboard/logic` (pure function, dễ unit test), không tính trong component.

## 6. Test (P8-T7)

Unit: tính %, xếp hạng, tie-break. Playwright: bán 1 đơn → dashboard đổi số (đợi Realtime/invalidate, không `sleep` cứng).
