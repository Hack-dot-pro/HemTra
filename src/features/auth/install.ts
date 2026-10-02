// Cài PWA từ màn đăng nhập — plan P2-T4, design.md §8.8.

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const IOS_INSTALL_GUIDE = [
  'Nhấn nút Chia sẻ (hình vuông có mũi tên) ở thanh dưới Safari.',
  'Cuộn chọn “Thêm vào màn hình chính”.',
  'Nhấn “Thêm” ở góc phải trên để cài Hẻm Trà.',
]

export function isStandalone(
  win: Window & { navigator: { standalone?: boolean } } = window,
): boolean {
  if (typeof win.matchMedia === 'function') {
    if (win.matchMedia('(display-mode: standalone)').matches) return true
  }
  return win.navigator.standalone === true
}

export function isIosDevice(userAgent: string = navigator.userAgent): boolean {
  return /iPad|iPhone|iPod/.test(userAgent)
}

export type InstallVisibility = {
  standalone: boolean
  deferred: InstallPromptEvent | null
  isIos: boolean
}

export function canInstall({ standalone, deferred, isIos }: InstallVisibility): boolean {
  if (standalone) return false
  return deferred !== null || isIos
}
