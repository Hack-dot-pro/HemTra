// Cấu hình Supabase cho frontend — P3-T3, client + phiên P3-T5.
// Bất biến: frontend CHỈ dùng anon key (security/skill.md §1); mọi biến VITE_* đều công khai.
// Thiếu env → getSupabase() = null, caller phải degrade an toàn (không crash, không lộ lỗi console).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseUrl: string | null = url ? url.replace(/\/+$/, '') : null
export const supabaseAnonKey: string | null = anonKey || null
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// P3-T5 — nơi lưu "phiên theo ghi nhớ" (auth/skill.md §3):
//   "ghi nhớ" bật  → token + login_at ở localStorage (sống qua tab)
//   "ghi nhớ" tắt  → token + login_at ở sessionStorage (chết khi đóng tab)
export const REMEMBER_KEY = 'hemtra.remember'
export const LOGIN_AT_KEY = 'hemtra.login_at'

function safeWindow(): Window | null {
  return typeof window === 'undefined' ? null : window
}

export function isRemembered(): boolean {
  const w = safeWindow()
  if (!w) return false
  try {
    return w.localStorage.getItem(REMEMBER_KEY) === '1'
  } catch {
    return false
  }
}

/** Cửa hàng chứa phiên hiện tại (cùng nơi với token). */
export function authTargetStore(): Storage | null {
  const w = safeWindow()
  if (!w) return null
  try {
    return isRemembered() ? w.localStorage : w.sessionStorage
  } catch {
    return null
  }
}

// Storage route cho auth token của supabase-js: đọc/ghi theo cờ "ghi nhớ",
// nhưng XÓA khỏi cả hai cửa hàng (đăng xuất là đăng xuất — không sót token).
export const routedAuthStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem(key: string): string | null {
    try {
      return authTargetStore()?.getItem(key) ?? null
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      authTargetStore()?.setItem(key, value)
    } catch {
      // storage đầy/bị chặn — bỏ qua, không crash
    }
  },
  removeItem(key: string): void {
    const w = safeWindow()
    if (!w) return
    try {
      w.localStorage.removeItem(key)
      w.sessionStorage.removeItem(key)
    } catch {
      // bỏ qua
    }
  },
}

let client: SupabaseClient | null | undefined

// Lazy singleton — tránh tạo client khi module bị import trong test.
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client
  if (!supabaseUrl || !supabaseAnonKey) {
    client = null
    return client
  }
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: routedAuthStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  return client
}
