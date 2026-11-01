# Frontend foundation contract reference

This page is the package-level reference for `business-context.json > frontendFoundation`. The product overview and selection rationale live in [`../../docs/FRONTEND-FOUNDATION-SYSTEM.md`](../../docs/FRONTEND-FOUNDATION-SYSTEM.md).

## Required responsibilities

The contract selects:

- `outputMode` and framework.
- Runtime, icon and source distribution.
- Allowed import roots.
- Theme entry and CSS reset.
- Design pack provenance and content hash.
- Lint, build, browser and visual adapters.

Read the exact field names and accepted values from the project schema and the matching design pack schema. Those files own the current contract shape.

## Output modes

| Mode | Import policy |
| --- | --- |
| `kit-consumer` | Package public API and framework runtime |
| `library-native` | Contract-selected runtime, icon packages and project business components |
| `custom-native` | Contract-selected local package, workspace export, registry or project source |

The import validator resolves the mode from the target project. Rules written for one mode do not apply to another mode automatically.

## Candidate selection

`foundations/catalog.json` is a catalog. Registration does not install a runtime dependency or add it to the package. A selected project records the exact version or content identity and chooses its distribution model.

Examples of distribution models include package-native, source-registry, figma-mapped, workspace-package, local-package and project-source. Use the schema for the current enum.

## Pre-write failures

The generator exits before writing when:

- `--context` is missing.
- The contract fails schema validation.
- The project identity conflicts with the target.
- The design pack hash differs.
- A required adapter cannot be resolved.
- The selected import roots conflict with the output mode.

Tests should assert zero writes for these failures.

## Acceptance

A formal page records at least one key interaction and separate technical and visual results. Technical checks include import policy, typecheck/build, console, overflow and component use. Visual checks include the contract-selected screenshot, diff or human-review path.

Bundle budgets are owned by `checks/bundle-budget.json`. Visual diff thresholds are owned by `visual-diff/lib/runner.mjs > FIXED_THRESHOLDS`. Documentation links to those owners instead of copying current values.

## Inspect a project

1. Open its `business-context.json`.
2. Read `frontendFoundation.outputMode`.
3. Follow the registered design pack path.
4. Verify the design pack hash.
5. Resolve the named adapters.
6. Run the project-specific validation listed in the contract.
