"""Tổng hợp giọng nói và khớp thời lượng với video gốc.

Cách làm: đọc từng segment thành một file audio riêng, đặt đúng vị trí
theo mốc thời gian, rồi co giãn tốc độ đọc của segment nào vượt quá
khoảng thời gian cho phép. Nhờ vậy lời dịch không bị trôi khỏi khung hình.
"""

import asyncio
import logging
import os
import tempfile
from typing import List, Optional

from pydub import AudioSegment

from .config import get_settings

logger = logging.getLogger(__name__)

# Giọng đọc mặc định của edge-tts theo từng ngôn ngữ.
VOICES = {
    "vi": "vi-VN-HoaiMyNeural",
    "en": "en-US-AriaNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "es": "es-ES-ElviraNeural",
    "th": "th-TH-PremwadeeNeural",
    "id": "id-ID-GadisNeural",
}

# Giới hạn co giãn để giọng đọc không méo tiếng.
MIN_RATE = 0.75
MAX_RATE = 1.6


def voice_for(lang: str) -> str:
    return VOICES.get(lang, VOICES["en"])


async def _synth_one(text: str, voice: str, out_path: str) -> None:
    import edge_tts

    await edge_tts.Communicate(text, voice).save(out_path)


def _speed_up(audio: AudioSegment, rate: float) -> AudioSegment:
    """Đổi tốc độ phát mà vẫn giữ được cao độ ở mức chấp nhận được."""
    rate = max(MIN_RATE, min(MAX_RATE, rate))
    if abs(rate - 1.0) < 0.02:
        return audio
    adjusted = audio._spawn(audio.raw_data, overrides={"frame_rate": int(audio.frame_rate * rate)})
    return adjusted.set_frame_rate(audio.frame_rate)


def synthesize(
    segments: List[dict],
    target_lang: str,
    total_duration: float = 0.0,
    match_duration: bool = True,
) -> tuple[bytes, float, str]:
    """Trả về (bytes mp3, thời lượng giây, tên giọng đọc)."""
    settings = get_settings()
    if settings.tts_engine == "none":
        raise RuntimeError("TTS đang bị tắt trong cấu hình")

    voice = voice_for(target_lang)
    timeline_ms = int(max(total_duration, segments[-1]["end"] if segments else 0) * 1000)
    timeline = AudioSegment.silent(duration=max(timeline_ms, 1000))

    workdir = tempfile.mkdtemp(prefix="tts-")
    try:
        for index, seg in enumerate(segments):
            text = (seg.get("text") or "").strip()
            if not text:
                continue

            part_path = os.path.join(workdir, f"seg_{index}.mp3")
            asyncio.run(_synth_one(text, voice, part_path))
            if not os.path.exists(part_path) or os.path.getsize(part_path) == 0:
                logger.warning("Segment %s không tạo được audio, bỏ qua", index)
                continue

            clip = AudioSegment.from_file(part_path)
            start_ms = int(seg.get("start", 0) * 1000)
            slot_ms = int((seg.get("end", 0) - seg.get("start", 0)) * 1000)

            if match_duration and slot_ms > 300 and len(clip) > slot_ms:
                clip = _speed_up(clip, len(clip) / slot_ms)
                if len(clip) > slot_ms:
                    clip = clip[:slot_ms]

            timeline = timeline.overlay(clip, position=start_ms)

        out_path = os.path.join(workdir, "output.mp3")
        timeline.export(out_path, format="mp3", bitrate="128k")
        with open(out_path, "rb") as fh:
            data = fh.read()
        return data, round(len(timeline) / 1000, 3), voice
    finally:
        for name in os.listdir(workdir):
            os.remove(os.path.join(workdir, name))
        os.rmdir(workdir)


def engine_name() -> str:
    return get_settings().tts_engine
