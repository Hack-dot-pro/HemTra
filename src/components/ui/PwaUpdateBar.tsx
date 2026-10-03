// Thanh xác nhận cập nhật PWA — P4-T6 (design §8.6).
// KHÔNG tự reload: luôn đợi người dùng bấm "Có phiên bản mới — Cập nhật".

import { useSyncExternalStore } from 'react'
import {
  applyPwaUpdate,
  dismissPwaNotice,
  getPwaState,
  subscribePwa,
} from '../../lib/pwaClient'

function usePwaState() {
  return useSyncExternalStore(subscribePwa, getPwaState, getPwaState)
}

export default function PwaUpdateBar() {
  const state = usePwaState()

  if (state.needRefresh) {
    return (
      <div
        role="alert"
        className="fixed inset-x-3 top-3 z-50 flex items-center justify-between gap-3 rounded-xl border border-white/30 bg-dark-glass px-4 py-3 text-sm text-white backdrop-blur-xl md:inset-x-auto md:right-6 md:w-[26rem]"
      >
        <span>Có phiên bản mới — Cập nhật?</span>
        <span className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => dismissPwaNotice()}
            className="rounded-lg px-3 py-1.5 text-white/80 hover:bg-white/10"
          >
            Để sau
          </button>
          <button
            type="button"
            onClick={() => void applyPwaUpdate()}
            className="rounded-lg bg-white px-3 py-1.5 font-semibold text-[#1b6fd1] hover:bg-white/90"
          >
            Cập nhật
          </button>
        </span>
      </div>
    )
  }

  if (state.offlineReady) {
    return (
      <p role="status" className="fixed inset-x-3 top-3 z-50 rounded-xl border border-white/30 bg-dark-glass px-4 py-2 text-center text-xs text-white backdrop-blur-xl">
        Đã sẵn sàng dùng offline.
      </p>
    )
  }

  return null
}
