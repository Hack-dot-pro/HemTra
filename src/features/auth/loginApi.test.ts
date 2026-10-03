import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestLogin, requestUnlockOtp, verifyUnlockOtp } from './loginApi'
import { SIGN_IN_ERROR } from './loginForm'
import { CONFIG_ERROR, NETWORK_ERROR, SERVER_ERROR } from '../../lib/http'

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('requestLogin', () => {
  it('200 có session → ok:true kèm session', async () => {
    const fn = stubFetch(200, { ok: true, session: { access_token: 'jwt' } })
    await expect(requestLogin(' Linh ', 'mat-khau')).resolves.toEqual({
      ok: true,
      session: { access_token: 'jwt' },
    })
    expect(JSON.parse(String(fn.mock.calls[0][1]?.body))).toEqual({
      action: 'login',
      username: 'Linh',
      password: 'mat-khau',
    })
  })

  it('401 có thông điệp lỗi → giữ nguyên thông điệp, locked=false', async () => {
    stubFetch(401, { error: 'Tài khoản hoặc mật khẩu không đúng.', locked: false })
    await expect(requestLogin('linh', 'sai')).resolves.toEqual({
      ok: false,
      message: 'Tài khoản hoặc mật khẩu không đúng.',
      locked: false,
      status: 401,
    })
  })

  it('401 không có body → fallback thông báo chung', async () => {
    stubFetch(401, null)
    await expect(requestLogin('linh', 'sai')).resolves.toMatchObject({
      ok: false,
      message: SIGN_IN_ERROR,
      locked: false,
      status: 401,
    })
  })

  it('429 khóa → locked=true (UI mở luồng OTP khôi phục)', async () => {
    stubFetch(429, { error: 'Sai mật khẩu quá 5 lần.', locked: true })
    await expect(requestLogin('linh', 'sai')).resolves.toMatchObject({
      ok: false,
      locked: true,
      status: 429,
    })
  })

  it('500 body lạ → lỗi máy chủ chung', async () => {
    stubFetch(500, { message: 'boom' })
    await expect(requestLogin('linh', 'mk')).resolves.toMatchObject({
      ok: false,
      message: SERVER_ERROR,
      locked: false,
    })
  })

  it('mất mạng / thiếu cấu hình → thông báo tương ứng', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('no network')
      }),
    )
    await expect(requestLogin('a', 'b')).resolves.toMatchObject({ message: NETWORK_ERROR })

    vi.unstubAllGlobals()
    vi.doMock('../../lib/supabase', () => ({
      supabaseUrl: null,
      supabaseAnonKey: null,
      isSupabaseConfigured: false,
    }))
    vi.resetModules()
    const { requestLogin: unconfigured } = await import('./loginApi')
    await expect(unconfigured('a', 'b')).resolves.toMatchObject({ message: CONFIG_ERROR })
    vi.doUnmock('../../lib/supabase')
    vi.resetModules()
  })
})

describe('requestUnlockOtp / verifyUnlockOtp', () => {
  it('unlock-otp 200 → ok kèm thông điệp gửi OTP', async () => {
    const fn = stubFetch(200, { ok: true, message: 'Đã gửi mã OTP (nếu tài khoản có email khôi phục).' })
    await expect(requestUnlockOtp('linh')).resolves.toEqual({
      ok: true,
      message: 'Đã gửi mã OTP (nếu tài khoản có email khôi phục).',
    })
    expect(JSON.parse(String(fn.mock.calls[0][1]?.body))).toEqual({
      action: 'unlock-otp',
      username: 'linh',
    })
  })

  it('unlock-verify 200 → ok kèm thông điệp đã khôi phục', async () => {
    const fn = stubFetch(200, { ok: true, message: 'Đã khôi phục lượt đăng nhập. Hãy thử đăng nhập lại.' })
    await expect(verifyUnlockOtp('linh', '123456')).resolves.toEqual({
      ok: true,
      message: 'Đã khôi phục lượt đăng nhập. Hãy thử đăng nhập lại.',
    })
    expect(JSON.parse(String(fn.mock.calls[0][1]?.body))).toEqual({
      action: 'unlock-verify',
      username: 'linh',
      token: '123456',
    })
  })

  it('unlock-verify 401 OTP sai → thông điệp lỗi từ server', async () => {
    stubFetch(401, { error: 'Mã OTP không đúng hoặc đã hết hạn' })
    await expect(verifyUnlockOtp('linh', '000000')).resolves.toEqual({
      ok: false,
      message: 'Mã OTP không đúng hoặc đã hết hạn',
    })
  })
})
