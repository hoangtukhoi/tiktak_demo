# TikTak

Nền tảng chia sẻ video ngắn có tích hợp dịch và lồng tiếng tự động bằng AI.
Đồ án môn học, gồm ba phần: backend Node.js, frontend React và một AI service
viết bằng Python.

## Tính năng

**Người dùng**

- Feed dọc dạng snap-scroll, phát HLS, tải thêm theo con trỏ
- Hai feed: "Dành cho bạn" xếp hạng theo tương tác và độ mới, "Đang theo dõi"
- Upload video, theo dõi tiến trình transcode theo thời gian thực
- Like, bình luận một cấp trả lời, chia sẻ, theo dõi người dùng
- Tìm kiếm video và người dùng, hashtag thịnh hành
- Thông báo realtime qua Socket.IO
- Báo cáo video vi phạm

**Dịch và lồng tiếng**

- Nhận dạng lời thoại kèm mốc thời gian bằng Whisper
- Dịch từng segment sang 10 ngôn ngữ bằng NLLB-200
- Tổng hợp giọng nói ngôn ngữ đích, tự co giãn tốc độ đọc để khớp khung hình
- Sinh phụ đề VTT cho cả ngôn ngữ gốc và ngôn ngữ đích
- Người xem chọn ngôn ngữ ngay trên player
- Kết quả được cache theo cặp video và ngôn ngữ, không xử lý lại

**Quản trị**

- Dashboard số liệu người dùng, video, lượt xem, báo cáo chờ xử lý
- Hàng đợi kiểm duyệt, tự động gắn cờ video khi đủ 3 báo cáo
- Khoá và mở khoá tài khoản, xác thực tài khoản
- Nhật ký thao tác của admin

Chi tiết hai luồng xử lý nền: xem [docs/PIPELINE.md](docs/PIPELINE.md).

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Backend | Node.js, Express, MongoDB, Mongoose |
| Hàng đợi | Redis, BullMQ |
| Realtime | Socket.IO, Server-Sent Events |
| Xác thực | JWT với refresh token xoay vòng, Passport, Google OAuth |
| Xử lý media | FFmpeg qua fluent-ffmpeg |
| Lưu trữ | MinIO hoặc AWS S3 |
| Frontend | React 18, Vite, Zustand, React Router, Tailwind CSS, HLS.js |
| AI service | Python, FastAPI, faster-whisper, NLLB-200, edge-tts |

## Cấu trúc thư mục

```
tiktak_demo/
├── backend/            API server và worker
│   └── src/
│       ├── config/         env, database, redis, s3, passport
│       ├── models/         User, Video, Comment, Like, Follow,
│       │                   Notification, AudioTrack, Subtitle,
│       │                   Report, AuditLog
│       ├── controllers/    Điều phối request và response
│       ├── services/       Logic nghiệp vụ
│       │   └── ai/         aiClient, stt, translation, tts, dubbingPipeline
│       ├── jobs/           Worker BullMQ: transcode và dubbing
│       ├── routes/         Express router
│       ├── middlewares/    auth, upload, validate, rateLimit, error
│       ├── validators/     Joi schema
│       ├── sockets/        Socket.IO gateway
│       ├── scripts/        seed dữ liệu mẫu
│       ├── app.js          Khởi tạo Express
│       ├── server.js       API server, chạy kèm worker
│       └── worker.js       Worker chạy tiến trình riêng
├── frontend/           React + Vite
│   └── src/
│       ├── api/            axiosClient và các module gọi API
│       ├── components/     common, layout, video, comment, dubbing
│       ├── pages/          Home, Login, Register, AuthCallback, Profile,
│       │                   Upload, VideoDetail, Search, Admin
│       ├── hooks/          useAuth, useVideoPlayer, useInfiniteScroll
│       ├── store/slices/   auth, video, notification
│       └── services/       socket.service
├── ai-service/         FastAPI: /transcribe, /translate, /tts
├── docs/PIPELINE.md    Mô tả chi tiết pipeline
├── docker-compose.yml  MongoDB, Redis, MinIO, AI service
└── plan.md             Kế hoạch ban đầu của nhóm
```

## Chạy dự án

### Yêu cầu

- Node.js 18 trở lên
- Docker và Docker Compose, hoặc tự cài MongoDB, Redis, MinIO
- FFmpeg trong PATH
- Python 3.11 nếu chạy AI service ngoài Docker

### 1. Hạ tầng

```bash
docker compose up -d mongo redis minio minio-init
```

Lệnh này tạo sẵn ba bucket `tiktak-videos`, `tiktak-thumbnails`,
`tiktak-audio` và mở quyền đọc công khai cho chúng.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env     # sửa JWT secret trước khi dùng thật
npm run seed             # tạo tài khoản và video mẫu, không bắt buộc
npm run dev
```

Muốn tách worker khỏi API server thì đặt `RUN_WORKERS_IN_API=false` trong
`.env` rồi mở thêm một terminal chạy `npm run worker`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. AI service

```bash
docker compose up -d ai-service
```

Hoặc chạy trực tiếp, xem [ai-service/README.md](ai-service/README.md).
Lần đầu khởi động sẽ tải model về, mất vài phút.

Không có AI service thì upload, feed và tương tác vẫn chạy bình thường,
chỉ riêng yêu cầu lồng tiếng sẽ báo lỗi.

### Địa chỉ

| Thành phần | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000/api |
| Health check | http://localhost:5000/health |
| MinIO console | http://localhost:9001 |
| AI service docs | http://localhost:8002/docs |

Tài khoản admin sau khi chạy seed: `admin@tiktak.local` / `admin123`.

## API

Mọi phản hồi có dạng `{ success, message, data }`.

**Xác thực**

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký |
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/refresh` | Cấp lại access token |
| POST | `/api/auth/logout` | Thu hồi refresh token |
| GET | `/api/auth/me` | Thông tin tài khoản hiện tại |
| GET | `/api/auth/google` | Đăng nhập Google, chỉ bật khi có client ID |

**Video và feed**

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/upload` | Tải file video lên, trả về `videoId` và `jobId` |
| GET | `/api/upload/:jobId/progress` | SSE tiến trình transcode |
| GET | `/api/feed/for-you` | Feed gợi ý, phân trang bằng cursor |
| GET | `/api/feed/following` | Feed người đang theo dõi |
| GET | `/api/videos/:id` | Chi tiết video |
| POST | `/api/videos/:id/like` | Thích hoặc bỏ thích |
| POST | `/api/videos/:id/view` | Ghi nhận lượt xem và thời gian xem |
| POST | `/api/videos/:id/report` | Báo cáo vi phạm |
| GET | `/api/videos/search` | Tìm kiếm video |
| GET | `/api/videos/hashtags/trending` | Hashtag thịnh hành |

**Dịch và lồng tiếng**

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/dubbing/request` | Yêu cầu tạo bản lồng tiếng |
| GET | `/api/dubbing/:trackId/status` | Trạng thái và phần trăm xử lý |
| GET | `/api/dubbing/video/:videoId` | Danh sách audio track và phụ đề |
| GET | `/api/dubbing/languages` | Ngôn ngữ được hỗ trợ |
| GET | `/api/dubbing/health` | Kiểm tra AI service |

**Người dùng, bình luận, quản trị**

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/users/:username` | Hồ sơ kèm tổng lượt thích |
| POST | `/api/users/:username/follow` | Theo dõi hoặc bỏ theo dõi |
| GET | `/api/comments/video/:videoId` | Bình luận gốc, phân trang cursor |
| POST | `/api/comments` | Đăng bình luận hoặc trả lời |
| GET | `/api/admin/stats` | Số liệu tổng quan |
| GET | `/api/admin/videos/flagged` | Hàng đợi kiểm duyệt |
| GET | `/api/admin/audit-logs` | Nhật ký thao tác |

## Tiến độ

- [x] Xác thực, refresh token xoay vòng, Google OAuth
- [x] Upload, transcode HLS nhiều mức chất lượng, thumbnail
- [x] Feed, like, bình luận, follow, thông báo realtime
- [x] Pipeline dịch và lồng tiếng đầy đủ, có cache và báo tiến trình
- [x] AI service FastAPI: Whisper, NLLB-200, edge-tts
- [x] Trang quản trị: số liệu, kiểm duyệt, nhật ký thao tác
- [ ] Voice cloning giữ đặc trưng giọng gốc
- [ ] Lip-sync bằng Wav2Lip
- [ ] Gợi ý nội dung bằng vector search
- [ ] CDN cho HLS
- [ ] Ứng dụng di động

## Ghi chú

Dự án phục vụ mục đích học tập.
