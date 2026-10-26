# TikTak — Frontend

React 18 + Vite · Zustand · React Router v6 · Tailwind · Framer Motion · HLS.js · Socket.IO client.

## Chạy

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000, proxy /api và /socket.io -> http://localhost:5000
```

Chạy không cần backend (dữ liệu giả, dùng để demo giao diện):

```bash
VITE_USE_MOCK=true npm run dev
```

Biến môi trường: xem `.env.example`. Mặc định không cần đặt gì khi chạy cùng backend local
(backend `.env` có `FRONTEND_URL=http://localhost:3000`, khớp cổng dev server).

## Cấu trúc

```
src/
├── api/             # axiosClient (refresh token tự động) + auth/video/dubbing/notification/admin
│                    # mock.js: backend giả, chỉ tải khi VITE_USE_MOCK=true
├── components/
│   ├── common/      # Button, Modal (bottom-sheet kéo để đóng), Spinner, Avatar
│   ├── layout/      # Header (tìm kiếm, thông báo, menu), Sidebar, BottomNav
│   ├── video/       # VideoCard (+ VideoTile), VideoPlayer, ActionButtons, VideoUploader
│   ├── comment/     # CommentList, CommentItem, CommentInput
│   └── dubbing/     # LanguageSelector, DubbingStatusBadge
├── pages/           # Home, Login, Register, Profile, Upload, VideoDetail, Search, Admin
├── hooks/           # useAuth, useVideoPlayer, useInfiniteScroll
├── store/slices/    # authSlice, videoSlice, notificationSlice
├── routes/          # AppRouter (layout + chuyển trang), PrivateRoute (hỗ trợ role)
├── services/        # socket.service.js
└── utils/           # format.js, constants.js
```

## Hợp đồng với backend

Toàn bộ khác biệt về tên field được xử lý ở `src/api/*` (`normalizeVideo`, `normalizeComment`,
`normalizeNotification`), component chỉ dùng dữ liệu đã chuẩn hoá.

| Tính năng | Endpoint |
|---|---|
| Đăng nhập / đăng ký / refresh / me | `POST /auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` |
| Bảng tin | `GET /feed/for-you`, `GET /feed/following` |
| Video | `GET /videos/:id`, `POST /videos`, `DELETE /videos/:id`, `POST /videos/:id/like`, `POST /videos/:id/view`, `GET /videos/search` |
| Người dùng | `GET /users/:username`, `GET /users/:id/videos`, `GET /users/search`, `PATCH /users/me` |
| Bình luận | `GET /comments/video/:videoId`, `POST /comments`, `DELETE /comments/:id`, `POST /comments/:id/like`, `GET /comments/:id/replies` |
| Lồng tiếng | `GET /dubbing/languages`, `POST /dubbing/request`, `GET /dubbing/:trackId/status`, `GET /dubbing/video/:videoId` |
| Thông báo | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read-all`, socket event `new_notification` |
| Quản trị | `/admin/stats`, `/admin/users` (+ ban/unban/verify), `/admin/videos` (+ approve/delete, flagged), `/admin/audit-logs` |
| Upload file | `POST /upload` (multipart `video` + metadata) → `{ videoId, jobId }`, SSE `GET /upload/:jobId/progress?token=` |

## Việc cần làm ở backend để chạy trọn vẹn

1. **Upload**: chưa có route `/upload` + SSE như README. Frontend tự fallback sang `POST /videos` và hỏi trạng thái
   `GET /videos/:id`, nhưng file video không được gửi lên. Cần route dùng `videoUpload.single('video')`.
2. **Bình luận**: `comment.controller.createComment` lưu `text` nhưng model `Comment` yêu cầu `content` → luôn lỗi 400.
   Sửa: `content: req.body.content || req.body.text`, và `populate('userId', 'username avatarUrl')` khi trả về.
3. **Thông báo**: `notification.service` dùng field `read`, model là `isRead` → đếm/đánh dấu đã đọc sai.
4. **Feed**: `getTrendingVideos` (aggregate) không populate `userId` → bảng tin không có tên tác giả. Thêm `$lookup` users.
5. **Stub**: `likeVideo`, `recordView`, `getUserVideos`, `getFollowingFeed`, `admin.getStats` đang trả `null`/`[]`.
   Like nên trả `{ isLiked, likeCount }` (frontend đã đọc sẵn).
6. **Follow**: có model `Follow` nhưng chưa có route → chưa có nút Theo dõi.
