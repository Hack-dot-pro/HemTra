// Gọi Edge Function `auth-login` — P3-T4 (design §4.3).
// Hợp đồng EF: POST { action: 'login' | 'unlock-otp' | 'unlock-verify', ... }
//   login         → 200 {ok, session} | 401 {error, locked:false} | 429 {error, locked:true}
//   unlock-otp    → LUÔN 200 {ok, message} (chống dò username)
//   unlock-verify → 200 {ok, message} | 401 {error}
// Thông báo lỗi lấy nguyên từ server (tiếng Việt, chung chung — không lộ user).

import { CONFIG_ERROR, NETWORK_ERROR, SERVER_ERROR, messageFromBody, supabasePost } from '../../lib/http'
import { SIGN_IN_ERROR } from './loginForm'

export type RequestLoginResult =
  | { ok: true; session: unknown }
  | { ok: false; message: string; locked: boolean; status: number }

export type UnlockResult = { ok: true; message: string } | { ok: false; message: string }

function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300
}

export async function requestLogin(username: string, password: string): Promise<RequestLoginResult> {
  const res = await supabasePost('/functions/v1/auth-login', {
    action: 'login',
    username: username.trim(),
    password,
  })
  if (res.failure === 'config') return { ok: false, message: CONFIG_ERROR, locked: false, status: 0 }
  if (res.failure === 'network') return { ok: false, message: NETWORK_ERROR, locked: false, status: 0 }

  const body = res.body as { ok?: boolean; session?: unknown; locked?: boolean; error?: string } | null
  if (isOkStatus(res.status) && body?.ok && body.session) {
    return { ok: true, session: body.session }
  }
  const message =
    typeof body?.error === 'string'
      ? body.error
      : res.status === 401
        ? SIGN_IN_ERROR
        : SERVER_ERROR
  return { ok: false, message, locked: res.status === 429 || body?.locked === true, status: res.status }
}

async function unlockCall(action: 'unlock-otp' | 'unlock-verify', payload: Record<string, string>): Promise<UnlockResult> {
  const res = await supabasePost('/functions/v1/auth-login', { action, ...payload })
  if (res.failure === 'config') return { ok: false, message: CONFIG_ERROR }
  if (res.failure === 'network') return { ok: false, message: NETWORK_ERROR }

  const body = res.body as { ok?: boolean; message?: string } | null
  const message = typeof body?.message === 'string' && body.message ? body.message : messageFromBody(res.body)
  if (isOkStatus(res.status) && body?.ok) return { ok: true, message: message || '' }
  return { ok: false, message }
}

export function requestUnlockOtp(username: string): Promise<UnlockResult> {
  return unlockCall('unlock-otp', { username: username.trim() })
}

export function verifyUnlockOtp(username: string, token: string): Promise<UnlockResult> {
  return unlockCall('unlock-verify', { username: username.trim(), token: token.trim() })
}
