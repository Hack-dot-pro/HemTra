import { describe, expect, it } from 'vitest'
import { canInstall, isIosDevice, isStandalone } from './install'

function fakeWindow(displayMode: boolean, navigatorStandalone?: boolean) {
  return {
    matchMedia: (query: string) => ({ matches: query === '(display-mode: standalone)' && displayMode }),
    navigator: { standalone: navigatorStandalone },
  } as unknown as Window & { navigator: { standalone?: boolean } }
}

describe('isStandalone', () => {
  it('false khi chạy trong tab trình duyệt thường', () => {
    expect(isStandalone(fakeWindow(false))).toBe(false)
  })

  it('true khi PWA đang chạy standalone trên Chrome/Android', () => {
    expect(isStandalone(fakeWindow(true))).toBe(true)
  })

  it('true trên iOS Safari (navigator.standalone)', () => {
    expect(isStandalone(fakeWindow(false, true))).toBe(true)
  })
})

describe('isIosDevice', () => {
  it('nhận diện iPhone', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true)
  })

  it('nhận diện iPad', () => {
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true)
  })

  it('false với Chrome desktop', () => {
    expect(isIosDevice('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120')).toBe(false)
  })
})

describe('canInstall', () => {
  it('ẩn nút khi đã cài app (standalone)', () => {
    expect(canInstall({ standalone: true, deferred: null, isIos: true })).toBe(false)
    expect(canInstall({ standalone: true, deferred: {} as never, isIos: false })).toBe(false)
  })

  it('hiện nút khi Chrome đã phát event beforeinstallprompt', () => {
    expect(canInstall({ standalone: false, deferred: {} as never, isIos: false })).toBe(true)
  })

  it('hiện nút trên iOS Safari (không có prompt, dùng hướng dẫn thủ công)', () => {
    expect(canInstall({ standalone: false, deferred: null, isIos: true })).toBe(true)
  })

  it('ẩn nút khi chưa có prompt và không phải iOS', () => {
    expect(canInstall({ standalone: false, deferred: null, isIos: false })).toBe(false)
  })
})
