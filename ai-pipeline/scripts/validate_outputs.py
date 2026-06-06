from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ALLOWED_TYPES = {"traffic_sign", "traffic_light", "pothole", "damaged_sign"}
TIMESTAMP_PATTERN = re.compile(r"^\d{2}:\d{2}:\d{2}$")


def load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(f"Dosya bulunamadi: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_detection_item(item: dict, index: int) -> None:
    required_keys = {"type", "latitude", "longitude", "confidence", "timestamp"}
    extra_keys = set(item) - required_keys
    missing_keys = required_keys - set(item)

    require(not missing_keys, f"Detection {index}: eksik alanlar: {sorted(missing_keys)}")
    require(not extra_keys, f"Detection {index}: izin verilmeyen alanlar: {sorted(extra_keys)}")
    require(item["type"] in ALLOWED_TYPES, f"Detection {index}: gecersiz type: {item['type']}")
    require(isinstance(item["latitude"], int | float), f"Detection {index}: latitude sayi olmali")
    require(isinstance(item["longitude"], int | float), f"Detection {index}: longitude sayi olmali")
    require(-90 <= float(item["latitude"]) <= 90, f"Detection {index}: latitude aralik disi")
    require(-180 <= float(item["longitude"]) <= 180, f"Detection {index}: longitude aralik disi")
    require(isinstance(item["confidence"], int | float), f"Detection {index}: confidence sayi olmali")
    require(0 <= float(item["confidence"]) <= 1, f"Detection {index}: confidence 0-1 araliginda olmali")
    require(isinstance(item["timestamp"], str), f"Detection {index}: timestamp metin olmali")
    require(TIMESTAMP_PATTERN.match(item["timestamp"]) is not None, f"Detection {index}: timestamp HH:MM:SS olmali")


def validate_detection_file(path: Path) -> list[dict]:
    detections = load_json(path)
    require(isinstance(detections, list), "Detection dosyasi liste olmali")
    for index, item in enumerate(detections):
        require(isinstance(item, dict), f"Detection {index}: obje olmali")
        validate_detection_item(item, index)
    return detections


def validate_pipeline_report_file(path: Path) -> dict:
    report = load_json(path)
    require(isinstance(report, dict), "Pipeline raporu obje olmali")

    required_keys = {
        "generated_at",
        "input_video",
        "anonymized_video",
        "detections_raw_json",
        "detections_json",
        "pipeline_report_json",
        "anonymization",
        "raw_detection_count",
        "deduped_detection_count",
        "demo_fallback_used",
        "privacy_guardrails",
    }
    missing_keys = required_keys - set(report)
    require(not missing_keys, f"Pipeline raporu eksik alanlar: {sorted(missing_keys)}")

    guardrails = report["privacy_guardrails"]
    require(isinstance(guardrails, dict), "privacy_guardrails obje olmali")
    require(guardrails.get("runs_detection_after_anonymization") is True, "Detection anonimlestirme sonrasi calismali")
    require(guardrails.get("anonymization_succeeded") is True, "Fail-closed: anonymization_succeeded True olmali")
    require(guardrails.get("stores_raw_frames") is False, "Pipeline raw frame saklamamali")
    require(guardrails.get("json_contains_identity_data") is False, "JSON kimlik verisi icermemeli")
    require(isinstance(report["raw_detection_count"], int), "raw_detection_count integer olmali")
    require(isinstance(report["deduped_detection_count"], int), "deduped_detection_count integer olmali")
    require(
        report["deduped_detection_count"] <= report["raw_detection_count"],
        "Dedupe sonrasi kayit sayisi ham kayit sayisindan buyuk olamaz",
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline JSON ciktilarini ve KVKK guardrail raporunu dogrular.")
    parser.add_argument("--detections", required=True, type=Path)
    parser.add_argument("--pipeline-report", required=True, type=Path)
    args = parser.parse_args()

    detections = validate_detection_file(args.detections)
    validate_pipeline_report_file(args.pipeline_report)
    print(f"Validasyon basarili: {len(detections)} detection")


if __name__ == "__main__":
    main()

