import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { loadAccessProfile } from '../features/auth/accessGuard'
import { prefetchRoute } from './prefetch'

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

// P12-T4: không nạp chunk route thật trong unit test — spy hàm prefetch.
vi.mock('./prefetch', () => ({ prefetchRoute: vi.fn() }))
// Header đọc profiles của chính mình qua fake client (không có auth) → mock hook.
vi.mock('../features/profile/useMyProfile', () => ({
  useMyProfile: () => ({ profile: null, loading: false, refresh: vi.fn() }),
  useAvatarUrl: () => ({ avatarUrl: null }),
}))

// P4: AppLayout chạy useMenuSync() (query REST app_meta + kênh realtime) —
// dùng fake client (src/test/fakeSupabase.ts) đúng tinh thần testing/skill §2:
// unit test KHÔNG gọi mạng thật (REST/WS tới cloud).
vi.mock('../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/supabase')>()
  const { createFakeSupabase } = await import('../test/fakeSupabase')
  const { client } = createFakeSupabase({ tables: { app_meta: [{ id: 1, menu_version: 7 }] } })
  return { ...actual, getSupabase: () => client }
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

  it('đã đăng nhập: header P12-T9 (avatar + Đồng bộ + logo) + đủ 5 menu, KHÔNG còn 2 link nav', async () => {
    vi.mocked(loadAccessProfile).mockResolvedValue({ role: 'admin', mustChangePassword: false })
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    // P12-T9: header mới — avatar mở modal hồ sơ, nút đồng bộ, chấm online.
    expect(screen.getByTestId('app-header')).toBeInTheDocument()
    expect(screen.getByTestId('profile-btn')).toBeInTheDocument()
    expect(screen.getByTestId('sync-btn')).toBeInTheDocument()
    expect(screen.getByTestId('online-dot')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Hẻm Trà' })).toBeInTheDocument()
    // 5 menu × (sidebar + bottom-nav) — 2 link Đổi mật khẩu/email đã chuyển vào modal hồ sơ.
    expect(screen.getAllByRole('link')).toHaveLength(10)
    for (const label of ['Sản phẩm', 'Thanh toán', 'Quản lý bill', 'Quản lý user']) {
      expect(screen.getAllByRole('link', { name: label })).toHaveLength(2)
    }
    expect(screen.queryByRole('link', { name: 'Đổi mật khẩu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Đổi email khôi phục' })).not.toBeInTheDocument()
  })

  it('đã đăng nhập bằng staff → vẫn đủ 5 menu × 2, không có link email khôi phục (P3-T8)', async () => {
    vi.mocked(loadAccessProfile).mockResolvedValue({ role: 'staff', mustChangePassword: false })
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(10)
    expect(screen.queryAllByRole('link', { name: 'Đổi email khôi phục' })).toHaveLength(0)
    expect(screen.getByTestId('profile-btn')).toBeInTheDocument()
  })

  it('P12-T4: hover/focus link menu → prefetch chunk route tương ứng', async () => {
    vi.mocked(loadAccessProfile).mockResolvedValue({ role: 'admin', mustChangePassword: false })
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    const links = await screen.findAllByRole('link', { name: 'Sản phẩm' })
    fireEvent.mouseEnter(links[0])
    expect(prefetchRoute).toHaveBeenCalledWith('/products')
    fireEvent.focus(links[0])
    expect(prefetchRoute).toHaveBeenCalledWith('/products')
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
