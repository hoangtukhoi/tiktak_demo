# 🎬 TikTak

> Nền tảng chia sẻ video ngắn — Clone TikTok / Reels / YouTube Shorts  
> Tích hợp AI dịch & lồng tiếng tự động (như Meta AI Dubbing) và hệ thống gợi ý nội dung

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white"/>
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black"/>
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white"/>
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white"/>
  <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white"/>
</p>

---

## ✨ Tính năng chính

### 📱 Người dùng
- **Feed video ngắn** — Cuộn dọc snap-scroll như TikTok, phát HLS tự động
- **For You / Following** — Feed cá nhân hoá và feed từ người theo dõi
- **Tương tác** — Like, comment, reply, share, follow/unfollow
- **Upload video** — Kéo thả, validate, theo dõi tiến trình transcode real-time (SSE)
- **Tìm kiếm** — Tìm video, người dùng, hashtag; trending hashtags
- **Thông báo real-time** — Socket.IO cho like, comment, follow, dubbing done

### 🤖 AI Dịch & Lồng tiếng (Điểm nhấn)
- **Speech-to-Text** (Whisper) — Trích xuất transcript + timestamp từ audio gốc
- **Dịch thuật** (SeamlessM4T) — Dịch transcript sang 10+ ngôn ngữ
- **Text-to-Speech / Voice Cloning** — Tổng hợp giọng nói ngôn ngữ đích
- **Đồng bộ thời lượng** — Khớp audio dịch với khung hình gốc
- **Lip-sync** (Wav2Lip, optional) — Đồng bộ chuyển động môi
- Người xem chọn **ngôn ngữ phụ đề / lồng tiếng** ngay trên player
- Xử lý **bất đồng bộ** qua BullMQ queue, hiển thị trạng thái tiến trình

### 🛡️ Admin Panel
- Quản lý người dùng: khoá/mở tài khoản, xác thực
- Kiểm duyệt video: duyệt/gỡ, xử lý report
- Dashboard thống kê: users, videos, lượt xem
- Audit logs

---

## 🏗️ Kiến trúc & Công nghệ

### Backend — `backend/`

| Công nghệ | Vai trò |
|---|---|
| **Node.js + Express** | HTTP server, REST API, MVC pattern |
| **MongoDB + Mongoose** | Database chính (users, videos, comments, social graph) |
| **Redis + BullMQ** | Cache + Job queue cho transcode & AI dubbing |
| **Socket.IO** | Real-time notifications |
| **Passport.js + JWT** | Authentication (local + Google OAuth) |
| **FFmpeg (fluent-ffmpeg)** | Transcode video → HLS (360p/720p/1080p) + thumbnail |
| **MinIO / AWS S3** | Object storage cho video, audio, thumbnail |
| **Joi** | Validation |
| **Winston** | Logging |

**Cấu trúc MVC:**
```
backend/src/
├── config/          # database, redis, s3, passport
├── models/          # User, Video, Comment, Like, Follow,
│                    # Notification, AudioTrack, Subtitle
├── controllers/     # auth, user, video, comment, feed,
│                    # notification, dubbing, admin
├── routes/          # Express routers
├── services/        # Business logic
│   └── ai/          # speechToText, translation, tts, dubbingPipeline
├── jobs/            # BullMQ workers: transcode + dubbing
├── middlewares/     # auth, upload, error, validate, rateLimit
├── validators/      # Joi schemas
├── sockets/         # Socket.IO notification gateway
└── utils/           # logger, apiResponse, constants
```

### Frontend — `frontend/`

| Công nghệ | Vai trò |
|---|---|
| **React 18 + Vite** | UI framework, fast dev server |
| **Zustand** | State management (auth, video prefs, notifications) |
| **React Router v6** | Client-side routing |
| **HLS.js** | Phát video HLS trên trình duyệt |
| **Framer Motion** | Animations |
| **Tailwind CSS** | Styling — Dark theme, glassmorphism |
| **Axios** | HTTP client với auto token refresh |
| **Socket.IO Client** | Real-time notifications |
| **React Hook Form** | Form management |
| **react-hot-toast** | Toast notifications |

**Cấu trúc:**
```
frontend/src/
├── api/             # axiosClient + auth/video/dubbing/notification APIs
├── components/
│   ├── common/      # Button, Modal, Spinner, Avatar
│   ├── layout/      # Header, Sidebar, BottomNav
│   ├── video/       # VideoCard, VideoPlayer, ActionButtons, VideoUploader
│   ├── comment/     # CommentList, CommentItem, CommentInput
│   └── dubbing/     # LanguageSelector, DubbingStatusBadge
├── pages/           # Home, Login, Register, Profile, Upload,
│                    # VideoDetail, Search, Admin
├── hooks/           # useAuth, useVideoPlayer, useInfiniteScroll
├── store/slices/    # authSlice, videoSlice, notificationSlice
├── routes/          # AppRouter, PrivateRoute
├── services/        # socket.service.js
└── utils/           # format.js, constants.js
```

### AI Service — Python + FastAPI *(planned)*

| Model | Vai trò |
|---|---|
| **Whisper large-v3** | Speech-to-Text (STT) |
| **SeamlessM4T v2** | Dịch thuật đa ngôn ngữ |
| **Coqui TTS / ElevenLabs** | Text-to-Speech + Voice Cloning |
| **Wav2Lip** | Lip-sync (optional) |

---

## 🚀 Khởi động

### Yêu cầu
- Node.js >= 18
- MongoDB (local hoặc Atlas)
- Redis
- FFmpeg
- MinIO (hoặc AWS S3)

### 1. Clone & cài dependencies

```bash
git clone https://github.com/hoangtukhoi/tiktak_demo.git
cd tiktak_demo

# Backend
cd backend
npm install
cp .env.example .env
# Sửa .env với MongoDB URI, JWT secret, ...

# Frontend
cd ../frontend
npm install
```

### 2. Cấu hình `.env`

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/tiktak
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
FRONTEND_URL=http://localhost:3000
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
```

### 3. Chạy

```bash
# Terminal 1 — Backend API
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev

# (Optional) Terminal 3 — BullMQ Worker riêng
cd backend
npm run worker
```

### URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000/api |
| Health check | http://localhost:5000/health |

---

## 📋 API Routes

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký |
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/refresh` | Refresh token |
| GET | `/api/auth/me` | Thông tin user hiện tại |
| GET | `/api/feed/for-you` | Feed "Cho bạn" |
| GET | `/api/feed/following` | Feed đang theo dõi |
| POST | `/api/videos` | Tạo video mới |
| POST | `/api/videos/:id/like` | Like/unlike video |
| POST | `/api/dubbing/request` | Yêu cầu dịch lồng tiếng |
| GET | `/api/dubbing/:trackId/status` | Trạng thái dubbing |
| GET | `/api/dubbing/languages` | Danh sách ngôn ngữ hỗ trợ |

---

## 🗺️ Roadmap

- [x] Auth (đăng ký/đăng nhập/Google OAuth/JWT refresh)
- [x] Upload video + Transcode HLS (360p/720p/1080p)
- [x] Feed + Like/Comment/Follow
- [x] Thông báo real-time (Socket.IO)
- [x] Pipeline AI dịch & lồng tiếng (STT → MT → TTS)
- [x] Admin panel (quản lý users/videos/moderation)
- [ ] AI Service (Python FastAPI) — Whisper + SeamlessM4T
- [ ] Recommendation engine (Qdrant vector search)
- [ ] CDN + HLS streaming tối ưu
- [ ] Mobile app (React Native)

---

## 📁 Cấu trúc project

```
tiktak_demo/
├── backend/          # Node.js + Express API
├── frontend/         # React + Vite
├── plan.md           # Kế hoạch chi tiết
└── README.md
```

---

*Dự án được phát triển với mục đích học tập và demo.*
