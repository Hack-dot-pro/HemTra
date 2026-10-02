import { SIGN_IN_ERROR } from './loginForm'

export type SignInResult = { ok: true } | { ok: false; message: string }

// P2: backend xác thực chưa được nối — P3-T4 thay hàm này bằng Edge Function
// `auth-login` (lockout 5/15 phút, Turnstile sau 3 lần sai — auth/skill.md §2).
export async function signIn(_username: string, _password: string): Promise<SignInResult> {
  await new Promise((resolve) => setTimeout(resolve, 250))
  return { ok: true }
}

export function wrongPassword(): SignInResult {
  return { ok: false, message: SIGN_IN_ERROR }
}
