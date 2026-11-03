# Nhật ký công việc — TikTak

Ghi lại những gì đã làm theo từng ngày (mới nhất ở trên cùng).
Mỗi lần làm thêm, thêm một mục ngày mới theo mẫu ở cuối file.

> Ngày của các mục trước 03/11/2026 được suy ra từ thời điểm sửa file trong dự án nên có thể lệch vài giờ.

---

## 03/11/2026 (Thứ Ba)

### Chuyển sang database và lưu trữ thật
- Chuyển MongoDB từ Docker local lên **MongoDB Atlas**: dùng cluster Free `tiktak` có sẵn trong Project 0, bật lại vì đang bị tạm dừng.
- Chuyển nơi lưu video/ảnh từ MinIO sang **AWS S3**, region **Sydney (ap-southeast-2)**.
  - Gói Free plan của AWS chỉ cho dùng một region: $100 credit, hết hạn 03/05/2027.
  - Tạo 3 bucket `tiktak-videos-hoangvu`, `tiktak-thumbnails-hoangvu`, `tiktak-audio-hoangvu`, bật đọc công khai bằng bucket policy, tạo IAM user riêng cho backend.
- Redis vẫn chạy bằng Docker, nên vẫn phải mở Docker Desktop.
- Đã so sánh các lựa chọn: MongoDB vs PostgreSQL, AWS S3 vs Cloudflare R2 vs Backblaze B2.

### Sửa lỗi frontend
- Bấm vào video hoặc người dùng từ trang tìm kiếm chỉ hiện màn hình đen.
  - Nguyên nhân: hiệu ứng thanh trượt `layoutId` ở tab "Video / Người dùng" làm kẹt hiệu ứng chuyển trang.
  - File sửa: `pages/Search/index.jsx`, `pages/Admin/index.jsx`, `routes/AppRouter.jsx`.

### Kiểm thử (Jest)
- Thêm **434 unit test** và **188 integration test** (API thật + MongoDB chạy trong bộ nhớ). Tổng **622 test đều đạt**.
- Lệnh chạy: `npm test`, `npm run test:unit`, `npm run test:integration`, `npm run test:coverage`.
- Phân tích giá trị biên và trường hợp đặc biệt nằm ở `backend/tests/TESTCASES.md`.
- **Lỗi tìm được nhờ test và đã sửa:**
  - Refresh token trùng nhau khi đăng nhập trong cùng 1 giây; đăng nhập/làm mới phiên cùng lúc bị lỗi 500.
  - Bình luận được vào video riêng tư, đã xoá hoặc bị gỡ của người khác; bình luận quá dài hoặc toàn khoảng trắng trả lỗi 500; trả lời được bình luận của video khác.
  - Bấm theo dõi/bỏ theo dõi liên tục làm bộ đếm bị âm hoặc lệch; xoá bình luận 2 lần cùng lúc trừ 2.
  - `?limit=-1` trả về toàn bộ dữ liệu.
  - Đăng ký được cả `ALICE` lẫn `alice`; tài khoản Google đăng nhập bằng mật khẩu bị lỗi 500.
  - Tab phân tích `constructor` / `__proto__` trả dữ liệu rác hoặc lỗi 500.

### Còn tồn đọng
- Video "can 5 lai" **chưa được nén 720p** (vẫn là file gốc 77 MB) nên mở chậm. Cần xem log backend dòng `[transcode] Encode failed`.
- Lỗi nhỏ chỉ ghi nhận, chưa sửa (chi tiết trong `TESTCASES.md`):
  - Client tự báo `completed: true` vẫn được tính là xem hết.
  - Nhập `instagram.com` không kèm đường dẫn bị hiểu thành tên tài khoản.
  - Chưa có quy tắc độ mạnh mật khẩu.
- Nên thêm `coverage/` vào `.gitignore`.

---

## 01/11/2026 (Chủ Nhật)

### Hồ sơ người dùng
- Form sửa hồ sơ thêm tên hiển thị, username (đổi tối đa 30 ngày/lần, không trùng tên hệ thống) và liên kết Website / Instagram / YouTube.
- Ảnh đại diện: tải ảnh lên thay cho nhập URL, có **xem trước + cắt/căn chỉnh**. Sửa lỗi không kéo được ảnh khi căn chỉnh.

### Trang phân tích dữ liệu (không gồm phần lồng tiếng/AI)
- **Admin:** tổng quan hệ thống, video/creator nổi bật, hashtag, kiểm duyệt, hàng đợi xử lý video.
- **Cá nhân**, theo kiểu TikTok Studio:
  - 4 tab Tổng quan / Nội dung / Người xem / Followers.
  - Khoảng thời gian 7 / 28 / 60 / 365 ngày.
  - Giờ hoạt động của người xem; "người xem của bạn cũng xem".
- **Từng video:** thời gian xem, tỷ lệ xem hết, đường giữ chân người xem, nguồn lượt xem, nhận xét tự động.
- **So sánh 2–3 video**; admin xem được phân tích của bất kỳ video nào.
- Ghi thêm sự kiện: lượt xem (`ViewEvent`), xem hồ sơ, chia sẻ, theo dõi. Script `npm run seed:analytics` để tạo dữ liệu mẫu.

---

## 26/10/2026 (Thứ Hai)

### Rà soát và hợp nhất code
- Kiểm tra cấu trúc backend; pull nhánh `master`.
- Merge `master` vào nhánh `backend`, xung đột thì giữ phiên bản của Trung2k4.
- Sửa backend cho khớp frontend mới.

### Sửa lỗi backend
- Bảo mật: chặn tài khoản bị khoá; ẩn email trên hồ sơ công khai; khoá nội bộ cho endpoint của pipeline; escape regex khi tìm kiếm; CORS theo `FRONTEND_URL`.
- Xoá video chuyển sang xoá mềm (`deleted`), dọn dữ liệu liên quan.
- Phân trang feed và danh sách video thống nhất theo số trang.

### Tốc độ tải video
- Nén video về **720p H.264 + faststart** khi upload.
- Cache feed "Dành cho bạn" bằng Redis; cache trình duyệt cho file video/ảnh.
- Script `npm run retranscode` để nén lại các video cũ.

### Upload và lồng tiếng
- Sửa lỗi upload xong không xem được (403): bucket MinIO chưa mở quyền đọc công khai.
- Sửa service lồng tiếng: thêm `ai-service` (FastAPI: faster-whisper, NLLB-200, edge-tts) vào docker-compose; thêm chế độ giả lập `AI_MOCK`.

---

## Mẫu cho lần sau

```markdown
## DD/MM/YYYY (Thứ ...)

### <Nhóm việc>
- Việc đã làm — file liên quan
- Lỗi đã sửa: nguyên nhân → cách sửa

### Còn tồn đọng
- ...
```
