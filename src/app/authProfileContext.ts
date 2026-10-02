// Bối cảnh role/flag đã kiểm tra của RequireAuth — P3-T8.
// RequireAuth đọc `profiles` (không tin claim) rồi chia sẻ xuống cho con:
// AppLayout ẩn/hiện link admin-only, trang đổi email khôi phục báo "chỉ admin".
// Không dùng Outlet context vì nó không tự lan qua nhiều tầng Outlet.

import { createContext, useContext } from 'react'
import type { AccessProfile } from '../features/auth/accessGuard'

export const AuthProfileContext = createContext<AccessProfile | null>(null)

export function useAuthProfile(): AccessProfile | null {
  return useContext(AuthProfileContext)
}
