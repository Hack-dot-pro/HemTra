import { NavLink, Outlet } from 'react-router-dom'
import { Suspense, useEffect, useState } from 'react'
import { RefreshCw, LogOut } from 'lucide-react'
import { NAV_ITEMS } from './nav'
import { prefetchAllRoutes, prefetchRoute } from './prefetch'
import { useAuthProfile } from './authProfileContext'
import NetworkBanner from '../components/ui/NetworkBanner.tsx'
import PwaUpdateBar from '../components/ui/PwaUpdateBar.tsx'
import ErrorBoundary from '../components/ui/ErrorBoundary.tsx'
import { useMenuSync, useOnlineStatus } from '../lib/useMenu'
import { formatClockTime } from '../lib/format'
import ProfileModal from '../features/profile/ProfileModal'
import { avatarInitials } from '../features/profile/profileLogic'
import { useAvatarUrl, useMyProfile } from '../features/profile/useMyProfile'
import { endAuthSession } from '../lib/session'
import logoUrl from '../assets/logo.webp'

function navLinkClass(isActive: boolean): string {
  return [
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
    isActive ? 'bg-white/25 font-semibold text-white' : 'text-white/85 hover:bg-white/10',
  ].join(' ')
}

function bottomLinkClass(isActive: boolean): string {
  return [
    'flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] leading-tight transition-colors',
    isActive ? 'font-semibold text-white' : 'text-white/75',
  ].join(' ')
}

// Layout sau đăng nhập — design.md §7.2 (nền + overlay tối + backdrop-blur),
// sidebar desktop / bottom-nav mobile (uiux/skill.md §3).
// P12-T9: thanh HEADER mới — avatar (mở modal hồ sơ) + chấm online/offline +
// nút Đồng bộ ở góc TRÁI, logo ở góc PHẢI; bỏ 2 link Đổi mật khẩu /
// Đổi email khôi phục khỏi nav (vào qua modal hồ sơ — yêu cầu user 2026-10-04).
export default function AppLayout() {
  // P3-T8: role lấy từ RequireAuth đã kiểm tra (không đọc lại profiles).
  const profile = useAuthProfile()
  const isAdmin = profile?.role === 'admin'
  // P4-T3: 4 điểm chạm đồng bộ menu sống trong suốt thời gian người dùng ở layout.
  const sync = useMenuSync()
  const online = useOnlineStatus()
  // P12-T9: hồ sơ CỦA MÌNH (tên + avatar) — làm mới sau khi modal lưu xong.
  const { profile: myProfile, setProfile: setMyProfile } = useMyProfile()
  const [showProfile, setShowProfile] = useState(false)

  const displayName = myProfile?.display_name || myProfile?.username || profile?.role || ''
  const lastSync = sync.outcome?.fetchedAt ? formatClockTime(sync.outcome.fetchedAt) : null

  useEffect(() => {
    prefetchAllRoutes()
  }, [])

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden="true" className="app-bg absolute inset-0" />
      <div aria-hidden="true" className="absolute inset-0 bg-overlay backdrop-blur-md" />

      {/* P4-T6: thanh xác nhận cập nhật SW/version.json — luôn chờ người dùng bấm (design §8.6). */}
      <PwaUpdateBar />

      {/* P12-T9: header — avatar + trạng thái mạng + Đồng bộ (trái), logo (phải). */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/20 bg-dark-glass/80 px-3 py-2 backdrop-blur-xl"
        data-testid="app-header"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="profile-btn"
              aria-label="Mở hồ sơ tài khoản"
              className="flex min-w-0 items-center gap-2 rounded-full border border-white/30 bg-white/15 py-1 pl-1 pr-3 transition-colors hover:bg-white/25"
              onClick={() => setShowProfile(true)}
            >
              <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-white/25 text-[11px] font-bold">
                {avatarInitials(myProfile?.display_name ?? '', myProfile?.username ?? '')}
                {myProfile?.avatar_path ? <AvatarLayer path={myProfile.avatar_path} /> : null}
              </span>
              <span className="hidden max-w-[9rem] truncate text-xs font-medium sm:inline">
                {displayName}
              </span>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-emerald-400' : 'bg-red-400'}`}
                title={online ? 'Đang online' : 'Đang offline'}
                aria-label={online ? 'Đang online' : 'Đang offline'}
                data-testid="online-dot"
              />
            </button>
            <button
              type="button"
              data-testid="avatar-logout-btn"
              title="Đăng xuất"
              aria-label="Đăng xuất"
              onClick={async () => {
                await endAuthSession()
                window.location.href = '/login'
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 transition-colors hover:bg-red-500/30 hover:border-red-400/50 hover:text-red-200"
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            data-testid="sync-btn"
            className="glass-btn flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
            disabled={!online || sync.syncing}
            title={online ? 'Đồng bộ menu với server' : 'Đang offline — chờ có mạng'}
            onClick={() => void sync.syncNow()}
          >
            <RefreshCw size={14} aria-hidden="true" className={sync.syncing ? 'animate-spin' : ''} />
            {sync.syncing ? 'Đang đồng bộ…' : 'Đồng bộ'}
          </button>
          {lastSync && (
            <span className="hidden text-[11px] text-white/60 lg:inline" data-testid="last-sync">
              Đã đồng bộ {lastSync}
            </span>
          )}
        </div>

        <img src={logoUrl} alt="Hẻm Trà" className="h-9 w-auto shrink-0" />
      </header>

      <div className="relative flex min-h-dvh">
        <aside className="hidden w-60 shrink-0 md:block">
          <div className="sticky top-[57px] flex h-[calc(100dvh-57px)] flex-col gap-4 p-4">
            <nav className="flex flex-col gap-1" aria-label="Menu chính">
              {NAV_ITEMS.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => navLinkClass(isActive)}
                  onMouseEnter={() => prefetchRoute(to)}
                  onFocus={() => prefetchRoute(to)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-8 md:pt-6">
          <div className="mx-auto w-full max-w-5xl">
            {/* P4-T4: offline / giá cập nhật lúc … / cache quá 24 giờ */}
            <NetworkBanner />
            {/* P12-T4: 5 menu page là lazy chunk → Suspense giữ nguyên header/nav. */}
            <ErrorBoundary>
              <Suspense
                fallback={
                  <p role="status" className="py-10 text-center text-sm text-white/80">
                    Đang tải…
                  </p>
                }
              >
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-white/25 bg-dark-glass backdrop-blur-xl md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Menu chính"
      >
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            className={({ isActive }) => bottomLinkClass(isActive)}
            to={to}
            onMouseEnter={() => prefetchRoute(to)}
            onFocus={() => prefetchRoute(to)}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="whitespace-nowrap">{label}</span>
          </NavLink>
        ))}
      </nav>

      {showProfile ? (
        <ProfileModal
          initial={myProfile}
          isAdmin={isAdmin}
          onClose={() => setShowProfile(false)}
          onUpdated={(fresh) => setMyProfile(fresh)}
        />
      ) : null}
    </div>
  )
}

// Ảnh avatar chồng lên chữ viết tắt (signed URL 10 phút; lỗi → giữ nguyên chữ).
// Component riêng để hook useEffect không nằm trong render có điều kiện.
function AvatarLayer({ path }: { path: string }) {
  const { avatarUrl } = useAvatarUrl(path)
  if (!avatarUrl) return null
  return <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full rounded-full object-cover" />
}
