# Pipeline xử lý của TikTak

Tài liệu này mô tả hai luồng xử lý nền của hệ thống: transcode video sau khi
upload, và dịch kèm lồng tiếng bằng AI. Cả hai đều chạy bất đồng bộ qua BullMQ
vì thời gian xử lý tính bằng phút, không thể giữ trong một request HTTP.

## 1. Kiến trúc tổng thể

```
                    ┌──────────────┐
   Trình duyệt ────►│  API server  │────► MongoDB
      (React)       │  (Express)   │────► Redis (cache + queue)
        ▲           └──────┬───────┘
        │                  │ enqueue
        │ Socket.IO / SSE  ▼
        │           ┌──────────────┐      ┌──────────────┐
        └───────────│    Worker    │─────►│  AI service  │
                    │   (BullMQ)   │      │  (FastAPI)   │
                    └──────┬───────┘      └──────────────┘
                           │ ffmpeg
                           ▼
                    ┌──────────────┐
                    │  S3 / MinIO  │
                    └──────────────┘
```

API server chỉ nhận request và đẩy job vào hàng đợi. Worker làm phần nặng.
Tiến trình được đẩy ngược về client theo hai kênh: SSE cho trang upload,
Socket.IO cho thông báo và tiến trình lồng tiếng.

## 2. Luồng upload và transcode

| Bước | Nơi chạy | Việc làm |
|---|---|---|
| 1 | API | Nhận multipart, kiểm tra MIME và dung lượng (multer memory storage) |
| 2 | API | Tạo bản ghi `Video` trạng thái `uploading` |
| 3 | API | Đẩy file gốc lên bucket `tiktak-videos` với key `<videoId>/original/<uuid>.<ext>` |
| 4 | API | Enqueue job `video-transcode`, trả về `videoId` + `jobId`, chuyển trạng thái sang `processing` |
| 5 | Worker | Tải file gốc về thư mục tạm |
| 6 | Worker | `ffprobe` đọc metadata: thời lượng, độ phân giải, có audio hay không |
| 7 | Worker | Trích thumbnail, upload lên `tiktak-thumbnails` |
| 8 | Worker | `ffmpeg` tạo HLS cho từng mức chất lượng không vượt quá độ phân giải gốc |
| 9 | Worker | Sinh `master.m3u8`, upload cả thư mục lên `<videoId>/hls/` |
| 10 | Worker | Cập nhật `Video`: `status=ready`, `hlsUrl`, `thumbnailUrl`, metadata |
| 11 | Worker | Tạo thông báo `video_ready`, đẩy qua Socket.IO |

Các mức chất lượng khai báo ở `backend/src/utils/constants.js` (`HLS_VARIANTS`):
360p, 720p, 1080p. Video dọc 720x1280 chỉ sinh 360p và 720p, không upscale.

### Theo dõi tiến trình

Worker ghi tiến trình vào Redis key `job:progress:<jobId>` với TTL 24 giờ.
Endpoint `GET /api/upload/:jobId/progress` đọc key này mỗi giây và đẩy về client
bằng Server-Sent Events. Cách này hoạt động cả khi worker chạy ở tiến trình
riêng (`RUN_WORKERS_IN_API=false` rồi `npm run worker`), vì tiến trình không
nằm trong bộ nhớ của API server.

## 3. Luồng dịch và lồng tiếng

Người xem bấm nút ngôn ngữ trên player, chọn ngôn ngữ đích. Frontend gọi
`POST /api/dubbing/request`.

### Cache

Mỗi cặp `(videoId, targetLang)` chỉ có một bản ghi `AudioTrack`, được đảm bảo
bằng unique index. Nếu bản ghi đã ở trạng thái `done`, API trả kết quả ngay mà
không chạy lại pipeline. Nếu đang xử lý dở, API trả 202 kèm trạng thái hiện tại.
Truyền `force: true` để buộc chạy lại.

### Các bước trong worker

| Bước | Trạng thái | Việc làm |
|---|---|---|
| 1 | `extracting` | ffmpeg tách audio sang WAV 16kHz mono, upload lên `tiktak-audio` |
| 2 | `transcribing` | AI service `/transcribe` chạy Whisper, trả segment kèm mốc thời gian |
| 3 | `transcribing` | Lưu transcript, sinh phụ đề VTT cho ngôn ngữ gốc |
| 4 | `translating` | AI service `/translate` dịch từng segment bằng NLLB-200 |
| 5 | `translating` | Sinh phụ đề VTT cho ngôn ngữ đích, lưu vào collection `Subtitle` |
| 6 | `synthesizing` | AI service `/tts` đọc từng segment, co giãn tốc độ để khớp mốc thời gian, ghép thành một file mp3 |
| 7 | `synthesizing` | ffmpeg ghép audio mới vào video gốc, upload `<videoId>/dubbed/<lang>.mp4` |
| 8 | `done` | Cập nhật `AudioTrack`, gửi thông báo `dubbing_done` |

Lỗi ở bất kỳ bước nào đều đặt `status=failed` kèm `error`, và BullMQ sẽ thử lại
tối đa 3 lần với backoff luỹ thừa.

### Vì sao dịch theo segment

Nếu dịch cả đoạn rồi mới cắt, mốc thời gian sẽ lệch và phụ đề trôi khỏi khung
hình. Dịch từng segment giữ nguyên cặp `start`/`end` của Whisper, nhờ đó phụ đề
và audio lồng tiếng đều bám đúng vị trí.

### Khớp thời lượng

Lời dịch thường dài hơn hoặc ngắn hơn lời gốc. AI service đặt mỗi đoạn audio
vào đúng vị trí `start` trên một timeline im lặng dài bằng video. Đoạn nào đọc
dài hơn khoảng thời gian cho phép sẽ được tăng tốc, giới hạn trong khoảng
0.75x đến 1.6x để giọng không bị méo.

### Phía người xem

`GET /api/dubbing/video/:videoId` trả về danh sách `audioTracks` và `subtitles`.
Player tắt tiếng video gốc và phát file audio lồng tiếng song song bằng một thẻ
`<audio>`, đồng thời gắn phụ đề qua thẻ `<track>`. Hook `useVideoPlayer` kiểm
tra độ lệch mỗi lần `timeupdate`, lệch quá 0.3 giây thì kéo audio về đúng vị trí.

## 4. Kênh realtime

| Sự kiện | Hướng | Dùng ở đâu |
|---|---|---|
| `notification` | server → client | Like, bình luận, follow, video xong, lồng tiếng xong |
| `transcode:progress` | server → client | Trang upload, hiển thị phần trăm |
| `dubbing:progress` | server → client | Badge trạng thái trong menu chọn ngôn ngữ |
| `video:subscribe` | client → server | Trang xem video, nhận tiến trình của riêng video đó |

Socket.IO xác thực bằng JWT trong handshake, mỗi user vào một room `user:<id>`.

## 5. Điểm chưa làm

- Voice cloning: hiện dùng giọng chuẩn của edge-tts, chưa giữ đặc trưng giọng gốc.
- Lip-sync (Wav2Lip).
- Gợi ý nội dung bằng vector search; feed "Dành cho bạn" đang dùng công thức
  xếp hạng theo tương tác và độ mới, giảm dần theo thời gian.
- CDN trước MinIO.
