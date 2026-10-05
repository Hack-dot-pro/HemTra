import { z } from 'zod'
import type { UserProfile, UserRole } from './types'

export const USERNAME_REGEX = /^[a-z0-9._-]{2,30}$/

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Tên đăng nhập tối thiểu 2 ký tự')
    .max(30, 'Tên đăng nhập tối đa 30 ký tự')
    .regex(USERNAME_REGEX, 'Chỉ chứa chữ thường, số, dấu chấm (.), gạch dưới (_), gạch nối (-)'),
  displayName: z
    .string()
    .trim()
    .max(50, 'Tên hiển thị tối đa 50 ký tự')
    .optional(),
  password: z
    .string()
    .min(6, 'Mật khẩu bắt buộc tối thiểu 6 ký tự')
    .max(256, 'Mật khẩu quá dài'),
  role: z.literal('staff').default('staff'),
})

export const setPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(6, 'Mật khẩu mới tối thiểu 6 ký tự')
    .max(256, 'Mật khẩu mới quá dài'),
})

/**
 * Kiểm tra xem người dùng hiện tại có được phép xóa người dùng mục tiêu không.
 * - Chỉ admin mới có quyền xóa (§4.1)
 * - Không ai được xóa tài khoản admin (P9-T4)
 * - Không được tự xóa tài khoản của chính mình
 */
export function canDeleteUser(
  currentUser: { id: string; role: UserRole } | null | undefined,
  targetUser: UserProfile,
): boolean {
  if (!currentUser) return false
  if (currentUser.role !== 'admin') return false
  if (targetUser.role === 'admin') return false
  if (targetUser.id === currentUser.id) return false
  return true
}

/**
 * Kiểm tra xem người dùng hiện tại có được phép cấp lại / đặt mật khẩu cho người dùng mục tiêu không.
 * - Chỉ admin mới có quyền cấp lại / đặt mật khẩu người khác (§4.1)
 * - Không ai được cấp lại / đặt mật khẩu tài khoản admin qua menu này (P9-T4)
 */
export function canManageUserPassword(
  currentUser: { id: string; role: UserRole } | null | undefined,
  targetUser: UserProfile,
): boolean {
  if (!currentUser) return false
  if (currentUser.role !== 'admin') return false
  if (targetUser.role === 'admin') return false
  return true
}

/**
 * Định dạng ngày tạo hiển thị (theo giờ VN).
 */
export function formatUserCreatedAt(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    if (isNaN(d.getTime())) return isoDate
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return isoDate
  }
}

let cachedUsersList: UserProfile[] | null = null

export function getCachedUsersList(): UserProfile[] | null {
  return cachedUsersList
}

export function setCachedUsersList(list: UserProfile[] | null): void {
  cachedUsersList = list
}

export function resetUsersCache(): void {
  cachedUsersList = null
}
