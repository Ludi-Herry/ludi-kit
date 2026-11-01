import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import {
  assertCanonicalIdentity,
  assertExternalSealRoot,
  reserveArtifactSealClaim,
  sha256File as sha256ProtocolFile,
  stableDocumentBytes,
  validateArtifactSeal,
  validatePreRevealV11,
  writeArtifactSealExclusive
} from "./blind-protocol-v1.2-lib.mjs";
import {
  SOURCE_EXCLUSIONS,
  assertExactIdentity,
  identityFromReceipt,
  readJson,
  resolveProjectPath,
  sha256File,
  sha256Tree,
  validateReceiptDocument
} from "./same-artifact-lib.mjs";

const PRODUCT_CONTRACT_PATHS = Object.freeze({
  blindRun: "blind-run-contract.json",
  productDescription: "project-description.json",
  businessContext: "business-context.json",
  pages: "pages.json",
  flows: "flows.json",
  samplePack: "sample-pack.json"
});

export function verifyArtifactV12(options) {
  const projectRoot = resolve(options.projectRoot);
  const preRevealPath = resolve(options.preRevealPath);
  const preReveal = readJson(preRevealPath);
  validatePreRevealV11(preReveal);
  const markerPath = resolveProjectPath(projectRoot, "public/artifact-meta.json", {
    label: "source artifact marker",
    type: "file"
  });
  const marker = readJson(markerPath);
  const armId = options.armId ?? marker.arm;
  const arm = preReveal.arms.find((entry) => entry.id === armId);
  if (!arm) throw new Error(`pre-reveal contract has no arm ${armId}`);
  const identity = {
    runId: preReveal.runId,
    arm: armId,
    projectId: marker.projectId,
    artifactId: arm.artifactId
  };
  assertExactIdentity(marker, identity, "source artifact marker");
  const receiptPath = resolveProjectPath(projectRoot, "evidence/artifact-under-test.json", {
    label: "artifact receipt",
    type: "file"
  });
  const receipt = readJson(receiptPath);
  validateReceiptDocument(receipt);
  if (receipt.version !== "1.1.0") {
    throw new Error(`v1.2 verification requires artifact receipt 1.1.0; received ${receipt.version}`);
  }
  assertCanonicalIdentity(identityFromReceipt(receipt), identity, "receipt identity");
  for (const [name, record] of Object.entries(receipt.contracts)) {
    const file = resolveProjectPath(projectRoot, record.path, {
      label: `${name} contract`,
      type: "file"
    });
    if (sha256File(file) !== record.sha256) throw new Error(`${name} contract hash drift`);
  }
  if (sha256Tree(projectRoot, receipt.source.excluded) !== receipt.source.sha256) {
    throw new Error("source tree hash drift");
  }
  const distRoot = resolveProjectPath(projectRoot, receipt.build.outputPath, {
    label: "build output",
    type: "directory"
  });
  const distEntryPath = resolveProjectPath(projectRoot, `${receipt.build.outputPath}/index.html`, {
    label: "built entry",
    type: "file"
  });
  const distMarkerPath = resolveProjectPath(
    projectRoot,
    `${receipt.build.outputPath}/artifact-meta.json`,
    {
      label: "built artifact marker",
      type: "file"
    }
  );
  assertExactIdentity(readJson(distMarkerPath), identity, "built artifact marker");
  if (sha256Tree(distRoot) !== receipt.build.sha256) throw new Error("dist tree hash drift");

  const sealRoot = options.fixtureSealRoot ?? preReveal.seal.rootPath;
  assertExternalSealRoot(sealRoot, projectRoot, { mustExist: true });
  const sealPath = resolve(sealRoot, `${identity.artifactId}.seal.json`);
  if (!existsSync(sealPath)) throw new Error(`artifact seal is missing: ${sealPath}`);
  const seal = readJson(sealPath);
  validateArtifactSeal(seal);
  assertCanonicalIdentity(seal, identity, "artifact seal identity");
  if (seal.receipt.sha256 !== sha256File(receiptPath)) {
    throw new Error("artifact seal receipt hash mismatch");
  }
  if (seal.source.sha256 !== receipt.source.sha256 ||
      seal.build.sha256 !== receipt.build.sha256) {
    throw new Error("artifact seal product hash mismatch");
  }
  return {
    projectRoot,
    preRevealPath,
    preReveal,
    identity,
    markerPath,
    receiptPath,
    receipt,
    sealRoot,
    sealPath,
    seal,
    distRoot,
    distEntryPath,
    distMarkerPath
  };
}

export function freezeArtifactV12(values, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const projectRootArg = readArg(values, "--project-root");
  const preRevealArg = readArg(values, "--pre-reveal-contract");
  if (!projectRootArg) throw new Error("--project-root is required");
  if (!preRevealArg) throw new Error("--pre-reveal-contract is required for v1.2");
  const projectRoot = resolve(cwd, projectRootArg);
  const preRevealPath = resolve(cwd, preRevealArg);
  const preReveal = readJson(preRevealPath);
  validatePreRevealV11(preReveal);
  const preRevealSha256 = sha256ProtocolFile(preRevealPath);

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
  if (!options.fixtureSealRoot) {
    const portableProjectRoot = projectRoot.replaceAll("\\", "/");
    if (portableProjectRoot.toLowerCase() !== arm.workspaceRoot.toLowerCase()) {
      throw new Error(`project root must equal the pre-reveal ${armId} workspaceRoot`);
    }
  }

  const sealRoot = options.fixtureSealRoot ?? preReveal.seal.rootPath;
  const sealPath = resolve(sealRoot, `${identity.artifactId}.seal.json`);
  const receiptPath = resolveProjectPath(projectRoot, "evidence/artifact-under-test.json", {
    label: "artifact receipt",
    mustExist: false
  });

  if (values.includes("--seal-finalize")) {
    if (existsSync(sealPath)) {
      throw new Error(`artifact seal already exists: ${sealPath}`);
    }
    return finalizeSeal({
      projectRoot,
      preRevealPath,
      preReveal,
      preRevealSha256,
      markerPath,
      receiptPath,
      sealRoot,
      sealPath,
      identity
    });
  }
  if (existsSync(receiptPath)) {
    throw new Error("artifact receipt already exists; frozen artifacts cannot be rebuilt in place");
  }
  reserveArtifactSealClaim({
    sealRoot,
    projectRoot,
    identity
  });

  const contractPaths = Object.fromEntries(
    Object.entries(PRODUCT_CONTRACT_PATHS).map(([name, fallback]) => {
      const path = readArg(values, `--${toKebabCase(name)}`) ?? fallback;
      const absolutePath = resolveProjectPath(projectRoot, path, {
        label: `${name} contract`,
        type: "file"
      });
      return [name, { path: path.replaceAll("\\", "/"), absolutePath }];
    })
  );
  assertBlindRunIdentity(readJson(contractPaths.blindRun.absolutePath), identity);

  const entryRoute = readArg(values, "--entry-route") ?? "/";
  if (!/^\/(?!\/)\S*$/.test(entryRoute)) {
    throw new Error("--entry-route must be a same-origin path beginning with one slash");
  }

  const build = runNpm(["run", "build"], projectRoot);
  writeResult(build);
  if (build.status !== 0) {
    throw new Error(`build failed with exit code ${build.status ?? 1}; receipt was not written`);
  }
  if (existsSync(receiptPath)) {
    throw new Error("build wrote the reserved artifact receipt path; receipt was not accepted");
  }
  if (sha256ProtocolFile(preRevealPath) !== preRevealSha256) {
    throw new Error("pre-reveal contract changed during build");
  }
  assertExactIdentity(readJson(markerPath), identity, "source artifact marker after build");
  assertBlindRunIdentity(readJson(contractPaths.blindRun.absolutePath), identity);

  const distRoot = resolveProjectPath(projectRoot, "dist", {
    label: "build output",
    type: "directory"
  });
  resolveProjectPath(projectRoot, "dist/index.html", {
    label: "built entry",
    type: "file"
  });
  const distMarkerPath = resolveProjectPath(projectRoot, "dist/artifact-meta.json", {
    label: "built artifact marker",
    type: "file"
  });
  assertExactIdentity(readJson(distMarkerPath), identity, "built artifact marker");

  const receipt = {
    version: "1.1.0",
    artifactKind: "generated-product",
    ...identity,
    contracts: Object.fromEntries(
      Object.entries(contractPaths).map(([name, record]) => [
        name,
        {
          path: record.path,
          sha256: sha256File(record.absolutePath)
        }
      ])
    ),
    source: {
      root: ".",
      entry: "index.html",
      algorithm: "sha256-tree-v1",
      excluded: [...SOURCE_EXCLUSIONS],
      sha256: sha256Tree(projectRoot, SOURCE_EXCLUSIONS)
    },
    build: {
      script: "build",
      outputPath: "dist",
      exitCode: 0,
      sha256: sha256Tree(distRoot)
    },
    runtime: {
      script: "preview",
      entryRoute,
      identityPath: "/artifact-meta.json"
    },
    seal: {
      version: "1.0.0",
      rootId: preReveal.seal.rootId,
      key: identity.artifactId
    }
  };
  validateReceiptDocument(receipt);
  assertExactIdentity(identityFromReceipt(receipt), identity, "receipt identity");

  mkdirSync(dirname(receiptPath), { recursive: true });
  const temporaryReceipt = `${receiptPath}.tmp-${process.pid}`;
  writeFileSync(temporaryReceipt, stableDocumentBytes(receipt), "utf8");
  renameSync(temporaryReceipt, receiptPath);

  const seal = sealFromReceipt({
    receipt,
    receiptPath,
    preReveal,
    identity
  });
  const writtenSealPath = writeArtifactSealExclusive({
    sealRoot,
    projectRoot,
    seal
  });
  verifyTerminalState({
    projectRoot,
    markerPath,
    receiptPath,
    sealPath: writtenSealPath,
    identity
  });
  return {
    projectRoot,
    receiptPath,
    sealPath: writtenSealPath,
    receipt,
    seal
  };
}

function finalizeSeal(context) {
  if (!existsSync(context.receiptPath)) {
    throw new Error("seal-finalize requires the existing artifact receipt");
  }
  const receipt = readJson(context.receiptPath);
  validateReceiptDocument(receipt);
  if (receipt.version !== "1.1.0") {
    throw new Error(`seal-finalize requires artifact receipt 1.1.0; received ${receipt.version}`);
  }
  assertCanonicalIdentity(identityFromReceipt(receipt), context.identity, "receipt identity");
  if (sha256ProtocolFile(context.preRevealPath) !== context.preRevealSha256) {
    throw new Error("pre-reveal contract changed before seal-finalize");
  }
  assertExactIdentity(readJson(context.markerPath), context.identity, "source artifact marker");
  for (const [name, record] of Object.entries(receipt.contracts)) {
    const file = resolveProjectPath(context.projectRoot, record.path, {
      label: `${name} contract`,
      type: "file"
    });
    if (sha256File(file) !== record.sha256) throw new Error(`${name} contract hash drift`);
  }
  if (sha256Tree(context.projectRoot, receipt.source.excluded) !== receipt.source.sha256) {
    throw new Error("source tree hash drift before seal-finalize");
  }
  const distRoot = resolveProjectPath(context.projectRoot, receipt.build.outputPath, {
    label: "build output",
    type: "directory"
  });
  if (sha256Tree(distRoot) !== receipt.build.sha256) {
    throw new Error("dist tree hash drift before seal-finalize");
  }
  assertExactIdentity(
    readJson(resolveProjectPath(context.projectRoot, "dist/artifact-meta.json", {
      label: "built artifact marker",
      type: "file"
    })),
    context.identity,
    "built artifact marker"
  );

  const seal = sealFromReceipt({
    receipt,
    receiptPath: context.receiptPath,
    preReveal: context.preReveal,
    identity: context.identity
  });
  const writtenSealPath = writeArtifactSealExclusive({
    sealRoot: context.sealRoot,
    projectRoot: context.projectRoot,
    seal
  });
  verifyTerminalState({
    projectRoot: context.projectRoot,
    markerPath: context.markerPath,
    receiptPath: context.receiptPath,
    sealPath: writtenSealPath,
    identity: context.identity
  });
  return {
    projectRoot: context.projectRoot,
    receiptPath: context.receiptPath,
    sealPath: writtenSealPath,
    receipt,
    seal
  };
}

function sealFromReceipt({ receipt, receiptPath, preReveal, identity }) {
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

function verifyTerminalState({ projectRoot, markerPath, receiptPath, sealPath, identity }) {
  const receipt = readJson(receiptPath);
  const seal = readJson(sealPath);
  validateReceiptDocument(receipt);
  validateArtifactSeal(seal);
  assertCanonicalIdentity(identityFromReceipt(receipt), identity, "terminal receipt identity");
  assertCanonicalIdentity(seal, identity, "terminal seal identity");
  assertExactIdentity(readJson(markerPath), identity, "terminal source marker");
  if (seal.receipt.sha256 !== sha256File(receiptPath)) {
    throw new Error("terminal seal receipt hash mismatch");
  }
  if (seal.source.sha256 !== receipt.source.sha256 ||
      seal.build.sha256 !== receipt.build.sha256) {
    throw new Error("terminal seal product hash mismatch");
  }
}

function assertBlindRunIdentity(document, identity) {
  const actual = {
    runId: document.runId,
    arm: document.arm,
    projectId: document.projectId,
    artifactId: document.artifactId
  };
  assertCanonicalIdentity(actual, identity, "blind-run contract");
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
