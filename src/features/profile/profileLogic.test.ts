import { describe, expect, it } from 'vitest'
import { avatarInitials, changedProfileFields, type ProfileForm } from './profileLogic'

function form(partial: Partial<ProfileForm>): ProfileForm {
  return { display_name: 'Hẻm Trà', username: 'hemtra', password: '', ...partial }
}

describe('changedProfileFields (P12-T9)', () => {
  const initial = { display_name: 'Hẻm Trà', username: 'hemtra' }

  it('không đổi gì → object rỗng (server không nhận field thừa)', () => {
    expect(changedProfileFields(initial, form({}))).toEqual({})
  })

  it('đổi tên hiển thị → chỉ có display_name', () => {
    expect(changedProfileFields(initial, form({ display_name: 'Hẻm Trà 2' }))).toEqual({
      display_name: 'Hẻm Trà 2',
    })
  })

  it('username được trim + lower-case trước khi gửi', () => {
    expect(changedProfileFields(initial, form({ username: '  HemTra.NEW ' }))).toEqual({
      username: 'hemtra.new',
    })
  })

  it('username trùng (đã lower) → không gửi', () => {
    expect(changedProfileFields(initial, form({ username: 'HEMTRA' }))).toEqual({})
  })

  it('điền mật khẩu mới → luôn gửi (kể cả khi tên không đổi)', () => {
    expect(changedProfileFields(initial, form({ password: 'matkhau1' }))).toEqual({
      password: 'matkhau1',
    })
  })

  it('tên hiển thị rỗng → không gửi (giữ giá trị cũ)', () => {
    expect(changedProfileFields(initial, form({ display_name: '   ' }))).toEqual({})
  })
})

describe('avatarInitials (P12-T9)', () => {
  it('nhiều từ → 2 chữ hoa đầu', () => {
    expect(avatarInitials('Nguyễn Văn A', 'nvana')).toBe('NV')
  })

  it('1 từ → 2 ký tự đầu hoa', () => {
    expect(avatarInitials('', 'hemtra')).toBe('HE')
  })

  it('cả 2 rỗng → "?" hoa', () => {
    expect(avatarInitials('', '')).toBe('?')
  })
})
