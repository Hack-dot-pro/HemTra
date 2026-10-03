import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { hardRefresh } from '../../lib/hardRefresh'
import { useClearCache } from './useClearCache'

vi.mock('../../lib/hardRefresh', () => ({ hardRefresh: vi.fn(async () => 'done') }))

describe('useClearCache', () => {
  it('chạy idle → running → done với runner do test cung cấp', async () => {
    const runner = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useClearCache(runner))

    expect(result.current.status).toBe('idle')
    expect(result.current.busy).toBe(false)

    let call: Promise<string> | undefined
    act(() => {
      call = result.current.clear()
    })
    expect(result.current.status).toBe('running')
    expect(result.current.busy).toBe(true)

    await act(async () => {
      await call
    })
    expect(result.current.status).toBe('done')
    expect(result.current.busy).toBe(false)
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('báo error khi runner thất bại', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('không xóa được'))
    const { result } = renderHook(() => useClearCache(runner))

    let call: Promise<string> | undefined
    act(() => {
      call = result.current.clear()
    })
    await act(async () => {
      await call
    })
    expect(result.current.status).toBe('error')
  })

  it('mặc định gọi hardRefresh() thật (P4-T7/P4-T8)', async () => {
    vi.mocked(hardRefresh).mockClear()
    const { result } = renderHook(() => useClearCache())
    await act(async () => {
      await result.current.clear()
    })
    expect(result.current.status).toBe('done')
    expect(hardRefresh).toHaveBeenCalledTimes(1)
  })
})
