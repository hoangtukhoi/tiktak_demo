"""AI service cho TikTak: Speech-to-Text, dịch máy và tổng hợp giọng nói.

Backend Node gọi ba endpoint /transcribe, /translate, /tts theo đúng thứ tự
của pipeline lồng tiếng. Service này không truy cập database, chỉ nhận
URL audio hoặc văn bản và trả kết quả.
"""

import base64
import logging
import os
import tempfile

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

from . import stt, translate, tts
from .config import get_settings
from .schemas import (
    HealthResponse,
    Segment,
    TranscribeRequest,
    TranscribeResponse,
    TranslateRequest,
    TranslateResponse,
    TTSRequest,
    TTSResponse,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ai-service")

app = FastAPI(title="TikTak AI Service", version="1.0.0")


def verify_internal_key(x_internal_key: str = Header(default="")) -> None:
    """Service chỉ phục vụ backend nội bộ, không mở ra Internet."""
    expected = get_settings().internal_key
    if expected and x_internal_key != expected:
        raise HTTPException(status_code=403, detail="Internal key không hợp lệ")


async def download_audio(url: str) -> str:
    settings = get_settings()
    suffix = os.path.splitext(url.split("?")[0])[1] or ".wav"
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)

    try:
        async with httpx.AsyncClient(timeout=settings.download_timeout, follow_redirects=True) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                with open(path, "wb") as fh:
                    async for chunk in response.aiter_bytes(1024 * 256):
                        fh.write(chunk)
        return path
    except Exception as exc:
        os.path.exists(path) and os.remove(path)
        raise HTTPException(status_code=400, detail=f"Không tải được audio: {exc}") from exc


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    try:
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        device = "cpu"

    return HealthResponse(
        status="ok",
        whisper_loaded=stt.is_loaded(),
        translator_loaded=translate.is_loaded(),
        tts_engine=settings.tts_engine,
        device=device,
    )


@app.post("/transcribe", response_model=TranscribeResponse, dependencies=[Depends(verify_internal_key)])
async def transcribe_endpoint(payload: TranscribeRequest) -> TranscribeResponse:
    audio_path = await download_audio(payload.audio_url)
    try:
        language, duration, segments = stt.transcribe(audio_path, payload.language)
    except Exception as exc:
        logger.exception("Transcribe thất bại")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        os.path.exists(audio_path) and os.remove(audio_path)

    return TranscribeResponse(
        language=language,
        duration=duration,
        text=" ".join(s["text"] for s in segments),
        segments=[Segment(**s) for s in segments],
        model=get_settings().whisper_model,
    )


@app.post("/translate", response_model=TranslateResponse, dependencies=[Depends(verify_internal_key)])
async def translate_endpoint(payload: TranslateRequest) -> TranslateResponse:
    if not payload.segments:
        return TranslateResponse(source_lang=payload.source_lang, target_lang=payload.target_lang)

    try:
        translated = translate.translate_texts(
            [s.text for s in payload.segments], payload.source_lang, payload.target_lang
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Translate thất bại")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    segments = [
        Segment(id=src.id, start=src.start, end=src.end, text=text)
        for src, text in zip(payload.segments, translated)
    ]

    return TranslateResponse(
        source_lang=payload.source_lang,
        target_lang=payload.target_lang,
        text=" ".join(s.text for s in segments),
        segments=segments,
        model=get_settings().translation_model,
    )


@app.post("/tts", response_model=TTSResponse, dependencies=[Depends(verify_internal_key)])
async def tts_endpoint(payload: TTSRequest) -> TTSResponse:
    if not payload.segments:
        raise HTTPException(status_code=400, detail="Không có nội dung để đọc")

    try:
        audio, duration, voice = tts.synthesize(
            [s.model_dump() for s in payload.segments],
            payload.target_lang,
            payload.total_duration,
            payload.match_duration,
        )
    except Exception as exc:
        logger.exception("TTS thất bại")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return TTSResponse(
        audio_base64=base64.b64encode(audio).decode("ascii"),
        format="mp3",
        duration=duration,
        voice=voice,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    logger.exception("Lỗi không bắt được")
    return JSONResponse(status_code=500, content={"detail": str(exc)})


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port)
