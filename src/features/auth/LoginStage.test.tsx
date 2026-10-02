import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginStage, { type LoginStageProps } from './LoginStage.tsx'
import { SIGN_IN_ERROR, USERNAME_KEY } from './loginForm'
import type { InstallPromptEvent } from './install'
import type { SetupApi } from '../setup/api'

// API bootstrap giả lập — mặc định "đã bootstrap" để test P2 không phụ thuộc mạng (P3-T3)
function fakeBootstrapApi(
  fetchBootstrapped: SetupApi['fetchBootstrapped'],
): SetupApi {
  return {
    fetchBootstrapped,
    requestOtp: vi.fn(async () => ({ ok: true, data: null })),
    complete: vi.fn(async () => ({ ok: true, data: null })),
  }
}

const BOOTSTRAPPED_API = fakeBootstrapApi(async () => ({ ok: true, data: true }))

function renderLogin(
  onSignIn?: LoginStageProps['onSignIn'],
  bootstrapApi: SetupApi = BOOTSTRAPPED_API,
  entry: string = '/login',
) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/login"
          element={<LoginStage onSignIn={onSignIn} bootstrapApi={bootstrapApi} />}
        />
        <Route path="/setup" element={<div>SETUP SCREEN</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('LoginStage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('hiện cả ô tài khoản và ô mật khẩu khi chưa từng đăng nhập', () => {
    renderLogin()
    expect(screen.getByLabelText('Tài khoản')).toBeInTheDocument()
    expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đổi tài khoản' })).not.toBeInTheDocument()
  })

  it('báo lỗi tiếng Việt và rung ô khi gửi form rỗng', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: /đăng nhập/i }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((node) => node.textContent)).toEqual([
      'Vui lòng nhập tài khoản.',
      'Vui lòng nhập mật khẩu.',
    ])
    expect(screen.getByLabelText('Tài khoản')).toHaveFocus()
    expect(document.getElementById('f-user')).toHaveClass('shake')
  })

  it('chỉ hiện ô mật khẩu khi đã lưu tài khoản, có nút Đổi tài khoản', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(USERNAME_KEY, 'linh')
    renderLogin()

    expect(screen.queryByLabelText('Tài khoản')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('placeholder', 'Mật khẩu của linh')
    expect(screen.getByRole('button', { name: 'Đổi tài khoản' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Đổi tài khoản' }))
    expect(screen.getByLabelText('Tài khoản')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đổi tài khoản' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(USERNAME_KEY)).toBeNull()
  })

  it('hiện/ẩn mật khẩu bằng nút chuyển', async () => {
    const user = userEvent.setup()
    renderLogin()
    const input = screen.getByLabelText('Mật khẩu')
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('lưu tên tài khoản vào localStorage khi bật Ghi nhớ, sessionStorage khi tắt', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn().mockResolvedValue({ ok: true })
    renderLogin(onSignIn)

    await user.type(screen.getByLabelText('Tài khoản'), 'linh')
    await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau')
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }))

    await waitFor(() => expect(onSignIn).toHaveBeenCalledWith('linh', 'mat-khau'))
    await waitFor(() => expect(window.localStorage.getItem(USERNAME_KEY)).toBe('linh'))

    cleanup()
    window.localStorage.clear()
    window.sessionStorage.clear()

    renderLogin(onSignIn)
    await user.type(screen.getByLabelText('Tài khoản'), 'toi')
    await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau')
    await user.click(screen.getByRole('checkbox', { name: /ghi nhớ/i }))
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }))

    await waitFor(() => expect(onSignIn).toHaveBeenCalledTimes(2))
    expect(window.localStorage.getItem(USERNAME_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(USERNAME_KEY)).toBe('toi')
  })

  it('thông báo lỗi chung chung và xoá mật khẩu khi đăng nhập thất bại', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn().mockResolvedValue({ ok: false, message: SIGN_IN_ERROR })
    renderLogin(onSignIn)

    await user.type(screen.getByLabelText('Tài khoản'), 'linh')
    await user.type(screen.getByLabelText('Mật khẩu'), 'sai-mat-khau')
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(SIGN_IN_ERROR)
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('')
    expect(window.localStorage.getItem(USERNAME_KEY)).toBeNull()
  })

  it('nút Tải App ẩn khi chưa có prompt cài đặt', () => {
    renderLogin()
    expect(screen.queryByRole('button', { name: /tải app/i })).not.toBeInTheDocument()
  })

  it('nút Tải App hiện ra khi trình duyệt phát event beforeinstallprompt', async () => {
    const user = userEvent.setup()
    renderLogin()

    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = new Event('beforeinstallprompt') as InstallPromptEvent
    event.prompt = prompt
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    act(() => {
      window.dispatchEvent(event)
    })

    const button = await screen.findByRole('button', { name: /tải app/i })
    await user.click(button)
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
  })

  it('nút Xóa cache & Tải lại đi qua trạng thái đang xóa rồi đã xóa', async () => {
    const user = userEvent.setup()
    renderLogin()

    const button = screen.getByRole('button', { name: /xóa cache/i })
    await user.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Đang xóa…')

    await waitFor(() => expect(button).toHaveTextContent('Đã xóa cache'), { timeout: 2000 })
    expect(button).toBeEnabled()
  })

  it('link Quên mật khẩu hiện gợi ý liên hệ admin', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Quên mật khẩu' }))
    expect(screen.getByRole('status')).toHaveTextContent('Liên hệ admin')
  })
})

const ORIGINAL_UA = window.navigator.userAgent

function stubUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true })
}

describe('LoginStage — hộp hướng dẫn cài app trên iOS (bổ sung QC Q4, P2-T4)', () => {
  const IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    stubUserAgent(IPHONE_UA)
  })

  afterEach(() => {
    stubUserAgent(ORIGINAL_UA)
    Reflect.deleteProperty(window.navigator, 'standalone')
    vi.restoreAllMocks()
  })

  it('hiện nút Tải App trên iPhone và mở hộp hướng dẫn 3 bước khi chưa có beforeinstallprompt', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: /tải app/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Cài Hẻm Trà trên iPhone')
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus())

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ẩn nút Tải App khi app đang chạy standalone dù thiết bị là iPhone', () => {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })

    renderLogin()
    expect(screen.queryByRole('button', { name: /tải app/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /xóa cache/i })).toBeInTheDocument()
  })
})

describe('LoginStage — liên kết Thiết lập lần đầu (P3-T3)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(cleanup)

  it('hiện link khi hệ thống CHƯA bootstrap và điều hướng sang /setup', async () => {
    const user = userEvent.setup()
    const api = fakeBootstrapApi(async () => ({ ok: true, data: false }))
    renderLogin(undefined, api)

    await user.click(await screen.findByRole('button', { name: 'Thiết lập lần đầu' }))
    expect(screen.getByText('SETUP SCREEN')).toBeInTheDocument()
  })

  it('ẩn link khi đã bootstrap — màn đăng ký biến mất vĩnh viễn', async () => {
    renderLogin(undefined, BOOTSTRAPPED_API)

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Thiết lập lần đầu' })).not.toBeInTheDocument(),
    )
  })

  it('ẩn link khi không đọc được trạng thái (không chặn đăng nhập)', async () => {
    const api = fakeBootstrapApi(async () => ({ ok: false, message: 'lỗi' }))
    renderLogin(undefined, api)

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Thiết lập lần đầu' })).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument()
  })

  it('hiện lời xác nhận khi đến từ màn thiết lập xong (state setupDone)', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { setupDone: true } }]}>
        <Routes>
          <Route path="/login" element={<LoginStage bootstrapApi={BOOTSTRAPPED_API} />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Thiết lập hoàn tất. Đăng nhập bằng tài khoản vừa tạo.',
    )
  })
})
