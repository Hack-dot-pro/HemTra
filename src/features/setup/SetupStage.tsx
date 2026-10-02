import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import '../auth/login-stage.css'
import './setup.css'
import { saveUsername } from '../auth/loginForm'
import { defaultApi, type ApiFail, type SetupApi } from './api'
import {
  RESEND_COOLDOWN_MS,
  canResend,
  hasSetupError,
  normalizeUsername,
  resendCooldownSeconds,
  validateStepEmail,
  validateStepOtp,
  type SetupFormErrors,
  type SetupStep,
} from './logic'
import { useBootstrapStatus } from './useBootstrapStatus'

export type SetupStageProps = { api?: SetupApi }

const OTP_HINT = 'Mã OTP đã được gửi đến email admin (hết hạn sau 10 phút).'
const CHECK_ERROR = 'Không thể kiểm tra trạng thái hệ thống. Thử lại sau.'

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

const ICON_USER = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="7.5" r="4" />
    <path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5" />
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

export default function SetupStage({ api = defaultApi }: SetupStageProps) {
  const navigate = useNavigate()
  const { status, refresh } = useBootstrapStatus(api)

  const [step, setStep] = useState<SetupStep>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<SetupFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const emailRef = useRef<HTMLLabelElement | null>(null)
  const otpRef = useRef<HTMLLabelElement | null>(null)
  const userRef = useRef<HTMLLabelElement | null>(null)
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

  function clearError(key: keyof SetupFormErrors) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  function goToLogin() {
    navigate('/login', { replace: true })
  }

  // EF trả 409 "đã thiết lập" → người khác bootstrap xong giữa chừng: thoát ngay.
  function failAndMaybeExit(result: ApiFail): boolean {
    if (result.alreadyDone) {
      goToLogin()
      return true
    }
    setErrors({ form: result.message })
    shake(step === 'email' ? emailRef : passRef)
    return false
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHint(null)

    const found = validateStepEmail({ email })
    setErrors(found)
    if (found.email) {
      shake(emailRef)
      focusInput(emailRef)
      return
    }

    setSubmitting(true)
    const result = await api.requestOtp(email.trim())
    setSubmitting(false)
    if (!result.ok) {
      failAndMaybeExit(result)
      return
    }

    // Anti-oracle: EF luôn trả ok với email hợp lệ — hiển thị chung, không phán email đúng/sai.
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
      failAndMaybeExit(result)
      return
    }

    setSentAt(Date.now())
    setNow(Date.now())
    setHint('Đã gửi lại mã OTP.')
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHint(null)

    const found = validateStepOtp({ otp, username, password })
    setErrors(found)
    if (hasSetupError(found)) {
      const first = found.otp ? otpRef : found.username ? userRef : passRef
      shake(first)
      focusInput(first)
      return
    }

    setSubmitting(true)
    const result = await api.complete({
      email: email.trim(),
      token: otp.trim(),
      username: normalizeUsername(username),
      password,
    })
    setSubmitting(false)
    if (!result.ok) {
      failAndMaybeExit(result)
      return
    }

    // Đăng nhập ngay ở màn login: chỉ nhớ username, không bao giờ lưu mật khẩu.
    saveUsername(normalizeUsername(username), true)
    navigate('/login', { replace: true, state: { setupDone: true } })
  }

  function backToEmail() {
    setStep('email')
    setErrors({})
    setHint(null)
    window.setTimeout(() => focusInput(emailRef), 0)
  }

  if (status === 'loading') {
    return (
      <div className="login-page">
        <div className="phone">
          <div className="stage">
            <div className="logo" role="img" aria-label="Hẻm Trà" />
            <div className="card setup-card" role="status">
              <p className="setup-status">Đang kiểm tra trạng thái…</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="login-page">
        <div className="phone">
          <div className="stage">
            <div className="logo" role="img" aria-label="Hẻm Trà" />
            <div className="card setup-card">
              <p className="error" role="alert">
                {CHECK_ERROR}
              </p>
              <button className="submit" type="button" onClick={refresh}>
                Thử lại {ICON_ARROW}
              </button>
              <button className="link" type="button" onClick={goToLogin}>
                Quay lại đăng nhập
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'bootstrapped') return <Navigate to="/login" replace />

  const resendReady = canResend(sentAt, now)

  return (
    <div className="login-page">
      <div className="phone">
        <div className="stage">
          <div className="logo" role="img" aria-label="Hẻm Trà" />

          {step === 'email' ? (
            <form className="card setup-card" onSubmit={(e) => void handleEmailSubmit(e)} noValidate>
              <h1 className="setup-title">Thiết lập lần đầu</h1>
              <p className="setup-sub">Tạo tài khoản quản trị viên</p>

              <label className="field" ref={emailRef}>
                <span className="ico" aria-hidden="true">
                  {ICON_MAIL}
                </span>
                <input
                  id="setup-email"
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

              <button className="link" type="button" onClick={goToLogin}>
                Quay lại đăng nhập
              </button>
            </form>
          ) : (
            <form className="card setup-card" onSubmit={(e) => void handleOtpSubmit(e)} noValidate>
              <h1 className="setup-title">Đặt tài khoản</h1>
              <p className="setup-sub">{email}</p>

              <label className="field setup-otp" ref={otpRef}>
                <span className="ico" aria-hidden="true">
                  {ICON_KEY}
                </span>
                <input
                  id="setup-otp"
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

              <label className="field" ref={userRef}>
                <span className="ico" aria-hidden="true">
                  {ICON_USER}
                </span>
                <input
                  id="setup-username"
                  name="username"
                  type="text"
                  placeholder="Tài khoản admin"
                  aria-label="Tài khoản"
                  autoComplete="username"
                  aria-invalid={Boolean(errors.username)}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    clearError('username')
                  }}
                />
              </label>

              <label className="field" ref={passRef}>
                <span className="ico" aria-hidden="true">
                  {ICON_LOCK}
                </span>
                <input
                  id="setup-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mật khẩu"
                  aria-label="Mật khẩu"
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
                </button>
              </label>

              {errors.otp && (
                <p className="error" role="alert">
                  {errors.otp}
                </p>
              )}
              {errors.username && (
                <p className="error" role="alert">
                  {errors.username}
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
                {submitting ? 'Đang hoàn tất…' : 'Hoàn tất thiết lập'} {ICON_ARROW}
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
