// Đăng ký Service Worker + cập nhật bản deploy — P4-T6 (design §8.6).
// 2 cơ chế: (a) SW báo "có bản mới" → xác nhận rồi skipWaiting;
//           (b) poll /version.json (no-store) → lệch __BUILD_ID__ → dọn cache.
// Mọi đường ĐỀU phải có xác nhận của người dùng, không tự reload (skill §5).

import { registerSW } from 'virtual:pwa-register'
import { hardRefresh } from './hardRefresh'
import { fetchRemoteVersion, isVersionMismatch } from './version'

export type PwaUpdateReason = 'service-worker' | 'deploy'

export type PwaState = {
  /** Đang chờ người dùng xác nhận cập nhật. */
  needRefresh: boolean
  reason: PwaUpdateReason
  /** Đã cài xong, chạy offline được (thông báo nhẹ, tự hết). */
  offlineReady: boolean
}

const initialState: PwaState = { needRefresh: false, reason: 'service-worker', offlineReady: false }

let state: PwaState = { ...initialState }
const listeners = new Set<() => void>()
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

export function getPwaState(): PwaState {
  return state
}

export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setState(patch: Partial<PwaState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

/** Gọi 1 lần khi app khởi động (main.tsx). Không đăng ký 2 lần. */
export function registerServiceWorker(): void {
  if (updateServiceWorker) return
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      setState({ needRefresh: true, reason: 'service-worker' })
    },
    onOfflineReady() {
      setState({ offlineReady: true })
    },
  })
}

export function dismissPwaNotice(): void {
  setState({ needRefresh: false, offlineReady: false })
}

/**
 * Người dùng bấm "Cập nhật":
 * - bản mới đang chờ trong SW → bỏ qua bước xác nhận lần 2 (đã xác nhận rồi),
 * - lệch version.json → dọn toàn bộ cache rồi tải lại (design §8.6).
 */
export async function applyPwaUpdate(): Promise<void> {
  if (state.needRefresh && state.reason === 'deploy') {
    await hardRefresh()
    return
  }
  setState({ needRefresh: false })
  await updateServiceWorker?.(true)
}

/** GET /version.json — true = bản trên máy chủ khác bản đang chạy. */
export async function checkDeployVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const remote = await fetchRemoteVersion(fetchImpl)
  const mismatch = isVersionMismatch(__BUILD_ID__, remote)
  if (mismatch) setState({ needRefresh: true, reason: 'deploy' })
  return mismatch
}

/** Poll định kỳ + khi có mạng trở lại. Trả về hàm dọn (unmount). */
export function startDeployVersionPolling(
  intervalMs = 10 * 60 * 1000,
  fetchImpl: typeof fetch = fetch,
): () => void {
  const check = (): void => {
    void checkDeployVersion(fetchImpl)
  }
  check()
  pollTimer = setInterval(check, intervalMs)
  const onOnline = (): void => check()
  window.addEventListener('online', onOnline)
  return () => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    window.removeEventListener('online', onOnline)
  }
}
