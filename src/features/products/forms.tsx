// 3 modal form của trang Sản phẩm (P5-T1..T3): validate bằng logic zod thuần
// (T5) trước khi gọi ngược lên trang lưu; lỗi field tiếng Việt + aria-invalid
// theo uiux skill. Modal/Confirm dùng chung glass-card pattern (LoginStage).

import { useState, type FormEvent, type ReactNode } from 'react'
import Modal from '../../components/ui/Modal'
import { formatVnd } from '../../lib/format'
import type { CategoryRow, ProductRow, SaveOutcome, ToppingRow } from './api'
import {
  EMOJI_SUGGESTIONS,
  NAME_MAX,
  nextSortOrder,
  parseCategory,
  parseProduct,
  parseTopping,
  type CategoryValues,
  type ProductValues,
  type ToppingValues,
} from './logic'

function Field({ label, id, error, children }: { label: string; id: string; error?: string; children: ReactNode }) {
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block text-white/80">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-red-300">
          {error}
        </span>
      ) : null}
    </label>
  )
}

function EmojiField({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  error?: string
}) {
  return (
    <div className="text-sm">
      <label htmlFor={id} className="mb-1 block text-white/80">
        Emoji (tùy chọn)
      </label>
      <input
        id={id}
        className="glass-input"
        value={value}
        maxLength={16}
        placeholder="🧋"
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-red-300">
          {error}
        </span>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1">
        {EMOJI_SUGGESTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`Chọn emoji ${emoji}`}
            className="glass-btn !px-2 !py-1"
            onClick={() => onChange(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">
      {message}
    </p>
  )
}

function ModalFooter({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return (
    <>
      <button type="button" className="glass-btn" onClick={onCancel} disabled={saving}>
        Hủy
      </button>
      <button type="submit" className="glass-btn glass-btn-primary" disabled={saving}>
        {saving ? 'Đang lưu…' : label}
      </button>
    </>
  )
}

export type CategoryModalProps = {
  initial?: CategoryRow
  categories: CategoryRow[]
  saving: boolean
  onCancel: () => void
  onSubmit: (values: CategoryValues) => Promise<SaveOutcome>
}

export function CategoryModal({ initial, categories, saving, onCancel, onSubmit }: CategoryModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [sortRaw, setSortRaw] = useState(String(initial?.sort_order ?? nextSortOrder(categories)))
  const [isHidden, setIsHidden] = useState(initial ? !initial.is_active : false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseCategory(
      { name, icon, sort_order: Number(sortRaw), is_active: !isHidden, id: initial?.id },
      categories,
    )
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setFormError(null)
      return
    }
    setErrors({})
    setFormError(null)
    const result = await onSubmit({ ...parsed.data, id: initial?.id })
    if (!result.ok) setFormError(result.message)
  }

  return (
    <Modal title={initial ? 'Sửa nhóm' : 'Thêm nhóm'} onClose={onCancel}>
      <form onSubmit={handleSubmit} noValidate>
        <FormError message={formError} />
        <div className="space-y-4">
          <Field label="Tên nhóm" id="category-name" error={errors.name}>
            <input
              id="category-name"
              className="glass-input"
              value={name}
              maxLength={NAME_MAX}
              aria-invalid={errors.name ? true : undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <EmojiField id="category-icon" value={icon} onChange={setIcon} error={errors.icon} />
          <Field label="Thứ tự hiển thị" id="category-sort" error={errors.sort_order}>
            <input
              id="category-sort"
              className="glass-input"
              type="number"
              min={0}
              step={1}
              value={sortRaw}
              aria-invalid={errors.sort_order ? true : undefined}
              onChange={(event) => setSortRaw(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!isHidden} onChange={(event) => setIsHidden(!event.target.checked)} />
            Hiển thị trong menu bán
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <ModalFooter saving={saving} onCancel={onCancel} label="Lưu" />
        </div>
      </form>
    </Modal>
  )
}

export type ProductModalProps = {
  initial?: ProductRow
  initialToppingIds: string[]
  categories: CategoryRow[]
  /** Danh sách mọi sản phẩm (cả nhóm khác) để check trùng tên trong cùng nhóm. */
  products: ProductRow[]
  toppings: ToppingRow[]
  saving: boolean
  onCancel: () => void
  onSubmit: (values: ProductValues) => Promise<SaveOutcome>
}

export function ProductModal({
  initial,
  initialToppingIds,
  categories,
  products,
  toppings,
  saving,
  onCancel,
  onSubmit,
}: ProductModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [priceRaw, setPriceRaw] = useState(initial ? String(initial.price) : '')
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? (categories[0]?.id ?? ''))
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [toppingIds, setToppingIds] = useState<string[]>(initialToppingIds)
  const [isHidden, setIsHidden] = useState(initial ? !initial.is_active : false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const hasCategory = categories.length > 0

  function toggleTopping(id: string) {
    setToppingIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseProduct(
      {
        name,
        price: priceRaw === '' ? Number.NaN : Number(priceRaw),
        category_id: categoryId,
        icon,
        is_active: !isHidden,
        topping_ids: toppingIds,
        id: initial?.id,
      },
      products,
    )
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setFormError(null)
      return
    }
    setErrors({})
    setFormError(null)
    const result = await onSubmit({ ...parsed.data, id: initial?.id })
    if (!result.ok) setFormError(result.message)
  }

  return (
    <Modal title={initial ? 'Sửa sản phẩm' : 'Thêm sản phẩm'} onClose={onCancel}>
      <form onSubmit={handleSubmit} noValidate>
        <FormError message={formError} />
        <div className="space-y-4">
          <Field label="Tên sản phẩm" id="product-name" error={errors.name}>
            <input
              id="product-name"
              className="glass-input"
              value={name}
              maxLength={NAME_MAX}
              aria-invalid={errors.name ? true : undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nhóm" id="product-category" error={errors.category_id}>
              <select
                id="product-category"
                className="glass-input"
                value={categoryId}
                aria-invalid={errors.category_id ? true : undefined}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {!hasCategory ? <option value="">Chưa có nhóm</option> : null}
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon ? `${category.icon} ` : ''}
                    {category.name}
                    {category.is_active ? '' : ' (đã ẩn)'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Đơn giá (₫)" id="product-price" error={errors.price}>
              <input
                id="product-price"
                className="glass-input"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={priceRaw}
                aria-invalid={errors.price ? true : undefined}
                onChange={(event) => setPriceRaw(event.target.value)}
              />
            </Field>
          </div>
          <EmojiField id="product-icon" value={icon} onChange={setIcon} error={errors.icon} />
          <fieldset>
            <legend className="mb-1 text-sm text-white/80">Topping áp dụng</legend>
            {toppings.length === 0 ? (
              <p className="text-xs text-white/60">Chưa có topping nào.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-white/5 p-2">
                {toppings.map((topping) => {
                  const linked = toppingIds.includes(topping.id)
                  const disabled = !topping.is_active && !linked
                  return (
                    <label key={topping.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={linked}
                        disabled={disabled}
                        onChange={() => toggleTopping(topping.id)}
                      />
                      <span>
                        {topping.icon ? `${topping.icon} ` : ''}
                        {topping.name} · +{formatVnd(topping.price)}
                      </span>
                      {!topping.is_active ? <span className="text-xs text-white/50">(đã ẩn)</span> : null}
                    </label>
                  )
                })}
              </div>
            )}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!isHidden} onChange={(event) => setIsHidden(!event.target.checked)} />
            Đang bán
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <ModalFooter saving={saving} onCancel={onCancel} label="Lưu" />
        </div>
      </form>
    </Modal>
  )
}

export type ToppingModalProps = {
  initial?: ToppingRow
  toppings: ToppingRow[]
  saving: boolean
  onCancel: () => void
  onSubmit: (values: ToppingValues) => Promise<SaveOutcome>
}

export function ToppingModal({ initial, toppings, saving, onCancel, onSubmit }: ToppingModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [priceRaw, setPriceRaw] = useState(initial ? String(initial.price) : '')
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [isHidden, setIsHidden] = useState(initial ? !initial.is_active : false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseTopping(
      { name, price: priceRaw === '' ? Number.NaN : Number(priceRaw), icon, is_active: !isHidden, id: initial?.id },
      toppings,
    )
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setFormError(null)
      return
    }
    setErrors({})
    setFormError(null)
    const result = await onSubmit({ ...parsed.data, id: initial?.id })
    if (!result.ok) setFormError(result.message)
  }

  return (
    <Modal title={initial ? 'Sửa topping' : 'Thêm topping'} onClose={onCancel}>
      <form onSubmit={handleSubmit} noValidate>
        <FormError message={formError} />
        <div className="space-y-4">
          <Field label="Tên topping" id="topping-name" error={errors.name}>
            <input
              id="topping-name"
              className="glass-input"
              value={name}
              maxLength={NAME_MAX}
              aria-invalid={errors.name ? true : undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Đơn giá (₫)" id="topping-price" error={errors.price}>
              <input
                id="topping-price"
                className="glass-input"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={priceRaw}
                aria-invalid={errors.price ? true : undefined}
                onChange={(event) => setPriceRaw(event.target.value)}
              />
            </Field>
            <EmojiField id="topping-icon" value={icon} onChange={setIcon} error={errors.icon} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!isHidden} onChange={(event) => setIsHidden(!event.target.checked)} />
            Đang bán
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <ModalFooter saving={saving} onCancel={onCancel} label="Lưu" />
        </div>
      </form>
    </Modal>
  )
}
