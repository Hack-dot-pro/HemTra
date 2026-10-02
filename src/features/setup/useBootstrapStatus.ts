import { useCallback, useEffect, useState } from 'react'
import { defaultApi, type SetupApi } from './api'

// Trạng thái cờ `app_meta.bootstrapped` — màn hình đăng ký chỉ hiện khi
// 'not_bootstrapped' (design §4.2.1); lỗi → ẩn lặng, không chặn đăng nhập.
export type BootstrapStatus = 'loading' | 'bootstrapped' | 'not_bootstrapped' | 'error'

export type BootstrapStatusState = {
  status: BootstrapStatus
  refresh: () => void
}

// `api` phải ổn định giữa các lần render (module default hoặc prop đã useMemo) —
// thay object mỗi render sẽ gây loop.
export function useBootstrapStatus(api: SetupApi = defaultApi): BootstrapStatusState {
  const [status, setStatus] = useState<BootstrapStatus>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    void api.fetchBootstrapped().then((result) => {
      if (!alive) return
      if (!result.ok) setStatus('error')
      else setStatus(result.data ? 'bootstrapped' : 'not_bootstrapped')
    })
    return () => {
      alive = false
    }
  }, [api, attempt])

  const refresh = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])
  return { status, refresh }
}
