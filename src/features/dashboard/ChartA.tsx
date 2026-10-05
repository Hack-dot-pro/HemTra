import { lazy, Suspense, useMemo, useState } from 'react'
import ErrorBoundary from '../../components/ui/ErrorBoundary'
import { buildChartAOptions } from './chartAOptions'

const ReactApexChart = lazy(() => import('react-apexcharts'))

export type ChartAProps = {
  categories: string[]
  series: number[]
  month: string
}

export default function ChartA({ categories, series, month }: ChartAProps) {
  const [isInteracting, setIsInteracting] = useState(false)
  const hasData = series.some((val) => val > 0)
  const year = month.slice(0, 4)
  const mainOptions = useMemo(() => buildChartAOptions(categories), [categories])
  const chartSeries = useMemo(() => [{ name: 'Doanh thu', data: series }], [series])

  return (
    <div className="flex flex-col gap-2 w-full" data-testid="chart-a-container">
      {!hasData && (
        <div className="text-center py-6 text-xs text-white/50 italic">
          Năm {year} chưa phát sinh doanh thu trên hệ thống.
        </div>
      )}

      {/* Điều khiển tương tác: Zoom/kéo chart độc lập, tránh zoom cả trang web */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-1">
        <span className="text-white/70 flex items-center gap-1.5">
          {isInteracting ? (
            <span className="text-sky-300 font-medium flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              Đang tương tác biểu đồ: Zoom & kéo qua lại
            </span>
          ) : (
            <span className="text-white/50">
              💡 Chạm vào biểu đồ để phóng to / thu nhỏ & kéo xem các tháng
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={() => setIsInteracting((prev) => !prev)}
          className={`px-2.5 py-1 rounded-md transition text-xs font-medium border ${
            isInteracting
              ? 'bg-sky-500/30 text-sky-200 border-sky-400/50 shadow-sm'
              : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20'
          }`}
          data-testid="chart-a-interactive-toggle"
        >
          {isInteracting ? 'Khóa tương tác (để cuộn trang)' : 'Bật tương tác biểu đồ'}
        </button>
      </div>

      <div
        className={`w-full h-[320px] rounded-lg transition-all ${
          isInteracting
            ? 'touch-none select-none ring-1 ring-sky-400/50 bg-white/[0.02]'
            : 'touch-pan-y'
        }`}
        onClick={() => {
          if (!isInteracting) setIsInteracting(true)
        }}
        data-testid="chart-a-interactive-area"
      >
        <Suspense
          fallback={<div className="h-full flex items-center justify-center text-xs text-white/50">Đang tải biểu đồ...</div>}
        >
          <ErrorBoundary
            fallback={
              <div className="h-full flex items-center justify-center text-xs text-white/50">
                Không thể tải biểu đồ khi đang offline.
              </div>
            }
          >
            <ReactApexChart options={mainOptions} series={chartSeries} type="bar" height="100%" />
          </ErrorBoundary>
        </Suspense>
      </div>
    </div>
  )
}
