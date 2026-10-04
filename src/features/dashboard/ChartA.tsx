import { lazy, Suspense, useMemo } from 'react'
import type { ApexOptions } from 'apexcharts'
import { formatVndNumber } from '../../lib/format'

const ReactApexChart = lazy(() => import('react-apexcharts'))

export type ChartAProps = {
  categories: string[]
  series: number[]
  month: string
}

export default function ChartA({ categories, series, month }: ChartAProps) {
  const hasData = series.some((val) => val > 0)

  const mainOptions = useMemo<ApexOptions>(() => {
    return {
      chart: {
        id: 'chart-main',
        type: 'area',
        background: 'transparent',
        toolbar: {
          show: true,
          tools: {
            download: true,
            selection: true,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true,
          },
        },
        dropShadow: {
          enabled: true,
          top: 0,
          left: 0,
          blur: 6,
          color: '#38bdf8',
          opacity: 0.75,
        },
      },
      colors: ['#38bdf8'],
      stroke: {
        curve: 'smooth',
        width: 3,
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'dark',
          type: 'vertical',
          shadeIntensity: 0.5,
          gradientToColors: ['#0284c7'],
          inverseColors: false,
          opacityFrom: 0.35,
          opacityTo: 0.05,
          stops: [0, 90, 100],
        },
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number | string) => {
          const num = typeof val === 'number' ? val : Number(val)
          return num > 0 ? formatVndNumber(num) : ''
        },
        style: {
          fontSize: '10px',
          fontFamily: 'inherit',
          colors: ['#e0f2fe'],
        },
        background: {
          enabled: true,
          foreColor: '#0369a1',
          padding: 3,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: 'rgba(56, 189, 248, 0.4)',
          opacity: 0.85,
        },
      },
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        strokeDashArray: 4,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
      },
      xaxis: {
        categories,
        labels: {
          style: {
            colors: '#94a3b8',
            fontSize: '11px',
          },
        },
        axisBorder: { color: 'rgba(255, 255, 255, 0.1)' },
        axisTicks: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      yaxis: {
        labels: {
          formatter: (val: number) => {
            if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
            if (val >= 1_000) return `${Math.round(val / 1000)}k`
            return String(val)
          },
          style: {
            colors: '#94a3b8',
            fontSize: '11px',
          },
        },
      },
      tooltip: {
        theme: 'dark',
        y: {
          formatter: (val: number) => `${formatVndNumber(val)} ₫`,
        },
      },
    }
  }, [categories])

  const brushOptions = useMemo<ApexOptions>(() => {
    return {
      chart: {
        id: 'chart-brush',
        type: 'area',
        background: 'transparent',
        brush: {
          target: 'chart-main',
          enabled: true,
        },
        selection: {
          enabled: true,
          xaxis: {
            min: 1,
            max: Math.min(15, categories.length),
          },
          fill: {
            color: '#a855f7',
            opacity: 0.2,
          },
          stroke: {
            width: 1,
            color: '#c084fc',
          },
        },
      },
      colors: ['#c084fc'],
      stroke: {
        curve: 'smooth',
        width: 1.5,
      },
      fill: {
        type: 'solid',
        opacity: 0.1,
      },
      grid: {
        show: false,
      },
      xaxis: {
        categories,
        labels: { show: false },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        show: false,
      },
      tooltip: { enabled: false },
    }
  }, [categories])

  const chartSeries = useMemo(() => [{ name: 'Doanh thu', data: series }], [series])

  return (
    <div className="flex flex-col gap-2 w-full" data-testid="chart-a-container">
      {!hasData && (
        <div className="text-center py-6 text-xs text-white/50 italic">
          Tháng {month} chưa phát sinh doanh thu trên hệ thống.
        </div>
      )}
      <div className="w-full h-[280px]">
        <Suspense
          fallback={<div className="h-full flex items-center justify-center text-xs text-white/50">Đang tải biểu đồ...</div>}
        >
          <ReactApexChart options={mainOptions} series={chartSeries} type="area" height="100%" />
        </Suspense>
      </div>
      <div className="w-full h-[90px] -mt-2">
        <Suspense fallback={null}>
          <ReactApexChart options={brushOptions} series={chartSeries} type="area" height="100%" />
        </Suspense>
      </div>
    </div>
  )
}
