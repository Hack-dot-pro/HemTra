// API CRUD cho trang Sản phẩm — P5 (design §4.1: cả admin & staff sửa menu,
// RLS *_staff_all + session_fresh; design §5: menu_version do trigger DB tự
// tăng nên client không tự bump). Mọi lỗi trả về message tiếng Việt, chi tiết
// gốc chỉ console.error để dò lỗi (testing/uiux skill).

import type { SupabaseClient } from '@supabase/supabase-js'
import { CONFIG_ERROR, NETWORK_ERROR, SERVER_ERROR } from '../../lib/http'
import { getSupabase } from '../../lib/supabase'
import type { CategoryValues, ProductValues, ToppingValues } from './logic'

export type CategoryRow = {
  id: string
  name: string
  icon: string
  sort_order: number
  is_active: boolean
}

export type ProductRow = {
  id: string
  category_id: string
  name: string
  price: number
  icon: string
  is_active: boolean
}

export type ToppingRow = {
  id: string
  name: string
  price: number
  icon: string
  is_active: boolean
}

export type ToppingLink = { product_id: string; topping_id: string }

export type ProductLists = {
  categories: CategoryRow[]
  products: ProductRow[]
  toppings: ToppingRow[]
  links: ToppingLink[]
}

export type SaveOutcome = { ok: true } | { ok: false; message: string }

export type ProductsApi = {
  load(): Promise<ProductLists>
  saveCategory(values: CategoryValues): Promise<SaveOutcome>
  saveProduct(values: ProductValues): Promise<SaveOutcome>
  saveTopping(values: ToppingValues): Promise<SaveOutcome>
  setActive(kind: 'category' | 'product' | 'topping', id: string, active: boolean): Promise<SaveOutcome>
  remove(kind: 'product' | 'topping', id: string): Promise<SaveOutcome>
}

class ApiError extends Error {
  constructor(message: string) {
    super(message)
  }
}

const TABLE = {
  category: 'categories',
  product: 'products',
  topping: 'toppings',
} as const

function toVietnamese(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '')
  if (/Failed to fetch|fetch failed|NetworkError|network/i.test(raw)) return NETWORK_ERROR
  if (/row-level security|permission denied/i.test(raw)) return 'Bạn không có quyền thao tác này.'
  if (/duplicate key|unique constraint|23505/i.test(raw)) return 'Dữ liệu đã tồn tại, hãy kiểm tra lại.'
  return SERVER_ERROR
}

function throwOnError(result: { error: unknown }): void {
  if (result.error) {
    const message = toVietnamese(result.error)
    console.error('[products api]', result.error)
    throw new ApiError(message)
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

async function withClient<T>(fn: (client: SupabaseClient) => Promise<T>): Promise<T> {
  const client = getSupabase()
  if (!client) throw new ApiError(CONFIG_ERROR)
  try {
    return await fn(client)
  } catch (error) {
    if (error instanceof ApiError) throw error
    console.error('[products api]', error)
    throw new ApiError(toVietnamese(error))
  }
}

/** Bọc thao tác ghi thành SaveOutcome — không bao giờ reject (modal hiển thị message). */
async function outcome(fn: (client: SupabaseClient) => Promise<void>): Promise<SaveOutcome> {
  try {
    await withClient(fn)
    return { ok: true }
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, message: error.message }
    return { ok: false, message: SERVER_ERROR }
  }
}

export const defaultProductsApi: ProductsApi = {
  async load() {
    return withClient(async (client) => {
      const [categories, products, toppings, links] = await Promise.all([
        client.from('categories').select('id,name,icon,sort_order,is_active').order('sort_order'),
        client.from('products').select('id,category_id,name,price,icon,is_active').order('name'),
        client.from('toppings').select('id,name,price,icon,is_active').order('name'),
        client.from('product_toppings').select('product_id,topping_id'),
      ])
      throwOnError(categories)
      throwOnError(products)
      throwOnError(toppings)
      throwOnError(links)
      return {
        categories: (categories.data ?? []) as CategoryRow[],
        products: (products.data ?? []) as ProductRow[],
        toppings: (toppings.data ?? []) as ToppingRow[],
        links: (links.data ?? []) as ToppingLink[],
      }
    })
  },

  async saveCategory(values) {
    return outcome(async (client) => {
      const row = {
        name: values.name.trim(),
        icon: values.icon.trim(),
        sort_order: values.sort_order,
        is_active: values.is_active,
      }
      if (values.id) throwOnError(await client.from('categories').update(row).eq('id', values.id))
      else throwOnError(await client.from('categories').insert({ id: newId(), ...row }))
    })
  },

  async saveProduct(values) {
    return outcome(async (client) => {
      const id = values.id ?? newId()
      const row = {
        name: values.name.trim(),
        category_id: values.category_id,
        price: values.price,
        icon: values.icon.trim(),
        is_active: values.is_active,
      }
      if (values.id) throwOnError(await client.from('products').update(row).eq('id', id))
      else throwOnError(await client.from('products').insert({ id, ...row }))
      throwOnError(await client.from('product_toppings').delete().eq('product_id', id))
      if (values.topping_ids.length > 0) {
        throwOnError(
          await client
            .from('product_toppings')
            .insert(values.topping_ids.map((topping_id) => ({ product_id: id, topping_id }))),
        )
      }
    })
  },

  async saveTopping(values) {
    return outcome(async (client) => {
      const row = {
        name: values.name.trim(),
        price: values.price,
        icon: values.icon.trim(),
        is_active: values.is_active,
      }
      if (values.id) throwOnError(await client.from('toppings').update(row).eq('id', values.id))
      else throwOnError(await client.from('toppings').insert({ id: newId(), ...row }))
    })
  },

  async setActive(kind, id, active) {
    return outcome(async (client) => {
      throwOnError(await client.from(TABLE[kind]).update({ is_active: active }).eq('id', id))
    })
  },

  async remove(kind, id) {
    return outcome(async (client) => {
      throwOnError(await client.from(TABLE[kind]).delete().eq('id', id))
    })
  },
}
