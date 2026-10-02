import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RequireAuth from './RequireAuth.tsx'
import type { AccessProfile } from '../features/auth/accessGuard'

function ForcedHint() {
  const location = useLocation()
  return <div>CHANGE SCREEN {JSON.stringify(location.state)}</div>
}

function renderGuard(loadProfile: () => Promise<AccessProfile | null>, initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN SCREEN</div>} />
        <Route element={<RequireAuth loadProfile={loadProfile} />}>
          <Route path="/dashboard" element={<div>DASHBOARD SCREEN</div>} />
          <Route path="/change-password" element={<ForcedHint />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('RequireAuth (P3-T7)', () => {
  it('có profiles hợp lệ → vào được route con', async () => {
    renderGuard(async () => ({ role: 'admin', mustChangePassword: false }))
    expect(await screen.findByText('DASHBOARD SCREEN')).toBeInTheDocument()
  })

  it('chưa đăng nhập (profiles=null) → chuyển /login', async () => {
    renderGuard(async () => null)
    expect(await screen.findByText('LOGIN SCREEN')).toBeInTheDocument()
  })

  it('đang kiểm tra → hiện "Đang tải…" (không chớp login)', () => {
    renderGuard(() => new Promise(() => {}))
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải…')
    expect(screen.queryByText('LOGIN SCREEN')).not.toBeInTheDocument()
  })

  it('must_change_password=true → ép qua /change-password với state forced', async () => {
    renderGuard(async () => ({ role: 'staff', mustChangePassword: true }))
    expect(await screen.findByText(/CHANGE SCREEN \{"forced":true\}/)).toBeInTheDocument()
  })

  it('đang ở /change-password + must_change → cho qua (không vòng lặp)', async () => {
    renderGuard(async () => ({ role: 'staff', mustChangePassword: true }), '/change-password')
    expect(await screen.findByText(/CHANGE SCREEN/)).toBeInTheDocument()
    expect(screen.queryByText('LOGIN SCREEN')).not.toBeInTheDocument()
  })

  it('lỗi mạng → màn "thử lại"; bấm Thử lại mà lần sau thành công → vào app', async () => {
    const user = userEvent.setup()
    let calls = 0
    const loadProfile = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new Error('Failed to fetch')
      return { role: 'admin', mustChangePassword: false } satisfies AccessProfile
    })

    renderGuard(loadProfile)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tải được thông tin tài khoản, thử lại.',
    )

    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('DASHBOARD SCREEN')).toBeInTheDocument()
  })
})
