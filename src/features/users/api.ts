import { getSupabase } from '../../lib/supabase'
import type { CreateUserParams, CreateUserResult, ResetPasswordResult, UserProfile } from './types'

export type UsersApi = {
  fetchUsers: () => Promise<UserProfile[]>
  createUser: (params: CreateUserParams) => Promise<CreateUserResult>
  resetPassword: (userId: string) => Promise<ResetPasswordResult>
  setPassword: (userId: string, newPassword: string) => Promise<void>
  deleteUser: (userId: string) => Promise<void>
}

function getClient() {
  const supabase = getSupabase()
  if (!supabase) {
    throw new Error('Chưa khởi tạo kết nối Supabase.')
  }
  return supabase
}

export async function fetchUsers(): Promise<UserProfile[]> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, role, must_change_password, created_by, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Không thể tải danh sách người dùng: ${error.message}`)
  }

  const rawProfiles = data ?? []
  const usernameMap = new Map<string, string>()
  for (const p of rawProfiles) {
    usernameMap.set(p.id, p.username)
  }

  return rawProfiles.map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.display_name || p.username,
    role: p.role,
    mustChangePassword: Boolean(p.must_change_password),
    createdBy: p.created_by,
    creatorUsername: p.created_by ? usernameMap.get(p.created_by) ?? null : null,
    createdAt: p.created_at,
  }))
}

export async function createUser(params: CreateUserParams): Promise<CreateUserResult> {
  const supabase = getClient()
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'create-user',
      username: params.username,
      display_name: params.displayName,
      password: params.password,
      role: params.role ?? 'staff',
    },
  })

  if (error) {
    throw new Error(error.message || 'Không thể tạo tài khoản người dùng')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return {
    user: {
      id: data.user.id,
      username: data.user.username,
      displayName: data.user.display_name,
      role: data.user.role,
      mustChangePassword: Boolean(data.user.must_change_password),
      createdBy: data.user.created_by,
      createdAt: data.user.created_at,
    },
    temporaryPassword: data.temporary_password,
  }
}

export async function resetPassword(userId: string): Promise<ResetPasswordResult> {
  const supabase = getClient()
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'reset-password',
      user_id: userId,
    },
  })

  if (error) {
    throw new Error(error.message || 'Không thể cấp lại mật khẩu')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return {
    temporaryPassword: data.temporary_password,
  }
}

export async function setPassword(userId: string, newPassword: string): Promise<void> {
  const supabase = getClient()
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'set-password',
      user_id: userId,
      new_password: newPassword,
    },
  })

  if (error) {
    throw new Error(error.message || 'Không thể đặt mật khẩu')
  }

  if (data?.error) {
    throw new Error(data.error)
  }
}

export async function deleteUser(userId: string): Promise<void> {
  const supabase = getClient()
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'delete-user',
      user_id: userId,
    },
  })

  if (error) {
    throw new Error(error.message || 'Không thể xóa người dùng')
  }

  if (data?.error) {
    throw new Error(data.error)
  }
}

export const defaultUsersApi: UsersApi = {
  fetchUsers,
  createUser,
  resetPassword,
  setPassword,
  deleteUser,
}
