import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../../lib/supabase'
import { defaultDashboardApi, fetchDashboardData, subscribeDashboardRealtime } from './api'

type MockData = {
  daily?: unknown[]
  monthly?: unknown[]
  allTime?: unknown[]
  dailyError?: Error | null
  monthlyError?: Error | null
  allTimeError?: Error | null
}

function createMockSupabase(mockData: MockData = {}) {
  const channelCallbacks: { event: string; table: string; callback: () => void }[] = []
  let removeChannelCalled = false

  const mockChannel = {
    on: vi.fn((_type: string, filter: { event: string; table: string }, cb: () => void) => {
      channelCallbacks.push({ event: filter.event, table: filter.table, callback: cb })
      return mockChannel
    }),
    subscribe: vi.fn(() => mockChannel),
  }

  const client = {
    from: vi.fn((table: string) => {
      const queryBuilder: Record<string, unknown> = {}
      queryBuilder.select = vi.fn(() => queryBuilder)
      queryBuilder.or = vi.fn(() => queryBuilder)
      queryBuilder.eq = vi.fn(() => queryBuilder)
      queryBuilder.gte = vi.fn(() => queryBuilder)
      queryBuilder.order = vi.fn(() => {
        if (table === 'stats_daily') {
          return Promise.resolve({
            data: mockData.daily ?? [],
            error: mockData.dailyError ?? null,
          })
        }
        if (table === 'stats_product_monthly') {
          return Promise.resolve({
            data: mockData.monthly ?? [],
            error: mockData.monthlyError ?? null,
          })
        }
        if (table === 'stats_product_alltime') {
          return Promise.resolve({
            data: mockData.allTime ?? [],
            error: mockData.allTimeError ?? null,
          })
        }
        return Promise.resolve({ data: [], error: null })
      })
      return queryBuilder
    }),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(() => {
      removeChannelCalled = true
      return Promise.resolve('ok')
    }),
  } as unknown as SupabaseClient

  return { client, channelCallbacks, mockChannel, isRemoved: () => removeChannelCalled }
}

describe('dashboard/api', () => {
  let getSupabaseSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getSupabaseSpy = vi.spyOn(supabaseModule, 'getSupabase')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('báo lỗi nếu chưa khởi tạo Supabase client', async () => {
    getSupabaseSpy.mockReturnValue(null)
    await expect(fetchDashboardData('2026-10')).rejects.toThrow('Chưa khởi tạo kết nối Supabase.')
  })

  it('tải và ghép dữ liệu dashboard thành công', async () => {
    const mock = createMockSupabase({
      daily: [
        { date: '2026-10-01', revenue: 50000, bill_count: 2 },
        { date: '2026-10-04', revenue: 25000, bill_count: 1 },
      ],
      monthly: [
        {
          month: '2026-10-01',
          product_key: 'prod-1',
          name: 'Trà đào cam sả',
          qty: 15,
          revenue: 450000,
        },
      ],
      allTime: [
        {
          product_key: 'prod-1',
          name: 'Trà đào cam sả',
          qty: 100,
          revenue: 3000000,
        },
      ],
    })
    getSupabaseSpy.mockReturnValue(mock.client)

    const data = await defaultDashboardApi.fetchDashboardData('2026-10')
    expect(data.selectedMonth).toBe('2026-10')
    expect(data.chartA.categories).toHaveLength(31)
    expect(data.chartB.items).toHaveLength(1)
    expect(data.chartB.items[0].name).toBe('Trà đào cam sả')
    expect(data.allTime.topBest).toHaveLength(1)
    expect(data.allTime.topBest[0].name).toBe('Trà đào cam sả')
  })

  it('ném lỗi khi stats_daily thất bại', async () => {
    const mock = createMockSupabase({
      dailyError: new Error('Permission denied on stats_daily'),
    })
    getSupabaseSpy.mockReturnValue(mock.client)

    await expect(fetchDashboardData('2026-10')).rejects.toThrow(
      'Không tải được thống kê ngày: Permission denied on stats_daily',
    )
  })

  it('ném lỗi khi stats_product_monthly thất bại', async () => {
    const mock = createMockSupabase({
      monthlyError: new Error('Network error monthly'),
    })
    getSupabaseSpy.mockReturnValue(mock.client)

    await expect(fetchDashboardData('2026-10')).rejects.toThrow(
      'Không tải được thống kê tháng: Network error monthly',
    )
  })

  it('ném lỗi khi stats_product_alltime thất bại', async () => {
    const mock = createMockSupabase({
      allTimeError: new Error('Query timeout alltime'),
    })
    getSupabaseSpy.mockReturnValue(mock.client)

    await expect(fetchDashboardData('2026-10')).rejects.toThrow(
      'Không tải được thống kê all-time: Query timeout alltime',
    )
  })

  it('subscribeDashboardRealtime đăng ký channel và cho phép hủy đăng ký', () => {
    const mock = createMockSupabase()
    getSupabaseSpy.mockReturnValue(mock.client)

    const onChange = vi.fn()
    const unsubscribe = subscribeDashboardRealtime(onChange)

    expect(mock.mockChannel.on).toHaveBeenCalledTimes(2)
    expect(mock.mockChannel.subscribe).toHaveBeenCalledTimes(1)

    // Kích hoạt callback khi có sự kiện thay đổi
    expect(mock.channelCallbacks).toHaveLength(2)
    mock.channelCallbacks[0].callback()
    expect(onChange).toHaveBeenCalledTimes(1)

    // Hủy đăng ký
    unsubscribe()
    expect(mock.isRemoved()).toBe(true)
  })

  it('subscribeDashboardRealtime an toàn khi không có Supabase client', () => {
    getSupabaseSpy.mockReturnValue(null)
    const unsubscribe = subscribeDashboardRealtime(vi.fn())
    expect(() => unsubscribe()).not.toThrow()
  })
})
