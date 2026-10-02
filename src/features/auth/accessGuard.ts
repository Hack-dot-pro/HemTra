// Route guard — P3-T7 (auth/skill.md §4): role lấy từ bảng `profiles`,
// KHÔNG tin claim client. Design §4.1: cả admin lẫn staff vào đủ 5 menu
// (không menu nào bị chặn theo role) — guard kiểm (1) phiên + profiles.role
// hợp lệ, (2) must_change_password → buộc qua /change-password lần đầu.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabase'

export type AccessRole = 'admin' | 'staff'
export type AccessProfile = { role: AccessRole; mustChangePassword: boolean }
export type AccessDecision = 'login' | 'change-password' | 'allow'

// Thuần để unit test: không có profiles → /login; must_change → /change-password
// (kể cả đang ở chính /change-password thì cho qua — tránh vòng lặp).
export function evaluateAccess(profile: AccessProfile | null, path: string): AccessDecision {
  if (!profile) return 'login'
  if (path === '/change-password') return 'allow'
  if (profile.mustChangePassword) return 'change-password'
  return 'allow'
}

// Đọc role + must_change_password từ profiles (RLS profiles_read qua
// session_fresh()). Trả null khi: chưa đăng nhập / không có row / role lạ →
// guard đưa về /login. Lỗi mạng (query error) thì NÉM LÊN — UI hiển thị
// "thử lại" thay vì đá người dùng ra ngoài chỉ vì mạng chập chờn.
export async function loadAccessProfile(
  client: SupabaseClient | null = getSupabase(),
): Promise<AccessProfile | null> {
  if (!client) return null
  const { data: auth } = await client.auth.getSession()
  const userId = auth.session?.user.id
  if (!userId) return null

  const { data, error } = await client
    .from('profiles')
    .select('role, must_change_password')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  const role = data.role === 'admin' || data.role === 'staff' ? data.role : null
  if (!role) return null
  return { role, mustChangePassword: Boolean(data.must_change_password) }
}
