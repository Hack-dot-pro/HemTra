// Upload PNG bill lên Storage — P6-T7 (pos-bill/skill.md §5, design §6.2).
// Đường dẫn bills/YYYY/MM/<code>.png — đúng regex policy insert (UTC+7):
// ^[0-9]{4}/[0-9]{2}/HT-[0-9]{6}(-OFF-[A-Za-z0-9]{4}|-[0-9]{4,})\.png$
// Bucket private 300KB, không có UPDATE/DELETE policy (client không ghi đè).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { UploadPng } from './outbox'

export const BILL_BUCKET = 'bills'
export const BILL_PNG_MAX_BYTES = 307200

export function billPngPath(code: string, createdAtIso: string): string {
  const utc = new Date(createdAtIso).getTime() + 7 * 3600 * 1000 // giờ VN = UTC+7
  const d = new Date(utc)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}/${mm}/${code}.png`
}

/** Gắn ảnh vào bill sau khi file đã nằm trong bucket — RPC `set_bill_image`
 *  chỉ nhận `YYYY/MM/<code>.png` và chỉ khi bill chưa có ảnh (idempotent). */
export async function linkBillImage(client: SupabaseClient, code: string, path: string): Promise<void> {
  const { error } = await client.rpc('set_bill_image', { p_code: code, p_path: path })
  if (error) throw new Error(`image_link_failed: ${error.message}`)
}

/** UploadPng thật cho syncOutbox — lỗi → outbox retry, bill không mất. */
export function createBillUploader(client: SupabaseClient): UploadPng {
  return async ({ code, blob, createdAtIso }) => {
    if (blob.size > BILL_PNG_MAX_BYTES) {
      throw new Error(`png_too_large: ${blob.size}`)
    }
    const path = billPngPath(code, createdAtIso)
    const { error } = await client.storage.from(BILL_BUCKET).upload(path, blob, {
      contentType: 'image/png',
      upsert: false,
    })
    if (error) {
      // File đã có = retry sau lần upload thành công mà gắn ảnh thất bại → đi gắn ảnh.
      // Storage project này trả HTTP 400 + body {"statusCode":"409","code":"KeyAlreadyExists"}
      // (không phải status 409) — bắt đủ 3 dạng + regex như mặc định.
      const e = error as { message: string; status?: number; statusCode?: string | number; code?: string }
      const duplicate =
        e.status === 409 ||
        String(e.statusCode ?? '') === '409' ||
        e.code === 'KeyAlreadyExists' ||
        /already exists|duplicate/i.test(e.message)
      if (!duplicate) throw new Error(`png_upload_failed: ${error.message}`)
    }
    await linkBillImage(client, code, path)
    return path
  }
}
