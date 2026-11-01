# Evidence contract

## Browser evidence

Record:

- unique local URL;
- viewport width, height, and device scale factor;
- full-page screenshot path and SHA-256;
- critical-region screenshot paths and SHA-256 values;
- interactions performed and resulting visible state;
- console or page errors.

## Visual diff evidence

Keep the input image hashes, dimensions, full-page RMS/SSIM/changed-pixel ratio, per-region metrics, failure list, metrics path, and heatmap path. A size mismatch produces no comparison claim.

## Figma evidence

Use `schema/figma-evidence.schema.json`. A verified record must contain real:

- `fileKey`, `nodeId`, and `captureId`;
- viewport;
- screenshot paths and hashes;
- visual diff metrics and heatmap paths;
- component binding result;
- variable binding result.

For unavailable tools or authorization, set status to `external-blocked`, leave IDs `null`, keep screenshot and diff claims empty or blocked, and list the dependency, reason, and resume requirements.

Reject values containing `todo`, `tbd`, `fake`, `example`, `placeholder`, or `unknown` as identifier segments.
