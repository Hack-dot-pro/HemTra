// Luồng thanh toán — P6-T7 (pos-bill/skill.md §5, backend/skill.md §4,
// pwa-offline/skill.md §4, design §6.2/§8.3-8.4):
// - Online: RPC create_bill (idempotent theo client_uuid, so menu_version),
//   server tính lại giá — KHÔNG tin giá client.
// - Offline: mã OFF client-sinh + outbox (png giữ trong IndexedDB), sync khi có mạng.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OutboxItem, OutboxPayload } from '../../lib/db'
import { enqueueBill, newClientUuid } from '../../lib/outbox'
import { billTotal, type BillState } from './logic'
import type { MenuSnapshot } from '../../lib/menuTypes'
import type { BillSheetItem, BillSheetProps } from './BillSheet'

/** Khớp regex server: ^HT-[0-9]{6}-OFF-[A-Za-z0-9]{4}$ (create_bill RPC). */
export const OFFLINE_CODE_PATTERN = /^HT-[0-9]{6}-OFF-[A-Za-z0-9]{4}$/

export class MenuVersionChangedError extends Error {
  constructor() {
    super('menu_version_changed')
  }
}

export class CheckoutRateLimitedError extends Error {
  constructor() {
    super('rate_limited')
  }
}

/** BillState → items của RPC create_bill (P4 OutboxItem). Topping qty = số ly. */
export function buildRpcItems(bill: BillState): OutboxItem[] {
  return bill.lines.map((line) => ({
    product_id: line.product_id,
    qty: line.qty,
    ...(line.note ? { note: line.note } : {}),
    name: line.name,
    unit_price: line.unit_price,
    ...(line.toppings.length > 0
      ? {
          toppings: line.toppings.map((topping) => ({
            topping_id: topping.topping_id,
            qty: line.qty,
            name: topping.name,
            unit_price: topping.unit_price,
          })),
        }
      : {}),
  }))
}

/** Mã bill khi offline — client sinh, 4 ký tự [A-Za-z0-9] ngẫu nhiên (crypto). */
export function makeOfflineCode(now: Date = new Date()): string {
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const raw = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)
  const rand = raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).padEnd(4, '0')
  return `HT-${yy}${mm}${dd}-OFF-${rand}`
}

/**
 * Tên dòng giỏ LỆCH so với menu hiện tại (giá đổi / ngừng bán) — chặn thanh
 * toán online khi giỏ dùng giá cũ (QC-013: bill in Σ dòng ≠ tổng server).
 * Menu cache chỉ chứa SP/đang bật bán → thiếu = ngừng bán.
 */
export function findPriceDriftLines(bill: BillState, menu: MenuSnapshot): string[] {
  const drifted = new Set<string>()
  for (const line of bill.lines) {
    const product = menu.products.find((p) => p.id === line.product_id)
    if (!product || product.price !== line.unit_price) {
      drifted.add(line.name)
      continue
    }
    for (const topping of line.toppings) {
      const menuTopping = menu.toppings.find((t) => t.id === topping.topping_id)
      if (!menuTopping || menuTopping.price !== topping.unit_price) {
        drifted.add(`${line.name} + ${topping.name}`)
      }
    }
  }
  return [...drifted]
}

export type CheckoutOnlineResult = {
  kind: 'online'
  code: string
  /** client_uuid đã gửi — dùng để upload PNG đúng bill. */
  client_uuid: string
  total: number
  price_drift: boolean
  duplicate: boolean
}

export type CheckoutOfflineResult = {
  kind: 'offline'
  offline_code: string
  client_uuid: string
}

/** Online: gọi RPC create_bill. Lệch menu_version → ném MenuVersionChangedError. */
export async function createBillOnline(args: {
  client: SupabaseClient
  bill: BillState
  menuVersion: number
}): Promise<CheckoutOnlineResult> {
  const client_uuid = newClientUuid()
  const { data, error } = await args.client.rpc('create_bill', {
    p_client_uuid: client_uuid,
    p_items: buildRpcItems(args.bill),
    p_menu_version: args.menuVersion,
    p_is_offline: false,
    p_offline_code: null,
    p_phone_note: args.bill.phone_note,
    p_created_at: null,
  })
  if (error || !data) {
    const message = error?.message ?? 'create_bill_failed'
    if (message.includes('menu_version_changed')) throw new MenuVersionChangedError()
    if (message.includes('rate_limited')) throw new CheckoutRateLimitedError()
    throw new Error(message)
  }
  const result = data as {
    code: string
    total: number
    price_drift?: boolean
    duplicate?: boolean
  }
  return {
    kind: 'online',
    code: result.code,
    client_uuid,
    total: result.total,
    price_drift: Boolean(result.price_drift),
    duplicate: Boolean(result.duplicate),
  }
}

/** Offline: xếp bill + PNG vào IndexedDB (chờ sync khi có mạng, idempotent). */
export async function enqueueOfflineBill(args: {
  bill: BillState
  menuVersion: number
  /** PNG bill dạng data URL (P6-T9: WebKit không nhận blob canvas). */
  png: string | null
  /** Mã OFF đã sinh trước đó (cần cho sheet in bill) — bỏ trống sẽ sinh mới. */
  offlineCode?: string
  now?: Date
}): Promise<CheckoutOfflineResult> {
  const now = args.now ?? new Date()
  const offline_code = args.offlineCode ?? makeOfflineCode(now)
  const client_uuid = newClientUuid()
  const payload: OutboxPayload = {
    items: buildRpcItems(args.bill),
    phone_note: args.bill.phone_note,
    is_offline: true,
    offline_code,
    created_at: now.toISOString(),
    menu_version: args.menuVersion,
  }
  await enqueueBill({
    client_uuid,
    payload,
    png: args.png,
    code: null,
    status: 'pending',
    attempts: 0,
    last_error: null,
    price_drift: false,
    created_at: now.getTime(),
    synced_at: null,
  })
  return { kind: 'offline', offline_code, client_uuid }
}

/** BillState → dữ liệu BillSheet (P6-T4) — topping dòng con theo qty dòng cha. */
export function toSheetItems(bill: BillState): BillSheetItem[] {
  return bill.lines.map((line) => ({
    key: line.line_id,
    name: line.name,
    qty: line.qty,
    unit_price: line.unit_price,
    ...(line.note ? { note: line.note } : {}),
    ...(line.toppings.length > 0
      ? {
          toppings: line.toppings.map((topping) => ({
            key: topping.topping_id,
            name: topping.name,
            unit_price: topping.unit_price,
          })),
        }
      : {}),
  }))
}

/** Tổng tiền sheet: online đã chốt server, offline theo snapshot. */
export function sheetTotal(bill: BillState, online: CheckoutOnlineResult | null): number {
  return online ? online.total : billTotal(bill)
}

export type BillSheetData = Omit<BillSheetProps, 'qrDataUrl'> & { qrDataUrl?: string }
