import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import { injectAuth } from './helpers'

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
]

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
  'access-control-expose-headers': 'content-range',
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return {
    status,
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  }
}

async function preflight(route: Route): Promise<void> {
  const requested =
    route.request().headers()['access-control-request-headers'] ?? 'authorization, apikey, content-type'
  await route.fulfill({
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': requested,
      'access-control-max-age': '86400',
    },
    body: '',
  })
}

// Giả lập tháng hiện tại: 2026-10 (khớp VN time)
const MONTH_STR = '2026-10'

const SEED_STATS_DAILY = [
  { date: '2026-10-01', revenue: 150000, bill_count: 5 },
  { date: '2026-10-02', revenue: 200000, bill_count: 8 },
  { date: '2026-10-03', revenue: 120000, bill_count: 4 },
  { date: '2026-10-04', revenue: 85000, bill_count: 3 },
]

const SEED_PRODUCT_MONTHLY = [
  { month: `${MONTH_STR}-01`, product_key: '00000000-0000-0000-0000-000000000001', name: 'Trà Sữa Ô Long', qty: 20, revenue: 500000 },
  { month: `${MONTH_STR}-01`, product_key: '00000000-0000-0000-0000-000000000002', name: 'Trà Đào Cam Sả', qty: 15, revenue: 375000 },
  { month: `${MONTH_STR}-01`, product_key: '00000000-0000-0000-0000-000000000003', name: 'Hồng Trà Sữa', qty: 10, revenue: 250000 },
  { month: `${MONTH_STR}-01`, product_key: '00000000-0000-0000-0000-000000000004', name: 'Trà Chanh Giã Tay', qty: 5, revenue: 100000 },
]

const SEED_PRODUCT_ALLTIME = [
  { product_key: '00000000-0000-0000-0000-000000000001', name: 'Trà Sữa Ô Long', qty: 120, revenue: 3000000 },
  { product_key: '00000000-0000-0000-0000-000000000002', name: 'Trà Đào Cam Sả', qty: 95, revenue: 2375000 },
  { product_key: '00000000-0000-0000-0000-000000000003', name: 'Hồng Trà Sữa', qty: 80, revenue: 2000000 },
  { product_key: '00000000-0000-0000-0000-000000000004', name: 'Trà Vải', qty: 60, revenue: 1500000 },
  { product_key: '00000000-0000-0000-0000-000000000005', name: 'Trà Việt Quất', qty: 40, revenue: 1000000 },
  { product_key: '00000000-0000-0000-0000-000000000006', name: 'Cà Phê Muối', qty: 15, revenue: 375000 },
  { product_key: '00000000-0000-0000-0000-000000000007', name: 'Bạc Xỉu', qty: 10, revenue: 250000 },
  { product_key: '00000000-0000-0000-0000-000000000008', name: 'Matcha Latte', qty: 5, revenue: 150000 },
  { product_key: '00000000-0000-0000-0000-000000000009', name: 'Nước Suối', qty: 2, revenue: 20000 },
  { product_key: '00000000-0000-0000-0000-000000000010', name: 'Trà Atiso Đỏ', qty: 1, revenue: 25000 },
]

async function setupDashboardMocks(page: Page, options: { failDaily?: boolean } = {}): Promise<void> {
  await page.route('**/rest/v1/stats_daily*', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route)
    if (options.failDaily) {
      return route.fulfill(json({ message: 'Network error' }, 500))
    }
    await route.fulfill(json(SEED_STATS_DAILY))
  })

  await page.route('**/rest/v1/stats_product_monthly*', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route)
    await route.fulfill(json(SEED_PRODUCT_MONTHLY))
  })

  await page.route('**/rest/v1/stats_product_alltime*', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route)
    await route.fulfill(json(SEED_PRODUCT_ALLTIME))
  })
}

test.describe('P8 — Dashboard & Báo cáo', () => {
  for (const vp of VIEWPORTS) {
    test(`hiển thị đầy đủ 3 KPI, Chart A, Chart B và bảng xếp hạng trên ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      const consoleErrors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      await injectAuth(page, { role: 'admin' })
      await setupDashboardMocks(page)

      await page.goto('/dashboard')

      // 1. Kiểm tra 3 thẻ KPI
      await expect(page.getByTestId('kpi-today-revenue')).toBeVisible()
      await expect(page.getByTestId('kpi-today-bills')).toBeVisible()
      await expect(page.getByTestId('kpi-month-revenue')).toBeVisible()

      // Số liệu khớp mock
      await expect(page.getByTestId('kpi-today-bills')).toContainText('3')

      // 2. Kiểm tra container biểu đồ
      await expect(page.getByTestId('chart-a-container')).toBeVisible()
      await expect(page.getByTestId('chart-b-container')).toBeVisible()

      // 3. Kiểm tra top bán chạy / ít bán all-time
      await expect(page.getByTestId('top-best-sellers')).toBeVisible()
      await expect(page.getByTestId('top-least-sellers')).toBeVisible()
      await expect(page.getByText('Trà Sữa Ô Long').first()).toBeVisible()

      // 4. Axe A11y (không có vi phạm critical/serious)
      const a11y = await new AxeBuilder({ page })
        .exclude('.apexcharts-canvas') // Apexcharts sinh SVG bên ngoài tầm kiểm soát trực tiếp
        .analyze()
      const serious = a11y.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(serious).toEqual([])

      // 5. Chụp ảnh bằng chứng
      await page.screenshot({
        path: `e2e/screenshots/p8-dashboard-${vp.name}.png`,
        fullPage: true,
      })

      const fatalErrors = consoleErrors.filter(
        (e) => !e.includes('favicon') && !e.includes('WebSocket') && !e.includes('preflight'),
      )
      expect(fatalErrors).toEqual([])
    })
  }

  test('xử lý lỗi tải dữ liệu và nút Thử lại hoạt động', async ({ page }) => {
    await injectAuth(page, { role: 'admin' })
    let fail = true

    await page.route('**/rest/v1/stats_daily*', async (route) => {
      if (route.request().method() === 'OPTIONS') return preflight(route)
      if (fail) {
        return route.fulfill(json({ message: 'Internal Server Error' }, 500))
      }
      return route.fulfill(json(SEED_STATS_DAILY))
    })
    await page.route('**/rest/v1/stats_product_monthly*', async (route) => {
      if (route.request().method() === 'OPTIONS') return preflight(route)
      return route.fulfill(json(SEED_PRODUCT_MONTHLY))
    })
    await page.route('**/rest/v1/stats_product_alltime*', async (route) => {
      if (route.request().method() === 'OPTIONS') return preflight(route)
      return route.fulfill(json(SEED_PRODUCT_ALLTIME))
    })

    await page.goto('/dashboard')

    // Thấy thông báo lỗi
    await expect(page.getByText(/Không tải được thống kê ngày/i)).toBeVisible()
    const retryBtn = page.getByRole('button', { name: /Thử lại/i })
    await expect(retryBtn).toBeVisible()

    // Bấm thử lại sau khi mạng phục hồi
    fail = false
    await retryBtn.click()

    // Dashboard load thành công
    await expect(page.getByTestId('kpi-today-revenue')).toBeVisible()
    await expect(page.getByTestId('kpi-today-bills')).toBeVisible()
  })

  test('đổi tháng trên bộ lọc tự động tải lại số liệu của tháng được chọn', async ({ page }) => {
    await injectAuth(page, { role: 'admin' })
    await setupDashboardMocks(page)

    let requestedMonth = ''
    await page.route('**/rest/v1/stats_product_monthly*', async (route) => {
      if (route.request().method() === 'OPTIONS') return preflight(route)
      const url = route.request().url()
      const match = url.match(/month=eq\.([0-9]{4}-[0-9]{2})/)
      if (match) requestedMonth = match[1]
      return route.fulfill(json(SEED_PRODUCT_MONTHLY))
    })

    await page.goto('/dashboard')
    await expect(page.getByTestId('month-picker-input')).toBeVisible()

    // Đổi tháng sang 2026-09
    await page.getByTestId('month-picker-input').fill('2026-09')
    await page.getByTestId('month-picker-input').dispatchEvent('change')

    await expect.poll(() => requestedMonth).toBe('2026-09')
  })

  test('nút làm mới dữ liệu cập nhật lại số liệu KPI khi có đơn mới', async ({ page }) => {
    await injectAuth(page, { role: 'admin' })
    let currentBills = 3
    let currentRevenue = 85000

    await page.route('**/rest/v1/stats_daily*', async (route) => {
      if (route.request().method() === 'OPTIONS') return preflight(route)
      return route.fulfill(
        json([
          { date: '2026-10-01', revenue: 150000, bill_count: 5 },
          { date: '2026-10-02', revenue: 200000, bill_count: 8 },
          { date: '2026-10-03', revenue: 120000, bill_count: 4 },
          { date: '2026-10-04', revenue: currentRevenue, bill_count: currentBills },
        ]),
      )
    })
    await page.route('**/rest/v1/stats_product_monthly*', async (route) => {
      if (route.request().method() === 'OPTIONS') return preflight(route)
      return route.fulfill(json(SEED_PRODUCT_MONTHLY))
    })
    await page.route('**/rest/v1/stats_product_alltime*', async (route) => {
      if (route.request().method() === 'OPTIONS') return preflight(route)
      return route.fulfill(json(SEED_PRODUCT_ALLTIME))
    })

    await page.goto('/dashboard')
    await expect(page.getByTestId('kpi-today-bills')).toContainText('3')

    // Giả lập bán thêm 1 bill 50.000đ
    currentBills = 4
    currentRevenue = 135000

    // Bấm nút làm mới
    await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click()

    // KPI cập nhật lên 4 đơn
    await expect(page.getByTestId('kpi-today-bills')).toContainText('4')
    await expect(page.getByTestId('kpi-today-revenue')).toContainText('135.000')
  })
})
