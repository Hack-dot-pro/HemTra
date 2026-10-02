import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './AppLayout.tsx'
import LoginStage from '../features/auth/LoginStage.tsx'
import DashboardPage from '../features/dashboard/DashboardPage.tsx'
import ProductsPage from '../features/products/ProductsPage.tsx'
import PosPage from '../features/pos/PosPage.tsx'
import BillsPage from '../features/bills/BillsPage.tsx'
import UsersPage from '../features/users/UsersPage.tsx'

// Định tuyến 5 menu (design.md §7.3). P2 chưa có phiên nên trang chủ = đăng nhập;
// route guard theo role sẽ làm ở P3-T7.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginStage />} />

      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="bills" element={<BillsPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
