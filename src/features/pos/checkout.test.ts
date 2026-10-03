// Unit test luồng thanh toán — P6-T7 (RPC contract: create_bill migration).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HemTraDB, setDbForTest, type OutboxPayload } from '../../lib/db'
import { listPending } from '../../lib/outbox'
import {
  CheckoutRateLimitedError,
  MenuVersionChangedError,
  OFFLINE_CODE_PATTERN,
  buildRpcItems,
  createBillOnline,
  enqueueOfflineBill,
  findPriceDriftLines,
  makeOfflineCode,
  sheetTotal,
  toSheetItems,
} from './checkout'
import { createBill, addProduct, setPhoneNote, toggleTopping, MAX_PHONE_NOTE_LENGTH } from './logic'
import type { BillState } from './logic'

function sampleBill(): BillState {
  const base = createBill()
  const withProd = addProduct(base, { id: 'p1', name: 'Trà sữa đào', icon: '🧋', price: 35000 })
  const withQty = { ...withProd, lines: [{ ...withProd.lines[0], qty: 2 }] }
  return toggleTopping(
    { ...withQty, phone_note: '0909 123 456' },
    withQty.lines[0].line_id,
    { id: 't1', name: 'Trân châu', price: 5000 },
  )
}

function stubClient(rpc: ReturnType<typeof vi.fn>): SupabaseClient {
  return { rpc } as unknown as SupabaseClient
}

beforeEach(() => {
  setDbForTest(new HemTraDB(`checkout-test-${Math.random().toString(16).slice(2)}`))
})
afterEach(() => {
  setDbForTest(null)
})

describe('P6-T7 — buildRpcItems', () => {
  it('map đúng contract: qty, name, unit_price, topping qty theo dòng', () => {
    const items = buildRpcItems(sampleBill())
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      product_id: 'p1',
      qty: 2,
      name: 'Trà sữa đào',
      unit_price: 35000,
      toppings: [{ topping_id: 't1', qty: 2, name: 'Trân châu', unit_price: 5000 }],
    })
  })

  it('note rỗng → bỏ trống key note (không gửi chuỗi rỗng)', () => {
    const items = buildRpcItems(createBill())
    expect(items).toHaveLength(0)
    const bill = addProduct(createBill(), { id: 'p1', name: 'A', icon: '', price: 1000 })
    expect(buildRpcItems(bill)[0]).not.toHaveProperty('note')
  })
})

describe('P6-T7 — makeOfflineCode', () => {
  it('khớp regex server ^HT-[0-9]{6}-OFF-[A-Za-z0-9]{4}$', () => {
    const code = makeOfflineCode(new Date('2026-10-03T12:00:00+07:00'))
    expect(code).toMatch(OFFLINE_CODE_PATTERN)
    expect(code.startsWith('HT-261003-OFF-')).toBe(true)
  })

  it('2 lần sinh → khác nhau (4 ký tự ngẫu nhiên)', () => {
    expect(makeOfflineCode()).not.toBe(makeOfflineCode())
  })
})

describe('P6-QC-013 — findPriceDriftLines (chặn giỏ giá cũ)', () => {
  function menuFixture(price = 35000, toppingPrice = 5000) {
    return {
      id: 'menu' as const,
      menu_version: 8,
      fetched_at: Date.now(),
      categories: [],
      products: [
        { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price, icon: '', is_active: true },
      ],
      toppings: [{ id: 't1', name: 'Trân châu', price: toppingPrice, icon: '', is_active: true }],
      product_toppings: [],
    }
  }

  it('giỏ khớp menu → không dòng nào lệch', () => {
    expect(findPriceDriftLines(sampleBill(), menuFixture())).toEqual([])
  })

  it('giá SP đổi trong menu → liệt kê tên dòng (bill cũ bị chặn)', () => {
    expect(findPriceDriftLines(sampleBill(), menuFixture(40000))).toEqual(['Trà sữa đào'])
  })

  it('SP biến mất khỏi menu (ngừng bán) → cũng bị chặn', () => {
    const menu = menuFixture()
    menu.products = []
    expect(findPriceDriftLines(sampleBill(), menu)).toEqual(['Trà sữa đào'])
  })

  it('giá topping đổi → liệt kê dòng con', () => {
    expect(findPriceDriftLines(sampleBill(), menuFixture(35000, 7000))).toEqual([
      'Trà sữa đào + Trân châu',
    ])
  })
})

describe('P6-T7 — createBillOnline', () => {
  it('happy: gửi đủ 7 tham số RPC, trả code/total/client_uuid', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { code: 'HT-261003-0001', total: 80000, price_drift: false, duplicate: false },
      error: null,
    })
    const result = await createBillOnline({ client: stubClient(rpc), bill: sampleBill(), menuVersion: 7 })
    expect(rpc).toHaveBeenCalledWith('create_bill', {
      p_client_uuid: expect.any(String),
      p_items: expect.any(Array),
      p_menu_version: 7,
      p_is_offline: false,
      p_offline_code: null,
      p_phone_note: '0909 123 456',
      p_created_at: null,
    })
    expect(result).toMatchObject({ kind: 'online', code: 'HT-261003-0001', total: 80000, client_uuid: expect.any(String) })
  })

  it('server báo lệch menu_version → MenuVersionChangedError', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'menu_version_changed' } })
    await expect(
      createBillOnline({ client: stubClient(rpc), bill: sampleBill(), menuVersion: 7 }),
    ).rejects.toBeInstanceOf(MenuVersionChangedError)
  })

  it('rate limit → CheckoutRateLimitedError; lỗi khác → Error thường', async () => {
    const limited = vi.fn().mockResolvedValue({ data: null, error: { message: 'rate_limited' } })
    await expect(
      createBillOnline({ client: stubClient(limited), bill: sampleBill(), menuVersion: 7 }),
    ).rejects.toBeInstanceOf(CheckoutRateLimitedError)

    const other = vi.fn().mockResolvedValue({ data: null, error: { message: 'product_unavailable' } })
    await expect(
      createBillOnline({ client: stubClient(other), bill: sampleBill(), menuVersion: 7 }),
    ).rejects.toThrow('product_unavailable')
  })
})

describe('P6-T7 — enqueueOfflineBill', () => {
  it('happy: ghi outbox pending kèm png + payload offline (mã OFF dùng lại nếu đã sinh)', async () => {
    const { offline_code, client_uuid } = await enqueueOfflineBill({
      bill: sampleBill(),
      menuVersion: 7,
      png: 'data:image/png;base64,UE5H',
      offlineCode: 'HT-261003-OFF-ab12',
      now: new Date('2026-10-03T12:00:00+07:00'),
    })
    expect(offline_code).toBe('HT-261003-OFF-ab12')
    const pending = await listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].client_uuid).toBe(client_uuid)
    // fake-indexeddb không giữ được lớp Blob của jsdom (browser thật giữ) — chỉ
    // kiểm dữ liệu còn đó để syncOutbox truyền tiếp cho uploadPng.
    expect(pending[0].png).toBeTruthy()
    expect(pending[0].payload).toMatchObject<Partial<OutboxPayload>>({
      is_offline: true,
      offline_code: 'HT-261003-OFF-ab12',
      menu_version: 7,
      created_at: '2026-10-03T05:00:00.000Z',
    })
    expect(pending[0].payload.items[0]).toMatchObject({ product_id: 'p1', qty: 2, unit_price: 35000 })
  })
})

describe('P6-T7 — toSheetItems + sheetTotal', () => {
  it('sheet items đúng dòng/topping; total online lấy server, offline lấy snapshot', () => {
    const bill = sampleBill()
    const items = toSheetItems(bill)
    expect(items[0]).toMatchObject({ name: 'Trà sữa đào', qty: 2 })
    expect('note' in items[0]).toBe(false) // note rỗng → không có key
    expect(items[0].toppings).toHaveLength(1)
    expect(items[0].toppings?.[0]).toMatchObject({ key: 't1', name: 'Trân châu', unit_price: 5000 })
    expect(sheetTotal(bill, null)).toBe((35000 + 5000) * 2)
    expect(
      sheetTotal(bill, { kind: 'online', code: 'x', client_uuid: 'u', total: 99000, price_drift: false, duplicate: false }),
    ).toBe(99000)
  })

  it('phone_note bị kẹp 50 ký tự (đúng giới hạn RPC)', () => {
    const state = setPhoneNote(createBill(), '9'.repeat(80))
    expect(state.phone_note).toHaveLength(MAX_PHONE_NOTE_LENGTH)
    expect(MAX_PHONE_NOTE_LENGTH).toBe(50)
  })
})
