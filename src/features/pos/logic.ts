// Logic thanh toán thuần — P6-T2/T3 (pos-bill/skill.md §2, design §6).
// Không React, không mạng: reducer-style — mỗi hàm nhận state cũ, trả state mới.
// Tiền là số nguyên VND; giá trong bill là SNAPSHOT tại thời điểm thêm (server
// tự tính lại ở create_bill — backend/skill.md §4, design §8.3).

import type { MenuSnapshot, MenuProduct, MenuTopping } from '../../lib/menuTypes'

export const MAX_LINE_QTY = 99
export const MAX_NOTE_LENGTH = 100
/** RPC create_bill chấp nhận tối đa 50 ký tự (phone_note_invalid). */
export const MAX_PHONE_NOTE_LENGTH = 50

/** Một topping đã chọn cho 1 dòng (giá snapshot). */
export type BillTopping = {
  topping_id: string
  name: string
  unit_price: number
}

/** Một dòng trong giỏ: snapshot giá/topping tại lúc thêm. */
export type BillLine = {
  line_id: string
  product_id: string
  name: string
  icon: string
  unit_price: number
  qty: number
  note: string
  toppings: BillTopping[]
}

export type BillState = {
  lines: BillLine[]
  phone_note: string
}

export function createBill(): BillState {
  return { lines: [], phone_note: '' }
}

function defaultLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Dòng "đơn giản" = cùng SP, chưa ghi chú, chưa topping → gộp số lượng vào đây. */
function findMergeableLine(lines: BillLine[], productId: string): BillLine | undefined {
  return lines.find((l) => l.product_id === productId && l.note === '' && l.toppings.length === 0)
}

/**
 * Bấm "+" trên lưới SP: gộp vào dòng đơn giản cùng SP (cùng cấu hình) nếu còn
 * chỗ; ngược lại mở dòng mới. Dòng đã ghi chú/topping KHÔNG bị gộp lẫn.
 */
export function addProduct(
  state: BillState,
  product: Pick<MenuProduct, 'id' | 'name' | 'icon' | 'price'>,
  makeId: () => string = defaultLineId,
): BillState {
  const existing = findMergeableLine(state.lines, product.id)
  if (existing) {
    if (existing.qty >= MAX_LINE_QTY) {
      return {
        ...state,
        lines: [
          ...state.lines,
          {
            line_id: makeId(),
            product_id: product.id,
            name: product.name,
            icon: product.icon,
            unit_price: product.price,
            qty: 1,
            note: '',
            toppings: [],
          },
        ],
      }
    }
    return {
      ...state,
      lines: state.lines.map((l) =>
        l.line_id === existing.line_id ? { ...l, qty: l.qty + 1 } : l,
      ),
    }
  }
  return {
    ...state,
    lines: [
      ...state.lines,
      {
        line_id: makeId(),
        product_id: product.id,
        name: product.name,
        icon: product.icon,
        unit_price: product.price,
        qty: 1,
        note: '',
        toppings: [],
      },
    ],
  }
}

/** Tăng/giảm số lượng; về 0 → xóa dòng. */
export function changeQty(state: BillState, lineId: string, delta: number): BillState {
  const line = state.lines.find((l) => l.line_id === lineId)
  if (!line) return state
  const nextQty = line.qty + delta
  if (nextQty <= 0) {
    return { ...state, lines: state.lines.filter((l) => l.line_id !== lineId) }
  }
  return {
    ...state,
    lines: state.lines.map((l) =>
      l.line_id === lineId ? { ...l, qty: Math.min(nextQty, MAX_LINE_QTY) } : l,
    ),
  }
}

export function removeLine(state: BillState, lineId: string): BillState {
  if (!state.lines.some((l) => l.line_id === lineId)) return state
  return { ...state, lines: state.lines.filter((l) => l.line_id !== lineId) }
}

/** Ghi chú món (dòng nhỏ nghiêng dưới món — design §6.1.3). */
export function setNote(state: BillState, lineId: string, note: string): BillState {
  if (!state.lines.some((l) => l.line_id === lineId)) return state
  const value = note.slice(0, MAX_NOTE_LENGTH)
  return {
    ...state,
    lines: state.lines.map((l) => (l.line_id === lineId ? { ...l, note: value } : l)),
  }
}

/** Ghi chú/SĐT cả đơn (outbox payload `phone_note` — P6-T7). */
export function setPhoneNote(state: BillState, value: string): BillState {
  return { ...state, phone_note: value.slice(0, MAX_PHONE_NOTE_LENGTH) }
}

/** Bật/tắt 1 topping cho dòng — topping là dòng con thụt lề (design §6.1.3). */
export function toggleTopping(
  state: BillState,
  lineId: string,
  topping: Pick<MenuTopping, 'id' | 'name' | 'price'>,
): BillState {
  if (!state.lines.some((l) => l.line_id === lineId)) return state
  return {
    ...state,
    lines: state.lines.map((l) => {
      if (l.line_id !== lineId) return l
      const chosen = l.toppings.some((t) => t.topping_id === topping.id)
      return {
        ...l,
        toppings: chosen
          ? l.toppings.filter((t) => t.topping_id !== topping.id)
          : [...l.toppings, { topping_id: topping.id, name: topping.name, unit_price: topping.price }],
      }
    }),
  }
}

/** Thành tiền 1 dòng = (đơn giá + topping) × số lượng (tiền nguyên VND). */
export function lineTotal(line: BillLine): number {
  const toppingPerUnit = line.toppings.reduce((sum, t) => sum + t.unit_price, 0)
  return (line.unit_price + toppingPerUnit) * line.qty
}

/** Tổng tiền giỏ. */
export function billTotal(state: BillState): number {
  return state.lines.reduce((sum, line) => sum + lineTotal(line), 0)
}

/** Tổng số món (badge số lượng trên thanh). */
export function billItemCount(state: BillState): number {
  return state.lines.reduce((sum, line) => sum + line.qty, 0)
}

export type RepriceResult = { bill: BillState; missing: string[] }

/**
 * Định lại giá + tên dòng theo menu máy chủ mới nhất — RPC online luôn lấy
 * `products.price`/`name` phía server (create_bill PASS 1), nên snapshot của
 * máy bán chỉ in đúng khi khớp menu vừa tải. Dòng không còn trong menu
 * (SP/topping bị xóa hoặc ngừng bán) đưa vào `missing` để người gọi tự quyết —
 * không bao giờ in bill cộng ra sai tiền (QC-017). Giữ nguyên qty/note/line_id.
 */
export function repriceBill(
  state: BillState,
  menu: Pick<MenuSnapshot, 'products' | 'toppings'>,
): RepriceResult {
  const productById = new Map(menu.products.map((p) => [p.id, p]))
  const toppingById = new Map(menu.toppings.map((t) => [t.id, t]))
  const missing: string[] = []
  const lines = state.lines.map((line) => {
    const product = productById.get(line.product_id)
    if (!product) missing.push(line.name)
    const toppings = line.toppings.map((topping) => {
      const fresh = toppingById.get(topping.topping_id)
      if (!fresh) {
        missing.push(topping.name)
        return topping
      }
      return { ...topping, name: fresh.name, unit_price: fresh.price }
    })
    return {
      ...line,
      name: product ? product.name : line.name,
      unit_price: product ? product.price : line.unit_price,
      toppings,
    }
  })
  return { bill: { ...state, lines }, missing }
}

/** Topping được áp dụng cho SP (P13: topping tự do, áp dụng cho mọi sản phẩm đang bán). */
export function toppingsForProduct(
  snapshot: Pick<MenuSnapshot, 'toppings' | 'product_toppings'>,
  _productId?: string,
): MenuTopping[] {
  return (snapshot.toppings ?? []).filter((t) => t.is_active !== false)
}

/** Danh sách tab nhóm: chỉ nhóm đang bán, giữ sort_order (defensive với cache cũ). */
export function activeCategories(snapshot: Pick<MenuSnapshot, 'categories'>): MenuSnapshot['categories'] {
  return snapshot.categories
    .filter((c) => c.is_active)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

/** SP đang bán của 1 nhóm, theo tên (defensive với cache cũ). */
export function productsOfCategory(
  snapshot: Pick<MenuSnapshot, 'products'>,
  categoryId: string,
): MenuProduct[] {
  return snapshot.products
    .filter((p) => p.is_active && p.category_id === categoryId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
}
