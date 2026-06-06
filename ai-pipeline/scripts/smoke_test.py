from __future__ import annotations

import subprocess
import sys
import tempfile
import shutil
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

    print("1/7 Demo video olusturuluyor...")
    run([PYTHON, "scripts/create_demo_video.py", "--output", str(input_video)])

    print("2/7 Pipeline calistiriliyor...")
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

    print("3/7 Cikti validasyonu...")
    run(
        [
            PYTHON,
            "scripts/validate_outputs.py",
            "--detections", str(output_dir / "detections.json"),
            "--pipeline-report", str(report_dir / "pipeline_report.json"),
        ]
    )

    print("4/7 Silme guvenlik siniri testi...")
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

    print("5/7 Fail-closed testleri...")
    test_fail_closed_on_missing_video()
    tmp_dir = Path(tempfile.mkdtemp())
    try:
        test_fail_closed_on_empty_output(tmp_dir)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    print("6/7 Street View API guard testleri...")
    tmp_dir2 = Path(tempfile.mkdtemp())
    try:
        test_street_view_no_api_key(tmp_dir2)
    finally:
        shutil.rmtree(tmp_dir2, ignore_errors=True)

    print("7/7 Rota pipeline offline demo testi...")
    test_route_pipeline_offline()

    print("Smoke test basarili.")


if __name__ == "__main__":
    main()

