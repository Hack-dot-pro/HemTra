// Truy vấn danh sách bill — P7-T1. Bảng bills chỉ ĐỌC được từ client
// (RLS "bills_read" + không có policy ghi — design §6: xóa chỉ qua EF
// cleanup-bills (P7-T3) theo lịch pg_cron (P7-T4)); số món lấy từ bill_items
// của đúng trang đang xem (2 query thay vì aggregate phía server, tránh view/
// RPC mới). design §4.1: cả 2 role xem được. `expires_at` trả về cho tag
// "tự xóa sau N ngày".

import type { SupabaseClient } from '@supabase/supabase-js'
import { BILL_BUCKET } from '../../lib/billUpload'
import { CONFIG_ERROR, NETWORK_ERROR, SERVER_ERROR } from '../../lib/http'
import { getSupabase } from '../../lib/supabase'
import {
  PAGE_SIZE,
  SIGNED_URL_TTL_SECONDS,
  escapeLike,
  summarizeItemCounts,
  type BillListParams,
  type BillPage,
  type BillRow,
} from './logic'

export type BillItemDetail = {
  id: string
  bill_id: string
  parent_item_id: string | null
  name_snapshot: string
  unit_price_snapshot: number
  qty: number
  note: string
  sort_order: number
}

export type BillsApi = {
  list(params: BillListParams): Promise<BillPage>
  /** Signed URL ngắn hạn cho ảnh PNG trong bucket `bills` (P7-T2). */
  signedImageUrl(path: string): Promise<string>
  /** Lấy danh sách món để tái tạo BillSheet khi bill chưa có ảnh hoặc lỗi ảnh (P13-T11). */
  fetchBillItems(billId: string): Promise<BillItemDetail[]>
  /**
   * P12-T10 — xóa bill: gọi EF `delete-bills` (admin + mật khẩu admin xác minh
   * server-side). Trả về mã bill đã xóa để UI báo thành công.
   */
  deleteBill(params: { id: string; password: string }): Promise<{ code: string }>
}

type DeleteBillResponse = { ok?: boolean; code?: string; error?: string }

class ApiError extends Error {
  constructor(message: string) {
    super(message)
  }
}

function toVietnamese(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '')
  if (/Failed to fetch|fetch failed|NetworkError|network/i.test(raw)) return NETWORK_ERROR
  if (/row-level security|permission denied/i.test(raw)) return 'Bạn không có quyền thao tác này.'
  if (raw && !raw.includes('non-2xx status code') && !raw.includes('[object Object]')) return raw
  return SERVER_ERROR
}

/** Gọi EF `delete-bills`, không ném — trả về {data, invokeError} để trên tự chọn. */
async function invokeDeleteBills(
  client: SupabaseClient,
  body: { bill_id: string; password: string },
): Promise<{ data: DeleteBillResponse | null; invokeError: unknown }> {
  try {
    const result = await client.functions.invoke('delete-bills', { body })
    return { data: (result.data ?? null) as DeleteBillResponse | null, invokeError: result.error ?? null }
  } catch (caught) {
    return { data: null, invokeError: caught }
  }
}

/** Đọc `{error}` trong body 4xx của EF (FunctionsHttpError.context là Response). */
async function functionsErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response } | null)?.context
  if (context) {
    if (typeof context.json === 'function') {
      try {
        const body = (await context.json()) as { error?: unknown; message?: unknown }
        if (typeof body?.error === 'string' && body.error) return body.error
        if (typeof body?.message === 'string' && body.message) return body.message
      } catch {
        if (typeof context.text === 'function') {
          try {
            const text = await context.text()
            if (text && !text.includes('<!DOCTYPE') && !text.includes('<html')) return text
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
  return toVietnamese(error)
}

function throwOnError(result: { error: unknown }): void {
  if (result.error) {
    const message = toVietnamese(result.error)
    console.error('[bills api]', result.error)
    throw new ApiError(message)
  }
}

async function withClient<T>(fn: (client: SupabaseClient) => Promise<T>): Promise<T> {
  const client = getSupabase()
  if (!client) throw new ApiError(CONFIG_ERROR)
  try {
    return await fn(client)
  } catch (error) {
    if (error instanceof ApiError) throw error
    console.error('[bills api]', error)
    throw new ApiError(toVietnamese(error))
  }
}

type BillDbRow = {
  id: string
  code: string
  total: number
  created_at: string
  expires_at: string
  image_path: string
  profiles: { username: string } | { username: string }[] | null
}

export const defaultBillsApi: BillsApi = {
  async list(params) {
    return withClient(async (client) => {
      const offset = params.page * PAGE_SIZE
      const code = (params.code ?? '').trim()

      // P12-T10: bỏ lọc "Từ ngày/Đến ngày" — chỉ còn tìm theo mã.
      let query = client
        .from('bills')
        .select('id,code,total,created_at,expires_at,image_path,profiles(username)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
      if (code) query = query.ilike('code', `%${escapeLike(code)}%`)

      const { data, error, count } = await query
      throwOnError({ error })

      const rows = (data ?? []) as unknown as BillDbRow[]
      let counts: Record<string, number> = {}
      if (rows.length > 0) {
        const { data: items, error: itemsError } = await client
          .from('bill_items')
          .select('bill_id,qty,parent_item_id')
          .in('bill_id', rows.map((row) => row.id))
        throwOnError({ error: itemsError })
        counts = summarizeItemCounts((items ?? []) as { bill_id: string; qty: number; parent_item_id: string | null }[])
      }

      const mapped: BillRow[] = rows.map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        return {
          id: row.id,
          code: row.code,
          total: row.total,
          created_at: row.created_at,
          username: profile?.username ?? null,
          itemCount: counts[row.id] ?? 0,
          imagePath: row.image_path ?? '',
          expiresAt: row.expires_at ?? '',
        }
      })

      return { rows: mapped, total: count ?? 0 }
    })
  },

  async deleteBill({ id, password }) {
    return withClient(async (client) => {
      const { data, invokeError } = await invokeDeleteBills(client, { bill_id: id, password })
      if (invokeError) {
        const message = await functionsErrorMessage(invokeError)
        console.error('[bills api] delete-bills', invokeError)
        throw new ApiError(message)
      }
      if (data?.error) throw new ApiError(data.error)
      if (!data?.ok) throw new ApiError(SERVER_ERROR)
      return { code: data.code ?? '' }
    })
  },

  async signedImageUrl(path) {
    return withClient(async (client) => {
      const { data, error } = await client.storage
        .from(BILL_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      throwOnError({ error })
      const url = (data as { signedUrl?: string } | null)?.signedUrl
      if (!url) throw new ApiError(SERVER_ERROR)
      return url
    })
  },

  async fetchBillItems(billId) {
    return withClient(async (client) => {
      const { data, error } = await client
        .from('bill_items')
        .select('id,bill_id,parent_item_id,name_snapshot,unit_price_snapshot,qty,note,sort_order')
        .eq('bill_id', billId)
        .order('sort_order', { ascending: true })
      throwOnError({ error })
      return (data ?? []) as BillItemDetail[]
    })
  },
}
