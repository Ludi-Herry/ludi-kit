#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    ROOT / "SKILL.md",
    ROOT / "agents" / "openai.yaml",
    ROOT / "references" / "cutout-preparation.md",
    ROOT / "references" / "figma-tool-routing.md",
    ROOT / "references" / "renderer-routing.md",
    ROOT / "references" / "motion-routing.md",
    ROOT / "references" / "verification.md",
    ROOT / "examples" / "figma-evidence.external-blocked.json",
]


def main() -> int:
    missing = [str(path.relative_to(ROOT)) for path in REQUIRED if not path.is_file()]
    if missing:
        print("missing required Skill files:", ", ".join(missing), file=sys.stderr)
        return 1

    skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    required_terms = [
        "one main map renderer",
        "external-blocked",
        "prefers-reduced-motion",
        "30-second performance evidence",
        "workflow manifest fragment",
    ]
    absent = [term for term in required_terms if term not in skill]
    if absent:
        print("Skill contract terms missing:", ", ".join(absent), file=sys.stderr)
        return 1

    evidence = json.loads(
        (ROOT / "examples" / "figma-evidence.external-blocked.json").read_text(encoding="utf-8")
    )
    if evidence.get("status") != "external-blocked" or evidence.get("fileKey") is not None:
        print("external-blocked evidence fixture is invalid", file=sys.stderr)
        return 1

    print("figma-3d-situation-screen Skill contract: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
