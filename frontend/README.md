# TikTak — Frontend

React 18 + Vite · Zustand · React Router v6 · Tailwind · Framer Motion · HLS.js · Socket.IO client.

## Chạy

```bash
cd frontend
npm install
npm run dev                       # http://localhost:3000, proxy /api và /socket.io -> http://localhost:5000
VITE_USE_MOCK=true npm run dev    # chạy không cần backend (dữ liệu giả, đủ mọi chức năng)
```

Biến môi trường: xem `.env.example`.

## Giao diện (design system)

- **Font**: Be Vietnam Pro (thiết kế cho tiếng Việt, dấu hiển thị chuẩn).
- **Màu**: một màu nhấn duy nhất là "son" `#D63A1F` (đỏ dấu triện, nhịp "tak" của kim đồng hồ), nền trung tính ấm.
  Màu trạng thái (danger/success/warn) chỉ dùng cho phản hồi.
- **Token** khai báo bằng CSS variable trong `src/index.css` (`--bg`, `--surface`, `--fg`, `--brand`…), Tailwind map sang
  `bg-surface`, `text-fg-muted`, `bg-brand`… Sáng/tối đổi bằng class `dark` trên `<html>` (menu tài khoản → Giao diện).
- Thành phần dùng chung trong `@layer components`: `btn-primary | btn-secondary | btn-outline | btn-ghost`, `input`, `label`, `chip`, `tab`, `card`, `skeleton`.
- Bố cục: desktop có sidebar trái (logo, tìm kiếm, điều hướng, tài khoản đang theo dõi); mobile có thanh trên + thanh dưới,
  bảng tin video tràn màn hình. Bình luận mở dạng panel phải (desktop) / bottom sheet (mobile).

## Cấu trúc

```
src/
├── api/             # axiosClient (refresh token tự động) + auth/video/dubbing/notification/admin
│                    # mock.js: backend giả, chỉ tải khi VITE_USE_MOCK=true
├── components/
│   ├── common/      # Button, Modal (dialog/sheet/drawer), Spinner, Avatar, Logo, Menu, FollowButton
│   ├── layout/      # Header (mobile), Sidebar (desktop), BottomNav
│   ├── video/       # VideoCard (+ VideoTile), VideoPlayer, ActionButtons, VideoUploader,
│   │                # CoverPicker, ShareSheet (+ ReportDialog), EditVideoDialog
│   ├── comment/     # CommentList, CommentItem, CommentInput
│   └── dubbing/     # LanguageSelector, DubbingStatusBadge
├── pages/           # Home, Login, Register, Profile, Upload, VideoDetail, Search, Inbox, Admin
├── hooks/           # useAuth, useVideoPlayer, useInfiniteScroll, useMedia (desktop + theme)
├── store/slices/    # authSlice, videoSlice, notificationSlice
├── routes/          # AppRouter (layout theo trang), PrivateRoute (hỗ trợ role)
├── services/        # socket.service.js
└── utils/           # format.js, constants.js
```

## Chức năng

| Khu vực | Chức năng |
|---|---|
| Bảng tin | Dành cho bạn / Đang theo dõi, cuộn snap, phím ↑ ↓ / J K / M, chạm đúp để thích, theo dõi ngay trên video, lưu video, chia sẻ (sao chép, Facebook, X, Telegram, Email), báo cáo, lồng tiếng AI + phụ đề |
| Video | Trang xem riêng có panel bình luận; chủ video sửa (tiêu đề, mô tả, hashtag, quyền xem, bình luận, Duet) và xoá |
| Bình luận | Trả lời, xem câu trả lời, thích, xoá bình luận của mình |
| Hồ sơ | Theo dõi / bỏ theo dõi, danh sách người theo dõi & đang theo dõi, tab Video (sắp xếp mới nhất / phổ biến), Đã thích, Đã lưu, Bản nháp; sửa hồ sơ (ảnh đại diện, tiểu sử); nhãn Riêng tư / Bạn bè / Đã lên lịch / Đang xử lý / Chờ duyệt |
| Tải lên | Kiểm tra file, chọn ảnh bìa từ khung hình hoặc tải ảnh, tiêu đề / mô tả / hashtag, gắn thẻ người dùng, quyền xem (mọi người / bạn bè / chỉ mình tôi), bình luận, Duet, ngôn ngữ trong video, phụ đề tự động, lồng tiếng sẵn, hẹn giờ đăng, lưu nháp; theo dõi tiến trình Tải lên → Xử lý → Kiểm duyệt → Hoàn tất |
| Hoạt động | Hộp thư thông báo, lọc theo loại, nhóm theo thời gian |
| Khám phá | Hashtag phổ biến, tìm kiếm Hàng đầu / Người dùng / Video, theo dõi từ kết quả |
| Quản trị | Thống kê, khoá / mở khoá / xác minh người dùng, duyệt / gỡ video bị gắn cờ, nhật ký |

## Hợp đồng API

Mọi khác biệt về tên field được xử lý trong `src/api/*` (`normalizeVideo`, `normalizeComment`, `normalizeNotification`).
Response theo `utils/apiResponse.js`: `{ success, message, data }`.

### Đã có trong backend

| Tính năng | Endpoint |
|---|---|
| Auth | `POST /auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` |
| Bảng tin | `GET /feed/for-you`, `GET /feed/following` |
| Video | `GET /videos/:id`, `POST /videos`, `PATCH /videos/:id`, `DELETE /videos/:id`, `POST /videos/:id/like`, `POST /videos/:id/view`, `GET /videos/search` |
| Người dùng | `GET /users/:username`, `GET /users/:id/videos`, `GET /users/search`, `PATCH /users/me` |
| Bình luận | `GET /comments/video/:videoId`, `POST /comments`, `DELETE /comments/:id`, `POST /comments/:id/like`, `GET /comments/:id/replies` |
| Lồng tiếng | `GET /dubbing/languages`, `POST /dubbing/request`, `GET /dubbing/:trackId/status`, `GET /dubbing/video/:videoId` |
| Thông báo | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read-all`, socket `new_notification` |
| Quản trị | `/admin/stats`, `/admin/users` (+ ban/unban/verify), `/admin/videos` (+ approve/delete, flagged), `/admin/audit-logs` |

### Backend cần thêm (frontend đã gọi sẵn, mock đã mô phỏng)

| Endpoint | Body / Trả về | Ghi chú |
|---|---|---|
| `POST /upload` (multipart) | field: `video`, `thumbnail` (jpg), `title`, `description`, `hashtags` (JSON), `mentions` (JSON id[]), `visibility`, `isPrivate`, `allowComment`, `allowDuet`, `scheduledAt` (ISO), `isDraft`, `sourceLang`, `autoCaption`, `dubLangs` (JSON) → `{ videoId, jobId }` | dùng `videoUpload` middleware; tạo job transcode |
| `GET /upload/:jobId/progress?token=` | SSE `{ status, progress, step }` | không bắt buộc: thiếu thì frontend tự hỏi `GET /videos/:id` |
| `POST /users/:id/follow` · `DELETE /users/:id/follow` | → `{ isFollowing, followerCount }` | model `Follow` đã có; cập nhật `followerCount/followingCount`, tạo thông báo `new_follower` |
| `GET /users/:id/followers` · `GET /users/:id/following` | → `User[]` kèm `isFollowing` | |
| `POST /users/me/avatar` (multipart `avatar`) | → `User` | dùng `imageUpload` middleware |
| `POST /videos/:id/save` | → `{ isSaved, saveCount }` | có thể tái dùng model `Like` với `targetType: 'save'` |
| `GET /users/me/saved` · `GET /users/me/drafts` · `GET /users/:id/liked` | → `Video[]` | |
| `POST /videos/:id/report` | `{ reason, note? }` → `{ reported: true }` | tăng `reportCount`, đủ ngưỡng thì `moderationStatus = 'flagged'` |
| `POST /videos/:id/share` | → `null` | tăng `shareCount` |

Field mới trên model `Video`: `visibility` (`public|friends|private`), `scheduledAt`, `isDraft`, `saveCount`, `mentions`, `sourceLang`, `autoCaption`.
`GET /users/:username` nên trả thêm `isFollowing` và `likeTotal`; video trả kèm `isLiked`, `isSaved`, `author.isFollowing` theo người đang đăng nhập.
Trang tải lên hiển thị bước "Kiểm duyệt nội dung" theo `moderationStatus` (`pending → approved | flagged | removed`).

### Lỗi đang có ở backend

1. `comment.controller.createComment` lưu `text` nhưng model `Comment` yêu cầu `content` → luôn lỗi 400. Sửa: `content: req.body.content || req.body.text`, và populate `userId`.
2. `notification.service` dùng field `read`, model là `isRead` → đếm/đánh dấu đã đọc sai.
3. `getTrendingVideos` (aggregate) không populate `userId` → bảng tin không có tên tác giả. Thêm `$lookup` users.
4. Stub: `likeVideo`, `recordView`, `getUserVideos`, `getFollowingFeed`, `admin.getStats` đang trả `null`/`[]`.
