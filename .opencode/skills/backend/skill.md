# backend/skill.md — Supabase DB, RLS, Edge Functions (dự án Hẻm Trà)

> Adapter HemTra trên 2 skill gốc `supabase/agent-skills`.
> Task nào đụng DB/Auth/Storage/Realtime/Edge Functions/CLI → đọc file này TRƯỚC,
> rồi mới đọc sâu vào skill gốc khi cần chi tiết.

## 1. Skill gốc (đọc khi cần chi tiết, đừng copy-dán mù)

| Skill | File | Dùng khi |
|---|---|---|
| `supabase` | `.agents/skills/supabase/SKILL.md` | Mọi task Supabase: CLI, MCP, Auth, Storage, Realtime, Edge Functions, debug lỗi, xem logs |
| `supabase-postgres-best-practices` | `.agents/skills/supabase-postgres-best-practices/SKILL.md` + `references/` | **BẮT BUỘC đọc trước** khi viết/sửa: bảng, cột, migration, RLS + test RLS, index, trigger, function, pg_cron |

Quy tắc từ skill gốc áp nguyên: verify changelog/docs trước khi làm (Supabase đổi nhanh),
làm xong chạy query thật kiểm chứng, lỗi 2–3 lần không được thì đổi hướng (không retry mù).

## 2. Cấu hình HemTra (chỉ tên biến — TUYỆT ĐỐI không ghi giá trị key vào đây)

- `SUPABASE_URL` = `https://tsnrggxczipzqvvpcbld.supabase.co` (project `HemTra`, ref `tsnrggxczipzqvvpcbld`, region Singapore)
- Frontend chỉ dùng `SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` CHỈ ở Edge Functions/server (xem `security/skill.md`).
- CLI/MCP dùng `SUPABASE_ACCESS_TOKEN` (scoped token, ưu tiên hơn `supabase login`).
- CLI đã cài: `2.119.0`. Mọi lệnh CLI tra cứu bằng `--help` trước, không đoán cú pháp.
- `supabase-js` dùng v2 bản ổn định mới nhất, pin version + commit lockfile (P0-T2 chốt số).

## 3. Workflow migration (imperative — dự án chưa dùng declarative schema)

1. Chưa có `supabase/` → làm P0-T6 trước (`supabase init`, `supabase link --project-ref tsnrggxczipzqvvpcbld`, `supabase start` chạy được local).
2. Sửa schema: thử SQL trực tiếp bằng `supabase db query` / MCP `execute_sql` (không tạo history, iterate thoải mái). KHÔNG dùng `apply_migration` để thử nghiệm.
3. File migration mới: tạo bằng `supabase migration new <ten>` — không tự bịa tên file/format.
4. Trước khi commit migration: chạy `supabase db advisors`, sửa hết cảnh báo; rà checklist bảo mật mục 5.
5. Chốt: `supabase db pull <ten> --local --yes` → `supabase migration list --local` → test trên DB trống (`supabase test db`).

## 4. Schema HemTra (nguồn chuẩn: `design.md §5`, chi tiết migration do P1 viết)

Bảng: `profiles`, `app_meta` (`bootstrapped`, `menu_version`, `schema_version`), `categories`,
`products`, `toppings`, `product_toppings`, `bills` (`client_uuid` unique, `code` unique,
`expires_at` = +15 ngày, `is_offline`), `bill_items` (snapshot tên + giá, `parent_item_id` cho topping),
`stats_daily`, `stats_product_monthly`, `stats_product_alltime` (vĩnh viễn, cập nhật bằng trigger khi chèn bill),
`login_attempts`.

Hàm: `next_bill_code()` (nguyên tử, reset theo ngày VN), `session_fresh()` (JWT iat ≤ 7 ngày),
`is_admin()`, RPC `create_bill(...)` (transaction, tính lại giá từ `products`, idempotent theo `client_uuid`,
kiểm tra `menu_version`). Trigger tăng `menu_version` khi menu đổi + Realtime kênh `app_meta`.
Bucket private `bills`, upload PNG `bills/YYYY/MM/<code>.png`.

## 5. RLS — mẫu đúng cho HemTra (skill gốc bắt buộc, đây là chốt áp dụng)

- Bật RLS mọi bảng ở schema exposed (`public`). Bảng mới → cấp `GRANT` rõ cho `anon`/`authenticated` (Data API) + RLS (kiểm soát hàng). Thiếu GRANT thì bảng SQL-tạo mới sẽ 403 dù có policy.
- Dùng mệnh đề `TO`, KHÔNG dùng `auth.role()` (deprecated, vỡ lặng khi bật anonymous sign-in).
- `TO authenticated` một mình = mới xác thực, chưa phân quyền → luôn kèm điều kiện sở hữu trong `USING`, ví dụ `using ((select auth.uid()) = user_id)`.
- Policy `UPDATE` phải có cả `USING` lẫn `WITH CHECK` (kẻo user gán `user_id` sang người khác).
- UPDATE cần policy SELECT thì mới có dòng để sửa (thiếu là update 0 dòng, không báo lỗi).
- Không dùng `SECURITY DEFINER` để chữa lỗi quyền (bypass RLS lặng). Thật cần thì: để ở schema không exposed, có check `auth.uid()` trong thân, chạy `supabase db advisors` sau đó.
- View ở Postgres ≥ 15: `WITH (security_invoker = true)`; bản cũ hơn: revoke `anon`/`authenticated` hoặc để schema private.
- Không lấy `user_metadata`/`raw_user_meta_data` làm căn cứ phân quyền (user tự sửa được) → dùng `app_metadata`.
- Không bao giờ `using (true)` cho dữ liệu nhạy cảm. Ma trận quyền chuẩn: `design.md §4.1`.

## 6. Quy ước dữ liệu HemTra

- Tiền: số nguyên VND. Thời gian: DB `timestamptz` (UTC), nghiệp vụ hiển thị `Asia/Ho_Chi_Minh`.
- `username` lowercase, unique; email nội bộ `<username>@hem.local` (không gửi mail thật).
- Giá client chỉ để hiển thị — server tính lại; bill offline giữ snapshot giá + cờ `price_drift` khi lệch.
- Ngôn ngữ thông báo lỗi người dùng + comment quan trọng: tiếng Việt. Biến/hàm: tiếng Anh.
- Free tier: DB 500 MB, Storage 1 GB — PNG bill < 200 KB, tự dọn 15 ngày (xem `design.md §12`).
