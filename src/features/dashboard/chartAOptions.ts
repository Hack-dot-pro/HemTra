// P12-T5 — options của Chart A (tách riêng file để không vi phạm react-refresh).
import type { ApexOptions } from 'apexcharts'
import { formatVndNumber } from '../../lib/format'

/**
 * P12-T5 — Chart A dạng CỘT theo ngày trong tháng:
 * - mỗi ngày 1 cột, label ngày hiển thị đầy đủ (xoay cho vừa mobile)
 * - legend cho series "Doanh thu"
 * - BỎ toolbar zoom/pan/selection/reset (trên mobile thao tác chạm trực tiếp),
 *   bỏ chart brush phụ — giữ nguyên style glass/tooltip như chart cũ.
 */
export function buildChartAOptions(categories: string[]): ApexOptions {
  return {
    chart: {
      id: 'chart-main',
      // ApexCharts không có type 'column' — cột = 'bar' + plotOptions.bar (columnWidth).
      type: 'bar',
      background: 'transparent',
      stacked: false,
      toolbar: {
        show: true,
        autoSelected: 'pan',
        tools: {
          download: false,
          selection: false,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
        },
      },
      zoom: {
        enabled: true,
        type: 'x',
        autoScaleYaxis: true,
      },
      animations: { easing: 'easeout', speed: 300 },
      dropShadow: {
        enabled: true,
        top: 0,
        left: 0,
        blur: 6,
        color: '#38bdf8',
        opacity: 0.55,
      },
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: '62%',
        dataLabels: { position: 'top' },
      },
    },
    colors: ['#38bdf8'],
    stroke: {
      show: false,
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        type: 'vertical',
        shadeIntensity: 0.45,
        gradientToColors: ['#0284c7'],
        inverseColors: false,
        opacityFrom: 0.95,
        opacityTo: 0.45,
        stops: [0, 100],
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number | string) => {
        const num = typeof val === 'number' ? val : Number(val)
        return num > 0 ? formatVndNumber(num) : ''
      },
      offsetY: -4,
      style: {
        fontSize: '9px',
        fontFamily: 'inherit',
        colors: ['#e0f2fe'],
      },
      background: {
        enabled: true,
        foreColor: '#0369a1',
        padding: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.4)',
        opacity: 0.85,
      },
    },
    legend: {
      show: true,
      showForSingleSeries: true,
      position: 'top',
      horizontalAlign: 'right',
      fontSize: '12px',
      labels: { colors: '#e2e8f0' },
      markers: { shape: 'square', size: 8, offsetX: -2 },
      itemMargin: { horizontal: 8 },
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
        rotate: -55,
        hideOverlappingLabels: false,
        style: {
          colors: '#94a3b8',
          fontSize: '10px',
        },
      },
      axisBorder: { color: 'rgba(255, 255, 255, 0.1)' },
      axisTicks: { color: 'rgba(255, 255, 255, 0.1)' },
      tickPlacement: 'between',
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
      x: { show: true },
      y: {
        formatter: (val: number) => `${formatVndNumber(val)} ₫`,
      },
    },
  }
}

