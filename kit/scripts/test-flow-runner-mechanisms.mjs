import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSyntheticFlowSmoke } from "./run-synthetic-flow-smoke.mjs";
import {
  assertFlowResultRunnerBinding,
  currentFlowRunnerIdentity,
  requiredRunnerBindingNegativeCases,
  requiredSelectNegativeCases,
  validateFlowFailureAttribution
} from "./validate-flow-failure-attribution.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const runnerPath = resolve(scriptDir, "run-synthetic-flow-smoke.mjs");
const coveragePath = resolve(kitRoot, "quality/blind-harness/flow-runner-verified-mechanisms.json");
const templatePath = resolve(
  kitRoot,
  "quality/blind-harness/readiness/compact-ai-03/cycle-01/consumer/readiness/inputs/semantic-contract.json"
);

const ACTION_TYPES = ["click", "fill", "navigate", "press", "select"];
const ASSERTION_KINDS = [
  "absentTestId",
  "ariaState",
  "route",
  "searchParam",
  "testIdCount",
  "value",
  "visibleTestId"
];

const FLOW = {
  flowId: "flow-mech-01",
  steps: [
    {
      stepId: "mech-click",
      pageId: "m-01",
      action: { type: "click", testId: "mech-click-action" },
      assertions: [
        { kind: "route", value: "/m-02" },
        { kind: "visibleTestId", testId: "mech-click-state" }
      ]
    },
    {
      stepId: "mech-fill",
      pageId: "m-02",
      action: { type: "fill", testId: "mech-fill-action", value: "mechanism-fill" },
      assertions: [{ kind: "value", testId: "mech-fill-action", value: "mechanism-fill" }]
    },
    {
      stepId: "mech-select-native",
      pageId: "m-02",
      action: {
        type: "select",
        testId: "mech-native-select",
        optionTestId: "mech-native-option-beta",
        value: "beta"
      },
      assertions: [{ kind: "value", testId: "mech-native-select", value: "beta" }]
    },
    {
      stepId: "mech-select-custom",
      pageId: "m-02",
      action: {
        type: "select",
        testId: "mech-custom-trigger",
        optionTestId: "mech-custom-option-gamma",
        value: "gamma"
      },
      assertions: [{ kind: "visibleTestId", testId: "mech-custom-chosen" }]
    },
    {
      stepId: "mech-press",
      pageId: "m-02",
      action: { type: "press", testId: "mech-press-action", key: "Enter" },
      assertions: [{ kind: "searchParam", name: "submitted", value: "1" }]
    },
    {
      stepId: "mech-navigate",
      pageId: "m-02",
      action: { type: "navigate", route: "/m-03" },
      assertions: [
        { kind: "route", value: "/m-03" },
        { kind: "absentTestId", testId: "mech-never-rendered" },
        { kind: "testIdCount", testId: "mech-count-target", count: 2 },
        { kind: "ariaState", testId: "mech-aria-target", name: "selected", value: "true" }
      ]
    }
  ]
};

const SELECT_NEGATIVE_CASES = [
  {
    id: "native-select-option-value-mismatch",
    pageId: "negative-select-value",
    action: {
      type: "select",
      testId: "negative-value-select",
      optionTestId: "negative-value-option",
      value: "beta"
    },
    markerTestId: "negative-value-changed",
    error: "conflicts with contract value"
  },
  {
    id: "native-select-option-wrong-owner",
    pageId: "negative-select-owner",
    action: {
      type: "select",
      testId: "negative-owner-select",
      optionTestId: "negative-owner-option",
      value: "beta"
    },
    markerTestId: "negative-owner-changed",
    error: "belongs to"
  },
  {
    id: "native-select-option-outside-select",
    pageId: "negative-select-outside",
    action: {
      type: "select",
      testId: "negative-outside-select",
      optionTestId: "negative-outside-option",
      value: "beta"
    },
    markerTestId: "negative-outside-changed",
    error: "must identify an <option>"
  }
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixtureHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>flow runner mechanism fixture</title></head>
<body>
<main id="app"></main>
<script>
const go = (route) => { history.pushState({}, "", route); render(); };
function render() {
  const root = document.getElementById("app");
  const path = location.pathname;
  if (path === "/m-01") {
    root.innerHTML = '<button type="button" data-testid="mech-click-action">enter</button>';
    root.querySelector('[data-testid="mech-click-action"]').addEventListener("click", () => go("/m-02"));
    return;
  }
  if (path === "/m-02") {
    root.innerHTML =
      '<div data-testid="mech-click-state">arrived</div>' +
      '<input data-testid="mech-fill-action" aria-label="fill target">' +
      '<select data-testid="mech-native-select" aria-label="native select">' +
        '<option value="alpha" data-testid="mech-native-option-alpha">Alpha</option>' +
        '<option value="beta" data-testid="mech-native-option-beta">Beta</option>' +
      '</select>' +
      '<button type="button" data-testid="mech-custom-trigger">open</button>' +
      '<div id="custom-panel"></div>' +
      '<input data-testid="mech-press-action" aria-label="press target">';
    const panel = root.querySelector("#custom-panel");
    root.querySelector('[data-testid="mech-custom-trigger"]').addEventListener("click", () => {
      panel.innerHTML = '<div role="option" data-testid="mech-custom-option-gamma">Gamma</div>';
      panel.querySelector('[data-testid="mech-custom-option-gamma"]').addEventListener("click", () => {
        panel.innerHTML = '<div data-testid="mech-custom-chosen">Gamma</div>';
      });
    });
    root.querySelector('[data-testid="mech-press-action"]').addEventListener("keydown", (event) => {
      if (event.key === "Enter") go("/m-02?submitted=1");
    });
    return;
  }
  if (path === "/negative-select-value") {
    root.innerHTML =
      '<select data-testid="negative-value-select">' +
        '<option value="alpha">Alpha</option>' +
        '<option value="wrong" data-testid="negative-value-option">Wrong</option>' +
      '</select>' +
      '<div id="negative-value-marker"></div>';
    root.querySelector('[data-testid="negative-value-select"]').addEventListener("change", () => {
      root.querySelector("#negative-value-marker").innerHTML = '<div data-testid="negative-value-changed">changed</div>';
    });
    return;
  }
  if (path === "/negative-select-owner") {
    root.innerHTML =
      '<select data-testid="negative-owner-select">' +
        '<option value="alpha">Alpha</option>' +
        '<option value="beta">Beta</option>' +
      '</select>' +
      '<select data-testid="negative-owner-decoy">' +
        '<option value="beta" data-testid="negative-owner-option">Beta decoy</option>' +
      '</select>' +
      '<div id="negative-owner-marker"></div>';
    root.querySelector('[data-testid="negative-owner-select"]').addEventListener("change", () => {
      root.querySelector("#negative-owner-marker").innerHTML = '<div data-testid="negative-owner-changed">changed</div>';
    });
    return;
  }
  if (path === "/negative-select-outside") {
    root.innerHTML =
      '<select data-testid="negative-outside-select">' +
        '<option value="alpha">Alpha</option>' +
        '<option value="beta">Beta</option>' +
      '</select>' +
      '<input data-testid="negative-outside-option" value="beta">' +
      '<div id="negative-outside-marker"></div>';
    root.querySelector('[data-testid="negative-outside-select"]').addEventListener("change", () => {
      root.querySelector("#negative-outside-marker").innerHTML = '<div data-testid="negative-outside-changed">changed</div>';
    });
    return;
  }
  if (path === "/m-03") {
    root.innerHTML =
      '<div data-testid="mech-aria-target" aria-selected="true">aria</div>' +
      '<div data-testid="mech-count-target">one</div>' +
      '<div data-testid="mech-count-target">two</div>';
    return;
  }
  root.innerHTML = '<div data-testid="mech-unknown-route">unknown</div>';
}
window.addEventListener("popstate", render);
render();
</script>
</body>
</html>
`;
}

function buildContract(flow = FLOW, pageId = "m-01", contractId = "synthetic-flow-runner-mechanism-fixture") {
  const template = JSON.parse(readFileSync(templatePath, "utf8"));
  const requiredTestIds = new Set();
  for (const step of flow.steps) {
    if (step.action.testId) requiredTestIds.add(step.action.testId);
    if (step.action.optionTestId) requiredTestIds.add(step.action.optionTestId);
    for (const assertion of step.assertions) {
      if (assertion.testId && assertion.kind !== "absentTestId") requiredTestIds.add(assertion.testId);
    }
  }
  return {
    ...template,
    contractId,
    entry: { ...template.entry, route: `/${pageId}` },
    flows: [flow],
    requiredTestIds: [...requiredTestIds].sort()
  };
}

function negativeFlow(testCase) {
  return {
    flowId: `flow-${testCase.id}`,
    steps: [
      {
        stepId: testCase.id,
        pageId: testCase.pageId,
        action: testCase.action,
        assertions: [{ kind: "visibleTestId", testId: testCase.markerTestId }]
      },
      {
        stepId: `${testCase.id}-unreached`,
        pageId: testCase.pageId,
        action: { type: "navigate", route: "/m-03" },
        assertions: [{ kind: "visibleTestId", testId: "mech-aria-target" }]
      }
    ]
  };
}

async function startFixtureServer(html) {
  const server = createServer((request, response) => {
    if (request.url === "/favicon.ico") {
      response.writeHead(200, { "content-type": "image/x-icon", "content-length": 0 });
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function assertIncludes(actual, expected, label) {
  if (!String(actual).includes(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function expectFailure(label, message, action) {
  try {
    action();
  } catch (error) {
    assertIncludes(error instanceof Error ? error.message : String(error), message, label);
    return;
  }
  throw new Error(`${label}: expected failure`);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fileReceipt(root, path) {
  const bytes = readFileSync(path);
  return {
    path: path.slice(resolve(root).length + 1).replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: sha256(bytes)
  };
}

function createAttributionFixture(root, contractBytes, resultDocument) {
  const readinessRoot = resolve(root, "fixture-profile/cycle-01/consumer/readiness");
  const inputRoot = resolve(readinessRoot, "inputs");
  const flowRoot = resolve(readinessRoot, "flow");
  mkdirSync(inputRoot, { recursive: true });
  mkdirSync(flowRoot, { recursive: true });
  writeFileSync(resolve(inputRoot, "semantic-contract.json"), contractBytes);
  const flowStage = { status: "failed", result: null };
  if (resultDocument) {
    const resultPath = resolve(flowRoot, "result.json");
    writeJson(resultPath, resultDocument);
    flowStage.result = fileReceipt(readinessRoot, resultPath);
  }
  writeJson(resolve(readinessRoot, "readiness-summary.json"), {
    stages: { flowSmoke: flowStage }
  });
}

const tempRoot = mkdtempSync(resolve(kitRoot, ".tmp-flow-runner-mechanisms-"));
let fixture;

try {
  const contractPath = resolve(tempRoot, "semantic-contract.json");
  const contract = buildContract();
  writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");

  const coveredActions = new Set(FLOW.steps.map((step) => step.action.type));
  const coveredAssertions = new Set(FLOW.steps.flatMap((step) => step.assertions.map((a) => a.kind)));
  for (const type of ACTION_TYPES) {
    if (!coveredActions.has(type)) throw new Error(`mechanism fixture omits action type: ${type}`);
  }
  for (const kind of ASSERTION_KINDS) {
    if (!coveredAssertions.has(kind)) throw new Error(`mechanism fixture omits assertion kind: ${kind}`);
  }
  const nativeSelect = FLOW.steps.filter((step) => step.action.type === "select");
  if (nativeSelect.length < 2) {
    throw new Error("select must be covered as both a native <select> and a custom dropdown");
  }

  fixture = await startFixtureServer(fixtureHtml());
  const result = await runSyntheticFlowSmoke({
    baseUrl: fixture.baseUrl,
    contractPath,
    outFile: resolve(tempRoot, "result.json"),
    timeoutMs: 15_000
  });

  assertEqual(result.status, "passed", "mechanism fixture flow status");
  assertEqual(result.firstFailure, null, "mechanism fixture firstFailure");
  const steps = result.flows[0].steps;
  assertEqual(steps.length, FLOW.steps.length, "mechanism fixture step count");
  for (const step of steps) assertEqual(step.status, "passed", `step ${step.stepId}`);

  const runnerIdentity = currentFlowRunnerIdentity();
  assertFlowResultRunnerBinding(result, runnerIdentity, "positive mechanism result");
  for (const testCase of SELECT_NEGATIVE_CASES) {
    const negativeContractPath = resolve(tempRoot, `${testCase.id}-contract.json`);
    const negativeContract = buildContract(
      negativeFlow(testCase),
      testCase.pageId,
      `synthetic-flow-runner-${testCase.id}`
    );
    writeFileSync(negativeContractPath, `${JSON.stringify(negativeContract, null, 2)}\n`, "utf8");
    const negativeResult = await runSyntheticFlowSmoke({
      baseUrl: fixture.baseUrl,
      contractPath: negativeContractPath,
      outFile: resolve(tempRoot, `${testCase.id}-result.json`),
      timeoutMs: 15_000
    });
    assertEqual(negativeResult.status, "failed", `${testCase.id} flow status`);
    assertEqual(negativeResult.firstFailure?.stage, "flow-step", `${testCase.id} failure stage`);
    assertEqual(negativeResult.firstFailure?.stepId, testCase.id, `${testCase.id} failure step`);
    assertIncludes(negativeResult.firstFailure?.message, testCase.error, `${testCase.id} failure message`);
    assertFlowResultRunnerBinding(negativeResult, runnerIdentity, `${testCase.id} result`);
  }

  const staleResult = structuredClone(result);
  staleResult.runner.sha256 = "0".repeat(64);
  expectFailure("stale flow result runner", "flow runner SHA-256", () =>
    assertFlowResultRunnerBinding(staleResult, runnerIdentity, "stale flow result")
  );

  const runnerSha256 = sha256(readFileSync(runnerPath));
  assertEqual(runnerSha256, runnerIdentity.sha256, "runner identity SHA-256");
  const existing = existsSync(coveragePath) ? JSON.parse(readFileSync(coveragePath, "utf8")) : null;
  const expectedActions = [...coveredActions].sort();
  const expectedAssertions = [...coveredAssertions].sort();
  const expectedSelectVariants = ["native-select-element", "custom-dropdown"];
  const coverageCurrent =
    existing?.runner?.path === runnerIdentity.path &&
    existing?.runner?.bytes === runnerIdentity.bytes &&
    existing?.runner?.sha256 === runnerIdentity.sha256 &&
    JSON.stringify(existing?.actionTypes) === JSON.stringify(expectedActions) &&
    JSON.stringify(existing?.assertionKinds) === JSON.stringify(expectedAssertions) &&
    JSON.stringify(existing?.selectVariants) === JSON.stringify(expectedSelectVariants) &&
    JSON.stringify(existing?.selectNegativeCases) === JSON.stringify(requiredSelectNegativeCases) &&
    JSON.stringify(existing?.runnerBindingNegativeCases) ===
      JSON.stringify(requiredRunnerBindingNegativeCases);
  if (!coverageCurrent) {
    writeFileSync(
      coveragePath,
      `${JSON.stringify(
        {
          $schema: "flow-runner-verified-mechanisms.v1",
          version: "1.0.0",
          purpose:
            "Every action type and assertion kind here is proven to pass against a deliberately correct product, so a failure observed in the same mechanism can be attributed to the product under test.",
          runner: {
            ...runnerIdentity
          },
          verifiedAtUtc: result.stoppedAtUtc ?? result.startedAtUtc,
          actionTypes: expectedActions,
          assertionKinds: expectedAssertions,
          selectVariants: expectedSelectVariants,
          selectNegativeCases: requiredSelectNegativeCases,
          runnerBindingNegativeCases: requiredRunnerBindingNegativeCases
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  const contractBytes = readFileSync(contractPath);
  const missingResultRoot = resolve(tempRoot, "attribution-missing-result");
  createAttributionFixture(missingResultRoot, contractBytes, null);
  expectFailure("missing failed flow result", "failed flow stage omits result evidence", () =>
    validateFlowFailureAttribution(missingResultRoot, { expectedSummaryCount: 1 })
  );

  const staleRunnerResult = structuredClone(result);
  staleRunnerResult.status = "failed";
  staleRunnerResult.firstFailure = {
    stage: "flow-step",
    flowId: FLOW.flowId,
    stepId: FLOW.steps[0].stepId,
    message: "attribution fixture failure"
  };
  staleRunnerResult.runner.sha256 = "0".repeat(64);
  const staleRunnerRoot = resolve(tempRoot, "attribution-stale-runner");
  createAttributionFixture(staleRunnerRoot, contractBytes, staleRunnerResult);
  expectFailure("stale attribution runner", "flow runner SHA-256", () =>
    validateFlowFailureAttribution(staleRunnerRoot, { expectedSummaryCount: 1 })
  );

  const missingRunnerResult = structuredClone(staleRunnerResult);
  delete missingRunnerResult.runner;
  const missingRunnerRoot = resolve(tempRoot, "attribution-missing-runner");
  createAttributionFixture(missingRunnerRoot, contractBytes, missingRunnerResult);
  expectFailure("missing attribution runner", "flow runner path", () =>
    validateFlowFailureAttribution(missingRunnerRoot, { expectedSummaryCount: 1 })
  );

  console.log(
    `test-flow-runner-mechanisms passed: ${coveredActions.size} action types; ${coveredAssertions.size} assertion kinds; select native and custom; ${SELECT_NEGATIVE_CASES.length} select negatives; ${requiredRunnerBindingNegativeCases.length} attribution negatives; coverage ${coverageCurrent ? "already current" : "refreshed"}`
  );
} catch (error) {
  console.error(
    `test-flow-runner-mechanisms failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
} finally {
  if (fixture) await new Promise((done) => fixture.server.close(done));
  rmSync(tempRoot, { recursive: true, force: true });
}
