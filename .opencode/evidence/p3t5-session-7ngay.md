# P3-T5 — Quản lý session: ghi nhớ + giới hạn 7 ngày + tự đăng xuất (2026-10-02)

## Scope (plan.md P3-T5, auth/skill.md §3)

- "ghi nhớ" bật → token + `login_at` ở `localStorage`; tắt → `sessionStorage`.
- Giới hạn 7 ngày: client kiểm tra `login_at`; server `session_fresh()` (đã có từ P1 — không migration mới).
- Hết hạn → tự đăng xuất → về `/login` với gợi ý "Phiên đăng nhập đã hết hạn."
- Không thêm route guard theo role (P3-T7), không nút logout thủ công (không nằm scope).

## Skills đã đọc (AGENT.md §12.1/§12.2)

`auth/skill.md` (§3 phiên 7 ngày), `backend/skill.md` (toàn bộ), `security/skill.md` (§2), `testing/skill.md`, `design.md §4.3` — evidence `skills_read` ghi trước khi sửa file đầu tiên.

## Thiết kế

1. **`src/lib/supabase.ts`** (mở rộng): `getSupabase()` lazy singleton — `createClient` với `auth.storage = routedAuthStorage` (đọc/ghi theo cờ `hemtra.remember`, **xóa khỏi cả 2 cửa hàng** khi đăng xuất — không sót token), `autoRefreshToken`, `detectSessionInUrl=false`.
2. **`src/lib/session.ts`**: `SESSION_MAX_AGE_MS` = 7 ngày; `applyAuthSession(session, remember)` — thứ tự **cờ "ghi nhớ" → ghi `login_at` → `setSession`** (không có khoảng trống "token có mà login_at không" khiến evaluateSession đăng xuất oan); lỗi setSession → xóa `login_at` + ném `CANNOT_SAVE_SESSION`; `endAuthSession()` — `signOut({scope:'local'})` (không cần mạng) + xóa `login_at` cả 2 store.
3. **`src/features/auth/sessionGuard.ts`**: `evaluateSession(hasSession, loginAt, now)` thuần (`none`/`ok`/`expired`, biên đúng 7 ngày = ok, vượt 1ms = expired, token mà mất `login_at` = expired); `useSessionExpiry()` chạy trong `AppRoutes` — kiểm tra khi mount + mỗi 60s, hết hạn → `endAuthSession` → `/login` state `sessionExpired`. **Không** dọn `login_at` khi chưa có session (tránh nuốt `login_at` của lần đăng nhập đang chạy dở — có test riêng).
4. **`signIn(username, password, remember)`** (P3-T4 mở rộng): sau khi EF trả session → `applyAuthSession`; lưu phiên thất bại → báo "Không thể lưu phiên đăng nhập, thử lại sau.", không báo thành công. `LoginStage` truyền `remember` từ checkbox; đọc `location.state.sessionExpired` → hint, dọn state cùng effect với `setupDone`.

## Lưu ý kỹ thuật (ghi vào evidence, không sửa design)

- `session_fresh()` (P1) so **`iat` của JWT** — access token được GoTrue refresh định kỳ nên `iat` luôn mới; lớp chặn "phiên liên tục quá 7 ngày" thực chất là **client `login_at`** (không được bump khi `TOKEN_REFRESHED`), `session_fresh()` chặn token cũ/bị tua lại (replay) dù client bị sửa. Đây là giới hạn của hosted Supabase Auth (không set max-session-age per project) — chấp nhận được cho mức độ dự án cá nhân; ghi nhận để QC/SEC biết.
- Không thêm e2e cho trạng thái hết hạn (cần seed phiên thật trong browser) — unit phủ đủ cả hook lẫn hàm thuần.

## Kiểm chứng

- `npm run typecheck` 0 · `npm run lint` 0
- `vitest` **133/133** (mới: `session.test.ts` 12, `sessionGuard.test.ts` 8, `sessionGuard.hook.test.tsx` 3, signIn +3, LoginStage +2) — coverage lines **95.66%**
- `npm run build` — js 509.68KB / **gzip 147.46KB** (< 250KB; +56KB gzip do supabase-js lần đầu được bundle — nằm ngân sách)
- `npx playwright test` **15/15** · `gitleaks` 0 leak
- Không migration mới; `supabase db advisors` không cần chạy lại (không đụng DB).

## File

Mới: `src/lib/session.ts` + test, `src/features/auth/sessionGuard.ts` + 2 test. Sửa: `src/lib/supabase.ts` (client + storage route), `src/features/auth/{signIn,signIn.test,LoginStage,LoginStage.test}.{ts,tsx}`, `src/app/routes.tsx`.
