import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './AppLayout.tsx'
import RequireAuth from './RequireAuth.tsx'
import LoginStage from '../features/auth/LoginStage.tsx'
import RecoveryStage from '../features/auth/RecoveryStage.tsx'
import ChangePasswordPage from '../features/auth/ChangePasswordPage.tsx'
import ChangeRecoveryEmailPage from '../features/auth/ChangeRecoveryEmailPage.tsx'
import SetupStage from '../features/setup/SetupStage.tsx'
// P12-T4: 5 menu page tách chunk riêng (bundle lần đầu nhẹ hơn) + prefetch
// khi hover/focus link (src/app/prefetch.ts) → vào trang là chạy ngay.
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage.tsx'))
const ProductsPage = lazy(() => import('../features/products/ProductsPage.tsx'))
const PosPage = lazy(() => import('../features/pos/PosPage.tsx'))
const BillsPage = lazy(() => import('../features/bills/BillsPage.tsx'))
const UsersPage = lazy(() => import('../features/users/UsersPage.tsx'))
import { useSessionExpiry } from '../features/auth/sessionGuard.ts'

// Định tuyến 5 menu (design.md §7.3). P3-T7: mọi route sau đăng nhập đi qua
// RequireAuth — chưa đăng nhập → /login, must_change_password → /change-password
// (role lấy từ profiles, design §4.1 — cả 2 role vào đủ 5 menu).
export function AppRoutes() {
  // P3-T5: tự đăng xuất khi phiên vượt 7 ngày (login_at) — không phải guard role.
  useSessionExpiry()
  return (
    <Routes>
      <Route path="/login" element={<LoginStage />} />
      {/* Đăng ký lần đầu — chỉ dùng được khi bootstrapped=false (design §4.2) */}
      <Route path="/setup" element={<SetupStage />} />
      {/* Khôi phục mật khẩu admin qua OTP (design §4.4) */}
      <Route path="/recovery" element={<RecoveryStage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="bills" element={<BillsPage />} />
          <Route path="users" element={<UsersPage />} />
          {/* Đổi mật khẩu bản thân — bắt buộc khi must_change_password (§4.1) */}
          <Route path="change-password" element={<ChangePasswordPage />} />
          {/* Đổi email khôi phục — 2 điều kiện Q-005 (§4.4); link chỉ hiện cho admin */}
          <Route path="change-recovery-email" element={<ChangeRecoveryEmailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
