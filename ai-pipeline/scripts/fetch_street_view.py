"""Google Street View Static API'den goruntu ceker ve pipeline icin video olusturur.

Kullanim:
    python scripts/fetch_street_view.py \
        --lat 41.021 --lng 28.874 \
        --output data/input/streetview.mp4 \
        --api-key YOUR_KEY

API anahtari ortam degiskenindenalınabilir:
    $env:STREET_VIEW_API_KEY = "YOUR_KEY"
    python scripts/fetch_street_view.py --lat 41.021 --lng 28.874 --output data/input/sv.mp4

Maksimum 10.000 ucretsiz istek kotas var. Her konum icin varsayilan olarak 4 yon
(0, 90, 180, 270 derece) uretilir = 4 istek/konum.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Iterator

import cv2
import numpy as np
import requests

# .env dosyasini yukle (varsa)
try:
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass


STREET_VIEW_API = "https://maps.googleapis.com/maps/api/streetview"
METADATA_API = "https://maps.googleapis.com/maps/api/streetview/metadata"

DEFAULT_HEADINGS = [0, 90, 180, 270]
DEFAULT_SIZE = "640x480"
DEFAULT_FOV = 90
DEFAULT_PITCH = 0
DEFAULT_FPS = 2


class StreetViewError(RuntimeError):
    """Street View API erisi basarisiz oldugunda firlatilir."""


def _get_api_key(key_arg: str | None) -> str:
    key = key_arg or os.environ.get("STREET_VIEW_API_KEY", "")
    if not key:
        raise StreetViewError(
            "API anahtari bulunamadi. --api-key parametresi verin "
            "veya STREET_VIEW_API_KEY ortam degiskenini ayarlayin."
        )
    return key


def check_location_available(lat: float, lng: float, api_key: str) -> bool:
    """Verilen konumda Street View goruntusunun mevcut olup olmadigini kontrol eder."""
    resp = requests.get(
        METADATA_API,
        params={"location": f"{lat},{lng}", "key": api_key},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("status") == "OK"


def fetch_frame(
    lat: float,
    lng: float,
    heading: int,
    api_key: str,
    size: str = DEFAULT_SIZE,
    fov: int = DEFAULT_FOV,
    pitch: int = DEFAULT_PITCH,
) -> np.ndarray:
    """Tek bir Street View karesi indirir ve OpenCV frame olarak dondurur."""
    resp = requests.get(
        STREET_VIEW_API,
        params={
            "location": f"{lat},{lng}",
            "heading": heading,
            "size": size,
            "fov": fov,
            "pitch": pitch,
            "key": api_key,
        },
        timeout=15,
    )
    resp.raise_for_status()

    if resp.headers.get("Content-Type", "").startswith("application/json"):
        data = resp.json()
        raise StreetViewError(f"Street View API hatasi: {data.get('status')} - {data.get('error_message', '')}")

    img_array = np.frombuffer(resp.content, dtype=np.uint8)
    frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if frame is None:
        raise StreetViewError(f"Goruntu cozumlenemedi (heading={heading})")
    return frame


def iter_frames(
    lat: float,
    lng: float,
    api_key: str,
    headings: list[int] = DEFAULT_HEADINGS,
    size: str = DEFAULT_SIZE,
    fov: int = DEFAULT_FOV,
    pitch: int = DEFAULT_PITCH,
    request_delay: float = 0.1,
) -> Iterator[tuple[int, np.ndarray]]:
    """Verilen konumun tum yonlerinden kareleri sirayla indirir."""
    for heading in headings:
        frame = fetch_frame(lat, lng, heading, api_key, size, fov, pitch)
        yield heading, frame
        if request_delay > 0:
            time.sleep(request_delay)


def fetch_to_video(
    lat: float,
    lng: float,
    output_path: Path,
    api_key: str,
    headings: list[int] = DEFAULT_HEADINGS,
    size: str = DEFAULT_SIZE,
    fov: int = DEFAULT_FOV,
    pitch: int = DEFAULT_PITCH,
    fps: int = DEFAULT_FPS,
    repeat_frames: int = 5,
    request_delay: float = 0.1,
) -> dict:
    """Street View karelerini indirir ve bir mp4 video dosyasina yazar.

    Args:
        repeat_frames: Her kareyi kac kez tekrar yazacagini belirler. Bu,
                       object detection'in her yone yeterli zaman ayirmasini saglar.
    """
    if not check_location_available(lat, lng, api_key):
        raise StreetViewError(
            f"Bu konumda Street View goruntusu mevcut degil: ({lat}, {lng})"
        )

    width_str, height_str = size.split("x")
    frame_width, frame_height = int(width_str), int(height_str)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (frame_width, frame_height),
    )

    fetched_headings: list[int] = []
    total_frames_written = 0

    try:
        for heading, frame in iter_frames(lat, lng, api_key, headings, size, fov, pitch, request_delay):
            for _ in range(repeat_frames):
                writer.write(frame)
                total_frames_written += 1
            fetched_headings.append(heading)
            print(f"  [OK] heading={heading} indirildi ({repeat_frames} frame yazildi)")
    finally:
        writer.release()

    if total_frames_written == 0:
        output_path.unlink(missing_ok=True)
        raise StreetViewError("Hic frame yazilmadi; video olusturulamadi.")

    return {
        "lat": lat,
        "lng": lng,
        "output": str(output_path),
        "headings": fetched_headings,
        "total_frames": total_frames_written,
        "fps": fps,
        "size": size,
        "api_requests_used": len(fetched_headings) + 1,  # +1 metadata check
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Google Street View API'den goruntu ceker ve pipeline icin video olusturur."
    )
    parser.add_argument("--lat", required=True, type=float, help="Enlem")
    parser.add_argument("--lng", required=True, type=float, help="Boylam")
    parser.add_argument("--output", required=True, type=Path, help="Cikti video yolu (.mp4)")
    parser.add_argument("--api-key", default=None, help="Google Street View API anahtari (yoksa STREET_VIEW_API_KEY env)")
    parser.add_argument("--headings", default="0,90,180,270", help="Yon acimlari (virgul ayirici)")
    parser.add_argument("--size", default=DEFAULT_SIZE, help="Goruntu boyutu (ornek: 640x480)")
    parser.add_argument("--fov", default=DEFAULT_FOV, type=int, help="Alan acisi (derece)")
    parser.add_argument("--pitch", default=DEFAULT_PITCH, type=int, help="Egim (derece)")
    parser.add_argument("--fps", default=DEFAULT_FPS, type=int, help="Cikti video FPS")
    parser.add_argument("--repeat-frames", default=5, type=int, help="Her kareyi kac kez tekrar yazacak")
    parser.add_argument("--request-delay", default=0.1, type=float, help="Istekler arasi bekleme (saniye)")
    args = parser.parse_args()

    api_key = _get_api_key(args.api_key)
    headings = [int(h.strip()) for h in args.headings.split(",")]

    print(f"Street View cekilyor: ({args.lat}, {args.lng}), yonler={headings}")
    report = fetch_to_video(
        lat=args.lat,
        lng=args.lng,
        output_path=args.output,
        api_key=api_key,
        headings=headings,
        size=args.size,
        fov=args.fov,
        pitch=args.pitch,
        fps=args.fps,
        repeat_frames=args.repeat_frames,
        request_delay=args.request_delay,
    )
    print(f"Tamamlandi: {report}")
    print(f"Kullanilan API istegi: {report['api_requests_used']}")


if __name__ == "__main__":
    main()
