// Logic thuần của trang Quản lý bill — P7-T1 (design §7.3 mục 4: bảng mã, thời gian,
// người tạo, tổng, số món, tự dọn; phân trang + tìm theo mã — P12-T10 bỏ lọc ngày)
// và P7-T4 (đếm ngày còn lại đến expires_at cho tag "tự xóa sau N ngày").
// Không đụng mạng: phần truy vấn nằm ở api.ts, phần hiển thị ở BillsPage.tsx.

/** Số dòng mỗi trang — vừa khít mobile, tránh kéo bill_items quá lớn. */
export const PAGE_SIZE = 20

/**
 * Signed URL sống 2 phút — "ngắn hạn" theo security/skill §Storage; đủ thời
 * gian tải <img> + chia sẻ/tải về, không để link đọc ảnh bill dùng mãi được.
 */
export const SIGNED_URL_TTL_SECONDS = 120

/**
 * P13-T8: Số ngày giữ bill trước khi job `cleanup-bills` tự xóa (giảm từ 15 ngày
 * xuống còn 7 ngày). Dùng cho tag "tự xóa sau N ngày".
 */
export const BILL_RETENTION_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export type BillListParams = {
  /** Chỉ số trang bắt đầu từ 0. */
  page: number
  /** Từ khóa tìm theo mã bill (đã trim), chuỗi rỗng = không lọc. */
  code?: string
}

export type BillRow = {
  id: string
  code: string
  total: number
  created_at: string
  /** Người tạo (bỏ trống nếu user đã bị xóa — created_by on delete set null). */
  username: string | null
  /** Số món = tổng số ly của dòng cha (topping không tính), đồng nhất với POS. */
  itemCount: number
  /** Đường dẫn PNG trong bucket `bills`; rỗng = bill chưa có ảnh (P7-T2). */
  imagePath: string
  /** `bills.expires_at` (ISO) — mốc job pg_cron tự xóa bill + ảnh (P7-T4). */
  expiresAt: string
}

export type BillPage = { rows: BillRow[]; total: number }

/** Ký tự đặc biệt của LIKE (%, _, \) — người dùng gõ "100%" không phải wildcard. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export type BillItemRow = {
  bill_id: string
  qty: number
  parent_item_id: string | null
}

/** Cộng số món theo từng bill — chỉ dòng cha (topping là dòng con, không tính). */
export function summarizeItemCounts(items: BillItemRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    if (item.parent_item_id) continue
    counts[item.bill_id] = (counts[item.bill_id] ?? 0) + item.qty
  }
  return counts
}

/** Số trang tối thiểu 1 để UI không hiện "0 trang". */
export function totalPages(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/** ISO → "14:05 03/10/2026" theo giờ quán (Asia/Ho_Chi_Minh). Chuỗi hỏng → "—". */
export function formatBillDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}

/** Tên file khi tải về / chia sẻ lại ảnh bill: <code>.png */
export function billImageFileName(code: string): string {
  return `${code}.png`
}

/**
 * Số ngày còn lại đến `expires_at` (làm tròn lên: bill bán lúc 14:05 thì sau
 * 15 ngày đúng lúc 14:05 mới hết hạn → vẫn còn 15 ngày). Quá hạn hoặc ngày
 * hỏng → 0 / null để UI không hiện số âm hay NaN.
 */
export function retentionDaysLeft(expiresAt: string, now: Date = new Date()): number | null {
  const expires = new Date(expiresAt).getTime()
  if (Number.isNaN(expires)) return null
  return Math.max(0, Math.ceil((expires - now.getTime()) / DAY_MS))
}

/** Tag "tự xóa sau N ngày" (design §7.3 mục 4) — hết hạn trong hôm nay hoặc thiếu dữ liệu → chuỗi riêng. */
export function retentionTagText(daysLeft: number | null): string {
  if (daysLeft === null) return '—'
  if (daysLeft <= 0) return 'Tự xóa hôm nay'
  return `Tự xóa sau ${daysLeft} ngày`
}

let cachedBillsPage: { rows: BillRow[]; total: number } | null = null

export function getCachedBillsPage(): { rows: BillRow[]; total: number } | null {
  return cachedBillsPage
}

export function setCachedBillsPage(val: { rows: BillRow[]; total: number } | null): void {
  cachedBillsPage = val
}

export function resetBillsPageCache(): void {
  cachedBillsPage = null
}
