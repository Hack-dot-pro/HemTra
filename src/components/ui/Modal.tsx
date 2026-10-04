import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export type ModalProps = {
  title: string
  onClose: () => void
  children: ReactNode
  /** Nội dung footer (nút hành động) — đặt trong glass-card cuối modal. */
  footer?: ReactNode
  /** Modal rộng (P12-T8: preview ảnh bill 2K không bị bóp trong max-w-md). */
  wide?: boolean
}

// Modal chung cho trang quản trị (P5 Sản phẩm, P7+): overlay + glass-card,
// đúng pattern dialog của LoginStage (role=dialog, aria-modal, Esc đóng,
// click overlay bên ngoài đóng, tiêu đề nối bằng aria-labelledby).
export default function Modal({ title, onClose, children, footer, wide }: ModalProps) {
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement | null>(null)
  // P12-T10: giữ onClose mới nhất qua ref — nếu effect phụ thuộc onClose (inline
  // arrow đổi mỗi render của component cha) thì MỖI lần gõ phím state đổi →
  // effect chạy lại → focus nhảy ra khỏi ô nhập (mất ký tự kế tiếp khi gõ).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Focus chỉ khi mount (1 lần), không chạy lại theo re-render.
  useEffect(() => {
    cardRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4"
      data-testid="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`glass-card w-full p-5 outline-none ${wide ? 'max-w-3xl' : 'max-w-md'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            className="glass-btn grid h-9 w-9 shrink-0 place-items-center !p-0"
            onClick={onClose}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        {children}
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}
