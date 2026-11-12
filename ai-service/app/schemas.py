from typing import List, Optional

from pydantic import BaseModel, Field


class Segment(BaseModel):
    """Một đoạn lời thoại kèm mốc thời gian, đơn vị giây."""

    id: int = 0
    start: float = 0.0
    end: float = 0.0
    text: str = ""


class TranscribeRequest(BaseModel):
    audio_url: str
    language: Optional[str] = None


class TranscribeResponse(BaseModel):
    language: Optional[str] = None
    duration: float = 0.0
    text: str = ""
    segments: List[Segment] = Field(default_factory=list)
    model: Optional[str] = None


class TranslateRequest(BaseModel):
    segments: List[Segment]
    source_lang: str
    target_lang: str


class TranslateResponse(BaseModel):
    source_lang: str
    target_lang: str
    text: str = ""
    segments: List[Segment] = Field(default_factory=list)
    model: Optional[str] = None


class TTSRequest(BaseModel):
    segments: List[Segment]
    target_lang: str
    speaker_audio_url: Optional[str] = None
    total_duration: float = 0.0
    match_duration: bool = True


class TTSResponse(BaseModel):
    audio_base64: str
    format: str = "mp3"
    duration: float = 0.0
    voice: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    whisper_loaded: bool
    translator_loaded: bool
    tts_engine: str
    device: str
    moderation_configured: bool = False
    moderation_loaded: bool = False
    moderation_error: Optional[str] = None
    moderation_model: str = ""  # đường dẫn / tên repo model đang dùng
    moderation_labels: list[str] = Field(default_factory=list)  # nhãn của model (sau khi nạp)
    moderation_segmenter: str = "none"  # bộ tách từ trước khi chấm (pyvi với model PhoBERT train bằng notebook)


class ModerateRequest(BaseModel):
    texts: list[str] = Field(default_factory=list)


class ModerationResult(BaseModel):
    label: str
    score: float  # 0–1: xác suất KHÔNG sạch
    scores: dict[str, float] = Field(default_factory=dict)


class ModerateResponse(BaseModel):
    results: list[ModerationResult] = Field(default_factory=list)
    model: str = ""
