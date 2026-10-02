// Kiểm tra phiên hết hạn 7 ngày — P3-T5 (design §4.3: "hết hạn tự đăng xuất").
// Note: KHÔNG phải route guard theo role (đó là P3-T7) — chỉ chặn "phiên quá 7 ngày".

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabase'
import { endAuthSession, readLoginAt, SESSION_MAX_AGE_MS } from '../../lib/session'

export type SessionState = 'none' | 'expired' | 'ok'

// Hàm thuần để test biên 7 ngày mà không cần client/storage.
export function evaluateSession(
  hasSession: boolean,
  loginAt: number | null,
  now: number,
): SessionState {
  if (!hasSession) return 'none'
  // Có token nhưng mất login_at (bị dọn/tamper) → coi như hết hạn, đăng nhập lại
  if (loginAt === null) return 'expired'
  return now - loginAt > SESSION_MAX_AGE_MS ? 'expired' : 'ok'
}

export async function currentSessionState(
  now: number = Date.now(),
  client: SupabaseClient | null = getSupabase(),
): Promise<SessionState> {
  if (!client) return 'none'
  const { data } = await client.auth.getSession()
  // KHÔNG dọn login_at khi 'none' — applyAuthSession ghi login_at TRƯỚC khi
  // setSession, dọn ở đây sẽ nuốt login_at của lần đăng nhập đang chạy dở.
  return evaluateSession(Boolean(data.session), readLoginAt(), now)
}

// Chạy trong AppRoutes (đã nằm trong <BrowserRouter>).
export function useSessionExpiry(intervalMs = 60_000): void {
  const navigate = useNavigate()
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const state = await currentSessionState()
        if (cancelled || state !== 'expired') return
        await endAuthSession()
        if (cancelled) return
        navigate('/login', { replace: true, state: { sessionExpired: true } })
      } catch {
        // kiểm tra phiên không được phá app — lần sau thử lại
      }
    }
    void check()
    const id = window.setInterval(() => void check(), intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [navigate, intervalMs])
}
