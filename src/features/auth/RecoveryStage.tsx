import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import './login-stage.css'
import {
  RESEND_COOLDOWN_MS,
  canResend,
  resendCooldownSeconds,
  validateEmail,
  validateOtp,
  validatePassword,
} from '../setup/logic'
import { defaultRecoveryApi, type RecoveryApi } from './recoveryApi'

export type RecoveryStageProps = { api?: RecoveryApi }

const OTP_HINT = 'Mã OTP đã được gửi đến email admin (hết hạn sau 10 phút).'
const STAFF_NOTE = 'Chỉ admin tự khôi phục. Nhân viên liên hệ admin để được cấp lại mật khẩu.'

type RecoveryStep = 'email' | 'otp'
type RecoveryFormErrors = Partial<Record<'email' | 'otp' | 'password' | 'form', string>>

function shake(ref: RefObject<HTMLLabelElement | null>) {
  const el = ref.current
  if (!el) return
  el.classList.remove('shake')
  void el.offsetWidth
  el.classList.add('shake')
}

function focusInput(ref: RefObject<HTMLLabelElement | null>) {
  ref.current?.querySelector('input')?.focus()
}

const ICON_MAIL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m3.5 7.5 8.5 5.5 8.5-5.5" />
  </svg>
)

const ICON_KEY = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M17 12v3M20.5 12v2.5" />
  </svg>
)

const ICON_LOCK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.7" r="1.1" fill="currentColor" />
  </svg>
)

const ICON_ARROW = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
)

// Màn khôi phục mật khẩu admin qua OTP (P3-T6, design §4.4):
// 2 bước — email admin → OTP + mật khẩu mới. Anti-oracle: EF luôn trả ok ở
// bước gửi; chỉ verify OTP đúng (email phải trùng app_meta.admin_email) mới đổi
// được mật khẩu. Staff không tự khôi phục — thấy ngay STAFF_NOTE.
export default function RecoveryStage({ api = defaultRecoveryApi }: RecoveryStageProps) {
  const navigate = useNavigate()

  const [step, setStep] = useState<RecoveryStep>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<RecoveryFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const emailRef = useRef<HTMLLabelElement | null>(null)
  const otpRef = useRef<HTMLLabelElement | null>(null)
  const passRef = useRef<HTMLLabelElement | null>(null)

  // Đếm ngược gửi lại OTP (GoTrue chặn 60s/email)
  useEffect(() => {
    if (sentAt === null) return
    const deadline = sentAt + RESEND_COOLDOWN_MS
    const id = window.setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= deadline) window.clearInterval(id)
    }, 500)
    return () => window.clearInterval(id)
  }, [sentAt])

  useEffect(() => {
    if (step !== 'otp') return
    const id = window.setTimeout(() => focusInput(otpRef), 0)
    return () => window.clearTimeout(id)
  }, [step])

  function clearError(key: keyof RecoveryFormErrors) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  function goToLogin() {
    navigate('/login', { replace: true })
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHint(null)

    const emailError = validateEmail(email)
    setErrors(emailError ? { email: emailError } : {})
    if (emailError) {
      shake(emailRef)
      focusInput(emailRef)
      return
    }

    setSubmitting(true)
    const result = await api.requestOtp(email.trim())
    setSubmitting(false)
    if (!result.ok) {
      setErrors({ form: result.message })
      shake(emailRef)
      return
    }

    // Anti-oracle: EF luôn trả ok — hiển thị chung, không phán email đúng/sai.
    setErrors({})
    setSentAt(Date.now())
    setNow(Date.now())
    setHint(OTP_HINT)
    setStep('otp')
  }

  async function handleResend() {
    if (!canResend(sentAt, now) || submitting) return
    setErrors({})

    setSubmitting(true)
    const result = await api.requestOtp(email.trim())
    setSubmitting(false)
    if (!result.ok) {
      setErrors({ form: result.message })
      return
    }

    setSentAt(Date.now())
    setNow(Date.now())
    setHint('Đã gửi lại mã OTP.')
  }

  async function handleVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHint(null)

    const found: RecoveryFormErrors = {}
    const otpError = validateOtp(otp)
    const passwordError = validatePassword(password)
    if (otpError) found.otp = otpError
    if (passwordError) found.password = passwordError
    setErrors(found)
    if (otpError || passwordError) {
      const first = otpError ? otpRef : passRef
      shake(first)
      focusInput(first)
      return
    }

    setSubmitting(true)
    const result = await api.verify({
      email: email.trim(),
      token: otp.trim(),
      password,
    })
    setSubmitting(false)
    if (!result.ok) {
      setErrors({ form: result.message })
      shake(otpRef)
      return
    }

    navigate('/login', { replace: true, state: { recoveryDone: true } })
  }

  function backToEmail() {
    setStep('email')
    setErrors({})
    setHint(null)
    window.setTimeout(() => focusInput(emailRef), 0)
  }

  const resendReady = canResend(sentAt, now)

  return (
    <div className="login-page">
      <div className="phone">
        <div className="stage">
          <div className="logo" role="img" aria-label="Hẻm Trà" />

          {step === 'email' ? (
            <form className="card setup-card" onSubmit={(e) => void handleEmailSubmit(e)} noValidate>
              <h1 className="setup-title">Khôi phục mật khẩu</h1>
              <p className="setup-sub">Nhập email admin để nhận mã OTP</p>

              <label className="field" ref={emailRef}>
                <span className="ico" aria-hidden="true">
                  {ICON_MAIL}
                </span>
                <input
                  id="recovery-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  placeholder="Email admin"
                  aria-label="Email admin"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    clearError('email')
                  }}
                />
              </label>

              {errors.email && (
                <p className="error" role="alert">
                  {errors.email}
                </p>
              )}
              {errors.form && (
                <p className="error" role="alert">
                  {errors.form}
                </p>
              )}

              <button className="submit" type="submit" disabled={submitting}>
                {submitting ? 'Đang gửi…' : 'Gửi mã OTP'} {ICON_ARROW}
              </button>

              <p className="hint" role="status">
                {STAFF_NOTE}
              </p>

              <button className="link" type="button" onClick={goToLogin}>
                Quay lại đăng nhập
              </button>
            </form>
          ) : (
            <form className="card setup-card" onSubmit={(e) => void handleVerifySubmit(e)} noValidate>
              <h1 className="setup-title">Đặt mật khẩu mới</h1>
              <p className="setup-sub">{email}</p>

              <label className="field setup-otp" ref={otpRef}>
                <span className="ico" aria-hidden="true">
                  {ICON_KEY}
                </span>
                <input
                  id="recovery-otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Mã OTP"
                  aria-label="Mã OTP"
                  autoComplete="one-time-code"
                  aria-invalid={Boolean(errors.otp)}
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, ''))
                    clearError('otp')
                  }}
                />
              </label>

              <label className="field" ref={passRef}>
                <span className="ico" aria-hidden="true">
                  {ICON_LOCK}
                </span>
                <input
                  id="recovery-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mật khẩu mới"
                  aria-label="Mật khẩu mới"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.password)}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    clearError('password')
                  }}
                />
                <button
                  type="button"
                  className="toggle"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1.1" />
                      <path d="M9.9 9.9a4.2 4.2 0 0 0 4.2 4.2" />
                      <path d="m3 3 18 18" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </label>

              {errors.otp && (
                <p className="error" role="alert">
                  {errors.otp}
                </p>
              )}
              {errors.password && (
                <p className="error" role="alert">
                  {errors.password}
                </p>
              )}
              {errors.form && (
                <p className="error" role="alert">
                  {errors.form}
                </p>
              )}

              {hint && (
                <p className="hint" role="status">
                  {hint}
                </p>
              )}

              <button className="submit" type="submit" disabled={submitting}>
                {submitting ? 'Đang xử lý…' : 'Đặt mật khẩu mới'} {ICON_ARROW}
              </button>

              <button
                className="link"
                type="button"
                disabled={!resendReady || submitting}
                onClick={() => void handleResend()}
              >
                {resendReady ? 'Gửi lại mã' : `Gửi lại sau ${resendCooldownSeconds(sentAt, now)}s`}
              </button>

              <button className="link" type="button" onClick={backToEmail}>
                Đổi email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
