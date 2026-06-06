from __future__ import annotations

import json
import sys
from pathlib import Path

from flask import Flask, jsonify, Response
from flask_cors import CORS

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "output"
REPORT_DIR = PROJECT_ROOT / "reports"


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


@app.get("/health")
def health() -> Response:
    return jsonify({"status": "ok", "service": "ai-privacy-pipeline"})


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


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="AI pipeline ciktilarini HTTP uzerinden sunar.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", default=8000, type=int)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    print(f"Sunucu baslatiliyor: http://{args.host}:{args.port}")
    print(f"  GET /health")
    print(f"  GET /api/detections")
    print(f"  GET /api/pipeline-report")
    print(f"  GET /api/deletion-report")
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
