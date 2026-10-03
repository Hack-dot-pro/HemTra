import { expect, test, type Page } from '@playwright/test'
import { injectAuth } from './helpers'

// P3-T9 — các luồng auth trên môi trường cloud pre-bootstrap:
//   + đăng nhập đúng/sai, lockout 5 lần + mở khóa bằng OTP,
//   + hết hạn 7 ngày (login_at) và token hỏng/hết hạn bị từ chối,
//   + khôi phục mật khẩu admin (2 bước), đổi email khôi phục (3 bước),
//   + /setup bị từ chối khi email lạ hoặc ai đó đã bootstrap trước.
// Mock tầng MẠNG bằng page.route() (hợp đồng EF thật) — code app chạy thật.
// Hạn chế như evidence p3t7/p3t8: test tích hợp thật chờ local stack (B-001).

const PROFILE_ID = '00000000-0000-4000-8000-000000000001'
const DAY_MS = 24 * 60 * 60 * 1000

// "Failed to load resource … 401/429" là phản hồi 4xx CÓ Ý ĐỊNH của test —
// không phải lỗi app. Giữ lại các lỗi console khác + lỗi chưa bắt (pageerror).
function collectAppErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.includes('Failed to load resource')) return
    errors.push(text)
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

// CORS: các EF/REST là cross-origin (localhost → supabase.co) — WebKit bắt lỗi
// "access control checks" nếu response giả không kèm header CORS.
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range',
}

// P4-T3: sau đăng nhập, AppLayout chạy useMenuSync() (src/lib/useMenu.ts) —
// query app_meta để so menu_version + mở kênh realtime app_meta. Phải đợi 2
// luồng này ổn định TRƯỚC khi điều hướng bằng page.goto lần nữa: điều hướng
// giữa chừng làm fetch bị hủy (unhandledrejection "…due to access control
// checks") và WebSocket đóng khi đang kết nối — nhiễu tầng mạng của teardown,
// không phải lỗi app. Bằng chứng timeline: .opencode/evidence/p4-e2e-race.md.
// Gọi TRƯỚC page.goto để không bỏ lỡ sự kiện websocket/response.
async function waitForMenuSyncReady(page: Page): Promise<void> {
  const appMeta = page.waitForResponse(
    (res) => res.url().includes('/rest/v1/app_meta') && res.status() === 200,
  )
  const joined = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('realtime app_meta không gửi phx_join trong 10s')),
      10_000,
    )
    page.on('websocket', (socket) => {
      if (!socket.url().includes('/realtime/v1/websocket')) return
      socket.on('framesent', (frame) => {
        if (String(frame.payload).includes('phx_join')) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
  })
  await appMeta
  await joined
}

function fulfill(page: Page, pattern: string, status: number, body: unknown): Promise<void> {
  return page.route(pattern, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify(body),
    }),
  )
}

// JWT giả đúng cấu trúc 3 phần (auth-js chỉ decode, không verify chữ ký) với
// exp tương lai để setSession không tự gọi refresh trong các test khác.
function fakeJwt(): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({
      sub: PROFILE_ID,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    'c2lnbmF0dXJl',
  ].join('.')
}

function fakeUser() {
  const now = new Date().toISOString()
  return {
    id: PROFILE_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e@hem.local',
    email_confirmed_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
  }
}

// profiles cho RequireAuth (cùng định dạng với helpers.injectAuth).
function mockProfiles(page: Page, role: 'admin' | 'staff' = 'admin'): Promise<void> {
  return page.route('**/rest/v1/profiles*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1', ...CORS_HEADERS },
      body: JSON.stringify([
        {
          id: PROFILE_ID,
          username: 'e2e',
          display_name: 'E2E',
          role,
          must_change_password: false,
        },
      ]),
    }),
  )
}

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel('Tài khoản', { exact: true }).fill(username)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
}

test('P3-T9: đăng nhập đúng → vào Dashboard; sai → lỗi tiếng Việt, vẫn ở /login', async ({
  page,
}) => {
  const errors = collectAppErrors(page)
  await fulfill(page, '**/functions/v1/auth-login', 401, {
    error: 'Tài khoản hoặc mật khẩu không đúng.',
    locked: false,
  })

  await page.goto('/login')
  await signIn(page, 'adminmoi', 'AdminP3t8!2345')
  await expect(page.getByRole('alert')).toHaveText('Tài khoản hoặc mật khẩu không đúng.')
  await expect(page).toHaveURL(/\/login$/)

  // Đổi hợp đồng sang thành công → đăng nhập lại vào được app.
  await fulfill(page, '**/functions/v1/auth-login', 200, {
    ok: true,
    session: { access_token: fakeJwt(), refresh_token: 'e2e-refresh', expires_in: 3600 },
  })
  await fulfill(page, '**/auth/v1/user*', 200, fakeUser())
  await mockProfiles(page)

  await page.getByLabel('Tài khoản', { exact: true }).fill('adminmoi')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('AdminP3t8!2345')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  expect(errors).toEqual([])
})

test('P3-T9: sai 5 lần → khóa → mở khóa bằng OTP khôi phục lượt đăng nhập', async ({ page }) => {
  const errors = collectAppErrors(page)
  let attempts = 0

  await page.route('**/functions/v1/auth-login', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action === 'login') {
      attempts += 1
      if (attempts < 5) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Tài khoản hoặc mật khẩu không đúng.', locked: false }),
        })
      }
      // Hợp đồng EF: 429 + locked=true (auth-login, design §4.3).
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Bạn đã nhập sai quá nhiều lần. Vui lòng dùng OTP khôi phục.',
          locked: true,
        }),
      })
    }
    if (body.action === 'unlock-otp') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, message: 'Đã gửi mã OTP khôi phục.' }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: true,
        message: 'Đã khôi phục lượt đăng nhập. Hãy thử đăng nhập lại.',
      }),
    })
  })

  await page.goto('/login')
  for (let i = 0; i < 5; i += 1) {
    await signIn(page, 'adminmoi', 'sai-mat-khau')
  }
  expect(attempts).toBe(5)

  const sendOtp = page.getByRole('button', { name: 'Gửi OTP khôi phục lượt đăng nhập' })
  await expect(sendOtp).toBeVisible()
  await sendOtp.click()

  await page.getByLabel('Mã OTP khôi phục').fill('123456')
  await page.getByRole('button', { name: 'Khôi phục lượt đăng nhập' }).click()

  await expect(page.getByRole('status')).toContainText('Đã khôi phục lượt đăng nhập.')
  expect(errors).toEqual([])
})

test('P3-T9: phiên vượt 7 ngày (login_at) → tự đăng xuất kèm gợi ý', async ({ page }) => {
  const errors = collectAppErrors(page)
  await injectAuth(page, { loginAtMsAgo: 8 * DAY_MS })

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('status')).toContainText('Phiên đăng nhập đã hết hạn.')
  expect(errors).toEqual([])
})

test('P3-T9: token hết hạn → refresh bị từ chối → về /login', async ({ page }) => {
  const errors = collectAppErrors(page)
  await injectAuth(page, { expiredToken: true })
  await fulfill(page, '**/auth/v1/token*', 401, {
    error: 'invalid_grant',
    error_description: 'Refresh Token Not Found',
  })

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  expect(errors).toEqual([])
})

test('P3-T9: token bị sửa → REST từ chối → màn "thử lại", không vào được app', async ({
  page,
}) => {
  const errors = collectAppErrors(page)
  await injectAuth(page)
  // Làm hỏng token NGAY SAU khi injectAuth ghi phiên (init script chạy theo thứ tự).
  await page.addInitScript(() => {
    const key = 'sb-tsnrggxczipzqvvpcbld-auth-token'
    const raw = window.localStorage.getItem(key)
    if (!raw) return
    const session = JSON.parse(raw) as { access_token?: string }
    session.access_token = 'token-bi-sua-boi-attacker'
    window.localStorage.setItem(key, JSON.stringify(session))
  })
  // Server từ chối token giả — đăng ký sau để ghi đè route 200 của injectAuth.
  await fulfill(page, '**/rest/v1/profiles*', 401, { message: 'JWT expired' })
  await fulfill(page, '**/auth/v1/token*', 401, { error: 'invalid_grant' })

  await page.goto('/dashboard')
  await expect(page.getByRole('alert')).toHaveText(
    'Không tải được thông tin tài khoản, thử lại.',
  )
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('P3-T9: khôi phục mật khẩu admin 2 bước → về /login với gợi ý', async ({ page }) => {
  const errors = collectAppErrors(page)
  await page.route('**/functions/v1/admin-recovery', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    const response =
      body.action === 'request-otp'
        ? { ok: true, message: 'Đã gửi mã OTP tới email admin.' }
        : { ok: true, message: 'Đã đặt lại mật khẩu.' }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    })
  })

  await page.goto('/recovery')
  await page.getByLabel('Email admin').fill('admin@example.com')
  await page.getByRole('button', { name: /gửi mã otp/i }).click()

  await expect(page.getByRole('heading', { name: 'Đặt mật khẩu mới' })).toBeVisible()
  await page.getByLabel('Mã OTP').fill('123456')
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('AdminP3t8!2345')
  await page.getByRole('button', { name: 'Đặt mật khẩu mới' }).click()

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('status')).toContainText('Đã đặt lại mật khẩu.')
  expect(errors).toEqual([])
})

test('P3-T9: admin đổi email khôi phục 3 bước → tự đăng xuất, gợi ý đăng nhập mới', async ({
  page,
}) => {
  const errors = collectAppErrors(page)
  await injectAuth(page, { role: 'admin' })
  await page.route('**/functions/v1/change-recovery-email', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    const response =
      body.action === 'request-current'
        ? { ok: true, message: 'Đã gửi mã OTP tới email hiện tại.' }
        : body.action === 'request-new'
          ? { ok: true, message: 'Đã gửi mã OTP tới email mới.' }
          : { ok: true, message: 'Đã đổi email khôi phục. Hãy đăng nhập bằng mật khẩu mới.' }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    })
  })

  await page.goto('/dashboard')
  // Link chỉ hiện cho admin — đúng 1 link hiển thị ở viewport hiện tại.
  await expect(page.locator('a[href="/change-recovery-email"]:visible')).toHaveCount(1)
  await page.locator('a[href="/change-recovery-email"]:visible').click()
  await expect(page).toHaveURL(/\/change-recovery-email$/)

  // Bước 1 — mật khẩu admin hiện tại (điều kiện 1a).
  await page.getByLabel('Mật khẩu admin hiện tại').fill('AdminP3t8!2345')
  await page.getByRole('button', { name: 'Gửi mã OTP' }).click()
  await expect(page.getByText('Bước 2/3')).toBeVisible()

  // Bước 2 — OTP email hiện tại + email mới (điều kiện 1b + 2).
  await page.getByLabel('Mã OTP email hiện tại').fill('123456')
  await page.getByLabel('Email khôi phục mới').fill('admin-moi@example.com')
  await page.getByRole('button', { name: 'Gửi OTP email mới' }).click()
  await expect(page.getByText('Bước 3/3')).toBeVisible()

  // Bước 3 — OTP email mới + mật khẩu mới.
  await page.getByLabel('Mã OTP email mới').fill('123456')
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('MoiP3t8!2345')
  await page.getByLabel('Nhập lại mật khẩu mới').fill('MoiP3t8!2345')
  await page.getByRole('button', { name: 'Hoàn tất đổi email' }).click()

  await expect(page.getByRole('status')).toContainText('Đã đổi email khôi phục.')
  // Server đã hủy phiên cũ → client không để token mồ côi lại trong storage.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('sb-tsnrggxczipzqvvpcbld-auth-token')))
    .toBeNull()

  await page.getByRole('button', { name: 'Đăng nhập lại' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('status')).toContainText('Đã đổi email khôi phục.')
  expect(errors).toEqual([])
})

test('P3-T9: nhân viên không có link và bị chặn ở màn đổi email khôi phục', async ({ page }) => {
  const errors = collectAppErrors(page)
  let calls = 0
  await injectAuth(page, { role: 'staff' })
  await page.route('**/functions/v1/change-recovery-email', (route) => {
    calls += 1
    return route.fulfill({
      status: 403,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Chỉ admin mới dùng chức năng này.' }),
    })
  })

  const menuReady = waitForMenuSyncReady(page)
  await page.goto('/dashboard')
  await expect(page.locator('a[href="/change-recovery-email"]')).toHaveCount(0)
  await menuReady

  await page.goto('/change-recovery-email')
  await expect(page.getByRole('status')).toContainText('Chỉ admin mới dùng chức năng này')
  await expect(page.getByRole('button', { name: 'Về trang chính' })).toBeVisible()
  expect(calls).toBe(0)
  expect(errors).toEqual([])
})

test('P3-T9: /setup — email lạ bị EF từ chối → hiện lỗi, vẫn ở /setup', async ({ page }) => {
  const errors = collectAppErrors(page)
  await fulfill(page, '**/rest/v1/app_meta*', 200, [{ bootstrapped: false }])
  await fulfill(page, '**/functions/v1/bootstrap-admin', 403, {
    error: 'Email này không phải email admin.',
  })

  await page.goto('/setup')
  await page.getByLabel('Email admin').fill('nguoidungla@example.com')
  await page.getByRole('button', { name: /gửi mã otp/i }).click()

  await expect(page.getByRole('alert')).toHaveText('Email này không phải email admin.')
  await expect(page).toHaveURL(/\/setup$/)
  expect(errors).toEqual([])
})

test('P3-T9: /setup — bootstrap lần 2 (409 "đã thiết lập") → thoát về /login', async ({ page }) => {
  const errors = collectAppErrors(page)
  await fulfill(page, '**/rest/v1/app_meta*', 200, [{ bootstrapped: false }])
  await page.route('**/functions/v1/bootstrap-admin', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    const response =
      body.action === 'request-otp'
        ? { ok: true }
        : { error: 'Hệ thống đã được thiết lập' }
    return route.fulfill({
      status: body.action === 'request-otp' ? 200 : 409,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    })
  })

  await page.goto('/setup')
  await page.getByLabel('Email admin').fill('admin@example.com')
  await page.getByRole('button', { name: /gửi mã otp/i }).click()

  await page.getByLabel('Mã OTP').fill('123456')
  await page.getByLabel('Tài khoản', { exact: true }).fill('adminmoi')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('AdminP3t8!2345')
  await page.getByRole('button', { name: 'Hoàn tất thiết lập' }).click()

  await expect(page).toHaveURL(/\/login$/)
  expect(errors).toEqual([])
})

// QC-001: mỗi test chỉ 1 lần điều hướng — goto lần 2 hủy request app_meta đang
// bay (StrictMode ×2) → WebKit log "Fetch API cannot load ... access control".
test('P3-T9: bootstrap xong → /setup tự chuyển sang /login', async ({ page }) => {
  const errors = collectAppErrors(page)
  await fulfill(page, '**/rest/v1/app_meta*', 200, [{ bootstrapped: true }])

  await page.goto('/setup')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('img', { name: 'Hẻm Trà' })).toBeVisible()
  expect(errors).toEqual([])
})

test('P3-T9: bootstrap xong → login hết link "Thiết lập lần đầu"', async ({ page }) => {
  const errors = collectAppErrors(page)
  await fulfill(page, '**/rest/v1/app_meta*', 200, [{ bootstrapped: true }])

  await page.goto('/login')
  // chờ fetch app_meta của chính trang login xong (loading cũng ẩn link —
  // phải chắc status đã resolved mới kết luận "hết link")
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('img', { name: 'Hẻm Trà' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thiết lập lần đầu' })).toHaveCount(0)
  expect(errors).toEqual([])
})
