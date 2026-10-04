import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardApi } from './api'
import DashboardPage from './DashboardPage'
import type { DashboardData } from './types'

const MOCK_DATA: DashboardData = {
  selectedMonth: '2026-10',
  kpi: {
    todayRevenue: 25000,
    todayBillCount: 1,
    monthRevenue: 150000,
  },
  chartA: {
    categories: ['01', '02', '03', '04'],
    series: [50000, 75000, 0, 25000],
  },
  chartB: {
    items: [
      {
        rank: 1,
        productKey: 'p1',
        name: 'Trà đào cam sả',
        qty: 15,
        revenue: 450000,
        percentage: 60,
      },
      {
        rank: 2,
        productKey: 'p2',
        name: 'Trà vải',
        qty: 10,
        revenue: 300000,
        percentage: 40,
      },
    ],
    series: [60, 40],
    labels: ['Trà đào cam sả', 'Trà vải'],
  },
  allTime: {
    topBest: [
      {
        rank: 1,
        productKey: 'p1',
        name: 'Trà đào cam sả',
        qty: 100,
        revenue: 3000000,
      },
    ],
    topLeast: [
      {
        rank: 1,
        productKey: 'p2',
        name: 'Bia hơi',
        qty: 2,
        revenue: 50000,
      },
    ],
  },
}

function MockChartA(props: { month: string; series: number[] }) {
  return (
    <div data-testid="mock-chart-a">
      <span>Mock Chart A for {props.month}</span>
      <span>Points: {props.series.length}</span>
    </div>
  )
}

function MockChartB(props: { items: { name: string }[] }) {
  return (
    <div data-testid="mock-chart-b">
      <span>Mock Chart B items: {props.items.length}</span>
      {props.items.map((it) => (
        <span key={it.name}>{it.name}</span>
      ))}
    </div>
  )
}

describe('DashboardPage', () => {
  let realtimeCallback: (() => void) | null = null

  const fakeApi: DashboardApi = {
    fetchDashboardData: vi.fn(),
    subscribeRealtime: vi.fn(),
  }

  beforeEach(() => {
    realtimeCallback = null
    fakeApi.fetchDashboardData = vi.fn().mockResolvedValue(MOCK_DATA)
    fakeApi.subscribeRealtime = vi.fn((cb: () => void) => {
      realtimeCallback = cb
      return () => {
        realtimeCallback = null
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('hiển thị trạng thái đang tải ban đầu và sau đó hiển thị 3 thẻ KPI', async () => {
    render(
      <DashboardPage
        api={fakeApi}
        ChartAComponent={MockChartA}
        ChartBComponent={MockChartB}
      />,
    )

    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('kpi-cards')).toBeInTheDocument()
    })

    const kpiCards = screen.getByTestId('kpi-cards')
    expect(kpiCards).toHaveTextContent('Doanh thu hôm nay')
    expect(kpiCards).toHaveTextContent(/25\.000/)
    expect(kpiCards).toHaveTextContent('Số đơn hôm nay')
    expect(kpiCards).toHaveTextContent(/1\s*đơn/)
    expect(kpiCards).toHaveTextContent(/Doanh thu tháng/)
    expect(kpiCards).toHaveTextContent(/150\.000/)
  })

  it('hiển thị Chart A, Chart B và bảng xếp hạng All-Time', async () => {
    render(
      <DashboardPage
        api={fakeApi}
        ChartAComponent={MockChartA}
        ChartBComponent={MockChartB}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('mock-chart-a')).toBeInTheDocument()
      expect(screen.getByTestId('mock-chart-b')).toBeInTheDocument()
    })

    // All-time top 5 bán chạy & ít bán
    expect(screen.getByText('Top 5 bán chạy nhất (Toàn thời gian)')).toBeInTheDocument()
    expect(screen.getByText('Top 5 ít bán nhất (Đã từng bán ≥ 1)')).toBeInTheDocument()
    expect(screen.getAllByText('Trà đào cam sả').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Bia hơi')).toBeInTheDocument()
  })

  it('thay đổi tháng trong bộ chọn tháng gọi lại API với tháng mới', async () => {
    render(
      <DashboardPage
        api={fakeApi}
        ChartAComponent={MockChartA}
        ChartBComponent={MockChartB}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Chọn tháng báo cáo')).toBeInTheDocument()
    })

    const input = screen.getByLabelText('Chọn tháng báo cáo')
    fireEvent.change(input, { target: { value: '2026-09' } })

    await waitFor(() => {
      expect(fakeApi.fetchDashboardData).toHaveBeenCalledWith('2026-09')
    })
  })

  it('xử lý lỗi khi API thất bại và cho phép thử lại', async () => {
    const errorApi: DashboardApi = {
      fetchDashboardData: vi
        .fn()
        .mockRejectedValueOnce(new Error('Lỗi kết nối máy chủ'))
        .mockResolvedValueOnce(MOCK_DATA),
      subscribeRealtime: vi.fn(() => () => {}),
    }

    render(
      <DashboardPage
        api={errorApi}
        ChartAComponent={MockChartA}
        ChartBComponent={MockChartB}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('Lỗi kết nối máy chủ')).toBeInTheDocument()
    })

    const retryBtn = screen.getByText('Thử lại')
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByTestId('kpi-cards')).toBeInTheDocument()
    })
  })

  it('tự động cập nhật dữ liệu khi Realtime kích hoạt', async () => {
    render(
      <DashboardPage
        api={fakeApi}
        ChartAComponent={MockChartA}
        ChartBComponent={MockChartB}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('kpi-cards')).toBeInTheDocument()
    })

    expect(fakeApi.fetchDashboardData).toHaveBeenCalledTimes(1)

    // Giả lập Realtime báo có bill mới
    expect(realtimeCallback).toBeTruthy()
    realtimeCallback?.()

    await waitFor(() => {
      expect(fakeApi.fetchDashboardData).toHaveBeenCalledTimes(2)
    })
  })
})
