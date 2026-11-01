#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
KIT_ROOT = SKILL_ROOT.parents[1]
FRAGMENT = KIT_ROOT / "workflows" / "proposals" / "figma-3d-situation-screen.fragment.json"


def main() -> int:
    data = json.loads(FRAGMENT.read_text(encoding="utf-8"))
    required = {"id", "version", "status", "skillPath", "inputs", "routes", "outputs", "gates"}
    missing = sorted(required - data.keys())
    assert not missing, f"missing fields: {missing}"
    assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", data["id"])
    assert re.fullmatch(r"\d+\.\d+\.\d+", data["version"])
    assert data["status"] == "active"
    assert data["skillPath"] == "kit/skills/figma-3d-situation-screen/SKILL.md"
    assert set(data["routes"]) == {"renderer", "motion", "figma", "cutout"}
    print("figma-3d-situation-screen manifest fragment: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
