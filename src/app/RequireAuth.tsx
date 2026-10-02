import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  evaluateAccess,
  loadAccessProfile,
  type AccessDecision,
  type AccessProfile,
} from '../features/auth/accessGuard'
import { AuthProfileContext } from './authProfileContext'

type Status = 'checking' | 'error' | AccessDecision
type Loaded = { path: string; status: Status; profile: AccessProfile | null }

export type RequireAuthProps = {
  /** DI cho test — mặc định đọc profiles thật (accessGuard.loadAccessProfile). */
  loadProfile?: () => Promise<AccessProfile | null>
}

// P3-T7 — bọc mọi route sau đăng nhập (design §4.1):
//   - chưa đăng nhập / profiles.role không hợp lệ → /login
//   - must_change_password=true → ép qua /change-password (trừ chính nó)
//   - lỗi mạng khi đọc profiles → màn "thử lại" (không đá ra login vì mạng chập chờn)
// P3-T8: profiles đã kiểm được chia sẻ cho subtree (AuthProfileContext) —
//   link admin-only ở AppLayout không phải đọc lại bảng profiles.
export default function RequireAuth({ loadProfile = loadAccessProfile }: RequireAuthProps) {
  const location = useLocation()
  // Kết quả gắn với pathname đã kiểm — đổi route mà chưa có kết quả mới (kể cả
  // kết quả cũ của route khác) → "đang kiểm tra", không chớp nhoáng trang cũ.
  const [result, setResult] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadProfile()
      .then((profile) => {
        if (cancelled) return
        setResult({
          path: location.pathname,
          status: evaluateAccess(profile, location.pathname),
          profile,
        })
      })
      .catch(() => {
        if (cancelled) return
        setResult({ path: location.pathname, status: 'error', profile: null })
      })
    return () => {
      cancelled = true
    }
  }, [loadProfile, location.pathname, attempt])

  const loaded: Loaded | null =
    result && result.path === location.pathname ? result : null
  const status: Status = loaded ? loaded.status : 'checking'

  if (status === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p role="status" className="text-sm text-white/80">
          Đang tải…
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="glass-card w-full max-w-sm p-6 text-center">
          <p role="alert" className="text-sm text-white/90">
            Không tải được thông tin tài khoản, thử lại.
          </p>
          <button type="button" className="glass-btn mt-4 w-full" onClick={() => setAttempt((a) => a + 1)}>
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  if (status === 'login') return <Navigate to="/login" replace />
  if (status === 'change-password') {
    return <Navigate to="/change-password" replace state={{ forced: true }} />
  }
  // Cho qua → chia sẻ profiles đã kiểm cho con (P3-T8: link admin-only, trang
  // đổi email khôi phục) — AppLayout KHÔNG phải đọc lại profiles một lần nữa.
  return (
    <AuthProfileContext.Provider value={loaded?.profile ?? null}>
      <Outlet />
    </AuthProfileContext.Provider>
  )
}
