// Trang Quản lý bill — P7-T1 + P12-T10 (design §7.3 mục 4): bảng mã / thời gian /
// người tạo / tổng / số món / tự dọn, phân trang, tìm theo mã (ĐÃ BỎ "Từ ngày"/
// "Đến ngày"/"Đặt lại"). "Xem Bill" mở modal ảnh PNG (P7-T2); admin có nút
// "Xóa bill" → nhập mật khẩu admin → EF `delete-bills` xác minh server-side
// (quyết định user 2026-10-04, design §4.1); staff không thấy nút.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useAuthProfile } from '../../app/authProfileContext'
import { SERVER_ERROR } from '../../lib/http'
import { formatVnd } from '../../lib/format'
import { dataUrlToBlob } from '../../lib/outbox'
import BillSheet, { type BillSheetItem } from '../pos/BillSheet'
import { billNodeToPngDataUrl, downloadBlob } from '../pos/exportBillPng'
import { defaultBillsApi, type BillsApi, type BillItemDetail } from './api'
import {
  BILL_RETENTION_DAYS,
  PAGE_SIZE,
  billImageFileName,
  formatBillDateTime,
  getCachedBillsPage,
  retentionDaysLeft,
  retentionTagText,
  setCachedBillsPage,
  totalPages,
  type BillRow,
} from './logic'

export type BillsPageProps = { api?: BillsApi }

type BillModal = {
  row: BillRow
  url: string
  sheetItems?: BillSheetItem[]
  status: 'loading' | 'ready' | 'fallback' | 'error'
  notice: { tone: 'ok' | 'warn' | 'error'; text: string }
}

function toBillSheetItems(details: BillItemDetail[]): BillSheetItem[] {
  const parents = details.filter((d) => !d.parent_item_id)
  const children = details.filter((d) => !!d.parent_item_id)
  return parents.map((p) => ({
    key: p.id,
    name: p.name_snapshot,
    qty: p.qty,
    unit_price: p.unit_price_snapshot,
    note: p.note || undefined,
    toppings: children
      .filter((c) => c.parent_item_id === p.id)
      .map((c) => ({
        key: c.id,
        name: c.name_snapshot,
        unit_price: c.unit_price_snapshot,
      })),
  }))
}

export default function BillsPage({ api = defaultBillsApi }: BillsPageProps) {
  const authProfile = useAuthProfile()
  const isAdmin = authProfile?.role === 'admin'
  const fallbackHostRef = useRef<HTMLDivElement | null>(null)
  const [rows, setRows] = useState<BillRow[]>(() => getCachedBillsPage()?.rows ?? [])
  const [total, setTotal] = useState(() => getCachedBillsPage()?.total ?? 0)
  const [page, setPage] = useState(0)
  const [codeInput, setCodeInput] = useState('')
  const [appliedCode, setAppliedCode] = useState('')
  const [loading, setLoading] = useState(() => !getCachedBillsPage())
  const [error, setError] = useState('')
  const [modal, setModal] = useState<BillModal | null>(null)
  /** P12-T10 — modal xóa bill (admin, mật khẩu xác minh server-side). */
  const [deleting, setDeleting] = useState<{
    row: BillRow
    password: string
    busy: boolean
    error: string
  } | null>(null)
  const [doneNotice, setDoneNotice] = useState('')

  const pages = totalPages(total)

  const load = useCallback(async () => {
    if (!getCachedBillsPage()) setLoading(true)
    try {
      const result = await api.list({ page, code: appliedCode })
      setRows(result.rows)
      setTotal(result.total)
      setCachedBillsPage({ rows: result.rows, total: result.total })
      setError('')
    } catch (loadError) {
      if (!getCachedBillsPage()) {
        setRows([])
        setTotal(0)
      }
      setError(loadError instanceof Error && loadError.message ? loadError.message : SERVER_ERROR)
    } finally {
      setLoading(false)
    }
  }, [api, page, appliedCode])

  useEffect(() => {
    // load() chỉ set state sau await; hẹn qua microtask để rule
    // react-hooks/set-state-in-effect không thấy setState đồng bộ trong effect.
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    setAppliedCode(codeInput.trim())
    setPage(0)
  }

  async function openImage(row: BillRow): Promise<void> {
    setModal({ row, url: '', status: 'loading', notice: { tone: 'ok', text: '' } })
    if (row.imagePath) {
      try {
        const url = await api.signedImageUrl(row.imagePath)
        setModal((current) => (current ? { ...current, url, status: 'ready' } : current))
        return
      } catch {
        // Fallback sang nạp items render sheet
      }
    }
    try {
      const items = await api.fetchBillItems(row.id)
      const sheetItems = toBillSheetItems(items)
      setModal((current) =>
        current ? { ...current, sheetItems, status: 'fallback' } : current,
      )
    } catch {
      setModal((current) => (current ? { ...current, status: 'error' } : current))
    }
  }

  function setNotice(tone: BillModal['notice']['tone'], text: string): void {
    setModal((current) => (current ? { ...current, notice: { tone, text } } : current))
  }

  /** Signed URL mới mỗi lần chia sẻ/tải hoặc fallback chụp BillSheet. */
  async function fetchImageBlob(row: BillRow): Promise<Blob> {
    if (modal?.status === 'fallback' && fallbackHostRef.current) {
      const dataUrl = await billNodeToPngDataUrl(fallbackHostRef.current)
      return dataUrlToBlob(dataUrl)
    }
    if (row.imagePath) {
      try {
        const url = await api.signedImageUrl(row.imagePath)
        const response = await fetch(url)
        if (response.ok) return response.blob()
      } catch {
        // Fallback chụp BillSheet
      }
    }
    if (fallbackHostRef.current) {
      const dataUrl = await billNodeToPngDataUrl(fallbackHostRef.current)
      return dataUrlToBlob(dataUrl)
    }
    throw new Error(SERVER_ERROR)
  }

  async function handleShare(): Promise<void> {
    const row = modal?.row
    if (!row) return
    try {
      const blob = await fetchImageBlob(row)
      const file = new File([blob], billImageFileName(row.code), { type: 'image/png' })
      if (typeof navigator.share !== 'function' || !navigator.canShare?.({ files: [file] })) {
        setNotice('warn', 'Thiết bị không chia sẻ được ảnh — dùng Tải về.')
        return
      }
      await navigator.share({ files: [file], title: `Bill ${row.code} — Hẻm Trà` })
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      setNotice('error', 'Chia sẻ thất bại, thử lại sau.')
    }
  }

  async function handleDownload(): Promise<void> {
    const row = modal?.row
    if (!row) return
    try {
      const blob = await fetchImageBlob(row)
      downloadBlob(blob, billImageFileName(row.code))
      setNotice('ok', `Đã lưu ${billImageFileName(row.code)} về máy.`)
    } catch {
      setNotice('error', 'Không tải được ảnh bill, thử lại sau.')
    }
  }

  /** P12-T10 — gọi EF `delete-bills`; thành công → đóng modal, nạp lại danh sách. */
  async function confirmDelete(): Promise<void> {
    if (!deleting || deleting.busy || !deleting.password) return
    const { row, password } = deleting
    setDeleting((current) => (current ? { ...current, busy: true, error: '' } : current))
    try {
      await api.deleteBill({ id: row.id, password })
      setCachedBillsPage(null)
      setDeleting(null)
      setDoneNotice(`Đã xóa bill ${row.code} (ảnh + thống kê đã cập nhật).`)
      await load()
    } catch (deleteError) {
      const message = deleteError instanceof Error && deleteError.message ? deleteError.message : SERVER_ERROR
      setDeleting((current) => (current ? { ...current, busy: false, error: message } : current))
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <section className="glass-card p-4 sm:p-6">
      <h1 className="text-xl font-semibold">Quản lý bill</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="text-sm text-white/70">
          {isAdmin
            ? 'Bill chỉ đọc — admin xóa bill bằng mật khẩu admin.'
            : 'Bill chỉ đọc — không có thao tác xóa.'}
        </p>
        <span
          data-testid="retention-policy-tag"
          className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-xs text-white/80"
        >
          {`Tự xóa sau ${BILL_RETENTION_DAYS} ngày`}
        </span>
      </div>

      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={submitSearch}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm sm:max-w-[16rem]">
          <span className="text-white/70">Tìm theo mã</span>
          <input
            type="search"
            className="glass-input"
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value)}
            placeholder="HT-261003-0001"
            autoComplete="off"
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="glass-btn glass-btn-primary flex items-center gap-1">
            <Search aria-hidden="true" className="h-4 w-4" /> Tìm
          </button>
        </div>
      </form>

      {doneNotice ? (
        <p role="status" className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
          {doneNotice}
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
          <p>{error}</p>
          <button type="button" className="glass-btn mt-2 !py-1 text-xs" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : null}

      {loading ? (
        <p role="status" className="mt-3 text-sm text-white/70">
          Đang tải bill…
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Danh sách bill">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase text-white/60">
            <tr>
              <th scope="col" className="py-2 pr-2">Mã bill</th>
              <th scope="col" className="py-2 pr-2">Thời gian</th>
              <th scope="col" className="py-2 pr-2">Người tạo</th>
              <th scope="col" className="py-2 pr-2 text-right">Tổng</th>
              <th scope="col" className="py-2 pr-2 text-right">Số món</th>
              <th scope="col" className="py-2 pr-2">Tự dọn</th>
              <th scope="col" className="py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-white/10">
                <td className="py-2 pr-2 font-medium">{row.code}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-white/70">
                  {formatBillDateTime(row.created_at)}
                </td>
                <td className="py-2 pr-2 text-white/70">{row.username ?? '—'}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{formatVnd(row.total)}</td>
                <td className="py-2 pr-2 text-right">{row.itemCount}</td>
                <td className="py-2 pr-2 whitespace-nowrap">
                  <span className="rounded-full border border-white/30 bg-white/15 px-2 py-0.5 text-xs text-white/80">
                    {retentionTagText(retentionDaysLeft(row.expiresAt))}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      className="glass-btn !px-2 !py-1 text-xs"
                      aria-label={`Xem bill ${row.code}`}
                      onClick={() => void openImage(row)}
                    >
                      Xem Bill
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="glass-btn !px-2 !py-1 text-xs !border-red-300/40 !text-red-100"
                        aria-label={`Xóa bill ${row.code}`}
                        data-testid={`delete-bill-${row.code}`}
                        onClick={() => setDeleting({ row, password: '', busy: false, error: '' })}
                      >
                        <Trash2 aria-hidden="true" className="mr-1 inline h-3 w-3" />
                        Xóa
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && !error ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-white/60">
                  {total === 0 ? 'Chưa có bill nào.' : 'Không tìm thấy bill khớp.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <nav className="mt-4 flex flex-wrap items-center justify-between gap-2" aria-label="Phân trang bill">
        <p role="status" className="text-sm text-white/70">
          Trang {page + 1}/{pages} · {total} bill · {PAGE_SIZE} dòng/trang
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="glass-btn"
            disabled={page === 0 || loading}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Trước
          </button>
          <button
            type="button"
            className="glass-btn"
            disabled={page + 1 >= pages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Sau
          </button>
        </div>
      </nav>

      {modal ? (
        <Modal
          title={`Bill ${modal.row.code}`}
          onClose={() => setModal(null)}
          footer={
            <>
              {canShare ? (
                <button type="button" className="glass-btn" onClick={() => void handleShare()}>
                  Chia sẻ lại
                </button>
              ) : null}
              <button
                type="button"
                className="glass-btn glass-btn-primary"
                onClick={() => void handleDownload()}
              >
                Tải về
              </button>
              <button type="button" className="glass-btn" onClick={() => setModal(null)}>
                Đóng
              </button>
            </>
          }
        >
          {modal.status === 'loading' ? (
            <p role="status" className="text-sm text-white/70">
              Đang tải ảnh bill…
            </p>
          ) : null}

          {modal.status === 'error' ? (
            <div role="alert" className="text-sm text-red-200">
              <p>Không tải được ảnh bill.</p>
              <button
                type="button"
                className="glass-btn mt-2 !py-1 text-xs"
                onClick={() => void openImage(modal.row)}
              >
                Thử lại
              </button>
            </div>
          ) : null}

          {modal.status === 'ready' ? (
            <img
              src={modal.url}
              alt={`Ảnh bill ${modal.row.code}`}
              className="w-full rounded-lg bg-white/95"
              onError={async () => {
                try {
                  const items = await api.fetchBillItems(modal.row.id)
                  setModal((current) =>
                    current
                      ? {
                          ...current,
                          sheetItems: toBillSheetItems(items),
                          status: 'fallback',
                        }
                      : current,
                  )
                } catch {
                  setModal((current) =>
                    current ? { ...current, status: 'error' } : current,
                  )
                }
              }}
            />
          ) : null}

          {modal.status === 'fallback' && modal.sheetItems ? (
            <div className="flex flex-col items-center">
              <div
                ref={fallbackHostRef}
                className="w-full max-w-[360px] overflow-hidden rounded-lg bg-white shadow-xl"
              >
                <BillSheet
                  code={modal.row.code}
                  createdAt={Date.parse(modal.row.created_at) || 0}
                  items={modal.sheetItems}
                  total={modal.row.total}
                />
              </div>
            </div>
          ) : null}

          {modal.notice.text ? (
            <p
              role={modal.notice.tone === 'error' ? 'alert' : 'status'}
              className={
                modal.notice.tone === 'error'
                  ? 'mt-3 text-sm text-red-200'
                  : 'mt-3 text-sm text-white/80'
              }
            >
              {modal.notice.text}
            </p>
          ) : null}
        </Modal>
      ) : null}

      {/* P12-T10 — xác nhận xóa bill bằng mật khẩu admin (EF delete-bills) */}
      {deleting ? (
        <Modal
          title={`Xóa bill ${deleting.row.code}`}
          onClose={() => (deleting.busy ? undefined : setDeleting(null))}
          footer={
            <>
              <button
                type="button"
                className="glass-btn"
                disabled={deleting.busy}
                onClick={() => setDeleting(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="glass-btn !border-red-300/50 !bg-red-500/25 !text-red-100"
                data-testid="confirm-delete-bill"
                disabled={deleting.busy || deleting.password.length === 0}
                onClick={() => void confirmDelete()}
              >
                {deleting.busy ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
              </button>
            </>
          }
        >
          <p className="text-sm text-white/80">
            Hành động này xóa vĩnh viễn bill, các dòng món và ảnh PNG của bill, và{' '}
            <strong>trừ doanh thu/thống kê</strong> trên Dashboard. Không thể hoàn tác.
          </p>
          <label className="mt-4 block text-sm text-white/70" htmlFor="delete-bill-password">
            Nhập mật khẩu admin để xác nhận
          </label>
          <input
            id="delete-bill-password"
            data-testid="delete-bill-password"
            type="password"
            autoComplete="current-password"
            className="glass-input mt-1 w-full"
            value={deleting.password}
            disabled={deleting.busy}
            onChange={(event) =>
              setDeleting((current) =>
                current ? { ...current, password: event.target.value, error: '' } : current,
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') void confirmDelete()
            }}
          />
          {deleting.error ? (
            <p role="alert" className="mt-3 text-sm text-red-200">
              {deleting.error}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </section>
  )
}
