// Logic thuần của trang Quản lý bill — P7-T1 (design §7.4: bảng mã, thời gian,
// người tạo, tổng, số món; phân trang + lọc ngày + tìm theo mã). Không đụng
// mạng: phần truy vấn nằm ở api.ts, phần hiển thị ở BillsPage.tsx.

/** Số dòng mỗi trang — vừa khít mobile, tránh kéo bill_items quá lớn. */
export const PAGE_SIZE = 20

/**
 * Signed URL sống 2 phút — "ngắn hạn" theo security/skill §Storage; đủ thời
 * gian tải <img> + chia sẻ/tải về, không để link đọc ảnh bill dùng mãi được.
 */
export const SIGNED_URL_TTL_SECONDS = 120

export type BillListParams = {
  /** Chỉ số trang bắt đầu từ 0. */
  page: number
  /** Từ khóa tìm theo mã bill (đã trim), chuỗi rỗng = không lọc. */
  code?: string
  /** 'YYYY-MM-DD' (giờ VN) — đầu ngày bắt đầu lọc. */
  from?: string
  /** 'YYYY-MM-DD' (giờ VN) — cuối ngày kết thúc lọc. */
  to?: string
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
}

export type BillPage = { rows: BillRow[]; total: number }

/** Ký tự đặc biệt của LIKE (%, _, \) — người dùng gõ "100%" không phải wildcard. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** 'YYYY-MM-DD' → mốc UTC tương ứng 00:00 giờ VN (+07:00). */
export function vnDayStartIso(date: string): string {
  return `${date}T00:00:00+07:00`
}

/** 'YYYY-MM-DD' → mốc UTC tương ứng 23:59:59.999 giờ VN (+07:00). */
export function vnDayEndIso(date: string): string {
  return `${date}T23:59:59.999+07:00`
}

/** Bộ lọc ngày hợp lệ? Trả về thông báo lỗi tiếng Việt hoặc null. */
export function validateDateRange(from: string, to: string): string | null {
  if (from && to && from > to) return 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'
  return null
}

/** Chuyển bộ lọc ngày UI (giờ VN) sang ISO UTC gửi cho PostgREST. */
export function dateFilterIso(from: string, to: string): { fromIso: string | null; toIso: string | null } {
  return {
    fromIso: from ? vnDayStartIso(from) : null,
    toIso: to ? vnDayEndIso(to) : null,
  }
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
