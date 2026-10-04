// API hồ sơ admin (P12-T9) — EF `profile-update`:
//   - requestOtp: gửi OTP 6 số về app_meta.admin_email
//   - applyProfile: áp dụng thay đổi SAU khi verify OTP server-side
//   - myProfile: đọc dòng profiles của chính mình (tên hiển thị/tên đăng nhập/avatar)
//   - avatarImageUrl: signed URL ngắn hạn cho ảnh trong bucket `avatars`

import type { SupabaseClient } from '@supabase/supabase-js'
import { CONFIG_ERROR, NETWORK_ERROR, SERVER_ERROR } from '../../lib/http'
import { getSupabase } from '../../lib/supabase'

export const AVATAR_BUCKET = 'avatars'
/** Signed URL avatar sống 10 phút — đổi xong là thấy ngay (không cần refresh app). */
export const AVATAR_SIGNED_URL_TTL = 600

export type MyProfile = {
  username: string
  display_name: string
  avatar_path: string
}

export type ProfileChanges = {
  display_name?: string
  username?: string
  password?: string
  avatar_data_url?: string
}

function toVietnamese(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '')
  if (/Failed to fetch|fetch failed|NetworkError|network/i.test(raw)) return NETWORK_ERROR
  if (/row-level security|permission denied/i.test(raw)) return 'Bạn không có quyền thao tác này.'
  return SERVER_ERROR
}

/** Đọc `{error}` trong body 4xx của EF (FunctionsHttpError.context là Response). */
async function functionsErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response } | null)?.context
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: unknown }
      if (typeof body?.error === 'string' && body.error) return body.error
    } catch {
      /* body không phải JSON */
    }
  }
  return toVietnamese(error)
}

function requireClient(): SupabaseClient {
  const client = getSupabase()
  if (!client) throw new Error(CONFIG_ERROR)
  return client
}

/** Gọi EF và trả {data, invokeError} — không ném ở đây. */
async function invoke<T>(
  fn: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; invokeError: unknown }> {
  try {
    const result = await requireClient().functions.invoke(fn, { body })
    return { data: (result.data ?? null) as T | null, invokeError: result.error ?? null }
  } catch (caught) {
    return { data: null, invokeError: caught }
  }
}

/** Gửi OTP về email admin — mọi thay đổi hồ sơ đều cần mã này (P12-T9). */
export async function requestProfileOtp(): Promise<void> {
  const { data, invokeError } = await invoke<{ ok?: boolean; error?: string }>('profile-update', {
    action: 'request-otp',
  })
  if (invokeError) throw new Error(await functionsErrorMessage(invokeError))
  if (data?.error) throw new Error(data.error)
  if (!data?.ok) throw new Error(SERVER_ERROR)
}

export type ApplyProfileResult = {
  profile: MyProfile
  message?: string
}

/** Xác nhận OTP + áp dụng thay đổi. Trả profile đã cập nhật. */
export async function applyProfileChanges(
  token: string,
  changes: ProfileChanges,
): Promise<ApplyProfileResult> {
  const { data, invokeError } = await invoke<{
    ok?: boolean
    error?: string
    message?: string
    profile?: MyProfile | null
  }>('profile-update', { action: 'apply', token, ...changes })
  if (invokeError) throw new Error(await functionsErrorMessage(invokeError))
  if (data?.error) throw new Error(data.error)
  if (!data?.ok || !data.profile) throw new Error(SERVER_ERROR)
  return { profile: data.profile, message: data.message }
}

/** Dòng profiles của chính mình (điền sẵn vào form + avatar ở header). */
export async function myProfile(): Promise<MyProfile> {
  const client = requireClient()
  const { data: auth } = await client.auth.getSession()
  const userId = auth.session?.user.id
  if (!userId) throw new Error(CONFIG_ERROR)

  const { data, error } = await client
    .from('profiles')
    .select('username,display_name,avatar_path')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[profile api]', error)
    throw new Error(toVietnamese(error))
  }
  if (!data) throw new Error('Không tìm thấy thông tin tài khoản.')
  return data as MyProfile
}

/** Signed URL ảnh đại diện (bucket private — cần quyền SELECT đã có ở migration). */
export async function avatarImageUrl(path: string): Promise<string> {
  const client = requireClient()
  const { data, error } = await client.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, AVATAR_SIGNED_URL_TTL)
  if (error) {
    console.error('[profile api] signed url', error)
    throw new Error(toVietnamese(error))
  }
  const url = (data as { signedUrl?: string } | null)?.signedUrl
  if (!url) throw new Error(SERVER_ERROR)
  return url
}
