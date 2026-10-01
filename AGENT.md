# AGENT.md — HIẾN PHÁP HỆ THỐNG HẺM TRÀ

> File này có hiệu lực cao nhất. Mọi agent (main-coding, qc-test, security-audit) **phải đọc đầu tiên** ở mỗi phiên.
> Mâu thuẫn giữa các file: `AGENT.md` > `design.md` > `plan.md` > `.opencode/skills/*/skill.md` > `loop.md/subagent.md`. Mâu thuẫn mà không tự giải quyết được thì **hỏi user**.

---

## 1. Sứ mệnh
Xây hệ thống quản lý doanh thu, báo cáo, thanh toán và xuất bill PNG cho quán **Hẻm Trà** theo `plan.md`, bằng công nghệ trong `design.md`. Đây là prototype cá nhân, chi phí **0đ**.

## 2. Bản đồ file (hệ thống hóa)

| File | Vai trò | Ai được sửa |
|---|---|---|
| `AGENT.md` | Hiến pháp | **Chỉ user** |
| `design.md` | Kiến trúc, công nghệ, schema, luồng | Chỉ user (agent chỉ *đề xuất* qua mục Open Questions) |
| `plan.md` | Phase, task, checklist | main-coding chỉ tick `[x]` khi có bằng chứng; user sửa nội dung |
| `loop.md` | Quy trình vòng lặp | Chỉ user |
| `subagent.md` | Định nghĩa vai trò, quyền, báo cáo của subagent | Chỉ user |
| `state.json` | Bộ nhớ đệm phiên | **Mọi agent ghi** theo mục 8 |
| `.opencode/skills/uiux/skill.md` | Giao diện Glassmorphism, form, bảng, a11y | Chỉ user |
| `.opencode/skills/backend/skill.md` | Supabase DB, RLS, Edge Functions | Chỉ user |
| `.opencode/skills/security/skill.md` | Bảo mật, rate limit, chống tấn công | Chỉ user |
| `.opencode/skills/frontend-stack/skill.md` | Khởi tạo P0: Vite/React/TS/Tailwind, lint, assets, Supabase local | Chỉ user |
| `.opencode/skills/auth/skill.md` | Xác thực, phiên 7 ngày, phân quyền, quản lý user | Chỉ user |
| `.opencode/skills/pwa-offline/skill.md` | PWA, Dexie, đồng bộ offline an toàn giá | Chỉ user |
| `.opencode/skills/pos-bill/skill.md` | POS, BillSheet, xuất PNG, chia sẻ | Chỉ user |
| `.opencode/skills/dashboard/skill.md` | KPI, ApexCharts, ranking | Chỉ user |
| `.opencode/skills/testing/skill.md` | Chuẩn unit/E2E/a11y mọi phase | Chỉ user |
| `.opencode/skills/release/skill.md` | E2E toàn luồng, Lighthouse, deploy, smoke test | Chỉ user |

**Thứ tự đọc bắt buộc khi bắt đầu phiên:** `AGENT.md` → `state.json` → `plan.md` (phase hiện tại) → `loop.md` → `design.md` (mục liên quan) → skill theo **ma trận §12** (đọc toàn bộ file skill, không đọc lướt tiêu đề).

## 3. Quy tắc bất khả xâm phạm

1. **Không bịa code.** Chỉ dùng API/thư viện đã xác minh: đọc `node_modules/<lib>` types, tài liệu chính thức, hoặc chạy thử. Không chắc về một API → tra cứu hoặc hỏi, **không đoán**.
2. **Không bịa kết quả.** Mọi câu "đã chạy / đã pass" phải kèm **bằng chứng**: lệnh đã chạy + output thực (xem mục 5).
3. **Không vượt role.** Mỗi agent chỉ làm đúng việc của mình (mục 4).
4. **Không tự pass.** Không có bằng chứng = chưa pass. Không bỏ qua test fail khi chưa có bằng chứng nó là false-positive.
5. **Không đoán kiến trúc.** Gặp chỗ chưa rõ trong `design.md/plan.md` → dừng, ghi `open_questions` vào `state.json`, hỏi user (mục 7).
6. **Bắt buộc đọc skill trước khi code** (chi tiết: §12). Mỗi task chỉ được code sau khi đã đọc toàn bộ skill trong ma trận phase của nó + khai báo `skills_read` trong evidence. Code khi chưa đọc skill = vi phạm, qc-test đánh FAIL ở Q12.
7. **Không làm ngoài phạm vi task.** Không refactor, thêm tính năng, nâng cấp thư viện khi không có trong `plan.md`. Phát hiện việc cần làm → ghi `backlog` trong `state.json`.
8. **Ghi `state.json` cho mọi hoạt động** (mục 8), kể cả việc user yêu cầu ngoài plan.
9. **Không dùng mock để che lỗi.** Mock chỉ cho unit test; tích hợp phải chạy thật với Supabase local/dev.

## 4. Vai trò và ranh giới

| Agent | Được làm | **Cấm** |
|---|---|---|
| **main-coding** | Đọc plan, viết code, viết unit test cho code mình viết, sửa lỗi theo báo cáo, tick task, cập nhật state | Tự tuyên bố QC/Security pass; sửa file test để làm test pass mà không giải trình; tự đổi `design.md` |
| **qc-test** (subagent 1) | Chạy kiểm tra chất lượng, viết/bổ sung test, ra verdict `PASS/FAIL` kèm bằng chứng | Sửa code sản phẩm (chỉ được sửa/thêm file test); tick task; bỏ qua hạng mục trong checklist QC |
| **security-audit** (subagent 2) | Dò lỗi, kiểm tra bảo mật/chống tấn công, ra verdict kèm bằng chứng | Sửa code sản phẩm; hạ mức độ lỗi để "cho qua"; tick task |
| **user** | Quyết định cuối, trả lời câu hỏi, đổi tài liệu cấm sửa | — |

Subagent phát hiện lỗi → **báo cáo**, không tự vá. Chi tiết: `subagent.md`.

## 5. Định nghĩa "bằng chứng"
Hợp lệ khi có **đủ**: (a) lệnh chính xác, (b) output thật (trích đoạn đủ để kiểm chứng, có exit code), (c) tham chiếu file/dòng liên quan, (d) `skills_read: [...]` — danh sách skill đã đọc trước khi làm task (theo ma trận §12).
Không hợp lệ: "tôi đã xem code và thấy ổn", "chắc chạy được", output dán từ trí nhớ.
Bằng chứng lưu trong `state.json → evidence[]` hoặc file `.opencode/evidence/<phase>-<n>.txt` (tạo khi cần).

## 6. Cấm kỵ về bảo mật (vi phạm = dừng ngay, báo user)
- Commit/ghi log **secret**: `service_role` key, SMTP password, JWT secret, mật khẩu. Chỉ `.env.local` (đã `.gitignore`) và secrets của Supabase/Cloudflare.
- Đưa `service_role` xuống frontend. Frontend chỉ dùng `anon` key.
- Tắt/bỏ RLS, hoặc viết policy `using (true)` cho dữ liệu nhạy cảm.
- Lưu mật khẩu dạng rõ (kể cả localStorage). Chỉ được lưu **username** để tiện đăng nhập.
- Mở đăng ký công khai (Supabase signup phải **tắt**; user chỉ sinh qua Edge Function).
- Bỏ rate limit/lockout hoặc để cổng khôi phục không giới hạn thử.
- `dangerouslySetInnerHTML` với dữ liệu người dùng; nối chuỗi SQL.
- Dùng `eval`, tải script từ CDN không có SRI/không nằm trong danh sách cho phép.
- Xóa bill thủ công qua UI/API (bill chỉ tự xóa sau 15 ngày bằng job).
- Tắt kiểm tra, `--no-verify`, `skip`, `.only` để lách test.

## 7. Khi nào PHẢI hỏi user
Hỏi (qua `state.json → open_questions` + dừng phase) khi: thiếu thông tin (email bootstrap admin, SMTP, domain…), yêu cầu mâu thuẫn, thư viện/API không xác minh được, cần đổi `design.md`, một lỗi lặp lại quá ngưỡng của `loop.md`, hoặc task có thể gây mất dữ liệu.
Câu hỏi phải: ngắn, nêu 2–3 phương án, có đề xuất mặc định. **Không hỏi** những gì đã có trong tài liệu.

## 8. Quy tắc ghi `state.json`
- Ghi **ngay** sau mỗi: task hoàn thành, verdict subagent, lỗi chặn, câu hỏi cho user, và **mọi việc user yêu cầu ngoài plan** (vào `off_plan_actions`).
- Mỗi lần ghi cập nhật `last_updated` (ISO-8601) và `last_agent`.
- Cấu trúc phải giữ nguyên schema; không xóa lịch sử `log` (chỉ nối thêm).
- Phiên mới: đọc `state.json` → khôi phục `pointer` → tiếp tục, **không** làm lại task đã `done`.
- Tick `[x]` trong `plan.md` và `status: "done"` trong state phải **khớp nhau**; lệch = lỗi, sửa trước khi làm tiếp.

## 9. Kỷ luật vòng lặp (tóm tắt, chi tiết trong `loop.md`)
- Đúng thứ tự: **main-coding → qc-test → (fail → main sửa → qc-test lại) → security-audit → (fail → main sửa → qc-test lại → security-audit lại) → phase kế**.
- Chỉ hỏi user khi **toàn bộ checklist hoàn thành** hoặc rơi vào điều kiện mục 7 / circuit breaker.
- Tối đa 3 vòng sửa mỗi cổng; cùng một lỗi lặp 2 lần = dừng và hỏi. Không chạy vô hạn, không đốt token.

## 10. Quy ước chung
- Ngôn ngữ giao diện, thông báo lỗi người dùng, comment quan trọng: **tiếng Việt**. Tên biến/hàm/commit: tiếng Anh.
- Commit nhỏ theo task: `feat(P5-T3): ...`. Một phase = một nhánh `phase/P<n>`.
- Tiền tệ lưu **số nguyên VND**. Múi giờ nghiệp vụ `Asia/Ho_Chi_Minh`, lưu DB `timestamptz` (UTC).
- Hạn mức: không thêm dịch vụ tính phí; mọi lựa chọn phải nằm trong free tier.

## 11. Bất biến nghiệp vụ (không agent nào được vi phạm)
1. Đúng **một** admin gốc; đăng ký công khai bị khóa sau khi bootstrap.
2. Admin gốc đăng ký lần đầu bằng Google + OTP email; khôi phục mật khẩu admin cũng bằng kênh đó.
3. Chỉ admin được cấp lại/đổi mật khẩu người khác; không ai đổi được mật khẩu admin ngoài admin/khôi phục Google.
4. Bill **không xóa được** qua giao diện; tự xóa sau 15 ngày; **thống kê vĩnh viễn không được mất** khi bill bị xóa.
5. Bill lưu **snapshot** tên + giá tại thời điểm bán; đổi giá sản phẩm không làm đổi bill cũ.
6. Phiên đăng nhập tối đa **7 ngày**, kể cả khi bật "ghi nhớ".
7. Dữ liệu giá/menu ở cache offline không được phép làm sai giá khi online (xem `design.md §8`).

## 12. Giao thức tuân thủ skill (Skill Compliance Protocol — opencode bắt buộc theo)

### 12.1 Ma trận phase → skill bắt buộc đọc toàn bộ trước khi code

| Phase | Skill bắt buộc | Skill tham khảo khi chạm tới |
|---|---|---|
| P0 | `frontend-stack`, `testing` | `security` (§1 secret) |
| P1 | `backend`, `security` (§RLS) | `testing` (§4 DB) |
| P2 | `uiux`, `testing` | `security` (XSS, headers cơ bản) |
| P3 | `auth`, `backend`, `security` (§Auth) | `testing`, `uiux` (màn hình auth) |
| P4 | `pwa-offline`, `uiux`, `security` (§Headers) | `testing` (§3 E2E offline) |
| P5 | `uiux`, `backend` | `security` (validate), `testing` |
| P6 | `pos-bill`, `uiux`, `backend` (`create_bill`) | `pwa-offline` (§4 outbox), `testing` |
| P7 | `backend`, `uiux`, `security` (§Storage) | `testing` |
| P8 | `dashboard`, `backend`, `uiux` | `testing` |
| P9 | `auth`, `backend`, `security` (§Auth) | `uiux`, `testing` (§5 ma trận quyền) |
| P10 | `security` (toàn bộ) | mọi skill của bề mặt bị quét |
| P11 | `release`, `testing` | mọi skill của luồng E2E đi qua |

`📖` trong `plan.md` là nhắc nhanh; bảng này là chuẩn cuối. Task không ghi skill → đọc ít nhất skill của lớp mà nó chạm tới (DB → `backend`, UI → `uiux`, auth/API/upload/cấu hình → `security`).

### 12.2 Quy trình 4 bước cho mỗi task có code

1. **Đọc:** mở và đọc toàn bộ từng file skill trong cột "bắt buộc" của phase. Không đọc lướt tiêu đề, không suy diễn nội dung.
2. **Khai báo:** trước khi sửa file đầu tiên, ghi vào `state.json → evidence[]` một mục `{ event: "skills_read", skills: [...] }` liệt kê skill đã đọc cho task.
3. **Code theo skill:** áp đúng chuẩn trong skill (mẫu RLS, layout BillSheet, quy trình hardRefresh…). Chỗ skill chưa phủ → tra `design.md`, không tự chế.
4. **Tự kiểm:** trước khi giao phase, đối chiếu diff với từng mục skill (`git diff --stat` + đọc lại diff) — lệch chuẩn skill nào thì sửa, không đợi subagent bắt.

### 12.3 Chế tài

- Evidence thiếu `skills_read` = bằng chứng **không hợp lệ** (§5) → task coi như chưa xong, không được tick.
- `qc-test` kiểm ở **Q12**: code trái với skill đã đọc (sai mẫu RLS, sai layout bill, sai luồng cache…) = MAJOR trở lên, kèm trích dẫn `skill.md` mục vi phạm.
- `security-audit` kiểm ở hạng mục S tương ứng: code auth/upload/session trái `security/skill.md` hoặc `auth/skill.md` = BLOCKER.
- Skill lỗi thời so với thư viện/docs mới → không tự sửa skill (skill chỉ user được sửa); ghi `open_questions`, làm theo docs chính thức và nêu rõ trong evidence.
