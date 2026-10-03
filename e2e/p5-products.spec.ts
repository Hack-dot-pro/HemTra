import { expect, test, type Page, type Route } from '@playwright/test'
import { injectAuth } from './helpers'

// P5-T6 — e2e trang Sản phẩm: thêm nhóm → thêm sản phẩm → hiện đúng bảng,
// validate zod tiếng Việt (T5), tìm kiếm (T4), ẩn/xóa có xác nhận (T4), và
// "thấy ngay sau đồng bộ": menu_version đổi (trigger P1) → lần sync kế tiếp
// ghi SP vào menuCache — đúng dữ liệu màn Thanh toán (P6) đọc. Case bán hàng
// offline → đồng bộ ghi ở P6-T9 (xem header e2e/p4-pwa.spec.ts).

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
]

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
  'access-control-expose-headers': 'content-range',
}

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', headers: CORS_HEADERS, body: JSON.stringify(body) }
}

type Row = { id?: string } & Record<string, unknown>

type Store = {
  menuVersion: number
  categories: Row[]
  products: Row[]
  toppings: Row[]
  links: { product_id: string; topping_id: string }[]
}

let seq = 0
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}-e2e-${seq}`
}

/** Trả lời OPTIONS preflight (POST/PATCH/DELETE cross-origin tới Supabase). */
async function preflight(route: Route): Promise<void> {
  const requested =
    route.request().headers()['access-control-request-headers'] ?? 'authorization, apikey, content-type'
  await route.fulfill({
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': requested,
      'access-control-max-age': '86400',
    },
    body: '',
  })
}

/**
 * REST có trạng thái — mock tầng dữ liệu, code app chạy thật.
 * PHẢI đăng ký SAU injectAuth để ghi đè route rỗng của helpers
 * (Playwright ưu tiên route đăng ký sau).
 */
async function mockMenuApi(page: Page, store: Store): Promise<void> {
  await page.route('**/rest/v1/app_meta*', (route) =>
    route.fulfill(json([{ id: 1, menu_version: store.menuVersion }])),
  )

  const rest =
    (key: 'categories' | 'products' | 'toppings') => async (route: Route) => {
      const req = route.request()
      const method = req.method()
      if (method === 'OPTIONS') return preflight(route)
      const url = req.url()

      if (method === 'GET') {
        // PostgREST lọc is_active=eq.true (menuSync chỉ tải mục đang bán)
        const rows = url.includes('is_active=eq.true')
          ? store[key].filter((row) => row.is_active === true)
          : store[key]
        return route.fulfill(json(rows))
      }
      if (method === 'POST') {
        const body = req.postDataJSON() as Row | Row[] | null
        const incoming = Array.isArray(body) ? body : body ? [body] : []
        const saved = incoming.map((row) => ({ ...row, id: row.id ?? nextId(key[0]) }))
        store[key].push(...saved)
        return route.fulfill(json(saved, 201))
      }
      if (method === 'PATCH') {
        const patch = (req.postDataJSON() ?? {}) as Record<string, unknown>
        const id = new URL(url).searchParams.get('id')?.replace(/^eq\./, '') ?? ''
        let updated: Row | undefined
        store[key] = store[key].map((row) => {
          if (row.id !== id) return row
          updated = { ...row, ...patch }
          return updated
        })
        return route.fulfill(json(updated ? [updated] : []))
      }
      if (method === 'DELETE') {
        const id = new URL(url).searchParams.get('id')?.replace(/^eq\./, '') ?? ''
        store[key] = store[key].filter((row) => row.id !== id)
        return route.fulfill(json([]))
      }
      return route.fulfill(json([]))
    }

  await page.route('**/rest/v1/categories*', rest('categories'))
  await page.route('**/rest/v1/products*', rest('products'))
  await page.route('**/rest/v1/toppings*', rest('toppings'))

  await page.route('**/rest/v1/product_toppings*', async (route) => {
    const req = route.request()
    const method = req.method()
    if (method === 'OPTIONS') return preflight(route)
    const url = req.url()
    if (method === 'GET') return route.fulfill(json(store.links))
    if (method === 'POST') {
      const body = req.postDataJSON() as { product_id: string; topping_id: string } | Array<{ product_id: string; topping_id: string }> | null
      const incoming = Array.isArray(body) ? body : body ? [body] : []
      store.links.push(...incoming)
      return route.fulfill(json(incoming, 201))
    }
    if (method === 'DELETE') {
      const productId = new URL(url).searchParams.get('product_id')?.replace(/^eq\./, '') ?? ''
      store.links = store.links.filter((link) => link.product_id !== productId)
      return route.fulfill(json([]))
    }
    return route.fulfill(json([]))
  })
}

/** Đọc menuCache bằng chính module Dexie của app (giống p4-pwa.spec). */
async function readMenuCache(
  page: Page,
): Promise<{ menuVersion: number | null; products: string[]; categories: string[] }> {
  return page.evaluate(async () => {
    const { HemTraDB } = await import('/src/lib/db.ts')
    const db = new HemTraDB()
    try {
      const menu = await db.menuCache.get('menu')
      return {
        menuVersion: menu ? menu.menu_version : null,
        products: menu ? menu.products.map((p: { name: string }) => p.name) : [],
        categories: menu ? menu.categories.map((c: { name: string }) => c.name) : [],
      }
    } finally {
      db.close()
    }
  })
}

/** Giả lập trigger P1 (server tăng menu_version) rồi kích hoạt lại sync. */
async function bumpMenuVersion(page: Page, store: Store, version: number): Promise<void> {
  store.menuVersion = version
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
}

test('P5-T1/T2/T4/T5: thêm nhóm → thêm SP → validate zod → đồng bộ menuCache → ẩn có xác nhận', async ({
  page,
}, testInfo) => {
  const store: Store = { menuVersion: 7, categories: [], products: [], toppings: [], links: [] }
  await injectAuth(page)
  await mockMenuApi(page, store)

  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/products')
  const panel = page.locator('#panel-products')
  await expect(panel).toContainText('Chưa có nhóm nào — hãy thêm nhóm trước ở tab Nhóm.')

  // T1 — thêm nhóm
  await page.getByRole('tab', { name: 'Nhóm' }).click()
  await page.getByRole('button', { name: 'Thêm nhóm' }).click()
  const categoryDialog = page.getByRole('dialog', { name: 'Thêm nhóm' })
  await categoryDialog.getByLabel('Tên nhóm').fill('Trà sữa')
  await categoryDialog.getByLabel('Emoji (tùy chọn)').fill('🧋')
  await categoryDialog.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByRole('status')).toHaveText('Đã lưu nhóm.')
  await expect(page.locator('#panel-categories')).toContainText('Trà sữa')

  // T5 — validate zod tiếng Việt khi thiếu tên + giá
  await page.getByRole('tab', { name: 'Sản phẩm' }).click()
  await panel.getByRole('button', { name: 'Thêm sản phẩm' }).click()
  const productDialog = page.getByRole('dialog', { name: 'Thêm sản phẩm' })
  await productDialog.getByRole('button', { name: 'Lưu' }).click()
  await expect(productDialog.getByText('Vui lòng nhập tên.')).toBeVisible()
  await expect(productDialog.getByText('Vui lòng nhập đơn giá.')).toBeVisible()

  // T2 — thêm sản phẩm hợp lệ: hiện đúng tên/nhóm/giá VND
  await productDialog.getByLabel('Tên sản phẩm').fill('Trà đào')
  await productDialog.getByLabel('Đơn giá (₫)').fill('35000')
  await productDialog.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByRole('status')).toHaveText('Đã lưu sản phẩm.')
  const row = panel.getByRole('row', { name: /Trà đào/ })
  await expect(row).toContainText('Trà đào')
  await expect(row).toContainText('Trà sữa')
  await expect(row).toContainText('35.000 ₫')

  // Q10 — ảnh 2 cỡ chuẩn (testing/skill.md §3)
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expect(row).toBeVisible()
    await page.screenshot({
      path: `e2e/screenshots/p5-products-${testInfo.project.name}-${viewport.name}.png`,
    })
  }

  // T6 — "thấy ngay sau đồng bộ": menu_version đổi → sync ghi SP vào menuCache
  await bumpMenuVersion(page, store, 8)
  await expect
    .poll(async () => (await readMenuCache(page)).menuVersion, { timeout: 15_000, intervals: [300] })
    .toBe(8)
  const synced = await readMenuCache(page)
  expect(synced.products).toContain('Trà đào')
  expect(synced.categories).toContain('Trà sữa')

  // T4 — ẩn có xác nhận → khỏi menuCache của Thanh toán ở lần sync kế tiếp.
  // ToggleButton: mobile dùng span sr-only (label), desktop dùng span nhìn thấy
  // được ("Đang bán"/"Đã ẩn") — khớp cả 2 để test chạy ở mọi viewport.
  await panel.getByRole('button', { name: /^(Ẩn Trà đào|Đang bán)$/ }).click()
  const confirmDialog = page.getByRole('dialog', { name: 'Ẩn khỏi menu bán?' })
  await expect(confirmDialog).toContainText('không hiển thị ở Thanh toán')
  await confirmDialog.getByRole('button', { name: 'Ẩn', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Đã ẩn khỏi menu bán.')
  await expect(panel).toContainText('Đã ẩn')
  await expect(panel.getByRole('button', { name: /^(Bật bán Trà đào|Đã ẩn)$/ })).toBeVisible()

  await bumpMenuVersion(page, store, 9)
  await expect
    .poll(async () => (await readMenuCache(page)).menuVersion, { timeout: 15_000, intervals: [300] })
    .toBe(9)
  expect((await readMenuCache(page)).products).not.toContain('Trà đào')

  expect(pageErrors).toEqual([])
})

test('P5-T3/T4/T5: CRUD topping, tìm kiếm, trùng tên bị chặn, xóa SP có xác nhận + ghi link topping', async ({
  page,
}) => {
  const store: Store = {
    menuVersion: 7,
    categories: [{ id: 'c1', name: 'Trà sữa', icon: '🧋', sort_order: 1, is_active: true }],
    products: [
      { id: 'p1', category_id: 'c1', name: 'Trà đào', price: 35000, icon: '', is_active: true },
      { id: 'p2', category_id: 'c1', name: 'Trà đào thủ công', price: 28000, icon: '', is_active: true },
    ],
    toppings: [],
    links: [],
  }
  await injectAuth(page)
  await mockMenuApi(page, store)

  await page.goto('/products')
  const panel = page.locator('#panel-products')
  await expect(panel.getByRole('row', { name: /Trà đào/ })).toHaveCount(2)

  // T3 — thêm topping
  await page.getByRole('tab', { name: 'Topping' }).click()
  await page.getByRole('button', { name: 'Thêm topping' }).click()
  const toppingDialog = page.getByRole('dialog', { name: 'Thêm topping' })
  await toppingDialog.getByLabel('Tên topping').fill('Trân châu')
  await toppingDialog.getByLabel('Đơn giá (₫)').fill('5000')
  await toppingDialog.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByRole('status')).toHaveText('Đã lưu topping.')
  await expect(page.locator('#panel-toppings')).toContainText('+5.000 ₫')

  // T4 — tìm kiếm: thu hẹp → không khớp → xóa query là đủ 2 dòng
  await page.getByRole('tab', { name: 'Sản phẩm' }).click()
  const search = panel.getByLabel('Tìm kiếm')
  await search.fill('thủ công')
  await expect(panel.getByRole('row', { name: /Trà đào/ })).toHaveCount(1)
  await search.fill('không tồn tại')
  await expect(panel).toContainText('Không tìm thấy sản phẩm khớp.')
  await search.fill('')
  await expect(panel.getByRole('row', { name: /Trà đào/ })).toHaveCount(2)

  // T5 — trùng tên trong cùng nhóm (khác hoa/thường) bị chặn, modal không đóng
  await panel.getByRole('button', { name: 'Thêm sản phẩm' }).click()
  const productDialog = page.getByRole('dialog', { name: 'Thêm sản phẩm' })
  await productDialog.getByLabel('Tên sản phẩm').fill('trà đào')
  await productDialog.getByLabel('Đơn giá (₫)').fill('30000')
  await productDialog.getByRole('button', { name: 'Lưu' }).click()
  await expect(productDialog.getByText('Tên sản phẩm đã tồn tại trong nhóm này.')).toBeVisible()
  await productDialog.getByRole('button', { name: 'Hủy' }).click()

  // T2/T3 — sửa SP: gắn topping → ghi lại danh sách link (xóa bộ cũ, chèn mới)
  await panel.getByRole('button', { name: 'Sửa Trà đào', exact: true }).click()
  const editDialog = page.getByRole('dialog', { name: 'Sửa sản phẩm' })
  await editDialog.getByRole('checkbox', { name: /Trân châu/ }).check()
  await editDialog.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByRole('status')).toHaveText('Đã lưu sản phẩm.')
  expect(store.links).toHaveLength(1)
  expect(store.links[0].product_id).toBe('p1')
  expect(store.links[0].topping_id).toBe(store.toppings[0].id)

  // T4 — xóa vĩnh viễn luôn qua xác nhận
  await panel.getByRole('button', { name: 'Xóa Trà đào', exact: true }).click()
  const deleteDialog = page.getByRole('dialog', { name: 'Xóa vĩnh viễn?' })
  await expect(deleteDialog).toContainText('không hoàn tác')
  await deleteDialog.getByRole('button', { name: 'Xóa', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Đã xóa.')
  await expect(panel.getByRole('row', { name: /Trà đào/ })).toHaveCount(1)
  await expect(panel).toContainText('Trà đào thủ công')
})
