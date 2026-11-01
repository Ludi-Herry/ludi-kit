# Request and run contracts

## Request

All paths are relative to `kit/` and remain inside it. Version `2.0.0` binds requests to strategy decision `image2-routing-strategy-amendment-2026-08-14`.

Shared fields:

- `workflowId`: `image2-to-figma-page`
- `requestId`: stable lowercase identifier
- `designContext`: `existing` or `exploratory`
- `routing`: strategy decision, matching selected route, and a concrete selection reason
- `project`: name, target page, objective, audience
- `viewport`: width, height, device scale factor
- `pageEntry`: implemented HTML or app entry
- `visualDiffConfig`: visual adapter configuration
- `browserEvidence`: optional completed Browser/Playwright record
- `figmaEvidence`: verified or external-blocked Figma record
- `figmaTarget`: real `fileKey` and page node, or `null`

`existingContext` requires seven frozen sources:

- `designDoc`
- `tokens`
- `componentIndex`
- `figmaSyncContract`
- `patternManifest`
- `recipe`
- `rules`

The existing route rejects `referencePrompt`, `referenceImage`, and `exploratoryContext`.

`exploratoryContext` requires:

- two or three `directions` with distinct hypotheses
- `selectedDirectionId` referencing one proposed direction
- `miniDesignBrief` with principles, color intent, type intent, and density
- `image2Scope.visualGoals` limited to composition, atmosphere, material, brand, or visual direction
- `image2Scope.authority = visual-exploration-only`
- `structuredContract` and `componentFoundation` paths
- a fixed `structuralAuthority` map assigning copy, data, interaction, responsive behavior, and accessibility to the structured contract and component states to real components
- `referencePrompt`; `referenceImage` remains optional until generation occurs

## Frozen contract

For `existing`, preserve the seven source fields in contract order and record path plus SHA-256. Hash the stable source array as `contractSha256`.

For `exploratory`, hash the selected direction, mini design brief, Image2 scope, structural authority, and the two frozen source receipts. The selected ID must appear in the proposal list.

## Run record

Validate against `schema/image2-workflow-run.schema.json`. A run contains:

- strategy-bound route and route-specific pipeline;
- overall status;
- frozen contract kind, hash, and sources;
- eight ordered route-specific stages;
- page, visual metrics, heatmap, and Figma evidence paths;
- exact external blockers and resume requirements.

The existing pipeline is `design-contract → figma-or-component-foundation → pattern-recipe → implementation → verification`. Its stages cannot contain `gpt-image-2` or `image-to-html`.

The exploratory pipeline is `frozen-visual-brief → gpt-image-2 → image-to-html → implementation → verification`. Both Image2 stages must remain present and must cite the frozen contract.

Overall status aggregation uses `failed` when any stage fails, `external-blocked` when an unavailable dependency stops at least one stage, `in-progress` while supplied live stages remain `ready`, and `completed` only when every stage passed.

`ready` means the adapter and inputs exist with no external action claimed. `passed` requires a real artifact or executed gate. `external-blocked` requires a named unavailable dependency and concrete resume requirements.
