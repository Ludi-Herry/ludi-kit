import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createServer } from "node:net";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  readEvaluatorEnvelope,
  countApprovedCrossPageFlows,
  plannedAssertionProofs,
  plannedObservationProofs,
  sha256Bytes,
  sha256File,
  stableDocumentBytes,
  validateEvidenceV12,
  verifyEvaluatorReceiptFiles
} from "./blind-protocol-v1.2-lib.mjs";
import {
  assertExactIdentity,
  readJson,
  resolveProjectPath,
  sha256Tree
} from "./same-artifact-lib.mjs";

export async function runBlindFlowAcceptance(options) {
  const arm = options.arm;
  if (!["consumer", "control"].includes(arm)) {
    throw new Error("--arm must be consumer or control");
  }
  const attemptId = options.attemptId ?? "attempt-01";
  if (!/^attempt-[0-9]{2}$/.test(attemptId)) {
    throw new Error("--attempt-id must match attempt-XX");
  }
  const envelope = readEvaluatorEnvelope(resolve(options.evaluatorReceiptPath));
  const document = envelope.document;
  const evaluatorRoot = envelope.evaluatorRoot;
  const product = document.products[arm];
  let productReceiptPath = resolveRecordPath(evaluatorRoot, product.receipt.path);
  let productRoot = dirname(dirname(productReceiptPath));
  const evidenceRoot = resolve(document.evidenceRoot);
  if (isInside(productRoot, evidenceRoot) || isInside(evidenceRoot, productRoot)) {
    throw new Error("evidence root must stay outside the product project");
  }
  const attemptRoot = resolve(
    evidenceRoot,
    arm,
    `revision-${String(document.revision).padStart(2, "0")}`,
    attemptId
  );
  if (!isInside(evidenceRoot, attemptRoot)) throw new Error("attempt evidence path escaped its root");
  reserveAttemptRoot(attemptRoot);

  const expectedIdentity = {
    runId: document.runId,
    arm,
    projectId: product.projectId,
    artifactId: product.artifactId
  };
  const startedAt = new Date();
  const copiedEvaluatorReceipt = writeRawFile(
    evidenceRoot,
    attemptRoot,
    "evaluator-receipt.json",
    envelope.receiptBytes
  );
  const evaluatorReceipt = {
    path: copiedEvaluatorReceipt.path,
    sha256: copiedEvaluatorReceipt.sha256
  };
  let evaluator = null;
  let flow = null;
  let approved = [];
  let stepProofs = [];
  let recoveryProofs = [];
  let assertionProofs = [];
  let observationProofs = [];
  let assertionReportSummary = emptyAssertionReportSummary();
  let assertionReporterRaw = "";
  let pageRoutes = null;
  let port = null;
  let baseUrl = null;
  let playwrightCli = null;
  let commandArgs = [];
  const command = {
    executable: process.execPath,
    args: commandArgs,
    cwd: evaluatorRoot.replaceAll("\\", "/")
  };
  let preview = null;
  let result = null;
  let runtimeIdentity = expectedIdentity;
  let runtimeIdentityObserved = false;
  let runtimeAuditCompleted = false;
  let preflightCompleted = false;
  let runtimeAudit = emptyRuntimeAudit();
  let screenshots = [];
  let failure = null;
  let mismatchCount = 0;
  let observableAssertionMismatchCount = 0;

  try {
    evaluator = verifyEvaluatorReceiptFiles(envelope.receiptPath);
    if (evaluator.receiptSha256 !== envelope.receiptSha256 ||
        sha256File(envelope.receiptPath) !== envelope.receiptSha256) {
      throw new Error("evaluator receipt changed after attempt reservation");
    }
    flow = evaluator.flowDocuments[arm];
    approved = flow.flows.filter((entry) => entry.status === "approved");
    stepProofs = plannedStepProofs(flow, document, arm);
    recoveryProofs = plannedRecoveryProofs(flow, document, arm);
    assertionProofs = plannedAssertionProofs(flow);
    observationProofs = plannedObservationProofs(flow);
    productReceiptPath = resolveRecordPath(evaluator.evaluatorRoot, product.receipt.path);
    productRoot = dirname(dirname(productReceiptPath));
    const specPath = resolveRecordPath(evaluator.evaluatorRoot, document.arms[arm].spec.path);
    const configPath = resolveRecordPath(
      evaluator.evaluatorRoot,
      document.arms[arm].runnerConfig.path
    );
    playwrightCli = resolvePlaywrightCli(productRoot);
    const assertionReporterPath = writeAssertionStepReporter(attemptRoot);
    const assertionReporterOutputPath = resolve(attemptRoot, "raw", "assertion-reporter.json");
    const playwrightOutputPath = resolve(attemptRoot, "raw", "playwright-output");
    const specArgument = relative(evaluator.evaluatorRoot, specPath).replaceAll("\\", "/");
    if (!specArgument || specArgument === ".." || specArgument.startsWith("../")) {
      throw new Error("evaluator spec path escaped the evaluator root");
    }
    commandArgs = [
      "test",
      specArgument,
      "--config",
      configPath,
      `--reporter=json,${assertionReporterPath}`,
      "--retries=0",
      "--workers=1",
      `--output=${playwrightOutputPath}`
    ];
    command.args = [playwrightCli, ...commandArgs];
    port = await findFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    let productContext;
    try {
      productContext = verifyCurrentProduct({
        productRoot,
        productReceiptPath,
        expectedIdentity
      });
    } catch (error) {
      mismatchCount += 1;
      throw error;
    }
    preflightCompleted = true;
    preview = startPreview(productRoot, port);
    const identityResponse = await waitForResponse(
      new URL(productContext.receipt.runtime.identityPath, baseUrl).href,
      preview
    );
    if (identityResponse.status !== 200) {
      mismatchCount += 1;
      throw new Error(`runtime identity endpoint returned HTTP ${identityResponse.status}`);
    }
    const identityBytes = Buffer.from(await identityResponse.arrayBuffer());
    try {
      runtimeIdentity = JSON.parse(identityBytes.toString("utf8"));
      runtimeIdentityObserved = true;
    } catch (error) {
      mismatchCount += 1;
      throw new Error(`runtime identity endpoint returned invalid JSON: ${error.message}`);
    }
    try {
      assertExactIdentity(runtimeIdentity, expectedIdentity, "runtime artifact marker");
    } catch (error) {
      mismatchCount += 1;
      throw error;
    }
    const servedIdentityHash = sha256Bytes(identityBytes);
    if (servedIdentityHash !== sha256File(productContext.distMarkerPath)) {
      mismatchCount += 1;
      throw new Error("runtime identity bytes differ from frozen dist/artifact-meta.json");
    }

    const entryResponse = await fetch(
      sameOriginUrl(productContext.receipt.runtime.entryRoute, baseUrl),
      { signal: AbortSignal.timeout(5_000) }
    );
    if (entryResponse.status !== 200) {
      mismatchCount += 1;
      throw new Error(`runtime entry returned HTTP ${entryResponse.status}`);
    }
    const entryBytes = Buffer.from(await entryResponse.arrayBuffer());
    if (sha256Bytes(entryBytes) !== sha256File(productContext.distEntryPath)) {
      mismatchCount += 1;
      throw new Error("runtime entry bytes differ from frozen dist/index.html");
    }

    const audit = await auditRuntimeAndInteractions({
      productRoot,
      flow,
      productContext,
      evaluator,
      arm,
      baseUrl,
      attemptRoot,
      stepProofs,
      recoveryProofs,
      observationProofs
    });
    runtimeAudit = audit.runtimeAudit;
    runtimeAuditCompleted = true;
    stepProofs = audit.stepProofs;
    recoveryProofs = audit.recoveryProofs;
    observationProofs = audit.observationProofs;
    pageRoutes = audit.pageRoutes;
    screenshots = audit.screenshots;
    observableAssertionMismatchCount = countObservationProofFailures(observationProofs);
    const auditFailureCount = Object.values(runtimeAudit).reduce((sum, count) => sum + count, 0);
    if (auditFailureCount > 0) {
      throw new Error(`runtime audit recorded ${auditFailureCount} console, page, or HTTP failures`);
    }
    const interactionMismatchCount = countInteractionProofFailures(stepProofs, recoveryProofs);
    if (interactionMismatchCount > 0) {
      throw new Error(`runner interaction proof mismatch count is ${interactionMismatchCount}`);
    }
    if (audit.errors.length > 0) throw new Error(audit.errors.join("; "));

    const {
      PLAYWRIGHT_JSON_OUTPUT_FILE: _playwrightJsonOutputFile,
      PLAYWRIGHT_JSON_OUTPUT_NAME: _playwrightJsonOutputName,
      ...playwrightEnvironment
    } = process.env;
    result = spawnSync(process.execPath, [playwrightCli, ...commandArgs], {
      cwd: evaluator.evaluatorRoot,
      encoding: "utf8",
      env: {
        ...playwrightEnvironment,
        BLIND_EVIDENCE_DIR: attemptRoot,
        FLOW_TEST_BASE_URL: baseUrl,
        FLOW_TEST_PORT: String(port),
        BLIND_ASSERTION_REPORT_PATH: assertionReporterOutputPath,
        BLIND_ASSERTION_PROOF_TOKENS: JSON.stringify(
          assertionProofs.map((proof) => ({
            kind: proof.kind,
            flowId: proof.flowId,
            stepId: proof.stepId,
            token: proof.token
          }))
        )
      },
      shell: false,
      timeout: 120_000,
      windowsHide: true
    });
    if (result.error?.code === "ETIMEDOUT") {
      throw new Error("blind Playwright flow timed out after 120 seconds");
    }
    assertionReporterRaw = readRawText(assertionReporterOutputPath);
    const assertionInspection = inspectAssertionReports({
      plannedProofs: assertionProofs,
      playwrightReport: result.stdout ?? "",
      assertionReporter: assertionReporterRaw,
      checkedAt: new Date().toISOString()
    });
    assertionProofs = assertionInspection.proofs;
    assertionReportSummary = assertionInspection.summary;
    if (result.status !== 0) {
      const stderr = String(result.stderr ?? "").trim();
      const reportDiagnostics = assertionInspection.errors.length > 0
        ? `; reporter=${assertionInspection.errors.join(" | ")}`
        : "";
      throw new Error(
        `blind Playwright flow exited ${result.status ?? 1}${stderr ? `: ${stderr}` : ""}${reportDiagnostics}`
      );
    }
    if (assertionInspection.errors.length > 0) {
      throw new Error(`Playwright assertion report invalid: ${assertionInspection.errors.join("; ")}`);
    }
    const assertionMismatchCount = countAssertionProofFailures(assertionProofs);
    if (assertionMismatchCount > 0) {
      throw new Error(`runner assertion proof mismatch count is ${assertionMismatchCount}`);
    }
    if (observableAssertionMismatchCount > 0) {
      const diagnostics = audit.observationErrors.join("; ");
      throw new Error(
        `runner observable assertion mismatch count is ${observableAssertionMismatchCount}` +
        (diagnostics ? `: ${diagnostics}` : "")
      );
    }
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    observableAssertionMismatchCount = countObservationProofFailures(observationProofs);
    if (preview) {
      try {
        await stopPreview(preview);
      } catch (error) {
        const shutdownFailure = error instanceof Error ? error : new Error(String(error));
        failure = failure
          ? new Error(`${failure.message}; preview shutdown failed: ${shutdownFailure.message}`)
          : shutdownFailure;
      }
      if (failure) {
        failure = new Error(
          `${failure.message}; previewLifecycle=${JSON.stringify(preview.summary())}`
        );
      }
    }
  }

  if (screenshots.length === 0) screenshots = collectScreenshots(evidenceRoot, attemptRoot);
  const finishedAt = new Date();
  const writeOutputs = () => ({
    stdout: writeRawFile(evidenceRoot, attemptRoot, "stdout.txt", result?.stdout ?? ""),
    stderr: writeRawFile(
      evidenceRoot,
      attemptRoot,
      "stderr.txt",
      [result?.stderr ?? "", failure?.message ?? ""].filter(Boolean).join("\n")
    ),
    previewStdout: writeRawFile(
      evidenceRoot,
      attemptRoot,
      "preview-stdout.txt",
      preview?.stdoutOutput() ?? ""
    ),
    previewStderr: writeRawFile(
      evidenceRoot,
      attemptRoot,
      "preview-stderr.txt",
      preview?.stderrOutput() ?? ""
    ),
    interactionRuntime: writeRawFile(
      evidenceRoot,
      attemptRoot,
      "interaction-runtime.json",
      stableDocumentBytes({
        version: "1.2.0",
        ...expectedIdentity,
        evaluatorId: document.evaluatorId,
        revision: document.revision,
        preflightCompleted,
        runtimeAuditCompleted,
        runtimeAudit,
        stepProofs,
        recoveryProofs,
        observationProofs,
        observableAssertionMismatchCount,
        error: failure?.message ?? null
      })
    ),
    playwrightReport: writeRawFile(
      evidenceRoot,
      attemptRoot,
      "playwright-report.json",
      result?.stdout ?? ""
    ),
    assertionReporter: writeRawFileIfMissing(
      evidenceRoot,
      attemptRoot,
      "assertion-reporter.json",
      assertionReporterRaw
    ),
    assertionRuntime: writeRawFile(
      evidenceRoot,
      attemptRoot,
      "assertion-runtime.json",
      stableDocumentBytes({
        version: "1.2.0",
        ...expectedIdentity,
        evaluatorId: document.evaluatorId,
        revision: document.revision,
        assertionReport: assertionReportSummary,
        assertionProofs,
        error: failure?.message ?? null
      })
    )
  });
  const buildEvidence = (outputs) => ({
    version: "1.2.0",
    ...expectedIdentity,
    evaluatorId: document.evaluatorId,
    revision: document.revision,
    attemptId,
    status: failure ? "failed" : "passed",
    command,
    exitCode: failure ? result?.status ?? null : 0,
    signal: result?.signal ?? null,
    error: failure?.message ?? null,
    timeIdentity: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime()
    },
    artifact: {
      receipt: {
        path: productReceiptPath.replaceAll("\\", "/"),
        sha256: product.receipt.sha256
      },
      seal: {
        path: resolveRecordPath(evaluatorRoot, product.seal.path).replaceAll("\\", "/"),
        sha256: product.seal.sha256
      },
      sourceSha256: product.sourceSha256,
      buildSha256: product.buildSha256
    },
    evaluatorReceipt,
    outputs,
    runtimeIdentity,
    runtimeIdentityObserved,
    runtimeAudit,
    runtimeAuditCompleted,
    preflightCompleted,
    approvedFlows: approved.map((entry) => ({
      flowId: entry.flowId,
      objectRefs: entry.objectRefs,
      specPath: entry.specPath
    })),
    stepProofs,
    recoveryProofs,
    assertionProofs,
    observationProofs,
    screenshots,
    metrics: {
      sameArtifactMismatchCount: mismatchCount,
      evidenceCompleteness: 100,
      approvedCrossPageFlowCount: countApprovedCrossPageFlows(flow),
      fixtureProductProofCount: 0,
      interactionIdentityMismatchCount: runtimeAuditCompleted
        ? countInteractionProofFailures(stepProofs, recoveryProofs)
        : 0,
      observableAssertionMismatchCount
    }
  });
  let outputs = writeOutputs();
  let evidence = buildEvidence(outputs);
  if (!failure) {
    try {
      validateEvidenceV12(evidence, { flowDocument: flow, pageRoutes });
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      outputs = writeOutputs();
      evidence = buildEvidence(outputs);
    }
  }
  try {
    validateEvidenceV12(evidence, { flowDocument: flow, evidenceRoot, pageRoutes });
  } catch (error) {
    if (failure) throw error;
    failure = error instanceof Error ? error : new Error(String(error));
    outputs = writeOutputs();
    evidence = buildEvidence(outputs);
    validateEvidenceV12(evidence, { flowDocument: flow, evidenceRoot, pageRoutes });
  }
  const suffix = failure ? "failed" : "passed";
  const evidencePath = resolve(attemptRoot, `flow-acceptance.${suffix}.json`);
  writeFileSync(evidencePath, stableDocumentBytes(evidence), { encoding: "utf8", flag: "wx" });
  if (failure) {
    const wrapped = new Error(
      `${failure.message}; evidence=${evidencePath.replaceAll("\\", "/")}`
    );
    wrapped.cause = failure;
    throw wrapped;
  }
  return {
    evidencePath,
    evidence,
    previewLifecycle: preview?.summary() ?? null
  };
}

function reserveAttemptRoot(attemptRoot) {
  mkdirSync(dirname(attemptRoot), { recursive: true });
  try {
    mkdirSync(attemptRoot);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`attempt evidence already exists: ${attemptRoot}`);
    }
    throw error;
  }
  mkdirSync(resolve(attemptRoot, "raw"));
}

function plannedStepProofs(flow, document, arm) {
  return flow.flows
    .filter((entry) => entry.status === "approved")
    .flatMap((entry) => entry.steps.map((step) => ({
      flowId: entry.flowId,
      stepId: step.stepId,
      interactionId: step.interactionId,
      pageId: step.pageId,
      action: step.action,
      locatorMode: document.arms[arm].interactionExposureMode,
      matchedCount: null,
      visible: null,
      actionExecuted: null,
      routeBefore: null,
      routeAfter: null,
      checkedAt: null,
      evaluatorId: document.evaluatorId,
      revision: document.revision
    })));
}

function plannedRecoveryProofs(flow, document, arm) {
  return flow.flows
    .filter((entry) => entry.status === "approved")
    .map((entry) => ({
      flowId: entry.flowId,
      interactionId: entry.result.recoveryInteractionId,
      action: entry.result.recovery,
      expectedRoute: entry.result.recoveryExpectedRoute,
      locatorMode: document.arms[arm].interactionExposureMode,
      matchedCount: null,
      visible: null,
      actionExecuted: null,
      routeBefore: null,
      routeAfter: null,
      checkedAt: null,
      evaluatorId: document.evaluatorId,
      revision: document.revision
    }));
}

function countInteractionProofFailures(stepProofs, recoveryProofs) {
  return [...stepProofs, ...recoveryProofs].filter((proof) =>
    proof.matchedCount !== 1 ||
    proof.visible !== true ||
    proof.actionExecuted !== true ||
    typeof proof.routeBefore !== "string" ||
    typeof proof.routeAfter !== "string"
  ).length;
}

function countAssertionProofFailures(proofs) {
  return proofs.filter((proof) =>
    proof.executed !== true ||
    proof.testStatus !== "passed" ||
    proof.expectedStatus !== "passed" ||
    proof.outcome !== "expected" ||
    proof.retry !== 0 ||
    proof.tokenStepCount !== 1 ||
    proof.expectCount < 1 ||
    proof.failedExpectCount !== 0
  ).length;
}

function countObservationProofFailures(proofs) {
  return proofs.filter((proof) => !observationMatches(proof)).length;
}

function observationMatches(proof) {
  if (proof.matchedCount !== 1) return false;
  if (proof.matcher === "visible") {
    return typeof proof.observed === "boolean" && proof.observed === proof.expected;
  }
  if (proof.matcher === "text-equals" || proof.matcher === "attribute-equals") {
    return typeof proof.observed === "string" && proof.observed === proof.expected;
  }
  if (proof.matcher === "text-includes") {
    return typeof proof.observed === "string" &&
      typeof proof.expected === "string" && proof.observed.includes(proof.expected);
  }
  return false;
}

function emptyAssertionReportSummary() {
  return {
    playwrightJson: {
      parsed: false,
      testCount: 0,
      retriesZero: false,
      flakyCount: null,
      skippedCount: null,
      error: null
    },
    assertionReporter: {
      parsed: false,
      testCount: 0,
      status: null,
      error: null
    }
  };
}

function inspectAssertionReports({ plannedProofs, playwrightReport, assertionReporter, checkedAt }) {
  const proofs = structuredClone(plannedProofs);
  const errors = [];
  const summary = emptyAssertionReportSummary();
  let report = null;
  try {
    report = JSON.parse(playwrightReport);
    if (!Array.isArray(report?.config?.projects)) {
      throw new Error("config.projects is missing");
    }
    const projectRetries = report.config.projects.map((project) => project.retries);
    summary.playwrightJson.parsed = true;
    summary.playwrightJson.retriesZero = projectRetries.length > 0 && projectRetries.every((retry) => retry === 0);
    summary.playwrightJson.flakyCount = report.stats?.flaky ?? null;
    summary.playwrightJson.skippedCount = report.stats?.skipped ?? null;
    summary.playwrightJson.testCount = flattenJsonReporterTests(report.suites).length;
    if (!summary.playwrightJson.retriesZero) {
      errors.push("JSON reporter did not confirm retries=0 for every project");
    }
    if (report.stats?.flaky !== 0) {
      errors.push(`JSON reporter recorded flaky=${report.stats?.flaky}`);
    }
    if (report.stats?.skipped !== 0) {
      errors.push(`JSON reporter recorded skipped=${report.stats?.skipped}`);
    }
  } catch (error) {
    summary.playwrightJson.error = error.message;
    errors.push(`JSON reporter output is invalid: ${error.message}`);
  }

  let reporter = null;
  try {
    reporter = JSON.parse(assertionReporter);
    if (reporter.version !== "1.0.0" || !Array.isArray(reporter.tests)) {
      throw new Error("expected version 1.0.0 and tests[]");
    }
    summary.assertionReporter.parsed = true;
    summary.assertionReporter.testCount = reporter.tests.length;
    summary.assertionReporter.status = reporter.status ?? null;
    for (const proof of proofs) proof.checkedAt = checkedAt;
    for (const test of reporter.tests) {
      mergeReporterTestIntoProofs(test, proofs);
    }
    if (reporter.status !== "passed") {
      errors.push(`assertion reporter recorded run status ${JSON.stringify(reporter.status)}`);
    }
  } catch (error) {
    summary.assertionReporter.error = error.message;
    errors.push(`assertion reporter output is invalid: ${error.message}`);
  }

  if (report && reporter && summary.playwrightJson.testCount !== summary.assertionReporter.testCount) {
    errors.push(
      `reporter test counts differ: JSON=${summary.playwrightJson.testCount}, assertion=${summary.assertionReporter.testCount}`
    );
  }
  return { proofs, errors, summary };
}

function mergeReporterTestIntoProofs(test, proofs) {
  if (!test || typeof test !== "object" || !test.result || !Array.isArray(test.result.steps)) {
    throw new Error("reporter test record is malformed");
  }
  if (typeof test.title !== "string" || typeof test.expectedStatus !== "string" ||
      typeof test.outcome !== "string" || typeof test.result.status !== "string" ||
      !Number.isInteger(test.result.retry)) {
    throw new Error("reporter test record lacks execution identity");
  }
  for (const proof of proofs) {
    const tokenSteps = findTokenSteps(test.result.steps, proof.token);
    if (tokenSteps.length === 0) continue;
    proof.tokenStepCount += tokenSteps.length;
    proof.executed = true;
    if (proof.testTitle === null) {
      proof.testTitle = test.title;
      proof.testStatus = test.result.status;
      proof.expectedStatus = test.expectedStatus;
      proof.outcome = test.outcome;
      proof.retry = test.result.retry;
    }
    for (const step of tokenSteps) {
      const expects = findDescendantExpectSteps(step);
      proof.expectCount += expects.length;
      proof.failedExpectCount += expects.filter((expectStep) => expectStep.error !== null).length;
    }
  }
}

function findTokenSteps(steps, token) {
  const matches = [];
  for (const step of steps) {
    if (step?.category === "test.step" && step.title === token) matches.push(step);
    if (Array.isArray(step?.steps)) matches.push(...findTokenSteps(step.steps, token));
  }
  return matches;
}

function findDescendantExpectSteps(step) {
  const matches = [];
  for (const child of step.steps ?? []) {
    if (child?.category === "expect") matches.push(child);
    if (Array.isArray(child?.steps)) matches.push(...findDescendantExpectSteps(child));
  }
  return matches;
}

function flattenJsonReporterTests(suites) {
  const tests = [];
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) tests.push(...(spec.tests ?? []));
    tests.push(...flattenJsonReporterTests(suite.suites));
  }
  return tests;
}

function verifyCurrentProduct({ productRoot, productReceiptPath, expectedIdentity }) {
  const receipt = readJson(productReceiptPath);
  assertExactIdentity(
    {
      runId: receipt.runId,
      arm: receipt.arm,
      projectId: receipt.projectId,
      artifactId: receipt.artifactId
    },
    expectedIdentity,
    "artifact receipt"
  );
  for (const [name, record] of Object.entries(receipt.contracts)) {
    const file = resolveProjectPath(productRoot, record.path, {
      label: `${name} product contract`,
      type: "file"
    });
    if (sha256File(file) !== record.sha256) throw new Error(`${name} product contract hash drift`);
  }
  if (sha256Tree(productRoot, receipt.source.excluded) !== receipt.source.sha256) {
    throw new Error("source tree hash drift");
  }
  const distRoot = resolveProjectPath(productRoot, receipt.build.outputPath, {
    label: "build output",
    type: "directory"
  });
  if (sha256Tree(distRoot) !== receipt.build.sha256) throw new Error("dist tree hash drift");
  const sourceMarkerPath = resolveProjectPath(productRoot, "public/artifact-meta.json", {
    label: "source artifact marker",
    type: "file"
  });
  const distMarkerPath = resolveProjectPath(
    productRoot,
    `${receipt.build.outputPath}/artifact-meta.json`,
    {
      label: "built artifact marker",
      type: "file"
    }
  );
  assertExactIdentity(readJson(sourceMarkerPath), expectedIdentity, "source artifact marker");
  assertExactIdentity(readJson(distMarkerPath), expectedIdentity, "built artifact marker");
  return {
    receipt,
    distRoot,
    distMarkerPath,
    distEntryPath: resolveProjectPath(productRoot, `${receipt.build.outputPath}/index.html`, {
      label: "built entry",
      type: "file"
    })
  };
}

async function auditRuntimeAndInteractions({
  productRoot,
  flow,
  productContext,
  evaluator,
  arm,
  baseUrl,
  attemptRoot,
  stepProofs: plannedSteps,
  recoveryProofs: plannedRecoveries,
  observationProofs: plannedObservations
}) {
  const playwright = loadPlaywright(productRoot);
  const browser = await playwright.chromium.launch({
    channel: process.env.FLOW_TEST_BROWSER_CHANNEL ?? "chrome",
    headless: true
  });
  const details = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    unexpectedHttpErrors: []
  };
  const errors = [];
  const observationErrors = [];
  const stepProofs = structuredClone(plannedSteps);
  const recoveryProofs = structuredClone(plannedRecoveries);
  const observationProofs = structuredClone(plannedObservations);
  const screenshots = [];
  const pagesDocument = readJson(
    resolveProjectPath(productRoot, productContext.receipt.contracts.pages.path, {
      label: "pages contract",
      type: "file"
    })
  );
  const routes = new Map((pagesDocument.pages ?? []).map((page) => [page.id, page.route]));
  const evaluatorArm = evaluator.document.arms[arm];
  const adapter = evaluatorArm.interactionExposureMode === "frozen-adapter"
    ? await loadLocatorAdapter(
        resolveRecordPath(evaluator.evaluatorRoot, evaluatorArm.locatorAdapter.path)
      )
    : null;
  try {
    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") details.consoleErrors.push(message.text());
      if (message.type() === "warning") details.consoleWarnings.push(message.text());
    });
    page.on("pageerror", (error) => details.pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        details.unexpectedHttpErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    const stepProofById = new Map(
      stepProofs.map((proof) => [`${proof.flowId}\0${proof.stepId}`, proof])
    );
    const recoveryProofByFlow = new Map(
      recoveryProofs.map((proof) => [proof.flowId, proof])
    );
    const observationProofByAssertionId = new Map(
      observationProofs.map((proof) => [proof.assertionId, proof])
    );
    for (const approvedFlow of flow.flows.filter((entry) => entry.status === "approved")) {
      const firstRoute = routes.get(approvedFlow.steps[0].pageId);
      if (!firstRoute) {
        errors.push(`pages contract has no route for ${approvedFlow.steps[0].pageId}`);
      } else {
        try {
          await page.goto(sameOriginUrl(firstRoute, baseUrl), { waitUntil: "networkidle" });
        } catch (error) {
          errors.push(`${approvedFlow.flowId} initial route failed: ${error.message}`);
        }
      }
      for (const step of approvedFlow.steps) {
        const proof = stepProofById.get(`${approvedFlow.flowId}\0${step.stepId}`);
        const pageRoute = routes.get(step.pageId);
        proof.checkedAt = new Date().toISOString();
        proof.routeBefore = currentRoute(page, baseUrl);
        if (!pageRoute) {
          errors.push(`${step.stepId} pages contract has no route for ${step.pageId}`);
          continue;
        }
        if (!routeBelongsToPage(proof.routeBefore, pageRoute)) {
          errors.push(`${step.stepId} routeBefore does not belong to ${step.pageId}`);
          continue;
        }
        const selector = adapter
          ? locatorFromAdapter(adapter, step.interactionId)
          : `[data-interaction-id="${step.interactionId}"]`;
        let locator;
        try {
          locator = page.locator(selector);
          proof.matchedCount = await locator.count();
          if (proof.matchedCount !== 1) {
            errors.push(`${step.stepId} locator matched ${proof.matchedCount} elements`);
            continue;
          }
          proof.visible = await locator.isVisible();
          if (!proof.visible) {
            errors.push(`${step.stepId} locator is not visible`);
            continue;
          }
          await locator.click({ timeout: 10_000 });
          proof.actionExecuted = true;
          await page.waitForTimeout(50);
          proof.routeAfter = currentRoute(page, baseUrl);
          if (proof.routeAfter !== step.expectedRoute) {
            errors.push(`${step.stepId} routeAfter expected ${step.expectedRoute}, received ${proof.routeAfter}`);
          }
          await observeRuntimeAssertions({
            page,
            rules: step.runtimeAssertions,
            flowId: approvedFlow.flowId,
            proofByAssertionId: observationProofByAssertionId,
            errors: observationErrors
          });
          await captureScreenshot(
            page,
            resolve(attemptRoot, `${approvedFlow.flowId}-${step.stepId}.png`),
            screenshots,
            errors
          );
        } catch (error) {
          errors.push(`${step.stepId} action failed: ${error.message}`);
          proof.routeAfter = currentRoute(page, baseUrl);
        }
      }
      await observeRuntimeAssertions({
        page,
        rules: approvedFlow.result.sideEffectAssertions,
        flowId: approvedFlow.flowId,
        proofByAssertionId: observationProofByAssertionId,
        errors: observationErrors
      });
      const recoveryProof = recoveryProofByFlow.get(approvedFlow.flowId);
      recoveryProof.checkedAt = new Date().toISOString();
      recoveryProof.routeBefore = currentRoute(page, baseUrl);
      if (recoveryProof.routeBefore !== approvedFlow.result.route) {
        errors.push(
          `${approvedFlow.flowId} recovery routeBefore expected ${approvedFlow.result.route}, received ${recoveryProof.routeBefore}`
        );
        continue;
      }
      const recoverySelector = adapter
        ? locatorFromAdapter(adapter, approvedFlow.result.recoveryInteractionId)
        : `[data-interaction-id="${approvedFlow.result.recoveryInteractionId}"]`;
      try {
        const locator = page.locator(recoverySelector);
        recoveryProof.matchedCount = await locator.count();
        if (recoveryProof.matchedCount !== 1) {
          errors.push(`${approvedFlow.flowId} recovery locator matched ${recoveryProof.matchedCount} elements`);
          continue;
        }
        recoveryProof.visible = await locator.isVisible();
        if (!recoveryProof.visible) {
          errors.push(`${approvedFlow.flowId} recovery locator is not visible`);
          continue;
        }
        await locator.click({ timeout: 10_000 });
        recoveryProof.actionExecuted = true;
        await page.waitForTimeout(50);
        recoveryProof.routeAfter = currentRoute(page, baseUrl);
        if (recoveryProof.routeAfter !== approvedFlow.result.recoveryExpectedRoute) {
          errors.push(
            `${approvedFlow.flowId} recovery routeAfter expected ${approvedFlow.result.recoveryExpectedRoute}, received ${recoveryProof.routeAfter}`
          );
        }
        await captureScreenshot(
          page,
          resolve(attemptRoot, `${approvedFlow.flowId}-recovery.png`),
          screenshots,
          errors
        );
      } catch (error) {
        errors.push(`${approvedFlow.flowId} recovery action failed: ${error.message}`);
        recoveryProof.routeAfter = currentRoute(page, baseUrl);
      }
    }
  } finally {
    await browser.close();
  }
  return {
    runtimeAudit: Object.fromEntries(
      Object.entries(details).map(([name, entries]) => [name, entries.length])
    ),
    stepProofs,
    recoveryProofs,
    observationProofs,
    pageRoutes: routes,
    errors,
    observationErrors,
    screenshots: screenshots.map((path) => ({
      path: relative(evaluator.document.evidenceRoot, path).replaceAll("\\", "/"),
      sha256: sha256File(path)
    }))
  };
}

async function observeRuntimeAssertions({
  page,
  rules,
  flowId,
  proofByAssertionId,
  errors
}) {
  for (const rule of rules) {
    const proof = proofByAssertionId.get(rule.assertionId);
    if (!proof) {
      errors.push(`${flowId} runtime assertion ${rule.assertionId} has no planned observation proof`);
      continue;
    }
    proof.checkedAt = new Date().toISOString();
    try {
      const locator = page.locator(`[data-assertion-id="${rule.targetId}"]`);
      proof.matchedCount = await locator.count();
      if (proof.matchedCount !== 1) {
        proof.passed = false;
        errors.push(`${rule.assertionId} target ${rule.targetId} matched ${proof.matchedCount} elements`);
        continue;
      }
      if (rule.matcher === "visible") {
        proof.observed = await locator.isVisible();
      } else if (rule.matcher === "text-equals" || rule.matcher === "text-includes") {
        proof.observed = (await locator.textContent() ?? "").trim();
      } else if (rule.matcher === "attribute-equals") {
        proof.observed = await locator.getAttribute(rule.attribute);
      } else {
        throw new Error(`unsupported matcher ${JSON.stringify(rule.matcher)}`);
      }
      proof.passed = observationMatches(proof);
      if (!proof.passed) {
        errors.push(
          `${rule.assertionId} ${rule.matcher} expected ${JSON.stringify(rule.expected)}, received ${JSON.stringify(proof.observed)}`
        );
      }
    } catch (error) {
      proof.passed = false;
      errors.push(`${rule.assertionId} observation failed: ${error.message}`);
    }
  }
}

async function captureScreenshot(page, path, screenshots, errors) {
  try {
    await page.screenshot({ path, fullPage: true });
    screenshots.push(path);
  } catch (error) {
    errors.push(`screenshot failed: ${error.message}`);
  }
}

function currentRoute(page, baseUrl) {
  try {
    const current = new URL(page.url());
    const base = new URL(baseUrl);
    if (current.origin !== base.origin) return null;
    return `${current.pathname}${current.search}${current.hash}`;
  } catch {
    return null;
  }
}

function routeBelongsToPage(route, pageRoute) {
  if (typeof route !== "string" || typeof pageRoute !== "string") return false;
  const actual = new URL(route, "http://blind.local");
  const expected = new URL(pageRoute, "http://blind.local");
  return actual.pathname === expected.pathname;
}

async function loadLocatorAdapter(file) {
  const module = await import(`${pathToFileURL(file).href}?sha256=${sha256File(file)}`);
  return module.interactions ?? module.default ?? module;
}

function locatorFromAdapter(adapter, interactionId) {
  const value = typeof adapter.resolveInteraction === "function"
    ? adapter.resolveInteraction(interactionId)
    : adapter[interactionId];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`locator adapter has no selector for ${interactionId}`);
  }
  return value;
}

function resolvePlaywrightCli(productRoot) {
  const projectRequire = createRequire(resolve(productRoot, "package.json"));
  try {
    return projectRequire.resolve("@playwright/test/cli");
  } catch {
    try {
      return createRequire(import.meta.url).resolve("@playwright/test/cli");
    } catch {
      throw new Error("@playwright/test is required for blind flow acceptance");
    }
  }
}

function loadPlaywright(productRoot) {
  const projectRequire = createRequire(resolve(productRoot, "package.json"));
  try {
    return projectRequire("@playwright/test");
  } catch {
    return createRequire(import.meta.url)("@playwright/test");
  }
}

function startPreview(projectRoot, port) {
  const npmCli = process.env.npm_execpath;
  const hasNpmRuntime = npmCli && existsSync(npmCli);
  const command = hasNpmRuntime
    ? process.execPath
    : process.platform === "win32"
      ? "cmd.exe"
      : "npm";
  const args = hasNpmRuntime
    ? [npmCli, "run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run preview -- --host 127.0.0.1 --port ${port}`]
      : ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)];
  const startedAt = new Date();
  const elapsedMs = () => Date.now() - startedAt.getTime();
  const lifecycle = {
    command,
    args,
    cwd: projectRoot.replaceAll("\\", "/"),
    pid: null,
    startedAt: startedAt.toISOString(),
    spawn: { observed: false, at: null, elapsedMs: null, error: null },
    readiness: { attempts: 0, at: null, elapsedMs: null, status: null, error: null },
    stop: null,
    exit: null,
    close: null
  };
  let closed = false;
  let resolveClosed;
  const closedPromise = new Promise((resolveClosedPromise) => {
    resolveClosed = resolveClosedPromise;
  });
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  lifecycle.pid = child.pid ?? null;
  const stdoutChunks = [];
  const stderrChunks = [];
  child.once("spawn", () => {
    lifecycle.spawn.observed = true;
    lifecycle.spawn.at = new Date().toISOString();
    lifecycle.spawn.elapsedMs = elapsedMs();
  });
  child.once("error", (error) => {
    lifecycle.spawn.error = error instanceof Error ? error.message : String(error);
    lifecycle.spawn.at = new Date().toISOString();
    lifecycle.spawn.elapsedMs = elapsedMs();
  });
  child.once("exit", (code, signal) => {
    lifecycle.exit = { at: new Date().toISOString(), elapsedMs: elapsedMs(), code, signal };
  });
  child.once("close", (code, signal) => {
    closed = true;
    lifecycle.close = { at: new Date().toISOString(), elapsedMs: elapsedMs(), code, signal };
    resolveClosed();
  });
  child.stdout.on("data", (chunk) => stdoutChunks.push(chunk.toString()));
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk.toString()));
  return {
    child,
    lifecycle,
    closedPromise,
    summary: () => ({
      ...lifecycle,
      closed,
      exitCode: child.exitCode,
      signalCode: child.signalCode
    }),
    state: () => ({
      spawned: lifecycle.spawn.observed,
      spawnError: lifecycle.spawn.error,
      closed,
      pid: child.pid ?? null,
      exitCode: child.exitCode,
      signalCode: child.signalCode
    }),
    stdoutOutput: () => stdoutChunks.join(""),
    stderrOutput: () => stderrChunks.join(""),
    output: () => `${stdoutChunks.join("")}${stderrChunks.join("")}`
  };
}

async function waitForResponse(url, preview, timeoutMs = 10_000) {
  const startedAt = Date.now();
  let lastError = null;
  let attempts = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const previewState = preview.state();
    if (previewState.spawnError) {
      throw new Error(`preview spawn failed before readiness: ${previewState.spawnError}`);
    }
    if (preview.child.exitCode !== null || previewState.closed) {
      // exit can fire before the stdout/stderr pipes drain; wait for close so the message carries the output.
      await Promise.race([preview.closedPromise, delay(2_000)]);
      throw new Error(
        `preview exited before readiness with code ${preview.child.exitCode}: ${preview.output().trim()}`
      );
    }
    try {
      attempts += 1;
      const response = await fetch(url, { signal: AbortSignal.timeout(750) });
      preview.lifecycle.readiness = {
        attempts,
        at: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        status: response.status,
        error: null
      };
      return response;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  preview.lifecycle.readiness = {
    attempts,
    at: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    status: null,
    error: lastError?.message ?? null
  };
  throw new Error(
    `preview did not become ready within ${timeoutMs}ms: ${lastError?.message ?? "no fetch error"}`
  );
}

async function stopPreview(preview, timeoutMs = 5_000) {
  const child = preview?.child;
  if (preview.state().closed) return;
  if (child?.pid && child.exitCode === null) {
    preview.lifecycle.stop = {
      requestedAt: new Date().toISOString(),
      method: process.platform === "win32" ? "taskkill-tree-force" : "sigterm",
      status: null,
      signal: null,
      error: null,
      completedAt: null,
      stdout: "",
      stderr: ""
    };
    if (process.platform === "win32") {
      const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        encoding: "utf8",
        shell: false,
        windowsHide: true
      });
      Object.assign(preview.lifecycle.stop, {
        status: result.status,
        signal: result.signal,
        error: result.error?.message ?? null,
        completedAt: new Date().toISOString(),
        stdout: result.stdout,
        stderr: result.stderr
      });
    } else {
      preview.lifecycle.stop.status = child.kill("SIGTERM") ? 0 : 1;
      preview.lifecycle.stop.completedAt = new Date().toISOString();
    }
  }
  await waitForPreviewClose(preview, timeoutMs);
}

async function waitForPreviewClose(preview, timeoutMs) {
  if (preview.state().closed) return;
  let timeoutId;
  try {
    await Promise.race([
      preview.closedPromise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(
            `preview did not close within ${timeoutMs}ms: ${JSON.stringify(preview.summary())}`
          ));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function writeAssertionStepReporter(attemptRoot) {
  const reporterPath = resolve(attemptRoot, "raw", "assertion-step-reporter.cjs");
  const source = [
    "const { writeFileSync } = require('node:fs');",
    "",
    "class BlindAssertionStepReporter {",
    "  constructor() { this.tests = []; }",
    "  onTestEnd(test, result) {",
    "    this.tests.push({",
    "      title: test.titlePath().join(' > '),",
    "      expectedStatus: test.expectedStatus,",
    "      outcome: test.outcome(),",
    "      result: {",
    "        status: result.status,",
    "        retry: result.retry,",
    "        steps: result.steps.map(serializeStep)",
    "      }",
    "    });",
    "  }",
    "  onEnd(result) {",
    "    const output = process.env.BLIND_ASSERTION_REPORT_PATH;",
    "    if (!output) throw new Error('BLIND_ASSERTION_REPORT_PATH is required');",
    "    writeFileSync(output, JSON.stringify({",
    "      version: '1.0.0',",
    "      status: result.status,",
    "      tests: this.tests",
    "    }, null, 2) + '\\n', { encoding: 'utf8', flag: 'wx' });",
    "  }",
    "}",
    "",
    "function serializeStep(step) {",
    "  return {",
    "    title: step.title,",
    "    category: step.category,",
    "    error: step.error ? { message: step.error.message || String(step.error) } : null,",
    "    steps: step.steps.map(serializeStep)",
    "  };",
    "}",
    "",
    "module.exports = BlindAssertionStepReporter;",
    ""
  ].join("\n");
  writeFileSync(reporterPath, source, { encoding: "utf8", flag: "wx" });
  return reporterPath;
}

function writeRawFile(evidenceRoot, attemptRoot, fileName, value) {
  const file = resolve(attemptRoot, "raw", fileName);
  writeFileSync(file, value, "utf8");
  return {
    path: relative(evidenceRoot, file).replaceAll("\\", "/"),
    bytes: statSync(file).size,
    sha256: sha256File(file)
  };
}

function writeRawFileIfMissing(evidenceRoot, attemptRoot, fileName, value) {
  const file = resolve(attemptRoot, "raw", fileName);
  if (!existsSync(file)) writeFileSync(file, value, { encoding: "utf8", flag: "wx" });
  return {
    path: relative(evidenceRoot, file).replaceAll("\\", "/"),
    bytes: statSync(file).size,
    sha256: sha256File(file)
  };
}

function readRawText(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function collectScreenshots(evidenceRoot, attemptRoot) {
  const files = [];
  collectPngFiles(attemptRoot, files);
  return files
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((file) => ({
      path: relative(evidenceRoot, file).replaceAll("\\", "/"),
      sha256: sha256File(file)
    }));
}

function collectPngFiles(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) {
      throw new Error(`evidence contains a symbolic link: ${path}`);
    }
    if (entry.isDirectory()) collectPngFiles(path, files);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) files.push(path);
  }
}

function resolveRecordPath(root, recordedPath) {
  return isAbsolute(recordedPath) ? resolve(recordedPath) : resolve(root, recordedPath);
}

function sameOriginUrl(route, baseUrl) {
  const url = new URL(route, baseUrl);
  if (url.origin !== new URL(baseUrl).origin) throw new Error(`route escaped preview origin: ${route}`);
  return url.href;
}

function emptyRuntimeAudit() {
  return {
    consoleErrors: 0,
    consoleWarnings: 0,
    pageErrors: 0,
    unexpectedHttpErrors: 0
  };
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
