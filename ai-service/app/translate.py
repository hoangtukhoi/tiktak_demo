"""Dịch máy đa ngôn ngữ bằng NLLB-200.

Dịch theo từng segment thay vì cả đoạn để giữ nguyên mốc thời gian,
nhờ đó phụ đề và audio lồng tiếng vẫn khớp với khung hình gốc.
"""

import logging
from typing import List, Optional

from .config import get_settings

logger = logging.getLogger(__name__)

# Mã ngôn ngữ của NLLB khác chuẩn ISO-639-1 nên cần bảng ánh xạ.
NLLB_CODES = {
    "vi": "vie_Latn",
    "en": "eng_Latn",
    "zh": "zho_Hans",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
    "fr": "fra_Latn",
    "de": "deu_Latn",
    "es": "spa_Latn",
    "th": "tha_Thai",
    "id": "ind_Latn",
}

_tokenizer = None
_model = None
_device = "cpu"


def _load():
    global _tokenizer, _model, _device
    if _model is not None:
        return _tokenizer, _model

    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    settings = get_settings()
    try:
        import torch

        _device = "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        _device = "cpu"

    logger.info("Đang nạp mô hình dịch %s trên %s", settings.translation_model, _device)
    _tokenizer = AutoTokenizer.from_pretrained(
        settings.translation_model, cache_dir=settings.model_cache_dir
    )
    _model = AutoModelForSeq2SeqLM.from_pretrained(
        settings.translation_model, cache_dir=settings.model_cache_dir
    ).to(_device)
    return _tokenizer, _model


def is_loaded() -> bool:
    return _model is not None


def to_nllb(code: str) -> Optional[str]:
    return NLLB_CODES.get(code)


def translate_texts(texts: List[str], source_lang: str, target_lang: str, batch_size: int = 8) -> List[str]:
    if source_lang == target_lang:
        return list(texts)

    src = to_nllb(source_lang)
    tgt = to_nllb(target_lang)
    if not src or not tgt:
        raise ValueError(f"Chưa hỗ trợ cặp ngôn ngữ {source_lang} -> {target_lang}")

    tokenizer, model = _load()
    tokenizer.src_lang = src

    # convert_tokens_to_ids hoạt động với cả tokenizer NLLB cũ và mới.
    bos_id = tokenizer.convert_tokens_to_ids(tgt)

    outputs: List[str] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        encoded = tokenizer(batch, return_tensors="pt", padding=True, truncation=True, max_length=512)
        encoded = {k: v.to(_device) for k, v in encoded.items()}
        generated = model.generate(**encoded, forced_bos_token_id=bos_id, max_length=512, num_beams=4)
        outputs.extend(tokenizer.batch_decode(generated, skip_special_tokens=True))

    return outputs
