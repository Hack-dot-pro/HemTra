// API client cho màn hình đăng ký lần đầu (P3-T3) — gọi REST đọc `app_meta`
// và Edge Function `bootstrap-admin` (design §4.2).
// Transport dùng chung `src/lib/http.ts`; mapping kết quả riêng cho setup.

import { CONFIG_ERROR, NETWORK_ERROR, SERVER_ERROR, messageFromBody, supabaseGet, supabasePost } from '../../lib/http'

export { CONFIG_ERROR }

// Thông điệp 409 từ EF khi `bootstrapped=true` — so bằng chữ để nhận diện
// (409 cũng có thể là "Tên đăng nhập đã tồn tại").
export const EF_DONE_MESSAGE = 'Hệ thống đã được thiết lập'

export type ApiOk<T> = { ok: true; data: T }
export type ApiFail = { ok: false; message: string; alreadyDone?: boolean }
export type ApiResult<T> = ApiOk<T> | ApiFail

export type CompleteInput = {
  email: string
  token: string
  username: string
  password: string
}

export type SetupApi = {
  fetchBootstrapped(): Promise<ApiResult<boolean>>
  requestOtp(email: string): Promise<ApiResult<null>>
  complete(input: CompleteInput): Promise<ApiResult<null>>
}

function fail(status: number, body: unknown): ApiFail {
  const message = messageFromBody(body)
  return { ok: false, message, alreadyDone: message === EF_DONE_MESSAGE && status === 409 }
}

async function post(path: string, body: unknown): Promise<ApiResult<null>> {
  const res = await supabasePost(path, body)
  if (res.failure === 'config') return { ok: false, message: CONFIG_ERROR }
  if (res.failure === 'network') return { ok: false, message: NETWORK_ERROR }
  if (res.status < 200 || res.status >= 300) return fail(res.status, res.body)
  return { ok: true, data: null }
}

async function fetchBootstrapped(): Promise<ApiResult<boolean>> {
  const res = await supabaseGet('/rest/v1/app_meta?select=bootstrapped&id=eq.1&limit=1')
  if (res.failure === 'config') return { ok: false, message: CONFIG_ERROR }
  if (res.failure === 'network') return { ok: false, message: NETWORK_ERROR }
  if (res.status < 200 || res.status >= 300) return { ok: false, message: SERVER_ERROR }

  const rows = res.body
  if (!Array.isArray(rows) || rows.length === 0)
    return { ok: false, message: 'Không đọc được trạng thái hệ thống.' }
  const bootstrapped = (rows[0] as { bootstrapped?: unknown }).bootstrapped === true
  return { ok: true, data: bootstrapped }
}

export const defaultApi: SetupApi = {
  fetchBootstrapped,
  requestOtp: (email) => post('/functions/v1/bootstrap-admin', { action: 'request-otp', email }),
  complete: (input) => post('/functions/v1/bootstrap-admin', { action: 'complete', ...input }),
}
