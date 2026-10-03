import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export type ModalProps = {
  title: string
  onClose: () => void
  children: ReactNode
  /** Nội dung footer (nút hành động) — đặt trong glass-card cuối modal. */
  footer?: ReactNode
}

// Modal chung cho trang quản trị (P5 Sản phẩm, P7+): overlay + glass-card,
// đúng pattern dialog của LoginStage (role=dialog, aria-modal, Esc đóng,
// click overlay bên ngoài đóng, tiêu đề nối bằng aria-labelledby).
export default function Modal({ title, onClose, children, footer }: ModalProps) {
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    cardRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
        className="glass-card w-full max-w-md p-5 outline-none"
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
