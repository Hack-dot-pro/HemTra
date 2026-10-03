// "Xóa cache & Tải lại" — P4-T7 (pwa-offline/skill.md §5, design §8.7).
// Thứ tự BẮT BUỘC: unregister SW → xóa caches → xóa menuCache (GIỮ outbox)
// → xóa sessionStorage (giữ localStorage username/phiên) → location.replace.
// Safari không có Clear-Site-Data → đúng quy trình thủ công này mới gỡ được kẹt cache.

import { getDb, type HemTraDB } from './db'

export type HardRefreshResult = 'done' | 'cancelled'

export type ServiceWorkerRegistrationLike = { unregister(): Promise<boolean> }

export type HardRefreshDeps = {
  /** Hỏi trước khi xóa khi còn bill chưa đồng bộ (outbox không bị xóa — chỉ cảnh báo). */
  confirmPending?: (pendingCount: number) => Promise<boolean> | boolean
  getRegistrations?: () => Promise<ServiceWorkerRegistrationLike[]>
  cacheStorage?: { keys(): Promise<string[]>; delete(key: string): Promise<boolean> } | null
  db?: HemTraDB
  clearSessionStorage?: () => void
  replace?: (url: string) => void
}

function defaultConfirmPending(pendingCount: number): boolean {
  try {
    return window.confirm(
      `Còn ${pendingCount} bill chưa đồng bộ. Xóa cache sẽ giữ bill đó, nhưng bạn nên chờ đồng bộ xong. Tiếp tục?`,
    )
  } catch {
    return false
  }
}

export async function hardRefresh(deps: HardRefreshDeps = {}): Promise<HardRefreshResult> {
  const {
    confirmPending = defaultConfirmPending,
    getRegistrations = () =>
      typeof navigator === 'undefined' || !navigator.serviceWorker
        ? Promise.resolve([])
        : navigator.serviceWorker.getRegistrations(),
    cacheStorage = typeof caches === 'undefined' ? null : caches,
    db = getDb(),
    clearSessionStorage = () => {
      try {
        sessionStorage.clear()
      } catch {
        // storage bị chặn — bỏ qua
      }
    },
    replace = (url: string) => window.location.replace(url),
  } = deps

  const pending = await db.outbox.where('status').equals('pending').count()
  if (pending > 0) {
    const ok = await confirmPending(pending)
    if (!ok) return 'cancelled'
  }

  try {
    const registrations = await getRegistrations()
    await Promise.all(registrations.map((reg) => reg.unregister()))
  } catch {
    // không có SW / API bị chặn → vẫn tiếp tục dọn cache
  }

  if (cacheStorage) {
    try {
      const keys = await cacheStorage.keys()
      await Promise.all(keys.map((key) => cacheStorage.delete(key)))
    } catch {
      // bỏ qua
    }
  }

  // Chỉ xóa menuCache — outbox (bill chưa sync) PHẢI còn nguyên.
  try {
    await db.menuCache.clear()
  } catch {
    // bỏ qua
  }

  clearSessionStorage()

  const target = typeof location === 'undefined' ? '/' : `${location.pathname}${location.search}`
  const separator = target.includes('?') ? '&' : '?'
  replace(`${target}${separator}r=${Date.now()}`)
  return 'done'
}
