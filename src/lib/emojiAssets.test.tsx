import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductIcon } from './emojiAssets'
import { EMOJI_ITEMS, resolveEmojiUrl } from './emojiUtils'

describe('emojiAssets', () => {
  it('chứa đủ 39 ảnh emoji', () => {
    expect(EMOJI_ITEMS.length).toBe(39)
    expect(EMOJI_ITEMS[0]).toBe('/emojis/emoji-01.png')
    expect(EMOJI_ITEMS[38]).toBe('/emojis/emoji-39.png')
  })

  it('resolveEmojiUrl chuẩn hóa đúng các dạng đường dẫn', () => {
    expect(resolveEmojiUrl('/emojis/emoji-05.png')).toBe('/emojis/emoji-05.png')
    expect(resolveEmojiUrl('emoji-05.png')).toBe('/emojis/emoji-05.png')
    expect(resolveEmojiUrl('emoji-5')).toBe('/emojis/emoji-05.png')
    expect(resolveEmojiUrl('drink.png')).toBe('/emojis/drink.png')
    expect(resolveEmojiUrl('🧋')).toBeNull()
    expect(resolveEmojiUrl('')).toBeNull()
    expect(resolveEmojiUrl(null)).toBeNull()
  })

  it('ProductIcon render thẻ img cho đường dẫn ảnh', () => {
    render(<ProductIcon icon="/emojis/emoji-01.png" alt="Trà sữa" />)
    const img = screen.getByRole('img', { name: 'Trà sữa' })
    expect(img).toHaveAttribute('src', '/emojis/emoji-01.png')
  })

  it('ProductIcon fallback sang emoji text nếu là unicode', () => {
    render(<ProductIcon icon="🧋" alt="Trà sữa text" />)
    expect(screen.getByText('🧋')).toBeInTheDocument()
  })

  it('ProductIcon render fallback khi icon rỗng', () => {
    render(<ProductIcon icon="" alt="Mặc định" />)
    const img = screen.getByRole('img', { name: 'Mặc định' })
    expect(img).toHaveAttribute('src', '/emojis/emoji-01.png')
  })
})
