# Golden template: object detail

## Use when

Use to understand one object, its current state, related records, and available actions. Start with a flat basic detail when content is small and closely related. Add sections, Tabs, or Steps only as complexity and weak correlation increase.

## Required inputs

- Object identity, state, ownership, and freshness
- Primary and secondary object actions with permission and consequence
- Information groups ordered by decision value
- Related records, history, files, and workflow stages
- Edit route: inline, Drawer, Modal, or full page
- Loading, missing-object, stale, partial-error, and permission behavior

## Desktop structure

1. Object header: back/breadcrumb, title and stable ID, primary status, metadata, and actions.
2. Key facts: 6–12 high-value Descriptions items; status and ownership appear first.
3. Related sections: one topic per section, using spacing/dividers before Card.
4. Related tables or timelines: show a concise preview and link to full history when volume grows.
5. Audit/footer metadata: created/updated time, source, version, and trace identifiers when relevant.

Use 24 px between topics and 8–16 px inside a fact group. Keep the object title outside content cards. Keep one primary action; group peer secondary actions in Dropdown. Destructive actions stay visually separated.

## Complexity routing

- Low: one Descriptions group plus optional related list.
- Medium: 2–4 vertical sections separated by heading and Divider or distinct Card topics.
- High: Tabs organize peer domains such as 基本信息, 关联设备, 变更记录. Keep the object header shared.
- Ordered process: Steps or Timeline shows stages/events; the actionable current stage stays in the main content.
- Long edit: navigate to a page. Contextual edit: Drawer. Short focused change: Modal.

## Component decisions

- `Descriptions`, `Tag`, `Badge`, `Button`, `Dropdown`, `Tabs`, `Steps`, `Table`, `Alert`, `Drawer`, `Modal`, `Popconfirm`, `Tooltip`, `Skeleton`, `Spin`, `Empty`
- Descriptions uses one column below 576 px, two from 768 px, and up to three at 1200 px.
- Long remarks and logs get their own full-width row or section.
- IDs remain full, selectable, and copyable; visual ellipsis always has full-value access.
- Tabs belong below the shared object header and support direct links when users return to a specific view.

## State lifecycle

- First load: stable page shell plus header and section skeletons.
- Missing object: full-page Result with return/search path.
- Partial error: preserve available facts and show local retry in the failed section.
- Stale object: show last updated time and refresh; prevent unsafe edits when freshness is required.
- Edit success: update the visible facts, announce completion, and return focus to the action trigger.
- Permission: omit sensitive sections; explain unavailable visible actions.

## Responsive rules

- Header actions wrap below identity at `<768`; primary stays visible, secondary moves to Dropdown.
- Descriptions reflows by column count; tables define local overflow.
- Tabs may scroll horizontally with edge affordances; keep labels readable.
- A detail page keeps one vertical reading path at 390 px.

## Content rules

- Title uses the recognizable object name; show technical ID separately.
- Labels are concise nouns; unknown is 未知, absent optional data is —, failed retrieval states the failure.
- Status copy names the lifecycle state and may add reason/time nearby.
- History entries use actor, action, object, result, and time in a stable order.

## Acceptance checklist

- [ ] Users can identify object, status, owner, and next action in the first viewport.
- [ ] Section boundaries follow information relation and complexity.
- [ ] Edit surface matches task duration and context needs.
- [ ] Missing, stale, partial-error, and permission states are defined.
- [ ] Card nesting and duplicated page/object headers are absent.
- [ ] 1440, 1024, 768, and 390 px layouts preserve the same information hierarchy.
