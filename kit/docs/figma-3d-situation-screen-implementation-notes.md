# Figma 3D Situation Screen — implementation notes

Updated: 2026-07-16

## Scope and baseline

- branch: `codex/figma-3d-situation-screen`
- authoritative baseline: `02a1e7c` (`feat: complete kit capability baseline`)
- baseline inventory: 39 components, 7 patterns, 29 pages, 28 scenarios
- protected budgets: preview 700 KiB gzip; starter 320 KiB gzip
- central `workflows.manifest`: owned by the Image2 line; this scope adds a fragment/schema proposal only

## Renderer decision

Three.js is the admitted main renderer for the sample. It supports local public-domain GeoJSON, administrative extrusion, drilldown, custom fly/scatter/column layers, explicit lifecycle cleanup, context recovery, DPR control, and reduced motion. The entire map subtree is loaded dynamically after the shell is visible.

BeautiMap is a NO-GO registry candidate at audited commit `eee4669026b9979689d6cfd119b536dc4d291986`. The build command succeeds, while the UMD runtime exports an absent default, full license text is missing, 1,098 GeoJSON files have no documented provenance, and lifecycle/performance gates are incomplete. No upstream source/data is copied. A source-free adapter PoC remains for contract tests.

AMap is out of scope because this offline sample needs no real basemap/POI/path/LBS. The local telemetry-bearing Skill is not reused. Spline is omitted because no licensed scene URL was supplied and the screen needs no decorative second WebGL scene.

## Data provenance

| Asset | Source | Version | Rights | Use |
| --- | --- | --- | --- | --- |
| USA country/admin-0 | Natural Earth `natural-earth-vector` | pinned by fetch metadata | public domain | parent extrusion |
| USA states/admin-1 | Natural Earth `natural-earth-vector` | pinned by fetch metadata | public domain | one-level drilldown |
| cutout workflow concepts | `<local-path-omitted>` | SHA-256 `DC42F7FAA92005CCB4E1C02DA8AB4E8EF75C62408C639055666C230E0A7A7565` | author/version/license pending | rewritten process guidance only |

## Figma calibration

Status: `external-blocked`. No Figma URL, `fileKey`, `nodeId`, or access grant is available. Browser screenshots produced in this scope are implementation evidence and will not be labeled as Figma alignment evidence.

## Deviations

- The `three-scope-map` strict checker is Vue/template-specific. This React sample uses a local checker that preserves its invariants: real WebGL, real GeoJSON, extrusion, hover/click/drilldown, dynamic effects, responsive host, lifecycle disposal, and no static fallback.
- BeautiMap cannot be promoted into the renderer registry under the current evidence. The sample continues on the Three.js route.
- The first runtime verification exposed a React update loop in the empty state. That evidence is retained as failed. The derived empty GeoJSON is now memoized, callback identities are stable, and renderer mount/reduced-motion effects are separated.
- The in-app Browser produced a tiled 4K screenshot. That artifact is retained as failed; the accepted 4K capture comes from a native Playwright viewport.
- The first installed-package check included the sample's local dependencies because the kit package publishes `examples/`. Scoped `.npmignore` and `.gitignore` rules now exclude `node_modules`, dist, raw Playwright output, and TypeScript build metadata while preserving formal evidence. The package gate passes with 233 files.

## Verification record

The clean runtime used one URL, `http://127.0.0.1:5192/`, after the earlier server was stopped. Browser and Playwright verification covered ready/loading/empty/error, hover, country click, 49-state drilldown, return, context loss/restoration, and reduced motion. Clean sessions have zero console errors and warnings; clean server stderr is zero bytes.

Final performance:

| Viewport | Median FPS | p95 frame time | DPR | Gate |
| --- | ---: | ---: | ---: | --- |
| 1920×1080 | 142.857 | 7.1 ms | 1 | pass: ≥45 FPS and ≤33 ms |
| 3840×2160 | 142.857 | 7.0 ms | 1 | pass: ≥30 FPS, ≤50 ms, and DPR ≤1.5 |

The renderer has an automatic 240-frame quality check. A miss lowers DPR and removes half of the fly-line and pulse-halo effects. WebGL2 diagnostics recorded one canvas, NVIDIA/ANGLE on GeForce GTX 1060 6GB, max texture/renderbuffer size 16384, and antialiasing enabled.

Kit gates pass with the protected baseline inventory intact. Bundle measurements are preview 695.18 KiB gzip against 700 KiB and starter 278.71 KiB gzip against 320 KiB. The standalone sample builds into lazy chunks: shell 5.82 KiB gzip, map component 1.57 KiB, renderer 4.60 KiB, GSAP motion 27.32 KiB, React 59.67 KiB, and Three.js 140.46 KiB.

The evidence index and exact artifacts live in `kit/examples/figma-3d-situation-screen/evidence/`. Figma visual calibration remains `external-blocked` and stays outside the pass count.
