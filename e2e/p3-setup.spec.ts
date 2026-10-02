import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// P3-T3 — màn "Thiết lập lần đầu". Cloud (dev) đang giữ trạng thái pre-bootstrap
// để test UI này; nếu môi trường đã bootstrap thì màn phải tự ẩn (design §4.2.1).
// Trạng thái đọc read-only từ app_meta — KHÔNG gọi action bootstrap trong test.

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
]

function loadEnvFile(): Record<string, string> {
  const env: Record<string, string> = {}
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
      if (match) env[match[1]] = match[2].trim()
    }
  } catch {
    // không có .env → để trống, test sẽ coi như đã bootstrap
  }
  return env
}

async function fetchBootstrapped(): Promise<boolean> {
  const env = loadEnvFile()
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return true
  try {
    const res = await fetch(`${url}/rest/v1/app_meta?select=bootstrapped&id=eq.1&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    const rows = (await res.json()) as { bootstrapped: boolean }[]
    return rows[0]?.bootstrapped === true
  } catch {
    return true
  }
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

const bootstrapped = await fetchBootstrapped()

test('P3-T3: /setup đúng trạng thái bootstrap, a11y đạt, không lỗi console', async ({
  page,
}, testInfo) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/setup')

  if (bootstrapped) {
    // Đã bootstrap → màn đăng ký tự ẩn, quay về đăng nhập, không còn link
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('img', { name: 'Hẻm Trà' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thiết lập lần đầu' })).toHaveCount(0)
  } else {
    await expect(page.getByRole('heading', { name: 'Thiết lập lần đầu' })).toBeVisible()
    await expect(page.getByLabel('Email admin')).toBeVisible()
    await expect(page.getByRole('button', { name: /gửi mã otp/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Quay lại đăng nhập' })).toBeVisible()

    // Ảnh chụp 2 viewport (testing/skill.md §3)
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await expect(page.getByRole('heading', { name: 'Thiết lập lần đầu' })).toBeVisible()
      await page.screenshot({
        path: `e2e/screenshots/setup-${testInfo.project.name}-${viewport.name}.png`,
      })
    }

    const { violations } = await new AxeBuilder({ page }).analyze()
    const serious = violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`)
    expect(serious).toEqual([])
  }

  expect(errors).toEqual([])
})

test('P3-T3: link "Thiết lập lần đầu" trên login khớp trạng thái và vào được /setup', async ({
  page,
}) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/login')
  await expect(page.getByRole('img', { name: 'Hẻm Trà' })).toBeVisible()

  const link = page.getByRole('button', { name: 'Thiết lập lần đầu' })
  if (bootstrapped) {
    await expect(link).toHaveCount(0)
  } else {
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/setup$/)
    await expect(page.getByRole('heading', { name: 'Thiết lập lần đầu' })).toBeVisible()
  }

  expect(errors).toEqual([])
})
