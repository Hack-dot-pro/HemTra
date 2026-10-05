import { type ComponentType, useCallback, useEffect, useState } from 'react'
import {
  Calendar,
  DollarSign,
  Receipt,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { formatVnd, formatVndNumber } from '../../lib/format'
import { defaultDashboardApi, type DashboardApi } from './api'
import ChartA, { type ChartAProps } from './ChartA'
import ChartB, { type ChartBProps } from './ChartB'
import {
  getCachedDashboardData,
  getVnCurrentMonthString,
  setCachedDashboardData,
} from './logic'
import type { DashboardData } from './types'

export type DashboardPageProps = {
  api?: DashboardApi
  ChartAComponent?: ComponentType<ChartAProps>
  ChartBComponent?: ComponentType<ChartBProps>
}

export default function DashboardPage({
  api = defaultDashboardApi,
  ChartAComponent = ChartA,
  ChartBComponent = ChartB,
}: DashboardPageProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getVnCurrentMonthString())
  const [data, setData] = useState<DashboardData | null>(() => {
    const cached = getCachedDashboardData()
    return cached?.month === selectedMonth ? cached.data : null
  })
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = getCachedDashboardData()
    return !cached || cached.month !== selectedMonth
  })
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<boolean>(false)

  const loadData = useCallback(
    async (month: string, isSilent = false) => {
      const cached = getCachedDashboardData()
      const hasFreshCache = cached?.month === month
      if (!isSilent && !hasFreshCache) setLoading(true)
      else setRefreshing(true)
      setError(null)
      try {
        const result = await api.fetchDashboardData(month)
        setCachedDashboardData({ month, data: result })
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi không xác định khi tải dữ liệu.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [api],
  )

  useEffect(() => {
    queueMicrotask(() => {
      void loadData(selectedMonth)
    })
  }, [loadData, selectedMonth])

  // P8-T5: Tự cập nhật khi có bill mới (Realtime/invalidate)
  useEffect(() => {
    const unsubscribe = api.subscribeRealtime(() => {
      void loadData(selectedMonth, true)
    })

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadData(selectedMonth, true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [api, loadData, selectedMonth])

  const handleMonthChange = (newMonth: string) => {
    if (!newMonth) return
    setSelectedMonth(newMonth)
  }

  const handleResetToCurrentMonth = () => {
    const cur = getVnCurrentMonthString()
    setSelectedMonth(cur)
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      {/* Header + Bộ chọn tháng */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 sm:p-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Dashboard</span>
            {refreshing && (
              <span className="text-xs font-normal text-sky-300 animate-pulse flex items-center gap-1">
                <RotateCcw className="w-3 h-3 animate-spin" /> Đang cập nhật...
              </span>
            )}
          </h1>
          <p className="text-xs text-white/60 mt-0.5">
            Thống kê doanh thu, số lượng đơn và phân tích sản phẩm bán chạy
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label htmlFor="dashboard-month-select" className="sr-only">
            Chọn tháng báo cáo
          </label>
          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20 text-xs">
            <Calendar className="w-4 h-4 text-sky-300" aria-hidden="true" />
            <input
              id="dashboard-month-select"
              data-testid="month-picker-input"
              type="month"
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            />
          </div>
          {selectedMonth !== getVnCurrentMonthString() && (
            <button
              type="button"
              onClick={handleResetToCurrentMonth}
              className="text-xs text-sky-300 hover:text-sky-200 underline px-1 py-1"
            >
              Tháng này
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadData(selectedMonth, false)}
            disabled={loading || refreshing}
            aria-label="Làm mới dữ liệu"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white transition disabled:opacity-50"
          >
            <RotateCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Thông báo lỗi nếu có */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-sm flex items-center justify-between gap-4"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadData(selectedMonth, false)}
            className="px-3 py-1 bg-red-500/40 hover:bg-red-500/60 rounded-md text-xs font-semibold text-white transition"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Trạng thái tải lần đầu */}
      {loading && !data ? (
        <div
          data-testid="dashboard-loading"
          className="glass-card p-12 flex flex-col items-center justify-center gap-3 text-white/70"
        >
          <RotateCcw className="w-8 h-8 animate-spin text-sky-400" />
          <span className="text-sm font-medium">Đang tổng hợp dữ liệu thống kê...</span>
        </div>
      ) : data ? (
        <>
          {/* P8-T1: Ba thẻ KPI */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="kpi-cards">
            {/* KPI 1: Doanh thu hôm nay */}
            <div
              className="glass-card p-5 flex items-center gap-4 border-l-4 border-l-sky-400"
              data-testid="kpi-today-revenue"
            >
              <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
                <DollarSign className="w-6 h-6 text-sky-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-white/60 font-medium">Doanh thu hôm nay</div>
                <div className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5 truncate">
                  {formatVnd(data.kpi.todayRevenue)}
                </div>
              </div>
            </div>

            {/* KPI 2: Số bill hôm nay */}
            <div
              className="glass-card p-5 flex items-center gap-4 border-l-4 border-l-emerald-400"
              data-testid="kpi-today-bills"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                <Receipt className="w-6 h-6 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-white/60 font-medium">Số đơn hôm nay</div>
                <div className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
                  {data.kpi.todayBillCount} <span className="text-sm font-normal text-white/60">đơn</span>
                </div>
              </div>
            </div>

            {/* KPI 3: Doanh thu tháng */}
            <div
              className="glass-card p-5 flex items-center gap-4 border-l-4 border-l-amber-400"
              data-testid="kpi-month-revenue"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6 text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-white/60 font-medium">Doanh thu tháng ({selectedMonth})</div>
                <div className="text-xl sm:text-2xl font-bold text-amber-300 tracking-tight mt-0.5 truncate">
                  {formatVnd(data.kpi.monthRevenue)}
                </div>
              </div>
            </div>
          </div>

          {/* P8-T2: Chart A — Đường doanh thu theo ngày */}
          <div className="glass-card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Doanh thu theo từng tháng</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30">
                    Năm {selectedMonth.slice(0, 4)}
                  </span>
                </h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Biểu đồ cột thể hiện doanh thu 12 tháng, hỗ trợ zoom in/out và di chuyển qua lại
                </p>
              </div>
            </div>

            <ChartAComponent
              categories={data.chartA.categories}
              series={data.chartA.series}
              month={selectedMonth}
            />
          </div>

          {/* P8-T3: Chart B — Vòng cung % + Rank tháng */}
          <div className="glass-card p-5 flex flex-col gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Tỷ lệ sản phẩm bán chạy trong tháng</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/30">
                  {selectedMonth}
                </span>
              </h2>
              <p className="text-xs text-white/50 mt-0.5">
                Biểu đồ vòng cung concentric biểu diễn % thị phần các món đứng đầu
              </p>
            </div>

            <ChartBComponent
              items={data.chartB.items}
              series={data.chartB.series}
              labels={data.chartB.labels}
            />
          </div>

          {/* P8-T4: Xếp hạng All-time (Top 5 bán chạy & Top 5 ít bán) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top 5 bán chạy nhất */}
            <div className="glass-card p-5" data-testid="top-best-sellers">
              <h3 className="text-sm font-bold text-emerald-300 mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-400" />
                <span>Top 5 bán chạy nhất (Toàn thời gian)</span>
              </h3>
              {data.allTime.topBest.length === 0 ? (
                <div className="text-xs text-white/50 italic py-6 text-center bg-white/5 rounded-lg">
                  Chưa có sản phẩm nào được bán.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.allTime.topBest.map((item) => (
                    <div
                      key={item.productKey}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {item.rank}
                        </span>
                        <span className="truncate font-medium text-white/90" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-right">
                        <span className="font-semibold text-white/90">{item.qty} ly</span>
                        <span className="text-amber-300 font-medium min-w-[70px]">
                          {formatVndNumber(item.revenue)} ₫
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top 5 ít bán chạy nhất (chỉ tính SP bán >= 1) */}
            <div className="glass-card p-5" data-testid="top-least-sellers">
              <h3 className="text-sm font-bold text-rose-300 mb-3 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-400" />
                <span>Top 5 ít bán nhất (Đã từng bán ≥ 1)</span>
              </h3>
              {data.allTime.topLeast.length === 0 ? (
                <div className="text-xs text-white/50 italic py-6 text-center bg-white/5 rounded-lg">
                  Chưa có dữ liệu sản phẩm đã bán.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.allTime.topLeast.map((item) => (
                    <div
                      key={item.productKey}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/40 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {item.rank}
                        </span>
                        <span className="truncate font-medium text-white/90" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-right">
                        <span className="font-semibold text-white/90">{item.qty} ly</span>
                        <span className="text-amber-300 font-medium min-w-[70px]">
                          {formatVndNumber(item.revenue)} ₫
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
