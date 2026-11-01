import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_WORKER_RESOURCE_LIMITS,
  DEFAULT_WORKER_TIMEOUT_MS,
  runBoundedWorker
} from "../runner/bounded-worker.mjs";

const root = process.cwd();
const runner = resolve(root, "harness/runner/run-scenario.mjs");
const boundedWorkerFixture = new URL("./fixtures/bounded-worker-fixture.mjs", import.meta.url);
const kitManifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

assert.deepEqual(kitManifest.harness.execution, {
  isolation: "worker-thread",
  timeoutMs: DEFAULT_WORKER_TIMEOUT_MS,
  maxOldGenerationSizeMb: DEFAULT_WORKER_RESOURCE_LIMITS.maxOldGenerationSizeMb
});
console.log("PASS bounded worker limits match the kit manifest");

const normalWorker = await runBoundedWorker({
  workerUrl: boundedWorkerFixture,
  workerData: { mode: "normal" },
  timeoutMs: 1_000,
  resourceLimits: { maxOldGenerationSizeMb: 64 },
  stdout: null,
  stderr: null
});
assert.deepEqual(
  { kind: normalWorker.kind, exitCode: normalWorker.exitCode },
  { kind: "completed", exitCode: 0 }
);
console.log("PASS bounded worker normal exit");

const timeoutWorker = await runBoundedWorker({
  workerUrl: boundedWorkerFixture,
  workerData: { mode: "hang" },
  timeoutMs: 150,
  resourceLimits: { maxOldGenerationSizeMb: 64 },
  stdout: null,
  stderr: null
});
assert.equal(timeoutWorker.kind, "timeout");
assert.equal(timeoutWorker.exitCode, 1);
assert.ok(timeoutWorker.durationMs >= 100 && timeoutWorker.durationMs < 2_000);
console.log("PASS bounded worker timeout terminates blocked worker");

const memoryWorker = await runBoundedWorker({
  workerUrl: boundedWorkerFixture,
  workerData: { mode: "memory" },
  timeoutMs: 5_000,
  resourceLimits: { maxOldGenerationSizeMb: 16 },
  stdout: null,
  stderr: null
});
assert.equal(memoryWorker.kind, "memory");
assert.equal(memoryWorker.exitCode, 1);
console.log("PASS bounded worker contains out-of-memory failure");

const errorWorker = await runBoundedWorker({
  workerUrl: boundedWorkerFixture,
  workerData: { mode: "error" },
  timeoutMs: 1_000,
  resourceLimits: { maxOldGenerationSizeMb: 64 },
  stdout: null,
  stderr: null
});
assert.equal(errorWorker.kind, "error");
assert.equal(errorWorker.exitCode, 1);
assert.equal(errorWorker.message.includes("worker-secret"), false);
assert.equal(errorWorker.message.includes("token=<redacted>"), true);
console.log("PASS bounded worker redacts abnormal exit");

const cases = [
  {
    name: "precise registry/status/action contract passes",
    scenario: "harness/scenarios/build-tianshu-production-sn-cert.json",
    status: 0,
    marker: "PASSED build-tianshu-production-sn-cert"
  },
  {
    name: "package resources and explicit project root ignore host cwd",
    cliArgs: [
      "--scenario",
      resolve(root, "harness/scenarios/build-permissions-list.json"),
      "--project-root",
      root
    ],
    cwd: resolve(root, "harness/tests/fixtures/bundle/nested"),
    status: 0,
    marker: "PASSED build-permissions-list"
  },
  {
    name: "representative data accepts three valid alert rows",
    scenario: "harness/tests/fixtures/data-assertions.good.json",
    status: 0,
    marker: "PASSED test-data-assertions-good"
  },
  {
    name: "representative data rejects a forbidden alert handling value",
    scenario: "harness/tests/fixtures/data-assertions.bad.json",
    status: 1,
    marker: "[data-assertion]"
  },
  {
    name: "representative data rejects spread overrides",
    scenario: "harness/tests/fixtures/data-assertions-override.bad.json",
    status: 1,
    marker: "unsupported property syntax"
  },
  {
    name: "path escape is rejected before reading output",
    scenario: "harness/tests/fixtures/path-escape.bad.json",
    status: 1,
    marker: "resolves outside"
  },
  {
    name: "report escape is rejected before writing",
    scenario: "harness/tests/fixtures/report-escape.bad.json",
    status: 1,
    marker: "report resolves outside"
  },
  {
    name: "command injection does not reach a shell",
    scenario: "harness/tests/fixtures/command-injection.bad.json",
    status: 1,
    marker: "scenario schema validation failed"
  },
  {
    name: "pageId cannot mount another page component",
    scenario: "harness/tests/fixtures/registry-mismatch.bad.json",
    status: 1,
    marker: "[page-registry-mount]"
  },
  {
    name: "duplicate generated registry keys fail closed",
    scenario: "harness/tests/fixtures/registry-duplicate.bad.json",
    status: 1,
    marker: "duplicate decoded key"
  },
  {
    name: "generated registry rejects computed and spread overrides",
    scenario: "harness/tests/fixtures/registry-duplicate.bad.json",
    status: 1,
    marker: "unsupported property syntax"
  },
  {
    name: "null generated registry component fails closed",
    scenario: "harness/tests/fixtures/registry-null.bad.json",
    status: 1,
    marker: "must mount JSX"
  },
  {
    name: "status key cannot move to another code group",
    scenario: "harness/tests/fixtures/status-group.bad.json",
    status: 1,
    marker: "[status-copy]"
  },
  {
    name: "reversed action condition is rejected",
    scenario: "harness/tests/fixtures/action-condition.bad.json",
    status: 1,
    marker: "[action-condition]"
  },
  {
    name: "configured forbidden patterns are errors",
    scenario: "harness/tests/fixtures/forbidden-pattern.bad.json",
    status: 1,
    marker: "[forbidden-pattern]"
  },
  {
    name: "nested Card is detected through local function and const-arrow components",
    scenario: "harness/tests/fixtures/nested-card-helper.bad.json",
    status: 1,
    markers: ["Nested Card usage found", "forbiddenPatterns.card-inside-card"]
  },
  {
    name: "the same local Card helper remains valid outside a Card",
    scenario: "harness/tests/fixtures/card-helper-outside.good.json",
    status: 0,
    marker: "PASSED test-card-helper-outside"
  },
  {
    name: "a local Card wrapper preserves Card ancestry through its children slot",
    scenario: "harness/tests/fixtures/nested-card-children.bad.json",
    status: 1,
    markers: ["Nested Card usage found through a local children slot", "forbiddenPatterns.card-inside-card"]
  },
  {
    name: "a local Card wrapper preserves Card ancestry through an aliased children slot",
    scenario: "harness/tests/fixtures/nested-card-children-alias.bad.json",
    status: 1,
    markers: ["Nested Card usage found through a local children slot", "forbiddenPatterns.card-inside-card"]
  },
  {
    name: "static false branches cannot satisfy render evidence",
    scenario: "harness/tests/fixtures/dead-render-evidence.bad.json",
    status: 1,
    markers: [
      "Expected component <FilterPanel> is not used in reachable JSX",
      "Missing expected reachable generated copy: DEAD_EXPECTED_COPY",
      "does not contain a real StatusBadge with group=\"inbound\"",
      "must contain exactly one danger Button labeled \"删除\"",
      "Expected exactly one real ternary for \"record.status === \"active\"\"; found 0"
    ]
  },
  {
    name: "children dropped by a local component cannot provide render evidence",
    scenario: "harness/tests/fixtures/children-drop-evidence.bad.json",
    status: 1,
    markers: [
      "Expected component <FilterPanel> is not used in reachable JSX",
      "Missing expected reachable generated copy: DROPPED_CHILD_COPY",
      "must contain exactly one danger Button labeled \"删除\""
    ]
  },
  {
    name: "props on a local component cannot provide text evidence",
    scenario: "harness/tests/fixtures/text-local-prop.bad.json",
    status: 1,
    marker: "Missing expected reachable generated copy: LOCAL_PROP_COPY"
  },
  {
    name: "unconditional throw makes a later JSX return unreachable",
    scenario: "harness/tests/fixtures/dead-page-return-throw.bad.json",
    status: 1,
    marker: "JSX return must be reachable"
  },
  {
    name: "dead and nested breaks cannot make an infinite loop fall through",
    scenario: "harness/tests/fixtures/dead-page-return-infinite.bad.json",
    status: 1,
    marker: "JSX return must be reachable"
  },
  {
    name: "inert render and columns props cannot provide page evidence",
    scenario: "harness/tests/fixtures/inert-render-props.bad.json",
    status: 1,
    markers: [
      "Expected component <FilterPanel> is not used in reachable JSX",
      "Missing expected reachable generated copy: INERT_RENDER_COPY",
      "must contain exactly one danger Button labeled \"惰性删除\""
    ]
  },
  {
    name: "dynamic render ternary remains valid evidence",
    scenario: "harness/tests/fixtures/dynamic-render-evidence.good.json",
    status: 0,
    marker: "PASSED test-dynamic-render-evidence"
  },
  {
    name: "static Dropdown menu actions remain valid evidence",
    scenario: "harness/tests/fixtures/dropdown-actions.good.json",
    status: 0,
    marker: "PASSED test-dropdown-actions"
  },
  {
    name: "non-nullish left operand hides all right-side render evidence",
    scenario: "harness/tests/fixtures/nullish-dead-render.bad.json",
    status: 1,
    markers: [
      "Expected component <FilterPanel> is not used in reachable JSX",
      "Missing expected reachable generated copy: NULLISH_DEAD_COPY",
      "does not contain a real StatusBadge with group=\"inbound\"",
      "must contain exactly one danger Button labeled \"空值删除\""
    ]
  },
  {
    name: "constant false action label branch cannot satisfy danger contract",
    scenario: "harness/tests/fixtures/action-label-dead.bad.json",
    status: 1,
    marker: "must contain exactly one danger Button labeled \"删除\""
  },
  {
    name: "dynamic action labels cannot satisfy danger contract",
    scenario: "harness/tests/fixtures/action-label-dynamic.bad.json",
    status: 1,
    marker: "danger action cardinality cannot be proven"
  },
  {
    name: "dynamic opposite and outside labels cannot bypass conditional action absence",
    scenario: "harness/tests/fixtures/action-unknown-scope.bad.json",
    status: 1,
    markers: [
      "Opposite branch",
      "Buttons outside"
    ]
  },
  {
    name: "a nested callback page shadow cannot borrow pagePlans action proof",
    scenario: "harness/tests/fixtures/action-page-shadow.bad.json",
    status: 1,
    marker: "Buttons outside"
  },
  {
    name: "a top-level helper page binding cannot borrow pagePlans action proof",
    scenario: "harness/tests/fixtures/action-page-global.bad.json",
    status: 1,
    marker: "Buttons outside"
  },
  {
    name: "a page binding assigned into an alias cannot borrow pagePlans action proof",
    scenario: "harness/tests/fixtures/action-page-assignment.bad.json",
    status: 1,
    marker: "Buttons outside"
  },
  {
    name: "page-level danger cardinality fails closed on dynamic labels",
    scenario: "harness/tests/fixtures/page-danger-unknown.bad.json",
    status: 1,
    marker: "danger action cardinality cannot be proven"
  },
  {
    name: "native button danger attributes cannot satisfy kit danger contract",
    scenario: "harness/tests/fixtures/native-danger.bad.json",
    status: 1,
    marker: "must contain exactly one danger Button labeled \"删除\""
  },
  {
    name: "confirmation trigger and dialog share one controlled boolean state",
    scenario: "harness/tests/fixtures/confirmation-state.good.json",
    status: 0,
    marker: "PASSED test-confirmation-state-good"
  },
  {
    name: "stateful confirmations resolve union branches, target objects, duplicate triggers, and local callback props",
    scenario: "harness/tests/fixtures/confirmation-stateful.good.json",
    status: 0,
    marker: "PASSED test-confirmation-stateful-good"
  },
  {
    name: "local confirmation callback props cannot be disconnected from the declared page state",
    scenario: "harness/tests/fixtures/confirmation-stateful-bridge.bad.json",
    status: 1,
    marker: "every static trigger must directly set setEmergencyRow"
  },
  {
    name: "conditional page helpers cannot lend confirmation state evidence",
    scenario: "harness/tests/fixtures/confirmation-stateful-helper.bad.json",
    status: 1,
    marker: "every static trigger must directly set setTarget"
  },
  {
    name: "nullable state values cannot satisfy a non-null confirmation trigger",
    scenario: "harness/tests/fixtures/confirmation-stateful-null.bad.json",
    status: 1,
    marker: "every static trigger must directly set setTarget"
  },
  {
    name: "stateful confirmation text must come from the selected decision branch",
    scenario: "harness/tests/fixtures/confirmation-stateful-branch.bad.json",
    status: 1,
    marker: "ConfirmDialog is missing required text"
  },
  {
    name: "stateful confirmation handlers must clear every reachable decision path",
    scenario: "harness/tests/fixtures/confirmation-stateful-cleanup.bad.json",
    status: 1,
    marker: "onConfirm must clear decision to null on every reachable exit"
  },
  {
    name: "confirmation allows business conditionals before a top-level close",
    scenario: "harness/tests/fixtures/confirmation-business-if.good.json",
    status: 0,
    marker: "PASSED test-confirmation-business-if-good"
  },
  {
    name: "confirmation trigger cannot open a different dialog state",
    scenario: "harness/tests/fixtures/confirmation-state-mismatch.bad.json",
    status: 1,
    marker: "[confirmation-state]"
  },
  {
    name: "confirmation cancel and confirm handlers must close the shared state",
    scenario: "harness/tests/fixtures/confirmation-close.bad.json",
    status: 1,
    markers: [
      "[confirmation-close] Confirmation action \"删除\" onCancel must close",
      "[confirmation-close] Confirmation action \"删除\" onConfirm must close"
    ]
  },
  {
    name: "functional state updaters cannot masquerade as an explicit confirmation opener",
    scenario: "harness/tests/fixtures/confirmation-dynamic.bad.json",
    status: 1,
    marker: "onClick must directly set exactly one top-level useState(false) setter to true"
  },
  {
    name: "confirmation spreads fail closed before handler evidence is accepted",
    scenario: "harness/tests/fixtures/confirmation-spread.bad.json",
    status: 1,
    marker: "ConfirmDialog must not use spread attributes"
  },
  {
    name: "confirmation actions must be unique across the scenario",
    scenario: "harness/tests/fixtures/confirmation-duplicate-action.bad.json",
    status: 1,
    marker: "confirmation actions must be unique: 删除"
  },
  {
    name: "confirmation required text cannot be empty",
    scenario: "harness/tests/fixtures/confirmation-empty-text.bad.json",
    status: 1,
    marker: "must NOT have fewer than 1 items"
  },
  {
    name: "conditional actions cannot appear in both branches",
    scenario: "harness/tests/fixtures/action-duplicate-branches.bad.json",
    status: 1,
    marker: "Opposite branch"
  },
  {
    name: "constant false class branch cannot satisfy class contract",
    scenario: "harness/tests/fixtures/class-token-dead.bad.json",
    status: 1,
    marker: "[expected-class]"
  },
  {
    name: "className on a local component prop is inert class-token evidence",
    scenario: "harness/tests/fixtures/class-token-local-prop.bad.json",
    status: 1,
    marker: "[expected-class]"
  },
  {
    name: "kit DataGrid rowClassName callback provides scoped class-token evidence",
    scenario: "harness/tests/fixtures/row-class-token.good.json",
    status: 0,
    marker: "PASSED test-row-class-token-good"
  },
  {
    name: "rowClassName on an ordinary component is inert evidence",
    scenario: "harness/tests/fixtures/row-class-token-inert.bad.json",
    status: 1,
    marker: "[expected-class]"
  },
  {
    name: "a prop-shadowed DataGrid cannot provide kit rowClassName evidence",
    scenario: "harness/tests/fixtures/row-class-token-shadow.bad.json",
    status: 1,
    marker: "[expected-class]"
  },
  {
    name: "top-level const aliases prune dead JSX despite unrelated parameter shadows",
    scenario: "harness/tests/fixtures/const-alias-dead.bad.json",
    status: 1,
    markers: [
      "Expected component <FilterPanel> is not used in reachable JSX",
      "Missing expected reachable generated copy: CONST_ALIAS_AFTER_PAGE_DEAD_COPY",
      "Missing expected reachable generated copy: CONST_ALIAS_LOCAL_DEAD_COPY"
    ]
  },
  {
    name: "static comparisons and unary zero branches cannot satisfy render evidence",
    scenario: "harness/tests/fixtures/static-comparison-dead.bad.json",
    status: 1,
    markers: [
      "Expected component <FilterPanel> is not used in reachable JSX",
      "Missing expected reachable generated copy: STATIC_COMPARISON_DEAD_COPY",
      "Missing expected reachable generated copy: ZERO_DEAD_COPY",
      "must contain exactly one danger Button labeled \"删除\""
    ]
  },
  {
    name: "a local const read before declaration fails render control validation",
    scenario: "harness/tests/fixtures/const-alias-tdz.bad.json",
    status: 1,
    marker: "[static-control]"
  },
  {
    name: "an unreachable local const TDZ branch stays inert",
    scenario: "harness/tests/fixtures/const-alias-tdz-dead.good.json",
    status: 0,
    marker: "PASSED test-const-alias-tdz-dead"
  },
  {
    name: "dead static map branch cannot satisfy reachable data flow",
    scenario: "harness/tests/fixtures/static-value-dead.bad.json",
    status: 1,
    marker: "does not flow into reachable JSX label and variant values"
  },
  {
    name: "side-channel proof cannot satisfy static map data flow",
    scenario: "harness/tests/fixtures/static-value-proof.bad.json",
    status: 1,
    marker: "does not flow into reachable JSX label and variant values"
  },
  {
    name: "missing static map property cannot satisfy fallback data flow",
    scenario: "harness/tests/fixtures/static-value-missing-path.bad.json",
    status: 1,
    marker: "does not flow into reachable JSX label and variant values"
  },
  {
    name: "static map consumption must prove each asserted entry",
    scenario: "harness/tests/fixtures/static-value-entry.bad.json",
    status: 1,
    markers: [
      "domainCopy.ad.label: object does not flow",
      "domainCopy.ad.variant: object does not flow"
    ]
  },
  {
    name: "reassigned static-map bindings cannot prove an entry",
    scenario: "harness/tests/fixtures/static-value-reassigned.bad.json",
    status: 1,
    marker: "domainCopy.ad.label: object does not flow"
  },
  {
    name: "fixed call and binary keys cannot masquerade as dynamic static-map access",
    scenario: "harness/tests/fixtures/static-value-fixed-expression.bad.json",
    status: 1,
    marker: "domainCopy.ad.label: object does not flow"
  },
  {
    name: "fixed local component props cannot masquerade as wildcard static-map access",
    scenario: "harness/tests/fixtures/static-value-local-props-fixed.bad.json",
    status: 1,
    markers: [
      "domainCopy.ad.label: object does not flow",
      "domainCopy.ad.variant: object does not flow"
    ]
  },
  {
    name: "multiple local component call sites preserve their separate static-map props",
    scenario: "harness/tests/fixtures/static-value-local-props-two-calls.good.json",
    status: 0,
    marker: "PASSED test-static-value-local-props-two-calls"
  },
  {
    name: "spread local component props fail closed for static-map access",
    scenario: "harness/tests/fixtures/static-value-local-props-spread.bad.json",
    status: 1,
    marker: "domainCopy.ad.label: object does not flow"
  },
  {
    name: "ordinary dynamic page props fail closed for static-map access",
    scenario: "harness/tests/fixtures/static-value-local-props-dynamic.bad.json",
    status: 1,
    marker: "domainCopy.ad.label: object does not flow"
  },
  {
    name: "missing local component props fail closed for static-map access",
    scenario: "harness/tests/fixtures/static-value-local-props-missing.bad.json",
    status: 1,
    marker: "domainCopy.ad.label: object does not flow"
  },
  {
    name: "Table render row props keep wildcard static-map coverage",
    scenario: "harness/tests/fixtures/static-value-local-props-table.good.json",
    status: 0,
    marker: "PASSED test-static-value-local-props-table"
  },
  {
    name: "map callback row props keep wildcard static-map coverage",
    scenario: "harness/tests/fixtures/static-value-local-props-map.good.json",
    status: 0,
    marker: "PASSED test-static-value-local-props-map"
  },
  {
    name: "nested fixed local component props remain exact through wrappers",
    scenario: "harness/tests/fixtures/static-value-local-props-nested.bad.json",
    status: 1,
    marker: "domainCopy.ad.label: object does not flow"
  },
  {
    name: "props object access preserves exact static-map props",
    scenario: "harness/tests/fixtures/static-value-local-props-props.good.json",
    status: 0,
    marker: "PASSED test-static-value-local-props-props"
  },
  {
    name: "mutated static-map roots cannot satisfy initializer assertions",
    scenario: "harness/tests/fixtures/static-value-mutation.bad.json",
    status: 1,
    marker: "asserted static object is mutated after declaration"
  },
  {
    name: "aliases, shadows, dynamic styles, and require cannot bypass contracts",
    scenario: "harness/tests/fixtures/binding-forbidden-bypass.bad.json",
    status: 1,
    markers: [
      "[component-binding]",
      "DataGrid must be placed inside DataSection",
      "forbiddenPatterns.custom-button-style",
      "forbiddenPatterns.hardcoded-brand-color",
      "forbiddenPatterns.card-inside-card",
      "direct-third-party-import matched \"antd\"",
      "Kit Button binding Button is shadowed"
    ]
  },
  {
    name: "Ajv enforces nested array cardinality",
    scenario: "harness/tests/fixtures/schema-minitems.bad.json",
    status: 1,
    marker: "must NOT have fewer than 1 items"
  },
  {
    name: "JSONC tsconfig compiles inside the project boundary",
    scenario: "harness/tests/fixtures/secure-build-jsonc.good.json",
    projectRoot: "harness/tests/fixtures/secure-build-project",
    status: 0,
    marker: "PASSED test-secure-build-jsonc"
  },
  {
    name: "tsconfig include cannot escape the project boundary",
    scenario: "harness/tests/fixtures/secure-build-outside-include.bad.json",
    projectRoot: "harness/tests/fixtures/secure-build-project",
    status: 1,
    marker: "blocked tsconfig include outside project root"
  },
  {
    name: "source import cannot read outside the project boundary",
    scenario: "harness/tests/fixtures/secure-build-outside-import.bad.json",
    projectRoot: "harness/tests/fixtures/secure-build-project",
    status: 1,
    marker: "Cannot find module '../outside-sentinel'"
  },
  {
    name: "tsconfig extends cannot escape the project boundary",
    scenario: "harness/tests/fixtures/secure-build-outside-extends.bad.json",
    projectRoot: "harness/tests/fixtures/secure-build-project",
    status: 1,
    marker: "blocked tsconfig extends outside allowed roots"
  },
  {
    name: "composite build metadata cannot escape the project boundary",
    scenario: "harness/tests/fixtures/secure-build-outside-write.bad.json",
    projectRoot: "harness/tests/fixtures/secure-build-project",
    status: 1,
    marker: "blocked compilerOptions.tsBuildInfoFile outside project root"
  },
  {
    name: "build diagnostics fail without persisting secrets",
    scenario: "harness/tests/fixtures/report-redaction.bad.json",
    status: 1,
    marker: "[build-runtime]"
  },
  {
    name: "noEmit build cannot persist incremental metadata",
    scenario: "harness/tests/fixtures/incremental-write.good.json",
    status: 0,
    marker: "PASSED test-incremental-write"
  }
];

for (const testCase of cases) {
  const cliArgs = testCase.cliArgs ?? (testCase.projectRoot
    ? ["--scenario", resolve(root, testCase.scenario), "--project-root", resolve(root, testCase.projectRoot)]
    : [testCase.scenario, ...(testCase.args ?? [])]);
  const result = spawnSync(process.execPath, [runner, ...cliArgs], {
    cwd: testCase.cwd ?? root,
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== testCase.status) {
    throw new Error(`${testCase.name}: expected exit ${testCase.status}, got ${result.status}\n${output}`);
  }
  for (const marker of testCase.markers ?? [testCase.marker]) {
    if (!output.includes(marker)) throw new Error(`${testCase.name}: missing marker ${marker}\n${output}`);
  }
  console.log(`PASS ${testCase.name}`);
}

const redactedReport = readFileSync(resolve(root, "harness/reports/test-report-redaction.json"), "utf8");
if (redactedReport.includes("supersecret")) throw new Error("report redaction persisted the fixture secret");
if (!redactedReport.includes("<redacted>")) throw new Error("report redaction marker is missing");
console.log(`PASS report redaction content`);
if (existsSync(resolve(root, "harness/reports/test-incremental.tsbuildinfo"))) {
  throw new Error("noEmit build persisted incremental metadata");
}
console.log("PASS no incremental metadata was written");
const secureReports = ["include", "import", "extends", "write"].map((name) =>
  readFileSync(resolve(root, `harness/tests/fixtures/secure-build-project/harness/reports/test-secure-build-outside-${name}.json`), "utf8")
);
if (secureReports.some((report) => report.includes("outside-sentinel-must-never-be-read"))) {
  throw new Error("compiler boundary report persisted content from the outside sentinel");
}
console.log("PASS compiler boundary reports exclude outside sentinel content");
if (existsSync(resolve(root, "harness/tests/fixtures/outside-write.tsbuildinfo"))) {
  throw new Error("composite build persisted metadata outside the project root");
}
console.log("PASS composite build wrote no outside metadata");
console.log(`Harness tests passed: ${cases.length + 4}`);
