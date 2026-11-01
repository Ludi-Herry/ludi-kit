import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const KIT_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const REPOSITORY_ROOT = resolve(KIT_ROOT, "..");
const FROZEN_V12_CORE_PATH = resolve(dirname(SCRIPT_PATH), "freeze-artifact-v1.2.mjs");
const BLIND_PROTOCOL_LIB_PATH = resolve(dirname(SCRIPT_PATH), "blind-protocol-v1.2-lib.mjs");
const SAME_ARTIFACT_LIB_PATH = resolve(dirname(SCRIPT_PATH), "same-artifact-lib.mjs");
const FROZEN_V12_CORE_SHA256 =
  "75323a2e18c95456c160cf1c89a440c6cdefeb147d4fd2180976db36d033681b";
const PRODUCT_CONTRACT_PATHS = Object.freeze({
  blindRun: "blind-run-contract.json",
  productDescription: "project-description.json",
  businessContext: "business-context.json",
  pages: "pages.json",
  flows: "flows.json",
  samplePack: "sample-pack.json"
});

export async function preflightFreezeArtifactV121(values, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  if (values.includes("--seal-finalize")) {
    throw new Error("v1.2.1 is initial-freeze only; use the frozen v1.2 entry for --seal-finalize");
  }
  const projectRootArg = readArg(values, "--project-root");
  const preRevealArg = readArg(values, "--pre-reveal-contract");
  if (!projectRootArg) throw new Error("--project-root is required");
  if (!preRevealArg) throw new Error("--pre-reveal-contract is required for v1.2.1");

  const projectRoot = resolve(cwd, projectRootArg);
  const preRevealPath = resolve(cwd, preRevealArg);
  const fixture = resolveTestFixture(values, { cwd, projectRoot, preRevealPath });
  const preReveal = readJsonLocal(preRevealPath);
  assertImplementationBinding({ cwd, preReveal });
  const protocolApi = await import("./blind-protocol-v1.2-lib.mjs");
  const {
    assertCanonicalIdentity,
    assertSealAvailableBeforeBuild,
    validatePreRevealV11
  } = protocolApi;
  const artifactApi = await import("./same-artifact-lib.mjs");
  const {
    assertExactIdentity,
    readJson,
    resolveProjectPath,
    sha256File
  } = artifactApi;
  validatePreRevealV11(preReveal);
  const preRevealSha256 = sha256LocalFile(preRevealPath);
  const coordinator = assertCoordinatorFreezeGate({
    cwd,
    fixture,
    preReveal,
    preRevealPath,
    preRevealSha256,
    validateRegistryV11: protocolApi.validateRegistryV11
  });

  const markerPath = resolveProjectPath(projectRoot, "public/artifact-meta.json", {
    label: "source artifact marker",
    type: "file"
  });
  const marker = readJson(markerPath);
  const armId = readArg(values, "--arm") ?? marker.arm;
  const arm = preReveal.arms.find((entry) => entry.id === armId);
  if (!arm) throw new Error(`pre-reveal contract has no arm ${armId}`);
  const identity = {
    runId: preReveal.runId,
    arm: armId,
    projectId: marker.projectId,
    artifactId: arm.artifactId
  };
  assertExactIdentity(marker, identity, "source artifact marker");
  if (!fixture) {
    const portableProjectRoot = projectRoot.replaceAll("\\", "/");
    if (portableProjectRoot.toLowerCase() !== arm.workspaceRoot.toLowerCase()) {
      throw new Error(`project root must equal the pre-reveal ${armId} workspaceRoot`);
    }
  }

  const receiptPath = resolveProjectPath(projectRoot, "evidence/artifact-under-test.json", {
    label: "artifact receipt",
    mustExist: false
  });
  if (existsSync(receiptPath)) {
    throw new Error("artifact receipt already exists; frozen artifacts cannot be rebuilt in place");
  }
  const sealRoot = fixture?.sealRoot ?? preReveal.seal.rootPath;
  assertSealAvailableBeforeBuild({
    sealRoot,
    projectRoot,
    artifactId: identity.artifactId
  });

  const contracts = Object.fromEntries(
    Object.entries(PRODUCT_CONTRACT_PATHS).map(([name, fallback]) => {
      const path = readArg(values, `--${toKebabCase(name)}`) ?? fallback;
      const absolutePath = resolveProjectPath(projectRoot, path, {
        label: `${name} contract`,
        type: "file"
      });
      return [name, {
        path: path.replaceAll("\\", "/"),
        absolutePath,
        document: readJson(absolutePath),
        sha256: sha256File(absolutePath)
      }];
    })
  );
  assertBlindRunIdentity(contracts.blindRun.document, identity, assertCanonicalIdentity);

  const packagePath = resolveProjectPath(projectRoot, "package.json", {
    label: "product package",
    type: "file"
  });
  const productPackage = readJson(packagePath);
  for (const scriptName of ["build", "preview"]) {
    const script = productPackage.scripts?.[scriptName];
    if (typeof script !== "string" || script.trim() === "") {
      throw new Error(
        `product package must define a non-empty ${scriptName} script before claim reservation`
      );
    }
  }

  const entryRoute = readArg(values, "--entry-route") ?? "/";
  assertSameOriginEntryRoute(entryRoute);

  return {
    projectRoot,
    preRevealPath,
    preReveal,
    preRevealSha256,
    identity,
    markerPath,
    contracts,
    entryRoute,
    receiptPath,
    sealRoot,
    fixture,
    coordinator,
    protocolApi,
    artifactApi
  };
}

export async function freezeArtifactV121(values, options = {}) {
  const unsupportedOptions = Object.keys(options).filter((key) => key !== "cwd");
  if (unsupportedOptions.length > 0) {
    throw new Error(`v1.2.1 does not accept runtime path overrides: ${unsupportedOptions.join(", ")}`);
  }
  const context = await preflightFreezeArtifactV121(values, options);
  assertPreclaimSnapshotV121(context);
  const {
    reserveArtifactSealClaim,
    stableDocumentBytes,
    validateArtifactSeal,
    writeArtifactSealExclusive
  } = context.protocolApi;
  const {
    SOURCE_EXCLUSIONS,
    assertExactIdentity,
    identityFromReceipt,
    readJson,
    resolveProjectPath,
    sha256File,
    sha256Tree,
    validateReceiptDocument
  } = context.artifactApi;

  reserveArtifactSealClaim({
    sealRoot: context.sealRoot,
    projectRoot: context.projectRoot,
    identity: context.identity
  });

  const build = runNpm(["run", "build"], context.projectRoot);
  writeResult(build);
  if (build.status !== 0) {
    throw new Error(`build failed with exit code ${build.status ?? 1}; receipt was not written`);
  }
  if (existsSync(context.receiptPath)) {
    throw new Error("build wrote the reserved artifact receipt path; receipt was not accepted");
  }
  if (sha256LocalFile(context.preRevealPath) !== context.preRevealSha256) {
    throw new Error("pre-reveal contract changed during build");
  }
  assertExactIdentity(readJson(context.markerPath), context.identity, "source artifact marker after build");
  assertBlindRunIdentity(
    readJson(context.contracts.blindRun.absolutePath),
    context.identity,
    context.protocolApi.assertCanonicalIdentity
  );

  const distRoot = resolveProjectPath(context.projectRoot, "dist", {
    label: "build output",
    type: "directory"
  });
  resolveProjectPath(context.projectRoot, "dist/index.html", {
    label: "built entry",
    type: "file"
  });
  const distMarkerPath = resolveProjectPath(context.projectRoot, "dist/artifact-meta.json", {
    label: "built artifact marker",
    type: "file"
  });
  assertExactIdentity(readJson(distMarkerPath), context.identity, "built artifact marker");
  assertPostbuildSnapshotV121(context);

  const receipt = {
    version: "1.1.0",
    artifactKind: "generated-product",
    ...context.identity,
    contracts: Object.fromEntries(
      Object.entries(context.contracts).map(([name, record]) => [
        name,
        { path: record.path, sha256: record.sha256 }
      ])
    ),
    source: {
      root: ".",
      entry: "index.html",
      algorithm: "sha256-tree-v1",
      excluded: [...SOURCE_EXCLUSIONS],
      sha256: sha256Tree(context.projectRoot, SOURCE_EXCLUSIONS)
    },
    build: {
      script: "build",
      outputPath: "dist",
      exitCode: 0,
      sha256: sha256Tree(distRoot)
    },
    runtime: {
      script: "preview",
      entryRoute: context.entryRoute,
      identityPath: "/artifact-meta.json"
    },
    seal: {
      version: "1.0.0",
      rootId: context.preReveal.seal.rootId,
      key: context.identity.artifactId
    }
  };
  validateReceiptDocument(receipt);
  assertExactIdentity(identityFromReceipt(receipt), context.identity, "receipt identity");

  mkdirSync(dirname(context.receiptPath), { recursive: true });
  const temporaryReceipt = `${context.receiptPath}.tmp-${process.pid}`;
  writeFileSync(temporaryReceipt, stableDocumentBytes(receipt), "utf8");
  renameSync(temporaryReceipt, context.receiptPath);

  const seal = sealFromReceiptV121({
    receipt,
    receiptPath: context.receiptPath,
    preReveal: context.preReveal,
    identity: context.identity,
    sha256File,
    validateArtifactSeal
  });
  const sealPath = writeArtifactSealExclusive({
    sealRoot: context.sealRoot,
    projectRoot: context.projectRoot,
    seal
  });
  verifyTerminalStateV121({
    context,
    receipt,
    seal,
    sealPath,
    readJson,
    sha256File,
    validateArtifactSeal,
    validateReceiptDocument,
    identityFromReceipt
  });
  return {
    projectRoot: context.projectRoot,
    receiptPath: context.receiptPath,
    sealPath,
    receipt,
    seal
  };
}

export function assertPreclaimSnapshotV121(context) {
  if (context.fixture) {
    assertFixtureCanonicalPaths(context.fixture, {
      projectRoot: context.projectRoot,
      preRevealPath: context.preRevealPath
    });
  }
  if (sha256LocalFile(context.preRevealPath) !== context.preRevealSha256) {
    throw new Error("pre-reveal contract changed after preflight");
  }
  context.artifactApi.assertExactIdentity(
    context.artifactApi.readJson(context.markerPath),
    context.identity,
    "source artifact marker before claim"
  );
  assertContractSnapshotV121(context, "after preflight");
  assertBlindRunIdentity(
    context.artifactApi.readJson(context.contracts.blindRun.absolutePath),
    context.identity,
    context.protocolApi.assertCanonicalIdentity
  );
  if (existsSync(context.receiptPath)) {
    throw new Error("artifact receipt appeared after preflight");
  }
  context.protocolApi.assertSealAvailableBeforeBuild({
    sealRoot: context.sealRoot,
    projectRoot: context.projectRoot,
    artifactId: context.identity.artifactId
  });
  assertReplacementProductFreshnessV121(context, "before claim");
}

export function assertPostbuildSnapshotV121(context) {
  if (sha256LocalFile(context.preRevealPath) !== context.preRevealSha256) {
    throw new Error("pre-reveal contract changed during build");
  }
  context.artifactApi.assertExactIdentity(
    context.artifactApi.readJson(context.markerPath),
    context.identity,
    "source artifact marker after build"
  );
  assertContractSnapshotV121(context, "during build");
  assertReplacementProductFreshnessV121(context, "after build");
}

function assertContractSnapshotV121(context, phase) {
  for (const [name, record] of Object.entries(context.contracts)) {
    let currentSha256;
    try {
      currentSha256 = context.artifactApi.sha256File(record.absolutePath);
    } catch {
      throw new Error(`${name} contract changed ${phase}`);
    }
    if (currentSha256 !== record.sha256) {
      throw new Error(`${name} contract changed ${phase}`);
    }
  }
  assertBlindRunIdentity(
    context.artifactApi.readJson(context.contracts.blindRun.absolutePath),
    context.identity,
    context.protocolApi.assertCanonicalIdentity
  );
}

function assertReplacementProductFreshnessV121(context, phase) {
  const priorProduct = context.coordinator.previous?.result?.arms?.[context.identity.arm];
  if (!priorProduct) return;
  const currentSourceSha256 = context.artifactApi.sha256Tree(
    context.projectRoot,
    context.artifactApi.SOURCE_EXCLUSIONS
  );
  if (currentSourceSha256 === priorProduct.sourceSha256AtStop) {
    throw new Error(`replacement source tree reuses the invalidated run ${phase}`);
  }
  const distRoot = resolve(context.projectRoot, "dist");
  if (existsSync(distRoot) &&
      context.artifactApi.sha256Tree(distRoot) === priorProduct.buildSha256AtStop) {
    throw new Error(`replacement dist tree reuses the invalidated run ${phase}`);
  }
}

function assertImplementationBinding({ cwd, preReveal }) {
  if (!preReveal?.protocol?.files || typeof preReveal.protocol.files !== "object") {
    throw new Error("pre-reveal protocol.files is required before loading protocol dependencies");
  }
  assertProtocolFileBinding({
    cwd,
    preReveal,
    key: "freezeScript",
    expectedPath: SCRIPT_PATH,
    label: "v1.2.1 implementation"
  });
  assertProtocolFileBinding({
    cwd,
    preReveal,
    key: "blindProtocolLib",
    expectedPath: BLIND_PROTOCOL_LIB_PATH,
    label: "blind protocol library"
  });
  assertProtocolFileBinding({
    cwd,
    preReveal,
    key: "sameArtifactLib",
    expectedPath: SAME_ARTIFACT_LIB_PATH,
    label: "same-artifact library"
  });
  assertFrozenV12CoreBinding();
}

export function assertFrozenV12CoreBinding() {
  if (sha256LocalFile(FROZEN_V12_CORE_PATH) !== FROZEN_V12_CORE_SHA256) {
    throw new Error("frozen v1.2 core hash differs from the v1.2.1 compatibility dependency");
  }
}

function assertProtocolFileBinding({ cwd, preReveal, key, expectedPath, label }) {
  const record = preReveal.protocol.files[key];
  const boundPath = resolve(cwd, record.path);
  if (boundPath.toLowerCase() !== resolve(expectedPath).toLowerCase()) {
    throw new Error(`pre-reveal ${key} does not bind the ${label}`);
  }
  if (sha256LocalFile(expectedPath) !== record.sha256) {
    throw new Error(`pre-reveal ${key} hash differs from the ${label}`);
  }
}

function assertBlindRunIdentity(document, identity, assertCanonicalIdentity) {
  const actual = {
    runId: document.runId,
    arm: document.arm,
    projectId: document.projectId,
    artifactId: document.artifactId
  };
  assertCanonicalIdentity(actual, identity, "blind-run contract");
}

function readJsonLocal(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256LocalFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertCoordinatorFreezeGate({
  cwd,
  fixture,
  preReveal,
  preRevealPath,
  preRevealSha256,
  validateRegistryV11
}) {
  if (resolve(cwd).toLowerCase() !== KIT_ROOT.toLowerCase()) {
    throw new Error("v1.2.1 must run from the committed kit coordinator root");
  }
  const logicalPreRevealPath =
    `quality/blind-runs/${preReveal.runId}/pre-reveal-contract.json`;
  if (!fixture) {
    const actualPreRevealPath = portableRelative(KIT_ROOT, preRevealPath);
    if (actualPreRevealPath !== logicalPreRevealPath) {
      throw new Error("pre-reveal contract path does not match its canonical run path");
    }
  }

  const coordinatorRoot = fixture?.coordinatorRoot ?? KIT_ROOT;
  const registryPath = fixture
    ? resolve(coordinatorRoot, "registry.json")
    : resolve(KIT_ROOT, "quality/blind-adoption-registry.json");
  const inputReceiptPath = fixture
    ? resolve(coordinatorRoot, "input-receipt.json")
    : resolve(KIT_ROOT, preReveal.inputGate.receiptPath);
  const registry = readJsonLocal(registryPath);
  validateRegistryV11(registry);
  const inputReceipt = readJsonLocal(inputReceiptPath);
  const run = registry.runs.find((entry) => entry.runId === preReveal.runId);
  if (!run) throw new Error("pre-reveal run is not registered");
  if (run.slot !== preReveal.slot || run.attemptNumber !== preReveal.attemptNumber ||
      run.replacesRunId !== preReveal.replacesRunId) {
    throw new Error("registry attempt identity differs from pre-reveal");
  }
  if (run.status !== "running" || run.inputStatus !== "revealed" || run.qualifying !== null) {
    throw new Error("registry attempt must be active, revealed, and undecided before artifact freeze");
  }
  if (run.contractPath !== logicalPreRevealPath || run.contractSha256 !== preRevealSha256) {
    throw new Error("registry contract path or hash differs from pre-reveal");
  }
  assertInputReceiptBinding({ inputReceipt, preReveal, logicalPreRevealPath, preRevealSha256 });

  let previous = null;
  if (preReveal.replacesRunId !== null) {
    const previousRun = registry.runs.find((entry) => entry.runId === preReveal.replacesRunId);
    if (!previousRun || previousRun.slot !== preReveal.slot || previousRun.status !== "invalidated") {
      throw new Error("replacement must point to an invalidated run in the same slot");
    }
    if (preReveal.attemptNumber !== previousRun.attemptNumber + 1) {
      throw new Error("replacement attemptNumber must follow the invalidated run");
    }
    const previousPreRevealPath = fixture
      ? resolve(coordinatorRoot, "previous-pre-reveal.json")
      : resolve(KIT_ROOT, previousRun.contractPath);
    const previousPreReveal = readJsonLocal(previousPreRevealPath);
    const previousInputReceiptPath = fixture
      ? resolve(coordinatorRoot, "previous-input-receipt.json")
      : resolve(KIT_ROOT, previousPreReveal.inputGate.receiptPath);
    const previousInputReceipt = readJsonLocal(previousInputReceiptPath);
    const previousResultPath = fixture
      ? resolve(coordinatorRoot, "previous-result.json")
      : previousRun.evidencePath
        ? resolve(KIT_ROOT, previousRun.evidencePath)
        : null;
    const previousResult = previousResultPath && existsSync(previousResultPath)
      ? readJsonLocal(previousResultPath)
      : null;
    if (!previousResult || !previousResult.arms?.consumer || !previousResult.arms?.control) {
      throw new Error("replacement requires the invalidated run result with both source/dist hashes");
    }
    for (const armId of ["consumer", "control"]) {
      const product = previousResult.arms[armId];
      if (!/^[0-9a-f]{64}$/.test(product.sourceSha256AtStop ?? "") ||
          !/^[0-9a-f]{64}$/.test(product.buildSha256AtStop ?? "")) {
        throw new Error(`replacement requires ${armId} source/dist hashes from the invalidated run`);
      }
    }
    assertPreviousEvidenceBinding({
      previousRun,
      previousPreReveal,
      previousPreRevealPath,
      previousInputReceipt,
      previousResult,
      previousResultPath
    });
    assertReplacementFreshness({ preReveal, inputReceipt, previousPreReveal, previousInputReceipt });
    previous = {
      run: previousRun,
      preReveal: previousPreReveal,
      preRevealPath: previousPreRevealPath,
      inputReceipt: previousInputReceipt,
      inputReceiptPath: previousInputReceiptPath,
      result: previousResult,
      resultPath: previousResultPath
    };
    if (fixture) assertFixturePreviousEvidenceAnchor(coordinatorRoot, previous);
  }

  if (!fixture) {
    assertCommittedCoordinatorAnchor({
      logicalPreRevealPath,
      preRevealPath,
      preRevealSha256,
      inputReceipt,
      inputReceiptPath,
      registryPath,
      previous
    });
  }
  return { registryPath, registry, inputReceiptPath, inputReceipt, run, previous };
}

function assertInputReceiptBinding({ inputReceipt, preReveal, logicalPreRevealPath, preRevealSha256 }) {
  if (inputReceipt.version !== "1.1.0" || inputReceipt.status !== "received-unopened" ||
      inputReceipt.runId !== preReveal.runId || inputReceipt.slot !== preReveal.slot ||
      inputReceipt.attemptNumber !== preReveal.attemptNumber) {
    throw new Error("input receipt identity or state differs from pre-reveal");
  }
  if (inputReceipt.preRevealContract?.path !== logicalPreRevealPath ||
      inputReceipt.preRevealContract?.sha256 !== preRevealSha256 ||
      !/^[0-9a-f]{40}$/.test(inputReceipt.preRevealContract?.freezeCommit ?? "")) {
    throw new Error("input receipt does not bind the committed pre-reveal contract");
  }
  if (!Number.isInteger(inputReceipt.source?.bytes) || inputReceipt.source.bytes < 1 ||
      !/^[0-9a-f]{64}$/.test(inputReceipt.source?.sha256 ?? "")) {
    throw new Error("input receipt source metadata is incomplete");
  }
  const eligibility = inputReceipt.eligibility;
  if (eligibility?.independentRealPrd !== true ||
      eligibility.informedKitConstruction !== false ||
      eligibility.previouslyInspectedByGenerationAgents !== false) {
    throw new Error("input receipt eligibility is not qualifying");
  }
}

function assertReplacementFreshness({ preReveal, inputReceipt, previousPreReveal, previousInputReceipt }) {
  if (inputReceipt.source.sha256 === previousInputReceipt.source.sha256) {
    throw new Error("replacement input SHA-256 reuses the invalidated run");
  }
  if (preReveal.anonymization.assignmentCommitment ===
      previousPreReveal.anonymization.assignmentCommitment) {
    throw new Error("replacement assignment commitment reuses the invalidated run");
  }
  if (preReveal.anonymization.privateRevealPath ===
      previousPreReveal.anonymization.privateRevealPath) {
    throw new Error("replacement private reveal path reuses the invalidated run");
  }
  assertDisjointValues(
    preReveal.arms.map((arm) => arm.artifactId),
    previousPreReveal.arms.map((arm) => arm.artifactId),
    "artifactId"
  );
  assertDisjointValues(
    preReveal.arms.map((arm) => arm.workspaceRoot.toLowerCase()),
    previousPreReveal.arms.map((arm) => arm.workspaceRoot.toLowerCase()),
    "workspaceRoot"
  );
}

function assertPreviousEvidenceBinding({
  previousRun,
  previousPreReveal,
  previousPreRevealPath,
  previousInputReceipt,
  previousResult,
  previousResultPath
}) {
  if (sha256LocalFile(previousPreRevealPath) !== previousRun.contractSha256) {
    throw new Error("invalidated pre-reveal hash differs from the registry");
  }
  if (previousPreReveal.runId !== previousRun.runId ||
      previousPreReveal.slot !== previousRun.slot ||
      previousPreReveal.attemptNumber !== previousRun.attemptNumber) {
    throw new Error("invalidated pre-reveal identity differs from the registry");
  }
  if (previousInputReceipt.runId !== previousRun.runId ||
      previousInputReceipt.slot !== previousRun.slot ||
      previousInputReceipt.attemptNumber !== previousRun.attemptNumber ||
      previousInputReceipt.preRevealContract?.path !== previousRun.contractPath ||
      previousInputReceipt.preRevealContract?.sha256 !== previousRun.contractSha256) {
    throw new Error("invalidated input receipt does not bind the registry contract");
  }
  if (previousResult.runId !== previousRun.runId || previousResult.slot !== previousRun.slot ||
      previousResult.attemptNumber !== previousRun.attemptNumber ||
      previousResult.status !== "invalidated" || previousResult.qualifying !== false) {
    throw new Error("invalidated result identity or status differs from the registry");
  }
  if (previousRun.evidencePath === null || !previousResultPath ||
      !previousRun.evidencePath.endsWith("/result.json")) {
    throw new Error("invalidated registry run must bind one result evidence path");
  }
  if (previousResult.input?.sha256 !== previousInputReceipt.source.sha256 ||
      previousResult.preRevealContract?.sha256 !== previousRun.contractSha256 ||
      previousResult.anonymization?.assignmentCommitment !==
        previousPreReveal.anonymization.assignmentCommitment) {
    throw new Error("invalidated result differs from its input or pre-reveal evidence");
  }
  for (const armId of ["consumer", "control"]) {
    const priorArm = previousPreReveal.arms.find((arm) => arm.id === armId);
    if (previousResult.arms[armId].artifactId !== priorArm?.artifactId) {
      throw new Error(`invalidated ${armId} result artifactId differs from pre-reveal`);
    }
  }
}

function assertFixturePreviousEvidenceAnchor(coordinatorRoot, previous) {
  const anchor = readJsonLocal(resolve(coordinatorRoot, "previous-evidence-anchor.json"));
  for (const [key, path] of [
    ["preRevealSha256", previous.preRevealPath],
    ["inputReceiptSha256", previous.inputReceiptPath],
    ["resultSha256", previous.resultPath]
  ]) {
    if (anchor[key] !== sha256LocalFile(path)) {
      throw new Error(`fixture invalidated evidence drift: ${key}`);
    }
  }
}

function assertDisjointValues(current, previous, label) {
  const prior = new Set(previous);
  if (current.some((value) => prior.has(value))) {
    throw new Error(`replacement ${label} reuses the invalidated run`);
  }
}

function assertCommittedCoordinatorAnchor({
  logicalPreRevealPath,
  preRevealPath,
  preRevealSha256,
  inputReceipt,
  inputReceiptPath,
  registryPath,
  previous
}) {
  const repoPreRevealPath = `kit/${logicalPreRevealPath}`;
  const frozenPreReveal = gitShowBytes(inputReceipt.preRevealContract.freezeCommit, repoPreRevealPath);
  if (sha256Bytes(frozenPreReveal) !== preRevealSha256 ||
      !frozenPreReveal.equals(readFileSync(preRevealPath))) {
    throw new Error("current pre-reveal bytes differ from the input receipt freeze commit");
  }
  const logicalInputReceiptPath = portableRelative(KIT_ROOT, inputReceiptPath);
  const repoInputReceiptPath = `kit/${logicalInputReceiptPath}`;
  const addCommit = gitText([
    "log",
    "--diff-filter=A",
    "--format=%H",
    "--",
    repoInputReceiptPath
  ]).split(/\r?\n/).find(Boolean);
  if (!addCommit || !gitShowBytes(addCommit, repoInputReceiptPath).equals(readFileSync(inputReceiptPath))) {
    throw new Error("input receipt differs from its immutable first commit");
  }
  for (const path of [inputReceiptPath, registryPath]) {
    assertHeadBytes(path);
  }
  if (previous) {
    const previousRepoPreRevealPath = portableRelative(REPOSITORY_ROOT, previous.preRevealPath);
    const frozenPreviousPreReveal = gitShowBytes(
      previous.inputReceipt.preRevealContract.freezeCommit,
      previousRepoPreRevealPath
    );
    if (!frozenPreviousPreReveal.equals(readFileSync(previous.preRevealPath))) {
      throw new Error("invalidated pre-reveal differs from its freeze commit");
    }
    assertImmutableFirstCommit(previous.inputReceiptPath, "invalidated input receipt");
    for (const path of [
      previous.preRevealPath,
      previous.inputReceiptPath,
      previous.resultPath
    ]) {
      assertHeadBytes(path);
    }
  }
}

function assertImmutableFirstCommit(path, label) {
  const repoPath = portableRelative(REPOSITORY_ROOT, path);
  const addCommit = gitText([
    "log",
    "--diff-filter=A",
    "--format=%H",
    "--",
    repoPath
  ]).split(/\r?\n/).find(Boolean);
  if (!addCommit || !gitShowBytes(addCommit, repoPath).equals(readFileSync(path))) {
    throw new Error(`${label} differs from its immutable first commit`);
  }
}

function assertHeadBytes(path) {
  const logicalPath = portableRelative(REPOSITORY_ROOT, path);
  if (!gitShowBytes("HEAD", logicalPath).equals(readFileSync(path))) {
    throw new Error(`${logicalPath} must match committed HEAD before artifact freeze`);
  }
}

function gitShowBytes(commit, path) {
  const result = spawnSync("git", ["-C", REPOSITORY_ROOT, "show", `${commit}:${path}`], {
    encoding: null,
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`git anchor is unavailable for ${commit}:${path}`);
  }
  return result.stdout;
}

function gitText(args) {
  const result = spawnSync("git", ["-C", REPOSITORY_ROOT, ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(`git anchor command failed: git ${args.join(" ")}`);
  return result.stdout;
}

function portableRelative(root, path) {
  const value = relative(resolve(root), resolve(path));
  if (value === "" || value.startsWith("..") || isAbsolute(value)) {
    throw new Error(`${path} must stay inside ${root}`);
  }
  return value.replaceAll("\\", "/");
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function resolveTestFixture(values, paths) {
  const fixtureRootArg = readArg(values, "--test-fixture-root");
  if (!fixtureRootArg) return null;
  if (process.env.AI_READABLE_PROTOCOL_TEST !== "1") {
    throw new Error("--test-fixture-root requires AI_READABLE_PROTOCOL_TEST=1");
  }
  const fixtureRoot = resolve(paths.cwd, fixtureRootArg);
  const systemTemp = resolve(tmpdir());
  if (dirname(fixtureRoot).toLowerCase() !== systemTemp.toLowerCase() ||
      !basename(fixtureRoot).startsWith("ai-readable-kit-freeze-preflight-v121-")) {
    throw new Error("test fixture root must be one owned direct child of the system temp directory");
  }
  const canonicalSystemTemp = realpathSync(systemTemp);
  if (lstatSync(fixtureRoot).isSymbolicLink()) {
    throw new Error("test fixture root must not be a junction or symbolic link");
  }
  const canonicalFixtureRoot = realpathSync(fixtureRoot);
  if (dirname(canonicalFixtureRoot).toLowerCase() !== canonicalSystemTemp.toLowerCase() ||
      basename(canonicalFixtureRoot) !== basename(fixtureRoot)) {
    throw new Error("test fixture root realpath must be one direct child of the system temp directory");
  }
  for (const [label, path] of [
    ["project root", paths.projectRoot],
    ["pre-reveal contract", paths.preRevealPath]
  ]) {
    if (!isInside(fixtureRoot, path)) {
      throw new Error(`${label} must stay inside the owned test fixture root`);
    }
  }
  const fixture = {
    fixtureRoot,
    canonicalFixtureRoot,
    sealRoot: resolve(fixtureRoot, "seals"),
    coordinatorRoot: resolve(fixtureRoot, "coordinator")
  };
  assertFixtureCanonicalPaths(fixture, paths);
  return fixture;
}

function assertFixtureCanonicalPaths(fixture, paths) {
  for (const [label, path] of [
    ["project root", paths.projectRoot],
    ["pre-reveal contract", paths.preRevealPath],
    ["coordinator root", fixture.coordinatorRoot],
    ["seal root", fixture.sealRoot]
  ]) {
    if (!existsSync(path)) continue;
    assertNoReparseSegment(fixture.fixtureRoot, path, label);
    const canonicalPath = realpathSync(path);
    if (!isInside(fixture.canonicalFixtureRoot, canonicalPath)) {
      throw new Error(`${label} realpath escapes the owned test fixture root`);
    }
  }
}

function assertNoReparseSegment(root, target, label) {
  let cursor = resolve(target);
  const boundary = resolve(root).toLowerCase();
  while (cursor.toLowerCase() !== boundary) {
    if (!isInside(root, cursor)) {
      throw new Error(`${label} escapes the owned test fixture root`);
    }
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`${label} must not cross a junction or symbolic link`);
    }
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`${label} has no owned fixture ancestor`);
    cursor = parent;
  }
  if (lstatSync(root).isSymbolicLink()) {
    throw new Error("test fixture root must not be a junction or symbolic link");
  }
}

function isInside(root, target) {
  const path = relative(resolve(root), resolve(target));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function sealFromReceiptV121({
  receipt,
  receiptPath,
  preReveal,
  identity,
  sha256File,
  validateArtifactSeal
}) {
  const seal = {
    version: "1.0.0",
    rootId: preReveal.seal.rootId,
    ...identity,
    sealedAt: new Date().toISOString(),
    receipt: {
      projectRelativePath: "evidence/artifact-under-test.json",
      sha256: sha256File(receiptPath)
    },
    source: {
      algorithm: receipt.source.algorithm,
      sha256: receipt.source.sha256
    },
    build: {
      path: receipt.build.outputPath,
      sha256: receipt.build.sha256
    }
  };
  validateArtifactSeal(seal);
  return seal;
}

function verifyTerminalStateV121({
  context,
  receipt,
  seal,
  sealPath,
  readJson,
  sha256File,
  validateArtifactSeal,
  validateReceiptDocument,
  identityFromReceipt
}) {
  const terminalReceipt = readJson(context.receiptPath);
  const terminalSeal = readJson(sealPath);
  validateReceiptDocument(terminalReceipt);
  validateArtifactSeal(terminalSeal);
  context.protocolApi.assertCanonicalIdentity(
    identityFromReceipt(terminalReceipt),
    context.identity,
    "terminal receipt identity"
  );
  context.protocolApi.assertCanonicalIdentity(terminalSeal, context.identity, "terminal seal identity");
  context.artifactApi.assertExactIdentity(
    readJson(context.markerPath),
    context.identity,
    "terminal source marker"
  );
  if (terminalSeal.receipt.sha256 !== sha256File(context.receiptPath)) {
    throw new Error("terminal seal receipt hash mismatch");
  }
  if (terminalSeal.source.sha256 !== terminalReceipt.source.sha256 ||
      terminalSeal.build.sha256 !== terminalReceipt.build.sha256) {
    throw new Error("terminal seal product hash mismatch");
  }
  if (JSON.stringify(terminalReceipt) !== JSON.stringify(receipt) ||
      JSON.stringify(terminalSeal) !== JSON.stringify(seal)) {
    throw new Error("terminal receipt or seal bytes changed after exclusive write");
  }
}

function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  const hasNpmRuntime = npmCli && existsSync(npmCli);
  const command = hasNpmRuntime
    ? process.execPath
    : process.platform === "win32"
      ? "cmd.exe"
      : "npm";
  const commandArgs = hasNpmRuntime
    ? [npmCli, ...args]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", `npm ${args.join(" ")}`]
      : args;
  return spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
    windowsHide: true
  });
}

function writeResult(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) process.stderr.write(`${result.error.message}\n`);
}

function readArg(values, name) {
  const index = values.indexOf(name);
  if (index === -1) return null;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function assertSameOriginEntryRoute(entryRoute) {
  if (typeof entryRoute !== "string" || !entryRoute.startsWith("/") ||
      entryRoute.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(entryRoute) ||
      /%5c/i.test(entryRoute)) {
    throw new Error("--entry-route must be a same-origin path beginning with one slash");
  }
  const base = new URL("http://127.0.0.1/");
  let parsed;
  try {
    parsed = new URL(entryRoute, base);
  } catch {
    throw new Error("--entry-route must be a same-origin path beginning with one slash");
  }
  if (parsed.origin !== base.origin) {
    throw new Error("--entry-route must be a same-origin path beginning with one slash");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  try {
    const values = process.argv.slice(2);
    let result;
    if (values.includes("--seal-finalize")) {
      assertFrozenV12CoreBinding();
      result = (await import("./freeze-artifact-v1.2.mjs")).freezeArtifactV12(values);
    } else {
      result = await freezeArtifactV121(values);
    }
    console.log(
      `freeze-artifact-v1.2.1 passed: ${result.receipt.projectId}; receipt=evidence/artifact-under-test.json; seal=${result.sealPath.replaceAll("\\", "/")}`
    );
  } catch (error) {
    console.error(`freeze-artifact-v1.2.1 failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
