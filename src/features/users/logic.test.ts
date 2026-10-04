import { describe, expect, it } from 'vitest'
import {
  canDeleteUser,
  canManageUserPassword,
  createUserSchema,
  formatUserCreatedAt,
  setPasswordSchema,
} from './logic'
import type { UserProfile } from './types'

const ADMIN_USER: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  username: 'admin',
  displayName: 'Quản trị viên',
  role: 'admin',
  mustChangePassword: false,
  createdBy: null,
  createdAt: '2026-10-01T08:00:00Z',
}

const STAFF_USER_1: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  username: 'staff1',
  displayName: 'Nhân viên 1',
  role: 'staff',
  mustChangePassword: true,
  createdBy: '00000000-0000-0000-0000-000000000001',
  createdAt: '2026-10-02T09:30:00Z',
}

const STAFF_USER_2: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  username: 'staff2',
  displayName: 'Nhân viên 2',
  role: 'staff',
  mustChangePassword: false,
  createdBy: '00000000-0000-0000-0000-000000000002',
  createdAt: '2026-10-03T10:15:00Z',
}

describe('User Management Logic', () => {
  describe('canDeleteUser', () => {
    it('admin có thể xóa tài khoản staff', () => {
      expect(canDeleteUser(ADMIN_USER, STAFF_USER_1)).toBe(true)
    })

    it('admin không thể tự xóa tài khoản của chính mình', () => {
      expect(canDeleteUser(ADMIN_USER, ADMIN_USER)).toBe(false)
    })

    it('không thể xóa tài khoản có role admin', () => {
      const otherAdmin: UserProfile = { ...ADMIN_USER, id: 'some-other-admin-id' }
      expect(canDeleteUser(ADMIN_USER, otherAdmin)).toBe(false)
    })

    it('staff không thể xóa bất kỳ ai', () => {
      expect(canDeleteUser(STAFF_USER_1, STAFF_USER_2)).toBe(false)
      expect(canDeleteUser(STAFF_USER_1, ADMIN_USER)).toBe(false)
      expect(canDeleteUser(STAFF_USER_1, STAFF_USER_1)).toBe(false)
    })

    it('chưa đăng nhập không thể xóa', () => {
      expect(canDeleteUser(null, STAFF_USER_1)).toBe(false)
    })
  })

  describe('canManageUserPassword', () => {
    it('admin có thể cấp lại / đặt mật khẩu cho staff', () => {
      expect(canManageUserPassword(ADMIN_USER, STAFF_USER_1)).toBe(true)
    })

    it('admin không thể cấp lại / đặt mật khẩu cho tài khoản admin qua menu này', () => {
      expect(canManageUserPassword(ADMIN_USER, ADMIN_USER)).toBe(false)
    })

    it('staff không thể cấp lại / đặt mật khẩu cho người khác', () => {
      expect(canManageUserPassword(STAFF_USER_1, STAFF_USER_2)).toBe(false)
      expect(canManageUserPassword(STAFF_USER_1, ADMIN_USER)).toBe(false)
    })
  })

  describe('createUserSchema', () => {
    it('chấp nhận username hợp lệ và tự động chuẩn hóa', () => {
      const res = createUserSchema.safeParse({
        username: 'nhanvien_01',
        displayName: 'Nhân viên 01',
      })
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.username).toBe('nhanvien_01')
        expect(res.data.role).toBe('staff')
      }
    })

    it('từ chối username có ký tự đặc biệt hoặc quá ngắn', () => {
      expect(createUserSchema.safeParse({ username: 'a' }).success).toBe(false)
      expect(createUserSchema.safeParse({ username: 'nhanvien@123' }).success).toBe(false)
      expect(createUserSchema.safeParse({ username: 'nhan vien' }).success).toBe(false)
    })

    it('từ chối mật khẩu dưới 6 ký tự nếu nhập', () => {
      expect(createUserSchema.safeParse({ username: 'testuser', password: '123' }).success).toBe(false)
      expect(createUserSchema.safeParse({ username: 'testuser', password: '' }).success).toBe(true)
      expect(createUserSchema.safeParse({ username: 'testuser', password: '123456' }).success).toBe(true)
    })
  })

  describe('setPasswordSchema', () => {
    it('chấp nhận mật khẩu hợp lệ ≥ 6 ký tự', () => {
      expect(setPasswordSchema.safeParse({ newPassword: 'password123' }).success).toBe(true)
    })

    it('từ chối mật khẩu < 6 ký tự', () => {
      expect(setPasswordSchema.safeParse({ newPassword: '12345' }).success).toBe(false)
    })
  })

  describe('formatUserCreatedAt', () => {
    it('định dạng ngày chuẩn tiếng Việt', () => {
      const res = formatUserCreatedAt('2026-10-01T08:00:00Z')
      expect(res).toMatch(/2026/)
    })

    it('trả về chuỗi gốc nếu ngày không hợp lệ', () => {
      expect(formatUserCreatedAt('invalid-date')).toBe('invalid-date')
    })
  })
})
