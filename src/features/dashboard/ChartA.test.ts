import { describe, expect, it } from 'vitest'
import { buildChartAOptions } from './chartAOptions'

describe('P12-T5 — options Chart A dạng cột', () => {
  const categories = ['01', '02', '03']
  const options = buildChartAOptions(categories)

  it('dùng loại cột theo ngày (Apex: type bar + columnWidth)', () => {
    expect(options.chart?.type).toBe('bar')
    expect(options.plotOptions?.bar?.columnWidth).toBe('62%')
    expect(options.plotOptions?.bar?.horizontal).toBeUndefined() // cột đứng
    expect(options.xaxis?.categories).toEqual(categories)
  })

  it('hỗ trợ tương tác zoom và kéo (toolbar zoomin/zoomout/pan/reset, zoom enabled)', () => {
    expect(options.chart?.toolbar?.show).toBe(true)
    expect(options.chart?.zoom?.enabled).toBe(true)
    expect(options.chart?.toolbar?.autoSelected).toBe('pan')
    expect(options.chart?.toolbar?.tools?.zoomin).toBe(true)
    expect(options.chart?.toolbar?.tools?.zoomout).toBe(true)
    expect(options.chart?.toolbar?.tools?.pan).toBe(true)
    expect(options.chart?.toolbar?.tools?.reset).toBe(true)
  })

  it('có legend cho series', () => {
    expect(options.legend?.show).toBe(true)
    expect(options.legend?.position).toBe('top')
  })

  it('label ngày hiển thị đầy đủ, không ẩn nhãn bị chồng', () => {
    expect(options.xaxis?.labels?.hideOverlappingLabels).toBe(false)
    expect(options.xaxis?.labels?.style?.fontSize).toBe('10px')
  })

  it('dataLabels định dạng VND và ẩn khi doanh thu 0', () => {
    const formatter = options.dataLabels?.formatter
    const opts = { series: [[150_000]], dataPointIndex: 0, seriesIndex: 0, w: {} as never }
    expect(formatter?.(150_000, opts)).toBe('150.000')
    expect(formatter?.(0, { ...opts, dataPointIndex: 1 })).toBe('')
  })
})
