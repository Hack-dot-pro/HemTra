import { useRef, useState } from 'react'
import Modal from '../../components/ui/Modal'
import { applyProfileChanges, requestProfileOtp, type MyProfile, type ProfileChanges } from './api'
import { avatarInitials, changedProfileFields, fileToAvatarDataUrl, type ProfileForm } from './profileLogic'
import { useAvatarUrl } from './useMyProfile'

export type ProfileModalProps = {
  /** Dòng profiles của chính mình (điền sẵn form + avatar). */
  initial: MyProfile | null
  /** Admin sửa được (thông tin của CHÍNH mình); staff chỉ xem — P12-T9. */
  isAdmin: boolean
  onClose: () => void
  /** Gọi sau khi apply thành công — header làm mới tên/avatar ngay. */
  onUpdated?: (profile: MyProfile) => void
}

// P12-T9 — modal hồ sơ: mọi thay đổi (tên hiển thị, tên đăng nhập, mật khẩu,
// ảnh đại diện) đều xác nhận bằng OTP 6 số gửi về email admin (quyết định user
// 2026-10-04). Email khôi phục đi qua trang riêng (EF change-recovery-email,
// OTP gửi về email MỚI để chứng minh quyền sở hữu — design §4.4).
export default function ProfileModal({ initial, isAdmin, onClose, onUpdated }: ProfileModalProps) {
  const [form, setForm] = useState<ProfileForm>({
    display_name: initial?.display_name ?? '',
    username: initial?.username ?? '',
    password: '',
  })
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const { avatarUrl } = useAvatarUrl(initial?.avatar_path)
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const changes =
    initial && isAdmin
      ? changedProfileFields(initial, form)
      : {}
  const hasChanges =
    Object.keys(changes).length > 0 || avatarDataUrl !== null

  async function sendOtp(): Promise<void> {
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      await requestProfileOtp()
      setOtpSent(true)
      setOk('Đã gửi mã OTP tới email admin — kiểm tra hộp thư.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không gửi được mã OTP.')
    } finally {
      setBusy(false)
    }
  }

  async function submit(): Promise<void> {
    if (!initial) return
    setError(null)
    setOk(null)
    if (!hasChanges) {
      setError('Chưa có thay đổi nào để lưu.')
      return
    }
    if (!/^\d{6}$/.test(otp)) {
      setError('Nhập mã OTP 6 số gửi về email admin.')
      return
    }
    setBusy(true)
    try {
      const payload: ProfileChanges = { ...changes }
      if (avatarDataUrl) payload.avatar_data_url = avatarDataUrl
      const { profile: fresh, message } = await applyProfileChanges(otp, payload)
      setOtp('')
      setOtpSent(false)
      setAvatarDataUrl(null)
      setForm({ display_name: fresh.display_name, username: fresh.username, password: '' })
      setOk(message ?? 'Đã cập nhật hồ sơ.')
      onUpdated?.(fresh)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không cập nhật được hồ sơ.')
    } finally {
      setBusy(false)
    }
  }

  async function pickAvatar(file: File | undefined): Promise<void> {
    if (!file) return
    setError(null)
    setOk(null)
    try {
      setAvatarDataUrl(await fileToAvatarDataUrl(file))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không đọc được ảnh.')
    }
  }

  const previewSrc = avatarDataUrl ?? avatarUrl

  return (
    <Modal title="Hồ sơ tài khoản" onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="profile-modal">
        {/* Ảnh đại diện */}
        <div className="flex items-center gap-3">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/25 text-lg font-bold"
            aria-hidden="true"
          >
            {previewSrc ? (
              <img src={previewSrc} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              avatarInitials(form.display_name || initial?.display_name || '', initial?.username ?? '')
            )}
          </span>
          <div className="min-w-0 text-sm text-white/85">
            <p className="truncate font-medium">{initial?.display_name || initial?.username || '—'}</p>
            <p className="truncate text-xs text-white/60">@{initial?.username ?? '—'}</p>
            {isAdmin ? (
              <button
                type="button"
                className="glass-btn mt-1 !px-2 !py-1 text-xs"
                onClick={() => fileRef.current?.click()}
              >
                Chọn ảnh đại diện
              </button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label="Chọn ảnh đại diện"
              onChange={(event) => void pickAvatar(event.target.files?.[0])}
            />
            {avatarDataUrl ? (
              <p className="mt-1 text-xs text-emerald-200">Đã chọn ảnh mới — bấm “Xác nhận” để lưu.</p>
            ) : null}
          </div>
        </div>

        {isAdmin ? (
          <>
            <label className="text-sm text-white/80">
              Tên hiển thị
              <input
                data-testid="profile-display-name"
                className="glass-input mt-1 w-full"
                value={form.display_name}
                maxLength={50}
                onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))}
              />
            </label>
            <label className="text-sm text-white/80">
              Tên đăng nhập
              <input
                data-testid="profile-username"
                className="glass-input mt-1 w-full"
                value={form.username}
                maxLength={30}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, username: event.target.value.toLowerCase() }))
                }
              />
            </label>
            <label className="text-sm text-white/80">
              Mật khẩu mới{' '}
              <span className="text-white/50">(để trống nếu không đổi)</span>
              <input
                data-testid="profile-password"
                type="password"
                autoComplete="new-password"
                className="glass-input mt-1 w-full"
                value={form.password}
                placeholder="Tối thiểu 6 ký tự"
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>

            <div className="flex items-center justify-between gap-2 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm">
              <span className="text-white/80">Email khôi phục</span>
              <a href="/change-recovery-email" className="text-sky-200 underline underline-offset-4">
                Đổi tại trang Email khôi phục
              </a>
            </div>

            {/* OTP — mọi thay đổi đều phải xác nhận (quyết định user 2026-10-04). */}
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1 text-sm text-white/80">
                Mã OTP (6 số)
                <input
                  data-testid="profile-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="glass-input mt-1 w-full tracking-[0.3em]"
                  value={otp}
                  placeholder="------"
                  maxLength={6}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <button
                type="button"
                data-testid="send-otp-btn"
                className="glass-btn !py-2 text-xs"
                disabled={busy}
                onClick={() => void sendOtp()}
              >
                {busy && !otpSent ? 'Đang gửi…' : 'Gửi mã OTP'}
              </button>
            </div>
            {otpSent && !error ? (
              <p className="text-xs text-emerald-200" role="status">
                Mã OTP đã gửi tới email admin — mã dùng 1 lần, muốn đổi lại thì gửi mã mới.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white/80">
              Staff không tự sửa tên/avatar — nhờ admin chỉnh trong “Quản lý user”.
            </p>
            {/* §4.1: staff VẪN đổi được mật khẩu của chính mình (nhập mật khẩu cũ). */}
            <a href="/change-password" className="glass-btn w-full text-center" data-testid="staff-change-password">
              Đổi mật khẩu của tôi
            </a>
          </>
        )}

        {error ? (
          <p role="alert" className="text-sm text-red-200" data-testid="profile-error">
            {error}
          </p>
        ) : null}
        {ok ? (
          <p role="status" className="text-sm text-emerald-200" data-testid="profile-ok">
            {ok}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="glass-btn" onClick={onClose}>
            Đóng
          </button>
          {isAdmin ? (
            <button
              type="button"
              data-testid="profile-submit-btn"
              className="glass-btn !bg-emerald-500/80"
              disabled={busy || !hasChanges}
              onClick={() => void submit()}
            >
              {busy && otp ? 'Đang lưu…' : 'Xác nhận'}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
