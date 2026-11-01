import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  computeRegistryCounts,
  REQUIRED_PROTOCOL_FILES,
  validateConsumerPackageReceipt,
  validatePreRevealV11,
  validateRegistryV11
} from "./blind-protocol-v1.2-lib.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(kitRoot, "..");
const values = process.argv.slice(2);
const runFixtures = values.includes("--test-fixtures");
const requireLocalPackage = values.includes("--require-local-package");
const requirePrivateReveal = values.includes("--require-private-reveal");
const errors = [];
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validateRegistrySchema = ajv.compile(readJson(resolve(kitRoot, "schema/blind-adoption-registry.schema.json")));
const validateContractSchema = ajv.compile(readJson(resolve(kitRoot, "schema/blind-prd-pre-reveal-contract.schema.json")));
const validateInputReceiptSchema = ajv.compile(readJson(resolve(kitRoot, "schema/blind-prd-input-receipt.schema.json")));
const registryPath = resolve(kitRoot, "quality/blind-adoption-registry.json");
const registry = readJson(registryPath);

if (!validateRegistrySchema(registry)) {
  errors.push(`blind adoption registry schema failed: ${ajv.errorsText(validateRegistrySchema.errors, { separator: "; " })}`);
} else {
  if (registry.version === "1.1.0") {
    try {
      validateRegistryV11(registry);
      validateRegistryRuns(registry);
    } catch (error) {
      errors.push(error.message);
    }
  } else {
    validateRegistry(registry);
  }
}
if (runFixtures) validateFixtures();

if (errors.length > 0) {
  for (const error of errors) console.error(`validate-blind-adoption failed: ${error}`);
  process.exit(1);
}

console.log(
  `validate-blind-adoption passed: completed=${registry.counts.qualifyingCompleted}/5; preRevealFrozen=${registry.counts.preRevealFrozen}; unreserved=${registry.counts.unreservedSlots}`
);

function validateRegistry(document, { semanticOnly = false } = {}) {
  const runIds = new Set();
  const slots = new Set();
  for (const run of document.runs) {
    if (runIds.has(run.runId)) errors.push(`duplicate blind run id: ${run.runId}`);
    if (slots.has(run.slot)) errors.push(`duplicate blind run slot: ${run.slot}`);
    runIds.add(run.runId);
    slots.add(run.slot);

    if (run.status === "completed") {
      if (run.qualifying !== true || !run.kitFirstPass || !run.winner || !run.evidencePath) {
        errors.push(`${run.runId} completed record is missing its frozen result`);
      }
      if (!semanticOnly) {
        verifyOptionalExternalHash(run.contractPath, run.contractSha256, `${run.runId} historical contract`);
        verifyLocalFile(run.evidencePath, null, `${run.runId} evidence`);
      }
    }
    if (run.status === "pre-reveal-frozen") {
      if (run.qualifying !== null || run.kitFirstPass !== null || run.winner !== null || run.evidencePath !== null) {
        errors.push(`${run.runId} pre-reveal record contains a result before evaluation`);
      }
      assertPreRevealInputStatus(run);
      if (!semanticOnly) validateFrozenRun(run, document.kpi);
    }
    if (run.status === "input-received") {
      if (run.qualifying !== null || run.kitFirstPass !== null || run.winner !== null || run.evidencePath !== null) {
        errors.push(`${run.runId} input-received record contains a result before evaluation`);
      }
      assertEqual(run.inputStatus, "received-unopened", `${run.runId} input status`);
      if (!semanticOnly) validateFrozenRun(run, document.kpi, true);
    }
    if (run.status === "running") {
      if (run.qualifying !== null || run.kitFirstPass !== null || run.winner !== null || run.evidencePath !== null) {
        errors.push(`${run.runId} running record contains a result before evaluation`);
      }
      assertEqual(run.inputStatus, "revealed", `${run.runId} input status`);
      if (!semanticOnly) validateFrozenRun(run, document.kpi, true);
    }
  }

  const qualifyingCompleted = document.runs.filter(
    (run) => run.status === "completed" && run.qualifying === true
  ).length;
  const preRevealFrozen = document.runs.filter((run) => run.status === "pre-reveal-frozen").length;
  assertEqual(document.counts.qualifyingCompleted, qualifyingCompleted, "qualifyingCompleted count");
  assertEqual(document.counts.preRevealFrozen, preRevealFrozen, "preRevealFrozen count");
  assertEqual(
    document.counts.remainingToComplete,
    document.kpi.targetRuns - qualifyingCompleted,
    "remainingToComplete count"
  );
  assertEqual(
    document.counts.unreservedSlots,
    document.kpi.targetRuns - slots.size,
    "unreservedSlots count"
  );
}

function assertPreRevealInputStatus(run) {
  if (run.inputStatus !== "sealed-pending-delivery") {
    throw new Error(
      `${run.runId} pre-reveal-frozen attempt must use inputStatus=sealed-pending-delivery`
    );
  }
}

function validateRegistryRuns(document, { semanticOnly = false } = {}) {
  for (const run of document.runs) {
    if (run.status === "completed") {
      if (run.qualifying !== true || !run.kitFirstPass || !run.winner || !run.evidencePath) {
        errors.push(`${run.runId} completed record is missing its frozen result`);
      }
      if (!semanticOnly) {
        verifyOptionalExternalHash(run.contractPath, run.contractSha256, `${run.runId} historical contract`);
        verifyLocalFile(run.evidencePath, null, `${run.runId} evidence`);
      }
    }
    if (run.status === "invalidated") {
      if (run.qualifying !== false || run.winner !== null || !run.evidencePath) {
        errors.push(`${run.runId} invalidated record must preserve its non-qualifying result`);
      }
      if (!semanticOnly) {
        verifyLocalFile(run.evidencePath, null, `${run.runId} invalidated evidence`);
      }
    }
    if (run.status === "pre-reveal-frozen") {
      if (run.qualifying !== null || run.kitFirstPass !== null || run.winner !== null || run.evidencePath !== null) {
        errors.push(`${run.runId} pre-reveal record contains a result before evaluation`);
      }
      assertPreRevealInputStatus(run);
      if (!semanticOnly) validateFrozenRun(run, document.kpi);
    }
    if (run.status === "input-received") {
      if (run.qualifying !== null || run.kitFirstPass !== null || run.winner !== null || run.evidencePath !== null) {
        errors.push(`${run.runId} input-received record contains a result before evaluation`);
      }
      assertEqual(run.inputStatus, "received-unopened", `${run.runId} input status`);
      if (!semanticOnly) validateFrozenRun(run, document.kpi, true);
    }
    if (run.status === "running") {
      if (run.qualifying !== null || run.kitFirstPass !== null || run.winner !== null || run.evidencePath !== null) {
        errors.push(`${run.runId} running record contains a result before evaluation`);
      }
      assertEqual(run.inputStatus, "revealed", `${run.runId} input status`);
      if (!semanticOnly) validateFrozenRun(run, document.kpi, true);
    }
  }
}

function validateFrozenRun(run, programKpi, expectReceipt = false) {
  const contractPath = resolveInsideRepo(run.contractPath, kitRoot);
  if (!existsSync(contractPath)) {
    errors.push(`${run.runId} pre-reveal contract is missing: ${run.contractPath}`);
    return;
  }
  assertEqual(sha256File(contractPath), run.contractSha256, `${run.runId} pre-reveal contract hash`);
  const contract = readJson(contractPath);
  if (!validateContractSchema(contract)) {
    errors.push(`${run.runId} pre-reveal contract schema failed: ${ajv.errorsText(validateContractSchema.errors, { separator: "; " })}`);
    return;
  }
  if (contract.version === "1.1.0") {
    try {
      validatePreRevealV11(contract);
    } catch (error) {
      errors.push(`${run.runId} pre-reveal contract failed v1.2 rules: ${error.message}`);
      return;
    }
    assertEqual(contract.attemptNumber, run.attemptNumber, `${run.runId} contract attemptNumber`);
    assertEqual(contract.replacesRunId, run.replacesRunId, `${run.runId} contract replacesRunId`);
  }
  assertEqual(contract.runId, run.runId, `${run.runId} contract runId`);
  assertEqual(contract.slot, run.slot, `${run.runId} contract slot`);
  if (JSON.stringify(contract.acceptance.programKpi) !== JSON.stringify(programKpi)) {
    errors.push(`${run.runId} program KPI differs from the registry owner`);
  }

  for (const message of collectProtocolFileHashErrors(contract.protocol.files, kitRoot)) {
    errors.push(`${run.runId} ${message}`);
  }

  const arms = new Map(contract.arms.map((arm) => [arm.id, arm]));
  if (arms.size !== 2 || !arms.has("consumer") || !arms.has("control")) {
    errors.push(`${run.runId} must freeze one consumer arm and one control arm`);
  }
  if (arms.get("consumer")?.artifactId === arms.get("control")?.artifactId) {
    errors.push(`${run.runId} arms must use distinct artifactId values`);
  }
  for (const arm of contract.arms) {
    const expectedRoot = `H:/AI-readable-kit-blind-runs/${run.runId}/arms/${arm.id}`;
    assertEqual(arm.workspaceRoot, expectedRoot, `${run.runId} ${arm.id} workspaceRoot`);
  }

  const visualWeight = contract.acceptance.visual.categories.reduce((sum, category) => sum + category.weight, 0);
  assertEqual(visualWeight, contract.acceptance.visual.total, `${run.runId} visual weight total`);
  const expectedMetrics = [
    "elapsedMinutes",
    "manualCorrectionMinutes",
    "clarificationCount",
    "kitFirstPass",
    "technicalVerdict",
    "visualScore",
    "bundleGzipKiB",
    "hardContractViolations",
    "sameArtifactMismatchCount",
    "evidenceCompleteness"
  ];
  if (contract.version === "1.1.0") expectedMetrics.push("evaluatorCorrectionMinutes");
  assertExactSet(
    contract.acceptance.perArmMetrics,
    expectedMetrics,
    `${run.runId} per-arm metrics`
  );

  const expectedReceiptPath = `quality/blind-runs/${run.runId}/input-receipt.json`;
  assertEqual(contract.inputGate.receiptPath, expectedReceiptPath, `${run.runId} input receipt path`);
  const receiptPath = resolveInsideRepo(contract.inputGate.receiptPath, kitRoot);
  if (expectReceipt) {
    validateReceivedInputReceipt(receiptPath, run, contract);
  } else if (existsSync(receiptPath)) {
    errors.push(`${run.runId} input receipt exists while the registry remains pre-reveal-frozen`);
  }

  verifyGitAnchor(contract.protocol.planCommit, `${run.runId} plan commit`);
  verifyGitAnchor(contract.protocol.implementationCommit, `${run.runId} implementation commit`);

  if (contract.version === "1.1.0") {
    validatePackageReceipt(contract, run);
  } else {
    const packagePath = resolveInsideKit(contract.consumerPackage.path);
    if (existsSync(packagePath)) {
      assertEqual(sha256File(packagePath), contract.consumerPackage.sha256, `${run.runId} consumer package hash`);
      assertEqual(statSync(packagePath).size, contract.consumerPackage.bytes, `${run.runId} consumer package bytes`);
    } else if (requireLocalPackage) {
      errors.push(`${run.runId} consumer package is required locally: ${contract.consumerPackage.path}`);
    }
  }

  const revealPath = resolveInsideKit(contract.anonymization.privateRevealPath);
  if (existsSync(revealPath)) {
    assertEqual(
      sha256File(revealPath),
      contract.anonymization.assignmentCommitment,
      `${run.runId} assignment commitment`
    );
  } else if (requirePrivateReveal) {
    errors.push(`${run.runId} private assignment reveal is required locally: ${contract.anonymization.privateRevealPath}`);
  }
}

function validatePackageReceipt(contract, run) {
  const receiptPath = resolveInsideRepo(contract.consumerPackageReceipt.path, kitRoot);
  if (!existsSync(receiptPath)) {
    errors.push(`${run.runId} consumer package receipt is missing: ${contract.consumerPackageReceipt.path}`);
    return;
  }
  assertEqual(
    sha256File(receiptPath),
    contract.consumerPackageReceipt.sha256,
    `${run.runId} consumer package receipt hash`
  );
  const receipt = readJson(receiptPath);
  try {
    validateConsumerPackageReceipt(receipt);
  } catch (error) {
    errors.push(`${run.runId} consumer package receipt failed: ${error.message}`);
    return;
  }
  assertEqual(receipt.runId, run.runId, `${run.runId} package receipt runId`);
  verifyGitAnchor(receipt.sourceCommit, `${run.runId} package source commit`);
  const packagePath = resolveInsideKit(receipt.package.path);
  if (existsSync(packagePath)) {
    assertEqual(sha256File(packagePath), receipt.package.sha256, `${run.runId} consumer package hash`);
    assertEqual(statSync(packagePath).size, receipt.package.bytes, `${run.runId} consumer package bytes`);
  } else if (requireLocalPackage) {
    errors.push(`${run.runId} consumer package is required locally: ${receipt.package.path}`);
  }
}

function validateReceivedInputReceipt(receiptPath, run, contract) {
  if (!existsSync(receiptPath)) {
    errors.push(`${run.runId} input receipt is missing after input-received transition`);
    return;
  }

  let receipt;
  try {
    receipt = readJson(receiptPath);
  } catch (error) {
    errors.push(`${run.runId} input receipt is not valid JSON: ${error.message}`);
    return;
  }
  if (!validateInputReceiptSchema(receipt)) {
    errors.push(
      `${run.runId} input receipt schema failed: ${ajv.errorsText(validateInputReceiptSchema.errors, { separator: "; " })}`
    );
    return;
  }

  assertEqual(receipt.runId, run.runId, `${run.runId} receipt runId`);
  assertEqual(receipt.slot, run.slot, `${run.runId} receipt slot`);
  if (receipt.version === "1.1.0") {
    assertEqual(receipt.attemptNumber, run.attemptNumber, `${run.runId} receipt attemptNumber`);
  }
  assertEqual(receipt.preRevealContract.path, run.contractPath, `${run.runId} receipt contract path`);
  assertEqual(receipt.preRevealContract.sha256, run.contractSha256, `${run.runId} receipt contract hash`);
  verifyGitAnchor(receipt.preRevealContract.freezeCommit, `${run.runId} receipt freeze commit`);
  verifyGitFileHash(
    receipt.preRevealContract.freezeCommit,
    `kit/${receipt.preRevealContract.path}`,
    receipt.preRevealContract.sha256,
    `${run.runId} committed pre-reveal contract`
  );

  if (!isAbsolute(receipt.source.path)) {
    errors.push(`${run.runId} input source path must be absolute`);
    return;
  }
  const sourcePath = resolve(receipt.source.path);
  if (!existsSync(sourcePath)) {
    errors.push(`${run.runId} input source is missing: ${receipt.source.path}`);
    return;
  }
  const sourceStat = statSync(sourcePath);
  if (!sourceStat.isFile()) {
    errors.push(`${run.runId} input source must be a file: ${receipt.source.path}`);
    return;
  }
  assertEqual(receipt.source.fileName, basename(sourcePath), `${run.runId} input file name`);
  assertEqual(receipt.source.bytes, sourceStat.size, `${run.runId} input bytes`);
  assertEqual(receipt.source.sha256, sha256File(sourcePath), `${run.runId} input hash`);
  assertEqual(contract.inputGate.contentAccessed, false, `${run.runId} frozen input disclosure`);
}

function validateFixtures() {
  const fixtureErrorStart = errors.length;
  const validReceipt = {
    version: "1.0.0",
    runId: "blind-prd-02",
    slot: 2,
    status: "received-unopened",
    receivedAt: "2026-07-30T05:30:00-07:00",
    preRevealContract: {
      path: "quality/blind-runs/blind-prd-02/pre-reveal-contract.json",
      sha256: "a".repeat(64),
      freezeCommit: "b".repeat(40)
    },
    source: {
      path: "H:/sealed/input.md",
      fileName: "input.md",
      bytes: 1,
      sha256: "c".repeat(64)
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
  if (!validateInputReceiptSchema(validReceipt)) {
    errors.push(`valid input receipt fixture failed: ${ajv.errorsText(validateInputReceiptSchema.errors)}`);
  }
  const openedReceipt = structuredClone(validReceipt);
  openedReceipt.disclosure.contentOpenedAt = "2026-07-30T05:31:00-07:00";
  if (validateInputReceiptSchema(openedReceipt)) {
    errors.push("input receipt with pre-commit content access unexpectedly passed");
  }
  const informedReceipt = structuredClone(validReceipt);
  informedReceipt.eligibility.informedKitConstruction = true;
  if (validateInputReceiptSchema(informedReceipt)) {
    errors.push("kit-informed PRD receipt unexpectedly passed");
  }

  const weakenedContract = structuredClone(
    readJson(resolve(kitRoot, "quality/blind-runs/blind-prd-02/pre-reveal-contract.json"))
  );
  weakenedContract.acceptance.sameArtifact.mismatchCountMax = 1;
  if (validateContractSchema(weakenedContract)) {
    errors.push("weakened same-artifact threshold unexpectedly passed");
  }
  const openGateContract = structuredClone(weakenedContract);
  openGateContract.acceptance.sameArtifact.mismatchCountMax = 0;
  openGateContract.inputGate.contentAccessed = true;
  if (validateContractSchema(openGateContract)) {
    errors.push("pre-reveal contract with accessed content unexpectedly passed");
  }

  const driftedRegistry = structuredClone(registry);
  driftedRegistry.kpi.kitFirstPassMin = 3;
  if (validateRegistrySchema(driftedRegistry)) {
    errors.push("weakened blind adoption KPI unexpectedly passed");
  }
  testPreRevealInputStatusFixtures();
  try {
    testProtocolFileHashFixture();
  } catch (error) {
    errors.push(`protocol file hash fixture failed: ${error.message}`);
  }
  if (errors.length === fixtureErrorStart) {
    console.log("blind-adoption fixture tests passed: unopened input accepted; early reveal, informed input, threshold drift, KPI drift, three pre-reveal input-state drifts, and protocol library hash drift rejected");
  }
}

function testPreRevealInputStatusFixtures() {
  const fixture = makePreRevealInputStatusRegistryFixture();
  const validators = [
    ["library v1.1", (document) => validateRegistryV11(document)],
    ["CLI v1.1", (document) => validateRegistryRuns(document, { semanticOnly: true })],
    ["CLI legacy", (document) => validateRegistry(
      { ...structuredClone(document), version: "1.0.0" },
      { semanticOnly: true }
    )]
  ];
  try {
    const progressed = structuredClone(fixture);
    progressed.runs[0].status = "input-received";
    progressed.runs[0].inputStatus = "received-unopened";
    progressed.counts = computeRegistryCounts(progressed.runs, progressed.kpi.targetRuns);
    for (const [, validate] of validators) {
      validate(structuredClone(fixture));
      validate(structuredClone(progressed));
    }
  } catch (error) {
    errors.push(`self-contained pre-reveal lifecycle fixture failed: ${error.message}`);
    return;
  }
  for (const inputStatus of ["revealed", "received-unopened", "historical-frozen"]) {
    const invalid = structuredClone(fixture);
    invalid.runs[0].inputStatus = inputStatus;
    for (const [label, validate] of validators) {
      try {
        validate(structuredClone(invalid));
        errors.push(`${label} pre-reveal registry with inputStatus=${inputStatus} unexpectedly passed`);
      } catch (error) {
        if (!error.message.includes("must use inputStatus=sealed-pending-delivery")) {
          errors.push(`${label} pre-reveal inputStatus=${inputStatus} failed for the wrong reason: ${error.message}`);
        }
      }
    }
  }
}

function makePreRevealInputStatusRegistryFixture() {
  const runs = [{
    runId: "blind-prd-01-input-state-fixture",
    slot: 1,
    attemptNumber: 1,
    replacesRunId: null,
    status: "pre-reveal-frozen",
    qualifying: null,
    kitFirstPass: null,
    winner: null,
    contractPath: "quality/input-state-fixture.json",
    contractSha256: "a".repeat(64),
    evidencePath: null,
    inputStatus: "sealed-pending-delivery"
  }];
  const kpi = {
    targetRuns: 5,
    kitFirstPassMin: 4,
    kitWinsMin: 2,
    manualAcceptanceTimeReductionMinPercent: 30,
    hardContractViolationsMax: 0
  };
  return {
    $schema: "../schema/blind-adoption-registry.schema.json",
    version: "1.1.0",
    programId: "requirement-to-final-page-blind-adoption",
    owner: "quality/blind-adoption-registry.json",
    updatedAt: "2026-08-01T00:00:00Z",
    kpi,
    counts: computeRegistryCounts(runs, kpi.targetRuns),
    runs
  };
}

function testProtocolFileHashFixture() {
  const fixtureRoot = resolve(kitRoot, `.tmp-blind-adoption-protocol-${process.pid}`);
  mkdirSync(fixtureRoot, { recursive: true });
  try {
    const files = {};
    for (const name of REQUIRED_PROTOCOL_FILES) {
      const path = `protocol/${name}.txt`;
      const file = resolve(fixtureRoot, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${name}\n`, "utf8");
      files[name] = { path, sha256: sha256File(file) };
    }
    const baseline = collectProtocolFileHashErrors(files, fixtureRoot);
    if (baseline.length > 0) throw new Error(`baseline unexpectedly failed: ${baseline.join("; ")}`);
    for (const name of ["blindProtocolLib", "sameArtifactLib"]) {
      const record = files[name];
      const file = resolve(fixtureRoot, record.path);
      const original = readFileSync(file, "utf8");
      writeFileSync(file, `${original}drift\n`, "utf8");
      const drift = collectProtocolFileHashErrors(files, fixtureRoot);
      if (!drift.some((message) => message.includes(`${name} hash`))) {
        throw new Error(`${name} hash drift unexpectedly passed`);
      }
      writeFileSync(file, original, "utf8");
      const restored = collectProtocolFileHashErrors(files, fixtureRoot);
      if (restored.length > 0) {
        throw new Error(`${name} hash did not recover: ${restored.join("; ")}`);
      }
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function collectProtocolFileHashErrors(files, base) {
  const issues = [];
  for (const [name, record] of Object.entries(files)) {
    let file;
    try {
      file = resolveInsideRepo(record.path, base);
    } catch (error) {
      issues.push(`protocol file path is invalid: ${name}=${record?.path}: ${error.message}`);
      continue;
    }
    if (!existsSync(file)) {
      issues.push(`protocol file is missing: ${name}=${record.path}`);
      continue;
    }
    if (sha256File(file) !== record.sha256) {
      issues.push(`${name} hash: expected ${record.sha256}, received ${sha256File(file)}`);
    }
  }
  return issues;
}

function verifyLocalFile(path, expectedHash, label) {
  const file = resolveInsideRepo(path, kitRoot);
  if (!existsSync(file)) {
    errors.push(`${label} is missing: ${path}`);
    return;
  }
  if (expectedHash) assertEqual(sha256File(file), expectedHash, `${label} hash`);
}

function verifyOptionalExternalHash(path, expectedHash, label) {
  if (!expectedHash || !/^[A-Za-z]:\//.test(path)) return;
  const file = resolve(path);
  if (existsSync(file)) assertEqual(sha256File(file), expectedHash, `${label} hash`);
}

function verifyGitAnchor(commit, label) {
  if (!existsSync(resolve(repoRoot, ".git"))) return;
  const result = spawnSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) errors.push(`${label} is not an ancestor of HEAD: ${commit}`);
}

function verifyGitFileHash(commit, repoPath, expectedHash, label) {
  if (!existsSync(resolve(repoRoot, ".git"))) return;
  const result = spawnSync("git", ["show", `${commit}:${repoPath.replaceAll("\\", "/")}`], {
    cwd: repoRoot,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) {
    errors.push(`${label} is missing from commit ${commit}`);
    return;
  }
  const actualHash = createHash("sha256").update(result.stdout).digest("hex");
  assertEqual(actualHash, expectedHash, `${label} hash`);
}

function resolveInsideRepo(path, base) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
    throw new Error(`path must be repository-relative: ${path}`);
  }
  const target = resolve(base, path);
  const rel = relative(repoRoot, target);
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) {
    throw new Error(`path escapes repository: ${path}`);
  }
  return target;
}

function resolveInsideKit(path) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
    throw new Error(`path must be kit-relative: ${path}`);
  }
  const target = resolve(kitRoot, path);
  const rel = relative(kitRoot, target);
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) {
    throw new Error(`path escapes kit: ${path}`);
  }
  return target;
}

function assertExactSet(actual, expected, label) {
  const actualValues = [...actual].sort();
  const expectedValues = [...expected].sort();
  if (
    actualValues.length !== expectedValues.length ||
    actualValues.some((value, index) => value !== expectedValues[index])
  ) {
    errors.push(`${label} must stay frozen`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    errors.push(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
