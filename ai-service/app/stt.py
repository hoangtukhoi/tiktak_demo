"""Speech-to-Text bằng faster-whisper.

Model được nạp một lần khi khởi động (lazy) và dùng lại cho mọi request,
vì thời gian nạp lớn hơn nhiều so với thời gian suy luận một video ngắn.
"""

import logging
from typing import List, Optional, Tuple

from .config import get_settings

logger = logging.getLogger(__name__)

_model = None


def _resolve_device(preferred: str) -> str:
    if preferred != "auto":
        return preferred
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        settings = get_settings()
        device = _resolve_device(settings.whisper_device)
        compute_type = "float16" if device == "cuda" else settings.whisper_compute_type
        logger.info("Đang nạp Whisper %s trên %s", settings.whisper_model, device)
        _model = WhisperModel(
            settings.whisper_model,
            device=device,
            compute_type=compute_type,
            download_root=settings.model_cache_dir,
        )
    return _model


def is_loaded() -> bool:
    return _model is not None


def transcribe(audio_path: str, language: Optional[str] = None) -> Tuple[str, float, List[dict]]:
    """Trả về (ngôn ngữ nhận diện, thời lượng, danh sách segment)."""
    model = get_model()
    segments, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=True,  # bỏ khoảng lặng để mốc thời gian sát lời thoại hơn
        vad_parameters={"min_silence_duration_ms": 500},
    )

    results = []
    for index, seg in enumerate(segments):
        text = seg.text.strip()
        if not text:
            continue
        results.append({"id": index, "start": round(seg.start, 3), "end": round(seg.end, 3), "text": text})

    return info.language, round(info.duration, 3), results
