from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from pathlib import Path

from flask import Flask, jsonify, request, Response
from flask_cors import CORS

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "output"
REPORT_DIR = PROJECT_ROOT / "reports"
PYTHON = sys.executable

# Scan durumu - thread-safe erişim için _scan_lock ile korunur
_scan_lock = threading.Lock()
_scan_status: dict = {"running": False, "last_result": None}


def load_json_file(path: Path) -> tuple[dict | list, int]:
    if not path.exists():
        return {"error": f"Dosya henuz uretilmedi: {path.name}. Once pipeline'i calistirin."}, 404
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data, 200
    except json.JSONDecodeError as exc:
        return {"error": f"JSON okunamadi: {exc}"}, 500


app = Flask(__name__)
CORS(app)


# ── GET endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> Response:
    with _scan_lock:
        running = _scan_status["running"]
    return jsonify({
        "status": "ok",
        "service": "ai-privacy-pipeline",
        "scan_running": running,
    })


@app.get("/api/detections")
def detections() -> Response:
    data, status = load_json_file(OUTPUT_DIR / "detections.json")
    return jsonify(data), status


@app.get("/api/pipeline-report")
def pipeline_report() -> Response:
    data, status = load_json_file(REPORT_DIR / "pipeline_report.json")
    return jsonify(data), status


@app.get("/api/deletion-report")
def deletion_report() -> Response:
    data, status = load_json_file(REPORT_DIR / "deletion_report.json")
    return jsonify(data), status


@app.get("/api/scan/status")
def scan_status() -> Response:
    with _scan_lock:
        snapshot = dict(_scan_status)
    return jsonify(snapshot)


# ── POST /api/scan ─────────────────────────────────────────────────────────────

@app.post("/api/scan")
def trigger_scan() -> Response:
    """Go backend veya frontend'in cagirdigi scan tetikleyici.

    Body (JSON) — tek nokta:
        {"lat": 41.021, "lng": 28.874, "demo_fallback": false}

    Body (JSON) — rota:
        {"waypoints": [{"lat": 41.021, "lng": 28.874}, ...], "demo_fallback": false}

    Aninda 202 doner; scan arka planda calisir.
    GET /api/scan/status ile takip et, GET /api/detections ile sonucu al.
    """
    with _scan_lock:
        if _scan_status["running"]:
            return jsonify({"error": "Scan zaten calisiyor. /api/scan/status ile kontrol edin."}), 409

    body = request.get_json(silent=True) or {}
    demo_fallback: bool = bool(body.get("demo_fallback", False))
    demo_no_api: bool = bool(body.get("demo_no_api", False))
    api_key: str = body.get("api_key") or os.environ.get("STREET_VIEW_API_KEY", "")

    waypoints: list[dict] | None = body.get("waypoints")
    lat: float | None = body.get("lat")
    lng: float | None = body.get("lng")

    if waypoints:
        wp_str = ";".join(f"{p['lat']},{p['lng']}" for p in waypoints)
        cmd = [
            PYTHON, str(PROJECT_ROOT / "scripts" / "route_pipeline.py"),
            "--waypoints", wp_str,
            "--output-dir", str(OUTPUT_DIR),
            "--report-dir", str(REPORT_DIR),
            "--skip-validation",
        ]
    elif lat is not None and lng is not None:
        cmd = [
            PYTHON, str(PROJECT_ROOT / "scripts" / "streetview_pipeline.py"),
            "--lat", str(lat),
            "--lng", str(lng),
            "--output-dir", str(OUTPUT_DIR),
            "--report-dir", str(REPORT_DIR),
            "--skip-validation",
        ]
    else:
        return jsonify({"error": "lat+lng veya waypoints gerekli."}), 400

    if demo_fallback:
        cmd.append("--demo-fallback")
    if demo_no_api:
        cmd.append("--demo-no-api")
    if api_key and not demo_no_api:
        cmd += ["--api-key", api_key]

    def _run() -> None:
        env = {**os.environ}
        if api_key:
            env["STREET_VIEW_API_KEY"] = api_key
        result = subprocess.run(cmd, capture_output=True, text=True, env=env)
        with _scan_lock:
            _scan_status["running"] = False
            _scan_status["last_result"] = {
                "returncode": result.returncode,
                "stdout": result.stdout[-2000:] if result.stdout else "",
                "stderr": result.stderr[-1000:] if result.stderr else "",
            }

    with _scan_lock:
        _scan_status["running"] = True
        _scan_status["last_result"] = None

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    return jsonify({
        "status": "accepted",
        "message": "Scan arka planda baslatildi.",
        "poll": "/api/scan/status",
        "result": "/api/detections",
    }), 202


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="AI pipeline ciktilarini HTTP uzerinden sunar.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", default=8000, type=int)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    print(f"Sunucu baslatiliyor: http://{args.host}:{args.port}")
    print(f"  GET  /health")
    print(f"  GET  /api/detections")
    print(f"  GET  /api/pipeline-report")
    print(f"  GET  /api/deletion-report")
    print(f"  GET  /api/scan/status")
    print(f"  POST /api/scan  <- Go backend buraya istek atar")
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
