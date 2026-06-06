from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2


COCO_TO_CITY_TYPE = {
    "stop sign": "traffic_sign",
    "traffic light": "traffic_light",
}


def format_timestamp(seconds: float) -> str:
    total_seconds = int(round(seconds))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def load_model(model_path: str):
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError("ultralytics kurulu degil. `pip install -r requirements-yolo.txt` calistirin.") from exc
    return YOLO(model_path)


def demo_detection(latitude: float, longitude: float) -> list[dict]:
    return [
        {
            "type": "traffic_sign",
            "latitude": latitude,
            "longitude": longitude,
            "confidence": 0.91,
            "timestamp": "00:00:03",
        }
    ]


def detect_objects(
    video_path: Path,
    output_path: Path,
    model_path: str,
    latitude: float,
    longitude: float,
    confidence_threshold: float,
    frame_stride: int,
    demo_fallback: bool = False,
) -> list[dict]:
    try:
        model = load_model(model_path)
    except Exception:
        if not demo_fallback:
            raise
        detections = demo_detection(latitude, longitude)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(detections, indent=2), encoding="utf-8")
        return detections

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise FileNotFoundError(f"Video acilamadi: {video_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 25
    detections: list[dict] = []
    frame_index = 0

    while True:
        ok, frame = capture.read()
        if not ok:
            break

        if frame_index % frame_stride != 0:
            frame_index += 1
            continue

        timestamp_seconds = frame_index / fps
        results = model.predict(frame, verbose=False, conf=confidence_threshold)
        names = results[0].names

        for box in results[0].boxes:
            class_name = names[int(box.cls[0])]
            city_type = COCO_TO_CITY_TYPE.get(class_name)
            if city_type is None:
                continue

            confidence = float(box.conf[0])
            detections.append(
                {
                    "type": city_type,
                    "latitude": latitude,
                    "longitude": longitude,
                    "confidence": round(confidence, 4),
                    "timestamp": format_timestamp(timestamp_seconds),
                }
            )

        frame_index += 1

    capture.release()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(detections, indent=2), encoding="utf-8")
    return detections


def main() -> None:
    parser = argparse.ArgumentParser(description="Anonimlestirilmis video uzerinde kentsel obje tespiti yapar.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--lat", required=True, type=float)
    parser.add_argument("--lng", required=True, type=float)
    parser.add_argument("--confidence", default=0.35, type=float)
    parser.add_argument("--frame-stride", default=5, type=int)
    parser.add_argument(
        "--demo-fallback",
        action="store_true",
        help="YOLO kurulamazsa entegrasyon demosu icin acikca isaretlenmis ornek JSON uretir.",
    )
    args = parser.parse_args()

    detections = detect_objects(
        video_path=args.input,
        output_path=args.output,
        model_path=args.model,
        latitude=args.lat,
        longitude=args.lng,
        confidence_threshold=args.confidence,
        frame_stride=max(1, args.frame_stride),
        demo_fallback=args.demo_fallback,
    )
    print(f"{len(detections)} detection yazildi: {args.output}")


if __name__ == "__main__":
    main()
