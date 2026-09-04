# Kế hoạch xây dựng: Ứng dụng chia sẻ Video ngắn (TikTok/Reels-style) + AI Dịch & Lồng tiếng

## 1. Tổng quan
Web app cho phép người dùng đăng tải, xem, tương tác với video ngắn. Điểm khác biệt: tự động **dịch phụ đề và lồng tiếng AI** cho video sang nhiều ngôn ngữ (tương tự tính năng dubbing của Meta AI / Reels).

**Stack đề xuất:**
- Backend: Node.js + Express (MVC)
- Frontend: ReactJS (Vite) + Redux/Zustand
- DB: MongoDB (dữ liệu video/social) hoặc PostgreSQL (nếu cần quan hệ chặt hơn) + Redis (cache, queue)
- Storage/CDN: AWS S3/Cloudinary + CloudFront (hoặc tương đương)
- Realtime: Socket.IO (thông báo, comment live)
- Queue xử lý nền: BullMQ (Redis-based) — bắt buộc vì transcode video và AI dubbing là tác vụ nặng, chạy bất đồng bộ
- AI: Speech-to-Text, Machine Translation, Text-to-Speech/Voice Cloning (có thể dùng API bên thứ 3 hoặc model mã nguồn mở, cần nghiên cứu riêng)

---

## 2. Danh sách tính năng

### 2.1. Xác thực & Tài khoản (Auth)
- Đăng ký (email/số điện thoại, xác thực OTP/email)
- Đăng nhập / Đăng xuất
- Đăng nhập qua Google/Facebook (OAuth)
- Quên mật khẩu / Đặt lại mật khẩu
- JWT Access Token + Refresh Token
- Quản lý hồ sơ cá nhân (avatar, bio, username, đổi mật khẩu)

### 2.2. Quản lý Video
- Upload video (giới hạn dung lượng/thời lượng, kiểm tra định dạng)
- Transcode video (nén, tạo nhiều độ phân giải, tạo thumbnail) — xử lý qua job queue
- Thêm caption, hashtag, nhạc nền, gắn thẻ người dùng
- Cài đặt quyền riêng tư (công khai/riêng tư/chỉ bạn bè)
- Lưu nháp, chỉnh sửa, xoá video

### 2.3. Feed & Khám phá
- Feed "Dành cho bạn" (gợi ý dựa trên tương tác)
- Feed "Đang theo dõi"
- Tìm kiếm video/người dùng/hashtag/âm thanh
- Trang trending/hashtag
- Infinite scroll dạng cuộn dọc (giống TikTok)

### 2.4. Tương tác xã hội
- Like / Unlike video, comment
- Bình luận (kèm trả lời, like comment)
- Chia sẻ (nội bộ + copy link)
- Lưu/Bookmark video
- Follow/Unfollow người dùng
- Đếm view, thời gian xem (watch time)

### 2.5. Thông báo
- Thông báo real-time (like, comment, follow, mention) qua WebSocket
- Thông báo qua email (tuỳ chọn)

### 2.6. ⭐ Tính năng AI Dịch & Lồng tiếng video (điểm nhấn)
1. **Speech-to-Text**: trích xuất transcript kèm timestamp từ audio gốc của video
2. **Dịch văn bản**: dịch transcript sang ngôn ngữ đích (machine translation)
3. **Text-to-Speech / Voice Cloning**: tổng hợp giọng nói ngôn ngữ đích, cố gắng giữ đặc trưng giọng gốc (tuỳ mức độ đầu tư)
4. **Đồng bộ thời lượng (time-alignment)**: khớp audio đã dịch với thời lượng khung hình gốc
5. **(Nâng cao, optional) Lip-sync**: đồng bộ chuyển động môi với giọng lồng mới
6. Cho phép người xem **chọn ngôn ngữ lồng tiếng/phụ đề** ngay trên video player
7. Lưu nhiều **audio track** + **subtitle track** cho 1 video theo từng ngôn ngữ
8. Xử lý qua **job queue bất đồng bộ**, hiển thị trạng thái tiến trình (đang xử lý/hoàn tất/lỗi) cho người upload
9. Cache kết quả dịch/lồng tiếng để tránh xử lý lại

### 2.7. Quản trị (Admin)
- Quản lý người dùng, khoá/mở tài khoản
- Duyệt/gỡ video vi phạm, xử lý report
- Kiểm duyệt nội dung tự động (AI check nội dung nhạy cảm) — optional
- Dashboard thống kê (số user, video, lượt xem...)

### 2.8. Hạ tầng kỹ thuật khác
- Streaming video dạng HLS/DASH (thay vì phát file gốc)
- CDN phân phối video
- Rate limiting, chống spam upload
- Logging & monitoring

---

## 3. Cấu trúc thư mục Backend (Node.js + Express — MVC)

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   ├── redis.js
│   │   ├── cloudStorage.js
│   │   └── env.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Video.js
│   │   ├── Comment.js
│   │   ├── Like.js
│   │   ├── Follow.js
│   │   ├── Notification.js
│   │   ├── AudioTrack.js        # bản lồng tiếng theo từng ngôn ngữ
│   │   └── Subtitle.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   ├── video.controller.js
│   │   ├── comment.controller.js
│   │   ├── feed.controller.js
│   │   ├── notification.controller.js
│   │   ├── dubbing.controller.js    # API cho tính năng dịch/lồng tiếng
│   │   └── admin.controller.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── user.routes.js
│   │   ├── video.routes.js
│   │   ├── comment.routes.js
│   │   ├── feed.routes.js
│   │   ├── notification.routes.js
│   │   ├── dubbing.routes.js
│   │   ├── admin.routes.js
│   │   └── index.js
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── video.service.js
│   │   ├── transcode.service.js
│   │   ├── storage.service.js
│   │   ├── ai/
│   │   │   ├── speechToText.service.js
│   │   │   ├── translation.service.js
│   │   │   ├── textToSpeech.service.js
│   │   │   └── dubbingPipeline.service.js   # orchestrate toàn bộ pipeline
│   │   └── notification.service.js
│   ├── middlewares/
│   │   ├── auth.middleware.js
│   │   ├── upload.middleware.js       # multer
│   │   ├── error.middleware.js
│   │   ├── rateLimit.middleware.js
│   │   └── validate.middleware.js
│   ├── jobs/                          # BullMQ workers (xử lý nền)
│   │   ├── transcodeVideo.job.js
│   │   ├── generateDubbing.job.js
│   │   └── queue.js
│   ├── validators/
│   │   ├── auth.validator.js
│   │   └── video.validator.js
│   ├── utils/
│   │   ├── logger.js
│   │   ├── apiResponse.js
│   │   └── constants.js
│   ├── sockets/
│   │   └── notification.socket.js
│   ├── app.js
│   └── server.js
├── tests/
├── .env.example
├── package.json
└── README.md
```

**Ghi chú kiến trúc backend:**
- `controllers/` chỉ điều phối request/response, gọi `services/` để xử lý logic — giữ controller mỏng theo chuẩn MVC.
- `dubbingPipeline.service.js` là service điều phối chuỗi: Speech-to-Text → Translation → Text-to-Speech → ghép audio track vào video.
- `jobs/` tách riêng vì transcode & AI dubbing tốn thời gian, không nên xử lý đồng bộ trong request HTTP.

---

## 4. Cấu trúc thư mục Frontend (ReactJS)

```
frontend/
├── public/
├── src/
│   ├── api/                      # gọi backend API (axios)
│   │   ├── axiosClient.js
│   │   ├── auth.api.js
│   │   ├── video.api.js
│   │   ├── dubbing.api.js
│   │   └── notification.api.js
│   ├── assets/
│   ├── components/
│   │   ├── common/                 # Button, Modal, Spinner...
│   │   ├── layout/                 # Header, Sidebar, BottomNav
│   │   ├── video/                  # VideoCard, VideoPlayer, VideoUploader
│   │   ├── comment/                # CommentList, CommentInput
│   │   └── dubbing/                # LanguageSelector, DubbingStatusBadge
│   ├── pages/
│   │   ├── Home/
│   │   ├── Login/
│   │   ├── Register/
│   │   ├── Profile/
│   │   ├── Upload/
│   │   ├── VideoDetail/
│   │   ├── Search/
│   │   └── Admin/
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useInfiniteScroll.js
│   │   └── useVideoPlayer.js
│   ├── store/                      # Redux Toolkit hoặc Zustand
│   │   ├── slices/
│   │   │   ├── authSlice.js
│   │   │   ├── videoSlice.js
│   │   │   └── notificationSlice.js
│   │   └── index.js
│   ├── routes/
│   │   ├── AppRouter.jsx
│   │   └── PrivateRoute.jsx
│   ├── services/
│   │   └── socket.service.js
│   ├── utils/
│   ├── App.jsx
│   └── main.jsx
├── package.json
└── README.md
```

---

## 5. Gợi ý thứ tự triển khai (roadmap)
1. Auth + User (đăng ký/đăng nhập/hồ sơ)
2. Upload + Quản lý video cơ bản (chưa có AI)
3. Feed + Tương tác (like/comment/follow)
4. Thông báo real-time
5. Pipeline AI dịch & lồng tiếng (bắt đầu với Speech-to-Text + Translation + hiển thị phụ đề trước, sau đó mới thêm Text-to-Speech/dubbing)
6. Admin & kiểm duyệt nội dung
7. Tối ưu streaming (HLS), CDN, performance

---

*Lưu ý: phần AI (STT/dịch/TTS/voice cloning) có thể dùng dịch vụ API bên thứ ba để triển khai nhanh ở giai đoạn đầu, sau đó cân nhắc tự host model nếu cần kiểm soát chi phí/độ trễ.*
