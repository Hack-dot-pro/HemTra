import { lazy, Suspense, useMemo } from 'react'
import type { ApexOptions } from 'apexcharts'
import ErrorBoundary from '../../components/ui/ErrorBoundary'
import type { MonthlyRankItem } from './types'
import { formatVndNumber } from '../../lib/format'

const ReactApexChart = lazy(() => import('react-apexcharts'))

const RING_COLORS = ['#d946ef', '#06b6d4', '#3b82f6', '#f59e0b']

export type ChartBProps = {
  items: MonthlyRankItem[]
  series: number[]
  labels: string[]
}

export default function ChartB({ items, series, labels }: ChartBProps) {
  const hasData = items.length > 0 && series.some((val) => val > 0)
  const topCount = series.length

  const chartOptions = useMemo<ApexOptions>(() => {
    return {
      chart: {
        type: 'radialBar',
        background: 'transparent',
        sparkline: { enabled: false },
      },
      colors: RING_COLORS.slice(0, Math.max(1, topCount)),
      plotOptions: {
        radialBar: {
          startAngle: -90,
          endAngle: 90,
          hollow: {
            margin: 3,
            size: '25%',
            background: 'transparent',
          },
          track: {
            background: 'rgba(255, 255, 255, 0.08)',
            strokeWidth: '100%',
            margin: 3,
          },
          dataLabels: {
            name: {
              show: true,
              fontSize: '12px',
              fontFamily: 'inherit',
              color: '#94a3b8',
              offsetY: -15,
            },
            value: {
              show: true,
              fontSize: '16px',
              fontFamily: 'inherit',
              fontWeight: 600,
              color: '#ffffff',
              offsetY: -5,
              formatter: (val: number) => `${val}%`,
            },
            total: {
              show: true,
              label: `TOP ${topCount}`,
              color: '#38bdf8',
              fontSize: '13px',
              fontWeight: 700,
              formatter: () => 'SẢN PHẨM',
            },
          },
        },
      },
      labels: labels.length > 0 ? labels : ['Chưa có'],
      legend: {
        show: true,
        floating: false,
        fontSize: '11px',
        position: 'bottom',
        labels: { colors: '#cbd5e1' },
        markers: { size: 4 },
        formatter: (seriesName: string, opts?: { seriesIndex: number; w: { globals: { series: number[] } } }) => {
          const pct = opts?.w?.globals?.series?.[opts.seriesIndex] ?? 0
          return `${seriesName}: ${pct}%`
        },
      },
      stroke: {
        lineCap: 'round',
      },
      tooltip: {
        enabled: true,
        theme: 'dark',
      },
    }
  }, [topCount, labels])

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full items-center" data-testid="chart-b-container">
      {/* Cạnh trái: Bảng xếp hạng chi tiết trong tháng */}
      <div className="flex-1 w-full overflow-hidden">
        <h3 className="text-sm font-semibold text-white/90 mb-3 flex items-center justify-between">
          <span>Bảng xếp hạng tháng</span>
          <span className="text-xs text-white/50 font-normal">{items.length} món đã bán</span>
        </h3>
        {items.length === 0 ? (
          <div className="text-xs text-white/50 italic py-8 text-center bg-white/5 rounded-lg border border-white/10">
            Chưa có dữ liệu bán hàng trong tháng này.
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
            {items.map((item, idx) => {
              const ringColor = idx < 4 ? RING_COLORS[idx] : undefined
              return (
                <div
                  key={item.productKey}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0"
                      style={{
                        backgroundColor: ringColor ? `${ringColor}33` : 'rgba(255,255,255,0.1)',
                        color: ringColor ?? '#cbd5e1',
                        border: ringColor ? `1px solid ${ringColor}` : '1px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      {item.rank}
                    </span>
                    <span className="truncate font-medium text-white/90" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <span className="text-white/70 font-semibold">{item.qty} ly</span>
                    <span className="text-amber-300 min-w-[70px]">{formatVndNumber(item.revenue)} ₫</span>
                    <span className="w-11 text-sky-400 font-bold">{item.percentage}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Cạnh phải: Biểu đồ RadialBar Concentric (bám chart_2.png) */}
      <div className="w-full lg:w-[280px] shrink-0 flex flex-col items-center justify-center">
        {hasData ? (
          <div className="w-[280px] h-[300px]">
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
                <ReactApexChart
                  options={chartOptions}
                  series={series.length > 0 ? series : [0]}
                  type="radialBar"
                  height="100%"
                />
              </ErrorBoundary>
            </Suspense>
          </div>
        ) : (
          <div className="w-[280px] h-[240px] flex items-center justify-center text-xs text-white/40 italic bg-white/5 rounded-xl border border-white/10">
            Chưa đủ số liệu vẽ biểu đồ vòng cung
          </div>
        )}
      </div>
    </div>
  )
}
