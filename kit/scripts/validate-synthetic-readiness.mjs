import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  assertFlowResultRunnerBinding,
  currentFlowRunnerIdentity
} from "./validate-flow-failure-attribution.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const summarySchemaPath = resolve(kitRoot, "schema/synthetic-readiness-summary.schema.json");
const commandSchemaPath = resolve(kitRoot, "schema/synthetic-command-evidence.schema.json");
const treeSchemaPath = resolve(kitRoot, "schema/synthetic-tree-manifest.schema.json");
const semanticSchemaPath = resolve(kitRoot, "schema/semantic-contract.schema.json");
const identitySchemaPath = resolve(kitRoot, "schema/synthetic-artifact-identity.schema.json");
const oraclePath = resolve(kitRoot, "harness/synthetic-prd/coverage-oracle.json");
const registryPath = resolve(kitRoot, "quality/blind-adoption-registry.json");
const flowRunnerPortablePath = "scripts/run-synthetic-flow-smoke.mjs";

const validators = createValidators();

export function validateSyntheticReadinessSummary(summaryPath) {
  const absoluteSummaryPath = resolve(summaryPath);
  const evidenceRoot = dirname(absoluteSummaryPath);
  const summary = readJson(absoluteSummaryPath);
  validateSchema(validators.summary, summary, "readiness summary");
  assertTimeOrder(summary.startedAtUtc, summary.stoppedAtUtc, "readiness summary");

  const sourceManifest = validateTreeReceipt(summary.workspace.sourceManifest, evidenceRoot, "source");
  const distManifest = summary.workspace.distManifest
    ? validateTreeReceipt(summary.workspace.distManifest, evidenceRoot, "dist")
    : null;
  const syntheticManifest = readReceiptJson(summary.inputs.syntheticManifest, evidenceRoot, "synthetic manifest");
  const semanticContract = readReceiptJson(summary.inputs.semanticContract, evidenceRoot, "semantic contract");
  const artifactIdentity = readReceiptJson(summary.inputs.artifactIdentity, evidenceRoot, "artifact identity");
  validateSchema(validators.semantic, semanticContract, "semantic contract");
  validateSchema(validators.identity, artifactIdentity, "artifact identity");
  validateSyntheticInputCopies({ evidenceRoot, syntheticManifest, semanticContract, artifactIdentity, summary });

  const commandDocuments = {
    typecheck: validateCommandStage(summary.stages.typecheck, evidenceRoot, "typecheck"),
    build: validateCommandStage(summary.stages.build, evidenceRoot, "build", { allowPostconditionFailure: true }),
    preview: validatePreviewStage(summary.stages.preview, evidenceRoot, artifactIdentity, distManifest),
    flowSmoke: validateFlowStage(summary.stages.flowSmoke, evidenceRoot, semanticContract)
  };
  for (const command of Object.values(commandDocuments)) {
    if (!command) continue;
    if (Date.parse(command.startedAtUtc) < Date.parse(summary.startedAtUtc)) {
      throw new Error(`${command.stage} command started before readiness summary`);
    }
    if (Date.parse(command.stoppedAtUtc) > Date.parse(summary.stoppedAtUtc)) {
      throw new Error(`${command.stage} command stopped after readiness summary`);
    }
  }

  const expectedMetrics = {
    typecheckPass: summary.stages.typecheck.status === "passed",
    buildPass: summary.stages.build.status === "passed",
    flowSmokePass: summary.stages.flowSmoke.status === "passed",
    previewIdentityPass:
      summary.stages.preview.status === "passed" &&
      summary.stages.preview.identity.status === "passed" &&
      summary.stages.preview.entry.status === "passed" &&
      summary.stages.preview.shutdown.status === "passed"
  };
  assertDeepEqual(summary.metrics, expectedMetrics, "readiness metrics");
  const allPassed = Object.values(expectedMetrics).every(Boolean);
  assertEqual(summary.status, allPassed ? "passed" : "failed", "readiness status");
  if (allPassed && summary.failure !== null) throw new Error("passed readiness summary must not contain failure");
  if (!allPassed && summary.failure === null) throw new Error("failed readiness summary must contain failure");
  if (summary.failure) validateFailureConsistency(summary);

  if (!distManifest && summary.metrics.buildPass) {
    throw new Error("buildPass=true requires a dist manifest");
  }
  return { summary, sourceManifest, distManifest, semanticContract, artifactIdentity, evidenceRoot };
}

export function validateSyntheticReadinessRoot(
  root,
  { requireStabilityGate = false, requireGitTrackedSnapshots = false } = {}
) {
  const absoluteRoot = resolve(root);
  const summaryPaths = findNamedFiles(absoluteRoot, "readiness-summary.json").filter((path) =>
    isCanonicalReadinessSummaryPath(absoluteRoot, path)
  );
  if (summaryPaths.length === 0) throw new Error(`no readiness summaries found under ${absoluteRoot}`);
  const records = summaryPaths.map((path) => validateSyntheticReadinessSummary(path));
  if (requireStabilityGate) validateStabilityGate(records);
  const gitTracking = requireGitTrackedSnapshots
    ? validateGitTrackedReadinessSnapshots(absoluteRoot)
    : null;
  return { count: records.length, records, gitTracking };
}

export function validateGitTrackedReadinessSnapshots(root) {
  const absoluteRoot = resolve(root);
  let repoRoot;
  try {
    repoRoot = execFileSync("git", ["-C", absoluteRoot, "rev-parse", "--show-toplevel"], {
      encoding: "utf8"
    }).trim();
  } catch (error) {
    throw new Error(
      `Git tracked snapshot validation requires a repository: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const rootRelative = relative(repoRoot, absoluteRoot).replaceAll("\\", "/");
  if (rootRelative === "" || rootRelative === ".." || rootRelative.startsWith("../")) {
    throw new Error(`readiness root is outside the Git repository: ${absoluteRoot}`);
  }
  const tracked = new Set(
    execFileSync("git", ["-C", repoRoot, "ls-files", "-z", "--", rootRelative], {
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024
    })
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
  );
  const manifestPaths = findAllFiles(absoluteRoot).filter((path) => {
    const portable = relative(absoluteRoot, path).replaceAll("\\", "/");
    return /^[a-z0-9][a-z0-9-]*\/cycle-(01|02|03)\/(consumer|control)\/(readiness|readiness-revision-01|readiness-revision-02)\/workspace\/(source|dist)-manifest\.json$/.test(
      portable
    );
  });
  if (manifestPaths.length !== 108) {
    throw new Error(`Git tracked snapshot validation expected 108 tree manifests, received ${manifestPaths.length}`);
  }

  const required = new Set(manifestPaths);
  for (const manifestPath of manifestPaths) {
    const manifest = readJson(manifestPath);
    const snapshotRoot = resolve(dirname(manifestPath), manifest.rootLabel);
    validateTreeManifestSnapshot(
      manifest,
      snapshotRoot,
      manifest.rootLabel,
      `Git tracked tree manifest ${manifestPath}`
    );
    for (const file of manifest.files) {
      const snapshotPath = resolve(snapshotRoot, file.path);
      if (!isInside(snapshotRoot, snapshotPath)) {
        throw new Error(`tree manifest path escaped its snapshot root: ${manifestPath} -> ${file.path}`);
      }
      required.add(snapshotPath);
    }
  }

  const missing = [...required]
    .map((path) => relative(repoRoot, path).replaceAll("\\", "/"))
    .filter((path) => !tracked.has(path))
    .sort();
  if (missing.length > 0) {
    throw new Error(
      `tree manifests depend on ${missing.length} files absent from git ls-files: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`
    );
  }
  return { manifests: manifestPaths.length, files: required.size };
}

function validateSyntheticInputCopies({ evidenceRoot, syntheticManifest, semanticContract, artifactIdentity, summary }) {
  assertEqual(syntheticManifest.qualifying, false, "synthetic manifest qualifying");
  assertEqual(syntheticManifest.scoring, false, "synthetic manifest scoring");
  assertEqual(syntheticManifest.harnessMode, "synthetic-generation-readiness", "synthetic harnessMode");
  for (const [name, receipt] of Object.entries(syntheticManifest.files ?? {})) {
    validateReceipt({ path: `inputs/${name}`, bytes: receipt.bytes, sha256: receipt.sha256 }, evidenceRoot, name);
  }
  const manifestBytes = readFileSync(resolve(evidenceRoot, summary.inputs.syntheticManifest.path));
  assertEqual(semanticContract.source.manifestSha256, sha256(manifestBytes), "contract manifest binding");
  assertEqual(
    semanticContract.source.prdSha256,
    syntheticManifest.files["synthetic-prd.md"]?.sha256,
    "contract PRD binding"
  );
  assertEqual(summary.profileId, syntheticManifest.request.profileId, "summary profileId");
  assertEqual(summary.seed, syntheticManifest.request.seed, "summary seed");
  assertEqual(summary.runId, artifactIdentity.runId, "summary runId");
  assertEqual(summary.arm, artifactIdentity.arm, "summary arm");
  assertEqual(artifactIdentity.projectId, syntheticManifest.projectId, "identity projectId");
  if (summary.qualifying !== false || summary.scoring !== false) {
    throw new Error("readiness summary must remain non-qualifying and non-scoring");
  }
}

function validateCommandStage(stage, evidenceRoot, expectedStage, { allowPostconditionFailure = false } = {}) {
  if (stage.status === "not-run") {
    if (stage.commandEvidence !== null || !stage.reason) {
      throw new Error(`${expectedStage} not-run stage must contain a reason and no command`);
    }
    return null;
  }
  if (!stage.commandEvidence) throw new Error(`${expectedStage} executed stage omits command evidence`);
  const command = readReceiptJson(stage.commandEvidence, evidenceRoot, `${expectedStage} command`);
  validateCommandDocument(command, resolve(evidenceRoot, stage.commandEvidence.path), expectedStage);
  if (stage.status !== command.status) {
    const allowed = allowPostconditionFailure && stage.status === "failed" && command.status === "passed" && stage.reason;
    if (!allowed) throw new Error(`${expectedStage} stage status conflicts with command status`);
  }
  if (stage.status === "passed" && stage.reason !== null) {
    throw new Error(`${expectedStage} passed stage must not contain a reason`);
  }
  if (stage.status === "failed" && !stage.reason) {
    throw new Error(`${expectedStage} failed stage must contain a reason`);
  }
  return command;
}

function validatePreviewStage(stage, evidenceRoot, artifactIdentity, distManifest) {
  if (stage.status === "not-run") {
    if (stage.commandEvidence !== null || stage.baseUrl !== null || !stage.reason) {
      throw new Error("preview not-run stage is incomplete");
    }
    for (const check of [stage.identity, stage.entry, stage.shutdown]) {
      if (check.status !== "not-run") throw new Error("preview not-run stage contains an executed subcheck");
    }
    return null;
  }
  if (!stage.commandEvidence || !stage.baseUrl) throw new Error("executed preview omits command evidence or baseUrl");
  const command = readReceiptJson(stage.commandEvidence, evidenceRoot, "preview command");
  validateCommandDocument(command, resolve(evidenceRoot, stage.commandEvidence.path), "preview");

  validateHttpCheck(stage.identity, evidenceRoot, "preview identity");
  validateHttpCheck(stage.entry, evidenceRoot, "preview entry");
  validateShutdownCheck(stage.shutdown);
  if (stage.identity.status === "passed") {
    const bytes = validateReceipt(stage.identity.response, evidenceRoot, "identity response");
    assertDeepEqual(JSON.parse(bytes.toString("utf8")), artifactIdentity, "observed artifact identity");
  }
  if (stage.entry.status === "passed") {
    if (!distManifest) throw new Error("passed preview entry requires a dist manifest");
    const entryBytes = validateReceipt(stage.entry.response, evidenceRoot, "entry response");
    const distEntry = distManifest.files.find((file) => file.path === "index.html");
    if (!distEntry) throw new Error("dist manifest omits index.html");
    assertEqual(sha256(entryBytes), distEntry.sha256, "served entry digest");
  }

  const expectedPassed =
    stage.identity.status === "passed" &&
    stage.entry.status === "passed" &&
    stage.shutdown.status === "passed";
  assertEqual(stage.status, expectedPassed ? "passed" : "failed", "preview stage status");
  if (expectedPassed && stage.reason !== null) throw new Error("passed preview must not contain a reason");
  if (!expectedPassed && !stage.reason) throw new Error("failed preview must contain a reason");
  if (stage.shutdown.status === "passed" && command.status !== "passed") {
    throw new Error("passed preview shutdown conflicts with preview command evidence");
  }
  return command;
}

function validateFlowStage(stage, evidenceRoot, semanticContract) {
  if (stage.status === "not-run") {
    if (stage.commandEvidence !== null || stage.result !== null || !stage.reason) {
      throw new Error("flowSmoke not-run stage is incomplete");
    }
    return null;
  }
  if (!stage.commandEvidence) throw new Error("executed flowSmoke omits command evidence");
  const command = readReceiptJson(stage.commandEvidence, evidenceRoot, "flow command");
  validateCommandDocument(command, resolve(evidenceRoot, stage.commandEvidence.path), "flow-smoke");
  assertEqual(
    resolve(command.args[0]),
    resolve(command.cwd, flowRunnerPortablePath),
    "flow command runner path"
  );
  assertEqual(stage.status, command.status, "flow stage command status");
  if (stage.status === "passed" && !stage.result) throw new Error("passed flowSmoke omits result evidence");
  if (stage.result) {
    const result = readReceiptJson(stage.result, evidenceRoot, "flow result");
    assertFlowResultRunnerBinding(result, currentFlowRunnerIdentity(), "flow result");
    assertEqual(result.contract.sha256, sha256(canonicalJsonBytes(semanticContract)), "flow contract SHA-256");
    assertEqual(result.status, stage.status, "flow result status");
  }
  if (stage.status === "passed" && stage.reason !== null) throw new Error("passed flowSmoke must not contain reason");
  if (stage.status === "failed" && !stage.reason) throw new Error("failed flowSmoke must contain reason");
  return command;
}

function validateHttpCheck(check, evidenceRoot, label) {
  if (check.status === "not-run") {
    if (check.httpStatus !== null || check.response !== null || !check.reason) {
      throw new Error(`${label} not-run evidence is incomplete`);
    }
    return;
  }
  if (check.response) validateReceipt(check.response, evidenceRoot, `${label} response`);
  if (check.status === "passed") {
    assertEqual(check.httpStatus, 200, `${label} HTTP status`);
    if (!check.response || check.reason !== null) throw new Error(`${label} passed evidence is incomplete`);
  } else if (!check.reason) {
    throw new Error(`${label} failed evidence must contain a reason`);
  }
}

function validateShutdownCheck(check) {
  if (check.status === "not-run") {
    if (
      check.requestedAtUtc !== null ||
      check.observedAtUtc !== null ||
      check.processExited !== null ||
      check.endpointUnavailable !== null ||
      !check.reason
    ) {
      throw new Error("preview shutdown not-run evidence is incomplete");
    }
    return;
  }
  assertTimeOrder(check.requestedAtUtc, check.observedAtUtc, "preview shutdown");
  const expectedPassed = check.processExited === true && check.endpointUnavailable === true;
  assertEqual(check.status, expectedPassed ? "passed" : "failed", "preview shutdown status");
  if (expectedPassed && check.reason !== null) throw new Error("passed shutdown must not contain reason");
  if (!expectedPassed && !check.reason) throw new Error("failed shutdown must contain reason");
}

function validateCommandDocument(command, commandPath, expectedStage) {
  validateSchema(validators.command, command, `${expectedStage} command evidence`);
  assertEqual(command.stage, expectedStage, `${expectedStage} command stage`);
  assertTimeOrder(command.startedAtUtc, command.stoppedAtUtc, `${expectedStage} command`);
  const commandRoot = dirname(commandPath);
  const stdout = readStreamReceipt(command.stdout, commandRoot, "stdout");
  const stderr = readStreamReceipt(command.stderr, commandRoot, "stderr");
  if (!Buffer.isBuffer(stdout) || !Buffer.isBuffer(stderr)) throw new Error("command streams were not read");
  if (command.status === "passed") {
    if (expectedStage === "preview") {
      if (command.termination !== "requested-shutdown" || command.timedOut || command.spawnError) {
        throw new Error("passed preview command lacks requested-shutdown evidence");
      }
    } else if (
      command.exitCode !== 0 ||
      command.termination !== "completed" ||
      command.timedOut ||
      command.spawnError
    ) {
      throw new Error(`passed ${expectedStage} command conflicts with process outcome`);
    }
  }
  if (command.status === "failed" && command.exitCode === 0 && !command.timedOut && !command.spawnError) {
    if (expectedStage !== "preview") {
      throw new Error(`failed ${expectedStage} command has a zero exit code without another failure signal`);
    }
  }
}

function readStreamReceipt(receipt, commandRoot, label) {
  const path = resolve(commandRoot, receipt.path);
  if (!isInside(commandRoot, path)) throw new Error(`${label} log escaped command directory`);
  const bytes = readFileSync(path);
  assertEqual(bytes.length, receipt.bytes, `${label} bytes`);
  assertEqual(sha256(bytes), receipt.sha256, `${label} SHA-256`);
  return bytes;
}

function validateTreeReceipt(receipt, evidenceRoot, expectedLabel) {
  const manifest = readReceiptJson(receipt, evidenceRoot, `${expectedLabel} tree manifest`);
  validateTreeManifestSnapshot(
    manifest,
    resolve(evidenceRoot, `workspace/${expectedLabel}`),
    expectedLabel,
    expectedLabel,
    `${expectedLabel} tree manifest`
  );
  return manifest;
}

function validateTreeManifestSnapshot(manifest, snapshotRoot, expectedLabel, label, schemaLabel = label) {
  validateSchema(validators.tree, manifest, schemaLabel);
  assertEqual(manifest.rootLabel, expectedLabel, `${label} rootLabel`);
  const paths = manifest.files.map((file) => file.path);
  assertArrayEqual(paths, [...paths].sort(), `${label} manifest path order`);
  if (new Set(paths).size !== paths.length) throw new Error(`${label} manifest contains duplicate paths`);
  const expectedTreeSha = sha256(
    Buffer.from(
      manifest.files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join("\n"),
      "utf8"
    )
  );
  assertEqual(manifest.treeSha256, expectedTreeSha, `${label} tree SHA-256`);
  const actualPaths = findAllFiles(snapshotRoot).map((path) => relative(snapshotRoot, path).replaceAll("\\", "/"));
  assertArrayEqual(actualPaths, paths, `${label} snapshot file set`);
  const evidenceRoot = resolve(snapshotRoot, "../..");
  for (const file of manifest.files) {
    validateReceipt(
      { path: `workspace/${expectedLabel}/${file.path}`, bytes: file.bytes, sha256: file.sha256 },
      evidenceRoot,
      `${label} snapshot ${file.path}`
    );
  }
}

function validateFailureConsistency(summary) {
  const category = summary.failure.category;
  const failures = {
    typecheck: !summary.metrics.typecheckPass,
    build: !summary.metrics.buildPass,
    "source-drift": !summary.metrics.buildPass,
    "preview-start": !summary.metrics.previewIdentityPass,
    "preview-identity": summary.stages.preview.identity.status !== "passed",
    "preview-entry": summary.stages.preview.entry.status !== "passed",
    "preview-shutdown": summary.stages.preview.shutdown.status !== "passed",
    "flow-smoke": !summary.metrics.flowSmokePass
  };
  if (!failures[category]) throw new Error(`failure category ${category} conflicts with stage evidence`);
}

function validateStabilityGate(records) {
  const oracle = readJson(oraclePath);
  const profileIds = oracle.profiles.map((profile) => profile.profileId).sort();
  assertEqual(records.length, profileIds.length * 2 * 3, "stability gate summary count");
  const keys = new Set();
  const workspacePaths = new Set();
  const sourceHashes = new Set();
  const artifactIds = new Set();
  const paired = new Map();
  const seedByProfileCycle = new Map();
  const registryText = readFileSync(registryPath, "utf8");

  for (const record of records) {
    const { summary, sourceManifest, artifactIdentity, semanticContract } = record;
    if (!profileIds.includes(summary.profileId)) throw new Error(`unexpected stability profile: ${summary.profileId}`);
    const key = `${summary.profileId}/${summary.arm}/${summary.cycle}`;
    if (keys.has(key)) throw new Error(`duplicate stability cell: ${key}`);
    keys.add(key);
    const workspaceKey = summary.workspace.path.toLowerCase();
    if (workspacePaths.has(workspaceKey)) throw new Error(`workspace reused across cycles: ${summary.workspace.path}`);
    workspacePaths.add(workspaceKey);
    if (sourceHashes.has(sourceManifest.treeSha256)) {
      throw new Error(`source tree hash reused across readiness summaries: ${sourceManifest.treeSha256}`);
    }
    sourceHashes.add(sourceManifest.treeSha256);
    if (artifactIds.has(artifactIdentity.artifactId)) throw new Error(`artifactId reused: ${artifactIdentity.artifactId}`);
    artifactIds.add(artifactIdentity.artifactId);
    if (registryText.includes(summary.runId) || registryText.includes(semanticContract.source.prdSha256)) {
      throw new Error(`synthetic readiness identity overlaps qualifying registry: ${key}`);
    }

    const pairKey = `${summary.profileId}/${summary.cycle}`;
    const pair = paired.get(pairKey) ?? [];
    pair.push(record);
    paired.set(pairKey, pair);
    const previousSeed = seedByProfileCycle.get(pairKey);
    if (previousSeed && previousSeed !== summary.seed) throw new Error(`paired arms use different seeds: ${pairKey}`);
    seedByProfileCycle.set(pairKey, summary.seed);
  }

  for (const profileId of profileIds) {
    const profileSeeds = new Set();
    for (const cycle of [1, 2, 3]) {
      for (const arm of ["consumer", "control"]) {
        const key = `${profileId}/${arm}/${cycle}`;
        if (!keys.has(key)) throw new Error(`stability gate omits ${key}`);
      }
      const pairKey = `${profileId}/${cycle}`;
      const pair = paired.get(pairKey);
      if (!pair || pair.length !== 2) throw new Error(`stability pair is incomplete: ${pairKey}`);
      assertEqual(pair[0].summary.runId, pair[1].summary.runId, `${pairKey} runId`);
      assertEqual(
        pair[0].semanticContract.source.manifestSha256,
        pair[1].semanticContract.source.manifestSha256,
        `${pairKey} synthetic manifest`
      );
      assertEqual(
        pair[0].summary.inputs.semanticContract.sha256,
        pair[1].summary.inputs.semanticContract.sha256,
        `${pairKey} semantic contract`
      );
      profileSeeds.add(pair[0].summary.seed);
    }
    assertEqual(profileSeeds.size, 3, `${profileId} fresh seed count`);
  }
}

export function isCanonicalReadinessSummaryPath(root, path) {
  const portable = relative(resolve(root), resolve(path)).replaceAll("\\", "/");
  return /^[a-z0-9][a-z0-9-]*\/cycle-(01|02|03)\/(consumer|control)\/readiness\/readiness-summary\.json$/.test(
    portable
  );
}

function createValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    validateFormats: false
  });
  return {
    summary: ajv.compile(readJson(summarySchemaPath)),
    command: ajv.compile(readJson(commandSchemaPath)),
    tree: ajv.compile(readJson(treeSchemaPath)),
    semantic: ajv.compile(readJson(semanticSchemaPath)),
    identity: ajv.compile(readJson(identitySchemaPath))
  };
}

function validateSchema(validate, document, label) {
  if (!validate(document)) {
    throw new Error(`${label} schema failed: ${validatorsText(validate.errors)}`);
  }
}

function validatorsText(errors) {
  return (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

function readReceiptJson(receipt, root, label) {
  return JSON.parse(validateReceipt(receipt, root, label).toString("utf8"));
}

function validateReceipt(receipt, root, label) {
  if (!receipt) throw new Error(`${label} receipt is missing`);
  const absoluteRoot = resolve(root);
  const path = resolve(absoluteRoot, receipt.path);
  if (!isInside(absoluteRoot, path)) throw new Error(`${label} receipt escaped evidence root`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label} receipt does not point to a regular file`);
  const bytes = readFileSync(path);
  assertEqual(bytes.length, receipt.bytes, `${label} bytes`);
  assertEqual(sha256(bytes), receipt.sha256, `${label} SHA-256`);
  return bytes;
}

function findNamedFiles(root, name) {
  return findAllFiles(root).filter((path) => path.endsWith(`\\${name}`) || path.endsWith(`/${name}`));
}

function findAllFiles(root) {
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`directory does not exist: ${root}`);
  const files = [];
  walk(root);
  return files.sort();

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`validator rejects symbolic link: ${path}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`validator rejects non-file entry: ${path}`);
    }
  }
}

function assertTimeOrder(start, stop, label) {
  const startMs = Date.parse(start);
  const stopMs = Date.parse(stop);
  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs < startMs) {
    throw new Error(`${label} timestamps are invalid or reversed`);
  }
}

function assertDeepEqual(actual, expected, label) {
  const left = JSON.stringify(sortValue(actual));
  const right = JSON.stringify(sortValue(expected));
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
}

function assertArrayEqual(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(sortValue(value), null, 2)}\n`, "utf8");
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

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isInside(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  return value !== "" && value !== ".." && !value.startsWith(`..\\`) && !value.startsWith("../");
}

function parseArgs(argv) {
  const options = { gate: false, requireGitTrackedSnapshots: false };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--require-stability-gate") {
      options.gate = true;
      continue;
    }
    if (name === "--require-git-tracked-snapshots") {
      options.requireGitTrackedSnapshots = true;
      continue;
    }
    if (!name.startsWith("--")) throw new Error(`unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (Boolean(options.summary) === Boolean(options.root)) {
    throw new Error("provide exactly one of --summary or --root");
  }
  if (options.summary) {
    const result = validateSyntheticReadinessSummary(options.summary);
    console.log(
      `validate-synthetic-readiness passed: profile=${result.summary.profileId}; arm=${result.summary.arm}; cycle=${result.summary.cycle}`
    );
    return;
  }
  const result = validateSyntheticReadinessRoot(options.root, {
    requireStabilityGate: Boolean(options.gate),
    requireGitTrackedSnapshots: options.requireGitTrackedSnapshots
  });
  console.log(
    `validate-synthetic-readiness passed: summaries=${result.count}; stabilityGate=${Boolean(options.gate)}; gitTrackedSnapshots=${options.requireGitTrackedSnapshots}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(`validate-synthetic-readiness failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
