from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

from anonymize_video import anonymize_video, AnonymizationError
from dedupe_json import dedupe
from detect_objects import detect_objects
from delete_raw_data import delete_raw_data
from validate_outputs import validate_detection_file, validate_pipeline_report_file


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def report_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def sanitize_anonymization_report(report: dict) -> dict:
    sanitized = dict(report)
    for key in ("input", "output"):
        if key in sanitized:
            sanitized[key] = report_path(Path(sanitized[key]))
    return sanitized


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
    parser.add_argument("--skip-validation", action="store_true")
    args = parser.parse_args()

    output_dir = args.output_dir
    report_dir = args.report_dir
    anonymized_video = output_dir / "anonymized_demo.mp4"
    raw_json = output_dir / "detections_raw.json"
    cleaned_json = output_dir / "detections.json"
    pipeline_report_json = report_dir / "pipeline_report.json"
    deletion_report_json = report_dir / "deletion_report.json"

    try:
        report = anonymize_video(args.input, anonymized_video)
    except AnonymizationError as exc:
        print(f"[FAIL-CLOSED] Anonimlestirme basarisiz: {exc}", flush=True)
        raise SystemExit(1) from exc

    print(f"Anonimlestirme tamamlandi: {report}")

    # Fail-closed guard: detection yalnizca basarili anonimlestirme sonrasi baslar.
    assert anonymized_video.exists() and anonymized_video.stat().st_size > 0, (
        "Anonimlestirme ciktisi gecersiz; detection engellenemedi."
    )

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
        "input_video": report_path(args.input),
        "anonymized_video": report_path(anonymized_video),
        "detections_raw_json": report_path(raw_json),
        "detections_json": report_path(cleaned_json),
        "pipeline_report_json": report_path(pipeline_report_json),
        "deletion_report_json": report_path(deletion_report_json) if deletion_report else None,
        "anonymization": sanitize_anonymization_report(report),
        "raw_detection_count": len(detections),
        "deduped_detection_count": len(cleaned),
        "demo_fallback_used": args.demo_fallback,
        "privacy_guardrails": {
            "runs_detection_after_anonymization": True,
            "anonymization_succeeded": True,
            "stores_raw_frames": False,
            "json_contains_identity_data": False,
            "raw_data_deleted": bool(deletion_report),
        },
    }
    pipeline_report_json.parent.mkdir(parents=True, exist_ok=True)
    pipeline_report_json.write_text(json.dumps(pipeline_report, indent=2), encoding="utf-8")
    print(f"Pipeline raporu: {pipeline_report_json}")

    if not args.skip_validation:
        validate_detection_file(cleaned_json)
        validate_pipeline_report_file(pipeline_report_json)
        print("Cikti validasyonu tamamlandi.")


if __name__ == "__main__":
    main()
