// P12-T11 — e2e nâng cấp 2026-10-04 (user yêu cầu ngoài plan):
//  1. P12-T1  : /products 390×844 — modal "Thêm sản phẩm" không tràn ngang (mở & sau khi lưu).
//  2. P12-T5  : Dashboard Chart A dạng CỘT, không toolbar zoom/pan/reset.
//  3. P12-T10 : Xóa bill — admin nhập mật khẩu → EF `delete-bills` (mock tầng EF);
//               sai mật khẩu báo lỗi; staff không thấy nút.
//  4. P12-T3  : bump menu_version → topping gắn cho SP hiện ngay ở modal Topping POS.
//  5. P12-T9  : modal hồ sơ — đổi tên hiển thị phải có OTP 6 số rồi mới lưu.
//  6. P12-T9  : header — avatar/mờ hồ sơ, nút đồng bộ, chấm online → offline.
// Mock tầng dữ liệu/EF (page.route), code app chạy thật — cùng cách e2e/p3..p9.

import { expect, test, type Page, type Route } from '@playwright/test'
import { injectAuth } from './helpers'

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

/** GET trả list tĩnh; POST → 201 rỗng; PATCH/DELETE → 204 (PostgREST không return=representation). */
async function mockRestTable(
  page: Page,
  pattern: string,
  rows: () => unknown[],
): Promise<void> {
  await page.route(pattern, async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') return preflight(route)
    if (method === 'GET') return route.fulfill(json(rows()))
    if (method === 'POST')
      return route.fulfill({ status: 201, contentType: 'application/json', headers: CORS_HEADERS, body: '' })
    return route.fulfill({ status: 204, contentType: 'application/json', headers: CORS_HEADERS, body: '' })
  })
}

async function expectNoPageOverflow(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    inner: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
  }))
  expect(
    Math.max(overflow.scroll, overflow.bodyScroll),
    `scrollWidth=${overflow.scroll}/${overflow.bodyScroll} > innerWidth=${overflow.inner} ${where}`,
  ).toBeLessThanOrEqual(overflow.inner)
}

// ───────────────────────────── 1. tràn ngang mobile ─────────────────────────────
test('P12-T1: /products 390×844 — modal Thêm sản phẩm không tràn ngang (mở & sau khi lưu)', async ({
  page,
}) => {
  await injectAuth(page)
  const categories = [{ id: 'c1', name: 'Trà sữa', icon: '🧋', sort_order: 1, is_active: true }]
  const products: unknown[] = []
  await mockRestTable(page, '**/rest/v1/categories*', () => categories)
  await mockRestTable(page, '**/rest/v1/products*', () => products)
  await mockRestTable(page, '**/rest/v1/toppings*', () => [])
  await mockRestTable(page, '**/rest/v1/product_toppings*', () => [])

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/products')
  await expect(page.getByRole('button', { name: 'Thêm sản phẩm' })).toBeVisible()
  await expectNoPageOverflow(page, 'trước khi mở modal')

  // Mở modal thêm sản phẩm — form 2 cột (Nhóm/Đơn giá) hay bảng dài đều không được
  // đẩy document sang ngang (bug image.png — mobile menu Sản phẩm).
  await page.getByRole('button', { name: 'Thêm sản phẩm' }).click()
  const dialog = page.getByRole('dialog', { name: 'Thêm sản phẩm' })
  await expect(dialog).toBeVisible()
  await expectNoPageOverflow(page, 'khi modal "Thêm sản phẩm" đang mở')

  // Lưu sản phẩm mới — sau khi list cập nhật cục bộ (P12-T4) vẫn không tràn.
  await page.getByLabel('Tên sản phẩm').fill('Trà test 390')
  await page.getByLabel('Đơn giá (₫)').fill('25000')
  await dialog.getByRole('button', { name: 'Lưu' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('cell', { name: 'Trà test 390', exact: true })).toBeVisible()
  await expectNoPageOverflow(page, 'sau khi lưu sản phẩm')
})

// ───────────────────────────── 2. chart A cột ─────────────────────────────
test('P12-T5: Dashboard — Chart A là cột theo ngày, có legend, không toolbar zoom/pan/reset', async ({
  page,
}) => {
  await injectAuth(page)

  const statsDaily = [
    { date: '2026-10-01', revenue: 150000, bill_count: 5 },
    { date: '2026-10-02', revenue: 200000, bill_count: 8 },
    { date: '2026-10-04', revenue: 95000, bill_count: 3 },
  ]
  await page.route('**/rest/v1/stats_daily*', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route)
    return route.fulfill(json(statsDaily))
  })
  await page.route('**/rest/v1/stats_product_monthly*', (route) => route.fulfill(json([])))
  await page.route('**/rest/v1/stats_product_alltime*', (route) => route.fulfill(json([])))

  await page.goto('/dashboard')
  const chart = page.getByTestId('chart-a-container')
  await expect(chart).toBeVisible()

  // ApexCharts render xong (không còn fallback "Đang tải biểu đồ")
  await expect(chart.locator('svg.apexcharts-svg')).toBeVisible({ timeout: 15_000 })
  await expect(chart.locator('.apexcharts-bar-area')).toHaveCount(31)

  // Legend series "Doanh thu" (label đầy đủ theo P12-T5)
  await expect(chart.getByText('Doanh thu')).toBeVisible()

  // BỎ toolbar zoom/pan/selection/reset (P12-T5) — quét cả accessible/tooltip cũ
  for (const cls of [
    '.apexcharts-toolbar',
    '.apexcharts-zoomin',
    '.apexcharts-zoomout',
    '.apexcharts-pan',
    '.apexcharts-reset-icon',
    '.apexcharts-selection-icon',
    '.apexcharts-brush',
  ]) {
    await expect(chart.locator(cls), `${cls} phải bị bỏ`).toHaveCount(0)
  }
  // Không còn nút toolbar dạng text cũ
  await expect(chart.getByRole('button', { name: /zoom|pan|reset/i })).toHaveCount(0)
})

// ───────────────────────────── 3. xóa bill bằng mật khẩu ─────────────────────────────
test('P12-T10: admin xóa bill — sai mật khẩu báo lỗi, đúng mật khẩu bill biến mất', async ({
  page,
}) => {
  await injectAuth(page, { role: 'admin' })

  let bills = [
    {
      id: 'bill-del-1',
      code: 'HT-261004-0001',
      total: 35000,
      created_at: '2026-10-04T07:05:00.000Z',
      expires_at: '2026-10-19T07:05:00.000Z',
      image_path: '2026/10/HT-261004-0001.png',
      profiles: { username: 'hemtra' },
    },
  ]
  const deleteCalls: { bill_id?: string; password?: string }[] = []

  await page.route('**/rest/v1/bills*', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return preflight(route)
    const total = bills.length
    const contentRange = total === 0 ? `*/${total}` : `0-${total - 1}/${total}`
    return route.fulfill(json(bills, 200, { 'content-range': contentRange }))
  })
  await page.route('**/rest/v1/bill_items*', (route) => route.fulfill(json([])))

  // EF `delete-bills` — mật khẩu phải là 'matkhau-admin' (mock tầng EF, code app thật)
  await page.route('**/functions/v1/delete-bills', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route)
    const body = route.request().postDataJSON() as { bill_id?: string; password?: string }
    deleteCalls.push(body)
    if (body.password !== 'matkhau-admin') {
      return route.fulfill(json({ error: 'Mật khẩu admin không đúng.' }, 401))
    }
    bills = bills.filter((bill) => bill.id !== body.bill_id)
    return route.fulfill(json({ ok: true, code: 'HT-261004-0001' }))
  })

  await page.goto('/bills')
  const region = page.getByRole('region', { name: 'Danh sách bill' })
  await region.getByRole('row', { name: /HT-261004-0001/ }).waitFor()

  // Mở modal xóa — nút "Xóa vĩnh viễn" khóa khi chưa nhập mật khẩu
  await page.getByTestId('delete-bill-HT-261004-0001').click()
  const dialog = page.getByRole('dialog', { name: 'Xóa bill HT-261004-0001' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('confirm-delete-bill')).toBeDisabled()
  await expect(dialog.getByText(/trừ doanh thu\/thống kê/i)).toBeVisible()

  // Sai mật khẩu → EF 401 → alert trong modal, bill vẫn còn
  await page.getByTestId('delete-bill-password').fill('sai-mat-khau')
  await dialog.getByTestId('confirm-delete-bill').click()
  await expect(dialog.getByRole('alert')).toHaveText('Mật khẩu admin không đúng.')
  await expect(dialog).toBeVisible()
  expect(bills).toHaveLength(1)

  // Đúng mật khẩu → EF ok → đóng modal, nạp lại danh sách, hiện notice
  await page.getByTestId('delete-bill-password').fill('matkhau-admin')
  await dialog.getByTestId('confirm-delete-bill').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Đã xóa bill HT-261004-0001 (ảnh + thống kê đã cập nhật).')).toBeVisible()
  await expect(page.getByText('Chưa có bill nào.')).toBeVisible()
  expect(bills).toHaveLength(0)
  expect(deleteCalls).toHaveLength(2)
  expect(deleteCalls[0].bill_id).toBe('bill-del-1')
  expect(deleteCalls[1].bill_id).toBe('bill-del-1')
})

test('P12-T10: staff không thấy nút Xóa bill', async ({ page }) => {
  await injectAuth(page, { role: 'staff' })
  const bills = [
    {
      id: 'bill-staff-1',
      code: 'HT-261004-0002',
      total: 35000,
      created_at: '2026-10-04T07:05:00.000Z',
      expires_at: '2026-10-19T07:05:00.000Z',
      image_path: '2026/10/HT-261004-0002.png',
      profiles: { username: 'hemtra' },
    },
  ]
  await page.route('**/rest/v1/bills*', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route)
    return route.fulfill(
      json(bills, 200, { 'content-range': `0-0/${bills.length}` }),
    )
  })
  await page.route('**/rest/v1/bill_items*', (route) => route.fulfill(json([])))

  await page.goto('/bills')
  await expect(page.getByRole('region', { name: 'Danh sách bill' }).getByText('HT-261004-0002')).toBeVisible()
  await expect(page.getByTestId('delete-bill-HT-261004-0002')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /x[oó]a/i })).toHaveCount(0)
})

// ───────────────────────────── 4. đồng bộ topping sang POS ─────────────────────────────
test('P12-T3: bump menu_version → topping mới gắn cho SP hiện ngay ở modal Topping POS', async ({
  context,
}) => {
  const state = {
    menuVersion: 7,
    toppings: [] as { id: string; name: string; price: number; icon: string; is_active: boolean }[],
  }
  const page = await context.newPage()
  await injectAuth(page)

  // mock SAU injectAuth — route mới thắng route rỗng của helpers (đọc state động)
  await page.route('**/rest/v1/app_meta*', (route) =>
    route.fulfill(
      json([{ id: 1, menu_version: state.menuVersion, bootstrapped: false }]),
    ),
  )
  await page.route('**/rest/v1/categories*', (route) =>
    route.fulfill(json([{ id: 'c1', name: 'Trà sữa', icon: '🧋', sort_order: 1, is_active: true }])),
  )
  await page.route('**/rest/v1/products*', (route) =>
    route.fulfill(
      json([
        { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: 35000, icon: '', is_active: true },
      ]),
    ),
  )
  await page.route('**/rest/v1/toppings*', (route) =>
    route.fulfill(json(state.toppings)),
  )
  await page.route('**/rest/v1/product_toppings*', (route) => route.fulfill(json([])))

  await page.goto('/pos')
  await page.getByRole('button', { name: 'Thêm Trà sữa đào' }).click()
  await page.getByRole('button', { name: 'Chọn topping cho Trà sữa đào' }).click()
  const modal = page.getByRole('dialog', { name: 'Topping cho Trà sữa đào' })
  await expect(modal).toBeVisible()
  await expect(modal.getByText('Món này chưa có topping.')).toBeVisible()

  // Admin ở tab khác tạo topping mới → bump menu_version (trigger P12-T3 / P13-T12)
  state.menuVersion = 8
  state.toppings = [{ id: 't1', name: 'Trân châu', price: 5000, icon: '', is_active: true }]
  await page.bringToFront()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

  // Modal đang mở phải thấy topping ngay sau khi sync (kh cần reload)
  await expect(modal.getByRole('button', { name: 'Topping Trân châu' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(modal.getByText('Chưa có topping')).toHaveCount(0)
})

// ───────────────────────────── 5. modal hồ sơ + OTP ─────────────────────────────
test('P12-T9: modal hồ sơ — đổi tên hiển thị phải xác nhận OTP 6 số', async ({ page }) => {
  await injectAuth(page, { role: 'admin' })
  const efCalls: { action?: string; token?: string; display_name?: string }[] = []
  await page.route('**/functions/v1/profile-update', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route)
    const body = route.request().postDataJSON() as { action?: string; token?: string; display_name?: string }
    efCalls.push(body)
    if (body.action === 'request-otp') {
      return route.fulfill(json({ ok: true, message: 'Đã gửi mã OTP.' }))
    }
    if (body.token !== '123456') {
      return route.fulfill(json({ error: 'Mã OTP không đúng hoặc đã hết hạn.' }, 401))
    }
    return route.fulfill(
      json({
        ok: true,
        message: 'Đã cập nhật hồ sơ.',
        profile: {
          username: 'e2e',
          display_name: body.display_name ?? 'E2E',
          avatar_path: '',
        },
      }),
    )
  })

  await page.goto('/dashboard')
  await page.getByTestId('profile-btn').click()
  const modal = page.getByTestId('profile-modal')
  await expect(modal).toBeVisible()
  await expect(modal.getByText('@e2e')).toBeVisible()

  // Chưa đổi gì → nút Xác nhận khóa
  await expect(modal.getByTestId('profile-submit-btn')).toBeDisabled()

  await modal.getByTestId('profile-display-name').fill('Hẻm Trà E2E')
  await expect(modal.getByTestId('profile-submit-btn')).toBeEnabled()

  // Chưa có OTP 6 số → báo lỗi, KHÔNG gọi apply
  await modal.getByTestId('profile-submit-btn').click()
  await expect(modal.getByTestId('profile-error')).toHaveText(
    'Nhập mã OTP 6 số gửi về email admin.',
  )
  expect(efCalls.filter((call) => call.action === 'apply')).toHaveLength(0)

  // Gửi OTP → status xác nhận
  await modal.getByTestId('send-otp-btn').click()
  await expect(modal.getByText('Mã OTP đã gửi tới email admin — mã dùng 1 lần')).toBeVisible()

  // Nhập sai OTP → EF 401 báo lỗi
  await modal.getByTestId('profile-otp').fill('999999')
  await modal.getByTestId('profile-submit-btn').click()
  await expect(modal.getByTestId('profile-error')).toHaveText('Mã OTP không đúng hoặc đã hết hạn.')

  // Đúng OTP → lưu thành công, header lấy tên mới
  await modal.getByTestId('profile-otp').fill('123456')
  await modal.getByTestId('profile-submit-btn').click()
  await expect(modal.getByTestId('profile-ok')).toHaveText('Đã cập nhật hồ sơ.')
  const applies = efCalls.filter((call) => call.action === 'apply')
  expect(applies).toHaveLength(2)
  expect(applies[1].token).toBe('123456')
  expect(applies[1].display_name).toBe('Hẻm Trà E2E')
  await expect(page.getByTestId('app-header')).toContainText('Hẻm Trà E2E')
})

// ───────────────────────────── 6. header: hồ sơ / đồng bộ / online ─────────────────────────────
test('P12-T9: header có avatar mở hồ sơ, nút đồng bộ, chấm online → offline', async ({ page }) => {
  await injectAuth(page, { role: 'admin' })
  await page.goto('/dashboard')

  const header = page.getByTestId('app-header')
  await expect(header).toBeVisible()
  await expect(page.getByTestId('profile-btn')).toBeVisible()
  await expect(page.getByTestId('sync-btn')).toBeVisible()
  await expect(page.getByTestId('online-dot')).toHaveAttribute('aria-label', 'Đang online')

  // Header không còn 2 link "Đổi mật khẩu"/"Đổi email khôi phục" (P12-T9)
  await expect(header.getByRole('link', { name: 'Đổi mật khẩu' })).toHaveCount(0)
  await expect(header.getByRole('link', { name: 'Đổi email khôi phục' })).toHaveCount(0)

  // Bấm avatar → modal hồ sơ
  await page.getByTestId('profile-btn').click()
  await expect(page.getByTestId('profile-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('profile-modal')).toHaveCount(0)

  // Mất mạng → chấm online đổi nhãn (P12-T9)
  await page.context().setOffline(true)
  await expect(page.getByTestId('online-dot')).toHaveAttribute('aria-label', 'Đang offline', {
    timeout: 10_000,
  })
  await page.context().setOffline(false)
  await expect(page.getByTestId('online-dot')).toHaveAttribute('aria-label', 'Đang online', {
    timeout: 10_000,
  })
})
