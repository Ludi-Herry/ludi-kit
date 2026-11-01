# Golden template: staged workflow

## Use when

Use when a task has 3–7 ordered stages with separate validation, persistence, ownership, or review. A long form with arbitrary visual sections stays a form page. A historical sequence uses Timeline.

## Required inputs

- Stage names, order, owners, prerequisites, and completion rules
- Data saved at each stage and resume behavior
- Forward, backward, skip, retry, cancel, and final-submit permissions
- Error and rollback behavior per stage
- Summary of irreversible decisions before final submission

## Desktop structure

1. Page header: workflow object, purpose, overall state, save/freshness status.
2. Steps indicator: 3–7 concise titles; optional descriptions show owner or state, not instructions.
3. Current-stage content: one visible stage heading, instructions, fields/data, and local validation.
4. Context summary: completed choices or object facts when they prevent mistakes.
5. Footer: Previous, Save draft when valid, Next or final outcome action.

Use 24 px between indicator, content, and footer. Keep one primary action. Future stages stay unavailable until prerequisites pass unless the business explicitly supports free navigation.

## Component decisions

- `Steps`, `Form`, `Descriptions`, `Table`, `Upload`, `Alert`, `Button`, `Modal`, `Drawer`, `Spin`, `Tag`, `Tooltip`
- Current status derives from workflow truth; visual state does not invent completion.
- Validate the current step before advancing. Keep completed data available for review when policy allows.
- Use Drawer for contextual sub-editing and Modal for short confirmation. A nested workflow gets its own route.

## Lifecycle

- Draft: save partial valid data and show last saved time.
- Current: owns validation and pending state.
- Error: marks the stage, keeps values, and states recovery.
- Completed: records who completed it and when when accountability matters.
- Final submission: shows processing, prevents duplicate submit, and has a durable success/failed outcome.
- Resume: returns to the first incomplete or failed stage with preserved data.
- Rollback: names affected downstream stages and requires explicit permission/confirmation.

## Responsive rules

- `<768`: use a vertical or compact Steps layout; instructions stay in stage content.
- Footer actions wrap with Previous first and primary outcome last.
- Large tables or previews move below the main form and own local overflow.
- At 390 px, show current step number and title even if other labels collapse.

## Content rules

- Stage title is a short task state, such as 基本信息, 上传文件, 校验预览, 提交发布.
- Button text names transition outcome: 下一步：校验预览 is allowed when ambiguity exists.
- Error copy identifies stage, retained work, and retry path.
- Final summary repeats scope, impact, schedule, and irreversible choices.

## Acceptance checklist

- [ ] Every stage has entry, completion, persistence, and error rules.
- [ ] Back, skip, resume, cancel, and rollback policies are explicit.
- [ ] Future stages cannot bypass prerequisites accidentally.
- [ ] Final submission has summary, duplicate lock, durable outcome, and recovery.
- [ ] 1440, 768, and 390 px layouts preserve current stage and footer actions.
