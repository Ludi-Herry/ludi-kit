# Ant Design 6.5.0 knowledge pack

This directory is the page-decision layer for projects frozen to `library-native + antd@6.5.0`. It turns the official design language, versioned CLI output, and local product decisions into a reproducible generation input.

## Read order

1. Read the project `business-context.json` and its `frontendFoundation` contract.
2. Read `design-language.md` for the visual system and interaction baseline.
3. Select one template from `page-templates/` for each page archetype.
4. Resolve the components actually used by the page through `decision-cards.json`.
5. Read the matching frozen CLI reference in `component-reference/` before writing AntD props, tokens, semantic styles, or demos.
6. Select the matching localized sources from `blog/index.json`; routine generation excludes `maintenance-only` articles.
7. Apply the selected cases from `visual-regression-cases.json` and the enforced rules from `blog-lint-rules.json`.
8. Run the contract adapters and the project-level AntD lint gate.

The local decision card controls business usage. Official examples demonstrate APIs and implementation shapes. ProComponents contributes composition patterns; this pack does not add `@ant-design/pro-components` as a runtime dependency.

## Maintenance contract

- Runtime version: `antd@6.5.0`
- CLI version: `@ant-design/cli@6.5.1`
- Query language: Chinese for component docs; the v6 design-language file follows the CLI canonical output.
- Refresh triggers: AntD runtime upgrade, CLI knowledge change, official pattern change that affects a frozen decision, or a page selecting a component outside the current reference set.
- Blog refresh command: `npm run refresh:antd-blog -- --commit <exact-commit>`
- Pack rebuild command: `npm run build:antd-knowledge`
- Validation command: `npm run validate:antd-knowledge`

The generated `manifest.json` stores a SHA-256 for every frozen Blog file, decision file, template, quality rule, and component reference. Project generation stops before output when any hash drifts.
