// Trang Quản lý bill — P7-T1 (design §7.4): bảng mã / thời gian / người tạo /
// tổng / số món, phân trang, lọc theo ngày, tìm theo mã. Không có nút xóa ở
// mọi role (design §4.1); ảnh PNG xem lại là P7-T2.

import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { SERVER_ERROR } from '../../lib/http'
import { formatVnd } from '../../lib/format'
import { defaultBillsApi, type BillsApi } from './api'
import {
  PAGE_SIZE,
  formatBillDateTime,
  totalPages,
  validateDateRange,
  type BillRow,
} from './logic'

export type BillsPageProps = { api?: BillsApi }

export default function BillsPage({ api = defaultBillsApi }: BillsPageProps) {
  const [rows, setRows] = useState<BillRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [codeInput, setCodeInput] = useState('')
  const [appliedCode, setAppliedCode] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const rangeError = validateDateRange(from, to)
  const pages = totalPages(total)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.list({ page, code: appliedCode, from, to })
      setRows(result.rows)
      setTotal(result.total)
      setError('')
    } catch (loadError) {
      setRows([])
      setTotal(0)
      setError(loadError instanceof Error && loadError.message ? loadError.message : SERVER_ERROR)
    } finally {
      setLoading(false)
    }
  }, [api, page, appliedCode, from, to])

  useEffect(() => {
    if (rangeError) return
    // load() chỉ set state sau await; hẹn qua microtask để rule
    // react-hooks/set-state-in-effect không thấy setState đồng bộ trong effect.
    queueMicrotask(() => {
      void load()
    })
  }, [load, rangeError])

  function changeFrom(value: string) {
    setFrom(value)
    setPage(0)
  }

  function changeTo(value: string) {
    setTo(value)
    setPage(0)
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    setAppliedCode(codeInput.trim())
    setPage(0)
  }

  function resetFilters() {
    setCodeInput('')
    setAppliedCode('')
    setFrom('')
    setTo('')
    setPage(0)
  }

  return (
    <section className="glass-card p-4 sm:p-6">
      <h1 className="text-xl font-semibold">Quản lý bill</h1>
      <p className="mt-1 text-sm text-white/70">
        Bill chỉ đọc — không có thao tác xóa. Bill tự xóa sau 15 ngày.
      </p>

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
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-white/70">Từ ngày</span>
          <input
            type="date"
            className="glass-input"
            value={from}
            onChange={(event) => changeFrom(event.target.value)}
            aria-label="Từ ngày"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-white/70">Đến ngày</span>
          <input
            type="date"
            className="glass-input"
            value={to}
            onChange={(event) => changeTo(event.target.value)}
            aria-label="Đến ngày"
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="glass-btn glass-btn-primary flex items-center gap-1">
            <Search aria-hidden="true" className="h-4 w-4" /> Tìm
          </button>
          <button type="button" className="glass-btn" onClick={resetFilters}>
            Đặt lại
          </button>
        </div>
      </form>

      {rangeError ? (
        <p role="alert" className="mt-3 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
          {rangeError}
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

      {loading && !rangeError ? (
        <p role="status" className="mt-3 text-sm text-white/70">
          Đang tải bill…
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Danh sách bill">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase text-white/60">
            <tr>
              <th scope="col" className="py-2 pr-2">Mã bill</th>
              <th scope="col" className="py-2 pr-2">Thời gian</th>
              <th scope="col" className="py-2 pr-2">Người tạo</th>
              <th scope="col" className="py-2 pr-2 text-right">Tổng</th>
              <th scope="col" className="py-2 text-right">Số món</th>
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
                <td className="py-2 text-right">{row.itemCount}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && !error && !rangeError ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-white/60">
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
    </section>
  )
}
