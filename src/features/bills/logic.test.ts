// Unit test logic thuần của trang Quản lý bill — P7-T1: escape ký tự LIKE, cộng
// số món, phân trang, định dạng thời gian. P12-T10: bỏ bộ lọc ngày (không còn
// dateFilterIso/validateDateRange). P7-T4: đếm ngày còn lại đến expires_at.

import { describe, expect, it } from 'vitest'
import {
  BILL_RETENTION_DAYS,
  PAGE_SIZE,
  SIGNED_URL_TTL_SECONDS,
  billImageFileName,
  escapeLike,
  formatBillDateTime,
  retentionDaysLeft,
  retentionTagText,
  summarizeItemCounts,
  totalPages,
} from './logic'

describe('escapeLike — người dùng gõ ký tự đặc biệt của LIKE', () => {
  it('escape % _ \\ để tìm "100%" là chuỗi thường', () => {
    expect(escapeLike('100%')).toBe('100\\%')
    expect(escapeLike('a_b')).toBe('a\\_b')
    expect(escapeLike('a\\b')).toBe('a\\\\b')
  })

  it('chuỗi thường giữ nguyên', () => {
    expect(escapeLike('HT-261003-0001')).toBe('HT-261003-0001')
  })
})

describe('summarizeItemCounts — số món của bảng bill', () => {
  it('cộng qty dòng cha, bỏ qua topping (parent_item_id khác null)', () => {
    const counts = summarizeItemCounts([
      { bill_id: 'b1', qty: 2, parent_item_id: null },
      { bill_id: 'b1', qty: 1, parent_item_id: 'item-1' },
      { bill_id: 'b2', qty: 3, parent_item_id: null },
    ])
    expect(counts).toEqual({ b1: 2, b2: 3 })
  })

  it('bill không có item nào → không xuất hiện trong map', () => {
    expect(summarizeItemCounts([])).toEqual({})
  })
})

describe('totalPages — phân trang', () => {
  it('0 bill vẫn là 1 trang (UI không hiện "0 trang")', () => {
    expect(totalPages(0)).toBe(1)
  })

  it('dính bờ trang: 20 dòng = 1 trang, 21 dòng = 2 trang', () => {
    expect(totalPages(PAGE_SIZE)).toBe(1)
    expect(totalPages(PAGE_SIZE + 1)).toBe(2)
    expect(totalPages(45, 20)).toBe(3)
  })
})

describe('formatBillDateTime — hiển thị giờ quán', () => {
  it('ISO UTC → giờ Asia/Ho_Chi_Minh, không lệch sang UTC', () => {
    // 17:00Z = 00:00 ngày hôm sau ở VN (+07:00)
    expect(formatBillDateTime('2026-10-02T17:00:00.000Z')).toContain('03/10/2026')
    expect(formatBillDateTime('2026-10-02T17:00:00.000Z')).toContain('00:00')
  })

  it('chuỗi ngày hỏng → "—" thay vì ném lỗi làm trắng màn hình', () => {
    expect(formatBillDateTime('')).toBe('—')
    expect(formatBillDateTime('2026-10-001T07:05:00.000Z')).toBe('—')
  })
})


describe('P7-T2 — signed URL và tên file ảnh bill', () => {
  it('signed URL sống 120 giây — "ngắn hạn", không dài bằng phiên 7 ngày', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBeGreaterThan(0)
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(300)
  })

  it('tên file tải/chia sẻ = <mã bill>.png', () => {
    expect(billImageFileName('HT-261003-0001')).toBe('HT-261003-0001.png')
    expect(billImageFileName('HT-261003-OFF-ab12')).toBe('HT-261003-OFF-ab12.png')
  })
})

describe('P7-T4 — tag "tự xóa sau N ngày" (bills.expires_at)', () => {
  const now = new Date('2026-10-03T07:05:00.000Z')

  it('thời hạn giữ bill = 7 ngày (P13-T8 nâng cấp từ 15 ngày)', () => {
    expect(BILL_RETENTION_DAYS).toBe(7)
  })

  it('bill mới bán → đúng 7 ngày (làm tròn lên, không phải 6)', () => {
    // expires_at = created_at + 7 ngày → còn tròn 7 ngày
    expect(retentionDaysLeft('2026-10-10T07:05:00.000Z', now)).toBe(7)
    // còn 7 ngày 1 phút → làm tròn lên 8 (qua hạn mới chắc chắn bị xóa)
    expect(retentionDaysLeft('2026-10-10T07:06:00.000Z', now)).toBe(8)
    // còn đúng 6 ngày
    expect(retentionDaysLeft('2026-10-09T07:05:00.000Z', now)).toBe(6)
  })

  it('đã quá hạn → 0 (không hiện số âm), hết hạn trong hôm nay → "Tự xóa hôm nay"', () => {
    expect(retentionDaysLeft('2026-10-03T07:00:00.000Z', now)).toBe(0)
    expect(retentionDaysLeft('2026-10-01T07:05:00.000Z', now)).toBe(0)
    expect(retentionTagText(0)).toBe('Tự xóa hôm nay')
  })

  it('ngày hỏng / thiếu cột → null → "—" (không hiện NaN)', () => {
    expect(retentionDaysLeft('', now)).toBeNull()
    expect(retentionDaysLeft('không-phải-ngày', now)).toBeNull()
    expect(retentionTagText(null)).toBe('—')
  })

  it('nội dung tag tiếng Việt đúng số ít', () => {
    expect(retentionTagText(15)).toBe('Tự xóa sau 15 ngày')
    expect(retentionTagText(1)).toBe('Tự xóa sau 1 ngày')
  })
})
