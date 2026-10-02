import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RecoveryStage from './RecoveryStage.tsx'
import type { RecoveryApi, RecoveryResult } from './recoveryApi'

function fakeApi(overrides: Partial<RecoveryApi> = {}): RecoveryApi {
  return {
    requestOtp: vi.fn(async (): Promise<RecoveryResult> => ({ ok: true, message: '' })),
    verify: vi.fn(async (): Promise<RecoveryResult> => ({ ok: true, message: '' })),
    ...overrides,
  }
}

function renderRecovery(api: RecoveryApi) {
  return render(
    <MemoryRouter initialEntries={['/recovery']}>
      <Routes>
        <Route path="/recovery" element={<RecoveryStage api={api} />} />
        <Route path="/login" element={<div>ĐĂNG NHẬP</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function gotoOtp(email = 'admin@gmail.com') {
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Khôi phục mật khẩu' })
  await user.type(screen.getByLabelText('Email admin'), email)
  await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))
  await screen.findByRole('heading', { name: 'Đặt mật khẩu mới' })
  return user
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RecoveryStage — bước 1: gửi OTP (P3-T6)', () => {
  it('hiện ghi chú staff "Liên hệ admin" ngay từ đầu', () => {
    renderRecovery(fakeApi())
    expect(screen.getByRole('status')).toHaveTextContent(
      'Chỉ admin tự khôi phục. Nhân viên liên hệ admin',
    )
  })

  it('email rỗng/sai → báo lỗi tiếng Việt, không gọi API', async () => {
    const api = fakeApi()
    renderRecovery(api)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng nhập email.')
    expect(api.requestOtp).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Email admin'), 'sai-email')
    await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email không hợp lệ.')
    expect(api.requestOtp).not.toHaveBeenCalled()
  })

  it('gửi OTP → sang bước 2 (anti-oracle: EF luôn ok, hiển thị chung)', async () => {
    const api = fakeApi()
    renderRecovery(api)
    await gotoOtp('  admin@gmail.com  ')

    expect(api.requestOtp).toHaveBeenCalledWith('admin@gmail.com')
    expect(screen.getByRole('status')).toHaveTextContent('Mã OTP đã được gửi đến email admin')
    expect(screen.getByLabelText('Mã OTP')).toBeInTheDocument()
    expect(screen.getByLabelText('Mật khẩu mới')).toBeInTheDocument()
  })

  it('EF trả lỗi chung → hiện thông điệp, giữ nguyên bước 1', async () => {
    const api = fakeApi({
      requestOtp: vi.fn(async () => ({ ok: false, message: 'Lỗi máy chủ, thử lại sau' })),
    })
    renderRecovery(api)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email admin'), 'admin@gmail.com')
    await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi máy chủ, thử lại sau')
    expect(screen.getByRole('heading', { name: 'Khôi phục mật khẩu' })).toBeInTheDocument()
  })
})

describe('RecoveryStage — bước 2: OTP + mật khẩu mới (P3-T6)', () => {
  it('báo đủ 2 lỗi khi trường trống, không gọi API', async () => {
    const api = fakeApi()
    renderRecovery(api)
    const user = await gotoOtp()

    await user.click(screen.getByRole('button', { name: /đặt mật khẩu mới/i }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((node) => node.textContent)).toEqual([
      'Vui lòng nhập mã OTP.',
      'Vui lòng nhập mật khẩu.',
    ])
    expect(api.verify).not.toHaveBeenCalled()
  })

  it('thành công → gọi verify đủ tham số, về màn đăng nhập với recoveryDone', async () => {
    const api = fakeApi({
      verify: vi.fn(async () => ({
        ok: true,
        message: 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.',
      })),
    })
    renderRecovery(api)
    const user = await gotoOtp()

    await user.type(screen.getByLabelText('Mã OTP'), '123456')
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'mat-khau-moi')
    await user.click(screen.getByRole('button', { name: /đặt mật khẩu mới/i }))

    await waitFor(() =>
      expect(api.verify).toHaveBeenCalledWith({
        email: 'admin@gmail.com',
        token: '123456',
        password: 'mat-khau-moi',
      }),
    )
    expect(await screen.findByText('ĐĂNG NHẬP')).toBeInTheDocument()
  })

  it('EF báo OTP sai → hiện thông điệp, vẫn ở bước 2', async () => {
    const api = fakeApi({
      verify: vi.fn(async () => ({ ok: false, message: 'Mã OTP không đúng hoặc đã hết hạn' })),
    })
    renderRecovery(api)
    const user = await gotoOtp()

    await user.type(screen.getByLabelText('Mã OTP'), '000000')
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'mat-khau-moi')
    await user.click(screen.getByRole('button', { name: /đặt mật khẩu mới/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mã OTP không đúng hoặc đã hết hạn',
    )
    expect(screen.getByRole('heading', { name: 'Đặt mật khẩu mới' })).toBeInTheDocument()
  })

  it('mật khẩu < 6 ký tự → báo lỗi, không gọi API', async () => {
    const api = fakeApi()
    renderRecovery(api)
    const user = await gotoOtp()

    await user.type(screen.getByLabelText('Mã OTP'), '123456')
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'abc')
    await user.click(screen.getByRole('button', { name: /đặt mật khẩu mới/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu tối thiểu 6 ký tự.')
    expect(api.verify).not.toHaveBeenCalled()
  })

  it('gửi lại mã: bị chặn trong 60s rồi gửi lại được', async () => {
    const api = fakeApi()
    renderRecovery(api)
    await gotoOtp()

    expect(screen.getByRole('button', { name: /gửi lại sau \d+s/i })).toBeDisabled()

    const base = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => base + 61_000)

    const user = userEvent.setup()
    const ready = await screen.findByRole('button', { name: 'Gửi lại mã' }, { timeout: 3000 })
    await user.click(ready)

    await waitFor(() => expect(api.requestOtp).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).toHaveTextContent('Đã gửi lại mã OTP.')
  })

  it('nút Đổi email quay về bước 1, giữ nguyên email', async () => {
    const api = fakeApi()
    renderRecovery(api)
    const user = await gotoOtp()

    await user.click(screen.getByRole('button', { name: 'Đổi email' }))

    expect(screen.getByRole('heading', { name: 'Khôi phục mật khẩu' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email admin')).toHaveValue('admin@gmail.com')
  })
})

describe('RecoveryStage — nút Quay lại đăng nhập', () => {
  it('bước 1 quay về màn đăng nhập', async () => {
    renderRecovery(fakeApi())
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Quay lại đăng nhập' }))
    expect(screen.getByText('ĐĂNG NHẬP')).toBeInTheDocument()
  })
})
