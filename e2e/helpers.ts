import type { Page } from '@playwright/test'

// P3-T7 — bơm phiên e2e để test route guard + layout SAU đăng nhập.
// Cloud pre-bootstrap (không có tài khoản thật) nên profiles được đáp lại bằng
// page.route() — mock tầng dữ liệu, KHÔNG mock code app: guard/session/layout
// chạy thật. Hạn chế ghi evidence p3t7 (test tích hợp thật chờ có local stack
// — B-001 — hoặc tài khoản thật).
const AUTH_TOKEN_KEY = 'sb-tsnrggxczipzqvvpcbld-auth-token'
const PROFILE_ID = '00000000-0000-4000-8000-000000000001'

export type InjectAuthOptions = {
  role?: 'admin' | 'staff'
  mustChangePassword?: boolean
  /** P3-T9: lùi login_at (ms) để test tự đăng xuất khi vượt 7 ngày. */
  loginAtMsAgo?: number
  /** P3-T9: token đã hết hạn → auth-js tự gọi /token?grant_type=refresh_token. */
  expiredToken?: boolean
}

export async function injectAuth(page: Page, options: InjectAuthOptions = {}): Promise<void> {
  const role = options.role ?? 'admin'
  const mustChangePassword = options.mustChangePassword ?? false
  const loginAtMsAgo = options.loginAtMsAgo ?? 0
  const expiredToken = options.expiredToken ?? false

  await page.addInitScript(
    ({ storageKey, profileId, loginAtMsAgo, expiredToken }) => {
      const nowSeconds = Math.floor(Date.now() / 1000)
      const expSeconds = expiredToken ? nowSeconds - 60 : nowSeconds + 86400
      const session = {
        access_token: 'e2e-fake-access-token',
        refresh_token: 'e2e-fake-refresh-token',
        expires_in: expiredToken ? -60 : 86400,
        expires_at: expSeconds,
        token_type: 'bearer',
        user: {
          id: profileId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'e2e@hem.local',
          email_confirmed_at: new Date().toISOString(),
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          identities: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }
      // Ghi nhớ = '1' → token + login_at cùng ở localStorage (lib/supabase.ts)
      window.localStorage.setItem('hemtra.remember', '1')
      window.localStorage.setItem('hemtra.login_at', String(Date.now() - loginAtMsAgo))
      window.localStorage.setItem(storageKey, JSON.stringify(session))
    },
    { storageKey: AUTH_TOKEN_KEY, profileId: PROFILE_ID, loginAtMsAgo, expiredToken },
  )

  // loadAccessProfile đọc profiles qua REST — trả đúng 1 dòng theo role/cờ.
  // maybeSingle() nhận mảng 1 phần tử (postgrest-js isMaybeSingle).
  await page.route('**/rest/v1/profiles*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // REST là cross-origin — WebKit cần header CORS (xem e2e/p3-auth.spec.ts)
      headers: {
        'Content-Range': '0-0/1',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
        'access-control-expose-headers': 'content-range',
      },
      body: JSON.stringify([
        {
          id: PROFILE_ID,
          username: 'e2e',
          display_name: 'E2E',
          role,
          must_change_password: mustChangePassword,
        },
      ]),
    }),
  )

  // P4: sau đăng nhập, AppLayout chạy useMenuSync() (menuSync.ts) → query
  // app_meta để so menu_version, lệch (cache rỗng) → tải categories/products/toppings.
  // Không mock → 4-5 request đi thật với token giả → 401 vào console → Q10 fail.
  // Mock tầng dữ liệu (giống p4-pwa.spec) — code app vẫn chạy thật.
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
    'access-control-expose-headers': 'content-range',
  }
  const json = (body: unknown): { status: 200; contentType: string; headers: typeof cors; body: string } => ({
    status: 200,
    contentType: 'application/json',
    headers: cors,
    body: JSON.stringify(body),
  })
  await page.route('**/rest/v1/app_meta*', (route) =>
    route.fulfill(json([{ id: 1, menu_version: 7, bootstrapped: false }])),
  )
  await page.route('**/rest/v1/categories*', (route) => route.fulfill(json([])))
  await page.route('**/rest/v1/products*', (route) => route.fulfill(json([])))
  await page.route('**/rest/v1/toppings*', (route) => route.fulfill(json([])))
  await page.route('**/rest/v1/product_toppings*', (route) => route.fulfill(json([])))
  await page.route('**/rest/v1/stats_daily*', (route) => route.fulfill(json([])))
  await page.route('**/rest/v1/stats_product_monthly*', (route) => route.fulfill(json([])))
  await page.route('**/rest/v1/stats_product_alltime*', (route) => route.fulfill(json([])))
}
