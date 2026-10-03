// P6-T9 — e2e bán hàng: bán 1 đơn online → RPC + upload PNG → Lưu về máy
// tải được PNG đúng mã (magic bytes + bề rộng 1440 = 720×2); và case P4-T9
// hoãn sang đây: offline → bán → online → outbox sync (create_bill is_offline).

import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { injectAuth } from './helpers'

const MENU = {
  categories: [{ id: 'c1', name: 'Trà sữa', icon: '🧋', sort_order: 1, is_active: true }],
  products: [
    { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: 35000, icon: '', is_active: true },
  ],
  toppings: [{ id: 't1', name: 'Trân châu', price: 5000, icon: '', is_active: true }],
  links: [{ product_id: 'p1', topping_id: 't1' }],
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
]

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
  'access-control-expose-headers': 'content-range',
}

function json(body: unknown): { status: 200; contentType: string; headers: typeof CORS; body: string } {
  return { status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) }
}

async function mockMenu(page: Page): Promise<void> {
  await page.route('**/rest/v1/categories*', (route) => route.fulfill(json(MENU.categories)))
  await page.route('**/rest/v1/products*', (route) => route.fulfill(json(MENU.products)))
  await page.route('**/rest/v1/toppings*', (route) => route.fulfill(json(MENU.toppings)))
  await page.route('**/rest/v1/product_toppings*', (route) => route.fulfill(json(MENU.links)))
}

type RpcBody = Record<string, unknown> & { p_is_offline?: boolean; p_offline_code?: string | null }

async function mockCheckout(page: Page): Promise<{ rpcCalls: RpcBody[]; uploads: string[] }> {
  const rpcCalls: RpcBody[] = []
  const uploads: string[] = []
  await page.route('**/rest/v1/rpc/create_bill', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as RpcBody
    rpcCalls.push(body)
    await route.fulfill(
      json({
        id: 'bill-e2e-1',
        code: body.p_is_offline === true ? body.p_offline_code : 'HT-261003-0001',
        total: 35000,
        price_drift: false,
        duplicate: false,
        menu_version: 7,
      }),
    )
  })
  await page.route('**/storage/v1/object/**', async (route) => {
    uploads.push(new URL(route.request().url()).pathname)
    await route.fulfill(json({}))
  })
  return { rpcCalls, uploads }
}

test('P6-T9: bán 1 đơn online → RPC đúng hợp đồng → Lưu về máy tải PNG 1440px đúng mã', async ({
  page,
}, testInfo) => {
  await injectAuth(page)
  await mockMenu(page)
  const { rpcCalls, uploads } = await mockCheckout(page)

  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/pos')
  await page.getByRole('button', { name: 'Thêm Trà sữa đào' }).click()
  await page.getByTestId('checkout-btn').click()

  await expect(page.getByTestId('checkout-msg')).toHaveText('Đã tạo bill HT-261003-0001.')
  await expect(page.getByTestId('last-sale')).toContainText('HT-261003-0001')

  // RPC đúng 7 tham số nghiệp vụ
  expect(rpcCalls).toHaveLength(1)
  expect(rpcCalls[0]).toMatchObject({
    p_menu_version: 7,
    p_is_offline: false,
    p_offline_code: null,
    p_items: [{ product_id: 'p1', qty: 1, name: 'Trà sữa đào', unit_price: 35000 }],
  })

  // Ảnh upload đúng đường dẫn policy Storage (giờ VN)
  expect(uploads).toHaveLength(1)
  expect(uploads[0]).toMatch(/\/storage\/v1\/object\/bills\/\d{4}\/\d{2}\/HT-261003-0001\.png$/)

  // PNG tải về: đúng tên mã + magic bytes + bề rộng 720×2 (pixelRatio 2)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('save-btn').click(),
  ])
  expect(download.suggestedFilename()).toBe('HT-261003-0001.png')
  const filePath = await download.path()
  expect(filePath).toBeTruthy()
  const buf = await readFile(filePath as string)
  expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(buf.readUInt32BE(16)).toBe(1440)

  // Ảnh 2 viewport (uiux skill §4) + không lỗi trang
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expect(page.getByTestId('checkout-msg')).toBeVisible()
    await page.screenshot({
      path: `e2e/screenshots/p6-checkout-${testInfo.project.name}-${viewport.name}.png`,
    })
  }
  expect(pageErrors).toEqual([])
})

test('QC-013: giá menu đổi khi giỏ đang mở → chặn thanh toán online, không gọi RPC', async ({
  context,
}) => {
  const state = { menuVersion: 7, price: 35000 }
  const page = await context.newPage()
  await injectAuth(page)
  // mock SAU injectAuth, đọc state động (như tab admin vừa sửa giá)
  await page.route('**/rest/v1/app_meta*', (route) =>
    route.fulfill(
      json([{ id: 1, menu_version: state.menuVersion, bootstrapped: false }]),
    ),
  )
  await page.route('**/rest/v1/categories*', (route) =>
    route.fulfill(json(MENU.categories)),
  )
  await page.route('**/rest/v1/products*', (route) =>
    route.fulfill(
      json([
        { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: state.price, icon: '', is_active: true },
      ]),
    ),
  )
  await page.route('**/rest/v1/toppings*', (route) => route.fulfill(json(MENU.toppings)))
  await page.route('**/rest/v1/product_toppings*', (route) => route.fulfill(json(MENU.links)))
  const { rpcCalls } = await mockCheckout(page)

  await page.goto('/pos')
  await page.getByRole('button', { name: 'Thêm Trà sữa đào' }).click()
  await expect(page.getByText(/35\.000\s₫/).first()).toBeVisible()

  // menu bump v8 + giá mới → lưới cập nhật, giỏ vẫn snapshot 35.000
  state.menuVersion = 8
  state.price = 40000
  await page.bringToFront()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText(/40\.000\s₫/).first()).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('checkout-btn').click()
  await expect(page.getByTestId('checkout-msg')).toHaveText(
    'Giá vừa cập nhật: Trà sữa đào — kiểm tra lại giỏ rồi thanh toán.',
  )
  expect(rpcCalls).toHaveLength(0) // KHÔNG gọi RPC với giỏ giá cũ
  await expect(page.getByTestId('bill-count')).toHaveText('1 món') // giữ giỏ
})

test('P6-T9/P4-T9: offline → bán (mã OFF vào outbox) → online → sync create_bill + upload', async ({
  page,
}) => {
  await injectAuth(page)
  await mockMenu(page)
  const { rpcCalls, uploads } = await mockCheckout(page)

  await page.goto('/pos')
  await page.getByRole('button', { name: 'Thêm Trà sữa đào' }).click()

  // Mất mạng → banner + vẫn bán được từ cache
  await page.context().setOffline(true)
  await expect(page.getByTestId('offline-banner')).toContainText('Đang offline')

  await page.getByTestId('checkout-btn').click()
  await expect(page.getByTestId('checkout-msg')).toHaveText(
    /Offline — bill HT-\d{6}-OFF-[A-Za-z0-9]{4} đã lưu/,
  )
  expect(rpcCalls).toHaveLength(0) // offline không gọi RPC

  // Có mạng lại → useOutboxSync bắn sync: create_bill(idempotent) rồi upload PNG
  const synced = page.waitForResponse((res) => res.url().includes('/rest/v1/rpc/create_bill'))
  await page.context().setOffline(false)
  await synced

  expect(rpcCalls).toHaveLength(1)
  expect(rpcCalls[0].p_is_offline).toBe(true)
  expect(String(rpcCalls[0].p_offline_code)).toMatch(/^HT-\d{6}-OFF-[A-Za-z0-9]{4}$/)
  expect(rpcCalls[0].p_items).toMatchObject([{ product_id: 'p1', unit_price: 35000 }])

  await expect.poll(() => uploads.length).toBe(1)
  expect(uploads[0]).toMatch(
    /\/storage\/v1\/object\/bills\/\d{4}\/\d{2}\/HT-\d{6}-OFF-[A-Za-z0-9]{4}\.png$/,
  )
  await expect(page.getByTestId('last-sale')).toContainText(/HT-\d{6}-OFF-[A-Za-z0-9]{4}/)
})
