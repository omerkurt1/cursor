"""Street View'den JSON'a tam pipeline.

Adimlar:
  1. Google Street View API'den goruntu indir  -> data/input/streetview_<lat>_<lng>.mp4
  2. Yuz + plaka blurlama (fail-closed)        -> output/anonymized_demo.mp4
  3. Urban object detection                    -> output/detections_raw.json
  4. Duplicate temizleme                       -> output/detections.json
  5. Pipeline raporu                           -> reports/pipeline_report.json
  6. (Opsiyonel) Ham veri silme               -> reports/deletion_report.json

Kullanim:
    python scripts/streetview_pipeline.py \
        --lat 41.021 --lng 28.874 \
        --api-key YOUR_KEY

    # API key ortam degiskeninden:
    $env:STREET_VIEW_API_KEY = "YOUR_KEY"
    python scripts/streetview_pipeline.py --lat 41.021 --lng 28.874

    # YOLO yoksa demo modunda:
    python scripts/streetview_pipeline.py --lat 41.021 --lng 28.874 --demo-fallback

    # Ham veriyi silerek:
    python scripts/streetview_pipeline.py --lat 41.021 --lng 28.874 --delete-raw-data
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from anonymize_video import anonymize_video, AnonymizationError
from dedupe_json import dedupe
from delete_raw_data import delete_raw_data
from detect_objects import detect_objects
from fetch_street_view import fetch_to_video, StreetViewError, _get_api_key
from validate_outputs import validate_detection_file, validate_pipeline_report_file


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def report_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def sanitize_report(report: dict) -> dict:
    sanitized = dict(report)
    for key in ("input", "output"):
        if key in sanitized:
            sanitized[key] = report_path(Path(sanitized[key]))
    return sanitized


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Google Street View'den JSON'a tam AI privacy pipeline."
    )
    parser.add_argument("--lat", required=True, type=float)
    parser.add_argument("--lng", required=True, type=float)
    parser.add_argument("--api-key", default=None, help="Google Street View API anahtari (yoksa STREET_VIEW_API_KEY env)")
    parser.add_argument("--headings", default="0,90,180,270", help="Yon acimlari (virgul ayirici)")
    parser.add_argument("--size", default="640x480")
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--confidence", default=0.35, type=float)
    parser.add_argument("--frame-stride", default=5, type=int)
    parser.add_argument("--demo-fallback", action="store_true",
                        help="YOLO yoksa entegrasyon icin isaretlenmis ornek JSON uretir")
    parser.add_argument("--output-dir", default=Path("output"), type=Path)
    parser.add_argument("--report-dir", default=Path("reports"), type=Path)
    parser.add_argument("--delete-raw-data", action="store_true",
                        help="Pipeline sonunda ham Street View videosunu sil")
    parser.add_argument("--skip-validation", action="store_true")
    args = parser.parse_args()

    api_key = _get_api_key(args.api_key)
    headings = [int(h.strip()) for h in args.headings.split(",")]

    output_dir: Path = args.output_dir
    report_dir: Path = args.report_dir
    lat_tag = f"{args.lat:.4f}".replace(".", "_")
    lng_tag = f"{args.lng:.4f}".replace(".", "_")
    sv_video = PROJECT_ROOT / "data" / "input" / f"streetview_{lat_tag}_{lng_tag}.mp4"
    anonymized_video = output_dir / "anonymized_demo.mp4"
    raw_json = output_dir / "detections_raw.json"
    cleaned_json = output_dir / "detections.json"
    pipeline_report_json = report_dir / "pipeline_report.json"
    deletion_report_json = report_dir / "deletion_report.json"

    # ── Adim 1: Street View indirme ──────────────────────────────────────────
    print(f"[1/5] Street View indiriliyor: ({args.lat}, {args.lng}), yonler={headings}")
    try:
        sv_report = fetch_to_video(
            lat=args.lat,
            lng=args.lng,
            output_path=sv_video,
            api_key=api_key,
            headings=headings,
            size=args.size,
        )
    except StreetViewError as exc:
        print(f"[HATA] Street View indirilemedi: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    print(f"  Video: {sv_video} ({sv_report['total_frames']} frame, {sv_report['api_requests_used']} API istegi)")

    # ── Adim 2: Fail-closed anonymization ────────────────────────────────────
    print("[2/5] Yuz ve plaka anonimlestirme (fail-closed)...")
    try:
        anon_report = anonymize_video(sv_video, anonymized_video)
    except AnonymizationError as exc:
        print(f"[FAIL-CLOSED] Anonimlestirme basarisiz: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    print(f"  Yuzler: {anon_report['blurred_faces']}, Plakalar: {anon_report['blurred_license_plates']}")

    assert anonymized_video.exists() and anonymized_video.stat().st_size > 0

    # ── Adim 3: Object detection ──────────────────────────────────────────────
    print("[3/5] Urban object detection...")
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
    print(f"  Ham tespit sayisi: {len(detections)}")

    # ── Adim 4: Duplicate temizleme ───────────────────────────────────────────
    print("[4/5] Duplicate temizleme...")
    cleaned = dedupe(detections, seconds_window=8, meters_window=12.0)
    cleaned_json.parent.mkdir(parents=True, exist_ok=True)
    cleaned_json.write_text(json.dumps(cleaned, indent=2), encoding="utf-8")
    print(f"  {len(detections)} -> {len(cleaned)} benzersiz tespit")
    print(f"  Cikti: {cleaned_json}")

    # ── Adim 5: Raporlama ─────────────────────────────────────────────────────
    print("[5/5] Pipeline raporu yaziliyor...")
    deletion_report = None
    if args.delete_raw_data:
        raw_dir = sv_video.parent
        deletion_report = delete_raw_data(raw_dir, deletion_report_json, confirm=True)
        print(f"  Ham veri silme raporu: {deletion_report_json}")

    pipeline_report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "google_street_view",
        "lat": args.lat,
        "lng": args.lng,
        "street_view": sv_report,
        "input_video": report_path(sv_video),
        "anonymized_video": report_path(anonymized_video),
        "detections_raw_json": report_path(raw_json),
        "detections_json": report_path(cleaned_json),
        "pipeline_report_json": report_path(pipeline_report_json),
        "deletion_report_json": report_path(deletion_report_json) if deletion_report else None,
        "anonymization": sanitize_report(anon_report),
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
    report_dir.mkdir(parents=True, exist_ok=True)
    pipeline_report_json.write_text(json.dumps(pipeline_report, indent=2), encoding="utf-8")
    print(f"  Rapor: {pipeline_report_json}")

    if not args.skip_validation:
        validate_detection_file(cleaned_json)
        validate_pipeline_report_file(pipeline_report_json)
        print("  Validasyon tamamlandi.")

    print("\nPipeline tamamlandi.")
    print(f"  Tespit JSON : {cleaned_json}")
    print(f"  HTTP API    : python scripts/serve.py --port 8000  ->  GET /api/detections")


if __name__ == "__main__":
    main()
