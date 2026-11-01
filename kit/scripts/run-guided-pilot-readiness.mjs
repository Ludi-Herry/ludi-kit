import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
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
import { fileURLToPath } from "node:url";
import { runGuidedPilotFlowSmoke } from "./run-guided-pilot-flow-smoke.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const flowRunnerPath = resolve(scriptDir, "run-guided-pilot-flow-smoke.mjs");
const runnerVersion = "1.0.0";
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

export async function runGuidedPilotReadiness({
  workspace,
  evidenceDir,
  runId,
  artifactId,
  projectId,
  flowContractPath,
  commandTimeoutMs = 120_000,
  previewTimeoutMs = 15_000,
  flowTimeoutMs = 15_000
}) {
  const absoluteWorkspace = resolveRequiredDirectory(workspace, "workspace");
  const absoluteFlowContractPath = resolveRequiredFile(flowContractPath, "flowContractPath");
  if (typeof evidenceDir !== "string" || evidenceDir.trim() === "") {
    throw new Error("evidenceDir is required");
  }
  const absoluteEvidenceDir = resolve(evidenceDir);
  assertGuidedPilotIdentity({ runId, artifactId, projectId });
  assertNoPathOverlap(absoluteWorkspace, absoluteEvidenceDir, "workspace and evidenceDir");
  assertNoPathOverlap(absoluteWorkspace, absoluteFlowContractPath, "workspace and flowContractPath");
  assertNoPathOverlap(absoluteEvidenceDir, absoluteFlowContractPath, "evidenceDir and flowContractPath");
  reserveDirectory(absoluteEvidenceDir);

  const startedAtUtc = new Date().toISOString();
  const failureEvents = [];
  const stages = {
    typecheck: notRunCommandStage("typecheck has not run"),
    build: notRunCommandStage("build has not run"),
    preview: notRunPreviewStage("preview has not run"),
    flowSmoke: notRunFlowStage("flow smoke has not run")
  };
  let flowContractReceipt = null;
  let flowRunnerReceipt = null;
  let sourceManifestReceipt = null;
  let distManifestReceipt = null;
  let sourceManifest = null;
  let flowContext = null;
  let preflightReady = false;

  try {
    const flowContractBytes = readFileSync(absoluteFlowContractPath);
    const frozenFlowContractPath = resolve(absoluteEvidenceDir, "inputs/flow-contract.json");
    writeEvidenceFile(frozenFlowContractPath, flowContractBytes);
    flowContractReceipt = receiptForFile(absoluteEvidenceDir, frozenFlowContractPath);

    const flowRunnerBytes = readFileSync(flowRunnerPath);
    const frozenFlowRunnerPath = resolve(absoluteEvidenceDir, "flow/runner.mjs");
    writeEvidenceFile(frozenFlowRunnerPath, flowRunnerBytes);
    flowRunnerReceipt = receiptForFile(absoluteEvidenceDir, frozenFlowRunnerPath);
    stages.flowSmoke.runner = flowRunnerReceipt;
    stages.flowSmoke.contract = flowContractReceipt;

    flowContext = inspectFlowContract(flowContractBytes, projectId);
    verifyWorkspaceScripts(absoluteWorkspace);
    verifyProductOwnsNoAssertions(absoluteWorkspace);

    const sourceSnapshotRoot = resolve(absoluteEvidenceDir, "workspace/source");
    const sourceManifestPath = resolve(absoluteEvidenceDir, "workspace/source-manifest.json");
    sourceManifest = snapshotTree({
      sourceRoot: absoluteWorkspace,
      snapshotRoot: sourceSnapshotRoot,
      manifestPath: sourceManifestPath,
      rootLabel: "source",
      excludeSourceOutputs: true
    });
    sourceManifestReceipt = receiptForFile(absoluteEvidenceDir, sourceManifestPath);
    preflightReady = true;
  } catch (error) {
    const message = errorMessage(error);
    failureEvents.push(preflightFailure(message));
    stages.preview = notRunPreviewStage("readiness preflight failed");
    stages.flowSmoke = notRunFlowStage("readiness preflight failed", flowRunnerReceipt, flowContractReceipt);
  }

  if (preflightReady) {
    try {
      await runReadinessStages({
        workspace: absoluteWorkspace,
        evidenceDir: absoluteEvidenceDir,
        flowContext,
        flowContractReceipt,
        flowRunnerReceipt,
        sourceManifest,
        commandTimeoutMs,
        previewTimeoutMs,
        flowTimeoutMs,
        runId,
        artifactId,
        projectId,
        stages,
        failureEvents,
        setDistManifestReceipt(receipt) {
          distManifestReceipt = receipt;
        }
      });
    } catch (error) {
      const message = `readiness stage runner failed: ${errorMessage(error)}`;
      stages.preview = notRunPreviewStage(message);
      stages.flowSmoke = notRunFlowStage(message, flowRunnerReceipt, flowContractReceipt);
      failureEvents.push(failure("internal", "preflight", message));
    }
  }

  if (sourceManifest) {
    try {
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
        addFailureOnce(
          failureEvents,
          failure("source-drift", "build", "source tree changed after the frozen source snapshot")
        );
      }
    } catch (error) {
      if (stages.build.status === "passed") {
        stages.build.status = "failed";
        stages.build.reason = `source tree verification failed: ${errorMessage(error)}`;
      }
      addFailureOnce(
        failureEvents,
        failure("source-drift", "build", `source tree verification failed: ${errorMessage(error)}`)
      );
    }
  }

  const metrics = {
    typecheckPass: stages.typecheck.status === "passed",
    buildPass: stages.build.status === "passed",
    flowSmokePass: stages.flowSmoke.status === "passed",
    previewIdentityPass: stages.preview.status === "passed"
  };
  const allPassed = Object.values(metrics).every(Boolean);
  const result = {
    $schema: "https://ai-readable.local/schema/guided-pilot-readiness.schema.json",
    version: "1.0.0",
    harnessMode: "guided-pilot-readiness",
    runId,
    artifactId,
    projectId,
    workspace: {
      path: absoluteWorkspace.replaceAll("\\", "/"),
      sourceManifest: sourceManifestReceipt,
      distManifest: distManifestReceipt
    },
    inputs: {
      flowContract: flowContractReceipt,
      flowRunner: flowRunnerReceipt
    },
    metrics,
    stages,
    status: allPassed ? "passed" : "failed",
    failure: allPassed
      ? null
      : failureEvents[0] ?? failure("internal", "preflight", "readiness metrics did not all pass"),
    startedAtUtc,
    stoppedAtUtc: new Date().toISOString()
  };
  const resultPath = resolve(absoluteEvidenceDir, "result.json");
  writeFileSync(resultPath, canonicalJsonBytes(result), { flag: "wx" });
  return { result, resultPath };
}

async function runReadinessStages({
  workspace,
  evidenceDir,
  flowContext,
  flowContractReceipt,
  flowRunnerReceipt,
  sourceManifest,
  commandTimeoutMs,
  previewTimeoutMs,
  flowTimeoutMs,
  runId,
  artifactId,
  projectId,
  stages,
  failureEvents,
  setDistManifestReceipt
}) {
  try {
    const typecheckInvocation = npmScriptInvocation("typecheck");
    const typecheckCommand = await runCapturedCommand({
      stage: "typecheck",
      executable: typecheckInvocation.executable,
      args: typecheckInvocation.args,
      cwd: workspace,
      evidenceRoot: evidenceDir,
      commandDirectory: "commands/01-typecheck",
      timeoutMs: commandTimeoutMs
    });
    stages.typecheck = commandStageFrom(typecheckCommand);
    if (stages.typecheck.status !== "passed") {
      failureEvents.push(failure("typecheck", "typecheck", commandFailureMessage(typecheckCommand)));
    }
  } catch (error) {
    stages.typecheck = failedCommandStage(`typecheck runner failed: ${errorMessage(error)}`);
    failureEvents.push(failure("typecheck", "typecheck", stages.typecheck.reason));
  }

  let buildCommand = null;
  try {
    const buildInvocation = npmScriptInvocation("build");
    buildCommand = await runCapturedCommand({
      stage: "build",
      executable: buildInvocation.executable,
      args: buildInvocation.args,
      cwd: workspace,
      evidenceRoot: evidenceDir,
      commandDirectory: "commands/02-build",
      timeoutMs: commandTimeoutMs
    });
    stages.build = commandStageFrom(buildCommand);
    if (stages.build.status !== "passed") {
      failureEvents.push(failure("build", "build", commandFailureMessage(buildCommand)));
    }
  } catch (error) {
    stages.build = failedCommandStage(`build runner failed: ${errorMessage(error)}`);
    failureEvents.push(failure("build", "build", stages.build.reason));
  }

  try {
    const sourceAfterBuild = buildTreeManifest({
      root: workspace,
      rootLabel: "source",
      excludeSourceOutputs: true
    });
    if (sourceAfterBuild.treeSha256 !== sourceManifest.treeSha256) {
      stages.build.status = "failed";
      stages.build.reason = "source tree changed during readiness commands";
      addFailureOnce(failureEvents, failure("source-drift", "build", stages.build.reason));
    }
  } catch (error) {
    stages.build.status = "failed";
    stages.build.reason = `source tree verification failed: ${errorMessage(error)}`;
    addFailureOnce(failureEvents, failure("source-drift", "build", stages.build.reason));
  }

  if (buildCommand?.status === "passed") {
    const distRoot = resolve(workspace, "dist");
    if (!existsSync(distRoot) || !statSync(distRoot).isDirectory()) {
      stages.build.status = "failed";
      stages.build.reason = "dist directory is missing after build";
      addFailureOnce(failureEvents, failure("build", "build", stages.build.reason));
    } else {
      try {
        const distManifestPath = resolve(evidenceDir, "workspace/dist-manifest.json");
        snapshotTree({
          sourceRoot: distRoot,
          snapshotRoot: resolve(evidenceDir, "workspace/dist"),
          manifestPath: distManifestPath,
          rootLabel: "dist",
          excludeSourceOutputs: false
        });
        setDistManifestReceipt(receiptForFile(evidenceDir, distManifestPath));
      } catch (error) {
        stages.build.status = "failed";
        stages.build.reason = `dist snapshot failed: ${errorMessage(error)}`;
        addFailureOnce(failureEvents, failure("dist-snapshot", "build", stages.build.reason));
      }
    }
  }

  if (stages.build.status !== "passed") {
    stages.preview = notRunPreviewStage("build stage must pass before preview");
    stages.flowSmoke = notRunFlowStage(
      "preview stage must run before flow smoke",
      flowRunnerReceipt,
      flowContractReceipt
    );
    return;
  }

  const previewOutcome = await runPreviewAndFlow({
    workspace,
    evidenceDir,
    flowContext,
    flowContractReceipt,
    flowRunnerReceipt,
    previewTimeoutMs,
    flowTimeoutMs,
    runId,
    artifactId,
    projectId
  });
  stages.preview = previewOutcome.preview;
  stages.flowSmoke = previewOutcome.flowSmoke;
  failureEvents.push(...previewOutcome.failures);
}

async function runPreviewAndFlow({
  workspace,
  evidenceDir,
  flowContext,
  flowContractReceipt,
  flowRunnerReceipt,
  previewTimeoutMs,
  flowTimeoutMs,
  runId,
  artifactId,
  projectId
}) {
  const failures = [];
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const preview = {
    status: "failed",
    commandEvidence: null,
    baseUrl,
    identity: notRunCheck("identity check has not run"),
    entry: notRunCheck("entry check has not run"),
    shutdown: notRunShutdown("preview shutdown has not run"),
    reason: null
  };
  let flowSmoke = notRunFlowStage("identity and entry must pass before flow smoke", flowRunnerReceipt, flowContractReceipt);
  let previewHandle = null;
  let previewFinalized = false;

  try {
    const expectedIdentity = inspectExpectedArtifactIdentity(workspace, { runId, artifactId, projectId });
    const previewCommand = resolvePreviewCommand(workspace, port);
    previewHandle = startCapturedCommand({
      stage: "preview",
      executable: previewCommand.executable,
      args: previewCommand.args,
      cwd: workspace,
      evidenceRoot: evidenceDir,
      commandDirectory: "commands/03-preview"
    });

    const identityCheck = await fetchPreviewEvidence({
      url: new URL("/artifact-meta.json", baseUrl).href,
      handle: previewHandle,
      timeoutMs: previewTimeoutMs,
      outputPath: resolve(evidenceDir, "preview/identity-response.json"),
      evidenceRoot: evidenceDir
    });
    preview.identity = identityCheck.stage;
    if (preview.identity.status === "passed") {
      try {
        if (expectedIdentity.issue) throw new Error(expectedIdentity.issue);
        if (!identityCheck.bytes.equals(expectedIdentity.bytes)) {
          throw new Error("runtime artifact identity bytes differ from public/artifact-meta.json");
        }
        const observedIdentity = JSON.parse(identityCheck.bytes.toString("utf8"));
        assertArtifactIdentity(observedIdentity, { runId, artifactId, projectId }, "runtime artifact identity");
      } catch (error) {
        preview.identity.status = "failed";
        preview.identity.reason = errorMessage(error);
      }
    }
    if (preview.identity.status !== "passed") {
      failures.push(
        failure("preview-identity", "preview", preview.identity.reason ?? "identity check failed")
      );
    }

    const entryCheck = await fetchPreviewEvidence({
      url: new URL(flowContext.entryRoute, baseUrl).href,
      handle: previewHandle,
      timeoutMs: previewTimeoutMs,
      outputPath: resolve(evidenceDir, "preview/entry-response.html"),
      evidenceRoot: evidenceDir
    });
    preview.entry = entryCheck.stage;
    if (preview.entry.status === "passed") {
      try {
        const distEntryPath = resolve(workspace, "dist/index.html");
        if (!existsSync(distEntryPath)) throw new Error("dist/index.html is missing");
        if (!entryCheck.bytes.equals(readFileSync(distEntryPath))) {
          throw new Error("runtime entry bytes differ from dist/index.html");
        }
      } catch (error) {
        preview.entry.status = "failed";
        preview.entry.reason = errorMessage(error);
      }
    }
    if (preview.entry.status !== "passed") {
      failures.push(failure("preview-entry", "preview", preview.entry.reason ?? "entry check failed"));
    }

    if (preview.identity.status === "passed" && preview.entry.status === "passed") {
      const flowResultPath = resolve(evidenceDir, "flow/result.json");
      try {
        const flowResult = await runGuidedPilotFlowSmoke({
          baseUrl,
          contractPath: resolve(evidenceDir, "inputs/flow-contract.json"),
          expectedContractSha256: flowContractReceipt.sha256,
          outFile: flowResultPath,
          timeoutMs: flowTimeoutMs
        });
        const resultReceipt = existsSync(flowResultPath) ? receiptForFile(evidenceDir, flowResultPath) : null;
        if (!resultReceipt) throw new Error("guided pilot flow runner did not write a result");
        if (flowResult.status !== "passed") {
          flowSmoke = {
            status: "failed",
            runner: flowRunnerReceipt,
            contract: flowContractReceipt,
            result: resultReceipt,
            reason: flowResult.firstFailure?.message ?? "guided pilot flow smoke failed"
          };
          failures.push(failure("flow-smoke", "flowSmoke", flowSmoke.reason));
        } else {
          flowSmoke = {
            status: "passed",
            runner: flowRunnerReceipt,
            contract: flowContractReceipt,
            result: resultReceipt,
            reason: null
          };
        }
      } catch (error) {
        flowSmoke = {
          status: "failed",
          runner: flowRunnerReceipt,
          contract: flowContractReceipt,
          result: existsSync(flowResultPath) ? receiptForFile(evidenceDir, flowResultPath) : null,
          reason: errorMessage(error)
        };
        failures.push(failure("flow-smoke", "flowSmoke", flowSmoke.reason));
      }
    }
  } catch (error) {
    const message = errorMessage(error);
    preview.reason = message;
    if (!failures.some((item) => item.category === "preview-start")) {
      failures.push(failure("preview-start", "preview", message));
    }
  } finally {
    if (previewHandle) {
      try {
        const shutdown = await stopPreview(previewHandle, baseUrl, previewTimeoutMs);
        previewFinalized = true;
        preview.commandEvidence = shutdown.command.commandReceipt;
        preview.shutdown = shutdown.stage;
        if (shutdown.stage.status !== "passed") {
          failures.push(failure("preview-shutdown", "shutdown", shutdown.stage.reason));
        }
      } catch (error) {
        preview.shutdown = {
          status: "failed",
          requestedAtUtc: null,
          observedAtUtc: new Date().toISOString(),
          processExited: null,
          endpointUnavailable: null,
          reason: `preview shutdown failed: ${errorMessage(error)}`
        };
        failures.push(failure("preview-shutdown", "shutdown", preview.shutdown.reason));
      }
    }
    if (previewHandle && !previewFinalized) {
      try {
        await stopPreview(previewHandle, baseUrl, previewTimeoutMs);
      } catch {
        // A failed finalizer is already reflected in the shutdown stage above.
      }
    }
    preview.status =
      preview.identity.status === "passed" &&
      preview.entry.status === "passed" &&
      preview.shutdown.status === "passed"
        ? "passed"
        : "failed";
    if (preview.status === "failed" && !preview.reason) {
      preview.reason = firstPreviewFailureReason(preview);
    }
  }

  return { preview, flowSmoke, failures };
}

function inspectFlowContract(bytes, projectId) {
  let contract;
  try {
    contract = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`flow contract JSON is invalid: ${errorMessage(error)}`);
  }
  if (contract?.projectId !== projectId) {
    throw new Error(`flow contract projectId must equal ${projectId}`);
  }
  if (typeof contract?.entry?.route !== "string") {
    throw new Error("flow contract entry.route is required");
  }
  if (contract.entry.identityPath !== "/artifact-meta.json") {
    throw new Error("flow contract entry.identityPath must be /artifact-meta.json");
  }
  return { entryRoute: contract.entry.route };
}

function inspectExpectedArtifactIdentity(workspace, expected) {
  const path = resolve(workspace, "public/artifact-meta.json");
  let bytes = null;
  try {
    bytes = readFileSync(path);
    const document = JSON.parse(bytes.toString("utf8"));
    assertArtifactIdentity(document, expected, "public artifact identity");
    return { bytes, issue: null };
  } catch (error) {
    return { bytes, issue: errorMessage(error) };
  }
}

function assertArtifactIdentity(identity, expected, label) {
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    throw new Error(`${label} must be a JSON object`);
  }
  for (const [name, value] of Object.entries(expected)) {
    if (identity[name] !== value) {
      throw new Error(`${label} ${name} must equal ${value}`);
    }
  }
}

function verifyWorkspaceScripts(workspace) {
  const packageDocument = readJson(resolve(workspace, "package.json"));
  for (const requiredScript of ["typecheck", "build", "preview"]) {
    if (typeof packageDocument.scripts?.[requiredScript] !== "string") {
      throw new Error(`workspace package.json omits ${requiredScript} script`);
    }
  }
}

function verifyProductOwnsNoAssertions(workspace) {
  const packageDocument = readJson(resolve(workspace, "package.json"));
  for (const [name, command] of Object.entries(packageDocument.scripts ?? {})) {
    if (
      /(?:test|playwright|flow)/i.test(name) ||
      /\b(?:vitest|jest|playwright)\b/i.test(String(command)) ||
      /(?:^|\s)(?:node|tsx)\s+\S*(?:flow|test|spec|playwright)\S*/i.test(String(command))
    ) {
      throw new Error(`product-owned assertion script is prohibited: ${name}`);
    }
  }
  for (const path of listTreeFiles(workspace, true)) {
    if (
      /(?:^|\/)(?:tests?|playwright)(?:\/|$)/i.test(path) ||
      /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(path) ||
      /^scripts\/.*(?:flow|playwright|test).*\.[cm]?[jt]sx?$/i.test(path) ||
      /(?:^|\/)playwright\.config\.[cm]?[jt]s$/i.test(path)
    ) {
      throw new Error(`product-owned assertion file is prohibited: ${path}`);
    }
  }
}

function snapshotTree({ sourceRoot, snapshotRoot, manifestPath, rootLabel, excludeSourceOutputs }) {
  if (existsSync(snapshotRoot)) throw new Error(`snapshot root already exists: ${snapshotRoot}`);
  const manifest = buildTreeManifest({ root: sourceRoot, rootLabel, excludeSourceOutputs });
  mkdirSync(snapshotRoot, { recursive: true });
  for (const file of manifest.files) {
    const from = resolve(sourceRoot, file.path);
    const to = resolve(snapshotRoot, file.path);
    writeEvidenceFile(to, readFileSync(from));
  }
  writeEvidenceFile(manifestPath, canonicalJsonBytes(manifest));
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
    $schema: "https://ai-readable.local/schema/guided-pilot-tree-manifest.schema.json",
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
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    for (const entry of entries) {
      const portable = portableParent ? `${portableParent}/${entry.name}` : entry.name;
      const absolute = resolve(current, entry.name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`tree snapshot rejects symbolic link: ${portable}`);
      if (excludeSourceOutputs && shouldExcludeSource(portable, stat.isDirectory())) continue;
      if (stat.isDirectory()) walk(absolute, portable);
      else if (stat.isFile()) files.push(portable);
      else throw new Error(`tree snapshot rejects non-file entry: ${portable}`);
    }
  }
}

function shouldExcludeSource(portable, isDirectory) {
  const segments = portable.split("/");
  const top = segments[0];
  if (isDirectory && [".git", "node_modules", "dist", "evidence", "test-results", "vendor"].includes(top)) {
    return true;
  }
  if (isDirectory && segments.some((segment) => segment.startsWith(".tmp"))) return true;
  return !isDirectory && portable.endsWith(".tsbuildinfo");
}

function resolvePreviewCommand(workspace, port) {
  const vitePath = resolve(workspace, "node_modules/vite/bin/vite.js");
  if (!existsSync(vitePath) || !lstatSync(vitePath).isFile()) {
    throw new Error("workspace does not contain node_modules/vite/bin/vite.js");
  }
  return {
    executable: process.execPath,
    args: [vitePath, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"]
  };
}

function npmScriptInvocation(scriptName) {
  if (process.platform !== "win32") return { executable: "npm", args: ["run", scriptName] };
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
  const commandRoot = resolve(evidenceRoot, commandDirectory);
  mkdirSync(commandRoot, { recursive: true });
  const child = spawn(executable, args, {
    cwd,
    env: { ...process.env },
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const handle = {
    stage,
    executable,
    args,
    cwd,
    evidenceRoot,
    commandRoot,
    child,
    startedAtUtc: new Date().toISOString(),
    stdoutChunks: [],
    stderrChunks: [],
    exitPromise: null,
    exitResult: null,
    finalized: false
  };
  child.stdout?.on("data", (chunk) => handle.stdoutChunks.push(Buffer.from(chunk)));
  child.stderr?.on("data", (chunk) => handle.stderrChunks.push(Buffer.from(chunk)));
  let settled = false;
  handle.exitPromise = new Promise((done) => {
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
  return handle;
}

function finalizeCapturedCommand(handle, { exit, termination, timedOut, statusOverride }) {
  if (handle.finalized) throw new Error(`command evidence already finalized: ${handle.stage}`);
  handle.finalized = true;
  const stdout = Buffer.concat(handle.stdoutChunks);
  const stderr = Buffer.concat(handle.stderrChunks);
  const stdoutPath = resolve(handle.commandRoot, "stdout.log");
  const stderrPath = resolve(handle.commandRoot, "stderr.log");
  writeEvidenceFile(stdoutPath, stdout);
  writeEvidenceFile(stderrPath, stderr);
  const passed =
    statusOverride ??
    (termination === "completed" && !timedOut && !exit.spawnError && exit.code === 0);
  const command = {
    $schema: "guided-pilot-command-receipt.v1",
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
  writeEvidenceFile(commandPath, canonicalJsonBytes(command));
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
  if (!processExited) reason = reason ?? "preview process did not exit";
  if (!endpointUnavailable) reason = reason ?? "preview endpoint remained reachable after shutdown";
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
    if (handle.exitResult) {
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
      writeEvidenceFile(outputPath, bytes);
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
      reason: `preview request timed out: ${errorMessage(lastError)}`
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

function failedCommandStage(reason) {
  return { status: "failed", commandEvidence: null, reason };
}

function notRunCommandStage(reason) {
  return { status: "not-run", commandEvidence: null, reason };
}

function notRunFlowStage(reason, runner = null, contract = null) {
  return { status: "not-run", runner, contract, result: null, reason };
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

function preflightFailure(message) {
  if (message.startsWith("product-owned assertion")) {
    return failure("product-owned-assertion", "preflight", message);
  }
  if (message.startsWith("flow contract")) return failure("flow-contract", "preflight", message);
  return failure("workspace-validation", "preflight", message);
}

function addFailureOnce(events, candidate) {
  if (!events.some((event) => event.category === candidate.category)) events.push(candidate);
}

function receiptForFile(root, file) {
  const absoluteRoot = resolve(root);
  const absoluteFile = resolve(file);
  const portable = relative(absoluteRoot, absoluteFile).replaceAll("\\", "/");
  if (!portable || portable === ".." || portable.startsWith("../") || isAbsolute(portable)) {
    throw new Error(`evidence receipt path escaped its root: ${absoluteFile}`);
  }
  const bytes = readFileSync(absoluteFile);
  return { path: portable, bytes: bytes.length, sha256: sha256(bytes) };
}

function writeEvidenceFile(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: "wx" });
}

function reserveDirectory(path) {
  if (existsSync(path)) {
    if (lstatSync(path).isSymbolicLink()) throw new Error(`evidenceDir must not be a symbolic link: ${path}`);
    if (!statSync(path).isDirectory()) throw new Error(`evidenceDir is not a directory: ${path}`);
    if (readdirSync(path).length > 0) throw new Error(`evidenceDir must be empty: ${path}`);
  }
  mkdirSync(path, { recursive: true });
}

function resolveRequiredDirectory(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  const path = resolve(value);
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`);
  if (lstatSync(path).isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  if (!statSync(path).isDirectory()) throw new Error(`${label} does not exist: ${path}`);
  return path;
}

function resolveRequiredFile(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  const path = resolve(value);
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  if (!stat.isFile()) throw new Error(`${label} does not exist: ${path}`);
  return path;
}

function assertGuidedPilotIdentity({ runId, artifactId, projectId }) {
  if (typeof runId !== "string" || !/^guided-pilot-[a-z0-9][a-z0-9-]*$/.test(runId)) {
    throw new Error("runId must be a guided-pilot identifier");
  }
  if (
    typeof artifactId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(artifactId)
  ) {
    throw new Error("artifactId must be a UUID v4");
  }
  if (typeof projectId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(projectId)) {
    throw new Error("projectId must be a lowercase project identifier");
  }
}

function assertNoPathOverlap(left, right, label) {
  if (left.toLowerCase() === right.toLowerCase() || isInside(left, right) || isInside(right, left)) {
    throw new Error(`${label} must not overlap`);
  }
}

function isInside(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  return value !== "" && value !== ".." && !value.startsWith(`..\\`) && !value.startsWith("../") && !isAbsolute(value);
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

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error === null || error === undefined) return "unknown error";
  return String(error);
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
  const outcome = await runGuidedPilotReadiness({
    workspace: options.workspace,
    evidenceDir: options.evidence,
    runId: options["run-id"],
    artifactId: options["artifact-id"],
    projectId: options["project-id"],
    flowContractPath: options["flow-contract"],
    commandTimeoutMs: options["command-timeout-ms"] ? Number(options["command-timeout-ms"]) : 120_000,
    previewTimeoutMs: options["preview-timeout-ms"] ? Number(options["preview-timeout-ms"]) : 15_000,
    flowTimeoutMs: options["flow-timeout-ms"] ? Number(options["flow-timeout-ms"]) : 15_000
  });
  console.log(
    `run-guided-pilot-readiness ${outcome.result.status}: runId=${outcome.result.runId}; evidence=${outcome.resultPath.replaceAll("\\", "/")}`
  );
  if (outcome.result.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    await runCli();
  } catch (error) {
    console.error(`run-guided-pilot-readiness failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

export const guidedPilotReadinessRunner = {
  version: runnerVersion,
  sourceExclusions
};
