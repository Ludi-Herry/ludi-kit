import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertFrozenV12CoreBinding,
  assertPostbuildSnapshotV121,
  assertPreclaimSnapshotV121,
  freezeArtifactV121,
  preflightFreezeArtifactV121
} from "./freeze-artifact-v1.2.1.mjs";
import { computeRegistryCounts } from "./blind-protocol-v1.2-lib.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = resolve(kitRoot, "scripts/freeze-artifact-v1.2.1.mjs");
const blindProtocolLibPath = resolve(kitRoot, "scripts/blind-protocol-v1.2-lib.mjs");
const sameArtifactLibPath = resolve(kitRoot, "scripts/same-artifact-lib.mjs");
const tempRoot = mkdtempSync(resolve(tmpdir(), "ai-readable-kit-freeze-preflight-v121-"));
const junctionTargetRoot = mkdtempSync(resolve(tmpdir(), "ai-readable-kit-junction-target-"));
const projectRoot = resolve(tempRoot, "product");
const preRevealPath = resolve(tempRoot, "pre-reveal.json");
const legacyPreRevealPath = resolve(tempRoot, "pre-reveal-legacy-binding.json");
const driftedDependencyPreRevealPath = resolve(tempRoot, "pre-reveal-drifted-dependency.json");
const sealRoot = resolve(tempRoot, "seals");
const identity = {
  runId: "blind-prd-03-replacement-01",
  arm: "consumer",
  projectId: "preflight-fixture",
  artifactId: "33333333-3333-4333-8333-333333333333"
};
const previousProtocolTestFlag = process.env.AI_READABLE_PROTOCOL_TEST;
process.env.AI_READABLE_PROTOCOL_TEST = "1";

try {
  assertFrozenV12CoreBinding();
  createProductFixture(projectRoot, identity);
  const preReveal = makePreRevealFixture(identity);
  writeJson(preRevealPath, preReveal);
  createCoordinatorFixture(tempRoot, preRevealPath, preReveal);

  const args = [
    "--project-root",
    projectRoot,
    "--pre-reveal-contract",
    preRevealPath,
    "--arm",
    "consumer",
    "--entry-route",
    "/today",
    "--blind-run",
    "contracts/blind-run-contract.json",
    "--product-description",
    "contracts/project-description.json",
    "--business-context",
    "contracts/business-context.json",
    "--pages",
    "contracts/pages.json",
    "--flows",
    "contracts/flows.json",
    "--sample-pack",
    "contracts/sample-pack.json",
    "--test-fixture-root",
    tempRoot
  ];
  const claimPath = resolve(sealRoot, `${identity.artifactId}.claim.json`);
  const sealPath = resolve(sealRoot, `${identity.artifactId}.seal.json`);
  const receiptPath = resolve(projectRoot, "evidence/artifact-under-test.json");
  const counterPath = resolve(tempRoot, "build-count.txt");

  const coordinatorRoot = resolve(tempRoot, "coordinator");
  const registryPath = resolve(coordinatorRoot, "registry.json");
  const inputReceiptPath = resolve(coordinatorRoot, "input-receipt.json");
  const registry = readJson(registryPath);
  const currentRun = registry.runs.find((run) => run.runId === identity.runId);
  const currentRunIndex = registry.runs.indexOf(currentRun);
  currentRun.runId = "blind-prd-03-replacement-02";
  writeJson(registryPath, registry);
  await expectFailure(
    () => preflightFreezeArtifactV121(args, { cwd: kitRoot }),
    "unregistered replacement",
    "pre-reveal run is not registered"
  );
  registry.runs[currentRunIndex] = createFixtureRegistryRun(preRevealPath, preReveal);
  writeJson(registryPath, registry);

  const driftedRegistry = readJson(registryPath);
  driftedRegistry.runs[currentRunIndex].contractSha256 = "0".repeat(64);
  writeJson(registryPath, driftedRegistry);
  await expectFailure(
    () => preflightFreezeArtifactV121(args, { cwd: kitRoot }),
    "registry contract drift",
    "registry contract path or hash differs"
  );
  writeJson(registryPath, registry);

  const previousInputReceipt = readJson(resolve(coordinatorRoot, "previous-input-receipt.json"));
  const reusedInputReceipt = readJson(inputReceiptPath);
  reusedInputReceipt.source.sha256 = previousInputReceipt.source.sha256;
  writeJson(inputReceiptPath, reusedInputReceipt);
  await expectFailure(
    () => preflightFreezeArtifactV121(args, { cwd: kitRoot }),
    "reused input SHA",
    "replacement input SHA-256 reuses"
  );
  createFixtureInputReceipt(inputReceiptPath, preRevealPath, preReveal);

  const reusedCommitment = structuredClone(preReveal);
  const previousPreReveal = readJson(resolve(coordinatorRoot, "previous-pre-reveal.json"));
  reusedCommitment.anonymization.assignmentCommitment =
    previousPreReveal.anonymization.assignmentCommitment;
  writeJson(preRevealPath, reusedCommitment);
  syncFixtureContractHashes(coordinatorRoot, preRevealPath);
  await expectFailure(
    () => preflightFreezeArtifactV121(args, { cwd: kitRoot }),
    "reused assignment commitment",
    "replacement assignment commitment reuses"
  );
  writeJson(preRevealPath, preReveal);
  syncFixtureContractHashes(coordinatorRoot, preRevealPath);

  const previousPreRevealPath = resolve(coordinatorRoot, "previous-pre-reveal.json");
  const previousInputReceiptPath = resolve(coordinatorRoot, "previous-input-receipt.json");
  const previousResultPath = resolve(coordinatorRoot, "previous-result.json");
  const driftedPreviousPreReveal = readJson(previousPreRevealPath);
  driftedPreviousPreReveal.anonymization.assignmentCommitment = "c".repeat(64);
  writeJson(previousPreRevealPath, driftedPreviousPreReveal);
  await expectFailure(
    () => preflightFreezeArtifactV121(args, { cwd: kitRoot }),
    "invalidated pre-reveal drift",
    "invalidated pre-reveal hash differs"
  );
  writeJson(previousPreRevealPath, previousPreReveal);

  const driftedPreviousInputReceipt = readJson(previousInputReceiptPath);
  driftedPreviousInputReceipt.source.sha256 = "d".repeat(64);
  writeJson(previousInputReceiptPath, driftedPreviousInputReceipt);
  await expectFailure(
    () => preflightFreezeArtifactV121(args, { cwd: kitRoot }),
    "invalidated input receipt drift",
    "invalidated result differs from its input"
  );
  writeJson(previousInputReceiptPath, previousInputReceipt);

  const previousResult = readJson(previousResultPath);
  const driftedPreviousResult = structuredClone(previousResult);
  driftedPreviousResult.arms.consumer.sourceSha256AtStop = "e".repeat(64);
  writeJson(previousResultPath, driftedPreviousResult);
  await expectFailure(
    () => preflightFreezeArtifactV121(args, { cwd: kitRoot }),
    "invalidated result drift",
    "fixture invalidated evidence drift"
  );
  rmSync(previousResultPath);
  await expectFailure(
    () => preflightFreezeArtifactV121(args, { cwd: kitRoot }),
    "missing invalidated result",
    "replacement requires the invalidated run result"
  );
  writeJson(previousResultPath, previousResult);
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "coordinator gate negatives");

  await expectFailure(
    () => freezeArtifactV121([...args, "--seal-finalize"], { cwd: kitRoot }),
    "seal finalize boundary",
    "initial-freeze only"
  );
  expectCommandFailure(
    runDefaultFreeze([...args, "--seal-finalize"]),
    "default finalize routing",
    "project root must equal the pre-reveal consumer workspaceRoot"
  );
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "seal finalize boundary");

  await expectFailure(
    () => freezeArtifactV121(args, { cwd: kitRoot, fixtureSealRoot: resolve(tempRoot, "alternate-seals") }),
    "runtime path override",
    "does not accept runtime path overrides"
  );
  const outsideFixtureArgs = [...args];
  outsideFixtureArgs[outsideFixtureArgs.indexOf(projectRoot)] = resolve(tmpdir(), "outside-preflight-product");
  await expectFailure(
    () => preflightFreezeArtifactV121(outsideFixtureArgs, { cwd: kitRoot }),
    "fixture path escape",
    "project root must stay inside the owned test fixture root"
  );
  const junctionProjectRoot = resolve(tempRoot, "junction-product");
  symlinkSync(junctionTargetRoot, junctionProjectRoot, "junction");
  const junctionFixtureArgs = [...args];
  junctionFixtureArgs[junctionFixtureArgs.indexOf(projectRoot)] = junctionProjectRoot;
  await expectFailure(
    () => preflightFreezeArtifactV121(junctionFixtureArgs, { cwd: kitRoot }),
    "fixture junction escape",
    "must not cross a junction"
  );
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "fixture isolation");

  const legacyBinding = structuredClone(preReveal);
  legacyBinding.protocol.files.freezeScript = {
    path: "scripts/freeze-artifact-v1.2.mjs",
    sha256: "75323a2e18c95456c160cf1c89a440c6cdefeb147d4fd2180976db36d033681b"
  };
  writeJson(legacyPreRevealPath, legacyBinding);
  const legacyArgs = [...args];
  legacyArgs[legacyArgs.indexOf(preRevealPath)] = legacyPreRevealPath;
  await expectFailure(
    () => preflightFreezeArtifactV121(legacyArgs, { cwd: kitRoot }),
    "legacy binding",
    "does not bind the v1.2.1 implementation"
  );
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "legacy binding");

  const driftedDependencyBinding = structuredClone(preReveal);
  driftedDependencyBinding.protocol.files.blindProtocolLib.sha256 = "0".repeat(64);
  writeJson(driftedDependencyPreRevealPath, driftedDependencyBinding);
  const driftedDependencyArgs = [...args];
  driftedDependencyArgs[driftedDependencyArgs.indexOf(preRevealPath)] = driftedDependencyPreRevealPath;
  await expectFailure(
    () => preflightFreezeArtifactV121(driftedDependencyArgs, { cwd: kitRoot }),
    "dependency binding drift",
    "blindProtocolLib hash differs"
  );
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "dependency binding drift");

  await expectFailure(
    () => freezeArtifactV121(args, { cwd: kitRoot }),
    "missing first contract",
    "blindRun contract is missing"
  );
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "missing contract");

  writeJson(resolve(projectRoot, "contracts/blind-run-contract.json"), identity);
  expectCommandFailure(
    runDefaultFreeze(args),
    "default command missing final contract",
    "samplePack contract is missing"
  );
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "missing final contract");

  writeJson(resolve(projectRoot, "contracts/sample-pack.json"), { fixture: "sample-pack.json" });
  const preclaimSnapshot = await preflightFreezeArtifactV121(args, { cwd: kitRoot });
  const crossOriginRouteArgs = [...args];
  crossOriginRouteArgs[crossOriginRouteArgs.indexOf("/today")] = "/\\evil";
  await expectFailure(
    () => freezeArtifactV121(crossOriginRouteArgs, { cwd: kitRoot }),
    "backslash route",
    "--entry-route must be a same-origin path"
  );
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "backslash route");

  const priorProduct = preclaimSnapshot.coordinator.previous.result.arms.consumer;
  const originalPriorSource = priorProduct.sourceSha256AtStop;
  priorProduct.sourceSha256AtStop = preclaimSnapshot.artifactApi.sha256Tree(
    projectRoot,
    preclaimSnapshot.artifactApi.SOURCE_EXCLUSIONS
  );
  await expectFailure(
    () => assertPreclaimSnapshotV121(preclaimSnapshot),
    "reused source tree",
    "replacement source tree reuses"
  );
  priorProduct.sourceSha256AtStop = originalPriorSource;
  const originalPriorBuild = priorProduct.buildSha256AtStop;
  priorProduct.buildSha256AtStop = preclaimSnapshot.artifactApi.sha256Tree(resolve(projectRoot, "dist"));
  await expectFailure(
    () => assertPreclaimSnapshotV121(preclaimSnapshot),
    "reused dist tree",
    "replacement dist tree reuses"
  );
  priorProduct.buildSha256AtStop = originalPriorBuild;

  await runPostbuildFailureFixture({
    mode: "contract-drift",
    artifactId: "55555555-5555-4555-8555-555555555555",
    expectedMessage: "samplePack contract changed during build"
  });
  await runPostbuildFailureFixture({
    mode: "old-dist",
    artifactId: "66666666-6666-4666-8666-666666666666",
    expectedMessage: "replacement dist tree reuses the invalidated run after build"
  });

  const samplePackPath = resolve(projectRoot, "contracts/sample-pack.json");
  writeJson(samplePackPath, { fixture: "changed-during-build" });
  await expectFailure(
    () => assertPostbuildSnapshotV121(preclaimSnapshot),
    "contract changed during build",
    "samplePack contract changed during build"
  );
  writeJson(samplePackPath, { fixture: "sample-pack.json" });
  priorProduct.buildSha256AtStop = preclaimSnapshot.artifactApi.sha256Tree(resolve(projectRoot, "dist"));
  await expectFailure(
    () => assertPostbuildSnapshotV121(preclaimSnapshot),
    "old dist generated during build",
    "replacement dist tree reuses the invalidated run after build"
  );
  priorProduct.buildSha256AtStop = originalPriorBuild;

  rmSync(samplePackPath);
  await expectFailure(
    () => assertPreclaimSnapshotV121(preclaimSnapshot),
    "contract deletion after preflight",
    "samplePack contract changed after preflight"
  );
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "post-preflight contract deletion");
  writeJson(samplePackPath, { fixture: "sample-pack.json" });

  const packagePath = resolve(projectRoot, "package.json");
  const productPackage = readJson(packagePath);
  delete productPackage.scripts.preview;
  writeJson(packagePath, productPackage);
  await expectFailure(
    () => freezeArtifactV121(args, { cwd: kitRoot }),
    "missing preview script",
    "must define a non-empty preview script"
  );
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "missing preview script");

  productPackage.scripts.preview = "node preview.mjs";
  delete productPackage.scripts.build;
  writeJson(packagePath, productPackage);
  await expectFailure(
    () => freezeArtifactV121(args, { cwd: kitRoot }),
    "missing build script",
    "must define a non-empty build script"
  );
  assertNoFreezeState({ claimPath, sealPath, receiptPath, counterPath }, "missing build script");

  productPackage.scripts.build = "node build.mjs";
  writeJson(packagePath, productPackage);
  await freezeArtifactV121(args, { cwd: kitRoot });
  for (const path of [claimPath, sealPath, receiptPath]) {
    if (!existsSync(path)) throw new Error(`successful freeze did not write ${path}`);
  }
  if (readFileSync(counterPath, "utf8").trim() !== "1") {
    throw new Error("successful freeze did not execute exactly one product build");
  }

  console.log(
    "blind freeze preflight v1.2.1 tests passed: current-and-previous-coordinator-drift=blocked; finalize-hash-route-and-junction-boundaries=blocked; first-final-post-preflight-and-cross-origin-route=no-claim; postbuild-contract-and-old-dist=claim-only; legacy-and-dependency-binding=blocked; missing-build-and-preview=no-claim; explicit-path-success=one-build+receipt+seal"
  );
} finally {
  if (previousProtocolTestFlag === undefined) {
    delete process.env.AI_READABLE_PROTOCOL_TEST;
  } else {
    process.env.AI_READABLE_PROTOCOL_TEST = previousProtocolTestFlag;
  }
  if (isOwnedTempRoot(tempRoot)) {
    rmSync(tempRoot, { recursive: true, force: true });
  } else {
    throw new Error(`refusing to clean an unowned test temp root: ${tempRoot}`);
  }
  if (isOwnedJunctionTarget(junctionTargetRoot)) {
    rmSync(junctionTargetRoot, { recursive: true, force: true });
  } else {
    throw new Error(`refusing to clean an unowned junction target: ${junctionTargetRoot}`);
  }
}

function createProductFixture(root, artifactIdentity) {
  mkdirSync(resolve(root, "public"), { recursive: true });
  writeJson(resolve(root, "public/artifact-meta.json"), artifactIdentity);
  for (const file of [
    "project-description.json",
    "business-context.json",
    "pages.json",
    "flows.json"
  ]) {
    writeJson(resolve(root, "contracts", file), { fixture: file });
  }
  writeText(resolve(root, "index.html"), "<!doctype html><title>preflight fixture</title>\n");
  writeText(resolve(root, "dist/index.html"), "<!doctype html><title>preflight fixture</title>\n");
  writeJson(resolve(root, "dist/artifact-meta.json"), artifactIdentity);
  writeJson(resolve(root, "package.json"), {
    name: "blind-freeze-preflight-fixture",
    private: true,
    scripts: {
      build: "node build.mjs",
      preview: "node preview.mjs"
    }
  });
  writeBuildScript(root, "normal");
}

function writeBuildScript(root, mode) {
  const modeLines = mode === "contract-drift"
    ? ["writeFileSync(resolve(process.cwd(), 'contracts/sample-pack.json'), '{\\\"fixture\\\":\\\"changed-by-build\\\"}\\n', 'utf8');"]
    : mode === "old-dist"
      ? ["rmSync(resolve(process.cwd(), 'dist/prebuild-only.txt'), { force: true });"]
      : [];
  writeText(
    resolve(root, "build.mjs"),
    [
      "import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';",
      "import { resolve } from 'node:path';",
      "const counter = resolve(process.cwd(), '..', 'build-count.txt');",
      "const count = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;",
      "writeFileSync(counter, String(count + 1), 'utf8');",
      "mkdirSync(resolve(process.cwd(), 'dist'), { recursive: true });",
      "copyFileSync(resolve(process.cwd(), 'public/artifact-meta.json'), resolve(process.cwd(), 'dist/artifact-meta.json'));",
      "copyFileSync(resolve(process.cwd(), 'index.html'), resolve(process.cwd(), 'dist/index.html'));",
      ...modeLines
    ].join("\n") + "\n"
  );
}

function makePreRevealFixture(artifactIdentity) {
  const document = readJson(
    resolve(kitRoot, "quality/blind-runs/blind-prd-03/pre-reveal-contract.json")
  );
  document.runId = artifactIdentity.runId;
  document.attemptNumber = 2;
  document.replacesRunId = "blind-prd-03";
  document.protocol.files.freezeScript = {
    path: "scripts/freeze-artifact-v1.2.1.mjs",
    sha256: sha256File(scriptPath)
  };
  document.protocol.files.blindProtocolLib = {
    path: "scripts/blind-protocol-v1.2-lib.mjs",
    sha256: sha256File(blindProtocolLibPath)
  };
  document.protocol.files.sameArtifactLib = {
    path: "scripts/same-artifact-lib.mjs",
    sha256: sha256File(sameArtifactLibPath)
  };
  document.consumerPackageReceipt.path =
    `quality/blind-runs/${artifactIdentity.runId}/consumer-package-receipt.json`;
  document.inputGate.receiptPath =
    `quality/blind-runs/${artifactIdentity.runId}/input-receipt.json`;
  document.arms[0].artifactId = artifactIdentity.artifactId;
  document.arms[0].workspaceRoot =
    `H:/AI-readable-kit-blind-runs/${artifactIdentity.runId}/arms/consumer`;
  document.arms[1].artifactId = "44444444-4444-4444-8444-444444444444";
  document.arms[1].workspaceRoot =
    `H:/AI-readable-kit-blind-runs/${artifactIdentity.runId}/arms/control`;
  document.anonymization.privateRevealPath =
    `.local-pack/${artifactIdentity.runId}-assignment-reveal.private.json`;
  document.anonymization.assignmentCommitment = "a".repeat(64);
  return document;
}

function createCoordinatorFixture(root, currentPreRevealPath, currentPreReveal) {
  const coordinatorRoot = resolve(root, "coordinator");
  const previousPreReveal = readJson(
    resolve(kitRoot, "quality/blind-runs/blind-prd-03/pre-reveal-contract.json")
  );
  const previousInputReceipt = readJson(
    resolve(kitRoot, "quality/blind-runs/blind-prd-03/input-receipt.json")
  );
  const previousResult = readJson(
    resolve(kitRoot, "quality/blind-runs/blind-prd-03/result.json")
  );
  writeJson(resolve(coordinatorRoot, "previous-pre-reveal.json"), previousPreReveal);
  writeJson(resolve(coordinatorRoot, "previous-input-receipt.json"), previousInputReceipt);
  writeJson(resolve(coordinatorRoot, "previous-result.json"), previousResult);
  writeJson(resolve(coordinatorRoot, "previous-evidence-anchor.json"), {
    preRevealSha256: sha256File(resolve(coordinatorRoot, "previous-pre-reveal.json")),
    inputReceiptSha256: sha256File(resolve(coordinatorRoot, "previous-input-receipt.json")),
    resultSha256: sha256File(resolve(coordinatorRoot, "previous-result.json"))
  });

  const registry = readJson(resolve(kitRoot, "quality/blind-adoption-registry.json"));
  registry.updatedAt = "2026-08-01T23:59:00.000Z";
  registry.runs = registry.runs.filter(
    (run) => run.slot !== currentPreReveal.slot || run.attemptNumber < currentPreReveal.attemptNumber
  );
  registry.counts = computeRegistryCounts(registry.runs, registry.kpi.targetRuns);
  registry.runs.push(createFixtureRegistryRun(currentPreRevealPath, currentPreReveal));
  registry.counts = computeRegistryCounts(registry.runs, registry.kpi.targetRuns);
  writeJson(resolve(coordinatorRoot, "registry.json"), registry);
  createFixtureInputReceipt(
    resolve(coordinatorRoot, "input-receipt.json"),
    currentPreRevealPath,
    currentPreReveal
  );
}

function createFixtureRegistryRun(currentPreRevealPath, currentPreReveal) {
  return {
    runId: currentPreReveal.runId,
    slot: currentPreReveal.slot,
    attemptNumber: currentPreReveal.attemptNumber,
    replacesRunId: currentPreReveal.replacesRunId,
    status: "running",
    qualifying: null,
    kitFirstPass: null,
    winner: null,
    contractPath: `quality/blind-runs/${currentPreReveal.runId}/pre-reveal-contract.json`,
    contractSha256: sha256File(currentPreRevealPath),
    evidencePath: null,
    inputStatus: "revealed"
  };
}

function createFixtureInputReceipt(path, currentPreRevealPath, currentPreReveal) {
  const receipt = readJson(
    resolve(kitRoot, "quality/blind-runs/blind-prd-03/input-receipt.json")
  );
  receipt.runId = currentPreReveal.runId;
  receipt.attemptNumber = currentPreReveal.attemptNumber;
  receipt.preRevealContract = {
    path: `quality/blind-runs/${currentPreReveal.runId}/pre-reveal-contract.json`,
    sha256: sha256File(currentPreRevealPath),
    freezeCommit: "a".repeat(40)
  };
  receipt.source = {
    path: "H:/fixture/new-eligible-prd.md",
    fileName: "new-eligible-prd.md",
    bytes: 1234,
    sha256: "b".repeat(64)
  };
  writeJson(path, receipt);
}

function syncFixtureContractHashes(coordinatorRoot, currentPreRevealPath) {
  const sha256 = sha256File(currentPreRevealPath);
  const registryPath = resolve(coordinatorRoot, "registry.json");
  const registry = readJson(registryPath);
  registry.runs.find((run) => run.runId === identity.runId).contractSha256 = sha256;
  writeJson(registryPath, registry);
  const inputReceiptPath = resolve(coordinatorRoot, "input-receipt.json");
  const inputReceipt = readJson(inputReceiptPath);
  inputReceipt.preRevealContract.sha256 = sha256;
  writeJson(inputReceiptPath, inputReceipt);
}

async function runPostbuildFailureFixture({ mode, artifactId, expectedMessage }) {
  const root = mkdtempSync(resolve(tmpdir(), "ai-readable-kit-freeze-preflight-v121-"));
  try {
    const product = resolve(root, "product");
    const preRevealFile = resolve(root, "pre-reveal.json");
    const artifactIdentity = {
      ...identity,
      artifactId,
      projectId: `postbuild-${mode}`
    };
    createProductFixture(product, artifactIdentity);
    writeBuildScript(product, mode);
    writeJson(resolve(product, "contracts/blind-run-contract.json"), artifactIdentity);
    writeJson(resolve(product, "contracts/sample-pack.json"), { fixture: "sample-pack.json" });
    const contract = makePreRevealFixture(artifactIdentity);
    writeJson(preRevealFile, contract);
    createCoordinatorFixture(root, preRevealFile, contract);

    if (mode === "old-dist") {
      writeText(resolve(product, "dist/prebuild-only.txt"), "fresh before build\n");
      const expectedDist = resolve(root, "expected-old-dist");
      writeText(expectedDist + "/index.html", "<!doctype html><title>preflight fixture</title>\n");
      writeJson(expectedDist + "/artifact-meta.json", artifactIdentity);
      const { sha256Tree } = await import("./same-artifact-lib.mjs");
      const previousResultPath = resolve(root, "coordinator/previous-result.json");
      const previousResult = readJson(previousResultPath);
      previousResult.arms.consumer.buildSha256AtStop = sha256Tree(expectedDist);
      writeJson(previousResultPath, previousResult);
      const anchorPath = resolve(root, "coordinator/previous-evidence-anchor.json");
      const anchor = readJson(anchorPath);
      anchor.resultSha256 = sha256File(previousResultPath);
      writeJson(anchorPath, anchor);
    }

    const values = createFixtureArgs(root, product, preRevealFile);
    const claim = resolve(root, "seals", `${artifactId}.claim.json`);
    const seal = resolve(root, "seals", `${artifactId}.seal.json`);
    const receipt = resolve(product, "evidence/artifact-under-test.json");
    const buildCount = resolve(root, "build-count.txt");
    await expectFailure(
      () => freezeArtifactV121(values, { cwd: kitRoot }),
      `postbuild ${mode}`,
      expectedMessage
    );
    if (!existsSync(claim)) throw new Error(`${mode} must retain the claim after build starts`);
    if (existsSync(receipt) || existsSync(seal)) {
      throw new Error(`${mode} must not write receipt or seal`);
    }
    if (readFileSync(buildCount, "utf8").trim() !== "1") {
      throw new Error(`${mode} must execute exactly one product build`);
    }
  } finally {
    if (isOwnedTempRoot(root)) {
      rmSync(root, { recursive: true, force: true });
    } else {
      throw new Error(`refusing to clean an unowned postbuild fixture: ${root}`);
    }
  }
}

function createFixtureArgs(root, product, preRevealFile) {
  return [
    "--project-root", product,
    "--pre-reveal-contract", preRevealFile,
    "--arm", "consumer",
    "--entry-route", "/today",
    "--blind-run", "contracts/blind-run-contract.json",
    "--product-description", "contracts/project-description.json",
    "--business-context", "contracts/business-context.json",
    "--pages", "contracts/pages.json",
    "--flows", "contracts/flows.json",
    "--sample-pack", "contracts/sample-pack.json",
    "--test-fixture-root", root
  ];
}

function runDefaultFreeze(args) {
  const npmCli = process.env.npm_execpath;
  const hasNpmRuntime = npmCli && existsSync(npmCli);
  const command = hasNpmRuntime
    ? process.execPath
    : process.platform === "win32"
      ? "cmd.exe"
      : "npm";
  const commandArgs = hasNpmRuntime
    ? [npmCli, "run", "freeze:artifact-under-test", "--", ...args]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run freeze:artifact-under-test -- ${args.join(" ")}`]
      : ["run", "freeze:artifact-under-test", "--", ...args];
  return spawnSync(command, commandArgs, {
    cwd: kitRoot,
    encoding: "utf8",
    shell: false,
    timeout: 30_000,
    windowsHide: true
  });
}

function expectCommandFailure(result, label, expectedMessage) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status === 0 || !output.includes(expectedMessage)) {
    throw new Error(`${label} failed for the wrong reason: status=${result.status}; output=${output}`);
  }
}

function assertNoFreezeState(paths, label) {
  for (const [name, path] of Object.entries(paths)) {
    if (existsSync(path)) throw new Error(`${label} unexpectedly wrote ${name}: ${path}`);
  }
}

async function expectFailure(action, label, expectedMessage) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      throw new Error(`${label} failed for the wrong reason: ${message}`);
    }
    return;
  }
  throw new Error(`${label} unexpectedly passed`);
}

function isOwnedTempRoot(path) {
  return dirname(path) === resolve(tmpdir()) &&
    path.startsWith(resolve(tmpdir(), "ai-readable-kit-freeze-preflight-v121-"));
}

function isOwnedJunctionTarget(path) {
  return dirname(path) === resolve(tmpdir()) &&
    path.startsWith(resolve(tmpdir(), "ai-readable-kit-junction-target-"));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}
