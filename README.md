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

## Phân tích hệ thống

Sơ đồ nằm ở nhánh `backend`, thư mục
[`backend/diagrams`](https://github.com/hoangtukhoi/tiktak_demo/tree/backend/backend/diagrams):
use case (`usecase.jpg`), ERD (`erd.jpg`), class diagram (`class_diagram.png`).

**Tác nhân**

| Tác nhân | Quyền |
|---|---|
| Guest | Xem video, xem feed "Dành cho bạn", tìm kiếm, xem hồ sơ và bình luận |
| User | Kế thừa Guest. Đăng ký, đăng nhập (email hoặc Google), quản lý hồ sơ, quản lý video, tương tác, yêu cầu lồng tiếng |
| Admin / Moderator | Kế thừa User. Dashboard thống kê, khoá/mở tài khoản, duyệt/gỡ video, xử lý báo cáo |

**Thực thể chính**

| Thực thể | Vai trò |
|---|---|
| User | Tài khoản, `role` ∈ `user`, `admin`, `moderator`; giữ bộ đếm follower, following, video |
| Video | Video gốc, URL HLS, thumbnail; `status` ∈ `uploading`, `processing`, `ready`, `failed`; `moderationStatus` ∈ `pending`, `approved`, `removed`, `flagged` |
| Comment | Bình luận, trả lời một cấp qua `parentId`, xoá mềm |
| Like | Thích video hoặc bình luận (`targetType` ∈ `video`, `comment`) |
| Follow | Quan hệ theo dõi giữa hai User |
| AudioTrack | Bản lồng tiếng theo cặp video và ngôn ngữ; `status` ∈ `pending`, `transcribing`, `translating`, `synthesizing`, `done`, `failed` |
| Subtitle | Phụ đề VTT/SRT theo ngôn ngữ |
| Notification | Thông báo like, comment, follower mới, video sẵn sàng |
| Report, AuditLog | Báo cáo vi phạm và nhật ký thao tác của admin (thêm ở nhánh này, chưa có trong ERD) |

## API

Base URL: `http://localhost:5000/api`. Mọi phản hồi có dạng
`{ success, message, data }`, danh sách phân trang thêm `pagination`.
Lỗi trả về `{ success: false, message, errors? }`.

**Quy ước**

- Xác thực bằng header `Authorization: Bearer <accessToken>`. Access token sống
  15 phút, refresh token 7 ngày và được xoay vòng mỗi lần làm mới.
- Cột **Quyền**: `—` công khai, `Tuỳ chọn` có token thì trả thêm trạng thái cá
  nhân như đã like, đã follow, `User` bắt buộc đăng nhập, `Admin` cần role
  `admin` hoặc `moderator`.
- Phân trang cursor: `?cursor=<giá trị từ lần trước>&limit=<n>`. Phân trang
  trang: `?page=1&limit=20`. `limit` tối đa 50.
- Giới hạn tần suất: chung 500 request / 15 phút, auth 20 / 15 phút,
  upload 20 / giờ, lồng tiếng 30 / giờ. Vượt quá trả 429.
- Mã ngôn ngữ hỗ trợ: `vi`, `en`, `zh`, `ja`, `ko`, `fr`, `de`, `es`, `th`, `id`.

### Xác thực `/auth`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| POST | `/auth/register` | — | Đăng ký. Body: `username` (3–30, chữ số và `_`), `email`, `password` (≥ 6) |
| POST | `/auth/login` | — | Đăng nhập. Body: `email`, `password`. Trả `accessToken`, `refreshToken`, `user` |
| POST | `/auth/refresh` | — | Body: `refreshToken`. Trả cặp token mới |
| POST | `/auth/logout` | User | Body: `refreshToken` (tuỳ chọn) để thu hồi |
| GET | `/auth/me` | User | Thông tin tài khoản hiện tại |
| GET | `/auth/google` | — | Chuyển hướng sang Google, chỉ bật khi cấu hình client ID |
| GET | `/auth/google/callback` | — | Google gọi lại, chuyển hướng về frontend `/auth/callback` kèm token |

### Người dùng `/users`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/users/search` | — | Tìm người dùng. Query: `q`, `limit` (mặc định 10) |
| PATCH | `/users/me` | User | Cập nhật hồ sơ. Body: `username`, `bio` (≤ 150), `avatarUrl` |
| DELETE | `/users/me` | User | Xoá tài khoản |
| GET | `/users/:username` | Tuỳ chọn | Hồ sơ kèm tổng lượt thích, trạng thái đã follow |
| GET | `/users/:username/videos` | Tuỳ chọn | Video của người dùng, phân trang cursor |
| GET | `/users/:username/followers` | — | Danh sách người theo dõi, phân trang trang |
| GET | `/users/:username/following` | — | Danh sách đang theo dõi, phân trang trang |
| POST | `/users/:username/follow` | User | Theo dõi hoặc bỏ theo dõi |

### Upload `/upload`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| POST | `/upload` | User | `multipart/form-data`: file `video` (MP4/WebM/MOV, ≤ 500 MB, ≤ 10 phút), `title`, `description`, `hashtags`, `originalLang`, `isPrivate`. Trả 202 kèm `videoId`, `jobId` |
| POST | `/upload/presign` | User | Body: `extension`. Trả `uploadUrl` ký sẵn 15 phút và `key` để upload thẳng lên S3, sau đó gọi `POST /videos` với `originalKey` |
| GET | `/upload/:jobId/progress` | — | Server-Sent Events tiến trình transcode |

### Video `/videos`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| POST | `/videos` | User | Tạo video từ file đã upload qua presign. Body: `title`, `description`, `hashtags`, `originalKey` hoặc `originalUrl`, `originalLang`, `isPrivate`, `allowComment`, `allowDuet`, `duetOfVideoId` |
| GET | `/videos/:id` | Tuỳ chọn | Chi tiết video |
| PATCH | `/videos/:id` | User (chủ video) | Sửa `title`, `description`, `hashtags`, `originalLang`, `isPrivate`, `allowComment`, `allowDuet` |
| DELETE | `/videos/:id` | User (chủ video) | Xoá video |
| POST | `/videos/:id/like` | User | Thích hoặc bỏ thích |
| POST | `/videos/:id/view` | Tuỳ chọn | Ghi nhận lượt xem. Body: `watchTimeMs` |
| POST | `/videos/:id/report` | User | Báo cáo. Body: `reason` ∈ `spam`, `violence`, `nudity`, `hate_speech`, `misinformation`, `copyright`, `other`; `description`. Đủ 3 báo cáo thì video bị gắn cờ |
| GET | `/videos/search` | — | Tìm video. Query: `q`, `page`, `limit` |
| GET | `/videos/hashtags/trending` | — | Hashtag thịnh hành. Query: `days` (mặc định 7) |
| GET | `/videos/hashtags/:tag` | — | Video theo hashtag, phân trang cursor |

### Feed `/feed`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/feed/for-you` | Tuỳ chọn | Feed xếp hạng theo tương tác và độ mới, phân trang cursor |
| GET | `/feed/following` | User | Video từ người đang theo dõi, phân trang cursor |

### Bình luận `/comments`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/comments/video/:videoId` | Tuỳ chọn | Bình luận gốc của video, phân trang cursor |
| GET | `/comments/:id/replies` | Tuỳ chọn | Trả lời của một bình luận, phân trang cursor |
| POST | `/comments` | User | Body: `videoId`, `content` (1–500), `parentId` nếu là trả lời |
| DELETE | `/comments/:id` | User (chủ bình luận) | Xoá mềm |
| POST | `/comments/:id/like` | User | Thích hoặc bỏ thích bình luận |

### Thông báo `/notifications`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/notifications` | User | Danh sách, phân trang trang |
| GET | `/notifications/unread-count` | User | Số thông báo chưa đọc |
| PATCH | `/notifications/:id/read` | User | Đánh dấu một thông báo đã đọc |
| PATCH | `/notifications/read-all` | User | Đánh dấu tất cả đã đọc (cũng nhận `POST`) |

### Dịch và lồng tiếng `/dubbing`

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/dubbing/languages` | — | Ngôn ngữ được hỗ trợ |
| GET | `/dubbing/health` | — | Kiểm tra AI service |
| POST | `/dubbing/request` | User | Body: `videoId`, `targetLang`, `sourceLang` (tuỳ chọn, mặc định tự nhận dạng), `force` (bỏ qua cache). Trả `trackId` |
| GET | `/dubbing/:trackId/status` | — | Trạng thái và phần trăm xử lý |
| GET | `/dubbing/video/:videoId` | — | Danh sách audio track và phụ đề của video |
| DELETE | `/dubbing/:trackId` | User (chủ video hoặc admin) | Xoá bản lồng tiếng |

### Quản trị `/admin`

Toàn bộ yêu cầu role `admin` hoặc `moderator`. Mọi thao tác thay đổi đều được
ghi vào nhật ký.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/admin/stats` | Số liệu tổng quan: người dùng, video theo trạng thái, lượt xem, báo cáo chờ xử lý |
| GET | `/admin/users` | Danh sách người dùng. Query: `q`, `banned`, `page`, `limit` |
| POST | `/admin/users/:id/ban` | Khoá tài khoản. Body: `reason`. Không khoá được admin |
| POST | `/admin/users/:id/unban` | Mở khoá tài khoản |
| POST | `/admin/users/:id/verify` | Gắn tích xác thực |
| GET | `/admin/videos` | Danh sách video. Query: `status`, `moderationStatus`, `page`, `limit` |
| GET | `/admin/videos/flagged` | Hàng đợi kiểm duyệt kèm các báo cáo đang mở |
| POST | `/admin/videos/:id/approve` | Duyệt video, đóng các báo cáo liên quan |
| DELETE | `/admin/videos/:id` | Gỡ video. Body: `reason` |
| GET | `/admin/reports` | Danh sách báo cáo. Query: `status` ∈ `open`, `resolved`, `rejected`, `all` |
| GET | `/admin/audit-logs` | Nhật ký thao tác |

### Ngoài `/api`

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/health` | Kiểm tra server |

### Realtime (Socket.IO)

Kết nối tới `http://localhost:5000` với `auth: { token: <accessToken> }`.
Mỗi user tự vào room riêng khi kết nối.

| Chiều | Sự kiện | Dữ liệu |
|---|---|---|
| Client → Server | `video:subscribe` | `videoId`, theo dõi tiến trình của một video |
| Client → Server | `video:unsubscribe` | `videoId` |
| Server → Client | `notification` | Thông báo mới |
| Server → Client | `transcode:progress` | `{ videoId, percent, message }` |
| Server → Client | `dubbing:progress` | Trạng thái và phần trăm của audio track |

### Đối chiếu use case và API

| Use case | API |
|---|---|
| Đăng ký, đăng nhập email/Google, đăng xuất | `/auth/*` |
| Cập nhật thông tin | `PATCH /users/me` |
| Xem video, tìm kiếm | `/feed/*`, `GET /videos/:id`, `/videos/search`, `/users/search` |
| Quản lý video: upload, sửa, quyền riêng tư, xoá | `/upload`, `POST/PATCH/DELETE /videos/:id` |
| Chọn ngôn ngữ dịch | `/dubbing/*` |
| Like, comment, xoá comment, follow | `/videos/:id/like`, `/comments/*`, `/users/:username/follow` |
| Dashboard, khoá/mở tài khoản, duyệt/gỡ video | `/admin/*` |

Use case trong sơ đồ nhưng **chưa có API**:

- Đổi mật khẩu
- Upload/thay avatar (hiện chỉ đặt được `avatarUrl`)
- Lưu video
- Chia sẻ video (chưa có endpoint tăng `shareCount`)
- Chỉnh sửa phụ đề/bản dịch
- Thống kê lượt xem, tương tác cho chủ video

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
