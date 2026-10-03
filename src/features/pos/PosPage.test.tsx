// Unit test PosPage — P6-T2/T3 (grid + panel bill). Dùng menu cache THẬT
// trong fake-indexeddb (đúng đường data thật: useMenuSnapshot → readCachedMenu),
// không mock network, không mock logic.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PosPage from './PosPage'
import { HemTraDB, setDbForTest } from '../../lib/db'
import { writeCachedMenu } from '../../lib/menuSync'
import type { MenuSnapshot } from '../../lib/menuTypes'

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
  const db = new HemTraDB(`pos-test-${Math.random().toString(16).slice(2)}`)
  setDbForTest(db)
  await writeCachedMenu(menuFixture(), db)
})

afterEach(() => {
  cleanup()
  setDbForTest(null)
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
