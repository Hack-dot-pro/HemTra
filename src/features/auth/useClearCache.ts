import { useCallback, useState } from 'react'
import { hardRefresh } from '../../lib/hardRefresh'

export type ClearCacheStatus = 'idle' | 'running' | 'done' | 'error'

export type ClearCacheRunner = () => Promise<void>

// P4-T7/P4-T8: runner mặc định là hardRefresh() thật (design §8.7) —
// unregister SW, xóa cache, xóa menu cache (giữ outbox), tải lại.
export async function clearCacheAndReload(): Promise<void> {
  await hardRefresh()
}

// Runner giả lập — chỉ dùng cho test không muốn đụng IndexedDB/điều hướng.
export async function simulateClearCache(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300))
}

export function useClearCache(runner: ClearCacheRunner = clearCacheAndReload) {
  const [status, setStatus] = useState<ClearCacheStatus>('idle')

  const clear = useCallback(async (): Promise<ClearCacheStatus> => {
    setStatus('running')
    try {
      await runner()
      setStatus('done')
      return 'done'
    } catch {
      setStatus('error')
      return 'error'
    }
  }, [runner])

  return { status, busy: status === 'running', clear }
}
