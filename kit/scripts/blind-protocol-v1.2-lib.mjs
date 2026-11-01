import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACTIVE_STATUSES = new Set([
  "pre-reveal-frozen",
  "input-received",
  "running",
  "evaluation-complete"
]);
const IDENTITY_KEYS = Object.freeze(["runId", "arm", "projectId", "artifactId"]);
const RUN_ID_PATTERN = /^blind-prd-(0[1-5])(?:-[a-z0-9][a-z0-9-]*)?$/;
export const REQUIRED_PROTOCOL_FILES = Object.freeze([
  "plan",
  "registrySchema",
  "preRevealSchema",
  "inputReceiptSchema",
  "packageReceiptSchema",
  "artifactReceiptSchema",
  "artifactSealSchema",
  "flowAcceptanceSchema",
  "evaluatorReceiptSchema",
  "evidenceSchema",
  "negativeSuite",
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
]);

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validators = Object.freeze({
  artifactReceipt: compileSchema("project-artifact-under-test.schema.json"),
  artifactSeal: compileSchema("blind-artifact-seal.schema.json"),
  consumerPackageReceipt: compileSchema("blind-consumer-package-receipt.schema.json"),
  evaluatorReceipt: compileSchema("blind-evaluator-receipt.schema.json"),
  evidence: compileSchema("project-flow-acceptance-evidence.schema.json"),
  flow: compileSchema("project-flow-acceptance.schema.json"),
  inputReceipt: compileSchema("blind-prd-input-receipt.schema.json"),
  preReveal: compileSchema("blind-prd-pre-reveal-contract.schema.json"),
  registry: compileSchema("blind-adoption-registry.schema.json")
});

export function canonicalSlotFromRunId(runId) {
  const match = RUN_ID_PATTERN.exec(runId);
  if (!match) throw new Error(`canonical runId is invalid: ${runId}`);
  return Number(match[1]);
}

export function assertCanonicalIdentity(actual, expected, label) {
  assertObject(actual, label);
  for (const key of IDENTITY_KEYS) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `${label} ${key}: expected ${JSON.stringify(expected[key])}, received ${JSON.stringify(actual[key])}`
      );
    }
  }
  if (canonicalSlotFromRunId(actual.runId) !== canonicalSlotFromRunId(expected.runId)) {
    throw new Error(`${label} runId slot mismatch`);
  }
}

export function validatePreRevealV11(document) {
  validateWith(validators.preReveal, document, "pre-reveal contract");
  if (document.version !== "1.1.0") {
    throw new Error(`pre-reveal contract version must be 1.1.0; received ${document.version}`);
  }
  if (canonicalSlotFromRunId(document.runId) !== document.slot) {
    throw new Error(`pre-reveal runId slot must equal slot ${document.slot}`);
  }
  if (document.attemptNumber === 1 && document.replacesRunId !== null) {
    throw new Error("first attempt cannot replace another run");
  }
  if (document.attemptNumber > 1 && document.replacesRunId === null) {
    throw new Error("replacement attempt must name replacesRunId");
  }
  for (const name of REQUIRED_PROTOCOL_FILES) {
    if (!document.protocol.files[name]) {
      throw new Error(`pre-reveal protocol files are missing ${name}`);
    }
  }
  const expectedPackageReceipt =
    `quality/blind-runs/${document.runId}/consumer-package-receipt.json`;
  if (document.consumerPackageReceipt.path !== expectedPackageReceipt) {
    throw new Error(`consumer package receipt path must equal ${expectedPackageReceipt}`);
  }
  const expectedInputReceipt = `quality/blind-runs/${document.runId}/input-receipt.json`;
  if (document.inputGate.receiptPath !== expectedInputReceipt) {
    throw new Error(`input receipt path must equal ${expectedInputReceipt}`);
  }
  const expectedReveal =
    `.local-pack/${document.runId}-assignment-reveal.private.json`;
  if (document.anonymization.privateRevealPath !== expectedReveal) {
    throw new Error(`private reveal path must equal ${expectedReveal}`);
  }
  const arms = new Map(document.arms.map((arm) => [arm.id, arm]));
  if (arms.size !== 2 || !arms.has("consumer") || !arms.has("control")) {
    throw new Error("pre-reveal contract must freeze consumer and control exactly once");
  }
  if (arms.get("consumer").artifactId === arms.get("control").artifactId) {
    throw new Error("pre-reveal arms must use distinct artifactId values");
  }
  for (const arm of arms.values()) {
    const expectedRoot = `H:/AI-readable-kit-blind-runs/${document.runId}/arms/${arm.id}`;
    if (arm.workspaceRoot !== expectedRoot) {
      throw new Error(`${arm.id} workspaceRoot must equal ${expectedRoot}`);
    }
  }
  return document;
}

export function validateRegistryV11(document) {
  validateWith(validators.registry, document, "blind adoption registry");
  if (document.version !== "1.1.0") {
    throw new Error(`registry version must be 1.1.0; received ${document.version}`);
  }

  const runIds = new Set();
  const replacedTargets = new Set();
  const attemptsBySlot = new Map();
  document.runs.forEach((run, index) => {
    if (runIds.has(run.runId)) throw new Error(`duplicate blind run id: ${run.runId}`);
    runIds.add(run.runId);
    if (canonicalSlotFromRunId(run.runId) !== run.slot) {
      throw new Error(`${run.runId} slot must equal ${run.slot}`);
    }
    const attempts = attemptsBySlot.get(run.slot) ?? [];
    attempts.push({ run, index });
    attemptsBySlot.set(run.slot, attempts);
  });

  for (const [slot, attempts] of attemptsBySlot) {
    let activeCount = 0;
    let qualifyingCompletedCount = 0;
    attempts.forEach(({ run, index }, attemptIndex) => {
      const expectedAttemptNumber = attemptIndex + 1;
      if (run.attemptNumber !== expectedAttemptNumber) {
        throw new Error(
          `${run.runId} attemptNumber must be ${expectedAttemptNumber} in slot ${slot}`
        );
      }
      if (attemptIndex === 0) {
        if (run.replacesRunId !== null) {
          throw new Error(`${run.runId} first attempt must use replacesRunId=null`);
        }
      } else {
        const previous = attempts[attemptIndex - 1];
        if (run.replacesRunId !== previous.run.runId) {
          throw new Error(`${run.runId} must replace the immediately preceding invalidated attempt`);
        }
        if (previous.index >= index) {
          throw new Error(`${run.runId} replacement target must appear earlier in the registry`);
        }
        if (previous.run.status !== "invalidated" || previous.run.qualifying !== false) {
          throw new Error(`${run.runId} replacement target must be invalidated and non-qualifying`);
        }
        if (replacedTargets.has(run.replacesRunId)) {
          throw new Error(`${run.replacesRunId} has more than one direct replacement`);
        }
        replacedTargets.add(run.replacesRunId);
      }

      if (run.status === "invalidated") {
        if (run.qualifying !== false || run.winner !== null) {
          throw new Error(`${run.runId} invalidated attempt must remain non-qualifying with winner=null`);
        }
      }
      if (run.status === "pre-reveal-frozen" && run.inputStatus !== "sealed-pending-delivery") {
        throw new Error(
          `${run.runId} pre-reveal-frozen attempt must use inputStatus=sealed-pending-delivery`
        );
      }
      if (ACTIVE_STATUSES.has(run.status)) activeCount += 1;
      if (run.status === "completed" && run.qualifying === true) qualifyingCompletedCount += 1;
    });
    if (activeCount > 1) throw new Error(`slot ${slot} has more than one active attempt`);
    if (qualifyingCompletedCount > 1) {
      throw new Error(`slot ${slot} has more than one qualifying completed attempt`);
    }
  }

  const expectedCounts = computeRegistryCounts(document.runs, document.kpi.targetRuns);
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (document.counts[key] !== expected) {
      throw new Error(
        `${key} count: expected ${JSON.stringify(expected)}, received ${JSON.stringify(document.counts[key])}`
      );
    }
  }
  return expectedCounts;
}

export function computeRegistryCounts(runs, targetRuns = 5) {
  const qualifyingSlots = new Set(
    runs
      .filter((run) => run.status === "completed" && run.qualifying === true)
      .map((run) => run.slot)
  );
  const active = runs.filter((run) => ACTIVE_STATUSES.has(run.status));
  const reservedSlots = new Set([...qualifyingSlots, ...active.map((run) => run.slot)]);
  return {
    attemptsRecorded: runs.length,
    invalidatedAttempts: runs.filter((run) => run.status === "invalidated").length,
    activeAttempts: active.length,
    qualifyingCompleted: qualifyingSlots.size,
    preRevealFrozen: runs.filter((run) => run.status === "pre-reveal-frozen").length,
    remainingToComplete: targetRuns - qualifyingSlots.size,
    unreservedSlots: targetRuns - reservedSlots.size
  };
}

export function semanticAcceptanceSha256(flowDocuments) {
  const documents = Array.isArray(flowDocuments) ? flowDocuments : [flowDocuments];
  if (documents.length === 0) throw new Error("semantic acceptance requires at least one flow document");
  const normalized = documents.map(normalizeSemanticAcceptance);
  const first = stableStringify(normalized[0]);
  for (let index = 1; index < normalized.length; index += 1) {
    if (stableStringify(normalized[index]) !== first) {
      throw new Error("consumer and control semantic acceptance differ");
    }
  }
  return sha256Bytes(first);
}

export function validateFlowV12(document) {
  validateWith(validators.flow, document, "flow acceptance");
  if (document.version !== "1.2.0") {
    throw new Error(`flow acceptance version must be 1.2.0; received ${document.version}`);
  }
  if (document.evaluator.evaluatorId !== `eval-${document.runId}`) {
    throw new Error("flow evaluatorId must derive from canonical runId");
  }

  const flowIds = new Set();
  const stepIds = new Set();
  const assertionIds = new Set();
  const interactions = new Map();
  const approved = document.flows.filter((flow) => flow.status === "approved");
  if (approved.length === 0) throw new Error("v1.2 requires at least one approved flow");
  for (const flow of document.flows) {
    if (flowIds.has(flow.flowId)) throw new Error(`duplicate flowId: ${flow.flowId}`);
    flowIds.add(flow.flowId);
    for (const step of flow.steps) {
      if (stepIds.has(step.stepId)) throw new Error(`duplicate stepId: ${step.stepId}`);
      stepIds.add(step.stepId);
      const prior = interactions.get(step.interactionId);
      const semanticIdentity = `${step.pageId}\0${step.action}`;
      if (prior && prior !== semanticIdentity) {
        throw new Error(`interactionId ${step.interactionId} changed page or semantic action`);
      }
      interactions.set(step.interactionId, semanticIdentity);
      assertStepRuntimeAssertionCoverage(flow, step, assertionIds);
    }
    if (flow.result) {
      for (const rule of flow.result.sideEffectAssertions) {
        assertUniqueAssertionId(rule.assertionId, assertionIds);
      }
    }
    if (flow.status === "approved") {
      if (flow.result.route !== flow.steps.at(-1).expectedRoute) {
        throw new Error(`${flow.flowId} result.route must equal the final expectedRoute`);
      }
    }
  }
  const approvedCrossPageFlowCount = countApprovedCrossPageFlows(document);
  if (approvedCrossPageFlowCount < 1) {
    throw new Error("v1.2 requires at least one approved cross-page flow");
  }
  return {
    approved,
    stepIds,
    interactions,
    approvedCrossPageFlowCount
  };
}

export function countApprovedCrossPageFlows(document) {
  if (!document || !Array.isArray(document.flows)) return 0;
  return document.flows.filter((flow) => flow.status === "approved" && isCrossPageFlow(flow)).length;
}

export function assertionProofToken(descriptor) {
  return `blind-proof-v1:${sha256Bytes(stableStringify(normalizeAssertionDescriptor(descriptor)))}`;
}

export function plannedAssertionProofs(flowDocument) {
  validateFlowV12(flowDocument);
  const { evaluator } = flowDocument;
  const proofs = [];
  for (const flow of flowDocument.flows.filter((entry) => entry.status === "approved")) {
    for (const step of flow.steps) {
      const descriptor = {
        kind: "step-state",
        flowId: flow.flowId,
        stepId: step.stepId,
        expectedState: step.expectedState,
        assertionRefs: [...step.assertionRefs],
        sideEffect: null,
        evaluatorId: evaluator.evaluatorId,
        revision: evaluator.revision
      };
      proofs.push({
        ...descriptor,
        token: assertionProofToken(descriptor),
        testTitle: null,
        testStatus: null,
        expectedStatus: null,
        outcome: null,
        retry: null,
        tokenStepCount: 0,
        expectCount: 0,
        failedExpectCount: 0,
        executed: false,
        checkedAt: null
      });
    }
    const descriptor = {
      kind: "flow-side-effect",
      flowId: flow.flowId,
      stepId: null,
      expectedState: null,
      assertionRefs: [],
      sideEffect: flow.result.sideEffect,
      evaluatorId: evaluator.evaluatorId,
      revision: evaluator.revision
    };
    proofs.push({
      ...descriptor,
      token: assertionProofToken(descriptor),
      testTitle: null,
      testStatus: null,
      expectedStatus: null,
      outcome: null,
      retry: null,
      tokenStepCount: 0,
      expectCount: 0,
      failedExpectCount: 0,
      executed: false,
      checkedAt: null
    });
  }
  return proofs;
}

export function plannedObservationProofs(flowDocument) {
  validateFlowV12(flowDocument);
  const { evaluator } = flowDocument;
  const proofs = [];
  for (const flow of flowDocument.flows.filter((entry) => entry.status === "approved")) {
    for (const step of flow.steps) {
      for (const rule of step.runtimeAssertions) {
        proofs.push({
          kind: "step-state",
          flowId: flow.flowId,
          stepId: step.stepId,
          assertionId: rule.assertionId,
          assertionRef: rule.assertionRef,
          targetId: rule.targetId,
          matcher: rule.matcher,
          attribute: rule.attribute,
          expected: rule.expected,
          observed: null,
          matchedCount: null,
          passed: false,
          checkedAt: null,
          evaluatorId: evaluator.evaluatorId,
          revision: evaluator.revision
        });
      }
    }
    for (const rule of flow.result.sideEffectAssertions) {
      proofs.push({
        kind: "flow-side-effect",
        flowId: flow.flowId,
        stepId: null,
        assertionId: rule.assertionId,
        assertionRef: null,
        targetId: rule.targetId,
        matcher: rule.matcher,
        attribute: rule.attribute,
        expected: rule.expected,
        observed: null,
        matchedCount: null,
        passed: false,
        checkedAt: null,
        evaluatorId: evaluator.evaluatorId,
        revision: evaluator.revision
      });
    }
  }
  return proofs;
}

export function readEvaluatorEnvelope(receiptPath) {
  const absoluteReceiptPath = resolve(receiptPath);
  if (!existsSync(absoluteReceiptPath) || !statSync(absoluteReceiptPath).isFile()) {
    throw new Error(`evaluator receipt file is missing: ${receiptPath}`);
  }
  if (lstatSync(absoluteReceiptPath).isSymbolicLink()) {
    throw new Error(`evaluator receipt must not be a symbolic link: ${receiptPath}`);
  }
  const bytes = readFileSync(absoluteReceiptPath);
  let document;
  try {
    document = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`evaluator receipt is not valid JSON: ${error.message}`);
  }
  validateEvaluatorEnvelope(document);
  return {
    receiptPath: absoluteReceiptPath,
    evaluatorRoot: dirname(absoluteReceiptPath),
    receiptSha256: sha256Bytes(bytes),
    receiptBytes: bytes,
    document
  };
}

export function validateEvaluatorEnvelope(document) {
  validateWith(validators.evaluatorReceipt, document, "evaluator receipt");
  if (document.evaluatorId !== `eval-${document.runId}`) {
    throw new Error("evaluatorId must derive from canonical runId");
  }
  for (const arm of ["consumer", "control"]) {
    const product = document.products[arm];
    if (product.runId !== document.runId || product.arm !== arm) {
      throw new Error(`${arm} product snapshot identity differs from evaluator receipt`);
    }
  }
  if (document.products.consumer.artifactId === document.products.control.artifactId) {
    throw new Error("evaluator products must use distinct artifactId values");
  }
  return document;
}

export function validateEvaluatorReceipt(document, options = {}) {
  validateEvaluatorEnvelope(document);

  const { previousDocument = null, previousPath = null } = options;
  if (document.revision === 1) {
    if (previousDocument !== null) throw new Error("revision 1 cannot have a previous document");
    return document;
  }
  if (!previousDocument || !previousPath) {
    throw new Error("revision 2 requires the previous evaluator receipt and path");
  }
  validateWith(validators.evaluatorReceipt, previousDocument, "previous evaluator receipt");
  if (previousDocument.revision + 1 !== document.revision) {
    throw new Error("evaluator revision must increment by one");
  }
  if (document.previousRevision.path !== previousPath) {
    throw new Error("previous evaluator revision path mismatch");
  }
  if (document.previousRevision.sha256 !== sha256Bytes(stableDocumentBytes(previousDocument))) {
    throw new Error("previous evaluator revision hash mismatch");
  }
  if (document.semanticAcceptanceSha256 !== previousDocument.semanticAcceptanceSha256) {
    throw new Error("evaluator correction changed semantic acceptance");
  }
  for (const field of ["preRevealContract", "inputReceipt"]) {
    if (stableStringify(document[field]) !== stableStringify(previousDocument[field])) {
      throw new Error(`evaluator correction changed ${field}`);
    }
  }
  for (const arm of ["consumer", "control"]) {
    const before = productIdentitySnapshot(previousDocument.products[arm]);
    const after = productIdentitySnapshot(document.products[arm]);
    if (stableStringify(before) !== stableStringify(after)) {
      throw new Error(`${arm} product hashes changed during evaluator correction`);
    }
  }
  return document;
}

export function verifyEvaluatorReceiptFiles(receiptPath) {
  const envelope = readEvaluatorEnvelope(receiptPath);
  const { receiptPath: absoluteReceiptPath, evaluatorRoot, document } = envelope;
  let previousDocument = null;
  let previousPath = null;
  if (document.revision === 2) {
    previousPath = document.previousRevision.path;
    const absolutePreviousPath = resolveRecordedPath(
      evaluatorRoot,
      document.previousRevision.path,
      "previous evaluator receipt"
    );
    verifyHash(absolutePreviousPath, document.previousRevision.sha256, "previous evaluator receipt");
    previousDocument = JSON.parse(readFileSync(absolutePreviousPath, "utf8"));
  }
  validateEvaluatorReceipt(document, { previousDocument, previousPath });

  const preRevealPath = verifyFileHashRecord(
    evaluatorRoot,
    document.preRevealContract,
    "pre-reveal contract"
  );
  const preReveal = JSON.parse(readFileSync(preRevealPath, "utf8"));
  validatePreRevealV11(preReveal);
  if (preReveal.runId !== document.runId) {
    throw new Error("pre-reveal runId differs from evaluator receipt");
  }
  const inputReceiptPath = verifyFileHashRecord(
    evaluatorRoot,
    document.inputReceipt,
    "input receipt"
  );
  const inputReceipt = JSON.parse(readFileSync(inputReceiptPath, "utf8"));
  validateWith(validators.inputReceipt, inputReceipt, "input receipt");
  if (inputReceipt.version !== "1.1.0" ||
      inputReceipt.runId !== document.runId ||
      inputReceipt.slot !== canonicalSlotFromRunId(document.runId) ||
      inputReceipt.attemptNumber !== preReveal.attemptNumber ||
      inputReceipt.preRevealContract.sha256 !== document.preRevealContract.sha256) {
    throw new Error("input receipt identity differs from pre-reveal and evaluator receipts");
  }

  verifyFileHashRecord(evaluatorRoot, document.runner.config, "evaluator runner config");
  const flowDocuments = {};
  for (const arm of ["consumer", "control"]) {
    const evaluatorArm = document.arms[arm];
    for (const [name, record] of Object.entries(evaluatorArm)) {
      if (name === "interactionExposureMode") continue;
      verifyFileHashRecord(evaluatorRoot, record, `${arm} evaluator ${name}`);
    }
    const flowPath = resolveRecordedPath(
      evaluatorRoot,
      evaluatorArm.flowAcceptance.path,
      `${arm} flow acceptance`
    );
    const flow = JSON.parse(readFileSync(flowPath, "utf8"));
    validateFlowV12(flow);
    const product = document.products[arm];
    const frozenArm = preReveal.arms.find((entry) => entry.id === arm);
    if (!frozenArm || frozenArm.artifactId !== product.artifactId) {
      throw new Error(`${arm} evaluator artifactId differs from pre-reveal contract`);
    }
    assertCanonicalIdentity(
      {
        runId: flow.runId,
        arm: flow.arm,
        projectId: flow.projectId,
        artifactId: flow.artifactUnderTest.artifactId
      },
      product,
      `${arm} flow product identity`
    );
    if (flow.evaluator.evaluatorId !== document.evaluatorId ||
        flow.evaluator.revision !== document.revision) {
      throw new Error(`${arm} flow evaluator identity differs from evaluator receipt`);
    }

    const productReceiptPath = resolveRecordedPath(
      evaluatorRoot,
      product.receipt.path,
      `${arm} artifact receipt`
    );
    verifyHash(productReceiptPath, product.receipt.sha256, `${arm} artifact receipt`);
    const productReceipt = JSON.parse(readFileSync(productReceiptPath, "utf8"));
    validateWith(validators.artifactReceipt, productReceipt, `${arm} artifact receipt`);
    if (productReceipt.version !== "1.1.0") {
      throw new Error(`${arm} artifact receipt must use version 1.1.0`);
    }
    assertCanonicalIdentity(productReceipt, product, `${arm} artifact receipt identity`);

    const sealPath = resolveRecordedPath(evaluatorRoot, product.seal.path, `${arm} artifact seal`);
    verifyHash(sealPath, product.seal.sha256, `${arm} artifact seal`);
    const seal = JSON.parse(readFileSync(sealPath, "utf8"));
    validateArtifactSeal(seal);
    assertCanonicalIdentity(seal, product, `${arm} artifact seal identity`);
    if (seal.receipt.sha256 !== product.receipt.sha256 ||
        productReceipt.source.sha256 !== product.sourceSha256 ||
        productReceipt.build.sha256 !== product.buildSha256 ||
        seal.source.sha256 !== product.sourceSha256 ||
        seal.build.sha256 !== product.buildSha256) {
      throw new Error(`${arm} product snapshot hashes differ across receipt, seal, and evaluator`);
    }
    if (flow.artifactUnderTest.receiptSha256 !== product.receipt.sha256 ||
        flow.artifactUnderTest.sealSha256 !== product.seal.sha256) {
      throw new Error(`${arm} flow artifact hashes differ from evaluator receipt`);
    }
    flowDocuments[arm] = flow;
  }
  const semanticHash = semanticAcceptanceSha256([
    flowDocuments.consumer,
    flowDocuments.control
  ]);
  if (semanticHash !== document.semanticAcceptanceSha256) {
    throw new Error("evaluator semantic acceptance hash mismatch");
  }
  if (document.revision === 2) {
    for (const record of document.correction.priorFailureEvidence) {
      verifyFileHashRecord(evaluatorRoot, record, "prior failure evidence");
    }
  }
  return {
    receiptPath: absoluteReceiptPath,
    receiptSha256: envelope.receiptSha256,
    evaluatorRoot,
    document,
    preReveal,
    inputReceipt,
    flowDocuments
  };
}

export function validateEvidenceV12(document, options = {}) {
  validateWith(validators.evidence, document, "flow acceptance evidence");
  if (document.status === "failed" && document.exitCode === 0 && document.error === null) {
    throw new Error("failed evidence must record a non-zero exit or execution error");
  }
  const expectedIdentity = {
    runId: document.runId,
    arm: document.arm,
    projectId: document.projectId,
    artifactId: document.artifactId
  };
  if (document.status === "passed") {
    assertCanonicalIdentity(document.runtimeIdentity, expectedIdentity, "runtime identity");
  }
  if (document.evaluatorId !== `eval-${document.runId}`) {
    throw new Error("evidence evaluatorId must derive from canonical runId");
  }

  const flowDocument = options.flowDocument ?? null;
  if (flowDocument) {
    validateFlowV12(flowDocument);
    assertCanonicalIdentity(
      {
        runId: flowDocument.runId,
        arm: flowDocument.arm,
        projectId: flowDocument.projectId,
        artifactId: flowDocument.artifactUnderTest.artifactId
      },
      expectedIdentity,
      "flow evidence identity"
    );
    if (flowDocument.evaluator.evaluatorId !== document.evaluatorId ||
        flowDocument.evaluator.revision !== document.revision) {
      throw new Error("flow evaluator identity differs from evidence");
    }
    assertStepProofCoverage(flowDocument, document.stepProofs);
    assertRecoveryProofCoverage(flowDocument, document.recoveryProofs);
    assertAssertionProofCoverage(flowDocument, document.assertionProofs);
    assertObservationProofCoverage(flowDocument, document.observationProofs);
    const expectedCrossPageFlowCount = countApprovedCrossPageFlows(flowDocument);
    if (document.metrics.approvedCrossPageFlowCount !== expectedCrossPageFlowCount) {
      throw new Error(
        `approvedCrossPageFlowCount must equal ${expectedCrossPageFlowCount}, received ${document.metrics.approvedCrossPageFlowCount}`
      );
    }
  }
  const evidenceRoot = options.evidenceRoot ?? null;
  const pageRoutes = options.pageRoutes ?? (
    document.status === "passed" && evidenceRoot
      ? loadPageRoutesFromArtifactReceipt(evidenceRoot, document.artifact.receipt)
      : null
  );
  if (document.status === "passed") {
    if (!flowDocument) throw new Error("passed evidence requires the approved flow document");
    if (!pageRoutes) throw new Error("passed evidence requires trusted page routes");
    assertPassedRuntimeProofs(flowDocument, document, pageRoutes);
    assertPassedAssertionProofs(flowDocument, document.assertionProofs);
    assertPassedObservationProofs(flowDocument, document.observationProofs);
  }
  const observableAssertionMismatchCount = countObservationProofFailures(document.observationProofs);
  if (document.metrics.observableAssertionMismatchCount !== observableAssertionMismatchCount) {
    throw new Error(
      `observableAssertionMismatchCount must equal ${observableAssertionMismatchCount}, received ${document.metrics.observableAssertionMismatchCount}`
    );
  }

  if (evidenceRoot) {
    const failedPreflight = document.status === "failed" && !document.preflightCompleted;
    if (!failedPreflight) {
      verifyFileHashRecord(evidenceRoot, document.artifact.receipt, "artifact receipt evidence");
      verifyFileHashRecord(evidenceRoot, document.artifact.seal, "artifact seal evidence");
    }
    verifyFileHashRecord(evidenceRoot, document.evaluatorReceipt, "evaluator receipt evidence");
    for (const [name, record] of Object.entries(document.outputs)) {
      verifyFileRecord(evidenceRoot, record, `${name} raw output`);
    }
    for (const screenshot of document.screenshots) {
      verifyFileRecord(evidenceRoot, screenshot, "screenshot");
    }
  }
  return document;
}

export function validateConsumerPackageReceipt(document) {
  validateWith(validators.consumerPackageReceipt, document, "consumer package receipt");
  if (document.repeatPack.firstSha256 !== document.repeatPack.secondSha256 ||
      document.repeatPack.firstSha256 !== document.package.sha256) {
    throw new Error("repeat pack hashes must equal the frozen package hash");
  }
  return document;
}

export function assertSealAvailableBeforeBuild({ sealRoot, projectRoot, artifactId }) {
  const root = assertExternalSealRoot(sealRoot, projectRoot, { mustExist: false });
  const sealPath = resolve(root, `${artifactId}.seal.json`);
  if (existsSync(sealPath)) {
    throw new Error(`artifact seal already exists before build: ${sealPath}`);
  }
  const claimPath = resolve(root, `${artifactId}.claim.json`);
  if (existsSync(claimPath)) {
    throw new Error(`artifact seal claim already exists before build: ${claimPath}`);
  }
  return sealPath;
}

export function reserveArtifactSealClaim({ sealRoot, projectRoot, identity }) {
  assertCanonicalIdentity(identity, identity, "artifact seal claim identity");
  const sealPath = assertSealAvailableBeforeBuild({
    sealRoot,
    projectRoot,
    artifactId: identity.artifactId
  });
  mkdirSync(sealRoot, { recursive: true });
  assertExternalSealRoot(sealRoot, projectRoot, { mustExist: true });
  const claimPath = resolve(sealRoot, `${identity.artifactId}.claim.json`);
  const claim = {
    version: "1.0.0",
    rootId: "blind-protocol-v1.2",
    ...identity,
    state: "reserved",
    reservedAt: new Date().toISOString()
  };
  writeFileSync(claimPath, stableDocumentBytes(claim), {
    encoding: "utf8",
    flag: "wx"
  });
  return { claimPath, sealPath, claim };
}

export function writeArtifactSealExclusive({ sealRoot, projectRoot, seal }) {
  validateWith(validators.artifactSeal, seal, "artifact seal");
  const root = assertExternalSealRoot(sealRoot, projectRoot, { mustExist: true });
  const sealPath = resolve(root, `${seal.artifactId}.seal.json`);
  if (existsSync(sealPath)) throw new Error(`artifact seal already exists: ${sealPath}`);
  const claimPath = resolve(root, `${seal.artifactId}.claim.json`);
  if (!existsSync(claimPath)) {
    throw new Error(`artifact seal claim is missing: ${claimPath}`);
  }
  const claim = JSON.parse(readFileSync(claimPath, "utf8"));
  assertCanonicalIdentity(claim, seal, "artifact seal claim");
  if (claim.version !== "1.0.0" ||
      claim.rootId !== "blind-protocol-v1.2" ||
      claim.state !== "reserved") {
    throw new Error("artifact seal claim is invalid");
  }
  writeFileSync(sealPath, stableDocumentBytes(seal), {
    encoding: "utf8",
    flag: "wx"
  });
  return sealPath;
}

export function validateArtifactSeal(document) {
  validateWith(validators.artifactSeal, document, "artifact seal");
  return document;
}

export function assertExternalSealRoot(sealRoot, projectRoot, options = {}) {
  if (typeof sealRoot !== "string" || !isAbsolute(sealRoot)) {
    throw new Error("seal root must be an absolute path");
  }
  const root = resolve(sealRoot);
  const project = resolve(projectRoot);
  if (isInside(project, root) || isInside(root, project)) {
    throw new Error("seal root must stay outside the product project");
  }
  if (options.mustExist && (!existsSync(root) || !statSync(root).isDirectory())) {
    throw new Error(`seal root is missing: ${root}`);
  }
  let cursor = root;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
    throw new Error(`seal root ancestor must not be a symbolic link: ${cursor}`);
  }
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) {
    throw new Error(`seal root must not be a symbolic link: ${root}`);
  }
  return root;
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(file) {
  return sha256Bytes(readFileSync(file));
}

export function stableDocumentBytes(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function compileSchema(fileName) {
  const schema = JSON.parse(readFileSync(resolve(kitRoot, "schema", fileName), "utf8"));
  return ajv.compile(schema);
}

function validateWith(validator, document, label) {
  if (!validator(document)) {
    throw new Error(
      `${label} schema failed: ${ajv.errorsText(validator.errors, { separator: "; " })}`
    );
  }
}

function normalizeSemanticAcceptance(document) {
  validateFlowV12(document);
  return document.flows
    .filter((flow) => flow.status === "approved")
    .map((flow) => ({
      flowId: flow.flowId,
      objectRefs: [...flow.objectRefs],
      steps: flow.steps.map((step) => ({
        stepId: step.stepId,
        interactionId: step.interactionId,
        pageId: step.pageId,
        action: step.action,
        expectedRoute: step.expectedRoute,
        expectedState: step.expectedState,
        assertionRefs: [...step.assertionRefs].sort((left, right) => left.localeCompare(right, "en")),
        runtimeAssertions: step.runtimeAssertions
          .map(normalizeRuntimeAssertion)
          .sort((left, right) => left.assertionId.localeCompare(right.assertionId, "en"))
      })),
      result: {
        route: flow.result.route,
        sideEffect: flow.result.sideEffect,
        recovery: flow.result.recovery,
        recoveryInteractionId: flow.result.recoveryInteractionId,
        recoveryExpectedRoute: flow.result.recoveryExpectedRoute,
        sideEffectAssertions: flow.result.sideEffectAssertions
          .map(normalizeRuntimeAssertion)
          .sort((left, right) => left.assertionId.localeCompare(right.assertionId, "en"))
      }
    }))
    .sort((left, right) => left.flowId.localeCompare(right.flowId, "en"));
}

function isCrossPageFlow(flow) {
  const pageIds = new Set((flow.steps ?? []).map((step) => step.pageId));
  const routes = new Set((flow.steps ?? []).map((step) => routePath(step.expectedRoute)));
  return pageIds.size >= 2 && routes.size >= 2;
}

function routePath(route) {
  return typeof route === "string" ? route.split(/[?#]/, 1)[0] : null;
}

function assertStepRuntimeAssertionCoverage(flow, step, assertionIds) {
  const expectedRefs = new Set(step.assertionRefs);
  const coveredRefs = new Set();
  for (const rule of step.runtimeAssertions) {
    assertUniqueAssertionId(rule.assertionId, assertionIds);
    if (!expectedRefs.has(rule.assertionRef)) {
      throw new Error(
        `${flow.flowId}/${step.stepId} runtime assertion ${rule.assertionId} references an undeclared assertionRef`
      );
    }
    if (coveredRefs.has(rule.assertionRef)) {
      throw new Error(
        `${flow.flowId}/${step.stepId} assertionRef ${rule.assertionRef} has more than one runtime assertion`
      );
    }
    coveredRefs.add(rule.assertionRef);
  }
  if (coveredRefs.size !== expectedRefs.size) {
    const missing = [...expectedRefs].filter((reference) => !coveredRefs.has(reference));
    throw new Error(
      `${flow.flowId}/${step.stepId} runtime assertions do not cover assertionRefs exactly: missing ${missing.join(", ")}`
    );
  }
}

function assertUniqueAssertionId(assertionId, assertionIds) {
  if (assertionIds.has(assertionId)) {
    throw new Error(`duplicate runtime assertionId: ${assertionId}`);
  }
  assertionIds.add(assertionId);
}

function normalizeRuntimeAssertion(rule) {
  return {
    assertionId: rule.assertionId,
    ...(Object.hasOwn(rule, "assertionRef") ? { assertionRef: rule.assertionRef } : {}),
    targetId: rule.targetId,
    matcher: rule.matcher,
    attribute: rule.attribute,
    expected: rule.expected
  };
}

function normalizeAssertionDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object") {
    throw new Error("assertion proof descriptor must be an object");
  }
  const base = {
    version: "1.2.0",
    kind: descriptor.kind,
    flowId: descriptor.flowId,
    evaluatorId: descriptor.evaluatorId,
    revision: descriptor.revision
  };
  if (typeof base.flowId !== "string" || base.flowId.length === 0 ||
      typeof base.evaluatorId !== "string" || !Number.isInteger(base.revision)) {
    throw new Error("assertion proof descriptor has an invalid identity");
  }
  if (descriptor.kind === "step-state") {
    if (typeof descriptor.stepId !== "string" || descriptor.stepId.length === 0 ||
        typeof descriptor.expectedState !== "string" || descriptor.expectedState.length === 0 ||
        !Array.isArray(descriptor.assertionRefs) || descriptor.assertionRefs.length === 0 ||
        descriptor.sideEffect !== null) {
      throw new Error("step-state assertion proof descriptor is incomplete");
    }
    return {
      ...base,
      stepId: descriptor.stepId,
      expectedState: descriptor.expectedState,
      assertionRefs: [...descriptor.assertionRefs].sort((left, right) => left.localeCompare(right, "en")),
      sideEffect: null
    };
  }
  if (descriptor.kind === "flow-side-effect") {
    if (descriptor.stepId !== null || descriptor.expectedState !== null ||
        !Array.isArray(descriptor.assertionRefs) || descriptor.assertionRefs.length !== 0 ||
        typeof descriptor.sideEffect !== "string" || descriptor.sideEffect.length === 0) {
      throw new Error("flow-side-effect assertion proof descriptor is incomplete");
    }
    return {
      ...base,
      stepId: null,
      expectedState: null,
      assertionRefs: [],
      sideEffect: descriptor.sideEffect
    };
  }
  throw new Error(`unknown assertion proof kind: ${JSON.stringify(descriptor.kind)}`);
}

function productIdentitySnapshot(product) {
  return {
    runId: product.runId,
    arm: product.arm,
    projectId: product.projectId,
    artifactId: product.artifactId,
    receipt: product.receipt,
    seal: product.seal,
    sourceSha256: product.sourceSha256,
    buildSha256: product.buildSha256,
    runtimeEntry: product.runtimeEntry,
    runtimeIdentityPath: product.runtimeIdentityPath
  };
}

function assertStepProofCoverage(flowDocument, proofs) {
  const expected = new Map();
  for (const flow of flowDocument.flows.filter((entry) => entry.status === "approved")) {
    for (const step of flow.steps) {
      expected.set(`${flow.flowId}\0${step.stepId}`, {
        flowId: flow.flowId,
        stepId: step.stepId,
        interactionId: step.interactionId,
        pageId: step.pageId,
        action: step.action,
        evaluatorId: flowDocument.evaluator.evaluatorId,
        revision: flowDocument.evaluator.revision,
        expectedRoute: step.expectedRoute
      });
    }
  }
  const seen = new Set();
  for (const proof of proofs) {
    const key = `${proof.flowId}\0${proof.stepId}`;
    const target = expected.get(key);
    if (!target) throw new Error(`step proof references an unknown approved step: ${proof.stepId}`);
    if (seen.has(key)) throw new Error(`duplicate step proof: ${proof.stepId}`);
    seen.add(key);
    for (const field of ["interactionId", "pageId", "action", "evaluatorId", "revision"]) {
      if (proof[field] !== target[field]) {
        throw new Error(`${proof.stepId} proof ${field} differs from flow acceptance`);
      }
    }
  }
  if (seen.size !== expected.size) throw new Error("step proofs must cover every approved step");
}

function assertRecoveryProofCoverage(flowDocument, proofs) {
  const expected = new Map(
    flowDocument.flows
      .filter((flow) => flow.status === "approved")
      .map((flow) => [flow.flowId, {
        interactionId: flow.result.recoveryInteractionId,
        action: flow.result.recovery,
        expectedRoute: flow.result.recoveryExpectedRoute,
        evaluatorId: flowDocument.evaluator.evaluatorId,
        revision: flowDocument.evaluator.revision,
        resultRoute: flow.result.route
      }])
  );
  const seen = new Set();
  for (const proof of proofs) {
    const target = expected.get(proof.flowId);
    if (!target) throw new Error(`recovery proof references an unknown approved flow: ${proof.flowId}`);
    if (seen.has(proof.flowId)) throw new Error(`duplicate recovery proof: ${proof.flowId}`);
    seen.add(proof.flowId);
    for (const field of ["interactionId", "action", "expectedRoute", "evaluatorId", "revision"]) {
      if (proof[field] !== target[field]) {
        throw new Error(`${proof.flowId} recovery proof ${field} differs from flow acceptance`);
      }
    }
  }
  if (seen.size !== expected.size) throw new Error("recovery proofs must cover every approved flow");
}

function assertAssertionProofCoverage(flowDocument, proofs) {
  const expected = new Map(plannedAssertionProofs(flowDocument).map((proof) => [proof.token, proof]));
  const seen = new Set();
  for (const proof of proofs) {
    const target = expected.get(proof.token);
    if (!target) throw new Error(`assertion proof token is not frozen by the approved flow: ${proof.token}`);
    if (seen.has(proof.token)) throw new Error(`duplicate assertion proof token: ${proof.token}`);
    seen.add(proof.token);
    const derivedToken = assertionProofToken(proof);
    if (derivedToken !== proof.token) {
      throw new Error(`assertion proof token does not match its semantic claim: ${proof.token}`);
    }
    for (const field of [
      "kind",
      "flowId",
      "stepId",
      "expectedState",
      "assertionRefs",
      "sideEffect",
      "evaluatorId",
      "revision"
    ]) {
      if (stableStringify(proof[field]) !== stableStringify(target[field])) {
        throw new Error(`${proof.token} assertion proof ${field} differs from the approved flow`);
      }
    }
  }
  if (seen.size !== expected.size) throw new Error("assertion proofs must cover every approved step-state and flow side-effect");
}

function assertObservationProofCoverage(flowDocument, proofs) {
  const expected = new Map(
    plannedObservationProofs(flowDocument).map((proof) => [proof.assertionId, proof])
  );
  const seen = new Set();
  for (const proof of proofs) {
    const target = expected.get(proof.assertionId);
    if (!target) {
      throw new Error(`observation proof assertionId is not frozen by the approved flow: ${proof.assertionId}`);
    }
    if (seen.has(proof.assertionId)) {
      throw new Error(`duplicate observation proof assertionId: ${proof.assertionId}`);
    }
    seen.add(proof.assertionId);
    for (const field of [
      "kind",
      "flowId",
      "stepId",
      "assertionId",
      "assertionRef",
      "targetId",
      "matcher",
      "attribute",
      "expected",
      "evaluatorId",
      "revision"
    ]) {
      if (stableStringify(proof[field]) !== stableStringify(target[field])) {
        throw new Error(`${proof.assertionId} observation proof ${field} differs from the approved flow`);
      }
    }
    const observedPassed = observationMatches(proof);
    if (proof.passed !== observedPassed) {
      throw new Error(`${proof.assertionId} observation proof passed does not match its observed value`);
    }
  }
  if (seen.size !== expected.size) {
    throw new Error("observation proofs must cover every approved runtime and side-effect assertion");
  }
}

function assertPassedRuntimeProofs(flowDocument, evidence, pageRoutes) {
  const steps = new Map();
  for (const flow of flowDocument.flows.filter((entry) => entry.status === "approved")) {
    for (const step of flow.steps) steps.set(`${flow.flowId}\0${step.stepId}`, step);
  }
  const normalizedPageRoutes = normalizePageRoutes(pageRoutes);
  for (const proof of evidence.stepProofs) {
    const step = steps.get(`${proof.flowId}\0${proof.stepId}`);
    if (proof.matchedCount !== 1 || proof.visible !== true || proof.actionExecuted !== true) {
      throw new Error(`${proof.stepId} passed proof must locate one visible executed interaction`);
    }
    if (proof.routeAfter !== step.expectedRoute) {
      throw new Error(`${proof.stepId} proof routeAfter differs from expectedRoute`);
    }
    if (normalizedPageRoutes) {
      const pageRoute = normalizedPageRoutes.get(step.pageId);
      if (!pageRoute) throw new Error(`passed evidence page route is missing for ${step.pageId}`);
      if (!routeBelongsToPage(proof.routeBefore, pageRoute)) {
        throw new Error(`${proof.stepId} proof routeBefore does not belong to ${step.pageId}`);
      }
    }
  }
  const flows = new Map(
    flowDocument.flows
      .filter((entry) => entry.status === "approved")
      .map((flow) => [flow.flowId, flow])
  );
  for (const proof of evidence.recoveryProofs) {
    const flow = flows.get(proof.flowId);
    if (proof.matchedCount !== 1 || proof.visible !== true || proof.actionExecuted !== true) {
      throw new Error(`${proof.flowId} passed recovery proof must locate one visible executed interaction`);
    }
    if (proof.routeBefore !== flow.result.route) {
      throw new Error(`${proof.flowId} recovery proof routeBefore differs from result.route`);
    }
    if (proof.routeAfter !== flow.result.recoveryExpectedRoute) {
      throw new Error(`${proof.flowId} recovery proof routeAfter differs from recoveryExpectedRoute`);
    }
  }
}

function assertPassedAssertionProofs(flowDocument, proofs) {
  const expected = plannedAssertionProofs(flowDocument);
  if (proofs.length !== expected.length) {
    throw new Error("passed evidence assertion proof count differs from the approved flow");
  }
  for (const proof of proofs) {
    if (proof.executed !== true || proof.testStatus !== "passed" ||
        proof.expectedStatus !== "passed" || proof.outcome !== "expected") {
      throw new Error(`${proof.token} passed assertion proof must come from a passed test`);
    }
    if (proof.retry !== 0) throw new Error(`${proof.token} passed assertion proof must run without retry`);
    if (proof.tokenStepCount !== 1) {
      throw new Error(`${proof.token} passed assertion proof must have exactly one matching test.step`);
    }
    if (proof.expectCount < 1 || proof.failedExpectCount !== 0) {
      throw new Error(`${proof.token} passed assertion proof must include a successful Playwright expect`);
    }
    if (typeof proof.testTitle !== "string" || proof.testTitle.length === 0 || proof.checkedAt === null) {
      throw new Error(`${proof.token} passed assertion proof is missing its executed test identity`);
    }
  }
}

function assertPassedObservationProofs(flowDocument, proofs) {
  const expected = plannedObservationProofs(flowDocument);
  if (proofs.length !== expected.length) {
    throw new Error("passed evidence observation proof count differs from the approved flow");
  }
  for (const proof of proofs) {
    if (proof.matchedCount !== 1 || proof.passed !== true || proof.checkedAt === null) {
      throw new Error(`${proof.assertionId} passed observation proof is incomplete`);
    }
    if (!observationMatches(proof)) {
      throw new Error(`${proof.assertionId} passed observation proof does not match the observed DOM value`);
    }
  }
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

function normalizePageRoutes(pageRoutes) {
  if (pageRoutes === null || pageRoutes === undefined) return null;
  if (pageRoutes instanceof Map) return pageRoutes;
  if (typeof pageRoutes === "object" && !Array.isArray(pageRoutes)) {
    return new Map(Object.entries(pageRoutes));
  }
  throw new Error("pageRoutes must be a Map or object when provided");
}

function loadPageRoutesFromArtifactReceipt(evidenceRoot, artifactReceiptRecord) {
  const receiptPath = resolveRecordedPath(
    evidenceRoot,
    artifactReceiptRecord.path,
    "artifact receipt evidence"
  );
  verifyHash(receiptPath, artifactReceiptRecord.sha256, "artifact receipt evidence");
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch (error) {
    throw new Error(`artifact receipt evidence is not valid JSON: ${error.message}`);
  }
  const pagesRecord = receipt.contracts?.pages;
  if (!pagesRecord || typeof pagesRecord.path !== "string" || typeof pagesRecord.sha256 !== "string") {
    throw new Error("artifact receipt evidence is missing the frozen pages contract");
  }
  const productRoot = dirname(dirname(receiptPath));
  const pagesPath = resolve(productRoot, pagesRecord.path);
  if (!isInside(productRoot, pagesPath) || !existsSync(pagesPath) || !statSync(pagesPath).isFile()) {
    throw new Error(`frozen pages contract is missing: ${pagesRecord.path}`);
  }
  verifyHash(pagesPath, pagesRecord.sha256, "frozen pages contract");
  let pages;
  try {
    pages = JSON.parse(readFileSync(pagesPath, "utf8"));
  } catch (error) {
    throw new Error(`frozen pages contract is not valid JSON: ${error.message}`);
  }
  const routes = new Map((pages.pages ?? []).map((page) => [page.id, page.route]));
  if (routes.size === 0) throw new Error("frozen pages contract has no page routes");
  return routes;
}

function routeBelongsToPage(route, pageRoute) {
  if (typeof route !== "string" || typeof pageRoute !== "string") return false;
  const actual = new URL(route, "http://blind.local");
  const expected = new URL(pageRoute, "http://blind.local");
  return actual.pathname === expected.pathname;
}

function verifyFileRecord(root, record, label) {
  if (typeof record.path !== "string" || isAbsolute(record.path)) {
    throw new Error(`${label} path must be relative to evidence root`);
  }
  const file = resolve(root, record.path);
  if (!isInside(root, file) || !existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`${label} file is missing: ${record.path}`);
  }
  if (statSync(file).size !== record.bytes && Object.hasOwn(record, "bytes")) {
    throw new Error(`${label} byte count mismatch: ${record.path}`);
  }
  if (sha256File(file) !== record.sha256) {
    throw new Error(`${label} hash mismatch: ${record.path}`);
  }
}

function verifyFileHashRecord(root, record, label) {
  const file = resolveRecordedPath(root, record.path, label);
  verifyHash(file, record.sha256, label);
  return file;
}

function resolveRecordedPath(root, recordedPath, label) {
  if (typeof recordedPath !== "string" || recordedPath.length === 0) {
    throw new Error(`${label} path must be a non-empty string`);
  }
  const file = isAbsolute(recordedPath) ? resolve(recordedPath) : resolve(root, recordedPath);
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`${label} file is missing: ${recordedPath}`);
  }
  if (lstatSync(file).isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${recordedPath}`);
  }
  return file;
}

function verifyHash(file, expected, label) {
  const actual = sha256File(file);
  if (actual !== expected) {
    throw new Error(`${label} hash mismatch: expected ${expected}, received ${actual}`);
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
