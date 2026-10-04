import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProfileModal from './ProfileModal'
import { applyProfileChanges, requestProfileOtp, type MyProfile } from './api'

vi.mock('./api', () => ({
  requestProfileOtp: vi.fn(async () => {}),
  applyProfileChanges: vi.fn(async () => ({
    profile: { username: 'hemtra', display_name: 'Hẻm Trà Mới', avatar_path: '' },
    message: 'Đã cập nhật hồ sơ',
  })),
  avatarImageUrl: vi.fn(async () => 'https://cdn.test/avatar.png'),
}))

const ADMIN: MyProfile = { username: 'hemtra', display_name: 'Hẻm Trà', avatar_path: '' }

afterEach(cleanup)

function otp(value: string): void {
  fireEvent.change(screen.getByTestId('profile-otp'), { target: { value } })
}

describe('ProfileModal — admin (P12-T9)', () => {
  it('điền sẵn tên hiển thị/tên đăng nhập hiện tại', () => {
    render(<ProfileModal initial={ADMIN} isAdmin onClose={vi.fn()} />)
    expect(screen.getByTestId('profile-display-name')).toHaveValue('Hẻm Trà')
    expect(screen.getByTestId('profile-username')).toHaveValue('hemtra')
  })

  it('chưa có thay đổi → nút Xác nhận bị khóa (không gửi request thừa)', () => {
    render(<ProfileModal initial={ADMIN} isAdmin onClose={vi.fn()} />)
    expect(screen.getByTestId('profile-submit-btn')).toBeDisabled()
  })

  it('đổi tên, thiếu OTP → bấm được nhưng báo lỗi và không gọi API; đủ OTP → gửi đúng token + field', async () => {
    const onUpdated = vi.fn()
    render(<ProfileModal initial={ADMIN} isAdmin onClose={vi.fn()} onUpdated={onUpdated} />)
    fireEvent.change(screen.getByTestId('profile-display-name'), {
      target: { value: 'Hẻm Trà Mới' },
    })
    fireEvent.click(screen.getByTestId('profile-submit-btn'))
    expect(screen.getByTestId('profile-error')).toHaveTextContent(/mã OTP 6 số/i)
    expect(applyProfileChanges).not.toHaveBeenCalled()

    otp('123456')
    fireEvent.click(screen.getByTestId('profile-submit-btn'))

    expect(await screen.findByTestId('profile-ok')).toHaveTextContent('Đã cập nhật hồ sơ')
    expect(applyProfileChanges).toHaveBeenCalledWith('123456', { display_name: 'Hẻm Trà Mới' })
    expect(onUpdated).toHaveBeenCalledWith({
      username: 'hemtra',
      display_name: 'Hẻm Trà Mới',
      avatar_path: '',
    })
  })

  it('OTP không đủ 6 số → không gọi API, báo lỗi', async () => {
    render(<ProfileModal initial={ADMIN} isAdmin onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('profile-display-name'), {
      target: { value: 'Tên mới' },
    })
    otp('12a')
    fireEvent.click(screen.getByTestId('profile-submit-btn'))
    expect(screen.getByTestId('profile-error')).toHaveTextContent(/mã OTP 6 số/i)
    expect(applyProfileChanges).not.toHaveBeenCalled()
  })

  it('bấm Gửi mã OTP → gọi EF request-otp và hiện trạng thái đã gửi', async () => {
    render(<ProfileModal initial={ADMIN} isAdmin onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('send-otp-btn'))
    expect(await screen.findByText(/đã gửi mã OTP tới email admin/i)).toBeInTheDocument()
    expect(requestProfileOtp).toHaveBeenCalledTimes(1)
  })
})

describe('ProfileModal — staff (P12-T9)', () => {
  it('KHÔNG thấy form sửa/OTP (admin sửa trong Quản lý user) + còn đường Đổi mật khẩu (§4.1)', () => {
    render(<ProfileModal initial={ADMIN} isAdmin={false} onClose={vi.fn()} />)
    expect(screen.queryByTestId('profile-display-name')).not.toBeInTheDocument()
    expect(screen.queryByTestId('profile-submit-btn')).not.toBeInTheDocument()
    expect(screen.getByTestId('staff-change-password')).toHaveAttribute('href', '/change-password')
    expect(screen.getByText(/nhờ admin chỉnh/i)).toBeInTheDocument()
  })
})
