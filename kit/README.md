# Ludi Design Kit package

This directory contains the package, generators, project contracts, workflow registry, acceptance runners, and evidence validators.

## Before you change anything

- Generate or modify a page: read [AGENTS.md](./AGENTS.md), then the target project's `business-context.json`.
- Change design behavior: read [DESIGN.md](./DESIGN.md), the affected rule, and the matching recipe.
- Change a workflow: read [workflows/README.md](./workflows/README.md) and the matching entry in `workflows.manifest.json`.
- Change the harness: read [harness/README.md](./harness/README.md) and its linked references.

## Install and verify

From a clean checkout:

```powershell
Set-Location <local-path-omitted>
npm ci
npm run validate
```

Use `npm run validate:incremental` for ordinary repeat verification after the same worktree has a recorded full pass. Release, receipt freeze, frozen-evidence changes and new canonical validation records still require `npm run validate`.

The current command catalog lives in [package.json](./package.json). Choose targeted checks from `scripts` according to the files changed; avoid copying the entire command list into other docs.

## Inspect page context

The M0 Ludi Design CLI compiles existing project, page, flow, foundation, pattern and validation contracts into one read-only JSON response:

```powershell
npm run --silent ai-readable -- inspect --project tianshu-ops --page production-inbound --json
```

`ready` means the context packet is available. M0 never authorizes implementation writes: `writePolicy.allowedWrites` stays empty until a separate task contract is introduced. The product and protocol specification is [SPEC-ai-readable-cli-context-compiler-m0.md](../docs/SPEC-ai-readable-cli-context-compiler-m0.md).

## Generation contract

1. Validate the target project's `business-context.json` and `frontendFoundation`.
2. Read the selected design pack and verify its SHA-256.
3. Use the output mode's import boundary:
   - `kit-consumer`: `@ai-readable/kit`.
   - `library-native`: the selected third-party runtime and icon packages.
   - `custom-native`: the selected local package, workspace export, registry or source roots.
4. Use the selected component catalog, `patterns.manifest.json`, the [rule index](./rules/README.md) and the [recipe index](./recipes/README.md).
5. Run the contract's lint, build, browser and visual adapters.
6. Present the workflow's primary deliverable from `workflows.manifest.json > handoff`.

## Main directories

| Directory | Responsibility |
| --- | --- |
| `src/` | Public package implementation |
| `foundations/` | Candidate catalog and versioned design packs |
| `generator/` | Contract-driven generation and fixtures |
| `projects/` | Project-owned requirements, flows, generated output and evidence |
| `rules/` | Cross-page design constraints |
| `recipes/` | Task-specific composition instructions |
| `harness/` | Static and runtime acceptance contracts |
| `figma/` | Code-to-Figma mappings and evidence |
| `quality/` | Frozen quality evidence and protected historical records |
| `workflows.manifest.json` | Machine-readable workflow status, artifacts and handoff |
