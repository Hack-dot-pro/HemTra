// Đồng bộ menu — P4-T3 (pwa-offline/skill.md §3, design §8.2).
// 4 điểm chạm: mở app, visibilitychange, online, Realtime kênh app_meta.
// Mọi đường đều so `menu_version` rồi mới tải lại — không bao giờ tải mù.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getDb, type HemTraDB } from './db'
import type { MenuCategory, MenuProduct, MenuSnapshot, MenuTopping, ProductToppingLink } from './menuTypes'

/** Cache menu quá 24 giờ khi offline → cảnh báo (design §8.5). */
export const CACHE_STALE_MS = 24 * 60 * 60 * 1000

export type SyncStatus = 'ok' | 'offline'

export type SyncOutcome = {
  status: SyncStatus
  /** true = menu trên server khác cache → vừa tải lại và đã ghi IndexedDB. */
  refreshed: boolean
  menuVersion: number
  fetchedAt: number
}

const EMPTY_SNAPSHOT = (menuVersion: number, fetchedAt: number): MenuSnapshot => ({
  id: 'menu',
  menu_version: menuVersion,
  fetched_at: fetchedAt,
  categories: [],
  products: [],
  toppings: [],
  product_toppings: [],
})

/** Server đổi version so với cache → phải tải lại (chỉ số lệch mới tải). */
export function shouldRefreshMenu(cachedVersion: number | null, serverVersion: number | null): boolean {
  if (serverVersion === null) return false
  if (cachedVersion === null) return true
  return cachedVersion !== serverVersion
}

export function isCacheStale(fetchedAt: number, now: number = Date.now()): boolean {
  if (!fetchedAt) return true
  return now - fetchedAt > CACHE_STALE_MS
}

export async function readCachedMenu(db: HemTraDB = getDb()): Promise<MenuSnapshot | null> {
  try {
    const row = await db.menuCache.get('menu')
    return row ?? null
  } catch {
    return null
  }
}

export async function writeCachedMenu(snapshot: MenuSnapshot, db: HemTraDB = getDb()): Promise<void> {
  await db.menuCache.put(snapshot)
}

export async function clearCachedMenu(db: HemTraDB = getDb()): Promise<void> {
  await db.menuCache.clear()
}

/** Đọc menu_version server (1 query nhẹ — dùng cho so sánh không cần tải cả menu). */
export async function fetchServerMenuVersion(client: SupabaseClient): Promise<number | null> {
  try {
    const { data, error } = await client.from('app_meta').select('menu_version').eq('id', 1).maybeSingle()
    if (error) return null
    return data ? Number(data.menu_version) : null
  } catch {
    return null
  }
}

/** Tải toàn bộ menu bán hàng (chỉ mục tiêu đang bật bán — P5 giữ danh sách đầy đủ riêng). */
export async function fetchMenu(client: SupabaseClient, now: number = Date.now()): Promise<MenuSnapshot> {
  const [meta, categories, products, toppings, links] = await Promise.all([
    client.from('app_meta').select('menu_version').eq('id', 1).maybeSingle(),
    client.from('categories').select('id,name,icon,sort_order,is_active').eq('is_active', true).order('sort_order'),
    client.from('products').select('id,category_id,name,price,icon,is_active').eq('is_active', true).order('name'),
    client.from('toppings').select('id,name,price,icon,is_active').eq('is_active', true).order('name'),
    client.from('product_toppings').select('product_id,topping_id'),
  ])
  if (meta.error || categories.error || products.error || toppings.error || links.error) {
    throw new Error('menu_fetch_failed')
  }
  return {
    id: 'menu',
    menu_version: Number(meta.data?.menu_version ?? 0),
    fetched_at: now,
    categories: (categories.data ?? []) as MenuCategory[],
    products: (products.data ?? []) as MenuProduct[],
    toppings: (toppings.data ?? []) as MenuTopping[],
    product_toppings: (links.data ?? []) as ProductToppingLink[],
  }
}

/**
 * So version rồi tải nếu lệch. Mất mạng → trả cache cũ, không ném lỗi
 * (offline là trạng thái bình thường của PWA — design §8.4).
 */
export async function syncMenu(options: {
  client?: SupabaseClient | null
  db?: HemTraDB
  now?: number
}): Promise<SyncOutcome> {
  const { client = null, db = getDb(), now = Date.now() } = options
  const cached = await readCachedMenu(db)
  const base: SyncOutcome = {
    status: cached ? 'ok' : 'offline',
    refreshed: false,
    menuVersion: cached?.menu_version ?? 0,
    fetchedAt: cached?.fetched_at ?? 0,
  }

  if (!client) return base

  const serverVersion = await fetchServerMenuVersion(client)
  if (serverVersion === null) return base // mất mạng / API lỗi → giữ cache

  if (!shouldRefreshMenu(cached?.menu_version ?? null, serverVersion)) {
    return { ...base, menuVersion: serverVersion }
  }

  try {
    const snapshot = await fetchMenu(client, now)
    await writeCachedMenu(snapshot, db)
    return {
      status: 'ok',
      refreshed: true,
      menuVersion: snapshot.menu_version,
      fetchedAt: snapshot.fetched_at,
    }
  } catch {
    return { ...base, menuVersion: serverVersion }
  }
}

export type MenuSyncHandle = {
  syncNow(): Promise<SyncOutcome>
  unsubscribe(): void
}

export type StartMenuSyncOptions = {
  client?: SupabaseClient | null
  db?: HemTraDB
  onOutcome?: (outcome: SyncOutcome) => void
  win?: Window | null
  doc?: Document | null
  /** Realtime kênh app_meta (P1-T4 đã bật). */
  subscribeRealtime?: (onChange: () => void) => () => void
}

/** Đăng ký 4 điểm chạm; trả về hàm gỡ hết (dọn khi unmount). */
export function startMenuSync(options: StartMenuSyncOptions): MenuSyncHandle {
  const { client = null, db = getDb(), onOutcome, win = typeof window === 'undefined' ? null : window, doc = typeof document === 'undefined' ? null : document } = options

  let stopped = false
  const run = (): void => {
    if (stopped) return
    void syncMenu({ client, db }).then((outcome) => {
      if (!stopped) onOutcome?.(outcome)
    })
  }

  run()

  const onOnline = (): void => run()
  const onVisibility = (): void => {
    if (doc?.visibilityState === 'visible') run()
  }
  win?.addEventListener('online', onOnline)
  doc?.addEventListener('visibilitychange', onVisibility)

  const stopRealtime = client
    ? (options.subscribeRealtime ?? defaultRealtimeSubscriber(client))(run)
    : () => {}

  return {
    syncNow: () => syncMenu({ client, db }),
    unsubscribe() {
      stopped = true
      win?.removeEventListener('online', onOnline)
      doc?.removeEventListener('visibilitychange', onVisibility)
      stopRealtime()
    },
  }
}

// Kênh Realtime `app_meta`: mọi thay đổi (trigger bump menu_version) → so lại version.
function defaultRealtimeSubscriber(client: SupabaseClient): (onChange: () => void) => () => void {
  return (onChange) => {
    const channel = client
      .channel('menu-sync-app-meta')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_meta', filter: 'id=eq.1' },
        () => onChange(),
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }
}

/** Snapshot rỗng — dùng khi chưa từng đồng bộ (UI đọc được chứ không null). */
export function emptyMenuSnapshot(menuVersion = 0, fetchedAt = 0): MenuSnapshot {
  return EMPTY_SNAPSHOT(menuVersion, fetchedAt)
}
