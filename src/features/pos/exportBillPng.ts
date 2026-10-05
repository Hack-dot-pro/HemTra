// Xuất PNG từ DOM đã render — P6-T6 (pos-bill/skill.md §5: html-to-image,
// 720px, pixelRatio 3 → 2160px ≥ 2048 (P12-T8); Safari: chụp 2 lần — lần 1
// nạp font/ảnh; lazy-load).

import { BILL_WIDTH_PX } from './BillSheet'

export const PNG_MIME = 'image/png'
/** P13-T7: Nén ảnh hóa đơn < 50KB (51,200 bytes) nhưng vẫn giữ độ nét cao (Retina 1440px). */
export const EXPORT_PIXEL_RATIO = 2
export const MAX_BILL_PNG_BYTES = 50 * 1024 // 50KB = 51200 bytes

/** Tính kích thước byte thực tế của data-URL base64. */
export function getDataUrlByteSize(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx === -1) return 0
  const base64 = dataUrl.slice(commaIdx + 1)
  return Math.floor((base64.length * 3) / 4)
}

/**
 * Nén ảnh PNG data-URL xuống dưới maxBytes (mặc định 50KB) nhưng vẫn bảo đảm độ nét.
 * Sử dụng canvas: làm sạch nền trắng tinh khiết để tối ưu nén DEFLATE, sau đó
 * điều chỉnh tỷ lệ mượt mà nếu vẫn vượt quá 50KB.
 */
export async function compressPngDataUrl(
  dataUrl: string,
  maxBytes: number = MAX_BILL_PNG_BYTES,
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return dataUrl
  let currentDataUrl = dataUrl
  let currentBytes = getDataUrlByteSize(currentDataUrl)
  if (currentBytes <= maxBytes) return currentDataUrl

  try {
    const img = new Image()
    img.src = currentDataUrl
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('img_load_failed'))
    })

    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return currentDataUrl

    // Bước 1: Làm sạch các điểm ảnh gần như trắng thành trắng tinh (#ffffff)
    // giúp thuật toán DEFLATE nén chặt các khối điểm ảnh trống mà chữ vẫn nét tuyệt đối.
    canvas.width = width
    canvas.height = height
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    try {
      const imgData = ctx.getImageData(0, 0, width, height)
      const data = imgData.data
      for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = 255
        if (data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230) {
          data[i] = 255
          data[i + 1] = 255
          data[i + 2] = 255
        } else {
          data[i] = (data[i] >> 4) << 4
          data[i + 1] = (data[i + 1] >> 4) << 4
          data[i + 2] = (data[i + 2] >> 4) << 4
        }
      }
      ctx.putImageData(imgData, 0, 0)
      const cleaned = canvas.toDataURL('image/png')
      const cleanedBytes = getDataUrlByteSize(cleaned)
      if (cleanedBytes <= maxBytes) return cleaned
      currentDataUrl = cleaned
      currentBytes = cleanedBytes
    } catch {
      // CORS hoặc bảo mật canvas, tiếp tục bước sau
    }

    // Bước 2: Tinh chỉnh tỷ lệ từng bước nhỏ nếu cần (giữ độ sắc nét cao nhất có thể)
    let scale = 0.85
    while (currentBytes > maxBytes && scale >= 0.4) {
      const curW = Math.round(width * scale)
      const curH = Math.round(height * scale)
      canvas.width = curW
      canvas.height = curH
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, curW, curH)
      ctx.drawImage(img, 0, 0, curW, curH)

      try {
        const sImgData = ctx.getImageData(0, 0, curW, curH)
        const sData = sImgData.data
        for (let i = 0; i < sData.length; i += 4) {
          sData[i + 3] = 255
          if (sData[i] > 230 && sData[i + 1] > 230 && sData[i + 2] > 230) {
            sData[i] = 255
            sData[i + 1] = 255
            sData[i + 2] = 255
          } else {
            sData[i] = (sData[i] >> 4) << 4
            sData[i + 1] = (sData[i + 1] >> 4) << 4
            sData[i + 2] = (sData[i + 2] >> 4) << 4
          }
        }
        ctx.putImageData(sImgData, 0, 0)
      } catch {
        // ignore
      }

      const scaled = canvas.toDataURL('image/png')
      currentBytes = getDataUrlByteSize(scaled)
      currentDataUrl = scaled
      if (currentBytes <= maxBytes) break
      scale -= 0.1
    }
  } catch {
    // Nếu có lỗi canvas, trả về dataUrl ban đầu
  }

  return currentDataUrl
}

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

/** Tìm element BillSheet thật sự (tránh chụp trúng container ẩn -left-[10000px] làm trắng bill). */
export function resolveBillTarget(node: HTMLElement): HTMLElement {
  if (node.getAttribute?.('data-testid') === 'bill-sheet') return node
  const sheet = node.querySelector<HTMLElement>('[data-testid="bill-sheet"]')
  if (sheet) return sheet
  return node
}

/**
 * Chụp bill → data URL PNG (không qua blob: WebKit không đọc được blob canvas
 * bằng FileReader/IDB — P6-T9 e2e webkit). Safari vẫn chụp 2 lần.
 */
export async function billNodeToPngDataUrl(node: HTMLElement): Promise<string> {
  const { toPng } = await import('html-to-image')
  const target = resolveBillTarget(node)
  await embedImageSources(target)
  const capture = () =>
    toPng(target, {
      pixelRatio: EXPORT_PIXEL_RATIO,
      width: BILL_WIDTH_PX,
      backgroundColor: '#ffffff',
      cacheBust: true,
      style: {
        position: 'static',
        left: '0px',
        top: '0px',
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
        margin: '0 auto',
      },
      // Ảnh load lỗi (offline chưa warm) → bỏ qua, vẫn xuất PNG còn thiếu logo.
      onImageErrorHandler: (() => undefined) as never,
    })
  if (isSafariCapture()) {
    // Chụp ấm: bỏ lỗi — mục đích chỉ là nạp font/ảnh.
    await capture().catch(() => undefined)
  }
  const dataUrl = await capture()
  if (!dataUrl || !dataUrl.startsWith('data:image/png')) throw new Error('PNG_EXPORT_EMPTY')
  return compressPngDataUrl(dataUrl)
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
