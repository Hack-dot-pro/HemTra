import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, RotateCcw } from 'lucide-react'
import './login-stage.css'
import {
  clearSavedUsername,
  getSavedUsername,
  hasFormError,
  saveUsername,
  validateLoginForm,
  type LoginFormErrors,
} from './loginForm'
import { signIn, type SignInFn } from './signIn'
import { requestUnlockOtp, verifyUnlockOtp, type UnlockResult } from './loginApi'
import { IOS_INSTALL_GUIDE } from './install'
import { useInstallPrompt } from './useInstallPrompt'
import { useClearCache } from './useClearCache'
import { useBootstrapStatus } from '../setup/useBootstrapStatus'
import type { SetupApi } from '../setup/api'

export type LoginStageProps = {
  onSignIn?: SignInFn
  // DI cho test — mặc định đọc trạng thái bootstrap thật (P3-T3)
  bootstrapApi?: SetupApi
  // DI cho test — mặc định gọi EF auth-login (P3-T4)
  onUnlockSend?: (username: string) => Promise<UnlockResult>
  onUnlockVerify?: (username: string, token: string) => Promise<UnlockResult>
}

type SubmitStatus = 'idle' | 'submitting'

export default function LoginStage({
  onSignIn = signIn,
  bootstrapApi,
  onUnlockSend = requestUnlockOtp,
  onUnlockVerify = verifyUnlockOtp,
}: LoginStageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  // Đến từ màn thiết lập lần đầu (P3-T3) — hiện lời xác nhận rồi dọn state.
  const setupDone = Boolean((location.state as { setupDone?: boolean } | null)?.setupDone)
  // Phiên 7 ngày hết hạn bị tự đăng xuất (P3-T5) — hiện gợi ý đăng nhập lại.
  const sessionExpired = Boolean(
    (location.state as { sessionExpired?: boolean } | null)?.sessionExpired,
  )
  // Đặt lại mật khẩu thành công qua /recovery (P3-T6).
  const recoveryDone = Boolean(
    (location.state as { recoveryDone?: boolean } | null)?.recoveryDone,
  )
  // Đổi email khôi phục thành công qua /change-recovery-email (P3-T8).
  const changeEmailDone = Boolean(
    (location.state as { changeEmailDone?: boolean } | null)?.changeEmailDone,
  )
  const [savedUsername, setSavedUsername] = useState<string | null>(() => getSavedUsername() || null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [hint, setHint] = useState<string | null>(() => {
    if (changeEmailDone) return 'Đã đổi email khôi phục. Hãy đăng nhập bằng mật khẩu mới.'
    if (recoveryDone) return 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.'
    if (sessionExpired) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
    if (setupDone) return 'Thiết lập hoàn tất. Đăng nhập bằng tài khoản vừa tạo.'
    return null
  })
  const [showInstallModal, setShowInstallModal] = useState(false)
  // Khôi phục lượt đăng nhập qua OTP sau 5 lần sai (P3-T4, design §4.3)
  const [locked, setLocked] = useState(false)
  const [unlockSent, setUnlockSent] = useState(false)
  const [unlockOtp, setUnlockOtp] = useState('')
  const [unlockBusy, setUnlockBusy] = useState(false)
  const [unlockHint, setUnlockHint] = useState<string | null>(null)

  const userFieldRef = useRef<HTMLLabelElement | null>(null)
  const passFieldRef = useRef<HTMLLabelElement | null>(null)
  const unlockFieldRef = useRef<HTMLLabelElement | null>(null)
  const modalCloseRef = useRef<HTMLButtonElement | null>(null)

  const install = useInstallPrompt()
  const cache = useClearCache()
  const { status: bootstrapStatus } = useBootstrapStatus(bootstrapApi)

  useEffect(() => {
    if (setupDone || sessionExpired || recoveryDone || changeEmailDone)
      navigate('/login', { replace: true, state: null })
  }, [setupDone, sessionExpired, recoveryDone, changeEmailDone, navigate])

  useEffect(() => {
    if (!showInstallModal) return
    modalCloseRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowInstallModal(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showInstallModal])

  // Tự focus ô OTP khôi phục sau khi gửi mã
  useEffect(() => {
    if (!unlockSent) return
    const id = window.setTimeout(() => unlockFieldRef.current?.querySelector('input')?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [unlockSent])

  function shake(ref: RefObject<HTMLLabelElement | null>) {
    const el = ref.current
    if (!el) return
    el.classList.remove('shake')
    void el.offsetWidth
    el.classList.add('shake')
  }

  function onUsernameChange(value: string) {
    setUsername(value)
    if (errors.username) {
      setErrors((prev) => ({ ...prev, username: undefined }))
      userFieldRef.current?.classList.remove('shake')
    }
  }

  function onPasswordChange(value: string) {
    setPassword(value)
    if (errors.password) {
      setErrors((prev) => ({ ...prev, password: undefined }))
      passFieldRef.current?.classList.remove('shake')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHint(null)

    const values = { username: savedUsername ?? username, password }
    const found = validateLoginForm(values)
    setErrors(found)
    if (found.username) {
      shake(userFieldRef)
      userFieldRef.current?.querySelector('input')?.focus()
    } else if (found.password) {
      shake(passFieldRef)
      passFieldRef.current?.querySelector('input')?.focus()
    }
    if (hasFormError(found)) return

    setStatus('submitting')
    const result = await onSignIn(values.username.trim(), password, remember)
    if (!result.ok) {
      setStatus('idle')
      setPassword('')
      setErrors({ form: result.message })
      setLocked(Boolean(result.locked))
      setUnlockSent(false)
      setUnlockOtp('')
      setUnlockHint(null)
      shake(passFieldRef)
      passFieldRef.current?.querySelector('input')?.focus()
      return
    }

    saveUsername(values.username.trim(), remember)
    setStatus('idle')
    setErrors({})
    setLocked(false)
    navigate('/dashboard')
  }

  function handleChangeAccount() {
    clearSavedUsername()
    setSavedUsername(null)
    setUsername('')
    setPassword('')
    setErrors({})
    setRemember(true)
    setLocked(false)
    setUnlockSent(false)
    setUnlockOtp('')
    setUnlockHint(null)
  }

  // Khôi phục lượt đăng nhập: gửi OTP → nhập 6 số → mở khóa (P3-T4)
  async function handleUnlockSend() {
    const target = (savedUsername ?? username).trim()
    if (!target) {
      setErrors({ form: 'Vui lòng nhập tài khoản.' })
      return
    }
    setUnlockBusy(true)
    const result = await onUnlockSend(target)
    setUnlockBusy(false)
    if (!result.ok) {
      setErrors({ form: result.message })
      return
    }
    setErrors({})
    setUnlockSent(true)
    setUnlockHint(result.message)
  }

  async function handleUnlockVerify() {
    const target = (savedUsername ?? username).trim()
    if (!/^\d{6}$/.test(unlockOtp)) {
      setErrors({ form: 'Mã OTP gồm 6 chữ số.' })
      shake(unlockFieldRef)
      return
    }
    setUnlockBusy(true)
    const result = await onUnlockVerify(target, unlockOtp)
    setUnlockBusy(false)
    if (!result.ok) {
      setErrors({ form: result.message })
      shake(unlockFieldRef)
      return
    }
    setLocked(false)
    setUnlockSent(false)
    setUnlockOtp('')
    setUnlockHint(null)
    setErrors({})
    setHint(result.message || 'Đã khôi phục lượt đăng nhập. Hãy thử đăng nhập lại.')
  }

  async function handleInstallPrompt() {
    const outcome = await install.prompt()
    if (outcome === 'accepted') {
      setShowInstallModal(false)
    }
  }

  return (
    <div className="login-page">
      <div className="phone">
        <div className="stage">
          <div className="logo" role="img" aria-label="Hẻm Trà" />

          <form className="card" onSubmit={(e) => void handleSubmit(e)} noValidate autoComplete="on">
            {!savedUsername && (
              <label className="field" id="f-user" ref={userFieldRef}>
                <span className="ico" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="7.5" r="4" />
                    <path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5" />
                  </svg>
                </span>
                <input
                  id="user"
                  name="username"
                  type="text"
                  placeholder="Tài khoản"
                  autoComplete="username"
                  aria-label="Tài khoản"
                  aria-invalid={Boolean(errors.username)}
                  value={username}
                  onChange={(e) => onUsernameChange(e.target.value)}
                />
              </label>
            )}

            <label className="field" id="f-pass" ref={passFieldRef}>
              <span className="ico" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" />
                  <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                  <circle cx="12" cy="15.7" r="1.1" fill="currentColor" />
                </svg>
              </span>
              <input
                id="pass"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={savedUsername ? `Mật khẩu của ${savedUsername}` : 'Mật khẩu'}
                autoComplete="current-password"
                aria-label="Mật khẩu"
                aria-invalid={Boolean(errors.password)}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
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
                    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
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

            <label className="remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Ghi nhớ tài khoản</span>
            </label>

            <button className="submit" type="submit" disabled={status === 'submitting'}>
              {status === 'submitting' ? 'Đang đăng nhập…' : 'Đăng nhập'}
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
            </button>

            {savedUsername && (
              <button type="button" className="link" onClick={handleChangeAccount}>
                Đổi tài khoản
              </button>
            )}

            <button
              type="button"
              className="link"
              onClick={() => navigate('/recovery')}
            >
              Quên mật khẩu
            </button>

            {bootstrapStatus === 'not_bootstrapped' && (
              <button type="button" className="link" onClick={() => navigate('/setup')}>
                Thiết lập lần đầu
              </button>
            )}

            {locked && !unlockSent && (
              <button
                type="button"
                className="link"
                disabled={unlockBusy}
                onClick={() => void handleUnlockSend()}
              >
                {unlockBusy ? 'Đang gửi OTP…' : 'Gửi OTP khôi phục lượt đăng nhập'}
              </button>
            )}

            {locked && unlockSent && (
              <>
                <label className="field" id="f-unlock" ref={unlockFieldRef}>
                  <span className="ico" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="8" cy="14" r="4" />
                      <path d="M11 11 20 2M17 5l2 2M14 8l2 2" />
                    </svg>
                  </span>
                  <input
                    id="unlock-otp"
                    name="unlock-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Mã OTP khôi phục"
                    aria-label="Mã OTP khôi phục"
                    autoComplete="one-time-code"
                    aria-invalid={Boolean(errors.form)}
                    value={unlockOtp}
                    onChange={(e) => {
                      setUnlockOtp(e.target.value.replace(/\D/g, ''))
                      if (errors.form) setErrors((prev) => ({ ...prev, form: undefined }))
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="submit"
                  disabled={unlockBusy}
                  onClick={() => void handleUnlockVerify()}
                >
                  {unlockBusy ? 'Đang khôi phục…' : 'Khôi phục lượt đăng nhập'}
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
                </button>
                <button
                  type="button"
                  className="link"
                  disabled={unlockBusy}
                  onClick={() => setUnlockSent(false)}
                >
                  Gửi lại OTP
                </button>
                {unlockHint && (
                  <p className="hint" role="status">
                    {unlockHint}
                  </p>
                )}
              </>
            )}

            {hint && (
              <p className="hint" role="status">
                {hint}
              </p>
            )}
          </form>
        </div>

        <div className="topbar">
          {install.standalone ? (
            <button
              type="button"
              className="glass-btn bg-dark-glass"
              disabled={cache.busy}
              onClick={() => void cache.clear()}
            >
              <RotateCcw size={15} aria-hidden="true" />
              {cache.busy
                ? 'Đang xóa…'
                : cache.status === 'done'
                  ? 'Đã xóa cache'
                  : cache.status === 'error'
                    ? 'Thử lại'
                    : 'Xóa cache & Tải lại'}
            </button>
          ) : (
            <button
              type="button"
              className="glass-btn bg-dark-glass"
              onClick={() => setShowInstallModal(true)}
            >
              <Download size={15} aria-hidden="true" />
              Tải App
            </button>
          )}
        </div>

        <div className="login-copyright" aria-hidden="true">
          ENGINEERED BY VINH © 2026
        </div>
      </div>

      {showInstallModal && (
        <div
          className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4 overflow-y-auto"
          onClick={() => setShowInstallModal(false)}
        >
          <div
            className="glass-card w-full max-w-md p-5 text-left my-auto max-h-[90dvh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 id="install-modal-title" className="text-base font-semibold text-white">
                Cài đặt ứng dụng & Bộ nhớ đệm
              </h2>
              <button
                type="button"
                className="text-white/60 hover:text-white p-1 text-sm font-semibold"
                aria-label="Đóng bảng"
                onClick={() => setShowInstallModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {/* Nút tải / Cài đặt app */}
              <div className="rounded-lg bg-white/5 p-3.5 border border-white/10">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">
                  1. Cài đặt ứng dụng
                </p>
                <button
                  type="button"
                  className="glass-btn w-full justify-center py-2.5 font-medium"
                  onClick={() => void handleInstallPrompt()}
                >
                  <Download size={16} aria-hidden="true" />
                  Tải App
                </button>
                <div className="mt-3 text-xs text-white/80 space-y-1.5">
                  <p className="font-medium text-white/90">Hướng dẫn cài đặt trên iOS (Safari):</p>
                  <ol className="list-decimal space-y-1 pl-5 text-white/70 leading-relaxed">
                    {IOS_INSTALL_GUIDE.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Cảnh báo / Lưu ý iOS */}
              <div className="rounded-lg bg-amber-500/15 border border-amber-500/30 p-3 text-xs leading-relaxed text-amber-200">
                <p className="font-semibold text-amber-300 mb-1">
                  ⚠️ Lưu ý xử lý lỗi vào màn hình chính trên iOS:
                </p>
                <p>
                  Khi bấm Tải nếu không vào được màn hình chính trên iOS (hoặc bị kẹt ở màn hình cũ), vui lòng chọn nút <strong>“Xóa cache và tải lại”</strong> bên dưới để xử lý.
                </p>
              </div>

              {/* Nút xóa cache và tải lại */}
              <div className="rounded-lg bg-white/5 p-3.5 border border-white/10">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">
                  2. Xóa bộ nhớ đệm
                </p>
                <button
                  type="button"
                  className="glass-btn w-full justify-center py-2.5 font-medium"
                  disabled={cache.busy}
                  onClick={() => void cache.clear()}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  {cache.busy
                    ? 'Đang xóa…'
                    : cache.status === 'done'
                      ? 'Đã xóa cache'
                      : cache.status === 'error'
                        ? 'Thử lại'
                        : 'Xóa cache và tải lại'}
                </button>

                {/* Hướng dẫn xóa cache iOS thủ công */}
                <div className="mt-3 pt-3 border-t border-white/10 text-xs text-white/80 space-y-1.5">
                  <p className="font-medium text-white/90">
                    Hướng dẫn xóa cache trên iOS (nếu không dùng nút trên):
                  </p>
                  <ol className="list-decimal space-y-1 pl-5 text-white/70 leading-relaxed">
                    <li>Mở ứng dụng <strong>Cài đặt</strong> (Settings) trên iPhone/iPad.</li>
                    <li>Cuộn tìm và chọn <strong>Safari</strong> (hoặc trình duyệt đang dùng).</li>
                    <li>Chọn <strong>Xóa lịch sử và dữ liệu trang web</strong> (Clear History and Website Data).</li>
                    <li>Mở lại đường link Hẻm Trà.</li>
                  </ol>
                </div>
              </div>
            </div>

            <button
              ref={modalCloseRef}
              type="button"
              className="glass-btn mt-4 w-full justify-center"
              onClick={() => setShowInstallModal(false)}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
