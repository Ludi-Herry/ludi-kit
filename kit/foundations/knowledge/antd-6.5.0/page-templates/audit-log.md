# Golden template: audit and event log

## Use when

Use for immutable or append-only operational events where users investigate actor, action, object, result, and time. Use a normal list template for editable business records. Use a detail page for one event with extensive payload or evidence.

## Required inputs

- Event ID, timestamp precision/timezone, actor, source, action, object, result, and correlation ID
- Search and filter fields with retention limits
- Detail payload sensitivity and redaction rules
- Export scope, permission, watermark, and audit trail
- Live-update, stale, pagination, and retention-boundary behavior

## Desktop structure

1. Page header: log scope, retention statement, freshness/live status, export action when permitted.
2. Query region: time range first, then actor/source/action/result/object/correlation ID; advanced payload filters collapse.
3. Toolbar: result count, active filter summary, live/pause control when supported, export scope.
4. Table: time, actor, action, object, result, source/IP when permitted, correlation ID, detail action.
5. Detail Drawer: human summary first, structured metadata second, raw payload last with redaction and copy controls.
6. Pagination and retention boundary notice.

Use medium table density by default and small only for expert investigation views. Keep the query and table on one page surface. Export stays secondary and never exports fields outside the current permission contract.

## Column contract

- Time: 184 px, consistent timezone and precision, default descending.
- Actor: 144–184 px; distinguish human, service, and unknown.
- Action: 160–220 px, stable verb-object taxonomy.
- Object: flexible minimum 200 px with type and identifier.
- Result: 96–120 px Tag using success/warning/error/default semantics.
- Source/IP: 144–180 px and masked when policy requires.
- Correlation ID: 160–220 px, monospace/copyable, full value accessible.
- Detail action: 80–96 px.

## Component decisions

- `Form`, `DatePicker`, `Input`, `Select`, `Button`, `Dropdown`, `Table`, `Pagination`, `Tag`, `Badge`, `Drawer`, `Descriptions`, `Alert`, `Tooltip`, `Skeleton`, `Spin`, `Empty`
- Keep sort/filter/page state in the URL for reproducible investigations.
- Use Drawer for one-event details so query context and selected row remain visible.
- Raw JSON or diff content uses a dedicated scroll region and never expands every row.
- Export names record count, time range, fields, file format, and asynchronous delivery path.

## State lifecycle

- First load: table-row skeleton and visible query defaults.
- Live mode: announce new-event count without shifting the row under the user's pointer; allow pause and manual merge.
- Stale: show last received time and reconnect/refresh.
- Filtered empty: preserve query and offer reset.
- Retention boundary: explain that older data is unavailable and link to policy or archive path.
- Detail failure: keep the row and show retry inside the Drawer.
- Export: requested, preparing with progress/status, ready, expired, or failed with retry.

## Responsive rules

- `<1200`: hide source/IP and correlation columns by priority; keep access in detail.
- `<768`: keep time, actor/object summary, result, and detail action; filters become one column.
- Table owns horizontal scroll; page overflow remains zero.
- Drawer becomes full width below 576 px and keeps summary before raw payload.

## Security and content rules

- Log events are immutable in the UI. Corrections append a new event.
- Redaction happens before rendering, copying, and export.
- Technical exceptions get a user-readable summary plus a restricted diagnostic detail.
- Timezone appears in the header or filter and remains consistent across table, detail, and export.

## Acceptance checklist

- [ ] Actor, action, object, result, time, and correlation can be found and compared.
- [ ] Retention, timezone, redaction, export scope, and permission are explicit.
- [ ] Live updates never steal position or selection.
- [ ] Detail Drawer separates summary, metadata, and raw payload.
- [ ] Query state can be restored and shared within permission boundaries.
- [ ] 1440, 1024, 768, and 390 px layouts preserve investigation flow.
