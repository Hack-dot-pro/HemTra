import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { injectAuth } from './helpers'

// P3-T7 — route guard (design §4.1): chưa đăng nhập không vào được app;
// must_change_password bị ép qua /change-password.

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.includes('Importing a module script failed')) return
    errors.push(text)
  })
  page.on('pageerror', (error) => {
    const text = String(error)
    if (text.includes('Importing a module script failed')) return
    errors.push(text)
  })
  return errors
}

test('P3-T7: chưa đăng nhập vào /dashboard → chuyển về /login', async ({ page }) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('img', { name: 'Hẻm Trà' })).toBeVisible()
  expect(errors).toEqual([])
})

test('P3-T7: chưa đăng nhập vào /change-password → chuyển về /login', async ({ page }) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/change-password')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('img', { name: 'Hẻm Trà' })).toBeVisible()
  expect(errors).toEqual([])
})

test('P3-T7: vào "/" chưa đăng nhập → /login (index đi qua guard)', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('P3-T7: must_change_password=true → bị ép qua màn đổi mật khẩu (a11y, ảnh)', async ({
  page,
}, testInfo) => {
  const errors = collectConsoleErrors(page)
  await injectAuth(page, { role: 'staff', mustChangePassword: true })
  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/change-password$/)
  await expect(page.getByRole('heading', { name: 'Đổi mật khẩu' })).toBeVisible()
  await expect(page.getByText('Vui lòng đổi mật khẩu trước khi tiếp tục.')).toBeVisible()
  await expect(page.getByLabel('Mật khẩu hiện tại')).toBeVisible()

  for (const viewport of [
    { name: '390x844', width: 390, height: 844 },
    { name: '1280x800', width: 1280, height: 800 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.screenshot({
      path: `e2e/screenshots/change-password-forced-${testInfo.project.name}-${viewport.name}.png`,
    })
  }

  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`)
  expect(serious).toEqual([])
  expect(errors).toEqual([])
})

// P12-T9 — header bỏ link "Đổi mật khẩu"/"Đổi email khôi phục" (vào qua modal
// hồ sơ / route giữ nguyên cho must_change_password) — design §7.2.
test('P3-T7/P12-T9: header không còn link "Đổi mật khẩu"; vào /change-password trực tiếp vẫn được', async ({
  page,
}) => {
  const errors = collectConsoleErrors(page)
  await injectAuth(page, { role: 'admin' })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await expect(page.getByRole('link', { name: 'Đổi mật khẩu' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Đổi email khôi phục' })).toHaveCount(0)

  await page.goto('/change-password')
  await expect(page).toHaveURL(/\/change-password$/)
  await expect(page.getByText('Nhập mật khẩu hiện tại và mật khẩu mới.')).toBeVisible()
  expect(errors).toEqual([])
})
