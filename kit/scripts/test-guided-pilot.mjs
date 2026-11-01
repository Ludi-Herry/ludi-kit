import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateGuidedPilot,
  validateGuidedPilotContract,
  validateGuidedPilotRoot
} from "./validate-guided-pilot.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(tmpdir(), "ai-readable-kit-guided-pilot-"));
let negativeCount = 0;

try {
  const positive = createFixture(tempRoot);
  validateGuidedPilotContract(positive.contractPath, { kitRoot: positive.kitRoot });
  validateGuidedPilot(positive.contractPath, positive.resultPath, { kitRoot: positive.kitRoot });
  const rootResult = validateGuidedPilotRoot(positive.pilotRoot, {
    kitRoot: positive.kitRoot,
    expectedRunIds: [positive.contract.runId, positive.contract.runId]
  });
  assertEqual(rootResult.count, 1, "guided pilot root positive count");
  assertEqual(rootResult.runIds.join(","), positive.contract.runId, "guided pilot root positive runIds");

  const crossWorktreePath = createFixture(newCaseRoot("cross-worktree-flow-contract-path"));
  const crossWorktreeFlowResultPath = resolve(crossWorktreePath.pilotRoot, "readiness/flow/result.json");
  const crossWorktreeFlowResult = readJson(crossWorktreeFlowResultPath);
  crossWorktreeFlowResult.contract.path =
    "Z:/alternate-checkout/AI-readable-kit/kit/quality/blind-harness/guided-pilots/guided-pilot-multimodel-20260809-01/readiness/inputs/flow-contract.json";
  writeJson(crossWorktreeFlowResultPath, crossWorktreeFlowResult);
  refreshFlowResultReceipts(crossWorktreePath);
  validateGuidedPilot(crossWorktreePath.contractPath, crossWorktreePath.resultPath, {
    kitRoot: crossWorktreePath.kitRoot
  });

  expectFailure("guided pilot root missing", "guided pilot root is missing", () => {
    validateGuidedPilotRoot(resolve(tempRoot, "missing-guided-pilot-root"), { kitRoot: positive.kitRoot });
  });

  expectFailure("guided pilot root empty", "guided pilot root contains no runs", () => {
    validateGuidedPilotRoot(newCaseRoot("empty-guided-pilot-root"), { kitRoot: positive.kitRoot });
  });

  expectFailure("guided pilot expected run missing", "guided pilot expected run is missing", () => {
    validateGuidedPilotRoot(positive.pilotRoot, {
      kitRoot: positive.kitRoot,
      expectedRunIds: ["guided-pilot-missing-01"]
    });
  });

  const honestFailedReadiness = createFixture(newCaseRoot("honest-failed-readiness"));
  setReadinessFailure(honestFailedReadiness);
  const failedResult = readJson(honestFailedReadiness.resultPath);
  failedResult.status = "failed";
  writeJson(honestFailedReadiness.resultPath, failedResult);
  validateGuidedPilot(honestFailedReadiness.contractPath, honestFailedReadiness.resultPath, {
    kitRoot: honestFailedReadiness.kitRoot
  });

  const historicalSourceOverlap = createFixture(newCaseRoot("historical-source-overlap"));
  createSiblingContract(historicalSourceOverlap, { runId: "guided-pilot-sibling-02" });
  validateGuidedPilotContract(historicalSourceOverlap.contractPath, {
    kitRoot: historicalSourceOverlap.kitRoot
  });

  expectFailure("qualifying drift", "guided pilot contract schema failed", () => {
    const fixture = createFixture(newCaseRoot("qualifying"));
    const contract = readJson(fixture.contractPath);
    contract.qualifying = true;
    writeJson(fixture.contractPath, contract);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("scoring drift", "guided pilot result schema failed", () => {
    const fixture = createFixture(newCaseRoot("scoring"));
    const result = readJson(fixture.resultPath);
    result.scoring = true;
    writeJson(fixture.resultPath, result);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("forged passed result over failed readiness", "guided pilot result readiness status", () => {
    const fixture = createFixture(newCaseRoot("forged-passed-readiness"));
    setReadinessFailure(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness typecheck passed without command receipt", "typecheck command evidence is required", () => {
    const fixture = createFixture(newCaseRoot("readiness-typecheck-command-missing"));
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.stages.typecheck.commandEvidence = null;
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness command path escape", "guided pilot readiness typecheck command path", () => {
    const fixture = createFixture(newCaseRoot("readiness-command-path-escape"));
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.stages.typecheck.commandEvidence.path = "commands/01-typecheck/../../../outside/command.json";
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness command hash drift", "guided pilot readiness typecheck command SHA-256", () => {
    const fixture = createFixture(newCaseRoot("readiness-command-hash-drift"));
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.stages.typecheck.commandEvidence.sha256 = "0".repeat(64);
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness passed command exit drift", "typecheck command exitCode", () => {
    const fixture = createFixture(newCaseRoot("readiness-command-exit-drift"));
    const commandPath = resolve(fixture.pilotRoot, "readiness/commands/01-typecheck/command.json");
    const command = readJson(commandPath);
    command.exitCode = 1;
    writeJson(commandPath, command);
    refreshReadinessCommandReceipt(fixture, "typecheck", commandPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness passed command timeout drift", "typecheck command timedOut", () => {
    const fixture = createFixture(newCaseRoot("readiness-command-timeout-drift"));
    const commandPath = resolve(fixture.pilotRoot, "readiness/commands/01-typecheck/command.json");
    const command = readJson(commandPath);
    command.timedOut = true;
    writeJson(commandPath, command);
    refreshReadinessCommandReceipt(fixture, "typecheck", commandPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness command stdout receipt missing", "typecheck command stdout is missing", () => {
    const fixture = createFixture(newCaseRoot("readiness-command-stdout-missing"));
    rmSync(resolve(fixture.pilotRoot, "readiness/commands/01-typecheck/stdout.log"), { force: true });
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness preview identity response missing", "preview identity response is required", () => {
    const fixture = createFixture(newCaseRoot("readiness-preview-identity-missing"));
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.stages.preview.identity.response = null;
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness preview entry response drift", "preview entry response bytes drifted from its snapshot", () => {
    const fixture = createFixture(newCaseRoot("readiness-preview-entry-drift"));
    const responsePath = resolve(fixture.pilotRoot, "readiness/preview/entry-response.html");
    writeText(responsePath, "<main>tampered preview entry</main>\n");
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.stages.preview.entry.response = receipt(resolve(fixture.pilotRoot, "readiness"), responsePath);
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness preview cannot pass failed identity", "guided pilot readiness preview status", () => {
    const fixture = createFixture(newCaseRoot("readiness-preview-subcheck-conflict"));
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.stages.preview.identity = {
      status: "failed",
      httpStatus: 500,
      response: null,
      reason: "fixture identity failure"
    };
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness preview shutdown contradiction", "preview shutdown processExited", () => {
    const fixture = createFixture(newCaseRoot("readiness-preview-shutdown-conflict"));
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.stages.preview.shutdown.processExited = false;
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness failure record mismatch", "guided pilot readiness failure message", () => {
    const fixture = createFixture(newCaseRoot("readiness-failure-record-mismatch"));
    setReadinessFailure(fixture);
    const result = readJson(fixture.resultPath);
    result.status = "failed";
    writeJson(fixture.resultPath, result);
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.failure.message = "forged readiness failure";
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("flow result readiness status mismatch", "guided pilot readiness flowSmoke status", () => {
    const fixture = createFixture(newCaseRoot("flow-readiness-status-mismatch"));
    setReadinessFailure(fixture);
    const result = readJson(fixture.resultPath);
    result.status = "failed";
    writeJson(fixture.resultPath, result);
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.metrics.flowSmokePass = true;
    readiness.stages.flowSmoke.status = "passed";
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("flow result missing status", "guided pilot flow result has unexpected fields", () => {
    const fixture = createFixture(newCaseRoot("flow-result-missing-status"));
    const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
    const flowResult = readJson(flowResultPath);
    delete flowResult.status;
    writeJson(flowResultPath, flowResult);
    refreshFlowResultReceipts(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("flow result empty flows", "guided pilot flow result requires a non-empty flows array", () => {
    const fixture = createFixture(newCaseRoot("flow-result-empty-flows"));
    const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
    const flowResult = readJson(flowResultPath);
    flowResult.flows = [];
    writeJson(flowResultPath, flowResult);
    refreshFlowResultReceipts(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("flow result reordered flows", "guided pilot flow result flow 1 id", () => {
    const fixture = createFixture(newCaseRoot("flow-result-reordered"));
    const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
    const flowResult = readJson(flowResultPath);
    flowResult.flows.reverse();
    writeJson(flowResultPath, flowResult);
    refreshFlowResultReceipts(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("flow result duplicate flow", "guided pilot flow result flow count", () => {
    const fixture = createFixture(newCaseRoot("flow-result-duplicate"));
    const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
    const flowResult = readJson(flowResultPath);
    flowResult.flows.push(structuredClone(flowResult.flows[0]));
    writeJson(flowResultPath, flowResult);
    refreshFlowResultReceipts(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("flow result missing step", "guided pilot flow result flow 1 step count", () => {
    const fixture = createFixture(newCaseRoot("flow-result-missing-step"));
    const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
    const flowResult = readJson(flowResultPath);
    flowResult.flows[0].steps.pop();
    writeJson(flowResultPath, flowResult);
    refreshFlowResultReceipts(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("flow result assertion mismatch", "guided pilot flow result flow 1 step 1 assertions", () => {
    const fixture = createFixture(newCaseRoot("flow-result-assertion-mismatch"));
    const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
    const flowResult = readJson(flowResultPath);
    flowResult.flows[0].steps[0].assertions = [];
    writeJson(flowResultPath, flowResult);
    refreshFlowResultReceipts(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("failed flow result null firstFailure", "guided pilot flow result firstFailure must be an object", () => {
    const fixture = createFixture(newCaseRoot("flow-result-null-first-failure"));
    setReadinessFailure(fixture);
    const result = readJson(fixture.resultPath);
    result.status = "failed";
    writeJson(fixture.resultPath, result);
    const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
    const flowResult = readJson(flowResultPath);
    flowResult.firstFailure = null;
    writeJson(flowResultPath, flowResult);
    refreshFlowResultReceipts(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("failed flow result firstFailure mismatch", "guided pilot failed flow step error", () => {
    const fixture = createFixture(newCaseRoot("flow-result-first-failure-mismatch"));
    setReadinessFailure(fixture);
    const result = readJson(fixture.resultPath);
    result.status = "failed";
    writeJson(fixture.resultPath, result);
    const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
    const flowResult = readJson(flowResultPath);
    flowResult.firstFailure.message = "forged flow failure";
    writeJson(flowResultPath, flowResult);
    refreshFlowResultReceipts(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("passed flow result runtime error", "guided pilot passed flow result contains runtime failures", () => {
    const fixture = createFixture(newCaseRoot("flow-result-passed-runtime-error"));
    const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
    const flowResult = readJson(flowResultPath);
    flowResult.observations.consoleErrors.push("forged runtime error");
    writeJson(flowResultPath, flowResult);
    refreshFlowResultReceipts(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness receipt path escape", "guided pilot readiness flow runner path", () => {
    const fixture = createFixture(newCaseRoot("readiness-path-escape"));
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.inputs.flowRunner.path = "flow/../../outside/runner.mjs";
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("readiness root relocation", "guided pilot flow result contract path", () => {
    const fixture = createFixture(newCaseRoot("readiness-root-relocation"));
    relocateReadinessFixture(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("flow contract portable path drift", "guided pilot flow result contract path", () => {
    const fixture = createFixture(newCaseRoot("flow-contract-portable-path-drift"));
    const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
    const flowResult = readJson(flowResultPath);
    flowResult.contract.path =
      "Z:/alternate-checkout/AI-readable-kit/kit/quality/blind-harness/guided-pilots/guided-pilot-multimodel-20260809-01/readiness/inputs/other-contract.json";
    writeJson(flowResultPath, flowResult);
    refreshFlowResultReceipts(fixture);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("source snapshot drift", "guided pilot source snapshot manifest file", () => {
    const fixture = createFixture(newCaseRoot("source-snapshot-drift"));
    writeText(resolve(fixture.pilotRoot, "readiness/workspace/source/src/App.tsx"), "tampered source snapshot\n");
    refreshReadinessReceipt(fixture, resolve(fixture.pilotRoot, "readiness/result.json"));
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("dist snapshot drift", "guided pilot dist snapshot manifest file", () => {
    const fixture = createFixture(newCaseRoot("dist-snapshot-drift"));
    writeText(resolve(fixture.pilotRoot, "readiness/workspace/dist/index.html"), "tampered dist snapshot\n");
    refreshReadinessReceipt(fixture, resolve(fixture.pilotRoot, "readiness/result.json"));
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("source snapshot extra file", "guided pilot source snapshot has an extra file", () => {
    const fixture = createFixture(newCaseRoot("source-snapshot-extra"));
    writeText(resolve(fixture.pilotRoot, "readiness/workspace/source/injected.txt"), "unexpected\n");
    refreshReadinessReceipt(fixture, resolve(fixture.pilotRoot, "readiness/result.json"));
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("dist snapshot missing file", "guided pilot dist snapshot is missing manifest file", () => {
    const fixture = createFixture(newCaseRoot("dist-snapshot-missing"));
    rmSync(resolve(fixture.pilotRoot, "readiness/workspace/dist/index.html"), { force: true });
    refreshReadinessReceipt(fixture, resolve(fixture.pilotRoot, "readiness/result.json"));
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("source snapshot tree hash drift", "guided pilot source snapshot tree SHA-256", () => {
    const fixture = createFixture(newCaseRoot("source-snapshot-tree-hash-drift"));
    const manifestPath = resolve(fixture.pilotRoot, "readiness/workspace/source-manifest.json");
    const manifest = readJson(manifestPath);
    manifest.treeSha256 = "0".repeat(64);
    writeJson(manifestPath, manifest);
    const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
    const readiness = readJson(readinessPath);
    readiness.workspace.sourceManifest = receipt(resolve(fixture.pilotRoot, "readiness"), manifestPath);
    writeJson(readinessPath, readiness);
    refreshReadinessReceipt(fixture, readinessPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  for (const [rootLabel, relativePath, expected] of [
    ["source", "package.json", "guided pilot source snapshot is missing required output: package.json"],
    ["source", "index.html", "guided pilot source snapshot is missing required output: index.html"],
    [
      "source",
      "public/artifact-meta.json",
      "guided pilot source snapshot is missing required output: public/artifact-meta.json"
    ],
    ["source", "src/App.tsx", "guided pilot source snapshot is missing a required src file"],
    ["dist", "index.html", "guided pilot dist snapshot is missing required output: index.html"],
    ["dist", "artifact-meta.json", "guided pilot dist snapshot is missing required output: artifact-meta.json"]
  ]) {
    expectFailure(`${rootLabel} required snapshot output missing: ${relativePath}`, expected, () => {
      const fixture = createFixture(newCaseRoot(`required-${rootLabel}-${relativePath.replaceAll("/", "-")}`));
      const target = resolve(fixture.pilotRoot, `readiness/workspace/${rootLabel}/${relativePath}`);
      rmSync(target, { force: true });
      refreshSnapshotManifest(fixture, rootLabel);
      validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
    });
  }

  expectFailure("empty source snapshot", "guided pilot source tree manifest schema failed", () => {
    const fixture = createFixture(newCaseRoot("empty-source-snapshot"));
    const sourceRoot = resolve(fixture.pilotRoot, "readiness/workspace/source");
    rmSync(sourceRoot, { recursive: true, force: true });
    mkdirSync(sourceRoot, { recursive: true });
    refreshSnapshotManifest(fixture, "source");
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("empty dist snapshot", "guided pilot dist tree manifest schema failed", () => {
    const fixture = createFixture(newCaseRoot("empty-dist-snapshot"));
    const distRoot = resolve(fixture.pilotRoot, "readiness/workspace/dist");
    rmSync(distRoot, { recursive: true, force: true });
    mkdirSync(distRoot, { recursive: true });
    refreshSnapshotManifest(fixture, "dist");
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("winner drift", "guided pilot result schema failed", () => {
    const fixture = createFixture(newCaseRoot("winner"));
    const result = readJson(fixture.resultPath);
    result.winner = "consumer";
    writeJson(fixture.resultPath, result);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("blind runId collision", "guided pilot contract schema failed", () => {
    const fixture = createFixture(newCaseRoot("blind-run-id"));
    const contract = readJson(fixture.contractPath);
    contract.runId = "blind-prd-03";
    writeJson(fixture.contractPath, contract);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("synthetic runId collision", "must not overlap blind or synthetic namespaces", () => {
    const fixture = createFixture(newCaseRoot("synthetic-run-id"));
    const contract = readJson(fixture.contractPath);
    contract.runId = "guided-pilot-synthetic-collision";
    contract.evidenceRoot = "quality/blind-harness/guided-pilots/guided-pilot-synthetic-collision";
    writeJson(fixture.contractPath, contract);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("evidence root reserved path", "guided pilot contract schema failed", () => {
    const fixture = createFixture(newCaseRoot("reserved-path"));
    const contract = readJson(fixture.contractPath);
    contract.evidenceRoot = "quality/blind-runs/guided-pilot-multimodel-20260809-01";
    writeJson(fixture.contractPath, contract);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("final eligible path cannot be introduced", "guided pilot contract schema failed", () => {
    const fixture = createFixture(newCaseRoot("forbidden-input-path"));
    const contract = readJson(fixture.contractPath);
    contract.source.current.path = "../final-eligible-prd.md";
    writeJson(fixture.contractPath, contract);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("source current hash mismatch", "consumed historical source bytes SHA-256", () => {
    const fixture = createFixture(newCaseRoot("source-current-hash"));
    const contract = readJson(fixture.contractPath);
    contract.source.current.sha256 = "0".repeat(64);
    writeJson(fixture.contractPath, contract);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("source original receipt hash mismatch", "source receipt original historical receipt SHA-256", () => {
    const fixture = createFixture(newCaseRoot("source-receipt-hash"));
    const sourceReceiptPath = resolve(fixture.pilotRoot, "source-receipt.json");
    const sourceReceipt = readJson(sourceReceiptPath);
    sourceReceipt.originalReceipt.sha256 = "0".repeat(64);
    writeJson(sourceReceiptPath, sourceReceipt);
    const contract = readJson(fixture.contractPath);
    contract.source.receipt = receipt(fixture.pilotRoot, sourceReceiptPath);
    writeJson(fixture.contractPath, contract);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("canonical package receipt drift", "guided pilot canonical package receipt SHA-256", () => {
    const fixture = createFixture(newCaseRoot("canonical-package-drift"));
    const canonicalReceiptPath = resolve(
      fixture.kitRoot,
      "quality/blind-harness/synthetic-consumer-package-receipt.json"
    );
    const canonicalReceipt = readJson(canonicalReceiptPath);
    canonicalReceipt.package.version = "0.1.1";
    writeJson(canonicalReceiptPath, canonicalReceipt);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("external flow contract drift", "external flow entry", () => {
    const fixture = createFixture(newCaseRoot("external-flow-drift"));
    const externalFlowPath = resolve(fixture.pilotRoot, "inputs/flow-contract.json");
    const externalFlow = readJson(externalFlowPath);
    externalFlow.entry.route = "/drift";
    writeJson(externalFlowPath, externalFlow);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("consent drift", "guided pilot consent protectedFinalEligible.contentRead", () => {
    const fixture = createFixture(newCaseRoot("consent-drift"));
    const consentPath = resolve(fixture.pilotRoot, "consent.json");
    const consent = readJson(consentPath);
    consent.protectedFinalEligible.contentRead = true;
    writeJson(consentPath, consent);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("consent selected source path drift", "guided pilot consent source path", () => {
    const fixture = createFixture(newCaseRoot("consent-source-path-drift"));
    const consentPath = resolve(fixture.pilotRoot, "consent.json");
    const consent = readJson(consentPath);
    consent.selectedSource.path = "unexpected-historical-source.md";
    writeJson(consentPath, consent);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("consent historical status drift", "guided pilot consent historical status", () => {
    const fixture = createFixture(newCaseRoot("consent-historical-status-drift"));
    const consentPath = resolve(fixture.pilotRoot, "consent.json");
    const consent = readJson(consentPath);
    consent.selectedSource.historicalStatus = "invalidated-revealed";
    writeJson(consentPath, consent);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("consent rejects protected path field", "guided pilot consent selectedSource has unexpected fields", () => {
    const fixture = createFixture(newCaseRoot("consent-extra-field"));
    const consentPath = resolve(fixture.pilotRoot, "consent.json");
    const consent = readJson(consentPath);
    consent.selectedSource.protectedPath = "final-eligible-prd.md";
    writeJson(consentPath, consent);
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("artifact reuse", "guided pilot artifactId is reused", () => {
    const fixture = createFixture(newCaseRoot("artifact-reuse"));
    createSiblingContract(fixture, { artifactId: fixture.contract.artifactId });
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("workspace reuse", "guided pilot workspace is reused", () => {
    const fixture = createFixture(newCaseRoot("workspace-reuse"));
    createSiblingContract(fixture, { workspacePath: fixture.contract.workspace.path });
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("runId reuse", "guided pilot runId is reused", () => {
    const fixture = createFixture(newCaseRoot("run-id-reuse"));
    createSiblingContract(fixture, { runId: fixture.contract.runId });
    validateGuidedPilotContract(fixture.contractPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("registry fingerprint drift", "registry post fingerprint sha256", () => {
    const fixture = createFixture(newCaseRoot("registry-drift"));
    const result = readJson(fixture.resultPath);
    result.isolation.registry.post.sha256 = "0".repeat(64);
    writeJson(fixture.resultPath, result);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("synthetic ledger fingerprint drift", "synthetic ledger post fingerprint sha256", () => {
    const fixture = createFixture(newCaseRoot("synthetic-ledger-drift"));
    const result = readJson(fixture.resultPath);
    result.isolation.syntheticLedger.post.sha256 = "0".repeat(64);
    writeJson(fixture.resultPath, result);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation tarball receipt mismatch", "guided pilot generation tarball SHA-256", () => {
    const fixture = createFixture(newCaseRoot("generation-tarball-drift"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.consumerPackage.tarball.sha256 = "0".repeat(64);
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation status drift", "guided pilot generation status", () => {
    const fixture = createFixture(newCaseRoot("generation-status-drift"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.status = "failed";
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation exit code drift", "guided pilot generation exit code", () => {
    const fixture = createFixture(newCaseRoot("generation-exit-code-drift"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.exitCode = 1;
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation timeout drift", "guided pilot generation timedOut", () => {
    const fixture = createFixture(newCaseRoot("generation-timeout-drift"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.timedOut = true;
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("attempt-02 output verification missing", "required-output verification must be an object", () => {
    const fixture = createFixture(newCaseRoot("generation-output-verification-missing"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.version = "1.0.0";
    delete generation.requiredOutputVerification;
    delete generation.failureCategory;
    delete generation.execution;
    const attempt02Path = resolve(fixture.pilotRoot, "generation-attempt-02/command.json");
    writeJson(attempt02Path, generation);
    refreshGenerationReceipt(fixture, attempt02Path);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation output contract weakened", "guided pilot generation command schema failed", () => {
    const fixture = createFixture(newCaseRoot("generation-output-contract-weakened"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.requiredOutputVerification.requiredOutputs = [];
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation legacy evidence version", "guided pilot generation evidence version", () => {
    const fixture = createFixture(newCaseRoot("generation-legacy-version"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.version = "1.0.0";
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation output missing", "guided pilot generation required outputs are missing", () => {
    const fixture = createFixture(newCaseRoot("generation-output-missing"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.requiredOutputVerification.missingOutputs = ["package.json"];
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation prompt receipt missing", "guided pilot generation prompt is missing", () => {
    const fixture = createFixture(newCaseRoot("generation-prompt-missing"));
    rmSync(resolve(fixture.pilotRoot, "generation-attempt-03/prompt.md"), { force: true });
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation stdout receipt hash drift", "guided pilot generation stdout SHA-256", () => {
    const fixture = createFixture(newCaseRoot("generation-stdout-hash-drift"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.stdout.sha256 = "0".repeat(64);
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation stderr receipt path drift", "guided pilot generation command schema failed", () => {
    const fixture = createFixture(newCaseRoot("generation-stderr-path-drift"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.stderr.path = "other.log";
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation runner live drift", "guided pilot generation runner bytes", () => {
    const fixture = createFixture(newCaseRoot("generation-runner-live-drift"));
    writeText(
      resolve(fixture.kitRoot, "scripts/run-guided-pilot-generation-agent.mjs"),
      "export const guidedPilotGenerationRunnerFixture = false;\n"
    );
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation source package receipt drift", "guided pilot generation source package receipt sha256", () => {
    const fixture = createFixture(newCaseRoot("generation-source-package-drift"));
    const sourceReceiptPath = resolve(
      fixture.pilotRoot,
      "readiness/workspace/source/consumer-package-receipt.json"
    );
    const sourceReceipt = readJson(sourceReceiptPath);
    sourceReceipt.package.version = "0.1.1";
    writeJson(sourceReceiptPath, sourceReceipt);
    refreshSnapshotManifest(fixture, "source");
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.consumerPackage.receipt = receipt(
      resolve(fixture.pilotRoot, "readiness/workspace/source"),
      sourceReceiptPath
    );
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation source package receipt missing", "guided pilot generation source package receipt is missing", () => {
    const fixture = createFixture(newCaseRoot("generation-source-package-missing"));
    rmSync(
      resolve(fixture.pilotRoot, "readiness/workspace/source/consumer-package-receipt.json"),
      { force: true }
    );
    refreshSnapshotManifest(fixture, "source");
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation immutable source drift", "guided pilot generation immutableBefore SHA-256", () => {
    const fixture = createFixture(newCaseRoot("generation-immutable-source-drift"));
    writeText(resolve(fixture.pilotRoot, "readiness/workspace/source/AGENTS.md"), "tampered immutable input\n");
    refreshSnapshotManifest(fixture, "source");
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("generation immutable forged equality", "guided pilot generation immutableBefore SHA-256", () => {
    const fixture = createFixture(newCaseRoot("generation-immutable-forged-equality"));
    const generationPath = resolve(fixture.pilotRoot, "generation-attempt-03/command.json");
    const generation = readJson(generationPath);
    generation.immutableBeforeSha256 = "0".repeat(64);
    generation.immutableAfterSha256 = "0".repeat(64);
    writeJson(generationPath, generation);
    refreshGenerationReceipt(fixture, generationPath);
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  expectFailure("source tree overlaps synthetic ledger", "source tree SHA-256 overlaps the synthetic readiness ledger", () => {
    const fixture = createFixture(newCaseRoot("tree-overlap"), { overlapSourceTree: true });
    validateGuidedPilot(fixture.contractPath, fixture.resultPath, { kitRoot: fixture.kitRoot });
  });

  console.log(`test-guided-pilot passed: positive=6; negative=${negativeCount}; protected=flags,identity,source,receipts,trees,snapshot-content,fingerprints,paths,generation-output,readiness-status,flow-semantics,stage-evidence`);
} catch (error) {
  console.error(`test-guided-pilot failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  const prefix = resolve(tmpdir(), "ai-readable-kit-guided-pilot-");
  if (!resolve(tempRoot).startsWith(prefix)) {
    throw new Error(`refusing to clean unexpected guided pilot test root: ${tempRoot}`);
  }
  rmSync(tempRoot, { recursive: true, force: true });
}

function createFixture(caseRoot, { overlapSourceTree = false } = {}) {
  const fixtureKitRoot = resolve(caseRoot, "kit");
  const runId = "guided-pilot-multimodel-20260809-01";
  const artifactId = "2c454720-3fad-41e8-b1f7-48ef312e19ae";
  const projectId = "guided-multi-model-platform";
  const historicalRunId = "blind-prd-03-replacement-01";
  const pilotRoot = resolve(fixtureKitRoot, "quality/blind-harness/guided-pilots", runId);
  const readinessRoot = resolve(pilotRoot, "readiness");
  const registryPath = resolve(fixtureKitRoot, "quality/blind-adoption-registry.json");
  const syntheticLedgerPath = resolve(
    fixtureKitRoot,
    "quality/blind-harness/synthetic-readiness-matrix-report.json"
  );
  const historicalReceiptPath = resolve(
    fixtureKitRoot,
    "quality/blind-runs/blind-prd-03-replacement-01/input-receipt.json"
  );
  const runnerPath = resolve(fixtureKitRoot, "scripts/run-guided-pilot-flow-smoke.mjs");
  const generationRunnerPath = resolve(
    fixtureKitRoot,
    "scripts/run-guided-pilot-generation-agent.mjs"
  );
  mkdirSync(pilotRoot, { recursive: true });
  mkdirSync(dirname(registryPath), { recursive: true });
  mkdirSync(dirname(historicalReceiptPath), { recursive: true });
  mkdirSync(dirname(runnerPath), { recursive: true });
  mkdirSync(dirname(generationRunnerPath), { recursive: true });

  const sourcePath = resolve(pilotRoot, "inputs/guided-prd.md");
  writeText(sourcePath, "historical guided pilot fixture\n");
  const sourceCurrent = receipt(pilotRoot, sourcePath);
  writeJson(historicalReceiptPath, {
    version: "1.1.0",
    runId: historicalRunId,
    status: "received-unopened",
    source: {
      path: "historical-source.md",
      bytes: sourceCurrent.bytes,
      sha256: sourceCurrent.sha256
    }
  });
  writeJson(registryPath, {
    version: "1.1.0",
    runs: [
      {
        runId: historicalRunId,
        status: "completed",
        qualifying: true,
        inputStatus: "revealed"
      }
    ]
  });

  const sourceManifestPath = resolve(readinessRoot, "workspace/source-manifest.json");
  const distManifestPath = resolve(readinessRoot, "workspace/dist-manifest.json");
  const sourceSnapshotRoot = resolve(readinessRoot, "workspace/source");
  const distSnapshotRoot = resolve(readinessRoot, "workspace/dist");
  writeText(resolve(sourceSnapshotRoot, "package.json"), "{\"name\":\"fixture-product\"}\n");
  writeText(resolve(sourceSnapshotRoot, "index.html"), "<main>fixture source</main>\n");
  writeText(resolve(sourceSnapshotRoot, "src/App.tsx"), "export const App = () => null;\n");
  writeText(resolve(sourceSnapshotRoot, "public/artifact-meta.json"), "{\"artifact\":\"fixture\"}\n");
  writeText(resolve(distSnapshotRoot, "index.html"), "<main>fixture</main>\n");
  writeText(resolve(distSnapshotRoot, "artifact-meta.json"), "{\"artifact\":\"fixture\"}\n");
  writeText(resolve(distSnapshotRoot, "assets/app.js"), "console.log('fixture');\n");
  const sourceManifest = buildFixtureTreeManifest(sourceSnapshotRoot, "source");
  const distManifest = buildFixtureTreeManifest(distSnapshotRoot, "dist");
  const sourceTreeSha256 = sourceManifest.treeSha256;
  writeJson(sourceManifestPath, sourceManifest);
  writeJson(distManifestPath, distManifest);
  writeJson(syntheticLedgerPath, {
    version: "1.0.0",
    qualifying: false,
    scoring: false,
    cells: overlapSourceTree ? [{ sourceTreeSha256 }] : []
  });

  const sourceReceiptPath = resolve(pilotRoot, "source-receipt.json");
  writeJson(sourceReceiptPath, {
    $schema: "guided-pilot-source-receipt.v1",
    version: "1.0.0",
    kind: "consumed-historical-prd",
    historicalRunId,
    originalReceipt: receipt(fixtureKitRoot, historicalReceiptPath),
    current: sourceCurrent
  });

  const frozenTarball = {
    path: ".local-pack/ai-readable-kit-0.1.0-a38cc586fd15.tgz",
    bytes: Buffer.byteLength("fixture frozen package tarball\n"),
    sha256: sha256("fixture frozen package tarball\n")
  };
  const canonicalReceiptPath = resolve(
    fixtureKitRoot,
    "quality/blind-harness/synthetic-consumer-package-receipt.json"
  );
  writeJson(canonicalReceiptPath, {
    version: "1.0.0",
    package: { name: "@ai-readable/kit", version: "0.1.0" },
    frozenPack: structuredClone(frozenTarball)
  });
  const packageReceiptPath = resolve(pilotRoot, "package/package-receipt.json");
  const packageReceipt = {
    $schema: "guided-pilot-package-receipt.v1",
    version: "1.0.0",
    kind: "guided-pilot-package-receipt",
    package: { name: "@ai-readable/kit", version: "0.1.0" },
    canonicalReceipt: receipt(fixtureKitRoot, canonicalReceiptPath),
    frozenTarball: structuredClone(frozenTarball)
  };
  writeJson(packageReceiptPath, packageReceipt);

  writeText(runnerPath, "export const guidedPilotRunnerFixture = true;\n");
  const runnerReceipt = receipt(fixtureKitRoot, runnerPath);
  const frozenFlowRunnerPath = resolve(readinessRoot, "flow/runner.mjs");
  writeText(frozenFlowRunnerPath, "export const guidedPilotRunnerFixture = true;\n");
  const frozenFlowRunnerReceipt = receipt(readinessRoot, frozenFlowRunnerPath);
  const externalFlowContractPath = resolve(pilotRoot, "inputs/flow-contract.json");
  const externalFlowContract = {
    $schema: "guided-pilot-flow-contract.v1",
    version: "1.0.0",
    contractId: runId,
    owner: "guided-pilot-harness",
    projectId,
    source: {
      kind: "consumed-historical-prd",
      historicalReceipt: receipt(fixtureKitRoot, historicalReceiptPath),
      currentPrd: { bytes: sourceCurrent.bytes, sha256: sourceCurrent.sha256 }
    },
    entry: { route: "/home", identityPath: "/artifact-meta.json" },
    requiredTestIds: ["go-button", "ready-state", "second-ready-state"],
    flows: [
      {
        flowId: "flow-01",
        steps: [
          {
            stepId: "step-01",
            pageId: "home",
            action: { type: "click", testId: "go-button" },
            assertions: [{ kind: "visibleTestId", testId: "ready-state" }]
          },
          {
            stepId: "step-02",
            pageId: "home",
            action: { type: "navigate", route: "/home" },
            assertions: [{ kind: "route", value: "/home" }]
          }
        ]
      },
      {
        flowId: "flow-02",
        steps: [
          {
            stepId: "step-03",
            pageId: "home",
            action: { type: "navigate", route: "/home" },
            assertions: [{ kind: "visibleTestId", testId: "second-ready-state" }]
          },
          {
            stepId: "step-04",
            pageId: "home",
            action: { type: "navigate", route: "/home" },
            assertions: [{ kind: "route", value: "/home" }]
          }
        ]
      }
    ]
  };
  writeJson(externalFlowContractPath, externalFlowContract);
  const readinessFlowContractPath = resolve(readinessRoot, "inputs/flow-contract.json");
  writeText(readinessFlowContractPath, readFileSync(externalFlowContractPath, "utf8"));

  writeText(resolve(sourceSnapshotRoot, "AGENTS.md"), "fixture generation instructions\n");
  writeJson(resolve(sourceSnapshotRoot, "artifact-identity.json"), { runId, artifactId, projectId });
  writeJson(resolve(sourceSnapshotRoot, "business-context.json"), { projectId, category: "fixture" });
  writeJson(resolve(sourceSnapshotRoot, "generation-request.json"), { runId, artifactId });
  writeText(resolve(sourceSnapshotRoot, "project-description.json"), "{\"fixture\":true}\n");
  writeText(resolve(sourceSnapshotRoot, "sample-pack.json"), "{\"fixture\":true}\n");
  writeText(resolve(sourceSnapshotRoot, "flow-contract.json"), readFileSync(externalFlowContractPath, "utf8"));
  writeText(resolve(sourceSnapshotRoot, "guided-prd.md"), readFileSync(sourcePath, "utf8"));
  writeText(resolve(sourceSnapshotRoot, "consumer-package-receipt.json"), readFileSync(canonicalReceiptPath, "utf8"));
  const finalSourceManifest = buildFixtureTreeManifest(sourceSnapshotRoot, "source");
  const finalDistManifest = buildFixtureTreeManifest(distSnapshotRoot, "dist");
  writeJson(sourceManifestPath, finalSourceManifest);
  writeJson(distManifestPath, finalDistManifest);
  writeJson(syntheticLedgerPath, {
    version: "1.0.0",
    qualifying: false,
    scoring: false,
    cells: overlapSourceTree ? [{ sourceTreeSha256: finalSourceManifest.treeSha256 }] : []
  });

  const contractPath = resolve(pilotRoot, "guided-pilot-contract.json");
  const contract = {
    $schema: "guided-pilot-contract.v1",
    version: "1.0.0",
    mode: "non-scoring-guided-pilot",
    runId,
    artifactId,
    projectId,
    evidenceRoot: `quality/blind-harness/guided-pilots/${runId}`,
    workspace: { path: `.guided-pilot-workspaces/${runId}` },
    consent: {
      mode: "explicit",
      scope: "one-consumed-historical-prd",
      recordedAtUtc: "2026-08-09T10:00:00.000Z"
    },
    source: {
      kind: "consumed-historical-prd",
      historicalRunId,
      receipt: receipt(pilotRoot, sourceReceiptPath),
      current: sourceCurrent
    },
    flowContract: structuredClone(externalFlowContract),
    package: {
      name: "@ai-readable/kit",
      receipt: receipt(pilotRoot, packageReceiptPath)
    },
    commandStages: ["typecheck", "build", "flow-smoke"],
    qualifying: false,
    scoring: false,
    winner: null,
    registryWrite: false,
    syntheticLedgerWrite: false,
    isolation: {
      registry: receipt(fixtureKitRoot, registryPath),
      syntheticLedger: receipt(fixtureKitRoot, syntheticLedgerPath)
    }
  };
  writeJson(contractPath, contract);

  const consentPath = resolve(pilotRoot, "consent.json");
  writeJson(consentPath, {
    $schema: "guided-pilot-consent.v1",
    version: "1.0.0",
    authorization: {
      explicit: true,
      scope: contract.consent.scope,
      userStatement: "fixture consent for one consumed historical PRD"
    },
    recordedAtUtc: contract.consent.recordedAtUtc,
    selectedSource: {
      historicalRunId,
      path: "historical-source.md",
      bytes: sourceCurrent.bytes,
      sha256: sourceCurrent.sha256,
      qualificationAlreadyConsumed: true,
      historicalStatus: "completed-revealed"
    },
    pilotAccounting: {
      qualifying: false,
      scoring: false,
      winner: null,
      registryWrite: false,
      syntheticLedgerWrite: false
    },
    protectedFinalEligible: {
      excluded: true,
      pathRecordedInPilot: false,
      hashRecorded: false,
      contentRead: false
    }
  });

  writeText(generationRunnerPath, "export const guidedPilotGenerationRunnerFixture = true;\n");
  const generationRunnerReceipt = receipt(fixtureKitRoot, generationRunnerPath);
  const generationCommandPath = resolve(pilotRoot, "generation-attempt-03/command.json");
  const generationRoot = dirname(generationCommandPath);
  writeText(resolve(generationRoot, "prompt.md"), "fixture generation prompt\n");
  writeText(resolve(generationRoot, "stdout.log"), "fixture generation completed\n");
  writeText(resolve(generationRoot, "stderr.log"), "");
  const generationTarball = {
    path: "vendor/ai-readable-kit-0.1.0-a38cc586fd15.tgz",
    bytes: frozenTarball.bytes,
    sha256: frozenTarball.sha256
  };
  const immutableWorkspaceSha256 = fixtureGenerationImmutableTreeSha256(sourceSnapshotRoot, generationTarball);
  writeJson(generationCommandPath, {
    $schema: "https://ai-readable.local/schema/guided-pilot-generation-evidence.schema.json",
    version: "1.1.0",
    stage: "guided-pilot-generation",
    runId,
    artifactId,
    arm: "consumer",
    outputMode: "kit-consumer",
    qualifying: false,
    scoring: false,
    status: "passed",
    exitCode: 0,
    timedOut: false,
    failure: null,
    spawnError: null,
    terminationSignal: null,
    failureCategory: null,
    provider: "codex",
    model: "fixture-model",
    reasoningEffort: "high",
    command: "fixture-generation-command",
    args: [],
    cwd: "H:/fixture/.guided-pilot-workspaces/guided-pilot-multimodel-20260809-01",
    execution: {
      provider: "codex",
      sandboxMode: "command-override",
      workspace: "H:/fixture/.guided-pilot-workspaces/guided-pilot-multimodel-20260809-01"
    },
    runner: generationRunnerReceipt,
    prompt: receipt(generationRoot, resolve(generationRoot, "prompt.md")),
    startedAtUtc: "2026-08-09T10:00:00.000Z",
    stoppedAtUtc: "2026-08-09T10:01:00.000Z",
    requiredOutputVerification: {
      requiredOutputs: ["package.json", "index.html", "src", "public/artifact-meta.json"],
      missingOutputs: []
    },
    consumerPackage: {
      name: contract.package.name,
      version: packageReceipt.package.version,
      tarball: generationTarball,
      receipt: {
        path: "consumer-package-receipt.json",
        bytes: packageReceipt.canonicalReceipt.bytes,
        sha256: packageReceipt.canonicalReceipt.sha256
      }
    },
    stdout: receipt(generationRoot, resolve(generationRoot, "stdout.log")),
    stderr: receipt(generationRoot, resolve(generationRoot, "stderr.log")),
    immutableBeforeSha256: immutableWorkspaceSha256,
    immutableAfterSha256: immutableWorkspaceSha256
  });
  const flowResultPath = resolve(readinessRoot, "flow/result.json");
  writeJson(flowResultPath, {
    $schema: "guided-pilot-flow-smoke-result.v1",
    kind: "guided-pilot-flow-result",
    version: "1.0.0",
    runner: {
      ...runnerReceipt,
      version: "1.0.0",
      browser: {
        engine: "chromium",
        executablePath: "C:/fixture/chrome.exe",
        executableSha256: sha256("fixture chrome"),
        source: "installed-chrome"
      }
    },
    contract: {
      path: readinessFlowContractPath.replaceAll("\\", "/"),
      bytes: readFileSync(readinessFlowContractPath).length,
      sha256: sha256(readFileSync(readinessFlowContractPath)),
      contractId: runId
    },
    baseUrl: "http://127.0.0.1:4262",
    startedAtUtc: "2026-08-09T10:00:10.000Z",
    stoppedAtUtc: "2026-08-09T10:00:20.000Z",
    status: "passed",
    firstFailure: null,
    observations: emptyFlowObservations(),
    flows: passedFlowResults(externalFlowContract.flows)
  });
  const readinessResultPath = resolve(readinessRoot, "result.json");
  const readinessFlowReceipt = receipt(readinessRoot, readinessFlowContractPath);
  const flowResultReceipt = receipt(pilotRoot, flowResultPath);
  const readinessFlowResultReceipt = receipt(readinessRoot, flowResultPath);
  const typecheckCommandReceipt = writeReadinessCommandFixture(
    readinessRoot,
    "commands/01-typecheck",
    "typecheck"
  );
  const buildCommandReceipt = writeReadinessCommandFixture(
    readinessRoot,
    "commands/02-build",
    "build"
  );
  const previewCommandReceipt = writeReadinessCommandFixture(
    readinessRoot,
    "commands/03-preview",
    "preview",
    { exitCode: null, termination: "requested-shutdown", terminationSignal: "SIGTERM" }
  );
  const identityResponsePath = resolve(readinessRoot, "preview/identity-response.json");
  const entryResponsePath = resolve(readinessRoot, "preview/entry-response.html");
  writeText(
    identityResponsePath,
    readFileSync(resolve(sourceSnapshotRoot, "public/artifact-meta.json"), "utf8")
  );
  writeText(entryResponsePath, readFileSync(resolve(distSnapshotRoot, "index.html"), "utf8"));
  writeJson(readinessResultPath, {
    $schema: "https://ai-readable.local/schema/guided-pilot-readiness.schema.json",
    version: "1.0.0",
    harnessMode: "guided-pilot-readiness",
    runId,
    artifactId,
    projectId,
    inputs: {
      flowContract: readinessFlowReceipt,
      flowRunner: frozenFlowRunnerReceipt
    },
    workspace: {
      path: "H:/fixture/.guided-pilot-workspaces/guided-pilot-multimodel-20260809-01",
      sourceManifest: receipt(readinessRoot, sourceManifestPath),
      distManifest: receipt(readinessRoot, distManifestPath)
    },
    metrics: {
      typecheckPass: true,
      buildPass: true,
      flowSmokePass: true,
      previewIdentityPass: true
    },
    stages: {
      typecheck: { status: "passed", commandEvidence: typecheckCommandReceipt, reason: null },
      build: { status: "passed", commandEvidence: buildCommandReceipt, reason: null },
      preview: {
        status: "passed",
        commandEvidence: previewCommandReceipt,
        baseUrl: "http://127.0.0.1:4262",
        identity: {
          status: "passed",
          httpStatus: 200,
          response: receipt(readinessRoot, identityResponsePath),
          reason: null
        },
        entry: {
          status: "passed",
          httpStatus: 200,
          response: receipt(readinessRoot, entryResponsePath),
          reason: null
        },
        shutdown: {
          status: "passed",
          requestedAtUtc: "2026-08-09T10:00:45.000Z",
          observedAtUtc: "2026-08-09T10:00:46.000Z",
          processExited: true,
          endpointUnavailable: true,
          reason: null
        },
        reason: null
      },
      flowSmoke: {
        status: "passed",
        contract: readinessFlowReceipt,
        runner: frozenFlowRunnerReceipt,
        result: readinessFlowResultReceipt,
        reason: null
      }
    },
    status: "passed",
    failure: null,
    startedAtUtc: "2026-08-09T10:00:00.000Z",
    stoppedAtUtc: "2026-08-09T10:01:00.000Z"
  });

  const resultPath = resolve(pilotRoot, "guided-pilot-result.json");
  const result = {
    $schema: "guided-pilot-result.v1",
    version: "1.0.0",
    mode: "non-scoring-guided-pilot",
    runId,
    artifactId,
    projectId,
    evidenceRoot: contract.evidenceRoot,
    workspace: structuredClone(contract.workspace),
    status: "passed",
    qualifying: false,
    scoring: false,
    winner: null,
    registryWrite: false,
    syntheticLedgerWrite: false,
    contract: receipt(pilotRoot, contractPath),
    source: {
      receipt: structuredClone(contract.source.receipt),
      current: structuredClone(contract.source.current)
    },
    package: structuredClone(contract.package),
    generation: { command: receipt(pilotRoot, generationCommandPath) },
    readiness: { result: receipt(pilotRoot, readinessResultPath) },
    flow: {
      runner: runnerReceipt,
      result: flowResultReceipt
    },
    isolation: {
      registry: {
        pre: structuredClone(contract.isolation.registry),
        post: structuredClone(contract.isolation.registry)
      },
      syntheticLedger: {
        pre: structuredClone(contract.isolation.syntheticLedger),
        post: structuredClone(contract.isolation.syntheticLedger)
      }
    }
  };
  writeJson(resultPath, result);
  return { kitRoot: fixtureKitRoot, pilotRoot, contractPath, resultPath, contract, result };
}

function createSiblingContract(fixture, overrides = {}) {
  const siblingRunId = overrides.runId ?? "guided-pilot-sibling-01";
  const siblingRoot = resolve(
    fixture.kitRoot,
    "quality/blind-harness/guided-pilots",
    "guided-pilot-sibling-01"
  );
  mkdirSync(siblingRoot, { recursive: true });
  const sibling = structuredClone(fixture.contract);
  sibling.runId = siblingRunId;
  sibling.artifactId = overrides.artifactId ?? "a3456720-3fad-41e8-b1f7-48ef312e19ae";
  sibling.evidenceRoot = `quality/blind-harness/guided-pilots/guided-pilot-sibling-01`;
  sibling.workspace.path = overrides.workspacePath ?? ".guided-pilot-workspaces/guided-pilot-sibling-01";
  sibling.flowContract.contractId = siblingRunId;
  writeJson(resolve(siblingRoot, "guided-pilot-contract.json"), sibling);
}

function newCaseRoot(name) {
  const root = resolve(tempRoot, name);
  mkdirSync(root, { recursive: true });
  return root;
}

function receipt(root, path) {
  const bytes = readFileSync(path);
  const relativePath = relative(resolve(root), resolve(path)).replaceAll("\\", "/");
  if (!relativePath || relativePath.startsWith("../")) {
    throw new Error(`fixture receipt escaped root: ${path}`);
  }
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function refreshGenerationReceipt(fixture, generationPath) {
  const result = readJson(fixture.resultPath);
  result.generation.command = receipt(fixture.pilotRoot, generationPath);
  writeJson(fixture.resultPath, result);
}

function refreshReadinessCommandReceipt(fixture, stage, commandPath) {
  const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
  const readiness = readJson(readinessPath);
  readiness.stages[stage].commandEvidence = receipt(resolve(fixture.pilotRoot, "readiness"), commandPath);
  writeJson(readinessPath, readiness);
  refreshReadinessReceipt(fixture, readinessPath);
}

function refreshSnapshotManifest(fixture, rootLabel) {
  const readinessRoot = resolve(fixture.pilotRoot, "readiness");
  const snapshotRoot = resolve(readinessRoot, `workspace/${rootLabel}`);
  const manifestPath = resolve(readinessRoot, `workspace/${rootLabel}-manifest.json`);
  writeJson(manifestPath, buildFixtureTreeManifest(snapshotRoot, rootLabel));
  const readinessPath = resolve(readinessRoot, "result.json");
  const readiness = readJson(readinessPath);
  readiness.workspace[`${rootLabel}Manifest`] = receipt(readinessRoot, manifestPath);
  writeJson(readinessPath, readiness);
  refreshReadinessReceipt(fixture, readinessPath);
}

function refreshFlowResultReceipts(fixture) {
  const readinessRoot = resolve(fixture.pilotRoot, "readiness");
  const flowResultPath = resolve(readinessRoot, "flow/result.json");
  const readinessPath = resolve(readinessRoot, "result.json");
  const readiness = readJson(readinessPath);
  readiness.stages.flowSmoke.result = receipt(readinessRoot, flowResultPath);
  writeJson(readinessPath, readiness);
  const result = readJson(fixture.resultPath);
  result.flow.result = receipt(fixture.pilotRoot, flowResultPath);
  result.readiness.result = receipt(fixture.pilotRoot, readinessPath);
  writeJson(fixture.resultPath, result);
}

function setReadinessFailure(fixture) {
  const flowResultPath = resolve(fixture.pilotRoot, "readiness/flow/result.json");
  const flowResult = readJson(flowResultPath);
  const failureMessage = "fixture flow smoke failure";
  const failedFlow = flowResult.flows[0];
  failedFlow.status = "failed";
  failedFlow.steps = [
    failedFlow.steps[0],
    {
      stepId: failedFlow.steps[1].stepId,
      status: "failed",
      assertions: [],
      error: failureMessage
    }
  ];
  flowResult.flows = [failedFlow];
  flowResult.status = "failed";
  flowResult.firstFailure = {
    stage: "flow-step",
    flowId: failedFlow.flowId,
    stepId: failedFlow.steps[1].stepId,
    message: failureMessage
  };
  writeJson(flowResultPath, flowResult);
  const readinessPath = resolve(fixture.pilotRoot, "readiness/result.json");
  const readiness = readJson(readinessPath);
  readiness.metrics.flowSmokePass = false;
  readiness.stages.flowSmoke.status = "failed";
  readiness.stages.flowSmoke.result = receipt(resolve(fixture.pilotRoot, "readiness"), flowResultPath);
  readiness.stages.flowSmoke.reason = failureMessage;
  readiness.status = "failed";
  readiness.failure = {
    category: "flow-smoke",
    firstFailureStage: "flowSmoke",
    message: failureMessage
  };
  writeJson(readinessPath, readiness);
  const result = readJson(fixture.resultPath);
  result.flow.result = receipt(fixture.pilotRoot, flowResultPath);
  result.readiness.result = receipt(fixture.pilotRoot, readinessPath);
  writeJson(fixture.resultPath, result);
}

function refreshReadinessReceipt(fixture, readinessPath) {
  const result = readJson(fixture.resultPath);
  result.readiness.result = receipt(fixture.pilotRoot, readinessPath);
  writeJson(fixture.resultPath, result);
}

function relocateReadinessFixture(fixture) {
  const sourceRoot = resolve(fixture.pilotRoot, "readiness");
  const targetRoot = resolve(fixture.pilotRoot, "alternate-readiness");
  copyFixtureTree(sourceRoot, targetRoot);
  const targetResultPath = resolve(targetRoot, "result.json");
  writeJson(targetResultPath, readJson(resolve(sourceRoot, "result.json")));
  refreshReadinessReceipt(fixture, targetResultPath);
}

function copyFixtureFile(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(source));
}

function copyFixtureTree(source, target) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = resolve(source, entry.name);
    const targetPath = resolve(target, entry.name);
    if (entry.isDirectory()) copyFixtureTree(sourcePath, targetPath);
    else if (entry.isFile()) copyFixtureFile(sourcePath, targetPath);
    else throw new Error(`fixture tree contains an unsupported entry: ${sourcePath}`);
  }
}

function emptyFlowObservations() {
  return {
    consoleErrors: [],
    consoleErrorDetails: [],
    ignoredConsoleErrors: [],
    pageErrors: [],
    failedResponses: [],
    ignoredResponses: [],
    requestFailures: [],
    ignoredRequestFailures: []
  };
}

function passedFlowResults(flows) {
  return flows.map((flow) => ({
    flowId: flow.flowId,
    status: "passed",
    steps: flow.steps.map((step) => ({
      stepId: step.stepId,
      status: "passed",
      assertions: step.assertions.map((assertion) => ({ ...assertion, status: "passed" }))
    }))
  }));
}

function writeReadinessCommandFixture(readinessRoot, directory, stage, overrides = {}) {
  const commandRoot = resolve(readinessRoot, directory);
  const stdoutPath = resolve(commandRoot, "stdout.log");
  const stderrPath = resolve(commandRoot, "stderr.log");
  const commandPath = resolve(commandRoot, "command.json");
  writeText(stdoutPath, `${stage} fixture output\n`);
  writeText(stderrPath, "");
  writeJson(commandPath, {
    $schema: "guided-pilot-command-receipt.v1",
    version: "1.0.0",
    stage,
    command: "fixture-command",
    args: [],
    cwd: "H:/fixture/.guided-pilot-workspaces/guided-pilot-multimodel-20260809-01",
    startedAtUtc: "2026-08-09T10:00:00.000Z",
    stoppedAtUtc: "2026-08-09T10:00:01.000Z",
    exitCode: overrides.exitCode ?? 0,
    status: overrides.status ?? "passed",
    termination: overrides.termination ?? "completed",
    timedOut: overrides.timedOut ?? false,
    terminationSignal: overrides.terminationSignal ?? null,
    spawnError: overrides.spawnError ?? null,
    stdout: receipt(commandRoot, stdoutPath),
    stderr: receipt(commandRoot, stderrPath)
  });
  return receipt(readinessRoot, commandPath);
}

function fixtureGenerationImmutableTreeSha256(sourceSnapshotRoot, frozenTarball) {
  const immutableFiles = [
    "AGENTS.md",
    "artifact-identity.json",
    "business-context.json",
    "generation-request.json",
    "project-description.json",
    "sample-pack.json",
    "flow-contract.json",
    "guided-prd.md",
    "public/artifact-meta.json",
    "consumer-package-receipt.json"
  ];
  const records = immutableFiles.map((portablePath) => {
    const bytes = readFileSync(resolve(sourceSnapshotRoot, portablePath));
    return `${portablePath}\0${bytes.length}\0${sha256(bytes)}`;
  });
  const fileName = basename(frozenTarball.path);
  records.push(`vendor/${fileName}\0${frozenTarball.bytes}\0${frozenTarball.sha256}`);
  return sha256(Buffer.from(records.sort().join("\n"), "utf8"));
}

function buildFixtureTreeManifest(snapshotRoot, rootLabel) {
  const files = listFixtureTreeFiles(snapshotRoot).map((path) => {
    const bytes = readFileSync(resolve(snapshotRoot, path));
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  return {
    $schema: "guided-pilot-tree-manifest.v1",
    version: "1.0.0",
    algorithm: "sha256-path-bytes-v1",
    rootLabel,
    excluded:
      rootLabel === "source"
        ? [
            ".git/",
            "node_modules/",
            "dist/",
            "evidence/",
            "test-results/",
            "vendor/",
            ".tmp*/",
            "*.tsbuildinfo"
          ]
        : [],
    files,
    treeSha256: sha256(
      Buffer.from(files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join("\n"), "utf8")
    )
  };
}

function listFixtureTreeFiles(root) {
  const files = [];
  walk(root, "");
  return files.sort();

  function walk(current, portableParent) {
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    for (const entry of entries) {
      const portablePath = portableParent ? `${portableParent}/${entry.name}` : entry.name;
      const absolutePath = resolve(current, entry.name);
      const stat = lstatSync(absolutePath);
      if (stat.isDirectory()) walk(absolutePath, portablePath);
      else if (stat.isFile()) files.push(portablePath);
      else throw new Error(`fixture snapshot has an unsupported entry: ${portablePath}`);
    }
  }
}

function expectFailure(label, expected, action) {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expected)) {
      negativeCount += 1;
      return;
    }
    throw new Error(`${label} failed with an unexpected error: ${message}`);
  }
  throw new Error(`${label} did not fail closed`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
