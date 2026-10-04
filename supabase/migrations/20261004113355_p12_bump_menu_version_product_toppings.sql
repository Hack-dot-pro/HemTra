-- P12-T3: tăng menu_version khi product_toppings thay đổi
-- VẤN ĐỀ (user 2026-10-04): trigger P1-T4 chỉ bắt categories/products/toppings.
-- Gán/bỏ topping cho sản phẩm KHÔNG bump menu_version → client không tải lại menu,
-- modal "Topping cho <sản phẩm>" ở POS vẫn hiển thị danh sách link cũ
-- (toppingsForProduct đọc product_toppings từ menu cache IndexedDB).
-- product_toppings không mang giá nhưng QUYẾT ĐỊNH topping nào hiện ở POS
-- → phải đồng bộ cùng cơ chế chống giá cũ (design §5/§8.2).
create trigger trg_menu_version_on_product_toppings
  after insert or update or delete on public.product_toppings
  for each row execute function public.fn_bump_menu_version();
