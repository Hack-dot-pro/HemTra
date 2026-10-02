import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultChangeRecoveryEmailApi, NO_SESSION } from './changeRecoveryEmailApi'
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
    data: { session: { access_token: 'jwt-cua-admin' } },
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('changeRecoveryEmailApi.requestCurrent (P3-T8)', () => {
  it('gửi action + password + Authorization = token admin → 200 {ok}', async () => {
    const fn = stubFetch(200, { ok: true })
    await expect(defaultChangeRecoveryEmailApi.requestCurrent('mat-khau-cu')).resolves.toEqual({
      ok: true,
      message: '',
    })

    const [url, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://demo.supabase.co/functions/v1/change-recovery-email')
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'request-current',
      password: 'mat-khau-cu',
    })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-cua-admin')
  })

  it('401 sai mật khẩu → giữ nguyên thông điệp server', async () => {
    stubFetch(401, { error: 'Mật khẩu admin không đúng' })
    await expect(defaultChangeRecoveryEmailApi.requestCurrent('sai')).resolves.toEqual({
      ok: false,
      message: 'Mật khẩu admin không đúng',
    })
  })
})

describe('changeRecoveryEmailApi.requestNew (P3-T8)', () => {
  it('gửi action + new_email (trim) → 200 {ok}', async () => {
    const fn = stubFetch(200, { ok: true })
    await expect(
      defaultChangeRecoveryEmailApi.requestNew('  moi@example.com '),
    ).resolves.toEqual({ ok: true, message: '' })

    const [, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'request-new',
      new_email: 'moi@example.com',
    })
  })

  it('409 email đã dùng cho tài khoản khác → thông điệp server', async () => {
    stubFetch(409, { error: 'Email mới đã được dùng cho tài khoản khác' })
    await expect(defaultChangeRecoveryEmailApi.requestNew('x@y.com')).resolves.toEqual({
      ok: false,
      message: 'Email mới đã được dùng cho tài khoản khác',
    })
  })

  it('400 email trùng email hiện tại → thông điệp server', async () => {
    stubFetch(400, { error: 'Email mới phải khác email hiện tại' })
    await expect(defaultChangeRecoveryEmailApi.requestNew('x@y.com')).resolves.toEqual({
      ok: false,
      message: 'Email mới phải khác email hiện tại',
    })
  })
})

describe('changeRecoveryEmailApi.complete (P3-T8)', () => {
  it('gửi đủ 5 trường (snake_case) + token → 200 kèm message thành công', async () => {
    const fn = stubFetch(200, {
      ok: true,
      message: 'Đã đổi email khôi phục. Hãy đăng nhập bằng mật khẩu mới.',
    })
    await expect(
      defaultChangeRecoveryEmailApi.complete({
        password: 'cu-1234',
        currentToken: ' 111111 ',
        newEmail: 'moi@example.com',
        newToken: '222222',
        newPassword: 'moi-5678',
      }),
    ).resolves.toEqual({
      ok: true,
      message: 'Đã đổi email khôi phục. Hãy đăng nhập bằng mật khẩu mới.',
    })

    const [, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'complete',
      password: 'cu-1234',
      current_token: '111111',
      new_email: 'moi@example.com',
      new_token: '222222',
      new_password: 'moi-5678',
    })
  })

  it('401 OTP sai/hết hạn → thông điệp server', async () => {
    stubFetch(401, { error: 'Mã OTP không đúng hoặc đã hết hạn' })
    await expect(
      defaultChangeRecoveryEmailApi.complete({
        password: 'cu-1234',
        currentToken: '000000',
        newEmail: 'moi@example.com',
        newToken: '111111',
        newPassword: 'moi-5678',
      }),
    ).resolves.toEqual({ ok: false, message: 'Mã OTP không đúng hoặc đã hết hạn' })
  })

  it('403 staff gọi trực tiếp → thông điệp server', async () => {
    stubFetch(403, { error: 'Chỉ admin mới dùng chức năng này' })
    await expect(
      defaultChangeRecoveryEmailApi.complete({
        password: 'x',
        currentToken: '111111',
        newEmail: 'moi@example.com',
        newToken: '222222',
        newPassword: 'abcdef',
      }),
    ).resolves.toEqual({ ok: false, message: 'Chỉ admin mới dùng chức năng này' })
  })
})

describe('changeRecoveryEmailApi — lỗi hạ tầng (P3-T8)', () => {
  it('chưa đăng nhập → NO_SESSION, không gọi fetch', async () => {
    getSession.mockImplementation(async () => ({ data: { session: null } }))
    const fn = stubFetch(200, { ok: true })
    await expect(defaultChangeRecoveryEmailApi.requestCurrent('x')).resolves.toEqual({
      ok: false,
      message: NO_SESSION,
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('mất mạng → NETWORK_ERROR; 500 body lạ → SERVER_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('no network')
      }),
    )
    await expect(defaultChangeRecoveryEmailApi.requestCurrent('x')).resolves.toEqual({
      ok: false,
      message: NETWORK_ERROR,
    })

    vi.unstubAllGlobals()
    stubFetch(500, { message: 'boom' })
    await expect(defaultChangeRecoveryEmailApi.requestCurrent('x')).resolves.toEqual({
      ok: false,
      message: SERVER_ERROR,
    })
  })

  it('thiếu cấu hình Supabase → CONFIG_ERROR', async () => {
    vi.resetModules()
    vi.doMock('../../lib/supabase', () => ({
      supabaseUrl: null,
      supabaseAnonKey: null,
      isSupabaseConfigured: false,
      getSupabase: () => null,
    }))
    const { defaultChangeRecoveryEmailApi: unconfigured } = await import('./changeRecoveryEmailApi')
    await expect(unconfigured.requestNew('x@y.com')).resolves.toEqual({
      ok: false,
      message: CONFIG_ERROR,
    })
    vi.doUnmock('../../lib/supabase')
    vi.resetModules()
  })
})
