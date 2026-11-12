from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Cấu hình đọc từ biến môi trường, có giá trị mặc định chạy được ngay trên CPU."""

    host: str = "0.0.0.0"
    port: int = 8002
    internal_key: str = "internal_secret_key"

    # Whisper: tiny/base/small/medium/large-v3.
    # Máy không có GPU nên dùng "small" trở xuống để giữ tốc độ chấp nhận được.
    whisper_model: str = "small"
    whisper_device: str = "auto"
    whisper_compute_type: str = "int8"

    # Mô hình dịch máy đa ngôn ngữ.
    translation_model: str = "facebook/nllb-200-distilled-600M"

    tts_engine: str = "edge"  # edge | none
    max_audio_seconds: int = 900
    download_timeout: int = 120
    model_cache_dir: str = "/models"

    # ── Kiểm duyệt bình luận (model bạn tự train) ──────────────────────
    # Đường dẫn thư mục HuggingFace hoặc file .pkl/.joblib. Bỏ trống = tắt (backend dùng bộ lọc từ khoá).
    moderation_model_path: str = ""
    moderation_model_type: str = "auto"  # auto | hf | sklearn
    # Nhãn được coi là "sạch" (so khớp không phân biệt hoa thường)
    moderation_clean_labels: str = "clean,normal,non-toxic,non_toxic,ok,label_0,0"
    # Tên nhãn theo thứ tự lớp nếu model chỉ lưu số 0,1,2 (VD "clean,offensive,hate")
    moderation_label_names: str = ""
    moderation_max_length: int = 256
    moderation_lowercase: bool = False
    # Tách từ trước khi đưa vào model: auto (theo config.json của model) | none | pyvi
    moderation_word_segmenter: str = "auto"
    moderation_device: str = "auto"  # auto | cpu
    moderation_max_batch: int = 64

    class Config:
        env_prefix = "AI_"
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
