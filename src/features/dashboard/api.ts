import { getSupabase } from '../../lib/supabase'
import {
  computeAllTimeRanks,
  computeChartAData,
  computeKpi,
  computeMonthlyRank,
  getVnCurrentMonthString,
  getVnTodayString,
} from './logic'
import type {
  DashboardData,
  StatsDaily,
  StatsProductAlltime,
  StatsProductMonthly,
} from './types'

export type DashboardApi = {
  fetchDashboardData: (selectedMonth: string) => Promise<DashboardData>
  subscribeRealtime: (onChange: () => void) => () => void
}

/** Tải dữ liệu tổng hợp cho màn hình Dashboard */
export async function fetchDashboardData(selectedMonth: string): Promise<DashboardData> {
  const supabase = getSupabase()
  if (!supabase) {
    throw new Error('Chưa khởi tạo kết nối Supabase.')
  }

  const todayStr = getVnTodayString()
  const currentMonthStr = getVnCurrentMonthString()
  const [yearStr] = selectedMonth.split('-')
  const year = yearStr || '2026'
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const monthDate = `${selectedMonth}-01`

  // Tải song song: stats_daily (của cả năm được chọn + hôm nay), stats_product_monthly, stats_product_alltime
  const [dailyRes, monthlyRes, allTimeRes] = await Promise.all([
    supabase
      .from('stats_daily')
      .select('date, revenue, bill_count')
      .or(`and(date.gte.${yearStart},date.lte.${yearEnd}),date.eq.${todayStr}`)
      .order('date', { ascending: true }),
    supabase
      .from('stats_product_monthly')
      .select('month, product_key, name, qty, revenue')
      .eq('month', monthDate)
      .order('qty', { ascending: false }),
    supabase
      .from('stats_product_alltime')
      .select('product_key, name, qty, revenue')
      .gte('qty', 1)
      .order('qty', { ascending: false }),
  ])

  if (dailyRes.error) {
    throw new Error(`Không tải được thống kê ngày: ${dailyRes.error.message}`)
  }
  if (monthlyRes.error) {
    throw new Error(`Không tải được thống kê tháng: ${monthlyRes.error.message}`)
  }
  if (allTimeRes.error) {
    throw new Error(`Không tải được thống kê all-time: ${allTimeRes.error.message}`)
  }

  const dailyRows: StatsDaily[] = (dailyRes.data ?? []).map((row) => ({
    date: row.date,
    revenue: Number(row.revenue),
    bill_count: Number(row.bill_count),
  }))

  const monthlyRows: StatsProductMonthly[] = (monthlyRes.data ?? []).map((row) => ({
    month: row.month,
    product_key: row.product_key,
    name: row.name,
    qty: Number(row.qty),
    revenue: Number(row.revenue),
  }))

  const allTimeRows: StatsProductAlltime[] = (allTimeRes.data ?? []).map((row) => ({
    product_key: row.product_key,
    name: row.name,
    qty: Number(row.qty),
    revenue: Number(row.revenue),
  }))

  const kpi = computeKpi(dailyRows, todayStr, currentMonthStr)
  const chartA = computeChartAData(dailyRows, selectedMonth)

  // P13-T3: Nếu tháng chọn không phát sinh đơn nào (hoặc đã xóa hết bill),
  // bảo đảm bảng xếp hạng tháng và all-time không hiển thị số liệu mồ côi.
  const monthBillCount = dailyRows
    .filter((r) => r.date.startsWith(selectedMonth))
    .reduce((sum, r) => sum + r.bill_count, 0)
  const totalSystemBills = dailyRows.reduce((sum, r) => sum + r.bill_count, 0)

  const activeMonthlyRows = monthBillCount > 0 ? monthlyRows : []
  const activeAllTimeRows = totalSystemBills > 0 ? allTimeRows : []

  const monthlyRank = computeMonthlyRank(activeMonthlyRows)
  const allTime = computeAllTimeRanks(activeAllTimeRows)

  return {
    selectedMonth,
    kpi,
    chartA: {
      categories: chartA.categories,
      series: chartA.series,
    },
    chartB: {
      items: monthlyRank.items,
      series: monthlyRank.topSeries,
      labels: monthlyRank.topLabels,
    },
    allTime,
  }
}

/** Lắng nghe Realtime khi có thay đổi liên quan đến bill/stats để tự cập nhật */
export function subscribeDashboardRealtime(onChange: () => void): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}

  // Lắng nghe trên stats_daily và bills
  const channel = supabase
    .channel('dashboard-stats-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stats_daily' },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bills' },
      () => onChange(),
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export const defaultDashboardApi: DashboardApi = {
  fetchDashboardData,
  subscribeRealtime: subscribeDashboardRealtime,
}
