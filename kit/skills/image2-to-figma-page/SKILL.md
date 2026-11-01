---
name: image2-to-figma-page
description: Routes B2B page work through an existing design foundation by default and reserves Image2 for explicit high-variance visual exploration. Produces a verified web page and traceable optional Figma evidence.
---

# Routed page workflow

Select exactly one route, freeze its contract, implement a real page, and verify the result. The strategy authority is `quality/image2-strategy/image2-routing-strategy-amendment-2026-08-14.json`.

Validate the request against `../../schema/image2-workflow-request.schema.json` before creating artifacts. Read [references/contracts.md](references/contracts.md) for the complete input and output contract and [references/evidence.md](references/evidence.md) before reporting completion.

## Fail-closed route selection

Require `designContext` and a matching `routing.selectedRoute`:

- `existing` is the default for general B2B pages and any task with a usable design contract, Figma source, design system, or component foundation.
- `exploratory` is opt-in. Use it only when the task explicitly needs a materially different composition, atmosphere, material, brand treatment, or visual direction.

Reject missing, unknown, or mismatched route data. Reject absolute paths, repository escapes, placeholder Figma identifiers, and mutable thresholds.

The `existing` route forbids `referencePrompt`, `referenceImage`, `gpt-image-2`, and `Image-to-html`. A request that forces any of them into this route fails before artifact creation.

The `exploratory` route requires a selected direction, frozen mini design brief, explicit Image2 visual goals, a structured product contract, a real component foundation, and the fixed structural authority map. Its scope authority is `visual-exploration-only`. Copy, data, interactions, component states, responsive behavior, and accessibility remain controlled by the structured contract and real components.

## Route A — existing direct

1. Read the structured design contract. If a real `fileKey` is supplied, use `figma:figma-use` only within its authorization boundary. Record real identifiers returned by the tool.
2. Read the design document, tokens, component index, and Figma sync contract. Resolve contradictions before implementation.
3. Read `patterns.manifest.json`, the selected recipe, and the selected rules file.
4. Freeze all seven source paths with SHA-256.
5. Implement through the repository component entry, then run the technical, Browser, Playwright, responsive, accessibility, interaction, and visual gates required by the project contract.
6. Keep live Figma stages `external-blocked` when the target or write authority is unavailable. Leave external IDs `null`.

This route may refine composition inside the frozen system. It may not introduce an Image2 reference or replacement visual language.

## Route B — exploratory Image2

1. Translate the product objective, audience, primary task, and constraints into two or three materially distinct directions. Each direction needs a testable visual hypothesis.
2. Stop when no direction is selected. A guessed selection invalidates the route.
3. Freeze the selected mini design brief, `image2Scope.visualGoals`, structured contract, component foundation, and structural authority map. Later stages cite this hash.
4. Use `gpt-image-2` for the allowed visual goals only. Record the confirmed prompt, one generated image, dimensions, and SHA-256. A prompt alone leaves generation `ready`.
5. Use `Image-to-html` to measure and decompose the image into shell and regions. Map every functional region to the real component foundation and keep structural behavior governed by the frozen contract.
6. Implement a runnable page with meaningful data, required loading/empty/error states, visible focus, keyboard access, and restrained motion tokens with `prefers-reduced-motion`.

## Shared verification

### Browser and Playwright

Use one unique local URL. Open it in the in-app Browser first, then use the `playwright` Skill for deterministic viewport, full-page screenshot, critical-region screenshots, and interaction checks. Record viewport and screenshot hashes. Console or page errors fail the gate.

### Visual validation

Run `node scripts/visual-diff.mjs --config <config>`. Exploratory Image2 comparisons keep these immutable thresholds:

- Full page: SSIM ≥ 0.985, normalized RMS ≤ 0.035.
- Every critical region: SSIM ≥ 0.990, normalized RMS ≤ 0.025.
- Changed-pixel rule: channel delta > 16/255 and changed ratio ≤ 0.025.
- Input dimensions must match.

Exit code 1 records a valid comparison failure. Exit code 2 records invalid inputs or configuration. Both keep downstream Figma write stages closed. Preserve metrics and heatmap artifacts.

Existing direct work uses the visual adapter named by its project contract. Historical Image2 thresholds and verdicts remain immutable evidence.

### Optional Figma stages

Use `figma:figma-generate-design` only with a real authorized target and an unlocked workflow state. Record the returned `captureId`, `fileKey`, node ID, viewport, and screenshot evidence.

Use `figma:figma-use` and `figma-component-builder` to rebuild authorized captures with variables, text styles, Auto Layout, component sets, variants, and instances. Read back the final node tree and bindings.

Figma target `YOUR_NODE_ID` remains locked by the current strategy amendment. Missing tool access, scope, `fileKey`, target node, or lock release produces `external-blocked`.

## Evidence and stopping rules

Stop immediately when any condition applies:

- route selection is absent, unknown, or inconsistent;
- existing direct work contains Image2 inputs or stages;
- exploratory work lacks the selected frozen visual brief, structured contract, or real component foundation;
- a required source, page entry, generated image, or baseline is absent;
- visual thresholds fail or image dimensions differ;
- Browser or Playwright interaction verification fails;
- Figma authorization, tool access, `fileKey`, target node, or strategy lock release is absent;
- a Figma response cannot be read back and attributed.

Local stages that passed remain valid. Report the exact resume requirements and set blocked external IDs to `null`.

## Validate and package

From the kit directory:

```text
node skills/image2-to-figma-page/scripts/validate-skill.mjs
python skills/image2-to-figma-page/scripts/package_skill.py
```

The validator checks both routes, eval fixtures, schema compilation, references, and fail-closed route inputs. The package script creates a deterministic `.skill` archive under ignored `dist/`.
