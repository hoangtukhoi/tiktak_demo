"""Phân loại bình luận (sạch / vi phạm) bằng model bạn đã train.

Hỗ trợ 2 kiểu model, chọn bằng AI_MODERATION_MODEL_TYPE (mặc định "auto" = tự nhận):

1. "hf"      — thư mục HuggingFace (save_pretrained): config.json + model weights + tokenizer.
               VD PhoBERT / XLM-R / DistilBERT fine-tune cho phân loại văn bản.
2. "sklearn" — 1 file .pkl / .joblib chứa Pipeline có predict_proba
               (VD TfidfVectorizer + LogisticRegression / LinearSVC đã bọc CalibratedClassifierCV).

Điểm trả về (score) = xác suất bình luận KHÔNG thuộc nhóm "sạch"
= 1 - tổng xác suất các nhãn trong AI_MODERATION_CLEAN_LABELS.
Backend dùng score để quyết định hiện ngay / chờ duyệt / ẩn.
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


def _clean_labels() -> set[str]:
    raw = get_settings().moderation_clean_labels
    return {x.strip().lower() for x in raw.split(",") if x.strip()}


def _detect_type(path: str) -> str:
    kind = get_settings().moderation_model_type.lower()
    if kind in ("hf", "sklearn"):
        return kind
    if os.path.isdir(path):
        return "hf"
    if path.lower().endswith((".pkl", ".joblib", ".pickle")):
        return "sklearn"
    raise ValueError(f"Không nhận ra kiểu model ở {path}; đặt AI_MODERATION_MODEL_TYPE=hf hoặc sklearn")


def _preprocess(text: str) -> str:
    """Chuẩn hoá giống lúc train (sửa ở đây nếu lúc train bạn tiền xử lý khác)."""
    text = unicodedata.normalize("NFC", text or "")
    if get_settings().moderation_lowercase:
        text = text.lower()
    text = re.sub(r"https?://\S+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _load():
    global _model, _load_error
    settings = get_settings()
    path = settings.moderation_model_path
    if not path:
        raise RuntimeError("Chưa cấu hình AI_MODERATION_MODEL_PATH")
    if not os.path.exists(path):
        raise RuntimeError(f"Không tìm thấy model kiểm duyệt ở {path}")

    kind = _detect_type(path)
    logger.info("Đang nạp model kiểm duyệt bình luận (%s): %s", kind, path)
    if kind == "hf":
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(path)
        model = AutoModelForSequenceClassification.from_pretrained(path)
        model.eval()
        device = "cuda" if torch.cuda.is_available() and settings.moderation_device != "cpu" else "cpu"
        model.to(device)
        id2label = {int(k): str(v) for k, v in (model.config.id2label or {}).items()}
        _model = ("hf", tokenizer, model, device, id2label)
    else:
        import joblib

        clf = joblib.load(path)
        if not hasattr(clf, "predict_proba"):
            raise RuntimeError("Model sklearn phải có predict_proba (dùng CalibratedClassifierCV nếu là SVM)")
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
    return bool(get_settings().moderation_model_path)


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
