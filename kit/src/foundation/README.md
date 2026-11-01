# Foundation adapter boundary

This directory owns third-party adapters used behind the `@ai-readable/kit` public API. That internal boundary applies to `kit-consumer`; `library-native` and `custom-native` projects follow their own locked import roots.

Generated pages and starter apps read `business-context.json.frontendFoundation` before output:

- `kit-consumer` imports public UI from `@ai-readable/kit`.
- `library-native` imports only the locked native package and icon package.
- `custom-native` imports only the locked local package, workspace entry, or project source entry.

The selected contract must match `foundations/catalog.json`, registered adapters, and the referenced design-pack SHA-256 before the generator writes files.

## Kit-consumer migration rule

Keep public component names and props stable:

```tsx
import { Button, DataGrid, PageHeader } from "@ai-readable/kit";
```

When a third-party library is introduced, wrap it behind the existing kit component API:

```tsx
// src/components/Button.tsx
// internal implementation can use antd/shadcn here
export function Button(props: ButtonProps) {
  return <InternalButton {...mapButtonProps(props)} />;
}
```

Do not expose `antd`, `@radix-ui/*`, or `@/components/ui/*` imports in `kit-consumer` output. Native modes may use those roots only when the project contract selects them.

## Ant Design v6 adapter

`antd-theme.ts` enables antd v6 CSS variables through `ConfigProvider`. The runtime bridge in `src/styles.css` maps kit semantics onto the generated variables so `vivid` and `calm` can switch without rebuilding the antd theme.

| Kit semantic variable | antd CSS variable |
| --- | --- |
| `--color-brand-primary` | `--rd-ant-color-primary` |
| `--color-brand-primary-strong` | `--rd-ant-color-primary-hover` / `--rd-ant-color-primary-active` |
| `--color-status-success` | `--rd-ant-color-success` |
| `--color-status-warning` | `--rd-ant-color-warning` |
| `--color-status-danger` | `--rd-ant-color-error` |
| `--color-status-info` | `--rd-ant-color-info` |
| `--color-bg-surface` | `--rd-ant-color-bg-container` / `--rd-ant-color-bg-elevated` |
| `--color-text-primary` | `--rd-ant-color-text` / `--rd-ant-color-text-heading` |
| `--color-text-secondary` | `--rd-ant-color-text-secondary` |
| `--color-border` | `--rd-ant-color-border` |
| `--radius-control` | `--rd-ant-border-radius` / `--rd-ant-border-radius-sm` |

Do not pass unresolved CSS variables into antd seed color tokens. Its JavaScript derivative-color step treats them as invalid colors and collapses status palettes to black.

Portal-based components must keep their popup container inside the nearest `.rd-root`. Moving a popup to `document.body` drops the kit theme-variable bridge and can make vivid/calm colors diverge.

The migration keeps `@ai-readable/kit` component names, props, and `rd-*` classes stable while replacing internal implementations in small batches.
