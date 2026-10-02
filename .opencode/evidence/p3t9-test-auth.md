# Evidence P3-T9 — Test cho phase P3 (unit guard/session + Playwright auth)

- Ngày: 2026-10-02
- Kỹ năng đọc trước khi code: `testing/skill.md` (§1/§2/§3), `auth/skill.md` (§3/§4), `uiux/skill.md` (§3) — khai báo `skills_read` trong `state.json → evidence`.

## 1. File mới / sửa

| File | Nội dung |
|---|---|
| `e2e/p3-auth.spec.ts` (mới) | 11 test P3-T9 × 3 project (chromium/webkit/mobile) = 33 test — mock tầng **mạng** bằng `page.route()` theo hợp đồng EF thật; code app chạy thật |
| `e2e/helpers.ts` (sửa) | `injectAuth` thêm `loginAtMsAgo` (test hết hạn 7 ngày) và `expiredToken` (ép auth-js gọi refresh); thêm header CORS cho mock `profiles` |
| không đổi | unit `accessGuard.test.ts`, `sessionGuard.test.ts`, `sessionGuard.hook.test.tsx` (P3-T5/T7) — đã phủ guard + phiên 7 ngày, giữ nguyên |

## 2. Đối chiếu checklist P3-T9

| Yêu cầu trong plan.md | Test |
|---|---|
| bootstrap lần đầu → ẩn vĩnh viễn | `bootstrap xong → /setup tự ẩn vĩnh viễn, login hết link "Thiết lập lần đầu"` (mock `app_meta.bootstrapped=true`) + 2 test cũ `p3-setup.spec.ts` (đọc trạng thái thật) |
| bootstrap lần 2 / email lạ bị từ chối | `/setup — bootstrap lần 2 (409 "đã thiết lập") → thoát về /login` · `/setup — email lạ bị EF từ chối → hiện lỗi, vẫn ở /setup` |
| login sai/đúng | `đăng nhập đúng → vào Dashboard; sai → lỗi tiếng Việt, vẫn ở /login` |
| lockout sau 5 sai | `sai 5 lần → khóa → mở khóa bằng OTP khôi phục lượt đăng nhập` (401×4 → **429 locked** → `unlock-otp` → `unlock-verify`) |
| token sửa/hết hạn bị từ chối | `token hết hạn → refresh bị từ chối → về /login` (`/auth/v1/token` 401) · `token bị sửa → REST từ chối → màn "thử lại", không vào được app` |
| hết hạn 7 ngày | `phiên vượt 7 ngày (login_at) → tự đăng xuất kèm gợi ý` |
| khôi phục admin | `khôi phục mật khẩu admin 2 bước → về /login với gợi ý` (`admin-recovery` request-otp → verify) |
| đổi email khôi phục | `admin đổi email khôi phục 3 bước → tự đăng xuất, gợi ý đăng nhập mới` (đi link → request-current → request-new → complete → kiểm token bị xoá khỏi storage) · `nhân viên không có link và bị chặn ở màn đổi email khôi phục` (0 request EF) |

## 3. Số liệu

- `npm run test:e2e` → **69/69** (36 cũ + 33 mới), ~3.9 phút, cả 3 project.
- `npm run test -- --run` → **214/214** (22 file).
- `npm run typecheck` → 0 lỗi · `npm run lint` → 0 lỗi.
- Lỗi console trong spec mới **lọc đúng** chữ `Failed to load resource` (phản hồi 4xx có ý định của test) — mọi lỗi app/`pageerror` vẫn bị bắt; 0 lỗi khi pass.

## 4. Bẫy đã gặp (ghi lại để đỡ đốt giờ)

1. **JWT giả phải đúng `BASE64URL_REGEX` của auth-js** (`{4}*` + đuôi 2–3 ký tự): chữ ký `e2e-signature` (13 ký tự) làm `decodeJWT` ném `AuthInvalidJwtError` → `setSession` thất bại → UI báo "Không thể lưu phiên đăng nhập". Đổi thành `c2lnbmF0dXJl` (12) là qua.
2. **WebKit chặn fetch cross-origin thiếu header CORS** — mock EF/REST phải kèm `access-control-allow-*`, nếu không log `Fetch API cannot load ... due to access control checks` (nếu bỏ qua sẽ **pass giả** vì app rơi vào nhánh lỗi).
3. `getByLabel` mặc định khớp **phần con** → `'Tài khoản'` bắt cả checkbox "Ghi nhớ tài khoản", `'Mật khẩu mới'` bắt cả "Nhập lại mật khẩu mới" → cần `{ exact: true }`.
4. `endAuthSession()` trong màn đổi email được gọi `void` (không await) → assertion về token phải dùng `expect.poll`.

## 5. Hạn chế

- Như evidence `p3t7`/`p3t8`: test tích hợp với backend thật chờ local stack (B-001) hoặc tài khoản thật — ở đây mock **tầng mạng** theo hợp đồng EF (không mock code app), nên logic guard/session/UI chạy thật nhưng `profiles`/EF do test giả lập; không có mailbox thật nên OTP không gửi thật (smoke EF thật đã có ở P3-T8: 28/28).
- Unit `accessGuard`/`sessionGuard` giữ nguyên từ P3-T5/T7 (không sửa → không thêm test trùng).
