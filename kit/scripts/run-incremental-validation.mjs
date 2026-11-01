import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateDocsOnly } from "./validate-docs-only.mjs";
import {
  changedPathsBetween,
  createValidationSnapshot,
  currentCommit,
  isDocsOnlyPath,
  readJsonIfExists,
  repositoryRootFrom,
  sha256,
  validateStoredSnapshot,
  validationStateDirectory,
  writeJsonAtomic
} from "./validation-input-snapshot.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultKitRoot = resolve(dirname(scriptPath), "..");
export const INCREMENTAL_STATE_VERSION = "1.0.0";
export const ALWAYS_RUN_GATES = ["validate:integrity"];
const SUCCESS_STATUSES = new Set(["passed-full", "passed-docs-only", "skipped-by-unchanged"]);

export function fullCommandHash(kitRoot) {
  const packageJson = JSON.parse(readFileSync(resolve(kitRoot, "package.json"), "utf8"));
  return sha256(`${INCREMENTAL_STATE_VERSION}\0${packageJson.scripts?.validate ?? ""}`);
}

export function decideIncrementalValidation({ state, snapshot, worktreeRoot, expectedFullCommandHash }) {
  const stateIssue = reusableStateIssue({ state, worktreeRoot, expectedFullCommandHash });
  if (stateIssue) return { route: "full", reason: stateIssue, changedPaths: snapshot.entries.map((entry) => entry.path) };
  if (!SUCCESS_STATUSES.has(state.lastAttempt?.status)) {
    return { route: "full", reason: "previous-attempt-failed", changedPaths: snapshot.entries.map((entry) => entry.path) };
  }
  const changedPaths = changedPathsBetween(state.acceptedSnapshot, snapshot);
  if (changedPaths.length === 0) return { route: "skip", reason: "unchanged", changedPaths };
  if (changedPaths.every(isDocsOnlyPath)) return { route: "docs", reason: "docs-only-changes", changedPaths };
  return { route: "full", reason: "managed-input-changed", changedPaths };
}

export async function runIncrementalValidation({
  kitRoot = defaultKitRoot,
  repositoryRoot = repositoryRootFrom(kitRoot),
  stateDirectory = validationStateDirectory(repositoryRoot),
  snapshotProvider = () => createValidationSnapshot({ repositoryRoot }),
  commandRunner = (script) => runNpmScript(kitRoot, script),
  docsRunner = (paths) => validateDocsOnly({ repositoryRoot, paths, source: "worktree" }),
  commitProvider = () => currentCommit(repositoryRoot),
  fullHash = fullCommandHash(kitRoot),
  now = () => new Date().toISOString(),
  uuid = () => randomUUID(),
  log = console
} = {}) {
  const startedAt = Date.now();
  const statePath = resolve(stateDirectory, "incremental-state.json");
  const reportPath = resolve(stateDirectory, "incremental.latest.json");
  const worktreeRoot = resolve(repositoryRoot);
  const priorState = readJsonIfExists(statePath);
  const baseReport = {
    version: INCREMENTAL_STATE_VERSION,
    command: "npm run validate:incremental",
    alwaysRunGates: ALWAYS_RUN_GATES,
    worktreeRoot
  };

  const integrityExitCode = commandRunner("validate:integrity");
  if (integrityExitCode !== 0) {
    const report = {
      ...baseReport,
      status: "failed-integrity",
      route: "integrity-first",
      baselineCommit: priorState?.fullReceipt?.baselineCommit ?? null,
      currentCommit: safeCommit(commitProvider),
      inputListHash: null,
      inputContentHash: null,
      managedPathCount: null,
      changedPaths: [],
      fullReceiptId: priorState?.fullReceipt?.id ?? null,
      exitCode: integrityExitCode,
      durationMs: Date.now() - startedAt
    };
    writeFailureState({ statePath, priorState, worktreeRoot, fullHash, report, now });
    writeJsonAtomic(reportPath, report);
    log.error(`validate:incremental failed-integrity: exit=${integrityExitCode}`);
    return { exitCode: integrityExitCode, report };
  }

  const snapshot = snapshotProvider();
  const decision = decideIncrementalValidation({
    state: priorState,
    snapshot,
    worktreeRoot,
    expectedFullCommandHash: fullHash
  });
  const commit = safeCommit(commitProvider);

  if (decision.route === "skip") {
    const report = buildReport({
      baseReport,
      status: "skipped-by-unchanged",
      route: decision.reason,
      state: priorState,
      snapshot,
      commit,
      changedPaths: [],
      startedAt,
      exitCode: 0
    });
    const nextState = {
      ...priorState,
      lastAttempt: attemptFromReport(report, now())
    };
    writeJsonAtomic(statePath, nextState);
    writeJsonAtomic(reportPath, report);
    log.log(`validate:incremental skipped-by-unchanged: inputListHash=${snapshot.inputListHash}`);
    return { exitCode: 0, report };
  }

  if (decision.route === "docs") {
    try {
      docsRunner(decision.changedPaths);
      const postSnapshot = snapshotProvider();
      assertSnapshotStable(snapshot, postSnapshot, "docs-only validation");
      const report = buildReport({
        baseReport,
        status: "passed-docs-only",
        route: decision.reason,
        state: priorState,
        snapshot: postSnapshot,
        commit,
        changedPaths: decision.changedPaths,
        startedAt,
        exitCode: 0
      });
      const nextState = {
        ...priorState,
        acceptedSnapshot: postSnapshot,
        lastAttempt: attemptFromReport(report, now())
      };
      writeJsonAtomic(statePath, nextState);
      writeJsonAtomic(reportPath, report);
      log.log(`validate:incremental passed-docs-only: paths=${decision.changedPaths.length}`);
      return { exitCode: 0, report };
    } catch (error) {
      const report = buildReport({
        baseReport,
        status: "failed-docs-only",
        route: decision.reason,
        state: priorState,
        snapshot,
        commit,
        changedPaths: decision.changedPaths,
        startedAt,
        exitCode: 1,
        error: error.message
      });
      writeFailureState({ statePath, priorState, worktreeRoot, fullHash, report, now });
      writeJsonAtomic(reportPath, report);
      log.error(`validate:incremental failed-docs-only: ${error.message}`);
      return { exitCode: 1, report };
    }
  }

  const fullExitCode = commandRunner("validate");
  const postSnapshot = snapshotProvider();
  if (fullExitCode !== 0) {
    const report = buildReport({
      baseReport,
      status: "failed-full",
      route: decision.reason,
      state: priorState,
      snapshot: postSnapshot,
      commit,
      changedPaths: decision.changedPaths,
      startedAt,
      exitCode: fullExitCode
    });
    writeFailureState({ statePath, priorState, worktreeRoot, fullHash, report, now });
    writeJsonAtomic(reportPath, report);
    log.error(`validate:incremental failed-full: exit=${fullExitCode}`);
    return { exitCode: fullExitCode, report };
  }

  try {
    assertSnapshotStable(snapshot, postSnapshot, "full validation");
  } catch (error) {
    const report = buildReport({
      baseReport,
      status: "failed-full",
      route: "full-input-drift",
      state: priorState,
      snapshot: postSnapshot,
      commit,
      changedPaths: changedPathsBetween(snapshot, postSnapshot),
      startedAt,
      exitCode: 1,
      error: error.message
    });
    writeFailureState({ statePath, priorState, worktreeRoot, fullHash, report, now });
    writeJsonAtomic(reportPath, report);
    log.error(`validate:incremental failed-full: ${error.message}`);
    return { exitCode: 1, report };
  }

  const receiptId = uuid();
  const passedAt = now();
  const report = {
    ...buildReport({
      baseReport,
      status: "passed-full",
      route: decision.reason,
      state: priorState,
      snapshot: postSnapshot,
      commit,
      changedPaths: decision.changedPaths,
      startedAt,
      exitCode: 0
    }),
    fullReceiptId: receiptId
  };
  const nextState = {
    version: INCREMENTAL_STATE_VERSION,
    worktreeRoot,
    fullCommandHash: fullHash,
    fullReceipt: {
      id: receiptId,
      passedAt,
      baselineCommit: commit,
      inputListHash: postSnapshot.inputListHash,
      inputContentHash: postSnapshot.inputContentHash
    },
    acceptedSnapshot: postSnapshot,
    lastAttempt: attemptFromReport(report, passedAt)
  };
  writeJsonAtomic(statePath, nextState);
  writeJsonAtomic(reportPath, report);
  log.log(`validate:incremental passed-full: inputListHash=${postSnapshot.inputListHash}`);
  return { exitCode: 0, report };
}

function reusableStateIssue({ state, worktreeRoot, expectedFullCommandHash }) {
  if (state?.version !== INCREMENTAL_STATE_VERSION) return "cache-miss-or-version-drift";
  if (resolve(state.worktreeRoot ?? ".") !== resolve(worktreeRoot)) return "cross-worktree-receipt";
  if (state.fullCommandHash !== expectedFullCommandHash) return "full-command-drift";
  if (!validateStoredSnapshot(state.acceptedSnapshot)) return "invalid-accepted-snapshot";
  if (
    !/^[0-9a-f-]{36}$/.test(state.fullReceipt?.id ?? "")
    || !/^[0-9a-f]{40}$/.test(state.fullReceipt?.baselineCommit ?? "")
    || !/^[0-9a-f]{64}$/.test(state.fullReceipt?.inputListHash ?? "")
    || !/^[0-9a-f]{64}$/.test(state.fullReceipt?.inputContentHash ?? "")
  ) return "invalid-full-receipt";
  return null;
}

function buildReport({
  baseReport,
  status,
  route,
  state,
  snapshot,
  commit,
  changedPaths,
  startedAt,
  exitCode,
  error
}) {
  return {
    ...baseReport,
    status,
    route,
    baselineCommit: state?.fullReceipt?.baselineCommit ?? commit,
    currentCommit: commit,
    inputListHash: snapshot.inputListHash,
    inputContentHash: snapshot.inputContentHash,
    managedPathCount: snapshot.managedPathCount,
    changedPaths,
    fullReceiptId: state?.fullReceipt?.id ?? null,
    exitCode,
    ...(error ? { error } : {}),
    durationMs: Date.now() - startedAt
  };
}

function attemptFromReport(report, recordedAt) {
  return {
    status: report.status,
    recordedAt,
    currentCommit: report.currentCommit,
    inputListHash: report.inputListHash,
    inputContentHash: report.inputContentHash,
    exitCode: report.exitCode
  };
}

function writeFailureState({ statePath, priorState, worktreeRoot, fullHash, report, now }) {
  writeJsonAtomic(statePath, {
    version: INCREMENTAL_STATE_VERSION,
    worktreeRoot,
    fullCommandHash: fullHash,
    fullReceipt: priorState?.fullReceipt ?? null,
    acceptedSnapshot: priorState?.acceptedSnapshot ?? null,
    lastAttempt: attemptFromReport(report, now())
  });
}

function assertSnapshotStable(before, after, label) {
  if (before.inputListHash !== after.inputListHash || before.inputContentHash !== after.inputContentHash) {
    throw new Error(`${label} changed managed inputs while it was running`);
  }
}

function safeCommit(provider) {
  try {
    return provider();
  } catch {
    return null;
  }
}

function runNpmScript(kitRoot, script) {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
  const args = npmExecPath ? [npmExecPath, "run", script] : ["run", script];
  return spawnSync(command, args, {
    cwd: kitRoot,
    stdio: "inherit",
    windowsHide: true,
    shell: !npmExecPath && process.platform === "win32"
  }).status ?? 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isMain) {
  const result = await runIncrementalValidation();
  process.exitCode = result.exitCode;
}
