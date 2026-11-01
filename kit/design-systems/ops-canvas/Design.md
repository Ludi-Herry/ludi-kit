# Ops Canvas Design System

## Purpose

Ops Canvas is a minimal operations-workspace system for dispatch, monitoring, and review tasks. It favors fast scanning, explicit state, and stable density across long work sessions.

## Foundations

### Color

- Brand blue identifies the single primary action and current navigation context.
- Neutral surfaces separate page, panel, and elevated content layers.
- Success, warning, danger, and information colors communicate status; labels remain visible so color never carries meaning alone.
- Light and dark themes share semantic token names. Components never choose primitive colors directly.

### Typography

- The system font stack keeps Windows and macOS rendering predictable.
- `display`, `title`, `body`, and `caption` form the complete type ramp.
- Operational numbers use tabular numerals where comparison speed matters.

### Spacing, radius, and shadow

- Spacing follows a 4px base grid: 4, 8, 12, 16, 24, 32, and 48.
- Radius uses 6px for controls, 10px for cards, and 14px for major panels.
- Shadows distinguish elevation only. Borders preserve structure in both themes.

### Layout

- The page shell has a 240px navigation rail and a fluid content column.
- Content width is capped at 1440px with 24px desktop gutters.
- Responsive layouts collapse the rail below 900px and preserve page-level horizontal fit.

### Motion

- Motion uses shared `--motion-*` tokens. Hover and theme transitions stay within 150–250ms.
- `prefers-reduced-motion: reduce` removes transforms and shortens transitions to 1ms.

## Components

### Base components

- `Button`: primary, secondary, and danger hierarchy; one primary action per task region.
- `Badge`: status label with text and semantic color.
- `Input`: label, helper/error slot, and visible focus treatment.
- `Card`: grouped content surface with optional header action.

### Composite components

- `MetricCard`: label, value, delta, and context for operational scanning.
- `FilterBar`: keyword and status controls followed by explicit apply/reset actions.
- `WorkOrderTable`: dense record list with stable columns and status labels.

### Page shell

- `OpsShell`: navigation, product header, theme switch, and main content region.
- Shell structure, tokens, and components are demonstrated in `spec/index.html`.

## Figma synchronization

`figma/sync.contract.json` defines the target variable collections, Auto Layout structure, component sets, and readback requirements. Live `fileKey`, `nodeId`, and capture identifiers remain `null` until a real authorized file is supplied. Local source names and intended Figma names are stable contracts; invented identifiers are forbidden.
