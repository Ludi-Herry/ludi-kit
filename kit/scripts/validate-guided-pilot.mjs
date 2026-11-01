import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, posix, relative, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultKitRoot = resolve(scriptDir, "..");
const contractSchemaPath = resolve(defaultKitRoot, "schema/guided-pilot-contract.schema.json");
const resultSchemaPath = resolve(defaultKitRoot, "schema/guided-pilot-result.schema.json");
const flowContractSchemaPath = resolve(defaultKitRoot, "schema/guided-pilot-flow-contract.schema.json");
const generationEvidenceSchemaPath = resolve(
  defaultKitRoot,
  "schema/guided-pilot-generation-evidence.schema.json"
);
const readinessSchemaPath = resolve(defaultKitRoot, "schema/guided-pilot-readiness.schema.json");
const treeManifestSchemaPath = resolve(defaultKitRoot, "schema/guided-pilot-tree-manifest.schema.json");
const registryRelativePath = "quality/blind-adoption-registry.json";
const syntheticLedgerRelativePath = "quality/blind-harness/synthetic-readiness-matrix-report.json";
const pilotRootRelativePath = "quality/blind-harness/guided-pilots";
const sourceSnapshotExclusions = [
  ".git/",
  "node_modules/",
  "dist/",
  "evidence/",
  "test-results/",
  "vendor/",
  ".tmp*/",
  "*.tsbuildinfo"
];
const generationImmutableFiles = [
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
const validators = createValidators();

export function validateGuidedPilotContract(contractPath, { kitRoot = defaultKitRoot } = {}) {
  const resolvedKitRoot = resolve(kitRoot);
  const absoluteContractPath = resolve(contractPath);
  const contract = readJsonFile(absoluteContractPath, "guided pilot contract");
  validateSchema(validators.contract, contract, "guided pilot contract");

  const evidenceRoot = validateContractLocation(contract, absoluteContractPath, resolvedKitRoot);
  const liveState = readLiveState(resolvedKitRoot);
  assertFingerprintMatches(contract.isolation.registry, liveState.registry.fingerprint, "registry baseline");
  assertFingerprintMatches(
    contract.isolation.syntheticLedger,
    liveState.syntheticLedger.fingerprint,
    "synthetic ledger baseline"
  );

  const source = validateSource(contract, evidenceRoot, resolvedKitRoot, liveState.registry.document);
  const packageReceipt = validatePackage(contract, evidenceRoot, resolvedKitRoot);
  const externalFlowContract = validateExternalFlowContract(contract, source, evidenceRoot);
  validateConsent(contract, source, evidenceRoot);
  validateIdentityIsolation(contract, liveState);
  validateFreshness(contract, absoluteContractPath, resolvedKitRoot);

  return {
    contract,
    contractPath: absoluteContractPath,
    evidenceRoot,
    liveState,
    source,
    packageReceipt,
    externalFlowContract
  };
}

export function validateGuidedPilot(contractPath, resultPath, { kitRoot = defaultKitRoot } = {}) {
  const contractRecord = validateGuidedPilotContract(contractPath, { kitRoot });
  const absoluteResultPath = resolve(resultPath);
  const result = readJsonFile(absoluteResultPath, "guided pilot result");
  validateSchema(validators.result, result, "guided pilot result");

  const resultDirectory = dirname(absoluteResultPath);
  assertEqual(resultDirectory, contractRecord.evidenceRoot, "guided pilot result evidence root location");
  assertCoreIdentity(result, contractRecord.contract, "guided pilot result");
  assertReceiptMatchesFile(
    result.contract,
    contractRecord.contractPath,
    contractRecord.evidenceRoot,
    "result contract receipt"
  );
  assertReceiptEqual(result.source.receipt, contractRecord.contract.source.receipt, "result source receipt");
  assertReceiptEqual(result.source.current, contractRecord.contract.source.current, "result source current bytes");
  assertPackageEqual(result.package, contractRecord.contract.package, "result package");
  const readiness = validateReadinessBinding(
    result,
    contractRecord.evidenceRoot,
    contractRecord.externalFlowContract.receipt
  );
  const generation = validateGenerationBinding(
    result,
    contractRecord.packageReceipt.document,
    contractRecord.evidenceRoot,
    resolve(kitRoot),
    readiness
  );
  validateFlowBinding(
    result,
    contractRecord.contract,
    contractRecord.evidenceRoot,
    resolve(kitRoot),
    readiness
  );
  validateResultIdentityIsolation(result, contractRecord.contract, contractRecord.liveState, readiness);
  validateResultIsolation(result, contractRecord.contract, contractRecord.liveState);

  return { ...contractRecord, result, resultPath: absoluteResultPath, generation, readiness };
}

export function validateGuidedPilotRoot(
  root = resolve(defaultKitRoot, pilotRootRelativePath),
  { kitRoot = defaultKitRoot, expectedRunIds = [] } = {}
) {
  const resolvedKitRoot = resolve(kitRoot);
  const absoluteRoot = resolve(root);
  if (!existsSync(absoluteRoot)) throw new Error(`guided pilot root is missing: ${absoluteRoot}`);
  assertRegularDirectory(absoluteRoot, "guided pilot root");
  const expected = normalizeExpectedRunIds(expectedRunIds);

  const contractPaths = findNamedFiles(absoluteRoot, "guided-pilot-contract.json");
  const resultPaths = findNamedFiles(absoluteRoot, "guided-pilot-result.json");
  const contractDirectories = new Set(contractPaths.map((path) => dirname(path)));
  const resultDirectories = new Set(resultPaths.map((path) => dirname(path)));

  if (contractPaths.length === 0 && resultPaths.length === 0) {
    throw new Error(`guided pilot root contains no runs: ${absoluteRoot}`);
  }

  for (const directory of contractDirectories) {
    if (!resultDirectories.has(directory)) {
      throw new Error(`guided pilot contract is missing a result: ${directory}`);
    }
  }
  for (const directory of resultDirectories) {
    if (!contractDirectories.has(directory)) {
      throw new Error(`guided pilot result is missing a contract: ${directory}`);
    }
  }

  const records = contractPaths.map((contractPath) =>
    validateGuidedPilot(contractPath, resolve(dirname(contractPath), "guided-pilot-result.json"), {
      kitRoot: resolvedKitRoot
    })
  );
  if (records.length === 0) throw new Error(`guided pilot root contains no valid runs: ${absoluteRoot}`);
  const runIds = records.map((record) => record.contract.runId).sort();
  const actualRunIds = new Set(runIds);
  for (const runId of expected) {
    if (!actualRunIds.has(runId)) {
      throw new Error(`guided pilot expected run is missing: ${runId}`);
    }
  }
  return { count: records.length, root: absoluteRoot, runIds, records };
}

function validateContractLocation(contract, contractPath, kitRoot) {
  assertRunId(contract.runId, "guided pilot contract runId");
  assertEqual(
    contract.evidenceRoot,
    `${pilotRootRelativePath}/${contract.runId}`,
    "guided pilot evidence root"
  );
  const evidenceRoot = resolve(kitRoot, contract.evidenceRoot);
  if (isForbiddenEvidenceRoot(contract.evidenceRoot)) {
    throw new Error(`guided pilot evidence root is reserved: ${contract.evidenceRoot}`);
  }
  assertEqual(dirname(resolve(contractPath)), evidenceRoot, "guided pilot contract evidence root location");
  assertEqual(
    contract.workspace.path,
    `.guided-pilot-workspaces/${contract.runId}`,
    "guided pilot workspace path"
  );
  assertDateTime(contract.consent.recordedAtUtc, "guided pilot consent timestamp");
  return evidenceRoot;
}

function validateSource(contract, evidenceRoot, kitRoot, registry) {
  const sourceReceiptBytes = validateReceipt(
    contract.source.receipt,
    evidenceRoot,
    "consumed historical source receipt"
  );
  const currentSourceBytes = validateReceipt(
    contract.source.current,
    evidenceRoot,
    "consumed historical source bytes"
  );
  if (currentSourceBytes.length === 0) throw new Error("consumed historical source bytes must not be empty");

  const sourceReceipt = parseJsonBytes(sourceReceiptBytes, "consumed historical source receipt");
  assertAllowedKeys(
    sourceReceipt,
    ["version", "kind", "historicalRunId", "originalReceipt", "current"],
    ["$schema"],
    "consumed historical source receipt"
  );
  assertEqual(sourceReceipt.version, "1.0.0", "consumed historical source receipt version");
  assertEqual(sourceReceipt.kind, "consumed-historical-prd", "consumed historical source receipt kind");
  assertEqual(
    sourceReceipt.historicalRunId,
    contract.source.historicalRunId,
    "consumed historical source run"
  );
  assertReceiptEqual(sourceReceipt.current, contract.source.current, "source receipt current bytes");
  assertReceiptMatchesFile(
    sourceReceipt.current,
    resolve(evidenceRoot, sourceReceipt.current.path),
    evidenceRoot,
    "source receipt current file"
  );

  const historicalRun = registry.runs?.find((run) => run.runId === contract.source.historicalRunId);
  if (!historicalRun) {
    throw new Error(`consumed historical source is absent from the registry: ${contract.source.historicalRunId}`);
  }
  if (!['completed', 'invalidated'].includes(historicalRun.status) || historicalRun.inputStatus !== 'revealed') {
    throw new Error(
      `consumed historical source is not an already revealed historical run: ${contract.source.historicalRunId}`
    );
  }

  assertReceiptShape(sourceReceipt.originalReceipt, "source receipt original historical receipt");
  const expectedHistoricalReceiptPath = `quality/blind-runs/${contract.source.historicalRunId}/input-receipt.json`;
  assertEqual(
    sourceReceipt.originalReceipt.path,
    expectedHistoricalReceiptPath,
    "source receipt original historical receipt path"
  );
  const historicalReceiptPath = resolve(kitRoot, sourceReceipt.originalReceipt.path);
  assertPathInside(kitRoot, historicalReceiptPath, "source receipt original historical receipt");
  assertReceiptMatchesFile(
    sourceReceipt.originalReceipt,
    historicalReceiptPath,
    kitRoot,
    "source receipt original historical receipt"
  );

  const historicalReceipt = readJsonFile(historicalReceiptPath, "original historical input receipt");
  assertEqual(historicalReceipt.runId, contract.source.historicalRunId, "original historical input receipt runId");
  if (!historicalReceipt.source || typeof historicalReceipt.source !== "object") {
    throw new Error("original historical input receipt has no source metadata");
  }
  assertEqual(
    historicalReceipt.source.bytes,
    contract.source.current.bytes,
    "historical receipt/current source bytes"
  );
  assertEqual(
    historicalReceipt.source.sha256,
    contract.source.current.sha256,
    "historical receipt/current source SHA-256"
  );

  return { sourceReceipt, currentSourceBytes, historicalReceipt, historicalRun };
}

function validatePackage(contract, evidenceRoot, kitRoot) {
  const packageReceiptBytes = validateReceipt(
    contract.package.receipt,
    evidenceRoot,
    "guided pilot package receipt"
  );
  const packageReceipt = parseJsonBytes(packageReceiptBytes, "guided pilot package receipt");
  assertAllowedKeys(
    packageReceipt,
    ["version", "kind", "package", "canonicalReceipt", "frozenTarball"],
    ["$schema"],
    "guided pilot package receipt"
  );
  assertEqual(packageReceipt.version, "1.0.0", "guided pilot package receipt version");
  assertEqual(packageReceipt.kind, "guided-pilot-package-receipt", "guided pilot package receipt kind");
  if (!packageReceipt.package || typeof packageReceipt.package !== "object") {
    throw new Error("guided pilot package receipt has no package metadata");
  }
  assertEqual(packageReceipt.package.name, contract.package.name, "guided pilot package name");
  if (typeof packageReceipt.package.version !== "string" || packageReceipt.package.version.length === 0) {
    throw new Error("guided pilot package version is invalid");
  }
  assertReceiptShape(packageReceipt.canonicalReceipt, "guided pilot canonical package receipt");
  assertReceiptShape(packageReceipt.frozenTarball, "guided pilot frozen tarball");
  assertEqual(
    packageReceipt.canonicalReceipt.path,
    "quality/blind-harness/synthetic-consumer-package-receipt.json",
    "guided pilot canonical package receipt path"
  );
  assertEqual(
    packageReceipt.frozenTarball.path,
    ".local-pack/ai-readable-kit-0.1.0-a38cc586fd15.tgz",
    "guided pilot frozen tarball path"
  );

  const canonicalReceiptPath = resolve(kitRoot, packageReceipt.canonicalReceipt.path);
  assertPathInside(kitRoot, canonicalReceiptPath, "guided pilot canonical package receipt");
  assertReceiptMatchesFile(
    packageReceipt.canonicalReceipt,
    canonicalReceiptPath,
    kitRoot,
    "guided pilot canonical package receipt"
  );
  assertGitTracked(canonicalReceiptPath, kitRoot, "guided pilot canonical package receipt");
  const canonicalReceipt = readJsonFile(canonicalReceiptPath, "guided pilot canonical package receipt");
  if (!canonicalReceipt.package || typeof canonicalReceipt.package !== "object") {
    throw new Error("guided pilot canonical package receipt has no package metadata");
  }
  assertEqual(canonicalReceipt.package.name, packageReceipt.package.name, "guided pilot canonical package name");
  assertEqual(canonicalReceipt.package.version, packageReceipt.package.version, "guided pilot canonical package version");
  assertReceiptEqual(
    canonicalReceipt.frozenPack,
    packageReceipt.frozenTarball,
    "guided pilot canonical frozen tarball"
  );

  const tarballPath = resolve(kitRoot, packageReceipt.frozenTarball.path);
  assertPathInside(kitRoot, tarballPath, "guided pilot frozen tarball");
  if (existsSync(tarballPath)) {
    assertReceiptMatchesFile(packageReceipt.frozenTarball, tarballPath, kitRoot, "guided pilot frozen tarball");
  }
  return { document: packageReceipt, canonicalReceipt, canonicalReceiptPath };
}

function validateExternalFlowContract(contract, source, evidenceRoot) {
  const flowContractPath = resolve(evidenceRoot, "inputs/flow-contract.json");
  const receipt = fingerprintForFile(flowContractPath, evidenceRoot, "guided pilot external flow contract");
  const externalFlowContract = readJsonFile(flowContractPath, "guided pilot external flow contract");
  validateSchema(validators.flowContract, externalFlowContract, "guided pilot external flow contract");
  validateFlowContract(contract, source, externalFlowContract);
  return { path: flowContractPath, receipt, document: externalFlowContract };
}

function validateFlowContract(contract, source, externalFlowContract) {
  const flowContract = contract.flowContract;
  assertEqual(flowContract.contractId, contract.runId, "guided pilot flow contract id");
  assertEqual(flowContract.projectId, contract.projectId, "guided pilot flow contract project id");
  assertEqual(flowContract.source.kind, "consumed-historical-prd", "guided pilot flow source kind");
  assertReceiptEqual(
    flowContract.source.historicalReceipt,
    source.sourceReceipt.originalReceipt,
    "guided pilot flow historical receipt"
  );
  assertEqual(
    flowContract.source.currentPrd.bytes,
    contract.source.current.bytes,
    "guided pilot flow source bytes"
  );
  assertEqual(
    flowContract.source.currentPrd.sha256,
    contract.source.current.sha256,
    "guided pilot flow source SHA-256"
  );
  assertEqual(externalFlowContract.contractId, flowContract.contractId, "external flow contract id");
  assertEqual(externalFlowContract.projectId, flowContract.projectId, "external flow contract project id");
  assertEqual(externalFlowContract.owner, flowContract.owner, "external flow contract owner");
  assertReceiptEqual(
    externalFlowContract.source.historicalReceipt,
    source.sourceReceipt.originalReceipt,
    "external flow historical receipt"
  );
  assertEqual(
    externalFlowContract.source.currentPrd.bytes,
    contract.source.current.bytes,
    "external flow source bytes"
  );
  assertEqual(
    externalFlowContract.source.currentPrd.sha256,
    contract.source.current.sha256,
    "external flow source SHA-256"
  );
  assertDeepEqual(externalFlowContract.entry, flowContract.entry, "external flow entry");
  assertDeepEqual(externalFlowContract.requiredTestIds, flowContract.requiredTestIds, "external flow requiredTestIds");
  assertDeepEqual(externalFlowContract.flows, flowContract.flows, "external flow definitions");

  const flowIds = new Set();
  const stepIds = new Set();
  const referencedTestIds = new Set();
  for (const flow of flowContract.flows) {
    if (flowIds.has(flow.flowId)) throw new Error(`guided pilot flow id is reused: ${flow.flowId}`);
    flowIds.add(flow.flowId);
    for (const step of flow.steps) {
      if (stepIds.has(step.stepId)) throw new Error(`guided pilot flow step id is reused: ${step.stepId}`);
      stepIds.add(step.stepId);
      if (step.action.testId) referencedTestIds.add(step.action.testId);
      if (step.action.optionTestId) referencedTestIds.add(step.action.optionTestId);
      for (const assertion of step.assertions) {
        if (assertion.testId) referencedTestIds.add(assertion.testId);
      }
    }
  }
  const requiredTestIds = new Set(flowContract.requiredTestIds);
  for (const testId of referencedTestIds) {
    if (!requiredTestIds.has(testId)) {
      throw new Error(`guided pilot flow test id is absent from requiredTestIds: ${testId}`);
    }
  }
}

function validateConsent(contract, source, evidenceRoot) {
  const consentPath = resolve(evidenceRoot, "consent.json");
  const consent = readJsonFile(consentPath, "guided pilot consent");
  assertExactKeys(
    consent,
    ["$schema", "version", "recordedAtUtc", "authorization", "selectedSource", "pilotAccounting", "protectedFinalEligible"],
    "guided pilot consent"
  );
  assertEqual(consent.$schema, "guided-pilot-consent.v1", "guided pilot consent schema");
  assertEqual(consent.version, "1.0.0", "guided pilot consent version");
  assertExactKeys(consent.authorization, ["explicit", "scope", "userStatement"], "guided pilot consent authorization");
  assertEqual(consent.authorization.explicit, true, "guided pilot consent explicit authorization");
  assertEqual(consent.authorization.scope, contract.consent.scope, "guided pilot consent scope");
  if (typeof consent.authorization.userStatement !== "string" || consent.authorization.userStatement.length === 0) {
    throw new Error("guided pilot consent userStatement is invalid");
  }
  assertEqual(consent.recordedAtUtc, contract.consent.recordedAtUtc, "guided pilot consent timestamp");
  assertExactKeys(
    consent.selectedSource,
    ["historicalRunId", "path", "bytes", "sha256", "qualificationAlreadyConsumed", "historicalStatus"],
    "guided pilot consent selectedSource"
  );
  assertEqual(
    consent.selectedSource.historicalRunId,
    contract.source.historicalRunId,
    "guided pilot consent historical source"
  );
  assertEqual(
    consent.selectedSource.path,
    source.historicalReceipt.source.path,
    "guided pilot consent source path"
  );
  assertEqual(consent.selectedSource.bytes, contract.source.current.bytes, "guided pilot consent source bytes");
  assertEqual(consent.selectedSource.sha256, contract.source.current.sha256, "guided pilot consent source SHA-256");
  assertEqual(
    consent.selectedSource.qualificationAlreadyConsumed,
    true,
    "guided pilot consent consumed qualification"
  );
  assertEqual(
    consent.selectedSource.historicalStatus,
    `${source.historicalRun.status}-${source.historicalRun.inputStatus}`,
    "guided pilot consent historical status"
  );
  assertExactKeys(
    consent.pilotAccounting,
    ["qualifying", "scoring", "winner", "registryWrite", "syntheticLedgerWrite"],
    "guided pilot consent pilotAccounting"
  );
  for (const [key, expected] of [
    ["qualifying", false],
    ["scoring", false],
    ["winner", null],
    ["registryWrite", false],
    ["syntheticLedgerWrite", false]
  ]) {
    assertEqual(consent.pilotAccounting[key], expected, `guided pilot consent pilotAccounting.${key}`);
  }
  assertExactKeys(
    consent.protectedFinalEligible,
    ["excluded", "pathRecordedInPilot", "hashRecorded", "contentRead"],
    "guided pilot consent protectedFinalEligible"
  );
  for (const [key, expected] of [
    ["excluded", true],
    ["pathRecordedInPilot", false],
    ["hashRecorded", false],
    ["contentRead", false]
  ]) {
    assertEqual(consent.protectedFinalEligible[key], expected, `guided pilot consent protectedFinalEligible.${key}`);
  }
  return consent;
}

function validateGenerationBinding(result, packageReceipt, evidenceRoot, kitRoot, readiness) {
  const generationCommandPath = resolveReceiptPath(
    result.generation.command,
    evidenceRoot,
    "guided pilot generation command"
  );
  const generationRoot = dirname(generationCommandPath);
  const generationBytes = validateReceipt(result.generation.command, evidenceRoot, "guided pilot generation command");
  const generation = parseJsonBytes(generationBytes, "guided pilot generation command");
  if (!generation || typeof generation !== "object" || Array.isArray(generation)) {
    throw new Error("guided pilot generation command must contain an object");
  }
  validateSchema(validators.generationEvidence, generation, "guided pilot generation command");
  assertEqual(generation.status, "passed", "guided pilot generation status");
  assertEqual(generation.exitCode, 0, "guided pilot generation exit code");
  assertEqual(generation.timedOut, false, "guided pilot generation timedOut");
  validateRequiredOutputVerification(generation.requiredOutputVerification);
  assertEqual(generation.version, "1.1.0", "guided pilot generation evidence version");
  assertEqual(generation.runId, result.runId, "guided pilot generation runId");
  assertEqual(generation.artifactId, result.artifactId, "guided pilot generation artifactId");
  assertEqual(generation.execution.workspace, generation.cwd, "guided pilot generation execution workspace");
  assertEqual(generation.execution.provider, generation.provider, "guided pilot generation execution provider");
  assertEqual(generation.failure, null, "guided pilot generation failure");
  assertEqual(generation.spawnError, null, "guided pilot generation spawnError");
  assertEqual(generation.terminationSignal, null, "guided pilot generation terminationSignal");
  assertEqual(generation.failureCategory, null, "guided pilot generation failureCategory");
  assertEqual(
    generation.runner.path,
    "scripts/run-guided-pilot-generation-agent.mjs",
    "guided pilot generation runner path"
  );
  assertReceiptMatchesFile(
    generation.runner,
    resolve(kitRoot, generation.runner.path),
    kitRoot,
    "guided pilot generation runner"
  );
  for (const [field, expectedPath] of [
    ["prompt", "prompt.md"],
    ["stdout", "stdout.log"],
    ["stderr", "stderr.log"]
  ]) {
    const receipt = generation[field];
    assertEqual(receipt.path, expectedPath, `guided pilot generation ${field} path`);
    validateReceipt(receipt, generationRoot, `guided pilot generation ${field}`);
  }
  if (!generation?.consumerPackage || typeof generation.consumerPackage !== "object") {
    throw new Error("guided pilot generation command has no consumerPackage binding");
  }
  assertEqual(generation.consumerPackage.name, packageReceipt.package.name, "guided pilot generation package name");
  assertEqual(generation.consumerPackage.version, packageReceipt.package.version, "guided pilot generation package version");
  assertReceiptShape(generation.consumerPackage.tarball, "guided pilot generation package tarball");
  assertEqual(
    generation.consumerPackage.tarball.bytes,
    packageReceipt.frozenTarball.bytes,
    "guided pilot generation tarball bytes"
  );
  assertEqual(
    generation.consumerPackage.tarball.sha256,
    packageReceipt.frozenTarball.sha256,
    "guided pilot generation tarball SHA-256"
  );
  assertEqual(
    generation.consumerPackage.receipt.path,
    "consumer-package-receipt.json",
    "guided pilot generation package receipt path"
  );
  const sourcePackageReceiptBytes = validateReceipt(
    generation.consumerPackage.receipt,
    readiness.sourceSnapshotRoot,
    "guided pilot generation source package receipt"
  );
  assertReceiptContentEqual(
    generation.consumerPackage.receipt,
    packageReceipt.canonicalReceipt,
    "guided pilot generation source package receipt"
  );
  const sourcePackageReceipt = parseJsonBytes(
    sourcePackageReceiptBytes,
    "guided pilot generation source package receipt"
  );
  if (!sourcePackageReceipt.package || typeof sourcePackageReceipt.package !== "object") {
    throw new Error("guided pilot generation source package receipt has no package metadata");
  }
  assertEqual(
    sourcePackageReceipt.package.name,
    generation.consumerPackage.name,
    "guided pilot generation source package name"
  );
  assertEqual(
    sourcePackageReceipt.package.version,
    generation.consumerPackage.version,
    "guided pilot generation source package version"
  );
  assertReceiptShape(sourcePackageReceipt.frozenPack, "guided pilot generation source frozen package");
  assertReceiptContentEqual(
    sourcePackageReceipt.frozenPack,
    generation.consumerPackage.tarball,
    "guided pilot generation source frozen package"
  );
  const immutableTreeSha256 = generationImmutableTreeSha256(
    readiness.sourceSnapshotRoot,
    generation.consumerPackage.tarball
  );
  assertEqual(
    generation.immutableBeforeSha256,
    immutableTreeSha256,
    "guided pilot generation immutableBefore SHA-256"
  );
  assertEqual(
    generation.immutableAfterSha256,
    immutableTreeSha256,
    "guided pilot generation immutableAfter SHA-256"
  );
  return generation;
}

function generationImmutableTreeSha256(sourceSnapshotRoot, frozenTarball) {
  const records = generationImmutableFiles.map((portablePath) => {
    const path = resolveSnapshotFilePath(sourceSnapshotRoot, portablePath, "guided pilot generation immutable input");
    const bytes = readRegularFile(path, `guided pilot generation immutable input ${portablePath}`);
    return `${portablePath}\0${bytes.length}\0${sha256(bytes)}`;
  });
  const fileName = basename(frozenTarball.path);
  if (!fileName || frozenTarball.path !== `vendor/${fileName}`) {
    throw new Error(`guided pilot generation frozen tarball path is invalid: ${frozenTarball.path}`);
  }
  records.push(`vendor/${fileName}\0${frozenTarball.bytes}\0${frozenTarball.sha256}`);
  return sha256(Buffer.from(records.sort().join("\n"), "utf8"));
}

function validateRequiredOutputVerification(verification) {
  assertAllowedKeys(
    verification,
    ["requiredOutputs", "missingOutputs"],
    [],
    "guided pilot generation required-output verification"
  );
  assertDeepEqual(
    verification.requiredOutputs,
    ["package.json", "index.html", "src", "public/artifact-meta.json"],
    "guided pilot generation required outputs"
  );
  if (!Array.isArray(verification.missingOutputs)) {
    throw new Error("guided pilot generation missing outputs must be an array");
  }
  if (verification.missingOutputs.length !== 0) {
    throw new Error(
      `guided pilot generation required outputs are missing: ${verification.missingOutputs.join(",")}`
    );
  }
}

function validateIdentityIsolation(contract, liveState) {
  const values = [
    ["runId", contract.runId],
    ["artifactId", contract.artifactId],
    ["projectId", contract.projectId],
    ["workspace", contract.workspace.path],
    ["evidenceRoot", contract.evidenceRoot]
  ];
  const qualifyingRegistryText = JSON.stringify(
    (liveState.registry.document.runs ?? []).filter((run) => run.qualifying === true)
  );
  const syntheticLedgerText = JSON.stringify(liveState.syntheticLedger.document);
  for (const [label, value] of values) {
    if (qualifyingRegistryText.includes(value)) {
      throw new Error(`guided pilot ${label} overlaps the current qualifying registry`);
    }
    if (syntheticLedgerText.includes(value)) {
      throw new Error(`guided pilot ${label} overlaps the synthetic readiness ledger`);
    }
  }
}

function validateFreshness(contract, contractPath, kitRoot) {
  const pilotRoot = resolve(kitRoot, pilotRootRelativePath);
  if (!existsSync(pilotRoot)) return;
  for (const otherPath of findNamedFiles(pilotRoot, "guided-pilot-contract.json")) {
    if (resolve(otherPath) === resolve(contractPath)) continue;
    const other = readJsonFile(otherPath, "existing guided pilot contract");
    validateSchema(validators.contract, other, "existing guided pilot contract");
    for (const [label, current, previous] of [
      ["runId", contract.runId, other.runId],
      ["artifactId", contract.artifactId, other.artifactId],
      ["workspace", contract.workspace.path.toLowerCase(), other.workspace.path.toLowerCase()],
      ["evidenceRoot", contract.evidenceRoot.toLowerCase(), other.evidenceRoot.toLowerCase()]
    ]) {
      if (current === previous) {
        throw new Error(`guided pilot ${label} is reused by ${resolve(otherPath)}`);
      }
    }
  }
}

function validateReadinessBinding(result, evidenceRoot, externalFlowContractReceipt) {
  const readinessResultPath = resolveReceiptPath(
    result.readiness.result,
    evidenceRoot,
    "guided pilot readiness result"
  );
  const readinessRoot = dirname(readinessResultPath);
  const readinessBytes = validateReceipt(result.readiness.result, evidenceRoot, "guided pilot readiness result");
  const readiness = parseJsonBytes(readinessBytes, "guided pilot readiness result");
  validateSchema(validators.readiness, readiness, "guided pilot readiness result");
  assertEqual(readiness.runId, result.runId, "guided pilot readiness runId");
  assertEqual(readiness.artifactId, result.artifactId, "guided pilot readiness artifactId");
  assertEqual(readiness.projectId, result.projectId, "guided pilot readiness projectId");
  assertEqual(result.status, readiness.status, "guided pilot result readiness status");
  const flowContractReceipt = readiness?.inputs?.flowContract;
  if (!flowContractReceipt) {
    throw new Error("guided pilot readiness result must bind the external flow contract receipt");
  }
  assertEqual(
    flowContractReceipt.path,
    "inputs/flow-contract.json",
    "guided pilot readiness flow contract path"
  );
  validateReceipt(flowContractReceipt, readinessRoot, "guided pilot readiness flow contract");
  assertReceiptContentEqual(
    flowContractReceipt,
    externalFlowContractReceipt,
    "guided pilot readiness flow contract receipt"
  );
  const flowRunnerReceipt = readiness?.inputs?.flowRunner;
  if (!flowRunnerReceipt) {
    throw new Error("guided pilot readiness result must bind the frozen flow runner receipt");
  }
  assertEqual(
    flowRunnerReceipt.path,
    "flow/runner.mjs",
    "guided pilot readiness flow runner path"
  );
  validateReceipt(flowRunnerReceipt, readinessRoot, "guided pilot readiness flow runner");
  assertReceiptContentEqual(
    flowRunnerReceipt,
    result.flow.runner,
    "guided pilot readiness flow runner"
  );
  const sourceReceipt = readiness?.workspace?.sourceManifest;
  const distReceipt = readiness?.workspace?.distManifest;
  if (!sourceReceipt || !distReceipt) {
    throw new Error("guided pilot readiness result must bind workspace sourceManifest and distManifest receipts");
  }
  const sourceBytes = validateReceipt(sourceReceipt, readinessRoot, "guided pilot source tree manifest");
  const distBytes = validateReceipt(distReceipt, readinessRoot, "guided pilot dist tree manifest");
  const sourceManifest = parseJsonBytes(sourceBytes, "guided pilot source tree manifest");
  const distManifest = parseJsonBytes(distBytes, "guided pilot dist tree manifest");
  const sourceSnapshotRoot = resolve(readinessRoot, "workspace/source");
  const distSnapshotRoot = resolve(readinessRoot, "workspace/dist");
  for (const [label, receipt, manifest, rootLabel, snapshotRoot] of [
    ["source", sourceReceipt, sourceManifest, "source", sourceSnapshotRoot],
    ["dist", distReceipt, distManifest, "dist", distSnapshotRoot]
  ]) {
    validateSchema(validators.treeManifest, manifest, `guided pilot ${label} tree manifest`);
    assertEqual(manifest.rootLabel, rootLabel, `guided pilot ${label} tree manifest root label`);
    assertEqual(
      receipt.path,
      `workspace/${rootLabel}-manifest.json`,
      `guided pilot ${label} tree manifest path`
    );
    validateSnapshotManifest(manifest, snapshotRoot, `guided pilot ${label} snapshot`);
  }
  validateReadinessStaticSemantics(readiness);
  validateReadinessStageEvidence(readiness, {
    readinessRoot,
    sourceSnapshotRoot,
    distSnapshotRoot
  });
  return {
    sourceReceipt,
    distReceipt,
    sourceManifest,
    distManifest,
    flowContractReceipt,
    flowRunnerReceipt,
    flowSmoke: readiness?.stages?.flowSmoke,
    readinessRoot,
    sourceSnapshotRoot,
    distSnapshotRoot,
    document: readiness
  };
}

function validateSnapshotManifest(manifest, snapshotRoot, label) {
  if (!existsSync(snapshotRoot)) throw new Error(`${label} root is missing: ${snapshotRoot}`);
  assertRegularDirectory(snapshotRoot, `${label} root`);
  const excludesSourceOutputs = manifest.rootLabel === "source";
  assertDeepEqual(
    manifest.excluded,
    excludesSourceOutputs ? sourceSnapshotExclusions : [],
    `${label} excluded paths`
  );

  const manifestFiles = new Map();
  for (const file of manifest.files) {
    const path = resolveSnapshotFilePath(snapshotRoot, file.path, `${label} manifest file`);
    if (manifestFiles.has(file.path)) {
      throw new Error(`${label} manifest has a duplicate file path: ${file.path}`);
    }
    manifestFiles.set(file.path, { ...file, path });
  }
  validateRequiredSnapshotFiles(manifest.rootLabel, manifestFiles, label);

  for (const [portablePath, file] of manifestFiles) {
    if (!existsSync(file.path)) {
      throw new Error(`${label} is missing manifest file: ${portablePath}`);
    }
    const stat = lstatSync(file.path);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`${label} manifest file must be a regular file: ${portablePath}`);
    }
    const bytes = readFileSync(file.path);
    assertEqual(bytes.length, file.bytes, `${label} manifest file bytes: ${portablePath}`);
    assertEqual(sha256(bytes), file.sha256, `${label} manifest file SHA-256: ${portablePath}`);
  }

  const snapshotFiles = listSnapshotFiles(snapshotRoot, label, excludesSourceOutputs);
  for (const file of snapshotFiles) {
    if (!manifestFiles.has(file.path)) {
      throw new Error(`${label} has an extra file: ${file.path}`);
    }
  }
  if (snapshotFiles.length !== manifestFiles.size) {
    for (const portablePath of manifestFiles.keys()) {
      if (!snapshotFiles.some((file) => file.path === portablePath)) {
        throw new Error(`${label} is missing manifest file: ${portablePath}`);
      }
    }
    throw new Error(`${label} file set does not match its manifest`);
  }

  const actualFiles = snapshotFiles.map((file) => {
    const bytes = readFileSync(file.absolutePath);
    return { path: file.path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  for (const [index, file] of actualFiles.entries()) {
    assertEqual(manifest.files[index].path, file.path, `${label} manifest file order`);
  }
  const treeSha256 = sha256(
    Buffer.from(actualFiles.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join("\n"), "utf8")
  );
  assertEqual(manifest.treeSha256, treeSha256, `${label} tree SHA-256`);
}

function validateRequiredSnapshotFiles(rootLabel, manifestFiles, label) {
  const requiredFiles =
    rootLabel === "source"
      ? ["package.json", "index.html", "public/artifact-meta.json"]
      : ["index.html", "artifact-meta.json"];
  for (const path of requiredFiles) {
    if (!manifestFiles.has(path)) {
      throw new Error(`${label} is missing required output: ${path}`);
    }
  }
  if (rootLabel === "source" && ![...manifestFiles.keys()].some((path) => path.startsWith("src/"))) {
    throw new Error(`${label} is missing a required src file`);
  }
}

function resolveSnapshotFilePath(snapshotRoot, portablePath, label) {
  if (
    typeof portablePath !== "string" ||
    portablePath.length === 0 ||
    portablePath.includes("\\") ||
    portablePath.includes("\0") ||
    portablePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} path is unsafe: ${portablePath}`);
  }
  const path = resolve(snapshotRoot, portablePath);
  assertPathInside(snapshotRoot, path, label);
  return path;
}

function listSnapshotFiles(snapshotRoot, label, excludeSourceOutputs) {
  const files = [];
  walk(snapshotRoot, "");
  return files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  function walk(current, portableParent) {
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    for (const entry of entries) {
      const portablePath = portableParent ? `${portableParent}/${entry.name}` : entry.name;
      const absolutePath = resolve(current, entry.name);
      assertPathInside(snapshotRoot, absolutePath, `${label} file`);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) throw new Error(`${label} rejects symbolic link: ${portablePath}`);
      if (excludeSourceOutputs && shouldExcludeSourceSnapshot(portablePath, stat.isDirectory())) {
        throw new Error(`${label} contains a runner-excluded path: ${portablePath}`);
      }
      if (stat.isDirectory()) walk(absolutePath, portablePath);
      else if (stat.isFile()) files.push({ path: portablePath, absolutePath });
      else throw new Error(`${label} rejects non-file entry: ${portablePath}`);
    }
  }
}

function shouldExcludeSourceSnapshot(portablePath, isDirectory) {
  const segments = portablePath.split("/");
  const top = segments[0];
  if (isDirectory && [".git", "node_modules", "dist", "evidence", "test-results", "vendor"].includes(top)) {
    return true;
  }
  if (isDirectory && segments.some((segment) => segment.startsWith(".tmp"))) return true;
  return !isDirectory && portablePath.endsWith(".tsbuildinfo");
}

function validateReadinessStaticSemantics(readiness) {
  const metrics = readiness.metrics;
  const stages = readiness.stages;
  for (const [metric, stage, expected] of [
    ["typecheckPass", stages.typecheck, stages.typecheck.status === "passed"],
    ["buildPass", stages.build, stages.build.status === "passed"],
    ["previewIdentityPass", stages.preview, stages.preview.status === "passed"]
  ]) {
    assertEqual(metrics[metric], expected, `guided pilot readiness metric ${metric}`);
  }
  const previewSubchecksPassed =
    stages.preview.identity.status === "passed" &&
    stages.preview.entry.status === "passed" &&
    stages.preview.shutdown.status === "passed";
  assertEqual(
    stages.preview.status === "passed",
    previewSubchecksPassed,
    "guided pilot readiness preview status"
  );
}

function validateReadinessFinalSemantics(readiness, flowStatus) {
  const metrics = readiness.metrics;
  const stages = readiness.stages;
  assertEqual(
    metrics.flowSmokePass,
    flowStatus === "passed",
    "guided pilot readiness flowSmoke metric"
  );
  const allPassed = Object.values(metrics).every(Boolean);
  assertEqual(readiness.status, allPassed ? "passed" : "failed", "guided pilot readiness status");
  if (readiness.status === "passed") {
    assertEqual(readiness.failure, null, "guided pilot readiness passed failure");
  } else if (!readiness.failure || typeof readiness.failure !== "object") {
    throw new Error("guided pilot readiness failed result requires a failure object");
  } else {
    const expectedFailure = determinedReadinessFailure(stages, flowStatus);
    if (!expectedFailure) throw new Error("guided pilot readiness failure cannot be derived from its stages");
    assertEqual(readiness.failure.category, expectedFailure.category, "guided pilot readiness failure category");
    assertEqual(
      readiness.failure.firstFailureStage,
      expectedFailure.firstFailureStage,
      "guided pilot readiness failure stage"
    );
    assertEqual(readiness.failure.message, expectedFailure.message, "guided pilot readiness failure message");
  }
}

function determinedReadinessFailure(stages, flowStatus) {
  if (stages.typecheck.status === "failed" && typeof stages.typecheck.reason === "string") {
    return { category: "typecheck", firstFailureStage: "typecheck", message: stages.typecheck.reason };
  }
  if (stages.build.status === "failed" && typeof stages.build.reason === "string") {
    const category = stages.build.reason.startsWith("source tree")
      ? "source-drift"
      : stages.build.reason.startsWith("dist snapshot")
        ? "dist-snapshot"
        : "build";
    return { category, firstFailureStage: "build", message: stages.build.reason };
  }
  if (stages.preview.status === "failed") {
    for (const [check, category] of [
      [stages.preview.identity, "preview-identity"],
      [stages.preview.entry, "preview-entry"],
      [stages.preview.shutdown, "preview-shutdown"]
    ]) {
      if (check.status === "failed" && typeof check.reason === "string") {
        return { category, firstFailureStage: category === "preview-shutdown" ? "shutdown" : "preview", message: check.reason };
      }
    }
    if (typeof stages.preview.reason === "string") {
      return { category: "preview-start", firstFailureStage: "preview", message: stages.preview.reason };
    }
  }
  if (flowStatus === "failed" && typeof stages.flowSmoke.reason === "string") {
    return { category: "flow-smoke", firstFailureStage: "flowSmoke", message: stages.flowSmoke.reason };
  }
  return null;
}

function validateReadinessStageEvidence(readiness, { readinessRoot, sourceSnapshotRoot, distSnapshotRoot }) {
  validateReadinessCommandStage(
    readiness.stages.typecheck,
    readinessRoot,
    "commands/01-typecheck/command.json",
    "typecheck"
  );
  validateReadinessCommandStage(
    readiness.stages.build,
    readinessRoot,
    "commands/02-build/command.json",
    "build"
  );
  validateReadinessPreviewStage(readiness.stages.preview, readinessRoot, sourceSnapshotRoot, distSnapshotRoot);
}

function validateReadinessCommandStage(stage, readinessRoot, expectedPath, expectedStage) {
  if (stage.status === "passed" && !stage.commandEvidence) {
    throw new Error(`guided pilot readiness ${expectedStage} command evidence is required`);
  }
  if (stage.status === "not-run") {
    assertEqual(stage.commandEvidence, null, `guided pilot readiness ${expectedStage} not-run command evidence`);
    return null;
  }
  if (!stage.commandEvidence) {
    if (stage.status === "failed" && (typeof stage.reason !== "string" || stage.reason.length === 0)) {
      throw new Error(`guided pilot readiness ${expectedStage} failed reason is required`);
    }
    return null;
  }
  const command = readReadinessCommandEvidence(
    stage.commandEvidence,
    readinessRoot,
    expectedPath,
    expectedStage,
    `guided pilot readiness ${expectedStage}`
  );
  assertEqual(stage.status, command.status, `guided pilot readiness ${expectedStage} command status`);
  if (stage.status === "passed") {
    assertPassedReadinessCommand(command, "completed", `guided pilot readiness ${expectedStage}`);
    assertEqual(stage.reason, null, `guided pilot readiness ${expectedStage} passed reason`);
  } else if (typeof stage.reason !== "string" || stage.reason.length === 0) {
    throw new Error(`guided pilot readiness ${expectedStage} failed reason is required`);
  }
  return command;
}

function validateReadinessPreviewStage(preview, readinessRoot, sourceSnapshotRoot, distSnapshotRoot) {
  let command = null;
  if (preview.commandEvidence) {
    command = readReadinessCommandEvidence(
      preview.commandEvidence,
      readinessRoot,
      "commands/03-preview/command.json",
      "preview",
      "guided pilot readiness preview"
    );
  }
  validatePreviewResponse(
    preview.identity,
    readinessRoot,
    "preview/identity-response.json",
    readSnapshotFile(sourceSnapshotRoot, "public/artifact-meta.json", "guided pilot readiness source identity"),
    "identity"
  );
  validatePreviewResponse(
    preview.entry,
    readinessRoot,
    "preview/entry-response.html",
    readSnapshotFile(distSnapshotRoot, "index.html", "guided pilot readiness dist entry"),
    "entry"
  );
  if (preview.shutdown.status === "passed") {
    if (!command) throw new Error("guided pilot readiness preview shutdown command evidence is required");
    assertPassedReadinessCommand(command, "requested-shutdown", "guided pilot readiness preview shutdown");
    assertEqual(preview.shutdown.processExited, true, "guided pilot readiness preview shutdown processExited");
    assertEqual(
      preview.shutdown.endpointUnavailable,
      true,
      "guided pilot readiness preview shutdown endpointUnavailable"
    );
    assertEqual(preview.shutdown.reason, null, "guided pilot readiness preview shutdown reason");
    assertDateTime(preview.shutdown.requestedAtUtc, "guided pilot readiness preview shutdown requestedAtUtc");
    assertDateTime(preview.shutdown.observedAtUtc, "guided pilot readiness preview shutdown observedAtUtc");
  } else if (preview.shutdown.status === "failed" && (typeof preview.shutdown.reason !== "string" || preview.shutdown.reason.length === 0)) {
    throw new Error("guided pilot readiness preview shutdown failed reason is required");
  }
  if (command && preview.shutdown.status !== "not-run") {
    assertEqual(
      preview.shutdown.status,
      command.status,
      "guided pilot readiness preview shutdown command status"
    );
  }
  if (preview.status === "passed") {
    if (!command) throw new Error("guided pilot readiness preview command evidence is required");
    assertEqual(preview.reason, null, "guided pilot readiness preview passed reason");
  }
}

function readReadinessCommandEvidence(receipt, readinessRoot, expectedPath, expectedStage, label) {
  assertEqual(receipt.path, expectedPath, `${label} command path`);
  const commandPath = resolveReceiptPath(receipt, readinessRoot, `${label} command`);
  const commandBytes = validateReceipt(receipt, readinessRoot, `${label} command`);
  const command = parseJsonBytes(commandBytes, `${label} command`);
  assertExactKeys(
    command,
    [
      "$schema",
      "version",
      "stage",
      "command",
      "args",
      "cwd",
      "startedAtUtc",
      "stoppedAtUtc",
      "exitCode",
      "status",
      "termination",
      "timedOut",
      "terminationSignal",
      "spawnError",
      "stdout",
      "stderr"
    ],
    `${label} command`
  );
  assertEqual(command.$schema, "guided-pilot-command-receipt.v1", `${label} command schema`);
  assertEqual(command.version, "1.0.0", `${label} command version`);
  assertEqual(command.stage, expectedStage, `${label} command stage`);
  if (typeof command.command !== "string" || command.command.length === 0) {
    throw new Error(`${label} command executable is invalid`);
  }
  if (!Array.isArray(command.args) || command.args.some((value) => typeof value !== "string")) {
    throw new Error(`${label} command args are invalid`);
  }
  if (typeof command.cwd !== "string" || command.cwd.length === 0) {
    throw new Error(`${label} command cwd is invalid`);
  }
  assertDateTime(command.startedAtUtc, `${label} command startedAtUtc`);
  assertDateTime(command.stoppedAtUtc, `${label} command stoppedAtUtc`);
  if (command.status !== "passed" && command.status !== "failed") {
    throw new Error(`${label} command status is invalid`);
  }
  if (!Number.isInteger(command.exitCode) && command.exitCode !== null) {
    throw new Error(`${label} command exitCode is invalid`);
  }
  if (!["completed", "timeout", "requested-shutdown"].includes(command.termination)) {
    throw new Error(`${label} command termination is invalid`);
  }
  if (typeof command.timedOut !== "boolean") throw new Error(`${label} command timedOut is invalid`);
  if (command.terminationSignal !== null && typeof command.terminationSignal !== "string") {
    throw new Error(`${label} command terminationSignal is invalid`);
  }
  if (command.spawnError !== null && typeof command.spawnError !== "string") {
    throw new Error(`${label} command spawnError is invalid`);
  }
  for (const [field, expectedFile] of [
    ["stdout", "stdout.log"],
    ["stderr", "stderr.log"]
  ]) {
    assertEqual(command[field].path, expectedFile, `${label} command ${field} path`);
    validateReceipt(command[field], dirname(commandPath), `${label} command ${field}`);
  }
  return command;
}

function assertPassedReadinessCommand(command, termination, label) {
  assertEqual(command.status, "passed", `${label} command status`);
  assertEqual(command.timedOut, false, `${label} command timedOut`);
  assertEqual(command.termination, termination, `${label} command termination`);
  assertEqual(command.spawnError, null, `${label} command spawnError`);
  if (termination === "completed") {
    assertEqual(command.exitCode, 0, `${label} command exitCode`);
    assertEqual(command.terminationSignal, null, `${label} command terminationSignal`);
  }
}

function validatePreviewResponse(stage, readinessRoot, expectedPath, expectedBytes, label) {
  if (stage.status === "passed") {
    if (!stage.response) throw new Error(`guided pilot readiness preview ${label} response is required`);
    assertEqual(stage.httpStatus, 200, `guided pilot readiness preview ${label} HTTP status`);
    assertEqual(stage.reason, null, `guided pilot readiness preview ${label} passed reason`);
  }
  if (!stage.response) return;
  assertEqual(stage.response.path, expectedPath, `guided pilot readiness preview ${label} response path`);
  const responseBytes = validateReceipt(stage.response, readinessRoot, `guided pilot readiness preview ${label} response`);
  if (stage.status === "passed" && !responseBytes.equals(expectedBytes)) {
    throw new Error(`guided pilot readiness preview ${label} response bytes drifted from its snapshot`);
  }
}

function readSnapshotFile(snapshotRoot, portablePath, label) {
  return readRegularFile(resolveSnapshotFilePath(snapshotRoot, portablePath, label), label);
}

function validateFlowBinding(result, contract, evidenceRoot, kitRoot, readiness) {
  assertEqual(result.flow.runner.path, "scripts/run-guided-pilot-flow-smoke.mjs", "guided pilot flow runner path");
  assertReceiptMatchesFile(
    result.flow.runner,
    resolve(kitRoot, result.flow.runner.path),
    kitRoot,
    "guided pilot flow runner"
  );
  const flowResultBytes = validateReceipt(result.flow.result, evidenceRoot, "guided pilot flow result");
  const flowResult = parseJsonBytes(flowResultBytes, "guided pilot flow result");
  if (!flowResult || typeof flowResult !== "object" || Array.isArray(flowResult)) {
    throw new Error("guided pilot flow result must contain an object");
  }
  assertEqual(flowResult.kind, "guided-pilot-flow-result", "guided pilot flow result kind");
  if (!flowResult.contract || typeof flowResult.contract !== "object") {
    throw new Error("guided pilot flow result has no contract binding");
  }
  if (!flowResult.runner || typeof flowResult.runner !== "object") {
    throw new Error("guided pilot flow result has no runner binding");
  }
  assertEqual(flowResult.contract.contractId, contract.runId, "guided pilot flow result contract id");
  assertEqual(
    flowResult.contract.bytes,
    readiness.flowContractReceipt.bytes,
    "guided pilot flow result contract bytes"
  );
  assertEqual(
    flowResult.contract.sha256,
    readiness.flowContractReceipt.sha256,
    "guided pilot flow result contract SHA-256"
  );
  assertHistoricalAbsolutePathTargetsFile(
    flowResult.contract.path,
    resolveReceiptPath(
      readiness.flowContractReceipt,
      readiness.readinessRoot,
      "guided pilot readiness flow contract"
    ),
    kitRoot,
    "guided pilot flow result contract path"
  );
  assertEqual(flowResult.runner.path, result.flow.runner.path, "guided pilot flow result runner path");
  assertEqual(flowResult.runner.bytes, result.flow.runner.bytes, "guided pilot flow result runner bytes");
  assertEqual(
    flowResult.runner.sha256,
    result.flow.runner.sha256,
    "guided pilot flow result runner SHA-256"
  );
  if (!readiness.flowSmoke || typeof readiness.flowSmoke !== "object") {
    throw new Error("guided pilot readiness result must bind flowSmoke evidence");
  }
  assertReceiptEqual(
    readiness.flowSmoke.contract,
    readiness.flowContractReceipt,
    "guided pilot readiness flowSmoke contract"
  );
  assertReceiptEqual(
    readiness.flowSmoke.runner,
    readiness.flowRunnerReceipt,
    "guided pilot readiness flowSmoke runner"
  );
  const readinessFlowResultPath = resolveReceiptPath(
    readiness.flowSmoke.result,
    readiness.readinessRoot,
    "guided pilot readiness flowSmoke result"
  );
  const resultFlowResultPath = resolveReceiptPath(
    result.flow.result,
    evidenceRoot,
    "guided pilot flow result"
  );
  validateReceipt(readiness.flowSmoke.result, readiness.readinessRoot, "guided pilot readiness flowSmoke result");
  if (resolve(readinessFlowResultPath) !== resolve(resultFlowResultPath)) {
    throw new Error(
      `guided pilot readiness flowSmoke result does not target the top-level flow result: ${readiness.flowSmoke.result.path}`
    );
  }
  assertReceiptContentEqual(readiness.flowSmoke.result, result.flow.result, "guided pilot readiness flowSmoke result");
  const flowStatus = validateFlowResultSemantics(flowResult, contract.flowContract);
  assertEqual(readiness.flowSmoke.status, flowStatus, "guided pilot readiness flowSmoke status");
  assertEqual(
    readiness.flowSmoke.reason,
    flowStatus === "passed" ? null : flowResult.firstFailure.message,
    "guided pilot readiness flowSmoke reason"
  );
  validateReadinessFinalSemantics(readiness.document, flowStatus);
  return flowStatus;
}

function validateFlowResultSemantics(flowResult, flowContract) {
  assertExactKeys(
    flowResult,
    [
      "$schema",
      "kind",
      "version",
      "runner",
      "contract",
      "baseUrl",
      "startedAtUtc",
      "stoppedAtUtc",
      "status",
      "firstFailure",
      "observations",
      "flows"
    ],
    "guided pilot flow result"
  );
  assertEqual(flowResult.$schema, "guided-pilot-flow-smoke-result.v1", "guided pilot flow result schema");
  assertEqual(flowResult.version, "1.0.0", "guided pilot flow result version");
  if (typeof flowResult.baseUrl !== "string" || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(flowResult.baseUrl)) {
    throw new Error(`guided pilot flow result baseUrl is invalid: ${flowResult.baseUrl}`);
  }
  assertDateTime(flowResult.startedAtUtc, "guided pilot flow result startedAtUtc");
  assertDateTime(flowResult.stoppedAtUtc, "guided pilot flow result stoppedAtUtc");
  validateFlowResultRunner(flowResult.runner);
  validateFlowObservations(flowResult.observations);
  if (!Array.isArray(flowResult.flows) || flowResult.flows.length === 0) {
    throw new Error("guided pilot flow result requires a non-empty flows array");
  }
  if (flowResult.status !== "passed" && flowResult.status !== "failed") {
    throw new Error(`guided pilot flow result status is invalid: ${flowResult.status}`);
  }

  if (flowResult.status === "passed") {
    assertEqual(flowResult.firstFailure, null, "guided pilot passed flow firstFailure");
    validateCompletePassedFlows(flowResult.flows, flowContract.flows);
    if (nonIgnoredRuntimeFailureCount(flowResult.observations) !== 0) {
      throw new Error("guided pilot passed flow result contains runtime failures");
    }
    return "passed";
  }

  const firstFailure = validateFlowFirstFailure(flowResult.firstFailure);
  if (firstFailure.stage === "flow-step") {
    validateFlowStepFailure(flowResult.flows, flowContract.flows, firstFailure);
  } else if (firstFailure.stage === "runtime-audit") {
    validateCompletePassedFlows(flowResult.flows, flowContract.flows);
    const count = nonIgnoredRuntimeFailureCount(flowResult.observations);
    if (count === 0) {
      throw new Error("guided pilot runtime-audit failure has no recorded runtime failures");
    }
    assertEqual(
      firstFailure.message,
      `runtime audit recorded ${count} browser failures`,
      "guided pilot runtime-audit failure message"
    );
  } else {
    validateBrowserFailure(flowResult.flows, flowContract.flows, firstFailure);
  }
  return "failed";
}

function validateFlowResultRunner(runner) {
  assertExactKeys(
    runner,
    ["path", "version", "bytes", "sha256", "browser"],
    "guided pilot flow result runner"
  );
  assertEqual(runner.path, "scripts/run-guided-pilot-flow-smoke.mjs", "guided pilot flow result runner path");
  assertEqual(runner.version, "1.0.0", "guided pilot flow result runner version");
  assertReceiptShape(runner, "guided pilot flow result runner");
  assertExactKeys(
    runner.browser,
    ["engine", "executablePath", "executableSha256", "source"],
    "guided pilot flow result browser"
  );
  assertEqual(runner.browser.engine, "chromium", "guided pilot flow result browser engine");
  if (typeof runner.browser.executablePath !== "string" || runner.browser.executablePath.length === 0) {
    throw new Error("guided pilot flow result browser executablePath is invalid");
  }
  if (typeof runner.browser.executableSha256 !== "string" || !/^[0-9a-f]{64}$/.test(runner.browser.executableSha256)) {
    throw new Error("guided pilot flow result browser executableSha256 is invalid");
  }
  if (!["playwright-bundled", "installed-chrome", "installed-edge"].includes(runner.browser.source)) {
    throw new Error(`guided pilot flow result browser source is invalid: ${runner.browser.source}`);
  }
}

function validateFlowObservations(observations) {
  assertExactKeys(
    observations,
    [
      "consoleErrors",
      "consoleErrorDetails",
      "ignoredConsoleErrors",
      "pageErrors",
      "failedResponses",
      "ignoredResponses",
      "requestFailures",
      "ignoredRequestFailures"
    ],
    "guided pilot flow result observations"
  );
  for (const [name, value] of Object.entries(observations)) {
    if (!Array.isArray(value)) throw new Error(`guided pilot flow result observations.${name} must be an array`);
  }
}

function nonIgnoredRuntimeFailureCount(observations) {
  return (
    observations.consoleErrors.length +
    observations.pageErrors.length +
    observations.failedResponses.length +
    observations.requestFailures.length
  );
}

function validateFlowFirstFailure(firstFailure) {
  assertExactKeys(
    firstFailure,
    ["stage", "flowId", "stepId", "message"],
    "guided pilot flow result firstFailure"
  );
  if (!["flow-step", "runtime-audit", "browser"].includes(firstFailure.stage)) {
    throw new Error(`guided pilot flow result firstFailure stage is invalid: ${firstFailure.stage}`);
  }
  if (typeof firstFailure.message !== "string" || firstFailure.message.length === 0) {
    throw new Error("guided pilot flow result firstFailure message is invalid");
  }
  if (firstFailure.stage === "flow-step") {
    if (typeof firstFailure.flowId !== "string" || typeof firstFailure.stepId !== "string") {
      throw new Error("guided pilot flow-step failure requires flowId and stepId");
    }
  } else if (firstFailure.flowId !== null || firstFailure.stepId !== null) {
    throw new Error(`guided pilot ${firstFailure.stage} failure cannot name a flow step`);
  }
  return firstFailure;
}

function validateCompletePassedFlows(actualFlows, expectedFlows) {
  assertEqual(actualFlows.length, expectedFlows.length, "guided pilot flow result flow count");
  for (const [index, expectedFlow] of expectedFlows.entries()) {
    validatePassedFlow(actualFlows[index], expectedFlow, `guided pilot flow result flow ${index + 1}`);
  }
}

function validatePassedFlow(actualFlow, expectedFlow, label) {
  assertExactKeys(actualFlow, ["flowId", "status", "steps"], label);
  assertEqual(actualFlow.flowId, expectedFlow.flowId, `${label} id`);
  assertEqual(actualFlow.status, "passed", `${label} status`);
  assertEqual(actualFlow.steps.length, expectedFlow.steps.length, `${label} step count`);
  for (const [index, expectedStep] of expectedFlow.steps.entries()) {
    validatePassedStep(actualFlow.steps[index], expectedStep, `${label} step ${index + 1}`);
  }
}

function validatePassedStep(actualStep, expectedStep, label) {
  assertExactKeys(actualStep, ["stepId", "status", "assertions"], label);
  assertEqual(actualStep.stepId, expectedStep.stepId, `${label} id`);
  assertEqual(actualStep.status, "passed", `${label} status`);
  assertDeepEqual(
    actualStep.assertions,
    expectedStep.assertions.map((assertion) => ({ ...assertion, status: "passed" })),
    `${label} assertions`
  );
}

function validateFlowStepFailure(actualFlows, expectedFlows, firstFailure) {
  const failedFlowIndex = expectedFlows.findIndex((flow) => flow.flowId === firstFailure.flowId);
  if (failedFlowIndex < 0) {
    throw new Error(`guided pilot flow-step failure names unknown flow: ${firstFailure.flowId}`);
  }
  assertEqual(actualFlows.length, failedFlowIndex + 1, "guided pilot failed flow result flow count");
  for (let index = 0; index < failedFlowIndex; index += 1) {
    validatePassedFlow(actualFlows[index], expectedFlows[index], `guided pilot prior flow ${index + 1}`);
  }
  const expectedFlow = expectedFlows[failedFlowIndex];
  const actualFlow = actualFlows[failedFlowIndex];
  assertExactKeys(actualFlow, ["flowId", "status", "steps"], "guided pilot failed flow");
  assertEqual(actualFlow.flowId, expectedFlow.flowId, "guided pilot failed flow id");
  assertEqual(actualFlow.status, "failed", "guided pilot failed flow status");
  const failedStepIndex = expectedFlow.steps.findIndex((step) => step.stepId === firstFailure.stepId);
  if (failedStepIndex < 0) {
    throw new Error(`guided pilot flow-step failure names unknown step: ${firstFailure.stepId}`);
  }
  assertEqual(actualFlow.steps.length, failedStepIndex + 1, "guided pilot failed flow step count");
  for (let index = 0; index < failedStepIndex; index += 1) {
    validatePassedStep(actualFlow.steps[index], expectedFlow.steps[index], `guided pilot prior failed-flow step ${index + 1}`);
  }
  const actualStep = actualFlow.steps[failedStepIndex];
  const expectedStep = expectedFlow.steps[failedStepIndex];
  assertExactKeys(actualStep, ["stepId", "status", "assertions", "error"], "guided pilot failed flow step");
  assertEqual(actualStep.stepId, expectedStep.stepId, "guided pilot failed flow step id");
  assertEqual(actualStep.status, "failed", "guided pilot failed flow step status");
  assertEqual(actualStep.error, firstFailure.message, "guided pilot failed flow step error");
  if (typeof actualStep.error !== "string" || actualStep.error.length === 0) {
    throw new Error("guided pilot failed flow step error is invalid");
  }
  const expectedAssertions = expectedStep.assertions.map((assertion) => ({ ...assertion, status: "passed" }));
  if (!Array.isArray(actualStep.assertions) || actualStep.assertions.length > expectedAssertions.length) {
    throw new Error("guided pilot failed flow step assertions are invalid");
  }
  assertDeepEqual(
    actualStep.assertions,
    expectedAssertions.slice(0, actualStep.assertions.length),
    "guided pilot failed flow step assertion prefix"
  );
  if (expectedAssertions.length > 0 && actualStep.assertions.length === expectedAssertions.length) {
    throw new Error("guided pilot failed flow step cannot report all assertions passed");
  }
}

function validateBrowserFailure(actualFlows, expectedFlows, firstFailure) {
  if (actualFlows.length > expectedFlows.length) {
    throw new Error("guided pilot browser failure has too many flow results");
  }
  for (let index = 0; index < actualFlows.length - 1; index += 1) {
    validatePassedFlow(actualFlows[index], expectedFlows[index], `guided pilot prior browser flow ${index + 1}`);
  }
  const lastIndex = actualFlows.length - 1;
  const actualFlow = actualFlows[lastIndex];
  const expectedFlow = expectedFlows[lastIndex];
  assertExactKeys(actualFlow, ["flowId", "status", "steps"], "guided pilot browser failure flow");
  assertEqual(actualFlow.flowId, expectedFlow.flowId, "guided pilot browser failure flow id");
  assertEqual(actualFlow.status, "running", "guided pilot browser failure flow status");
  assertDeepEqual(actualFlow.steps, [], "guided pilot browser failure flow steps");
}

function validateResultIdentityIsolation(result, contract, liveState, readiness) {
  const values = [
    ["result runId", result.runId],
    ["result artifactId", result.artifactId],
    ["result projectId", result.projectId],
    ["result workspace", result.workspace.path],
    ["result evidenceRoot", result.evidenceRoot],
    ["source tree SHA-256", readiness.sourceManifest.treeSha256],
    ["dist tree SHA-256", readiness.distManifest.treeSha256]
  ];
  const qualifyingRegistryText = JSON.stringify(
    (liveState.registry.document.runs ?? []).filter((run) => run.qualifying === true)
  );
  const syntheticLedgerText = JSON.stringify(liveState.syntheticLedger.document);
  for (const [label, value] of values) {
    if (qualifyingRegistryText.includes(value)) {
      throw new Error(`guided pilot ${label} overlaps the current qualifying registry`);
    }
    if (syntheticLedgerText.includes(value)) {
      throw new Error(`guided pilot ${label} overlaps the synthetic readiness ledger`);
    }
  }
}

function validateResultIsolation(result, contract, liveState) {
  for (const [label, pair, contractFingerprint, currentFingerprint] of [
    ["registry", result.isolation.registry, contract.isolation.registry, liveState.registry.fingerprint],
    [
      "synthetic ledger",
      result.isolation.syntheticLedger,
      contract.isolation.syntheticLedger,
      liveState.syntheticLedger.fingerprint
    ]
  ]) {
    assertFingerprintMatches(pair.pre, contractFingerprint, `${label} pre fingerprint`);
    assertFingerprintMatches(pair.post, contractFingerprint, `${label} post fingerprint`);
    assertFingerprintMatches(pair.pre, currentFingerprint, `${label} current pre fingerprint`);
    assertFingerprintMatches(pair.post, currentFingerprint, `${label} current post fingerprint`);
  }
}

function readLiveState(kitRoot) {
  const registryPath = resolve(kitRoot, registryRelativePath);
  const syntheticLedgerPath = resolve(kitRoot, syntheticLedgerRelativePath);
  return {
    registry: {
      path: registryPath,
      fingerprint: fingerprintForFile(registryPath, kitRoot, "qualifying registry"),
      document: readJsonFile(registryPath, "qualifying registry")
    },
    syntheticLedger: {
      path: syntheticLedgerPath,
      fingerprint: fingerprintForFile(syntheticLedgerPath, kitRoot, "synthetic readiness ledger"),
      document: readJsonFile(syntheticLedgerPath, "synthetic readiness ledger")
    }
  };
}

function assertCoreIdentity(result, contract, label) {
  for (const [key, actual, expected] of [
    ["mode", result.mode, contract.mode],
    ["runId", result.runId, contract.runId],
    ["artifactId", result.artifactId, contract.artifactId],
    ["projectId", result.projectId, contract.projectId],
    ["evidenceRoot", result.evidenceRoot, contract.evidenceRoot],
    ["workspace path", result.workspace.path, contract.workspace.path],
    ["qualifying", result.qualifying, contract.qualifying],
    ["scoring", result.scoring, contract.scoring],
    ["winner", result.winner, contract.winner],
    ["registryWrite", result.registryWrite, contract.registryWrite],
    ["syntheticLedgerWrite", result.syntheticLedgerWrite, contract.syntheticLedgerWrite]
  ]) {
    assertEqual(actual, expected, `${label} ${key}`);
  }
  assertRunId(result.runId, `${label} runId`);
}

function assertRunId(runId, label) {
  if (!/^guided-pilot-[a-z0-9][a-z0-9-]*$/.test(runId)) {
    throw new Error(`${label} has an invalid prefix: ${runId}`);
  }
  if (/blind-prd-|synthetic/i.test(runId)) {
    throw new Error(`${label} must not overlap blind or synthetic namespaces: ${runId}`);
  }
}

function normalizeExpectedRunIds(value) {
  if (!Array.isArray(value)) throw new Error("guided pilot expected runs must be an array");
  for (const runId of value) assertRunId(runId, "guided pilot expected run");
  return value;
}

function isForbiddenEvidenceRoot(value) {
  const portable = value.replaceAll("\\", "/").toLowerCase();
  return (
    portable.includes("quality/blind-runs") ||
    portable.includes("/readiness") ||
    portable.includes("synthetic-readiness")
  );
}

function validateReceipt(receipt, root, label) {
  assertReceiptShape(receipt, label);
  const path = resolveReceiptPath(receipt, root, label);
  assertReceiptMatchesFile(receipt, path, root, label);
  return readFileSync(path);
}

function resolveReceiptPath(receipt, root, label) {
  assertReceiptShape(receipt, label);
  const path = resolve(root, receipt.path);
  assertPathInside(root, path, label);
  return path;
}

function assertReceiptMatchesFile(receipt, path, root, label) {
  assertReceiptShape(receipt, label);
  assertPathInside(root, path, label);
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must point to a regular file: ${path}`);
  }
  const bytes = readFileSync(path);
  assertEqual(bytes.length, receipt.bytes, `${label} bytes`);
  assertEqual(sha256(bytes), receipt.sha256, `${label} SHA-256`);
}

function fingerprintForFile(path, root, label) {
  const bytes = readRegularFile(path, label);
  const relativePath = relative(resolve(root), resolve(path)).replaceAll("\\", "/");
  if (!relativePath || relativePath.startsWith("../")) {
    throw new Error(`${label} is outside the kit root: ${path}`);
  }
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

function assertFingerprintMatches(actual, expected, label) {
  assertReceiptShape(actual, label);
  assertReceiptShape(expected, `${label} expected`);
  assertReceiptEqual(actual, expected, label);
}

function assertReceiptContentEqual(actual, expected, label) {
  assertReceiptShape(actual, `${label} actual`);
  assertReceiptShape(expected, `${label} expected`);
  for (const key of ["bytes", "sha256"]) {
    assertEqual(actual[key], expected[key], `${label} ${key}`);
  }
}

function assertPackageEqual(actual, expected, label) {
  assertEqual(actual.name, expected.name, `${label} name`);
  assertReceiptEqual(actual.receipt, expected.receipt, `${label} receipt`);
}

function assertGitTracked(path, kitRoot, label) {
  try {
    const insideWorkTree = execFileSync("git", ["-C", kitRoot, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (insideWorkTree !== "true") return;
  } catch {
    return;
  }
  const relativePath = relative(resolve(kitRoot), resolve(path)).replaceAll("\\", "/");
  try {
    execFileSync("git", ["-C", kitRoot, "ls-files", "--error-unmatch", "--", relativePath], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    throw new Error(`${label} must be Git-tracked: ${relativePath}`);
  }
  for (const args of [
    ["-C", kitRoot, "diff", "--no-ext-diff", "--quiet", "--", relativePath],
    ["-C", kitRoot, "diff", "--cached", "--no-ext-diff", "--quiet", "--", relativePath]
  ]) {
    try {
      execFileSync("git", args, {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore"]
      });
    } catch {
      throw new Error(`${label} differs from its Git-tracked bytes: ${relativePath}`);
    }
  }
}

function assertReceiptEqual(actual, expected, label) {
  assertReceiptShape(actual, `${label} actual`);
  assertReceiptShape(expected, `${label} expected`);
  for (const key of ["path", "bytes", "sha256"]) {
    assertEqual(actual[key], expected[key], `${label} ${key}`);
  }
}

function assertReceiptShape(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a receipt object`);
  }
  if (typeof value.path !== "string" || value.path.length === 0) {
    throw new Error(`${label} path is invalid`);
  }
  if (!Number.isInteger(value.bytes) || value.bytes < 0) {
    throw new Error(`${label} bytes are invalid`);
  }
  if (typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256)) {
    throw new Error(`${label} SHA-256 is invalid`);
  }
}

function assertPathInside(root, path, label) {
  if (!isInside(root, path)) throw new Error(`${label} escaped its permitted root: ${path}`);
}

function isInside(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  return value !== "" && value !== ".." && !value.startsWith(`..\\`) && !value.startsWith("../");
}

function assertHistoricalAbsolutePathTargetsFile(recordedPath, expectedPath, kitRoot, label) {
  if (typeof recordedPath !== "string" || recordedPath.length === 0) {
    throw new Error(`${label} is invalid`);
  }
  if (!win32.isAbsolute(recordedPath) && !posix.isAbsolute(recordedPath)) {
    throw new Error(`${label} must be absolute: ${recordedPath}`);
  }
  const portablePath = recordedPath.replaceAll("\\", "/");
  const recordedSegments = portablePath.split("/").filter(Boolean);
  if (recordedSegments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`${label} contains traversal: ${recordedPath}`);
  }
  const expectedRelativePath = relative(resolve(kitRoot), resolve(expectedPath)).replaceAll("\\", "/");
  if (!expectedRelativePath || expectedRelativePath.startsWith("../")) {
    throw new Error(`${label} expected target escaped the kit root: ${expectedPath}`);
  }
  const expectedSegments = [basename(resolve(kitRoot)), ...expectedRelativePath.split("/")];
  const recordedTail = recordedSegments.slice(-expectedSegments.length);
  if (JSON.stringify(recordedTail) !== JSON.stringify(expectedSegments)) {
    throw new Error(
      `${label}: expected checkout-independent suffix ${expectedSegments.join("/")}, received ${portablePath}`
    );
  }
}

function readRegularFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
  return readFileSync(path);
}

function assertRegularDirectory(path, label) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must be a regular directory: ${path}`);
}

function findNamedFiles(root, name) {
  const files = [];
  walk(resolve(root));
  return files.sort();

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`guided pilot validator rejects symbolic link: ${path}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name === name) files.push(path);
      else if (!entry.isFile()) throw new Error(`guided pilot validator rejects non-file entry: ${path}`);
    }
  }
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readRegularFile(resolve(path), label).toString("utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
}

function validateSchema(validate, document, label) {
  if (!validate(document)) {
    throw new Error(`${label} schema failed: ${validatorsText(validate.errors)}`);
  }
}

function createValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    validateFormats: false
  });
  const flowContractSchema = readJsonFile(flowContractSchemaPath, "guided pilot flow contract schema");
  const generationEvidenceSchema = readJsonFile(
    generationEvidenceSchemaPath,
    "guided pilot generation evidence schema"
  );
  const readinessSchema = readJsonFile(readinessSchemaPath, "guided pilot readiness schema");
  const treeManifestSchema = readJsonFile(treeManifestSchemaPath, "guided pilot tree manifest schema");
  ajv.addSchema(flowContractSchema);
  ajv.addSchema(generationEvidenceSchema);
  ajv.addSchema(readinessSchema);
  ajv.addSchema(treeManifestSchema);
  return {
    contract: ajv.compile(readJsonFile(contractSchemaPath, "guided pilot contract schema")),
    result: ajv.compile(readJsonFile(resultSchemaPath, "guided pilot result schema")),
    flowContract: ajv.getSchema(flowContractSchema.$id),
    generationEvidence: ajv.getSchema(generationEvidenceSchema.$id),
    readiness: ajv.getSchema(readinessSchema.$id),
    treeManifest: ajv.getSchema(treeManifestSchema.$id)
  };
}

function validatorsText(errors) {
  return (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} has unexpected fields: ${actual.join(",")}`);
  }
}

function assertAllowedKeys(value, required, optional, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} has an unexpected field: ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) throw new Error(`${label} is missing required field: ${key}`);
  }
}

function assertDateTime(value, label) {
  const parsed = Date.parse(value);
  if (typeof value !== "string" || !Number.isFinite(parsed)) {
    throw new Error(`${label} is invalid`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function assertDeepEqual(actual, expected, label) {
  const left = JSON.stringify(sortValue(actual));
  const right = JSON.stringify(sortValue(expected));
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])])
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv) {
  const options = { expectedRunIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) throw new Error(`unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    const key = name.slice(2);
    if (key === "expected-run") {
      options.expectedRunIds.push(value);
      index += 1;
      continue;
    }
    if (!['contract', 'result'].includes(key) || options[key]) throw new Error(`unexpected argument: ${name}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (options.result && !options.contract) {
    throw new Error("--result requires --contract so the result is bound to a verified contract");
  }
  if (options.contract && options.expectedRunIds.length > 0) {
    throw new Error("--expected-run is only supported by root validation");
  }
  if (options.contract) {
    const contract = validateGuidedPilotContract(options.contract);
    if (options.result) {
      const record = validateGuidedPilot(options.contract, options.result);
      console.log(`validate-guided-pilot passed: runId=${record.contract.runId}; result=true`);
      return;
    }
    console.log(`validate-guided-pilot passed: runId=${contract.contract.runId}; result=false`);
    return;
  }
  const record = validateGuidedPilotRoot(undefined, { expectedRunIds: options.expectedRunIds });
  console.log(
    `validate-guided-pilot passed: pilots=${record.count}; runIds=${record.runIds.join(",")}; root=${pilotRootRelativePath}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(`validate-guided-pilot failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
