# Golden template: operational dashboard

## Use when

Use for a role-based workbench that answers three questions in the first viewport: what changed, what needs attention, and where the user should act next. Use an analytics report or list page when the primary task is deep comparison or record handling.

## Required inputs

- Audience and shift/task context
- 3–6 decision metrics with definitions and freshness
- Prioritized alerts or pending work
- One primary drill-down path per module
- Loading, empty, stale, partial-error, and permission behavior

## Desktop structure

1. Page header: title, one-sentence scope, last updated time, refresh; place one primary action only when the dashboard owns a creation task.
2. Attention band: one Alert for a page-wide condition or a compact queue of urgent items.
3. Metric row: 3–4 Statistic cards at `xl`, 2 at `sm`/`md`, 1 at `xs`; keep equal heights and comparable number formatting.
4. Primary analysis row: the most decision-relevant trend or distribution occupies 16/24 columns; the action queue occupies 8/24.
5. Secondary modules: operational tables, ranked lists, progress, or system health grouped by user goal.

Use a 24 px section gap and a 16 px grid gutter. Keep the first viewport to one attention band plus one metric row plus the start of the primary analysis row. A dashboard module gets a Card only when it owns a distinct topic, loading state, or drill-down.

## Component decisions

- `Card`, `Statistic`, `Row`, `Col`, `Alert`, `Badge`, `Tag`, `Table`, `Skeleton`, `Spin`, `Button`, `Dropdown`, `Tooltip`
- Show trends with a value, direction, comparison period, and plain-language meaning. Color supports direction and never carries it alone.
- Keep module actions in Card `extra`; keep page actions in the page header.
- Limit each module to one main visualization or table. Move detailed exploration to a report/list route.

## State lifecycle

- First load: render header and layout-matched card skeletons.
- Refresh: retain prior trustworthy values, mark the affected module busy, then update its timestamp.
- Partial failure: keep successful modules and show one local Alert with retry in the failed module.
- Stale data: show last successful update and a visible refresh path.
- Empty: explain whether the role has no assignments, the period has no data, or configuration is incomplete.
- Permission: remove inaccessible metrics when their existence is sensitive; otherwise show the boundary and request path.

## Responsive rules

- `<1200`: metric cards become two columns; primary analysis and queue may stack.
- `<768`: every module becomes one column; summaries stay above detail; secondary actions move into Dropdown.
- Charts and tables define their own overflow region. The page must keep `scrollWidth === clientWidth`.
- Preserve metric label, value, comparison period, and status before decorative detail.

## Content rules

- Metric label is a stable noun; value includes unit; comparison states the period, such as 较昨日.
- Alert copy gives current impact and next action.
- Queue rows start with the object and urgency, then owner/time, then one action.
- Use consistent precision across comparable metrics and right-align table numbers.

## Acceptance checklist

- [ ] First viewport answers status, priority, and next action.
- [ ] No more than one primary action appears in the page header.
- [ ] Every metric has definition, unit, freshness, and drill-down behavior.
- [ ] Module loading/error/empty states are independent.
- [ ] Card nesting is absent.
- [ ] 1440, 1024, 768, and 390 px layouts preserve reading order and have no page overflow.
