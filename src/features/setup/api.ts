// API client cho màn hình đăng ký lần đầu (P3-T3) — gọi REST đọc `app_meta`
// và Edge Function `bootstrap-admin` (design §4.2).
// Dùng fetch trực tiếp (không qua supabase-js) để kiểm soát đúng hợp đồng
// status + body {ok}/{error} của EF và dễ unit-test; supabase-js sẽ vào ở P3-T4
// khi cần quản lý session.
// Frontend chỉ gửi anon key (security/skill.md §1).

import { supabaseAnonKey, supabaseUrl } from '../../lib/supabase'
import { NETWORK_ERROR, SERVER_ERROR } from './logic'

// Thông điệp 409 từ EF khi `bootstrapped=true` — so bằng chữ để nhận diện
// (409 cũng có thể là "Tên đăng nhập đã tồn tại").
export const EF_DONE_MESSAGE = 'Hệ thống đã được thiết lập'
export const CONFIG_ERROR = 'Ứng dụng chưa được cấu hình Supabase (thiếu VITE_SUPABASE_URL).'

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

function headers(): Record<string, string> {
  return {
    apikey: supabaseAnonKey as string,
    Authorization: `Bearer ${supabaseAnonKey as string}`,
    'Content-Type': 'application/json',
  }
}

async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function failFromBody(status: number, body: unknown): ApiFail {
  const message =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? ((body as { error: string }).error)
      : SERVER_ERROR
  return { ok: false, message, alreadyDone: message === EF_DONE_MESSAGE && status === 409 }
}

async function post(path: string, body: unknown): Promise<ApiResult<null>> {
  if (!supabaseUrl || !supabaseAnonKey) return { ok: false, message: CONFIG_ERROR }

  let res: Response
  try {
    res = await fetch(`${supabaseUrl}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, message: NETWORK_ERROR }
  }

  const payload = await readBody(res)
  if (!res.ok) return failFromBody(res.status, payload)
  return { ok: true, data: null }
}

async function fetchBootstrapped(): Promise<ApiResult<boolean>> {
  if (!supabaseUrl || !supabaseAnonKey) return { ok: false, message: CONFIG_ERROR }

  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/app_meta?select=bootstrapped&id=eq.1&limit=1`, {
      headers: headers(),
    })
  } catch {
    return { ok: false, message: NETWORK_ERROR }
  }

  if (!res.ok) return { ok: false, message: SERVER_ERROR }

  const rows = await readBody(res)
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
