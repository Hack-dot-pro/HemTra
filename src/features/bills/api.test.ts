// Unit test cho bills api (P7-T1/T2) — không gọi mạng thật (testing/skill §2):
// fake supabase client ghi lại tham số query để kiểm (1) ghép cột từ
// `profiles(username)` cả 3 dạng object/mảng/null, (2) số món chỉ lấy dòng cha,
// (3) escape LIKE + mốc ngày giờ VN + offset phân trang, (4) TTL signed URL 120s,
// (5) thông báo lỗi tiếng Việt cho 4 nhánh lỗi (config/mạng/RLS/server).

import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_ERROR, NETWORK_ERROR, SERVER_ERROR } from '../../lib/http'
import { SIGNED_URL_TTL_SECONDS } from './logic'
import { defaultBillsApi } from './api'

type Row = Record<string, unknown>

type SelectRecord = {
  table: string
  order?: string
  range?: [number, number]
  ilike?: [string, string]
  gte?: [string, string]
  lte?: [string, string]
  in?: [string, unknown[]]
}

type SignRecord = { bucket: string; path: string; ttl: number }

type FakeOptions = {
  bills?: Row[]
  items?: Row[]
  count?: number
  /** Lỗi server giả lập cho SELECT của đúng bảng (undefined = không lỗi). */
  selectErrors?: Record<string, string>
  offline?: boolean
  /** null = server trả 200 nhưng không có signedUrl. */
  signedUrl?: string | null
  signError?: string | null
}

type QueryResult = { data: unknown; error: unknown; count?: number }

function runSelect(record: SelectRecord, options: FakeOptions): Promise<QueryResult> {
  if (options.offline) return Promise.reject(new TypeError('Failed to fetch'))
  const forced = options.selectErrors?.[record.table]
  // supabase-js 2.117: PostgrestError extends Error → api.ts đọc error.message
  if (forced) return Promise.resolve({ data: null, error: new Error(forced) })
  if (record.table === 'bills') {
    const bills = options.bills ?? []
    return Promise.resolve({ data: bills, error: null, count: options.count ?? bills.length })
  }
  if (record.table === 'bill_items') {
    return Promise.resolve({ data: options.items ?? [], error: null })
  }
  return Promise.resolve({ data: [], error: null, count: 0 })
}

function makeClient(options: FakeOptions = {}): {
  client: SupabaseClient
  selectCalls: SelectRecord[]
  signCalls: SignRecord[]
} {
  const selectCalls: SelectRecord[] = []
  const signCalls: SignRecord[] = []

  const client = {
    from(table: string) {
      const record: SelectRecord = { table }
      const chain = {
        select: () => chain,
        order: (column: string) => {
          record.order = column
          return chain
        },
        range: (from: number, to: number) => {
          record.range = [from, to]
          return chain
        },
        ilike: (column: string, value: string) => {
          record.ilike = [column, value]
          return chain
        },
        gte: (column: string, value: string) => {
          record.gte = [column, value]
          return chain
        },
        lte: (column: string, value: string) => {
          record.lte = [column, value]
          return chain
        },
        in: (column: string, values: unknown[]) => {
          record.in = [column, values]
          return chain
        },
        then: <T,>(
          onFulfilled?: ((value: QueryResult) => T | PromiseLike<T>) | null,
          onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
        ): PromiseLike<T> => {
          selectCalls.push(record)
          return runSelect(record, options).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl: async (path: string, ttl: number) => {
            signCalls.push({ bucket, path, ttl })
            if (options.offline) throw new TypeError('Failed to fetch')
            if (options.signError) return { data: null, error: new Error(options.signError) }
            if (options.signedUrl === null) return { data: { signedUrl: null }, error: null }
            return {
              data: { signedUrl: options.signedUrl ?? `https://signed.example/${bucket}/${path}` },
              error: null,
            }
          },
        }
      },
    },
  }

  return { client: client as unknown as SupabaseClient, selectCalls, signCalls }
}

const holder = vi.hoisted(() => ({ client: null as SupabaseClient | null }))

vi.mock('../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/supabase')>()
  return { ...actual, getSupabase: () => holder.client }
})

function billRow(overrides: Row = {}): Row {
  return {
    id: 'b1',
    code: 'HT-261003-0001',
    total: 40000,
    created_at: '2026-10-03T07:05:00.000Z',
    expires_at: '2026-10-18T07:05:00.000Z',
    image_path: '2026/10/HT-261003-0001.png',
    profiles: { username: 't7staff' },
    ...overrides,
  }
}

beforeEach(() => {
  holder.client = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('billsApi.list — ghép dòng hiển thị', () => {
  it('ghép profiles object/mảng/null, số món chỉ tính dòng cha, thiếu cột → chuỗi rỗng', async () => {
    const fake = makeClient({
      bills: [
        billRow(),
        billRow({ id: 'b2', profiles: [{ username: 'admin' }], image_path: null, expires_at: null }),
        billRow({ id: 'b3', profiles: null, code: 'HT-261003-0003' }),
      ],
      items: [
        { bill_id: 'b1', qty: 2, parent_item_id: null },
        { bill_id: 'b1', qty: 1, parent_item_id: null },
        { bill_id: 'b1', qty: 1, parent_item_id: 'item-1' },
        { bill_id: 'b2', qty: 5, parent_item_id: null },
        { bill_id: 'b9', qty: 9, parent_item_id: null },
      ],
      count: 42,
    })
    holder.client = fake.client

    const page = await defaultBillsApi.list({ page: 0 })

    expect(page.total).toBe(42)
    expect(page.rows[0]).toEqual({
      id: 'b1',
      code: 'HT-261003-0001',
      total: 40000,
      created_at: '2026-10-03T07:05:00.000Z',
      username: 't7staff',
      itemCount: 3,
      imagePath: '2026/10/HT-261003-0001.png',
      expiresAt: '2026-10-18T07:05:00.000Z',
    })
    expect(page.rows[1]).toMatchObject({ username: 'admin', itemCount: 5, imagePath: '', expiresAt: '' })
    expect(page.rows[2]).toMatchObject({ username: null, itemCount: 0 })
    // bill không có dòng nào trong bill_items vẫn hiển thị 0 món
    expect(page.rows.map((row) => row.itemCount)).toEqual([3, 5, 0])
  })

  it('sắp xếp giảm dần theo created_at, lấy đủ 20 dòng/trang, chỉ hỏi bill_items 1 lần', async () => {
    const fake = makeClient({ bills: [billRow()], count: 100 })
    holder.client = fake.client

    await defaultBillsApi.list({ page: 0 })

    expect(fake.selectCalls[0]).toMatchObject({
      table: 'bills',
      order: 'created_at',
      range: [0, 19],
    })
    expect(fake.selectCalls[0].ilike).toBeUndefined()
    expect(fake.selectCalls[0].gte).toBeUndefined()
    expect(fake.selectCalls.map((call) => call.table)).toEqual(['bills', 'bill_items'])
    expect(fake.selectCalls[1].in?.[0]).toBe('bill_id')
    expect(fake.selectCalls[1].in?.[1]).toEqual(['b1'])
  })

  it('trang 2 → offset 20–39', async () => {
    const fake = makeClient({ bills: [], count: 45 })
    holder.client = fake.client

    await defaultBillsApi.list({ page: 1 })

    expect(fake.selectCalls[0].range).toEqual([20, 39])
    // không có dòng nào → không query bill_items (không lãng phí 1 request)
    expect(fake.selectCalls.map((call) => call.table)).toEqual(['bills'])
  })
})

describe('billsApi.list — bộ lọc tìm theo mã + ngày giờ VN', () => {
  it('ký tự LIKE được escape, mốc ngày là 00:00/23:59:59.999 giờ VN', async () => {
    const fake = makeClient({ bills: [], count: 0 })
    holder.client = fake.client

    await defaultBillsApi.list({ page: 0, code: '  100%  ', from: '2026-10-01', to: '2026-10-03' })

    expect(fake.selectCalls[0].ilike).toEqual(['code', '%100\\%%'])
    expect(fake.selectCalls[0].gte).toEqual(['created_at', '2026-10-01T00:00:00+07:00'])
    expect(fake.selectCalls[0].lte).toEqual(['created_at', '2026-10-03T23:59:59.999+07:00'])
  })

  it('mã rỗng / chưa chọn ngày → không gắn bộ lọc', async () => {
    const fake = makeClient({ bills: [], count: 0 })
    holder.client = fake.client

    await defaultBillsApi.list({ page: 0, code: '   ', from: '', to: '' })

    expect(fake.selectCalls[0].ilike).toBeUndefined()
    expect(fake.selectCalls[0].gte).toBeUndefined()
    expect(fake.selectCalls[0].lte).toBeUndefined()
  })
})

describe('billsApi.list — lỗi → thông báo tiếng Việt', () => {
  it('thiếu cấu hình Supabase → CONFIG_ERROR', async () => {
    await expect(defaultBillsApi.list({ page: 0 })).rejects.toThrow(CONFIG_ERROR)
  })

  it('mất mạng → Không thể kết nối máy chủ', async () => {
    holder.client = makeClient({ offline: true }).client
    await expect(defaultBillsApi.list({ page: 0 })).rejects.toThrow(NETWORK_ERROR)
  })

  it('bị RLS chặn → "Bạn không có quyền thao tác này."', async () => {
    holder.client = makeClient({ selectErrors: { bills: 'row-level security policy for table bills' } }).client
    await expect(defaultBillsApi.list({ page: 0 })).rejects.toThrow('Bạn không có quyền thao tác này.')
  })

  it('server lỗi bảng bills → Lỗi máy chủ', async () => {
    holder.client = makeClient({ selectErrors: { bills: 'syntax error near "from"' } }).client
    await expect(defaultBillsApi.list({ page: 0 })).rejects.toThrow(SERVER_ERROR)
  })

  it('bills đọc được nhưng bill_items lỗi → vẫn báo lỗi (không trả bảng sai số món)', async () => {
    holder.client = makeClient({
      bills: [billRow()],
      selectErrors: { bill_items: 'bill_items_failed' },
    }).client
    await expect(defaultBillsApi.list({ page: 0 })).rejects.toThrow(SERVER_ERROR)
  })
})

describe('billsApi.signedImageUrl — P7-T2', () => {
  it('tạo signed URL trong bucket bills với TTL 120 giây', async () => {
    const fake = makeClient({ signedUrl: 'https://signed.example/token' })
    holder.client = fake.client

    const url = await defaultBillsApi.signedImageUrl('2026/10/HT-261003-0001.png')

    expect(url).toBe('https://signed.example/token')
    expect(fake.signCalls).toEqual([
      { bucket: 'bills', path: '2026/10/HT-261003-0001.png', ttl: SIGNED_URL_TTL_SECONDS },
    ])
    expect(SIGNED_URL_TTL_SECONDS).toBe(120)
  })

  it('thiếu cấu hình → CONFIG_ERROR; mất mạng → Không thể kết nối máy chủ', async () => {
    await expect(defaultBillsApi.signedImageUrl('x.png')).rejects.toThrow(CONFIG_ERROR)

    holder.client = makeClient({ offline: true }).client
    await expect(defaultBillsApi.signedImageUrl('x.png')).rejects.toThrow(NETWORK_ERROR)
  })

  it('server báo lỗi → Lỗi máy chủ', async () => {
    holder.client = makeClient({ signError: 'Object not found' }).client
    await expect(defaultBillsApi.signedImageUrl('x.png')).rejects.toThrow(SERVER_ERROR)
  })

  it('200 nhưng không có signedUrl → Lỗi máy chủ (không trả chuỗi rỗng cho <img>)', async () => {
    holder.client = makeClient({ signedUrl: null }).client
    await expect(defaultBillsApi.signedImageUrl('x.png')).rejects.toThrow(SERVER_ERROR)
  })
})
