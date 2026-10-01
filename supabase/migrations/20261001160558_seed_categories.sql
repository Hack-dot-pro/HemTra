-- P1-T9: Seed 7 nhóm mặc định (design §7.3)
-- QUYẾT ĐỊNH: chi seed NHOM (la menu that cua quan). San pham/topping mau theo design
-- "chi moi truong dev" — khong co dev env (P0-T6 bi loi mang docker, dung prod),
-- admin them mon that qua UI P5. Fixed UUID de P5/P6 tham chieu on dinh.
insert into public.categories (id, name, icon, sort_order) values
  ('10000000-0000-4000-8000-000000000001', 'Trà trái cây', '', 1),
  ('10000000-0000-4000-8000-000000000002', 'Trà sữa',     '', 2),
  ('10000000-0000-4000-8000-000000000003', 'Cà phê',      '', 3),
  ('10000000-0000-4000-8000-000000000004', 'Latte',       '', 4),
  ('10000000-0000-4000-8000-000000000005', 'Sữa tươi',    '', 5),
  ('10000000-0000-4000-8000-000000000006', 'Nước ép',     '', 6),
  ('10000000-0000-4000-8000-000000000007', 'Sinh tố',     '', 7);

-- Seed gom trigger tang menu_version nhieu lan (test T7 cung tang) — reset ve 1
-- de client P4/P6 co diem bat dau sach; cac chinh sua sau do tang tu 1.
update public.app_meta set menu_version = 1;
