from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def delete_raw_data(raw_dir: Path, report_path: Path, confirm: bool) -> dict:
    if not confirm:
        raise RuntimeError("Silme islemi icin --yes parametresi gerekli.")

    raw_dir = raw_dir.resolve()
    deleted_files: list[str] = []

    if raw_dir.exists():
        for path in sorted(raw_dir.rglob("*"), reverse=True):
            if path.is_file():
                deleted_files.append(str(path))
                path.unlink()
            elif path.is_dir():
                path.rmdir()
        raw_dir.rmdir()

    report = {
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "raw_dir": str(raw_dir),
        "deleted_file_count": len(deleted_files),
        "deleted_files": deleted_files,
        "status": "raw_data_deleted",
    }

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Ham verileri siler ve silme raporu uretir.")
    parser.add_argument("--raw-dir", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    report = delete_raw_data(args.raw_dir, args.report, args.yes)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

