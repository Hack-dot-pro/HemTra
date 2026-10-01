# loop.md — Quy trình vòng lặp (ReAct loop engineering, kiến trúc OpenCode)

> Mục tiêu: hoàn thành toàn bộ checklist `plan.md` với **ít token nhất**, **không kẹt vòng lặp**, **không tự pass**.
> Chỉ hỏi user khi hết checklist hoặc chạm điều kiện dừng ở mục 6.

## 1. Vai trò

```
main-coding ──► qc-test ──► security-audit ──► (phase kế)
     ▲             │  FAIL          │ FAIL
     └─────────────┴────────────────┘   (sửa → quay lại QC, sau đó mới tới SEC)
```
Định nghĩa chi tiết, quyền, mẫu báo cáo: `subagent.md`.

## 2. Vòng lặp chính (mỗi phase)

```
START_PHASE(Pn)
 0. Nạp ngữ cảnh: AGENT.md → state.json → plan.md[Pn] → skill liên quan → design.md (mục cần)
 1. CODE   : main-coding làm lần lượt từng task Pn-Tk
              (suy nghĩ → hành động → quan sát → ghi state → tick khi có bằng chứng)
              Chạy nhanh lint/typecheck/test cục bộ sau mỗi task.
 2. QC     : gọi qc-test(phase=Pn, scope=diff của phase)
              ├ PASS → sang bước 3
              └ FAIL → main-coding sửa đúng các lỗi trong báo cáo → quay lại bước 2   [qc_round += 1]
 3. SEC    : gọi security-audit(phase=Pn, scope=diff + bề mặt tấn công liên quan)
              ├ PASS → bước 4
              └ FAIL → main-coding sửa → **QC lại (bước 2)** → rồi SEC lại             [sec_round += 1]
 4. CHỐT   : ghi state (phase=done, evidence), tick Gate trong plan.md, commit
 5. Còn phase → START_PHASE(Pn+1)   |   hết phase → HỎI USER (báo cáo cuối)
```

**Không** hỏi user giữa các phase nếu không có điều kiện dừng.

## 3. Chu trình ReAct của từng agent (mỗi bước)
1. **Thought** — 1–3 dòng: việc kế tiếp là gì, cần file nào, giả định nào cần kiểm chứng.
2. **Action** — một hành động nhỏ (đọc file / sửa file / chạy lệnh).
3. **Observation** — ghi nhận output **thực**; không suy diễn thêm.
4. **Decide** — tiếp tục / sửa hướng / hỏi user. Có `Observation` mâu thuẫn với giả định → bỏ giả định, không ép.
Ngắn gọn; không lặp lại nguyên văn tài liệu; không dán file dài vào thinking.

## 4. Chống kẹt vòng lặp & tiết kiệm token (BẮT BUỘC)

### 4.1 Ngưỡng cứng (đọc từ `state.json → limits`)
| Chỉ số | Mặc định | Khi chạm |
|---|---|---|
| `max_qc_rounds` mỗi phase | **3** | Dừng, tạo báo cáo kẹt, hỏi user |
| `max_sec_rounds` mỗi phase | **3** | như trên |
| `max_total_rounds` mỗi phase (QC+SEC) | **5** | như trên |
| Cùng **chữ ký lỗi** lặp lại | **2 lần** | Dừng ngay (không đợi hết ngưỡng) |
| Số lần thử sửa một lỗi (main) | **2** | Lần 3 → hỏi user, kèm 2–3 phương án |
| Lệnh/giờ không có tiến triển | **3 hành động liên tiếp** không đổi trạng thái | Dừng, đổi cách tiếp cận hoặc hỏi |

**Chữ ký lỗi** = `sha1(tên test hoặc rule + file + thông điệp lỗi đã chuẩn hóa)`. Subagent phải ghi chữ ký vào báo cáo; main so với `state.json → loop.failure_signatures`. Trùng 2 lần = vòng lặp vô ích.

### 4.2 Giảm lãng phí
- **Cô lập phạm vi:** subagent chỉ nhận *diff của phase* + danh sách file liên quan + checklist; **không** đọc lại toàn repo.
- **Công cụ trước, LLM sau:** `lint`, `tsc`, `vitest`, `supabase test db`, `gitleaks`, `npm audit` chạy bằng lệnh và chỉ đọc phần **lỗi** của output (cắt `tail`/`grep`). Subagent dùng suy luận cho phần máy không bắt được.
- **Tái kiểm tối thiểu:** sau fix chỉ chạy lại **bộ test đã fail + bộ test chạm tới file đã sửa** trước; chạy full suite một lần ở vòng cuối của cổng đó.
- **Một báo cáo, một lần sửa:** subagent gom **toàn bộ** lỗi trong một báo cáo (xếp theo mức độ). Cấm báo lẻ từng lỗi mỗi vòng.
- **Báo cáo tối giản:** lỗi = `id · mức độ · file:dòng · bằng chứng (≤ 10 dòng) · cách tái hiện · gợi ý hướng sửa (1–2 dòng)`.
- **Không viết lại file lớn** để sửa lỗi nhỏ; dùng sửa cục bộ.
- **Tóm tắt, không dán lại:** ngữ cảnh phiên mới lấy từ `state.json`, không đọc lại lịch sử chat.
- **Nén ngữ cảnh:** khi hội thoại dài, ghi trạng thái vào `state.json` rồi tiếp tục từ đó.

### 4.3 Phân loại lỗi để không "sửa mãi"
| Mức | Ví dụ | Xử lý |
|---|---|---|
| **BLOCKER** | Lỗ hổng bảo mật, mất dữ liệu, test cốt lõi fail | Bắt buộc sửa mới qua cổng |
| **MAJOR** | Sai nghiệp vụ, thiếu test cho logic mới | Bắt buộc sửa |
| **MINOR** | Đặt tên, style, tối ưu nhỏ | **Không chặn** cổng; ghi vào `backlog` |
Subagent **không** được nâng MINOR thành BLOCKER để kéo dài vòng lặp, cũng không hạ BLOCKER xuống để cho qua (xem AGENT.md).

## 5. Khi nào chạy cổng nào
- Bắt buộc QC + SEC ở **cuối mỗi phase**.
- Phase P2 (UI) và P5 (sản phẩm): SEC chỉ quét bề mặt liên quan (XSS, validate, quyền) — không audit lại toàn hệ thống.
- **P10 và P11**: SEC chạy toàn diện.
- Main-coding **không** gọi subagent giữa chừng từng task (tốn token); chỉ tự chạy lint/typecheck/test.

## 6. Điều kiện DỪNG & HỎI USER
Dừng vòng lặp, ghi `state.json → open_questions` / `blockers`, rồi hỏi **một lần, gọn** khi:
1. Hoàn thành toàn bộ checklist (báo cáo cuối).
2. Chạm ngưỡng ở 4.1 (kèm báo cáo kẹt: đã thử gì, bằng chứng, 2–3 phương án).
3. Task có đánh dấu ❓ trong `plan.md` chưa có thông tin.
4. Cần đổi `design.md`/`plan.md`/`AGENT.md`.
5. Gặp rủi ro mất dữ liệu hoặc vi phạm điều cấm trong AGENT.md §6.
6. Thư viện/API không xác minh được hành vi.
7. Công cụ hạ tầng hỏng (Supabase/CLI không chạy) và không tự khắc phục được sau 2 lần.

Báo cáo kẹt dùng mẫu:
```
PHASE: Pn   VÒNG: qc=a sec=b
VẤN ĐỀ: <1 câu>
CHỮ KÝ LỖI: <hash>
ĐÃ THỬ: 1) … 2) …
BẰNG CHỨNG: <lệnh + output ngắn>
PHƯƠNG ÁN: A) … B) … (đề xuất: A)
```

## 7. Mẫu ghi `state.json` theo bước
| Sự kiện | Trường cần cập nhật |
|---|---|
| Bắt đầu task | `pointer`, `phases[Pn].tasks[Pn-Tk].status="in_progress"` |
| Xong task | `status="done"`, `evidence[]`, tick `[x]` plan.md, `log[]` |
| Gọi/nhận subagent | `loop.qc_round/sec_round`, `loop.failure_signatures`, `log[]` |
| Verdict | `phases[Pn].gates.qc / .sec` = `PASS/FAIL` + `evidence` |
| Đóng phase | `phases[Pn].status="done"`, `pointer` → phase kế, reset `loop.*_round` |
| Việc ngoài plan | `off_plan_actions[]` |
| Câu hỏi/chặn | `open_questions[]` / `blockers[]` |

## 8. Khôi phục phiên (hết limit / mở phiên mới)
1. Đọc `AGENT.md` → `state.json`.
2. Đối chiếu `pointer` với tick trong `plan.md`; lệch → sửa trước.
3. Nếu `pointer` ở giữa vòng QC/SEC: đọc báo cáo mới nhất trong `state.json → loop.last_report` và tiếp tục **đúng bước đó**, không làm lại từ đầu phase.
4. Chạy `git status`/`git diff --stat` để xác nhận trạng thái thật khớp state.
5. Ghi `log[]`: "resume from <pointer>".
