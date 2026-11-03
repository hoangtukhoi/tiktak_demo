# Bộ test case backend TikTak — phân tích biên & trường hợp đặc biệt

| Lệnh | Chạy gì | Thời gian |
|---|---|---|
| `npm test` | Toàn bộ (unit + integration) | ~25 giây |
| `npm run test:unit` | Chỉ unit test (mọi phụ thuộc đều mock) | ~3 giây |
| `npm run test:integration` | Gọi API thật bằng supertest + MongoDB chạy trong bộ nhớ | ~20 giây |
| `npm run test:coverage` | Toàn bộ + báo cáo độ phủ (thư mục `coverage/`) | ~30 giây |

- **Không cần** bật MongoDB, Redis, MinIO/S3 hay Docker.
- Integration test dùng `mongodb-memory-server`: lần chạy đầu tiên tự tải MongoDB (~70 MB) về cache, các lần sau chạy ngay.
- Redis được thay bằng bản giả lập trong bộ nhớ (`tests/helpers/fakeRedis.js`); S3, BullMQ, log đều được mock.

## Kỹ thuật thiết kế test

- **Phân tích giá trị biên (BVA):** với mỗi giới hạn `[min, max]`, test các giá trị `min-1`, `min`, `max`, `max+1`.
- **Phân vùng tương đương:** chọn 1 đại diện cho mỗi nhóm hợp lệ / không hợp lệ (VD: chữ có dấu, ký tự đặc biệt, rỗng, null).
- **Bảng quyết định:** dùng cho phân quyền (chủ video / người khác / admin × trạng thái video).
- **Trường hợp đặc biệt:** `null`, `undefined`, `NaN`, `Infinity`, chuỗi chỉ có khoảng trắng, Unicode/emoji, chia cho 0, nửa đêm, năm nhuận.

## 1. Validator

| Đối tượng | Quy tắc | Giá trị biên được test |
|---|---|---|
| `username` (đăng ký) | 3–30 ký tự, chỉ chữ & số | 2 ✗ · 3 ✓ · 30 ✓ · 31 ✗ · có `_` ✗ · có dấu ✗ |
| `username` (sửa hồ sơ) | 3–30, chữ/số/`_`, trim, không trùng tên hệ thống | `"  ab  "` → 2 ký tự ✗ · `ADMIN`/`aDmIn` ✗ · `admin1` ✓ · 16 tên giữ chỗ ✗ |
| `password` | ≥ 6 | 5 ✗ · 6 ✓ · 6 dấu cách ✓ (chưa có quy tắc độ mạnh) |
| `email` | định dạng email | thiếu TLD ✗ · thiếu `@` ✗ · thiếu tên ✗ |
| `displayName` | ≤ 30, trim | 30 ✓ · 31 ✗ · 31 có khoảng trắng 2 đầu ✓ · 15 emoji ✓ · 16 emoji ✗ |
| `bio` | ≤ 150 | 0 ✓ · 150 ✓ · 151 ✗ |
| `title` video | bắt buộc, ≤ 200 | rỗng ✗ · 200 ✓ · 201 ✗ |
| `description` video | ≤ 2000 | 2000 ✓ · 2001 ✗ |
| link hồ sơ | ≤ 200 / link | 200 ✓ · 201 ✗ · mạng xã hội không hỗ trợ ✗ |
| Instagram handle | `@` + 1–30 ký tự | 1 ✓ · 30 ✓ · 31 ✗ |
| YouTube handle | `@` + 3–30 ký tự | 2 ✗ · 3 ✓ · 30 ✓ · 31 ✗ |
| Tên miền | đúng instagram.com / youtube.com / youtu.be | `instagram.com.evil.com` ✗ · `notinstagram.com` ✗ · `m.`/`www.` ✓ |
| Website | http/https, có dấu chấm | `localhost` ✗ · `javascript:` ✗ · `ftp://` ✗ |
| Trường cấm | không cho tự đặt | `role`, `email`, `status`, `viewCount`, `userId`… ✗ |

## 2. Middleware

| Đối tượng | Trường hợp |
|---|---|
| `authenticate` | không có header · `Bearer` rỗng · sai scheme · thừa dấu cách · token hết hạn · sai secret · thuật toán `none` · user đã xoá (401) · user bị khoá (403) · lỗi DB (401) |
| `optionalAuth` | token sai → vẫn là khách và `next()` đúng 1 lần · user bị khoá → khách |
| `requireRole` | role sai hoa thường ✗ · chưa đăng nhập ✗ · danh sách role rỗng ✗ |
| `requireInternalKey` | thiếu/thừa 1 ký tự · cùng độ dài khác 1 ký tự · khác hoa thường · header dạng mảng · server chưa cấu hình key · key Unicode |
| `errorMiddleware` | ánh xạ mã lỗi (400/401/409/404/500) · biên log 499 ✗ / 500 ✓ · ẩn message 5xx khi production |

## 3. Service video

| Đối tượng | Giá trị biên |
|---|---|
| Phân trang | cursor `undefined`/`""`/`"0"` → trang 0 · `"999999"` (6 chữ số) ✓ · `"1000000"` (7 chữ số) → 400 · `-1`, `1.5`, `abc` → 400 · ObjectId thừa/thiếu 1 ký tự → 400 · DB trả `limit` bản ghi → hết trang · `limit + 1` → còn trang |
| Quyền xem video | 13 tổ hợp: công khai/riêng tư/đang xử lý/lỗi/đã xoá/bị gỡ/bị gắn cờ × khách/người khác/chủ/admin/moderator |
| `recordView` | thời gian xem kẹp `[0, 1 giờ]`: −1 → 0 · 3.600.000 ✓ · 3.600.001 → 3.600.000 · `NaN`/`Infinity`/chuỗi · tỷ lệ xem tối đa 1 · thời lượng = 0 (chia cho 0) · **xem hết khi ≥ 90%**: 89,99% ✗ · 90% ✓ · chủ video tự xem không tính |
| `recordShare` | phương thức lạ → `other` · chủ tự chia sẻ không tính · khách |
| `reportVideo` | **ngưỡng gắn cờ 3**: 2 ✗ · 3 ✓ · báo cáo trùng → 409 |
| `updateVideo` | chỉ sửa trường trong whitelist · giá trị `false` vẫn được cập nhật |

## 4. Phân tích dữ liệu (analytics)

| Đối tượng | Giá trị biên |
|---|---|
| `parseRange` | 7, 28, 30, 60, 90, 365 ✓ · 6, 8, 364, 366, 0, −7 → mặc định |
| `rate` (tỷ lệ tương tác) | **cần ≥ 30 lượt xem**: 29 → `null` · 30 ✓ |
| `pctChange` | kỳ trước = 0 → `null` · cả hai = 0 → 0% · làm tròn 1 chữ số |
| Múi giờ VN | 23:59:59 vs 00:00:00 giờ VN · giao thừa · 29/2 năm nhuận · chạy đúng khi máy ở múi giờ khác |
| `windowOf` | 1, 7, 28, 365 ngày · đủ số ngày, không trùng, kỳ trước cùng độ dài |
| Nhận xét tự động | ≥ 10 lượt xem (9 ✗ / 10 ✓) · rời đi 3 giây đầu: 40% cảnh báo / 15% khen · so với kênh ±10 điểm · lượt xem ×1,5 / ×0,5 · xem lại 15% · nguồn: Dành cho bạn 60% / tìm kiếm 30% / trang cá nhân 50% · đoạn mất người xem ≥ 15 điểm · đỉnh lượt xem từ ngày thứ 3 |
| So sánh video | **2–3 video**: 1 ✗ · 2 ✓ · 3 ✓ · 4 ✗ · id trùng được gộp trước khi đếm · id sai → 400 |

## 5. Integration test (API thật + MongoDB trong bộ nhớ)

| File | Kiểm tra chính |
|---|---|
| `auth.int.test.js` | Đăng ký trùng email/username **không phân biệt hoa thường** · 2 request đăng ký cùng lúc · sai mật khẩu và email không tồn tại trả **cùng thông báo** · tài khoản Google đăng nhập bằng mật khẩu · refresh token xoay vòng, dùng lại token cũ → 401 · **2 request refresh cùng lúc chỉ 1 thành công** · giới hạn **10 phiên** (lần đăng nhập thứ 11 đẩy phiên 1 ra) · đăng xuất · bị khoá sau khi đăng nhập |
| `users.int.test.js` | Ẩn email với người ngoài · đếm lượt xem hồ sơ 1 lần/30 phút · sửa hồ sơ lỗi thì **không lưu gì** · **đổi username: 29 ngày 23 giờ → 429, 30 ngày + 1 giây → 200** · tìm kiếm tối đa 10 kết quả · theo dõi/bỏ theo dõi **bấm nhiều lần cùng lúc** bộ đếm vẫn khớp · `limit` = −1, 0, 1, 50, 51 · duyệt hết các trang không trùng |
| `videos.int.test.js` | Quyền xem · 10 người thích cùng lúc → 10 · bấm thích 2 lần cùng lúc · 50 lượt xem đồng thời không mất lượt · body JSON hỏng → 400 · **3 báo cáo → gắn cờ** · xoá 2 lần không trừ `videoCount` 2 lần · endpoint nội bộ cần key · tìm kiếm bỏ qua video riêng tư/đã xoá/bị gỡ |
| `comments.int.test.js` | **Nội dung 1–500 ký tự sau khi trim** (500 ✓, 501 ✗, chỉ khoảng trắng ✗, không phải chuỗi ✗) · video riêng tư/đã xoá/đang xử lý/bị gỡ của người khác → 404 · trả lời bình luận của **video khác** → 400 · xoá cùng lúc 2 lần chỉ trừ 1 · `limit` 0/1/100/101/−1 |
| `feed.int.test.js` | Chỉ video công khai + đã duyệt/chờ duyệt · `limit` 0/1/50/51/−5 · đúng 20 video với limit 20 → hết trang · lướt hết không trùng · video cũ bị giảm điểm theo thời gian · người đang theo dõi ×2 · cache 60 giây tách theo người xem |
| `analytics.int.test.js` | Lượt xem **23:59:59 vs 00:00:00 giờ VN** rơi đúng ngày · so sánh với kỳ trước · nguồn truy cập cần ≥ 20 lượt (19 ✗ / 20 ✓) · chỉ thấy số liệu của mình · tỷ lệ xem hết/thời gian xem TB · so sánh video của người khác → 404 · tỷ lệ tương tác 29 vs 30 lượt xem |
| `admin.int.test.js` | Khách 401 / user 403 / moderator 403 / admin 200 · khoá → token cũ hết dùng được, có audit log · không tự khoá mình, không khoá admin khác · khoá 2 lần → 409 · mở khoá đăng nhập lại được · phân trang `limit`/`page` ở biên |
| `rateLimit.int.test.js` | Đếm lượt xem: **lượt 120 → 200, lượt 121 → 429** |

## 6. Phát hiện từ quá trình test

| # | Mức | Mô tả | Trạng thái |
|---|---|---|---|
| 1 | **Cao** | Refresh token tạo trong cùng 1 giây **giống hệt nhau** → token cũ vẫn dùng lại được sau khi refresh; đăng xuất 1 thiết bị có thể đăng xuất luôn thiết bị khác. | **Đã sửa**: thêm `jwtid` ngẫu nhiên |
| 2 | **Cao** | 2 request đăng nhập/refresh cùng lúc → 1 request lỗi 500 (Mongoose `VersionError` do cùng sửa mảng `refreshTokens`); 2 request refresh cùng 1 token đều thành công. | **Đã sửa**: cập nhật nguyên tử (`$push`/`$slice`, `findOneAndUpdate` + `$pull`) |
| 3 | **Cao** | Bình luận được vào video **riêng tư / đã xoá / chưa xử lý xong / bị gỡ** của người khác nếu biết id. | **Đã sửa** |
| 4 | Trung bình | `getMyAnalyticsTab`: tab `constructor` trả 200 với dữ liệu rác, tab `__proto__` gây lỗi 500 (do tra cứu object thường). Route đã giới hạn tên tab nên chưa khai thác được qua HTTP. | **Đã sửa** bằng `Object.hasOwn` |
| 5 | Trung bình | Bình luận 501 ký tự hoặc chỉ có khoảng trắng trả **500** thay vì 400; `content` là số làm lỗi server. | **Đã sửa**: kiểm tra 1–500 ký tự sau khi trim |
| 6 | Trung bình | Trả lời bình luận của video khác (`parentId` khác video) vẫn được. | **Đã sửa** → 400 |
| 7 | Trung bình | Bỏ theo dõi 2 lần cùng lúc → `followerCount`/`followingCount` bị **âm** (−1). Xoá bình luận 2 lần cùng lúc → `commentCount` bị trừ 2. | **Đã sửa**: chỉ request thực sự xoá được mới giảm bộ đếm |
| 8 | Trung bình | `?limit=-1` ở danh sách video hồ sơ, bình luận, thông báo → MongoDB hiểu là "không giới hạn" → trả **toàn bộ** dữ liệu. | **Đã sửa**: kẹp `limit` tối thiểu 1 |
| 9 | Trung bình | Đăng ký `ALICE` khi đã có `alice` → tạo được 2 tài khoản; trùng email khác hoa thường báo nhầm "Username đã tồn tại". | **Đã sửa** |
| 10 | Trung bình | Tài khoản đăng ký bằng Google đăng nhập bằng mật khẩu → lỗi **500**. | **Đã sửa** → 401 |
| 11 | Thấp | `recordView`: client gửi `completed: true` với 0 ms vẫn được tính là xem hết → có thể làm đẹp tỷ lệ xem hết. | Ghi nhận (test `[Phát hiện]`) |
| 12 | Thấp | `normalizeLinks`: nhập `instagram.com` (không có đường dẫn) bị hiểu là tên tài khoản → tạo link `instagram.com/instagram.com`. | Ghi nhận |
| 13 | Thấp | `parseRange` dùng `parseInt` nên `"7.9"`, `"28abc"` vẫn được chấp nhận. Không gây hại. | Ghi nhận |
| 14 | Thấp | `validate` middleware: body `undefined` được cho qua. | Ghi nhận |
| 15 | Thấp | Mật khẩu 6 dấu cách hợp lệ — chưa có quy tắc độ mạnh mật khẩu. | Ghi nhận |

Các test có tiền tố `[Phát hiện]` đang khẳng định **hành vi hiện tại**. Khi sửa lỗi tương ứng, đổi kỳ vọng của test đó theo hành vi mới.
