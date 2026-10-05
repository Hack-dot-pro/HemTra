export type StatsDaily = {
  date: string // 'YYYY-MM-DD'
  revenue: number
  bill_count: number
}

export type StatsProductMonthly = {
  month: string // 'YYYY-MM-01'
  product_key: string
  name: string
  qty: number
  revenue: number
}

export type StatsProductAlltime = {
  product_key: string
  name: string
  qty: number
  revenue: number
}

export type DashboardKpi = {
  todayRevenue: number
  todayBillCount: number
  monthRevenue: number
}

export type ChartAPoint = {
  month: number
  label: string
  revenue: number
}

export type MonthlyRankItem = {
  rank: number
  productKey: string
  name: string
  qty: number
  revenue: number
  percentage: number
}

export type AllTimeRankItem = {
  rank: number
  productKey: string
  name: string
  qty: number
  revenue: number
}

export type AllTimeRanks = {
  topBest: AllTimeRankItem[]
  topLeast: AllTimeRankItem[]
}

export type DashboardData = {
  selectedMonth: string // 'YYYY-MM'
  kpi: DashboardKpi
  chartA: {
    categories: string[]
    series: number[]
  }
  chartB: {
    items: MonthlyRankItem[]
    series: number[] // percentages for radialBar (e.g. top 4)
    labels: string[] // product names
  }
  allTime: AllTimeRanks
}
