// P12-T4 — prefetch chunk route khi người dùng hover/focus link menu.
// Cùng specifier với lazy() ở routes.tsx → Vite gộp chung 1 chunk, không tải trùng.
const ROUTE_LOADERS: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('../features/dashboard/DashboardPage.tsx'),
  '/products': () => import('../features/products/ProductsPage.tsx'),
  '/pos': () => import('../features/pos/PosPage.tsx'),
  '/bills': () => import('../features/bills/BillsPage.tsx'),
  '/users': () => import('../features/users/UsersPage.tsx'),
}

/** Không làm gì nếu route không có chunk (hoặc đã tải xong) — nuốt lỗi mạng. */
export function prefetchRoute(pathname: string): void {
  const load = ROUTE_LOADERS[pathname]
  if (load) void load().catch(() => undefined)
}
