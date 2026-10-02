// Gọi EF `change-password` — P3-T7 (design §4.1: đổi mật khẩu bản thân,
// bắt buộc nhập mật khẩu cũ). Gửi user access_token hiện tại ở header
// Authorization (EF chỉ đổi được mật khẩu của chính token đó).
// Hợp đồng EF:
//   200 {ok:true, message:'Đã đổi mật khẩu'}
//   401 {error} (thiếu/sai token | mật khẩu cũ sai) · 400 {error} (dữ liệu) · 429

import { CONFIG_ERROR, NETWORK_ERROR, messageFromBody, supabasePost } from '../../lib/http'
import { getSupabase } from '../../lib/supabase'

export const NO_SESSION = 'Phiên đăng nhập không hợp lệ, đăng nhập lại.'

export type ChangePasswordInput = { currentPassword: string; newPassword: string }
export type ChangePasswordResult = { ok: true; message: string } | { ok: false; message: string }

export type ChangePasswordApi = {
  change(input: ChangePasswordInput): Promise<ChangePasswordResult>
}

export const defaultChangePasswordApi: ChangePasswordApi = {
  async change({ currentPassword, newPassword }) {
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
      '/functions/v1/change-password',
      { current_password: currentPassword, new_password: newPassword },
      { Authorization: `Bearer ${token}` },
    )
    if (res.failure === 'config') return { ok: false, message: CONFIG_ERROR }
    if (res.failure === 'network') return { ok: false, message: NETWORK_ERROR }

    const body = res.body as { ok?: boolean; message?: string } | null
    const successMessage = typeof body?.message === 'string' && body.message ? body.message : ''
    if (res.status >= 200 && res.status < 300 && body?.ok) return { ok: true, message: successMessage }
    return { ok: false, message: messageFromBody(res.body) }
  },
}
