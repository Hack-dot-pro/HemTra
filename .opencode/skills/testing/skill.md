# testing/skill.md — Chuẩn test mọi phase (unit, component, E2E, a11y)

> Đọc khi viết/sửa test ở bất kỳ phase nào. Checklist cổng QC (Q1–Q12): `subagent.md §2`.

## 1. Việc của main-coding vs qc-test

- main-coding: viết test cho **mọi logic mình viết** (happy + biên + lỗi), tự chạy `lint`/`typecheck`/`test` xanh trước khi giao phase.
- Thiếu test → qc-test tự viết bổ sung (được sửa file test), code fail → báo lỗi, không sửa code.

## 2. Unit + component (Vitest + RTL + MSW)

- Đặt cạnh code: `features/*/logic.test.ts`, `lib/*.test.ts`. Coverage ≥ 80% dòng cho `lib/` + `features/*/logic` đã chạm (`vitest --coverage`).
- Tên test mô tả **hành vi** tiếng Việt hoặc Anh ngắn gọn; không assert rỗng/luôn đúng.
- MSW chỉ mock HTTP ở unit test; test tích hợp chạy thật với Supabase local (cấm mock che lỗi — AGENT.md §3.9).
- Cấm `.skip`/`.only` mới trong code giao (Q3).

## 3. E2E (Playwright — Chromium + WebKit)

- Đặt ở `e2e/`. Viewport chuẩn: **390×844** (mobile) + **1280×800** (desktop); mỗi màn hình mới phải có ảnh chụp 2 cỡ, không lỗi console (Q10).
- Quy tắc đợi: `expect` tự retry, không `sleep` cứng. Seed dev riêng, không đụng dữ liệu thật.
- Ma trận E2E toàn luồng (P11-T1): bootstrap → login → thêm SP → bán → xuất PNG → xem bill → tạo user → offline → đồng bộ lại.

## 4. A11y + DB (Q11, Q8)

- axe qua Playwright: 0 vi phạm nghiêm trọng (form có nhãn, focus rõ, tương phản, reduced-motion).
- Phase chạm DB: `supabase test db` — RLS từng bảng/role, trigger thống kê, mã bill nguyên tử, idempotency `client_uuid`; migration chạy sạch trên DB trống.

## 5. Lệnh chạy nhanh sau mỗi task (không đợi cuối phase)

```bash
npm run typecheck && npm run lint && npm run test -- --run
```
