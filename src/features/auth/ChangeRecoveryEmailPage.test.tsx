import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChangeRecoveryEmailPage from './ChangeRecoveryEmailPage.tsx'
import type { ChangeRecoveryEmailApi, ChangeRecoveryResult } from './changeRecoveryEmailApi'
import type { AccessProfile } from './accessGuard'
import { AuthProfileContext } from '../../app/authProfileContext'

const { endAuthSession } = vi.hoisted(() => ({ endAuthSession: vi.fn(async () => {}) }))

vi.mock('../../lib/session', () => ({ endAuthSession }))

function fakeApi(overrides: Partial<ChangeRecoveryEmailApi> = {}): ChangeRecoveryEmailApi {
  return {
    requestCurrent: vi.fn(async (): Promise<ChangeRecoveryResult> => ({ ok: true, message: '' })),
    requestNew: vi.fn(async (): Promise<ChangeRecoveryResult> => ({ ok: true, message: '' })),
    complete: vi.fn(async (): Promise<ChangeRecoveryResult> => ({
      ok: true,
      message: 'Đã đổi email khôi phục. Hãy đăng nhập bằng mật khẩu mới.',
    })),
    ...overrides,
  }
}

const ADMIN: AccessProfile = { role: 'admin', mustChangePassword: false }
const STAFF: AccessProfile = { role: 'staff', mustChangePassword: false }

function renderPage(api: ChangeRecoveryEmailApi, profile: AccessProfile | null = ADMIN) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/change-recovery-email' }]}>
      <AuthProfileContext.Provider value={profile}>
        <Routes>
          <Route path="/change-recovery-email" element={<ChangeRecoveryEmailPage api={api} />} />
          <Route path="/login" element={<div>LOGIN SCREEN</div>} />
          <Route path="/dashboard" element={<div>DASHBOARD SCREEN</div>} />
        </Routes>
      </AuthProfileContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  endAuthSession.mockClear()
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function gotoStep2(
  user: ReturnType<typeof userEvent.setup>,
  password = 'mat-khau-cu-123',
) {
  await user.type(screen.getByLabelText('Mật khẩu admin hiện tại'), password)
  await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))
  await screen.findByText(/Bước 2\/3/)
}

async function gotoStep3(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Mã OTP email hiện tại'), '111111')
  await user.type(screen.getByLabelText('Email khôi phục mới'), 'moi@example.com')
  await user.click(screen.getByRole('button', { name: /gửi otp email mới/i }))
  await screen.findByText(/Bước 3\/3/)
}

describe('ChangeRecoveryEmailPage — bước 1: mật khẩu hiện tại (P3-T8)', () => {
  it('mật khẩu rỗng → báo lỗi, không gọi API', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng nhập mật khẩu.')
    expect(api.requestCurrent).not.toHaveBeenCalled()
  })

  it('mật khẩu quá ngắn → báo lỗi tối thiểu 6 ký tự', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Mật khẩu admin hiện tại'), 'abc')
    await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu tối thiểu 6 ký tự.')
    expect(api.requestCurrent).not.toHaveBeenCalled()
  })

  it('đúng → gọi requestCurrent, sang bước 2 (hiện OTP + email mới)', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()

    await gotoStep2(user, 'mat-khau-cu-123')

    expect(api.requestCurrent).toHaveBeenCalledWith('mat-khau-cu-123')
    expect(screen.getByLabelText('Mã OTP email hiện tại')).toBeInTheDocument()
    expect(screen.getByLabelText('Email khôi phục mới')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Mã OTP đã gửi tới email khôi phục HIỆN TẠI')
    // vừa gửi → chặn gửi lại 60s (GoTrue)
    expect(screen.getByRole('button', { name: /gửi lại sau \d+s/i })).toBeDisabled()
  })

  it('server trả lỗi (sai mật khẩu) → hiện thông điệp, giữ nguyên bước 1', async () => {
    const api = fakeApi({
      requestCurrent: vi.fn(async () => ({
        ok: false,
        message: 'Mật khẩu admin không đúng',
      })),
    })
    renderPage(api)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Mật khẩu admin hiện tại'), 'sai-mat-khau')
    await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu admin không đúng')
    expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument()
  })
})

describe('ChangeRecoveryEmailPage — bước 2: OTP hiện tại + email mới (P3-T8)', () => {
  it('thiếu OTP / email sai → báo lỗi, không gọi requestNew', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()
    await gotoStep2(user)

    await user.click(screen.getByRole('button', { name: /gửi otp email mới/i }))
    const emptyAlerts = await screen.findAllByRole('alert')
    expect(emptyAlerts.map((a) => a.textContent)).toContain('Vui lòng nhập mã OTP.')
    expect(emptyAlerts.map((a) => a.textContent)).toContain('Vui lòng nhập email.')
    expect(api.requestNew).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Mã OTP email hiện tại'), '123456')
    await user.click(screen.getByRole('button', { name: /gửi otp email mới/i }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((a) => a.textContent)).toContain('Vui lòng nhập email.')
    expect(api.requestNew).not.toHaveBeenCalled()
  })

  it('đủ → gọi requestNew với email mới, sang bước 3', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()
    await gotoStep2(user)

    await gotoStep3(user)

    expect(api.requestNew).toHaveBeenCalledWith('moi@example.com')
    expect(screen.getByLabelText('Mã OTP email mới')).toBeInTheDocument()
    expect(screen.getByLabelText('Mật khẩu mới')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Mã OTP đã gửi tới email mới.')
  })

  it('email trùng email hiện tại (400 từ server) → hiện thông điệp, ở lại bước 2', async () => {
    const api = fakeApi({
      requestNew: vi.fn(async () => ({
        ok: false,
        message: 'Email mới phải khác email hiện tại',
      })),
    })
    renderPage(api)
    const user = userEvent.setup()
    await gotoStep2(user)

    await user.type(screen.getByLabelText('Mã OTP email hiện tại'), '111111')
    await user.type(screen.getByLabelText('Email khôi phục mới'), 'cu@example.com')
    await user.click(screen.getByRole('button', { name: /gửi otp email mới/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email mới phải khác email hiện tại',
    )
    expect(screen.getByText(/Bước 2\/3/)).toBeInTheDocument()
  })

  it('nút "Quay lại" về bước 1 (giữ nguyên dữ liệu đã nhập)', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()
    await gotoStep2(user)

    await user.click(screen.getByRole('button', { name: 'Quay lại' }))

    expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument()
    expect(screen.getByLabelText('Mật khẩu admin hiện tại')).toHaveValue('mat-khau-cu-123')
  })
})

describe('ChangeRecoveryEmailPage — bước 3: hoàn tất (P3-T8)', () => {
  it('xác nhận mật khẩu không khớp → báo lỗi, không gọi complete', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()
    await gotoStep2(user)
    await gotoStep3(user)

    await user.type(screen.getByLabelText('Mã OTP email mới'), '222222')
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'mat-khau-moi-123')
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'khac-nhau')
    await user.click(screen.getByRole('button', { name: /hoàn tất đổi email/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu xác nhận không khớp.')
    expect(api.complete).not.toHaveBeenCalled()
  })

  it('đủ 2 điều kiện → complete đủ 5 trường, đăng xuất cục bộ, hiện màn thành công', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()
    await gotoStep2(user, 'mat-khau-cu-123')
    await gotoStep3(user)

    await user.type(screen.getByLabelText('Mã OTP email mới'), '222222')
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'mat-khau-moi-123')
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'mat-khau-moi-123')
    await user.click(screen.getByRole('button', { name: /hoàn tất đổi email/i }))

    expect(api.complete).toHaveBeenCalledWith({
      password: 'mat-khau-cu-123',
      currentToken: '111111',
      newEmail: 'moi@example.com',
      newToken: '222222',
      newPassword: 'mat-khau-moi-123',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã đổi email khôi phục. Hãy đăng nhập bằng mật khẩu mới.',
    )
    // server đã hủy phiên cũ → client không giữ token mồ côi
    expect(endAuthSession).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Đăng nhập lại' }))
    expect(await screen.findByText('LOGIN SCREEN')).toBeInTheDocument()
  })

  it('OTP sai (401 từ server) → hiện thông điệp, ở lại bước 3', async () => {
    const api = fakeApi({
      complete: vi.fn(async () => ({
        ok: false,
        message: 'Mã OTP không đúng hoặc đã hết hạn',
      })),
    })
    renderPage(api)
    const user = userEvent.setup()
    await gotoStep2(user)
    await gotoStep3(user)

    await user.type(screen.getByLabelText('Mã OTP email mới'), '999999')
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'mat-khau-moi-123')
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'mat-khau-moi-123')
    await user.click(screen.getByRole('button', { name: /hoàn tất đổi email/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mã OTP không đúng hoặc đã hết hạn',
    )
    expect(screen.getByText(/Bước 3\/3/)).toBeInTheDocument()
    expect(endAuthSession).not.toHaveBeenCalled()
  })
})

describe('ChangeRecoveryEmailPage — phân quyền (P3-T8)', () => {
  it('staff → thấy ghi chú "chỉ admin", không thấy form', () => {
    renderPage(fakeApi(), STAFF)

    expect(screen.getByRole('status')).toHaveTextContent('Chỉ admin mới dùng chức năng này')
    expect(screen.queryByLabelText('Mật khẩu admin hiện tại')).not.toBeInTheDocument()
  })

  it('staff bấm "Về trang chính" → về /dashboard', async () => {
    renderPage(fakeApi(), STAFF)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Về trang chính' }))

    expect(await screen.findByText('DASHBOARD SCREEN')).toBeInTheDocument()
  })

  it('admin → hiện form 3 bước bình thường', () => {
    renderPage(fakeApi(), ADMIN)
    expect(screen.getByLabelText('Mật khẩu admin hiện tại')).toBeInTheDocument()
    expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument()
  })

  it('không có bối cảnh profile → vẫn mở được form (server là nơi chặn cuối)', () => {
    renderPage(fakeApi(), null)
    expect(screen.getByLabelText('Mật khẩu admin hiện tại')).toBeInTheDocument()
  })
})

describe('ChangeRecoveryEmailPage — gửi lại OTP (P3-T8)', () => {
  it('bấm gửi lại khi chưa hết 60s → không gọi API', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()
    await gotoStep2(user)

    const resend = screen.getByRole('button', { name: /gửi lại sau \d+s/i })
    expect(resend).toBeDisabled()

    await waitFor(() => expect(api.requestCurrent).toHaveBeenCalledTimes(1))
    expect(api.requestCurrent).toHaveBeenCalledTimes(1)
  })
})
