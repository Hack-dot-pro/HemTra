// Logic thuần cho màn hình đăng ký lần đầu (P3-T3, design §4.2).
// Validate 2 đầu: client ở đây, server bằng zod trong EF `bootstrap-admin`.
// Bất biến: KHÔNG BAO GIỜ lưu mật khẩu — chỉ username (AGENT.md §6).

export const OTP_LENGTH = 6

// Giống zod của EF: /^[a-z0-9._-]{2,30}$/ sau khi trim + lowercase.
export const USERNAME_PATTERN = /^[a-z0-9._-]{2,30}$/

// EF chỉ ràng buộc min 1; 6 = độ dài tối thiểu mặc định của GoTrue (giả định đã ghi state).
export const MIN_PASSWORD_LENGTH = 6

// GoTrue giới hạn gửi OTP 60s/email — client tự chặn giữa 2 lần gửi.
export const RESEND_COOLDOWN_MS = 60_000

export type SetupStep = 'email' | 'otp'

export type SetupFormValues = {
  email: string
  otp: string
  username: string
  password: string
}

export type SetupFormErrors = Partial<
  Record<'email' | 'otp' | 'username' | 'password' | 'form', string>
>

export function validateEmail(value: string): string | undefined {
  const email = value.trim()
  if (!email) return 'Vui lòng nhập email.'
  // Đủ đơn giản cho input type=email: có chữ trước, @, tên miền có dấu chấm.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email không hợp lệ.'
  return undefined
}

export function validateOtp(value: string): string | undefined {
  if (!value.trim()) return 'Vui lòng nhập mã OTP.'
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(value.trim())) return `Mã OTP gồm ${OTP_LENGTH} chữ số.`
  return undefined
}

// EF tự trim + lowercase trước khi check — client chuẩn hóa cùng cách để không bất ngờ.
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export function validateUsername(value: string): string | undefined {
  if (!value.trim()) return 'Vui lòng nhập tài khoản.'
  if (!USERNAME_PATTERN.test(normalizeUsername(value)))
    return 'Tài khoản 2–30 ký tự: chữ thường, số, dấu chấm, gạch, gạch dưới.'
  return undefined
}

export function validatePassword(value: string): string | undefined {
  if (!value) return 'Vui lòng nhập mật khẩu.'
  if (value.length < MIN_PASSWORD_LENGTH) return `Mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`
  return undefined
}

export function validateStepEmail(values: Pick<SetupFormValues, 'email'>): SetupFormErrors {
  const email = validateEmail(values.email)
  return email ? { email } : {}
}

export function validateStepOtp(values: Pick<SetupFormValues, 'otp' | 'username' | 'password'>): SetupFormErrors {
  const errors: SetupFormErrors = {}
  const otp = validateOtp(values.otp)
  const username = validateUsername(values.username)
  const password = validatePassword(values.password)
  if (otp) errors.otp = otp
  if (username) errors.username = username
  if (password) errors.password = password
  return errors
}

export function hasSetupError(errors: SetupFormErrors): boolean {
  return Boolean(errors.email || errors.otp || errors.username || errors.password || errors.form)
}

export function canResend(sentAt: number | null, now: number): boolean {
  if (sentAt === null) return false
  return now - sentAt >= RESEND_COOLDOWN_MS
}

// Số giây còn lại phải đợi trước khi gửi lại (0 = được gửi).
export function resendCooldownSeconds(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0
  return Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - (now - sentAt)) / 1000))
}
