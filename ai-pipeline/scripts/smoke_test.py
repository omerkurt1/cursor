from __future__ import annotations

import subprocess
import sys
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


def main() -> None:
    input_video = PROJECT_ROOT / "data" / "input" / "smoke_synthetic.mp4"
    output_dir = PROJECT_ROOT / "output" / "smoke"
    report_dir = PROJECT_ROOT / "reports" / "smoke"

    run([PYTHON, "scripts/create_demo_video.py", "--output", str(input_video)])
    run(
        [
            PYTHON,
            "scripts/run_pipeline.py",
            "--input",
            str(input_video),
            "--lat",
            "41.021",
            "--lng",
            "28.874",
            "--demo-fallback",
            "--output-dir",
            str(output_dir),
            "--report-dir",
            str(report_dir),
        ]
    )
    run(
        [
            PYTHON,
            "scripts/validate_outputs.py",
            "--detections",
            str(output_dir / "detections.json"),
            "--pipeline-report",
            str(report_dir / "pipeline_report.json"),
        ]
    )
    run(
        [
            PYTHON,
            "scripts/delete_raw_data.py",
            "--raw-dir",
            "..",
            "--report",
            str(report_dir / "blocked_delete_report.json"),
            "--yes",
        ],
        expect_success=False,
    )
    print("Smoke test basarili.")


if __name__ == "__main__":
    main()

