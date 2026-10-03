// Hook đọc menu từ IndexedDB + trạng thái đồng bộ — P4-T3/T4.
// Nguồn sự thật là server; cache chỉ là phương án dự phòng (design §8.2).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { isCacheStale, readCachedMenu, startMenuSync, syncMenu, type SyncOutcome, type MenuSyncHandle } from './menuSync'
import { getSupabase } from './supabase'
import type { MenuSnapshot } from './menuTypes'

/** Snapshot menu live từ IndexedDB (undefined = đang đọc, null = chưa từng đồng bộ). */
export function useMenuSnapshot(): MenuSnapshot | null | undefined {
  return useLiveQuery(() => readCachedMenu(), [], null)
}

/** Trạng thái mạng hiện tại (event online/offline). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const on = (): void => setOnline(true)
    const off = (): void => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export type MenuSyncState = {
  outcome: SyncOutcome | null
  syncing: boolean
  syncNow: () => Promise<SyncOutcome | null>
}

/** Đăng ký 4 điểm chạm đồng bộ menu trong vòng đời component (P4-T3). */
export function useMenuSync(): MenuSyncState {
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null)
  const [syncing, setSyncing] = useState(true)
  const handleRef = useRef<MenuSyncHandle | null>(null)

  useEffect(() => {
    const handle = startMenuSync({
      client: getSupabase(),
      onOutcome: (next) => {
        setOutcome(next)
        setSyncing(false)
      },
    })
    handleRef.current = handle
    return () => {
      handleRef.current = null
      handle.unsubscribe()
    }
  }, [])

  const syncNow = useCallback(async (): Promise<SyncOutcome | null> => {
    setSyncing(true)
    const next = handleRef.current
      ? await handleRef.current.syncNow()
      : await syncMenu({ client: getSupabase() })
    setOutcome(next)
    setSyncing(false)
    return next
  }, [])

  return { outcome, syncing, syncNow }
}

/** Cache cũ quá 24h → banner cảnh báo (design §8.5). */
export function isMenuStale(
  snapshot: MenuSnapshot | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!snapshot) return false
  return isCacheStale(snapshot.fetched_at, now)
}
