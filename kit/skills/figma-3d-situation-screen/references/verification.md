# Verification and evidence

## Functional gate

- visible `canvas` with a real WebGL/WebGL2 context;
- one main renderer and no competing WebGL scene;
- valid licensed GeoJSON extrusion, hover, click, one drill level, and exact back restoration;
- fly line, scatter, or column layer driven by coordinates/data;
- live panel updates plus loading, empty, error, retry, and context-loss states;
- resize and destroy leave no orphan canvas, frame loop, listener, geometry, material, or texture;
- reduced motion stops continuous effects and interruptible timelines settle correctly.

## Responsive and console gate

Use the in-app Browser first. Use Playwright for repeatable viewport and interaction checks. Capture uncropped screenshots at 1920x1080, 1366x768, and 1024x768. Record scroll dimensions, canvas count/context, selected scope, interactions, and console errors/warnings. Both counts must be zero.

## Performance gate

Measure 30 seconds after warm-up:

- 1920x1080: median FPS >= 45 and p95 frame time <= 33 ms;
- 3840x2160: effective DPR <= 1.5, median FPS >= 30, p95 <= 50 ms.

If a gate misses, the renderer automatically lowers DPR/effect density and records the reason. Re-run the same measurement and archive both before/after results.

## Figma gate

Record `fileKey`, `nodeId`, viewport, Figma screenshot, implementation screenshot, diff, and result. Missing live access is `external-blocked`; local screenshots remain implementation evidence only.

## Repository gate

Run Skill validation, sample build/typecheck/lint/test, project `validate`, `check:harness`, `check:dom`, `build:preview`, `build:starter`, and `check:package`. Keep preview <= 700 KiB gzip and starter <= 320 KiB gzip. Archive exact command output and bundle sizes.
