// Unit test cho BillsPage — P7-T1 + P12-T10: bảng cột, phân trang, tìm theo mã,
// trạng thái rỗng/lỗi; staff KHÔNG có nút xóa, admin có nút "Xóa" → modal nhập
// mật khẩu admin → EF delete-bills (quyết định user 2026-10-04, design §4.1).
// Dùng fake BillsApi qua prop `api` (không đụng mạng). Modal ảnh bill (P7-T2)
// mock luôn module `downloadBlob` của POS để không đụng DOM download thật.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BillsPage from './BillsPage'
import { AuthProfileContext } from '../../app/authProfileContext'
import { downloadBlob } from '../pos/exportBillPng'
import type { BillsApi } from './api'
import type { BillListParams, BillPage, BillRow } from './logic'
import type { AccessProfile } from '../auth/accessGuard'

vi.mock('../pos/exportBillPng', () => ({
  downloadBlob: vi.fn(),
}))

function makeRow(overrides: Partial<BillRow> = {}): BillRow {
  return {
    id: 'bill-1',
    code: 'HT-261003-0001',
    total: 40000,
    created_at: '2026-10-03T07:05:00.000Z',
    username: 't7staff',
    itemCount: 3,
    imagePath: '2026/10/HT-261003-0001.png',
    // = created_at + 7 ngày — đủ xa để phân biệt với tag policy 15 ngày ở đầu trang
    expiresAt: '2026-10-10T07:05:00.000Z',
    ...overrides,
  }
}

const SIGNED_URL = 'https://tsnrggxczipzqvvpcbld.supabase.co/storage/v1/object/sign/bills/x.png?token=mock'

function fakeApi(overrides: Partial<BillsApi> = {}): BillsApi {
  return {
    list: vi.fn(async () => ({ rows: [makeRow()], total: 1 }) satisfies BillPage),
    signedImageUrl: vi.fn(async () => SIGNED_URL),
    deleteBill: vi.fn(async ({ id }: { id: string }) => ({ code: id })),
    ...overrides,
  }
}

/** Render với bối cảnh role (P12-T10): không truyền profile = không có admin. */
function renderWithRole(ui: React.ReactElement, profile: AccessProfile | null = null) {
  return render(<AuthProfileContext.Provider value={profile}>{ui}</AuthProfileContext.Provider>)
}

const ADMIN_PROFILE: AccessProfile = { role: 'admin', mustChangePassword: false }

function lastParams(api: BillsApi): BillListParams {
  const list = api.list as ReturnType<typeof vi.fn>
  return list.mock.calls[list.mock.calls.length - 1][0] as BillListParams
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('P7-T1 — bảng bill hiển thị đủ cột', () => {
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

    // Quét cả text lẫn aria-label: nút icon-only vẫn có accessible name.
    const names = screen.getAllByRole('button').map((button) =>
      [button.textContent ?? '', button.getAttribute('aria-label') ?? ''].join(' '),
    )
    expect(names.some((name) => /x[oó]a/i.test(name))).toBe(false)
    expect(screen.queryByRole('button', { name: /x[oó]a/i })).not.toBeInTheDocument()
  })
})

describe('P7-T4 — tag "tự xóa sau N ngày"', () => {
  it('tag chính sách 15 ngày ở đầu trang + tag đếm ngược theo expires_at ở từng dòng', async () => {
    render(<BillsPage api={fakeApi()} />)

    expect(await screen.findByText('HT-261003-0001')).toBeInTheDocument()
    // Tag policy: lấy từ BILL_RETENTION_DAYS (không hardcode 15 ở JSX)
    expect(screen.getByTestId('retention-policy-tag')).toHaveTextContent('Tự xóa sau 15 ngày')
    // Dòng dữ liệu: ngày còn lại phụ thuộc thời điểm chạy test → chỉ so định dạng
    const row = screen.getByRole('row', { name: /HT-261003-0001/ })
    expect(row).toHaveTextContent(/Tự xóa (hôm nay|sau \d+ ngày)/)
    expect(screen.getByRole('columnheader', { name: 'Tự dọn' })).toBeInTheDocument()
  })

  it('thiếu/khỏe cột expires_at → tag "—", không hiện NaN', async () => {
    const api = fakeApi({
      list: vi.fn(async () => ({
        rows: [makeRow({ expiresAt: '' })],
        total: 1,
      })),
    })
    render(<BillsPage api={api} />)

    const row = await screen.findByRole('row', { name: /HT-261003-0001/ })
    expect(row).toHaveTextContent('—')
    expect(row).not.toHaveTextContent('NaN')
  })

  it('bill đã quá hạn → "Tự xóa hôm nay"', async () => {
    const api = fakeApi({
      list: vi.fn(async () => ({
        rows: [makeRow({ expiresAt: '2020-01-01T00:00:00.000Z' })],
        total: 1,
      })),
    })
    render(<BillsPage api={api} />)

    const row = await screen.findByRole('row', { name: /HT-261003-0001/ })
    expect(row).toHaveTextContent('Tự xóa hôm nay')
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
    const api: BillsApi = {
      list,
      signedImageUrl: vi.fn(async () => SIGNED_URL),
      deleteBill: vi.fn(async () => ({ code: 'HT-261003-0001' })),
    }
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
})

describe('P7-T2 — modal xem ảnh bill qua signed URL', () => {
  it('bấm "Xem Bill" → hiện dialog đúng mã, ảnh lấy từ signed URL', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    render(<BillsPage api={api} />)
    await screen.findByText('HT-261003-0001')

    await user.click(screen.getByRole('button', { name: 'Xem bill HT-261003-0001' }))

    const dialog = await screen.findByRole('dialog', { name: 'Bill HT-261003-0001' })
    expect(api.signedImageUrl).toHaveBeenCalledWith('2026/10/HT-261003-0001.png')
    expect(await screen.findByRole('img', { name: 'Ảnh bill HT-261003-0001' })).toHaveAttribute(
      'src',
      SIGNED_URL,
    )
    expect(dialog).toBeInTheDocument()
  })

  it('signed URL thất bại → hiện lỗi tiếng Việt, bấm "Thử lại" gọi lại', async () => {
    const signedImageUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error('Lỗi máy chủ, thử lại sau.'))
      .mockResolvedValueOnce(SIGNED_URL)
    const api = fakeApi({ signedImageUrl })
    const user = userEvent.setup()
    render(<BillsPage api={api} />)
    await screen.findByText('HT-261003-0001')

    await user.click(screen.getByRole('button', { name: 'Xem bill HT-261003-0001' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được ảnh bill.')
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('img', { name: 'Ảnh bill HT-261003-0001' })).toBeInTheDocument()
    expect(signedImageUrl).toHaveBeenCalledTimes(2)
  })

  it('bill chưa có ảnh → không có nút xem, hiện "Chưa có ảnh"', async () => {
    const api = fakeApi({
      list: vi.fn(async () => ({ rows: [makeRow({ imagePath: '' })], total: 1 })),
    })
    render(<BillsPage api={api} />)
    await screen.findByText('HT-261003-0001')

    expect(screen.getByText('Chưa có ảnh')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xem bill HT-261003-0001' })).not.toBeInTheDocument()
  })

  it('Tải về → lấy blob qua signed URL mới, tải <code>.png, hiện thông báo', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(['png']) }) as unknown as Response),
    )
    render(<BillsPage api={api} />)
    await screen.findByText('HT-261003-0001')
    await user.click(screen.getByRole('button', { name: 'Xem bill HT-261003-0001' }))
    await screen.findByRole('img', { name: 'Ảnh bill HT-261003-0001' })

    await user.click(screen.getByRole('button', { name: 'Tải về' }))

    await waitFor(() =>
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'HT-261003-0001.png'),
    )
    const dialog = screen.getByRole('dialog', { name: 'Bill HT-261003-0001' })
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Đã lưu HT-261003-0001.png về máy.',
    )
    vi.unstubAllGlobals()
  })

  it('Web Share không hỗ trợ file → hiện hướng dẫn "dùng Tải về", không lỗi', async () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => false), configurable: true })
    const api = fakeApi()
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(['png']) }) as unknown as Response),
    )
    render(<BillsPage api={api} />)
    await screen.findByText('HT-261003-0001')
    await user.click(screen.getByRole('button', { name: 'Xem bill HT-261003-0001' }))
    await screen.findByRole('img', { name: 'Ảnh bill HT-261003-0001' })

    await user.click(screen.getByRole('button', { name: 'Chia sẻ lại' }))

    const dialog = screen.getByRole('dialog', { name: 'Bill HT-261003-0001' })
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Thiết bị không chia sẻ được ảnh — dùng Tải về.',
    )
    expect(navigator.share).not.toHaveBeenCalled()
    Reflect.deleteProperty(navigator, 'share')
    Reflect.deleteProperty(navigator, 'canShare')
    vi.unstubAllGlobals()
  })
})

describe('P12-T10 — nút "Xóa bill" của admin + xác nhận mật khẩu', () => {
  it('staff (không role admin) → không thấy nút Xóa, header báo chỉ đọc', async () => {
    const api = fakeApi()
    renderWithRole(<BillsPage api={api} />, { role: 'staff', mustChangePassword: false })
    await screen.findByText('HT-261003-0001')

    expect(screen.queryByRole('button', { name: 'Xóa bill HT-261003-0001' })).not.toBeInTheDocument()
    expect(screen.getByText('Bill chỉ đọc — không có thao tác xóa.')).toBeInTheDocument()
    expect(api.deleteBill).not.toHaveBeenCalled()
  })

  it('admin → có nút Xóa; chưa nhập mật khẩu thì nút Xóa vĩnh viễn bị khóa', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    renderWithRole(<BillsPage api={api} />, ADMIN_PROFILE)
    await screen.findByText('HT-261003-0001')

    await user.click(screen.getByRole('button', { name: 'Xóa bill HT-261003-0001' }))
    expect(await screen.findByRole('dialog', { name: 'Xóa bill HT-261003-0001' })).toBeInTheDocument()
    expect(screen.getByTestId('confirm-delete-bill')).toBeDisabled()

    await user.type(screen.getByTestId('delete-bill-password'), 'mat-khau-admin')
    expect(screen.getByTestId('delete-bill-password')).toHaveValue('mat-khau-admin')
    expect(screen.getByTestId('confirm-delete-bill')).toBeEnabled()

    await user.click(screen.getByTestId('confirm-delete-bill'))
    await waitFor(() =>
      expect(api.deleteBill).toHaveBeenCalledWith({
        id: 'bill-1',
        password: 'mat-khau-admin',
      }),
    )
    expect(await screen.findByText(/Đã xóa bill HT-261003-0001/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Xóa bill HT-261003-0001' })).not.toBeInTheDocument()
  })

  it('sai mật khẩu → hiện lỗi từ EF, giữ modal để nhập lại', async () => {
    const api = fakeApi({
      deleteBill: vi.fn(async () => {
        throw new Error('Mật khẩu admin không đúng')
      }),
    })
    const user = userEvent.setup()
    renderWithRole(<BillsPage api={api} />, ADMIN_PROFILE)
    await screen.findByText('HT-261003-0001')

    await user.click(screen.getByRole('button', { name: 'Xóa bill HT-261003-0001' }))
    await user.type(screen.getByTestId('delete-bill-password'), 'sai-mat-khau')
    await user.click(screen.getByTestId('confirm-delete-bill'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu admin không đúng')
    expect(screen.getByRole('dialog', { name: 'Xóa bill HT-261003-0001' })).toBeInTheDocument()
    expect(screen.getByTestId('confirm-delete-bill')).toBeEnabled()
  })

  it('không còn ô "Từ ngày"/"Đến ngày" và nút "Đặt lại" (P12-T10)', async () => {
    render(<BillsPage api={fakeApi()} />)
    await screen.findByText('HT-261003-0001')

    expect(screen.queryByLabelText('Từ ngày')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Đến ngày')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đặt lại' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xem ảnh HT-261003-0001' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xem bill HT-261003-0001' })).toBeInTheDocument()
  })
})
