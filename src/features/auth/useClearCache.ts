import { useCallback, useState } from 'react'

export type ClearCacheStatus = 'idle' | 'running' | 'done' | 'error'

export type ClearCacheRunner = () => Promise<void>

// P2-T5: mới chỉ giả lập để có UI + test. P4-T7 thay bằng hardRefresh() thật
// (design.md §8.7: unregister SW, xóa caches, xóa menu cache trong IndexedDB,
// giữ localStorage username, rồi location.replace).
export async function simulateClearCache(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300))
}

export function useClearCache(runner: ClearCacheRunner = simulateClearCache) {
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
