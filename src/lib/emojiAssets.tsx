import React from 'react'
import { resolveEmojiUrl } from './emojiUtils'

export type ProductIconProps = {
  icon?: string | null
  alt?: string
  className?: string
  fallbackEmoji?: string
  size?: number | string
}

/**
 * Component hiển thị icon sản phẩm / nhóm / topping:
 * Ưu tiên hiển thị ảnh từ bộ emoji /workspaces/HemTra/emoji (public/emojis/).
 * Nếu chưa đặt icon hoặc là emoji cũ, tự động fallback sang ảnh emoji mặc định hoặc text emoji.
 */
export const ProductIcon: React.FC<ProductIconProps> = ({
  icon,
  alt = '',
  className = 'w-6 h-6 object-contain inline-block shrink-0',
  fallbackEmoji = '',
}) => {
  const imgUrl = resolveEmojiUrl(icon)

  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt={alt}
        aria-hidden={!alt ? true : undefined}
        className={className}
        loading="lazy"
        draggable={false}
      />
    )
  }

  // Nếu là emoji unicode text và có giá trị
  if (icon && icon.trim() && icon !== '—') {
    return (
      <span
        className="inline-flex items-center justify-center shrink-0"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={!alt ? true : undefined}
      >
        {icon}
      </span>
    )
  }

  // Fallback: nếu có fallbackEmoji text thì hiện, không thì dùng ảnh emoji đầu tiên
  if (fallbackEmoji) {
    const fallbackImg = resolveEmojiUrl(fallbackEmoji)
    if (fallbackImg) {
      return (
        <img
          src={fallbackImg}
          alt={alt}
          aria-hidden={!alt ? true : undefined}
          className={className}
          loading="lazy"
          draggable={false}
        />
      )
    }
    return (
      <span
        className="inline-flex items-center justify-center shrink-0"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={!alt ? true : undefined}
      >
        {fallbackEmoji}
      </span>
    )
  }

  return (
    <img
      src="/emojis/emoji-01.png"
      alt={alt}
      aria-hidden={!alt ? true : undefined}
      className={className}
      loading="lazy"
      draggable={false}
    />
  )
}
