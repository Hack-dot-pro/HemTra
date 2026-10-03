// Unit test xuất PNG — P6-T6/T9. Mock `html-to-image` (jsdom không có canvas);
// Playwright (T9) chụp PNG thật. WebKit: dùng toPng → data URL (không qua blob).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { billNodeToPngDataUrl, downloadBlob, isSafariCapture } from './exportBillPng'

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
