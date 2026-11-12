"""Kiểm tra model kiểm duyệt bình luận trước khi chạy cả hệ thống.

Cách dùng (đứng trong thư mục ai-service):

    python scripts/check_moderation.py                       # chấm các câu mẫu
    python scripts/check_moderation.py "câu 1" "câu 2"       # chấm câu của bạn
    python scripts/check_moderation.py --model duong/dan/model --review 0.5 --reject 0.85

Trong Docker:

    docker compose exec ai-service python scripts/check_moderation.py

In ra: model đang dùng, danh sách nhãn, nhãn nào được coi là "sạch", điểm từng câu và
mức xử lý tương ứng ở backend:
    HIỆN NGAY   điểm < review
    CHỜ DUYỆT   review ≤ điểm < reject   (admin xem ở tab Bình luận)
    ẨN LUÔN     điểm ≥ reject
"""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SAMPLES = [
    "Video hay quá, cảm ơn bạn!",
    "Quay ở đâu vậy bạn ơi?",
    "Nhạc nền bài gì thế",
    "Nhìn ngu vãi",
    "Đồ óc chó, cút đi",
    "Thằng này đáng bị đánh chết",
]


def main() -> int:
    ap = argparse.ArgumentParser(description="Kiểm tra model kiểm duyệt bình luận")
    ap.add_argument("texts", nargs="*", help="Câu cần chấm (bỏ trống = dùng câu mẫu)")
    ap.add_argument("--model", help="Đường dẫn model / tên repo HuggingFace (mặc định: như cấu hình)")
    ap.add_argument("--review", type=float, default=float(os.getenv("COMMENT_REVIEW_THRESHOLD", 0.5)))
    ap.add_argument("--reject", type=float, default=float(os.getenv("COMMENT_REJECT_THRESHOLD", 0.85)))
    args = ap.parse_args()
    if args.model:
        os.environ["AI_MODERATION_MODEL_PATH"] = args.model

    from app import moderation  # import sau khi đặt biến môi trường
    from app.config import get_settings

    path = moderation.resolve_model_path()
    if not path:
        print("✗ Chưa có model. Chép model vào ai-service/moderation_model/ hoặc dùng --model <đường dẫn>.")
        return 1
    print(f"Model      : {path}")
    t0 = time.time()
    try:
        moderation.ensure_loaded()
    except Exception as exc:  # noqa: BLE001
        print(f"✗ Không nạp được model: {exc}")
        return 1
    print(f"Nạp xong   : {time.time() - t0:.1f}s")

    names = moderation.labels()
    clean = {x.strip().lower() for x in get_settings().moderation_clean_labels.split(",") if x.strip()}
    clean_found = [n for n in names if n.lower() in clean]
    print(f"Nhãn       : {', '.join(names) if names else '(1 đầu ra sigmoid = xác suất vi phạm)'}")
    if names:
        if clean_found:
            print(f"Nhãn sạch  : {', '.join(clean_found)}")
        else:
            print("⚠ Không nhãn nào khớp AI_MODERATION_CLEAN_LABELS → MỌI bình luận sẽ bị tính điểm 1.0.")
            print("  Đặt AI_MODERATION_CLEAN_LABELS=<tên nhãn sạch của model>, hoặc")
            print("  AI_MODERATION_LABEL_NAMES=clean,toxic,... theo đúng thứ tự lớp.")
    print(f"Tách từ    : {moderation.segmenter()}")
    print(f"Ngưỡng     : chờ duyệt ≥ {args.review} · ẩn luôn ≥ {args.reject}\n")

    texts = args.texts or SAMPLES
    t0 = time.time()
    results = moderation.classify(texts)
    ms = (time.time() - t0) * 1000 / max(1, len(texts))
    for text, r in zip(texts, results):
        tier = "ẨN LUÔN  " if r["score"] >= args.reject else "CHỜ DUYỆT" if r["score"] >= args.review else "HIỆN NGAY"
        print(f"{tier}  {r['score']:.3f}  [{r['label']}]  {text}")
    print(f"\n{ms:.0f} ms / bình luận")
    return 0 if (not names or clean_found) else 2


if __name__ == "__main__":
    raise SystemExit(main())
