import { describe, expect, it } from 'vitest'
import {
  computeAllTimeRanks,
  computeChartAData,
  computeKpi,
  computeMonthlyRank,
  getDaysInMonth,
  getMonthDateRange,
  getVnCurrentMonthString,
  getVnTodayString,
} from './logic'
import type { StatsDaily, StatsProductAlltime, StatsProductMonthly } from './types'

describe('dashboard/logic', () => {
  describe('múi giờ Asia/Ho_Chi_Minh', () => {
    it('18:00 UTC ngày 03/10 tương ứng 01:00 ngày 04/10 theo giờ VN', () => {
      const utcDate = new Date('2026-10-03T18:00:00Z')
      expect(getVnTodayString(utcDate)).toBe('2026-10-04')
      expect(getVnCurrentMonthString(utcDate)).toBe('2026-10')
    })

    it('16:59 UTC ngày 31/10 tương ứng 23:59 ngày 31/10 theo giờ VN', () => {
      const utcDate = new Date('2026-10-31T16:59:00Z')
      expect(getVnTodayString(utcDate)).toBe('2026-10-31')
      expect(getVnCurrentMonthString(utcDate)).toBe('2026-10')
    })

    it('17:01 UTC ngày 31/10 tương ứng 00:01 ngày 01/11 theo giờ VN', () => {
      const utcDate = new Date('2026-10-31T17:01:00Z')
      expect(getVnTodayString(utcDate)).toBe('2026-11-01')
      expect(getVnCurrentMonthString(utcDate)).toBe('2026-11')
    })
  })

  describe('getDaysInMonth & getMonthDateRange', () => {
    it('tháng 10/2026 có 31 ngày', () => {
      expect(getDaysInMonth(2026, 10)).toBe(31)
      const range = getMonthDateRange('2026-10')
      expect(range.startDate).toBe('2026-10-01')
      expect(range.endDate).toBe('2026-10-31')
      expect(range.daysInMonth).toBe(31)
    })

    it('tháng 2 năm nhuận (2024) có 29 ngày, năm thường (2025) có 28 ngày', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29)
      expect(getDaysInMonth(2025, 2)).toBe(28)
    })
  })

  describe('computeKpi', () => {
    const dailyData: StatsDaily[] = [
      { date: '2026-10-01', revenue: 50000, bill_count: 2 },
      { date: '2026-10-02', revenue: 75000, bill_count: 3 },
      { date: '2026-10-04', revenue: 25000, bill_count: 1 },
      { date: '2026-09-30', revenue: 100000, bill_count: 4 }, // Tháng khác
    ]

    it('tính đúng doanh thu hôm nay, số bill hôm nay và tổng tháng', () => {
      const kpi = computeKpi(dailyData, '2026-10-04', '2026-10')
      expect(kpi.todayRevenue).toBe(25000)
      expect(kpi.todayBillCount).toBe(1)
      expect(kpi.monthRevenue).toBe(150000) // 50k + 75k + 25k (không cộng 100k tháng 9)
    })

    it('hôm nay chưa có đơn -> trả 0 cho doanh thu và bill hôm nay', () => {
      const kpi = computeKpi(dailyData, '2026-10-05', '2026-10')
      expect(kpi.todayRevenue).toBe(0)
      expect(kpi.todayBillCount).toBe(0)
      expect(kpi.monthRevenue).toBe(150000)
    })

    it('dữ liệu rỗng -> toàn bộ bằng 0', () => {
      const kpi = computeKpi([], '2026-10-04', '2026-10')
      expect(kpi.todayRevenue).toBe(0)
      expect(kpi.todayBillCount).toBe(0)
      expect(kpi.monthRevenue).toBe(0)
    })
  })

  describe('computeChartAData', () => {
    it('điền đủ 12 tháng trong năm, tháng không bán có revenue = 0', () => {
      const dailyData: StatsDaily[] = [
        { date: '2026-01-01', revenue: 30000, bill_count: 1 },
        { date: '2026-10-15', revenue: 90000, bill_count: 3 },
      ]
      const chartA = computeChartAData(dailyData, '2026-10')
      expect(chartA.categories).toHaveLength(12)
      expect(chartA.series).toHaveLength(12)
      expect(chartA.categories[0]).toBe('Tháng 1')
      expect(chartA.series[0]).toBe(30000)
      expect(chartA.categories[1]).toBe('Tháng 2')
      expect(chartA.series[1]).toBe(0)
      expect(chartA.categories[9]).toBe('Tháng 10')
      expect(chartA.series[9]).toBe(90000)
      expect(chartA.categories[11]).toBe('Tháng 12')
      expect(chartA.series[11]).toBe(0)
    })
  })

  describe('computeMonthlyRank', () => {
    const monthlyData: StatsProductMonthly[] = [
      { month: '2026-10-01', product_key: 'p1', name: 'Trà đào cam sả', qty: 50, revenue: 1500000 },
      { month: '2026-10-01', product_key: 'p2', name: 'Trà sữa truyền thống', qty: 30, revenue: 900000 },
      { month: '2026-10-01', product_key: 'p3', name: 'Cà phê sữa đá', qty: 20, revenue: 500000 },
      { month: '2026-10-01', product_key: 'p4', name: 'Trà vải', qty: 20, revenue: 600000 }, // Trùng qty với p3 nhưng doanh thu cao hơn
      { month: '2026-10-01', product_key: 'p5', name: 'Bia hơi', qty: 10, revenue: 250000 },
    ]

    it('tính đúng tổng số lượng, thứ hạng và tỷ lệ %', () => {
      const res = computeMonthlyRank(monthlyData)
      expect(res.totalQty).toBe(130)
      expect(res.items).toHaveLength(5)

      // p1 rank 1 (50/130 ~ 38.5%)
      expect(res.items[0].productKey).toBe('p1')
      expect(res.items[0].rank).toBe(1)
      expect(res.items[0].percentage).toBe(38.5)

      // p2 rank 2 (30/130 ~ 23.1%)
      expect(res.items[1].productKey).toBe('p2')
      expect(res.items[1].rank).toBe(2)
      expect(res.items[1].percentage).toBe(23.1)

      // p4 vs p3 cùng qty=20 nhưng p4 revenue 600k > p3 500k -> p4 rank 3
      expect(res.items[2].productKey).toBe('p4')
      expect(res.items[2].rank).toBe(3)
      expect(res.items[3].productKey).toBe('p3')
      expect(res.items[3].rank).toBe(4)

      // Top 4 series cho RadialBar
      expect(res.topSeries).toHaveLength(4)
      expect(res.topLabels).toEqual([
        'Trà đào cam sả',
        'Trà sữa truyền thống',
        'Trà vải',
        'Cà phê sữa đá',
      ])
    })

    it('tie-break khi trùng cả qty và revenue: sắp theo thứ tự bảng chữ cái tiếng Việt', () => {
      const tieData: StatsProductMonthly[] = [
        { month: '2026-10-01', product_key: 'b', name: 'Trà tắc', qty: 10, revenue: 200000 },
        { month: '2026-10-01', product_key: 'a', name: 'Cà phê đen', qty: 10, revenue: 200000 },
      ]
      const res = computeMonthlyRank(tieData)
      expect(res.items[0].name).toBe('Cà phê đen')
      expect(res.items[1].name).toBe('Trà tắc')
    })

    it('xử lý an toàn khi danh sách rỗng', () => {
      const res = computeMonthlyRank([])
      expect(res.totalQty).toBe(0)
      expect(res.items).toHaveLength(0)
      expect(res.topSeries).toHaveLength(0)
      expect(res.topLabels).toHaveLength(0)
    })
  })

  describe('computeAllTimeRanks', () => {
    const allTimeData: StatsProductAlltime[] = [
      { product_key: 'p1', name: 'Món A', qty: 100, revenue: 2000000 },
      { product_key: 'p2', name: 'Món B', qty: 80, revenue: 1600000 },
      { product_key: 'p3', name: 'Món C', qty: 60, revenue: 1200000 },
      { product_key: 'p4', name: 'Món D', qty: 40, revenue: 800000 },
      { product_key: 'p5', name: 'Món E', qty: 20, revenue: 400000 },
      { product_key: 'p6', name: 'Món F', qty: 10, revenue: 200000 },
      { product_key: 'p7', name: 'Món G', qty: 5, revenue: 100000 },
      { product_key: 'p8', name: 'Món H', qty: 0, revenue: 0 }, // Chưa bán -> không tính
    ]

    it('chỉ tính sản phẩm đã bán >= 1, lấy đúng top 5 bán chạy và top 5 ít bán', () => {
      const ranks = computeAllTimeRanks(allTimeData)

      // Top 5 bán chạy nhất: A (100), B (80), C (60), D (40), E (20)
      expect(ranks.topBest).toHaveLength(5)
      expect(ranks.topBest.map((x) => x.name)).toEqual(['Món A', 'Món B', 'Món C', 'Món D', 'Món E'])

      // Top 5 ít bán chạy nhất (chỉ tính qty >= 1): G (5), F (10), E (20), D (40), C (60)
      expect(ranks.topLeast).toHaveLength(5)
      expect(ranks.topLeast.map((x) => x.name)).toEqual(['Món G', 'Món F', 'Món E', 'Món D', 'Món C'])

      // Không chứa Món H (qty = 0)
      expect(ranks.topLeast.find((x) => x.name === 'Món H')).toBeUndefined()
    })

    it('tie-break all-time deterministic: trùng qty thì so revenue rồi tới name', () => {
      const tieData: StatsProductAlltime[] = [
        { product_key: 'p1', name: 'Trà sữa', qty: 5, revenue: 150000 },
        { product_key: 'p2', name: 'Trà chanh', qty: 5, revenue: 100000 },
        { product_key: 'p3', name: 'Cà phê', qty: 5, revenue: 100000 },
      ]
      const ranks = computeAllTimeRanks(tieData)
      // Top best: Trà sữa (150k) > Cà phê (100k, 'C' trước 'T') > Trà chanh (100k)
      expect(ranks.topBest[0].name).toBe('Trà sữa')
      expect(ranks.topBest[1].name).toBe('Cà phê')
      expect(ranks.topBest[2].name).toBe('Trà chanh')

      // Top least: Cà phê (100k) < Trà chanh (100k) < Trà sữa (150k)
      expect(ranks.topLeast[0].name).toBe('Cà phê')
      expect(ranks.topLeast[1].name).toBe('Trà chanh')
      expect(ranks.topLeast[2].name).toBe('Trà sữa')
    })
  })
})
