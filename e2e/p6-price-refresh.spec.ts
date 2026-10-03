// P4-T9 (hoãn tới khi POS có menu — plan.md): đổi giá ở tab khác → tab cũ
// thấy giá mới. Cơ chế: mỗi tab sync menu khi quay lại (visibilitychange →
// syncMenu so menu_version → fetch → ghi IndexedDB → lưới POS cập nhật).

import { expect, test, type Page } from '@playwright/test'
import { injectAuth } from './helpers'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
  'access-control-expose-headers': 'content-range',
}

function json(body: unknown) {
  return { status: 200 as const, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) }
}

type MenuState = { menuVersion: number; price: number }

async function mockMenu(page: Page, state: MenuState): Promise<void> {
  // mock SAU injectAuth — route mới hơn thắng route rỗng của helpers
  await page.route('**/rest/v1/app_meta*', (route) =>
    route.fulfill(json([{ id: 1, menu_version: state.menuVersion, bootstrapped: false }])),
  )
  await page.route('**/rest/v1/categories*', (route) =>
    route.fulfill(
      json([{ id: 'c1', name: 'Trà sữa', icon: '🧋', sort_order: 1, is_active: true }]),
    ),
  )
  await page.route('**/rest/v1/products*', (route) =>
    route.fulfill(
      json([
        { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: state.price, icon: '', is_active: true },
      ]),
    ),
  )
  await page.route('**/rest/v1/toppings*', (route) => route.fulfill(json([])))
  await page.route('**/rest/v1/product_toppings*', (route) => route.fulfill(json([])))
}

/** Kích hoạt lại lượt sync on-visibility của startMenuSync (đầu đủ điều kiện). */
async function triggerMenuSync(page: Page): Promise<void> {
  await page.bringToFront()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
}

test('P4-T9: đổi giá ở tab khác → tab cũ thấy giá mới khi quay lại', async ({ context }) => {
  const state: MenuState = { menuVersion: 7, price: 35000 }

  const pageA = await context.newPage()
  await injectAuth(pageA)
  await mockMenu(pageA, state)
  await pageA.goto('/pos')
  await expect(pageA.getByRole('button', { name: 'Thêm Trà sữa đào' })).toBeVisible()
  await expect(pageA.getByText(/35\.000\s₫/)).toBeVisible()

  const pageB = await context.newPage()
  await injectAuth(pageB)
  await mockMenu(pageB, state)
  await pageB.goto('/pos')
  await expect(pageB.getByText(/35\.000\s₫/)).toBeVisible()

  // "Tab khác" (B): menu bump lên v8, giá mới 40.000 — B thấy ngay khi sync
  state.menuVersion = 8
  state.price = 40000
  await triggerMenuSync(pageB)
  await expect(pageB.getByText(/40\.000\s₫/)).toBeVisible({ timeout: 10_000 })

  // Tab cũ (A) quay lại → sync so version 7 → 8 → fetch → thấy giá mới
  await triggerMenuSync(pageA)
  await expect(pageA.getByText(/40\.000\s₫/)).toBeVisible({ timeout: 10_000 })
  await expect(pageA.getByText(/35\.000\s₫/)).toHaveCount(0)
})
