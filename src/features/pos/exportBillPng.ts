// Xuất PNG từ DOM đã render — P6-T6 (pos-bill/skill.md §5: html-to-image,
// 720px, pixelRatio 3 → 2160px ≥ 2048 (P12-T8); Safari: chụp 2 lần — lần 1
// nạp font/ảnh; lazy-load).

import { BILL_WIDTH_PX } from './BillSheet'

export const PNG_MIME = 'image/png'
/** P12-T8: 720px × 3 = 2160px ≥ 2048 (2K) — preview & ảnh lưu đều đạt chuẩn 2K. */
export const EXPORT_PIXEL_RATIO = 3

/**
 * Đọc kích thước PNG từ data-URL (IHDR) — không cần decode cả ảnh.
 * Dùng để test/e2e chứng minh ảnh ≥ 2048px (P12-T8).
 */
export function pngDataUrlSize(dataUrl: string): { width: number; height: number } | null {
  try {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const bin = atob(base64)
    // PNG: 8 chữ ký + 4 (IHDR length) + 4 ("IHDR") + 4 width + 4 height
    if (bin.slice(0, 8) !== '\x89PNG\r\n\x1a\n' || bin.slice(12, 16) !== 'IHDR') return null
    const view = new DataView(new ArrayBuffer(8)) // width + height
    for (let i = 0; i < 8; i++) view.setUint8(i, bin.charCodeAt(16 + i))
    return { width: view.getUint32(0), height: view.getUint32(4) }
  } catch {
    return null
  }
}

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
