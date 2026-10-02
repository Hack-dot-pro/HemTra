import { afterEach, describe, expect, it, vi } from 'vitest'
import { SIGN_IN_ERROR } from './loginForm'
import { signIn } from './signIn'
import { NETWORK_ERROR } from '../../lib/http'

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('signIn (P3-T4 — EF auth-login)', () => {
  it('đăng nhập đúng → ok:true (session do P3-T5 lưu)', async () => {
    stubFetch(200, { ok: true, session: { access_token: 'jwt', refresh_token: 'r' } })
    await expect(signIn('linh', 'mat-khau')).resolves.toEqual({ ok: true })
    expect(String(vi.mocked(fetch).mock.calls[0][1]?.body)).toContain('"action":"login"')
  })

  it('sai mật khẩu → thông báo chung chung từ server, không có cờ locked', async () => {
    stubFetch(401, { error: 'Tài khoản hoặc mật khẩu không đúng.', locked: false })
    await expect(signIn('linh', 'sai')).resolves.toEqual({
      ok: false,
      message: 'Tài khoản hoặc mật khẩu không đúng.',
      locked: false,
    })
  })

  it('bị khóa sau 5 lần sai → locked:true để UI gợi ý khôi phục OTP', async () => {
    stubFetch(429, {
      error: 'Sai mật khẩu quá 5 lần. Hãy khôi phục bằng OTP hoặc thử lại sau 15 phút.',
      locked: true,
    })
    const result = await signIn('linh', 'sai')
    expect(result).toEqual({
      ok: false,
      message: 'Sai mật khẩu quá 5 lần. Hãy khôi phục bằng OTP hoặc thử lại sau 15 phút.',
      locked: true,
    })
  })

  it('401 không có body lỗi → dùng thông báo chung của client', async () => {
    stubFetch(401, null)
    await expect(signIn('linh', 'sai')).resolves.toEqual({
      ok: false,
      message: SIGN_IN_ERROR,
      locked: false,
    })
  })

  it('mất mạng → báo kết nối, không ném exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    await expect(signIn('linh', 'mat-khau')).resolves.toEqual({
      ok: false,
      message: NETWORK_ERROR,
      locked: false,
    })
  })
})
