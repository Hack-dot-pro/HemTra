import Modal from './Modal'

export type ConfirmDialogProps = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Nút xác nhận màu cảnh báo (dùng cho ẩn/xóa). */
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Xác nhận trước khi ẩn/xóa — uiux skill: "hành động ẩn/xóa luôn có confirm".
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="glass-btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'glass-btn bg-red-500/80 text-white hover:bg-red-500' : 'glass-btn glass-btn-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-white/80">{message}</p>
    </Modal>
  )
}
