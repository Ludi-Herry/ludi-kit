from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


SKILL_ROOT = Path(__file__).resolve().parent.parent
OUTPUT = SKILL_ROOT / "dist" / "image2-to-figma-page.skill"


def source_files() -> list[Path]:
    files = []
    for path in SKILL_ROOT.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(SKILL_ROOT)
        if relative.parts[0] == "dist" or "__pycache__" in relative.parts:
            continue
        files.append(path)
    return sorted(files, key=lambda item: item.relative_to(SKILL_ROOT).as_posix())


def main() -> None:
    skill_md = SKILL_ROOT / "SKILL.md"
    if not skill_md.exists():
        raise SystemExit("package-skill failed: SKILL.md is missing")
    validator = SKILL_ROOT / "scripts" / "validate-skill.mjs"
    kit_root = SKILL_ROOT.parent.parent
    subprocess.run(["node", str(validator)], cwd=kit_root, check=True)
    files = source_files()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            relative = Path("image2-to-figma-page") / path.relative_to(SKILL_ROOT)
            info = ZipInfo(relative.as_posix(), date_time=(2026, 7, 16, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())
    digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    print(json.dumps({"package": str(OUTPUT), "files": len(files), "sha256": digest}))


if __name__ == "__main__":
    main()
