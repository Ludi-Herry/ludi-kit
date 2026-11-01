---
name: figma-3d-situation-screen
description: Build and verify a Figma-calibrated React situation screen with one real WebGL map renderer, licensed GeoJSON, optional decorative 3D, routed motion, responsive visual QA, performance gates, and archived evidence. Use for command centers, security/operations walls, GIS drilldown screens, or when auditing cutout assets before implementation.
---

# Figma 3D Situation Screen

Use this workflow for full-screen situation awareness. Keep ordinary admin navigation, forms, and dense CRUD tables in the normal page recipes.

## Required inputs

Collect what exists and mark missing external inputs explicitly:

- business brief, target viewports, data freshness, aggregation rules, and empty/error behavior;
- Figma `fileKey`, `nodeId`, access status, node screenshot, and asset exports;
- GeoJSON/API source, version or commit, license, attribution, and intended redistribution;
- renderer constraints, browser support, device DPR, and performance target;
- optional Spline scene URL and its publication rights.

Use `external-blocked` for a missing Figma node, map key, private API, or license confirmation. Continue every offline-verifiable stage.

## Workflow

1. Read the repository `AGENTS.md`, project status, situation-screen recipe, manifests, preview/harness, design system, tests, and acceptance contract.
2. Run the cutout-preparation stage in [references/cutout-preparation.md](references/cutout-preparation.md). Keep source packages read-only and ignore AppleDouble metadata.
3. Use [references/figma-tool-routing.md](references/figma-tool-routing.md) to gather live Figma evidence. Never substitute a self-made screenshot for Figma evidence.
4. Choose exactly one main map renderer with [references/renderer-routing.md](references/renderer-routing.md). Record the decision and rejected options.
5. Build the React adapter, data adapter, renderer lifecycle, interaction transaction, panels, and states. Keep map dependencies behind a dynamic import.
6. Route motion with [references/motion-routing.md](references/motion-routing.md).
7. Run [references/verification.md](references/verification.md), archive evidence, and request an independent verifier.
8. Validate the Skill and workflow fragment with the scripts in `scripts/`.

## Required outputs

- a scope-specific implementation note with renderer decision, deviations, source/license table, and performance baseline;
- a read-only source inventory and cutout decision record;
- a thin external-renderer adapter or audit without copying unclear-license source;
- a working React sample with a visible WebGL canvas, valid GeoJSON extrusion, hover/click, one drill level, one dynamic geo layer, live panels, loading/empty/error states, and interruptible motion;
- responsive screenshots and interaction evidence at 1920x1080, 1366x768, and 1024x768;
- 30-second performance evidence at 1920x1080 and 4K, including effective DPR and automatic degradation state;
- `prefers-reduced-motion`, context-loss, resize, console, build, typecheck, lint, and test results;
- a Figma comparison record or a truthful `external-blocked` record;
- a standalone workflow manifest fragment/schema proposal. Do not edit an owner-locked central manifest.

## Stop conditions

Stop only the affected branch when work requires a secret map key, private Figma access, license confirmation, deletion, publication, or a product decision that changes the screen. Retry each failure class at most three times. Preserve evidence and continue independent offline work.

Do not:

- use a PNG, SVG, or CSS drawing as proof of WebGL rendering;
- run two main WebGL map renderers on one screen;
- vendor or redistribute source/data with unclear rights;
- reuse the local AMap Skill with its telemetry or fixed external paths;
- raise the preview 700 KiB or starter 320 KiB gzip budgets;
- crop screenshots to conceal overflow or lower visual/performance gates;
- claim Figma alignment without a real `fileKey`, `nodeId`, viewport, screenshot, and comparison artifact.

## Project example

See `kit/examples/figma-3d-situation-screen/`. It uses a lazy Three.js renderer and public-domain Natural Earth GeoJSON. Its BeautiMap adapter is an isolated contract PoC; the audited upstream build is excluded from the formal renderer registry.
