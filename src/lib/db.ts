// IndexedDB (Dexie) — P4-T2, pwa-offline/skill.md §2.
// 2 bảng: menuCache (menu + menu_version + fetched_at) và outbox (bill chờ sync).
// SW KHÔNG cache API/menu (skill §1) — IndexedDB là nơi app tự quản lý cache đó.

import Dexie, { type Table } from 'dexie'
import type { MenuSnapshot } from './menuTypes'

export type OutboxTopping = {
  topping_id: string
  qty: number
  name?: string
  unit_price?: number
}

export type OutboxItem = {
  product_id: string
  qty: number
  note?: string
  name?: string
  unit_price?: number
  toppings?: OutboxTopping[]
}

// Khớp tham số RPC create_bill (trừ client_uuid — chính là khóa outbox).
export type OutboxPayload = {
  items: OutboxItem[]
  phone_note: string
  is_offline: boolean
  offline_code: string | null
  created_at: string | null
  menu_version: number | null
}

export type OutboxBill = {
  client_uuid: string
  payload: OutboxPayload
  /** PNG bill — data URL (giữ trong outbox tới khi sync, §8.4). Dạng string vì
   * WebKit IndexedDB không nhận blob từ canvas.toBlob (UnknownError — P6-T9). */
  png: string | null
  /** Mã đã gán khi sync (online lấy từ RPC, offline giữ mã OFF). */
  code: string | null
  status: 'pending' | 'synced'
  attempts: number
  last_error: string | null
  /** true = lệch giá khi sync nhưng GIỮ snapshot (đã giao khách, §8.4). */
  price_drift: boolean
  created_at: number
  synced_at: number | null
}

export class HemTraDB extends Dexie {
  menuCache!: Table<MenuSnapshot, string>
  outbox!: Table<OutboxBill, string>

  constructor(name = 'hemtra') {
    super(name)
    this.version(1).stores({
      menuCache: 'id',
      outbox: 'client_uuid, status, created_at',
    })
  }
}

let db: HemTraDB | null = null

// Lazy singleton: không mở IndexedDB khi module bị import trong test/jsdom.
export function getDb(): HemTraDB {
  if (!db) db = new HemTraDB()
  return db
}

/** Chỉ dùng trong test (giả lập môi trường không có IndexedDB). */
export function setDbForTest(instance: HemTraDB | null): void {
  db = instance
}
