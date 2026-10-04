import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import { injectAuth } from './helpers'

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
]

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, range',
  'access-control-expose-headers': 'content-range',
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return {
    status,
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  }
}

async function preflight(route: Route): Promise<void> {
  const requested =
    route.request().headers()['access-control-request-headers'] ?? 'authorization, apikey, content-type'
  await route.fulfill({
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': requested,
      'access-control-max-age': '86400',
    },
    body: '',
  })
}

const SEED_PROFILES = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'admin',
    display_name: 'Quản trị viên',
    role: 'admin',
    must_change_password: false,
    created_by: null,
    created_at: '2026-10-01T08:00:00Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    username: 'nhanvien1',
    display_name: 'Nguyễn Văn A',
    role: 'staff',
    must_change_password: true,
    created_by: '00000000-0000-4000-8000-000000000001',
    created_at: '2026-10-02T09:00:00Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    username: 'nhanvien2',
    display_name: 'Trần Thị B',
    role: 'staff',
    must_change_password: false,
    created_by: '00000000-0000-4000-8000-000000000002',
    created_at: '2026-10-03T10:00:00Z',
  },
]

async function setupUsersMocks(
  page: Page,
  profilesList = [...SEED_PROFILES],
  currentRole: 'admin' | 'staff' = 'admin',
): Promise<void> {
  let currentList = [...profilesList]

  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route)
    const url = route.request().url()
    // Nếu là query đọc profile người đang đăng nhập (loadAccessProfile)
    if (url.includes('id=eq.') || url.includes('select=role')) {
      return route.fulfill(
        json(
          [
            {
              id: '00000000-0000-4000-8000-000000000001',
              username: currentRole === 'admin' ? 'admin' : 'nhanvien1',
              display_name: currentRole === 'admin' ? 'Quản trị viên' : 'Nguyễn Văn A',
              role: currentRole,
              must_change_password: false,
            },
          ],
          200,
          { 'Content-Range': '0-0/1' },
        ),
      )
    }
    return route.fulfill(
      json(currentList, 200, {
        'Content-Range': `0-${Math.max(0, currentList.length - 1)}/${currentList.length}`,
      }),
    )
  })

  await page.route('**/functions/v1/admin-users*', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route)
    const postData = route.request().postDataJSON() as Record<string, unknown>
    const action = postData?.action

    if (action === 'create-user') {
      const newUser = {
        id: `user-${Date.now()}`,
        username: String(postData.username),
        display_name: String(postData.display_name || postData.username),
        role: String(postData.role || 'staff'),
        must_change_password: true,
        created_by: '00000000-0000-4000-8000-000000000001',
        created_at: new Date().toISOString(),
      }
      currentList = [...currentList, newUser]
      return route.fulfill(
        json({
          ok: true,
          user: newUser,
          temporary_password: 'mock_temp_pass_123',
        }),
      )
    }

    if (action === 'reset-password') {
      return route.fulfill(
        json({
          ok: true,
          temporary_password: 'mock_reset_pass_456',
        }),
      )
    }

    if (action === 'set-password') {
      return route.fulfill(json({ ok: true }))
    }

    if (action === 'delete-user') {
      const targetId = postData.user_id
      currentList = currentList.filter((u) => u.id !== targetId)
      return route.fulfill(json({ ok: true }))
    }

    return route.fulfill(json({ error: 'Action unknown' }, 400))
  })
}

test.describe('P9 — Menu Quản lý user', () => {
  for (const vp of VIEWPORTS) {
    test(`Admin xem danh sách, giao diện responsive, A11y trên ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      const consoleErrors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      await injectAuth(page, { role: 'admin' })
      await setupUsersMocks(page)

      await page.goto('/users')

      // 1. Kiểm tra tiêu đề và bảng
      await expect(page.getByRole('heading', { name: 'Quản lý user' })).toBeVisible()
      await expect(page.getByTestId('user-row-admin')).toBeVisible()
      await expect(page.getByTestId('user-row-nhanvien1')).toBeVisible()
      await expect(page.getByTestId('user-row-nhanvien2')).toBeVisible()

      // 2. Phân quyền nút thao tác (P9-T4):
      // Dòng admin: không có nút xóa/cấp lại, có badge "Admin hệ thống"
      await expect(page.getByText('Admin hệ thống')).toBeVisible()
      await expect(page.getByTestId('delete-user-btn-admin')).not.toBeVisible()

      // Dòng staff: có nút cấp lại mật khẩu, đặt mật khẩu, xóa
      await expect(page.getByTestId('reset-pw-btn-nhanvien1')).toBeVisible()
      await expect(page.getByTestId('set-pw-btn-nhanvien1')).toBeVisible()
      await expect(page.getByTestId('delete-user-btn-nhanvien1')).toBeVisible()

      // 3. Axe A11y (không có vi phạm serious/critical)
      const a11y = await new AxeBuilder({ page }).analyze()
      const serious = a11y.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(serious).toEqual([])

      // 4. Chụp ảnh bằng chứng
      await page.screenshot({
        path: `e2e/screenshots/p9-users-${vp.name}.png`,
        fullPage: true,
      })

      const fatalErrors = consoleErrors.filter(
        (e) => !e.includes('favicon') && !e.includes('WebSocket'),
      )
      expect(fatalErrors).toEqual([])
    })
  }

  test('Admin: Thêm user mới, hiển thị mật khẩu tạm thời và sao chép', async ({ page }) => {
    await injectAuth(page, { role: 'admin' })
    await setupUsersMocks(page)

    await page.goto('/users')
    await expect(page.getByTestId('add-user-btn')).toBeVisible()

    // Bấm "+ Thêm user"
    await page.getByTestId('add-user-btn').click()
    await expect(page.getByText('Thêm tài khoản người dùng')).toBeVisible()

    // Điền form
    await page.getByTestId('create-user-username').fill('nhanvientest')
    await page.getByTestId('create-user-display-name').fill('Nhân Viên Mới')

    // Bấm Tạo tài khoản
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click()

    // Hiển thị modal mật khẩu tạm thời
    await expect(page.getByTestId('temp-password-display')).toBeVisible()
    await expect(page.getByTestId('temp-password-display')).toContainText('mock_temp_pass_123')

    // Đóng modal mật khẩu tạm
    await page.getByRole('button', { name: 'Đã hiểu & Đóng' }).click()

    // Dòng user mới xuất hiện trong bảng
    await expect(page.getByTestId('user-row-nhanvientest')).toBeVisible()
  })

  test('Admin: Cấp lại mật khẩu cho staff thành công', async ({ page }) => {
    await injectAuth(page, { role: 'admin' })
    await setupUsersMocks(page)

    await page.goto('/users')
    await expect(page.getByTestId('reset-pw-btn-nhanvien1')).toBeVisible()

    // Bấm nút Cấp lại MK
    await page.getByTestId('reset-pw-btn-nhanvien1').click()

    // Modal hiển thị mật khẩu tạm mới
    await expect(page.getByTestId('temp-password-display')).toBeVisible()
    await expect(page.getByTestId('temp-password-display')).toContainText('mock_reset_pass_456')

    await page.getByRole('button', { name: 'Đã hiểu & Đóng' }).click()
  })

  test('Admin: Đặt mật khẩu cụ thể và Xóa staff với ConfirmDialog', async ({ page }) => {
    await injectAuth(page, { role: 'admin' })
    await setupUsersMocks(page)

    await page.goto('/users')

    // 1. Đặt mật khẩu cụ thể
    await page.getByTestId('set-pw-btn-nhanvien1').click()
    await expect(page.getByText(/Đặt mật khẩu cho @nhanvien1/i)).toBeVisible()
    await page.getByTestId('set-new-password-input').fill('matkhaumoi123')
    await page.getByRole('button', { name: 'Lưu mật khẩu' }).click()
    await expect(page.getByText(/Đặt mật khẩu cho @nhanvien1/i)).not.toBeVisible()

    // 2. Xóa tài khoản staff
    await page.getByTestId('delete-user-btn-nhanvien1').click()
    await expect(page.getByText(/Bạn có chắc chắn muốn xóa tài khoản @nhanvien1/i)).toBeVisible()
    await page.getByRole('button', { name: 'Xóa vĩnh viễn' }).click()

    // nhanvien1 biến mất khỏi bảng
    await expect(page.getByTestId('user-row-nhanvien1')).not.toBeVisible()
  })

  test('Staff: Được phép thêm user mới nhưng KHÔNG được cấp lại mật khẩu hoặc xóa người khác', async ({
    page,
  }) => {
    // Đăng nhập vai trò staff
    await injectAuth(page, { role: 'staff' })
    await setupUsersMocks(page, undefined, 'staff')

    await page.goto('/users')

    // Staff vẫn thấy nút "+ Thêm user" (§4.1)
    await expect(page.getByTestId('add-user-btn')).toBeVisible()

    // Staff KHÔNG thấy bất kỳ nút thao tác nào trên các dòng
    await expect(page.getByTestId('delete-user-btn-nhanvien2')).not.toBeVisible()
    await expect(page.getByTestId('reset-pw-btn-nhanvien2')).not.toBeVisible()
    await expect(page.getByTestId('set-pw-btn-nhanvien2')).not.toBeVisible()
    await expect(page.getByTestId('delete-user-btn-admin')).not.toBeVisible()
  })
})
