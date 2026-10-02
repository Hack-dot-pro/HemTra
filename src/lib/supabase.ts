// Cấu hình Supabase cho frontend — P3-T3.
// Bất biến: frontend CHỈ dùng anon key (security/skill.md §1); mọi biến VITE_* đều công khai.
// Thiếu env → null/empty, caller phải degrade an toàn (không crash, không lộ lỗi console).

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseUrl: string | null = url ? url.replace(/\/+$/, '') : null
export const supabaseAnonKey: string | null = anonKey || null
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
