// Unit test upload PNG bill — P6-T7 (đường dẫn phải khớp regex policy Storage).

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BILL_PNG_MAX_BYTES, billPngPath, createBillUploader } from './billUpload'

const STORAGE_PATH_REGEX = /^[0-9]{4}\/[0-9]{2}\/HT-[0-9]{6}(-OFF-[A-Za-z0-9]{4}|-[0-9]{4,})\.png$/

function stub(upload: ReturnType<typeof vi.fn>): SupabaseClient {
  return { storage: { from: vi.fn(() => ({ upload })) } } as unknown as SupabaseClient
}

describe('P6-T7 — billPngPath (giờ VN = UTC+7)', () => {
  it('online code → YYYY/MM/<code>.png, khớp regex policy', () => {
    const path = billPngPath('HT-261003-0001', '2026-10-03T05:00:00.000Z')
    expect(path).toBe('2026/10/HT-261003-0001.png')
    expect(path).toMatch(STORAGE_PATH_REGEX)
  })

  it('offline code → khớp nhánh OFF của regex', () => {
    const path = billPngPath('HT-261003-OFF-ab12', '2026-10-03T05:00:00.000Z')
    expect(path).toMatch(STORAGE_PATH_REGEX)
  })

  it('biên UTC+7 sang tháng sau: 30/09 18:00Z → 01/10 VN', () => {
    expect(billPngPath('HT-261003-0001', '2026-09-30T18:00:00.000Z')).toBe('2026/10/HT-261003-0001.png')
  })
})

describe('P6-T7 — createBillUploader', () => {
  it('happy: upload path đúng, contentType image/png, upsert false', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const client = stub(upload)
    const png = new Blob(['x'], { type: 'image/png' })
    const out = await createBillUploader(client)({
      code: 'HT-261003-0001',
      blob: png,
      createdAtIso: '2026-10-03T05:00:00.000Z',
      clientUuid: 'uuid-1',
    })
    expect(out).toBe('2026/10/HT-261003-0001.png')
    expect(upload).toHaveBeenCalledWith('2026/10/HT-261003-0001.png', png, {
      contentType: 'image/png',
      upsert: false,
    })
  })

  it('upload lỗi → ném để outbox retry (không mất bill)', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'row too large' } })
    await expect(
      createBillUploader(stub(upload))({
        code: 'HT-261003-0001',
        blob: new Blob(['x']),
        createdAtIso: '2026-10-03T05:00:00.000Z',
        clientUuid: 'uuid-1',
      }),
    ).rejects.toThrow(/png_upload_failed/)
  })

  it('biên: PNG vượt giới hạn bucket 300KB → chặn trước khi upload', async () => {
    const upload = vi.fn()
    const big = new Blob([new Uint8Array(BILL_PNG_MAX_BYTES + 1)])
    await expect(
      createBillUploader(stub(upload))({
        code: 'HT-261003-0001',
        blob: big,
        createdAtIso: '2026-10-03T05:00:00.000Z',
        clientUuid: 'uuid-1',
      }),
    ).rejects.toThrow(/png_too_large/)
    expect(upload).not.toHaveBeenCalled()
  })
})
