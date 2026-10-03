import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeSupabase } from '../test/fakeSupabase'
import { HemTraDB, type OutboxBill } from './db'
import { countPending, enqueueBill, listPending, newClientUuid, syncOutbox } from './outbox'

function bill(overrides: Partial<OutboxBill> = {}): OutboxBill {
  return {
    client_uuid: overrides.client_uuid ?? '11111111-1111-4111-8111-111111111111',
    payload: {
      items: [{ product_id: 'p1', qty: 2, name: 'Trà sữa đào', unit_price: 35000 }],
      phone_note: '',
      is_offline: true,
      offline_code: 'HT-261002-OFF-ab12',
      created_at: '2026-10-02T10:00:00.000Z',
      menu_version: 7,
    },
    png: null,
    code: null,
    status: 'pending',
    attempts: 0,
    last_error: null,
    price_drift: false,
    created_at: 1,
    synced_at: null,
    ...overrides,
  }
}

let db: HemTraDB

beforeEach(async () => {
  db = new HemTraDB(`outbox-test-${Math.random().toString(16).slice(2)}`)
  await db.outbox.clear()
})

describe('enqueueBill', () => {
  it('xếp 2 bill khác nhau → 2 dòng chờ sync', async () => {
    await enqueueBill(bill(), db)
    await enqueueBill(bill({ client_uuid: '22222222-2222-4222-8222-222222222222' }), db)
    expect(await countPending(db)).toBe(2)
  })

  it('sync lại cùng client_uuid → không nhân đôi (idempotent)', async () => {
    await enqueueBill(bill(), db)
    await enqueueBill(bill({ attempts: 3 }), db)
    const rows = await db.outbox.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].attempts).toBe(3)
  })
})

describe('listPending', () => {
  it('chỉ lấy bill còn pending, theo thứ tự tạo', async () => {
    await enqueueBill(bill({ client_uuid: 'a', created_at: 2 }), db)
    await enqueueBill(bill({ client_uuid: 'b', created_at: 1 }), db)
    await enqueueBill(bill({ client_uuid: 'c', created_at: 3, status: 'synced' }), db)
    const pending = await listPending(db)
    expect(pending.map((b) => b.client_uuid)).toEqual(['b', 'a'])
  })
})

describe('syncOutbox', () => {
  it('không có client (offline) → giữ nguyên pending', async () => {
    await enqueueBill(bill(), db)
    const summary = await syncOutbox({ client: null, db })
    expect(summary).toMatchObject({ synced: 0, remaining: 1 })
  })

  it('gọi create_bill đúng tham số rồi đánh dấu synced', async () => {
    await enqueueBill(bill(), db)
    const { client, rpcCalls } = createFakeSupabase()
    const summary = await syncOutbox({ client, db, now: 1000 })

    expect(summary).toMatchObject({ synced: 1, failed: 0, remaining: 0 })
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('create_bill')
    expect(rpcCalls[0].params).toMatchObject({
      p_client_uuid: '11111111-1111-4111-8111-111111111111',
      p_is_offline: true,
      p_offline_code: 'HT-261002-OFF-ab12',
      p_menu_version: 7,
    })

    const [row] = await db.outbox.toArray()
    expect(row.status).toBe('synced')
    expect(row.code).toBe('HT-261002-0001')
    expect(row.synced_at).toBe(1000)
  })

  it('server báo lệch giá → GIỮ snapshot, gắn cờ price_drift', async () => {
    await enqueueBill(bill(), db)
    const { client } = createFakeSupabase({
      rpc: () => ({ data: { code: 'HT-261002-0002', price_drift: true, duplicate: false }, error: null }),
    })
    const summary = await syncOutbox({ client, db })

    expect(summary.drifted).toBe(1)
    const [row] = await db.outbox.toArray()
    expect(row.price_drift).toBe(true)
    expect(row.status).toBe('synced')
    // snapshot giá không bị sửa lại
    expect(row.payload.items[0].unit_price).toBe(35000)
  })

  it('RPC lỗi → bill vẫn pending, tăng attempts, không mất dữ liệu', async () => {
    await enqueueBill(bill(), db)
    const { client } = createFakeSupabase({
      rpc: () => ({ data: null, error: { message: 'rate_limited' } }),
    })
    const summary = await syncOutbox({ client, db })

    expect(summary).toMatchObject({ synced: 0, failed: 1, remaining: 1 })
    const [row] = await db.outbox.toArray()
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toBe('rate_limited')
  })

  it('upload PNG lỗi → giữ pending để thử lại (create_bill idempotent nên không trùng)', async () => {
    await enqueueBill(bill({ png: 'data:image/png;base64,AQID' }), db) // 1,2,3
    const { client } = createFakeSupabase()
    const summary = await syncOutbox({
      client,
      db,
      uploadPng: async () => {
        throw new Error('storage_full')
      },
    })

    expect(summary).toMatchObject({ synced: 0, failed: 1, remaining: 1 })
    const [row] = await db.outbox.toArray()
    expect(row.status).toBe('pending')
    expect(row.last_error).toBe('storage_full')
  })

  it('upload PNG thành công → synced, đường dẫn do P6-T7 cung cấp', async () => {
    await enqueueBill(bill({ png: 'data:image/png;base64,AQ==' }), db) // 1
    const { client } = createFakeSupabase()
    const paths: string[] = []
    const summary = await syncOutbox({
      client,
      db,
      uploadPng: async ({ code, blob }) => {
        paths.push(code)
        expect(blob).toBeInstanceOf(Blob) // data URL đã chuyển lại Blob để upload
        expect(blob.type).toBe('image/png')
        return `bills/2026/10/${code}.png`
      },
    })

    expect(summary.synced).toBe(1)
    expect(paths).toEqual(['HT-261002-0001'])
  })

  it('một bill lỗi không chặn các bill sau', async () => {
    await enqueueBill(bill({ client_uuid: 'bad', created_at: 1 }), db)
    await enqueueBill(bill({ client_uuid: 'good', created_at: 2 }), db)
    const { client } = createFakeSupabase({
      rpc: (_fn, params) =>
        String(params.p_client_uuid) === 'bad'
          ? { data: null, error: { message: 'items_required' } }
          : { data: { code: 'HT-261002-0003', price_drift: false, duplicate: false }, error: null },
    })
    const summary = await syncOutbox({ client, db })
    expect(summary).toMatchObject({ synced: 1, failed: 1, remaining: 1 })
  })

  it('quá MAX_SYNC_ATTEMPTS → không bắn vô hạn, vẫn giữ bill cho admin thấy', async () => {
    await enqueueBill(bill({ attempts: 99 }), db)
    const { client, rpcCalls } = createFakeSupabase()
    const summary = await syncOutbox({ client, db })
    expect(rpcCalls).toHaveLength(0)
    expect(summary.failed).toBe(1)
    expect(summary.remaining).toBe(1)
  })
})

describe('newClientUuid', () => {
  it('sinh uuid khác nhau', () => {
    expect(newClientUuid()).not.toBe(newClientUuid())
  })
})
