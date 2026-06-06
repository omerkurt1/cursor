from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

from anonymize_video import anonymize_video
from dedupe_json import dedupe
from detect_objects import detect_objects
from delete_raw_data import delete_raw_data


def main() -> None:
    parser = argparse.ArgumentParser(description="Anonimlestirme, tespit ve dedupe adimlarini tek komutla calistirir.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--lat", required=True, type=float)
    parser.add_argument("--lng", required=True, type=float)
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--confidence", default=0.35, type=float)
    parser.add_argument("--frame-stride", default=5, type=int)
    parser.add_argument("--demo-fallback", action="store_true")
    parser.add_argument("--output-dir", default=Path("output"), type=Path)
    parser.add_argument("--report-dir", default=Path("reports"), type=Path)
    parser.add_argument("--delete-raw-data", action="store_true")
    parser.add_argument("--raw-dir", type=Path)
    args = parser.parse_args()

    output_dir = args.output_dir
    report_dir = args.report_dir
    anonymized_video = output_dir / "anonymized_demo.mp4"
    raw_json = output_dir / "detections_raw.json"
    cleaned_json = output_dir / "detections.json"
    pipeline_report_json = report_dir / "pipeline_report.json"
    deletion_report_json = report_dir / "deletion_report.json"

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
        demo_fallback=args.demo_fallback,
    )
    print(f"Ham detection sayisi: {len(detections)}")

    cleaned = dedupe(detections, seconds_window=8, meters_window=12.0)
    cleaned_json.parent.mkdir(parents=True, exist_ok=True)
    cleaned_json.write_text(json.dumps(cleaned, indent=2), encoding="utf-8")
    print(f"Temiz detection sayisi: {len(cleaned)}")
    print(f"Final JSON: {cleaned_json}")

    deletion_report = None
    if args.delete_raw_data:
        raw_dir = args.raw_dir or args.input.parent
        deletion_report = delete_raw_data(raw_dir, deletion_report_json, confirm=True)
        print(f"Ham veri silme raporu: {deletion_report_json}")

    pipeline_report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "input_video": str(args.input),
        "anonymized_video": str(anonymized_video),
        "detections_raw_json": str(raw_json),
        "detections_json": str(cleaned_json),
        "pipeline_report_json": str(pipeline_report_json),
        "deletion_report_json": str(deletion_report_json) if deletion_report else None,
        "anonymization": report,
        "raw_detection_count": len(detections),
        "deduped_detection_count": len(cleaned),
        "demo_fallback_used": args.demo_fallback,
        "privacy_guardrails": {
            "runs_detection_after_anonymization": True,
            "stores_raw_frames": False,
            "json_contains_identity_data": False,
            "raw_data_deleted": bool(deletion_report),
        },
    }
    pipeline_report_json.parent.mkdir(parents=True, exist_ok=True)
    pipeline_report_json.write_text(json.dumps(pipeline_report, indent=2), encoding="utf-8")
    print(f"Pipeline raporu: {pipeline_report_json}")


if __name__ == "__main__":
    main()
