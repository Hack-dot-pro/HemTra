import { Coffee, CreditCard, LayoutDashboard, Receipt, Users, type LucideIcon } from 'lucide-react'

export type NavItem = {
  to: string
  label: string
  Icon: LucideIcon
}

// Năm menu theo design.md §7.3
export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/products', label: 'Sản phẩm', Icon: Coffee },
  { to: '/pos', label: 'Thanh toán', Icon: CreditCard },
  { to: '/bills', label: 'Quản lý bill', Icon: Receipt },
  { to: '/users', label: 'Quản lý user', Icon: Users },
]
