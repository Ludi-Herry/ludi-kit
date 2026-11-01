# Project contracts

`projects/` contains project-owned inputs and outputs for the full chain:

```text
business context
  → page and flow contracts
  → generated product
  → harness and browser acceptance
  → feedback and promotion
```

## Choose the project type

`business-context.json > contextType` controls what the project may teach the kit:

| Type | Allowed use |
| --- | --- |
| `validation-sandbox` | Pipeline regression, rule acceptance, preview checks and explicit kit-consumer canaries |
| `real-product` | Real page scope, business components, foundation decisions and page-by-page acceptance |

A validation sandbox cannot decide the business component roadmap, information architecture or third-party foundation for real products.

## Required inputs

Before generation, provide:

- `business-context.json`
- `prd.mdx`
- `pages.json`
- `flows.json`
- `sample-pack.json` for projects using the current sample-data contract
- `flow-acceptance.json` when a cross-page flow enters acceptance

`business-context.json > frontendFoundation` freezes output mode, framework, exact package versions, distribution, design pack, icons, theme/reset/import rules and four acceptance adapters. The generator validates the contract and design pack hash before writing any page.

`pages.json.dataRequirements` references entities registered in `sample-pack.json`. Pages and flows use stable `type/id` values so one demo object remains consistent across routes.

## Output mode

- `kit-consumer`: generated pages import from `@ai-readable/kit`.
- `library-native`: generated pages import the contract-selected third-party packages.
- `custom-native`: generated pages import the contract-selected local package, workspace export, registry or project source.

The exact boundary comes from the project contract. Cross-mode assumptions in examples do not override it.

## QA writeback

Classify each finding before editing:

| Finding owner | Canonical input |
| --- | --- |
| Requirement | `prd.mdx` or `business-context.json` |
| Page intent | `pages.json` |
| Flow | `flows.json` or `flow-acceptance.json` |
| Demo data | `sample-pack.json` |
| Reusable design behavior | matching rule, recipe, component or Token |
| Project implementation | project source |

When generated output changes, update the owning input in the same batch and record the source and implementation hashes required by the feedback contract. Run the affected flow first, then the required project or full validation.

Promotion tooling produces drafts and apply plans. Source changes remain human-reviewed.

## Blind acceptance

Frozen blind runs, receipts and historical verdicts live under `quality/` and keep their original semantics. New qualifying work must follow the current protocol, project-relative contracts and receipt-bound runner. The authoritative procedure and stop state are linked from [`../../docs/PROJECT-STATUS.md`](../../docs/PROJECT-STATUS.md) and the relevant `quality/` contract; this README does not duplicate run counts or hashes.
