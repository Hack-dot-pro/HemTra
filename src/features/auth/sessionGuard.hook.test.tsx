import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useSessionExpiry } from './sessionGuard'
import { LOGIN_AT_KEY, REMEMBER_KEY } from '../../lib/supabase'
import { SESSION_MAX_AGE_MS } from '../../lib/session'

// Fake client: getSession luôn báo "đang có phiên", signOut là spy
const signOut = vi.fn(async () => ({ error: null }))
const getSession = vi.fn(async () => ({ data: { session: { access_token: 'x' } }, error: null }))
const fakeClient = { auth: { getSession, signOut } } as unknown as SupabaseClient

vi.mock('../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/supabase')>()
  return { ...actual, getSupabase: () => fakeClient }
})

function Probe() {
  const location = useLocation()
  const state = location.state as { sessionExpired?: boolean } | null
  return (
    <div data-testid="where">
      {location.pathname}:{String(state?.sessionExpired ?? '')}
    </div>
  )
}

function ExpiryProbe() {
  useSessionExpiry()
  return null
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <ExpiryProbe />
      <Routes>
        <Route path="/dashboard" element={<div>dash</div>} />
        <Route path="/login" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  signOut.mockClear()
  getSession.mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useSessionExpiry (P3-T5 — tự đăng xuất khi quá 7 ngày)', () => {
  it('phiên quá 7 ngày → signOut local + chuyển về /login với state sessionExpired', async () => {
    window.localStorage.setItem(REMEMBER_KEY, '1')
    window.localStorage.setItem(LOGIN_AT_KEY, String(Date.now() - SESSION_MAX_AGE_MS - 1000))

    renderApp()

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login:true'))
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(window.localStorage.getItem(LOGIN_AT_KEY)).toBeNull()
  })

  it('phiên còn hạn → ở nguyên /dashboard, không đăng xuất', async () => {
    window.localStorage.setItem(REMEMBER_KEY, '1')
    window.localStorage.setItem(LOGIN_AT_KEY, String(Date.now() - 1000))

    renderApp()

    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(LOGIN_AT_KEY)).toBeTruthy()
  })

  it('không có phiên (chưa đăng nhập) → không làm gì, không chuyển trang', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null })

    renderApp()

    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })
})
