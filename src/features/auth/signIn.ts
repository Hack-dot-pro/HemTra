import { requestLogin } from './loginApi'
import { applyAuthSession, CANNOT_SAVE_SESSION, type SessionCredentials } from '../../lib/session'

export type SignInResult = { ok: true } | { ok: false; message: string; locked?: boolean }

export type SignInFn = (username: string, password: string, remember?: boolean) => Promise<SignInResult>

// P3-T4: gọi EF `auth-login` — lockout 5 lần/15 phút (username+IP); khi bị khóa
// trả `locked=true` để UI gợi ý khôi phục qua OTP (design §4.3).
// P3-T5: sau khi EF trả session → lưu phiên theo "ghi nhớ" + login_at 7 ngày
// (localStorage/sessionStorage — auth/skill.md §3).
export async function signIn(
  username: string,
  password: string,
  remember = true,
): Promise<SignInResult> {
  const result = await requestLogin(username, password)
  if (!result.ok) return { ok: false, message: result.message, locked: result.locked }

  const session = result.session as Partial<SessionCredentials> | null
  try {
    await applyAuthSession(
      { access_token: session?.access_token ?? '', refresh_token: session?.refresh_token ?? '' },
      remember,
    )
  } catch {
    return { ok: false, message: CANNOT_SAVE_SESSION }
  }
  return { ok: true }
}
