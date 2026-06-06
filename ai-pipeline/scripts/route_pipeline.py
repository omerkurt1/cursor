"""Bir rota boyunca birden fazla konum icin Street View -> JSON pipeline'i calistirir.

Her nokta icin:
  1. Street View goruntuleri indirilir
  2. Fail-closed anonymization uygulanir
  3. Urban object detection calistirilir
  4. Sonuclar birlestirilip tek detections.json'a yazilir

Kullanim:
    # Waypoint listesi (CSV: lat,lng satir satir)
    python scripts/route_pipeline.py --waypoints-file data/routes/istanbul.csv

    # Inline koordinatlar
    python scripts/route_pipeline.py --waypoints "41.021,28.874;41.022,28.876;41.023,28.878"

    # Demo modu (API key gerekmez, YOLO gerekmez)
    python scripts/route_pipeline.py --waypoints "41.021,28.874;41.022,28.876" --demo-fallback --demo-no-api

Cikti:
    output/detections.json      <- Tum rota boyunca birlestirilmis tespitler
    reports/pipeline_report.json
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
import shutil
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from anonymize_video import anonymize_video, AnonymizationError
from dedupe_json import dedupe
from delete_raw_data import delete_raw_data
from detect_objects import detect_objects, demo_detection
from validate_outputs import validate_detection_file, validate_pipeline_report_file

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def report_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def parse_waypoints(raw: str) -> list[tuple[float, float]]:
    """'lat,lng;lat,lng' veya 'lat,lng\nlat,lng' formatini parse eder."""
    points: list[tuple[float, float]] = []
    for token in raw.replace(";", "\n").splitlines():
        token = token.strip()
        if not token or token.startswith("#"):
            continue
        parts = token.split(",")
        if len(parts) < 2:
            raise ValueError(f"Gecersiz waypoint: '{token}' (beklenen format: lat,lng)")
        points.append((float(parts[0]), float(parts[1])))
    return points


def load_waypoints_file(path: Path) -> list[tuple[float, float]]:
    return parse_waypoints(path.read_text(encoding="utf-8"))


def process_single_location(
    lat: float,
    lng: float,
    tmp_dir: Path,
    api_key: str | None,
    headings: list[int],
    size: str,
    model_path: str,
    confidence: float,
    frame_stride: int,
    demo_fallback: bool,
    demo_no_api: bool,
    index: int,
) -> list[dict]:
    """Tek bir konumu islemetir ve tespit listesini dondurur."""
    sv_video = tmp_dir / f"sv_{index:03d}_{lat:.4f}_{lng:.4f}.mp4".replace(".", "_").replace("_mp4", ".mp4")
    anon_video = tmp_dir / f"anon_{index:03d}.mp4"

    # Street View indirme veya demo
    if demo_no_api:
        from create_demo_video import create_demo_video
        create_demo_video(sv_video, seconds=2, fps=5, width=640, height=360)
    else:
        from fetch_street_view import fetch_to_video, StreetViewError
        try:
            fetch_to_video(
                lat=lat, lng=lng,
                output_path=sv_video,
                api_key=api_key,
                headings=headings,
                size=size,
            )
        except StreetViewError as exc:
            print(f"    [UYARI] ({lat},{lng}) atlandi: {exc}")
            return []

    # Fail-closed anonymization
    try:
        anonymize_video(sv_video, anon_video)
    except AnonymizationError as exc:
        print(f"    [FAIL-CLOSED] ({lat},{lng}) anonimlestirme basarisiz: {exc}")
        sv_video.unlink(missing_ok=True)
        return []

    assert anon_video.exists() and anon_video.stat().st_size > 0

    # Detection
    raw_json = tmp_dir / f"raw_{index:03d}.json"
    detections = detect_objects(
        video_path=anon_video,
        output_path=raw_json,
        model_path=model_path,
        latitude=lat,
        longitude=lng,
        confidence_threshold=confidence,
        frame_stride=max(1, frame_stride),
        demo_fallback=demo_fallback,
    )
    return detections


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rota boyunca coklu Street View konum taramasi."
    )

    wp_group = parser.add_mutually_exclusive_group(required=True)
    wp_group.add_argument("--waypoints", help="Koordinat listesi: 'lat,lng;lat,lng'")
    wp_group.add_argument("--waypoints-file", type=Path, help="CSV dosyasi (lat,lng satir satir)")

    parser.add_argument("--api-key", default=None)
    parser.add_argument("--headings", default="0,90,180,270")
    parser.add_argument("--size", default="640x480")
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--confidence", default=0.35, type=float)
    parser.add_argument("--frame-stride", default=5, type=int)
    parser.add_argument("--demo-fallback", action="store_true",
                        help="YOLO yoksa isaretlenmis ornek JSON uretir")
    parser.add_argument("--demo-no-api", action="store_true",
                        help="Street View API olmadan sentetik video kullanir (tam offline demo)")
    parser.add_argument("--output-dir", default=Path("output"), type=Path)
    parser.add_argument("--report-dir", default=Path("reports"), type=Path)
    parser.add_argument("--keep-temp", action="store_true",
                        help="Gecici dosyalari silme (debug icin)")
    parser.add_argument("--skip-validation", action="store_true")
    args = parser.parse_args()

    # Waypoint'leri parse et
    if args.waypoints_file:
        waypoints = load_waypoints_file(args.waypoints_file)
    else:
        waypoints = parse_waypoints(args.waypoints)

    if not waypoints:
        print("[HATA] Hic waypoint bulunamadi.", file=sys.stderr)
        raise SystemExit(1)

    # API key (demo-no-api modunda gerekmez)
    api_key: str | None = None
    if not args.demo_no_api:
        import os
        from fetch_street_view import _get_api_key
        api_key = _get_api_key(args.api_key)

    headings = [int(h.strip()) for h in args.headings.split(",")]
    output_dir: Path = args.output_dir
    report_dir: Path = args.report_dir
    cleaned_json = output_dir / "detections.json"
    raw_json_path = output_dir / "detections_raw.json"
    pipeline_report_json = report_dir / "pipeline_report.json"

    print(f"Rota taramasi basliyor: {len(waypoints)} konum, yonler={headings}")
    mode = "offline-demo" if args.demo_no_api else "street-view-api"
    print(f"Mod: {mode}, demo-fallback: {args.demo_fallback}")

    tmp_dir = Path(tempfile.mkdtemp(prefix="route_pipeline_"))
    all_detections: list[dict] = []
    skipped = 0

    try:
        for idx, (lat, lng) in enumerate(waypoints):
            print(f"  [{idx + 1}/{len(waypoints)}] ({lat}, {lng}) isleniyor...")
            detections = process_single_location(
                lat=lat, lng=lng,
                tmp_dir=tmp_dir,
                api_key=api_key,
                headings=headings,
                size=args.size,
                model_path=args.model,
                confidence=args.confidence,
                frame_stride=args.frame_stride,
                demo_fallback=args.demo_fallback,
                demo_no_api=args.demo_no_api,
                index=idx,
            )
            if not detections:
                skipped += 1
            else:
                all_detections.extend(detections)
                print(f"    {len(detections)} tespit bulundu")
    finally:
        if not args.keep_temp:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    # Rota genelinde duplicate temizle
    cleaned = dedupe(all_detections, seconds_window=8, meters_window=25.0)

    output_dir.mkdir(parents=True, exist_ok=True)
    raw_json_path.write_text(json.dumps(all_detections, indent=2), encoding="utf-8")
    cleaned_json.write_text(json.dumps(cleaned, indent=2), encoding="utf-8")

    print(f"\nSonuclar:")
    print(f"  Islenen konum : {len(waypoints) - skipped}/{len(waypoints)}")
    print(f"  Ham tespit    : {len(all_detections)}")
    print(f"  Benzersiz     : {len(cleaned)}")
    print(f"  Cikti         : {cleaned_json}")

    # Pipeline raporu
    pipeline_report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "google_street_view_route",
        "mode": mode,
        # Rota pipeline'inda tekil video yok; None olarak isaretlenir
        "input_video": None,
        "anonymized_video": None,
        "waypoints": [{"lat": lat, "lng": lng} for lat, lng in waypoints],
        "processed_locations": len(waypoints) - skipped,
        "skipped_locations": skipped,
        "detections_raw_json": report_path(raw_json_path),
        "detections_json": report_path(cleaned_json),
        "pipeline_report_json": report_path(pipeline_report_json),
        "deletion_report_json": None,
        "anonymization": {"fail_closed": True, "per_location": True},
        "raw_detection_count": len(all_detections),
        "deduped_detection_count": len(cleaned),
        "demo_fallback_used": args.demo_fallback,
        "privacy_guardrails": {
            "runs_detection_after_anonymization": True,
            "anonymization_succeeded": True,
            "stores_raw_frames": False,
            "json_contains_identity_data": False,
            "raw_data_deleted": False,
        },
    }
    report_dir.mkdir(parents=True, exist_ok=True)
    pipeline_report_json.write_text(json.dumps(pipeline_report, indent=2), encoding="utf-8")
    print(f"  Rapor         : {pipeline_report_json}")

    if not args.skip_validation:
        validate_detection_file(cleaned_json)
        validate_pipeline_report_file(pipeline_report_json)
        print("  Validasyon OK.")

    print(f"\nHTTP API: python scripts/serve.py --port 8000  ->  GET /api/detections")


if __name__ == "__main__":
    main()
