# security/skill.md — Bảo mật, rate limit, chống tấn công (dự án Hẻm Trà)

> Task đụng auth, API, upload, cấu hình → đọc file này TRƯỚC.
> Checklist audit đầy đủ (S1–S15 + mẫu báo cáo): `subagent.md §3`. Cấm kỵ tuyệt đối: `AGENT.md §6`.

## 1. Phân biệt key (sai là lộ toàn bộ DB)

- Frontend (React/PWA, Cloudflare Pages): CHỈ `SUPABASE_ANON_KEY`. Mọi biến `VITE_*` đều lộ ra browser.
- `SUPABASE_SERVICE_ROLE_KEY`: CHỈ trong Edge Functions / server. Vi phạm = dừng ngay, báo user (`AGENT.md §6`).
- Không commit/log secret: `service_role`, SMTP password, JWT secret, mật khẩu — chỉ trong `.env.local` (đã `.gitignore`) và secrets Supabase/Cloudflare.

## 2. Chuẩn áp dụng cho HemTra

- RLS bật mọi bảng (xem mẫu đúng ở `backend/skill.md §5`); signup công khai TẮT sau bootstrap; bootstrap chỉ qua Edge Function `bootstrap-admin` kiểm tra email trùng secret + `bootstrapped=false`.
- Lockout đăng nhập 5 lần/15 phút theo username + IP; Turnstile sau 3 lần sai; thông báo lỗi chung chung (không lộ user tồn tại hay không).
- Phiên tối đa 7 ngày (client `login_at` + server `session_fresh()` so iat JWT); "ghi nhớ" bật → `localStorage`, tắt → `sessionStorage`; không lưu mật khẩu ở bất cứ đâu, chỉ được nhớ username.
- Bill: không nút xóa, không xóa qua API; job `cleanup-bills` xóa file Storage qua API trước rồi mới xóa dòng DB; tuyệt đối không đụng `stats_*`.
- Bucket `bills` private; đọc bằng signed URL ngắn hạn; chặn upload sai loại/quá lớn/ghi đè/xóa từ client (upsert cần đủ INSERT + SELECT + UPDATE).
- Mật khẩu: không lưu plaintext (kể cả localStorage). `must_change_password` buộc đổi lần đầu. Staff không tự khôi phục — admin cấp lại.
- Chống XSS/SQLi: escape tên SP/ghi chú/username, không `dangerouslySetInnerHTML` với dữ liệu user, không nối chuỗi SQL, không `eval`, CDN phải có SRI và nằm trong danh sách cho phép.
- Headers qua `public/_headers`: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy; `index.html`/`sw.js` luôn no-cache.
- Service Worker KHÔNG cache API/token/phản hồi có xác thực. Không log PII/secret ra console.
- Validate zod cả client lẫn Edge Function. Rate limit tạo bill/phút + giới hạn OTP.

## 3. Lệnh kiểm tra (subagent `security-audit` chạy, main-coding tự quét trước khi giao)

```bash
gitleaks detect --source . -v        # S1: secret trong repo
npm audit --omit=dev                 # S2: lỗ hổng high/critical
supabase db advisors                 # RLS/views/functions nguy hiểm (CLI ≥ 2.81.3)
supabase test db                     # S3: test RLS từng bảng
```

## 4. Quy trình audit

1. Chạy tool tự động trước, đọc phần lỗi (cắt `tail`/`grep`).
2. Tấn công thủ công có kịch bản theo bề mặt phase chạm (P2/P5 hẹp: XSS, validate, quyền; P10/P11 toàn diện S1–S15).
3. Mỗi phát hiện phải tái hiện được (payload/lệnh + output); nghi ngờ chưa chứng minh → mục NGHI VẤN, không chặn cổng.
4. Không hạ BLOCKER để cho qua; MINOR ghi `backlog` (`loop.md §4.3`).
