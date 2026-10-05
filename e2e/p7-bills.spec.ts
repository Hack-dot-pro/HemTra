import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import { injectAuth } from './helpers'

// P7-T1 — e2e trang Quản lý bill: bảng bill đọc dữ liệu REST thật (mock tầng
// dữ liệu, code app chạy), tìm theo mã, phân trang, không có nút xóa (design
// §4.1), tag "tự xóa sau N ngày" (P7-T4), không lỗi console + ảnh 2 cỡ (Q10)
// + axe (Q11).

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

type SeedBill = {
  id: string
  code: string
  total: number
  created_at: string
  /** created_at + 15 ngày — đúng default `bills.expires_at` (P7-T4). */
  expires_at: string
  username: string | null
  /** '' = bill chưa có ảnh (chưa xuất / chưa sync) — không có nút xem (P7-T2). */
  imagePath: string
  items: { qty: number; parent_item_id: string | null }[]
}

function seedBills(count: number): SeedBill[] {
  return Array.from({ length: count }, (_, index) => {
    const day = String((index % 3) + 1).padStart(2, '0')
    const expiresDay = String((index % 3) + 16).padStart(2, '0')
    return {
      id: `bill-${index + 1}`,
      code: `HT-2610${day}-${String(index + 1).padStart(4, '0')}`,
      total: 35000 + index * 5000,
      created_at: `2026-10-${day}T07:05:00.000Z`,
      expires_at: `2026-10-${expiresDay}T07:05:00.000Z`,
      username: index % 2 === 0 ? 't7staff' : null,
      imagePath: index % 5 === 4 ? '' : `2026/10/HT-2610${day}-${String(index + 1).padStart(4, '0')}.png`,
      items:
        index === 0
          ? [
              { qty: 2, parent_item_id: null },
              { qty: 1, parent_item_id: null },
              { qty: 1, parent_item_id: 'item-1' },
            ]
          : [{ qty: 1, parent_item_id: null }],
    }
  })
}

/** Mock /rest/v1/bills (count qua content-range) + /rest/v1/bill_items. */
async function mockBillsApi(page: Page, bills: SeedBill[]): Promise<string[]> {
  const urls: string[] = []

  await page.route('**/rest/v1/bills*', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return preflight(route)
    const url = new URL(request.url())
    urls.push(request.url())

    let rows = [...bills]
    const codeFilter = url.searchParams.get('code')
    if (codeFilter?.startsWith('ilike.')) {
      const value = codeFilter
        .slice('ilike.'.length)
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/%/g, '.*')
      const matcher = new RegExp(`^${value}$`, 'i')
      rows = rows.filter((row) => matcher.test(row.code))
    }
    for (const bound of url.searchParams.getAll('created_at')) {
      if (bound.startsWith('gte.')) rows = rows.filter((row) => row.created_at >= bound.slice(4))
      if (bound.startsWith('lte.')) rows = rows.filter((row) => row.created_at <= bound.slice(4))
    }

    const offset = Number(url.searchParams.get('offset') ?? '0')
    const limit = Number(url.searchParams.get('limit') ?? '20')
    const slice = rows.slice(offset, offset + limit)
    const total = rows.length
    const contentRange =
      slice.length === 0 ? `*/${total}` : `${offset}-${offset + slice.length - 1}/${total}`

    return route.fulfill(
      json(
        slice.map((row) => ({
          id: row.id,
          code: row.code,
          total: row.total,
          created_at: row.created_at,
          expires_at: row.expires_at,
          image_path: row.imagePath,
          profiles: row.username ? { username: row.username } : null,
        })),
        200,
        { 'content-range': contentRange },
      ),
    )
  })

  // Ảnh bill: POST sign trả signedURL, GET trả PNG 1×1 (mock tầng Storage).
  await page.route('**/storage/v1/object/sign/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return preflight(route)
    if (request.method() === 'POST') {
      return route.fulfill(
        json({ signedURL: '/object/sign/bills/2026/10/HT.png?token=e2e-signed' }),
      )
    }
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: CORS_HEADERS,
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
  })

  await page.route('**/rest/v1/bill_items*', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return preflight(route)
    const items = bills.flatMap((bill) =>
      bill.items.map((item, index) => ({
        id: `${bill.id}-item-${index}`,
        bill_id: bill.id,
        qty: item.qty,
        parent_item_id: item.parent_item_id,
      })),
    )
    return route.fulfill(json(items))
  })

  return urls
}

test('P7-T1/P12-T10: bảng bill — dữ liệu, tìm theo mã, phân trang, admin có nút xóa', async ({ page }, testInfo) => {
  await injectAuth(page)
  const urls = await mockBillsApi(page, seedBills(21))
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  // Lỗi console của app (bỏ 4xx có chủ đích do token e2e fake) — cùng cách
  // làm của e2e/p3-auth.spec.ts:collectAppErrors.
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.includes('Failed to load resource')) return
    consoleErrors.push(text)
  })

  await page.goto('/bills')

  const table = page.getByRole('region', { name: 'Danh sách bill' })
  const firstRow = table.getByRole('row', { name: /HT-261001-0001/ })
  await expect(firstRow).toBeVisible()
  await expect(firstRow).toContainText('35.000 ₫')
  await expect(firstRow).toContainText('3') // 2 + 1 ly, không tính topping
  await expect(firstRow).toContainText('14:05') // giờ VN, không phải 07:05 UTC

  // P7-T4 / P13-T8 — tag "tự xóa sau N ngày": policy 7 ngày ở đầu trang + đếm ngược theo expires_at ở dòng
  await expect(page.getByTestId('retention-policy-tag')).toHaveText('Tự xóa sau 7 ngày')
  await expect(table.getByRole('columnheader', { name: 'Tự dọn' })).toBeVisible()
  await expect(firstRow).toContainText(/Tự xóa (hôm nay|sau \d+ ngày)/)
  await expect(page.getByText('Trang 1/2 · 21 bill · 20 dòng/trang')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trước' })).toBeDisabled()

  // Tìm theo mã — chuỗi wildcard PostgREST, không phải SQL injection
  await page.getByPlaceholder('HT-261003-0001').fill('HT-261001-0001')
  await page.getByRole('button', { name: 'Tìm' }).click()
  await expect(table.getByRole('row')).toHaveCount(2) // 1 dòng dữ liệu + hàng tiêu đề
  await expect(page.getByText('Trang 1/1 · 1 bill · 20 dòng/trang')).toBeVisible()
  expect(urls.some((url) => url.includes('code=ilike') && url.includes('HT-261001-0001'))).toBe(true)

  // P12-T10 — bỏ ô "Từ ngày"/"Đến ngày" + nút "Đặt lại"; chỉ còn tìm theo mã
  await expect(page.getByLabel('Từ ngày')).toHaveCount(0)
  await expect(page.getByLabel('Đến ngày')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Đặt lại' })).toHaveCount(0)

  // Phân trang — bỏ lọc (xóa ô tìm) rồi sang trang 2 lấy offset=20
  await page.getByPlaceholder('HT-261003-0001').fill('')
  await page.getByRole('button', { name: 'Tìm' }).click()
  await expect(page.getByText('Trang 1/2 · 21 bill · 20 dòng/trang')).toBeVisible()
  await page.getByRole('button', { name: 'Sau' }).click()
  await expect(page.getByText('Trang 2/2 · 21 bill · 20 dòng/trang')).toBeVisible()
  expect(urls.some((url) => url.includes('offset=20'))).toBe(true)

  // P12-T10 — admin (injectAuth mặc định) có nút Xóa ở từng dòng; không có
  // date filter. Staff không thấy nút (case staff ở test riêng dưới).
  await expect(page.getByTestId('delete-bill-HT-261003-0021')).toBeVisible()
  const buttonLabels = await page.getByRole('button').allInnerTexts()
  expect(buttonLabels.some((label) => /x[oó]a/i.test(label))).toBe(true)

  // Q10 — không lỗi console + ảnh 2 cỡ + không tràn ngang cấp trang
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expect(table).toBeVisible()
    const overflow = await page.evaluate(() => ({
      inner: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
    }))
    expect(
      overflow.scroll,
      `document.scrollWidth=${overflow.scroll} > innerWidth=${overflow.inner} ở ${viewport.name}`,
    ).toBeLessThanOrEqual(overflow.inner)
    await page.screenshot({
      path: `e2e/screenshots/p7-bills-${testInfo.project.name}-${viewport.name}.png`,
    })
  }
})

test('Q11: axe trên /bills — không vi phạm serious/critical', async ({ page }) => {
  await injectAuth(page)
  await mockBillsApi(page, seedBills(3))
  await page.goto('/bills')
  await expect(page.getByRole('region', { name: 'Danh sách bill' })).toBeVisible()

  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`)
  expect(serious).toEqual([])
})


test('P7-T2: modal ảnh bill — signed URL ngắn hạn, ảnh hiện, Esc đóng, không lỗi a11y', async ({
  page,
}, testInfo) => {
  await injectAuth(page)
  await mockBillsApi(page, seedBills(3))
  const signRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/object/sign/')) signRequests.push(request.method() + ' ' + request.url())
  })

  await page.goto('/bills')
  await page.getByRole('region', { name: 'Danh sách bill' }).getByText('HT-261001-0001').waitFor()

  await page.getByRole('button', { name: 'Xem bill HT-261001-0001' }).click()

  const dialog = page.getByRole('dialog', { name: 'Bill HT-261001-0001' })
  await expect(dialog).toBeVisible()
  const image = dialog.getByRole('img', { name: 'Ảnh bill HT-261001-0001' })
  await expect(image).toBeVisible()
  expect(signRequests.some((entry) => entry.startsWith('POST '))).toBe(true)
  expect(
    signRequests.some((entry) => entry.startsWith('GET ') && entry.includes('token=e2e-signed')),
  ).toBe(true) // <img> đọc đúng signed URL có token

  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`)
  expect(serious).toEqual([])

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: `e2e/screenshots/p7-bill-modal-${testInfo.project.name}-390x844.png`,
  })

  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})

test('P13-T11: bill chưa có ảnh trong storage → vẫn có nút Xem Bill để xem và tải lại theo fallback (admin vẫn Xóa)', async ({
  page,
}) => {
  await injectAuth(page)
  const bills = seedBills(5)
  await mockBillsApi(page, bills)
  await page.goto('/bills')

  // index 4 → imagePath rỗng (seed % 5 === 4) — mã theo ngày sinh của seed (ngày 02)
  const row = page
    .getByRole('region', { name: 'Danh sách bill' })
    .getByRole('row', { name: /HT-261002-0005/ })
  await row.waitFor()
  // P13-T11: fallback cho phép vào Quản lý bill để xem và tải lại kể cả khi chưa có ảnh storage
  await expect(row.getByRole('button', { name: /xem bill/i })).toHaveCount(1)
  // P12-T10 — admin thấy nút Xóa kể cả khi bill chưa có ảnh
  await expect(row.getByRole('button', { name: /xóa/i })).toHaveCount(1)
})
