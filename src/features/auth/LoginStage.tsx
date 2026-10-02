import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { signIn, type SignInResult } from './signIn'
import { IOS_INSTALL_GUIDE } from './install'
import { useInstallPrompt } from './useInstallPrompt'
import { useClearCache } from './useClearCache'

export type LoginStageProps = {
  onSignIn?: (username: string, password: string) => Promise<SignInResult>
}

type SubmitStatus = 'idle' | 'submitting'

export default function LoginStage({ onSignIn = signIn }: LoginStageProps) {
  const navigate = useNavigate()
  const [savedUsername, setSavedUsername] = useState<string | null>(() => getSavedUsername() || null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [hint, setHint] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  const userFieldRef = useRef<HTMLLabelElement | null>(null)
  const passFieldRef = useRef<HTMLLabelElement | null>(null)
  const guideCloseRef = useRef<HTMLButtonElement | null>(null)

  const install = useInstallPrompt()
  const cache = useClearCache()

  useEffect(() => {
    if (!showGuide) return
    guideCloseRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowGuide(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showGuide])

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
    const result = await onSignIn(values.username.trim(), password)
    if (!result.ok) {
      setStatus('idle')
      setPassword('')
      setErrors({ form: result.message })
      shake(passFieldRef)
      passFieldRef.current?.querySelector('input')?.focus()
      return
    }

    saveUsername(values.username.trim(), remember)
    setStatus('idle')
    setErrors({})
    navigate('/dashboard')
  }

  function handleChangeAccount() {
    clearSavedUsername()
    setSavedUsername(null)
    setUsername('')
    setPassword('')
    setErrors({})
    setRemember(true)
  }

  async function handleInstall() {
    const outcome = await install.prompt()
    if (outcome === 'unavailable') setShowGuide(true)
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
              onClick={() => setHint('Liên hệ admin để được cấp lại mật khẩu.')}
            >
              Quên mật khẩu
            </button>

            {hint && (
              <p className="hint" role="status">
                {hint}
              </p>
            )}
          </form>
        </div>

        <div className="topbar">
          {install.visible && (
            <button type="button" className="glass-btn bg-dark-glass" onClick={() => void handleInstall()}>
              <Download size={15} aria-hidden="true" />
              Tải App
            </button>
          )}
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
        </div>
      </div>

      {showGuide && (
        <div
          className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="glass-card w-full max-w-sm p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-guide-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="install-guide-title" className="text-lg font-semibold">
              Cài Hẻm Trà trên iPhone
            </h2>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-white/90">
              {IOS_INSTALL_GUIDE.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <button
              ref={guideCloseRef}
              type="button"
              className="glass-btn mt-4 w-full"
              onClick={() => setShowGuide(false)}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
