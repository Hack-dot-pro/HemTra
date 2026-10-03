import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { injectAuth } from './helpers'

// P6-T2/T3 — e2e màn Thanh toán: lưới SP theo nhóm + panel bill realtime.
// Mock tầng dữ liệu (REST) — code app chạy thật; menu đi vào IndexedDB qua
// useMenuSync như production (design §8.2).

const MENU = {
  categories: [
    { id: 'c1', name: 'Trà sữa', icon: '🧋', sort_order: 1, is_active: true },
    { id: 'c2', name: 'Trà trái cây', icon: '🍑', sort_order: 2, is_active: true },
  ],
  products: [
    { id: 'p1', category_id: 'c1', name: 'Trà sữa đào', price: 35000, icon: '', is_active: true },
    { id: 'p2', category_id: 'c1', name: 'Matcha sữa', price: 32000, icon: '', is_active: true },
    { id: 'p3', category_id: 'c2', name: 'Trà đào', price: 30000, icon: '', is_active: true },
  ],
  toppings: [{ id: 't1', name: 'Trân châu', price: 5000, icon: '', is_active: true }],
  links: [{ product_id: 'p1', topping_id: 't1' }],
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
]

async function mockMenu(page: Page): Promise<void> {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
  }
  const json = (body: unknown): { status: 200; contentType: string; headers: typeof cors; body: string } => ({
    status: 200,
    contentType: 'application/json',
    headers: cors,
    body: JSON.stringify(body),
  })
  // đăng ký SAU injectAuth → route mới hơn thắng route trả [] của helpers
  await page.route('**/rest/v1/categories*', (route) => route.fulfill(json(MENU.categories)))
  await page.route('**/rest/v1/products*', (route) => route.fulfill(json(MENU.products)))
  await page.route('**/rest/v1/toppings*', (route) => route.fulfill(json(MENU.toppings)))
  await page.route('**/rest/v1/product_toppings*', (route) => route.fulfill(json(MENU.links)))
}

type OverflowReport = { innerWidth: number; scrollWidth: number; offenders: string[] }

async function measureOverflow(page: Page): Promise<OverflowReport> {
  return page.evaluate(() => {
    window.scrollTo(0, 0)
    const doc = document.documentElement
    const offenders = Array.from(document.querySelectorAll('body *'))
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return false
        if (rect.right <= window.innerWidth + 1) return false
        for (let node = el.parentElement; node; node = node.parentElement) {
          const style = getComputedStyle(node)
          if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'hidden') return false
        }
        return true
      })
      .slice(0, 6)
      .map((el) => {
        const rect = el.getBoundingClientRect()
        const cls = typeof el.className === 'string' ? el.className.slice(0, 70) : ''
        return `${el.tagName.toLowerCase()}[${cls}] right=${Math.round(rect.right)}`
      })
    return {
      innerWidth: window.innerWidth,
      scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth),
      offenders,
    }
  })
}

test('P6-T2/T3: lưới theo nhóm → thêm bill → topping → tổng cập nhật (ảnh 2 viewport)', async ({
  page,
}, testInfo) => {
  await injectAuth(page)
  await mockMenu(page)

  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/pos')

  // T2 — lưới hiển thị nhóm đầu tiên (Trà sữa), bấm Thêm vào bill
  const addBtn = page.getByRole('button', { name: 'Thêm Trà sữa đào' })
  await expect(addBtn).toBeVisible()
  await expect(page.getByRole('button', { name: 'Matcha sữa' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trà đào', exact: true })).toHaveCount(0)
  await addBtn.click()

  // T3 — panel bill: 1 dòng, tổng tức thì
  const billLine = page.getByTestId('bill-line').first()
  await expect(billLine).toContainText('Trà sữa đào')
  await expect(page.getByTestId('bill-total')).toHaveText(/35\.000\s₫/)
  await expect(page.getByTestId('bill-count')).toHaveText('1 món')

  // topping dòng con (chỉ SP có link)
  await page.getByRole('button', { name: 'Chọn topping cho Trà sữa đào' }).click()
  const dialog = page.getByRole('dialog', { name: 'Topping cho Trà sữa đào' })
  await dialog.getByRole('button', { name: 'Topping Trân châu' }).click()
  await dialog.getByRole('button', { name: 'Đóng' }).click()
  await expect(billLine).toContainText('+ Trân châu 5.000 ₫')
  await expect(page.getByTestId('bill-total')).toHaveText(/40\.000\s₫/)

  // Q10 — ảnh 2 cỡ chuẩn của màn mới (uiux skill §4)
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expect(page.getByTestId('bill-total')).toBeVisible()
    await page.screenshot({
      path: `e2e/screenshots/p6-pos-${testInfo.project.name}-${viewport.name}.png`,
    })
  }

  expect(pageErrors).toEqual([])
})

test('P6-T2/Q10: /pos không tràn ngang ở 390×844 và 1280×800', async ({ page }) => {
  await injectAuth(page)
  await mockMenu(page)
  await page.goto('/pos')
  await expect(page.getByRole('button', { name: 'Thêm Trà sữa đào' })).toBeVisible()

  const reports: Record<string, OverflowReport> = {}
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    reports[viewport.name] = await measureOverflow(page)
  }
  const broken = Object.entries(reports).filter(([, r]) => r.scrollWidth > r.innerWidth + 1)
  expect(broken, `Tràn ngang cấp trang: ${JSON.stringify(broken, null, 2)}`).toEqual([])
})

test('P6-T2/Q11: axe trên /pos — không vi phạm serious/critical', async ({ page }) => {
  await injectAuth(page)
  await mockMenu(page)
  await page.goto('/pos')
  await expect(page.getByRole('button', { name: 'Thêm Trà sữa đào' })).toBeVisible()

  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`)
  expect(serious).toEqual([])
})
