// Stub cho `virtual:pwa-register` khi chạy vitest (alias ở vitest.config.ts).
// Bản thật do vite-plugin-pwa sinh lúc build/dev — test không cần Workbox.
export type RegisterSWOptions = {
  immediate?: boolean
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: unknown) => void
}

export function registerSW(options: RegisterSWOptions = {}): (reloadPage?: boolean) => Promise<void> {
  void options
  return async () => {}
}
