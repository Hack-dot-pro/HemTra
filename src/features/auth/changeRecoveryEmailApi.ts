// Gọi Edge Function `change-recovery-email` — P3-T8 (design §4.4, Q-005).
// "Đổi email khôi phục" = đổi key admin, server tự kiểm ĐỦ 2 điều kiện:
//   (1) mật khẩu admin hiện tại + OTP email hiện tại (app_meta.admin_email)
//   (2) OTP email mới  → đặt mật khẩu mới + ghi đè app_meta.admin_email
// Hợp đồng EF (verify_jwt=false, tự xác thực access_token + ép role=admin):
//   request-current {password} → 200 {ok:true} | 401 sai mat khau | 400 | 403 | 429
//   request-new {new_email}    → 200 {ok:true} | 400 sameEmail | 409 emailTaken | 403
//   complete {password, current_token, new_email, new_token, new_password}
//                              → 200 {ok, message} | 401 OTP/sai mat khau | 400 | 403 | 409
// Thông báo lỗi lấy nguyên từ server (tiếng Việt).

import { CONFIG_ERROR, NETWORK_ERROR, messageFromBody, supabasePost } from '../../lib/http'
import { getSupabase } from '../../lib/supabase'

export const NO_SESSION = 'Phiên đăng nhập không hợp lệ, đăng nhập lại.'

export type ChangeRecoveryResult = { ok: true; message: string } | { ok: false; message: string }

export type ChangeRecoveryCompleteInput = {
  password: string
  currentToken: string
  newEmail: string
  newToken: string
  newPassword: string
}

export type ChangeRecoveryEmailApi = {
  requestCurrent(password: string): Promise<ChangeRecoveryResult>
  requestNew(newEmail: string): Promise<ChangeRecoveryResult>
  complete(input: ChangeRecoveryCompleteInput): Promise<ChangeRecoveryResult>
}

// Gửi user access_token hiện tại — EF chỉ nhận token của chính admin đang gọi.
async function call(action: string, payload: Record<string, unknown>): Promise<ChangeRecoveryResult> {
  const client = getSupabase()
  if (!client) return { ok: false, message: CONFIG_ERROR }

  let token: string | null
  try {
    const { data } = await client.auth.getSession()
    token = data.session?.access_token ?? null
  } catch {
    token = null
  }
  if (!token) return { ok: false, message: NO_SESSION }

  const res = await supabasePost(
    '/functions/v1/change-recovery-email',
    { action, ...payload },
    { Authorization: `Bearer ${token}` },
  )
  if (res.failure === 'config') return { ok: false, message: CONFIG_ERROR }
  if (res.failure === 'network') return { ok: false, message: NETWORK_ERROR }

  const body = res.body as { ok?: boolean; message?: string } | null
  const successMessage = typeof body?.message === 'string' && body.message ? body.message : ''
  if (res.status >= 200 && res.status < 300 && body?.ok) return { ok: true, message: successMessage }
  return { ok: false, message: messageFromBody(res.body) }
}

export const defaultChangeRecoveryEmailApi: ChangeRecoveryEmailApi = {
  requestCurrent: (password) => call('request-current', { password }),
  requestNew: (newEmail) => call('request-new', { new_email: newEmail.trim() }),
  complete: ({ password, currentToken, newEmail, newToken, newPassword }) =>
    call('complete', {
      password,
      current_token: currentToken.trim(),
      new_email: newEmail.trim(),
      new_token: newToken.trim(),
      new_password: newPassword,
    }),
}
