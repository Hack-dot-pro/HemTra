import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SetupStage from './SetupStage.tsx'
import { EF_DONE_MESSAGE, type ApiResult, type SetupApi } from './api'
import { USERNAME_KEY } from '../auth/loginForm'

const CHECK_ERROR = 'Không thể kiểm tra trạng thái hệ thống. Thử lại sau.'

function fakeApi(overrides: Partial<SetupApi> = {}): SetupApi {
  return {
    fetchBootstrapped: vi.fn(async (): Promise<ApiResult<boolean>> => ({ ok: true, data: false })),
    requestOtp: vi.fn(async (): Promise<ApiResult<null>> => ({ ok: true, data: null })),
    complete: vi.fn(async (): Promise<ApiResult<null>> => ({ ok: true, data: null })),
    ...overrides,
  }
}

function renderSetup(api: SetupApi) {
  return render(
    <MemoryRouter initialEntries={['/setup']}>
      <Routes>
        <Route path="/setup" element={<SetupStage api={api} />} />
        <Route path="/login" element={<div>ĐĂNG NHẬP</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function startStep1() {
  await screen.findByRole('heading', { name: 'Thiết lập lần đầu' })
  return userEvent.setup()
}

async function gotoOtp(email = 'admin@gmail.com') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email admin'), email)
  await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))
  await screen.findByRole('heading', { name: 'Đặt tài khoản' })
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

describe('SetupStage — kiểm tra trạng thái bootstrap', () => {
  it('hiện "đang kiểm tra" rồi vào form khi chưa bootstrap', async () => {
    let resolveFetch!: (r: ApiResult<boolean>) => void
    const api = fakeApi({
      fetchBootstrapped: vi.fn(
        () =>
          new Promise<ApiResult<boolean>>((resolve) => {
            resolveFetch = resolve
          }),
      ),
    })
    renderSetup(api)

    expect(screen.getByRole('status')).toHaveTextContent('Đang kiểm tra trạng thái…')

    resolveFetch({ ok: true, data: false })
    await screen.findByRole('heading', { name: 'Thiết lập lần đầu' })
  })

  it('chuyển về /login ngay nếu đã bootstrap — màn đăng ký tự ẩn', async () => {
    const api = fakeApi({ fetchBootstrapped: vi.fn(async () => ({ ok: true, data: true })) })
    renderSetup(api)

    expect(await screen.findByText('ĐĂNG NHẬP')).toBeInTheDocument()
  })

  it('lỗi kiểm tra → báo lỗi, nút Thử lại tải lại được form', async () => {
    const api = fakeApi({
      fetchBootstrapped: vi
        .fn<() => Promise<ApiResult<boolean>>>()
        .mockResolvedValueOnce({ ok: false, message: 'x' })
        .mockResolvedValueOnce({ ok: true, data: false }),
    })
    renderSetup(api)

    expect(await screen.findByRole('alert')).toHaveTextContent(CHECK_ERROR)
    expect(screen.queryByRole('heading', { name: 'Thiết lập lần đầu' })).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /thử lại/i }))
    await screen.findByRole('heading', { name: 'Thiết lập lần đầu' })
  })
})

describe('SetupStage — bước 1: gửi OTP', () => {
  it('từ chối email rỗng/sai bằng thông báo tiếng Việt, không gọi API', async () => {
    const api = fakeApi()
    renderSetup(api)
    const user = await startStep1()

    await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng nhập email.')
    expect(api.requestOtp).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Email admin'), 'sai-email')
    await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))
    expect(await screen.findAllByRole('alert')).toHaveLength(1)
    expect(api.requestOtp).not.toHaveBeenCalled()
  })

  it('gửi OTP hợp lệ → sang bước 2, hiện mã đã gửi', async () => {
    const api = fakeApi()
    renderSetup(api)
    await startStep1()
    await gotoOtp('  admin@gmail.com  ')

    expect(api.requestOtp).toHaveBeenCalledWith('admin@gmail.com')
    expect(screen.getByRole('status')).toHaveTextContent('Mã OTP đã được gửi đến email admin')
    expect(screen.getByLabelText('Mã OTP')).toBeInTheDocument()
  })

  it('EF trả lỗi chung → hiện đúng thông điệp, giữ nguyên bước 1', async () => {
    const api = fakeApi({
      requestOtp: vi.fn(async () => ({ ok: false, message: 'Lỗi máy chủ, thử lại sau' })),
    })
    renderSetup(api)
    const user = await startStep1()

    await user.type(screen.getByLabelText('Email admin'), 'admin@gmail.com')
    await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi máy chủ, thử lại sau')
    expect(screen.getByRole('heading', { name: 'Thiết lập lần đầu' })).toBeInTheDocument()
  })

  it('409 đã bootstrap (ai đó setup trước) → thoát về đăng nhập', async () => {
    const api = fakeApi({
      requestOtp: vi.fn(async () => ({
        ok: false,
        message: EF_DONE_MESSAGE,
        alreadyDone: true,
      })),
    })
    renderSetup(api)
    const user = await startStep1()

    await user.type(screen.getByLabelText('Email admin'), 'admin@gmail.com')
    await user.click(screen.getByRole('button', { name: /gửi mã otp/i }))

    expect(await screen.findByText('ĐĂNG NHẬP')).toBeInTheDocument()
  })
})

describe('SetupStage — bước 2: OTP + tài khoản + mật khẩu', () => {
  it('báo đủ 3 lỗi khi trường trống', async () => {
    const api = fakeApi()
    renderSetup(api)
    await startStep1()
    const user = await gotoOtp()

    await user.click(screen.getByRole('button', { name: /hoàn tất thiết lập/i }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((node) => node.textContent)).toEqual([
      'Vui lòng nhập mã OTP.',
      'Vui lòng nhập tài khoản.',
      'Vui lòng nhập mật khẩu.',
    ])
    expect(api.complete).not.toHaveBeenCalled()
  })

  it('thành công: normalize username, lưu remembered, về màn đăng nhập', async () => {
    const api = fakeApi()
    renderSetup(api)
    await startStep1()
    const user = await gotoOtp()

    await user.type(screen.getByLabelText('Mã OTP'), '123456')
    await user.type(screen.getByLabelText('Tài khoản'), '  Admin01 ')
    await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau-1')
    await user.click(screen.getByRole('button', { name: /hoàn tất thiết lập/i }))

    await waitFor(() =>
      expect(api.complete).toHaveBeenCalledWith({
        email: 'admin@gmail.com',
        token: '123456',
        username: 'admin01',
        password: 'mat-khau-1',
      }),
    )
    expect(window.localStorage.getItem(USERNAME_KEY)).toBe('admin01')
    expect(await screen.findByText('ĐĂNG NHẬP')).toBeInTheDocument()
  })

  it('EF báo OTP sai → hiện thông điệp, vẫn ở bước 2', async () => {
    const api = fakeApi({
      complete: vi.fn(async () => ({ ok: false, message: 'Mã OTP không đúng hoặc đã hết hạn' })),
    })
    renderSetup(api)
    await startStep1()
    const user = await gotoOtp()

    await user.type(screen.getByLabelText('Mã OTP'), '000000')
    await user.type(screen.getByLabelText('Tài khoản'), 'admin01')
    await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau-1')
    await user.click(screen.getByRole('button', { name: /hoàn tất thiết lập/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mã OTP không đúng hoặc đã hết hạn',
    )
    expect(screen.getByRole('heading', { name: 'Đặt tài khoản' })).toBeInTheDocument()
  })

  it('gửi lại mã: bị chặn trong 60s rồi gửi lại được', async () => {
    const api = fakeApi()
    renderSetup(api)
    await startStep1()
    await gotoOtp()

    expect(screen.getByRole('button', { name: /gửi lại sau \d+s/i })).toBeDisabled()

    // Đẩy thời gian qua khỏi cooldown (interval 500ms sẽ đọc lại Date.now)
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
    renderSetup(api)
    await startStep1()
    const user = await gotoOtp()

    await user.click(screen.getByRole('button', { name: 'Đổi email' }))

    expect(screen.getByRole('heading', { name: 'Thiết lập lần đầu' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email admin')).toHaveValue('admin@gmail.com')
  })
})
