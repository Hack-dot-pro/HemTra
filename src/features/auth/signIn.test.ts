import { afterEach, describe, expect, it, vi } from 'vitest'
import { SIGN_IN_ERROR } from './loginForm'
import { signIn } from './signIn'
import { NETWORK_ERROR } from '../../lib/http'
import { applyAuthSession, CANNOT_SAVE_SESSION } from '../../lib/session'

// Không tạo Supabase client thật trong unit test (testing/skill.md §2) —
// phần lưu phiên (P3-T5) mock ở đây, logic của nó test riêng trong session.test.ts
vi.mock('../../lib/session', () => ({
  applyAuthSession: vi.fn(async () => {}),
  CANNOT_SAVE_SESSION: 'Không thể lưu phiên đăng nhập, thử lại sau.',
}))

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

describe('signIn (P3-T4 — EF auth-login, P3-T5 — lưu phiên)', () => {
  it('đăng nhập đúng → ok:true và LƯU PHIÊN với cờ ghi nhớ (mặc định bật)', async () => {
    stubFetch(200, { ok: true, session: { access_token: 'jwt', refresh_token: 'r' } })
    await expect(signIn('linh', 'mat-khau')).resolves.toEqual({ ok: true })
    expect(String(vi.mocked(fetch).mock.calls[0][1]?.body)).toContain('"action":"login"')
    expect(applyAuthSession).toHaveBeenCalledWith(
      { access_token: 'jwt', refresh_token: 'r' },
      true,
    )
  })

  it('ghi nhớ tắt → truyền remember=false để lưu ở sessionStorage', async () => {
    stubFetch(200, { ok: true, session: { access_token: 'jwt', refresh_token: 'r' } })
    await expect(signIn('linh', 'mat-khau', false)).resolves.toEqual({ ok: true })
    expect(applyAuthSession).toHaveBeenCalledWith(
      { access_token: 'jwt', refresh_token: 'r' },
      false,
    )
  })

  it('lưu phiên thất bại → báo lỗi, KHÔNG báo đăng nhập thành công', async () => {
    stubFetch(200, { ok: true, session: { access_token: 'jwt', refresh_token: 'r' } })
    vi.mocked(applyAuthSession).mockRejectedValueOnce(new Error('boom'))
    await expect(signIn('linh', 'mat-khau')).resolves.toEqual({
      ok: false,
      message: CANNOT_SAVE_SESSION,
    })
  })

  it('sai mật khẩu → thông báo chung chung từ server, không có cờ locked, không lưu phiên', async () => {
    stubFetch(401, { error: 'Tài khoản hoặc mật khẩu không đúng.', locked: false })
    await expect(signIn('linh', 'sai')).resolves.toEqual({
      ok: false,
      message: 'Tài khoản hoặc mật khẩu không đúng.',
      locked: false,
    })
    expect(applyAuthSession).not.toHaveBeenCalled()
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
