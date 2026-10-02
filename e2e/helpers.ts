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
}

export async function injectAuth(page: Page, options: InjectAuthOptions = {}): Promise<void> {
  const role = options.role ?? 'admin'
  const mustChangePassword = options.mustChangePassword ?? false

  await page.addInitScript(
    ({ storageKey, profileId }) => {
      const nowSeconds = Math.floor(Date.now() / 1000)
      const session = {
        access_token: 'e2e-fake-access-token',
        refresh_token: 'e2e-fake-refresh-token',
        expires_in: 86400,
        expires_at: nowSeconds + 86400,
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
      window.localStorage.setItem('hemtra.login_at', String(Date.now()))
      window.localStorage.setItem(storageKey, JSON.stringify(session))
    },
    { storageKey: AUTH_TOKEN_KEY, profileId: PROFILE_ID },
  )

  // loadAccessProfile đọc profiles qua REST — trả đúng 1 dòng theo role/cờ.
  // maybeSingle() nhận mảng 1 phần tử (postgrest-js isMaybeSingle).
  await page.route('**/rest/v1/profiles*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' },
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
}
