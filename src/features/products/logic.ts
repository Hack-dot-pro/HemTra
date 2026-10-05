// Logic thuần của trang Sản phẩm — P5-T1..T5 (design §4.1, §5):
// validate zod tiếng Việt (T5), lọc/tìm kiếm (T4), sắp xếp nhóm (T1).
// Không đụng Supabase ở đây — tách để unit test (testing skill §2).

import { z } from 'zod'
import { EMOJI_ITEMS } from '../../lib/emojiUtils'

export const NAME_MAX = 80

export const EMOJI_SUGGESTIONS = EMOJI_ITEMS

const nameSchema = z
  .string('Vui lòng nhập tên.')
  .trim()
  .min(1, 'Vui lòng nhập tên.')
  .max(NAME_MAX, `Tên tối đa ${NAME_MAX} ký tự.`)

const priceSchema = z
  .number('Vui lòng nhập đơn giá.')
  .int('Đơn giá phải là số nguyên.')
  .positive('Đơn giá phải lớn hơn 0.')

const iconSchema = z.string().trim().max(100, 'Emoji quá dài.')

const categoryIdSchema = z
  .string('Vui lòng chọn nhóm.')
  .min(1, 'Vui lòng chọn nhóm.')

export const categorySchema = z.object({
  name: nameSchema,
  icon: iconSchema,
  sort_order: z
    .number('Vui lòng nhập thứ tự.')
    .int('Thứ tự phải là số nguyên.')
    .min(0, 'Thứ tự không được âm.'),
  is_active: z.boolean(),
})

export const productSchema = z.object({
  name: nameSchema,
  price: priceSchema,
  category_id: categoryIdSchema,
  icon: iconSchema,
  is_active: z.boolean(),
  topping_ids: z.array(z.string()),
})

export const toppingSchema = z.object({
  name: nameSchema,
  price: priceSchema,
  icon: iconSchema,
  is_active: z.boolean(),
})

export type CategoryValues = z.input<typeof categorySchema> & { id?: string }
export type ProductValues = z.input<typeof productSchema> & { id?: string }
export type ToppingValues = z.input<typeof toppingSchema> & { id?: string }

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> }

function firstErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!out[key]) out[key] = issue.message
  }
  return out
}

type NamedRow = { id: string; name: string; category_id?: string }

/** Trùng tên (so sánh sau trim + bỏ hoa/thường) — danh sách có thể giới hạn theo nhóm. */
export function isDuplicateName(
  rows: NamedRow[],
  name: string,
  opts: { excludeId?: string; categoryId?: string } = {},
): boolean {
  const needle = name.trim().toLowerCase()
  return rows.some(
    (row) =>
      row.id !== opts.excludeId &&
      (opts.categoryId === undefined || row.category_id === opts.categoryId) &&
      row.name.trim().toLowerCase() === needle,
  )
}

export function parseCategory(
  values: CategoryValues,
  rows: NamedRow[],
): ParseResult<{ name: string; icon: string; sort_order: number; is_active: boolean }> {
  const parsed = categorySchema.safeParse(values)
  if (!parsed.success) return { ok: false, errors: firstErrors(parsed.error) }
  if (isDuplicateName(rows, values.name, { excludeId: values.id })) {
    return { ok: false, errors: { name: 'Tên nhóm đã tồn tại.' } }
  }
  return { ok: true, data: parsed.data }
}

export function parseProduct(
  values: ProductValues,
  rows: NamedRow[],
): ParseResult<{
  name: string
  price: number
  category_id: string
  icon: string
  is_active: boolean
  topping_ids: string[]
}> {
  const parsed = productSchema.safeParse(values)
  if (!parsed.success) return { ok: false, errors: firstErrors(parsed.error) }
  if (isDuplicateName(rows, values.name, { excludeId: values.id, categoryId: values.category_id })) {
    return { ok: false, errors: { name: 'Tên sản phẩm đã tồn tại trong nhóm này.' } }
  }
  return { ok: true, data: parsed.data }
}

export function parseTopping(
  values: ToppingValues,
  rows: NamedRow[],
): ParseResult<{ name: string; price: number; icon: string; is_active: boolean }> {
  const parsed = toppingSchema.safeParse(values)
  if (!parsed.success) return { ok: false, errors: firstErrors(parsed.error) }
  if (isDuplicateName(rows, values.name, { excludeId: values.id })) {
    return { ok: false, errors: { name: 'Tên topping đã tồn tại.' } }
  }
  return { ok: true, data: parsed.data }
}

export type ProductFilter = { query: string; categoryId: string }

/** Tìm kiếm theo tên (không phân biệt hoa/thường) + lọc theo nhóm ('all' = mọi nhóm). */
export function filterProducts<
  T extends { name: string; category_id: string },
>(products: T[], { query, categoryId }: ProductFilter): T[] {
  const q = query.trim().toLowerCase()
  return products.filter(
    (p) =>
      (categoryId === 'all' || p.category_id === categoryId) &&
      (q === '' || p.name.toLowerCase().includes(q)),
  )
}

/** Thứ tự mới cho nhóm khi thêm (đặt cuối danh sách). */
export function nextSortOrder(rows: { sort_order: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1
}

export type SortRow = { id: string; sort_order: number }

/**
 * Hai nhóm cần đổi chỗ khi bấm ↑/↓ (T1 sắp xếp): giữ nguyên sort_order đang
 * hiển thị, chỉ hoán đổi với nhóm kề trên/dưới; đã đầu danh sách thì null.
 */
export function swapTargets<T extends SortRow>(
  sortedRows: T[],
  id: string,
  dir: 'up' | 'down',
): { self: T; other: T } | null {
  const index = sortedRows.findIndex((row) => row.id === id)
  if (index < 0) return null
  const otherIndex = dir === 'up' ? index - 1 : index + 1
  if (otherIndex < 0 || otherIndex >= sortedRows.length) return null
  return { self: sortedRows[index], other: sortedRows[otherIndex] }
}

import type { ProductLists } from './api'

let cachedProductLists: ProductLists | null = null

export function getCachedProductLists(): ProductLists | null {
  return cachedProductLists
}

export function setCachedProductLists(val: ProductLists | null): void {
  cachedProductLists = val
}

export function resetProductListsCache(): void {
  cachedProductLists = null
}
