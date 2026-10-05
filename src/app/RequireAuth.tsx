import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  evaluateAccess,
  loadAccessProfile,
  type AccessProfile,
} from '../features/auth/accessGuard'
import { AuthProfileContext } from './authProfileContext'

type ProfileState =
  | { status: 'checking' }
  | { status: 'error' }
  | { status: 'ready'; profile: AccessProfile | null }

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
// Giữ profile đã tải trong state để chuyển menu/route mượt mà không chớp màn hình Đang tải...
export default function RequireAuth({ loadProfile = loadAccessProfile }: RequireAuthProps) {
  const location = useLocation()
  const [profileState, setProfileState] = useState<ProfileState>({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadProfile()
      .then((profile) => {
        if (cancelled) return
        setProfileState({ status: 'ready', profile })
      })
      .catch(() => {
        if (cancelled) return
        setProfileState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [loadProfile, attempt])

  if (profileState.status === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p role="status" className="text-sm text-white/80">
          Đang tải…
        </p>
      </div>
    )
  }

  if (profileState.status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="glass-card w-full max-w-sm p-6 text-center">
          <p role="alert" className="text-sm text-white/90">
            Không tải được thông tin tài khoản, thử lại.
          </p>
          <button
            type="button"
            className="glass-btn mt-4 w-full"
            onClick={() => {
              setProfileState({ status: 'checking' })
              setAttempt((a) => a + 1)
            }}
          >
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  const status = evaluateAccess(profileState.profile, location.pathname)

  if (status === 'login') return <Navigate to="/login" replace />
  if (status === 'change-password') {
    return <Navigate to="/change-password" replace state={{ forced: true }} />
  }

  // Cho qua → chia sẻ profiles đã kiểm cho con (P3-T8: link admin-only, trang
  // đổi email khôi phục) — AppLayout KHÔNG phải đọc lại profiles một lần nữa.
  return (
    <AuthProfileContext.Provider value={profileState.profile}>
      <Outlet />
    </AuthProfileContext.Provider>
  )
}
