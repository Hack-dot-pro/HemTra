// Kiểu dữ liệu menu — dùng chung cho cache offline (P4), CRUD Sản phẩm (P5) và POS (P6).
// Cột khớp migration 20261001152827 (icon/is_active là chuỗi/cờ, giá số nguyên VND).

export type MenuCategory = {
  id: string
  name: string
  icon: string
  sort_order: number
  is_active: boolean
}

export type MenuProduct = {
  id: string
  category_id: string
  name: string
  price: number
  icon: string
  is_active: boolean
}

export type MenuTopping = {
  id: string
  name: string
  price: number
  icon: string
  is_active: boolean
}

// Một dòng trong IndexedDB: toàn bộ menu bán hàng + mốc đồng bộ (design §8.1–8.2).
export type ProductToppingLink = {
  product_id: string
  topping_id: string
}

// product_toppings optional: dòng cache ghi trước P6 (khi chưa query bảng này)
// vẫn đọc được — POS phải fallback về [] (design §5, P6-T3 chọn topping theo SP).
export type MenuSnapshot = {
  id: 'menu'
  menu_version: number
  fetched_at: number
  categories: MenuCategory[]
  products: MenuProduct[]
  toppings: MenuTopping[]
  product_toppings?: ProductToppingLink[]
}
