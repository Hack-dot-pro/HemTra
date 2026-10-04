// Unit test upload PNG bill — P6-T7 (đường dẫn phải khớp regex policy Storage).

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BILL_PNG_MAX_BYTES, billPngPath, createBillUploader, isPngBlob } from './billUpload'

const STORAGE_PATH_REGEX = /^[0-9]{4}\/[0-9]{2}\/HT-[0-9]{6}(-OFF-[A-Za-z0-9]{4}|-[0-9]{4,})\.png$/

function createFakePng(extraBytes = 0): Blob {
  const bytes = new Uint8Array(8 + extraBytes)
  bytes[0] = 0x89
  bytes[1] = 0x50
  bytes[2] = 0x4e
  bytes[3] = 0x47
  bytes[4] = 0x0d
  bytes[5] = 0x0a
  bytes[6] = 0x1a
  bytes[7] = 0x0a
  return new Blob([bytes], { type: 'image/png' })
}

function stub(upload: ReturnType<typeof vi.fn>, rpc = vi.fn().mockResolvedValue({ data: true, error: null })): SupabaseClient {
  return { storage: { from: vi.fn(() => ({ upload })) }, rpc } as unknown as SupabaseClient
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

describe('P10-T2 — isPngBlob & Magic Bytes Check', () => {
  it('nhận diện đúng Blob PNG hợp lệ', async () => {
    expect(await isPngBlob(createFakePng())).toBe(true)
  })

  it('từ chối Blob có kích thước < 4 bytes', async () => {
    expect(await isPngBlob(new Blob(['x']))).toBe(false)
  })

  it('từ chối Blob không bắt đầu bằng 89 50 4E 47', async () => {
    const fake = new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])])
    expect(await isPngBlob(fake)).toBe(false)
  })

  it('chặn upload nếu file không phải PNG magic bytes', async () => {
    const upload = vi.fn()
    const nonPng = new Blob(['not a png file'])
    await expect(
      createBillUploader(stub(upload))({
        code: 'HT-261003-0001',
        blob: nonPng,
        createdAtIso: '2026-10-03T05:00:00.000Z',
        clientUuid: 'uuid-1',
      }),
    ).rejects.toThrow(/invalid_png_magic_bytes/)
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('P6-T7 — createBillUploader', () => {
  it('happy: upload path đúng, contentType image/png, upsert false', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    const client = stub(upload, rpc)
    const png = createFakePng()
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
    expect(rpc).toHaveBeenCalledWith('set_bill_image', {
      p_code: 'HT-261003-0001',
      p_path: '2026/10/HT-261003-0001.png',
    })
  })

  it('409 đã có file (retry) → vẫn gắn ảnh, không ném', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'The resource already exists', status: 409 } })
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null })
    const out = await createBillUploader(stub(upload, rpc))({
      code: 'HT-261003-0001',
      blob: createFakePng(),
      createdAtIso: '2026-10-03T05:00:00.000Z',
      clientUuid: 'uuid-1',
    })
    expect(out).toBe('2026/10/HT-261003-0001.png')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('shape THẬT của storage khi trùng file → vẫn coi là đã có và đi gắn ảnh', async () => {
    // Kiểm chứng thực tế trên Storage linked (POST trùng path, x-upsert:false):
    // HTTP 400 + body {"statusCode":"409","error":"Duplicate","message":"The resource already exists",
    // "code":"KeyAlreadyExists"} → storage-js gán status=400, statusCode="409",
    // message="The resource already exists" (node_modules/@supabase/storage-js handleError).
    const upload = vi.fn().mockResolvedValue({
      error: {
        message: 'The resource already exists',
        status: 400,
        statusCode: '409',
        code: 'KeyAlreadyExists',
      },
    })
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    const out = await createBillUploader(stub(upload, rpc))({
      code: 'HT-261003-0001',
      blob: createFakePng(),
      createdAtIso: '2026-10-03T05:00:00.000Z',
      clientUuid: 'uuid-1',
    })
    expect(out).toBe('2026/10/HT-261003-0001.png')
    expect(rpc).toHaveBeenCalledWith('set_bill_image', {
      p_code: 'HT-261003-0001',
      p_path: '2026/10/HT-261003-0001.png',
    })
  })

  it('gắn ảnh thất bại → ném để outbox retry (upload đã xong, không mất bill)', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(
      createBillUploader(stub(upload, rpc))({
        code: 'HT-261003-0001',
        blob: createFakePng(),
        createdAtIso: '2026-10-03T05:00:00.000Z',
        clientUuid: 'uuid-1',
      }),
    ).rejects.toThrow(/image_link_failed/)
  })

  it('retry sau khi gắn ảnh thất bại: lần 1 rpc lỗi → ném; lần 2 upload 409 + rpc OK → gắn được', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'The resource already exists', status: 409 } })
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'network' } })
      .mockResolvedValueOnce({ data: true, error: null })
    const client = stub(upload, rpc)
    const args = {
      code: 'HT-261003-0001',
      blob: createFakePng(),
      createdAtIso: '2026-10-03T05:00:00.000Z',
      clientUuid: 'uuid-1',
    }

    await expect(createBillUploader(client)(args)).rejects.toThrow(/image_link_failed/)
    // outbox retry → upload báo đã tồn tại (409) KHÔNG chặn, rpc chạy tiếp và thành công
    await expect(createBillUploader(client)(args)).resolves.toBe('2026/10/HT-261003-0001.png')
    expect(rpc).toHaveBeenLastCalledWith('set_bill_image', {
      p_code: 'HT-261003-0001',
      p_path: '2026/10/HT-261003-0001.png',
    })
  })

  it('upload lỗi khác 409 (status 500) → vẫn ném png_upload_failed, không đi gắn ảnh', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'internal error', status: 500 } })
    const rpc = vi.fn()
    await expect(
      createBillUploader(stub(upload, rpc))({
        code: 'HT-261003-0001',
        blob: createFakePng(),
        createdAtIso: '2026-10-03T05:00:00.000Z',
        clientUuid: 'uuid-1',
      }),
    ).rejects.toThrow(/png_upload_failed/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('upload lỗi → ném để outbox retry (không mất bill)', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'row too large' } })
    await expect(
      createBillUploader(stub(upload))({
        code: 'HT-261003-0001',
        blob: createFakePng(),
        createdAtIso: '2026-10-03T05:00:00.000Z',
        clientUuid: 'uuid-1',
      }),
    ).rejects.toThrow(/png_upload_failed/)
  })

  it('biên: PNG vượt giới hạn bucket 300KB → chặn trước khi upload', async () => {
    const upload = vi.fn()
    const big = createFakePng(BILL_PNG_MAX_BYTES + 1)
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
