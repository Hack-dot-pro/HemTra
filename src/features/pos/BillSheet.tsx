// BillSheet — P6-T4 (pos-bill/skill.md §3, design §6.1): đúng 7 khối, đúng
// thứ tự, rộng 720px (khớp vùng xuất PNG ×2 ở T6). Render trên nền trắng chữ
// đen để chụp ảnh — KHÔNG dùng thẻ kính (đó là style app, không phải style bill).
// QR (khối 5) nhận data-URL từ T5; chưa có thì hiện ô chờ.

import { Fragment } from 'react'
import logoUrl from '../../assets/logo.png'
import { formatVnd, formatVndNumber } from '../../lib/format'

export const BILL_WIDTH_PX = 720
export const SHOP_PHONES = '0338525677 (Vi) - 0362335733 (Linh)'
export const BILL_GREETING = 'Cảm ơn khách hàng thân yêu của Hẻm'
export const BILL_ADDRESS = 'Phường Long Nguyên, Thành Phố Hồ Chí Minh'

export type BillSheetTopping = {
  key: string
  name: string
  unit_price: number
}

export type BillSheetItem = {
  key: string
  name: string
  qty: number
  unit_price: number
  /** Ghi chú món — dòng nhỏ nghiêng ngay dưới món (design §6.1.3). */
  note?: string
  /** Topping — dòng con thụt lề kèm giá (design §6.1.3). */
  toppings?: BillSheetTopping[]
}

export type BillSheetProps = {
  /** Mã bill: online HT-YYMMDD-0001 / offline HT-YYMMDD-OFF-xxxx (design §6.2). */
  code: string
  /** Thời gian tạo (ms epoch) — hiển thị dd/MM/yyyy HH:mm (giờ VN). */
  createdAt: number
  items: BillSheetItem[]
  total: number
  /** QR Facebook dạng data-URL (P6-T5); undefined → ô chờ. */
  qrDataUrl?: string
}

function formatCreatedAt(ms: number): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(ms))
}

export default function BillSheet({ code, createdAt, items, total, qrDataUrl }: BillSheetProps) {
  return (
    <div
      data-testid="bill-sheet"
      style={{
        width: BILL_WIDTH_PX,
        backgroundColor: '#ffffff',
        color: '#111111',
        fontFamily: 'Calibri, Carlito, sans-serif',
      }}
      className="mx-auto flex flex-col items-center px-10 py-8 text-center"
    >
      {/* 1 — Logo */}
      <img src={logoUrl} alt="Hẻm Trà" className="h-16 w-auto object-contain" />

      {/* 2 — Mã bill + SĐT + thời gian */}
      <p className="mt-4 text-lg font-bold">Mã đơn {code}</p>
      <p className="text-sm">Thời gian: {formatCreatedAt(createdAt)}</p>
      <p className="text-sm">{SHOP_PHONES}</p>

      {/* 3 — Bảng sản phẩm */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/40 text-left">
            <th className="py-1 pr-2 font-semibold">Sản phẩm</th>
            <th className="py-1 pr-2 text-center font-semibold">SL</th>
            <th className="py-1 pr-2 text-right font-semibold">Đơn giá</th>
            <th className="py-1 text-right font-semibold">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Fragment key={item.key}>
              <tr className="align-top">
                <td className="py-1 pr-2">
                  <span className="font-medium">{item.name}</span>
                  {item.note ? (
                    <span className="block text-xs italic text-black/70">{item.note}</span>
                  ) : null}
                </td>
                <td className="py-1 pr-2 text-center tabular-nums">{item.qty}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{formatVndNumber(item.unit_price)}</td>
                <td className="py-1 text-right tabular-nums">{formatVndNumber(item.unit_price * item.qty)}</td>
              </tr>
              {item.toppings?.map((topping) => (
                <tr key={topping.key}>
                  <td className="py-0.5 pl-5 pr-2 text-left">+ {topping.name}</td>
                  <td className="py-0.5 pr-2 text-center tabular-nums">{item.qty}</td>
                  <td className="py-0.5 pr-2 text-right tabular-nums">{formatVndNumber(topping.unit_price)}</td>
                  <td className="py-0.5 text-right tabular-nums">
                    {formatVndNumber(topping.unit_price * item.qty)}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>

      {/* 4 — Tổng tiền (in đậm) */}
      <div className="mt-2 flex w-full items-center justify-between border-t border-black/40 pt-2 text-base font-bold">
        <span>Tổng cộng</span>
        <span className="tabular-nums">{formatVnd(total)}</span>
      </div>

      {/* 5 — QR Facebook (P6-T5 điền data-URL) */}
      <div className="mt-4 flex flex-col items-center gap-1">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR Facebook" className="h-28 w-28" />
        ) : (
          <div
            data-testid="bill-qr-placeholder"
            className="grid h-28 w-28 place-items-center border border-dashed border-black/30 text-xs text-black/50"
          >
            QR
          </div>
        )}
        <span className="text-xs">Facebook Hẻm Trà</span>
      </div>

      {/* 6 — Lời chúc */}
      <p className="mt-4 text-sm">{BILL_GREETING}</p>

      {/* 7 — Địa chỉ */}
      <p className="mt-1 text-sm">{BILL_ADDRESS}</p>
    </div>
  )
}
