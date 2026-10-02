import { describe, expect, it } from 'vitest'
import { SIGN_IN_ERROR } from './loginForm'
import { signIn, wrongPassword } from './signIn'

// Bổ sung theo QC Q4/Q5 — signIn là stub nối tạm ở P2; P3-T4 thay bằng Edge
// Function auth-login. Test ghi lại hợp đồng hiện tại để không đổi ngầm.
describe('signIn (stub P2)', () => {
  it('trả về ok:true cho tài khoản hợp lệ khi backend chưa được nối', async () => {
    await expect(signIn('linh', 'mat-khau')).resolves.toEqual({ ok: true })
  })

  it('không ném lỗi với chuỗi rỗng (stub chưa validate đầu vào)', async () => {
    await expect(signIn('', '')).resolves.toEqual({ ok: true })
  })
})

describe('wrongPassword', () => {
  it('trả lỗi tiếng Việt chung chung, không lộ tài khoản nào sai', () => {
    expect(wrongPassword()).toEqual({ ok: false, message: SIGN_IN_ERROR })
    expect(wrongPassword().message).toBe('Tài khoản hoặc mật khẩu không đúng.')
  })
})
