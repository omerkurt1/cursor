from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data"


def is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def validate_raw_dir(raw_dir: Path) -> Path:
    resolved_raw_dir = raw_dir.resolve()
    resolved_data_root = DATA_ROOT.resolve()

    if resolved_raw_dir == resolved_data_root or not is_relative_to(resolved_raw_dir, resolved_data_root):
        raise ValueError(f"Ham veri silme yalnizca {resolved_data_root} altinda yapilabilir.")

    return resolved_raw_dir


def delete_raw_data(raw_dir: Path, report_path: Path, confirm: bool) -> dict:
    if not confirm:
        raise RuntimeError("Silme islemi icin --yes parametresi gerekli.")

    raw_dir = validate_raw_dir(raw_dir)
    deleted_files: list[str] = []

    if raw_dir.exists():
        for path in sorted(raw_dir.rglob("*"), reverse=True):
            if path.is_file():
                deleted_files.append(str(path))
                path.unlink()
            elif path.is_dir():
                path.rmdir()
        raw_dir.rmdir()

    status = "raw_data_deleted" if deleted_files else "raw_dir_not_found_or_empty"
    report = {
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "raw_dir": str(raw_dir),
        "deleted_file_count": len(deleted_files),
        "deleted_files": deleted_files,
        "status": status,
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
