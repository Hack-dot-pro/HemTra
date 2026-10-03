// Định dạng hiển thị — P4-T4 (banner) và P6 (bill/tổng tiền).
// Bất biến: tiền là số nguyên VND (AGENT.md §10), giờ nghiệp vụ Asia/Ho_Chi_Minh.

const VND_FORMATTER = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

/** 35000 → "35.000 ₫" */
export function formatVnd(value: number): string {
  return VND_FORMATTER.format(Math.round(value))
}

/** 35000 → "35.000" (bảng bill không muốn ký hiệu ₫ lặp) */
export function formatVndNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(value))
}

/** Mốc đồng bộ cache → "14:05" (HH:mm theo máy — banner "giá cập nhật lúc …"). */
export function formatClockTime(atMs: number, now: number = Date.now()): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(atMs || now))
}
