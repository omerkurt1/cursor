from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def create_demo_video(output_path: Path, seconds: int, fps: int, width: int, height: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )

    total_frames = seconds * fps
    for frame_index in range(total_frames):
        frame = np.full((height, width, 3), (38, 44, 52), dtype=np.uint8)
        progress = frame_index / max(1, total_frames - 1)

        cv2.rectangle(frame, (0, height - 55), (width, height), (72, 72, 72), -1)
        cv2.line(frame, (0, height - 28), (width, height - 28), (220, 220, 220), 2)

        sign_x = int(50 + progress * (width - 140))
        sign_y = 42
        cv2.rectangle(frame, (sign_x + 28, sign_y + 72), (sign_x + 34, height - 55), (90, 90, 90), -1)
        cv2.circle(frame, (sign_x + 31, sign_y + 45), 34, (40, 40, 220), -1)
        cv2.circle(frame, (sign_x + 31, sign_y + 45), 34, (245, 245, 245), 3)
        cv2.putText(frame, "STOP", (sign_x - 1, sign_y + 52), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

        car_x = int(width - 80 - progress * (width - 120))
        car_y = height - 95
        cv2.rectangle(frame, (car_x, car_y), (car_x + 70, car_y + 30), (30, 120, 210), -1)
        cv2.rectangle(frame, (car_x + 18, car_y + 8), (car_x + 54, car_y + 20), (245, 245, 245), -1)
        cv2.putText(frame, "34 XX", (car_x + 18, car_y + 21), cv2.FONT_HERSHEY_SIMPLEX, 0.28, (20, 20, 20), 1)

        face_x = int(30 + progress * 50)
        face_y = height - 118
        cv2.circle(frame, (face_x, face_y), 15, (180, 150, 110), -1)
        cv2.rectangle(frame, (face_x - 11, face_y + 15), (face_x + 11, face_y + 45), (80, 170, 95), -1)

        writer.write(frame)

    writer.release()


def main() -> None:
    parser = argparse.ArgumentParser(description="PII icermeyen sentetik demo videosu uretir.")
    parser.add_argument("--output", default=Path("data/input/demo_synthetic.mp4"), type=Path)
    parser.add_argument("--seconds", default=4, type=int)
    parser.add_argument("--fps", default=10, type=int)
    parser.add_argument("--width", default=640, type=int)
    parser.add_argument("--height", default=360, type=int)
    args = parser.parse_args()

    create_demo_video(args.output, args.seconds, args.fps, args.width, args.height)
    print(f"Demo video uretildi: {args.output}")


if __name__ == "__main__":
    main()

