import { useCallback, useEffect, useId, useState } from 'react'
import {
  Check,
  Copy,
  KeyRound,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  User,
} from 'lucide-react'
import { useAuthProfile } from '../../app/authProfileContext'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Modal from '../../components/ui/Modal'
import { defaultUsersApi, type UsersApi } from './api'
import {
  canDeleteUser,
  canManageUserPassword,
  createUserSchema,
  formatUserCreatedAt,
  setPasswordSchema,
} from './logic'
import type { CreateUserParams, UserProfile, UserRole } from './types'
import { getSupabase } from '../../lib/supabase'

export type UsersPageProps = {
  api?: UsersApi
  currentUserId?: string
}

export default function UsersPage({ api = defaultUsersApi, currentUserId: propUserId }: UsersPageProps) {
  const authProfile = useAuthProfile()
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const currentUserId = propUserId ?? sessionUserId
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [targetSetPasswordUser, setTargetSetPasswordUser] = useState<UserProfile | null>(null)
  const [targetDeleteUser, setTargetDeleteUser] = useState<UserProfile | null>(null)
  const [tempPasswordModalData, setTempPasswordModalData] = useState<{
    username: string
    password: string
    isNewUser: boolean
  } | null>(null)

  // Form states
  const [createForm, setCreateForm] = useState<CreateUserParams>({
    username: '',
    displayName: '',
    password: '',
    role: 'staff',
  })
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [newPasswordVal, setNewPasswordVal] = useState('')
  const [setPasswordError, setSetPasswordError] = useState<string | null>(null)
  const [settingPassword, setSettingPassword] = useState(false)

  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)

  const usernameId = useId()
  const displayNameId = useId()
  const passwordId = useId()
  const newPwId = useId()

  // Lấy current user ID từ Supabase Auth nếu chưa có
  useEffect(() => {
    if (propUserId) return
    const supabase = getSupabase()
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data?.session?.user?.id) {
        setSessionUserId(data.session.user.id)
      }
    })
    return () => {
      active = false
    }
  }, [propUserId])

  const loadUsers = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true)
      else setRefreshing(true)
      setError(null)
      try {
        const list = await api.fetchUsers()
        setUsers(list)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tải danh sách người dùng')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [api],
  )

  useEffect(() => {
    queueMicrotask(() => {
      void loadUsers()
    })
  }, [loadUsers])

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      u.username.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      (u.creatorUsername && u.creatorUsername.toLowerCase().includes(q))
    )
  })

  // Thao tác: Tạo user mới
  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)

    const parseRes = createUserSchema.safeParse({
      username: createForm.username,
      displayName: createForm.displayName,
      password: createForm.password,
      role: createForm.role,
    })

    if (!parseRes.success) {
      setCreateError(parseRes.error.issues[0]?.message ?? 'Thông tin không hợp lệ')
      return
    }

    setCreating(true)
    try {
      const res = await api.createUser({
        username: parseRes.data.username,
        displayName: parseRes.data.displayName,
        password: parseRes.data.password || undefined,
        role: parseRes.data.role as UserRole,
      })

      setShowCreateModal(false)
      setCreateForm({ username: '', displayName: '', password: '', role: 'staff' })
      await loadUsers(true)

      if (res.temporaryPassword) {
        setTempPasswordModalData({
          username: res.user.username,
          password: res.temporaryPassword,
          isNewUser: true,
        })
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Lỗi tạo tài khoản')
    } finally {
      setCreating(false)
    }
  }

  // Thao tác: Cấp lại mật khẩu (sinh ngẫu nhiên)
  async function handleResetPassword(targetUser: UserProfile) {
    setError(null)
    try {
      const res = await api.resetPassword(targetUser.id)
      await loadUsers(true)
      setTempPasswordModalData({
        username: targetUser.username,
        password: res.temporaryPassword,
        isNewUser: false,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cấp lại mật khẩu')
    }
  }

  // Thao tác: Đặt mật khẩu cụ thể
  async function handleSetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!targetSetPasswordUser) return
    setSetPasswordError(null)

    const parseRes = setPasswordSchema.safeParse({ newPassword: newPasswordVal })
    if (!parseRes.success) {
      setSetPasswordError(parseRes.error.issues[0]?.message ?? 'Mật khẩu không hợp lệ')
      return
    }

    setSettingPassword(true)
    try {
      await api.setPassword(targetSetPasswordUser.id, parseRes.data.newPassword)
      setTargetSetPasswordUser(null)
      setNewPasswordVal('')
      await loadUsers(true)
    } catch (err) {
      setSetPasswordError(err instanceof Error ? err.message : 'Lỗi đặt mật khẩu')
    } finally {
      setSettingPassword(false)
    }
  }

  // Thao tác: Xóa user
  async function handleDeleteConfirm() {
    if (!targetDeleteUser) return
    setDeleting(true)
    setError(null)
    try {
      await api.deleteUser(targetDeleteUser.id)
      setTargetDeleteUser(null)
      await loadUsers(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa người dùng')
    } finally {
      setDeleting(false)
    }
  }

  function handleCopyPassword(pwd: string) {
    void navigator.clipboard.writeText(pwd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const currentUserContext = currentUserId
    ? { id: currentUserId, role: authProfile?.role ?? 'staff' }
    : null

  const isAdmin = authProfile?.role === 'admin'

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      {/* Tiêu đề trang + Hành động chính */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 sm:p-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Quản lý user</span>
            {refreshing && (
              <span className="text-xs font-normal text-sky-300 animate-pulse flex items-center gap-1">
                <RotateCcw className="w-3 h-3 animate-spin" /> Đang cập nhật...
              </span>
            )}
          </h1>
          <p className="text-xs text-white/60 mt-0.5">
            Danh sách tài khoản, phân quyền và quản lý mật khẩu nhân viên
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void loadUsers(false)}
            disabled={loading || refreshing}
            aria-label="Làm mới danh sách"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition disabled:opacity-50"
          >
            <RotateCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Cả admin và staff đều có thể thêm user (§4.1) */}
          <button
            type="button"
            data-testid="add-user-btn"
            onClick={() => {
              setCreateError(null)
              setCreateForm({ username: '', displayName: '', password: '', role: 'staff' })
              setShowCreateModal(true)
            }}
            className="glass-btn glass-btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm user</span>
          </button>
        </div>
      </div>

      {/* Thông báo lỗi trang nếu có */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-sm flex items-center justify-between gap-4"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadUsers(false)}
            className="px-3 py-1 bg-red-500/40 hover:bg-red-500/60 rounded-md text-xs font-semibold text-white transition"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Tìm kiếm người dùng */}
      <div className="glass-card p-3 flex items-center gap-3">
        <Search className="w-4 h-4 text-white/40 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên đăng nhập, tên hiển thị, người tạo..."
          className="bg-transparent text-sm text-white placeholder-white/40 focus:outline-none w-full"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-xs text-white/50 hover:text-white px-2 py-0.5"
          >
            Xóa
          </button>
        )}
      </div>

      {/* Bảng danh sách User */}
      <div className="glass-card overflow-hidden">
        {loading && users.length === 0 ? (
          <div data-testid="users-loading" className="p-12 flex flex-col items-center justify-center gap-3 text-white/70">
            <RotateCcw className="w-8 h-8 animate-spin text-sky-400" />
            <span className="text-sm font-medium">Đang tải danh sách người dùng...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-white/50 text-sm italic">
            {users.length === 0 ? 'Chưa có tài khoản người dùng nào.' : 'Không tìm thấy người dùng phù hợp.'}
          </div>
        ) : (
          <div className="overflow-x-auto focus:outline-none" tabIndex={0} aria-label="Bảng người dùng">
            <table className="w-full text-left text-sm text-white/90 border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-xs text-white/60 font-semibold tracking-wider uppercase">
                  <th className="py-3 px-4">Tên đăng nhập</th>
                  <th className="py-3 px-4">Tên hiển thị</th>
                  <th className="py-3 px-4">Vai trò</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Người tạo</th>
                  <th className="py-3 px-4">Ngày tạo</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredUsers.map((u) => {
                  const isUserAdmin = u.role === 'admin'
                  const canDelete = canDeleteUser(currentUserContext, u)
                  const canManagePw = canManageUserPassword(currentUserContext, u)

                  return (
                    <tr
                      key={u.id}
                      data-testid={`user-row-${u.username}`}
                      className="hover:bg-white/5 transition"
                    >
                      <td className="py-3.5 px-4 font-mono font-medium text-white flex items-center gap-2">
                        {isUserAdmin ? (
                          <Shield className="w-4 h-4 text-purple-400 shrink-0" aria-label="Admin" />
                        ) : (
                          <User className="w-4 h-4 text-sky-400 shrink-0" aria-label="Staff" />
                        )}
                        <span>{u.username}</span>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-white/90">
                        {u.displayName}
                      </td>

                      <td className="py-3.5 px-4">
                        {isUserAdmin ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-400/30">
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                            Nhân viên
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {u.mustChangePassword ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                            Chờ đổi MK
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                            Hoạt động
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-white/70 text-xs font-mono">
                        {u.creatorUsername ? `@${u.creatorUsername}` : isUserAdmin ? 'Hệ thống' : '—'}
                      </td>

                      <td className="py-3.5 px-4 text-white/60 text-xs">
                        {formatUserCreatedAt(u.createdAt)}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {isUserAdmin ? (
                          <span className="text-xs text-white/40 italic">Admin hệ thống</span>
                        ) : isAdmin ? (
                          <div className="flex items-center justify-end gap-1">
                            {canManagePw && (
                              <>
                                <button
                                  type="button"
                                  data-testid={`reset-pw-btn-${u.username}`}
                                  title="Cấp lại mật khẩu (sinh ngẫu nhiên)"
                                  onClick={() => void handleResetPassword(u)}
                                  className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition"
                                >
                                  <KeyRound className="w-4 h-4" />
                                </button>

                                <button
                                  type="button"
                                  data-testid={`set-pw-btn-${u.username}`}
                                  title="Đặt mật khẩu cụ thể"
                                  onClick={() => {
                                    setSetPasswordError(null)
                                    setNewPasswordVal('')
                                    setTargetSetPasswordUser(u)
                                  }}
                                  className="p-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 transition"
                                >
                                  <Lock className="w-4 h-4" />
                                </button>
                              </>
                            )}

                            {canDelete && (
                              <button
                                type="button"
                                data-testid={`delete-user-btn-${u.username}`}
                                title="Xóa tài khoản"
                                onClick={() => setTargetDeleteUser(u)}
                                className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-white/40">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Thêm người dùng mới */}
      {showCreateModal && (
        <Modal
          title="Thêm tài khoản người dùng"
          onClose={() => setShowCreateModal(false)}
          footer={
            <>
              <button
                type="button"
                className="glass-btn"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
              >
                Hủy
              </button>
              <button
                type="submit"
                form="create-user-form"
                disabled={creating}
                className="glass-btn glass-btn-primary"
              >
                {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
              </button>
            </>
          }
        >
          <form id="create-user-form" onSubmit={handleCreateUser} className="space-y-4">
            {createError && (
              <div role="alert" className="p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-200 text-xs">
                {createError}
              </div>
            )}

            <div>
              <label htmlFor={usernameId} className="block text-xs font-semibold text-white/80 mb-1">
                Tên đăng nhập <span className="text-red-400">*</span>
              </label>
              <input
                id={usernameId}
                data-testid="create-user-username"
                type="text"
                required
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                placeholder="vd: nhanvien1"
                className="glass-input w-full"
              />
              <p className="text-[11px] text-white/50 mt-1">2-30 ký tự, chữ thường, số, ., _, -</p>
            </div>

            <div>
              <label htmlFor={displayNameId} className="block text-xs font-semibold text-white/80 mb-1">
                Tên hiển thị
              </label>
              <input
                id={displayNameId}
                data-testid="create-user-display-name"
                type="text"
                value={createForm.displayName}
                onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                placeholder="vd: Nguyễn Văn A"
                className="glass-input w-full"
              />
            </div>

            <div>
              <label htmlFor={passwordId} className="block text-xs font-semibold text-white/80 mb-1">
                Mật khẩu ban đầu
              </label>
              <input
                id={passwordId}
                data-testid="create-user-password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Để trống để tự động sinh mật khẩu tạm thời"
                className="glass-input w-full"
              />
              <p className="text-[11px] text-white/50 mt-1">
                Nếu để trống, hệ thống sẽ sinh mật khẩu ngẫu nhiên 8 ký tự và yêu cầu đổi ở lần đầu.
              </p>
            </div>

            {isAdmin && (
              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">Vai trò</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
                  className="glass-input w-full bg-slate-900/80 text-white"
                >
                  <option value="staff" className="bg-slate-900 text-white">
                    Nhân viên (staff)
                  </option>
                  <option value="admin" className="bg-slate-900 text-white">
                    Quản trị viên (admin)
                  </option>
                </select>
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* Modal: Đặt mật khẩu cụ thể cho User */}
      {targetSetPasswordUser && (
        <Modal
          title={`Đặt mật khẩu cho @${targetSetPasswordUser.username}`}
          onClose={() => setTargetSetPasswordUser(null)}
          footer={
            <>
              <button
                type="button"
                className="glass-btn"
                onClick={() => setTargetSetPasswordUser(null)}
                disabled={settingPassword}
              >
                Hủy
              </button>
              <button
                type="submit"
                form="set-password-form"
                disabled={settingPassword}
                className="glass-btn glass-btn-primary"
              >
                {settingPassword ? 'Đang lưu...' : 'Lưu mật khẩu'}
              </button>
            </>
          }
        >
          <form id="set-password-form" onSubmit={handleSetPasswordSubmit} className="space-y-4">
            {setPasswordError && (
              <div role="alert" className="p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-200 text-xs">
                {setPasswordError}
              </div>
            )}

            <div>
              <label htmlFor={newPwId} className="block text-xs font-semibold text-white/80 mb-1">
                Mật khẩu mới <span className="text-red-400">*</span>
              </label>
              <input
                id={newPwId}
                data-testid="set-new-password-input"
                type="password"
                required
                value={newPasswordVal}
                onChange={(e) => setNewPasswordVal(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="glass-input w-full"
              />
            </div>
            <p className="text-xs text-white/60">
              Nhân viên sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập kế tiếp.
            </p>
          </form>
        </Modal>
      )}

      {/* Modal: Hiển thị mật khẩu tạm thời */}
      {tempPasswordModalData && (
        <Modal
          title={tempPasswordModalData.isNewUser ? 'Tạo tài khoản thành công!' : 'Đã cấp lại mật khẩu!'}
          onClose={() => setTempPasswordModalData(null)}
          footer={
            <button
              type="button"
              className="glass-btn glass-btn-primary w-full"
              onClick={() => setTempPasswordModalData(null)}
            >
              Đã hiểu & Đóng
            </button>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-white/80">
              {tempPasswordModalData.isNewUser
                ? `Tài khoản @${tempPasswordModalData.username} đã được tạo với mật khẩu tạm thời bên dưới:`
                : `Mật khẩu tạm thời mới cho @${tempPasswordModalData.username}:`}
            </p>

            <div className="p-4 rounded-xl bg-white/10 border border-white/20 flex items-center justify-between gap-3">
              <span
                data-testid="temp-password-display"
                className="font-mono text-lg font-bold text-amber-300 tracking-wider select-all"
              >
                {tempPasswordModalData.password}
              </span>

              <button
                type="button"
                onClick={() => handleCopyPassword(tempPasswordModalData.password)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
              </button>
            </div>

            <div className="text-xs text-amber-200/80 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
              ⚠️ Vui lòng sao chép và gửi mật khẩu này cho nhân viên. Mật khẩu này chỉ hiển thị một lần. Nhân viên sẽ bắt buộc phải đổi mật khẩu khi đăng nhập lần đầu.
            </div>
          </div>
        </Modal>
      )}

      {/* ConfirmDialog: Xác nhận xóa tài khoản */}
      {targetDeleteUser && (
        <ConfirmDialog
          title="Xác nhận xóa tài khoản"
          message={`Bạn có chắc chắn muốn xóa tài khoản @${targetDeleteUser.username} (${targetDeleteUser.displayName})? Tài khoản này sẽ bị xóa hoàn toàn khỏi hệ thống.`}
          confirmLabel={deleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
          cancelLabel="Hủy"
          danger
          busy={deleting}
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setTargetDeleteUser(null)}
        />
      )}
    </div>
  )
}
