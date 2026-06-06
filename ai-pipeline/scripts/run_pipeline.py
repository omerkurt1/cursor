from __future__ import annotations

import argparse
from pathlib import Path

from anonymize_video import anonymize_video
from dedupe_json import dedupe
from detect_objects import detect_objects

import json


def main() -> None:
    parser = argparse.ArgumentParser(description="Anonimlestirme, tespit ve dedupe adimlarini tek komutla calistirir.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--lat", required=True, type=float)
    parser.add_argument("--lng", required=True, type=float)
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--confidence", default=0.35, type=float)
    parser.add_argument("--frame-stride", default=5, type=int)
    parser.add_argument("--output-dir", default=Path("output"), type=Path)
    args = parser.parse_args()

    output_dir = args.output_dir
    anonymized_video = output_dir / "anonymized_demo.mp4"
    raw_json = output_dir / "detections_raw.json"
    cleaned_json = output_dir / "detections.json"

    report = anonymize_video(args.input, anonymized_video)
    print(f"Anonimlestirme tamamlandi: {report}")

    detections = detect_objects(
        video_path=anonymized_video,
        output_path=raw_json,
        model_path=args.model,
        latitude=args.lat,
        longitude=args.lng,
        confidence_threshold=args.confidence,
        frame_stride=max(1, args.frame_stride),
    )
    print(f"Ham detection sayisi: {len(detections)}")

    cleaned = dedupe(detections, seconds_window=8, meters_window=12.0)
    cleaned_json.write_text(json.dumps(cleaned, indent=2), encoding="utf-8")
    print(f"Temiz detection sayisi: {len(cleaned)}")
    print(f"Final JSON: {cleaned_json}")


if __name__ == "__main__":
    main()

