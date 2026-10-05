import type {
  AllTimeRanks,
  ChartAPoint,
  DashboardData,
  DashboardKpi,
  MonthlyRankItem,
  StatsDaily,
  StatsProductAlltime,
  StatsProductMonthly,
} from './types'

export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh'

/** Lấy ngày hôm nay định dạng 'YYYY-MM-DD' theo múi giờ Asia/Ho_Chi_Minh */
export function getVnTodayString(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(now) // 'YYYY-MM-DD'
}

/** Lấy tháng hiện tại định dạng 'YYYY-MM' theo múi giờ Asia/Ho_Chi_Minh */
export function getVnCurrentMonthString(now: Date = new Date()): string {
  return getVnTodayString(now).slice(0, 7)
}

/** Lấy số ngày trong tháng (ví dụ 2026-10 -> 31) */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Trả về ngày đầu tháng và ngày cuối tháng ('YYYY-MM-01', 'YYYY-MM-DD', days) */
export function getMonthDateRange(monthStr: string): {
  startDate: string
  endDate: string
  daysInMonth: number
  year: number
  month: number
} {
  const [yearStr, monthPart] = monthStr.split('-')
  const year = Number(yearStr) || 2026
  const month = Number(monthPart) || 1
  const daysInMonth = getDaysInMonth(year, month)
  const lastDayPad = String(daysInMonth).padStart(2, '0')
  return {
    startDate: `${yearStr}-${monthPart}-01`,
    endDate: `${yearStr}-${monthPart}-${lastDayPad}`,
    daysInMonth,
    year,
    month,
  }
}

/** Tính KPI: Doanh thu hôm nay, Số bill hôm nay, Doanh thu tháng */
export function computeKpi(
  dailyStats: StatsDaily[],
  todayStr: string,
  monthPrefix: string,
): DashboardKpi {
  let todayRevenue = 0
  let todayBillCount = 0
  let monthRevenue = 0

  for (const item of dailyStats) {
    if (item.date === todayStr) {
      todayRevenue = item.revenue
      todayBillCount = item.bill_count
    }
    if (item.date.startsWith(monthPrefix)) {
      monthRevenue += item.revenue
    }
  }

  return {
    todayRevenue,
    todayBillCount,
    monthRevenue,
  }
}

/** Chuẩn bị dữ liệu cho Chart A (đường spline doanh thu theo ngày trong tháng) */
export function computeChartAData(
  dailyStats: StatsDaily[],
  monthStr: string,
): {
  points: ChartAPoint[]
  categories: string[]
  series: number[]
} {
  const { daysInMonth, year, month } = getMonthDateRange(monthStr)
  const map = new Map<string, number>()
  for (const item of dailyStats) {
    if (item.date.startsWith(monthStr)) {
      map.set(item.date, item.revenue)
    }
  }

  const points: ChartAPoint[] = []
  const categories: string[] = []
  const series: number[] = []

  const monthPad = String(month).padStart(2, '0')

  for (let day = 1; day <= daysInMonth; day++) {
    const dayPad = String(day).padStart(2, '0')
    const dateStr = `${year}-${monthPad}-${dayPad}`
    const revenue = map.get(dateStr) ?? 0

    points.push({ day, date: dateStr, revenue })
    categories.push(dayPad)
    series.push(revenue)
  }

  return { points, categories, series }
}

/** Xếp hạng sản phẩm theo tháng (Rank, tỷ lệ %, sắp xếp giảm dần theo số lượng bán) */
export function computeMonthlyRank(
  monthlyStats: StatsProductMonthly[],
): {
  items: MonthlyRankItem[]
  topSeries: number[] // Dành cho RadialBar (tối đa top 4)
  topLabels: string[]
  totalQty: number
} {
  // Sắp xếp deterministic: qty desc -> revenue desc -> name asc
  const sorted = [...monthlyStats].sort((a, b) => {
    if (b.qty !== a.qty) return Number(b.qty - a.qty)
    if (b.revenue !== a.revenue) return Number(b.revenue - a.revenue)
    return a.name.localeCompare(b.name, 'vi')
  })

  let totalQty = 0
  for (const row of sorted) {
    totalQty += Number(row.qty)
  }

  const items: MonthlyRankItem[] = sorted.map((row, index) => {
    const qty = Number(row.qty)
    const percentage = totalQty > 0 ? Math.round((qty / totalQty) * 1000) / 10 : 0
    return {
      rank: index + 1,
      productKey: row.product_key,
      name: row.name,
      qty,
      revenue: Number(row.revenue),
      percentage,
    }
  })

  // Top 4 cho Chart B (radialBar) như mẫu chart 2.png
  const top4 = items.slice(0, 4)
  const topSeries = top4.map((item) => item.percentage)
  const topLabels = top4.map((item) => item.name)

  return {
    items,
    topSeries,
    topLabels,
    totalQty,
  }
}

/** Xếp hạng all-time: Top 5 bán chạy nhất và Top 5 ít bán chạy nhất (chỉ tính SP đã bán >= 1) */
export function computeAllTimeRanks(
  allTimeStats: StatsProductAlltime[],
): AllTimeRanks {
  // Bất biến: chỉ tính sản phẩm đã từng bán >= 1 (design §7.3)
  const sold = allTimeStats.filter((row) => Number(row.qty) >= 1)

  // Top 5 bán chạy: qty desc -> revenue desc -> name asc
  const sortedDesc = [...sold].sort((a, b) => {
    if (b.qty !== a.qty) return Number(b.qty - a.qty)
    if (b.revenue !== a.revenue) return Number(b.revenue - a.revenue)
    return a.name.localeCompare(b.name, 'vi')
  })

  // Top 5 ít bán: qty asc -> revenue asc -> name asc
  const sortedAsc = [...sold].sort((a, b) => {
    if (a.qty !== b.qty) return Number(a.qty - b.qty)
    if (a.revenue !== b.revenue) return Number(a.revenue - b.revenue)
    return a.name.localeCompare(b.name, 'vi')
  })

  const topBest = sortedDesc.slice(0, 5).map((row, idx) => ({
    rank: idx + 1,
    productKey: row.product_key,
    name: row.name,
    qty: Number(row.qty),
    revenue: Number(row.revenue),
  }))

  const topLeast = sortedAsc.slice(0, 5).map((row, idx) => ({
    rank: idx + 1,
    productKey: row.product_key,
    name: row.name,
    qty: Number(row.qty),
    revenue: Number(row.revenue),
  }))

  return { topBest, topLeast }
}

let cachedDashboardData: { month: string; data: DashboardData } | null = null

export function getCachedDashboardData(): { month: string; data: DashboardData } | null {
  return cachedDashboardData
}

export function setCachedDashboardData(val: { month: string; data: DashboardData } | null): void {
  cachedDashboardData = val
}

export function resetDashboardCache(): void {
  cachedDashboardData = null
}
