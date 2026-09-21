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
