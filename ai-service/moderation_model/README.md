# Đặt model phân loại bình luận ở đây

Thư mục này được gắn vào container `ai-service` ở đường dẫn `/moderation_model` (chỉ đọc).

- **Model HuggingFace** (PhoBERT, XLM-R…): chép cả thư mục đã `save_pretrained()` vào đây
  (có `config.json`, `model.safetensors` hoặc `pytorch_model.bin`, file tokenizer).
  Rồi đặt `AI_MODERATION_MODEL_PATH=/moderation_model` trong `.env` ở thư mục gốc.
- **Model scikit-learn**: chép file `.pkl` / `.joblib` vào đây, VD `clf.joblib`,
  rồi đặt `AI_MODERATION_MODEL_PATH=/moderation_model/clf.joblib`
  và bỏ comment dòng `scikit-learn` trong `ai-service/requirements.txt` (đúng phiên bản lúc train).

Xem thêm `ai-service/README.md`, mục "Kiểm duyệt bình luận".
