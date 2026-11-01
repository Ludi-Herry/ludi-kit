# Harness

The harness checks generated output against the selected project and frontend-foundation contracts before a page is accepted.

## Run

From `kit/`:

```powershell
npm run check:harness
```

The default suite checks expected components and page structure, import boundaries, hardcoded colors, status-copy bindings and registered anti-patterns. Reports are written under `harness/reports/`.

## Trust boundary

Scenario files are validated against `schema/harness-scenario.schema.json` before business output is read. Project, output, status-copy, build and report paths must remain inside their registered boundaries; linked escape targets fail closed.

The public runner executes the validation flow in a bounded Worker. TypeScript checks use the bundled compiler, a restricted read host and blocked writes. Timeout, memory exhaustion and abnormal Worker exits fail closed. Diagnostics are redacted and length-bounded before they enter reports.

## Installed-package use

Pass the host scenario and trusted project root explicitly:

```powershell
node ./node_modules/@ai-readable/kit/harness/runner/run-scenario.mjs --scenario ./harness/scenarios/smoke.json --project-root .
```

The scenario path resolves from the caller's working directory. Project-owned input and output paths resolve within `--project-root`; runner schemas and bundled checks resolve from the installed package. External scenarios require `--project-root`.

## References

- [Scenario field reference](./SCENARIO-REFERENCE.md)
- [Synthetic generation readiness](./SYNTHETIC-READINESS.md)
- Machine schema: `schema/harness-scenario.schema.json`
- Bundle budgets: `checks/bundle-budget.json`
- Current scripts: [`../package.json`](../package.json)

## Targeted checks

```powershell
node harness/tests/run-harness-tests.mjs
node harness/tests/run-bundle-tests.mjs
```

Use project-family scripts from `package.json` when a change only affects one registered product. A full release or new canonical validation record still uses `npm run validate`.

## Report contract

Reports describe detected deviations and retain the original failure. Machine-readable output stays free of decoration. Paths, IDs and URLs remain complete so the next command can reuse them.
