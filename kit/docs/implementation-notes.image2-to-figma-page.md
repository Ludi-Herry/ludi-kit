# Implementation Notes — Workflow Foundation + image2-to-figma-page

Updated: 2026-07-19

## Completion criteria

- `workflows.manifest.json` contains exactly seven machine-readable workflows and passes its JSON Schema validator.
- `docs/PROJECT-STATUS.md` reports the same workflow IDs and completion states as the manifest.
- The PRD generator accepts an explicit compliant project description, produces a runnable React page skeleton, preserves current project validation/harness results, and rejects invalid input before writing output.
- The versioned `image2-to-figma-page` skill defines the `existing` and `exploratory` routes, their freeze gates, the shared image-to-code/verification/Figma stages, and fail-closed stop conditions.
- The visual diff runner works on Windows with Node.js, calculates RMS and SSIM, enforces global and critical-region thresholds, writes metrics and a heatmap, and exits non-zero for the intentional failure fixture.
- Figma evidence validates against a schema and never invents `fileKey`, `nodeId`, or `captureId`; missing external access is recorded as `external-blocked`.
- The minimal design-system example covers tokens, foundations, base/composite components, a page shell, `Design.md`, an HTML specification page, and a Figma sync/spec contract.
- Existing-route workflow harness, package validation, typecheck/build/lint/test, and browser/Playwright checks have reproducible evidence.
- An independent verifier checks specification coverage, commands, and evidence before closeout.

## Scope guard

- Do not change data-wall or map implementations.
- Do not add sample business pages or promote sandbox output.
- Do not modify secrets, CI/CD, deployment, or external Figma files.
- Do not lower thresholds, delete negative fixtures, or substitute static screenshots for interaction checks.

## Deviations

- The project-description schema hit three consecutive Ajv strict-compilation failures during the first generator bring-up. Failure 1 exposed a conditional subschema without an explicit object type. Failure 2 exposed a `required` key that strict mode could not resolve within the same conditional declaration. Failure 3 exposed nullable unions without `allowUnionTypes`. Generator-driven probing stopped at the three-attempt action-budget limit.
- The replacement path compiled `schema/project-description.schema.json` in isolation, corrected the schema contract, then ran the committed valid and invalid fixtures through the dedicated generator test. No further generation command is used to probe schema compilation.
- Final independent verification must cover: isolated strict schema compilation, the compliant field-service fixture, the wrong canonical seven-workflow set with a non-zero exit, and the generator's zero-write assertion for invalid input.
- A separate isolated compile of the new image2 request/run schemas also reached the three-attempt cap. Attempt 1 found `not/required` under strictRequired, attempt 2 found route-required properties absent from the local conditional declaration, and attempt 3 compiled the request schema then found `minItems` without an explicit array type in the run schema. The final type declaration was corrected without another implementation-thread compile. The independent verifier owns the next compile attempt and must report its raw result.
- `docs/PROJECT-STATUS.md` remained under the main integration task during the initial branch work. The Image2 closeout was applied there on 2026-07-17; `workflows.manifest.json` remains the machine-readable registry source and `workflows/PROJECT-STATUS-HANDOFF.md` records the integration distinction between registry and run status.

## External blockers

- The real visual pair fails the immutable pixel thresholds while independent semantic review accepts the reconstruction. The user approved `approve-semantic-exception-and-calibration`; the raw verdict and thresholds stay unchanged, and the authorized 24-pair study remains incomplete.
- No Figma MCP write/read tools or real target `fileKey` are available in this task. Online audit, capture, node creation, variable binding, and component reconstruction must stop at the adapter boundary and be recorded as `external-blocked`.

## Evidence log

- 2026-07-16: worktree started from detached `869280e`; branch `codex/image2-to-figma-page` created; initial worktree clean.
- 2026-07-16: Node `v24.14.1`, npm/npx `11.11.0`; `npx` prerequisite available; `kit/node_modules` absent before validation setup.
- 2026-07-16: `git merge main` fast-forwarded the branch to authoritative baseline `02a1e7c`; no conflicts. Baseline `npm run validate` passed after `npm ci`.
- 2026-07-16: canonical registry corrected to the seven IDs confirmed by the user. The wrong-set fixture replaces `figma-3d-situation-screen` with `design-implementation-audit` and must exit non-zero in direct validation.
- 2026-07-16: Browser and Playwright used the single URL `http://127.0.0.1:4177/`. Dark theme and `access + Needs review → WO-2042` interactions passed; final console reported zero errors and warnings. Screenshot hashes are stored in `design-systems/ops-canvas/workflow/browser-evidence.json`.
- 2026-07-16: visual diff fixtures produced pass exit 0, intentional threshold failure exit 1, and invalid/dimension exits 2 with the fixed global and region thresholds unchanged.
- 2026-07-16: the pre-generation Image2 checkpoint was archived. The 2026-07-17 entries below replace its stage status.
- 2026-07-16: the frozen-tree independent precheck is advisory only and cannot count as X2. It compiled all seven schemas under Ajv strict mode in one fresh command and passed the canonical wrong-set, placeholder rejection, zero-write harnesses, visual runner, design-system validation, and typecheck. It also found that `SKILL.md` used the prose label `capture ID` while the validator requires the contract field `captureId`, causing `npm run validate` to exit 1. The Skill now names the exact field, and the package script runs the validator before creating an archive.
- 2026-07-16: after the precheck remediation, the implementation thread passed `npm run validate`, `npm run check:harness`, `npm run check:dom`, `npm run build:preview`, `npm run build:starter`, `npm run check:package`, `npm run typecheck`, and `npm run package:image2-skill`. That checkpoint measured preview 695.18/700 KiB gzip and starter 278.71/320 KiB gzip; the 2026-07-17 closeout below records the next checkpoint. The installed package check covered 276 files and 73 manifest paths, and the validated deterministic Skill archive SHA-256 is `296f4d6c438c2c310e4ef05f274acfd1a119d9986422d05ada8941e2ed95cfa3`.
- 2026-07-17: the user confirmed the frozen-contract prompt. Host-native image generation produced a normalized 1440×1100 reference with SHA-256 `78f9dc58ac8cb91e9bda70649a3b0402f5b66bd4bc8df5cfdfd8e39cc505618d`; prompt, source, normalized image, and generator metadata are hash-bound in `reference-generation.evidence.json`.
- 2026-07-17: Image-to-html reconstruction mapped all eight Ops Canvas components and frozen semantic tokens. Browser and Playwright verified `access + Needs review → WO-2042` at the same 1440×1100 URL with zero console errors and warnings.
- 2026-07-17: the real visual comparison failed the unchanged gates. Full page measured SSIM `0.442871`, RMS `0.118726`, changed pixels `11.8380%`; the composite region measured `0.330025`, `0.127942`, `16.9103%`. The user approved the semantic exception and future calibration study; the raw visual gate remains failed and the study is `0/24`.
- 2026-07-17: `run-image2-workflow.mjs` now treats visual exit 1 as a valid failed comparison, writes an overall `failed` run with a failed visual stage, retains Figma `external-blocked`, and still exits 1. Invalid runner exits and invalid evidence remain zero-write failures; regression coverage verifies both paths.
- 2026-07-17: final repository validation and all 29 positive harness scenarios passed at score 100. Both consumers passed the unchanged bundle gates at preview `698.47/700 KiB` and starter `278.66/320 KiB`; the budget file has no Git diff.
- 2026-07-17: the approved TianShu exploratory prompt produced a normalized 1440×1100 reference with SHA-256 `9b91bc7ae84ee94b370d69b4fa6693f280d82ea67ebd062fee30d24c455e5deb`. Image-to-html reconstruction mapped the page to the public kit barrel and semantic tokens, then Browser and Playwright verified rollback cancellation and exact-row focus restoration with zero console errors and warnings.
- 2026-07-17: the TianShu raw comparison retained `failed`: full page SSIM `0.221048476439`, RMS `0.131127185738`, changed pixels `13.412184%`; critical region SSIM `0.057744872142`, RMS `0.139726577488`, changed pixels `16.917874%`. The separately recorded outcome is `accepted-with-semantic-exception`; thresholds and the raw verdict remain unchanged.
- 2026-07-17: installed-package verification passed with 395 files and 73 manifest paths. Strict NodeNext public imports, nested runner cross-cwd, raw Playwright log exclusion, and consecutive pack reproducibility passed; exact package digests live outside the tarball to avoid self-reference.
- 2026-07-19: the selectable frontend foundation migration retained both Image2 raw `failed` verdicts, approved semantic exceptions, fixed thresholds, `external-blocked` Figma stages, and `null` external IDs. Current package acceptance passed with 487 files / 90 manifest paths; preview and starter passed at 689.88 / 278.83 KiB gzip against the unchanged 700 / 320 KiB gates.
