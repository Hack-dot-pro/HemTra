/** Danh sách 39 hình ảnh emoji đồ uống trong public/emojis/ */
export const EMOJI_ITEMS: string[] = Array.from({ length: 39 }, (_, i) => {
  const num = String(i + 1).padStart(2, '0')
  return `/emojis/emoji-${num}.png`
})

/**
 * Chuẩn hóa icon sang đường dẫn ảnh emoji nếu là ảnh.
 * Trả về đường dẫn ảnh `/emojis/emoji-XX.png` hoặc null nếu là emoji text / rỗng.
 */
export function resolveEmojiUrl(icon?: string | null): string | null {
  if (!icon) return null
  const trimmed = icon.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('/emojis/')) {
    return trimmed
  }
  if (trimmed.startsWith('emoji-') && trimmed.endsWith('.png')) {
    return `/emojis/${trimmed}`
  }
  if (/^emoji-\d+$/i.test(trimmed)) {
    const num = trimmed.replace(/\D/g, '').padStart(2, '0')
    return `/emojis/emoji-${num}.png`
  }
  if (trimmed.endsWith('.png') || trimmed.endsWith('.webp') || trimmed.endsWith('.jpg')) {
    return trimmed.startsWith('/') ? trimmed : `/emojis/${trimmed}`
  }

  return null
}
