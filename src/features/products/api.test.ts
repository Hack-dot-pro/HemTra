// Unit test cho products api (P5) — dùng fake supabase (testing/skill §2: không
// gọi mạng thật); kiểm chuỗi insert/update/delete + thông báo lỗi tiếng Việt.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../../test/fakeSupabase'
import { defaultProductsApi } from './api'

const holder = vi.hoisted(() => ({ fake: null as FakeSupabase | null }))

vi.mock('../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/supabase')>()
  return { ...actual, getSupabase: () => holder.fake?.client ?? null }
})

function seed() {
  const fake = createFakeSupabase({
    tables: {
      categories: [
        { id: 'c2', name: 'Trà trái cây', icon: '🍑', sort_order: 2, is_active: true },
        { id: 'c1', name: 'Trà sữa', icon: '🧋', sort_order: 1, is_active: false },
      ],
      products: [{ id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: 35000, icon: '', is_active: true }],
      toppings: [{ id: 't1', name: 'Trân châu', price: 3000, icon: '', is_active: true }],
      product_toppings: [{ product_id: 'p1', topping_id: 't1' }],
    },
  })
  holder.fake = fake
  return fake
}

beforeEach(() => {
  holder.fake = null
})

describe('productsApi.load', () => {
  it('đọc đủ 4 bảng, sắp xếp nhóm theo sort_order', async () => {
    seed()
    const lists = await defaultProductsApi.load()
    expect(lists.categories.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(lists.products).toHaveLength(1)
    expect(lists.toppings.map((t) => t.name)).toEqual(['Trân châu'])
    expect(lists.links).toEqual([{ product_id: 'p1', topping_id: 't1' }])
  })

  it('thiếu cấu hình Supabase → lỗi tiếng Việt (CONFIG_ERROR)', async () => {
    holder.fake = null
    await expect(defaultProductsApi.load()).rejects.toThrow('thiếu VITE_SUPABASE_URL')
  })

  it('mất mạng → Không thể kết nối máy chủ', async () => {
    holder.fake = createFakeSupabase({ offline: true })
    await expect(defaultProductsApi.load()).rejects.toThrow('Không thể kết nối máy chủ')
  })

  it('server lỗi bảng → Lỗi máy chủ, thử lại sau', async () => {
    holder.fake = createFakeSupabase({ errorTables: ['products'] })
    await expect(defaultProductsApi.load()).rejects.toThrow('Lỗi máy chủ')
  })
})

describe('productsApi.saveCategory', () => {
  it('thêm nhóm mới (id tự sinh, trim tên/emoji)', async () => {
    const fake = seed()
    const result = await defaultProductsApi.saveCategory({
      name: '  Đào  ',
      icon: ' 🍑 ',
      sort_order: 3,
      is_active: true,
    })
    expect(result).toEqual({ ok: true })
    const rows = fake.tables.categories
    expect(rows).toHaveLength(3)
    const created = rows.find((r) => r.name === 'Đào')
    expect(created).toMatchObject({ icon: '🍑', sort_order: 3, is_active: true })
    expect(String(created?.id)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('sửa nhóm theo id', async () => {
    const fake = seed()
    const result = await defaultProductsApi.saveCategory({
      id: 'c1',
      name: 'Trà sữa',
      icon: '🧋',
      sort_order: 1,
      is_active: true,
    })
    expect(result).toEqual({ ok: true })
    expect(fake.tables.categories.find((r) => r.id === 'c1')?.is_active).toBe(true)
    expect(fake.tables.categories).toHaveLength(2)
  })

  it('bảng lỗi → { ok:false, message tiếng Việt }', async () => {
    holder.fake = createFakeSupabase({ errorTables: ['categories'] })
    const result = await defaultProductsApi.saveCategory({ name: 'Mới', icon: '', sort_order: 1, is_active: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('Lỗi máy chủ, thử lại sau.')
  })
})

describe('productsApi.saveProduct', () => {
  it('thêm sản phẩm + ghi lại danh sách topping (xóa link cũ, chèn bộ mới)', async () => {
    const fake = seed()
    fake.tables.toppings.push({ id: 't2', name: 'Pudding', price: 5000, icon: '', is_active: true })
    const result = await defaultProductsApi.saveProduct({
      name: 'Trà sữa trân châu',
      price: 32000,
      category_id: 'c1',
      icon: '🧋',
      is_active: true,
      topping_ids: ['t1', 't2'],
    })
    expect(result).toEqual({ ok: true })
    expect(fake.tables.products).toHaveLength(2)
    expect(fake.tables.product_toppings).toEqual([
      { product_id: 'p1', topping_id: 't1' },
      { product_id: expect.any(String), topping_id: 't1' },
      { product_id: expect.any(String), topping_id: 't2' },
    ])
  })

  it('sửa sản phẩm có id: chỉ update đúng 1 hàng, link topping = bộ mới', async () => {
    const fake = seed()
    const result = await defaultProductsApi.saveProduct({
      id: 'p1',
      name: 'Trà sữa đào',
      price: 36000,
      category_id: 'c1',
      icon: '',
      is_active: false,
      topping_ids: [],
    })
    expect(result).toEqual({ ok: true })
    expect(fake.tables.products).toHaveLength(1)
    expect(fake.tables.products[0]).toMatchObject({ price: 36000, is_active: false })
    expect(fake.tables.product_toppings).toEqual([])
  })
})

describe('productsApi.saveTopping / setActive / remove', () => {
  it('thêm + sửa topping', async () => {
    const fake = seed()
    expect((await defaultProductsApi.saveTopping({ name: 'Pudding', price: 5000, icon: '', is_active: true })).ok).toBe(true)
    expect(fake.tables.toppings).toHaveLength(2)
    expect(
      (await defaultProductsApi.saveTopping({ id: 't1', name: 'Trân châu đen', price: 4000, icon: '', is_active: true })).ok,
    ).toBe(true)
    expect(fake.tables.toppings.find((r) => r.id === 't1')?.name).toBe('Trân châu đen')
  })

  it('setActive bật/tắt đúng bảng', async () => {
    const fake = seed()
    expect((await defaultProductsApi.setActive('category', 'c2', false)).ok).toBe(true)
    expect(fake.tables.categories.find((r) => r.id === 'c2')?.is_active).toBe(false)
    expect((await defaultProductsApi.setActive('product', 'p1', false)).ok).toBe(true)
    expect(fake.tables.products[0].is_active).toBe(false)
    expect((await defaultProductsApi.setActive('topping', 't1', false)).ok).toBe(true)
    expect(fake.tables.toppings[0].is_active).toBe(false)
  })

  it('remove xóa sản phẩm/topping theo id, không đụng hàng khác', async () => {
    const fake = seed()
    fake.tables.products.push({ id: 'p2', category_id: 'c1', name: 'Khoai môn', price: 30000, icon: '', is_active: true })
    expect((await defaultProductsApi.remove('product', 'p1')).ok).toBe(true)
    expect(fake.tables.products.map((r) => r.id)).toEqual(['p2'])
    expect((await defaultProductsApi.remove('topping', 't1')).ok).toBe(true)
    expect(fake.tables.toppings).toEqual([])
  })

  it('mất mạng khi setActive → thông báo lỗi kết nối', async () => {
    holder.fake = createFakeSupabase({ offline: true })
    const result = await defaultProductsApi.setActive('product', 'p1', false)
    expect(result).toEqual({ ok: false, message: 'Không thể kết nối máy chủ, thử lại sau.' })
  })
})
