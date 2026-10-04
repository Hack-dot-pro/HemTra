// Màn Thanh toán (POS) — P6-T2/T3 (pos-bill/skill.md §2, design §7.3):
// lưới SP theo nhóm (bấm "+") bên trái + panel bill realtime bên phải
// (tăng/giảm, ghi chú món, topping dòng con, tổng tức thì).
// Nguồn data: menu cache IndexedDB qua useMenuSnapshot (design §8.2) — bán
// được cả khi offline; app_meta sync do AppLayout lo.

import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Minus, NotebookPen, Plus } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { formatVnd } from '../../lib/format'
import { createBillUploader } from '../../lib/billUpload'
import { getSupabase } from '../../lib/supabase'
import { syncMenu } from '../../lib/menuSync'
import { useMenuSnapshot, useOnlineStatus, isMenuStale } from '../../lib/useMenu'
import { useOutboxSync } from '../../lib/useOutbox'
import { dataUrlToBlob } from '../../lib/outbox'
import type { MenuSnapshot } from '../../lib/menuTypes'
import BillSheet, { type BillSheetProps } from './BillSheet'
import { generateQrDataUrl, preloadQrLib } from './qr'
import {
  billNodeToPngDataUrl,
  downloadBlob,
  pngDataUrlSize,
  preloadBillPngLib,
  warmBillImage,
} from './exportBillPng'
import logoUrl from '../../assets/logo.webp'
import {
  CheckoutRateLimitedError,
  MenuVersionChangedError,
  createBillOnline,
  findPriceDriftLines,
  enqueueOfflineBill,
  makeOfflineCode,
  resolvePrintableBill,
  sheetTotal,
  toSheetItems,
} from './checkout'
import {
  activeCategories,
  addProduct,
  billItemCount,
  billTotal,
  changeQty,
  createBill,
  lineTotal,
  productsOfCategory,
  MAX_PHONE_NOTE_LENGTH,
  setNote,
  setPhoneNote,
  toggleTopping,
  toppingsForProduct,
} from './logic'

const EMPTY_MENU: MenuSnapshot = {
  id: 'menu',
  menu_version: 0,
  fetched_at: 0,
  categories: [],
  products: [],
  toppings: [],
  product_toppings: [],
}

type CheckoutMsg = { tone: 'ok' | 'warn' | 'error'; text: string }

export default function PosPage() {
  const snapshot = useMenuSnapshot()
  const online = useOnlineStatus()
  const syncOutbox = useOutboxSync()
  const [bill, setBill] = useState(createBill)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [noteLineId, setNoteLineId] = useState<string | null>(null)
  const [toppingLineId, setToppingLineId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [checkoutMsg, setCheckoutMsg] = useState<CheckoutMsg | null>(null)
  const [lastSale, setLastSale] = useState<{ code: string; png: string | null } | null>(null)
  /** P12-T8: modal preview ảnh bill 2K sau khi thanh toán. */
  const [previewOpen, setPreviewOpen] = useState(false)
  const [sheet, setSheet] = useState<BillSheetProps | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)

  // Nạp sẵn 2 chunk (qrcode + html-to-image) khi mở POS: bán offline lần đầu
  // không bị "Failed to fetch dynamically imported module" (P6-T9 e2e).
  useEffect(() => {
    void preloadQrLib()
    void preloadBillPngLib()
    void warmBillImage(logoUrl) // warm logo thành data-URL lúc còn online
  }, [])

  const menu = snapshot ?? EMPTY_MENU
  const categories = useMemo(() => activeCategories(menu), [menu])
  const selectedCategoryId = useMemo(() => {
    if (activeCategoryId && categories.some((c) => c.id === activeCategoryId)) return activeCategoryId
    return categories[0]?.id ?? null
  }, [activeCategoryId, categories])
  const products = useMemo(
    () => (selectedCategoryId ? productsOfCategory(menu, selectedCategoryId) : []),
    [menu, selectedCategoryId],
  )

  const toppingLine = bill.lines.find((l) => l.line_id === toppingLineId) ?? null
  const availableToppings = toppingLine ? toppingsForProduct(menu, toppingLine.product_id) : []

  function nextPaint(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  }

  /** Mount BillSheet vào DOM ẩn rồi chụp PNG (html-to-image cần node có layout). */
  async function renderBillPng(sheetData: BillSheetProps): Promise<string> {
    flushSync(() => {
      setSheet(sheetData)
    })
    await nextPaint()
    const node = hostRef.current
    if (!node) throw new Error('bill_host_missing')
    return billNodeToPngDataUrl(node)
  }

  async function handleCheckout(): Promise<void> {
    if (paying || bill.lines.length === 0) return
    const client = getSupabase()
    if (!client) {
      setCheckoutMsg({ tone: 'error', text: 'Chưa kết nối máy chủ — kiểm tra lại đăng nhập.' })
      return
    }
    setPaying(true)
    setCheckoutMsg(null)
    try {
      const qrDataUrl = await generateQrDataUrl().catch(() => undefined)
      const createdAt = Date.now()
      if (navigator.onLine) {
        // Chặn giỏ giá cũ (QC-013): menu bump khi đang mở POS → lưới giá mới
        // nhưng dòng bill giữ snapshot cũ → nếu gọi RPC, tổng server ≠ Σ dòng in.
        const drifted = findPriceDriftLines(bill, menu)
        if (drifted.length > 0) {
          setCheckoutMsg({
            tone: 'warn',
            text: `Giá vừa cập nhật: ${drifted.join(', ')} — kiểm tra lại giỏ rồi thanh toán.`,
          })
          return
        }
        const result = await createBillOnline({ client, bill, menuVersion: menu.menu_version })
        const serverMismatch = result.total !== billTotal(bill)
        // QC-017: tổng server lệch giỏ (menu cache cũ không bắt được) → tải menu +
        // định lại giá dòng rồi mới chụp PNG; không đồng nhất được thì KHÔNG in
        // (in ra Σ dòng ≠ Tổng cộng = sai tiền trên chứng từ — bill vẫn đã ghi nhận).
        const sheetBill = serverMismatch
          ? await resolvePrintableBill({ client, bill, serverTotal: result.total })
          : bill
        let png: string | null = null
        if (sheetBill) {
          try {
            png = await renderBillPng({
              code: result.code,
              createdAt,
              items: toSheetItems(sheetBill),
              total: sheetTotal(sheetBill, result),
              qrDataUrl,
            })
            await createBillUploader(client)({
              code: result.code,
              blob: dataUrlToBlob(png),
              createdAtIso: new Date(createdAt).toISOString(),
              clientUuid: result.client_uuid,
            })
          } catch {
            png = null // bill đã tạo — thiếu ảnh không được bán lại
          }
        }
        setLastSale({ code: result.code, png })
        if (png) setPreviewOpen(true)
        setCheckoutMsg({
          tone: result.price_drift || serverMismatch ? 'warn' : 'ok',
          text: result.price_drift
            ? `Đã tạo bill ${result.code} — giá tại quầy khác giá hiển thị (đã ghi nhận).`
            : serverMismatch
              ? sheetBill
                ? `Đã tạo bill ${result.code} — giá vừa đổi, ảnh in theo tổng server ${formatVnd(result.total)}.`
                : `Đã tạo bill ${result.code} — tổng server ${formatVnd(result.total)} khác giỏ: chưa xuất ảnh bill, kiểm tra giỏ rồi bán lại.`
              : `Đã tạo bill ${result.code}.`,
        })
        setBill(createBill())
      } else {
        const offline_code = makeOfflineCode()
        const png = await renderBillPng({
          code: offline_code,
          createdAt,
          items: toSheetItems(bill),
          total: sheetTotal(bill, null),
          qrDataUrl,
        })
        await enqueueOfflineBill({ bill, menuVersion: menu.menu_version, png, offlineCode: offline_code })
        setLastSale({ code: offline_code, png })
        if (png) setPreviewOpen(true)
        setCheckoutMsg({
          tone: 'ok',
          text: `Offline — bill ${offline_code} đã lưu, sẽ tự đồng bộ khi có mạng.`,
        })
        setBill(createBill())
        void syncOutbox()
      }
    } catch (error) {
      if (error instanceof MenuVersionChangedError) {
        await syncMenu({ client })
        setCheckoutMsg({
          tone: 'warn',
          text: 'Giá vừa cập nhật — kiểm tra lại giỏ rồi thanh toán.',
        })
      } else if (error instanceof CheckoutRateLimitedError) {
        setCheckoutMsg({ tone: 'error', text: 'Quá 10 bill trong 1 phút — thử lại sau.' })
      } else {
        setCheckoutMsg({
          tone: 'error',
          text: `Lỗi thanh toán: ${error instanceof Error ? error.message : 'không rõ'}`,
        })
      }
    } finally {
      setSheet(null)
      setPaying(false)
    }
  }

  /** Web Share API với file PNG (Zalo/Messenger) — P6-T8 (pos-bill/skill.md §5). */
  async function handleShare(): Promise<void> {
    const png = lastSale?.png
    if (!lastSale || !png) return
    const file = new File([dataUrlToBlob(png)], `${lastSale.code}.png`, { type: 'image/png' })
    if (typeof navigator.share !== 'function' || !navigator.canShare?.({ files: [file] })) {
      setCheckoutMsg({ tone: 'warn', text: 'Thiết bị không chia sẻ được ảnh — dùng Lưu về máy.' })
      return
    }
    try {
      await navigator.share({ files: [file], title: `Bill ${lastSale.code} — Hẻm Trà` })
    } catch (error) {
      // Người dùng đóng bảng chia sẻ → im lặng, không phải lỗi.
      if (!(error instanceof DOMException) || error.name !== 'AbortError') {
        setCheckoutMsg({
          tone: 'error',
          text: `Chia sẻ thất bại: ${error instanceof Error ? error.message : 'không rõ'}`,
        })
      }
    }
  }

  /** Fallback: tải PNG về máy (đã có trong T6). */
  function handleSave(): void {
    if (!lastSale?.png) return
    downloadBlob(dataUrlToBlob(lastSale.png), `${lastSale.code}.png`)
    setCheckoutMsg({ tone: 'ok', text: `Đã lưu ${lastSale.code}.png về máy.` })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section aria-label="Sản phẩm" className="min-w-0">
        {/* P12-T6: bỏ nhãn "Menu v{n}" — số version nội bộ, khách không cần biết. */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Thanh toán</h1>
        </div>

        {snapshot === undefined ? (
          <p className="glass-card p-4 text-sm text-white/80">Đang tải menu…</p>
        ) : snapshot === null ? (
          <p className="glass-card p-4 text-sm text-white/80">
            Chưa có menu — kiểm tra kết nối rồi kéo lại ứng dụng.
          </p>
        ) : (
          <>
            {!online ? (
              <p
                data-testid="offline-banner"
                className="glass-card mb-3 border-amber-300/40 p-3 text-sm text-amber-100"
              >
                Đang offline — giá cập nhật lúc{' '}
                {snapshot
                  ? new Date(snapshot.fetched_at).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </p>
            ) : null}
            {isMenuStale(snapshot) ? (
              <p
                data-testid="stale-menu-banner"
                className="glass-card mb-3 border-amber-300/40 p-3 text-sm text-amber-100"
              >
                Menu đã lưu quá 24h — vẫn bán được, nên kiểm tra kết nối để cập nhật.
              </p>
            ) : null}

            <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Lọc theo nhóm">
              {categories.map((category) => {
                const selected = category.id === selectedCategoryId
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActiveCategoryId(category.id)}
                    className={`glass-btn shrink-0 gap-1.5 !py-1.5 text-sm ${selected ? 'glass-btn-primary' : 'opacity-80'}`}
                  >
                    <span aria-hidden="true">{category.icon}</span> {category.name}
                  </button>
                )
              })}
            </div>

            {products.length === 0 ? (
              <p className="glass-card p-4 text-sm text-white/80">Nhóm này chưa có sản phẩm đang bán.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <li key={product.id} className="glass-card flex flex-col gap-2 p-3">
                    <span className="text-2xl" aria-hidden="true">
                      {product.icon || '🧋'}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{product.name}</span>
                    <span className="text-sm text-white/80">{formatVnd(product.price)}</span>
                    <button
                      type="button"
                      aria-label={`Thêm ${product.name}`}
                      onClick={() => setBill((prev) => addProduct(prev, product))}
                      className="glass-btn glass-btn-primary mt-1 flex items-center justify-center gap-1 !py-1.5 text-sm"
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" /> Thêm
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <aside aria-label="Hóa đơn" className="glass-card self-start p-4 lg:sticky lg:top-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Hóa đơn</h2>
          <span className="rounded-full border border-white/30 bg-white/15 px-2 py-0.5 text-xs" data-testid="bill-count">
            {billItemCount(bill)} món
          </span>
        </div>

        {bill.lines.length === 0 ? (
          <p className="text-sm text-white/70">Chưa có món nào — bấm + ở lưới sản phẩm.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {bill.lines.map((line) => (
              <li key={line.line_id} className="py-3 first:pt-0" data-testid="bill-line">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-sm font-medium">
                    <span aria-hidden="true" className="mr-1">
                      {line.icon}
                    </span>
                    {line.name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{formatVnd(lineTotal(line))}</span>
                </div>

                {line.note ? (
                  <p className="mt-0.5 text-xs italic text-white/70">{line.note}</p>
                ) : null}
                {noteLineId === line.line_id ? (
                  <input
                    autoFocus
                    aria-label={`Ghi chú cho ${line.name}`}
                    className="glass-input mt-1 w-full !py-1 text-xs"
                    value={line.note}
                    maxLength={100}
                    onChange={(event) =>
                      setBill((prev) => setNote(prev, line.line_id, event.target.value))
                    }
                    onBlur={() => setNoteLineId(null)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setNoteLineId(null)
                    }}
                  />
                ) : null}

                {line.toppings.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 pl-4 text-xs text-white/75">
                    {line.toppings.map((topping) => (
                      <li key={topping.topping_id} className="tabular-nums">
                        {`+ ${topping.name} ${formatVnd(topping.unit_price)}`}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Giảm ${line.name}`}
                    onClick={() => setBill((prev) => changeQty(prev, line.line_id, -1))}
                    className="glass-btn grid h-8 w-8 place-items-center !p-0"
                  >
                    <Minus aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <span className="min-w-7 text-center text-sm tabular-nums" aria-live="polite">
                    {line.qty}
                  </span>
                  <button
                    type="button"
                    aria-label={`Tăng ${line.name}`}
                    onClick={() => setBill((prev) => changeQty(prev, line.line_id, 1))}
                    className="glass-btn grid h-8 w-8 place-items-center !p-0"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Ghi chú ${line.name}`}
                    aria-pressed={noteLineId === line.line_id}
                    onClick={() => setNoteLineId((prev) => (prev === line.line_id ? null : line.line_id))}
                    className="glass-btn ml-auto grid h-8 w-8 place-items-center !p-0"
                  >
                    <NotebookPen aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Chọn topping cho ${line.name}`}
                    aria-pressed={toppingLineId === line.line_id}
                    onClick={() =>
                      setToppingLineId((prev) => (prev === line.line_id ? null : line.line_id))
                    }
                    className="glass-btn !px-2 !py-1 text-xs"
                  >
                    Topping
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* P12-T6: đổi nhãn "SĐT / ghi chú đơn" → "Ghi chú đơn", bỏ gợi ý mẫu. */}
        <label className="mt-3 block text-xs text-white/70" htmlFor="bill-phone-note">
          Ghi chú đơn
        </label>
        <input
          id="bill-phone-note"
          className="glass-input mt-1 w-full !py-1.5 text-sm"
          value={bill.phone_note}
          maxLength={MAX_PHONE_NOTE_LENGTH}
          onChange={(event) => setBill((prev) => setPhoneNote(prev, event.target.value))}
        />

        <div className="mt-3 flex items-center justify-between border-t border-white/20 pt-3">
          <span className="text-sm text-white/80">Tổng cộng</span>
          <span className="text-lg font-bold tabular-nums" data-testid="bill-total">
            {formatVnd(billTotal(bill))}
          </span>
        </div>

        <button
          type="button"
          data-testid="checkout-btn"
          disabled={paying || bill.lines.length === 0}
          onClick={() => void handleCheckout()}
          className="glass-btn glass-btn-primary mt-3 w-full !py-2.5 font-semibold"
        >
          {paying ? 'Đang xử lý…' : `Thanh toán ${formatVnd(billTotal(bill))}`}
        </button>

        {checkoutMsg ? (
          <p
            data-testid="checkout-msg"
            role={checkoutMsg.tone === 'error' ? 'alert' : 'status'}
            className={`glass-card mt-3 p-3 text-sm ${
              checkoutMsg.tone === 'error'
                ? 'border-red-300/40 text-red-100'
                : checkoutMsg.tone === 'warn'
                  ? 'border-amber-300/40 text-amber-100'
                  : 'border-emerald-300/40 text-emerald-100'
            }`}
          >
            {checkoutMsg.text}
          </p>
        ) : null}
        {lastSale ? (
          <div className="mt-2">
            <p className="text-xs text-white/60" data-testid="last-sale">
              Bill gần nhất: {lastSale.code}
            </p>
            {lastSale.png ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-testid="view-bill-btn"
                  onClick={() => setPreviewOpen(true)}
                  className="glass-btn flex-1 !py-1.5 text-sm"
                >
                  Xem bill
                </button>
                {typeof navigator.share === 'function' ? (
                  <button
                    type="button"
                    data-testid="share-btn"
                    onClick={() => void handleShare()}
                    className="glass-btn flex-1 !py-1.5 text-sm"
                  >
                    Chia sẻ
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid="save-btn"
                  onClick={handleSave}
                  className="glass-btn flex-1 !py-1.5 text-sm"
                >
                  Lưu về máy
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-amber-200/90">
                Ảnh bill chưa xuất được — bill vẫn đã ghi nhận.
              </p>
            )}
          </div>
        ) : null}
      </aside>

      <div
        ref={hostRef}
        aria-hidden="true"
        data-testid="bill-host"
        className="pointer-events-none fixed -left-[10000px] top-0"
      >
        {sheet ? <BillSheet {...sheet} /> : null}
      </div>

      {/* P12-T8 — preview ảnh bill ≥2048px (2K) + Chia sẻ / Lưu về máy */}
      {previewOpen && lastSale?.png ? (
        <Modal
          title={`Hóa đơn ${lastSale.code}`}
          wide
          onClose={() => setPreviewOpen(false)}
          footer={
            <>
              {typeof navigator.share === 'function' ? (
                <button
                  type="button"
                  data-testid="preview-share-btn"
                  onClick={() => void handleShare()}
                  className="glass-btn glass-btn-primary !py-2 text-sm"
                >
                  Chia sẻ
                </button>
              ) : null}
              <button
                type="button"
                data-testid="preview-save-btn"
                onClick={handleSave}
                className="glass-btn !py-2 text-sm"
              >
                Lưu về máy
              </button>
              <button
                type="button"
                data-testid="preview-close-btn"
                onClick={() => setPreviewOpen(false)}
                className="glass-btn !py-2 text-sm"
              >
                Đóng
              </button>
            </>
          }
        >
          <div
            data-testid="bill-preview"
            tabIndex={0}
            role="region"
            aria-label="Xem trước hóa đơn"
            className="max-h-[65vh] overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <img
              src={lastSale.png}
              alt={`Hóa đơn ${lastSale.code}`}
              data-testid="bill-preview-img"
              className="mx-auto h-auto w-full rounded bg-white"
            />
          </div>
          <p className="mt-2 text-center text-xs text-white/60" data-testid="bill-preview-size">
            Ảnh {(() => {
              const size = pngDataUrlSize(lastSale.png)
              return size && size.width > 0 ? `${size.width} × ${size.height}` : '≥ 2048'
            })()}px — đủ độ phân giải in/chia sẻ (2K)
          </p>
        </Modal>
      ) : null}

      {toppingLine ? (
        <Modal title={`Topping cho ${toppingLine.name}`} onClose={() => setToppingLineId(null)}>
          {availableToppings.length === 0 ? (
            <p className="text-sm text-white/80">Món này chưa có topping.</p>
          ) : (
            <ul className="space-y-2">
              {availableToppings.map((topping) => {
                const chosen = toppingLine.toppings.some((t) => t.topping_id === topping.id)
                return (
                  <li key={topping.id}>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      aria-label={`Topping ${topping.name}`}
                      onClick={() =>
                        setBill((prev) => toggleTopping(prev, toppingLine.line_id, topping))
                      }
                      className={`glass-btn flex w-full items-center justify-between gap-3 !py-2 text-sm ${chosen ? 'glass-btn-primary' : ''}`}
                    >
                      <span>
                        <span aria-hidden="true" className="mr-1.5">
                          {topping.icon}
                        </span>
                        {topping.name}
                      </span>
                      <span className="tabular-nums">+{formatVnd(topping.price)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Modal>
      ) : null}
    </div>
  )
}
