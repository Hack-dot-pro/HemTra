import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultRecoveryApi } from './recoveryApi'
import { CONFIG_ERROR, NETWORK_ERROR, SERVER_ERROR } from '../../lib/http'

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
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

describe('recoveryApi.requestOtp (P3-T6)', () => {
  it('200 {ok:true} (anti-oracle — EF luôn ok cho email hợp lệ) → ok', async () => {
    const fn = stubFetch(200, { ok: true })
    await expect(defaultRecoveryApi.requestOtp(' admin@gmail.com ')).resolves.toEqual({
      ok: true,
      message: '',
    })
    expect(JSON.parse(String(fn.mock.calls[0][1]?.body))).toEqual({
      action: 'request-otp',
      email: 'admin@gmail.com',
    })
  })

  it('400 email sai format → thông điệp lỗi từ server', async () => {
    stubFetch(400, { error: 'Dữ liệu không hợp lệ' })
    await expect(defaultRecoveryApi.requestOtp('sai')).resolves.toEqual({
      ok: false,
      message: 'Dữ liệu không hợp lệ',
    })
  })

  it('mất mạng → NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('no network')
      }),
    )
    await expect(defaultRecoveryApi.requestOtp('a@b.com')).resolves.toEqual({
      ok: false,
      message: NETWORK_ERROR,
    })
  })
})

describe('recoveryApi.verify (P3-T6)', () => {
  it('200 → ok kèm thông điệp thành công', async () => {
    const fn = stubFetch(200, { ok: true, message: 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.' })
    await expect(
      defaultRecoveryApi.verify({ email: 'a@b.com', token: '123456', password: 'mat-khau-moi' }),
    ).resolves.toEqual({
      ok: true,
      message: 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.',
    })
    expect(JSON.parse(String(fn.mock.calls[0][1]?.body))).toEqual({
      action: 'verify',
      email: 'a@b.com',
      token: '123456',
      password: 'mat-khau-moi',
    })
  })

  it('401 OTP sai / không phải admin → giữ nguyên thông điệp server', async () => {
    stubFetch(401, { error: 'Mã OTP không đúng hoặc đã hết hạn' })
    await expect(
      defaultRecoveryApi.verify({ email: 'a@b.com', token: '000000', password: 'mat-khau-moi' }),
    ).resolves.toEqual({ ok: false, message: 'Mã OTP không đúng hoặc đã hết hạn' })
  })

  it('400 mật khẩu quá ngắn → thông điệp lỗi', async () => {
    stubFetch(400, { error: 'Dữ liệu không hợp lệ' })
    await expect(
      defaultRecoveryApi.verify({ email: 'a@b.com', token: '123456', password: 'abc' }),
    ).resolves.toEqual({ ok: false, message: 'Dữ liệu không hợp lệ' })
  })

  it('500 body lạ → lỗi máy chủ chung; thiếu cấu hình → CONFIG_ERROR', async () => {
    stubFetch(500, { message: 'boom' })
    await expect(
      defaultRecoveryApi.verify({ email: 'a@b.com', token: '123456', password: 'mat-khau-moi' }),
    ).resolves.toEqual({ ok: false, message: SERVER_ERROR })

    vi.unstubAllGlobals()
    vi.doMock('../../lib/supabase', () => ({
      supabaseUrl: null,
      supabaseAnonKey: null,
      isSupabaseConfigured: false,
    }))
    vi.resetModules()
    const { defaultRecoveryApi: unconfigured } = await import('./recoveryApi')
    await expect(unconfigured.requestOtp('a@b.com')).resolves.toEqual({
      ok: false,
      message: CONFIG_ERROR,
    })
    vi.doUnmock('../../lib/supabase')
    vi.resetModules()
  })
})
