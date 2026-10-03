import { expect, test, type Page } from '@playwright/test'
import { injectAuth } from './helpers'

// P4-T9 — PWA/offline: đồng bộ menu khi mở app, banner offline, hardRefresh
// (P4-T3/T4/T7/T8). Case "offline → bán → online → đồng bộ" viết ở P6-T9 khi POS có.

// Chuẩn viewport theo testing/skill.md §3: 390×844 (mobile) và 1280×800 (desktop)
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
]

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
  'access-control-expose-headers': 'content-range',
}

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', headers: CORS_HEADERS, body: JSON.stringify(body) }
}

/** Mô phỏng menu server: app_meta menu_version=7, 1 nhóm, 1 SP đang bán. */
async function mockMenuRest(page: Page): Promise<void> {
  await page.route('**/rest/v1/app_meta*', (route) => route.fulfill(json([{ id: 1, menu_version: 7 }])))
  await page.route('**/rest/v1/categories*', (route) =>
    route.fulfill(
      json([{ id: 'c1', name: 'Trà sữa', icon: '', sort_order: 1, is_active: true }]),
    ),
  )
  await page.route('**/rest/v1/products*', (route) => {
    const all = [
      { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: 35000, icon: '', is_active: true },
      { id: 'p2', category_id: 'c1', name: 'Ngừng bán', price: 1000, icon: '', is_active: false },
    ]
    // PostgREST lọc theo is_active=eq.true — mock phải lọc giống server
    const rows = route.request().url().includes('is_active=eq.true')
      ? all.filter((row) => row.is_active)
      : all
    return route.fulfill(json(rows))
  })
  await page.route('**/rest/v1/toppings*', (route) =>
    route.fulfill(json([{ id: 't1', name: 'Trân châu', price: 5000, icon: '', is_active: true }])),
  )
}

type StoresSnapshot = {
  menuVersion: number | null
  productCount: number | null
  outboxCount: number
}

// Dùng chính module Dexie của app (Vite dev serve /src/lib/db.ts) — không bịa
// schema IndexedDB bằng tay (Dexie tự tạo store + index đúng phiên bản của nó).
async function readStores(page: Page): Promise<StoresSnapshot> {
  return page.evaluate(async () => {
    const { HemTraDB } = await import('/src/lib/db.ts')
    const db = new HemTraDB()
    try {
      const menu = await db.menuCache.get('menu')
      const outbox = await db.outbox.toArray()
      return {
        menuVersion: menu ? menu.menu_version : null,
        productCount: menu ? menu.products.length : null,
        outboxCount: outbox.length,
      }
    } finally {
      db.close()
    }
  })
}

async function seedOutbox(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { HemTraDB } = await import('/src/lib/db.ts')
    const db = new HemTraDB()
    try {
      await db.menuCache.put({
        id: 'menu',
        menu_version: 7,
        fetched_at: Date.now(),
        categories: [{ id: 'c1', name: 'Trà sữa', icon: '', sort_order: 1, is_active: true }],
        products: [
          { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: 35000, icon: '', is_active: true },
        ],
        toppings: [],
      })
      await db.outbox.put({
        client_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        payload: {
          items: [{ product_id: 'p1', qty: 1 }],
          phone_note: '',
          is_offline: true,
          offline_code: 'HT-261002-OFF-qq11',
          created_at: null,
          menu_version: 7,
        },
        png: null,
        code: null,
        status: 'pending',
        attempts: 0,
        last_error: null,
        price_drift: false,
        created_at: Date.now(),
        synced_at: null,
      })
    } finally {
      db.close()
    }
  })
}

test('P4-T3: mở app sau đăng nhập → đồng bộ menu ghi vào IndexedDB', async ({ page }) => {
  await injectAuth(page)
  await mockMenuRest(page)
  await page.goto('/dashboard')

  await expect
    .poll(async () => readStores(page), { timeout: 15_000, intervals: [300] })
    .toMatchObject({
      menuVersion: 7,
      productCount: 1, // SP ngừng bán không vào menu POS
    })
})

test('P4-T4: offline → banner cảnh báo; có mạng lại → hết banner', async ({ context, page }, testInfo) => {
  await injectAuth(page)
  await mockMenuRest(page)
  await page.goto('/dashboard')
  await expect.poll(async () => (await readStores(page)).menuVersion).toBe(7)

  await context.setOffline(true)
  await expect(page.getByText(/Đang offline — giá cập nhật lúc/)).toBeVisible()
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expect(page.getByText(/Đang offline — giá cập nhật lúc/)).toBeVisible()
    await page.screenshot({
      path: `e2e/screenshots/pwa-offline-${testInfo.project.name}-${viewport.name}.png`,
    })
  }

  await context.setOffline(false)
  await expect(page.getByText(/Đang offline — giá cập nhật lúc/)).toBeHidden({ timeout: 10_000 })
})

test('P4-T6: version.json lệch → thanh "Có phiên bản mới" chờ xác nhận, không tự reload', async ({
  page,
}, testInfo) => {
  await injectAuth(page)
  await mockMenuRest(page)
  await page.route('**/version.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ version: 'ban-tren-may-chu-khac', builtAt: '2026-10-03T00:00:00.000Z' }),
    }),
  )

  await page.goto('/dashboard')
  const bar = page.getByRole('alert')
  await expect(bar).toContainText('Có phiên bản mới — Cập nhật?', { timeout: 10_000 })

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expect(bar).toBeVisible()
    await page.screenshot({
      path: `e2e/screenshots/pwa-update-bar-${testInfo.project.name}-${viewport.name}.png`,
    })
  }

  // Không tự reload: vẫn ở trang cũ, thanh vẫn chờ người dùng quyết định
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(bar).toBeVisible()

  await bar.getByRole('button', { name: 'Để sau' }).click()
  await expect(bar).toHaveCount(0)
  await expect(page).toHaveURL(/\/dashboard/)
})

test('P4-T7/T8: hardRefresh hỏi khi còn bill chưa sync, xóa menu cache nhưng GIỮ outbox + username', async ({
  page,
}) => {
  await page.goto('/login')
  await seedOutbox(page)
  await page.evaluate(() => window.localStorage.setItem('hemtra.username', 'linh'))

  let asked: string | null = null
  let accept = false
  page.on('dialog', async (dialog) => {
    asked = dialog.message()
    if (accept) await dialog.accept()
    else await dialog.dismiss()
  })

  // Từ chối xác nhận → không xóa gì cả
  await page.getByRole('button', { name: /xóa cache/i }).click()
  await expect.poll(() => asked).toMatch(/bill chưa đồng bộ/)
  expect(await readStores(page)).toMatchObject({ menuVersion: 7, outboxCount: 1 })

  // Đồng ý → xóa menu cache, GIỮ outbox, GIỮ username, tải lại có ?r=
  accept = true
  asked = null
  await page.getByRole('button', { name: /xóa cache/i }).click()
  await page.waitForURL(/\?r=\d+/, { timeout: 10_000 })
  expect(await readStores(page)).toMatchObject({ menuVersion: null, outboxCount: 1 })
  expect(await page.evaluate(() => window.localStorage.getItem('hemtra.username'))).toBe('linh')
})
