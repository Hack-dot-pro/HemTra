// Gọi Edge Function `admin-recovery` — P3-T6 (design §4.4).
// Hợp đồng EF:
//   request-otp {email} → LUÔN 200 {ok:true} (anti-oracle: email sai không gửi gì)
//   verify {email, token, password} → 200 {ok, message} | 401 {error} | 400 {error}
// Thông báo lỗi lấy nguyên từ server (tiếng Việt).

import { CONFIG_ERROR, NETWORK_ERROR, messageFromBody, supabasePost } from '../../lib/http'

export type RecoveryResult = { ok: true; message: string } | { ok: false; message: string }

export type RecoveryInput = { email: string; token: string; password: string }

export type RecoveryApi = {
  requestOtp(email: string): Promise<RecoveryResult>
  verify(input: RecoveryInput): Promise<RecoveryResult>
}

function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300
}

async function post(payload: Record<string, string>): Promise<RecoveryResult> {
  const res = await supabasePost('/functions/v1/admin-recovery', payload)
  if (res.failure === 'config') return { ok: false, message: CONFIG_ERROR }
  if (res.failure === 'network') return { ok: false, message: NETWORK_ERROR }

  const body = res.body as { ok?: boolean; message?: string } | null
  const successMessage = typeof body?.message === 'string' && body.message ? body.message : ''
  if (isOkStatus(res.status) && body?.ok) return { ok: true, message: successMessage }
  return { ok: false, message: messageFromBody(res.body) }
}

export const defaultRecoveryApi: RecoveryApi = {
  requestOtp: (email) => post({ action: 'request-otp', email: email.trim() }),
  verify: ({ email, token, password }) =>
    post({ action: 'verify', email: email.trim(), token: token.trim(), password }),
}
