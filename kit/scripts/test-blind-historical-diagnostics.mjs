import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  blindHistoricalDiagnosticsPaths,
  validateHistoricalDiagnostics
} from "./build-blind-historical-diagnostics.mjs";
import {
  blindHistoricalBaselinePaths,
  validateHistoricalBaseline
} from "./freeze-blind-historical-baseline.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(kitRoot, ".tmp-historical-diagnostics-test-"));
const registryBytesBefore = readFileSync(blindHistoricalBaselinePaths.registryPath);

try {
  const baselineResult = validateHistoricalBaseline();
  const diagnosticsResult = validateHistoricalDiagnostics();
  assertEqual(baselineResult.protectedRuns, 8, "protected run count");
  assertEqual(baselineResult.protectedFiles, 128, "protected file count");
  assertEqual(diagnosticsResult.assessment, "indeterminate-current-harness", "diagnostic assessment");

  const diagnostics = readJson(blindHistoricalDiagnosticsPaths.diagnosticsPath);
  const qualifying = diagnostics.runs.filter((run) => run.qualifying);
  assertEqual(qualifying.length, 3, "qualifying diagnostic run count");
  for (const runId of ["blind-prd-02-replacement-01", "blind-prd-03-replacement-01"]) {
    const run = diagnostics.runs.find((item) => item.runId === runId);
    for (const arm of ["consumer", "control"]) {
      assertEqual(run.arms[arm].typecheckPass.value, "unknown", `${runId} ${arm} typecheck unknown`);
      assertEqual(run.arms[arm].buildPass.value, "unknown", `${runId} ${arm} build unknown`);
      assertEqual(run.arms[arm].flowSmokePass.value, false, `${runId} ${arm} flow failure`);
      assertEqual(run.arms[arm].previewIdentityPass.value, "unknown", `${runId} ${arm} preview unknown`);
    }
  }

  const mutatedDiagnosticsPath = resolve(tempRoot, "historical-diagnostics.unknown-mutated.json");
  const mutatedDiagnostics = structuredClone(diagnostics);
  mutatedDiagnostics.runs.find(
    (run) => run.runId === "blind-prd-02-replacement-01"
  ).arms.consumer.typecheckPass.value = true;
  writeJson(mutatedDiagnosticsPath, mutatedDiagnostics);
  expectFailure(
    "historical unknown mutation",
    "differs from the evidence-derived matrix",
    () => validateHistoricalDiagnostics(mutatedDiagnosticsPath)
  );

  const mutatedBaselinePath = resolve(tempRoot, "historical-baseline.hash-mutated.json");
  const mutatedBaseline = readJson(blindHistoricalBaselinePaths.baselinePath);
  mutatedBaseline.files[0].sha256 = "0".repeat(64);
  writeJson(mutatedBaselinePath, mutatedBaseline);
  expectFailure(
    "historical baseline hash mutation",
    "protected historical file receipts",
    () => validateHistoricalBaseline(mutatedBaselinePath)
  );

  const registryBytesAfter = readFileSync(blindHistoricalBaselinePaths.registryPath);
  if (!registryBytesBefore.equals(registryBytesAfter)) throw new Error("historical diagnostics test changed the registry");
  console.log(
    `test-blind-historical-diagnostics passed: ${baselineResult.protectedFiles} files frozen; unknown mutation and hash drift rejected`
  );
} catch (error) {
  console.error(
    `test-blind-historical-diagnostics failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
} finally {
  const resolvedRoot = resolve(tempRoot);
  const expectedPrefix = `${resolve(kitRoot)}\\.tmp-historical-diagnostics-test-`;
  if (!resolvedRoot.startsWith(expectedPrefix)) {
    throw new Error(`refusing to clean unexpected historical test root: ${resolvedRoot}`);
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function expectFailure(label, expected, action) {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expected)) return;
    throw new Error(`${label} failed with an unexpected error: ${message}`);
  }
  throw new Error(`${label} did not fail closed`);
}
