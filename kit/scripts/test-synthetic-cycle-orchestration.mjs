import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSyntheticReadinessCycle } from "./prepare-synthetic-readiness-cycle.mjs";
import { runSyntheticGenerationAgent } from "./run-synthetic-generation-agent.mjs";
import {
  isCanonicalGenerationCommandPath,
  validateSyntheticGenerationEvidence,
  validateSyntheticGenerationRoot
} from "./validate-synthetic-generation-evidence.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(kitRoot, ".tmp-synthetic-cycle-test-"));
let negativeCount = 0;

try {
  const inputDir = resolve(tempRoot, "input");
  const workspaceRoot = resolve(tempRoot, "workspaces");
  const prepared = prepareSyntheticReadinessCycle({
    profileId: "compact-flow-02",
    seed: "8101",
    cycle: 1,
    inputDir,
    workspaceRoot
  });
  assertEqual(prepared.receipt.qualifying, false, "preparation qualifying boundary");
  assertEqual(prepared.receipt.scoring, false, "preparation scoring boundary");
  assertEqual(existsSync(resolve(workspaceRoot, "consumer/vendor")), true, "consumer package availability");
  assertEqual(existsSync(resolve(workspaceRoot, "control/vendor")), false, "control package isolation");
  assertEqual(
    prepared.receipt.workspaces.consumer.package.sha256,
    readJson(resolve(kitRoot, "quality/blind-harness/synthetic-consumer-package-receipt.json")).frozenPack.sha256,
    "consumer package binding"
  );

  const positiveEvidence = resolve(tempRoot, "evidence/positive/generation");
  const positive = await runSyntheticGenerationAgent({
    workspace: resolve(workspaceRoot, "consumer"),
    evidenceDir: positiveEvidence,
    profileId: "compact-flow-02",
    arm: "consumer",
    cycle: 1,
    provider: "claude",
    model: "claude-sonnet-5",
    timeoutMs: 60_000,
    commandOverride: {
      executable: process.execPath,
      args: ["-e", "require('node:fs').writeFileSync('agent-output.txt','ok')"]
    }
  });
  assertEqual(positive.evidence.status, "passed", "positive generation evidence");
  assertEqual(positive.evidence.provider, "claude", "positive generation provider");
  validateSyntheticGenerationEvidence(positive.evidencePath);
  const matrixRoot = resolve(tempRoot, "matrix");
  const matrixCycleRoot = resolve(matrixRoot, "compact-flow-02/cycle-01");
  mkdirSync(resolve(matrixCycleRoot, "input"), { recursive: true });
  cpSync(
    resolve(inputDir, "cycle-preparation.json"),
    resolve(matrixCycleRoot, "input/cycle-preparation.json")
  );
  cpSync(positiveEvidence, resolve(matrixCycleRoot, "consumer/generation"), { recursive: true });
  assertEqual(
    isCanonicalGenerationCommandPath(
      matrixRoot,
      resolve(matrixCycleRoot, "consumer/generation/command.json")
    ),
    true,
    "canonical generation path"
  );
  assertEqual(
    isCanonicalGenerationCommandPath(
      matrixRoot,
      resolve(matrixCycleRoot, "consumer/generation-attempt-01/command.json")
    ),
    false,
    "generation attempt excluded from matrix"
  );
  assertEqual(validateSyntheticGenerationRoot(matrixRoot).count, 1, "partial canonical matrix count");
  const retryRoot = resolve(tempRoot, "matrix-retry");
  cpSync(matrixRoot, retryRoot, { recursive: true });
  const retryCycleRoot = resolve(retryRoot, "compact-flow-02/cycle-01");
  const retryPreparation = readJson(resolve(retryCycleRoot, "input/cycle-preparation.json"));
  retryPreparation.workspaces.consumer.path = "H:/synthetic-retry/consumer";
  retryPreparation.workspaces.control.path = "H:/synthetic-retry/control";
  writeJson(resolve(retryCycleRoot, "retry-preparation-01.json"), retryPreparation);
  const retryCommandPath = resolve(retryCycleRoot, "consumer/generation/command.json");
  const retryCommand = readJson(retryCommandPath);
  retryCommand.cwd = retryPreparation.workspaces.consumer.path;
  writeJson(retryCommandPath, retryCommand);
  assertEqual(validateSyntheticGenerationRoot(retryRoot).count, 1, "receipted retry workspace");

  const driftEvidence = resolve(tempRoot, "evidence/drift/generation");
  const drift = await runSyntheticGenerationAgent({
    workspace: resolve(workspaceRoot, "control"),
    evidenceDir: driftEvidence,
    profileId: "compact-flow-02",
    arm: "control",
    cycle: 1,
    timeoutMs: 60_000,
    commandOverride: {
      executable: process.execPath,
      args: ["-e", "require('node:fs').appendFileSync('synthetic-prd.md','drift')"]
    }
  });
  assertEqual(drift.evidence.status, "failed", "immutable drift evidence");
  assertEqual(drift.evidence.timedOut, false, "immutable drift command timeout");
  assertIncludes(drift.evidence.failure, "frozen workspace inputs", "immutable drift reason");
  validateSyntheticGenerationEvidence(drift.evidencePath);
  negativeCount += 1;

  const hashDriftRoot = resolve(tempRoot, "evidence/hash-drift/generation");
  cpSync(positiveEvidence, hashDriftRoot, { recursive: true });
  writeFileSync(resolve(hashDriftRoot, "stdout.log"), "changed", "utf8");
  expectFailure(
    "stdout hash drift",
    "receipt",
    () => validateSyntheticGenerationEvidence(resolve(hashDriftRoot, "command.json"))
  );
  negativeCount += 1;

  const statusDriftRoot = resolve(tempRoot, "evidence/status-drift/generation");
  cpSync(positiveEvidence, statusDriftRoot, { recursive: true });
  const statusDrift = readJson(resolve(statusDriftRoot, "command.json"));
  statusDrift.status = "failed";
  statusDrift.failure = "invented";
  writeJson(resolve(statusDriftRoot, "command.json"), statusDrift);
  expectFailure(
    "status conflict",
    "status conflicts",
    () => validateSyntheticGenerationEvidence(resolve(statusDriftRoot, "command.json"))
  );
  negativeCount += 1;

  expectFailure(
    "preparation binding drift",
    "generation frozen input binding before",
    () => {
      const driftRoot = resolve(tempRoot, "matrix-binding-drift");
      cpSync(matrixRoot, driftRoot, { recursive: true });
      const preparationPath = resolve(
        driftRoot,
        "compact-flow-02/cycle-01/input/cycle-preparation.json"
      );
      const preparation = readJson(preparationPath);
      preparation.workspaces.consumer.frozenInputTreeSha256 = "0".repeat(64);
      writeJson(preparationPath, preparation);
      validateSyntheticGenerationRoot(driftRoot);
    }
  );
  negativeCount += 1;

  expectFailure(
    "unreceipted retry workspace",
    "retry preparation does not bind command cwd",
    () => {
      const driftRoot = resolve(tempRoot, "matrix-cwd-drift");
      cpSync(matrixRoot, driftRoot, { recursive: true });
      const commandPath = resolve(
        driftRoot,
        "compact-flow-02/cycle-01/consumer/generation/command.json"
      );
      const command = readJson(commandPath);
      command.cwd = "H:/synthetic-retry-without-receipt/consumer";
      writeJson(commandPath, command);
      validateSyntheticGenerationRoot(driftRoot);
    }
  );
  negativeCount += 1;

  expectFailure(
    "incomplete stability matrix",
    "generation stability matrix",
    () => validateSyntheticGenerationRoot(matrixRoot, { requireStabilityGate: true })
  );
  negativeCount += 1;

  console.log(
    `test-synthetic-cycle-orchestration passed: frozen package, isolated arms, immutable inputs; ${negativeCount} negative cases rejected`
  );
} catch (error) {
  console.error(`test-synthetic-cycle-orchestration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  const resolvedRoot = resolve(tempRoot);
  const expectedPrefix = `${resolve(kitRoot)}\\.tmp-synthetic-cycle-test-`;
  if (!resolvedRoot.startsWith(expectedPrefix)) throw new Error(`refusing to clean unexpected cycle test root: ${resolvedRoot}`);
  rmSync(resolvedRoot, { recursive: true, force: true });
}

function expectFailure(label, expectedMessage, action) {
  try {
    action();
  } catch (error) {
    assertIncludes(error instanceof Error ? error.message : String(error), expectedMessage, label);
    return;
  }
  throw new Error(`${label} unexpectedly passed`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function assertIncludes(actual, expected, label) {
  if (!String(actual).includes(expected)) throw new Error(`${label}: expected ${JSON.stringify(actual)} to include ${expected}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
