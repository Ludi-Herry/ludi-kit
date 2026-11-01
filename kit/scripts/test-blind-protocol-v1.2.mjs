import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import {
  assertCanonicalIdentity,
  computeRegistryCounts,
  assertionProofToken,
  plannedAssertionProofs,
  plannedObservationProofs,
  semanticAcceptanceSha256,
  sha256Bytes,
  stableDocumentBytes,
  validateEvaluatorReceipt,
  validateEvidenceV12,
  validateFlowV12,
  validateRegistryV11
} from "./blind-protocol-v1.2-lib.mjs";
import { freezeArtifactV12 } from "./freeze-artifact-v1.2.mjs";
import { assertProjectDescriptionConsistency } from "./project-description-consistency-lib.mjs";
import {
  sha256File as sha256ArtifactFile,
  sha256Tree
} from "./same-artifact-lib.mjs";
import { runBlindFlowAcceptance } from "./run-blind-flow-acceptance.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempParent = resolve(tmpdir());
const tempPrefix = "ai-readable-kit-blind-protocol-v12-";
const tempRoot = mkdtempSync(resolve(tempParent, tempPrefix));
const playwrightTestModuleUrl = pathToFileURL(
  resolve(kitRoot, "node_modules/@playwright/test/index.mjs")
).href;
const categories = [
  "N1-missing-artifact-under-test",
  "N2-missing-or-escaping-receipt",
  "N3-artifact-id-mismatch",
  "N4-contract-or-source-drift",
  "N5-dist-drift",
  "N6-runtime-marker-mismatch",
  "N7-fixture-server",
  "N8-cross-arm-reuse",
  "N9-incomplete-evidence",
  "N10-canonical-run-id-mismatch",
  "N11-permanent-seal-bypass",
  "N12-invalid-evaluator-correction",
  "N13-incomplete-failure-evidence",
  "N14-invalid-replacement-accounting",
  "N15-interaction-identity-mismatch",
  "N16-runtime-observation-dummy-expect"
];
let suitePassed = false;

try {
  runHistoricalSuite();
  testCanonicalRunIdentity();
  testPermanentSealBypass();
  testEvaluatorCorrection();
  testFailureEvidence();
  testReplacementAccounting();
  testInteractionIdentity();
  await testRunnerPreflightFailureEvidence();
  await testRunnerPreviewFailureEvidence();
  await testRunnerOwnedInteractionAudit();
  await testRunnerAssertionProofs();
  testProjectDescriptionConsistency();
  console.log(
    `blind protocol v1.2 tests passed: positive=1; negative=16; categories=${categories.join(",")}; runnerEarlyFailureEvidence=missing-preview,preview-exit; runnerAssertionProofs=happy-pass,control-empty-blocked,missing-blocked,wrong-state-blocked,wrong-side-effect-blocked,empty-step-blocked,token-title-only-blocked,skipped-extra-blocked,dummy-step-state-blocked,dummy-side-effect-blocked`
  );
  suitePassed = true;
} finally {
  if (isOwnedTempRoot(tempRoot)) {
    if (suitePassed && process.env.BLIND_PROTOCOL_KEEP_TEMP !== "1") {
      rmSync(tempRoot, { recursive: true, force: true });
    } else {
      process.stderr.write(`[blind-protocol-temp] preserved=${toPortablePath(tempRoot)}\n`);
    }
  } else {
    throw new Error(`refusing to clean an unowned test temp root: ${tempRoot}`);
  }
}

function runHistoricalSuite() {
  const hasNpmRuntime = Boolean(process.env.npm_execpath);
  const command = hasNpmRuntime
    ? process.execPath
    : process.platform === "win32"
      ? "cmd.exe"
      : "npm";
  const args = hasNpmRuntime
    ? [resolve(kitRoot, "scripts/test-same-artifact-acceptance.mjs")]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run test:same-artifact-acceptance"]
      : ["run", "test:same-artifact-acceptance"];
  const result = spawnSync(command, args, {
    cwd: kitRoot,
    encoding: "utf8",
    shell: false,
    // The suite takes ~145s on an idle machine and allows each runner 180s, so a
    // 120s cap failed spuriously. Leave headroom for load.
    timeout: 600_000,
    windowsHide: true
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error("historical N1-N9 suite failed");
  if (!result.stdout.includes("negative=9") ||
      !categories.slice(0, 9).every((category) => result.stdout.includes(category))) {
    throw new Error("historical suite did not report all frozen N1-N9 categories");
  }
}

function testCanonicalRunIdentity() {
  const expected = {
    runId: "blind-prd-02-replacement-01",
    arm: "consumer",
    projectId: "fixture-project",
    artifactId: "11111111-1111-4111-8111-111111111111"
  };
  const drifted = {
    ...expected,
    runId: "blind-prd-03"
  };
  expectFailure(
    () => assertCanonicalIdentity(drifted, expected, "runtime identity"),
    "N10 runId drift",
    "runId"
  );
}

function testPermanentSealBypass() {
  const projectRoot = resolve(tempRoot, "seal-project");
  const sealRoot = resolve(tempRoot, "seals");
  const preRevealPath = resolve(tempRoot, "pre-reveal.json");
  const identity = {
    runId: "blind-prd-02-replacement-01",
    arm: "consumer",
    projectId: "seal-fixture",
    artifactId: "11111111-1111-4111-8111-111111111111"
  };
  createProductFixture(projectRoot, identity);
  writeJson(preRevealPath, makePreRevealFixture(identity));
  const args = [
    "--project-root",
    "seal-project",
    "--pre-reveal-contract",
    "pre-reveal.json",
    "--arm",
    "consumer"
  ];
  freezeArtifactV12(args, { cwd: tempRoot, fixtureSealRoot: sealRoot });
  const counterPath = resolve(tempRoot, "build-count.txt");
  if (readFileSync(counterPath, "utf8").trim() !== "1") {
    throw new Error("N11 fixture first freeze did not execute exactly one build");
  }
  renameSync(
    resolve(projectRoot, "evidence/artifact-under-test.json"),
    resolve(projectRoot, "evidence/artifact-under-test.moved.json")
  );
  expectFailure(
    () => freezeArtifactV12(args, { cwd: tempRoot, fixtureSealRoot: sealRoot }),
    "N11 second freeze",
    "seal already exists"
  );
  if (readFileSync(counterPath, "utf8").trim() !== "1") {
    throw new Error("N11 permanent seal failed to block the second build");
  }
  const sealPath = resolve(sealRoot, `${identity.artifactId}.seal.json`);
  renameSync(sealPath, `${sealPath}.moved`);
  expectFailure(
    () => freezeArtifactV12(args, { cwd: tempRoot, fixtureSealRoot: sealRoot }),
    "N11 missing seal with permanent claim",
    "seal claim already exists"
  );
  if (readFileSync(counterPath, "utf8").trim() !== "1") {
    throw new Error("N11 permanent claim failed to block build after seal movement");
  }
}

function testEvaluatorCorrection() {
  const revision1 = makeEvaluatorReceipt(1);
  validateEvaluatorReceipt(revision1);
  const revision2 = makeEvaluatorReceipt(2, revision1);
  validateEvaluatorReceipt(revision2, {
    previousDocument: revision1,
    previousPath: "../revision-01/evaluator-receipt.json"
  });

  const cases = [
    ["revision", (doc) => {
      doc.revision = 1;
    }],
    ["previous", (doc) => {
      doc.previousRevision.sha256 = "f".repeat(64);
    }],
    ["both arms", (doc) => {
      doc.correction.bothArmsRefrozen = false;
    }],
    ["semantic", (doc) => {
      doc.semanticAcceptanceSha256 = "e".repeat(64);
    }],
    ["product", (doc) => {
      doc.products.consumer.buildSha256 = "d".repeat(64);
    }],
    ["build", (doc) => {
      doc.runner.productBuildInvocations = 1;
    }]
  ];
  for (const [label, mutate] of cases) {
    const invalid = structuredClone(revision2);
    mutate(invalid);
    expectFailure(
      () => validateEvaluatorReceipt(invalid, {
        previousDocument: revision1,
        previousPath: "../revision-01/evaluator-receipt.json"
      }),
      `N12 ${label}`
    );
  }
}

function testFailureEvidence() {
  const root = resolve(tempRoot, "evidence-root");
  mkdirSync(resolve(root, "raw"), { recursive: true });
  const files = {
    "artifact-receipt.json": "{}\n",
    "artifact-seal.json": "{}\n",
    "evaluator-receipt.json": "{}\n",
    "raw/stdout.log": "",
    "raw/stderr.log": "flow failed\n",
    "raw/preview-stdout.log": "",
    "raw/preview-stderr.log": "",
    "raw/interaction-runtime.json": "{}\n",
    "raw/playwright-report.json": "{}\n",
    "raw/assertion-reporter.json": "{}\n",
    "raw/assertion-runtime.json": "{}\n"
  };
  for (const [path, value] of Object.entries(files)) {
    writeText(resolve(root, path), value);
  }
  const flow = makeFlowDocument();
  const evidence = makeFailedEvidence(flow, files);
  validateEvidenceV12(evidence, { flowDocument: flow, evidenceRoot: root });

  const cases = [
    ["command", (doc) => {
      delete doc.command;
    }],
    ["exitCode", (doc) => {
      delete doc.exitCode;
    }],
    ["stdout", (doc) => {
      delete doc.outputs.stdout;
    }],
    ["stderr", (doc) => {
      doc.outputs.stderr.path = "raw/missing-stderr.log";
    }],
    ["interaction runtime", (doc) => {
      delete doc.outputs.interactionRuntime;
    }],
    ["time", (doc) => {
      delete doc.timeIdentity.finishedAt;
    }],
    ["receipt", (doc) => {
      delete doc.artifact.receipt;
    }],
    ["source", (doc) => {
      delete doc.artifact.sourceSha256;
    }]
  ];
  for (const [label, mutate] of cases) {
    const invalid = structuredClone(evidence);
    mutate(invalid);
    expectFailure(
      () => validateEvidenceV12(invalid, { flowDocument: flow, evidenceRoot: root }),
      `N13 ${label}`
    );
  }
}

function testReplacementAccounting() {
  const registry = makeRegistryFixture();
  validateRegistryV11(registry);
  const cases = [
    ["non-invalidated target", (doc) => {
      doc.runs[1].status = "running";
      doc.runs[1].qualifying = null;
    }],
    ["cross-slot target", (doc) => {
      doc.runs[2].slot = 3;
    }],
    ["attempt jump", (doc) => {
      doc.runs[2].attemptNumber = 3;
    }],
    ["duplicate replacement", (doc) => {
      const duplicate = structuredClone(doc.runs[2]);
      duplicate.runId = "blind-prd-02-replacement-02";
      duplicate.attemptNumber = 3;
      duplicate.status = "pre-reveal-frozen";
      duplicate.replacesRunId = "blind-prd-02";
      doc.runs.push(duplicate);
      doc.counts = computeRegistryCounts(doc.runs, 5);
    }],
    ["invalidated occupies slot", (doc) => {
      doc.counts.unreservedSlots -= 1;
    }],
    ["pre-reveal input already revealed", (doc) => {
      doc.runs[2].inputStatus = "revealed";
    }],
    ["pre-reveal input received unopened", (doc) => {
      doc.runs[2].inputStatus = "received-unopened";
    }],
    ["pre-reveal input marked historical", (doc) => {
      doc.runs[2].inputStatus = "historical-frozen";
    }]
  ];
  for (const [label, mutate] of cases) {
    const invalid = structuredClone(registry);
    mutate(invalid);
    expectFailure(() => validateRegistryV11(invalid), `N14 ${label}`);
  }
}

function testInteractionIdentity() {
  const flow = makeFlowDocument();
  const pageRoutes = { alerts: "/alerts", "alert-detail": "/alerts/alert-1" };
  validateFlowV12(flow);
  const mixedFlow = structuredClone(flow);
  const samePageFlow = structuredClone(mixedFlow.flows[0]);
  samePageFlow.flowId = "review-alert-same-page";
  samePageFlow.steps = samePageFlow.steps.map((step, index) => ({
    ...step,
    stepId: `same-page-step-${index + 1}`,
    interactionId: `same-page-interaction-${index + 1}`,
    pageId: "alerts",
    expectedRoute: "/alerts",
    runtimeAssertions: step.runtimeAssertions.map((rule) => ({
      ...rule,
      assertionId: `same-page-${index + 1}-${rule.assertionId}`
    }))
  }));
  samePageFlow.result = {
    ...samePageFlow.result,
    route: "/alerts",
    recoveryInteractionId: "same-page-recovery",
    recoveryExpectedRoute: "/alerts",
    sideEffectAssertions: samePageFlow.result.sideEffectAssertions.map((rule) => ({
      ...rule,
      assertionId: `same-page-${rule.assertionId}`
    }))
  };
  mixedFlow.flows.push(samePageFlow);
  validateFlowV12(mixedFlow);
  const noCrossPageFlow = structuredClone(mixedFlow);
  noCrossPageFlow.flows = [samePageFlow];
  expectFailure(() => validateFlowV12(noCrossPageFlow), "N15 missing approved cross-page flow");
  const recoveryDrift = structuredClone(flow);
  recoveryDrift.flows[0].result.recoveryInteractionId = "other-recovery";
  if (semanticAcceptanceSha256(flow) === semanticAcceptanceSha256(recoveryDrift)) {
    throw new Error("N15 recovery identity did not affect semantic acceptance digest");
  }
  const runtimeAssertionDrift = structuredClone(flow);
  runtimeAssertionDrift.flows[0].steps[0].runtimeAssertions[0].expected = "detail-wrong";
  if (semanticAcceptanceSha256(flow) === semanticAcceptanceSha256(runtimeAssertionDrift)) {
    throw new Error("N16 runtime assertion did not affect semantic acceptance digest");
  }
  const sideEffectAssertionDrift = structuredClone(flow);
  sideEffectAssertionDrift.flows[0].result.sideEffectAssertions[0].expected = "refresh-pending";
  if (semanticAcceptanceSha256(flow) === semanticAcceptanceSha256(sideEffectAssertionDrift)) {
    throw new Error("N16 side-effect assertion did not affect semantic acceptance digest");
  }
  const evidence = makePassedEvidence(flow);
  validateEvidenceV12(evidence, { flowDocument: flow, pageRoutes });
  const cases = [
    ["missing stepId", () => {
      const doc = structuredClone(flow);
      delete doc.flows[0].steps[0].stepId;
      validateFlowV12(doc);
    }],
    ["duplicate stepId", () => {
      const doc = structuredClone(flow);
      doc.flows[0].steps[1].stepId = doc.flows[0].steps[0].stepId;
      validateFlowV12(doc);
    }],
    ["single page route", () => {
      const doc = structuredClone(flow);
      doc.flows[0].steps[1].pageId = "alerts";
      doc.flows[0].steps[1].expectedRoute = "/alerts#restored";
      doc.flows[0].result.route = "/alerts#restored";
      validateFlowV12(doc);
    }],
    ["missing runtime assertions", () => {
      const doc = structuredClone(flow);
      delete doc.flows[0].steps[0].runtimeAssertions;
      validateFlowV12(doc);
    }],
    ["runtime assertion uncovered reference", () => {
      const doc = structuredClone(flow);
      doc.flows[0].steps[0].assertionRefs.push("pages.json#alert-detail.intentCard.prdAnchor");
      validateFlowV12(doc);
    }],
    ["runtime assertion duplicate reference", () => {
      const doc = structuredClone(flow);
      doc.flows[0].steps[0].runtimeAssertions.push({
        ...doc.flows[0].steps[0].runtimeAssertions[0],
        assertionId: "review-alert-detail-text-duplicate"
      });
      validateFlowV12(doc);
    }],
    ["attribute matcher missing attribute", () => {
      const doc = structuredClone(flow);
      doc.flows[0].steps[1].runtimeAssertions[0].attribute = null;
      validateFlowV12(doc);
    }],
    ["side effect assertion reference", () => {
      const doc = structuredClone(flow);
      doc.flows[0].result.sideEffectAssertions[0].assertionRef = "flows.json#review-alert.successCriteria[0]";
      validateFlowV12(doc);
    }],
    ["missing proof", () => {
      const doc = structuredClone(evidence);
      doc.stepProofs.pop();
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["runtime match count", () => {
      const doc = structuredClone(evidence);
      doc.stepProofs[0].matchedCount = 0;
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["duplicate DOM match", () => {
      const doc = structuredClone(evidence);
      doc.stepProofs[0].matchedCount = 2;
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["proof interactionId", () => {
      const doc = structuredClone(evidence);
      doc.stepProofs[0].interactionId = "wrong-interaction";
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["hidden interaction", () => {
      const doc = structuredClone(evidence);
      doc.stepProofs[0].visible = false;
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["unexecuted interaction", () => {
      const doc = structuredClone(evidence);
      doc.stepProofs[0].actionExecuted = false;
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["wrong routeBefore", () => {
      const doc = structuredClone(evidence);
      doc.stepProofs[0].routeBefore = "/wrong";
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["wrong routeAfter", () => {
      const doc = structuredClone(evidence);
      doc.stepProofs[0].routeAfter = "/wrong";
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["old proof revision", () => {
      const doc = structuredClone(evidence);
      doc.stepProofs[0].revision = 2;
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["missing recovery proof", () => {
      const doc = structuredClone(evidence);
      doc.recoveryProofs.pop();
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["wrong recovery proof", () => {
      const doc = structuredClone(evidence);
      doc.recoveryProofs[0].interactionId = "wrong-recovery";
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["missing assertion proof", () => {
      const doc = structuredClone(evidence);
      doc.assertionProofs.pop();
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["duplicate assertion proof", () => {
      const doc = structuredClone(evidence);
      doc.assertionProofs.push(structuredClone(doc.assertionProofs[0]));
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["assertion expectedState drift", () => {
      const doc = structuredClone(evidence);
      doc.assertionProofs[0].expectedState = "wrong-state";
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["assertion sideEffect drift", () => {
      const doc = structuredClone(evidence);
      const proof = doc.assertionProofs.find((entry) => entry.kind === "flow-side-effect");
      proof.sideEffect = "wrong-side-effect";
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["assertion without expect", () => {
      const doc = structuredClone(evidence);
      doc.assertionProofs[0].expectCount = 0;
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["missing observation proof", () => {
      const doc = structuredClone(evidence);
      doc.observationProofs.pop();
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["observation pass boolean drift", () => {
      const doc = structuredClone(evidence);
      const proof = doc.observationProofs.find((entry) => entry.assertionId === "review-alert-detail-text");
      proof.observed = "detail-wrong";
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }],
    ["cross page metric drift", () => {
      const doc = structuredClone(evidence);
      doc.metrics.approvedCrossPageFlowCount = 2;
      validateEvidenceV12(doc, { flowDocument: flow, pageRoutes });
    }]
  ];
  for (const [label, run] of cases) expectFailure(run, `N15 ${label}`);
}

async function testRunnerPreflightFailureEvidence() {
  const root = resolve(tempRoot, "runner-preflight");
  const evaluatorRoot = resolve(root, "evaluator");
  const evidenceRoot = resolve(root, "evidence");
  const identity = {
    runId: "blind-prd-02-replacement-01",
    arm: "consumer",
    projectId: "fixture-project",
    artifactId: "11111111-1111-4111-8111-111111111111"
  };
  const preRevealPath = resolve(evaluatorRoot, "pre-reveal-contract.json");
  const preReveal = makePreRevealFixture(identity);
  writeJson(preRevealPath, preReveal);
  const inputReceiptPath = resolve(evaluatorRoot, "input-receipt.json");
  const inputReceipt = {
    version: "1.1.0",
    runId: identity.runId,
    slot: 2,
    attemptNumber: 2,
    status: "received-unopened",
    receivedAt: "2026-07-31T00:00:00-07:00",
    preRevealContract: {
      path: `quality/blind-runs/${identity.runId}/pre-reveal-contract.json`,
      sha256: sha256Bytes(stableDocumentBytes(preReveal)),
      freezeCommit: "0".repeat(40)
    },
    source: {
      path: "H:/fixture/input.md",
      fileName: "input.md",
      bytes: 1,
      sha256: "e".repeat(64)
    },
    eligibility: {
      independentRealPrd: true,
      informedKitConstruction: false,
      previouslyInspectedByGenerationAgents: false
    },
    disclosure: {
      metadataRecorded: true,
      contentOpenedAt: null
    }
  };
  writeJson(inputReceiptPath, inputReceipt);
  const receipt = makeEvaluatorReceipt(1);
  receipt.evidenceRoot = toPortablePath(evidenceRoot);
  receipt.preRevealContract = {
    path: toPortablePath(preRevealPath),
    sha256: sha256Bytes(stableDocumentBytes(preReveal))
  };
  receipt.inputReceipt = {
    path: toPortablePath(inputReceiptPath),
    sha256: sha256Bytes(stableDocumentBytes(inputReceipt))
  };
  receipt.runner.config = {
    path: "runner.config.mjs",
    sha256: "f".repeat(64)
  };
  writeText(resolve(evaluatorRoot, "runner.config.mjs"), "export default {};\n");
  const receiptPath = resolve(evaluatorRoot, "evaluator-receipt.json");
  writeJson(receiptPath, receipt);

  const options = { evaluatorReceiptPath: receiptPath, arm: "consumer", attemptId: "attempt-01" };
  await expectAsyncFailure(
    () => runBlindFlowAcceptance(options),
    "N13 runner broken evaluator config",
    "evaluator runner config hash mismatch"
  );
  const attemptRoot = resolve(evidenceRoot, "consumer", "revision-01", "attempt-01");
  const failedPath = resolve(attemptRoot, "flow-acceptance.failed.json");
  const passedPath = resolve(attemptRoot, "flow-acceptance.passed.json");
  if (!existsSync(failedPath) || existsSync(passedPath)) {
    throw new Error("N13 runner preflight failure did not leave exactly one failed evidence file");
  }
  const failed = readJson(failedPath);
  if (failed.status !== "failed" || failed.preflightCompleted !== false) {
    throw new Error("N13 runner preflight failure did not record preflightCompleted=false");
  }
  if (failed.evaluatorReceipt.sha256 !== sha256Bytes(readFileSync(receiptPath))) {
    throw new Error("N13 runner preflight failure did not preserve the actual evaluator receipt hash");
  }
  validateEvidenceV12(failed, { evidenceRoot });
  for (const record of Object.values(failed.outputs)) {
    if (!existsSync(resolve(evidenceRoot, record.path))) {
      throw new Error(`N13 runner missing raw output ${record.path}`);
    }
  }
  const beforeDuplicate = readFileSync(failedPath, "utf8");
  await expectAsyncFailure(
    () => runBlindFlowAcceptance(options),
    "N13 runner duplicate attempt",
    "attempt evidence already exists"
  );
  if (readFileSync(failedPath, "utf8") !== beforeDuplicate || existsSync(passedPath)) {
    throw new Error("N13 runner duplicate attempt overwrote existing evidence");
  }
}

async function testRunnerOwnedInteractionAudit() {
  const fixture = createRunnerAuditFixture(resolve(tempRoot, "runner-interaction"));
  const options = {
    evaluatorReceiptPath: fixture.receiptPath,
    arm: "consumer",
    attemptId: "attempt-01"
  };
  await expectAsyncFailure(
    () => runBlindFlowAcceptance(options),
    "N15 runner-owned empty spec",
    "runner interaction proof mismatch count"
  );
  const attemptRoot = resolve(
    fixture.evidenceRoot,
    "consumer",
    "revision-01",
    "attempt-01"
  );
  const failedPath = resolve(attemptRoot, "flow-acceptance.failed.json");
  const passedPath = resolve(attemptRoot, "flow-acceptance.passed.json");
  if (!existsSync(failedPath) || existsSync(passedPath)) {
    throw new Error("N15 runner-owned audit allowed an empty spec to create passed evidence");
  }
  const failed = readJson(failedPath);
  if (!failed.preflightCompleted || !failed.runtimeAuditCompleted) {
    throw new Error("N15 runner-owned audit did not reach the runtime interaction stage");
  }
  const firstProof = failed.stepProofs.find((proof) => proof.stepId === "review-alert-step-01");
  if (!firstProof || firstProof.actionExecuted !== true ||
      firstProof.routeAfter === fixture.consumerFlow.flows[0].steps[0].expectedRoute) {
    throw new Error("N15 runner-owned audit did not record the actual no-op interaction result");
  }
  validateEvidenceV12(failed, {
    flowDocument: fixture.consumerFlow,
    evidenceRoot: fixture.evidenceRoot
  });

  const controlOptions = {
    evaluatorReceiptPath: fixture.receiptPath,
    arm: "control",
    attemptId: "attempt-01"
  };
  await expectAsyncFailure(
    () => runBlindFlowAcceptance(controlOptions),
    "N15 control routes correct but empty spec",
    "runner assertion proof mismatch count"
  );
  const controlAttemptRoot = resolve(
    fixture.evidenceRoot,
    "control",
    "revision-01",
    "attempt-01"
  );
  const controlFailedPath = resolve(controlAttemptRoot, "flow-acceptance.failed.json");
  const controlPassedPath = resolve(controlAttemptRoot, "flow-acceptance.passed.json");
  if (!existsSync(controlFailedPath) || existsSync(controlPassedPath)) {
    throw new Error("N15 control empty spec created passed evidence");
  }
  const controlFailed = readJson(controlFailedPath);
  if (controlFailed.assertionProofs.some((proof) => proof.executed || proof.tokenStepCount !== 0)) {
    throw new Error("N15 control empty spec unexpectedly produced assertion coverage");
  }
  validateEvidenceV12(controlFailed, {
    flowDocument: fixture.controlFlow,
    evidenceRoot: fixture.evidenceRoot
  });
}

async function testRunnerPreviewFailureEvidence() {
  const fixture = createRunnerAuditFixture(resolve(tempRoot, "runner-preview-failure"), {
    consumerNoOp: false,
    consumerPreviewMode: "missing",
    controlPreviewMode: "exit",
    armModes: { consumer: "happy", control: "happy" }
  });
  const cases = [
    {
      arm: "consumer",
      label: "N13 missing preview script",
      expectedMessage: "Missing script",
      flow: fixture.consumerFlow
    },
    {
      arm: "control",
      label: "N13 preview exits before readiness",
      expectedMessage: "preview exited before readiness",
      flow: fixture.controlFlow
    }
  ];
  for (const entry of cases) {
    await expectAsyncFailure(
      () => runBlindFlowAcceptance({
        evaluatorReceiptPath: fixture.receiptPath,
        arm: entry.arm,
        attemptId: "attempt-01"
      }),
      entry.label,
      entry.expectedMessage
    );
    const attemptRoot = resolve(
      fixture.evidenceRoot,
      entry.arm,
      "revision-01",
      "attempt-01"
    );
    const failedPath = resolve(attemptRoot, "flow-acceptance.failed.json");
    const passedPath = resolve(attemptRoot, "flow-acceptance.passed.json");
    if (!existsSync(failedPath) || existsSync(passedPath)) {
      throw new Error(`${entry.label} did not preserve exactly one canonical failed evidence file`);
    }
    const failed = readJson(failedPath);
    if (failed.preflightCompleted !== true || failed.runtimeAuditCompleted !== false) {
      throw new Error(`${entry.label} recorded the wrong execution stage`);
    }
    const expectedMismatchCount = failed.observationProofs.filter((proof) => proof.passed !== true).length;
    if (failed.metrics.observableAssertionMismatchCount !== expectedMismatchCount) {
      throw new Error(`${entry.label} recorded inconsistent observable assertion mismatches`);
    }
    validateEvidenceV12(failed, {
      flowDocument: entry.flow,
      evidenceRoot: fixture.evidenceRoot
    });
  }
}

async function testRunnerAssertionProofs() {
  const positiveFixture = createRunnerAuditFixture(
    resolve(tempRoot, "runner-assertion-positive"),
    { consumerNoOp: false, armModes: { consumer: "happy", control: "empty" } }
  );
  const positive = await runBlindFlowAcceptance({
    evaluatorReceiptPath: positiveFixture.receiptPath,
    arm: "consumer",
    attemptId: "attempt-01"
  });
  if (positive.evidence.status !== "passed") {
    throw new Error("N15 happy assertion proof fixture did not produce passed evidence");
  }
  if (positive.previewLifecycle?.closed !== true || !positive.previewLifecycle?.close) {
    throw new Error("N15 preview lifecycle did not close before the runner returned");
  }
  if (positive.evidence.assertionProofs.some((proof) =>
    proof.executed !== true || proof.testStatus !== "passed" || proof.expectedStatus !== "passed" ||
    proof.outcome !== "expected" || proof.retry !== 0 || proof.tokenStepCount !== 1 ||
    proof.expectCount < 1 || proof.failedExpectCount !== 0
  )) {
    throw new Error("N15 happy assertion proof fixture did not record complete reporter proof");
  }
  if (positive.evidence.observationProofs.some((proof) =>
    proof.matchedCount !== 1 || proof.passed !== true || proof.checkedAt === null
  ) || positive.evidence.metrics.observableAssertionMismatchCount !== 0) {
    throw new Error("N16 happy runner fixture did not record trusted DOM observations");
  }
  const positiveRoot = resolve(
    positiveFixture.evidenceRoot,
    "consumer",
    "revision-01",
    "attempt-01"
  );
  for (const record of [
    positive.evidence.outputs.playwrightReport,
    positive.evidence.outputs.assertionReporter,
    positive.evidence.outputs.assertionRuntime
  ]) {
    if (!existsSync(resolve(positiveFixture.evidenceRoot, record.path))) {
      throw new Error(`N15 happy assertion proof is missing reporter raw output ${record.path}`);
    }
  }
  if (!existsSync(resolve(positiveRoot, "flow-acceptance.passed.json"))) {
    throw new Error("N15 happy assertion proof did not persist passed evidence");
  }
  const outputArgument = positive.evidence.command.args.find((value) => value.startsWith("--output="));
  const expectedOutputRoot = resolve(positiveRoot, "raw", "playwright-output");
  if (outputArgument !== `--output=${expectedOutputRoot}` ||
      !existsSync(resolve(expectedOutputRoot, ".last-run.json"))) {
    throw new Error("N15 happy assertion proof did not contain Playwright output inside the attempt evidence");
  }
  validateEvidenceV12(positive.evidence, {
    flowDocument: positiveFixture.consumerFlow,
    evidenceRoot: positiveFixture.evidenceRoot
  });

  for (const mode of [
    "missing",
    "wrong-state",
    "wrong-side-effect",
    "empty-step",
    "token-title-only",
    "skipped-extra"
  ]) {
    const fixture = createRunnerAuditFixture(
      resolve(tempRoot, `runner-assertion-${mode}`),
      { consumerNoOp: false, armModes: { consumer: mode, control: "empty" } }
    );
    await expectAsyncFailure(
      () => runBlindFlowAcceptance({
        evaluatorReceiptPath: fixture.receiptPath,
        arm: "consumer",
        attemptId: "attempt-01"
      }),
      `N15 ${mode} assertion proof`,
      mode === "skipped-extra"
        ? "JSON reporter recorded skipped=1"
        : "runner assertion proof mismatch count"
    );
    const attemptRoot = resolve(fixture.evidenceRoot, "consumer", "revision-01", "attempt-01");
    const failedPath = resolve(attemptRoot, "flow-acceptance.failed.json");
    const passedPath = resolve(attemptRoot, "flow-acceptance.passed.json");
    if (!existsSync(failedPath) || existsSync(passedPath)) {
      throw new Error(`N15 ${mode} assertion proof left incorrect evidence status`);
    }
    const failed = readJson(failedPath);
    const requiredProofsAreValid = failed.assertionProofs.every((proof) =>
      proof.executed === true && proof.testStatus === "passed" && proof.expectedStatus === "passed" &&
      proof.outcome === "expected" && proof.retry === 0 && proof.tokenStepCount === 1 &&
      proof.expectCount >= 1 && proof.failedExpectCount === 0
    );
    if (mode === "skipped-extra") {
      if (!requiredProofsAreValid || !failed.error?.includes("JSON reporter recorded skipped=1")) {
        throw new Error("N15 skipped-extra did not preserve the skipped-test failure reason");
      }
    } else if (requiredProofsAreValid) {
      throw new Error(`N15 ${mode} assertion proof did not preserve its invalid reporter evidence`);
    }
    validateEvidenceV12(failed, {
      flowDocument: fixture.consumerFlow,
      evidenceRoot: fixture.evidenceRoot
    });
  }

  for (const attack of [
    {
      label: "dummy-step-state",
      stateVariant: "step-wrong",
      assertionId: "review-alert-detail-text",
      observed: "detail-wrong"
    },
    {
      label: "dummy-side-effect",
      stateVariant: "side-effect-wrong",
      assertionId: "review-alert-refresh-ready",
      observed: "refresh-pending"
    }
  ]) {
    const fixture = createRunnerAuditFixture(
      resolve(tempRoot, `runner-assertion-${attack.label}`),
      {
        consumerNoOp: false,
        consumerStateVariant: attack.stateVariant,
        armModes: { consumer: "dummy-expect", control: "empty" }
      }
    );
    await expectAsyncFailure(
      () => runBlindFlowAcceptance({
        evaluatorReceiptPath: fixture.receiptPath,
        arm: "consumer",
        attemptId: "attempt-01"
      }),
      `N16 ${attack.label} runtime observation`,
      "runner observable assertion mismatch count"
    );
    const attemptRoot = resolve(fixture.evidenceRoot, "consumer", "revision-01", "attempt-01");
    const failedPath = resolve(attemptRoot, "flow-acceptance.failed.json");
    const passedPath = resolve(attemptRoot, "flow-acceptance.passed.json");
    if (!existsSync(failedPath) || existsSync(passedPath)) {
      throw new Error(`N16 ${attack.label} did not leave only failed evidence`);
    }
    const failed = readJson(failedPath);
    const expectedSteps = new Map(
      fixture.consumerFlow.flows[0].steps.map((step) => [step.stepId, step])
    );
    if (failed.metrics.interactionIdentityMismatchCount !== 0 || failed.stepProofs.some((proof) => {
      const step = expectedSteps.get(proof.stepId);
      return !step || proof.matchedCount !== 1 || proof.visible !== true ||
        proof.actionExecuted !== true || proof.routeAfter !== step.expectedRoute;
    }) || failed.recoveryProofs.some((proof) =>
      proof.matchedCount !== 1 || proof.visible !== true || proof.actionExecuted !== true ||
      proof.routeAfter !== fixture.consumerFlow.flows[0].result.recoveryExpectedRoute
    )) {
      throw new Error(`N16 ${attack.label} did not keep the runner interaction path valid`);
    }
    if (!failed.assertionProofs.every((proof) =>
      proof.executed === true && proof.testStatus === "passed" && proof.expectedStatus === "passed" &&
      proof.outcome === "expected" && proof.retry === 0 && proof.tokenStepCount === 1 &&
      proof.expectCount >= 1 && proof.failedExpectCount === 0
    )) {
      throw new Error(`N16 ${attack.label} did not preserve the dummy evaluator reporter proof`);
    }
    const observation = failed.observationProofs.find((proof) => proof.assertionId === attack.assertionId);
    if (!observation || observation.matchedCount !== 1 || observation.passed !== false ||
        observation.observed !== attack.observed || failed.metrics.observableAssertionMismatchCount < 1) {
      throw new Error(`N16 ${attack.label} did not preserve the actual DOM mismatch`);
    }
    validateEvidenceV12(failed, {
      flowDocument: fixture.consumerFlow,
      evidenceRoot: fixture.evidenceRoot
    });
  }
}

function createRunnerAuditFixture(root, options = {}) {
  const runId = "blind-prd-02-replacement-01";
  const consumerNoOp = options.consumerNoOp ?? true;
  const consumerStateVariant = options.consumerStateVariant ?? "happy";
  const controlStateVariant = options.controlStateVariant ?? "happy";
  const consumerPreviewMode = options.consumerPreviewMode ?? "serve";
  const controlPreviewMode = options.controlPreviewMode ?? "serve";
  const armModes = options.armModes ?? { consumer: "empty", control: "empty" };
  const artifacts = {
    consumer: createRunnerProductFixture(
      resolve(root, "products", "consumer"),
      resolve(root, "seals"),
      {
        runId,
        arm: "consumer",
        projectId: "fixture-project",
        artifactId: "11111111-1111-4111-8111-111111111111"
      },
      consumerNoOp,
      consumerStateVariant,
      consumerPreviewMode
    ),
    control: createRunnerProductFixture(
      resolve(root, "products", "control"),
      resolve(root, "seals"),
      {
        runId,
        arm: "control",
        projectId: "fixture-project",
        artifactId: "22222222-2222-4222-8222-222222222222"
      },
      false,
      controlStateVariant,
      controlPreviewMode
    )
  };
  const consumerFlow = makeRunnerFlowDocument("consumer", artifacts.consumer.snapshot);
  const controlFlow = makeRunnerFlowDocument("control", artifacts.control.snapshot);
  const evaluatorRoot = resolve(root, "evaluator");
  const preReveal = makePreRevealFixture(artifacts.consumer.identity);
  const preRevealPath = resolve(evaluatorRoot, "pre-reveal-contract.json");
  writeJson(preRevealPath, preReveal);
  const inputReceipt = {
    version: "1.1.0",
    runId,
    slot: 2,
    attemptNumber: 2,
    status: "received-unopened",
    receivedAt: "2026-07-31T00:00:00-07:00",
    preRevealContract: {
      path: `quality/blind-runs/${runId}/pre-reveal-contract.json`,
      sha256: sha256Bytes(stableDocumentBytes(preReveal)),
      freezeCommit: "0".repeat(40)
    },
    source: {
      path: "H:/fixture/input.md",
      fileName: "input.md",
      bytes: 1,
      sha256: "e".repeat(64)
    },
    eligibility: {
      independentRealPrd: true,
      informedKitConstruction: false,
      previouslyInspectedByGenerationAgents: false
    },
    disclosure: {
      metadataRecorded: true,
      contentOpenedAt: null
    }
  };
  const inputReceiptPath = resolve(evaluatorRoot, "input-receipt.json");
  writeJson(inputReceiptPath, inputReceipt);
  const armRecords = {
    consumer: writeRunnerEvaluatorArm(evaluatorRoot, "consumer", consumerFlow, armModes.consumer),
    control: writeRunnerEvaluatorArm(evaluatorRoot, "control", controlFlow, armModes.control)
  };
  const runnerConfigPath = resolve(evaluatorRoot, "runner.config.mjs");
  writeText(runnerConfigPath, "export default {};\n");
  const receipt = makeEvaluatorReceipt(1);
  receipt.evidenceRoot = toPortablePath(resolve(root, "evidence"));
  receipt.preRevealContract = fileHashRecord(preRevealPath);
  receipt.inputReceipt = fileHashRecord(inputReceiptPath);
  receipt.products = {
    consumer: artifacts.consumer.snapshot,
    control: artifacts.control.snapshot
  };
  receipt.runner = {
    executable: "node",
    config: fileHashRecord(runnerConfigPath),
    productBuildInvocations: 0
  };
  receipt.arms = armRecords;
  receipt.semanticAcceptanceSha256 = semanticAcceptanceSha256([consumerFlow, controlFlow]);
  const receiptPath = resolve(evaluatorRoot, "evaluator-receipt.json");
  writeJson(receiptPath, receipt);
  return {
    receiptPath,
    evidenceRoot: resolve(root, "evidence"),
    consumerFlow,
    controlFlow
  };
}

function writeRunnerEvaluatorArm(evaluatorRoot, arm, flow, mode) {
  const armRoot = resolve(evaluatorRoot, "arms", arm);
  const flowPath = resolve(armRoot, "flow-acceptance.json");
  const specPath = resolve(armRoot, "e2e", "flows", "review-alert.spec.mjs");
  const adapterPath = resolve(armRoot, "locator-adapter.mjs");
  const configPath = resolve(armRoot, "playwright.config.mjs");
  writeJson(flowPath, flow);
  writeText(
    specPath,
    runnerEvaluatorSpec(mode, flow)
  );
  writeText(adapterPath, "export default {};\n");
  writeText(
    configPath,
    "export default { reporter: [['line']], retries: 2, workers: 1, use: { channel: process.env.FLOW_TEST_BROWSER_CHANNEL ?? 'chrome' } };\n"
  );
  return {
    flowAcceptance: fileHashRecord(flowPath),
    spec: fileHashRecord(specPath),
    locatorAdapter: fileHashRecord(adapterPath),
    interactionExposureMode: "data-interaction-id",
    runnerConfig: fileHashRecord(configPath)
  };
}

function runnerEvaluatorSpec(mode, flow) {
  if (mode === "empty") {
    return [
      `import { test } from ${JSON.stringify(playwrightTestModuleUrl)};`,
      "test('empty external evaluator spec', () => {});"
    ].join("\n") + "\n";
  }
  const proofs = plannedAssertionProofs(flow);
  const stepOne = proofs.find((proof) => proof.kind === "step-state" && proof.stepId === "review-alert-step-01");
  const stepTwo = proofs.find((proof) => proof.kind === "step-state" && proof.stepId === "review-alert-step-02");
  const sideEffect = proofs.find((proof) => proof.kind === "flow-side-effect");
  if (!stepOne || !stepTwo || !sideEffect) throw new Error(`runner fixture ${mode} is missing frozen proof tokens`);
  if (mode === "dummy-expect") {
    return [
      `import { test, expect } from ${JSON.stringify(playwrightTestModuleUrl)};`,
      "test('dummy evaluator accepts every token without observing product state', async () => {",
      ...proofs.flatMap((proof) => [
        `  await test.step(${JSON.stringify(proof.token)}, async () => {`,
        "    expect(true).toBe(true);",
        "  });"
      ]),
      "});",
      ""
    ].join("\n");
  }
  if (mode === "token-title-only") {
    return [
      `import { test } from ${JSON.stringify(playwrightTestModuleUrl)};`,
      `test(${JSON.stringify(stepOne.token)}, () => {});`,
      ""
    ].join("\n");
  }
  const stepTwoToken = mode === "wrong-state"
    ? assertionProofToken({ ...stepTwo, expectedState: "wrong-state" })
    : stepTwo.token;
  const sideEffectToken = mode === "wrong-side-effect"
    ? assertionProofToken({ ...sideEffect, sideEffect: "wrong-side-effect" })
    : sideEffect.token;
  const source = [
    `import { test, expect } from ${JSON.stringify(playwrightTestModuleUrl)};`,
    "const baseUrl = process.env.FLOW_TEST_BASE_URL;",
    `const stepOneToken = ${JSON.stringify(stepOne.token)};`,
    `const stepTwoToken = ${JSON.stringify(stepTwoToken)};`,
    `const sideEffectToken = ${JSON.stringify(sideEffectToken)};`,
    "test('frozen assertion proof execution', async ({ page }) => {",
    "  await page.goto(baseUrl + '/alerts');",
    "  await test.step(stepOneToken, async () => {",
    "    await page.locator('[data-interaction-id=\"open-alert\"]').click();",
    "    await expect(page).toHaveURL(baseUrl + '/alerts/alert-1');",
    "    await expect(page.locator('[data-interaction-id=\"return-alerts\"]')).toBeVisible();",
    "  });",
    "  await test.step(stepTwoToken, async () => {",
    "    await page.locator('[data-interaction-id=\"return-alerts\"]').click();",
    "    await expect(page).toHaveURL(baseUrl + '/alerts');",
    "    await expect(page.locator('[data-interaction-id=\"refresh-alerts\"]')).toBeVisible();",
    "  });"
  ];
  if (mode === "empty-step") {
    source.push(
      "  await test.step(sideEffectToken, async () => {});"
    );
  } else if (mode !== "missing") {
    source.push(
      "  await test.step(sideEffectToken, async () => {",
      "    await expect(page.locator('[data-interaction-id=\"refresh-alerts\"]')).toBeVisible();",
      "    await expect(page).toHaveURL(baseUrl + '/alerts');",
      "  });"
    );
  }
  source.push("});", "");
  if (mode === "skipped-extra") {
    source.push("test.skip('deliberately skipped evaluator check', () => {});", "");
  }
  return source.join("\n");
}

function makeRunnerFlowDocument(arm, snapshot) {
  const flow = makeFlowDocument();
  flow.arm = arm;
  flow.artifactUnderTest = {
    artifactId: snapshot.artifactId,
    receiptSha256: snapshot.receipt.sha256,
    sealSha256: snapshot.seal.sha256
  };
  return flow;
}

function createRunnerProductFixture(
  projectRoot,
  sealRoot,
  identity,
  noOpOpenInteraction,
  stateVariant,
  previewMode
) {
  const pageDocument = {
    projectId: identity.projectId,
    pages: [
      { id: "alerts", route: "/alerts" },
      { id: "alert-detail", route: "/alerts/alert-1" }
    ]
  };
  const contractFiles = {
    blindRun: "blind-run-contract.json",
    productDescription: "project-description.json",
    businessContext: "business-context.json",
    pages: "pages.json",
    flows: "flows.json",
    samplePack: "sample-pack.json"
  };
  writeJson(resolve(projectRoot, "public", "artifact-meta.json"), identity);
  writeJson(resolve(projectRoot, contractFiles.blindRun), identity);
  writeJson(resolve(projectRoot, contractFiles.productDescription), { projectId: identity.projectId });
  writeJson(resolve(projectRoot, contractFiles.businessContext), { projectId: identity.projectId });
  writeJson(resolve(projectRoot, contractFiles.pages), pageDocument);
  writeJson(resolve(projectRoot, contractFiles.flows), { projectId: identity.projectId, flows: [] });
  writeJson(resolve(projectRoot, contractFiles.samplePack), { entities: {} });
  const indexHtml = runnerFixtureHtml(noOpOpenInteraction, stateVariant);
  writeText(resolve(projectRoot, "index.html"), indexHtml);
  const scripts = previewMode === "missing" ? {} : { preview: "node preview.mjs" };
  writeJson(resolve(projectRoot, "package.json"), {
    name: `runner-fixture-${identity.arm}`,
    private: true,
    scripts
  });
  if (previewMode !== "missing") {
    writeText(
      resolve(projectRoot, "preview.mjs"),
      previewMode === "exit" ? "process.exit(17);\n" : runnerFixturePreviewServer()
    );
  }
  writeText(resolve(projectRoot, "dist", "index.html"), indexHtml);
  writeJson(resolve(projectRoot, "dist", "artifact-meta.json"), identity);
  const excluded = [".git/", "node_modules/", "dist/", "evidence/", "test-results/"];
  const sourceSha256 = sha256Tree(projectRoot, excluded);
  const buildSha256 = sha256Tree(resolve(projectRoot, "dist"));
  const contracts = Object.fromEntries(
    Object.entries(contractFiles).map(([name, path]) => [
      name,
      { path, sha256: sha256ArtifactFile(resolve(projectRoot, path)) }
    ])
  );
  const receipt = {
    version: "1.1.0",
    artifactKind: "generated-product",
    ...identity,
    contracts,
    source: {
      root: ".",
      entry: "index.html",
      algorithm: "sha256-tree-v1",
      excluded,
      sha256: sourceSha256
    },
    build: {
      script: "build",
      outputPath: "dist",
      exitCode: 0,
      sha256: buildSha256
    },
    runtime: {
      script: "preview",
      entryRoute: "/alerts",
      identityPath: "/artifact-meta.json"
    },
    seal: {
      version: "1.0.0",
      rootId: "blind-protocol-v1.2",
      key: identity.artifactId
    }
  };
  const receiptPath = resolve(projectRoot, "evidence", "artifact-under-test.json");
  writeJson(receiptPath, receipt);
  const sealPath = resolve(sealRoot, `${identity.artifactId}.seal.json`);
  writeJson(sealPath, {
    version: "1.0.0",
    rootId: "blind-protocol-v1.2",
    ...identity,
    sealedAt: "2026-07-31T00:00:00-07:00",
    receipt: {
      projectRelativePath: "evidence/artifact-under-test.json",
      sha256: sha256ArtifactFile(receiptPath)
    },
    source: { algorithm: "sha256-tree-v1", sha256: sourceSha256 },
    build: { path: "dist", sha256: buildSha256 }
  });
  return {
    identity,
    snapshot: {
      ...identity,
      receipt: fileHashRecord(receiptPath),
      seal: fileHashRecord(sealPath),
      sourceSha256,
      buildSha256,
      runtimeEntry: "/alerts",
      runtimeIdentityPath: "/artifact-meta.json"
    }
  };
}

function runnerFixtureHtml(noOpOpenInteraction, stateVariant) {
  const detailState = stateVariant === "step-wrong" ? "detail-wrong" : "detail-open";
  const sideEffectState = stateVariant === "side-effect-wrong" ? "refresh-pending" : "refresh-ready";
  const openHandler = noOpOpenInteraction
    ? "open.addEventListener('click', () => {});"
    : [
        "open.addEventListener('click', () => {",
        "  history.pushState({}, '', '/alerts/alert-1');",
        "  open.hidden = true;",
        "  back.hidden = false;",
        "  detailState.hidden = false;",
        `  detailState.textContent = ${JSON.stringify(detailState)};`,
        "});"
      ].join("\n");
  return [
    "<!doctype html>",
    "<button id=\"open\" data-interaction-id=\"open-alert\">Open alert</button>",
    "<button id=\"back\" data-interaction-id=\"return-alerts\" hidden>Return</button>",
    "<button id=\"refresh\" data-interaction-id=\"refresh-alerts\" hidden>Refresh</button>",
    "<span id=\"detail-state\" data-assertion-id=\"alert-detail-state\" hidden>initial</span>",
    "<span id=\"list-state\" data-assertion-id=\"alert-list-state\" data-state=\"initial\">list</span>",
    "<span id=\"side-effect-state\" data-assertion-id=\"alert-side-effect-state\">initial</span>",
    "<script>",
    "const open = document.querySelector('#open');",
    "const back = document.querySelector('#back');",
    "const refresh = document.querySelector('#refresh');",
    "const detailState = document.querySelector('#detail-state');",
    "const listState = document.querySelector('#list-state');",
    "const sideEffectState = document.querySelector('#side-effect-state');",
    openHandler,
    "back.addEventListener('click', () => {",
    "  history.pushState({}, '', '/alerts');",
    "  back.hidden = true;",
    "  refresh.hidden = false;",
    "  detailState.hidden = true;",
    "  listState.setAttribute('data-state', 'restored');",
    `  sideEffectState.textContent = ${JSON.stringify(sideEffectState)};`,
    "});",
    "refresh.addEventListener('click', () => history.pushState({}, '', '/alerts'));",
    "</script>"
  ].join("\n") + "\n";
}

function runnerFixturePreviewServer() {
  return [
    "import { createServer } from 'node:http';",
    "import { readFileSync } from 'node:fs';",
    "import { resolve } from 'node:path';",
    "const port = Number(process.argv[process.argv.indexOf('--port') + 1]);",
    "const host = process.argv[process.argv.indexOf('--host') + 1] ?? '127.0.0.1';",
    "const root = resolve(process.cwd(), 'dist');",
    "createServer((request, response) => {",
    "  const pathname = new URL(request.url, 'http://fixture.local').pathname;",
    "  if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }",
    "  const file = pathname === '/artifact-meta.json' ? 'artifact-meta.json' :",
    "    ['/', '/alerts', '/alerts/alert-1'].includes(pathname) ? 'index.html' : null;",
    "  if (!file) { response.writeHead(404); response.end('missing'); return; }",
    "  response.writeHead(200, { 'content-type': file.endsWith('.json') ? 'application/json' : 'text/html' });",
    "  response.end(readFileSync(resolve(root, file)));",
    "}).listen(port, host);"
  ].join("\n") + "\n";
}

function fileHashRecord(path) {
  return { path: toPortablePath(path), sha256: sha256ArtifactFile(path) };
}

function testProjectDescriptionConsistency() {
  const pages = {
    projectId: "fixture-project",
    pages: [{
      id: "page-one",
      route: "/one",
      title: "One",
      pattern: "list-page",
      intentCard: { primaryAction: "Open" },
      componentPlan: ["PageLayout", "Button"]
    }]
  };
  const description = {
    projectId: "fixture-project",
    pages: [{
      id: "page-one",
      route: "/one",
      title: "One",
      pattern: "list-page",
      intent: { primaryAction: "Open" },
      componentPlan: ["PageLayout", "Button"]
    }]
  };
  assertProjectDescriptionConsistency(pages, description, "fixture");
  const drifted = structuredClone(description);
  drifted.pages[0].intent.primaryAction = "Drifted";
  expectFailure(
    () => assertProjectDescriptionConsistency(pages, drifted, "fixture"),
    "project description primaryAction drift",
    "primaryAction"
  );
}

function createProductFixture(projectRoot, identity) {
  mkdirSync(resolve(projectRoot, "public"), { recursive: true });
  writeJson(resolve(projectRoot, "public/artifact-meta.json"), identity);
  writeJson(resolve(projectRoot, "blind-run-contract.json"), identity);
  for (const file of [
    "project-description.json",
    "business-context.json",
    "pages.json",
    "flows.json",
    "sample-pack.json"
  ]) {
    writeJson(resolve(projectRoot, file), { fixture: file });
  }
  writeText(resolve(projectRoot, "index.html"), "<!doctype html><title>fixture</title>\n");
  writeJson(resolve(projectRoot, "package.json"), {
    name: "blind-protocol-seal-fixture",
    private: true,
    scripts: {
      build: "node build.mjs",
      preview: "node preview.mjs"
    }
  });
  writeText(
    resolve(projectRoot, "build.mjs"),
    [
      "import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
      "import { resolve } from 'node:path';",
      "const counter = resolve(process.cwd(), '..', 'build-count.txt');",
      "const count = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;",
      "writeFileSync(counter, String(count + 1), 'utf8');",
      "mkdirSync(resolve(process.cwd(), 'dist'), { recursive: true });",
      "copyFileSync(resolve(process.cwd(), 'public/artifact-meta.json'), resolve(process.cwd(), 'dist/artifact-meta.json'));",
      "copyFileSync(resolve(process.cwd(), 'index.html'), resolve(process.cwd(), 'dist/index.html'));"
    ].join("\n") + "\n"
  );
  writeText(resolve(projectRoot, "preview.mjs"), "process.exit(0);\n");
}

function makePreRevealFixture(identity) {
  const historical = readJson(
    resolve(kitRoot, "quality/blind-runs/blind-prd-02/pre-reveal-contract.json")
  );
  historical.version = "1.1.0";
  historical.runId = identity.runId;
  historical.attemptNumber = 2;
  historical.replacesRunId = "blind-prd-02";
  for (const name of [
    "registrySchema",
    "preRevealSchema",
    "packageReceiptSchema",
    "artifactSealSchema",
    "evaluatorReceiptSchema",
    "evidenceSchema",
    "blindProtocolNegativeSuite",
    "freezeScript",
    "verifyScript",
    "flowValidator",
    "flowRunner",
    "blindProtocolLib",
    "sameArtifactLib",
    "blindRegistryValidator",
    "projectConsistencyValidator",
    "assignmentGenerator",
    "packageFreezer"
  ]) {
    historical.protocol.files[name] = {
      path: `schema/${name}.json`,
      sha256: "c".repeat(64)
    };
  }
  delete historical.consumerPackage;
  historical.consumerPackageReceipt = {
    path: `quality/blind-runs/${identity.runId}/consumer-package-receipt.json`,
    sha256: "a".repeat(64)
  };
  historical.seal = {
    version: "1.0.0",
    rootId: "blind-protocol-v1.2",
    rootPath: "H:/AI-readable-kit-blind-runs/_protocol/seals"
  };
  historical.evaluator = {
    receiptVersion: "1.0.0",
    maxRevisions: 2,
    bothArmsRequired: true,
    semanticDigestMustRemainStable: true,
    productBuildInvocationsDuringCorrection: 0
  };
  historical.inputGate.receiptPath =
    `quality/blind-runs/${identity.runId}/input-receipt.json`;
  historical.arms[0].artifactId = identity.artifactId;
  historical.arms[0].workspaceRoot =
    `H:/AI-readable-kit-blind-runs/${identity.runId}/arms/consumer`;
  historical.arms[1].artifactId = "22222222-2222-4222-8222-222222222222";
  historical.arms[1].workspaceRoot =
    `H:/AI-readable-kit-blind-runs/${identity.runId}/arms/control`;
  historical.anonymization.privateRevealPath =
    `.local-pack/${identity.runId}-assignment-reveal.private.json`;
  historical.acceptance.perArmMetrics.push("evaluatorCorrectionMinutes");
  return historical;
}

function makeEvaluatorReceipt(revision, previous = null) {
  const runId = "blind-prd-02-replacement-01";
  const fileHash = (path, hash = "a".repeat(64)) => ({ path, sha256: hash });
  const product = (arm, artifactId) => ({
    runId,
    arm,
    projectId: "fixture-project",
    artifactId,
    receipt: fileHash(`H:/fixture/${arm}/artifact-under-test.json`, arm === "consumer" ? "1".repeat(64) : "2".repeat(64)),
    seal: fileHash(`H:/fixture/seals/${artifactId}.seal.json`, arm === "consumer" ? "3".repeat(64) : "4".repeat(64)),
    sourceSha256: arm === "consumer" ? "5".repeat(64) : "6".repeat(64),
    buildSha256: arm === "consumer" ? "7".repeat(64) : "8".repeat(64),
    runtimeEntry: "/",
    runtimeIdentityPath: "/artifact-meta.json"
  });
  const receipt = {
    version: "1.0.0",
    runId,
    evaluatorId: `eval-${runId}`,
    revision,
    previousRevision: null,
    frozenAt: "2026-07-31T00:00:00-07:00",
    semanticAcceptanceSha256: "9".repeat(64),
    preRevealContract: fileHash("H:/fixture/pre-reveal-contract.json", "a".repeat(64)),
    inputReceipt: fileHash("H:/fixture/input-receipt.json", "b".repeat(64)),
    products: {
      consumer: product("consumer", "11111111-1111-4111-8111-111111111111"),
      control: product("control", "22222222-2222-4222-8222-222222222222")
    },
    runner: {
      executable: "node",
      config: fileHash("runner.config.mjs"),
      productBuildInvocations: 0
    },
    arms: {
      consumer: {
        flowAcceptance: fileHash("arms/consumer/flow-acceptance.json"),
        spec: fileHash("arms/consumer/e2e/flows/flow.spec.mjs"),
        locatorAdapter: fileHash("arms/consumer/locator-adapter.mjs"),
        interactionExposureMode: "data-interaction-id",
        runnerConfig: fileHash("arms/consumer/playwright.config.mjs")
      },
      control: {
        flowAcceptance: fileHash("arms/control/flow-acceptance.json"),
        spec: fileHash("arms/control/e2e/flows/flow.spec.mjs"),
        locatorAdapter: fileHash("arms/control/locator-adapter.mjs"),
        interactionExposureMode: "data-interaction-id",
        runnerConfig: fileHash("arms/control/playwright.config.mjs")
      }
    },
    correctionPolicy: {
      maxRevisions: 2,
      bothArmsRequired: true,
      semanticDigestMustRemainStable: true,
      productHashesMustRemainStable: true,
      productBuildInvocationsMax: 0
    },
    correction: null,
    evidenceRoot: "H:/AI-readable-kit-blind-runs/fixture/evidence"
  };
  if (revision === 2) {
    receipt.previousRevision = {
      path: "../revision-01/evaluator-receipt.json",
      sha256: sha256Bytes(stableDocumentBytes(previous))
    };
    receipt.correction = {
      reviewerClassification: "evaluator-defect",
      bothArmsRefrozen: true,
      semanticDigestUnchanged: true,
      productHashesUnchanged: true,
      productBuildInvocations: 0,
      priorFailureEvidence: [
        fileHash("../revision-01/evidence/consumer.failed.json"),
        fileHash("../revision-01/evidence/control.failed.json")
      ]
    };
  }
  return receipt;
}

function makeFlowDocument() {
  const runId = "blind-prd-02-replacement-01";
  return {
    version: "1.2.0",
    runId,
    arm: "consumer",
    projectId: "fixture-project",
    artifactUnderTest: {
      artifactId: "11111111-1111-4111-8111-111111111111",
      receiptSha256: "1".repeat(64),
      sealSha256: "3".repeat(64)
    },
    evaluator: {
      evaluatorId: `eval-${runId}`,
      revision: 1
    },
    flows: [{
      flowId: "review-alert",
      status: "approved",
      objectRefs: ["Alert/alert-1"],
      specPath: "e2e/flows/review-alert.spec.mjs",
      steps: [
        {
          stepId: "review-alert-step-01",
          interactionId: "open-alert",
          pageId: "alerts",
          action: "Open alert",
          expectedRoute: "/alerts/alert-1",
          expectedState: "detail-open",
          assertionRefs: [
            "flows.json#review-alert.successCriteria[0]",
            "pages.json#alerts.intentCard.prdAnchor"
          ],
          runtimeAssertions: [
            {
              assertionId: "review-alert-detail-text",
              assertionRef: "flows.json#review-alert.successCriteria[0]",
              targetId: "alert-detail-state",
              matcher: "text-equals",
              attribute: null,
              expected: "detail-open"
            },
            {
              assertionId: "review-alert-detail-visible",
              assertionRef: "pages.json#alerts.intentCard.prdAnchor",
              targetId: "alert-detail-state",
              matcher: "visible",
              attribute: null,
              expected: true
            }
          ]
        },
        {
          stepId: "review-alert-step-02",
          interactionId: "return-alerts",
          pageId: "alert-detail",
          action: "Return to alerts",
          expectedRoute: "/alerts",
          expectedState: "list-restored",
          assertionRefs: ["pages.json#alerts.intentCard.prdAnchor"],
          runtimeAssertions: [{
            assertionId: "review-alert-list-state",
            assertionRef: "pages.json#alerts.intentCard.prdAnchor",
            targetId: "alert-list-state",
            matcher: "attribute-equals",
            attribute: "data-state",
            expected: "restored"
          }]
        }
      ],
      result: {
        route: "/alerts",
        sideEffect: "list state restored",
        sideEffectAssertions: [{
          assertionId: "review-alert-refresh-ready",
          targetId: "alert-side-effect-state",
          matcher: "text-includes",
          attribute: null,
          expected: "refresh-ready"
        }],
        recovery: "refreshes the restored list",
        recoveryInteractionId: "refresh-alerts",
        recoveryExpectedRoute: "/alerts"
      }
    }]
  };
}

function makeFailedEvidence(flow, files = null) {
  const rawRecord = (path, value = "") => ({
    path,
    bytes: Buffer.byteLength(value),
    sha256: sha256Bytes(value)
  });
  const fileRecord = (path, value = "{}\n") => ({
    path,
    sha256: sha256Bytes(value)
  });
  return {
    version: "1.2.0",
    runId: flow.runId,
    arm: flow.arm,
    projectId: flow.projectId,
    artifactId: flow.artifactUnderTest.artifactId,
    evaluatorId: flow.evaluator.evaluatorId,
    revision: flow.evaluator.revision,
    attemptId: "attempt-01",
    status: "failed",
    command: {
      executable: "node",
      args: ["playwright", "test"],
      cwd: "H:/fixture"
    },
    exitCode: 1,
    signal: null,
    error: "flow failed",
    timeIdentity: {
      startedAt: "2026-07-31T00:00:00-07:00",
      finishedAt: "2026-07-31T00:00:01-07:00",
      durationMs: 1000
    },
    artifact: {
      receipt: fileRecord("artifact-receipt.json", files?.["artifact-receipt.json"]),
      seal: fileRecord("artifact-seal.json", files?.["artifact-seal.json"]),
      sourceSha256: "5".repeat(64),
      buildSha256: "7".repeat(64)
    },
    evaluatorReceipt: fileRecord(
      "evaluator-receipt.json",
      files?.["evaluator-receipt.json"]
    ),
    outputs: {
      stdout: rawRecord("raw/stdout.log", files?.["raw/stdout.log"]),
      stderr: rawRecord("raw/stderr.log", files?.["raw/stderr.log"] ?? "flow failed\n"),
      previewStdout: rawRecord(
        "raw/preview-stdout.log",
        files?.["raw/preview-stdout.log"]
      ),
      previewStderr: rawRecord(
        "raw/preview-stderr.log",
        files?.["raw/preview-stderr.log"]
      ),
      interactionRuntime: rawRecord(
        "raw/interaction-runtime.json",
        files?.["raw/interaction-runtime.json"] ?? "{}\n"
      ),
      playwrightReport: rawRecord(
        "raw/playwright-report.json",
        files?.["raw/playwright-report.json"] ?? "{}\n"
      ),
      assertionReporter: rawRecord(
        "raw/assertion-reporter.json",
        files?.["raw/assertion-reporter.json"] ?? "{}\n"
      ),
      assertionRuntime: rawRecord(
        "raw/assertion-runtime.json",
        files?.["raw/assertion-runtime.json"] ?? "{}\n"
      )
    },
    runtimeIdentity: {
      runId: flow.runId,
      arm: flow.arm,
      projectId: flow.projectId,
      artifactId: flow.artifactUnderTest.artifactId
    },
    runtimeIdentityObserved: true,
    runtimeAudit: {
      consoleErrors: 0,
      consoleWarnings: 0,
      pageErrors: 0,
      unexpectedHttpErrors: 0
    },
    runtimeAuditCompleted: true,
    preflightCompleted: true,
    approvedFlows: flow.flows.map((entry) => ({
      flowId: entry.flowId,
      objectRefs: entry.objectRefs,
      specPath: entry.specPath
    })),
    stepProofs: flow.flows.flatMap((entry) =>
      entry.steps.map((step) => ({
        flowId: entry.flowId,
        stepId: step.stepId,
        interactionId: step.interactionId,
        pageId: step.pageId,
        action: step.action,
        locatorMode: "data-interaction-id",
        matchedCount: 1,
        visible: true,
        actionExecuted: true,
        routeBefore: step.pageId === "alerts" ? "/alerts" : "/alerts/alert-1",
        routeAfter: step.expectedRoute,
        checkedAt: "2026-07-31T00:00:01-07:00",
        evaluatorId: flow.evaluator.evaluatorId,
        revision: flow.evaluator.revision
      }))
    ),
    recoveryProofs: flow.flows.map((entry) => ({
      flowId: entry.flowId,
      interactionId: entry.result.recoveryInteractionId,
      action: entry.result.recovery,
      expectedRoute: entry.result.recoveryExpectedRoute,
      locatorMode: "data-interaction-id",
      matchedCount: 1,
      visible: true,
      actionExecuted: true,
      routeBefore: entry.result.route,
      routeAfter: entry.result.recoveryExpectedRoute,
      checkedAt: "2026-07-31T00:00:01-07:00",
      evaluatorId: flow.evaluator.evaluatorId,
      revision: flow.evaluator.revision
    })),
    assertionProofs: plannedAssertionProofs(flow),
    observationProofs: plannedObservationProofs(flow).map((proof) => ({
      ...proof,
      observed: proof.expected,
      matchedCount: 1,
      passed: true,
      checkedAt: "2026-07-31T00:00:01-07:00"
    })),
    screenshots: [],
    metrics: {
      sameArtifactMismatchCount: 1,
      evidenceCompleteness: 100,
      approvedCrossPageFlowCount: 1,
      fixtureProductProofCount: 0,
      interactionIdentityMismatchCount: 0,
      observableAssertionMismatchCount: 0
    }
  };
}

function makePassedEvidence(flow) {
  const evidence = makeFailedEvidence(flow);
  evidence.status = "passed";
  evidence.exitCode = 0;
  evidence.error = null;
  evidence.screenshots = [{
    path: "proof.png",
    sha256: "a".repeat(64)
  }];
  evidence.metrics.sameArtifactMismatchCount = 0;
  evidence.metrics.interactionIdentityMismatchCount = 0;
  evidence.assertionProofs = evidence.assertionProofs.map((proof) => ({
    ...proof,
    testTitle: `fixture ${proof.token}`,
    testStatus: "passed",
    expectedStatus: "passed",
    outcome: "expected",
    retry: 0,
    tokenStepCount: 1,
    expectCount: 1,
    failedExpectCount: 0,
    executed: true,
    checkedAt: "2026-07-31T00:00:01-07:00"
  }));
  return evidence;
}

function makeRegistryFixture() {
  const run = (overrides) => ({
    runId: "blind-prd-01",
    slot: 1,
    attemptNumber: 1,
    replacesRunId: null,
    status: "completed",
    qualifying: true,
    kitFirstPass: "passed",
    winner: "consumer",
    contractPath: "quality/fixture.json",
    contractSha256: "a".repeat(64),
    evidencePath: "quality/evidence.json",
    inputStatus: "historical-frozen",
    ...overrides
  });
  const runs = [
    run({}),
    run({
      runId: "blind-prd-02",
      slot: 2,
      status: "invalidated",
      qualifying: false,
      kitFirstPass: "failed",
      winner: null,
      inputStatus: "revealed"
    }),
    run({
      runId: "blind-prd-02-replacement-01",
      slot: 2,
      attemptNumber: 2,
      replacesRunId: "blind-prd-02",
      status: "pre-reveal-frozen",
      qualifying: null,
      kitFirstPass: null,
      winner: null,
      contractSha256: "b".repeat(64),
      evidencePath: null,
      inputStatus: "sealed-pending-delivery"
    })
  ];
  return {
    $schema: "../schema/blind-adoption-registry.schema.json",
    version: "1.1.0",
    programId: "requirement-to-final-page-blind-adoption",
    owner: "quality/blind-adoption-registry.json",
    updatedAt: "2026-07-31T00:00:00-07:00",
    kpi: {
      targetRuns: 5,
      kitFirstPassMin: 4,
      kitWinsMin: 2,
      manualAcceptanceTimeReductionMinPercent: 30,
      hardContractViolationsMax: 0
    },
    counts: computeRegistryCounts(runs, 5),
    runs
  };
}

function isOwnedTempRoot(path) {
  const resolved = resolve(path);
  const containment = relative(tempParent, resolved);
  return dirname(resolved) === tempParent &&
    !containment.startsWith("..") &&
    !containment.includes(":") &&
    basename(resolved).startsWith(tempPrefix);
}

function expectFailure(run, label, messagePart = null) {
  let failure = null;
  try {
    run();
  } catch (error) {
    failure = error;
  }
  if (!failure) throw new Error(`${label} unexpectedly passed`);
  if (messagePart && !failure.message.includes(messagePart)) {
    throw new Error(`${label} failed for the wrong reason: ${failure.message}`);
  }
}

async function expectAsyncFailure(run, label, messagePart = null) {
  let failure = null;
  try {
    await run();
  } catch (error) {
    failure = error;
  }
  if (!failure) throw new Error(`${label} unexpectedly passed`);
  if (messagePart && !failure.message.includes(messagePart)) {
    throw new Error(`${label} failed for the wrong reason: ${failure.message}`);
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, stableDocumentBytes(value), "utf8");
}

function writeText(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value, "utf8");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function toPortablePath(path) {
  return path.replaceAll("\\", "/");
}
