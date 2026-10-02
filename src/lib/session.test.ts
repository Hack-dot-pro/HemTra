import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyAuthSession,
  CANNOT_SAVE_SESSION,
  endAuthSession,
  readLoginAt,
  removeLoginAt,
  SESSION_MAX_AGE_MS,
} from './session'
import { LOGIN_AT_KEY, REMEMBER_KEY, routedAuthStorage } from './supabase'

const CRED = { access_token: 'at-xyz', refresh_token: 'rt-xyz' }

function fakeClient(setSession: { error: { message: string } | null } = { error: null }) {
  return {
    auth: {
      setSession: vi.fn(async () => setSession),
      signOut: vi.fn(async () => ({ error: null })),
    },
  } as unknown as SupabaseClient
}

function clearAll() {
  window.localStorage.clear()
  window.sessionStorage.clear()
}

beforeEach(clearAll)
afterEach(() => {
  clearAll()
  vi.restoreAllMocks()
})

describe('SESSION_MAX_AGE_MS', () => {
  it('đúng 7 ngày', () => {
    expect(SESSION_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })
})

describe('applyAuthSession (P3-T5)', () => {
  it('ghi nhớ bật → cờ "1" + login_at ở localStorage, setSession gọi đúng token', async () => {
    const client = fakeClient()
    await applyAuthSession(CRED, true, client)

    expect(window.localStorage.getItem(REMEMBER_KEY)).toBe('1')
    expect(window.localStorage.getItem(LOGIN_AT_KEY)).toBeTruthy()
    expect(window.sessionStorage.getItem(LOGIN_AT_KEY)).toBeNull()
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'at-xyz',
      refresh_token: 'rt-xyz',
    })
  })

  it('ghi nhớ tắt → cờ "0" + login_at ở sessionStorage (đóng tab là mất)', async () => {
    const client = fakeClient()
    await applyAuthSession(CRED, false, client)

    expect(window.localStorage.getItem(REMEMBER_KEY)).toBe('0')
    expect(window.sessionStorage.getItem(LOGIN_AT_KEY)).toBeTruthy()
    expect(window.localStorage.getItem(LOGIN_AT_KEY)).toBeNull()
    expect(readLoginAt()).not.toBeNull()
  })

  it('setSession lỗi → ném lỗi và XÓA login_at (không để "token thiếu login_at")', async () => {
    const client = fakeClient({ error: { message: 'invalid token' } })
    await expect(applyAuthSession(CRED, true, client)).rejects.toThrow('invalid token')
    expect(window.localStorage.getItem(LOGIN_AT_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(LOGIN_AT_KEY)).toBeNull()
  })

  it('thiếu client (chưa cấu hình Supabase) → ném CANNOT_SAVE_SESSION', async () => {
    await expect(applyAuthSession(CRED, true, null)).rejects.toThrow(CANNOT_SAVE_SESSION)
  })

  it('session thiếu token → ném CANNOT_SAVE_SESSION, không ghi login_at', async () => {
    const client = fakeClient()
    await expect(
      applyAuthSession({ access_token: '', refresh_token: '' }, true, client),
    ).rejects.toThrow(CANNOT_SAVE_SESSION)
    expect(client.auth.setSession).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(LOGIN_AT_KEY)).toBeNull()
  })
})

describe('readLoginAt / removeLoginAt', () => {
  it('đọc đúng số từ store đích, dữ liệu rác → null', () => {
    window.localStorage.setItem(REMEMBER_KEY, '1')
    window.localStorage.setItem(LOGIN_AT_KEY, '1759380000000')
    expect(readLoginAt()).toBe(1759380000000)

    window.localStorage.setItem(LOGIN_AT_KEY, 'khong-phai-so')
    expect(readLoginAt()).toBeNull()

    window.localStorage.removeItem(LOGIN_AT_KEY)
    expect(readLoginAt()).toBeNull()
  })

  it('removeLoginAt xóa khỏi CẢ hai cửa hàng', () => {
    window.localStorage.setItem(LOGIN_AT_KEY, '1')
    window.sessionStorage.setItem(LOGIN_AT_KEY, '2')
    removeLoginAt()
    expect(window.localStorage.getItem(LOGIN_AT_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(LOGIN_AT_KEY)).toBeNull()
  })
})

describe('endAuthSession (P3-T5)', () => {
  it('gọi signOut scope local + xóa login_at', async () => {
    const client = fakeClient()
    window.localStorage.setItem(REMEMBER_KEY, '1')
    window.localStorage.setItem(LOGIN_AT_KEY, '123')

    await endAuthSession(client)

    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(window.localStorage.getItem(LOGIN_AT_KEY)).toBeNull()
    // token do supabase tự xóa qua routedAuthStorage — test riêng ở describe bên dưới
  })

  it('client null (chưa cấu hình) vẫn xóa được login_at, không ném lỗi', async () => {
    window.sessionStorage.setItem(LOGIN_AT_KEY, '123')
    await expect(endAuthSession(null)).resolves.toBeUndefined()
    expect(window.sessionStorage.getItem(LOGIN_AT_KEY)).toBeNull()
  })

  it('mất mạng lúc signOut → vẫn coi là đăng xuất (không ném)', async () => {
    const client = {
      auth: {
        signOut: vi.fn(async () => {
          throw new TypeError('fetch failed')
        }),
      },
    } as unknown as SupabaseClient
    window.localStorage.setItem(LOGIN_AT_KEY, '1')
    await expect(endAuthSession(client)).resolves.toBeUndefined()
    expect(window.localStorage.getItem(LOGIN_AT_KEY)).toBeNull()
  })
})

describe('routedAuthStorage (đọc/ghi theo "ghi nhớ", xóa cả hai)', () => {
  it('ghi nhớ bật → token vào localStorage; tắt → sessionStorage', () => {
    window.localStorage.setItem(REMEMBER_KEY, '1')
    routedAuthStorage.setItem('sb-x', 'token-1')
    expect(window.localStorage.getItem('sb-x')).toBe('token-1')
    expect(window.sessionStorage.getItem('sb-x')).toBeNull()

    window.localStorage.setItem(REMEMBER_KEY, '0')
    routedAuthStorage.setItem('sb-x', 'token-2')
    expect(window.sessionStorage.getItem('sb-x')).toBe('token-2')
    expect(routedAuthStorage.getItem('sb-x')).toBe('token-2')
  })

  it('removeItem xóa khỏi cả hai cửa hàng (không sót token)', () => {
    window.localStorage.setItem('sb-x', 'o-cu')
    window.sessionStorage.setItem('sb-x', 'o-moi')
    routedAuthStorage.removeItem('sb-x')
    expect(window.localStorage.getItem('sb-x')).toBeNull()
    expect(window.sessionStorage.getItem('sb-x')).toBeNull()
  })
})
