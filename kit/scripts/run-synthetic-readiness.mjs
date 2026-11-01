import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const flowRunnerPath = resolve(scriptDir, "run-synthetic-flow-smoke.mjs");
const sourceExclusions = [
  ".git/",
  "node_modules/",
  "dist/",
  "evidence/",
  "test-results/",
  "vendor/",
  ".tmp*/",
  "*.tsbuildinfo"
];
const runnerVersion = "1.0.0";

export async function runSyntheticReadiness({
  workspace,
  inputDir,
  arm,
  cycle,
  evidenceDir,
  commandTimeoutMs = 120_000,
  previewTimeoutMs = 15_000,
  flowTimeoutMs = 15_000
}) {
  const absoluteWorkspace = resolveRequiredDirectory(workspace, "workspace");
  const absoluteInputDir = resolveRequiredDirectory(inputDir, "inputDir");
  const absoluteEvidenceDir = resolve(String(evidenceDir ?? ""));
  if (!evidenceDir) throw new Error("evidenceDir is required");
  if (!["consumer", "control"].includes(arm)) throw new Error("arm must be consumer or control");
  const cycleNumber = Number(cycle);
  if (!Number.isInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > 3) {
    throw new Error("cycle must be an integer from 1 through 3");
  }
  assertNoPathOverlap(absoluteWorkspace, absoluteEvidenceDir, "workspace and evidenceDir");
  assertNoPathOverlap(absoluteInputDir, absoluteEvidenceDir, "inputDir and evidenceDir");
  reserveDirectory(absoluteEvidenceDir);

  const startedAtUtc = new Date().toISOString();
  const failureEvents = [];
  const inputContext = verifySyntheticInputs(absoluteInputDir, arm);
  verifyWorkspaceInputs(absoluteWorkspace, absoluteInputDir, inputContext, arm);
  verifyProductOwnsNoFlowAssertions(absoluteWorkspace);
  copyInputEvidence(absoluteInputDir, resolve(absoluteEvidenceDir, "inputs"));

  const sourceSnapshotRoot = resolve(absoluteEvidenceDir, "workspace/source");
  const sourceManifestPath = resolve(absoluteEvidenceDir, "workspace/source-manifest.json");
  const sourceManifest = snapshotTree({
    sourceRoot: absoluteWorkspace,
    snapshotRoot: sourceSnapshotRoot,
    manifestPath: sourceManifestPath,
    rootLabel: "source",
    excludeSourceOutputs: true
  });

  const stages = {
    typecheck: notRunCommandStage("typecheck has not run"),
    build: notRunCommandStage("build has not run"),
    preview: notRunPreviewStage("preview has not run"),
    flowSmoke: notRunFlowStage("flow smoke has not run")
  };
  let distManifestPath = null;
  let previewHandle = null;
  let previewFinalized = false;

  const packageDocument = readJson(resolve(absoluteWorkspace, "package.json"));
  for (const requiredScript of ["typecheck", "build", "preview"]) {
    if (typeof packageDocument.scripts?.[requiredScript] !== "string") {
      throw new Error(`generated product package.json omits ${requiredScript} script`);
    }
  }

  const typecheckInvocation = npmScriptInvocation("typecheck");
  const typecheckCommand = await runCapturedCommand({
    stage: "typecheck",
    executable: typecheckInvocation.executable,
    args: typecheckInvocation.args,
    cwd: absoluteWorkspace,
    evidenceRoot: absoluteEvidenceDir,
    commandDirectory: "commands/01-typecheck",
    timeoutMs: commandTimeoutMs
  });
  stages.typecheck = commandStageFrom(typecheckCommand);
  if (stages.typecheck.status !== "passed") {
    failureEvents.push(failure("typecheck", "typecheck", commandFailureMessage(typecheckCommand)));
  }

  const buildInvocation = npmScriptInvocation("build");
  const buildCommand = await runCapturedCommand({
    stage: "build",
    executable: buildInvocation.executable,
    args: buildInvocation.args,
    cwd: absoluteWorkspace,
    evidenceRoot: absoluteEvidenceDir,
    commandDirectory: "commands/02-build",
    timeoutMs: commandTimeoutMs
  });
  stages.build = commandStageFrom(buildCommand);
  if (stages.build.status !== "passed") {
    failureEvents.push(failure("build", "build", commandFailureMessage(buildCommand)));
  }

  const sourceAfterBuild = buildTreeManifest({
    root: absoluteWorkspace,
    rootLabel: "source",
    excludeSourceOutputs: true
  });
  if (sourceAfterBuild.treeSha256 !== sourceManifest.treeSha256) {
    stages.build.status = "failed";
    stages.build.reason = "source tree changed during readiness commands";
    failureEvents.push(failure("source-drift", "build", stages.build.reason));
  }

  if (buildCommand.status === "passed" && existsSync(resolve(absoluteWorkspace, "dist"))) {
    const distSnapshotRoot = resolve(absoluteEvidenceDir, "workspace/dist");
    distManifestPath = resolve(absoluteEvidenceDir, "workspace/dist-manifest.json");
    snapshotTree({
      sourceRoot: resolve(absoluteWorkspace, "dist"),
      snapshotRoot: distSnapshotRoot,
      manifestPath: distManifestPath,
      rootLabel: "dist",
      excludeSourceOutputs: false
    });
  }

  if (stages.build.status === "passed") {
    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const previewCommand = resolvePreviewCommand(absoluteWorkspace, port);
    stages.preview = {
      status: "failed",
      commandEvidence: null,
      baseUrl,
      identity: notRunCheck("identity check has not run"),
      entry: notRunCheck("entry check has not run"),
      shutdown: notRunShutdown("preview shutdown has not run"),
      reason: null
    };
    try {
      previewHandle = startCapturedCommand({
        stage: "preview",
        executable: previewCommand.executable,
        args: previewCommand.args,
        cwd: absoluteWorkspace,
        evidenceRoot: absoluteEvidenceDir,
        commandDirectory: "commands/03-preview"
      });

      const identityCheck = await fetchPreviewEvidence({
        url: new URL(inputContext.contract.entry.identityPath, baseUrl).href,
        handle: previewHandle,
        timeoutMs: previewTimeoutMs,
        outputPath: resolve(absoluteEvidenceDir, "preview/identity-response.json"),
        evidenceRoot: absoluteEvidenceDir
      });
      stages.preview.identity = identityCheck.stage;
      if (identityCheck.stage.status === "passed") {
        try {
          const observed = JSON.parse(identityCheck.bytes.toString("utf8"));
          assertDeepEqual(observed, inputContext.identity, "runtime artifact identity");
          if (!identityCheck.bytes.equals(inputContext.identityBytes)) {
            throw new Error("runtime identity bytes differ from frozen identity input");
          }
        } catch (error) {
          stages.preview.identity.status = "failed";
          stages.preview.identity.reason = error instanceof Error ? error.message : String(error);
        }
      }
      if (stages.preview.identity.status !== "passed") {
        failureEvents.push(
          failure("preview-identity", "preview", stages.preview.identity.reason ?? "identity check failed")
        );
      }

      const entryCheck = await fetchPreviewEvidence({
        url: new URL(inputContext.contract.entry.route, baseUrl).href,
        handle: previewHandle,
        timeoutMs: previewTimeoutMs,
        outputPath: resolve(absoluteEvidenceDir, "preview/entry-response.html"),
        evidenceRoot: absoluteEvidenceDir
      });
      stages.preview.entry = entryCheck.stage;
      if (entryCheck.stage.status === "passed") {
        const distEntryPath = resolve(absoluteWorkspace, "dist/index.html");
        if (!existsSync(distEntryPath)) {
          stages.preview.entry.status = "failed";
          stages.preview.entry.reason = "dist/index.html is missing";
        } else if (sha256(entryCheck.bytes) !== sha256(readFileSync(distEntryPath))) {
          stages.preview.entry.status = "failed";
          stages.preview.entry.reason = "runtime entry bytes differ from dist/index.html";
        }
      }
      if (stages.preview.entry.status !== "passed") {
        failureEvents.push(
          failure("preview-entry", "preview", stages.preview.entry.reason ?? "entry check failed")
        );
      }

      if (stages.preview.identity.status === "passed" && stages.preview.entry.status === "passed") {
        const flowResultPath = resolve(absoluteEvidenceDir, "flow/result.json");
        mkdirSync(dirname(flowResultPath), { recursive: true });
        const copiedContractPath = resolve(absoluteEvidenceDir, "inputs/semantic-contract.json");
        const flowCommand = await runCapturedCommand({
          stage: "flow-smoke",
          executable: process.execPath,
          args: [
            flowRunnerPath,
            "--base-url",
            baseUrl,
            "--contract",
            copiedContractPath,
            "--contract-sha256",
            inputContext.contractSha256,
            "--out",
            flowResultPath,
            "--timeout-ms",
            String(flowTimeoutMs)
          ],
          cwd: kitRoot,
          evidenceRoot: absoluteEvidenceDir,
          commandDirectory: "commands/04-flow-smoke",
          timeoutMs: commandTimeoutMs
        });
        const flowResultReceipt = existsSync(flowResultPath)
          ? receiptForFile(absoluteEvidenceDir, flowResultPath)
          : null;
        stages.flowSmoke = {
          status: flowCommand.status,
          commandEvidence: flowCommand.commandReceipt,
          result: flowResultReceipt,
          reason: flowCommand.status === "passed" ? null : commandFailureMessage(flowCommand)
        };
        if (stages.flowSmoke.status !== "passed") {
          failureEvents.push(failure("flow-smoke", "flowSmoke", stages.flowSmoke.reason));
        }
      } else {
        stages.flowSmoke = notRunFlowStage("identity and entry must pass before flow smoke");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!failureEvents.some((item) => item.firstFailureStage === "preview")) {
        failureEvents.push(failure("preview-start", "preview", message));
      }
      stages.preview.reason = message;
    } finally {
      if (previewHandle) {
        const shutdown = await stopPreview(previewHandle, stages.preview.baseUrl, previewTimeoutMs);
        previewFinalized = true;
        stages.preview.commandEvidence = shutdown.command.commandReceipt;
        stages.preview.shutdown = shutdown.stage;
        if (shutdown.stage.status !== "passed") {
          failureEvents.push(failure("preview-shutdown", "shutdown", shutdown.stage.reason));
        }
      }
      stages.preview.status =
        stages.preview.identity.status === "passed" &&
        stages.preview.entry.status === "passed" &&
        stages.preview.shutdown.status === "passed"
          ? "passed"
          : "failed";
      if (stages.preview.status === "failed" && !stages.preview.reason) {
        stages.preview.reason = firstPreviewFailureReason(stages.preview);
      }
    }
  } else {
    stages.preview = notRunPreviewStage("build stage must pass before preview");
    stages.flowSmoke = notRunFlowStage("preview stage must run before flow smoke");
  }

  if (previewHandle && !previewFinalized) {
    await stopPreview(previewHandle, stages.preview.baseUrl, previewTimeoutMs);
  }

  const sourceAtStop = buildTreeManifest({
    root: absoluteWorkspace,
    rootLabel: "source",
    excludeSourceOutputs: true
  });
  if (sourceAtStop.treeSha256 !== sourceManifest.treeSha256) {
    if (stages.build.status === "passed") {
      stages.build.status = "failed";
      stages.build.reason = "source tree changed after the frozen source snapshot";
    }
    if (!failureEvents.some((item) => item.category === "source-drift")) {
      failureEvents.push(failure("source-drift", "build", "source tree changed after the frozen source snapshot"));
    }
  }

  const metrics = {
    typecheckPass: stages.typecheck.status === "passed",
    buildPass: stages.build.status === "passed",
    flowSmokePass: stages.flowSmoke.status === "passed",
    previewIdentityPass: stages.preview.status === "passed"
  };
  const allPassed = Object.values(metrics).every(Boolean);
  const summary = {
    $schema: "../../../../schema/synthetic-readiness-summary.schema.json",
    version: "1.0.0",
    harnessMode: "synthetic-generation-readiness",
    runId: inputContext.identity.runId,
    profileId: inputContext.manifest.request.profileId,
    seed: inputContext.manifest.request.seed,
    arm,
    cycle: cycleNumber,
    qualifying: false,
    scoring: false,
    workspace: {
      path: absoluteWorkspace.replaceAll("\\", "/"),
      sourceManifest: receiptForFile(absoluteEvidenceDir, sourceManifestPath),
      distManifest: distManifestPath ? receiptForFile(absoluteEvidenceDir, distManifestPath) : null
    },
    inputs: {
      syntheticManifest: receiptForFile(absoluteEvidenceDir, resolve(absoluteEvidenceDir, "inputs/manifest.json")),
      semanticContract: receiptForFile(
        absoluteEvidenceDir,
        resolve(absoluteEvidenceDir, "inputs/semantic-contract.json")
      ),
      artifactIdentity: receiptForFile(
        absoluteEvidenceDir,
        resolve(absoluteEvidenceDir, `inputs/${arm}-artifact-identity.json`)
      )
    },
    metrics,
    stages,
    status: allPassed ? "passed" : "failed",
    failure: allPassed ? null : failureEvents[0] ?? failure("build", "build", "readiness metrics did not all pass"),
    startedAtUtc,
    stoppedAtUtc: new Date().toISOString()
  };
  const summaryPath = resolve(absoluteEvidenceDir, "readiness-summary.json");
  writeFileSync(summaryPath, canonicalJsonBytes(summary), { flag: "wx" });
  return { summary, summaryPath };
}

function verifySyntheticInputs(inputDir, arm) {
  const manifestBytes = readFileSync(resolve(inputDir, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.qualifying !== false || manifest.scoring !== false) {
    throw new Error("synthetic input manifest must remain non-qualifying and non-scoring");
  }
  for (const [name, receipt] of Object.entries(manifest.files ?? {})) {
    const path = resolve(inputDir, name);
    const bytes = readFileSync(path);
    assertEqual(bytes.length, receipt.bytes, `${name} input bytes`);
    assertEqual(sha256(bytes), receipt.sha256, `${name} input SHA-256`);
  }
  const contractBytes = readFileSync(resolve(inputDir, "semantic-contract.json"));
  const contract = JSON.parse(contractBytes.toString("utf8"));
  const contractSha256 = sha256(contractBytes);
  assertEqual(contract.owner, "blind-readiness-harness", "semantic contract owner");
  assertEqual(contract.source.manifestSha256, sha256(manifestBytes), "semantic contract manifest binding");
  assertEqual(
    contract.source.prdSha256,
    manifest.files["synthetic-prd.md"].sha256,
    "semantic contract PRD binding"
  );
  const identityName = `${arm}-artifact-identity.json`;
  const identityBytes = readFileSync(resolve(inputDir, identityName));
  const identity = JSON.parse(identityBytes.toString("utf8"));
  assertEqual(identity.arm, arm, "artifact identity arm");
  assertEqual(identity.projectId, manifest.projectId, "artifact identity projectId");
  return { manifest, manifestBytes, contract, contractBytes, contractSha256, identity, identityBytes };
}

function verifyWorkspaceInputs(workspace, inputDir, context, arm) {
  const requiredCopies = [
    "synthetic-prd.md",
    "project-description.json",
    "sample-pack.json",
    "semantic-contract.json"
  ];
  for (const name of requiredCopies) {
    const expected = readFileSync(resolve(inputDir, name));
    const actual = readFileSync(resolve(workspace, name));
    if (!expected.equals(actual)) throw new Error(`workspace ${name} differs from frozen synthetic input`);
  }
  const expectedContext = readFileSync(resolve(inputDir, `${arm}-business-context.json`));
  const actualContext = readFileSync(resolve(workspace, "business-context.json"));
  if (!expectedContext.equals(actualContext)) throw new Error("workspace business-context.json differs from arm input");
  const workspaceIdentity = readFileSync(resolve(workspace, "artifact-identity.json"));
  if (!workspaceIdentity.equals(context.identityBytes)) {
    throw new Error("workspace artifact-identity.json differs from frozen arm identity");
  }
  const publicIdentity = readFileSync(resolve(workspace, "public/artifact-meta.json"));
  if (!publicIdentity.equals(context.identityBytes)) {
    throw new Error("public/artifact-meta.json differs from frozen arm identity");
  }
  if (arm === "consumer") {
    const packageReceipt = readJson(resolve(workspace, "consumer-package-receipt.json"));
    if (packageReceipt.purpose !== "synthetic-generation-readiness") {
      throw new Error("consumer package receipt has an unexpected purpose");
    }
    const workspacePackPath = resolve(workspace, "vendor", basename(packageReceipt.frozenPack.path));
    const workspacePack = readFileSync(workspacePackPath);
    assertEqual(workspacePack.length, packageReceipt.frozenPack.bytes, "consumer package bytes");
    assertEqual(sha256(workspacePack), packageReceipt.frozenPack.sha256, "consumer package SHA-256");
  } else {
    if (existsSync(resolve(workspace, "consumer-package-receipt.json")) || existsSync(resolve(workspace, "vendor"))) {
      throw new Error("control workspace must not contain the consumer package or its receipt");
    }
  }
}

function verifyProductOwnsNoFlowAssertions(workspace) {
  const packageDocument = readJson(resolve(workspace, "package.json"));
  for (const [name, command] of Object.entries(packageDocument.scripts ?? {})) {
    if (/flow/i.test(name) || /\b(vitest|jest|playwright)\b/i.test(String(command))) {
      throw new Error(`product-owned assertion script is prohibited: ${name}`);
    }
  }
  for (const path of listTreeFiles(workspace, true)) {
    if (/(?:^|\/)(?:test-flow|.*\.flow\.(?:test|spec)|.*\.(?:test|spec))\.[cm]?[jt]sx?$/i.test(path)) {
      throw new Error(`product-owned assertion file is prohibited: ${path}`);
    }
  }
}

function copyInputEvidence(inputDir, destination) {
  if (existsSync(destination)) throw new Error(`input evidence destination already exists: ${destination}`);
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(inputDir, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error(`synthetic input directory must contain files only: ${entry.name}`);
    copyFileSync(resolve(inputDir, entry.name), resolve(destination, entry.name));
  }
}

function snapshotTree({ sourceRoot, snapshotRoot, manifestPath, rootLabel, excludeSourceOutputs }) {
  if (existsSync(snapshotRoot)) throw new Error(`snapshot root already exists: ${snapshotRoot}`);
  mkdirSync(snapshotRoot, { recursive: true });
  const manifest = buildTreeManifest({ root: sourceRoot, rootLabel, excludeSourceOutputs });
  for (const file of manifest.files) {
    const from = resolve(sourceRoot, file.path);
    const to = resolve(snapshotRoot, file.path);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, canonicalJsonBytes(manifest), { flag: "wx" });
  return manifest;
}

function buildTreeManifest({ root, rootLabel, excludeSourceOutputs }) {
  const files = listTreeFiles(root, excludeSourceOutputs).map((path) => {
    const bytes = readFileSync(resolve(root, path));
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const treeSha256 = sha256(
    Buffer.from(files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join("\n"), "utf8")
  );
  return {
    $schema: "../../../schema/synthetic-tree-manifest.schema.json",
    version: "1.0.0",
    algorithm: "sha256-path-bytes-v1",
    rootLabel,
    excluded: excludeSourceOutputs ? sourceExclusions : [],
    files,
    treeSha256
  };
}

function listTreeFiles(root, excludeSourceOutputs) {
  const files = [];
  walk(root, "");
  return files.sort();

  function walk(current, portableParent) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const portable = portableParent ? `${portableParent}/${entry.name}` : entry.name;
      if (excludeSourceOutputs && shouldExcludeSource(portable, entry)) continue;
      const absolute = resolve(current, entry.name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`tree snapshot rejects symbolic link: ${portable}`);
      if (entry.isDirectory()) walk(absolute, portable);
      else if (entry.isFile()) files.push(portable);
      else throw new Error(`tree snapshot rejects non-file entry: ${portable}`);
    }
  }
}

function shouldExcludeSource(portable, entry) {
  const top = portable.split("/")[0];
  if (entry.isDirectory() && [".git", "node_modules", "dist", "evidence", "test-results", "vendor"].includes(top)) {
    return true;
  }
  if (entry.isDirectory() && top.startsWith(".tmp")) return true;
  return entry.isFile() && portable.endsWith(".tsbuildinfo");
}

function resolvePreviewCommand(workspace, port) {
  const vitePath = resolve(workspace, "node_modules/vite/bin/vite.js");
  if (!existsSync(vitePath)) throw new Error("generated workspace does not contain node_modules/vite/bin/vite.js");
  return {
    executable: process.execPath,
    args: [vitePath, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"]
  };
}

function npmScriptInvocation(scriptName) {
  if (process.platform !== "win32") {
    return { executable: "npm", args: ["run", scriptName] };
  }
  return {
    executable: process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", `npm run ${scriptName}`]
  };
}

async function runCapturedCommand(options) {
  const handle = startCapturedCommand(options);
  let exit = await waitWithTimeout(handle.exitPromise, options.timeoutMs);
  let termination = "completed";
  let timedOut = false;
  if (!exit) {
    timedOut = true;
    termination = "timeout";
    handle.child.kill("SIGTERM");
    exit = await waitWithTimeout(handle.exitPromise, 5_000);
    if (!exit) {
      handle.child.kill("SIGKILL");
      exit = await waitWithTimeout(handle.exitPromise, 5_000);
    }
  }
  return finalizeCapturedCommand(handle, {
    exit: exit ?? { code: null, signal: null, spawnError: "process did not exit after timeout" },
    termination,
    timedOut,
    statusOverride: null
  });
}

function startCapturedCommand({ stage, executable, args, cwd, evidenceRoot, commandDirectory }) {
  const startedAtUtc = new Date().toISOString();
  const stdoutChunks = [];
  const stderrChunks = [];
  const commandRoot = resolve(evidenceRoot, commandDirectory);
  mkdirSync(commandRoot, { recursive: true });
  const child = spawn(executable, args, {
    cwd,
    env: { ...process.env },
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
  const handle = {
    stage,
    executable,
    args,
    cwd,
    evidenceRoot,
    commandRoot,
    commandDirectory,
    child,
    startedAtUtc,
    stdoutChunks,
    stderrChunks,
    exitPromise: null,
    exitResult: null,
    finalized: false
  };
  let settled = false;
  const exitPromise = new Promise((done) => {
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      handle.exitResult = { code: null, signal: null, spawnError: error.message };
      done(handle.exitResult);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      handle.exitResult = { code, signal, spawnError: null };
      done(handle.exitResult);
    });
  });
  handle.exitPromise = exitPromise;
  return handle;
}

function finalizeCapturedCommand(handle, { exit, termination, timedOut, statusOverride }) {
  if (handle.finalized) throw new Error(`command evidence already finalized: ${handle.stage}`);
  handle.finalized = true;
  const stdout = Buffer.concat(handle.stdoutChunks);
  const stderr = Buffer.concat(handle.stderrChunks);
  const stdoutPath = resolve(handle.commandRoot, "stdout.log");
  const stderrPath = resolve(handle.commandRoot, "stderr.log");
  writeFileSync(stdoutPath, stdout, { flag: "wx" });
  writeFileSync(stderrPath, stderr, { flag: "wx" });
  const passed =
    statusOverride ??
    (termination === "completed" && !timedOut && !exit.spawnError && exit.code === 0);
  const command = {
    $schema: "../../../../../schema/synthetic-command-evidence.schema.json",
    version: "1.0.0",
    stage: handle.stage,
    command: handle.executable,
    args: handle.args,
    cwd: handle.cwd.replaceAll("\\", "/"),
    startedAtUtc: handle.startedAtUtc,
    stoppedAtUtc: new Date().toISOString(),
    exitCode: exit.code,
    status: passed ? "passed" : "failed",
    termination,
    timedOut,
    terminationSignal: exit.signal,
    spawnError: exit.spawnError,
    stdout: { path: "stdout.log", bytes: stdout.length, sha256: sha256(stdout) },
    stderr: { path: "stderr.log", bytes: stderr.length, sha256: sha256(stderr) }
  };
  const commandPath = resolve(handle.commandRoot, "command.json");
  writeFileSync(commandPath, canonicalJsonBytes(command), { flag: "wx" });
  return {
    status: command.status,
    document: command,
    commandPath,
    commandReceipt: receiptForFile(handle.evidenceRoot, commandPath)
  };
}

async function stopPreview(handle, baseUrl, timeoutMs) {
  const earlyExit = handle.exitResult;
  const requestedAtUtc = new Date().toISOString();
  let exit = earlyExit;
  let processExited = Boolean(earlyExit);
  let reason = earlyExit ? "preview exited before shutdown was requested" : null;
  if (!earlyExit) {
    const killed = handle.child.kill("SIGTERM");
    if (!killed) reason = "preview process rejected SIGTERM";
    exit = await waitWithTimeout(handle.exitPromise, 5_000);
    processExited = Boolean(exit);
    if (!exit) {
      handle.child.kill("SIGKILL");
      exit = await waitWithTimeout(handle.exitPromise, 5_000);
      processExited = Boolean(exit);
      reason = reason ?? "preview required forced shutdown";
    }
  }
  const endpointUnavailable = await waitForEndpointUnavailable(baseUrl, Math.min(timeoutMs, 5_000));
  if (!endpointUnavailable) reason = reason ?? "preview endpoint remained reachable after shutdown";
  if (!processExited) reason = reason ?? "preview process did not exit";
  const passed = !earlyExit && processExited && endpointUnavailable && !reason;
  const command = finalizeCapturedCommand(handle, {
    exit: exit ?? { code: null, signal: null, spawnError: "preview process did not exit" },
    termination: "requested-shutdown",
    timedOut: false,
    statusOverride: passed
  });
  return {
    command,
    stage: {
      status: passed ? "passed" : "failed",
      requestedAtUtc,
      observedAtUtc: new Date().toISOString(),
      processExited,
      endpointUnavailable,
      reason: passed ? null : reason
    }
  };
}

async function fetchPreviewEvidence({ url, handle, timeoutMs, outputPath, evidenceRoot }) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    const earlyExit = handle.exitResult;
    if (earlyExit) {
      return {
        stage: {
          status: "failed",
          httpStatus: null,
          response: null,
          reason: `preview exited before ${url} became ready`
        },
        bytes: Buffer.alloc(0)
      };
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, bytes, { flag: "wx" });
      return {
        stage: {
          status: response.status === 200 ? "passed" : "failed",
          httpStatus: response.status,
          response: receiptForFile(evidenceRoot, outputPath),
          reason: response.status === 200 ? null : `preview returned HTTP ${response.status}`
        },
        bytes
      };
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  return {
    stage: {
      status: "failed",
      httpStatus: null,
      response: null,
      reason: `preview request timed out: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    },
    bytes: Buffer.alloc(0)
  };
}

async function waitForEndpointUnavailable(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(baseUrl, { signal: AbortSignal.timeout(500) });
    } catch {
      return true;
    }
    await delay(100);
  }
  return false;
}

function commandStageFrom(command) {
  return {
    status: command.status,
    commandEvidence: command.commandReceipt,
    reason: command.status === "passed" ? null : commandFailureMessage(command)
  };
}

function commandFailureMessage(command) {
  const evidence = command.document;
  if (evidence.spawnError) return `spawn error: ${evidence.spawnError}`;
  if (evidence.timedOut) return `${evidence.stage} command timed out`;
  return `${evidence.stage} command exited ${evidence.exitCode ?? "without an exit code"}`;
}

function notRunCommandStage(reason) {
  return { status: "not-run", commandEvidence: null, reason };
}

function notRunFlowStage(reason) {
  return { status: "not-run", commandEvidence: null, result: null, reason };
}

function notRunCheck(reason) {
  return { status: "not-run", httpStatus: null, response: null, reason };
}

function notRunShutdown(reason) {
  return {
    status: "not-run",
    requestedAtUtc: null,
    observedAtUtc: null,
    processExited: null,
    endpointUnavailable: null,
    reason
  };
}

function notRunPreviewStage(reason) {
  return {
    status: "not-run",
    commandEvidence: null,
    baseUrl: null,
    identity: notRunCheck(reason),
    entry: notRunCheck(reason),
    shutdown: notRunShutdown(reason),
    reason
  };
}

function firstPreviewFailureReason(preview) {
  return preview.identity.reason ?? preview.entry.reason ?? preview.shutdown.reason ?? "preview postconditions failed";
}

function failure(category, firstFailureStage, message) {
  return { category, firstFailureStage, message: message || `${category} failed` };
}

function receiptForFile(root, file) {
  const absoluteRoot = resolve(root);
  const absoluteFile = resolve(file);
  const portable = relative(absoluteRoot, absoluteFile).replaceAll("\\", "/");
  if (!portable || portable === ".." || portable.startsWith("../")) {
    throw new Error(`evidence receipt path escaped its root: ${absoluteFile}`);
  }
  const bytes = readFileSync(absoluteFile);
  return { path: portable, bytes: bytes.length, sha256: sha256(bytes) };
}

function reserveDirectory(path) {
  if (existsSync(path)) {
    if (!statSync(path).isDirectory()) throw new Error(`evidenceDir is not a directory: ${path}`);
    if (readdirSync(path).length > 0) throw new Error(`evidenceDir must be empty: ${path}`);
  }
  mkdirSync(path, { recursive: true });
}

function resolveRequiredDirectory(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  const path = resolve(value);
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`${label} does not exist: ${path}`);
  return path;
}

function assertNoPathOverlap(left, right, label) {
  if (isInside(left, right) || isInside(right, left) || left.toLowerCase() === right.toLowerCase()) {
    throw new Error(`${label} must not overlap`);
  }
}

function isInside(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  return value !== "" && value !== ".." && !value.startsWith(`..\\`) && !value.startsWith("../");
}

function assertDeepEqual(actual, expected, label) {
  const left = JSON.stringify(sortValue(actual));
  const right = JSON.stringify(sortValue(expected));
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function findFreePort() {
  return new Promise((done, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error("failed to reserve a local preview port"));
        else done(port);
      });
    });
  });
}

async function waitWithTimeout(promise, timeoutMs) {
  if (timeoutMs === 0) return null;
  let timer = null;
  const timeout = new Promise((done) => {
    timer = setTimeout(() => done(null), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function delay(milliseconds) {
  return new Promise((done) => setTimeout(done, milliseconds));
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) throw new Error(`unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSyntheticReadiness({
    workspace: options.workspace,
    inputDir: options.input,
    arm: options.arm,
    cycle: options.cycle,
    evidenceDir: options.evidence,
    commandTimeoutMs: options["command-timeout-ms"] ? Number(options["command-timeout-ms"]) : 120_000,
    previewTimeoutMs: options["preview-timeout-ms"] ? Number(options["preview-timeout-ms"]) : 15_000,
    flowTimeoutMs: options["flow-timeout-ms"] ? Number(options["flow-timeout-ms"]) : 15_000
  });
  console.log(
    `run-synthetic-readiness ${result.summary.status}: profile=${result.summary.profileId}; arm=${result.summary.arm}; cycle=${result.summary.cycle}; evidence=${result.summaryPath.replaceAll("\\", "/")}`
  );
  if (result.summary.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runCli();
  } catch (error) {
    console.error(`run-synthetic-readiness failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export const syntheticReadinessRunner = {
  version: runnerVersion,
  sourceExclusions
};
