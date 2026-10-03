// Outbox bill offline — P4-T5 (pwa-offline/skill.md §4, design §8.4).
// Bán offline → bill xếp hàng vào IndexedDB; có mạng → gọi RPC create_bill
// (idempotent theo client_uuid) rồi mới upload PNG. Lệch giá: GIỮ snapshot,
// gắn cờ price_drift (đã giao khách rồi — không sửa lại bill).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getDb, type HemTraDB, type OutboxBill } from './db'

export const MAX_SYNC_ATTEMPTS = 5

export type SyncSummary = {
  synced: number
  failed: number
  /** Số bill lệch giá (server trả price_drift=true). */
  drifted: number
  remaining: number
}

/** Upload PNG sau khi đã có mã bill. P6-T7 cung cấp bản thật (Storage `bills/`). */
export type UploadPng = (args: {
  code: string
  blob: Blob
  createdAtIso: string
  clientUuid: string
}) => Promise<string>

export function newClientUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback cho môi trường cũ — không dùng Math.random làm ID nghiệp vụ ở đây
  // chỉ là chuỗi tạm, server vẫn ép unique theo client_uuid.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}

/** Xếp bill vào outbox. Trùng client_uuid = đã có → ghi đè (put), không nhân đôi. */
export async function enqueueBill(bill: OutboxBill, db: HemTraDB = getDb()): Promise<void> {
  await db.outbox.put(bill)
}

export async function listPending(db: HemTraDB = getDb()): Promise<OutboxBill[]> {
  const rows = await db.outbox.where('status').equals('pending').sortBy('created_at')
  return rows
}

export async function countPending(db: HemTraDB = getDb()): Promise<number> {
  return db.outbox.where('status').equals('pending').count()
}

export type SyncOutboxOptions = {
  client?: SupabaseClient | null
  db?: HemTraDB
  uploadPng?: UploadPng | null
  now?: number
}

/**
 * Đồng bộ lần lượt các bill pending. Một bill lỗi không chặn bill sau
 * (mạng yếu ở quán → lỗi từng dòng là bình thường).
 */
export async function syncOutbox(options: SyncOutboxOptions): Promise<SyncSummary> {
  const { client = null, db = getDb(), uploadPng = null, now = Date.now() } = options
  const summary: SyncSummary = { synced: 0, failed: 0, drifted: 0, remaining: 0 }
  if (!client) {
    summary.remaining = await countPending(db)
    return summary
  }

  const pending = await listPending(db)
  for (const bill of pending) {
    if (bill.attempts >= MAX_SYNC_ATTEMPTS) {
      // Quá số lần thử → giữ lại cho admin thấy, không bắn vô hạn.
      summary.failed += 1
      continue
    }

    const p = bill.payload
    const { data, error } = await client.rpc('create_bill', {
      p_client_uuid: bill.client_uuid,
      p_items: p.items,
      p_menu_version: p.menu_version,
      p_is_offline: p.is_offline,
      p_offline_code: p.offline_code,
      p_phone_note: p.phone_note,
      p_created_at: p.created_at,
    })

    if (error || !data) {
      await db.outbox.update(bill.client_uuid, {
        attempts: bill.attempts + 1,
        last_error: error?.message ?? 'create_bill_failed',
      })
      summary.failed += 1
      continue
    }

    const result = data as { code?: string; price_drift?: boolean; duplicate?: boolean }
    const code = result.code ?? bill.code

    // Ảnh: upload trước, attach sau. Lỗi upload → retry (create_bill idempotent,
    // lần sau server trả duplicate=true rồi upload tiếp) — không mất bill.
    if (uploadPng && bill.png && code) {
      try {
        await uploadPng({
          code,
          blob: bill.png,
          createdAtIso: p.created_at ?? new Date(now).toISOString(),
          clientUuid: bill.client_uuid,
        })
      } catch (err) {
        await db.outbox.update(bill.client_uuid, {
          attempts: bill.attempts + 1,
          last_error: err instanceof Error ? err.message : 'png_upload_failed',
        })
        summary.failed += 1
        continue
      }
    }

    await db.outbox.update(bill.client_uuid, {
      status: 'synced',
      code,
      price_drift: Boolean(result.price_drift) || bill.price_drift,
      synced_at: now,
      last_error: null,
    })
    summary.synced += 1
    if (result.price_drift) summary.drifted += 1
  }

  summary.remaining = await countPending(db)
  return summary
}
