// Unit test xuất PNG — P6-T6/T9. Mock `html-to-image` (jsdom không có canvas);
// Playwright (T9) chụp PNG thật. WebKit: dùng toPng → data URL (không qua blob).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  billNodeToPngDataUrl,
  downloadBlob,
  isSafariCapture,
  preloadBillPngLib,
  warmBillImage,
} from './exportBillPng'

const toPng = vi.fn()

vi.mock('html-to-image', () => ({ toPng: (...args: unknown[]) => toPng(...args) }))

const ORIGINAL_UA = navigator.userAgent
const PNG_DATA_URL = 'data:image/png;base64,UE5H'

function setUa(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

beforeEach(() => {
  toPng.mockReset().mockResolvedValue(PNG_DATA_URL)
})

afterEach(() => {
  setUa(ORIGINAL_UA)
  vi.restoreAllMocks()
})

describe('P6-T6 — isSafariCapture', () => {
  it('UA Safari → true; Chrome/jsdom → false', () => {
    setUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15')
    expect(isSafariCapture()).toBe(true)
    setUa('Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0 Safari/537.36')
    expect(isSafariCapture()).toBe(false)
    setUa('Mozilla/5.0 (X11; Linux x86_64) jsdom/24')
    expect(isSafariCapture()).toBe(false)
  })
})

describe('P6-T6/T9 — billNodeToPngDataUrl', () => {
  it('happy (không Safari): chụp 1 lần, trả data URL PNG', async () => {
    const node = document.createElement('div')
    const dataUrl = await billNodeToPngDataUrl(node)
    expect(dataUrl).toBe(PNG_DATA_URL)
    expect(toPng).toHaveBeenCalledTimes(1)
    expect(toPng).toHaveBeenCalledWith(node, expect.objectContaining({ pixelRatio: 2, width: 720 }))
  })

  it('Safari: chụp 2 lần — lần 1 ấm (kể cả lỗi vẫn chụp tiếp)', async () => {
    setUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1')
    toPng.mockRejectedValueOnce(new Error('font not ready')).mockResolvedValueOnce(PNG_DATA_URL)
    const dataUrl = await billNodeToPngDataUrl(document.createElement('div'))
    expect(toPng).toHaveBeenCalledTimes(2)
    expect(dataUrl).toBe(PNG_DATA_URL)
  })

  it('biên: trả chuỗi không phải PNG → ném PNG_EXPORT_EMPTY', async () => {
    setUa('Mozilla/5.0 (X11; Linux x86_64) jsdom/24')
    toPng.mockResolvedValue('')
    await expect(billNodeToPngDataUrl(document.createElement('div'))).rejects.toThrow('PNG_EXPORT_EMPTY')
  })
})

describe('P6-T6 — downloadBlob', () => {
  it('tạo link download đúng tên rồi revoke URL', () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    downloadBlob(new Blob(['x']), 'HT-261003-0001.png')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(document.querySelector('a[download="HT-261003-0001.png"]')).toBeNull() // đã remove
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    vi.unstubAllGlobals()
  })
})

// P6-T9 (QC bổ sung): warm logo + nhúng <img> + nạp chunk — logic chống "offline
// mất logo / chunk chưa nạp" trước đây không có unit test (coverage file 53%).
describe('P6-T9 — warmBillImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubFetch(impl: () => Promise<{ ok: boolean; blob?: () => Promise<Blob> }>) {
    const fetchMock = vi.fn(impl)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('happy: fetch ảnh → data URL PNG, lần 2 lấy từ cache (không fetch lại)', async () => {
    const fetchMock = stubFetch(async () => ({
      ok: true,
      blob: async () => new Blob(['png-bytes'], { type: 'image/png' }),
    }))
    const src = 'https://cdn.example/logo-warm-a.png'

    const first = await warmBillImage(src)
    expect(first?.startsWith('data:image/png;base64,')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const second = await warmBillImage(src)
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('biên: src rỗng hoặc đã là data-URL → null, không gọi fetch', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true }))
    expect(await warmBillImage('')).toBeNull()
    expect(await warmBillImage('data:image/png;base64,UE5H')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lỗi: response không ok → null (không ném để không chặn xuất PNG)', async () => {
    stubFetch(async () => ({ ok: false }))
    expect(await warmBillImage('https://cdn.example/missing.png')).toBeNull()
  })

  it('lỗi: fetch ném (mất mạng) → null, không ném ra ngoài', async () => {
    stubFetch(async () => {
      throw new Error('Failed to fetch')
    })
    expect(await warmBillImage('https://cdn.example/offline.png')).toBeNull()
  })
})

describe('P6-T9 — nút nhúng ảnh vào bill trước khi chụp', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('<img> ngoài được thay bằng data-URL trước khi toPng chạy (offline không cần mạng)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['logo'], { type: 'image/png' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const node = document.createElement('div')
    const img = document.createElement('img')
    img.setAttribute('src', 'https://cdn.example/logo-embed.png')
    node.appendChild(img)
    const dataImg = document.createElement('img')
    dataImg.setAttribute('src', 'data:image/png;base64,UE5H')
    node.appendChild(dataImg)

    let captured: HTMLElement | null = null
    toPng.mockImplementation(async (target: HTMLElement) => {
      captured = target
      return PNG_DATA_URL
    })

    const out = await billNodeToPngDataUrl(node)
    expect(out).toBe(PNG_DATA_URL)
    // ảnh thường → đã warm; ảnh data-URL → giữ nguyên, không fetch thêm
    expect(img.getAttribute('src')?.startsWith('data:image/png;base64,')).toBe(true)
    expect(dataImg.getAttribute('src')).toBe('data:image/png;base64,UE5H')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(captured).toBe(node)
  })
})

describe('P6-T9 — preloadBillPngLib', () => {
  it('nạp được module html-to-image (chunk lazy) khi mở POS', async () => {
    const mod = (await preloadBillPngLib()) as { toPng?: unknown }
    expect(mod).toBeTypeOf('object')
    expect(typeof mod?.toPng).toBe('function')
  })
})
