// Snapshot test khóa layout BillSheet — P6-T4 (pos-bill/skill.md §3:
// "Snapshot: BillSheet" — thứ tự 7 khối đúng design §6.1).

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import BillSheet, { BILL_ADDRESS, BILL_GREETING, BILL_WIDTH_PX, SHOP_PHONES } from './BillSheet'

const FIXED_TIME = new Date('2026-10-03T07:15:00.000Z').getTime() // 14:15 VN

function props() {
  return {
    code: 'HT-261003-0001',
    createdAt: FIXED_TIME,
    items: [
      {
        key: 'l1',
        name: 'Trà sữa đào',
        qty: 2,
        unit_price: 35000,
        note: 'ít đá',
        toppings: [{ key: 't1', name: 'Trân châu', unit_price: 5000 }],
      },
      { key: 'l2', name: 'Trà đào', qty: 1, unit_price: 30000 },
    ],
    total: (35000 + 5000) * 2 + 30000,
  }
}

afterEach(cleanup)

describe('P6-T4 + P12-T7 — BillSheet đúng thứ tự khối (design §6.1 mới)', () => {
  it('snapshot: layout khóa theo thứ tự logo → SĐT → mã/tg → địa chỉ → bảng → tổng → QR → lời chúc', () => {
    const { container } = render(<BillSheet {...props()} />)
    expect(container).toMatchSnapshot()
  })

  it('các khối hiển thị đúng nội dung, rộng 720px', () => {
    render(<BillSheet {...props()} />)
    const sheet = screen.getByTestId('bill-sheet')
    expect(sheet).toHaveStyle({ width: `${BILL_WIDTH_PX}px` })

    const text = sheet.textContent ?? ''
    // 1 logo (alt), 2 SĐT có emoji ☎️, 3 mã + thời gian
    expect(screen.getByAltText('Hẻm Trà')).toBeInTheDocument()
    expect(SHOP_PHONES.startsWith('☎️')).toBe(true)
    expect(text).toContain(SHOP_PHONES)
    expect(text).toContain('Mã đơn HT-261003-0001')
    expect(text).toContain('14:15 03/10/2026') // Intl vi-VN đặt giờ trước
    // 4 địa chỉ (nhãn + giá trị có "(Gần KCN Bàu bàng)")
    expect(text).toContain('Địa chỉ:')
    expect(BILL_ADDRESS).toContain('(Gần KCN Bàu bàng)')
    expect(text).toContain(BILL_ADDRESS)
    // bảng: đúng tên món, ghi chú nghiêng, dòng con topping thụt lề
    expect(text).toContain('Trà sữa đào')
    expect(text).toContain('ít đá')
    expect(text).toContain('+ Trân châu')
    // tổng in đậm (tính đúng: (35000+5000)×2 + 30000 = 110.000)
    expect(screen.getByText('Tổng cộng')).toBeInTheDocument()
    expect(sheet).toHaveTextContent('110.000 ₫')
    // QR (placeholder khi chưa có T5), lời chúc cuối hóa đơn
    expect(screen.getByTestId('bill-qr-placeholder')).toBeInTheDocument()
    expect(BILL_GREETING).toContain('💕')
    expect(text).toContain(BILL_GREETING)
  })

  it('thứ tự khối theo DOM (không đảo, P12-T7)', () => {
    const { container } = render(<BillSheet {...props()} />)
    const sheet = screen.getByTestId('bill-sheet')
    const kids = Array.from(sheet.children).map((el) => el.tagName)
    // img → SĐT → mã → giờ → "Địa chỉ:" → địa chỉ → table → tổng → qr → chúc
    expect(kids).toEqual(['IMG', 'P', 'P', 'P', 'P', 'P', 'TABLE', 'DIV', 'DIV', 'P'])
    expect(container.querySelectorAll('tr').length).toBeGreaterThan(0)
  })

  it('P12-T7: không còn lặp địa chỉ ở cuối — lời chúc là khối cuối cùng', () => {
    const { container } = render(<BillSheet {...props()} />)
    const sheet = screen.getByTestId('bill-sheet')
    const kids = Array.from(sheet.children)
    const last = kids[kids.length - 1]
    expect(last?.tagName).toBe('P')
    expect(last?.textContent).toBe(BILL_GREETING)
    // địa chỉ chỉ xuất hiện đúng 1 lần (không còn lặp ở cuối bill)
    const addressLines = Array.from(container.querySelectorAll('p')).filter(
      (p) => p.textContent === BILL_ADDRESS,
    )
    expect(addressLines).toHaveLength(1)
  })

  it('QR có data-URL (T5) → hiện img thay ô chờ', () => {
    render(<BillSheet {...props()} qrDataUrl="data:image/png;base64,AAAA" />)
    expect(screen.getByAltText('QR Facebook')).toHaveAttribute('src', 'data:image/png;base64,AAAA')
    expect(screen.queryByTestId('bill-qr-placeholder')).not.toBeInTheDocument()
  })

  it('bảng tính đúng: thành tiền dòng = đơn giá × SL; tổng = Σ (giá + topping) × SL', () => {
    render(<BillSheet {...props()} />)
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row').slice(1) // bỏ thead
    expect(rows).toHaveLength(3) // món 1 + topping + món 2
    // dòng topping: 5000 × 2 = 10.000
    expect(rows[1]).toHaveTextContent('+ Trân châu')
    expect(rows[1]).toHaveTextContent('10.000')
    // tổng cột: 70.000 (món) + 10.000 (topping) + 30.000 = 110.000 = prop total
    expect(screen.getByTestId('bill-sheet')).toHaveTextContent('110.000 ₫')
  })
})
