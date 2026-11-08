# TikTak AI Service

Service Python/FastAPI phục vụ pipeline dịch và lồng tiếng. Backend Node gọi
vào đây qua HTTP, service không truy cập database.

## Endpoint

| Method | Path | Mô tả |
|---|---|---|
| GET | `/health` | Trạng thái model và thiết bị đang dùng |
| POST | `/transcribe` | Nhận dạng lời thoại kèm mốc thời gian |
| POST | `/translate` | Dịch từng segment sang ngôn ngữ đích |
| POST | `/tts` | Tổng hợp giọng nói, khớp thời lượng video gốc |

Mọi endpoint trừ `/health` yêu cầu header `X-Internal-Key` trùng với
`AI_INTERNAL_KEY`, đồng thời trùng `INTERNAL_KEY` phía backend.

## Mô hình sử dụng

| Bước | Mô hình | Ghi chú |
|---|---|---|
| Speech-to-Text | faster-whisper | Mặc định `small`, chạy được trên CPU |
| Dịch máy | NLLB-200 distilled 600M | Hỗ trợ 10 ngôn ngữ của dự án |
| Text-to-Speech | edge-tts | Không cần GPU, không cần tải model |

Lần chạy đầu tiên sẽ tải model về `AI_MODEL_CACHE_DIR`, mất vài phút tuỳ mạng.

## Chạy cục bộ

```bash
cd ai-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --port 8002 --reload
```

Cần ffmpeg có sẵn trong PATH.

## Chạy bằng Docker

```bash
docker build -t tiktak-ai ./ai-service
docker run -p 8002:8002 -v tiktak-models:/models --env-file ai-service/.env tiktak-ai
```

## Hợp đồng dữ liệu

`POST /transcribe`

```json
{ "audio_url": "http://minio:9000/tiktak-audio/<id>/audio/source.wav", "language": "vi" }
```

```json
{
  "language": "vi",
  "duration": 32.5,
  "text": "...",
  "segments": [{ "id": 0, "start": 0.0, "end": 3.2, "text": "Xin chào" }]
}
```

`POST /translate` nhận `segments`, `source_lang`, `target_lang` và trả lại
đúng số segment với `text` đã dịch, giữ nguyên `start`/`end`.

`POST /tts` nhận segment đã dịch và trả `audio_base64` định dạng mp3.
Segment nào đọc dài hơn khoảng thời gian gốc sẽ được tăng tốc trong khoảng
0.75x đến 1.6x để bản lồng tiếng không trôi khỏi khung hình.

## Giới hạn hiện tại

- Chưa có voice cloning: giọng đọc lấy từ bộ giọng chuẩn của edge-tts theo
  từng ngôn ngữ, chưa giữ được đặc trưng giọng người nói gốc.
- Chưa có lip-sync (Wav2Lip).
- Model dịch tải toàn bộ vào RAM, cần khoảng 3 GB cho bản 600M.

## Kiểm duyệt bình luận

Endpoint `POST /moderate/comments` (header `x-internal-key`) nhận `{ "texts": ["..."] }` và trả
`{ "results": [{ "label", "score", "scores" }] }`. `score` (0–1) là xác suất bình luận **không sạch**.
Backend dùng điểm này để hiện ngay, đưa vào hàng chờ cho admin, hoặc tự ẩn (xem `COMMENT_MODERATION_*` trong `backend/.env.example`).

Cắm model đã train:

1. Chép model vào `ai-service/moderation_model/` (xem README trong thư mục đó).
2. Đặt biến môi trường (file `.env` ở thư mục gốc khi chạy docker compose, hoặc `ai-service/.env` khi chạy trực tiếp):
   - `AI_MODERATION_MODEL_PATH` — thư mục HuggingFace hoặc file `.pkl`/`.joblib`
   - `AI_MODERATION_CLEAN_LABELS` — tên các nhãn "sạch" (VD `clean` hoặc `0`)
   - `AI_MODERATION_LABEL_NAMES` — nếu model chỉ lưu số lớp, đặt tên theo thứ tự (VD `clean,offensive,hate`)
3. Nếu lúc train có tiền xử lý riêng (tách từ cho PhoBERT, bỏ dấu…), sửa hàm `_preprocess` trong `app/moderation.py` cho giống.
4. Kiểm tra: `GET /health` có `moderation_loaded: true`.

Chưa cắm model → endpoint trả 503 và backend tự dùng bộ lọc từ khoá (chỉ đưa bình luận nghi vấn vào hàng chờ, không tự ẩn).
