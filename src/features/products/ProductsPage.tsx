// Trang Sản phẩm — P5 (design §7.3 menu 3 "Sản phẩm", §4.1 cả 2 role CRUD):
// quản lý nhóm / sản phẩm / topping; bật-tắt bán và xóa đều qua confirm
// (uiux skill); tìm kiếm + lọc nhóm (T4); validate zod ở modal (T5).
// Sau khi lưu, DB tự tăng menu_version (trigger P1) → Thanh toán đồng bộ tự động.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { SERVER_ERROR } from '../../lib/http'
import { formatVnd } from '../../lib/format'
import {
  defaultProductsApi,
  type CategoryRow,
  type ProductLists,
  type ProductRow,
  type ProductsApi,
  type SaveOutcome,
  type ToppingRow,
} from './api'
import { CategoryModal, ProductModal, ToppingModal } from './forms'
import { filterProducts, swapTargets, type CategoryValues, type ProductValues, type ToppingValues } from './logic'

export type ProductsPageProps = { api?: ProductsApi }

type Tab = 'products' | 'categories' | 'toppings'
type ModalState = { kind: 'category' | 'product' | 'topping'; row?: CategoryRow | ProductRow | ToppingRow }
type ConfirmState = {
  kind: 'category' | 'product' | 'topping'
  id: string
  action: 'hide' | 'delete'
  name: string
}
type Notice = { tone: 'ok' | 'error'; text: string }

const TABS: { key: Tab; label: string }[] = [
  { key: 'products', label: 'Sản phẩm' },
  { key: 'categories', label: 'Nhóm' },
  { key: 'toppings', label: 'Topping' },
]

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? 'rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200'
          : 'rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60'
      }
    >
      {active ? 'Đang bán' : 'Đã ẩn'}
    </span>
  )
}

function ToggleButton({ active, busy, label, onClick }: { active: boolean; busy?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`glass-btn flex items-center gap-1 !px-2 !py-1 text-xs ${active ? '' : 'opacity-70'}`}
      disabled={busy}
      onClick={onClick}
    >
      {active ? <Eye aria-hidden="true" className="h-3.5 w-3.5" /> : <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{active ? 'Đang bán' : 'Đã ẩn'}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  )
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="glass-btn grid h-8 w-8 place-items-center !p-0"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default function ProductsPage({ api = defaultProductsApi }: ProductsPageProps) {
  const [lists, setLists] = useState<ProductLists | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('products')
  const [query, setQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.load()
      setLists(data)
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : SERVER_ERROR)
    }
  }, [api])

  useEffect(() => {
    // load() chỉ set state sau await; hẹn qua microtask để rule
    // react-hooks/set-state-in-effect không thấy setState đồng bộ trong effect.
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  function flash(text: string, tone: Notice['tone'] = 'ok') {
    setNotice({ tone, text })
  }

  async function runOutcome(action: () => Promise<SaveOutcome>, successText: string): Promise<SaveOutcome> {
    const result = await action()
    if (result.ok) {
      flash(successText)
      await load()
    } else {
      flash(result.message, 'error')
    }
    return result
  }

  function askHide(kind: ConfirmState['kind'], row: { id: string; name: string; is_active: boolean }) {
    if (row.is_active) {
      setConfirm({ kind, id: row.id, action: 'hide', name: row.name })
      return
    }
    setBusyId(row.id)
    void runOutcome(() => api.setActive(kind, row.id, true), 'Đã bật bán trở lại.').finally(() => setBusyId(null))
  }

  async function applyConfirm() {
    if (!confirm) return
    setBusyId(confirm.id)
    const { kind, id, action } = confirm
    const result =
      action === 'hide'
        ? await api.setActive(kind, id, false)
        : kind === 'category'
          ? ({ ok: false, message: 'Không hỗ trợ xóa nhóm — chỉ ẩn/hiện.' } satisfies SaveOutcome)
          : await api.remove(kind, id)
    setBusyId(null)
    setConfirm(null)
    if (!result.ok) flash(result.message, 'error')
    else {
      flash(action === 'hide' ? 'Đã ẩn khỏi menu bán.' : 'Đã xóa.')
      await load()
    }
  }

  async function moveCategory(row: CategoryRow, dir: 'up' | 'down') {
    const sorted = [...lists!.categories].sort((a, b) => a.sort_order - b.sort_order)
    const targets = swapTargets(sorted, row.id, dir)
    if (!targets) return
    setBusyId(row.id)
    const first = await api.saveCategory({ ...targets.self, sort_order: targets.other.sort_order })
    if (!first.ok) {
      setBusyId(null)
      flash(first.message, 'error')
      return
    }
    const second = await api.saveCategory({ ...targets.other, sort_order: targets.self.sort_order })
    setBusyId(null)
    if (!second.ok) {
      flash(second.message, 'error')
      return
    }
    await load()
  }

  async function submitCategory(values: CategoryValues): Promise<SaveOutcome> {
    setSaving(true)
    const result = await api.saveCategory(values)
    setSaving(false)
    if (result.ok) {
      setModal(null)
      flash('Đã lưu nhóm.')
      await load()
    }
    return result
  }

  async function submitProduct(values: ProductValues): Promise<SaveOutcome> {
    setSaving(true)
    const result = await api.saveProduct(values)
    setSaving(false)
    if (result.ok) {
      setModal(null)
      flash('Đã lưu sản phẩm.')
      await load()
    }
    return result
  }

  async function submitTopping(values: ToppingValues): Promise<SaveOutcome> {
    setSaving(true)
    const result = await api.saveTopping(values)
    setSaving(false)
    if (result.ok) {
      setModal(null)
      flash('Đã lưu topping.')
      await load()
    }
    return result
  }

  const categories = lists?.categories ?? []
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—'
  const visibleProducts = filterProducts(lists.products, { query, categoryId: filterCategory })
  const initialToppingIds = (row?: ProductRow) =>
    row ? (lists?.links ?? []).filter((l) => l.product_id === row.id).map((l) => l.topping_id) : []

  if (!lists && loadError) {
    return (
      <section className="glass-card p-6">
        <h1 className="text-xl font-semibold">Sản phẩm</h1>
        <p role="alert" className="mt-3 text-sm text-red-300">
          {loadError}
        </p>
        <button type="button" className="glass-btn glass-btn-primary mt-4" onClick={() => void load()}>
          Thử lại
        </button>
      </section>
    )
  }

  if (!lists) {
    return (
      <section className="glass-card p-6">
        <h1 className="text-xl font-semibold">Sản phẩm</h1>
        <p role="status" className="mt-3 text-sm text-white/70">
          Đang tải danh sách…
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <header className="glass-card p-6">
        <h1 className="text-xl font-semibold">Sản phẩm</h1>
        <p className="mt-2 text-sm text-white/80">
          Quản lý nhóm, món và topping. Thay đổi tự đồng bộ sang màn Thanh toán (P6) sau khi lưu.
        </p>
        {loadError ? (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {loadError}
          </p>
        ) : null}
        {notice ? (
          <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${notice.tone === 'error' ? 'text-red-300' : 'text-emerald-200'}`}>
            {notice.text}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Khu vực quản lý">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              className={`glass-btn !py-1.5 text-sm ${tab === key ? 'glass-btn-primary' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'products' ? (
        <div id="panel-products" role="tabpanel" aria-labelledby="tab-products" className="glass-card p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label htmlFor="product-search" className="block text-sm">
              <span className="mb-1 block text-white/80">Tìm kiếm</span>
              <input
                id="product-search"
                className="glass-input"
                type="search"
                placeholder="Tên sản phẩm…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label htmlFor="product-filter" className="block text-sm">
              <span className="mb-1 block text-white/80">Nhóm</span>
              <select
                id="product-filter"
                className="glass-input"
                value={filterCategory}
                onChange={(event) => setFilterCategory(event.target.value)}
              >
                <option value="all">Tất cả nhóm</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon ? `${category.icon} ` : ''}
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="glass-btn glass-btn-primary ml-auto flex items-center gap-1"
              onClick={() => setModal({ kind: 'product' })}
            >
              <Plus aria-hidden="true" className="h-4 w-4" /> Thêm sản phẩm
            </button>
          </div>

          {categories.length === 0 ? (
            <p className="mb-3 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
              Chưa có nhóm nào — hãy thêm nhóm trước ở tab Nhóm.
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-white/60">
                <tr>
                  <th scope="col" className="py-2 pr-2">Icon</th>
                  <th scope="col" className="py-2 pr-2">Tên</th>
                  <th scope="col" className="py-2 pr-2">Nhóm</th>
                  <th scope="col" className="py-2 pr-2">Đơn giá</th>
                  <th scope="col" className="py-2 pr-2">Trạng thái</th>
                  <th scope="col" className="py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((product) => (
                  <tr key={product.id} className="border-t border-white/10">
                    <td className="py-2 pr-2 text-lg" aria-hidden="true">{product.icon || '—'}</td>
                    <td className="py-2 pr-2 font-medium">{product.name}</td>
                    <td className="py-2 pr-2 text-white/70">{categoryName(product.category_id)}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{formatVnd(product.price)}</td>
                    <td className="py-2 pr-2"><ActiveBadge active={product.is_active} /></td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        <ToggleButton
                          active={product.is_active}
                          busy={busyId === product.id}
                          label={product.is_active ? `Ẩn ${product.name}` : `Bật bán ${product.name}`}
                          onClick={() => askHide('product', product)}
                        />
                        <IconButton label={`Sửa ${product.name}`} onClick={() => setModal({ kind: 'product', row: product })}>
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label={`Xóa ${product.name}`}
                          disabled={busyId === product.id}
                          onClick={() => setConfirm({ kind: 'product', id: product.id, action: 'delete', name: product.name })}
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-white/60">
                      {lists.products.length === 0 ? 'Chưa có sản phẩm nào.' : 'Không tìm thấy sản phẩm khớp.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'categories' ? (
        <div id="panel-categories" role="tabpanel" aria-labelledby="tab-categories" className="glass-card p-4 sm:p-6">
          <div className="mb-4 flex justify-end">
            <button type="button" className="glass-btn glass-btn-primary flex items-center gap-1" onClick={() => setModal({ kind: 'category' })}>
              <Plus aria-hidden="true" className="h-4 w-4" /> Thêm nhóm
            </button>
          </div>
          <ol className="space-y-2">
            {[...categories]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((category, index, sorted) => (
                <li key={category.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
                  <span className="text-xl" aria-hidden="true">{category.icon || '—'}</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{category.name}</p>
                    <p className="text-xs text-white/50">Thứ tự {category.sort_order}</p>
                  </div>
                  <span className="ml-auto sm:ml-0">
                    <ActiveBadge active={category.is_active} />
                  </span>
                  <div className="flex gap-1">
                    <IconButton
                      label={`Lên ${category.name}`}
                      disabled={index === 0 || busyId === category.id}
                      onClick={() => void moveCategory(category, 'up')}
                    >
                      <ChevronUp aria-hidden="true" className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label={`Xuống ${category.name}`}
                      disabled={index === sorted.length - 1 || busyId === category.id}
                      onClick={() => void moveCategory(category, 'down')}
                    >
                      <ChevronDown aria-hidden="true" className="h-4 w-4" />
                    </IconButton>
                    <ToggleButton
                      active={category.is_active}
                      busy={busyId === category.id}
                      label={category.is_active ? `Ẩn ${category.name}` : `Bật ${category.name}`}
                      onClick={() => askHide('category', category)}
                    />
                    <IconButton label={`Sửa ${category.name}`} onClick={() => setModal({ kind: 'category', row: category })}>
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                    </IconButton>
                  </div>
                </li>
              ))}
            {categories.length === 0 ? (
              <li className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/60">Chưa có nhóm nào.</li>
            ) : null}
          </ol>
        </div>
      ) : null}

      {tab === 'toppings' ? (
        <div id="panel-toppings" role="tabpanel" aria-labelledby="tab-toppings" className="glass-card p-4 sm:p-6">
          <div className="mb-4 flex justify-end">
            <button type="button" className="glass-btn glass-btn-primary flex items-center gap-1" onClick={() => setModal({ kind: 'topping' })}>
              <Plus aria-hidden="true" className="h-4 w-4" /> Thêm topping
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {lists.toppings.map((topping) => (
              <div key={topping.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
                <span className="text-xl" aria-hidden="true">{topping.icon || '—'}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{topping.name}</p>
                  <p className="text-xs text-white/50">+{formatVnd(topping.price)}</p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <ActiveBadge active={topping.is_active} />
                  <ToggleButton
                    active={topping.is_active}
                    busy={busyId === topping.id}
                    label={topping.is_active ? `Ẩn ${topping.name}` : `Bật ${topping.name}`}
                    onClick={() => askHide('topping', topping)}
                  />
                  <IconButton label={`Sửa ${topping.name}`} onClick={() => setModal({ kind: 'topping', row: topping })}>
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={`Xóa ${topping.name}`}
                    disabled={busyId === topping.id}
                    onClick={() => setConfirm({ kind: 'topping', id: topping.id, action: 'delete', name: topping.name })}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            ))}
            {lists.toppings.length === 0 ? (
              <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/60 sm:col-span-2">
                Chưa có topping nào.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {modal?.kind === 'category' ? (
        <CategoryModal
          initial={modal.row as CategoryRow | undefined}
          categories={categories}
          saving={saving}
          onCancel={() => setModal(null)}
          onSubmit={submitCategory}
        />
      ) : null}

      {modal?.kind === 'product' ? (
        <ProductModal
          initial={modal.row as ProductRow | undefined}
          initialToppingIds={initialToppingIds(modal.row as ProductRow | undefined)}
          categories={categories}
          products={lists.products}
          toppings={lists.toppings}
          saving={saving}
          onCancel={() => setModal(null)}
          onSubmit={submitProduct}
        />
      ) : null}

      {modal?.kind === 'topping' ? (
        <ToppingModal
          initial={modal.row as ToppingRow | undefined}
          toppings={lists.toppings}
          saving={saving}
          onCancel={() => setModal(null)}
          onSubmit={submitTopping}
        />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.action === 'hide' ? 'Ẩn khỏi menu bán?' : 'Xóa vĩnh viễn?'}
          message={
            confirm.action === 'hide'
              ? `“${confirm.name}” sẽ không hiển thị ở Thanh toán. Bật lại được bất cứ lúc nào.`
              : `“${confirm.name}” sẽ bị xóa vĩnh viễn khỏi thực đơn. Hành động này không hoàn tác.`
          }
          confirmLabel={confirm.action === 'hide' ? 'Ẩn' : 'Xóa'}
          busy={busyId === confirm.id}
          onConfirm={() => void applyConfirm()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </section>
  )
}
