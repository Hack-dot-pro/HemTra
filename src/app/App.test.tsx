import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { loadAccessProfile } from '../features/auth/accessGuard'

// Không gọi mạng trong unit test (testing/skill.md §2) — coi như đã bootstrap
vi.mock('../features/setup/api', () => ({
  defaultApi: {
    fetchBootstrapped: async () => ({ ok: true, data: true }),
    requestOtp: async () => ({ ok: true, data: null }),
    complete: async () => ({ ok: true, data: null }),
  },
  EF_DONE_MESSAGE: 'Hệ thống đã được thiết lập',
  CONFIG_ERROR: 'Ứng dụng chưa được cấu hình Supabase (thiếu VITE_SUPABASE_URL).',
}))

// P3-T7: Route guard đọc profiles — mock để không đụng mạng; mặc định = chưa đăng nhập
vi.mock('../features/auth/accessGuard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/auth/accessGuard')>()
  return { ...actual, loadAccessProfile: vi.fn(async () => null) }
})

beforeEach(() => {
  vi.mocked(loadAccessProfile).mockReset()
  vi.mocked(loadAccessProfile).mockResolvedValue(null)
})
afterEach(cleanup)

describe('App', () => {
  it('mở ứng dụng chưa đăng nhập → màn hình đăng nhập (guard)', async () => {
    render(<App />)
    expect(await screen.findByRole('img', { name: 'Hẻm Trà' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /đăng nhập/i })).toBeInTheDocument()
  })

  it('đã đăng nhập: layout với đủ 5 menu + link Đổi mật khẩu (admin thêm đổi email)', async () => {
    vi.mocked(loadAccessProfile).mockResolvedValue({ role: 'admin', mustChangePassword: false })
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    // 5 menu × (sidebar + bottom-nav) + 2 link Đổi mật khẩu + 2 link Đổi email khôi phục
    expect(screen.getAllByRole('link')).toHaveLength(14)
    for (const label of ['Sản phẩm', 'Thanh toán', 'Quản lý bill', 'Quản lý user']) {
      expect(screen.getAllByRole('link', { name: label })).toHaveLength(2)
    }
    expect(screen.getAllByRole('link', { name: 'Đổi mật khẩu' })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'Đổi email khôi phục' })).toHaveLength(2)
  })

  it('đã đăng nhập bằng staff → KHÔNG thấy link Đổi email khôi phục (P3-T8)', async () => {
    vi.mocked(loadAccessProfile).mockResolvedValue({ role: 'staff', mustChangePassword: false })
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    // 5 menu × 2 + 2 link Đổi mật khẩu — không có link đổi email khôi phục
    expect(screen.getAllByRole('link')).toHaveLength(12)
    expect(screen.queryAllByRole('link', { name: 'Đổi email khôi phục' })).toHaveLength(0)
  })

  it('chưa đăng nhập vào /dashboard → bị đá về /login', async () => {
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    expect(await screen.findByRole('img', { name: 'Hẻm Trà' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('must_change_password=true → bị ép qua /change-password', async () => {
    vi.mocked(loadAccessProfile).mockResolvedValue({ role: 'staff', mustChangePassword: true })
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Đổi mật khẩu' })).toBeInTheDocument()
    expect(screen.getByText('Vui lòng đổi mật khẩu trước khi tiếp tục.')).toBeInTheDocument()
  })

  it('chuyển về trang đăng nhập khi vào đường dẫn lạ', async () => {
    window.history.pushState({}, '', '/khong-ton-tai')
    render(<App />)
    expect(await screen.findByRole('img', { name: 'Hẻm Trà' })).toBeInTheDocument()
  })
})
