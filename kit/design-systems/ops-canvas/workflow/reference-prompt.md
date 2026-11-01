# Ops Canvas reference prompt

## Provenance

- Route: `existing`
- Frozen contract SHA-256: `fc6ce9c1c45d4b2c15609a37af29a9679cec4ab8a35cc42598a050d8927895fd`
- Use case: `ui-mockup`
- Intended consumer: built-in `imagegen` in host-native mode, then `Image-to-html`

## Recommended generation parameters

- Model intent: `gpt-image-2`
- Target canvas: `1440x1100`
- Quality intent: `high`
- Variants: `1`
- Background: opaque
- Output format intent: PNG

## Prompt

```text
Use case: ui-mockup
Asset type: shippable desktop web UI reference for deterministic Image-to-html reconstruction

Primary request: Create one complete 1440×1100 straight-on screenshot of “Ops Canvas — Design System Specification” for operations product designers and frontend engineers. Fit the entire specification canvas inside this single image. Present a realistic production interface with compact, scan-first density for dispatch, monitoring, and review.

Composition and regions: Use a fixed 240px left navigation rail, a 64px product header, and a fluid main content region with 24px gutters. The rail contains “Ops Canvas”, “Specification 1.0”, navigation labels “Overview”, “Foundations”, “Base components”, “Composite components”, “Page shell”, plus “Local contract ready” and “Figma sync external-blocked”. The header contains “DESIGN SYSTEM / OPS WORKSPACES”, “Clear decisions at operational speed.”, and a compact “Dark theme” control.

Main canvas: Start with a concise overview panel titled “One compact language for dispatch, monitoring, and review.” with buttons “Browse components” and “View page shell”, plus “42 semantic tokens”, “08 component contracts”, and “02 theme modes”. Follow with compact sections for “Foundations”, “Base components”, “Composite components”, and “Page shell contract”. Foundations shows Brand #1769E0, Success #16865A, Warning #B36500, Danger #C63838, a clear type ramp, and 4px-grid spacing and shape samples. Base components visibly demonstrates Button, Badge, Input, and Card with exact labels “Create order”, “Export”, “Cancel”, “On track”, “At risk”, “Blocked”, “Review”, “Work order owner”, and “Mina Santos”. Avoid nested cards.

Composite components: Show three MetricCard examples: “Open work orders / 128 / +12 today”, “Within SLA / 96.4% / +1.8%”, and “Needs review / 14 / −3 today”. Add a FilterBar with “Keyword”, “Status”, “Apply filters”, “Reset”, and “4 results”. Add a readable WorkOrderTable with columns “Order”, “Site”, “Owner”, “Status”, “SLA” and four compact rows: WO-2048 / North Depot / Elena Park / In progress / 2h 14m; WO-2042 / Central Hub / Owen Li / Needs review / 38m; WO-2036 / West Annex / Mina Santos / Scheduled / Tomorrow; WO-2029 / South Plant / Jay Morgan / In progress / 4h 02m. Finish with a small shell diagram labeled “240 Navigation rail”, “Product header · 64”, “Fluid content region”, and “max 1440 · gutter 24”.

Visual system: Use the light theme semantic palette exactly: page #F4F7FB, surface #FFFFFF, elevated surface #F8FAFC, primary text #142033, secondary text #5D6B80, border #DCE3ED, and brand #1769E0. Use Inter or Segoe UI, tabular numerals, restrained borders and shadows, 6/10/14px radii, visible status text paired with semantic color, and a clear active navigation state.

Constraints: Render all quoted interface text verbatim and legibly. Preserve the component names OpsShell, Button, Badge, Input, Card, MetricCard, FilterBar, and WorkOrderTable through their visible UI roles. Keep one primary action per region, balanced whitespace, consistent alignment, and practical browser UI proportions.

Avoid: browser chrome, device mockups, perspective, photography, 3D effects, decorative gradients, glassmorphism, neon styling, excessive shadows, card-within-card composition, placeholder text, gibberish, cropped regions, scroll continuation, watermarks, logos, or extra navigation items.
```
