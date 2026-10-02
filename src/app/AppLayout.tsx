import { NavLink, Outlet } from 'react-router-dom'
import { KeyRound, Mail } from 'lucide-react'
import { NAV_ITEMS } from './nav'
import { useAuthProfile } from './authProfileContext'

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
export default function AppLayout() {
  // P3-T8: đổi email khôi phục là việc của admin (design §4.4) — staff không thấy link.
  // Role lấy từ RequireAuth đã kiểm tra (không đọc lại profiles, không tin claim).
  const profile = useAuthProfile()
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden="true" className="app-bg absolute inset-0" />
      <div aria-hidden="true" className="absolute inset-0 bg-overlay backdrop-blur-md" />

      <div className="relative flex min-h-dvh">
        <aside className="hidden w-60 shrink-0 md:block">
          <div className="sticky top-0 flex h-dvh flex-col gap-4 p-4">
            <div className="glass-card px-4 py-3 text-lg font-bold tracking-wide">Hẻm Trà</div>
            <nav className="flex flex-col gap-1" aria-label="Menu chính">
              {NAV_ITEMS.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>

            {/* P3-T7: đổi mật khẩu bản thân — không phải 1 trong 5 menu (§7.3)
                P3-T8: đổi email khôi phục — chỉ admin (design §4.4) */}
            <div className="mt-auto flex flex-col gap-1">
              <NavLink
                to="/change-password"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <KeyRound size={18} aria-hidden="true" />
                <span>Đổi mật khẩu</span>
              </NavLink>
              {isAdmin && (
                <NavLink
                  to="/change-recovery-email"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <Mail size={18} aria-hidden="true" />
                  <span>Đổi email khôi phục</span>
                </NavLink>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-8 md:pt-8">
          <div className="mx-auto w-full max-w-5xl">
            {/* Mobile: bottom-nav chỉ có 5 menu → lối vào đổi mật khẩu ở đây (§4.1) */}
            <div className="mb-3 flex justify-end gap-4 md:hidden">
              <NavLink
                to="/change-password"
                className="text-xs text-white/75 underline underline-offset-4"
              >
                Đổi mật khẩu
              </NavLink>
              {isAdmin && (
                <NavLink
                  to="/change-recovery-email"
                  className="text-xs text-white/75 underline underline-offset-4"
                >
                  Đổi email khôi phục
                </NavLink>
              )}
            </div>
            <Outlet />
          </div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-white/25 bg-dark-glass backdrop-blur-xl md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Menu chính"
      >
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => bottomLinkClass(isActive)}>
            <Icon size={20} aria-hidden="true" />
            <span className="whitespace-nowrap">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
