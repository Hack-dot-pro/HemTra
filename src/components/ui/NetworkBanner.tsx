// Banner mạng + tuổi cache — P4-T4 (design §8.4–8.5, uiux/skill.md §4).
// 3 trạng thái người dùng cần biết khi bán: offline, giá cập nhật lúc mấy giờ,
// cache quá 24 giờ (vẫn cho bán — chỉ cảnh báo).

import { WifiOff, AlertTriangle } from 'lucide-react'
import { formatClockTime } from '../../lib/format'
import { isMenuStale, useMenuSnapshot, useOnlineStatus } from '../../lib/useMenu'

function bannerClass(tone: 'offline' | 'stale'): string {
  return [
    'mb-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium backdrop-blur-xl',
    tone === 'offline' ? 'border border-white/30 bg-amber-500/25 text-amber-50' : 'border border-orange-300/50 bg-orange-500/25 text-orange-50',
  ].join(' ')
}

export default function NetworkBanner() {
  const online = useOnlineStatus()
  const snapshot = useMenuSnapshot()
  const stale = isMenuStale(snapshot)
  const fetchedAt = snapshot?.fetched_at ?? 0

  if (online && !stale) return null

  if (!online) {
    return (
      <div role="status" className={bannerClass('offline')}>
        <WifiOff size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          Đang offline — giá cập nhật lúc {fetchedAt ? formatClockTime(fetchedAt) : 'chưa đồng bộ'}
          {stale ? ' · cache quá 24 giờ, giá có thể chưa mới nhất' : ''}
        </span>
      </div>
    )
  }

  return (
    <div role="status" className={bannerClass('stale')}>
      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>Menu cache quá 24 giờ (cập nhật lúc {formatClockTime(fetchedAt)}) — nên tải lại để lấy giá mới.</span>
    </div>
  )
}
