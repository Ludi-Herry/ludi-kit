import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { runIncrementalValidation } from "./run-incremental-validation.mjs";
import {
  changedPathsBetween,
  createValidationSnapshot,
  isDocsOnlyPath,
  validationStateDirectory
} from "./validation-input-snapshot.mjs";

const tempRoot = mkdtempSync(join(tmpdir(), "ai-readable-incremental-validation-"));
let negativeCount = 0;

try {
  const snapshotRepository = createRepository(resolve(tempRoot, "snapshot"));
  testSnapshotCoverage(snapshotRepository);

  const orchestrationRepository = createRepository(resolve(tempRoot, "orchestration"));
  await testOrchestration(orchestrationRepository);

  console.log(`test-incremental-validation passed: unchanged=skipped; docs=routed; full=fail-closed; negative=${negativeCount}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function testSnapshotCoverage(repositoryRoot) {
  const baseline = createValidationSnapshot({ repositoryRoot });
  assert(baseline.managedPathCount === 11, "baseline managed path count");
  assert(createValidationSnapshot({ repositoryRoot }).inputContentHash === baseline.inputContentHash, "unchanged snapshot");
  assert(isDocsOnlyPath("docs/guide.md"), "docs path classification");
  assert(isDocsOnlyPath("kit/AGENTS.md"), "AGENTS docs classification");
  assert(!isDocsOnlyPath("kit/rules/rule.md"), "machine Markdown remains full input");
  const managedPaths = new Set(baseline.entries.map((entry) => entry.path));
  assert(managedPaths.has("kit/scripts/validate-workflow-events.mjs"), "workflow event validator is managed");
  assert(managedPaths.has("kit/schema/workflow-events.schema.json"), "workflow event schema is managed");
  assert(managedPaths.has("kit/projects/sample/workflow/run/events.jsonl"), "workflow events stream is managed");

  for (const entry of baseline.entries) {
    const path = resolve(repositoryRoot, entry.path);
    const original = readFileSync(path);
    writeFileSync(path, Buffer.concat([original, Buffer.from("\nchanged")]));
    const changed = createValidationSnapshot({ repositoryRoot });
    assert(changedPathsBetween(baseline, changed).includes(entry.path), `content mutation detected for ${entry.path}`);
    writeFileSync(path, original);
    negativeCount += 1;
  }

  const untrackedPath = resolve(repositoryRoot, "kit/scripts/untracked.mjs");
  writeFileSync(untrackedPath, "export {};\n", "utf8");
  assert(changedPathsBetween(baseline, createValidationSnapshot({ repositoryRoot })).includes("kit/scripts/untracked.mjs"), "untracked input detected");
  rmSync(untrackedPath, { force: true });
  negativeCount += 1;

  const deletedPath = resolve(repositoryRoot, "kit/quality/frozen.json");
  const deletedBytes = readFileSync(deletedPath);
  rmSync(deletedPath, { force: true });
  assert(changedPathsBetween(baseline, createValidationSnapshot({ repositoryRoot })).includes("kit/quality/frozen.json"), "deleted input detected");
  writeFileSync(deletedPath, deletedBytes);
  negativeCount += 1;

  const oldPath = resolve(repositoryRoot, "docs/guide.md");
  const newPath = resolve(repositoryRoot, "docs/renamed.md");
  renameSync(oldPath, newPath);
  const renamed = changedPathsBetween(baseline, createValidationSnapshot({ repositoryRoot }));
  assert(renamed.includes("docs/guide.md") && renamed.includes("docs/renamed.md"), "rename detected");
  renameSync(newPath, oldPath);
  negativeCount += 1;

  git(repositoryRoot, ["update-index", "--chmod=+x", "kit/app.mjs"]);
  assert(changedPathsBetween(baseline, createValidationSnapshot({ repositoryRoot })).includes("kit/app.mjs"), "mode change detected");
  git(repositoryRoot, ["update-index", "--chmod=-x", "kit/app.mjs"]);
  negativeCount += 1;
}

async function testOrchestration(repositoryRoot) {
  const stateDirectory = validationStateDirectory(repositoryRoot);
  const counts = { integrity: 0, full: 0, docs: 0 };
  let integrityExit = 0;
  let fullExit = 0;
  let mutateDuringFull = false;
  const logger = { log() {}, error() {} };
  const commandRunner = (script) => {
    if (script === "validate:integrity") {
      counts.integrity += 1;
      return integrityExit;
    }
    if (script === "validate") {
      counts.full += 1;
      if (mutateDuringFull) writeFileSync(resolve(repositoryRoot, "kit/app.mjs"), `export const value = ${counts.full};\n`, "utf8");
      return fullExit;
    }
    throw new Error(`unexpected script: ${script}`);
  };
  const docsRunner = () => { counts.docs += 1; };
  const options = {
    kitRoot: resolve(repositoryRoot, "kit"),
    repositoryRoot,
    stateDirectory,
    commandRunner,
    docsRunner,
    fullHash: "a".repeat(64),
    uuid: () => "11111111-1111-4111-8111-111111111111",
    log: logger
  };

  const first = await runIncrementalValidation(options);
  assert(first.report.status === "passed-full" && counts.full === 1, "cache miss runs full");
  const second = await runIncrementalValidation(options);
  assert(second.report.status === "skipped-by-unchanged" && counts.full === 1, "unchanged skips full");

  writeFileSync(resolve(repositoryRoot, "docs/guide.md"), "# Guide\n\nUpdated.\n", "utf8");
  const docs = await runIncrementalValidation(options);
  assert(docs.report.status === "passed-docs-only" && counts.docs === 1 && counts.full === 1, "docs-only routes to docs gate");

  writeFileSync(resolve(repositoryRoot, "kit/app.mjs"), "export const value = 2;\n", "utf8");
  const full = await runIncrementalValidation(options);
  assert(full.report.status === "passed-full" && counts.full === 2, "code change runs full");

  fullExit = 7;
  writeFileSync(resolve(repositoryRoot, "kit/app.mjs"), "export const value = 3;\n", "utf8");
  const failed = await runIncrementalValidation(options);
  assert(failed.report.status === "failed-full" && failed.exitCode === 7, "full failure is retained");
  fullExit = 0;
  const retried = await runIncrementalValidation(options);
  assert(retried.report.status === "passed-full" && counts.full === 4, "failed attempt blocks old shortcut");
  negativeCount += 1;

  integrityExit = 9;
  const fullBeforeIntegrityFailure = counts.full;
  const integrity = await runIncrementalValidation(options);
  assert(integrity.report.status === "failed-integrity" && counts.full === fullBeforeIntegrityFailure, "integrity fails before shortcut");
  integrityExit = 0;
  const afterIntegrityFailure = await runIncrementalValidation(options);
  assert(afterIntegrityFailure.report.status === "passed-full", "integrity failure blocks prior shortcut");
  negativeCount += 1;

  const statePath = resolve(stateDirectory, "incremental-state.json");
  writeFileSync(statePath, "{truncated", "utf8");
  const truncated = await runIncrementalValidation(options);
  assert(truncated.report.status === "passed-full", "truncated receipt runs full");
  negativeCount += 1;

  const crossState = JSON.parse(readFileSync(statePath, "utf8"));
  crossState.worktreeRoot = resolve(repositoryRoot, "other-worktree");
  writeFileSync(statePath, `${JSON.stringify(crossState)}\n`, "utf8");
  const crossWorktree = await runIncrementalValidation(options);
  assert(crossWorktree.report.status === "passed-full", "cross-worktree receipt runs full");
  negativeCount += 1;

  const commandDrift = await runIncrementalValidation({ ...options, fullHash: "b".repeat(64) });
  assert(commandDrift.report.status === "passed-full", "full command drift runs full");
  negativeCount += 1;

  writeFileSync(resolve(repositoryRoot, "kit/app.mjs"), "export const value = 20;\n", "utf8");
  mutateDuringFull = true;
  const inputDrift = await runIncrementalValidation({ ...options, fullHash: "b".repeat(64) });
  mutateDuringFull = false;
  assert(inputDrift.report.status === "failed-full" && inputDrift.report.route === "full-input-drift", "input drift during full fails closed");
  negativeCount += 1;
}

function createRepository(repositoryRoot) {
  mkdirSync(resolve(repositoryRoot, "kit/scripts"), { recursive: true });
  mkdirSync(resolve(repositoryRoot, "kit/schema"), { recursive: true });
  mkdirSync(resolve(repositoryRoot, "kit/projects/sample/workflow/run"), { recursive: true });
  mkdirSync(resolve(repositoryRoot, "kit/quality"), { recursive: true });
  mkdirSync(resolve(repositoryRoot, "kit/rules"), { recursive: true });
  mkdirSync(resolve(repositoryRoot, "docs"), { recursive: true });
  writeFileSync(resolve(repositoryRoot, "README.md"), "# Root\n", "utf8");
  writeFileSync(resolve(repositoryRoot, "docs/guide.md"), "# Guide\n", "utf8");
  writeFileSync(resolve(repositoryRoot, "kit/AGENTS.md"), "# Agent contract\n", "utf8");
  writeFileSync(resolve(repositoryRoot, "kit/package.json"), '{"name":"fixture","scripts":{"validate":"node check.mjs"}}\n', "utf8");
  writeFileSync(resolve(repositoryRoot, "kit/app.mjs"), "export const value = 1;\n", "utf8");
  writeFileSync(resolve(repositoryRoot, "kit/scripts/check.mjs"), "export {};\n", "utf8");
  writeFileSync(resolve(repositoryRoot, "kit/scripts/validate-workflow-events.mjs"), "export {};\n", "utf8");
  writeFileSync(resolve(repositoryRoot, "kit/schema/workflow-events.schema.json"), "{}\n", "utf8");
  writeFileSync(resolve(repositoryRoot, "kit/projects/sample/workflow/run/events.jsonl"), "{\"seq\":1}\n", "utf8");
  writeFileSync(resolve(repositoryRoot, "kit/quality/frozen.json"), "{}\n", "utf8");
  writeFileSync(resolve(repositoryRoot, "kit/rules/rule.md"), "# Machine rule\n", "utf8");
  git(repositoryRoot, ["init"]);
  git(repositoryRoot, ["config", "user.email", "fixture@example.invalid"]);
  git(repositoryRoot, ["config", "user.name", "Fixture"]);
  git(repositoryRoot, ["add", "--", "."]);
  git(repositoryRoot, ["commit", "-m", "fixture"]);
  return repositoryRoot;
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(`test-incremental-validation failed: ${message}`);
}
