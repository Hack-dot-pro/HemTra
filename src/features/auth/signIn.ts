import { requestLogin } from './loginApi'

export type SignInResult = { ok: true } | { ok: false; message: string; locked?: boolean }

// P3-T4: gọi EF `auth-login` — lockout 5 lần/15 phút (username+IP); khi bị khóa
// trả `locked=true` để UI gợi ý khôi phục qua OTP (design §4.3).
// Lưu phiên + kiểm tra 7 ngày do P3-T5 xử lý (session_fresh() server đã có từ P1).
export async function signIn(username: string, password: string): Promise<SignInResult> {
  const result = await requestLogin(username, password)
  if (!result.ok) return { ok: false, message: result.message, locked: result.locked }
  return { ok: true }
}
