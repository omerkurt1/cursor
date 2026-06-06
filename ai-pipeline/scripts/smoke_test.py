from __future__ import annotations

import json
import socket
import subprocess
import sys
import tempfile
import shutil
import time
import urllib.request
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable


def run(command: list[str], cwd: Path = PROJECT_ROOT, expect_success: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if expect_success and result.returncode != 0:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        raise RuntimeError(f"Komut basarisiz: {' '.join(command)}")
    if not expect_success and result.returncode == 0:
        raise RuntimeError(f"Komut basarili olmamaliydi: {' '.join(command)}")
    return result


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_serve_endpoints(detections_json: Path, pipeline_report_json: Path) -> None:
    """serve.py'i geçici portta baslatir ve GET endpointlerini dogrular."""
    port = _free_port()
    env_copy = {**__import__("os").environ}
    proc = subprocess.Popen(
        [PYTHON, "scripts/serve.py", "--port", str(port)],
        cwd=PROJECT_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env_copy,
    )
    try:
        # Sunucu hazir olana kadar bekle (max 10s)
        base = f"http://127.0.0.1:{port}"
        for _ in range(20):
            try:
                urllib.request.urlopen(f"{base}/health", timeout=1)
                break
            except Exception:
                time.sleep(0.5)
        else:
            raise RuntimeError("serve.py 10 saniyede baslamadi.")

        # /health
        resp = urllib.request.urlopen(f"{base}/health")
        data = json.loads(resp.read())
        assert data["status"] == "ok", f"health yaniti beklenmiyor: {data}"
        assert data["service"] == "ai-privacy-pipeline"
        print("  [OK] GET /health")

        # /api/detections - gercek veri veya fallback sample
        resp = urllib.request.urlopen(f"{base}/api/detections")
        detections = json.loads(resp.read())
        assert isinstance(detections, list), "detections liste olmali"
        data_source = resp.headers.get("X-Data-Source", "unknown")
        print(f"  [OK] GET /api/detections ({len(detections)} kayit, kaynak={data_source})")

        # /api/pipeline-report
        resp = urllib.request.urlopen(f"{base}/api/pipeline-report")
        report = json.loads(resp.read())
        assert "privacy_guardrails" in report
        print("  [OK] GET /api/pipeline-report")

        # /api/scan/status
        resp = urllib.request.urlopen(f"{base}/api/scan/status")
        status = json.loads(resp.read())
        assert "running" in status
        print("  [OK] GET /api/scan/status")

        # X-Data-Source header kontrolu: real veya sample olmali
        assert data_source in ("real", "sample"), f"X-Data-Source gecersiz: {data_source}"
        print(f"  [OK] X-Data-Source header gecerli: {data_source}")

        # POST /api/scan - 409 beklenmez, 202 beklenir
        scan_body = json.dumps({"lat": 41.021, "lng": 28.874, "demo_fallback": True, "demo_no_api": True}).encode()
        req = urllib.request.Request(
            f"{base}/api/scan",
            data=scan_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        resp = urllib.request.urlopen(req)
        assert resp.status == 202, f"POST /api/scan 202 bekleniyor, {resp.status} geldi"
        print("  [OK] POST /api/scan -> 202 Accepted")

    finally:
        proc.terminate()
        proc.wait(timeout=5)


def test_gunicorn_importable() -> None:
    """serve.py'nin gunicorn --chdir ile import edilebilir oldugunu dogrular."""
    result = subprocess.run(
        [PYTHON, "-c", "import sys; sys.path.insert(0, 'scripts'); import serve; assert hasattr(serve, 'app'), 'app nesnesi bulunamadi'"],
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        raise RuntimeError("serve.py gunicorn icin import edilemiyor.")
    print("  [OK] serve:app gunicorn ile import edilebilir.")


def test_route_pipeline_offline() -> None:
    """route_pipeline --demo-no-api --demo-fallback ile API key olmadan calisir."""
    output_dir = PROJECT_ROOT / "output" / "smoke_route"
    report_dir = PROJECT_ROOT / "reports" / "smoke_route"
    result = subprocess.run(
        [
            PYTHON,
            "scripts/route_pipeline.py",
            "--waypoints", "41.021,28.874;41.022,28.876",
            "--demo-no-api",
            "--demo-fallback",
            "--output-dir", str(output_dir),
            "--report-dir", str(report_dir),
        ],
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        raise RuntimeError("route_pipeline offline demo basarisiz.")
    detections_file = output_dir / "detections.json"
    if not detections_file.exists():
        raise RuntimeError(f"detections.json olusturulamadi: {detections_file}")
    print("  [OK] route_pipeline: 2 konum offline -> detections.json uretildi.")


def test_fail_closed_on_missing_video() -> None:
    """Fail-closed: var olmayan video verildiginde pipeline exit(1) ile durdurulur."""
    result = subprocess.run(
        [
            PYTHON,
            "scripts/run_pipeline.py",
            "--input", "data/input/does_not_exist.mp4",
            "--lat", "41.021",
            "--lng", "28.874",
            "--demo-fallback",
        ],
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode == 0:
        raise RuntimeError(
            "Fail-closed testi basarisiz: var olmayan video ile pipeline basarili olmamali."
        )
    print("  [OK] Fail-closed: var olmayan video -> pipeline reddetti.")


def test_street_view_no_api_key(tmp_dir: Path) -> None:
    """Street View: API key olmadan fetch_to_video StreetViewError firlatmali."""
    import importlib.util

    scripts_dir = PROJECT_ROOT / "scripts"
    spec = importlib.util.spec_from_file_location(
        "fetch_street_view", scripts_dir / "fetch_street_view.py"
    )
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]

    StreetViewError = mod.StreetViewError
    _get_api_key = mod._get_api_key

    import os
    old = os.environ.pop("STREET_VIEW_API_KEY", None)
    try:
        try:
            _get_api_key(None)
            raise RuntimeError("StreetViewError bekleniyor ama firlatilmadi.")
        except StreetViewError:
            pass
    finally:
        if old is not None:
            os.environ["STREET_VIEW_API_KEY"] = old
    print("  [OK] Street View: API key olmadan -> StreetViewError.")


def test_fail_closed_on_empty_output(tmp_dir: Path) -> None:
    """Fail-closed: anonymize_video dogrudan AnonymizationError firlatabilecegini dogrular."""
    import importlib.util, types

    scripts_dir = PROJECT_ROOT / "scripts"
    spec = importlib.util.spec_from_file_location(
        "anonymize_video", scripts_dir / "anonymize_video.py"
    )
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]

    AnonymizationError = mod.AnonymizationError
    _validate_output = mod._validate_output

    fake_output = tmp_dir / "fake.mp4"
    fake_output.write_bytes(b"")

    try:
        _validate_output(fake_output, processed_frames=0)
        raise RuntimeError("Fail-closed testi basarisiz: bos output kabul edilmemeli.")
    except AnonymizationError:
        pass
    print("  [OK] Fail-closed: bos output + 0 frame -> AnonymizationError.")


def main() -> None:
    input_video = PROJECT_ROOT / "data" / "input" / "smoke_synthetic.mp4"
    output_dir = PROJECT_ROOT / "output" / "smoke"
    report_dir = PROJECT_ROOT / "reports" / "smoke"

    print("1/9 Demo video olusturuluyor...")
    run([PYTHON, "scripts/create_demo_video.py", "--output", str(input_video)])

    print("2/9 Pipeline calistiriliyor...")
    run(
        [
            PYTHON,
            "scripts/run_pipeline.py",
            "--input", str(input_video),
            "--lat", "41.021",
            "--lng", "28.874",
            "--demo-fallback",
            "--output-dir", str(output_dir),
            "--report-dir", str(report_dir),
        ]
    )

    print("3/9 Cikti validasyonu...")
    run(
        [
            PYTHON,
            "scripts/validate_outputs.py",
            "--detections", str(output_dir / "detections.json"),
            "--pipeline-report", str(report_dir / "pipeline_report.json"),
        ]
    )

    print("4/9 Silme guvenlik siniri testi...")
    run(
        [
            PYTHON,
            "scripts/delete_raw_data.py",
            "--raw-dir", "..",
            "--report", str(report_dir / "blocked_delete_report.json"),
            "--yes",
        ],
        expect_success=False,
    )

    print("5/9 Fail-closed testleri...")
    test_fail_closed_on_missing_video()
    tmp_dir = Path(tempfile.mkdtemp())
    try:
        test_fail_closed_on_empty_output(tmp_dir)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    print("6/9 Street View API guard testleri...")
    tmp_dir2 = Path(tempfile.mkdtemp())
    try:
        test_street_view_no_api_key(tmp_dir2)
    finally:
        shutil.rmtree(tmp_dir2, ignore_errors=True)

    print("7/9 Gunicorn import testi...")
    test_gunicorn_importable()

    print("8/9 Rota pipeline offline demo testi...")
    test_route_pipeline_offline()

    print("9/9 HTTP API endpoint testleri...")
    test_serve_endpoints(
        detections_json=output_dir / "detections.json",
        pipeline_report_json=report_dir / "pipeline_report.json",
    )

    print("Smoke test basarili.")


if __name__ == "__main__":
    main()

