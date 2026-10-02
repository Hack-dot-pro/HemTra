import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Chuẩn viewport theo testing/skill.md §3: 390×844 (mobile) và 1280×800 (desktop)
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
]

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

async function expectNoSeriousA11yViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`)
}

test('P2-T7: màn đăng nhập đúng layout ở cả hai viewport, không lỗi console, a11y đạt', async ({
  page,
}, testInfo) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/login')
  await expect(page.getByRole('img', { name: 'Hẻm Trà' })).toBeVisible()
  await expect(page.getByRole('button', { name: /đăng nhập/i })).toBeVisible()
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toBeVisible()

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expect(page.getByRole('img', { name: 'Hẻm Trà' })).toBeVisible()
    await expect(page.getByRole('button', { name: /xóa cache/i })).toBeVisible()
    await page.screenshot({
      path: `e2e/screenshots/login-${testInfo.project.name}-${viewport.name}.png`,
    })
  }

  expect(await expectNoSeriousA11yViolations(page)).toEqual([])
  expect(errors).toEqual([])
})

test('P2-T7: layout sau đăng nhập có 5 menu, không lỗi console, a11y đạt', async ({
  page,
}, testInfo) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/dashboard')

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Menu chính' }).first()).toBeVisible()
    await page.screenshot({
      path: `e2e/screenshots/layout-${testInfo.project.name}-${viewport.name}.png`,
    })
  }

  // 5 menu hiện cả ở sidebar lẫn bottom-nav
  for (const label of ['Dashboard', 'Sản phẩm', 'Thanh toán', 'Quản lý bill', 'Quản lý user']) {
    expect(await page.getByText(label, { exact: true }).count()).toBeGreaterThanOrEqual(1)
  }

  expect(await expectNoSeriousA11yViolations(page)).toEqual([])
  expect(errors).toEqual([])
})

test('P2-T7: đăng nhập rỗng hiện lỗi tiếng Việt', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /đăng nhập/i }).click()
  await expect(page.getByRole('alert').first()).toHaveText('Vui lòng nhập tài khoản.')
  await expect(page.getByText('Vui lòng nhập mật khẩu.')).toBeVisible()
})
