import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// P3-T6 — màn "Khôi phục mật khẩu" (/recovery).
// KHÔNG gửi OTP thật trong test (GoTrue rate limit + không có mailbox) —
// chỉ kiểm UI, a11y, console, điều hướng từ nút "Quên mật khẩu".

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

test('P3-T6: /recovery đúng cấu trúc, a11y đạt, không lỗi console', async ({
  page,
}, testInfo) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/recovery')

  await expect(page.getByRole('heading', { name: 'Khôi phục mật khẩu' })).toBeVisible()
  await expect(page.getByLabel('Email admin')).toBeVisible()
  await expect(page.getByRole('button', { name: /gửi mã otp/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quay lại đăng nhập' })).toBeVisible()
  // Ghi chú staff (design §4.4 — staff không tự khôi phục)
  await expect(page.getByText('Liên hệ admin')).toBeVisible()

  // Ảnh chụp 2 viewport (testing/skill.md §3)
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expect(page.getByRole('heading', { name: 'Khôi phục mật khẩu' })).toBeVisible()
    await page.screenshot({
      path: `e2e/screenshots/recovery-${testInfo.project.name}-${viewport.name}.png`,
    })
  }

  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`)
  expect(serious).toEqual([])

  expect(errors).toEqual([])
})

test('P3-T6: nút "Quên mật khẩu" trên login vào được /recovery và quay lại được', async ({
  page,
}) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/login')
  await expect(page.getByRole('img', { name: 'Hẻm Trà' })).toBeVisible()

  await page.getByRole('button', { name: 'Quên mật khẩu' }).click()
  await expect(page).toHaveURL(/\/recovery$/)
  await expect(page.getByRole('heading', { name: 'Khôi phục mật khẩu' })).toBeVisible()

  await page.getByRole('button', { name: 'Quay lại đăng nhập' }).click()
  await expect(page).toHaveURL(/\/login$/)

  expect(errors).toEqual([])
})
