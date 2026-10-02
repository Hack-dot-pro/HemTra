// HTTP dùng chung cho các cuộc gọi Supabase từ frontend (REST + Edge Functions).
// Frontend CHỈ gửi anon key — mọi biến VITE_* đều công khai (security/skill.md §1).

import { supabaseAnonKey, supabaseUrl } from './supabase'

export const NETWORK_ERROR = 'Không thể kết nối máy chủ, thử lại sau.'
export const SERVER_ERROR = 'Lỗi máy chủ, thử lại sau.'
export const CONFIG_ERROR = 'Ứng dụng chưa được cấu hình Supabase (thiếu VITE_SUPABASE_URL).'

export type HttpOutcome = {
  /** 0 = không gửi được (thiếu cấu hình / mất mạng) */
  status: number
  body: unknown
  failure: 'network' | 'config' | null
}

function headers(): Record<string, string> {
  return {
    apikey: supabaseAnonKey as string,
    Authorization: `Bearer ${supabaseAnonKey as string}`,
    'Content-Type': 'application/json',
  }
}

async function request(path: string, init: RequestInit): Promise<HttpOutcome> {
  if (!supabaseUrl || !supabaseAnonKey) return { status: 0, body: null, failure: 'config' }
  try {
    const res = await fetch(`${supabaseUrl}${path}`, { ...init, headers: headers() })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    return { status: res.status, body, failure: null }
  } catch {
    return { status: 0, body: null, failure: 'network' }
  }
}

export function supabasePost(path: string, body: unknown): Promise<HttpOutcome> {
  return request(path, { method: 'POST', body: JSON.stringify(body) })
}

export function supabaseGet(path: string): Promise<HttpOutcome> {
  return request(path, { method: 'GET' })
}

/** Thông điệp lỗi tiếng Việt từ body JSON của EF/REST ({error}) — fallback SERVER_ERROR. */
export function messageFromBody(body: unknown): string {
  if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error
  }
  return SERVER_ERROR
}
