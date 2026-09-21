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

    class Config:
        env_prefix = "AI_"
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
