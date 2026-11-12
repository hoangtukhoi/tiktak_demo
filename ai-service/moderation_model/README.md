# Đặt model phân loại bình luận ở đây

Chép model vào thư mục này rồi khởi động lại `ai-service` — service tự nhận, không cần cấu hình thêm.

- **Model HuggingFace** (PhoBERT, XLM-R…): cả thư mục đã `save_pretrained()`
  (có `config.json`, `model.safetensors` hoặc `pytorch_model.bin`, file tokenizer).
  Để thẳng ở đây hoặc trong 1 thư mục con.
- **Model scikit-learn**: 1 file `.pkl` / `.joblib` (VD `clf.joblib`),
  và bỏ comment dòng `scikit-learn` trong `ai-service/requirements.txt` (đúng phiên bản lúc train).

Kiểm tra: `python scripts/check_moderation.py` (trong thư mục `ai-service`, hoặc `docker compose exec ai-service ...`).

Xem thêm `ai-service/README.md`, mục "Kiểm duyệt bình luận".
