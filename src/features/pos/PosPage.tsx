// Màn Thanh toán (POS) — P6-T2/T3 (pos-bill/skill.md §2, design §7.3):
// lưới SP theo nhóm (bấm "+") bên trái + panel bill realtime bên phải
// (tăng/giảm, ghi chú món, topping dòng con, tổng tức thì).
// Nguồn data: menu cache IndexedDB qua useMenuSnapshot (design §8.2) — bán
// được cả khi offline; app_meta sync do AppLayout lo.

import { useMemo, useState } from 'react'
import { Minus, NotebookPen, Plus } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { formatVnd } from '../../lib/format'
import { useMenuSnapshot } from '../../lib/useMenu'
import type { MenuSnapshot } from '../../lib/menuTypes'
import {
  activeCategories,
  addProduct,
  billItemCount,
  billTotal,
  changeQty,
  createBill,
  lineTotal,
  productsOfCategory,
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

export default function PosPage() {
  const snapshot = useMenuSnapshot()
  const [bill, setBill] = useState(createBill)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [noteLineId, setNoteLineId] = useState<string | null>(null)
  const [toppingLineId, setToppingLineId] = useState<string | null>(null)

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

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section aria-label="Sản phẩm" className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Thanh toán</h1>
          {snapshot && snapshot.fetched_at > 0 ? (
            <span className="text-xs text-white/60">Menu v{snapshot.menu_version}</span>
          ) : null}
        </div>

        {snapshot === undefined ? (
          <p className="glass-card p-4 text-sm text-white/80">Đang tải menu…</p>
        ) : snapshot === null ? (
          <p className="glass-card p-4 text-sm text-white/80">
            Chưa có menu — kiểm tra kết nối rồi kéo lại ứng dụng.
          </p>
        ) : (
          <>
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

        <label className="mt-3 block text-xs text-white/70" htmlFor="bill-phone-note">
          SĐT / ghi chú đơn
        </label>
        <input
          id="bill-phone-note"
          className="glass-input mt-1 w-full !py-1.5 text-sm"
          value={bill.phone_note}
          maxLength={100}
          placeholder="VD: 0909 123 456 — giao trước 18h"
          onChange={(event) => setBill((prev) => setPhoneNote(prev, event.target.value))}
        />

        <div className="mt-3 flex items-center justify-between border-t border-white/20 pt-3">
          <span className="text-sm text-white/80">Tổng cộng</span>
          <span className="text-lg font-bold tabular-nums" data-testid="bill-total">
            {formatVnd(billTotal(bill))}
          </span>
        </div>
      </aside>

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
