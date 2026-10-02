// Xác thực form đăng nhập + lưu tên tài khoản — plan P2-T3.
// Bất biến: chỉ lưu username, KHÔNG BAO GIỜ lưu mật khẩu (AGENT.md §6).

export type LoginFormValues = { username: string; password: string }

export type LoginFormErrors = Partial<Record<'username' | 'password' | 'form', string>>

export const USERNAME_KEY = 'hemtra.username'

export const SIGN_IN_ERROR = 'Tài khoản hoặc mật khẩu không đúng.'

export function validateLoginForm(values: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {}
  if (!values.username.trim()) errors.username = 'Vui lòng nhập tài khoản.'
  if (!values.password) errors.password = 'Vui lòng nhập mật khẩu.'
  return errors
}

export function hasFormError(errors: LoginFormErrors): boolean {
  return Boolean(errors.username || errors.password || errors.form)
}

export function getSavedUsername(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(USERNAME_KEY) ?? window.sessionStorage.getItem(USERNAME_KEY)
}

export function saveUsername(username: string, remember: boolean): void {
  clearSavedUsername()
  const store = remember ? window.localStorage : window.sessionStorage
  store.setItem(USERNAME_KEY, username)
}

export function clearSavedUsername(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(USERNAME_KEY)
  window.sessionStorage.removeItem(USERNAME_KEY)
}
