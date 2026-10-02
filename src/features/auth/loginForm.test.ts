import { beforeEach, describe, expect, it } from 'vitest'
import {
  USERNAME_KEY,
  clearSavedUsername,
  getSavedUsername,
  hasFormError,
  saveUsername,
  validateLoginForm,
} from './loginForm'

describe('validateLoginForm', () => {
  it('chấp nhận tài khoản và mật khẩu đã điền', () => {
    expect(validateLoginForm({ username: 'linh', password: 'mat-khau' })).toEqual({})
  })

  it('báo lỗi khi để trống tài khoản', () => {
    expect(validateLoginForm({ username: '', password: 'x' })).toEqual({
      username: 'Vui lòng nhập tài khoản.',
    })
  })

  it('coi chuỗi toàn khoảng trắng là để trống', () => {
    expect(validateLoginForm({ username: '   ', password: 'x' }).username).toBe(
      'Vui lòng nhập tài khoản.',
    )
  })

  it('báo lỗi khi để trống mật khẩu', () => {
    expect(validateLoginForm({ username: 'linh', password: '' })).toEqual({
      password: 'Vui lòng nhập mật khẩu.',
    })
  })

  it('báo cả hai lỗi khi trống hết', () => {
    expect(Object.keys(validateLoginForm({ username: '', password: '' }))).toEqual([
      'username',
      'password',
    ])
  })
})

describe('hasFormError', () => {
  it('false khi không có lỗi nào', () => {
    expect(hasFormError({})).toBe(false)
  })

  it('true khi có lỗi field hoặc lỗi tổng', () => {
    expect(hasFormError({ password: 'x' })).toBe(true)
    expect(hasFormError({ form: 'x' })).toBe(true)
  })
})

describe('lưu tên tài khoản', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('ghi vào localStorage khi bật Ghi nhớ', () => {
    saveUsername('linh', true)
    expect(window.localStorage.getItem(USERNAME_KEY)).toBe('linh')
    expect(getSavedUsername()).toBe('linh')
  })

  it('chỉ ghi vào sessionStorage khi tắt Ghi nhớ', () => {
    saveUsername('linh', false)
    expect(window.localStorage.getItem(USERNAME_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(USERNAME_KEY)).toBe('linh')
    expect(getSavedUsername()).toBe('linh')
  })

  it('không bao giờ lưu mật khẩu — chỉ một khoá tên tài khoản', () => {
    saveUsername('linh', true)
    expect(window.localStorage.length).toBe(1)
    expect(window.localStorage.getItem(USERNAME_KEY)).not.toContain('mat-khau')
  })

  it('đọc được cả khi localStorage rỗng (mới chỉ nhớ trong phiên)', () => {
    saveUsername('toi', false)
    expect(window.localStorage.getItem(USERNAME_KEY)).toBeNull()
    expect(getSavedUsername()).toBe('toi')
  })

  it('xoá tên tài khoản khỏi cả hai nơi', () => {
    saveUsername('linh', true)
    saveUsername('toi', false)
    clearSavedUsername()
    expect(getSavedUsername()).toBeNull()
    expect(window.localStorage.getItem(USERNAME_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(USERNAME_KEY)).toBeNull()
  })
})
