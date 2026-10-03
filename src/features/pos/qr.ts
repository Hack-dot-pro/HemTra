// Sinh QR Facebook — P6-T5 (pos-bill/skill.md §5, design §6.1.5).
// Lazy-load `qrcode` (skill §5: bundle đầu < 250 KB gzip) — sinh offline được.

export const FACEBOOK_URL = 'https://www.facebook.com/linh.kh.142'

/** QR dạng data-URL PNG — html-to-image cần data-URL khi xuất bill (skill §5). */
export async function generateQrDataUrl(
  text: string = FACEBOOK_URL,
  width = 224,
): Promise<string> {
  const { toDataURL } = await import('qrcode')
  return toDataURL(text, {
    width,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#111111', light: '#ffffff' },
  })
}
