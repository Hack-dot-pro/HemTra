import { describe, expect, it } from 'vitest'
import {
  filterProducts,
  isDuplicateName,
  nextSortOrder,
  parseCategory,
  parseProduct,
  parseTopping,
  swapTargets,
} from './logic'

const categories = [
  { id: 'c1', name: 'Trà sữa' },
  { id: 'c2', name: 'Trà trái cây' },
]

describe('parseCategory', () => {
  it('chấp nhận nhóm hợp lệ và trim tên/emoji', () => {
    const result = parseCategory(
      { name: '  Đào  ', icon: ' 🍑 ', sort_order: 3, is_active: true },
      categories,
    )
    expect(result).toEqual({
      ok: true,
      data: { name: 'Đào', icon: '🍑', sort_order: 3, is_active: true },
    })
  })

  it('bắt buộc tên, thứ tự hợp lệ (nguyên dương)', () => {
    const empty = parseCategory({ name: '   ', icon: '', sort_order: 1, is_active: true }, categories)
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.errors.name).toBe('Vui lòng nhập tên.')

    const neg = parseCategory({ name: 'Mới', icon: '', sort_order: -1, is_active: true }, categories)
    expect(neg.ok).toBe(false)
    if (!neg.ok) expect(neg.errors.sort_order).toBe('Thứ tự không được âm.')

    const float = parseCategory({ name: 'Mới', icon: '', sort_order: 1.5, is_active: true }, categories)
    expect(float.ok).toBe(false)
    if (!float.ok) expect(float.errors.sort_order).toBe('Thứ tự phải là số nguyên.')

    const nan = parseCategory({ name: 'Mới', icon: '', sort_order: Number.NaN, is_active: true }, categories)
    expect(nan.ok).toBe(false)
    if (!nan.ok) expect(nan.errors.sort_order).toBe('Vui lòng nhập thứ tự.')
  })

  it('chặn trùng tên nhóm (không phân biệt hoa/thường)', () => {
    const dup = parseCategory({ name: 'trà sữa', icon: '', sort_order: 1, is_active: true }, categories)
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.errors.name).toBe('Tên nhóm đã tồn tại.')
  })

  it('cho phép giữ nguyên tên khi sửa chính nó', () => {
    const result = parseCategory(
      { name: 'Trà sữa', icon: '', sort_order: 1, is_active: false, id: 'c1' },
      categories,
    )
    expect(result.ok).toBe(true)
  })

  it('từ chối emoji quá dài', () => {
    const result = parseCategory({ name: 'Mới', icon: 'x'.repeat(17), sort_order: 1, is_active: true }, categories)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.icon).toBe('Emoji quá dài.')
  })
})

describe('parseProduct', () => {
  const products = [
    { id: 'p1', name: 'Trà sữa đào', category_id: 'c1' },
    { id: 'p2', name: 'Trà đào', category_id: 'c2' },
  ]

  it('chấp nhận sản phẩm hợp lệ', () => {
    const result = parseProduct(
      { name: 'Trà sữa bạc hà', price: 35000, category_id: 'c1', icon: '🧋', is_active: true, topping_ids: ['t1'] },
      products,
    )
    expect(result).toEqual({
      ok: true,
      data: { name: 'Trà sữa bạc hà', price: 35000, category_id: 'c1', icon: '🧋', is_active: true, topping_ids: ['t1'] },
    })
  })

  it('đơn giá phải là số nguyên VND lớn hơn 0', () => {
    const missing = parseProduct(
      { name: 'Món mới', price: Number.NaN, category_id: 'c1', icon: '', is_active: true, topping_ids: [] },
      products,
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.errors.price).toBe('Vui lòng nhập đơn giá.')

    const negative = parseProduct(
      { name: 'Món mới', price: -5000, category_id: 'c1', icon: '', is_active: true, topping_ids: [] },
      products,
    )
    expect(negative.ok).toBe(false)
    if (!negative.ok) expect(negative.errors.price).toBe('Đơn giá phải lớn hơn 0.')

    const float = parseProduct(
      { name: 'Món mới', price: 35000.5, category_id: 'c1', icon: '', is_active: true, topping_ids: [] },
      products,
    )
    expect(float.ok).toBe(false)
    if (!float.ok) expect(float.errors.price).toBe('Đơn giá phải là số nguyên.')
  })

  it('bắt buộc chọn nhóm', () => {
    const result = parseProduct(
      { name: 'Món mới', price: 20000, category_id: '', icon: '', is_active: true, topping_ids: [] },
      products,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.category_id).toBe('Vui lòng chọn nhóm.')
  })

  it('trùng tên chỉ tính trong cùng nhóm — cùng tên khác nhóm vẫn được', () => {
    const dupInCategory = parseProduct(
      { name: 'Trà sữa đào', price: 30000, category_id: 'c1', icon: '', is_active: true, topping_ids: [] },
      products,
    )
    expect(dupInCategory.ok).toBe(false)
    if (!dupInCategory.ok) expect(dupInCategory.errors.name).toBe('Tên sản phẩm đã tồn tại trong nhóm này.')

    const sameNameOtherCategory = parseProduct(
      { name: 'Trà sữa đào', price: 30000, category_id: 'c2', icon: '', is_active: true, topping_ids: [] },
      products,
    )
    expect(sameNameOtherCategory.ok).toBe(true)
  })

  it('khi sửa không tính chính nó là trùng', () => {
    const result = parseProduct(
      { name: 'Trà sữa đào', price: 36000, category_id: 'c1', icon: '', is_active: true, topping_ids: [], id: 'p1' },
      products,
    )
    expect(result.ok).toBe(true)
  })
})

describe('parseTopping', () => {
  const toppings = [
    { id: 't1', name: 'Trân châu' },
    { id: 't2', name: 'Pudding' },
  ]

  it('chấp nhận topping hợp lệ', () => {
    const result = parseTopping({ name: 'Khúc bạch', price: 5000, icon: '🥛', is_active: true }, toppings)
    expect(result).toEqual({ ok: true, data: { name: 'Khúc bạch', price: 5000, icon: '🥛', is_active: true } })
  })

  it('bắt buộc tên + đơn giá hợp lệ', () => {
    const noName = parseTopping({ name: '', price: 5000, icon: '', is_active: true }, toppings)
    expect(noName.ok).toBe(false)
    if (!noName.ok) expect(noName.errors.name).toBe('Vui lòng nhập tên.')

    const badPrice = parseTopping({ name: 'Mới', price: 0, icon: '', is_active: true }, toppings)
    expect(badPrice.ok).toBe(false)
    if (!badPrice.ok) expect(badPrice.errors.price).toBe('Đơn giá phải lớn hơn 0.')
  })

  it('chặn trùng tên topping', () => {
    const result = parseTopping({ name: 'trân châu', price: 5000, icon: '', is_active: true }, toppings)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.name).toBe('Tên topping đã tồn tại.')
  })
})

describe('isDuplicateName', () => {
  const rows = [
    { id: 'a', name: ' Trà Sữa ', category_id: 'c1' },
    { id: 'b', name: 'Trà đào', category_id: 'c2' },
  ]

  it('so theo tên sau trim + bỏ hoa/thường, tôn trọng excludeId và categoryId', () => {
    expect(isDuplicateName(rows, 'trà sữa')).toBe(true)
    expect(isDuplicateName(rows, '  TRÀ sữa  ')).toBe(true)
    expect(isDuplicateName(rows, 'Trà Sữa', { excludeId: 'a' })).toBe(false)
    expect(isDuplicateName(rows, 'Trà sữa', { categoryId: 'c2' })).toBe(false)
    expect(isDuplicateName(rows, 'Sinh tố')).toBe(false)
  })
})

describe('filterProducts', () => {
  const products = [
    { name: 'Trà sữa đào', category_id: 'c1' },
    { name: 'Trà đào', category_id: 'c2' },
    { name: 'Sinh tố bơ', category_id: 'c2' },
  ]

  it('tìm theo tên không phân biệt hoa/thường, trim query', () => {
    expect(filterProducts(products, { query: '  ĐÀO ', categoryId: 'all' }).map((p) => p.name)).toEqual([
      'Trà sữa đào',
      'Trà đào',
    ])
  })

  it('lọc theo nhóm, kết hợp được với tìm kiếm', () => {
    expect(filterProducts(products, { query: '', categoryId: 'c2' }).map((p) => p.name)).toEqual([
      'Trà đào',
      'Sinh tố bơ',
    ])
    expect(filterProducts(products, { query: 'đào', categoryId: 'c2' }).map((p) => p.name)).toEqual(['Trà đào'])
  })

  it('query rỗng trả về mọi sản phẩm của nhóm', () => {
    expect(filterProducts(products, { query: '', categoryId: 'all' })).toHaveLength(3)
    expect(filterProducts(products, { query: 'xyz', categoryId: 'all' })).toHaveLength(0)
  })
})

describe('nextSortOrder + swapTargets', () => {
  const rows = [
    { id: 'a', sort_order: 1 },
    { id: 'b', sort_order: 4 },
    { id: 'c', sort_order: 7 },
  ]

  it('thứ tự mới = max + 1, rỗng thì bắt đầu từ 1', () => {
    expect(nextSortOrder(rows)).toBe(8)
    expect(nextSortOrder([])).toBe(1)
  })

  it('hoán đổi với nhóm kề, chặn ngoài đầu/cuối danh sách', () => {
    expect(swapTargets(rows, 'b', 'up')).toEqual({ self: rows[1], other: rows[0] })
    expect(swapTargets(rows, 'b', 'down')).toEqual({ self: rows[1], other: rows[2] })
    expect(swapTargets(rows, 'a', 'up')).toBeNull()
    expect(swapTargets(rows, 'c', 'down')).toBeNull()
    expect(swapTargets(rows, 'zzz', 'up')).toBeNull()
  })
})
