import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateAccess, loadAccessProfile, type AccessProfile } from './accessGuard'

const ADMIN: AccessProfile = { role: 'admin', mustChangePassword: false }
const STAFF_FORCED: AccessProfile = { role: 'staff', mustChangePassword: true }

describe('evaluateAccess (P3-T7)', () => {
  it('không có profiles (chưa đăng nhập / role lạ) → /login', () => {
    expect(evaluateAccess(null, '/dashboard')).toBe('login')
    expect(evaluateAccess(null, '/change-password')).toBe('login')
    expect(evaluateAccess(null, '/')).toBe('login')
  })

  it('must_change_password=false → cho vào (cả 2 role)', () => {
    expect(evaluateAccess(ADMIN, '/dashboard')).toBe('allow')
    expect(evaluateAccess({ ...ADMIN }, '/users')).toBe('allow')
  })

  it('must_change_password=true → ép qua /change-password ở mọi route', () => {
    expect(evaluateAccess(STAFF_FORCED, '/dashboard')).toBe('change-password')
    expect(evaluateAccess(STAFF_FORCED, '/pos')).toBe('change-password')
    expect(evaluateAccess(STAFF_FORCED, '/')).toBe('change-password')
  })

  it('đang ở /change-password thì cho qua dù must_change (tránh vòng lặp)', () => {
    expect(evaluateAccess(STAFF_FORCED, '/change-password')).toBe('allow')
    expect(evaluateAccess(ADMIN, '/change-password')).toBe('allow')
  })
})

type FakeQuery = {
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
}

function fakeClient(opts: {
  userId?: string | null
  row?: Record<string, unknown> | null
  error?: { message: string } | null
}): SupabaseClient {
  const maybeSingle: FakeQuery['maybeSingle'] = vi.fn(async () => ({
    data: opts.row ?? null,
    error: opts.error ?? null,
  }))
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: opts.userId ? { user: { id: opts.userId } } : null },
      })),
    },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  } as unknown as SupabaseClient
}

describe('loadAccessProfile (P3-T7)', () => {
  it('chưa đăng nhập → null', async () => {
    expect(await loadAccessProfile(fakeClient({ userId: null }))).toBeNull()
    expect(await loadAccessProfile(null)).toBeNull()
  })

  it('đọc được role admin + cờ từ profiles', async () => {
    const client = fakeClient({
      userId: 'u1',
      row: { role: 'admin', must_change_password: false },
    })
    expect(await loadAccessProfile(client)).toEqual({ role: 'admin', mustChangePassword: false })
  })

  it('role staff + must_change_password=true → giữ cờ', async () => {
    const client = fakeClient({
      userId: 'u1',
      row: { role: 'staff', must_change_password: true },
    })
    expect(await loadAccessProfile(client)).toEqual({ role: 'staff', mustChangePassword: true })
  })

  it('không có row → null (guard về /login)', async () => {
    expect(await loadAccessProfile(fakeClient({ userId: 'u1', row: null }))).toBeNull()
  })

  it('role lạ (không admin/staff) → null', async () => {
    const client = fakeClient({
      userId: 'u1',
      row: { role: 'superuser', must_change_password: false },
    })
    expect(await loadAccessProfile(client)).toBeNull()
  })

  it('lỗi query (mạng) → NÉM LÊN (UI hiện thử lại, không đá ra login)', async () => {
    const client = fakeClient({
      userId: 'u1',
      row: null,
      error: { message: 'Failed to fetch' },
    })
    await expect(loadAccessProfile(client)).rejects.toThrow('Failed to fetch')
  })
})
