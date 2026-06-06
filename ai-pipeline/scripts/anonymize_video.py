from __future__ import annotations

import argparse
from pathlib import Path

import cv2


def blur_region(frame, x: int, y: int, w: int, h: int) -> None:
    height, width = frame.shape[:2]
    x1 = max(0, x)
    y1 = max(0, y)
    x2 = min(width, x + w)
    y2 = min(height, y + h)
    if x2 <= x1 or y2 <= y1:
        return

    roi = frame[y1:y2, x1:x2]
    kernel = max(31, ((min(w, h) // 2) * 2) + 1)
    blurred = cv2.GaussianBlur(roi, (kernel, kernel), 0)
    frame[y1:y2, x1:x2] = blurred


def load_cascade(filename: str):
    cascade_path = Path(cv2.data.haarcascades) / filename
    cascade = cv2.CascadeClassifier(str(cascade_path))
    if cascade.empty():
        return None
    return cascade


def require_anonymizers():
    face_cascade = load_cascade("haarcascade_frontalface_default.xml")
    plate_cascades = [
        load_cascade("haarcascade_russian_plate_number.xml"),
        load_cascade("haarcascade_license_plate_rus_16stages.xml"),
    ]
    plate_cascades = [cascade for cascade in plate_cascades if cascade is not None]

    if face_cascade is None:
        raise RuntimeError("Required face anonymizer is unavailable.")
    if not plate_cascades:
        raise RuntimeError("Required plate anonymizer is unavailable.")

    return face_cascade, plate_cascades


def anonymize_video(input_path: Path, output_path: Path) -> dict:
    face_cascade, plate_cascades = require_anonymizers()

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise FileNotFoundError(f"Video acilamadi: {input_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 25
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )

    frame_count = 0
    face_count = 0
    plate_count = 0

    while True:
        ok, frame = capture.read()
        if not ok:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(24, 24),
        )
        for x, y, w, h in faces:
            blur_region(frame, x, y, w, h)
            face_count += 1

        for plate_cascade in plate_cascades:
            plates = plate_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=4,
                minSize=(40, 12),
            )
            for x, y, w, h in plates:
                blur_region(frame, x, y, w, h)
                plate_count += 1

        writer.write(frame)
        frame_count += 1

    capture.release()
    writer.release()

    return {
        "input": str(input_path),
        "output": str(output_path),
        "fps": fps,
        "width": width,
        "height": height,
        "total_frames": total_frames,
        "processed_frames": frame_count,
        "blurred_faces": face_count,
        "blurred_license_plates": plate_count,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Video uzerinde yuz ve plaka anonimlestirme uygular.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    report = anonymize_video(args.input, args.output)
    print(report)


if __name__ == "__main__":
    main()

