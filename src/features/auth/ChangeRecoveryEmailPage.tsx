import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { validateEmail, validateOtp, validatePassword, canResend, resendCooldownSeconds, RESEND_COOLDOWN_MS } from '../setup/logic'
import { endAuthSession } from '../../lib/session'
import { useAuthProfile } from '../../app/authProfileContext'
import { defaultChangeRecoveryEmailApi, type ChangeRecoveryEmailApi } from './changeRecoveryEmailApi'

export type ChangeRecoveryEmailPageProps = { api?: ChangeRecoveryEmailApi }

// P3-T8 — "Đổi email khôi phục" (đổi key admin, design §4.4 + Q-005):
// 3 bước, client giữ trạng thái (EF stateless, kiểm lại cả 2 điều kiện ở server):
//   1) mật khẩu admin hiện tại  → request-current  (OTP gửi tới email HIỆN TẠI)
//   2) OTP email hiện tại + email mới → request-new (OTP gửi tới email MỚI)
//   3) OTP email mới + mật khẩu mới  → complete (server kiểm 2 OTP + mật khẩu)
// Thành công: server đã đổi auth.users.email + app_meta.admin_email và HỦY phiên
// cũ → đăng xuất cục bộ, về /login gợi ý đăng nhập bằng mật khẩu mới.
type Step = 'password' | 'current' | 'new' | 'done'
type PageErrors = Partial<Record<'password' | 'otpCurrent' | 'email' | 'otpNew' | 'password2' | 'confirm' | 'form', string>>

const OTP_CURRENT_HINT = 'Mã OTP đã gửi tới email khôi phục HIỆN TẠI (hết hạn sau 10 phút).'
const OTP_NEW_HINT = 'Mã OTP đã gửi tới email mới.'

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

export default function ChangeRecoveryEmailPage({
  api = defaultChangeRecoveryEmailApi,
}: ChangeRecoveryEmailPageProps) {
  const navigate = useNavigate()
  const profile = useAuthProfile()

  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [otpCurrent, setOtpCurrent] = useState('')
  const [email, setEmail] = useState('')
  const [otpNew, setOtpNew] = useState('')
  const [password2, setPassword2] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<PageErrors>({})
  const [hint, setHint] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [doneMessage, setDoneMessage] = useState('')

  const passwordRef = useRef<HTMLLabelElement | null>(null)
  const otpCurrentRef = useRef<HTMLLabelElement | null>(null)
  const emailRef = useRef<HTMLLabelElement | null>(null)
  const otpNewRef = useRef<HTMLLabelElement | null>(null)
  const password2Ref = useRef<HTMLLabelElement | null>(null)
  const confirmRef = useRef<HTMLLabelElement | null>(null)

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

  function clearError(key: keyof PageErrors) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  function markSent() {
    setSentAt(Date.now())
    setNow(Date.now())
  }

  function fail(message: string, ref: RefObject<HTMLLabelElement | null>) {
    setErrors({ form: message })
    shake(ref)
    focusInput(ref)
  }

  // Bước 1 — mật khẩu admin hiện tại (điều kiện 1a)
  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHint(null)
    const found: PageErrors = {}
    const passwordError = validatePassword(password)
    if (passwordError) found.password = passwordError
    setErrors(found)
    if (passwordError) {
      shake(passwordRef)
      focusInput(passwordRef)
      return
    }

    setSubmitting(true)
    const result = await api.requestCurrent(password)
    setSubmitting(false)
    if (!result.ok) return fail(result.message, passwordRef)

    markSent()
    setHint(OTP_CURRENT_HINT)
    setStep('current')
  }

  // Bước 2 — OTP email hiện tại (điều kiện 1b) + email mới (điều kiện 2, gửi OTP)
  async function handleCurrentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHint(null)
    const found: PageErrors = {}
    const otpError = validateOtp(otpCurrent)
    const emailError = validateEmail(email)
    if (otpError) found.otpCurrent = otpError
    if (emailError) found.email = emailError
    setErrors(found)
    if (otpError || emailError) {
      const first = otpError ? otpCurrentRef : emailRef
      shake(first)
      focusInput(first)
      return
    }

    setSubmitting(true)
    const result = await api.requestNew(email)
    setSubmitting(false)
    if (!result.ok) return fail(result.message, otpNewRef)

    markSent()
    setHint(OTP_NEW_HINT)
    setStep('new')
  }

  // Bước 3 — OTP email mới (điều kiện 2) + mật khẩu mới → complete
  async function handleCompleteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHint(null)
    const found: PageErrors = {}
    const otpError = validateOtp(otpNew)
    const passwordError = validatePassword(password2)
    if (otpError) found.otpNew = otpError
    if (passwordError) found.password2 = passwordError
    if (!confirm.trim()) found.confirm = 'Vui lòng nhập lại mật khẩu mới.'
    else if (confirm !== password2) found.confirm = 'Mật khẩu xác nhận không khớp.'
    setErrors(found)
    if (otpError || passwordError || found.confirm) {
      const first = otpError ? otpNewRef : passwordError ? password2Ref : confirmRef
      shake(first)
      focusInput(first)
      return
    }

    setSubmitting(true)
    const result = await api.complete({
      password,
      currentToken: otpCurrent,
      newEmail: email,
      newToken: otpNew,
      newPassword: password2,
    })
    setSubmitting(false)
    if (!result.ok) return fail(result.message, otpNewRef)

    // Server đã đổi email + mật khẩu và hủy phiên cũ → đăng xuất cục bộ ngay,
    // không để token "mồ côi" nằm lại trong storage (AGENT.md §6).
    void endAuthSession()
    setDoneMessage(
      result.message || 'Đã đổi email khôi phục. Hãy đăng nhập bằng mật khẩu mới.',
    )
    setStep('done')
  }

  async function resendCurrentOtp() {
    if (!canResend(sentAt, now) || submitting) return
    setSubmitting(true)
    const result = await api.requestCurrent(password)
    setSubmitting(false)
    if (!result.ok) return fail(result.message, otpCurrentRef)
    markSent()
    setHint('Đã gửi lại mã OTP tới email hiện tại.')
  }

  async function resendNewOtp() {
    if (!canResend(sentAt, now) || submitting) return
    setSubmitting(true)
    const result = await api.requestNew(email)
    setSubmitting(false)
    if (!result.ok) return fail(result.message, otpNewRef)
    markSent()
    setHint('Đã gửi lại mã OTP tới email mới.')
  }

  // Nhân viên: server cũng chặn (403) — nói rõ ngay, không để mò 3 bước.
  if (profile?.role === 'staff') {
    return (
      <section className="glass-card mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Đổi email khôi phục</h1>
        <p className="mt-3 text-sm text-white/90" role="status">
          Chỉ admin mới dùng chức năng này. Vui lòng liên hệ admin nếu cần đổi email
          khôi phục.
        </p>
        <button
          type="button"
          className="glass-btn glass-btn-primary mt-5 w-full"
          onClick={() => navigate('/dashboard', { replace: true })}
        >
          Về trang chính
        </button>
      </section>
    )
  }

  if (step === 'done') {
    return (
      <section className="glass-card mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Đổi email khôi phục</h1>
        <p className="mt-3 text-sm text-white/90" role="status">
          {doneMessage}
        </p>
        <button
          type="button"
          className="glass-btn glass-btn-primary mt-5 w-full"
          onClick={() => navigate('/login', { replace: true, state: { changeEmailDone: true } })}
        >
          Đăng nhập lại
        </button>
      </section>
    )
  }

  const resendReady = canResend(sentAt, now)

  return (
    <section className="glass-card mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Đổi email khôi phục</h1>
      <p className="mt-1 text-sm text-white/80">
        {step === 'password' && 'Bước 1/3 — xác thực bằng mật khẩu admin hiện tại.'}
        {step === 'current' && 'Bước 2/3 — OTP email hiện tại và email mới.'}
        {step === 'new' && 'Bước 3/3 — OTP email mới và mật khẩu mới.'}
      </p>

      {step === 'password' && (
        <form className="mt-5 flex flex-col gap-3" onSubmit={(e) => void handlePasswordSubmit(e)} noValidate>
          <label className="block" ref={passwordRef}>
            <span className="mb-1 block text-sm text-white/85">Mật khẩu admin hiện tại</span>
            <input
              className="glass-input w-full"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              aria-label="Mật khẩu admin hiện tại"
              aria-invalid={Boolean(errors.password)}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                clearError('password')
              }}
            />
          </label>

          <button
            type="button"
            className="glass-btn self-start text-xs"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          </button>

          {errors.password && (
            <p className="text-sm text-red-200" role="alert">
              {errors.password}
            </p>
          )}
          {errors.form && (
            <p className="text-sm text-red-200" role="alert">
              {errors.form}
            </p>
          )}
          {hint && (
            <p className="text-xs text-white/75" role="status">
              {hint}
            </p>
          )}

          <button type="submit" className="glass-btn glass-btn-primary mt-1 w-full" disabled={submitting}>
            {submitting ? 'Đang gửi…' : 'Gửi mã OTP'}
          </button>
        </form>
      )}

      {step === 'current' && (
        <form className="mt-5 flex flex-col gap-3" onSubmit={(e) => void handleCurrentSubmit(e)} noValidate>
          <label className="block" ref={otpCurrentRef}>
            <span className="mb-1 block text-sm text-white/85">Mã OTP email hiện tại</span>
            <input
              className="glass-input w-full"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              aria-label="Mã OTP email hiện tại"
              aria-invalid={Boolean(errors.otpCurrent)}
              value={otpCurrent}
              onChange={(e) => {
                setOtpCurrent(e.target.value.replace(/\D/g, ''))
                clearError('otpCurrent')
              }}
            />
          </label>

          <label className="block" ref={emailRef}>
            <span className="mb-1 block text-sm text-white/85">Email khôi phục mới</span>
            <input
              className="glass-input w-full"
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-label="Email khôi phục mới"
              aria-invalid={Boolean(errors.email)}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clearError('email')
              }}
            />
          </label>

          {errors.otpCurrent && (
            <p className="text-sm text-red-200" role="alert">
              {errors.otpCurrent}
            </p>
          )}
          {errors.email && (
            <p className="text-sm text-red-200" role="alert">
              {errors.email}
            </p>
          )}
          {errors.form && (
            <p className="text-sm text-red-200" role="alert">
              {errors.form}
            </p>
          )}
          {hint && (
            <p className="text-xs text-white/75" role="status">
              {hint}
            </p>
          )}

          <button type="submit" className="glass-btn glass-btn-primary mt-1 w-full" disabled={submitting}>
            {submitting ? 'Đang gửi…' : 'Gửi OTP email mới'}
          </button>

          <div className="flex justify-between">
            <button
              type="button"
              className="glass-btn text-xs"
              disabled={!resendReady || submitting}
              onClick={() => void resendCurrentOtp()}
            >
              {resendReady ? 'Gửi lại OTP hiện tại' : `Gửi lại sau ${resendCooldownSeconds(sentAt, now)}s`}
            </button>
            <button
              type="button"
              className="glass-btn text-xs"
              onClick={() => {
                setStep('password')
                setErrors({})
                setHint(null)
                window.setTimeout(() => focusInput(passwordRef), 0)
              }}
            >
              Quay lại
            </button>
          </div>
        </form>
      )}

      {step === 'new' && (
        <form className="mt-5 flex flex-col gap-3" onSubmit={(e) => void handleCompleteSubmit(e)} noValidate>
          <label className="block" ref={otpNewRef}>
            <span className="mb-1 block text-sm text-white/85">Mã OTP email mới</span>
            <input
              className="glass-input w-full"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              aria-label="Mã OTP email mới"
              aria-invalid={Boolean(errors.otpNew)}
              value={otpNew}
              onChange={(e) => {
                setOtpNew(e.target.value.replace(/\D/g, ''))
                clearError('otpNew')
              }}
            />
          </label>

          <label className="block" ref={password2Ref}>
            <span className="mb-1 block text-sm text-white/85">Mật khẩu mới</span>
            <input
              className="glass-input w-full"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-label="Mật khẩu mới"
              aria-invalid={Boolean(errors.password2)}
              value={password2}
              onChange={(e) => {
                setPassword2(e.target.value)
                clearError('password2')
              }}
            />
          </label>

          <label className="block" ref={confirmRef}>
            <span className="mb-1 block text-sm text-white/85">Nhập lại mật khẩu mới</span>
            <input
              className="glass-input w-full"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-label="Nhập lại mật khẩu mới"
              aria-invalid={Boolean(errors.confirm)}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                clearError('confirm')
              }}
            />
          </label>

          <button
            type="button"
            className="glass-btn self-start text-xs"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          </button>

          {errors.otpNew && (
            <p className="text-sm text-red-200" role="alert">
              {errors.otpNew}
            </p>
          )}
          {errors.password2 && (
            <p className="text-sm text-red-200" role="alert">
              {errors.password2}
            </p>
          )}
          {errors.confirm && (
            <p className="text-sm text-red-200" role="alert">
              {errors.confirm}
            </p>
          )}
          {errors.form && (
            <p className="text-sm text-red-200" role="alert">
              {errors.form}
            </p>
          )}
          {hint && (
            <p className="text-xs text-white/75" role="status">
              {hint}
            </p>
          )}

          <button type="submit" className="glass-btn glass-btn-primary mt-1 w-full" disabled={submitting}>
            {submitting ? 'Đang xử lý…' : 'Hoàn tất đổi email'}
          </button>

          <div className="flex justify-between">
            <button
              type="button"
              className="glass-btn text-xs"
              disabled={!resendReady || submitting}
              onClick={() => void resendNewOtp()}
            >
              {resendReady ? 'Gửi lại OTP mới' : `Gửi lại sau ${resendCooldownSeconds(sentAt, now)}s`}
            </button>
            <button
              type="button"
              className="glass-btn text-xs"
              onClick={() => {
                setStep('current')
                setErrors({})
                setHint(null)
                window.setTimeout(() => focusInput(otpCurrentRef), 0)
              }}
            >
              Quay lại
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
