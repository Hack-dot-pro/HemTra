// Unit test cho ProductsPage (P5-T1/T4) — trang chưa từng có test: bù phần
// e2e không bao phủ (sắp xếp ↑/↓, ẩn nhóm có xác nhận, đường lỗi của
// moveCategory). Dùng fake ProductsApi qua prop `api` (không đụng mạng).

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProductsPage from './ProductsPage'
import type { ProductLists, ProductsApi } from './api'

function makeLists(): ProductLists {
  return {
    categories: [
      { id: 'c1', name: 'Trà sữa', icon: '🧋', sort_order: 1, is_active: true },
      { id: 'c2', name: 'Trà trái cây', icon: '🍑', sort_order: 2, is_active: true },
    ],
    products: [{ id: 'p1', category_id: 'c1', name: 'Trà đào', price: 35000, icon: '', is_active: true }],
    toppings: [{ id: 't1', name: 'Trân châu', price: 5000, icon: '', is_active: true }],
    links: [],
  }
}

function fakeApi(overrides: Partial<ProductsApi> = {}): ProductsApi {
  return {
    load: vi.fn(async () => makeLists()),
    saveCategory: vi.fn(async () => ({ ok: true as const })),
    saveProduct: vi.fn(async () => ({ ok: true as const })),
    saveTopping: vi.fn(async () => ({ ok: true as const })),
    setActive: vi.fn(async () => ({ ok: true as const })),
    remove: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  }
}

async function openCategoryTab(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('tab', { name: 'Nhóm' })
  await user.click(screen.getByRole('tab', { name: 'Nhóm' }))
  await screen.findByText('Trà trái cây')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('P5-T1 — sắp xếp nhóm bằng ↑/↓', () => {
  it('bấm "Xuống" hoán đổi sort_order của 2 nhóm kề nhau', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    render(<ProductsPage api={api} />)
    await openCategoryTab(user)

    await user.click(screen.getByRole('button', { name: 'Xuống Trà sữa' }))

    await waitFor(() => expect(api.saveCategory).toHaveBeenCalledTimes(2))
    expect(api.saveCategory).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'c1', sort_order: 2 }),
    )
    expect(api.saveCategory).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'c2', sort_order: 1 }),
    )
  })

  it('biên: nhóm đầu không có nút "Lên", nhóm cuối không có nút "Xuống"', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    render(<ProductsPage api={api} />)
    await openCategoryTab(user)

    expect(screen.getByRole('button', { name: 'Lên Trà sữa' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xuống Trà trái cây' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xuống Trà sữa' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Lên Trà trái cây' })).toBeEnabled()
  })

  it('lần lưu thứ nhất thất bại → hiện lỗi tiếng Việt, không gọi lần thứ hai', async () => {
    const api = fakeApi({
      saveCategory: vi.fn(async () => ({
        ok: false as const,
        message: 'Không thể kết nối máy chủ, thử lại sau.',
      })),
    })
    const user = userEvent.setup()
    render(<ProductsPage api={api} />)
    await openCategoryTab(user)

    await user.click(screen.getByRole('button', { name: 'Xuống Trà sữa' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể kết nối máy chủ, thử lại sau.',
    )
    expect(api.saveCategory).toHaveBeenCalledTimes(1)
  })
})

describe('P5-T1/T4 — ẩn nhóm luôn qua xác nhận', () => {
  it('bấm "Ẩn" → hộp xác nhận hiện ra, xác nhận mới gọi setActive', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    render(<ProductsPage api={api} />)
    await openCategoryTab(user)

    await user.click(screen.getByRole('button', { name: /Ẩn Trà sữa/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Ẩn khỏi menu bán?' })
    expect(dialog).toHaveTextContent('không hiển thị ở Thanh toán')
    expect(api.setActive).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Ẩn' }))
    await waitFor(() =>
      expect(api.setActive).toHaveBeenCalledWith('category', 'c1', false),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Đã ẩn khỏi menu bán.')
  })

  it('hủy xác nhận → không gọi api, giữ nguyên trạng thái', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    render(<ProductsPage api={api} />)
    await openCategoryTab(user)

    await user.click(screen.getByRole('button', { name: /Ẩn Trà sữa/ }))
    await screen.findByRole('dialog', { name: 'Ẩn khỏi menu bán?' })
    await user.click(screen.getByRole('button', { name: 'Hủy' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.setActive).not.toHaveBeenCalled()
  })
})
