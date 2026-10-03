// Unit test cho BillsPage — P7-T1: bảng 5 cột, phân trang, lọc ngày, tìm theo
// mã, trạng thái rỗng/lỗi và KHÔNG có nút xóa (design §4.1 — AGENT.md §11.4).
// Dùng fake BillsApi qua prop `api` (không đụng mạng).

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BillsPage from './BillsPage'
import type { BillsApi } from './api'
import type { BillListParams, BillPage, BillRow } from './logic'

function makeRow(overrides: Partial<BillRow> = {}): BillRow {
  return {
    id: 'bill-1',
    code: 'HT-261003-0001',
    total: 40000,
    created_at: '2026-10-03T07:05:00.000Z',
    username: 't7staff',
    itemCount: 3,
    ...overrides,
  }
}

function fakeApi(overrides: Partial<BillsApi> = {}): BillsApi {
  return {
    list: vi.fn(async () => ({ rows: [makeRow()], total: 1 }) satisfies BillPage),
    ...overrides,
  }
}

function lastParams(api: BillsApi): BillListParams {
  const list = api.list as ReturnType<typeof vi.fn>
  return list.mock.calls[list.mock.calls.length - 1][0] as BillListParams
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('P7-T1 — bảng bill hiển thị đúng 5 cột', () => {
  it('in mã, thời gian giờ VN, người tạo, tổng, số món', async () => {
    render(<BillsPage api={fakeApi()} />)

    expect(await screen.findByText('HT-261003-0001')).toBeInTheDocument()
    expect(screen.getByText('t7staff')).toBeInTheDocument()
    expect(screen.getByText('40.000 ₫')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    // 07:05Z = 14:05 giờ VN
    expect(screen.getByText('14:05 03/10/2026')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Mã bill' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Số món' })).toBeInTheDocument()
  })

  it('người tạo đã bị xóa (username null) → hiển thị "—"', async () => {
    const api = fakeApi({ list: vi.fn(async () => ({ rows: [makeRow({ username: null })], total: 1 })) })
    render(<BillsPage api={api} />)

    const table = await screen.findByRole('region', { name: 'Danh sách bill' })
    expect(table).toHaveTextContent('—')
  })

  it('không có nút xóa ở bất kỳ role nào (design §4.1)', async () => {
    render(<BillsPage api={fakeApi()} />)
    await screen.findByText('HT-261003-0001')

    const labels = screen.getAllByRole('button').map((button) => button.textContent ?? '')
    expect(labels.some((label) => /x[oó]a/i.test(label))).toBe(false)
  })
})

describe('P7-T1 — trạng thái rỗng và lỗi', () => {
  it('0 bill → "Chưa có bill nào."', async () => {
    const api = fakeApi({ list: vi.fn(async () => ({ rows: [], total: 0 })) })
    render(<BillsPage api={api} />)

    expect(await screen.findByText('Chưa có bill nào.')).toBeInTheDocument()
  })

  it('tải lỗi → hiện thông báo tiếng Việt, bấm "Thử lại" gọi lại api', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('Không thể kết nối máy chủ, thử lại sau.'))
      .mockResolvedValueOnce({ rows: [makeRow()], total: 1 })
    const api: BillsApi = { list }
    render(<BillsPage api={api} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Không thể kết nối máy chủ, thử lại sau.')

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByText('HT-261003-0001')).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })
})

describe('P7-T1 — tìm theo mã', () => {
  it('bấm Tìm → gọi api với mã đã gõ, reset về trang đầu', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    render(<BillsPage api={api} />)
    await screen.findByText('HT-261003-0001')

    await user.type(screen.getByRole('searchbox'), 'HT-26100')
    await user.click(screen.getByRole('button', { name: 'Tìm' }))

    await waitFor(() => expect(lastParams(api).code).toBe('HT-26100'))
    expect(lastParams(api).page).toBe(0)
  })

  it('bấm Đặt lại → bỏ bộ lọc, gọi lại với mã rỗng', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    render(<BillsPage api={api} />)
    await screen.findByText('HT-261003-0001')

    await user.type(screen.getByRole('searchbox'), 'HT-26100')
    await user.click(screen.getByRole('button', { name: 'Tìm' }))
    await waitFor(() => expect(lastParams(api).code).toBe('HT-26100'))

    await user.click(screen.getByRole('button', { name: 'Đặt lại' }))

    await waitFor(() => expect(lastParams(api).code).toBe(''))
    expect(lastParams(api).page).toBe(0)
  })
})

describe('P7-T1 — lọc theo ngày', () => {
  it('chọn 2 ngày → gửi ISO đầu/cuối ngày theo giờ VN', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    render(<BillsPage api={api} />)
    await screen.findByText('HT-261003-0001')

    await user.type(screen.getByLabelText('Từ ngày'), '2026-10-01')
    await user.type(screen.getByLabelText('Đến ngày'), '2026-10-03')

    await waitFor(() =>
      expect(lastParams(api)).toMatchObject({
        from: '2026-10-01',
        to: '2026-10-03',
      }),
    )
    expect(lastParams(api).page).toBe(0)
  })

  it('từ > đến → hiện cảnh báo, không gọi api lần nữa', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    render(<BillsPage api={api} />)
    await screen.findByText('HT-261003-0001')

    await user.type(screen.getByLabelText('Từ ngày'), '2026-10-03')
    await waitFor(() => expect((api.list as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2))
    const callsWithValidFrom = (api.list as ReturnType<typeof vi.fn>).mock.calls.length

    await user.type(screen.getByLabelText('Đến ngày'), '2026-10-01')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
    )
    expect((api.list as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsWithValidFrom)
  })
})

describe('P7-T1 — phân trang', () => {
  it('nhiều trang → Trước bị khóa ở trang đầu, bấm Sau sang trang 2', async () => {
    const api = fakeApi({
      list: vi.fn(async ({ page }: BillListParams) => ({
        rows: [makeRow({ id: `bill-${page}`, code: `HT-261003-000${page + 1}` })],
        total: 40,
      })),
    })
    const user = userEvent.setup()
    render(<BillsPage api={api} />)

    expect(await screen.findByText('HT-261003-0001')).toBeInTheDocument()
    expect(screen.getByText('Trang 1/2 · 40 bill · 20 dòng/trang')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Sau' }))

    expect(await screen.findByText('HT-261003-0002')).toBeInTheDocument()
    expect(screen.getByText('Trang 2/2 · 40 bill · 20 dòng/trang')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trước' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled()
    expect(lastParams(api).page).toBe(1)
  })

  it('đổi ngày lọc → lùi về trang đầu để không kẹt trên trang 2 với dữ liệu mới', async () => {
    const api = fakeApi({ list: vi.fn(async () => ({ rows: [makeRow()], total: 40 })) })
    const user = userEvent.setup()
    render(<BillsPage api={api} />)
    await screen.findByText('HT-261003-0001')

    await user.click(screen.getByRole('button', { name: 'Sau' }))
    await waitFor(() => expect(lastParams(api).page).toBe(1))

    await user.type(screen.getByLabelText('Từ ngày'), '2026-10-03')

    await waitFor(() => expect(lastParams(api).page).toBe(0))
  })
})
