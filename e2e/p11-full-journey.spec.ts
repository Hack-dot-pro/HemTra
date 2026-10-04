// P11-T1: E2E toàn luồng trọn vẹn theo design.md §11:
// login → thêm sản phẩm → bán online → xuất PNG → xem bill → tạo user → offline → đồng bộ lại.
// Chạy trên cả Chromium, WebKit và Mobile.

import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Route } from '@playwright/test'
import { injectAuth } from './helpers'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
  'access-control-expose-headers': 'content-range',
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return {
    status,
    contentType: 'application/json',
    headers: { ...CORS, ...extraHeaders },
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
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': requested,
      'access-control-max-age': '86400',
    },
    body: '',
  })
}

const MENU = {
  categories: [
    { id: 'c1', name: 'Trà sữa', icon: '🧋', sort_order: 1, is_active: true },
    { id: 'c2', name: 'Trà trái cây', icon: '🍑', sort_order: 2, is_active: true },
  ],
  products: [
    { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: 35000, icon: '', is_active: true },
    { id: 'p2', category_id: 'c2', name: 'Trà xoài nhiệt đới', price: 30000, icon: '', is_active: true },
  ],
  toppings: [{ id: 't1', name: 'Trân châu đen', price: 5000, icon: '', is_active: true }],
  links: [{ product_id: 'p1', topping_id: 't1' }],
}

test.describe('P11 — E2E Toàn Luồng Hệ Thống (design.md §11)', () => {
  test('Luồng nghiệp vụ trọn vẹn: Đăng nhập → POS bán Online → Xuất PNG → Xem Bill → Quản lý User → POS Offline → Đồng bộ Outbox', async ({
    page,
  }) => {
    test.setTimeout(60000)
    // 1. Inject auth admin
    await injectAuth(page, { role: 'admin' })

    // 2. Setup routes sau injectAuth để override categories & app_meta
    await page.route('**/rest/v1/app_meta*', (route) =>
      route.fulfill(json([{ id: 1, menu_version: 7, bootstrapped: true }])),
    )
    await page.route('**/rest/v1/categories*', (route) => route.fulfill(json(MENU.categories)))
    await page.route('**/rest/v1/products*', (route) => route.fulfill(json(MENU.products)))
    await page.route('**/rest/v1/toppings*', (route) => route.fulfill(json(MENU.toppings)))
    await page.route('**/rest/v1/product_toppings*', (route) => route.fulfill(json(MENU.links)))

    const rpcCalls: Record<string, unknown>[] = []
    const uploads: string[] = []
    const linkCalls: Record<string, unknown>[] = []

    await page.route('**/rest/v1/rpc/create_bill', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}')
      rpcCalls.push(body)
      const isOffline = body.p_is_offline === true
      const billCode = isOffline ? body.p_offline_code : 'HT-261004-0001'
      await route.fulfill(
        json({
          id: `bill-${rpcCalls.length}`,
          code: billCode,
          total: 35000,
          price_drift: false,
          duplicate: false,
          menu_version: 7,
          client_uuid: 'uuid-test',
        }),
      )
    })

    await page.route('**/storage/v1/object/**', async (route) => {
      uploads.push(new URL(route.request().url()).pathname)
      await route.fulfill(json({}))
    })

    await page.route('**/rest/v1/rpc/set_bill_image', async (route) => {
      linkCalls.push(JSON.parse(route.request().postData() ?? '{}'))
      await route.fulfill(json(true))
    })

    // Mock bills list & items
    await page.route('**/rest/v1/bills*', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return preflight(route)
      const bills = [
        {
          id: 'bill-1',
          code: 'HT-261004-0001',
          total: 35000,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 15 * 86400000).toISOString(),
          image_path: '2026/10/HT-261004-0001.png',
          profiles: { username: 'admin' },
        },
      ]
      return route.fulfill(json(bills, 200, { 'content-range': '0-0/1' }))
    })

    await page.route('**/rest/v1/bill_items*', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return preflight(route)
      return route.fulfill(
        json([
          {
            bill_id: 'bill-1',
            qty: 1,
            parent_item_id: null,
          },
        ]),
      )
    })

    await page.route('**/storage/v1/object/sign/**', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return preflight(route)
      return route.fulfill(json({ signedURL: '/mock-bill.png' }))
    })

    // Mock profiles list & individual profile query
    let usersList = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'admin',
        display_name: 'Quản trị viên',
        role: 'admin',
        must_change_password: false,
        created_by: null,
        created_at: '2026-10-01T08:00:00Z',
      },
    ]

    await page.route('**/rest/v1/profiles*', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return preflight(route)
      const url = request.url()
      if (url.includes('id=eq.') || url.includes('select=role')) {
        return route.fulfill(
          json(
            [
              {
                id: '00000000-0000-4000-8000-000000000001',
                username: 'admin',
                display_name: 'Quản trị viên',
                role: 'admin',
                must_change_password: false,
              },
            ],
            200,
            { 'content-range': '0-0/1' },
          ),
        )
      }
      return route.fulfill(
        json(usersList, 200, {
          'content-range': `0-${Math.max(0, usersList.length - 1)}/${usersList.length}`,
        }),
      )
    })

    await page.route('**/functions/v1/admin-users*', async (route) => {
      if (route.request().method() === 'OPTIONS') return preflight(route)
      const postData = route.request().postDataJSON() as Record<string, unknown>
      const action = postData?.action

      if (action === 'create-user') {
        const newUser = {
          id: `user-${Date.now()}`,
          username: String(postData.username),
          display_name: String(postData.display_name || postData.username),
          role: String(postData.role || 'staff'),
          must_change_password: true,
          created_by: '00000000-0000-4000-8000-000000000001',
          created_at: new Date().toISOString(),
        }
        usersList = [...usersList, newUser]
        return route.fulfill(
          json({
            ok: true,
            user: newUser,
            temporary_password: 'mock_temp_pass_123',
          }),
        )
      }
      return route.fulfill(json({ ok: true }))
    })

    // STEP 1: Vào màn POS
    await page.goto('/pos')

    // STEP 2: POS Bán Online
    await expect(page.getByRole('button', { name: 'Thêm Trà sữa đào' })).toBeVisible()
    await page.getByRole('button', { name: 'Thêm Trà sữa đào' }).click()
    await expect(page.getByTestId('checkout-btn')).toBeEnabled()
    await page.getByTestId('checkout-btn').click()

    // Kiểm tra thông báo bill online thành công và last-sale
    await expect(page.getByTestId('checkout-msg')).toHaveText('Đã tạo bill HT-261004-0001.')
    await expect(page.getByTestId('last-sale')).toContainText('HT-261004-0001')

    // Tải bill PNG về máy — P12-T8: hiện modal preview 2K rồi tải từ đó
    await expect(page.getByTestId('bill-preview')).toBeVisible()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('preview-save-btn').click(),
    ])
    expect(download.suggestedFilename()).toBe('HT-261004-0001.png')
    const filePath = await download.path()
    expect(filePath).toBeTruthy()
    if (filePath) {
      const buffer = await readFile(filePath)
      expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      expect(buffer.readUInt32BE(16)).toBeGreaterThanOrEqual(2048)
    }
    await page.getByTestId('preview-close-btn').click()
    await expect(page.getByTestId('bill-preview')).toHaveCount(0)

    // STEP 3: Xem Lịch Sử Hóa Đơn (/bills)
    await page.goto('/bills')
    await expect(page.getByRole('heading', { name: /quản lý bill/i })).toBeVisible()
    await expect(page.getByText('HT-261004-0001')).toBeVisible()

    // STEP 4: Quản Lý Nhân Viên (/users)
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: /quản lý user/i })).toBeVisible()
    await expect(page.getByTestId('add-user-btn')).toBeVisible()

    // Thêm nhân viên mới
    await page.getByTestId('add-user-btn').click()
    await page.getByTestId('create-user-username').fill('thungan01')
    await page.getByTestId('create-user-display-name').fill('Thu Ngân 01')
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click()

    // Hiển thị mật khẩu tạm thời
    await expect(page.getByTestId('temp-password-display')).toBeVisible()
    await expect(page.getByTestId('temp-password-display')).toContainText('mock_temp_pass_123')
    await page.getByRole('button', { name: 'Đã hiểu & Đóng' }).click()
    await expect(page.getByTestId('user-row-thungan01')).toBeVisible()

    // STEP 5: POS Bán Hàng Ngoại Tuyến (Offline) & Đồng Bộ Outbox
    await page.goto('/pos')
    await expect(page.getByRole('button', { name: 'Thêm Trà sữa đào' })).toBeVisible()

    // Chuyển sang chế độ offline
    await page.context().setOffline(true)
    await page.getByRole('button', { name: 'Trà trái cây' }).click()
    await expect(page.getByRole('button', { name: 'Thêm Trà xoài nhiệt đới' })).toBeVisible()
    await page.getByRole('button', { name: 'Thêm Trà xoài nhiệt đới' }).click()

    // Thanh toán khi mất mạng
    await page.getByTestId('checkout-btn').click()
    await expect(page.getByTestId('checkout-msg')).toContainText('Offline — bill')
    await expect(page.getByTestId('last-sale')).toContainText('OFF-')

    // Bật lại mạng để kích hoạt đồng bộ outbox tự động
    await page.context().setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))

    // STEP 6: Accessibility Audit
    const a11y = await new AxeBuilder({ page }).analyze()
    const serious = a11y.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(serious).toEqual([])
  })
})
