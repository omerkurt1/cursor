from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


def timestamp_to_seconds(timestamp: str) -> int:
    hours, minutes, seconds = [int(part) for part in timestamp.split(":")]
    return hours * 3600 + minutes * 60 + seconds


def distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def is_duplicate(existing: dict, candidate: dict, seconds_window: int, meters_window: float) -> bool:
    if existing["type"] != candidate["type"]:
        return False

    time_delta = abs(timestamp_to_seconds(existing["timestamp"]) - timestamp_to_seconds(candidate["timestamp"]))
    if time_delta > seconds_window:
        return False

    meters = distance_meters(
        float(existing["latitude"]),
        float(existing["longitude"]),
        float(candidate["latitude"]),
        float(candidate["longitude"]),
    )
    return meters <= meters_window


def dedupe(detections: list[dict], seconds_window: int, meters_window: float) -> list[dict]:
    cleaned: list[dict] = []

    for detection in sorted(detections, key=lambda item: (item["type"], item["timestamp"])):
        duplicate_index = None
        for index, existing in enumerate(cleaned):
            if is_duplicate(existing, detection, seconds_window, meters_window):
                duplicate_index = index
                break

        if duplicate_index is None:
            cleaned.append(detection)
            continue

        if detection["confidence"] > cleaned[duplicate_index]["confidence"]:
            cleaned[duplicate_index] = detection

    return cleaned


def main() -> None:
    parser = argparse.ArgumentParser(description="Ayni objeye ait tekrar detection kayitlarini temizler.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--seconds-window", default=8, type=int)
    parser.add_argument("--meters-window", default=12.0, type=float)
    args = parser.parse_args()

    detections = json.loads(args.input.read_text(encoding="utf-8"))
    cleaned = dedupe(detections, args.seconds_window, args.meters_window)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(cleaned, indent=2), encoding="utf-8")
    print(f"{len(detections)} kayit -> {len(cleaned)} benzersiz kayit: {args.output}")


if __name__ == "__main__":
    main()

