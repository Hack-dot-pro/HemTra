// Fake supabase-js cho unit test — chỉ mô phỏng đúng chuỗi query mà code dùng
// (select/eq/order/maybeSingle/insert/update/delete + channel + rpc). Test tích
// hợp thật do e2e/SQL lo.

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
  tables: Record<string, Row[]>
}

export function createFakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabase {
  const tables: Record<string, Row[]> = options.tables ?? {}
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []

  function fail(): Promise<QueryResult<unknown>> | null {
    if (options.offline) return Promise.reject(new TypeError('Failed to fetch'))
    return null
  }

  function from(table: string) {
    const filters: Array<[string, unknown]> = []
    let orderColumn: string | null = null
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let insertRows: Row[] = []
    let patch: Row = {}

    const serverError = (): QueryResult<unknown> | null =>
      options.errorTables?.includes(table) ? { data: null, error: { message: `${table}_failed` } } : null

    const selectRun = (): Promise<QueryResult<unknown>> => {
      const offline = fail()
      if (offline) return offline
      const err = serverError()
      if (err) return Promise.resolve(err)
      let rows = [...(tables[table] ?? [])]
      for (const [column, value] of filters) rows = rows.filter((row) => row[column] === value)
      if (orderColumn) {
        rows = rows.sort((a, b) =>
          String(a[orderColumn as string] ?? '').localeCompare(String(b[orderColumn as string] ?? '')),
        )
      }
      return Promise.resolve({ data: rows, error: null })
    }

    const mutateRun = (): Promise<QueryResult<unknown>> => {
      const offline = fail()
      if (offline) return offline
      const err = serverError()
      if (err) return Promise.resolve(err)
      const rows = (tables[table] ??= [])
      if (mode === 'insert') {
        for (const row of insertRows) rows.push({ ...row })
        return Promise.resolve({ data: null, error: null })
      }
      const matched = rows.filter((row) => filters.every(([column, value]) => row[column] === value))
      if (mode === 'delete') {
        tables[table] = rows.filter((row) => !matched.includes(row))
        return Promise.resolve({ data: null, error: null })
      }
      for (const row of matched) Object.assign(row, patch)
      return Promise.resolve({ data: null, error: null })
    }

    const run = (): Promise<QueryResult<unknown>> => (mode === 'select' ? selectRun() : mutateRun())

    const chain = {
      select: () => chain,
      insert: (values: Row | Row[]) => {
        mode = 'insert'
        insertRows = Array.isArray(values) ? values : [values]
        return chain
      },
      update: (values: Row) => {
        mode = 'update'
        patch = values
        return chain
      },
      delete: () => {
        mode = 'delete'
        return chain
      },
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

  return { client: client as unknown as SupabaseClient, rpcCalls, tables }
}
