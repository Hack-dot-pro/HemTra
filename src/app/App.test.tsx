import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App.tsx'

afterEach(cleanup)

describe('App', () => {
  it('mở ứng dụng ở màn hình đăng nhập', () => {
    render(<App />)
    expect(screen.getByRole('img', { name: 'Hẻm Trà' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /đăng nhập/i })).toBeInTheDocument()
  })

  it('hiện layout với đủ 5 menu khi vào /dashboard', () => {
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(10)
    for (const label of ['Sản phẩm', 'Thanh toán', 'Quản lý bill', 'Quản lý user']) {
      expect(screen.getAllByRole('link', { name: label })).toHaveLength(2)
    }
  })

  it('chuyển về trang đăng nhập khi vào đường dẫn lạ', () => {
    window.history.pushState({}, '', '/khong-ton-tai')
    render(<App />)
    expect(screen.getByRole('img', { name: 'Hẻm Trà' })).toBeInTheDocument()
  })
})
