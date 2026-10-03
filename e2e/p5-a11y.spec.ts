import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { injectAuth } from './helpers'

// QC P5 (qc-test) — bổ sung cho Q10/Q11: e2e/p5-products.spec.ts không kiểm
// tràn ngang trang và không chạy axe trên /products. 2 test × 3 project.

/** helpers.ts chưa mock product_toppings — ProductsPage.load() đọc cả 4 bảng. */
async function mockLinks(page: Page): Promise<void> {
  await page.route('**/rest/v1/product_toppings*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
      },
      body: '[]',
    }),
  )
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
]

type OverflowReport = {
  innerWidth: number
  scrollWidth: number
  offenders: string[]
}

/** Tràn ngang ở cấp trang (document) — bảng nằm trong overflow-x-auto nên ô
 * con vượt viewport là hợp lệ; chỉ document.scrollWidth mới nói layout vỡ. */
async function measureOverflow(page: Page): Promise<OverflowReport> {
  return page.evaluate(() => {
    window.scrollTo(0, 0)
    const doc = document.documentElement
    const offenders = Array.from(document.querySelectorAll('body *'))
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return false
        if (rect.right <= window.innerWidth + 1) return false
        // bỏ phần bị kẹp trong ancestor scroll container (bảng 640px trong overflow-x-auto)
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

test('Q10: /products không tràn ngang trang ở 390×844 và 1280×800', async ({ page }) => {
  await injectAuth(page)
  await mockLinks(page)
  await page.goto('/products')
  await expect(page.locator('#panel-products')).toBeVisible()

  const reports: Record<string, OverflowReport> = {}
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    reports[viewport.name] = await measureOverflow(page)
  }

  const broken = Object.entries(reports).filter(([, r]) => r.scrollWidth > r.innerWidth + 1)
  expect(broken, `Tràn ngang cấp trang: ${JSON.stringify(broken, null, 2)}`).toEqual([])
})

test('Q11: axe trên /products — không vi phạm serious/critical', async ({ page }) => {
  await injectAuth(page)
  await mockLinks(page)
  await page.goto('/products')
  await expect(page.locator('#panel-products')).toBeVisible()

  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`)
  expect(serious).toEqual([])
})
