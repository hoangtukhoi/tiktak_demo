"""Phân loại bình luận (sạch / vi phạm) bằng model bạn đã train.

Hỗ trợ 2 kiểu model, chọn bằng AI_MODERATION_MODEL_TYPE (mặc định "auto" = tự nhận):

1. "hf"      — thư mục HuggingFace (save_pretrained): config.json + model weights + tokenizer.
               VD PhoBERT / XLM-R / DistilBERT fine-tune cho phân loại văn bản.
2. "sklearn" — 1 file .pkl / .joblib chứa Pipeline có predict_proba
               (VD TfidfVectorizer + LogisticRegression / LinearSVC đã bọc CalibratedClassifierCV).

Điểm trả về (score) = xác suất bình luận KHÔNG thuộc nhóm "sạch"
= 1 - tổng xác suất các nhãn trong AI_MODERATION_CLEAN_LABELS.
Backend dùng score để quyết định hiện ngay / chờ duyệt / ẩn.

Model lấy từ đâu (theo thứ tự):
  1. AI_MODERATION_MODEL_PATH nếu có đặt:
       - đường dẫn thư mục / file trên máy, hoặc
       - tên repo trên HuggingFace Hub dạng "tên-người/tên-model" (tự tải về lần đầu).
  2. Không đặt gì → tự tìm trong thư mục mặc định (/moderation_model khi chạy Docker,
     ai-service/moderation_model khi chạy trực tiếp): chỉ cần chép model vào đó rồi khởi động lại.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import unicodedata

from .config import get_settings

logger = logging.getLogger("ai-service.moderation")

_lock = threading.Lock()
_model = None  # (kind, objects...)
_load_error: str | None = None
_segmenter: str = "none"  # bộ tách từ đang dùng: none | pyvi


def _clean_labels() -> set[str]:
    raw = get_settings().moderation_clean_labels
    return {x.strip().lower() for x in raw.split(",") if x.strip()}


_HUB_ID = re.compile(r"^[\w.-]+/[\w.-]+$")
_SK_EXT = (".pkl", ".joblib", ".pickle")
_DEFAULT_DIRS = (
    "/moderation_model",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "moderation_model"),
)


def _find_in_dir(folder: str) -> str | None:
    """Thư mục có model HuggingFace (config.json) → trả thư mục; có file sklearn → trả file đó."""
    if not os.path.isdir(folder):
        return None
    if os.path.isfile(os.path.join(folder, "config.json")):
        return folder
    files = sorted(f for f in os.listdir(folder) if f.lower().endswith(_SK_EXT))
    if files:
        return os.path.join(folder, files[0])
    # Giải nén ra 1 thư mục con (VD moderation_model/phobert-toxic/config.json)
    for name in sorted(os.listdir(folder)):
        sub = os.path.join(folder, name)
        if os.path.isdir(sub) and os.path.isfile(os.path.join(sub, "config.json")):
            return sub
    return None


def resolve_model_path() -> str:
    """Đường dẫn / tên repo model sẽ dùng; chuỗi rỗng = chưa có model."""
    configured = (get_settings().moderation_model_path or "").strip()
    if configured:
        if os.path.isdir(configured):
            return _find_in_dir(configured) or configured
        return configured
    for folder in _DEFAULT_DIRS:
        found = _find_in_dir(folder)
        if found:
            return found
    return ""


def _is_hub_id(path: str) -> bool:
    return not os.path.exists(path) and bool(_HUB_ID.match(path)) and not path.lower().endswith(_SK_EXT)


def _detect_type(path: str) -> str:
    kind = get_settings().moderation_model_type.lower()
    if kind in ("hf", "sklearn"):
        return kind
    if os.path.isdir(path) or _is_hub_id(path):
        return "hf"
    if path.lower().endswith((".pkl", ".joblib", ".pickle")):
        return "sklearn"
    raise ValueError(f"Không nhận ra kiểu model ở {path}; đặt AI_MODERATION_MODEL_TYPE=hf hoặc sklearn")


def _choose_segmenter(config_value: str | None) -> str:
    """Bộ tách từ: biến AI_MODERATION_WORD_SEGMENTER (nếu khác "auto") > config.json của model > không tách."""
    wanted = (get_settings().moderation_word_segmenter or "auto").strip().lower()
    if wanted == "auto":
        wanted = (config_value or "none").strip().lower()
    if wanted not in ("none", "pyvi"):
        raise RuntimeError(f"Bộ tách từ '{wanted}' chưa hỗ trợ (dùng pyvi hoặc none)")
    if wanted == "pyvi":
        try:
            from pyvi import ViTokenizer  # noqa: F401
        except ImportError as exc:
            raise RuntimeError("Model cần tách từ bằng pyvi: thêm 'pyvi' vào requirements.txt rồi build lại ai-service") from exc
    return wanted


def _preprocess(text: str) -> str:
    """Chuẩn hoá giống lúc train — notebooks/train_moderation_vihsd.ipynb dùng đúng các bước này."""
    text = unicodedata.normalize("NFC", text or "")
    if get_settings().moderation_lowercase:
        text = text.lower()
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    # PhoBERT học trên câu đã tách từ ("cảm_ơn", "óc_chó") → phải tách giống lúc train
    if _segmenter == "pyvi" and text:
        from pyvi import ViTokenizer

        text = ViTokenizer.tokenize(text)
    return text


def _load():
    global _model, _load_error, _segmenter
    settings = get_settings()
    path = resolve_model_path()
    if not path:
        raise RuntimeError("Chưa có model kiểm duyệt: chép model vào ai-service/moderation_model/ hoặc đặt AI_MODERATION_MODEL_PATH")
    if not os.path.exists(path) and not _is_hub_id(path):
        raise RuntimeError(f"Không tìm thấy model kiểm duyệt ở {path}")

    kind = _detect_type(path)
    logger.info("Đang nạp model kiểm duyệt bình luận (%s): %s", kind, path)
    if kind == "hf":
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        # Tên repo trên Hub → tải về thư mục cache model (lần sau dùng lại, không tải nữa)
        cache = settings.model_cache_dir if _is_hub_id(path) else None
        tokenizer = AutoTokenizer.from_pretrained(path, cache_dir=cache)
        model = AutoModelForSequenceClassification.from_pretrained(path, cache_dir=cache)
        model.eval()
        device = "cuda" if torch.cuda.is_available() and settings.moderation_device != "cpu" else "cpu"
        model.to(device)
        id2label = {int(k): str(v) for k, v in (model.config.id2label or {}).items()}
        # Model train bằng notebook của TikTak ghi word_segmenter vào config.json
        _segmenter = _choose_segmenter(getattr(model.config, "word_segmenter", None))
        if _segmenter != "none":
            logger.info("Tách từ trước khi chấm điểm: %s", _segmenter)
        _model = ("hf", tokenizer, model, device, id2label)
    else:
        import joblib

        clf = joblib.load(path)
        if not hasattr(clf, "predict_proba"):
            raise RuntimeError("Model sklearn phải có predict_proba (dùng CalibratedClassifierCV nếu là SVM)")
        _segmenter = _choose_segmenter(None)
        _model = ("sklearn", clf)
    _load_error = None
    logger.info("Đã nạp model kiểm duyệt")


def ensure_loaded() -> None:
    global _load_error
    if _model is not None:
        return
    with _lock:
        if _model is not None:
            return
        try:
            _load()
        except Exception as exc:  # giữ lỗi để /health báo ra
            _load_error = str(exc)
            raise


def is_loaded() -> bool:
    return _model is not None


def is_configured() -> bool:
    return bool(resolve_model_path())


def model_name() -> str:
    return resolve_model_path()


def labels() -> list[str]:
    """Tên các nhãn của model đang nạp (để kiểm tra AI_MODERATION_CLEAN_LABELS đã đúng chưa)."""
    if _model is None:
        return []
    if _model[0] == "hf":
        id2label = _model[4]
        return _label_names([id2label.get(i, str(i)) for i in range(len(id2label))]) if id2label else []
    return _label_names([str(c) for c in _model[1].classes_])


def segmenter() -> str:
    return _segmenter


def last_error() -> str | None:
    return _load_error


def _label_names(model_names: list[str]) -> list[str]:
    """Tên nhãn trong AI_MODERATION_LABEL_NAMES (nếu khai báo đủ số lớp) được ưu tiên hơn tên lưu trong model."""
    custom = [x.strip() for x in get_settings().moderation_label_names.split(",") if x.strip()]
    if custom and len(custom) == len(model_names):
        return custom
    if custom:
        logger.warning("AI_MODERATION_LABEL_NAMES có %d nhãn nhưng model có %d lớp → dùng tên trong model", len(custom), len(model_names))
    return model_names


def classify(texts: list[str]) -> list[dict]:
    """Trả về [{label, score, scores}] theo đúng thứ tự texts."""
    ensure_loaded()
    clean = _clean_labels()
    texts = [_preprocess(t) for t in texts]
    kind = _model[0]

    if kind == "hf":
        import torch

        _, tokenizer, model, device, id2label = _model
        with torch.no_grad():
            enc = tokenizer(
                texts,
                padding=True,
                truncation=True,
                max_length=get_settings().moderation_max_length,
                return_tensors="pt",
            ).to(device)
            logits = model(**enc).logits
            if logits.shape[-1] == 1:  # 1 đầu ra (sigmoid) = xác suất vi phạm
                probs = torch.sigmoid(logits).cpu().tolist()
                return [
                    {"label": "toxic" if p[0] >= 0.5 else "clean", "score": float(p[0]), "scores": {"toxic": float(p[0])}}
                    for p in probs
                ]
            probs = torch.softmax(logits, dim=-1).cpu().tolist()
        names = _label_names([id2label.get(i, str(i)) for i in range(len(probs[0]))])
    else:
        clf = _model[1]
        probs = clf.predict_proba(texts).tolist()
        names = _label_names([str(c) for c in clf.classes_])

    results = []
    for row in probs:
        scores = {names[i]: float(p) for i, p in enumerate(row)}
        clean_p = sum(p for name, p in scores.items() if name.lower() in clean)
        best = max(scores, key=scores.get)
        results.append({"label": best, "score": round(max(0.0, min(1.0, 1.0 - clean_p)), 4), "scores": scores})
    return results
