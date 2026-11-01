import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runGuidedPilotFlowSmoke } from "./run-guided-pilot-flow-smoke.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const kitRoot = resolve(scriptDir, "..");
const runnerPath = resolve(scriptDir, "run-guided-pilot-flow-smoke.mjs");
const sourceReceiptSha256 = "a".repeat(64);
const sourcePrdSha256 = "b".repeat(64);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixtureHtml() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>guided pilot flow fixture</title></head>
<body>
<main id="root"></main>
<script>
const root = document.querySelector("#root");
function render() {
  if (location.pathname === "/pilot") {
    root.innerHTML =
      '<section data-testid="pilot-root">' +
      '<button data-testid="pilot-go">Open completion</button>' +
      '</section>';
    root.querySelector('[data-testid="pilot-go"]').addEventListener("click", () => {
      history.pushState({}, "", "/pilot/done");
      render();
    });
    return;
  }
  if (location.pathname === "/pilot/done") {
    root.innerHTML = '<section data-testid="pilot-done">Completed</section>';
    return;
  }
  if (location.pathname === "/pilot-select") {
    root.innerHTML =
      '<section data-testid="pilot-select-root">' +
      '<select data-testid="pilot-native-select">' +
      '<option data-testid="pilot-native-option-alpha" value="alpha">Alpha</option>' +
      '<option data-testid="pilot-native-option-beta" value="beta">Beta</option>' +
      '</select>' +
      '<select data-testid="pilot-decoy-select">' +
      '<option data-testid="pilot-decoy-option-beta" value="beta">Decoy beta</option>' +
      '</select>' +
      '</section>';
    return;
  }
  root.innerHTML = '<section data-testid="pilot-unknown-route">Unknown route</section>';
}
window.addEventListener("popstate", render);
render();
</script>
</body>
</html>
`;
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

function positiveFlow() {
  return {
    flowId: "click-route-visible",
    steps: [
      {
        stepId: "open-completion",
        pageId: "pilot",
        action: { type: "click", testId: "pilot-go" },
        assertions: [
          { kind: "route", value: "/pilot/done" },
          { kind: "visibleTestId", testId: "pilot-done" }
        ]
      },
      {
        stepId: "return-to-entry",
        pageId: "pilot",
        action: { type: "navigate", route: "/pilot" },
        assertions: [{ kind: "visibleTestId", testId: "pilot-root" }]
      }
    ]
  };
}

function nativeSelectFlow(action, stepId) {
  return {
    flowId: `native-select-${stepId}`,
    steps: [
      {
        stepId,
        pageId: "pilot-select",
        action,
        assertions: [{ kind: "visibleTestId", testId: "pilot-select-root" }]
      },
      {
        stepId: `${stepId}-unreached`,
        pageId: "pilot",
        action: { type: "navigate", route: "/pilot" },
        assertions: [{ kind: "visibleTestId", testId: "pilot-root" }]
      }
    ]
  };
}

function requiredTestIdsFor(flow) {
  const testIds = new Set();
  for (const step of flow.steps) {
    if (step.action.testId) testIds.add(step.action.testId);
    if (step.action.optionTestId) testIds.add(step.action.optionTestId);
    for (const assertion of step.assertions) {
      if (assertion.testId && assertion.kind !== "absentTestId") testIds.add(assertion.testId);
    }
  }
  return [...testIds].sort();
}

function buildContract({
  contractId = "guided-pilot-click-route-visible",
  entryRoute = "/pilot",
  flow = positiveFlow()
} = {}) {
  return {
    $schema: "https://ai-readable.local/schema/guided-pilot-flow-contract.schema.json",
    version: "1.0.0",
    contractId,
    owner: "guided-pilot-harness",
    projectId: "consumed-historical-pilot",
    source: {
      kind: "consumed-historical-prd",
      historicalReceipt: {
        path: "quality/blind-runs/consumed-pilot/input-receipt.json",
        bytes: 512,
        sha256: sourceReceiptSha256
      },
      currentPrd: {
        bytes: 2048,
        sha256: sourcePrdSha256
      }
    },
    entry: {
      route: entryRoute,
      identityPath: "/artifact-meta.json"
    },
    requiredTestIds: requiredTestIdsFor(flow),
    flows: [flow]
  };
}

function writeContract(path, contract) {
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function assertIncludes(actual, expected, label) {
  if (!String(actual).includes(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function assertMatches(actual, pattern, label) {
  if (!pattern.test(String(actual))) {
    throw new Error(`${label}: expected ${JSON.stringify(actual)} to match ${String(pattern)}`);
  }
}

async function expectRejection(label, expectedMessage, operation) {
  try {
    await operation();
  } catch (error) {
    assertIncludes(error instanceof Error ? error.message : String(error), expectedMessage, label);
    return;
  }
  throw new Error(`${label}: expected rejection`);
}

function assertRunnerBinding(result, contractPath) {
  const runnerBytes = readFileSync(runnerPath);
  const contractBytes = readFileSync(contractPath);
  assertEqual(result.runner.path, "scripts/run-guided-pilot-flow-smoke.mjs", "runner path");
  assertEqual(result.runner.bytes, runnerBytes.length, "runner bytes");
  assertEqual(result.runner.sha256, sha256(runnerBytes), "runner SHA-256");
  assertEqual(result.runner.browser.engine, "chromium", "browser engine");
  assertMatches(result.runner.browser.executableSha256, /^[0-9a-f]{64}$/, "browser executable SHA-256");
  assertEqual(result.contract.path, resolve(contractPath).replaceAll("\\", "/"), "contract path");
  assertEqual(result.contract.bytes, contractBytes.length, "contract bytes");
  assertEqual(result.contract.sha256, sha256(contractBytes), "contract SHA-256");
  assertEqual(result.contract.contractId, "guided-pilot-click-route-visible", "contract ID");
}

function assertFailedNativeSelect(result, stepId, expectedMessage) {
  assertEqual(result.status, "failed", `${stepId} status`);
  assertEqual(result.firstFailure?.stage, "flow-step", `${stepId} failure stage`);
  assertEqual(result.firstFailure?.stepId, stepId, `${stepId} failure step`);
  assertIncludes(result.firstFailure?.message, expectedMessage, `${stepId} failure message`);
}

const tempRoot = mkdtempSync(resolve(kitRoot, ".tmp-guided-pilot-flow-smoke-"));
const tempPrefix = resolve(kitRoot, ".tmp-guided-pilot-flow-smoke-");
let fixture;

try {
  if (!resolve(tempRoot).startsWith(tempPrefix)) {
    throw new Error(`unsafe temporary test root: ${tempRoot}`);
  }
  fixture = await startFixtureServer(fixtureHtml());

  const positiveContractPath = resolve(tempRoot, "positive-contract.json");
  const positiveOutputPath = resolve(tempRoot, "positive-result.json");
  writeContract(positiveContractPath, buildContract());
  const positiveResult = await runGuidedPilotFlowSmoke({
    baseUrl: fixture.baseUrl,
    contractPath: positiveContractPath,
    outFile: positiveOutputPath,
    timeoutMs: 15_000
  });
  assertEqual(positiveResult.status, "passed", "click + route + visible flow status");
  assertEqual(positiveResult.firstFailure, null, "click + route + visible firstFailure");
  assertEqual(positiveResult.kind, "guided-pilot-flow-result", "guided pilot flow result kind");
  assertEqual(positiveResult.flows.length, 1, "click + route + visible flow count");
  assertEqual(positiveResult.flows[0].steps.length, 2, "click + route + visible step count");
  for (const step of positiveResult.flows[0].steps) {
    assertEqual(step.status, "passed", `click + route + visible ${step.stepId}`);
  }
  assertRunnerBinding(positiveResult, positiveContractPath);
  const persistedPositiveResult = JSON.parse(readFileSync(positiveOutputPath, "utf8"));
  assertEqual(persistedPositiveResult.status, "passed", "persisted positive flow status");
  assertEqual(persistedPositiveResult.kind, "guided-pilot-flow-result", "persisted positive flow kind");

  await expectRejection("wx output protection", "guided pilot flow result output already exists", () =>
    runGuidedPilotFlowSmoke({
      baseUrl: fixture.baseUrl,
      contractPath: positiveContractPath,
      outFile: positiveOutputPath,
      timeoutMs: 15_000
    })
  );
  assertEqual(
    JSON.parse(readFileSync(positiveOutputPath, "utf8")).status,
    "passed",
    "wx output protection preserved first result"
  );

  const syntheticSourceContract = buildContract({ contractId: "guided-pilot-reject-synthetic-source" });
  syntheticSourceContract.source.kind = "synthetic-prd";
  const syntheticSourcePath = resolve(tempRoot, "synthetic-source-contract.json");
  writeContract(syntheticSourcePath, syntheticSourceContract);
  await expectRejection("synthetic source rejected", "guided pilot flow contract schema failed", () =>
    runGuidedPilotFlowSmoke({
      baseUrl: fixture.baseUrl,
      contractPath: syntheticSourcePath,
      timeoutMs: 15_000
    })
  );

  const unsafeRouteContract = buildContract({ contractId: "guided-pilot-reject-unsafe-route" });
  unsafeRouteContract.entry.route = "//unsafe-route";
  const unsafeRoutePath = resolve(tempRoot, "unsafe-route-contract.json");
  writeContract(unsafeRoutePath, unsafeRouteContract);
  await expectRejection("unsafe route rejected", "guided pilot flow contract schema failed", () =>
    runGuidedPilotFlowSmoke({
      baseUrl: fixture.baseUrl,
      contractPath: unsafeRoutePath,
      timeoutMs: 15_000
    })
  );

  const unsafeTestIdContract = buildContract({ contractId: "guided-pilot-reject-unsafe-testid" });
  unsafeTestIdContract.flows[0].steps[0].action.testId = "pilot_go";
  const unsafeTestIdPath = resolve(tempRoot, "unsafe-testid-contract.json");
  writeContract(unsafeTestIdPath, unsafeTestIdContract);
  await expectRejection("unsafe testId rejected", "guided pilot flow contract schema failed", () =>
    runGuidedPilotFlowSmoke({
      baseUrl: fixture.baseUrl,
      contractPath: unsafeTestIdPath,
      timeoutMs: 15_000
    })
  );

  const wrongValueStepId = "native-option-value-mismatch";
  const wrongValueContract = buildContract({
    contractId: "guided-pilot-native-option-value-mismatch",
    entryRoute: "/pilot-select",
    flow: nativeSelectFlow(
      {
        type: "select",
        testId: "pilot-native-select",
        optionTestId: "pilot-native-option-alpha",
        value: "beta"
      },
      wrongValueStepId
    )
  });
  const wrongValuePath = resolve(tempRoot, "wrong-value-contract.json");
  const wrongValueOutputPath = resolve(tempRoot, "wrong-value-result.json");
  writeContract(wrongValuePath, wrongValueContract);
  const wrongValueResult = await runGuidedPilotFlowSmoke({
    baseUrl: fixture.baseUrl,
    contractPath: wrongValuePath,
    outFile: wrongValueOutputPath,
    timeoutMs: 15_000
  });
  assertFailedNativeSelect(
    wrongValueResult,
    wrongValueStepId,
    "native select option pilot-native-option-alpha value alpha conflicts with contract value beta"
  );
  assertEqual(JSON.parse(readFileSync(wrongValueOutputPath, "utf8")).status, "failed", "failed result persisted");

  const wrongOwnerStepId = "native-option-wrong-owner";
  const wrongOwnerContract = buildContract({
    contractId: "guided-pilot-native-option-wrong-owner",
    entryRoute: "/pilot-select",
    flow: nativeSelectFlow(
      {
        type: "select",
        testId: "pilot-native-select",
        optionTestId: "pilot-decoy-option-beta",
        value: "beta"
      },
      wrongOwnerStepId
    )
  });
  const wrongOwnerPath = resolve(tempRoot, "wrong-owner-contract.json");
  const wrongOwnerOutputPath = resolve(tempRoot, "wrong-owner-result.json");
  writeContract(wrongOwnerPath, wrongOwnerContract);
  const wrongOwnerResult = await runGuidedPilotFlowSmoke({
    baseUrl: fixture.baseUrl,
    contractPath: wrongOwnerPath,
    outFile: wrongOwnerOutputPath,
    timeoutMs: 15_000
  });
  assertFailedNativeSelect(
    wrongOwnerResult,
    wrongOwnerStepId,
    "native select option pilot-decoy-option-beta belongs to pilot-decoy-select, expected pilot-native-select"
  );
  assertEqual(JSON.parse(readFileSync(wrongOwnerOutputPath, "utf8")).status, "failed", "wrong owner result persisted");

  console.log(
    "test-guided-pilot-flow-smoke passed: source tagging, unsafe route/testId, native select value/owner, click route visible flow, wx output protection"
  );
} catch (error) {
  console.error(
    `test-guided-pilot-flow-smoke failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
} finally {
  if (fixture) await new Promise((done) => fixture.server.close(done));
  rmSync(tempRoot, { recursive: true, force: true });
}
