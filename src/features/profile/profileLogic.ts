// P12-T9 — helpers thuần cho modal hồ sơ: đổi ảnh (nén về 256px) + tính diff.

export const AVATAR_MAX_EDGE = 256

/**
 * File ảnh → data-URL nén (≤ 256px cạnh dài nhất, JPEG 0.85 nếu có nền,
 * PNG nếu nền trong suốt). Quá lớn sau nén → ném lỗi tiếng Việt để FE báo.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Chỉ chọn file ảnh (PNG/JPG/WEBP).')
  if (file.size > 5 * 1024 * 1024) throw new Error('Ảnh quá lớn — chọn ảnh dưới 5MB.')

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Không đọc được file ảnh.'))
    reader.readAsDataURL(file)
  })

  if (typeof document === 'undefined') return dataUrl
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const node = new Image()
    node.onload = () => resolve(node)
    node.onerror = () => reject(new Error('Ảnh không hợp lệ.'))
    node.src = dataUrl
  })

  const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, width, height)

  const hasTransparency = detectTransparency(ctx, width, height)
  const out = canvas.toDataURL(hasTransparency ? 'image/png' : 'image/jpeg', 0.85)
  if (out.length > 900_000) throw new Error('Ảnh vẫn quá lớn sau khi nén — chọn ảnh khác.')
  return out
}

/** Quét pixel (lưới thưa — đủ để phát hiện nền trong suốt của logo). */
function detectTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const stepX = Math.max(1, Math.floor(width / 32))
    const stepY = Math.max(1, Math.floor(height / 32))
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        if (ctx.getImageData(x, y, 1, 1).data[3] < 250) return true
      }
    }
  } catch {
    return false
  }
  return false
}

export type ProfileForm = {
  display_name: string
  username: string
  password: string
}

/**
 * So sánh form với profile hiện tại → chỉ gửi phần THẬT SỰ đổi
 * (server cũng chỉ nhận field có mặt trong body).
 */
export function changedProfileFields(
  initial: { display_name: string; username: string },
  form: ProfileForm,
): { display_name?: string; username?: string; password?: string } {
  const changes: { display_name?: string; username?: string; password?: string } = {}
  const nextDisplay = form.display_name.trim()
  const nextUsername = form.username.trim().toLowerCase()
  if (nextDisplay && nextDisplay !== initial.display_name) changes.display_name = nextDisplay
  if (nextUsername && nextUsername !== initial.username) changes.username = nextUsername
  if (form.password) changes.password = form.password
  return changes
}

/** Chữ viết tắt avatar khi chưa có ảnh: 1–2 ký tự đầu của tên hiển thị/tên đăng nhập. */
export function avatarInitials(displayName: string, username: string): string {
  const source = (displayName || username || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}
