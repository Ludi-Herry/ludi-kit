# Cutout preparation stage

## Source intake

1. Record source path, byte size, modified time, SHA-256, author/version/license status, and access method.
2. Keep the source archive read-only. Read entries in place; skip `__MACOSX`, `.DS_Store`, and `._*` AppleDouble entries.
3. Scan instructions and scripts for network calls, credentials, destructive operations, telemetry, and hidden dependencies.
4. Treat absent author/version/license metadata as pending. Paraphrase useful process guidance and avoid redistributing upstream files.

## Figma structure

Organize the source page as `Overview > module > asset item > resource Frame + external notes`. Name exported frames `Axx_semantic-name.ext` and keep a stable record for each asset.

For every visible module, choose one decision:

| Decision | Use when | Record |
| --- | --- | --- |
| cut | complex background, glow, photo, static map, or approved non-data decoration | viewport, crop boundary, format, scale, output hash |
| do not cut | live text, interactive control, data-driven chart, responsive panel geometry | component/data owner and implementation route |
| pending | unclear dynamic behavior, missing rights, missing source, or mixed static/dynamic content | blocker, owner, next evidence needed |

## Static and dynamic charts

Split each chart into four possible layers:

- static decoration: approved frame, glow, texture, or ornamental axis treatment;
- dynamic data: geometry generated from typed data;
- live text: semantic DOM with contrast and accessibility;
- mixed: export only the static layer and document the alignment contract.

Map boundaries, hover states, drilldown geometry, labels tied to data, fly lines, scatter points, and columns stay dynamic.

## Export rules

- PNG: complex backgrounds, glows, photos, and approved static maps; export 1x and `@2x`.
- SVG: panels, borders, icons, and vector decorations with verified clipping and strokes.
- Crop to the visible target-screen viewport. Keep full content when future pan/zoom needs it.
- Verify every output exists, has non-zero bytes, opens correctly, and matches the recorded dimensions.

## Self-check record

For every module capture: module ID, Figma node, decision, rationale, static/dynamic split, export frame, format/scale, target path, source hash, license status, reviewer, and open questions. Finish only when every module has one decision and every exported file passes the open/non-zero/dimension checks.

## Audited source package

The local `<local-path-omitted>` was inspected in place on 2026-07-16.

- SHA-256: `DC42F7FAA92005CCB4E1C02DA8AB4E8EF75C62408C639055666C230E0A7A7565`
- archive size: 10,545 bytes; 16 entries; 5 relevant non-AppleDouble files
- source author/version/license: absent, confirmation pending
- executable behavior: none found; no network, credentials, telemetry, or destructive script
- reuse decision: process concepts absorbed and rewritten here; original files remain unvendored
