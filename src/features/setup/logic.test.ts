import { describe, expect, it } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  RESEND_COOLDOWN_MS,
  canResend,
  hasSetupError,
  normalizeUsername,
  resendCooldownSeconds,
  validateEmail,
  validateOtp,
  validatePassword,
  validateStepEmail,
  validateStepOtp,
  validateUsername,
} from './logic'

describe('validateEmail', () => {
  it('bắt buộc nhập email', () => {
    expect(validateEmail('')).toBe('Vui lòng nhập email.')
    expect(validateEmail('   ')).toBe('Vui lòng nhập email.')
  })

  it('chấp nhận email hợp lệ đã trim', () => {
    expect(validateEmail('  admin@gmail.com  ')).toBeUndefined()
  })

  it('từ chối email thiếu @ hoặc tên miền', () => {
    expect(validateEmail('abc')).toBe('Email không hợp lệ.')
    expect(validateEmail('a@b')).toBe('Email không hợp lệ.')
    expect(validateEmail('a b@c.com')).toBe('Email không hợp lệ.')
  })
})

describe('validateOtp', () => {
  it('bắt buộc nhập mã', () => {
    expect(validateOtp('')).toBe('Vui lòng nhập mã OTP.')
  })

  it('chỉ nhận đúng 6 chữ số', () => {
    expect(validateOtp('12345')).toBe('Mã OTP gồm 6 chữ số.')
    expect(validateOtp('1234567')).toBe('Mã OTP gồm 6 chữ số.')
    expect(validateOtp('12345a')).toBe('Mã OTP gồm 6 chữ số.')
    expect(validateOtp('123456')).toBeUndefined()
  })
})

describe('validateUsername + normalizeUsername', () => {
  it('chuẩn hóa: trim + lowercase như EF', () => {
    expect(normalizeUsername('  Admin01 ')).toBe('admin01')
  })

  it('bắt buộc nhập tài khoản', () => {
    expect(validateUsername('')).toBe('Vui lòng nhập tài khoản.')
  })

  it('chấp nhận 2–30 ký tự hợp lệ (kể cả gõ hoa)', () => {
    expect(validateUsername('ab')).toBeUndefined()
    expect(validateUsername('Admin_01.x-y')).toBeUndefined()
    expect(validateUsername('a'.repeat(30))).toBeUndefined()
  })

  it('từ chối quá ngắn, quá dài hoặc ký tự lạ', () => {
    expect(validateUsername('a')).toMatch(/2–30/)
    expect(validateUsername('a'.repeat(31))).toMatch(/2–30/)
    expect(validateUsername('ten việt nam')).toMatch(/2–30/)
    expect(validateUsername('a@b')).toMatch(/2–30/)
  })
})

describe('validatePassword', () => {
  it('bắt buộc và tối thiểu độ dài quy định', () => {
    expect(validatePassword('')).toBe('Vui lòng nhập mật khẩu.')
    expect(validatePassword('1'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(
      `Mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`,
    )
    expect(validatePassword('1'.repeat(MIN_PASSWORD_LENGTH))).toBeUndefined()
  })
})

describe('validateStepEmail / validateStepOtp / hasSetupError', () => {
  it('step email trả lỗi theo trường', () => {
    expect(validateStepEmail({ email: '' })).toEqual({ email: 'Vui lòng nhập email.' })
    expect(validateStepEmail({ email: 'a@b.co' })).toEqual({})
  })

  it('step OTP gom toàn bộ lỗi của 3 trường', () => {
    const errors = validateStepOtp({ otp: '12', username: 'a', password: '' })
    expect(errors).toEqual({
      otp: 'Mã OTP gồm 6 chữ số.',
      username: 'Tài khoản 2–30 ký tự: chữ thường, số, dấu chấm, gạch, gạch dưới.',
      password: 'Vui lòng nhập mật khẩu.',
    })
  })

  it('hasSetupError nhận cả lỗi form', () => {
    expect(hasSetupError({})).toBe(false)
    expect(hasSetupError({ form: 'x' })).toBe(true)
    expect(hasSetupError({ otp: 'x' })).toBe(true)
  })
})

describe('cooldown gửi lại OTP', () => {
  it('chưa từng gửi → không được gửi', () => {
    expect(canResend(null, 1000)).toBe(false)
    expect(resendCooldownSeconds(null, 1000)).toBe(0)
  })

  it('trong 60s → chặn và đếm ngược', () => {
    const sentAt = 1_000_000
    expect(canResend(sentAt, sentAt + 30_000)).toBe(false)
    expect(resendCooldownSeconds(sentAt, sentAt + 30_000)).toBe(30)
    expect(resendCooldownSeconds(sentAt, sentAt + 59_500)).toBe(1)
  })

  it('đủ 60s → được gửi lại', () => {
    const sentAt = 1_000_000
    expect(canResend(sentAt, sentAt + RESEND_COOLDOWN_MS)).toBe(true)
    expect(resendCooldownSeconds(sentAt, sentAt + RESEND_COOLDOWN_MS)).toBe(0)
  })
})
