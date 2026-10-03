// Service Worker — P4-T1 (pwa-offline/skill.md §1).
// Chỉ precache APP SHELL theo hash. KHÔNG khai báo runtime caching nào →
// fetch tới /rest/v1, /auth/v1, /storage/v1 đi thẳng mạng: SW không bao giờ
// giữ token/API response (SEC S12). Menu do app lưu ở IndexedDB (P4-T2).

import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'

declare global {
  interface Window {
    // workbox-build chèn manifest vào đúng chuỗi `self.__WB_MANIFEST` khi build.
    __WB_MANIFEST: Array<PrecacheEntry | string>
  }
}

// `self` theo lib DOM (tsconfig không tách worker) — cast cấu trúc sang
// ngữ cảnh ServiceWorkerGlobalScope (không cần lib webworker).
const swScope = self as unknown as {
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// skipWaiting CHỈ khi app xác nhận người dùng (design §8.6:
// "Có phiên bản mới — Cập nhật"). Không tự kích hoạt khi còn tab đang mở.
self.addEventListener('message', (event) => {
  const data = (event as MessageEvent).data as { type?: string } | null
  if (data?.type === 'SKIP_WAITING') void swScope.skipWaiting()
})

self.addEventListener('activate', (event) => {
  void (event as unknown as { waitUntil(p: Promise<unknown>): void }).waitUntil(swScope.clients.claim())
})
