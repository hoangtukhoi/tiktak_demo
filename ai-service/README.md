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

### Train model (Kaggle)

Notebook `notebooks/train_moderation_vihsd.ipynb` fine-tune **PhoBERT-v2** trên **ViHSD** (~33K bình luận, 3 nhãn `clean` / `offensive` / `hate`),
in ngưỡng đề xuất cho backend và đẩy model lên HuggingFace. Mở trên Kaggle (GPU T4, bật Internet, thêm Secret `HF_TOKEN` quyền Write) rồi Run All.
Sau đó chỉ cần `AI_MODERATION_MODEL_PATH=<tên-repo>` — bước tách từ (pyvi) được ghi trong `config.json` nên service tự làm giống lúc train.

> Không dùng model **cảm xúc** (tích cực / tiêu cực): câu chê bình thường ("phim dở quá") sẽ bị coi là vi phạm.

### Cắm model đã train (3 bước)

1. **Chép model vào `ai-service/moderation_model/`** — không cần đặt biến môi trường nào, service tự nhận:
   - Model HuggingFace (PhoBERT, XLM-R, DistilBERT…): cả thư mục `save_pretrained()` (có `config.json`, weights, tokenizer). Để thẳng trong `moderation_model/` hoặc trong 1 thư mục con đều được.
   - Model scikit-learn: 1 file `.pkl` / `.joblib` (Pipeline có `predict_proba`), và bỏ comment dòng `scikit-learn` trong `requirements.txt`.
   - Hoặc không chép gì, đặt `AI_MODERATION_MODEL_PATH=ten-ban/ten-model` để tự tải từ HuggingFace Hub lần đầu chạy.
2. **Kiểm tra model** (in nhãn, điểm và mức xử lý của vài câu mẫu):
   ```bash
   docker compose exec ai-service python scripts/check_moderation.py
   # hoặc chạy trực tiếp: cd ai-service && python scripts/check_moderation.py "câu cần thử"
   ```
   Nếu script báo "Không nhãn nào khớp AI_MODERATION_CLEAN_LABELS" thì khai báo nhãn sạch của model:
   - `AI_MODERATION_CLEAN_LABELS` — tên các nhãn "sạch" (VD `clean` hoặc `0`)
   - `AI_MODERATION_LABEL_NAMES` — nếu model chỉ lưu số lớp, đặt tên theo thứ tự (VD `clean,offensive,hate`)
3. **Khởi động lại `ai-service`**. `GET /health` có `moderation_loaded: true`; trang Quản trị → Bình luận hiện "Đang chấm bằng model".

Tách từ: model có `"word_segmenter": "pyvi"` trong `config.json` thì service tự tách từ bằng pyvi; ép bằng `AI_MODERATION_WORD_SEGMENTER=pyvi|none`. Tiền xử lý khác (bỏ dấu…) thì sửa `_preprocess` trong `app/moderation.py`.

### 3 mức xử lý (backend)

| Điểm của model | Kết quả |
|---|---|
| < `COMMENT_REVIEW_THRESHOLD` (0.5) | Hiện ngay |
| từ 0.5 đến < `COMMENT_REJECT_THRESHOLD` (0.85) | Ẩn tạm, vào hàng **Chờ duyệt** cho admin / kiểm duyệt viên |
| ≥ 0.85 | Ẩn luôn (nằm ở mục **Đã ẩn**, admin vẫn khôi phục được) |

Đổi ngưỡng trong `backend/.env`. `COMMENT_MODERATION_MODE=semi` nếu muốn điểm cao cũng chỉ chờ duyệt.

Chưa cắm model → endpoint trả 503 và backend tự dùng bộ lọc từ khoá (chỉ đưa bình luận nghi vấn vào hàng chờ, không tự ẩn).
