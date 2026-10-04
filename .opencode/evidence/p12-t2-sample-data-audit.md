# P12-T2 — Rà soát dữ liệu mẫu (cloud `tsnrggxczipzqvvpcbld`)

Ngày: 2026-10-04. Người thực hiện: main-coding. Liên kết: `plan.md` P12-T2, `state.json` evidence.

## 1. Quét code: còn fallback/mẫu trong FE không?

| Quét (src/, bỏ `*.test.*`) | Kết quả |
|---|---|
| `mock\|sample\|demo\|fixture\|seed` trong `.ts/.tsx` | 0 file dữ liệu (chỉ gặp UI-fallback của React: `<Suspense fallback>`, `fallback={img}`) |
| `useState([` khởi tạo mảng mẫu | chỉ `useState<T[]>([])` rỗng (`UsersPage.tsx:37`, `BillsPage.tsx:38`) |
| Tên món/nhóm hardcode (`'Trà `, `'Cà phê`, `Latte`, `Sinh tố`, …) ngoài test | 0 chỗ |
| `src/data/`, `seed*.sql`, `public/*.json` chứa list | không tồn tại |
| Khối dữ liệu tĩnh duy nhất | `src/features/pos/DEFAULT_LAYOUT.ts` (layout ô bấm — cấu hình, không phải dữ liệu menu) |

**Kết luận FE:** mọi list (Sản phẩm, POS, Dashboard, QL bill, Người dùng, Hồ sơ) đọc trực tiếp từ Supabase qua RLS — **không còn fallback/mẫu trong code**.

## 2. Đối chiếu list FE ↔ Supabase thật (service key)

| List FE | Nguồn query | Dòng thật |
|---|---|---|
| Nhóm (Sản phẩm/POS) | `categories` | 7: Trà trái cây, Trà sữa, Cà phê, Latte, Sữa tươi, Nước ép, Sinh tố (`is_active=true`) |
| Món | `products` | 1: Rượu đế 35.000₫ |
| Topping | `toppings` | 1: Giòn 35.000₫ |
| Gán topping ↔ món | `product_toppings` | 0 (chưa gán — trạng thái thật) |
| Người dùng | `profiles` | 1: `hemtra` / Hẻm Trà / admin / `must_change_password=false` |
| Auth | `auth.admin.users` | 1: `nguyentuongvi190501@gmail.com` |
| QL bill | `bills` + `bill_items` + Storage `bills/` | 3 bill (95.000₫) ↔ 3 item ↔ 3 ảnh `2026/10/HT-261004-{0001,0022,0023}.png` |
| Dashboard | `stats_daily`, `stats_product_monthly`, `stats_product_alltime` | xem mục 3 |
| Bootstrap | `app_meta` | `menu_version=35`, `schema_version=1`, `admin_email=nguyentuongvi190501@gmail.com` |

## 3. Phát hiện & dọn dữ liệu sót (test residue)

| # | Sót lại | Trước | Đã xử lý |
|---|---|---|---|
| 1 | `stats_daily` 2026-10-04 lệch `bills` | **595.000₫ / 23 bill** vs `bills` chỉ 3 bill (95.000₫) — số từ bill bị xóa **trước** khi có RPC `admin_delete_bill` (P12-T10) | Tính lại từ `bills`/`bill_items` theo đúng ngữ nghĩa trigger `fn_stats_on_bill`/`fn_stats_on_bill_item` → **95.000₫ / 3 bill** |
| 2 | `stats_product_*` còn món đã xóa | "Bia hơi" 21 qty / 525.000₫ (SP không còn trong `products`) | Giữ `product_key` cũ theo tên (đúng design §5 "SP xóa stats vẫn còn"), qty/revenue lấy từ bill còn sống → **Bia hơi 1 / 25.000₫**, "Rượu đế" 2 / 70.000₫ |
| 3 | Ảnh mồ côi Storage | `bills/2026/10/HT-261001-0004.png` (70 B, bill không còn) | Xóa → Storage đúng 3 ảnh = 3 bill |
| 4 | Auth user test sót | `p12t9-otp-test@example.com` (dò test EF profile-update, script die trước bước cleanup) | Xóa → còn 1 user thật |
| 5 | `login_attempts` | 9 dòng lockout cũ | Xóa hết → **0 dòng** (EF tự cắt theo 15 phút; counters không treo lockout) |

Script dọn: `.opencode/evidence/p12-t2-cleanup.sql` (chạy `npx supabase db query --linked -f …`).
Ảnh chụp trước khi dọn: `.opencode/evidence/p12-t2-stats-before.json`.

## 4. Xác minh sau dọn

```
stats_daily           1 row  revenue=95000 bill_count=3
stats_product_monthly 2 rows revenue=95000 qty=3   (Rượu đế 2/70000, Bia hơi 1/25000)
stats_product_alltime 2 rows revenue=95000 qty=3
bills (tham chiếu)    3 rows total=95000
login_attempts        0 rows
auth users            1 (nguyentuongvi190501@gmail.com)
Storage bills/2026/10 3 ảnh = 3 bill
app_meta              menu_version=35, admin_email giữ nguyên
```

Tất cả list FE nay khớp 1-1 với DB thật; **không còn dữ liệu mẫu lẫn lộn giữa Dashboard và QL bill**.

## 5. Giới hạn / quan sát

- Bill `HT-261004-0001` (25.000₫) có `product_id=NULL` (món "Bia hơi" đã bị xóa menu) → vào `stats_daily` nhưng không tự tạo dòng product mới; dòng "Bia hơi" được giữ lại từ `product_key` cũ ở mục 3 — tránh mất lịch sử doanh thu.
- Khoảng trắng mã bill (0001 → 0022) là **chuỗi mã liên tục**, không phải dữ liệu mẫu; QL bill hiển thị đúng 3 bill còn sống.
- Không sửa code FE/BE trong task này (không còn fallback để gỡ).
