import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_ERROR, EF_DONE_MESSAGE, defaultApi } from './api'
import { NETWORK_ERROR, SERVER_ERROR } from './logic'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchBootstrapped', () => {
  it('GET app_meta bằng anon key, trả về false khi chưa bootstrap', async () => {
    const { calls } = stubFetch(() => jsonResponse([{ id: 1, bootstrapped: false }]))

    const result = await defaultApi.fetchBootstrapped()

    expect(result).toEqual({ ok: true, data: false })
    const [call] = calls
    expect(call.url).toContain('/rest/v1/app_meta?select=bootstrapped&id=eq.1&limit=1')
    expect(call.url).not.toContain('service_role')
    expect(call.init?.headers).toMatchObject({
      apikey: expect.any(String),
      Authorization: expect.stringMatching(/^Bearer /),
    })
  })

  it('trả về true khi bootstrapped=true', async () => {
    stubFetch(() => jsonResponse([{ id: 1, bootstrapped: true }]))
    await expect(defaultApi.fetchBootstrapped()).resolves.toEqual({ ok: true, data: true })
  })

  it('mảng rỗng → báo không đọc được trạng thái', async () => {
    stubFetch(() => jsonResponse([]))
    await expect(defaultApi.fetchBootstrapped()).resolves.toEqual({
      ok: false,
      message: 'Không đọc được trạng thái hệ thống.',
    })
  })

  it('HTTP 500 → lỗi máy chủ chung', async () => {
    stubFetch(() => jsonResponse({ message: 'boom' }, 500))
    await expect(defaultApi.fetchBootstrapped()).resolves.toEqual({
      ok: false,
      message: SERVER_ERROR,
    })
  })

  it('mất mạng → thông báo kết nối, không ném exception', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')))
    await expect(defaultApi.fetchBootstrapped()).resolves.toEqual({
      ok: false,
      message: NETWORK_ERROR,
    })
  })
})

describe('requestOtp', () => {
  it('POST action=request-otp tới EF bootstrap-admin', async () => {
    const { calls } = stubFetch(() => jsonResponse({ ok: true }))

    const result = await defaultApi.requestOtp('Admin@Gmail.com')

    expect(result).toEqual({ ok: true, data: null })
    const [call] = calls
    expect(call.url).toContain('/functions/v1/bootstrap-admin')
    expect(JSON.parse(String(call.init?.body))).toEqual({
      action: 'request-otp',
      email: 'Admin@Gmail.com',
    })
  })

  it('EF 400 → dùng thông điệp lỗi tiếng Việt của server', async () => {
    stubFetch(() => jsonResponse({ error: 'Dữ liệu không hợp lệ' }, 400))
    await expect(defaultApi.requestOtp('x')).resolves.toEqual({
      ok: false,
      message: 'Dữ liệu không hợp lệ',
      alreadyDone: false,
    })
  })

  it('mạng lỗi → thông báo kết nối', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')))
    await expect(defaultApi.requestOtp('a@b.co')).resolves.toEqual({
      ok: false,
      message: NETWORK_ERROR,
    })
  })
})

describe('complete', () => {
  const input = { email: 'a@b.co', token: '123456', username: 'admin01', password: 'mat-khau' }

  it('POST đủ trường của action complete', async () => {
    const { calls } = stubFetch(() => jsonResponse({ ok: true }))

    const result = await defaultApi.complete(input)

    expect(result).toEqual({ ok: true, data: null })
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ action: 'complete', ...input })
  })

  it('409 "Hệ thống đã được thiết lập" → cờ alreadyDone để UI thoát', async () => {
    stubFetch(() => jsonResponse({ error: EF_DONE_MESSAGE }, 409))
    await expect(defaultApi.complete(input)).resolves.toEqual({
      ok: false,
      message: EF_DONE_MESSAGE,
      alreadyDone: true,
    })
  })

  it('409 trùng tên đăng nhập KHÔNG phải alreadyDone', async () => {
    stubFetch(() => jsonResponse({ error: 'Tên đăng nhập đã tồn tại' }, 409))
    await expect(defaultApi.complete(input)).resolves.toEqual({
      ok: false,
      message: 'Tên đăng nhập đã tồn tại',
      alreadyDone: false,
    })
  })

  it('401 OTP sai → hiện đúng thông điệp server', async () => {
    stubFetch(() => jsonResponse({ error: 'Mã OTP không đúng hoặc đã hết hạn' }, 401))
    await expect(defaultApi.complete(input)).resolves.toEqual({
      ok: false,
      message: 'Mã OTP không đúng hoặc đã hết hạn',
      alreadyDone: false,
    })
  })
})

describe('thiếu cấu hình env', () => {
  it('trả về lỗi cấu hình thay vì crash khi không có VITE_SUPABASE_URL', async () => {
    vi.resetModules()
    vi.doMock('../../lib/supabase', () => ({
      supabaseUrl: null,
      supabaseAnonKey: null,
      isSupabaseConfigured: false,
    }))
    const { defaultApi: unconfigured } = await import('./api')

    await expect(unconfigured.fetchBootstrapped()).resolves.toEqual({
      ok: false,
      message: CONFIG_ERROR,
    })
    await expect(unconfigured.requestOtp('a@b.co')).resolves.toEqual({
      ok: false,
      message: CONFIG_ERROR,
    })

    vi.doUnmock('../../lib/supabase')
    vi.resetModules()
  })
})
