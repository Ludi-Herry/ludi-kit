# Business context gate

Check the project context before adding pages, components or a frontend foundation. This gate prevents validation fixtures from becoming product strategy.

## Project type

| `contextType` | Purpose | Allowed work |
| --- | --- | --- |
| `validation-sandbox` | Exercise generation and acceptance mechanics | Pipeline regression, rule checks, preview acceptance and explicit canaries |
| `real-product` | Serve real users, workflows and business states | Page scope, business components, foundation selection and page acceptance |

A sandbox can prove that a mechanism runs. It cannot decide which business components or information architecture a real product needs.

## Required brief

Create a real-product contract only after the brief identifies:

- Product, business scenario and current stage.
- Users, roles, permissions and responsibility boundaries.
- Core workflows and the first page set.
- Data entities, state transitions, exceptions and recovery paths.
- Dense tables, complex forms, batch operations, audit trails and high-risk actions.
- Candidate business components tied to real workflows.
- Output mode, framework, exact foundation version, distribution, design pack, icons, theme/reset/import rules and acceptance adapters.
- First-release success criteria.

Use [`real-business-brief.template.md`](./real-business-brief.template.md).

## Choose the output mode

| Signal | `outputMode` |
| --- | --- |
| The project consumes or validates the package public API | `kit-consumer` |
| The project uses a registered third-party library directly | `library-native` |
| The project uses Figma-mapped, local, workspace, registry or source components | `custom-native` |

Candidate metadata lives in `foundations/catalog.json`. Selection happens in the project contract. Install or materialize the foundation only after selection, then record exact provenance, license and adapters.

## Business component gate

Add a business component only when a real PRD or flow proves repeated semantics, interaction or layout that existing components cannot cover. Extend existing props, variants and composition points first.

Current public components and their `useWhen` / `avoidWhen` rules live in `components.manifest.json`. Do not copy the component list into project docs.

## Exit criteria

The gate passes when:

- `business-context.json` is schema-valid.
- `contextType` matches the intended work.
- `frontendFoundation` is complete and its design pack hash matches.
- Required page, flow, state and acceptance inputs are available.

If any item changes page scope, state behavior or delivery boundaries, pause generation and resolve it before writing files.
