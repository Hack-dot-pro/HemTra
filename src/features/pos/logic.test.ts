// Unit test logic POS — P6-T2/T3 (testing/skill.md: happy + biên + lỗi).
// Không React, không mạng — toàn bộ là hàm thuần.

import { describe, expect, it } from 'vitest'
import {
  MAX_LINE_QTY,
  MAX_NOTE_LENGTH,
  MAX_PHONE_NOTE_LENGTH,
  activeCategories,
  addProduct,
  billItemCount,
  billTotal,
  changeQty,
  createBill,
  lineTotal,
  productsOfCategory,
  removeLine,
  repriceBill,
  setNote,
  setPhoneNote,
  toggleTopping,
  toppingsForProduct,
  type BillState,
} from './logic'

const traDao = { id: 'p1', name: 'Trà đào', icon: '🍑', price: 35000 }
const traSua = { id: 'p2', name: 'Trà sữa', icon: '🧋', price: 32000 }
const tranChau = { id: 't1', name: 'Trân châu', price: 5000, icon: '', is_active: true }
const pudding = { id: 't2', name: 'Pudding', price: 7000, icon: '', is_active: true }

let seq = 0
const makeId = () => `line-${++seq}`

function addOne(state: BillState = createBill()): BillState {
  return addProduct(state, traDao, makeId)
}

describe('addProduct — bấm "+" thêm vào bill', () => {
  it('happy: lần đầu mở dòng với giá snapshot, qty 1', () => {
    const state = addOne()
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0]).toMatchObject({
      product_id: 'p1',
      name: 'Trà đào',
      icon: '🍑',
      unit_price: 35000,
      qty: 1,
      note: '',
      toppings: [],
    })
  })

  it('happy: bấm lần 2 cùng SP đơn giản → gộp qty (không thêm dòng)', () => {
    const state = addProduct(addOne(), traDao, makeId)
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0].qty).toBe(2)
  })

  it('biên: SP khác nhau → 2 dòng riêng', () => {
    const state = addProduct(addOne(), traSua, makeId)
    expect(state.lines).toHaveLength(2)
    expect(state.lines[1].product_id).toBe('p2')
  })

  it('biên: dòng đã ghi chú KHÔNG bị gộp → bấm + mở dòng mới', () => {
    let state = addOne()
    state = setNote(state, state.lines[0].line_id, 'ít đá')
    state = addProduct(state, traDao, makeId)
    expect(state.lines).toHaveLength(2)
    expect(state.lines[0].note).toBe('ít đá')
    expect(state.lines[1].qty).toBe(1)
  })

  it('biên: dòng đã có topping KHÔNG bị gộp → dòng mới', () => {
    let state = addOne()
    state = toggleTopping(state, state.lines[0].line_id, tranChau)
    state = addProduct(state, traDao, makeId)
    expect(state.lines).toHaveLength(2)
    expect(state.lines[0].toppings).toHaveLength(1)
  })

  it('biên: qty chạm MAX → dòng kế tiếp là dòng mới, qty 1', () => {
    let state = createBill()
    for (let i = 0; i < MAX_LINE_QTY; i += 1) state = addProduct(state, traDao, makeId)
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0].qty).toBe(MAX_LINE_QTY)
    state = addProduct(state, traDao, makeId)
    expect(state.lines).toHaveLength(2)
    expect(state.lines[1].qty).toBe(1)
  })
})

describe('changeQty / removeLine', () => {
  it('happy: +1 / −1 theo dòng', () => {
    const base = addOne()
    const id = base.lines[0].line_id
    let state = changeQty(base, id, 1)
    expect(state.lines[0].qty).toBe(2)
    state = changeQty(state, id, -1)
    expect(state.lines[0].qty).toBe(1)
  })

  it('lỗi: giảm xuống 0 → xóa dòng', () => {
    const base = addOne()
    const state = changeQty(base, base.lines[0].line_id, -1)
    expect(state.lines).toHaveLength(0)
  })

  it('lỗi: line_id không tồn tại → state giữ nguyên (không ném)', () => {
    const state = addOne()
    expect(changeQty(state, 'khong-ton-tai', 1)).toBe(state)
    expect(setNote(state, 'khong-ton-tai', 'x')).toBe(state)
    expect(removeLine(state, 'khong-ton-tai')).toBe(state)
    expect(toggleTopping(state, 'khong-ton-tai', tranChau)).toBe(state)
  })

  it('biên: vượt MAX_QTY bị kẹp lại', () => {
    const base = addOne()
    const state = changeQty(base, base.lines[0].line_id, 1000)
    expect(state.lines[0].qty).toBe(MAX_LINE_QTY)
  })

  it('happy: removeLine xóa đúng dòng', () => {
    let state = addOne()
    state = addProduct(state, traSua, makeId)
    state = removeLine(state, state.lines[0].line_id)
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0].product_id).toBe('p2')
  })
})

describe('setNote / setPhoneNote — giới hạn độ dài', () => {
  it('happy: ghi chú gắn vào đúng dòng', () => {
    let state = addOne()
    state = addProduct(state, traSua, makeId)
    state = setNote(state, state.lines[1].line_id, 'ít ngọt')
    expect(state.lines[0].note).toBe('')
    expect(state.lines[1].note).toBe('ít ngọt')
  })

  it('biên: cắt chuỗi dài hơn MAX_NOTE_LENGTH', () => {
    const base = addOne()
    const state = setNote(base, base.lines[0].line_id, 'x'.repeat(MAX_NOTE_LENGTH + 50))
    expect(state.lines[0].note).toHaveLength(MAX_NOTE_LENGTH)
  })

  it('biên: phone_note cắt quá MAX_PHONE_NOTE_LENGTH', () => {
    const state = setPhoneNote(createBill(), 'y'.repeat(MAX_PHONE_NOTE_LENGTH + 10))
    expect(state.phone_note).toHaveLength(MAX_PHONE_NOTE_LENGTH)
  })
})

describe('toggleTopping — dòng con thụt lề (design §6.1.3)', () => {
  it('happy: bật topping → thêm snapshot giá; tắt → bỏ ra', () => {
    const base = addOne()
    const id = base.lines[0].line_id
    let state = toggleTopping(base, id, tranChau)
    expect(state.lines[0].toppings).toEqual([
      { topping_id: 't1', name: 'Trân châu', unit_price: 5000 },
    ])
    state = toggleTopping(state, id, tranChau)
    expect(state.lines[0].toppings).toHaveLength(0)
  })

  it('happy: 2 topping độc lập (không ghi đè nhau)', () => {
    const base = addOne()
    const id = base.lines[0].line_id
    let state = toggleTopping(base, id, tranChau)
    state = toggleTopping(state, id, pudding)
    expect(state.lines[0].toppings.map((t) => t.topping_id)).toEqual(['t1', 't2'])
  })
})

describe('tổng tiền — tiền nguyên VND', () => {
  it('happy: (đơn giá + topping) × qty', () => {
    let state = addOne()
    const id = state.lines[0].line_id
    state = changeQty(state, id, 1) // qty 2
    state = toggleTopping(state, id, tranChau) // +5000/ly
    expect(lineTotal(state.lines[0])).toBe((35000 + 5000) * 2)
    expect(billTotal(state)).toBe(80000)
    expect(billItemCount(state)).toBe(2)
  })

  it('happy: nhiều dòng cộng dồn', () => {
    let state = addOne()
    state = addProduct(state, traSua, makeId)
    state = changeQty(state, state.lines[1].line_id, 1) // qty 2 × 32000
    expect(billTotal(state)).toBe(35000 + 64000)
    expect(billItemCount(state)).toBe(3)
  })

  it('biên: giỏ rỗng → tổng 0, số món 0', () => {
    expect(billTotal(createBill())).toBe(0)
    expect(billItemCount(createBill())).toBe(0)
  })
})

describe('toppingsForProduct / activeCategories / productsOfCategory', () => {
  const snapshot = {
    toppings: [tranChau, pudding],
    product_toppings: [
      { product_id: 'p1', topping_id: 't1' },
      { product_id: 'p2', topping_id: 't1' },
      { product_id: 'p2', topping_id: 't2' },
    ],
  }

  it('happy: chỉ topping được áp dụng cho SP đó', () => {
    expect(toppingsForProduct(snapshot, 'p1').map((t) => t.id)).toEqual(['t1'])
    expect(toppingsForProduct(snapshot, 'p2').map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('lỗi: SP không có link → mảng rỗng; cache cũ thiếu product_toppings → []', () => {
    expect(toppingsForProduct(snapshot, 'p9')).toEqual([])
    expect(toppingsForProduct({ toppings: [tranChau] }, 'p1')).toEqual([])
  })

  it('happy: nhóm lọc is_active + sắp sort_order; SP lọc is_active + theo tên', () => {
    const menu = {
      categories: [
        { id: 'c2', name: 'B', icon: '', sort_order: 2, is_active: true },
        { id: 'c1', name: 'A', icon: '', sort_order: 1, is_active: true },
        { id: 'c0', name: 'Ẩn', icon: '', sort_order: 0, is_active: false },
      ],
      products: [
        { id: 'p2', category_id: 'c1', name: 'trà vim', price: 1, icon: '', is_active: true },
        { id: 'p1', category_id: 'c1', name: 'Trà đào', price: 2, icon: '', is_active: true },
        { id: 'p3', category_id: 'c1', name: 'Ẩn', price: 3, icon: '', is_active: false },
      ],
    }
    expect(activeCategories(menu).map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(productsOfCategory(menu, 'c1').map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(productsOfCategory(menu, 'c9')).toEqual([])
  })
})

describe('repriceBill — QC-017: định lại giá/tên dòng theo menu máy chủ', () => {
  const menuWith = (price: number, toppingPrice: number) => ({
    products: [
      { id: 'p1', category_id: 'c1', name: 'Trà đào mới', price, icon: '🍑', is_active: true },
    ],
    toppings: [{ id: 't1', name: 'Trân châu', price: toppingPrice, icon: '', is_active: true }],
  })

  function billWithToppingAndNote(): BillState {
    const added = addOne()
    const lineId = added.lines[0].line_id
    return setNote(toggleTopping(added, lineId, tranChau), lineId, 'ít đá')
  }

  it('happy: giá + tên SP/topping lấy theo menu máy chủ, qty/note/line_id giữ nguyên', () => {
    const state = billWithToppingAndNote()
    const lineId = state.lines[0].line_id
    const { bill, missing } = repriceBill(state, menuWith(40000, 7000))

    expect(missing).toEqual([])
    expect(bill.lines[0]).toMatchObject({
      line_id: lineId,
      name: 'Trà đào mới',
      unit_price: 40000,
      qty: 1,
      note: 'ít đá',
    })
    expect(bill.lines[0].toppings[0]).toMatchObject({
      topping_id: 't1',
      name: 'Trân châu',
      unit_price: 7000,
    })
    expect(billTotal(bill)).toBe(47000)
    // state cũ không bị biến đổi (hàm thuần, trả state mới)
    expect(state.lines[0].unit_price).toBe(35000)
    expect(state.lines[0].name).toBe('Trà đào')
  })

  it('biên: menu mới giá y hệt snapshot → bill không đổi, missing rỗng', () => {
    const state = billWithToppingAndNote()
    const { bill, missing } = repriceBill(state, menuWith(35000, 5000))
    expect(missing).toEqual([])
    expect(billTotal(bill)).toBe(billTotal(state))
    expect(bill.lines[0].name).toBe('Trà đào mới') // tên cũng lấy theo server (RPC online)
  })

  it('lỗi: SP/topping biến mất khỏi menu → missing liệt kê tên, giá giữ nguyên, không ném', () => {
    const state = billWithToppingAndNote()
    const { bill, missing } = repriceBill(state, { products: [], toppings: [] })
    expect(missing).toEqual(['Trà đào', 'Trân châu'])
    expect(bill.lines[0].unit_price).toBe(35000)
    expect(bill.lines[0].toppings[0].unit_price).toBe(5000)
    expect(billTotal(bill)).toBe(billTotal(state))
  })
})
