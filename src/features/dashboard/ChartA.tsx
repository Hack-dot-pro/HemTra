import { lazy, Suspense, useMemo } from 'react'
import ErrorBoundary from '../../components/ui/ErrorBoundary'
import { buildChartAOptions } from './chartAOptions'

const ReactApexChart = lazy(() => import('react-apexcharts'))

export type ChartAProps = {
  categories: string[]
  series: number[]
  month: string
}

export default function ChartA({ categories, series, month }: ChartAProps) {
  const hasData = series.some((val) => val > 0)
  const mainOptions = useMemo(() => buildChartAOptions(categories), [categories])
  const chartSeries = useMemo(() => [{ name: 'Doanh thu', data: series }], [series])

  return (
    <div className="flex flex-col gap-2 w-full" data-testid="chart-a-container">
      {!hasData && (
        <div className="text-center py-6 text-xs text-white/50 italic">
          Tháng {month} chưa phát sinh doanh thu trên hệ thống.
        </div>
      )}
      <div className="w-full h-[300px]">
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
