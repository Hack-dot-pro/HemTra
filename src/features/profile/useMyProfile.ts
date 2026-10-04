// P12-T9 — hook đọc hồ sơ CỦA MÌNH (tên hiển thị/tên đăng nhập/avatar) cho
// header + modal profile. Tách khỏi AuthProfileContext (chỉ có role/mustChange)
// để khỏi đổi context → khỏi đụng RequireAuth test.
import { useCallback, useEffect, useState } from 'react'
import { avatarImageUrl, myProfile, type MyProfile } from './api'

export type MyProfileState = {
  profile: MyProfile | null
  loading: boolean
  /** Gọi sau khi modal hồ sơ lưu xong → header hiện tên/avatar mới ngay. */
  refresh: () => void
  setProfile: (profile: MyProfile) => void
}

export function useMyProfile(): MyProfileState {
  // loading=true khi CHƯA có kết quả lần nào (setState đồng bộ trong effect
  // bị react-hooks/set-state-in-effect chặn).
  const [state, setState] = useState<{ profile: MyProfile | null; done: boolean }>({
    profile: null,
    done: false,
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    myProfile()
      .then((row) => {
        if (!cancelled) setState({ profile: row, done: true })
      })
      .catch((error) => {
        console.error('[useMyProfile]', error)
        if (!cancelled) setState({ profile: null, done: true })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const refresh = useCallback(() => setAttempt((value) => value + 1), [])
  const setProfile = useCallback((profile: MyProfile) => setState({ profile, done: true }), [])
  return { profile: state.profile, loading: !state.done, refresh, setProfile }
}

/** Signed URL avatar (dùng cho ảnh nhỏ ở header — lỗi mạng thì để trống → fallback chữ). */
export function useAvatarUrl(path: string | null | undefined): { avatarUrl: string | null } {
  const [state, setState] = useState<{ path: string; url: string | null }>({
    path: '',
    url: null,
  })

  useEffect(() => {
    if (!path) return
    let cancelled = false
    avatarImageUrl(path)
      .then((url) => {
        if (!cancelled) setState({ path, url })
      })
      .catch(() => {
        if (!cancelled) setState({ path, url: null })
      })
    return () => {
      cancelled = true
    }
  }, [path])

  // path đổi mà chưa có kết quả mới → không hiện ảnh cũ của path khác.
  return { avatarUrl: path && state.path === path ? state.url : null }
}
