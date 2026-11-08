# Nhật ký công việc — TikTak

Ghi lại những gì đã làm theo từng ngày (mới nhất ở trên cùng).
Mỗi lần làm thêm, thêm một mục ngày mới theo mẫu ở cuối file.

> Ngày của các mục trước 03/11/2026 được suy ra từ thời điểm sửa file trong dự án nên có thể lệch vài giờ.

---

## 08/11/2026 (Chủ Nhật)

### Báo cáo video
- Nút **Báo cáo** (lá cờ) ở góc video trên máy tính, và mục "Báo cáo video" trong bảng Chia sẻ (cả điện thoại).
- 10 lý do (spam, khiêu dâm, bạo lực, quấy rối, thù ghét, nguy hiểm, tin sai, an toàn trẻ em, bản quyền, khác) + mô tả thêm ≤ 300 ký tự.
- Không báo cáo được video của chính mình / video riêng tư; mỗi người 1 lần / video.
- Báo cáo có trạng thái `open` → `resolved`. Admin "Giữ video" hoặc "Gỡ video" thì đóng hết báo cáo, `reportCount` về 0; cần đủ 3 báo cáo **mới** (đổi qua `REPORT_FLAG_THRESHOLD`) thì video mới bị gắn cờ lại.
- Admin có tab **Báo cáo**: gom theo video, đếm theo lý do, xem ghi chú của người báo cáo.
- File: backend `models/Report.js`, `services/video.service.js`, `controllers/video.controller.js`, `controllers/admin.controller.js` (`GET /admin/reports`); frontend `components/video/ReportSheet.jsx` (mới), `VideoCard.jsx`, `ShareSheet.jsx`, `pages/Admin`.

### Admin không còn trang hồ sơ / phân tích cá nhân
- Sidebar, thanh dưới (điện thoại) và menu tài khoản của admin chỉ còn **Quản trị**.
- Admin vào `/profile/<mình>` hoặc `/analytics...` → tự chuyển về `/admin`. Admin vẫn xem được hồ sơ người khác và phân tích bất kỳ video nào.
- Admin không có nút lưu video và nút báo cáo (đã có công cụ kiểm duyệt).
- File: `layout/Sidebar.jsx`, `BottomNav.jsx`, `Header.jsx`, `routes/PrivateRoute.jsx` (thêm `notRole`), `AppRouter.jsx`, `pages/Profile`, `pages/VideoDetail`.

### Tag tên (@username)
- Gõ `@` trong ô bình luận hoặc mô tả video (trang Tải lên) → gợi ý người dùng, ưu tiên người mình theo dõi; ↑/↓, Enter/Tab để chọn. Trả lời bình luận tự điền `@tên`.
- Tag hiện thành link tới hồ sơ (chỉ với người có thật); `#hashtag` trong chú thích cũng thành link tìm kiếm.
- Người được tag nhận thông báo "đã nhắc đến bạn trong một bình luận / trong video". Tối đa 10 tag / nội dung; bỏ qua chính mình, người bị khoá, email.
- Mỗi người nhận tối đa 1 thông báo cho 1 bình luận (trả lời > được tag > bình luận mới).
- Tag trong mô tả video: thông báo gửi khi video xử lý xong và công khai; sửa mô tả chỉ báo cho người **mới** được tag.
- File: backend `utils/mentions.js` (mới), `services/comment.service.js` (mới), `controllers/comment.controller.js`, `upload.controller.js`, `jobs/transcodeVideo.job.js`, `GET /users/mention-suggest`; frontend `components/common/MentionInput.jsx`, `RichText.jsx` (mới), `CommentInput.jsx`, `CommentItem.jsx`, `pages/Upload`.

### Lưu video (giống TikTok)
- Nút **Lưu** (bookmark) trong cột hành động, có bộ đếm `saveCount`.
- Tab **Đã lưu** (có khoá) trên hồ sơ của chính mình — người khác không xem được (`GET /users/me/saved`).
- Feed, tìm kiếm, hồ sơ, chi tiết video đều trả `isSaved` và `isLiked` đúng với người xem (trước đây feed luôn trả `isLiked=false`). Cờ được gắn sau khi đọc cache feed nên không lẫn giữa người dùng.
- Admin xoá hẳn video → xoá luôn bản ghi đã lưu.
- File: backend `models/SavedVideo.js` (mới), `video.service.js` (`toggleSave`, `getSavedVideos`, `attachViewerFlags`), `POST /videos/:id/save`; frontend `ActionButtons.jsx`, `VideoCard.jsx`, `pages/Profile`.

### Thông báo trượt
- Có thông báo mới → thẻ trượt vào từ góc phải: ảnh đại diện, biểu tượng loại thông báo, nội dung, ảnh video; bấm để mở, vuốt sang phải hoặc ✕ để tắt, thanh thời gian 5 giây.
- **Sửa lỗi không nhận thông báo realtime:** socket bắt tay bằng access token (sống 15 phút). Token hết hạn → server từ chối và Socket.IO **không tự thử lại**, nên sau 15 phút (hoặc khi mở lại trang với token cũ) không còn nhận thông báo. Giờ socket luôn lấy token mới nhất, và khi bị từ chối thì làm mới token rồi kết nối lại.
- Socket.IO dùng chung quy tắc CORS với API (cho mọi localhost khi dev).
- File: frontend `components/common/NotificationToast.jsx` (mới), `services/socket.service.js`, `api/notification.api.js`; backend `server.js`.

### Kiểm duyệt bình luận tự động / bán tự động
- Bình luận mới được chấm điểm vi phạm 0–1:
  - Model phân loại bình luận chạy trong `ai-service` (`POST /moderate/comments`), hỗ trợ model HuggingFace hoặc scikit-learn.
  - AI service chưa chạy / chưa cắm model → bộ lọc từ khoá chửi tục (chỉ đưa vào hàng chờ, không tự ẩn).
- `COMMENT_MODERATION_MODE`: `off` | `semi` (mặc định: điểm ≥ 0,5 → chờ admin duyệt) | `auto` (thêm: model chấm ≥ 0,85 → tự ẩn).
- Bình luận chờ duyệt / bị ẩn: chỉ tác giả thấy (có nhãn), không tăng bộ đếm, chưa gửi thông báo. Admin duyệt → mới tăng bộ đếm và gửi thông báo.
- Admin có tab **Bình luận**: lọc Chờ duyệt / Đã ẩn / Đã duyệt, thanh điểm vi phạm, nút Hiện / Ẩn, ghi nhật ký. 2 admin bấm cùng lúc không làm lệch bộ đếm.
- Chủ video và admin xoá được bình luận trên video (trước đây chỉ tác giả).
- Sửa lỗi: API danh sách bình luận chưa đọc token nên `isLiked` của bình luận luôn sai.
- File: backend `services/commentModeration.service.js` (mới), `models/Comment.js`, `controllers/admin.controller.js`, `routes/comment.routes.js`; ai-service `app/moderation.py` (mới), `main.py`, `config.py`; frontend `pages/Admin`, `CommentList.jsx`, `CommentItem.jsx`.

### Thanh kéo âm lượng
- Nút âm lượng ở góc video thành thanh kéo: máy tính rê chuột vào để hiện thanh, bấm biểu tượng để bật/tắt tiếng; điện thoại chạm lần 1 mở thanh, chạm lần 2 bật/tắt tiếng, tự thu lại sau 2,5 giây.
- Kéo về 0 = tắt tiếng; kéo lên = bật lại. Dùng được phím ←/→ khi thanh đang được chọn. Âm lượng được nhớ cho mọi video và áp dụng cả cho bản lồng tiếng AI.
- File: `components/video/VolumeControl.jsx` (mới), `VideoCard.jsx`.

### Bot giả lập người dùng (test / demo)
- Script `npm run bot` (thư mục `backend`): tạo tài khoản bot rồi gọi API thật để xem video (có thời gian xem, xem hết), thích, bình luận, trả lời, tag tên, lưu, chia sẻ, theo dõi, thỉnh thoảng báo cáo và đăng video.
- Mỗi bot có sở thích (hashtag) riêng; xem càng lâu càng dễ tương tác. Tự giữ dưới giới hạn tốc độ của backend (90 lượt xem/phút).
- Tham số hay dùng: `--bots 10 --minutes 30`, `--target <username>` (dồn tương tác vào video của 1 tài khoản để xem thông báo trượt), `--upload-dir <thư mục>` hoặc `--generate-videos 3` (tạo video mẫu bằng ffmpeg), `--toxic 0.1` (thử kiểm duyệt bình luận). Xem hết: `npm run bot -- --help`.
- Chỉ chạy với backend localhost (trừ khi thêm `--allow-remote`). Tài khoản bot lưu ở `backend/.bot-accounts.json` (đã thêm vào .gitignore), tên dạng `botlinh01`.
- File: `backend/src/scripts/bot.js` (mới), `backend/package.json`.

### Giới hạn chia sẻ: 1 tài khoản / 1 lượt / video
- Lỗi: bấm "Sao chép" liên tục làm số chia sẻ nhảy lên xuống. Nguyên nhân: giao diện tự +1 mỗi lần bấm rồi bị ghi đè bằng số cũ, còn server thì cộng thật mỗi lần (spam được).
- Giờ mỗi tài khoản chỉ được tính **1 lượt chia sẻ cho 1 video** (khách chưa đăng nhập: 1 lượt / IP / 24 giờ). Chia sẻ lại vẫn chạy bình thường nhưng không tăng bộ đếm, không ghi thêm thống kê. Bấm liên tục cùng lúc cũng chỉ tính 1 (khoá Redis `SET NX`, dự phòng bằng `ShareEvent`).
- API trả thêm `counted` (true = lượt được tính). Giao diện không tự cộng nữa mà hiển thị đúng số server trả về.
- File: backend `services/video.service.js` (`recordShare`), `controllers/video.controller.js`; frontend `components/video/VideoCard.jsx`, `api/mock.js`. Thêm 5 test → tổng 745 test đều đạt.

### Tab "Đã tim" và "Đăng lại" + tính năng đăng lại
- Hồ sơ có 4 tab: **Video**, **Đăng lại** (ai cũng xem được), **Đã tim** và **Đã lưu** (có khoá — chỉ chủ tài khoản xem).
- **Đăng lại**: bấm Chia sẻ → "Đăng lại" (bấm lần nữa để huỷ). Không đăng lại được video của chính mình / video riêng tư; admin không có nút này. Chủ video nhận thông báo "đã đăng lại video của bạn" (mỗi người tối đa 1 lần/ngày để không bị spam khi bật/tắt liên tục).
- Người theo dõi mình thấy video đăng lại trong feed **Đang theo dõi** (xếp theo thời điểm đăng lại, không lặp video), và ở mọi nơi xem video đều có dòng **"🔁 @tên đã đăng lại"** ở góc dưới bên trái (kèm ảnh đại diện; nhiều người thì "@a và N người khác").
- API mới: `POST /videos/:id/repost`, `GET /users/:username/reposts`, `GET /users/me/liked`; video trả thêm `repostCount`, `isReposted`, `repostedBy`, `repostedByCount`.
- Bot test cũng biết đăng lại.
- File: backend `models/Repost.js` (mới), `services/video.service.js` (`toggleRepost`, `getFollowingFeed`, `attachRepostInfo`, `getUserReposts`, `getLikedVideos`), `controllers/video.controller.js`, `user.controller.js`, routes; frontend `VideoCard.jsx`, `ShareSheet.jsx`, `pages/Profile`, `api/video.api.js`, `NotificationToast.jsx`. Thêm 8 test → tổng **753 test** đều đạt.

### Quyền riêng tư — đợt 1
- **Danh sách Người theo dõi / Đang theo dõi**: bấm vào số trên hồ sơ để mở. Có 2 tab, tìm theo tên, nút Theo dõi / Theo dõi lại / Bạn bè (rê chuột để Bỏ theo dõi), nhãn "Bạn bè" (theo dõi lẫn nhau), "Theo dõi bạn". Trên hồ sơ của mình có nút **xoá người theo dõi** (họ không được báo).
- Hồ sơ người khác giờ có nút **Theo dõi** (trước đây chưa có) và menu "⋯" (sao chép link, chặn).
- **Trang Cài đặt → Quyền riêng tư** (`/settings/privacy`, mở từ menu tài khoản hoặc nút khiên trên hồ sơ), lưu ngay khi đổi:
  - Ai xem được: danh sách người theo dõi, đang theo dõi, đăng lại (Mọi người / Bạn bè / Chỉ mình tôi); video đã thích (Mọi người / Chỉ mình tôi — mặc định chỉ mình tôi).
  - Ai được bình luận video của tôi (Mọi người / Người theo dõi / Bạn bè / Không ai); ai được tag tôi (Mọi người / Người tôi theo dõi / Không ai); cho phép người khác đăng lại video của tôi; hiện tài khoản trong tìm kiếm và gợi ý tag.
  - Mục bị ẩn vẫn hiện con số kèm 🔒, mở ra thấy "Danh sách này đã được ẩn". Ô bình luận hiện lý do khi không được bình luận.
- **Chặn người dùng**: tự bỏ theo dõi 2 chiều; người bị chặn không thấy hồ sơ / video (404), không bình luận, theo dõi, đăng lại, tag; hai bên không nhận thông báo của nhau; video, bình luận, kết quả tìm kiếm của người bị chặn biến mất khỏi phía mình. Danh sách tài khoản đã chặn + bỏ chặn trong trang Quyền riêng tư.
- Mọi giới hạn kiểm tra ở backend (gọi thẳng API cũng bị chặn); admin/moderator vẫn xem được mọi thứ.
- Sửa thêm: tìm kiếm người dùng / video trước đây không đọc token nên cờ "đã thích" sai; "Lượt thích" trên hồ sơ giờ lấy tổng từ server.
- API mới: `GET /users/:username/followers|following|liked`, `DELETE /users/me/followers/:userId`, `POST|DELETE /users/:username/block`, `GET /users/me/blocked`, `GET|PATCH /users/me/privacy`. Hồ sơ trả thêm `access`, `followsYou`, `isFriend`, `isBlocked`; video trả `canRepost`, `commentPolicy`.
- File: backend `models/Block.js` (mới), `services/privacy.service.js` (mới), `models/User.js` (`privacy`), `controllers/user.controller.js`, `comment.controller.js`, `video.controller.js`, `services/video.service.js`, `notification.service.js`, `utils/mentions.js`, routes; frontend `pages/Settings/Privacy.jsx` (mới), `components/profile/FollowListSheet.jsx` (mới), `components/common/FollowButton.jsx` (mới), `api/user.api.js` (mới), `pages/Profile`, `CommentList.jsx`, `VideoCard.jsx`, `Header.jsx`, `AppRouter.jsx`.
- Thêm 25 test (`tests/integration/privacy.int.test.js`) → tổng **778 test** đều đạt.
- Đợt 2 (chưa làm): lọc bình luận theo từ khoá tự đặt, tài khoản riêng tư (duyệt yêu cầu theo dõi).

### Ghim video lên đầu hồ sơ
- Trên hồ sơ của mình, rê chuột vào video → nút 📌 **Ghim** / **Bỏ ghim**. Tối đa 3 video (ghim thêm sẽ báo cần bỏ ghim video khác trước).
- Video ghim luôn nằm đầu tab Video (ghim sau đứng trước) với nhãn đỏ **"Đã ghim"**, mọi người xem hồ sơ đều thấy; phân trang không lặp video. Xoá video thì tự bỏ ghim.
- API: `POST /videos/:id/pin` (chỉ chủ video); video trả thêm `pinnedAt`.
- File: backend `models/Video.js` (`pinnedAt`), `services/video.service.js` (`togglePin`, `getUserVideos`), `controllers/video.controller.js`, `routes/video.routes.js`; frontend `components/video/VideoCard.jsx` (`VideoTile`), `pages/Profile`, `api/video.api.js`. Thêm 3 test → tổng 781 test đều đạt.

### Kiểm thử
- Thêm 68 test (`tests/integration/features.int.test.js`, `tests/unit/utils/mentionsAndModeration.test.js`), sửa 3 test cũ theo hành vi mới → tổng **740 test đều đạt**.

### Còn tồn đọng
- **Cắm model phân loại bình luận**: chép model vào `ai-service/moderation_model/`, đặt `AI_MODERATION_MODEL_PATH` (xem `ai-service/README.md`, mục "Kiểm duyệt bình luận"). Kiểm tra `GET :8002/health` có `moderation_loaded: true`.
- Nếu lúc train có tiền xử lý riêng (tách từ PhoBERT, bỏ dấu…), sửa `_preprocess` trong `ai-service/app/moderation.py` cho giống.
- Thêm các biến `COMMENT_MODERATION_*`, `REPORT_FLAG_THRESHOLD` vào `backend/.env` (mẫu trong `.env.example`).

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

### Đăng nhập Google
- Nút **"Tiếp tục với Google"** ở trang Đăng nhập và Đăng ký. Nút tự ẩn khi backend chưa có `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- Luồng: `/api/auth/google` → Google → `/api/auth/google/callback` → trang `/auth/callback` của frontend.
  - Token không đi trên URL. Backend chỉ gửi một mã dùng **1 lần, sống 60 giây**; frontend đổi mã đó lấy token.
  - Có cookie `state` chống giả mạo đăng nhập.
- Tạo tài khoản mới:
  - Username sinh tự động từ email (bỏ dấu, chỉ còn chữ/số/`_`, trùng thì thêm `_2`).
  - Lấy tên hiển thị và ảnh đại diện từ Google; không gắn tích xanh.
- Email đã có tài khoản thường → tự liên kết Google vào tài khoản đó, **chỉ khi Google xác nhận email**.
- File: backend `config/passport.js`, `services/auth.service.js`, `controllers/auth.controller.js`, `routes/auth.routes.js`; frontend `pages/Login`, `pages/Register`, `pages/AuthCallback` (mới), `hooks/useAuth.js`, `api/auth.api.js`.

### Chia sẻ video
- Bảng chia sẻ mới: **Messenger, Facebook, Zalo, X, Telegram, WhatsApp, Email**, sao chép link, và nút "Khác" (bảng chia sẻ của điện thoại).
  - Messenger/Zalo trên máy tính: tự sao chép link rồi mở messenger.com / chat.zalo.me (hai nơi này không có link chia sẻ công khai).
- Link chia sẻ ngắn **`/s/<id>`**: trang có ảnh bìa + tiêu đề (Open Graph) để Facebook/Messenger/Zalo hiện khung xem trước, rồi tự chuyển sang `/watch/<id>`.
  - Video riêng tư/đã xoá không bị lộ tiêu đề.
- Thống kê lượt chia sẻ ghi theo từng mạng (`ShareEvent.method`).
- File: frontend `components/video/ShareSheet.jsx` (mới), `VideoCard.jsx`, `vite.config.js` (proxy `/s/*`); backend `routes/share.routes.js` (mới), `models/ShareEvent.js`, `app.js`.
- Thêm 50 test (Google + chia sẻ) → tổng **672 test** đều đạt.

### Còn tồn đọng
- **Cần tạo OAuth Client trên Google Cloud Console** rồi điền vào `backend/.env` thì nút Google mới hiện (xem `backend/.env.example`).
- Link chia sẻ chỉ hiện ảnh xem trước khi web chạy trên tên miền thật; khi đó đặt `PUBLIC_URL` và `FRONTEND_URL`.
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
