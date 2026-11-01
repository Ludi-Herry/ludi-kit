# Golden template: query and operations list

## Use when

Use when users find, compare, select, and act on records that share a schema. Choose a standard list or card list when objects are narrative, image-led, or structurally different. Choose a data-grid solution only when spreadsheet-like cell editing or very large virtualized navigation is the product's main task.

## Required inputs

- Record identity and stable `rowKey`
- Column priority, type, expected content length, and sort/filter behavior
- High-frequency and advanced filters
- Page, batch, and row actions with permission rules
- Pagination, selection persistence, export scope, and freshness semantics
- Loading, filtered-empty, first-use, stale, error, and permission behavior

## Desktop structure

1. Page header: title, scope description, primary creation action, and low-frequency page actions.
2. Query region: 3–4 high-frequency filters visible at 1200 px; extra filters collapse under 更多筛选. Query and Reset finish the reading order.
3. Applied-query summary: show active advanced filters when their values are hidden by collapse.
4. Toolbar: result count and selected count at the start; batch actions and view/export controls at the end.
5. Table: one identity column, prioritized business columns, status, update time, and action column.
6. Pagination: total/range at the start and page controls at the end when space allows.

Use 16 px between query groups and result regions; use 8 px within action groups. A bordered query surface is allowed when it improves separation. The table may share the same section surface and should not receive another decorative Card wrapper.

## Column contract

- Selection: 48 px; index: 64 px.
- Identity: minimum 160 px, flexible, ellipsis plus full-value access.
- Short ID/code: 120–160 px; copy action for frequent use.
- Status: 96–120 px with one Tag/Badge semantic mapping.
- Date/time: 160–184 px; use one timezone and format.
- Numeric: 96–120 px, right-aligned, shared precision and unit.
- Actions: 120–200 px; expose at most two actions, then Dropdown.
- Assign every column a responsive priority before enabling horizontal scroll.

## Component decisions

- `Form`, `Input`, `Select`, `DatePicker`, `TreeSelect`, `Button`, `Dropdown`, `Table`, `Pagination`, `Tag`, `Badge`, `Tooltip`, `Popconfirm`, `Modal`, `Drawer`, `Empty`, `Skeleton`, `Spin`, `Alert`
- Use Table `size="medium"` by default. Use small only for expert density with at least 12 visible rows.
- Use `scroll={{ x: "max-content" }}` only after low-priority columns have responsive behavior.
- Fix identity and action columns only when their combined width leaves useful data visible.
- Store query, sort, and page state in the URL when the view must be shared or restored.

## Filter behavior

- Query runs on explicit submit for expensive remote lists; debounced live search is acceptable for fast suggestion/filter experiences.
- Reset restores the documented default scope and page 1.
- A filter/sort change normally returns to page 1.
- Collapsed filters keep active values visible through chips, a summary, or an active count.
- Empty text distinguishes no records from no matches; no-match offers 清空筛选.

## Selection and action lifecycle

- Selection uses stable keys and shows selected count.
- Define whether selection survives page changes; default to current page only for destructive actions.
- Bulk actions name scope and consequence, confirm destructive impact, lock duplicate submission, refresh affected rows, then clear selection.
- Row edits use Drawer when list context matters; quick reversible actions may use Popconfirm; broad tasks navigate to a page.
- Permission-disabled actions provide a reason and request path when useful.

## Responsive rules

- `<1200`: two filter columns; hide low-priority table columns.
- `<768`: one filter column; keep identity, status, and one action; secondary actions move to Dropdown.
- `<576`: use simple Pagination and full-width Drawer/Modal surfaces.
- Horizontal scrolling belongs to the table container; the page has no horizontal overflow.

## Acceptance checklist

- [ ] Column widths, alignment, priority, ellipsis, and full-value access are defined.
- [ ] Filter collapse preserves awareness of active hidden filters.
- [ ] Row, batch, and page actions have distinct scope.
- [ ] Selection, pagination, sort, and filter transitions are specified.
- [ ] First load, refresh, empty, no-match, stale, error, and permission states are distinct.
- [ ] 1440, 1024, 768, and 390 px layouts have no page overflow.
