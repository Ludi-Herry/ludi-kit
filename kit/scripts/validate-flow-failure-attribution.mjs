import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const runnerPath = resolve(scriptDir, "run-synthetic-flow-smoke.mjs");
const coveragePath = resolve(kitRoot, "quality/blind-harness/flow-runner-verified-mechanisms.json");
const defaultRoot = resolve(kitRoot, "quality/blind-harness/readiness");
const runnerPortablePath = "scripts/run-synthetic-flow-smoke.mjs";

export const requiredSelectNegativeCases = [
  "native-select-option-outside-select",
  "native-select-option-value-mismatch",
  "native-select-option-wrong-owner"
];

export const requiredRunnerBindingNegativeCases = [
  "missing-flow-result",
  "missing-flow-result-runner",
  "stale-flow-result-runner"
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findSummaryFiles(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "readiness-summary.json") found.push(full);
    }
  };
  walk(root);
  return found.filter((path) => {
    const portable = relative(resolve(root), path).replaceAll("\\", "/");
    return /^[a-z0-9][a-z0-9-]*\/cycle-(01|02|03)\/(consumer|control)\/readiness\/readiness-summary\.json$/.test(
      portable
    );
  });
}

export function currentFlowRunnerIdentity() {
  const bytes = readFileSync(runnerPath);
  return {
    path: runnerPortablePath,
    bytes: bytes.length,
    sha256: sha256(bytes)
  };
}

export function assertFlowResultRunnerBinding(result, expected = currentFlowRunnerIdentity(), label = "flow result") {
  if (result?.runner?.path !== expected.path) {
    throw new Error(`${label} flow runner path: expected ${expected.path}, received ${result?.runner?.path}`);
  }
  if (result.runner.bytes !== expected.bytes) {
    throw new Error(`${label} flow runner bytes: expected ${expected.bytes}, received ${result.runner.bytes}`);
  }
  if (result.runner.sha256 !== expected.sha256) {
    throw new Error(
      `${label} flow runner SHA-256: expected ${expected.sha256}, received ${result.runner.sha256}`
    );
  }
}

function assertCoverageRunnerBinding(coverage, expected) {
  const actual = coverage?.runner;
  if (
    actual?.path !== expected.path ||
    actual?.bytes !== expected.bytes ||
    actual?.sha256 !== expected.sha256
  ) {
    throw new Error(
      `verified-mechanism coverage was produced by a different runner (coverage ${actual?.path} ${actual?.bytes} ${actual?.sha256}, current ${expected.path} ${expected.bytes} ${expected.sha256}); re-run test:flow-runner-mechanisms before attributing failures to products`
    );
  }
}

function assertExactCoverage(actual, expected, label) {
  const left = JSON.stringify([...(actual ?? [])].sort());
  const right = JSON.stringify([...expected].sort());
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
}

export function validateFlowFailureAttribution(root = defaultRoot, { expectedSummaryCount = 18 } = {}) {
  const absoluteRoot = resolve(root);
  if (!existsSync(coveragePath)) {
    throw new Error(
      "flow-runner-verified-mechanisms.json is missing; run test:flow-runner-mechanisms before attributing any failure to a product"
    );
  }
  const coverage = readJson(coveragePath);
  const currentRunner = currentFlowRunnerIdentity();
  assertCoverageRunnerBinding(coverage, currentRunner);
  assertExactCoverage(coverage.selectNegativeCases, requiredSelectNegativeCases, "select negative coverage");
  assertExactCoverage(
    coverage.runnerBindingNegativeCases,
    requiredRunnerBindingNegativeCases,
    "runner binding negative coverage"
  );
  const verifiedActions = new Set(coverage.actionTypes ?? []);
  const verifiedAssertions = new Set(coverage.assertionKinds ?? []);

  const attributions = [];
  const summaryPaths = findSummaryFiles(absoluteRoot);
  if (summaryPaths.length !== expectedSummaryCount) {
    throw new Error(
      `flow failure attribution expected ${expectedSummaryCount} canonical readiness summaries, received ${summaryPaths.length}`
    );
  }
  for (const summaryPath of summaryPaths) {
    const summary = readJson(summaryPath);
    const flowStage = summary.stages?.flowSmoke;
    if (flowStage?.status !== "failed") continue;
    if (!flowStage.result) {
      throw new Error(`failed flow stage omits result evidence: ${summaryPath}`);
    }
    const armRoot = dirname(summaryPath);
    const resultPath = resolve(armRoot, flowStage.result.path);
    if (!isInside(armRoot, resultPath) || resultPath !== resolve(armRoot, "flow/result.json")) {
      throw new Error(`failed flow result path is invalid: ${summaryPath} -> ${flowStage.result.path}`);
    }
    if (!existsSync(resultPath)) throw new Error(`failed flow result is missing: ${resultPath}`);
    const resultBytes = readFileSync(resultPath);
    if (resultBytes.length !== flowStage.result.bytes) {
      throw new Error(
        `failed flow result bytes: expected ${flowStage.result.bytes}, received ${resultBytes.length} (${resultPath})`
      );
    }
    if (sha256(resultBytes) !== flowStage.result.sha256) {
      throw new Error(`failed flow result SHA-256 conflicts with its readiness receipt: ${resultPath}`);
    }
    const result = JSON.parse(resultBytes.toString("utf8"));
    if (result.status !== "failed") {
      throw new Error(`failed readiness flow stage points to a non-failed result: ${resultPath}`);
    }
    assertFlowResultRunnerBinding(result, currentRunner, resultPath);
    const contractPath = resolve(armRoot, "inputs/semantic-contract.json");
    if (!existsSync(contractPath)) {
      throw new Error(`failed flow result lacks its semantic contract: ${resultPath}`);
    }
    const contractBytes = readFileSync(contractPath);
    const contract = JSON.parse(contractBytes.toString("utf8"));
    if (result.contract?.sha256 !== sha256(contractBytes)) {
      throw new Error(`failed flow result contract SHA-256 conflicts with its readiness input: ${resultPath}`);
    }
    const stepId = result.firstFailure?.stepId;
    if (result.firstFailure?.stage !== "flow-step" || typeof stepId !== "string") {
      throw new Error(
        `failed flow result is not attributable to a flow step: ${resultPath} (stage ${result.firstFailure?.stage})`
      );
    }
    const step = contract.flows
      .flatMap((flow) => flow.steps ?? [])
      .find((candidate) => candidate.stepId === stepId);
    if (!step) throw new Error(`failed stepId ${stepId} is absent from the contract: ${contractPath}`);

    const actionType = step.action?.type;
    if (!verifiedActions.has(actionType)) {
      throw new Error(
        `failure at ${stepId} uses action type "${actionType}", which has no passing mechanism fixture; the runner is unproven here, so this failure cannot be attributed to the product (${resultPath})`
      );
    }
    const kinds = (step.assertions ?? []).map((assertion) => assertion.kind);
    for (const kind of kinds) {
      if (!verifiedAssertions.has(kind)) {
        throw new Error(
          `failure at ${stepId} involves assertion kind "${kind}", which has no passing mechanism fixture; the runner is unproven here, so this failure cannot be attributed to the product (${resultPath})`
        );
      }
    }
    attributions.push({
      path: relative(kitRoot, resultPath).replaceAll("\\", "/"),
      stepId,
      actionType,
      assertionKinds: kinds
    });
  }
  return { attributions, coverageRunnerSha256: currentRunner.sha256, summaries: summaryPaths.length };
}

function isInside(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  return value !== "" && value !== ".." && !value.startsWith(`..\\`) && !value.startsWith("../");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) throw new Error(`unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = validateFlowFailureAttribution(options.root ?? defaultRoot);
    console.log(
      `validate-flow-failure-attribution passed: ${result.attributions.length} product-attributed failures; every mechanism has a passing fixture`
    );
  } catch (error) {
    console.error(
      `validate-flow-failure-attribution failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
