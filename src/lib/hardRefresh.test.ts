import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { HemTraDB, type OutboxBill } from './db'
import { hardRefresh, type ServiceWorkerRegistrationLike } from './hardRefresh'

function pendingBill(): OutboxBill {
  return {
    client_uuid: '33333333-3333-4333-8333-333333333333',
    payload: {
      items: [{ product_id: 'p1', qty: 1 }],
      phone_note: '',
      is_offline: true,
      offline_code: 'HT-261002-OFF-zz99',
      created_at: null,
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
  }
}

type Harness = {
  db: HemTraDB
  unregister: Mock<() => Promise<boolean>>
  cacheDelete: Mock<() => Promise<boolean>>
  cacheKeys: string[]
  clearSessionStorage: Mock<() => void>
  replaced: string[]
  confirm: Mock<(pendingCount: number) => Promise<boolean>>
}

async function harness(): Promise<Harness> {
  const db = new HemTraDB(`hard-refresh-${Math.random().toString(16).slice(2)}`)
  await db.menuCache.clear()
  await db.outbox.clear()
  await db.menuCache.put({
    id: 'menu',
    menu_version: 7,
    fetched_at: Date.now(),
    categories: [],
    products: [],
    toppings: [],
  })
  return {
    db,
    unregister: vi.fn<() => Promise<boolean>>(async () => true),
    cacheDelete: vi.fn<() => Promise<boolean>>(async () => true),
    cacheKeys: ['hemtra-precache-v1', 'workbox-precache'],
    clearSessionStorage: vi.fn<() => void>(),
    replaced: [],
    confirm: vi.fn<(pendingCount: number) => Promise<boolean>>(async () => true),
  }
}

function deps(h: Harness) {
  const registrations: ServiceWorkerRegistrationLike[] = [{ unregister: h.unregister }]
  return {
    confirmPending: h.confirm,
    getRegistrations: async () => registrations,
    cacheStorage: {
      keys: async () => h.cacheKeys,
      delete: h.cacheDelete,
    },
    db: h.db,
    clearSessionStorage: h.clearSessionStorage,
    replace: (url: string) => h.replaced.push(url),
  }
}

let h: Harness

beforeEach(async () => {
  h = await harness()
})

describe('hardRefresh (design §8.7)', () => {
  it('unregister SW → xóa caches → xóa menuCache → giữ outbox → tải lại', async () => {
    await h.db.outbox.put(pendingBill())
    const result = await hardRefresh({ ...deps(h), confirmPending: async () => true })

    expect(result).toBe('done')
    expect(h.unregister).toHaveBeenCalledTimes(1)
    expect(h.cacheDelete).toHaveBeenCalledTimes(2)
    expect(await h.db.menuCache.count()).toBe(0)
    expect(await h.db.outbox.count()).toBe(1) // outbox KHÔNG bị xóa
    expect(h.clearSessionStorage).toHaveBeenCalledTimes(1)
    expect(h.replaced[0]).toMatch(/\?r=\d+|&r=\d+$/)
  })

  it('còn bill chưa đồng bộ → hỏi xác nhận; từ chối thì HỦY, không xóa gì', async () => {
    await h.db.outbox.put(pendingBill())
    h.confirm.mockResolvedValueOnce(false)
    const result = await hardRefresh(deps(h))

    expect(result).toBe('cancelled')
    expect(h.confirm).toHaveBeenCalledWith(1)
    expect(h.unregister).not.toHaveBeenCalled()
    expect(await h.db.menuCache.count()).toBe(1)
    expect(h.replaced).toHaveLength(0)
  })

  it('không còn bill pending → không hỏi xác nhận', async () => {
    const result = await hardRefresh(deps(h))
    expect(result).toBe('done')
    expect(h.confirm).not.toHaveBeenCalled()
  })

  it('không có Service Worker / Cache API (Safari cũ, dev) vẫn chạy được', async () => {
    const result = await hardRefresh({
      ...deps(h),
      getRegistrations: async () => [],
      cacheStorage: null as never,
    })
    expect(result).toBe('done')
    expect(await h.db.menuCache.count()).toBe(0)
  })
})
