# Harness scenario reference

This page documents the JSON scenario fields and the static proof boundaries enforced by the harness. The schema at `schema/harness-scenario.schema.json` owns the exact machine contract.

## Scenario shape

```json
{
  "id": "build-permissions-list",
  "expectedPattern": "list-page",
  "expectedComponents": ["PageLayout", "PageHeader", "FilterPanel", "DataSection", "DataGrid"],
  "output": { "file": "harness/fixtures/permissions-list.good.tsx" }
}
```

Optional fields:

- `output.symbol` — scopes render evidence to one uniquely named top-level function. The function must have exactly one top-level JSX return; nested, dead, fallthrough, and data-return paths fail. JSX ternaries remain supported. Project-wide scenarios derive evidence from `generatedComponents` factories and recursively follow reachable lexical function and const-function render helpers.
- `output.pageId` — pair with `output.symbol` for generated project pages. The runner loads the sibling `pages.json`, compares every page id/route/title/pattern with `pagePlans`, then requires this exact page id to mount this exact component through `pageById` and `generatedComponents`.
- `expectedStatusCopy` — exact checks use `{ "source": "<project status-copy.md>", "groups": { "codeGroup": { "sourceGroup": "Markdown business group", "statuses": ["key"] } } }`. The runner binds code group + source group + key + label + variant and requires a reachable `StatusBadge` binding. Legacy `statuses` arrays validate static label/variant mappings and require at least one reachable badge while scenarios migrate.
- `expectedActions` — supports page-level `required` / `forbidden` / `danger` labels from Buttons and static AntD Dropdown menu items, plus conditional assertions such as `{ "when": "record.status === \"pending\"", "branch": "then", "required": ["Approve"], "forbidden": ["Delete"] }`. Conditional actions must be provably absent from the opposite branch and outside the matched ternary; unresolved dynamic labels fail closed unless the exact page plan proves a different static label.
- `expectedConfirmations` — binds each static Button action to one `ConfirmDialog` with `{ "action", "title", "confirmLabel", "requiredText", "danger" }`. A legacy boolean dialog can omit `state`; target-object and decision-union dialogs add `{ "state": { "variable", "openMode", "triggerValue", "clearValue" } }`. The runner proves the trigger value, `open` expression, state-specific title/label/danger/text, and cleanup on every reachable cancel/confirm path. Multiple entries may share one state when each action has its own provable branch. Required text comes only from the matched dialog subtree. This field requires `output.symbol`.
- `expectedClassTokens` — requires exact reachable class tokens from `className` or a kit `DataGrid` / `Table` `rowClassName` callback. Static false/nullish branches do not count; dynamic ternary branches do.
- `expectedStaticValues` — checks exact paths in a top-level static object and requires every asserted entry path to flow through reachable render code into one kit `Badge`'s `variant` prop and label child. A fixed entry cannot prove sibling entries; a genuinely dynamic key can.
- `dataAssertions` — checks representative rows without executing generated code. Each `{ "array": "alertRows", "field": "handling", "forbiddenValues": ["resolved-alert"] }` entry requires exactly one top-level `const` array, at least one object row, and one static string field per row; any forbidden value fails the scenario.
- `forbiddenPatterns` — enables the named rules as errors. Supported names are `custom-button-style`, `hardcoded-brand-color`, `card-inside-card`, and `direct-third-party-import`. Nested Card checks preserve ancestry across reachable lexical render helpers.
- `buildRuntime` — accepts the exact shape `{ "command": "npx", "args": ["tsc", "--noEmit", "-p", "<tsconfig>"], "cwd": "." }`. The runner translates it to a no-emit TypeScript compile inside the bounded Worker and project read boundary. Composite/incremental metadata and all compiler writes stay disabled.

## Controlled confirmation syntax

The legacy boolean form remains supported:

```tsx
const [deleteOpen, setDeleteOpen] = useState(false);

<Button
  danger
  onClick={() => {
    setPendingRecord(record);
    setDeleteOpen(true);
  }}
>
  Delete
</Button>

<ConfirmDialog
  open={deleteOpen}
  title="Delete record?"
  description="Deleted data cannot be recovered."
  confirmLabel="Delete"
  danger
  onCancel={() => setDeleteOpen(false)}
  onConfirm={() => setDeleteOpen(false)}
/>
```

Target-object and decision-union dialogs declare the exact state proof in the scenario:

```json
{
  "action": "Scrap",
  "title": "Scrap device?",
  "confirmLabel": "Confirm scrap",
  "requiredText": ["cannot be undone"],
  "danger": true,
  "state": {
    "variable": "decision",
    "openMode": "truthy",
    "triggerValue": { "action": "scrap" },
    "clearValue": null
  }
}
```

`openMode: "direct"` requires `open={state}`; `openMode: "truthy"` requires `open={Boolean(state)}`. `triggerValue` accepts `"non-null"` for a bound target object or a static partial object for a decision branch. `clearValue` is `false` or `null` and must be written on every reachable `onCancel` and `onConfirm` path.

Supported triggers are inline setters in the output symbol, or one bounded callback-prop hop through a top-level local component. This covers extracted panels such as `SchedulePanel` while preserving the page as the state owner. Stateful dialog fields may be conditional only when the selected trigger value uniquely proves the matching branch.

The runner rejects functional updaters, toggles, setter aliases, page-helper or multi-hop borrowing, conditional helper calls, nullable target writes, unreachable setters, loops / `switch` / `try` transitions, duplicate attributes, JSX spreads, ambiguous dynamic branches, and cleanup that misses a reachable path. These boundaries keep the trigger, target, dialog copy, danger semantics, visibility, and cleanup provable without executing generated code.
