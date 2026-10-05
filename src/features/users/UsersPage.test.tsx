import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProfileContext } from '../../app/authProfileContext'
import type { AccessProfile } from '../auth/accessGuard'
import type { UsersApi } from './api'
import type { UserProfile } from './types'
import UsersPage from './UsersPage'
import { resetUsersCache } from './logic'

const MOCK_USERS: UserProfile[] = [
  {
    id: 'admin-id',
    username: 'admin',
    displayName: 'Quản trị viên',
    role: 'admin',
    mustChangePassword: false,
    createdBy: null,
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'staff-1-id',
    username: 'nhanvien1',
    displayName: 'Nguyễn Văn A',
    role: 'staff',
    mustChangePassword: true,
    createdBy: 'admin-id',
    creatorUsername: 'admin',
    createdAt: '2026-10-02T08:00:00Z',
  },
  {
    id: 'staff-2-id',
    username: 'nhanvien2',
    displayName: 'Trần Thị B',
    role: 'staff',
    mustChangePassword: false,
    createdBy: 'staff-1-id',
    creatorUsername: 'nhanvien1',
    createdAt: '2026-10-03T09:00:00Z',
  },
]

function renderWithRole(
  role: 'admin' | 'staff' = 'admin',
  userId = 'admin-id',
  customApi?: Partial<UsersApi>,
) {
  const profile: AccessProfile = { role, mustChangePassword: false }
  const api: UsersApi = {
    fetchUsers: vi.fn().mockResolvedValue(MOCK_USERS),
    createUser: vi.fn().mockResolvedValue({
      user: {
        id: 'new-id',
        username: 'nhanvienmoi',
        displayName: 'Mới',
        role: 'staff',
        mustChangePassword: true,
        createdBy: userId,
        createdAt: '2026-10-04T00:00:00Z',
      },
      temporaryPassword: 'temp_pass_123',
    }),
    resetPassword: vi.fn().mockResolvedValue({ temporaryPassword: 'reset_temp_pass' }),
    setPassword: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    ...customApi,
  }

  const renderResult = render(
    <AuthProfileContext.Provider value={profile}>
      <UsersPage api={api} currentUserId={userId} />
    </AuthProfileContext.Provider>,
  )

  return { renderResult, api }
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    cleanup()
    resetUsersCache()
  })

  it('hiển thị danh sách người dùng với đầy đủ vai trò và trạng thái', async () => {
    renderWithRole('admin')

    expect(await screen.findByText('admin')).toBeInTheDocument()
    expect(screen.getByText('nhanvien1')).toBeInTheDocument()
    expect(screen.getByText('nhanvien2')).toBeInTheDocument()

    // Kiểm tra badge
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getAllByText('Nhân viên')).toHaveLength(2)
    expect(screen.getByText('Chờ đổi MK')).toBeInTheDocument()
    expect(screen.getAllByText('Hoạt động')).toHaveLength(2)
  })

  it('tìm kiếm người dùng lọc đúng theo từ khóa', async () => {
    renderWithRole('admin')

    expect(await screen.findByText('nhanvien1')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(/Tìm theo tên đăng nhập/i)
    fireEvent.change(searchInput, { target: { value: 'Trần Thị B' } })

    expect(screen.getByText('nhanvien2')).toBeInTheDocument()
    expect(screen.queryByText('nhanvien1')).not.toBeInTheDocument()
    expect(screen.queryByText('admin')).not.toBeInTheDocument()
  })

  it('admin: tài khoản admin không có nút xóa hay cấp lại (P9-T4), tài khoản staff có đủ nút', async () => {
    renderWithRole('admin', 'admin-id')

    expect(await screen.findByText('admin')).toBeInTheDocument()

    // Tài khoản admin hiển thị "Admin hệ thống"
    expect(screen.getByText('Admin hệ thống')).toBeInTheDocument()
    expect(screen.queryByTestId('delete-user-btn-admin')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reset-pw-btn-admin')).not.toBeInTheDocument()

    // Tài khoản staff có nút cấp lại, đặt mk, xóa
    expect(screen.getByTestId('reset-pw-btn-nhanvien1')).toBeInTheDocument()
    expect(screen.getByTestId('set-pw-btn-nhanvien1')).toBeInTheDocument()
    expect(screen.getByTestId('delete-user-btn-nhanvien1')).toBeInTheDocument()
  })

  it('staff: không nhìn thấy bất kỳ nút cấp lại / đặt MK / xóa nào của người khác', async () => {
    renderWithRole('staff', 'staff-1-id')

    expect(await screen.findByText('nhanvien1')).toBeInTheDocument()

    expect(screen.queryByTestId('delete-user-btn-nhanvien2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reset-pw-btn-nhanvien2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('set-pw-btn-nhanvien2')).not.toBeInTheDocument()

    // Nút "+ Thêm user" vẫn hiển thị cho staff (§4.1)
    expect(screen.getByTestId('add-user-btn')).toBeInTheDocument()
  })

  it('admin thêm user mới thành công và hiển thị modal mật khẩu tạm thời', async () => {
    const { api } = renderWithRole('admin')

    expect(await screen.findByText('admin')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('add-user-btn'))

    // Modal mở ra
    expect(screen.getByText('Thêm tài khoản người dùng')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('create-user-username'), { target: { value: 'nhanvienmoi' } })
    fireEvent.change(screen.getByTestId('create-user-display-name'), { target: { value: 'Mới' } })
    fireEvent.change(screen.getByTestId('create-user-password'), { target: { value: 'password123' } })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))

    await waitFor(() => {
      expect(api.createUser).toHaveBeenCalledWith({
        username: 'nhanvienmoi',
        displayName: 'Mới',
        password: 'password123',
        role: 'staff',
      })
    })

    // Hiện modal mật khẩu tạm thời
    expect(await screen.findByTestId('temp-password-display')).toHaveTextContent('temp_pass_123')

    // Bấm sao chép
    fireEvent.click(screen.getByRole('button', { name: /Sao chép/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('temp_pass_123')
  })

  it('admin cấp lại mật khẩu cho staff mở modal hiển thị mật khẩu tạm thời mới', async () => {
    const { api } = renderWithRole('admin')

    expect(await screen.findByTestId('reset-pw-btn-nhanvien1')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('reset-pw-btn-nhanvien1'))

    await waitFor(() => {
      expect(api.resetPassword).toHaveBeenCalledWith('staff-1-id')
    })

    expect(await screen.findByTestId('temp-password-display')).toHaveTextContent('reset_temp_pass')
  })

  it('admin đặt mật khẩu cụ thể cho staff thành công', async () => {
    const { api } = renderWithRole('admin')

    expect(await screen.findByTestId('set-pw-btn-nhanvien1')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('set-pw-btn-nhanvien1'))

    expect(await screen.findByText(/Đặt mật khẩu cho @nhanvien1/i)).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('set-new-password-input'), { target: { value: 'matkhau123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu' }))

    await waitFor(() => {
      expect(api.setPassword).toHaveBeenCalledWith('staff-1-id', 'matkhau123')
    })
  })

  it('admin xóa staff có hộp thoại xác nhận ConfirmDialog', async () => {
    const { api } = renderWithRole('admin')

    expect(await screen.findByTestId('delete-user-btn-nhanvien1')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('delete-user-btn-nhanvien1'))

    // Mở ConfirmDialog
    expect(await screen.findByText(/Bạn có chắc chắn muốn xóa tài khoản @nhanvien1/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Xóa vĩnh viễn' }))

    await waitFor(() => {
      expect(api.deleteUser).toHaveBeenCalledWith('staff-1-id')
    })
  })

  it('xử lý lỗi khi tải danh sách người dùng và nút Thử lại hoạt động', async () => {
    const fetchUsers = vi
      .fn()
      .mockRejectedValueOnce(new Error('Lỗi kết nối máy chủ'))
      .mockResolvedValueOnce(MOCK_USERS)

    renderWithRole('admin', 'admin-id', { fetchUsers })

    expect(await screen.findByText('Lỗi kết nối máy chủ')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByText('admin')).toBeInTheDocument()
    expect(fetchUsers).toHaveBeenCalledTimes(2)
  })
})
