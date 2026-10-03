// P4-T6 — pwaClient: đăng ký SW, cập nhật có xác nhận, poll version.json.
// Mock 'virtual:pwa-register' (alias vitest) + './hardRefresh' — không đăng ký SW thật.

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hardRefresh } from './hardRefresh'
import {
  applyPwaUpdate,
  checkDeployVersion,
  dismissPwaNotice,
  getPwaState,
  registerServiceWorker,
  startDeployVersionPolling,
  subscribePwa,
} from './pwaClient'

type RegisterSWOptions = {
  immediate?: boolean
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
}

const { registerSWMock, updateFn } = vi.hoisted(() => ({
  registerSWMock: vi.fn(),
  updateFn: vi.fn(async () => {}),
}))

vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: RegisterSWOptions) => registerSWMock(options),
}))
vi.mock('./hardRefresh', () => ({ hardRefresh: vi.fn(async () => {}) }))

/** Lấy options mà registerServiceWorker đã truyền cho registerSW (đăng ký 1 lần ở test đầu). */
let registered: RegisterSWOptions | undefined

function fakeFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }) as Response)
}

describe('pwaClient (P4-T6)', () => {
  beforeEach(() => {
    dismissPwaNotice()
    updateFn.mockClear()
  })

  afterAll(() => {
    dismissPwaNotice()
  })

  it('registerServiceWorker: đăng ký đúng 1 lần với immediate (gọi lại không đăng ký nữa)', () => {
    registerSWMock.mockReturnValue(updateFn)
    registerServiceWorker()
    registerServiceWorker()
    expect(registerSWMock).toHaveBeenCalledTimes(1)
    registered = registerSWMock.mock.calls[0]?.[0] as RegisterSWOptions
    expect(registered.immediate).toBe(true)
  })

  it('SW báo có bản mới → needRefresh + reason service-worker; listener được báo; dismiss tắt cờ', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePwa(listener)
    registered?.onNeedRefresh?.()
    expect(getPwaState()).toMatchObject({ needRefresh: true, reason: 'service-worker' })
    expect(listener).toHaveBeenCalled()

    dismissPwaNotice()
    expect(getPwaState().needRefresh).toBe(false)
    unsubscribe()
  })

  it('SW cài xong lần đầu → offlineReady; dismiss tắt', () => {
    registered?.onOfflineReady?.()
    expect(getPwaState().offlineReady).toBe(true)
    dismissPwaNotice()
    expect(getPwaState().offlineReady).toBe(false)
  })

  it('applyPwaUpdate (reason=service-worker) → gọi updateServiceWorker(true) và bỏ cờ', async () => {
    registered?.onNeedRefresh?.()
    await applyPwaUpdate()
    expect(updateFn).toHaveBeenCalledWith(true)
    expect(getPwaState().needRefresh).toBe(false)
  })

  it('applyPwaUpdate (reason=deploy) → hardRefresh() dọn cache, KHÔNG gọi updateServiceWorker', async () => {
    vi.mocked(hardRefresh).mockClear()
    const ok = await checkDeployVersion(fakeFetch({ version: 'ban-moi' }))
    expect(ok).toBe(true)
    expect(getPwaState()).toMatchObject({ needRefresh: true, reason: 'deploy' })

    await applyPwaUpdate()
    expect(hardRefresh).toHaveBeenCalledTimes(1)
    expect(updateFn).not.toHaveBeenCalled()
    // needRefresh không bị tắt ở nhánh deploy: hardRefresh() sẽ tải lại trang
    // (test mock hardRefresh nên cờ còn đó — hành vi thật là reload xong trạng thái mới).
    expect(getPwaState().needRefresh).toBe(true)
  })

  describe('checkDeployVersion', () => {
    it('lệch version → true + bật cờ deploy', async () => {
      const mismatch = await checkDeployVersion(fakeFetch({ version: 'ban-moi' }))
      expect(mismatch).toBe(true)
      expect(getPwaState()).toMatchObject({ needRefresh: true, reason: 'deploy' })
      dismissPwaNotice()
    })

    it('khớp version → false, không bật cờ', async () => {
      const mismatch = await checkDeployVersion(fakeFetch({ version: 'test-build-id' }))
      expect(mismatch).toBe(false)
      expect(getPwaState().needRefresh).toBe(false)
    })

    it('file thiếu/version rỗng → false (không hiện thông báo giả)', async () => {
      expect(await checkDeployVersion(fakeFetch({}))).toBe(false)
      expect(await checkDeployVersion(fakeFetch({ version: '' }))).toBe(false)
      expect(getPwaState().needRefresh).toBe(false)
    })

    it('lỗi mạng → false, app vẫn chạy im lặng', async () => {
      const fetchFail = vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch
      expect(await checkDeployVersion(fetchFail)).toBe(false)
      expect(getPwaState().needRefresh).toBe(false)
    })
  })

  describe('startDeployVersionPolling', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterAll(() => {
      vi.useRealTimers()
    })

    it('check ngay khi start + mỗi 10 phút + khi có mạng lại; dọn sạch sau cleanup', async () => {
      const fetchOk = fakeFetch({ version: 'ban-moi' })
      const stop = startDeployVersionPolling(10 * 60 * 1000, fetchOk)
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchOk).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(fetchOk).toHaveBeenCalledTimes(2)

      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchOk).toHaveBeenCalledTimes(3)

      stop()
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
      expect(fetchOk).toHaveBeenCalledTimes(3)
    })
  })
})
