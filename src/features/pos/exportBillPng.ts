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

// Ảnh (logo) trong bill: html-to-image fetch từng ảnh lúc chụp — offline fetch
// fail → src='' → ảnh biến mất. Chống bằng cache data-URL warm lúc POS mở
// (đang online) + onImageErrorHandler để ảnh lỗi không chặn xuất PNG (P6-T9).
const imageCache = new Map<string, string>()

export async function warmBillImage(src: string): Promise<string | null> {
  const cached = imageCache.get(src)
  if (cached) return cached
  if (!src || src.startsWith('data:')) return null
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    imageCache.set(src, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

/** Thay <img> trong bill bằng data-URL đã warm (không cần mạng lúc chụp). */
async function embedImageSources(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll('img'))
  for (const img of images) {
    const src = img.getAttribute('src')
    if (!src || src.startsWith('data:')) continue
    const dataUrl = await warmBillImage(src)
    if (dataUrl) img.src = dataUrl
  }
}

/**
 * Chụp bill → data URL PNG (không qua blob: WebKit không đọc được blob canvas
 * bằng FileReader/IDB — P6-T9 e2e webkit). Safari vẫn chụp 2 lần.
 */
export async function billNodeToPngDataUrl(node: HTMLElement): Promise<string> {
  const { toPng } = await import('html-to-image')
  await embedImageSources(node)
  const capture = () =>
    toPng(node, {
      pixelRatio: EXPORT_PIXEL_RATIO,
      width: BILL_WIDTH_PX,
      backgroundColor: '#ffffff',
      cacheBust: true,
      // Ảnh load lỗi (offline chưa warm) → bỏ qua, vẫn xuất PNG còn thiếu logo.
      onImageErrorHandler: (() => undefined) as never,
    })
  if (isSafariCapture()) {
    // Chụp ấm: bỏ lỗi — mục đích chỉ là nạp font/ảnh.
    await capture().catch(() => undefined)
  }
  const dataUrl = await capture()
  if (!dataUrl || !dataUrl.startsWith('data:image/png')) throw new Error('PNG_EXPORT_EMPTY')
  return dataUrl
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

/** Nạp sẵn chunk html-to-image lúc mở POS — offline vẫn xuất PNG (P6-T9). */
export function preloadBillPngLib(): Promise<unknown> {
  return import('html-to-image').catch(() => undefined)
}
