// Xuất PNG từ DOM đã render — P6-T6 (pos-bill/skill.md §5: html-to-image,
// 720px, pixelRatio 2; Safari: chụp 2 lần — lần 1 nạp font/ảnh; lazy-load).

import { BILL_WIDTH_PX } from './BillSheet'

export const EXPORT_PIXEL_RATIO = 2
export const PNG_MIME = 'image/png'

/** Safari (bao gồm iOS) cần chụp 2 lần — lần đầu nạp font/ảnh vào cache. */
export function isSafariCapture(): boolean {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(ua)
}

export async function billNodeToBlob(node: HTMLElement): Promise<Blob> {
  const { toBlob } = await import('html-to-image')
  const capture = () =>
    toBlob(node, {
      pixelRatio: EXPORT_PIXEL_RATIO,
      width: BILL_WIDTH_PX,
      backgroundColor: '#ffffff',
      cacheBust: true,
    })
  if (isSafariCapture()) {
    // Chụp ấm: bỏ lỗi — mục đích chỉ là nạp font/ảnh.
    await capture().catch(() => undefined)
  }
  const blob = await capture()
  if (!blob) throw new Error('PNG_EXPORT_EMPTY')
  return blob
}

/** Lưu PNG về máy — fallback khi Web Share API không hỗ trợ (T8). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
