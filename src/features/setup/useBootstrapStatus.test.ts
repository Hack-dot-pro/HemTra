import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiResult, SetupApi } from './api'
import { useBootstrapStatus } from './useBootstrapStatus'

function fakeApi(fetchBootstrapped: SetupApi['fetchBootstrapped']): SetupApi {
  return {
    fetchBootstrapped,
    requestOtp: vi.fn(),
    complete: vi.fn(),
  }
}

describe('useBootstrapStatus', () => {
  it('loading → not_bootstrapped khi bootstrapped=false', async () => {
    const api = fakeApi(async () => ({ ok: true, data: false }))
    const { result } = renderHook(() => useBootstrapStatus(api))

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('not_bootstrapped'))
  })

  it('bootstrapped=true → trạng thái bootstrapped', async () => {
    const api = fakeApi(async () => ({ ok: true, data: true }))
    const { result } = renderHook(() => useBootstrapStatus(api))

    await waitFor(() => expect(result.current.status).toBe('bootstrapped'))
  })

  it('API lỗi → error (không rơi vào not_bootstrapped)', async () => {
    const api = fakeApi(async () => ({ ok: false, message: 'x' }))
    const { result } = renderHook(() => useBootstrapStatus(api))

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('refresh gọi lại API: error → loading → kết quả mới', async () => {
    const fetchBootstrapped = vi
      .fn<() => Promise<ApiResult<boolean>>>()
      .mockResolvedValueOnce({ ok: false, message: 'x' })
      .mockResolvedValueOnce({ ok: true, data: false })
    const api = fakeApi(fetchBootstrapped)
    const { result } = renderHook(() => useBootstrapStatus(api))

    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.refresh())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('not_bootstrapped'))
    expect(fetchBootstrapped).toHaveBeenCalledTimes(2)
  })
})
