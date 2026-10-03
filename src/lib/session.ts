// Phiên đăng nhập 7 ngày — P3-T5 (auth/skill.md §3, design §4.3).
// Client: "ghi nhớ" chọn nơi lưu token, lưu login_at, hết hạn → tự đăng xuất.
// Server: session_fresh() (mốc 7 ngày lấy từ auth.sessions.created_at của phiên
//         trong claim session_id — refresh không reset được, SEC-001) đã có trong
//         mọi policy RLS từ P1 — lớp này chỉ là lớp client, server vẫn là chặn cuối.

import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { LOGIN_AT_KEY, REMEMBER_KEY, authTargetStore, getSupabase } from './supabase'

export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const CANNOT_SAVE_SESSION = 'Không thể lưu phiên đăng nhập, thử lại sau.'

export type SessionCredentials = Pick<Session, 'access_token' | 'refresh_token'>

function rememberFlagStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readLoginAt(): number | null {
  const store = authTargetStore()
  if (!store) return null
  try {
    const raw = store.getItem(LOGIN_AT_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeLoginAt(at: number): void {
  try {
    authTargetStore()?.setItem(LOGIN_AT_KEY, String(at))
  } catch {
    // storage bị chặn — để evaluateSession coi là hết hạn (an toàn)
  }
}

export function removeLoginAt(): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(LOGIN_AT_KEY)
    window.sessionStorage.removeItem(LOGIN_AT_KEY)
  } catch {
    // bỏ qua
  }
}

// Thứ tự QUAN TRỌNG: cờ "ghi nhớ" → ghi login_at → setSession.
// (login_at luôn tồn tại trước khi token xuất hiện — không có khoảng trống
// mà evaluateSession thấy "token có mà login_at không" rồi đăng xuất oan.)
export async function applyAuthSession(
  session: SessionCredentials,
  remember: boolean,
  client: SupabaseClient | null = getSupabase(),
): Promise<void> {
  if (!client) throw new Error(CANNOT_SAVE_SESSION)
  if (!session.access_token || !session.refresh_token) throw new Error(CANNOT_SAVE_SESSION)

  try {
    rememberFlagStore()?.setItem(REMEMBER_KEY, remember ? '1' : '0')
  } catch {
    // flag không ghi được → token vẫn vào store đúng nhờ default, chấp nhận được
  }
  writeLoginAt(Date.now())

  const { error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (error) {
    removeLoginAt()
    throw new Error(error.message || CANNOT_SAVE_SESSION)
  }
}

// Đăng xuất cục bộ (không cần mạng): xóa token khỏi CẢ hai cửa hàng + login_at.
export async function endAuthSession(
  client: SupabaseClient | null = getSupabase(),
): Promise<void> {
  if (client) {
    try {
      await client.auth.signOut({ scope: 'local' })
    } catch {
      // mất mạng vẫn coi là đăng xuất local — token đã tự xóa
    }
  }
  removeLoginAt()
}
