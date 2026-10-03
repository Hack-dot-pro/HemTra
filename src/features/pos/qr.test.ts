// Unit test QR — P6-T5. Dùng thư viện thật (sinh được cả khi offline).

import { describe, expect, it } from 'vitest'
import { FACEBOOK_URL, generateQrDataUrl } from './qr'

describe('P6-T5 — sinh QR Facebook', () => {
  it('happy: trả data-URL PNG cho URL Facebook mặc định', async () => {
    const url = await generateQrDataUrl()
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(url.length).toBeGreaterThan(500)
  })

  it('happy: cùng input → cùng output (deterministic) và khác width → khác ảnh', async () => {
    const a = await generateQrDataUrl()
    const b = await generateQrDataUrl()
    expect(a).toBe(b)
    const big = await generateQrDataUrl(FACEBOOK_URL, 448)
    expect(big).not.toBe(a)
  })

  it('biên: nội dung tùy biến (dùng cho test offline code ở T7 nếu cần)', async () => {
    const url = await generateQrDataUrl('HT-261003-OFF-ab12')
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('FACEBOOK_URL khớp design §6.1.5', () => {
    expect(FACEBOOK_URL).toBe('https://www.facebook.com/linh.kh.142')
  })
})
