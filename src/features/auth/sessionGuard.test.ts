import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { currentSessionState, evaluateSession } from './sessionGuard'
import { LOGIN_AT_KEY, REMEMBER_KEY } from '../../lib/supabase'
import { SESSION_MAX_AGE_MS } from '../../lib/session'

const NOW = 1_800_000_000_000

function fakeClient(session: unknown) {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
    },
  } as unknown as SupabaseClient
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('evaluateSession (P3-T5 — biên 7 ngày)', () => {
  it('không có phiên → none (không tự đăng xuất gì cả)', () => {
    expect(evaluateSession(false, null, NOW)).toBe('none')
    expect(evaluateSession(false, NOW - 999 * SESSION_MAX_AGE_MS, NOW)).toBe('none')
  })

  it('phiên dưới 7 ngày → ok', () => {
    expect(evaluateSession(true, NOW - SESSION_MAX_AGE_MS, NOW)).toBe('ok')
    expect(evaluateSession(true, NOW - 1, NOW)).toBe('ok')
    expect(evaluateSession(true, NOW + 60_000, NOW)).toBe('ok')
  })

  it('phiên đúng 7 ngày (chưa vượt) → ok; vượt 1ms → expired', () => {
    expect(evaluateSession(true, NOW - SESSION_MAX_AGE_MS, NOW)).toBe('ok')
    expect(evaluateSession(true, NOW - SESSION_MAX_AGE_MS - 1, NOW)).toBe('expired')
  })

  it('có token nhưng mất login_at → expired (an toàn: đăng nhập lại)', () => {
    expect(evaluateSession(true, null, NOW)).toBe('expired')
  })
})

describe('currentSessionState (P3-T5)', () => {
  it('session + login_at còn hạn → ok', async () => {
    window.localStorage.setItem(REMEMBER_KEY, '1')
    window.localStorage.setItem(LOGIN_AT_KEY, String(NOW - 1000))
    await expect(currentSessionState(NOW, fakeClient({ access_token: 'x' }))).resolves.toBe('ok')
  })

  it('session + login_at quá 7 ngày → expired', async () => {
    window.localStorage.setItem(REMEMBER_KEY, '1')
    window.localStorage.setItem(LOGIN_AT_KEY, String(NOW - SESSION_MAX_AGE_MS - 1))
    await expect(currentSessionState(NOW, fakeClient({ access_token: 'x' }))).resolves.toBe(
      'expired',
    )
  })

  it('không có session → none (KHÔNG đụng login_at)', async () => {
    window.localStorage.setItem(REMEMBER_KEY, '1')
    window.localStorage.setItem(LOGIN_AT_KEY, String(NOW - SESSION_MAX_AGE_MS - 1))
    await expect(currentSessionState(NOW, fakeClient(null))).resolves.toBe('none')
    // login_at phải còn nguyên — applyAuthSession ghi login_at trước khi setSession
    expect(window.localStorage.getItem(LOGIN_AT_KEY)).toBe(String(NOW - SESSION_MAX_AGE_MS - 1))
  })

  it('client null (chưa cấu hình) → none', async () => {
    await expect(currentSessionState(NOW, null)).resolves.toBe('none')
  })
})
