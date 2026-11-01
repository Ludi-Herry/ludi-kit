# Content version Layout v0

## Goal

Create the first reviewable layout for `/content/version` through the `existing` route. The page stays inside the TianShu Ant Design 6.5.0 foundation and keeps every Image2, Figma, private-input, and historical-evidence lock closed.

## Structure and ownership

- `project-description.json`: page-local generator input derived from the TianShu PRD.
- `../generated/content-version/`: repository-generator output and the Layout v0 source.
- `../workflow/content-version-existing/`: request, frozen source receipts, and route-local evidence.
- `../evidence/content-version.metrics.json`: page-local effort counters with no central KPI binding.

## Layout completion checks

- Stable application route: `/tianshu/content/version`.
- Locked list-page regions: page shell, page header, filter region, and data region.
- No page-level create action because versions are system-generated.
- Desktop layout shows three primary filters, one advanced status filter, and a dense version-history table.
- Narrow layouts stack filters and keep horizontal scrolling inside the table surface.
- Details, field diff, rollback mutation, and complete state behavior remain outside Layout v0.

## Reference decisions

- Contentful: select a historical version before comparison with the current version.
- Sanity: align compared fields in two panels under a shared version selector.
- Webflow: preview before restore and preserve the current state before a rollback.

## Deviations

- Browser CDP inspection was skipped because the active global policy forbids port enumeration. Public official documentation and screenshots supplied the reference evidence.
- `design-systems/business-v3/figma/sync.contract.json` records the read-only Figma boundary only. TianShu `business-context.json`, `native-theme.ts`, and the AntD knowledge pack remain the implementation authorities.
- The first generator attempt stopped before output because both Tag columns lacked explicit color maps. The page-local description now freezes neutral change-type tags and semantic version-state tags before retrying generation.
- The repository generator supplied generation knowledge and a deterministic starter. The Layout v0 then replaces the generic standalone shell with TianShu's existing PageLayout, PageHeader, FilterPanel, DataSection, table mapping, theme, navigation, and history route.
- The first project-contract validation found that app-layer page merging does not satisfy canonical generated-page discovery. The content-version module now joins `generatedProjectPages` in `generated/pages.tsx`; the validator and schema remain unchanged.
- The validator also requires the page ID as a literal page-plan object, so the canonical plan now mirrors `pages.json` while the component remains isolated in `generated/content-version/pages.tsx`.
- The first Playwright run preserved a real failure caused by the preview's missing favicon request. A local data-URL favicon removes the 404 without adding an asset or external request; the failed JSON and four screenshots remain under `browser.layout-v0.failed-01.json` and `screenshots/failed-01/`.
- The first full-page Playwright run preserved three failures: a real 14px mobile fixed-column overlap plus two assertions sampled before Modal close animation completed. The action column now fits the mobile width; the final runner waits for both overlays to become hidden before checking focus.
- AntD expands the two remaining mobile columns to fill the table, so reducing the fixed action width alone left the overlap unchanged. The complete action column is now hidden at `xs`; the clickable version number remains the mobile details entry, and actions return from `sm` upward.

## Layout v0 result

- The canonical TianShu route is `/tianshu/content/version` with an active content-navigation item.
- The layout uses PageHeader, FilterPanel, DataSection, responsive table columns, semantic version-state badges, and a disabled compare action before version selection.
- Browser and Playwright checks cover 1440×1100, 1024×900, and 390×844 with zero page overflow, zero fixed-column overlap, and clean console/page/request diagnostics.
- Two internal visual rework cycles corrected desktop column budgeting and responsive fixed-column behavior. Human review remains pending before Module work begins.

## Final page result

- Layout review passed, then Module and Details added real filtering, reset, refresh, scoped CSV export, version selection, details, field diff, permission handling, and local rollback state transitions.
- Rollback fails closed until the operator supplies a meaningful reason and checks the impact acknowledgement. Cancel returns focus to its trigger; success returns focus to Refresh after closing both overlays.
- Final Playwright evidence covers desktop, tablet, mobile, details, Diff, rollback validation and result, export bytes, permission, and loading/empty/error/stale states.
- Two failed final evidence runs remain preserved. The first found a mobile fixed-column overlap and early overlay assertions; the second retained only the overlap. The final run passes seven checks with ten screenshots and zero runtime issues.
- Motion review found only two token-bound CSS transitions plus the reduced-motion override. Drawer and Modal use Ant Design's established state motion, with no added motion dependency or decorative choreography.
- Canonical `npm run validate` exited 1 after 60.711 seconds in blind-protocol N15. The negative fixture stopped because its temporary preview did not become ready within 10 seconds, so it failed before the expected empty-step assertion. The test-owned temporary evidence path was already gone at exact-path readback; the agent did not run cleanup. Staging and commit remain closed.

## Closeout 2026-08-21

- The authorized controlled recheck ran `npm run test:blind-protocol-v1.2` first. It passed with exit 0 in 54.130 seconds; complete stdout, stderr, hashes, and timing are preserved under `workflow/content-version-existing/validation/controlled-recheck-01/`.
- The conditional `npm run validate` recheck then exited 1 in 61.834 seconds at the same N15 preview-readiness boundary. Its complete logs and result record are preserved under `workflow/content-version-existing/validation/full-validate-recheck-01/`; the first failure record remains unchanged.
- Read-only diagnosis reproduced successful blind runs with the adjacent same-artifact suite and with an outer npm lifecycle. Runtime observation confirmed `taskkill` removed each preview PID, while Node delivered final `exit` and `close` events 2.2 to 3.9 seconds later. The underlying intermittent preview startup delay remains unconfirmed because the runner hides preview output behind the final fetch error and the test removes its temporary root.
- Harness instrumentation or repair is a separate infrastructure task. This page task closes with `run.final.json` status `failed`, no staged files, no commit, and no push. Image2, reference, candidate, Reviewer, private input, historical evidence, and Figma target `YOUR_NODE_ID` remain locked.

## User review rework 2026-08-21

- The user explicitly rejected the Drawer, Modal, and expanded advanced-filter presentation. Five user screenshots and the qualitative verdict are preserved under `visual.user-review.rejected-01.json`; `humanReviewMinutes` remains `null` because no real duration was provided. The page-local rework counter advanced to `6`.
- The shared TianShu spacing and color variables live on `.tianshu-shell`, while Ant Design rendered Drawer and Modal portals under `body`. Live DOM inspection confirmed the overlays were outside the shell: `--spacing-md` and `--color-border` were empty, the snapshot border computed to `0px`, and its background was transparent.
- All four overlays now portal into `.tianshu-shell`. Detail uses bordered overview metadata plus a structured read-only snapshot. Diff uses separate comparison-condition and field-difference sections. Export and rollback Modals share explicit header, body, footer, alert, form, and action spacing. The expanded desktop filter places the version-status field beside the action region on a continuous three-column grid.
- The final browser runner now asserts overlay token inheritance, section structure, body/footer padding, advanced-filter geometry, and the responsive control-overlap gate. It also captures the export Modal and expanded advanced-filter states. The latest result is `passed / 7 checks / 12 screenshots / 0 failures`.
- Pre-review gates passed after the rework: targeted ES2020 typecheck `0 / 2.386s`; Ant Design project lint `0 / 3.454s`; project validation `0 / 0.364s`; production build `0 / 27.417s`; Browser/Playwright `0 / 12.211s`. The production build retains the existing Vite chunk-size warning. `run.final.json` remains `failed` until a fresh user acceptance and the required final canonical validation.

## Accepted review and canonical validation stop

- The user accepted the reworked page and reported 5 minutes of active visual review. The exact browser evidence and 12 screenshot bytes viewed by the user are frozen under `browser.user-accepted-01.json`, `screenshots/user-accepted-01/`, and `visual.user-review.accepted-01.json`. The earlier rejection remains unchanged.
- `validation/final-closeout-01/` preserved the first accepted-state canonical run. Six required gates passed; full `npm run validate` exited 1 because the newly registered page lacked central technical and visual acceptance entries.
- The technical and visual ledgers now contain the 17th TianShu page. `validation/final-closeout-02/` preserved the next full run, which exited 1 at the existing feedback hash bindings. The current visual binding is receipted in `content-version-feedback-rebind-2026-08-21.json`, and the `pages.json` transition is append-only in `quality/feedback-implementation-revisions.json`; feedback unit and live validators pass.
- `validation/final-closeout-03/` preserved the third full run. It passed N15, page acceptance, component status, Figma validation, feedback validation, workflow validation, project-generator determinism, and the early Image2 gates. It then exited 1 in `test:image2-golden-holdout-freeze`: Golden 3's historical input receipt binds the complete `projects/tianshu-ops/pages.json` byte count from 2026-08-09, while the accepted page must add `content-version` to that same current authority file.
- The Golden freeze validator reads the live file and has no authorized successor path for this receipt. Removing the page from `pages.json` fails current project/page parity; adding an Image2 receipt successor or changing the historical validator would reopen a trigger-only workflow and cross the explicit frozen-evidence boundary. No such expansion was authorized. `run.final.json` stays `failed`; staging, page commit, Phase 1 status updates, and cleanup remain closed.
- A semantic comparison against `main@f43a5c6` found and removed one unrelated `production-sn-cert.nextPages` drift. The remaining `pages.json` change keeps all 16 historical page objects byte-semantic equal, removes none, and adds only `content-version`. Project validation, 17-page acceptance, feedback validator tests, and live feedback validation pass in this narrowed state.
- The same frozen `pages.json` receipt appears in four Image2 contracts: Golden allocation, final-fresh candidate inventory, final-fresh preimplementation freeze, and iteration-12 preimplementation freeze. At least three active validators consume those contracts. A compliant successor therefore changes multiple locked validator paths and cannot be treated as an implicit page-only repair; explicit boundary authorization remains required.

## Phase 1 final closeout

- The N15 infrastructure task confirmed an asynchronous shutdown race: `taskkill` returned before Node delivered the preview child `close` event and drained stdio, so adjacent fixtures could overlap. The runner now waits for closure with a bounded 5-second shutdown deadline, records lifecycle diagnostics, and preserves the temporary failure root. The clean worktree passed the regression, three consecutive blind-protocol runs, and full validation; canonical commit `f43a5c6` contains the harness fix.
- The user authorized an append-only successor for the accepted page, then narrowed the implementation to the repository's receipt-revision pattern. The final revision proves the old `pages.json`, `flows.json`, and shared generated-page receipts from `main@f43a5c6`; it proves that `content-version` is the sole page addition and that the content flow receives one appended step and one appended success criterion. Current TypeScript output and validator hashes are deliberately unpinned; project-generator, production build, targeted validator tests, harness contracts, and full validation own current correctness.
- `final-closeout-04` preserves the next real repository failure: the shared generated registry mounted `content-version` outside the required `pageById` JSX contract. The page now exports `ContentVersionPage`, while the canonical registry wraps it in `TianshuContentVersionPage` and mounts `pageById["content-version"]`. The targeted harness suite then passed 89 harness cases, 9 bundle cases, all chart checks, and 7 interaction tests.
- Final page gates passed after that repair: targeted ES2020 typecheck `0 / 4.199s`; Ant Design project lint `0 / 4.326s`; project validation `0 / 0.913s`; feedback tests `0 / 1.512s`; feedback validation `0 / 0.995s`; 17-page acceptance `0 / 0.919s`; project-generator suite `0 / 30.122s`; production build `0 / 17.990s`; Browser/Playwright `0 / 15.879s`; blind protocol v1.2 `0 / 46.136s`; harness contracts `0 / 105.300s`.
- The final canonical `npm run validate` exited `0` in `736.233s`. Its chain passed N15, generator determinism, all frozen Image2 verdicts, calibration, visual-diff, harness/import contracts, AntD lint, synthetic matrices, and failure attribution. The condensed command ledger and result are under `validation/final-closeout-05/`.
- The accepted human ledger remains `humanReviewMinutes=5`, `manualCorrectionMinutes=0`, `clarificationCount=1`, and `reworkCycles=6`. The workflow status is `external-blocked` solely because Figma `YOUR_FIGMA_FILE_KEY / YOUR_NODE_ID` remains locked; no Figma write or push was attempted.
