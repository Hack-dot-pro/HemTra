// Fake supabase-js cho unit test — chỉ mô phỏng đúng chuỗi query mà code dùng
// (select/eq/order/maybeSingle + channel + rpc). Test tích hợp thật do e2e/SQL lo.

import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>
type QueryError = { message: string }
type QueryResult<T> = { data: T; error: QueryError | null }

export type FakeSupabaseOptions = {
  tables?: Record<string, Row[]>
  /** Bảng trả lỗi (mô phỏng server lỗi). */
  errorTables?: string[]
  /** true = mọi query reject như trình duyệt mất mạng. */
  offline?: boolean
  rpc?: (fn: string, params: Record<string, unknown>) => QueryResult<unknown>
}

export type FakeSupabase = {
  client: SupabaseClient
  rpcCalls: Array<{ fn: string; params: Record<string, unknown> }>
}

export function createFakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabase {
  const tables = options.tables ?? {}
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []

  function from(table: string) {
    const filters: Array<[string, unknown]> = []
    let orderColumn: string | null = null

    const run = (): Promise<QueryResult<unknown>> => {
      if (options.offline) return Promise.reject(new TypeError('Failed to fetch'))
      if (options.errorTables?.includes(table)) {
        return Promise.resolve({ data: null, error: { message: `${table}_failed` } })
      }
      let rows = [...(tables[table] ?? [])]
      for (const [column, value] of filters) rows = rows.filter((row) => row[column] === value)
      if (orderColumn) {
        rows = rows.sort((a, b) =>
          String(a[orderColumn as string] ?? '').localeCompare(String(b[orderColumn as string] ?? '')),
        )
      }
      return Promise.resolve({ data: rows, error: null })
    }

    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push([column, value])
        return chain
      },
      order: (column: string) => {
        orderColumn = column
        return chain
      },
      maybeSingle: () =>
        run().then((result) => ({
          data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
          error: result.error,
        })),
      then: <T,>(
        onFulfilled?: ((value: QueryResult<unknown>) => T | PromiseLike<T>) | null,
        onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
      ) => run().then(onFulfilled, onRejected),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return chain as any
  }

  const channel = () => {
    const handle = {
      on: () => handle,
      subscribe: () => ({ topic: 'fake' }),
    }
    return handle
  }

  const client = {
    from,
    channel,
    removeChannel: async () => ({ error: null }),
    rpc: (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params })
      if (options.rpc) return Promise.resolve(options.rpc(fn, params))
      return Promise.resolve({ data: { code: 'HT-261002-0001', price_drift: false, duplicate: false }, error: null })
    },
  }

  return { client: client as unknown as SupabaseClient, rpcCalls }
}
