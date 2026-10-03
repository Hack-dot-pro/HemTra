import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase } from '../test/fakeSupabase'
import { HemTraDB } from './db'
import type { MenuSnapshot } from './menuTypes'
import {
  CACHE_STALE_MS,
  fetchMenu,
  isCacheStale,
  readCachedMenu,
  shouldRefreshMenu,
  startMenuSync,
  syncMenu,
  writeCachedMenu,
} from './menuSync'

// Factory — mỗi test có bảng của riêng mình (không rò state giữa các test)
function menuTables(menuVersion = 7) {
  return {
    app_meta: [{ id: 1, menu_version: menuVersion }],
    categories: [{ id: 'c1', name: 'Trà sữa', icon: '', sort_order: 2, is_active: true }],
    products: [
      { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: 35000, icon: '', is_active: true },
      { id: 'p2', category_id: 'c1', name: 'Ẩn', price: 1000, icon: '', is_active: false },
    ],
    toppings: [{ id: 't1', name: 'Trân châu', price: 5000, icon: '', is_active: true }],
  }
}

function snapshot(menuVersion: number, fetchedAt: number): MenuSnapshot {
  return { id: 'menu', menu_version: menuVersion, fetched_at: fetchedAt, categories: [], products: [], toppings: [] }
}

let db: HemTraDB

beforeEach(async () => {
  db = new HemTraDB(`menu-test-${Math.random().toString(16).slice(2)}`)
  await db.menuCache.clear()
})

describe('shouldRefreshMenu', () => {
  it('chỉ tải lại khi version server KHÁC cache', () => {
    expect(shouldRefreshMenu(7, 7)).toBe(false)
    expect(shouldRefreshMenu(7, 8)).toBe(true)
    expect(shouldRefreshMenu(null, 1)).toBe(true)
  })

  it('không tải khi không đọc được version server', () => {
    expect(shouldRefreshMenu(7, null)).toBe(false)
    expect(shouldRefreshMenu(null, null)).toBe(false)
  })
})

describe('isCacheStale', () => {
  it('cũ hơn 24h là stale', () => {
    const now = 1_000_000_000_000
    expect(isCacheStale(now - CACHE_STALE_MS - 1, now)).toBe(true)
    expect(isCacheStale(now - CACHE_STALE_MS + 1, now)).toBe(false)
    expect(isCacheStale(0, now)).toBe(true)
  })
})

describe('fetchMenu', () => {
  it('lấy menu + version, chỉ gồm SP đang bán', async () => {
    const { client } = createFakeSupabase({ tables: menuTables() })
    const menu = await fetchMenu(client, 123)
    expect(menu.menu_version).toBe(7)
    expect(menu.fetched_at).toBe(123)
    expect(menu.categories.map((c) => c.name)).toEqual(['Trà sữa'])
    expect(menu.products).toHaveLength(1)
    expect(menu.products[0].price).toBe(35000)
    expect(menu.toppings).toHaveLength(1)
  })

  it('một bảng lỗi → ném menu_fetch_failed', async () => {
    const { client } = createFakeSupabase({ tables: menuTables(), errorTables: ['products'] })
    await expect(fetchMenu(client)).rejects.toThrow('menu_fetch_failed')
  })
})

describe('syncMenu', () => {
  it('chưa có cache → tải về và ghi IndexedDB', async () => {
    const { client } = createFakeSupabase({ tables: menuTables() })
    const outcome = await syncMenu({ client, db, now: 555 })
    expect(outcome).toMatchObject({ status: 'ok', refreshed: true, menuVersion: 7, fetchedAt: 555 })
    const cached = await readCachedMenu(db)
    expect(cached?.products).toHaveLength(1)
  })

  it('version server trùng cache → KHÔNG tải lại', async () => {
    await db.menuCache.put(snapshot(7, 111))
    const { client } = createFakeSupabase({ tables: menuTables() })
    const outcome = await syncMenu({ client, db })
    expect(outcome).toMatchObject({ refreshed: false, menuVersion: 7, fetchedAt: 111 })
  })

  it('version server đổi → tải lại, cache cũ được thay', async () => {
    await db.menuCache.put(snapshot(3, 111))
    const { client } = createFakeSupabase({ tables: menuTables() })
    const outcome = await syncMenu({ client, db, now: 999 })
    expect(outcome).toMatchObject({ refreshed: true, menuVersion: 7, fetchedAt: 999 })
  })

  it('mất mạng → giữ cache cũ, không ném lỗi', async () => {
    await db.menuCache.put(snapshot(3, 111))
    const { client } = createFakeSupabase({ tables: menuTables(), offline: true })
    const outcome = await syncMenu({ client, db })
    expect(outcome).toMatchObject({ refreshed: false, menuVersion: 3, fetchedAt: 111 })
    expect((await readCachedMenu(db))?.menu_version).toBe(3)
  })

  it('không có client (chưa đăng nhập) → trả cache, không lỗi', async () => {
    const outcome = await syncMenu({ client: null, db })
    expect(outcome.refreshed).toBe(false)
  })
})

describe('startMenuSync (4 điểm chạm)', () => {
  function fakeWin() {
    const listeners = new Map<string, Set<() => void>>()
    return {
      addEventListener: (type: string, cb: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(cb)
      },
      removeEventListener: (type: string, cb: () => void) => listeners.get(type)?.delete(cb),
      dispatch: (type: string) => listeners.get(type)?.forEach((cb) => cb()),
      count: (type: string) => listeners.get(type)?.size ?? 0,
    }
  }

  function fakeDoc() {
    const listeners = new Map<string, Set<() => void>>()
    return {
      visibilityState: 'hidden' as DocumentVisibilityState,
      addEventListener: (type: string, cb: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(cb)
      },
      removeEventListener: (type: string, cb: () => void) => listeners.get(type)?.delete(cb),
      dispatch: (type: string) => listeners.get(type)?.forEach((cb) => cb()),
      count: (type: string) => listeners.get(type)?.size ?? 0,
    }
  }

  it('đồng bộ ngay khi mở app rồi gỡ hết khi unsubscribe', async () => {
    const { client } = createFakeSupabase({ tables: menuTables() })
    const win = fakeWin()
    const doc = fakeDoc()
    const outcomes: boolean[] = []

    const handle = startMenuSync({
      client,
      db,
      onOutcome: (o) => outcomes.push(o.refreshed),
      win: win as unknown as Window,
      doc: doc as unknown as Document,
      subscribeRealtime: () => () => {},
    })
    await vi.waitFor(() => expect(outcomes).toEqual([true]))

    expect(win.count('online')).toBe(1)
    expect(doc.count('visibilitychange')).toBe(1)

    handle.unsubscribe()
    expect(win.count('online')).toBe(0)
    expect(doc.count('visibilitychange')).toBe(0)
  })

  it('online + quay lại tab đều chạy lại đồng bộ', async () => {
    const { client } = createFakeSupabase({ tables: menuTables() })
    const win = fakeWin()
    const doc = fakeDoc()
    let runs = 0

    const handle = startMenuSync({
      client,
      db,
      onOutcome: () => {
        runs += 1
      },
      win: win as unknown as Window,
      doc: doc as unknown as Document,
      subscribeRealtime: () => () => {},
    })
    await vi.waitFor(() => expect(runs).toBe(1))

    win.dispatch('online')
    await vi.waitFor(() => expect(runs).toBe(2))

    doc.visibilityState = 'visible'
    doc.dispatch('visibilitychange')
    await vi.waitFor(() => expect(runs).toBe(3))

    handle.unsubscribe()
  })

  it('Realtime app_meta báo thay đổi → so version lại', async () => {
    const tables = menuTables()
    const { client } = createFakeSupabase({ tables })
    let realtimeCb: (() => void) | null = null
    let unsubscribeRealtime = 0

    const handle = startMenuSync({
      client,
      db,
      onOutcome: () => {},
      win: null,
      doc: null,
      subscribeRealtime: (onChange) => {
        realtimeCb = onChange
        return () => {
          unsubscribeRealtime += 1
          realtimeCb = null
        }
      },
    })

    // Server đổi menu_version → lần so version kế phải tải lại
    tables.app_meta[0].menu_version = 8
    realtimeCb?.()
    await vi.waitFor(async () => expect((await readCachedMenu(db))?.menu_version).toBe(8))

    handle.unsubscribe()
    expect(unsubscribeRealtime).toBe(1)
  })

  it('ghi cache qua writeCachedMenu đọc lại được', async () => {
    await writeCachedMenu(snapshot(4, 42), db)
    expect((await readCachedMenu(db))?.fetched_at).toBe(42)
  })
})
