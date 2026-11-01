# Golden template: create or edit form

## Use when

Use for creating or editing one coherent object. Keep short forms on one page or in a compact Modal/Drawer. Use the step-flow template when stages have distinct prerequisites, reviewers, or save boundaries.

## Required inputs

- User goal and submission outcome
- Field type, required rule, source, format, default, dependency, and permission
- Section order and conditional visibility
- Draft, validation, submit, error, retry, cancel, and success behavior
- Dirty-state and navigation-loss policy
- Form surface: page, Drawer, or Modal

## Desktop structure

1. Page header: task title, object context, and one-sentence outcome.
2. Form content: 640–720 px primary column; section headings group 4–8 related fields.
3. Optional context rail: read-only guidance or preview at 8/24 columns; it never contains required inputs.
4. Footer: Cancel, optional Save draft, and outcome-specific primary submit.

Use vertical Form layout by default. A horizontal layout is acceptable for dense stable labels in expert admin settings. Use two columns only for short independent fields such as start/end or province/city. Keep dependent or error-prone fields in one column.

## Field decisions

- Input: short open text; width reflects expected value.
- InputNumber: quantities and numeric bounds; show unit.
- Select: known choices, search after 10 options.
- Radio: 2–5 frequent choices that benefit from visible comparison.
- Switch: immediate setting; Checkbox for values submitted with the form.
- DatePicker/RangePicker: explicit format, timezone, and boundary.
- TreeSelect: hierarchical domain with declared parent-child selection.
- Upload: visible file lifecycle; complex imports continue to preview/validate/commit.
- TextArea: long remarks with a real length rule when one exists.

## Validation and submission lifecycle

1. Explain unfamiliar format and constraints before failure.
2. Validate local required/format rules on blur or submit; validate dependencies when the source changes.
3. On submit failure, preserve values, focus the first invalid field, and keep a summary for complex forms.
4. While submitting, lock duplicate submit and unsafe dismissal; keep Cancel behavior explicit.
5. On server error, map field errors to fields and place global errors above the footer or affected section.
6. On success, reset only after persistence; navigate or close with confirmation feedback and focus restoration.
7. Dirty cancel or route leave follows one documented discard/save-draft rule.

## Component decisions

- `Form`, `Input`, `Select`, `DatePicker`, `TreeSelect`, `Switch`, `Upload`, `Button`, `Alert`, `Tooltip`, `Card`, `Modal`, `Drawer`, `Spin`
- Field labels remain visible; placeholder gives an example or expected input.
- Required marking and optional labeling use one project convention.
- Use `Form.Item` dependencies or `shouldUpdate` deliberately; avoid broad re-renders.
- In Modal/Drawer forms, use `destroyOnHidden` only when reopening must start clean.

## Responsive rules

- `<768`: all fields become one column; the context rail moves below or disappears when redundant.
- Sticky footer leaves room for the final validation message and safe-area inset.
- Modal keeps 16 px viewport margins; Drawer becomes full width below 576 px.
- Long option labels and upload rows wrap without hiding state or actions.

## Content rules

- Title names the outcome, such as 新建固件版本 or 编辑广告计划.
- Label is a stable noun. Help explains format, consequence, or source.
- Submit names the result: 创建版本, 保存修改, 提交审核.
- Error copy states the field/problem and recovery in user language.

## Acceptance checklist

- [ ] Every field has type, rule, default, dependency, permission, and error behavior.
- [ ] The form has at most two columns and a 640–720 px reading column.
- [ ] Submit, retry, dirty cancel, and success transitions preserve user work.
- [ ] Modal/Drawer/page choice follows task duration and context.
- [ ] Keyboard order, first-invalid focus, and screen-reader errors are verified.
- [ ] 1440, 768, and 390 px layouts keep labels, help, errors, and footer actions visible.
