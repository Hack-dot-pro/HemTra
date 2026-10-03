// Unit test PosPage — P6-T2/T3/T7 (grid + panel bill + thanh toán). Menu cache
// THẬT trong fake-indexeddb (đúng đường data: useMenuSnapshot → readCachedMenu).
// P6-T7 mock đúng 2 biên: supabase client (không mạng) + exportBillPng (jsdom
// không có canvas); logic thanh toán / outbox vẫn chạy THẬT.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PosPage from './PosPage'
import { HemTraDB, setDbForTest, type HemTraDB as DBType } from '../../lib/db'
import { listPending } from '../../lib/outbox'
import { syncMenu, writeCachedMenu } from '../../lib/menuSync'
import type { MenuSnapshot } from '../../lib/menuTypes'

const { rpcMock, uploadMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  uploadMock: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: { from: () => ({ upload: (...args: unknown[]) => uploadMock(...args) }) },
  }),
}))

vi.mock('../../lib/menuSync', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/menuSync')>()
  return { ...mod, syncMenu: vi.fn(async () => null) }
})

vi.mock('./exportBillPng', () => ({
  billNodeToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  downloadBlob: vi.fn(),
  isSafariCapture: () => false,
}))

let testDb: DBType

function menuFixture(): MenuSnapshot {
  return {
    id: 'menu',
    menu_version: 7,
    fetched_at: Date.now(),
    categories: [
      { id: 'c1', name: 'Trà sữa', icon: '🧋', sort_order: 1, is_active: true },
      { id: 'c2', name: 'Trà trái cây', icon: '🍑', sort_order: 2, is_active: true },
    ],
    products: [
      { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: 35000, icon: '', is_active: true },
      { id: 'p2', category_id: 'c1', name: 'Matcha sữa', price: 32000, icon: '', is_active: true },
      { id: 'p3', category_id: 'c2', name: 'Trà đào', price: 30000, icon: '', is_active: true },
      { id: 'p4', category_id: 'c2', name: 'Món ẩn', price: 1000, icon: '', is_active: false },
    ],
    toppings: [
      { id: 't1', name: 'Trân châu', price: 5000, icon: '', is_active: true },
      { id: 't2', name: 'Pudding', price: 7000, icon: '', is_active: true },
    ],
    product_toppings: [
      { product_id: 'p1', topping_id: 't1' },
      { product_id: 'p1', topping_id: 't2' },
    ],
  }
}

beforeEach(async () => {
  rpcMock.mockReset()
  uploadMock.mockReset().mockResolvedValue({ error: null })
  vi.mocked(syncMenu).mockClear()
  testDb = new HemTraDB(`pos-test-${Math.random().toString(16).slice(2)}`)
  setDbForTest(testDb)
  await writeCachedMenu(menuFixture(), testDb)
})

afterEach(() => {
  cleanup()
  setDbForTest(null)
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

async function renderPos() {
  const user = userEvent.setup()
  render(<PosPage />)
  await screen.findByRole('button', { name: 'Thêm Trà sữa đào' })
  return user
}

describe('P6-T2 — lưới sản phẩm theo nhóm', () => {
  it('mặc định chọn nhóm đầu, chỉ hiện SP đang bán của nhóm đó', async () => {
    await renderPos()
    expect(screen.getByRole('button', { name: 'Trà sữa' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Thêm Trà sữa đào' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm Matcha sữa' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm Trà đào' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm Món ẩn' })).not.toBeInTheDocument()
  })

  it('bấm nhóm khác → đổi lưới', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Trà trái cây' }))
    expect(screen.getByRole('button', { name: 'Thêm Trà đào' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm Trà sữa đào' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trà trái cây' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('P6-T2/T3 — panel bill realtime', () => {
  it('bấm Thêm → dòng bill, cộng dồn qty, tổng tức thì', async () => {
    const user = await renderPos()
    expect(screen.getByTestId('bill-total')).toHaveTextContent('0 ₫')

    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    let lines = await screen.findAllByTestId('bill-line')
    expect(lines).toHaveLength(1)
    expect(within(lines[0]).getByText('1')).toBeInTheDocument()
    expect(screen.getByTestId('bill-total')).toHaveTextContent('35.000 ₫')
    expect(screen.getByTestId('bill-count')).toHaveTextContent('1 món')

    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    lines = screen.getAllByTestId('bill-line')
    expect(lines).toHaveLength(1)
    expect(within(lines[0]).getByText('2')).toBeInTheDocument()
    expect(screen.getByTestId('bill-total')).toHaveTextContent('70.000 ₫')
  })

  it('SP khác nhau → 2 dòng; giảm về 0 → xóa dòng, tổng về 0', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Thêm Matcha sữa' }))
    expect(screen.getAllByTestId('bill-line')).toHaveLength(2)
    expect(screen.getByTestId('bill-total')).toHaveTextContent('67.000 ₫')

    const first = screen.getAllByTestId('bill-line')[0]
    await user.click(within(first).getByRole('button', { name: 'Giảm Trà sữa đào' }))
    expect(screen.getAllByTestId('bill-line')).toHaveLength(1)
    const remaining = screen.getAllByTestId('bill-line')[0]
    await user.click(within(remaining).getByRole('button', { name: 'Giảm Matcha sữa' }))
    expect(screen.queryAllByTestId('bill-line')).toHaveLength(0)
    expect(screen.getByTestId('bill-total')).toHaveTextContent('0 ₫')
    expect(screen.getByText(/Chưa có món nào/)).toBeInTheDocument()
  })

  it('ghi chú món: bấm icon → nhập → hiện chữ nghiêng trong dòng', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Ghi chú Trà sữa đào' }))
    const noteInput = screen.getByRole('textbox', { name: 'Ghi chú cho Trà sữa đào' })
    await user.type(noteInput, 'ít đá')
    expect(noteInput).toHaveValue('ít đá')
    expect(screen.getByText('ít đá')).toBeInTheDocument()
    expect(screen.getByTestId('bill-total')).toHaveTextContent('35.000 ₫')
  })

  it('topping: chỉ SP có link mới thấy topping; chọn → dòng con + tổng cộng dồn', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Chọn topping cho Trà sữa đào' }))

    expect(screen.getByRole('dialog', { name: 'Topping cho Trà sữa đào' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Topping Trân châu' }))
    expect(screen.getByRole('button', { name: 'Topping Trân châu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Đóng' }))

    const line = screen.getAllByTestId('bill-line')[0]
    expect(within(line).getByText(/\+ Trân châu 5\.000 ₫/)).toBeInTheDocument()
    expect(screen.getByTestId('bill-total')).toHaveTextContent('40.000 ₫')

    // SP không có link topping → modal báo rỗng
    await user.click(screen.getByRole('button', { name: 'Thêm Matcha sữa' }))
    await user.click(screen.getByRole('button', { name: 'Chọn topping cho Matcha sữa' }))
    expect(screen.getByText('Món này chưa có topping.')).toBeInTheDocument()
  })

  it('số món, SĐT/ghi chú đơn cập nhật theo bill', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Tăng Trà sữa đào' }))
    expect(screen.getByTestId('bill-count')).toHaveTextContent('2 món')

    const phone = screen.getByLabelText('SĐT / ghi chú đơn')
    await user.type(phone, '0909 123 456')
    expect(phone).toHaveValue('0909 123 456')
  })
})

describe('P6-T7 — thanh toán online', () => {
  it('bấm Thanh toán → RPC đúng menu_version/items → hiện mã, upload ảnh, reset giỏ', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    expect(screen.getByTestId('checkout-btn')).toBeEnabled()

    rpcMock.mockResolvedValueOnce({
      data: { code: 'HT-261003-0001', total: 35000, price_drift: false, duplicate: false },
      error: null,
    })
    await user.click(screen.getByTestId('checkout-btn'))

    await screen.findByText('Đã tạo bill HT-261003-0001.')
    expect(rpcMock).toHaveBeenCalledWith(
      'create_bill',
      expect.objectContaining({
        p_menu_version: 7,
        p_is_offline: false,
        p_items: [
          expect.objectContaining({ product_id: 'p1', qty: 1, name: 'Trà sữa đào', unit_price: 35000 }),
        ],
      }),
    )
    // ảnh upload đúng đường dẫn YYYY/MM/<code>.png (policy Storage)
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}\/\d{2}\/HT-261003-0001\.png$/),
      expect.any(Blob),
      { contentType: 'image/png', upsert: false },
    )
    expect(screen.getByTestId('bill-count')).toHaveTextContent('0 món')
    expect(screen.getByTestId('last-sale')).toHaveTextContent('HT-261003-0001')
    expect(await listPending()).toHaveLength(0) // online không đi outbox
  })

  it('lech menu_version → refresh menu + cảnh báo, KHÔNG tạo bill lần này', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'menu_version_changed' } })
    await user.click(screen.getByTestId('checkout-btn'))

    await screen.findByText('Giá vừa cập nhật — kiểm tra lại giỏ rồi thanh toán.')
    expect(syncMenu).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('bill-count')).toHaveTextContent('1 món') // giữ giỏ cho xem lại
    expect(uploadMock).not.toHaveBeenCalled()
  })
})

describe('P6-T7 — thanh toán offline', () => {
  it('mất mạng → mã OFF + PNG vào outbox pending, thông báo chờ đồng bộ', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    await user.click(screen.getByTestId('checkout-btn'))

    await screen.findByText(/Offline — bill HT-\d{6}-OFF-[A-Za-z0-9]{4} đã lưu/)
    expect(rpcMock).not.toHaveBeenCalled() // không gọi mạng khi offline

    const pending = await listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].status).toBe('pending')
    expect(pending[0].payload.is_offline).toBe(true)
    expect(pending[0].payload.offline_code).toMatch(/^HT-\d{6}-OFF-[A-Za-z0-9]{4}$/)
    expect(pending[0].png).toBeTruthy() // jsdom Blob không sống sót qua fake-indexeddb (browser thật có)
    expect(screen.getByTestId('bill-count')).toHaveTextContent('0 món')

    // quay lại online → event sync sẽ bắn (đây: gọi thẳng sync qua onOnline không test — outbox đã có đủ dữ liệu)
    expect(await testDb.outbox.count()).toBe(1)
  })
})

describe('P6-T2 — trạng thái dữ liệu', () => {
  it('chưa từng đồng bộ menu → thông báo, không crash', async () => {
    const db = new HemTraDB(`pos-empty-${Math.random().toString(16).slice(2)}`)
    setDbForTest(db)
    await db.menuCache.clear()
    render(<PosPage />)
    await waitFor(() =>
      expect(screen.getByText(/Chưa có menu/)).toBeInTheDocument(),
    )
    expect(screen.getByRole('complementary', { name: 'Hóa đơn' })).toBeInTheDocument()
  })
})
