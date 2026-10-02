import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChangePasswordPage from './ChangePasswordPage.tsx'
import type { ChangePasswordApi, ChangePasswordResult } from './changePasswordApi'

function fakeApi(overrides: Partial<ChangePasswordApi> = {}): ChangePasswordApi {
  return {
    change: vi.fn(async (): Promise<ChangePasswordResult> => ({
      ok: true,
      message: 'Đã đổi mật khẩu',
    })),
    ...overrides,
  }
}

function renderPage(
  api: ChangePasswordApi,
  initialEntries: Array<{ pathname: string; state?: unknown }> = [
    { pathname: '/change-password' },
  ],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/change-password" element={<ChangePasswordPage api={api} />} />
        <Route path="/dashboard" element={<div>DASHBOARD SCREEN</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  current: string,
  password: string,
  confirm: string,
) {
  await user.type(screen.getByLabelText('Mật khẩu hiện tại'), current)
  await user.type(screen.getByLabelText('Mật khẩu mới'), password)
  await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), confirm)
  await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(cleanup)

describe('ChangePasswordPage — validate (P3-T7)', () => {
  it('mật khẩu hiện tại rỗng → báo lỗi, không gọi API', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts[0]).toHaveTextContent('Vui lòng nhập mật khẩu hiện tại.')
    expect(api.change).not.toHaveBeenCalled()
  })

  it('mật khẩu mới < 6 ký tự → báo lỗi, không gọi API', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()

    await fillAndSubmit(user, 'mat-khau-cu', 'abc', 'abc')

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu tối thiểu 6 ký tự.')
    expect(api.change).not.toHaveBeenCalled()
  })

  it('xác nhận không khớp → báo lỗi, không gọi API', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()

    await fillAndSubmit(user, 'mat-khau-cu', 'mat-khau-moi', 'mat-khau-khac')

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu xác nhận không khớp.')
    expect(api.change).not.toHaveBeenCalled()
  })
})

describe('ChangePasswordPage — gọi API (P3-T7)', () => {
  it('hợp lệ → gọi change đủ tham số → hiện thành công → Tiếp tục về /dashboard', async () => {
    const api = fakeApi()
    renderPage(api)
    const user = userEvent.setup()

    await fillAndSubmit(user, 'mat-khau-cu', 'mat-khau-moi', 'mat-khau-moi')

    await waitFor(() =>
      expect(api.change).toHaveBeenCalledWith({
        currentPassword: 'mat-khau-cu',
        newPassword: 'mat-khau-moi',
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Đã đổi mật khẩu.')

    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    expect(await screen.findByText('DASHBOARD SCREEN')).toBeInTheDocument()
  })

  it('EF báo mật khẩu cũ sai → hiện thông điệp, vẫn ở form', async () => {
    const api = fakeApi({
      change: vi.fn(async () => ({ ok: false, message: 'Mật khẩu cũ không đúng' })),
    })
    renderPage(api)
    const user = userEvent.setup()

    await fillAndSubmit(user, 'mat-khau-sai', 'mat-khau-moi', 'mat-khau-moi')

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu cũ không đúng')
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toBeInTheDocument()
  })
})

describe('ChangePasswordPage — buộc đổi lần đầu (P3-T7)', () => {
  it('đến từ guard (state forced) → hiện "bắt buộc đổi trước khi tiếp tục"', () => {
    renderPage(fakeApi(), [{ pathname: '/change-password', state: { forced: true } }])
    expect(screen.getByText('Vui lòng đổi mật khẩu trước khi tiếp tục.')).toBeInTheDocument()
  })

  it('vào tự nguyện (không forced) → hiện hướng dẫn thường', () => {
    renderPage(fakeApi())
    expect(screen.getByText('Nhập mật khẩu hiện tại và mật khẩu mới.')).toBeInTheDocument()
  })

  it('nút Hiện/Ẩn mật khẩu đổi type input', async () => {
    renderPage(fakeApi())
    const user = userEvent.setup()
    const current = screen.getByLabelText('Mật khẩu hiện tại')
    expect(current).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveAttribute('type', 'text')
  })
})
