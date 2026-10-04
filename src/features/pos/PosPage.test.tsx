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
import { billNodeToPngDataUrl, downloadBlob } from './exportBillPng'
import type { MenuSnapshot } from '../../lib/menuTypes'

const { rpcMock, uploadMock, linkMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  uploadMock: vi.fn(),
  linkMock: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (fn: string, ...args: unknown[]) =>
      // gắn ảnh bill (P7-T2/NV5) do createBillUploader gọi — không phải RPC nghiệp vụ
      fn === 'set_bill_image' ? linkMock(fn, ...args) : rpcMock(fn, ...args),
    storage: { from: () => ({ upload: (...args: unknown[]) => uploadMock(...args) }) },
  }),
}))

vi.mock('../../lib/menuSync', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/menuSync')>()
  return { ...mod, syncMenu: vi.fn(async () => null) }
})

vi.mock('./exportBillPng', () => ({
  billNodeToPngDataUrl: vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo='),
  downloadBlob: vi.fn(),
  isSafariCapture: () => false,
  preloadBillPngLib: vi.fn(async () => undefined),
  warmBillImage: vi.fn(async () => 'data:image/png;base64,AA=='),
  pngDataUrlSize: vi.fn(() => ({ width: 2160, height: 3600 })), // 720 × 3 — P12-T8
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
  linkMock.mockReset().mockResolvedValue({ data: true, error: null })
  vi.mocked(syncMenu).mockClear()
  testDb = new HemTraDB(`pos-test-${Math.random().toString(16).slice(2)}`)
  setDbForTest(testDb)
  await writeCachedMenu(menuFixture(), testDb)
})

afterEach(() => {
  cleanup()
  setDbForTest(null)
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
})

async function renderPos() {
  const user = userEvent.setup()
  render(<PosPage />)
  await screen.findByRole('button', { name: 'Thêm Trà sữa đào' })
  return user
}

// QC-017 (qc-test round 3): đọc Σ cột "Thành tiền" của MỌI dòng tbody (gồm dòng
// topping con) và ô "Tổng cộng" ngay lúc chụp PNG — dùng cho cả nhánh online
// lẫn offline để không còn đường in bill Σ ≠ Tổng cộng.
type Captured = { lineSum: number; total: number }
let captured: Captured | null = null

beforeEach(() => {
  captured = null
})

function captureSheetOnce(): void {
  vi.mocked(billNodeToPngDataUrl).mockImplementationOnce(async () => {
    const sheetEl = document.querySelector('[data-testid="bill-sheet"]')
    if (sheetEl) {
      const rows = Array.from(sheetEl.querySelectorAll('tbody tr'))
      const lineSum = rows.reduce((sum, tr) => {
        const tds = tr.querySelectorAll('td')
        const last = tds[tds.length - 1]
        return sum + Number((last?.textContent ?? '0').replace(/[^0-9]/g, ''))
      }, 0)
      const totalBox = Array.from(sheetEl.querySelectorAll('div')).find((d) =>
        (d.textContent ?? '').trim().startsWith('Tổng cộng'),
      )
      const totalText = totalBox?.querySelectorAll('span')[1]?.textContent ?? '0'
      captured = { lineSum, total: Number(totalText.replace(/[^0-9]/g, '')) }
    }
    return 'data:image/png;base64,iVBORw0KGgo='
  })
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

  it('số món, ghi chú đơn cập nhật theo bill (P12-T6: bỏ gợi ý SĐT)', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Tăng Trà sữa đào' }))
    expect(screen.getByTestId('bill-count')).toHaveTextContent('2 món')

    const phone = screen.getByLabelText('Ghi chú đơn')
    expect(phone).not.toHaveAttribute('placeholder')
    await user.type(phone, '0909 123 456')
    expect(phone).toHaveValue('0909 123 456')
  })

  it('P12-T6: không còn nhãn "Menu v{n}" trên đầu POS', async () => {
    await renderPos()
    expect(screen.queryByText(/Menu v\d+/)).not.toBeInTheDocument()
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
    // P7-T2/NV5: upload xong phải gắn image_path qua RPC set_bill_image
    // (nếu không gọi → bảng Quản lý bill không hiện nút "Xem ảnh")
    expect(linkMock).toHaveBeenCalledTimes(1)
    expect(linkMock).toHaveBeenCalledWith('set_bill_image', {
      p_code: 'HT-261003-0001',
      p_path: expect.stringMatching(/^\d{4}\/\d{2}\/HT-261003-0001\.png$/),
    })
    expect(screen.getByTestId('bill-count')).toHaveTextContent('0 món')
    expect(screen.getByTestId('last-sale')).toHaveTextContent('HT-261003-0001')
    expect(await listPending()).toHaveLength(0) // online không đi outbox
  })

  it('QC-013: menu bump giá khi giỏ đang mở → chặn thanh toán, không gọi RPC, giữ giỏ', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))

    // menu v8 về : giá mới 40.000 (realtime ghi cache) — giỏ vẫn giữ 35.000
    const bumped = menuFixture()
    bumped.menu_version = 8
    bumped.products[0].price = 40000
    await writeCachedMenu(bumped, testDb)
    await waitFor(() => expect(screen.getByText(/40\.000\s₫/)).toBeInTheDocument())

    await user.click(screen.getByTestId('checkout-btn'))
    await screen.findByText('Giá vừa cập nhật: Trà sữa đào — kiểm tra lại giỏ rồi thanh toán.')
    expect(rpcMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('bill-count')).toHaveTextContent('1 món') // giữ giỏ cho xem lại
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

describe('QC-013 (b)/(c) — bill in ra đúng tiền + cờ price_drift khi online', () => {
  async function addTwoMilkTeaWithTopping(user: Awaited<ReturnType<typeof renderPos>>) {
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Tăng Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Chọn topping cho Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Topping Trân châu' }))
    await user.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(screen.getByTestId('bill-total')).toHaveTextContent('80.000 ₫')
  }

  it('QC-013(b): thanh toán online không lệch → bill in Σ dòng tiền = tổng cộng', async () => {
    const user = await renderPos()
    await addTwoMilkTeaWithTopping(user)

    captureSheetOnce()
    rpcMock.mockResolvedValueOnce({
      data: { code: 'HT-261003-0001', total: 80000, price_drift: false, duplicate: false },
      error: null,
    })
    await user.click(screen.getByTestId('checkout-btn'))
    await screen.findByText('Đã tạo bill HT-261003-0001.')

    expect(captured).not.toBeNull()
    expect(captured?.lineSum).toBe(80000)
    expect(captured?.total).toBe(80000)
    expect(captured?.lineSum).toBe(captured?.total)
  })

  it('QC-013(c): RPC trả price_drift=true → cảnh báo "giá tại quầy khác", vẫn ghi nhận bill', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))

    captureSheetOnce()
    rpcMock.mockResolvedValueOnce({
      data: { code: 'HT-261003-0001', total: 35000, price_drift: true, duplicate: false },
      error: null,
    })
    await user.click(screen.getByTestId('checkout-btn'))

    const msg = await screen.findByText(
      'Đã tạo bill HT-261003-0001 — giá tại quầy khác giá hiển thị (đã ghi nhận).',
    )
    expect(msg).toHaveClass('border-amber-300/40')
    expect(msg).toHaveAttribute('role', 'status')
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(captured).not.toBeNull() // không được "pass im lặng" khi bill không in
    expect(captured?.lineSum).toBe(35000)
    expect(captured?.total).toBe(35000)
    expect(captured?.lineSum).toBe(captured?.total)
  })

  it('QC-017: RPC trả tổng khác giỏ mà menu không tải lại được → KHÔNG chụp PNG, vẫn ghi nhận bill', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))

    captureSheetOnce()
    rpcMock.mockResolvedValueOnce({
      data: { code: 'HT-261003-0001', total: 40000, price_drift: false, duplicate: false },
      error: null,
    })
    await user.click(screen.getByTestId('checkout-btn'))

    // syncMenu là mock không đổi cache → giá vẫn 35.000 ≠ 40.000 → không in
    await screen.findByText(
      'Đã tạo bill HT-261003-0001 — tổng server 40.000 ₫ khác giỏ: chưa xuất ảnh bill, kiểm tra giỏ rồi bán lại.',
    )
    expect(rpcMock).toHaveBeenCalledWith(
      'create_bill',
      expect.objectContaining({ p_menu_version: 7, p_is_offline: false }),
    )
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(captured).toBeNull() // không render BillSheet để chụp
    expect(billNodeToPngDataUrl).not.toHaveBeenCalled()
    expect(uploadMock).not.toHaveBeenCalled()
    expect(screen.getByText('Ảnh bill chưa xuất được — bill vẫn đã ghi nhận.')).toBeInTheDocument()
    expect(screen.getByTestId('bill-count')).toHaveTextContent('0 món') // bill đã tạo → dọn giỏ
  })

  it('QC-017: menu tải lại được giá mới → định lại giá dòng, in Σ dòng = tổng server', async () => {
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))

    vi.mocked(syncMenu).mockImplementationOnce(async () => {
      await writeCachedMenu(
        {
          ...menuFixture(),
          menu_version: 8,
          products: menuFixture().products.map((p) =>
            p.id === 'p1' ? { ...p, price: 40000 } : p,
          ),
        },
        testDb,
      )
      return { status: 'ok', refreshed: true, menuVersion: 8, fetchedAt: Date.now() }
    })
    captureSheetOnce()
    rpcMock.mockResolvedValueOnce({
      data: { code: 'HT-261003-0001', total: 40000, price_drift: false, duplicate: false },
      error: null,
    })
    await user.click(screen.getByTestId('checkout-btn'))

    await screen.findByText(
      'Đã tạo bill HT-261003-0001 — giá vừa đổi, ảnh in theo tổng server 40.000 ₫.',
    )
    expect(captured).not.toBeNull()
    expect(captured?.lineSum).toBe(40000)
    expect(captured?.total).toBe(40000)
    expect(captured?.lineSum).toBe(captured?.total)
    expect(uploadMock).toHaveBeenCalledTimes(1)
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
    expect(pending[0].png).toMatch(/^data:image\/png;base64,/) // data URL (WebKit IDB không nhận blob)
    expect(screen.getByTestId('bill-count')).toHaveTextContent('0 món')

    // quay lại online → event sync sẽ bắn (đây: gọi thẳng sync qua onOnline không test — outbox đã có đủ dữ liệu)
    expect(await testDb.outbox.count()).toBe(1)
  })

  it('QC-017 (regression): offline in bill Σ dòng tiền = Tổng cộng (giá snapshot, không lệch)', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const user = await renderPos()
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Tăng Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Chọn topping cho Trà sữa đào' }))
    await user.click(screen.getByRole('button', { name: 'Topping Trân châu' }))
    await user.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(screen.getByTestId('bill-total')).toHaveTextContent('80.000 ₫')

    captureSheetOnce()
    await user.click(screen.getByTestId('checkout-btn'))
    await screen.findByText(/Offline — bill HT-\d{6}-OFF-[A-Za-z0-9]{4} đã lưu/)

    expect(captured).not.toBeNull()
    expect(captured?.lineSum).toBe(80000)
    expect(captured?.total).toBe(80000)
    expect(captured?.lineSum).toBe(captured?.total)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('P6-T8 — chia sẻ / lưu PNG', () => {
  function stubWebShare(share: unknown, canShare: unknown) {
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true })
  }

  async function checkoutOne(user: Awaited<ReturnType<typeof renderPos>>) {
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    rpcMock.mockResolvedValueOnce({
      data: { code: 'HT-261003-0001', total: 35000, price_drift: false, duplicate: false },
      error: null,
    })
    await user.click(screen.getByTestId('checkout-btn'))
    await screen.findByTestId('last-sale')
  }

  it('Web Share hỗ trợ → nút Chia sẻ share file PNG đúng tên', async () => {
    const share = vi.fn(async () => undefined)
    const canShare = vi.fn(() => true)
    stubWebShare(share, canShare)
    const user = await renderPos()
    await checkoutOne(user)

    await user.click(screen.getByTestId('share-btn'))
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Bill HT-261003-0001 — Hẻm Trà',
        files: [expect.objectContaining({ name: 'HT-261003-0001.png' })],
      }),
    )
  })

  it('không hỗ trợ Web Share → ẩn nút Chia sẻ, Lưu về máy vẫn dùng được', async () => {
    stubWebShare(undefined, undefined)
    const user = await renderPos()
    await checkoutOne(user)

    expect(screen.queryByTestId('share-btn')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('save-btn'))
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'HT-261003-0001.png')
    expect(screen.getByTestId('checkout-msg')).toHaveTextContent('Đã lưu HT-261003-0001.png')
  })

  it('người dùng đóng bảng chia sẻ (AbortError) → im lặng, không hiện lỗi', async () => {
    const abort = new DOMException('canceled', 'AbortError')
    stubWebShare(vi.fn(async () => Promise.reject(abort)), vi.fn(() => true))
    const user = await renderPos()
    await checkoutOne(user)

    await user.click(screen.getByTestId('share-btn'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('P12-T8 — preview ảnh bill 2K sau thanh toán', () => {
  async function checkoutOne(user: Awaited<ReturnType<typeof renderPos>>) {
    await user.click(screen.getByRole('button', { name: 'Thêm Trà sữa đào' }))
    rpcMock.mockResolvedValueOnce({
      data: { code: 'HT-261003-0001', total: 35000, price_drift: false, duplicate: false },
      error: null,
    })
    await user.click(screen.getByTestId('checkout-btn'))
    await screen.findByTestId('bill-preview')
  }

  it('thanh toán xong → hiện modal preview ảnh PNG ≥ 2048px', async () => {
    const user = await renderPos()
    await checkoutOne(user)

    const img = screen.getByTestId('bill-preview-img')
    expect(img).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=')
    expect(screen.getByTestId('bill-preview-size')).toHaveTextContent('2160')
    expect(screen.getByTestId('bill-preview-size')).toHaveTextContent('2K')
    // modal rộng (max-w-3xl) — preview 2K không bị bóp trong max-w-md
    expect(screen.getByRole('dialog').className).toContain('max-w-3xl')
  })

  it('modal có nút Chia sẻ / Lưu về máy / Đóng (Web Share khả dụng)', async () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn(async () => undefined), configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true })
    const user = await renderPos()
    await checkoutOne(user)

    expect(screen.getByTestId('preview-share-btn')).toBeInTheDocument()
    await user.click(screen.getByTestId('preview-save-btn'))
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'HT-261003-0001.png')

    await user.click(screen.getByTestId('preview-close-btn'))
    expect(screen.queryByTestId('bill-preview')).not.toBeInTheDocument()
    // vẫn còn nút "Xem bill" ở cột phải để mở lại preview
    expect(screen.getByTestId('view-bill-btn')).toBeInTheDocument()
    await user.click(screen.getByTestId('view-bill-btn'))
    expect(screen.getByTestId('bill-preview')).toBeInTheDocument()
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
