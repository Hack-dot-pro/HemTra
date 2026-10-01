# subagent.md — Định nghĩa subagent

> Áp dụng cùng `AGENT.md` và `loop.md`. Subagent **không có trí nhớ giữa các lần gọi**: mọi thứ cần biết nằm trong *gói đầu vào* (mục 1) và `state.json`.

## 0. Nguyên tắc chung
- Chỉ **đọc + chạy lệnh kiểm tra + báo cáo**. `qc-test` được thêm/sửa **file test**; không sửa code sản phẩm. `security-audit` không sửa file nào ngoài báo cáo.
- Verdict chỉ có `PASS` hoặc `FAIL`. Không có "tạm ổn". `PASS` yêu cầu **bằng chứng** (AGENT.md §5).
- Không đủ thông tin để kết luận → `FAIL` loại *INCONCLUSIVE* kèm điều cần bổ sung (không tự đoán).
- Báo cáo **một lần, đầy đủ** (loop.md §4.2). Giữ ngắn.
- Không lặp lại cùng một lỗi đã báo nếu main đã sửa và bằng chứng cho thấy ổn; ngược lại báo lại kèm chữ ký.

## 1. Gói đầu vào chuẩn (main-coding tạo khi gọi)
```
phase: Pn
round: <số vòng của cổng này>
scope_files: [danh sách file đã đổi]      # từ git diff --name-only
tasks_done: [Pn-T1, Pn-T2, ...]
checklist: <mục QC hoặc SEC bên dưới>
prev_report: <báo cáo vòng trước, nếu có>
commands_hint: <các lệnh test liên quan>
```
Subagent phải tự kiểm lại `git diff` thực tế khớp `scope_files`; lệch → ghi vào báo cáo.

---

## 2. Subagent 1 — `qc-test`

**Mục tiêu:** chứng minh phase đạt tiêu chuẩn chất lượng và có unit test đúng chuẩn.

### 2.1 Checklist QC (tất cả hạng mục phải có kết quả)
| # | Hạng mục | Lệnh/Cách | Tiêu chí PASS |
|---|---|---|---|
| Q1 | Kiểu | `npm run typecheck` | 0 lỗi |
| Q2 | Lint | `npm run lint` | 0 lỗi (cảnh báo MINOR không chặn) |
| Q3 | Unit test | `npm run test -- --run` | 100% pass, không `.skip/.only` mới |
| Q4 | Test cho logic mới | Đối chiếu `tasks_done` ↔ test | Mỗi logic mới có test: happy path + biên + lỗi |
| Q5 | Coverage | `vitest --coverage` | ≥ 80% dòng cho `lib/` & `features/*/logic` đã chạm |
| Q6 | Chất lượng test | Đọc test | Không assert rỗng/luôn đúng; không mock che lỗi thật; tên mô tả hành vi |
| Q7 | Nghiệp vụ | Đối chiếu `design.md` | Tiền là số nguyên VND, quyền đúng bảng 4.1, snapshot giá, mã bill, v.v. |
| Q8 | DB (nếu phase chạm) | `supabase test db` | Pass; migration chạy sạch trên DB trống |
| Q9 | Build | `npm run build` | Thành công; không cảnh báo bundle vượt ngưỡng đã đặt |
| Q10 | UI (nếu chạm) | Playwright smoke + xem ảnh chụp | Không vỡ layout ở 390×844 và 1280×800; không lỗi console |
| Q11 | A11y cơ bản (UI) | axe qua Playwright | 0 vi phạm nghiêm trọng |
| Q12 | Phạm vi | `git diff --stat` | Không có thay đổi ngoài task; không file rác/secret |

### 2.2 Quy trình
1. Đọc gói đầu vào, `AGENT.md`, phần plan/design liên quan.
2. Chạy Q1→Q12 phù hợp phase (đánh dấu rõ hạng mục *N/A* kèm lý do).
3. Thiếu test cho logic mới → **tự viết test bổ sung** (file test), chạy, báo kết quả.
4. Test fail do code → báo lỗi, **không sửa code**.
5. Lập báo cáo.

### 2.3 Mẫu báo cáo QC
```
## QC REPORT — Phase Pn — Vòng r
VERDICT: PASS | FAIL
TÓM TẮT: <1–2 câu>
KẾT QUẢ THEO HẠNG MỤC:
  Q1 ✔/✘/N-A  <lệnh> → exit <code>  <trích output ≤5 dòng>
  ...
LỖI (nếu FAIL):
  [QC-001] BLOCKER|MAJOR|MINOR · <file:dòng> · sig:<hash>
    Bằng chứng: <output>
    Tái hiện: <lệnh/bước>
    Gợi ý hướng sửa: <1–2 dòng>
TEST ĐÃ BỔ SUNG: <file>
KHÔNG KIỂM ĐƯỢC: <nếu có, vì sao>
```

---

## 3. Subagent 2 — `security-audit`

**Mục tiêu:** dò lỗi theo kỹ thuật tiêu chuẩn, bảo mật và chống tấn công. Chỉ chạy khi QC của phase đã PASS.

### 3.1 Checklist SEC
| # | Hạng mục | Cách kiểm | Tiêu chí PASS |
|---|---|---|---|
| S1 | Secret | `gitleaks detect` + `grep` pattern key | Không có secret trong repo/bundle (`dist`) |
| S2 | Phụ thuộc | `npm audit --omit=dev` | Không lỗ hổng high/critical chưa được chấp nhận |
| S3 | RLS | Test SQL + thử truy cập bằng token từng role | Mọi bảng bật RLS; staff không đọc/ghi vượt quyền; không `using(true)` nhạy cảm |
| S4 | Phân quyền | Gọi trực tiếp API/Edge Function bằng token staff | Hành động admin-only bị từ chối **phía server** |
| S5 | Xác thực | Thử: sai mật khẩu liên tiếp, token hết hạn, token sửa, iat > 7 ngày | Lockout hoạt động; token quá hạn/sửa bị từ chối |
| S6 | Bootstrap | Thử bootstrap lần 2, email lạ | Bị từ chối |
| S7 | Injection/XSS | Nhập `<script>`, `"'`, payload SQL vào tên SP/ghi chú/username | Được escape; không thực thi; không lỗi SQL |
| S8 | IDOR | Truy cập bill/ảnh/ID của người khác bằng ID đoán | Chỉ truy cập được theo policy; signed URL hết hạn đúng |
| S9 | Storage | Thử upload sai loại/quá lớn/ghi đè/xóa từ client | Bị chặn; bucket private |
| S10 | Rate limit | Bắn nhanh đăng nhập/tạo bill/OTP | Bị giới hạn; OTP có giới hạn thử |
| S11 | Header | Kiểm `_headers`/phản hồi | CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy có mặt, không vỡ app |
| S12 | Cache/PWA | Kiểm SW | Không cache API/token/phản hồi có xác thực; `index.html`/`sw.js` no-cache |
| S13 | Dữ liệu nhạy cảm | Xem log/console/localStorage | Không lưu mật khẩu/token ngoài cơ chế session; không log PII |
| S14 | Logic nghiệp vụ | Thử gian lận | Gửi giá client sai → server tính lại; bill trùng `client_uuid` không nhân đôi; không xóa được bill; stats không mất khi dọn |
| S15 | Phiên | Kiểm cấu hình | Tối đa 7 ngày; "ghi nhớ" tắt thì không sống qua đóng trình duyệt |

### 3.2 Quy trình
1. Đọc gói đầu vào + `security/skill.md`.
2. Chạy công cụ tự động, rồi **thử tấn công thủ công có kịch bản** cho bề mặt mà phase chạm (P2, P5: phạm vi hẹp; P10, P11: toàn diện).
3. Mỗi phát hiện phải **tái hiện được** (lệnh/payload). Không báo lỗi suy đoán không có bằng chứng; nếu nghi ngờ mà chưa chứng minh → ghi vào mục *NGHI VẤN* (không chặn cổng).
4. Lập báo cáo; không sửa code.

### 3.3 Mẫu báo cáo SEC
```
## SEC REPORT — Phase Pn — Vòng r
VERDICT: PASS | FAIL
PHẠM VI: <hẹp|toàn diện> · BỀ MẶT: <liệt kê>
KẾT QUẢ: S1 ✔ … S15 ✘/✔/N-A (kèm lệnh + output ngắn)
LỖI (nếu FAIL):
  [SEC-001] BLOCKER|MAJOR|MINOR · CWE/OWASP:<mã> · <file:dòng> · sig:<hash>
    Tái hiện: <payload/lệnh>
    Tác động: <1 câu>
    Bằng chứng: <output>
    Gợi ý hướng sửa: <1–2 dòng>
NGHI VẤN (chưa chứng minh): …
```

---

## 4. Quy tắc phối hợp
1. Thứ tự cố định: QC → SEC. Sau mọi lần sửa do SEC, phải chạy **QC lại** trước khi SEC lại.
2. Cổng qua khi: không còn BLOCKER/MAJOR; MINOR ghi `backlog`.
3. Main-coding **chỉ sửa đúng các lỗi trong báo cáo**; sửa kèm tính năng mới = vi phạm.
4. Nếu main-coding cho rằng một lỗi là false-positive: phải nộp bằng chứng phản biện cho **subagent xác nhận lại**; không tự bỏ qua.
5. Subagent bất đồng với `design.md` → ghi `open_questions`, không tự diễn giải.
6. Mỗi báo cáo lưu tóm tắt vào `state.json → loop.last_report` (≤ 30 dòng) và đầy đủ ở `.opencode/evidence/`.
