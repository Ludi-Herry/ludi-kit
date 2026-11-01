# Feedback Review Queue

This folder captures issues found after page generation and routes them into a reviewed promotion path.

## Files

- `queue.json`: concrete findings from generated pages, QA, harness, or manual edits.
- `promotion-rules.json`: gates for promoting a finding into a rule, component, token, page plan, or demo.
- `promotions/`: generated draft plans for accepted or promoted findings. These are review artifacts, not automatic source edits.
- `promotions/applications/`: dry-run application plans and patch previews for accepted or promoted drafts.

## Review Flow

1. Add a feedback item with evidence, page context, proposed change, and acceptance checks.
2. Keep status as `queued` until a reviewer accepts the target and destination.
3. Promote only after the item has evidence and a matching promotion rule.
4. Run `npm run generate:promotions` to create a draft plan for accepted or promoted items.
5. Run `npm run apply:promotion -- <feedback-id> --dry-run --write-plan` to create an apply preview.
6. Apply the reviewed destination change manually or through a follow-up patch.
7. After promotion, update the destination file and move status to `promoted`.
8. Run `npm run validate:feedback`, `npm run validate`, and the relevant harness scenario.

## QA Writeback Record

Before changing generated output, record:

- finding category: requirement, page intent, flow, sample data, rule/recipe, component/token, or implementation;
- authoritative input paths;
- generated output ownership: `generator-owned` or `human-maintained`;
- affected flow IDs and targeted validation commands;
- SHA-256 for the authoritative inputs and final implementation.

For `generator-owned` files, update the authoritative inputs and regenerate in the same change. For `human-maintained` generated files, preserve the ownership note and evidence. Flow changes also run the matching flow spec before the full `npm run validate`.

There is no generic machine gate yet. Add one only after a confirmed regeneration-loss defect provides a concrete failing case.

## Promotion Targets

- `rule`: update `rules/` or `recipes/` when the issue is reusable guidance.
- `component`: update `src/`, `components.manifest.json`, and examples when the component API should change.
- `token`: update token manifests or CSS variables when a visual decision repeats.
- `page`: update `projects/*/pages.json` or generated page planning.
- `demo`: save a stable generated page as an example for future agents.
