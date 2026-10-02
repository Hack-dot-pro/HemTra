import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { validatePassword } from '../setup/logic'
import { defaultChangePasswordApi, type ChangePasswordApi } from './changePasswordApi'

export type ChangePasswordPageProps = { api?: ChangePasswordApi }

type PageErrors = Partial<Record<'current' | 'password' | 'confirm' | 'form', string>>

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

// P3-T7 — Đổi mật khẩu của chính mình, bắt buộc nhập mật khẩu cũ
// (design §4.1, cả admin & staff). Khi must_change_password=true guard ép vào
// đây lần đầu (đổi xong EF ghi cờ = false → vào app bình thường).
export default function ChangePasswordPage({ api = defaultChangePasswordApi }: ChangePasswordPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const forced = Boolean((location.state as { forced?: boolean } | null)?.forced)

  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<PageErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const currentRef = useRef<HTMLLabelElement | null>(null)
  const passRef = useRef<HTMLLabelElement | null>(null)
  const confirmRef = useRef<HTMLLabelElement | null>(null)

  function clearError(key: keyof PageErrors) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const found: PageErrors = {}
    if (!current.trim()) found.current = 'Vui lòng nhập mật khẩu hiện tại.'
    const passwordError = validatePassword(password)
    if (passwordError) found.password = passwordError
    if (!confirm.trim()) found.confirm = 'Vui lòng nhập lại mật khẩu mới.'
    else if (confirm !== password) found.confirm = 'Mật khẩu xác nhận không khớp.'
    setErrors(found)
    if (Object.keys(found).length > 0) {
      const first = found.current ? currentRef : found.password ? passRef : confirmRef
      shake(first)
      focusInput(first)
      return
    }

    setSubmitting(true)
    const result = await api.change({ currentPassword: current, newPassword: password })
    setSubmitting(false)
    if (!result.ok) {
      setErrors({ form: result.message })
      shake(currentRef)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <section className="glass-card mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Đổi mật khẩu</h1>
        <p className="mt-3 text-sm text-white/90" role="status">
          Đã đổi mật khẩu.
        </p>
        <button
          type="button"
          className="glass-btn glass-btn-primary mt-5 w-full"
          onClick={() => navigate('/dashboard', { replace: true })}
        >
          Tiếp tục
        </button>
      </section>
    )
  }

  return (
    <section className="glass-card mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Đổi mật khẩu</h1>
      <p className="mt-1 text-sm text-white/80">
        {forced
          ? 'Vui lòng đổi mật khẩu trước khi tiếp tục.'
          : 'Nhập mật khẩu hiện tại và mật khẩu mới.'}
      </p>

      <form className="mt-5 flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <label className="block" ref={currentRef}>
          <span className="mb-1 block text-sm text-white/85">Mật khẩu hiện tại</span>
          <input
            className="glass-input w-full"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            aria-label="Mật khẩu hiện tại"
            aria-invalid={Boolean(errors.current)}
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value)
              clearError('current')
            }}
          />
        </label>

        <label className="block" ref={passRef}>
          <span className="mb-1 block text-sm text-white/85">Mật khẩu mới</span>
          <input
            className="glass-input w-full"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            aria-label="Mật khẩu mới"
            aria-invalid={Boolean(errors.password)}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              clearError('password')
            }}
          />
        </label>

        <label className="block" ref={confirmRef}>
          <span className="mb-1 block text-sm text-white/85">Nhập lại mật khẩu mới</span>
          <input
            className="glass-input w-full"
            type={show ? 'text' : 'password'}
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
          aria-pressed={show}
          onClick={() => setShow((v) => !v)}
        >
          {show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        </button>

        {errors.current && (
          <p className="text-sm text-red-200" role="alert">
            {errors.current}
          </p>
        )}
        {errors.password && (
          <p className="text-sm text-red-200" role="alert">
            {errors.password}
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

        <button type="submit" className="glass-btn glass-btn-primary mt-1 w-full" disabled={submitting}>
          {submitting ? 'Đang xử lý…' : 'Đổi mật khẩu'}
        </button>
      </form>
    </section>
  )
}
