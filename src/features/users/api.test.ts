import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createUser, deleteUser, fetchUsers, resetPassword, setPassword } from './api'
import { getSupabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  getSupabase: vi.fn(),
}))

describe('Users API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchUsers', () => {
    it('tải danh sách user thành công và ánh xạ creatorUsername', async () => {
      const mockProfiles = [
        {
          id: 'u1',
          username: 'admin',
          display_name: 'Admin',
          role: 'admin',
          must_change_password: false,
          created_by: null,
          created_at: '2026-10-01T00:00:00Z',
        },
        {
          id: 'u2',
          username: 'staff1',
          display_name: 'Staff 1',
          role: 'staff',
          must_change_password: true,
          created_by: 'u1',
          created_at: '2026-10-02T00:00:00Z',
        },
      ]

      const selectMock = vi.fn().mockReturnThis()
      const orderMock = vi.fn().mockResolvedValue({ data: mockProfiles, error: null })
      selectMock.mockReturnValue({ order: orderMock })

      vi.mocked(getSupabase).mockReturnValue({
        from: vi.fn().mockReturnValue({ select: selectMock }),
      } as unknown as SupabaseClient)

      const users = await fetchUsers()
      expect(users).toHaveLength(2)
      expect(users[0].username).toBe('admin')
      expect(users[1].creatorUsername).toBe('admin')
    })

    it('báo lỗi khi truy vấn profiles thất bại', async () => {
      const selectMock = vi.fn().mockReturnThis()
      const orderMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } })
      selectMock.mockReturnValue({ order: orderMock })

      vi.mocked(getSupabase).mockReturnValue({
        from: vi.fn().mockReturnValue({ select: selectMock }),
      } as unknown as SupabaseClient)

      await expect(fetchUsers()).rejects.toThrow('Không thể tải danh sách người dùng: DB Error')
    })
  })

  describe('createUser', () => {
    it('gọi Edge Function admin-users với action create-user', async () => {
      const invokeMock = vi.fn().mockResolvedValue({
        data: {
          ok: true,
          user: {
            id: 'new-u',
            username: 'newbie',
            display_name: 'Newbie',
            role: 'staff',
            must_change_password: true,
            created_by: 'u1',
            created_at: '2026-10-04T00:00:00Z',
          },
          temporary_password: 'temppass',
        },
        error: null,
      })

      vi.mocked(getSupabase).mockReturnValue({
        functions: { invoke: invokeMock },
      } as unknown as SupabaseClient)

      const res = await createUser({ username: 'newbie', displayName: 'Newbie' })
      expect(res.user.username).toBe('newbie')
      expect(res.temporaryPassword).toBe('temppass')
      expect(invokeMock).toHaveBeenCalledWith('admin-users', {
        body: {
          action: 'create-user',
          username: 'newbie',
          display_name: 'Newbie',
          password: undefined,
          role: 'staff',
        },
      })
    })

    it('ném lỗi khi Edge Function trả về lỗi', async () => {
      const invokeMock = vi.fn().mockResolvedValue({
        data: { error: 'Tên đăng nhập đã tồn tại' },
        error: null,
      })

      vi.mocked(getSupabase).mockReturnValue({
        functions: { invoke: invokeMock },
      } as unknown as SupabaseClient)

      await expect(createUser({ username: 'newbie' })).rejects.toThrow('Tên đăng nhập đã tồn tại')
    })
  })

  describe('resetPassword', () => {
    it('gọi Edge Function với action reset-password', async () => {
      const invokeMock = vi.fn().mockResolvedValue({
        data: { ok: true, temporary_password: 'new_temp_pass' },
        error: null,
      })

      vi.mocked(getSupabase).mockReturnValue({
        functions: { invoke: invokeMock },
      } as unknown as SupabaseClient)

      const res = await resetPassword('target-id')
      expect(res.temporaryPassword).toBe('new_temp_pass')
      expect(invokeMock).toHaveBeenCalledWith('admin-users', {
        body: { action: 'reset-password', user_id: 'target-id' },
      })
    })
  })

  describe('setPassword', () => {
    it('gọi Edge Function với action set-password', async () => {
      const invokeMock = vi.fn().mockResolvedValue({
        data: { ok: true },
        error: null,
      })

      vi.mocked(getSupabase).mockReturnValue({
        functions: { invoke: invokeMock },
      } as unknown as SupabaseClient)

      await setPassword('target-id', 'custompass123')
      expect(invokeMock).toHaveBeenCalledWith('admin-users', {
        body: { action: 'set-password', user_id: 'target-id', new_password: 'custompass123' },
      })
    })
  })

  describe('deleteUser', () => {
    it('gọi Edge Function với action delete-user', async () => {
      const invokeMock = vi.fn().mockResolvedValue({
        data: { ok: true },
        error: null,
      })

      vi.mocked(getSupabase).mockReturnValue({
        functions: { invoke: invokeMock },
      } as unknown as SupabaseClient)

      await deleteUser('target-id')
      expect(invokeMock).toHaveBeenCalledWith('admin-users', {
        body: { action: 'delete-user', user_id: 'target-id' },
      })
    })
  })
})
