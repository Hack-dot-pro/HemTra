export type UserRole = 'admin' | 'staff'

export type UserProfile = {
  id: string
  username: string
  displayName: string
  role: UserRole
  mustChangePassword: boolean
  createdBy: string | null
  creatorUsername?: string | null
  createdAt: string
}

export type CreateUserParams = {
  username: string
  displayName?: string
  password?: string
  role?: UserRole
}

export type CreateUserResult = {
  user: UserProfile
  temporaryPassword?: string | null
}

export type ResetPasswordResult = {
  temporaryPassword: string
}
