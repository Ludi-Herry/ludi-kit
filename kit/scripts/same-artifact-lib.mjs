import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_EXCLUSIONS = Object.freeze([
  ".git/",
  "node_modules/",
  "dist/",
  "evidence/",
  "test-results/"
]);
export const CONTRACT_PATH_DEFAULTS = Object.freeze({
  blindRun: "blind-run-contract.json",
  productDescription: "project-description.json",
  businessContext: "business-context.json",
  pages: "pages.json",
  flows: "flows.json",
  samplePack: "sample-pack.json",
  flowAcceptance: "flow-acceptance.json"
});
export const IDENTITY_KEYS = Object.freeze(["arm", "artifactId", "projectId", "runId"]);

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const flowSchema = readJson(resolve(kitRoot, "schema/project-flow-acceptance.schema.json"));
const receiptSchema = readJson(resolve(kitRoot, "schema/project-artifact-under-test.schema.json"));
const validateFlowSchema = ajv.compile(flowSchema);
const validateReceiptSchema = ajv.compile(receiptSchema);

export function validateFlowDocument(document) {
  if (!validateFlowSchema(document)) {
    throw new Error(`flow-acceptance schema failed: ${ajv.errorsText(validateFlowSchema.errors, { separator: "; " })}`);
  }
}

export function validateReceiptDocument(document) {
  if (!validateReceiptSchema(document)) {
    throw new Error(`artifact receipt schema failed: ${ajv.errorsText(validateReceiptSchema.errors, { separator: "; " })}`);
  }
}

export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${fileLabel(file)} is not valid JSON: ${error.message}`);
  }
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(file) {
  return sha256Bytes(readFileSync(file));
}

export function sha256Tree(root, excluded = []) {
  const absoluteRoot = resolve(root);
  assertDirectory(absoluteRoot, "tree root");
  assertNotSymlink(absoluteRoot, "tree root");
  const excludedRoots = new Set(excluded.map((entry) => entry.replaceAll("\\", "/").replace(/\/+$/, "")));
  const files = [];
  collectTreeFiles(absoluteRoot, "", excludedRoots, files);
  files.sort();

  const hash = createHash("sha256");
  for (const relativePath of files) {
    hash.update(relativePath, "utf8");
    hash.update("\0");
    hash.update(readFileSync(resolve(absoluteRoot, ...relativePath.split("/"))));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function resolveProjectPath(projectRoot, projectRelativePath, options = {}) {
  const { mustExist = true, label = "path", type = null } = options;
  if (typeof projectRelativePath !== "string" || projectRelativePath.length === 0) {
    throw new Error(`${label} must be a non-empty project-relative path`);
  }
  if (isAbsolute(projectRelativePath) || /^[A-Za-z]:/.test(projectRelativePath)) {
    throw new Error(`${label} must stay inside the project root: ${projectRelativePath}`);
  }

  const normalized = projectRelativePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${label} must stay inside the project root: ${projectRelativePath}`);
  }

  const root = resolve(projectRoot);
  const target = resolve(root, ...segments);
  if (!isInside(root, target)) {
    throw new Error(`${label} escapes the project root: ${projectRelativePath}`);
  }
  assertPathHasNoSymlink(root, target, { mustExist, label });
  if (!mustExist || !existsSync(target)) return target;
  if (type === "file" && !statSync(target).isFile()) throw new Error(`${label} must be a file: ${projectRelativePath}`);
  if (type === "directory" && !statSync(target).isDirectory()) throw new Error(`${label} must be a directory: ${projectRelativePath}`);
  return target;
}

export function verifyFrozenArtifact(projectRoot) {
  const root = resolve(projectRoot);
  assertDirectory(root, "project root");
  assertNotSymlink(root, "project root");

  const acceptancePath = resolveProjectPath(root, "flow-acceptance.json", {
    label: "flow acceptance",
    type: "file"
  });
  const acceptance = readJson(acceptancePath);
  validateFlowDocument(acceptance);
  if (acceptance.version !== "1.1.0") {
    throw new Error(`same-artifact verification requires flow-acceptance 1.1.0; received ${acceptance.version}`);
  }

  const receiptPath = resolveProjectPath(root, acceptance.artifactUnderTest.receiptPath, {
    label: "artifact receipt",
    type: "file"
  });
  const receipt = readJson(receiptPath);
  validateReceiptDocument(receipt);

  assertEqual(receipt.projectId, acceptance.projectId, "receipt projectId must match flow acceptance");
  assertEqual(receipt.artifactId, acceptance.artifactUnderTest.artifactId, "receipt artifactId must match flow acceptance");
  assertPackageScripts(root);

  const contractFiles = {};
  for (const [contractName, record] of Object.entries(receipt.contracts)) {
    const contractPath = resolveProjectPath(root, record.path, {
      label: `${contractName} contract`,
      type: "file"
    });
    const actualHash = sha256File(contractPath);
    assertEqual(actualHash, record.sha256, `${contractName} contract hash drift`);
    contractFiles[contractName] = contractPath;
  }
  assertEqual(contractFiles.flowAcceptance, acceptancePath, "flowAcceptance contract path must resolve to flow-acceptance.json");

  const sourceEntryPath = resolveProjectPath(root, receipt.source.entry, {
    label: "source entry",
    type: "file"
  });
  const sourceMarkerPath = resolveProjectPath(root, "public/artifact-meta.json", {
    label: "source artifact marker",
    type: "file"
  });
  const distRoot = resolveProjectPath(root, receipt.build.outputPath, {
    label: "build output",
    type: "directory"
  });
  const distEntryPath = resolveProjectPath(root, `${receipt.build.outputPath}/index.html`, {
    label: "built entry",
    type: "file"
  });
  const distMarkerPath = resolveProjectPath(root, `${receipt.build.outputPath}/artifact-meta.json`, {
    label: "built artifact marker",
    type: "file"
  });

  const identity = identityFromReceipt(receipt);
  assertExactIdentity(readJson(sourceMarkerPath), identity, "source artifact marker");
  assertExactIdentity(readJson(distMarkerPath), identity, "built artifact marker");

  const actualSourceHash = sha256Tree(root, receipt.source.excluded);
  assertEqual(actualSourceHash, receipt.source.sha256, "source tree hash drift");
  const actualBuildHash = sha256Tree(distRoot);
  assertEqual(actualBuildHash, receipt.build.sha256, "dist tree hash drift");

  return {
    projectRoot: root,
    acceptancePath,
    acceptance,
    receiptPath,
    receipt,
    identity,
    contractFiles,
    sourceEntryPath,
    sourceMarkerPath,
    distRoot,
    distEntryPath,
    distMarkerPath
  };
}

export function verifyAcceptanceEvidence(projectRoot, evidencePath = "evidence/flow-acceptance.json") {
  const context = verifyFrozenArtifact(projectRoot);
  const absoluteEvidencePath = resolveProjectPath(context.projectRoot, evidencePath, {
    label: "flow acceptance evidence",
    type: "file"
  });
  const evidence = readJson(absoluteEvidencePath);

  assertObject(evidence, "flow acceptance evidence");
  assertEqual(evidence.version, "1.1.0", "evidence version");
  assertEqual(evidence.status, "passed", "evidence status");
  for (const key of IDENTITY_KEYS) {
    assertEqual(evidence[key], context.identity[key], `evidence ${key}`);
  }
  assertEqual(evidence.exitCode, 0, "evidence exitCode");

  assertObject(evidence.hashes, "evidence hashes");
  assertFileHashRecord(evidence.hashes.receipt, context.receiptPath, context.projectRoot, "receipt evidence");

  assertObject(evidence.hashes.contracts, "contract evidence");
  for (const [contractName, receiptRecord] of Object.entries(context.receipt.contracts)) {
    const evidenceRecord = evidence.hashes.contracts[contractName];
    if (!evidenceRecord) throw new Error(`evidence is missing ${contractName} contract hash`);
    assertEqual(evidenceRecord.path, receiptRecord.path, `${contractName} evidence path`);
    assertFileHashRecord(
      evidenceRecord,
      context.contractFiles[contractName],
      context.projectRoot,
      `${contractName} evidence`
    );
    assertEqual(evidenceRecord.sha256, receiptRecord.sha256, `${contractName} evidence hash must match receipt`);
  }
  assertExactKeys(evidence.hashes.contracts, Object.keys(context.receipt.contracts), "contract evidence");

  assertObject(evidence.hashes.source, "source evidence");
  assertEqual(evidence.hashes.source.algorithm, "sha256-tree-v1", "source evidence algorithm");
  assertEqual(evidence.hashes.source.sha256, context.receipt.source.sha256, "source evidence hash");
  assertObject(evidence.hashes.build, "build evidence");
  assertEqual(evidence.hashes.build.path, context.receipt.build.outputPath, "build evidence path");
  assertEqual(evidence.hashes.build.sha256, context.receipt.build.sha256, "build evidence hash");

  const approved = context.acceptance.flows.filter((flow) => flow.status === "approved");
  if (!Array.isArray(evidence.approvedFlows) || evidence.approvedFlows.length !== approved.length) {
    throw new Error("evidence approvedFlows must cover every approved flow");
  }
  const approvedById = new Map(approved.map((flow) => [flow.flowId, flow]));
  for (const record of evidence.approvedFlows) {
    assertObject(record, "approved flow evidence");
    const flow = approvedById.get(record.flowId);
    if (!flow) throw new Error(`evidence references an unknown approved flow: ${record.flowId}`);
    assertEqual(record.specPath, flow.specPath, `${record.flowId} evidence specPath`);
    if (JSON.stringify(record.objectRefs) !== JSON.stringify(flow.objectRefs)) {
      throw new Error(`${record.flowId} evidence objectRefs must match flow acceptance`);
    }
    approvedById.delete(record.flowId);
  }
  if (approvedById.size > 0) throw new Error("evidence omitted an approved flow");

  assertObject(evidence.hashes.specs, "spec evidence");
  const expectedSpecPaths = approved.map((flow) => flow.specPath).sort();
  assertExactKeys(evidence.hashes.specs, expectedSpecPaths, "spec evidence");
  for (const specPath of expectedSpecPaths) {
    const absoluteSpec = resolveProjectPath(context.projectRoot, specPath, {
      label: "approved flow spec",
      type: "file"
    });
    assertEqual(evidence.hashes.specs[specPath], sha256File(absoluteSpec), `spec evidence hash drift: ${specPath}`);
  }

  assertObject(evidence.hashes.runtimeEntry, "runtime entry evidence");
  assertFileHashRecord(
    {
      path: evidence.hashes.runtimeEntry.path,
      sha256: evidence.hashes.runtimeEntry.fileSha256
    },
    context.distEntryPath,
    context.projectRoot,
    "runtime entry file"
  );
  assertEqual(
    evidence.hashes.runtimeEntry.servedSha256,
    evidence.hashes.runtimeEntry.fileSha256,
    "served runtime entry must match dist/index.html"
  );

  assertObject(evidence.hashes.runtimeIdentity, "runtime identity evidence");
  assertFileHashRecord(
    {
      path: evidence.hashes.runtimeIdentity.path,
      sha256: evidence.hashes.runtimeIdentity.fileSha256
    },
    context.distMarkerPath,
    context.projectRoot,
    "runtime identity file"
  );
  assertEqual(
    evidence.hashes.runtimeIdentity.servedSha256,
    evidence.hashes.runtimeIdentity.fileSha256,
    "served runtime identity must match dist/artifact-meta.json"
  );

  if (!Array.isArray(evidence.screenshots) || evidence.screenshots.length === 0) {
    throw new Error("evidence must bind at least one screenshot");
  }
  const screenshotPaths = new Set();
  for (const screenshot of evidence.screenshots) {
    assertObject(screenshot, "screenshot evidence");
    if (screenshotPaths.has(screenshot.path)) throw new Error(`duplicate screenshot evidence: ${screenshot.path}`);
    screenshotPaths.add(screenshot.path);
    const screenshotPath = resolveProjectPath(context.projectRoot, screenshot.path, {
      label: "screenshot evidence",
      type: "file"
    });
    if (!screenshot.path.startsWith("evidence/") || !screenshot.path.endsWith(".png")) {
      throw new Error(`screenshot must be a project evidence PNG: ${screenshot.path}`);
    }
    assertEqual(screenshot.sha256, sha256File(screenshotPath), `screenshot evidence hash drift: ${screenshot.path}`);
  }

  assertObject(evidence.runtimeAudit, "runtime audit");
  for (const metric of ["consoleErrors", "consoleWarnings", "pageErrors", "unexpectedHttpErrors"]) {
    assertEqual(evidence.runtimeAudit[metric], 0, `runtime audit ${metric}`);
  }
  assertExactIdentity(evidence.runtimeAudit.identity, context.identity, "runtime audit identity");

  assertObject(evidence.metrics, "same-artifact metrics");
  assertEqual(evidence.metrics.sameArtifactMismatchCount, 0, "sameArtifactMismatchCount");
  assertEqual(evidence.metrics.evidenceCompleteness, 100, "evidenceCompleteness");
  assertEqual(evidence.metrics.fixtureProductProofCount, 0, "fixtureProductProofCount");
  if (!Number.isInteger(evidence.metrics.approvedCrossPageFlowCount) || evidence.metrics.approvedCrossPageFlowCount < 1) {
    throw new Error("approvedCrossPageFlowCount must be at least 1");
  }

  return { ...context, evidencePath: absoluteEvidencePath, evidence };
}

export function identityFromReceipt(receipt) {
  return {
    runId: receipt.runId,
    arm: receipt.arm,
    projectId: receipt.projectId,
    artifactId: receipt.artifactId
  };
}

export function assertExactIdentity(actual, expected, label) {
  assertObject(actual, label);
  assertExactKeys(actual, IDENTITY_KEYS, label);
  for (const key of IDENTITY_KEYS) assertEqual(actual[key], expected[key], `${label} ${key}`);
}

export function toProjectRelative(projectRoot, file) {
  const result = relative(resolve(projectRoot), resolve(file)).replaceAll("\\", "/");
  if (result === "" || result.startsWith("../") || result === ".." || /^[A-Za-z]:/.test(result)) {
    throw new Error(`path is outside the project root: ${file}`);
  }
  return result;
}

export function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function collectTreeFiles(root, relativeDirectory, excludedRoots, files) {
  const directory = relativeDirectory
    ? resolve(root, ...relativeDirectory.split("/"))
    : root;
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (!relativeDirectory && excludedRoots.has(entry.name)) continue;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isSymbolicLink() || lstatSync(absolutePath).isSymbolicLink()) {
      throw new Error(`tree contains a symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      collectTreeFiles(root, relativePath, excludedRoots, files);
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`tree contains an unsupported filesystem entry: ${relativePath}`);
    }
  }
}

function assertPathHasNoSymlink(root, target, { mustExist, label }) {
  assertDirectory(root, "project root");
  assertNotSymlink(root, "project root");
  const relativeTarget = relative(root, target);
  if (relativeTarget === "") return;
  let current = root;
  const segments = relativeTarget.split(/[\\/]/);
  for (let index = 0; index < segments.length; index += 1) {
    current = resolve(current, segments[index]);
    if (!existsSync(current)) {
      if (mustExist) throw new Error(`${label} is missing: ${relativeTarget.replaceAll("\\", "/")}`);
      return;
    }
    assertNotSymlink(current, label);
  }
  const canonicalRoot = realpathSync(root);
  const canonicalTarget = realpathSync(target);
  if (!isInside(canonicalRoot, canonicalTarget)) {
    throw new Error(`${label} escapes the project root through a filesystem link`);
  }
}

function assertPackageScripts(projectRoot) {
  const packagePath = resolveProjectPath(projectRoot, "package.json", {
    label: "package.json",
    type: "file"
  });
  const packageDocument = readJson(packagePath);
  if (typeof packageDocument.scripts?.build !== "string" || packageDocument.scripts.build.length === 0) {
    throw new Error("package.json must define the build script recorded by the receipt");
  }
  if (typeof packageDocument.scripts?.preview !== "string" || packageDocument.scripts.preview.length === 0) {
    throw new Error("package.json must define the preview script recorded by the receipt");
  }
}

function assertFileHashRecord(record, absoluteFile, projectRoot, label) {
  assertObject(record, label);
  assertEqual(record.path, toProjectRelative(projectRoot, absoluteFile), `${label} path`);
  assertEqual(record.sha256, sha256File(absoluteFile), `${label} hash`);
}

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} keys must be exactly ${expected.join(", ")}`);
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertDirectory(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`${label} is missing or is not a directory: ${path}`);
}

function assertNotSymlink(path, label) {
  if (lstatSync(path).isSymbolicLink()) throw new Error(`${label} must not be a symbolic link: ${path}`);
}

function fileLabel(file) {
  return String(file).replaceAll("\\", "/");
}
