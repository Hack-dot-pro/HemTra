import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultChangePasswordApi, NO_SESSION } from './changePasswordApi'
import { CONFIG_ERROR, NETWORK_ERROR, SERVER_ERROR } from '../../lib/http'

const getSession = vi.fn()

vi.mock('../../lib/supabase', () => ({
  supabaseUrl: 'https://demo.supabase.co',
  supabaseAnonKey: 'anon-key',
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  }),
}))

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  getSession.mockImplementation(async () => ({
    data: { session: { access_token: 'jwt-cua-user' } },
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('changePasswordApi.change (P3-T7)', () => {
  it('gửi đủ tham số + Authorization = user token → 200 {ok} → thành công', async () => {
    const fn = stubFetch(200, { ok: true, message: 'Đã đổi mật khẩu' })
    await expect(
      defaultChangePasswordApi.change({ currentPassword: 'cu-1234', newPassword: 'moi-5678' }),
    ).resolves.toEqual({ ok: true, message: 'Đã đổi mật khẩu' })

    const [url, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://demo.supabase.co/functions/v1/change-password')
    expect(JSON.parse(String(init.body))).toEqual({
      current_password: 'cu-1234',
      new_password: 'moi-5678',
    })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-cua-user')
  })

  it('401 mật khẩu cũ sai → giữ nguyên thông điệp server', async () => {
    stubFetch(401, { error: 'Mật khẩu cũ không đúng' })
    await expect(
      defaultChangePasswordApi.change({ currentPassword: 'sai', newPassword: 'moi-5678' }),
    ).resolves.toEqual({ ok: false, message: 'Mật khẩu cũ không đúng' })
  })

  it('400 mật khẩu mới quá ngắn → thông điệp lỗi', async () => {
    stubFetch(400, { error: 'Dữ liệu không hợp lệ' })
    await expect(
      defaultChangePasswordApi.change({ currentPassword: 'cu-1234', newPassword: 'abc' }),
    ).resolves.toEqual({ ok: false, message: 'Dữ liệu không hợp lệ' })
  })

  it('chưa đăng nhập (không có session) → NO_SESSION, không gọi fetch', async () => {
    getSession.mockImplementation(async () => ({ data: { session: null } }))
    const fn = stubFetch(200, { ok: true })
    await expect(
      defaultChangePasswordApi.change({ currentPassword: 'cu-1234', newPassword: 'moi-5678' }),
    ).resolves.toEqual({ ok: false, message: NO_SESSION })
    expect(fn).not.toHaveBeenCalled()
  })

  it('mất mạng → NETWORK_ERROR; 500 body lạ → SERVER_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('no network')
      }),
    )
    await expect(
      defaultChangePasswordApi.change({ currentPassword: 'cu-1234', newPassword: 'moi-5678' }),
    ).resolves.toEqual({ ok: false, message: NETWORK_ERROR })

    vi.unstubAllGlobals()
    stubFetch(500, { message: 'boom' })
    await expect(
      defaultChangePasswordApi.change({ currentPassword: 'cu-1234', newPassword: 'moi-5678' }),
    ).resolves.toEqual({ ok: false, message: SERVER_ERROR })
  })

  it('thiếu cấu hình Supabase → CONFIG_ERROR', async () => {
    vi.resetModules()
    vi.doMock('../../lib/supabase', () => ({
      supabaseUrl: null,
      supabaseAnonKey: null,
      isSupabaseConfigured: false,
      getSupabase: () => null,
    }))
    const { defaultChangePasswordApi: unconfigured } = await import('./changePasswordApi')
    await expect(
      unconfigured.change({ currentPassword: 'cu-1234', newPassword: 'moi-5678' }),
    ).resolves.toEqual({ ok: false, message: CONFIG_ERROR })
    vi.doUnmock('../../lib/supabase')
    vi.resetModules()
  })
})
