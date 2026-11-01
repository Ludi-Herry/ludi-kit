import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const validatorPath = resolve(import.meta.dirname, "validate-workflow-events.mjs");
const appendPath = resolve(import.meta.dirname, "append-workflow-event.mjs");
const fixtureRoot = resolve(import.meta.dirname, "fixtures/workflow-events");
const liveRun = resolve(import.meta.dirname, "../examples/workflow-replay/fixtures/live-run");
const tempRoot = await mkdtemp(resolve(tmpdir(), "ai-readable-workflow-events-validator-"));

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function jsonReport(result) {
  assert(result.stdout.trim(), result.stderr);
  return JSON.parse(result.stdout);
}

try {
  const valid = run(validatorPath, ["--run", resolve(fixtureRoot, "valid"), "--json"]);
  assert.equal(valid.status, 0, valid.stderr);
  const validReport = jsonReport(valid);
  assert.equal(validReport.eventCount, 3);
  assert.equal(validReport.mode, "canonical-gate");
  assert.equal(validReport.gateAuthority, true);
  assert.equal(validReport.canonicalIntegration, true);

  const live = run(validatorPath, ["--run", liveRun, "--json"]);
  assert.equal(live.status, 0, live.stderr);
  assert.equal(jsonReport(live).eventCount, 10);

  const rootScan = resolve(tempRoot, "root-scan");
  const historicalRun = resolve(rootScan, "historical-no-events");
  const managedRun = resolve(rootScan, "managed-live-run");
  await mkdir(historicalRun, { recursive: true });
  await mkdir(managedRun, { recursive: true });
  await writeFile(resolve(managedRun, "events.jsonl"), await readFile(resolve(liveRun, "events.jsonl")), "utf8");
  const rootResult = run(validatorPath, ["--root", rootScan, "--json"]);
  assert.equal(rootResult.status, 0, rootResult.stderr);
  const rootReport = jsonReport(rootResult);
  assert.equal(rootReport.streamCount, 1);
  assert.equal(rootReport.eventCount, 10);

  const negativeCases = ["bad-json", "seq-rollback", "ts-no-timezone", "evidence-traversal", "invalid-kind"];
  for (const name of negativeCases) {
    const result = run(validatorPath, ["--run", resolve(fixtureRoot, "negative", name), "--json"]);
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
    assert.equal(jsonReport(result).failures.length, 1, name);
  }

  const realFailureRun = resolve(tempRoot, "real-failure-sample");
  await mkdir(realFailureRun, { recursive: true });
  const realEvents = await readFile(resolve(liveRun, "events.jsonl"), "utf8");
  const invalidLine = JSON.stringify({
    seq: 11,
    ts: "2026-08-22T18:10:00",
    kind: "note",
    stageId: "technical-verification",
    attemptId: null,
    status: null,
    summary: "Missing timezone sample.",
    evidence: [],
  });
  await writeFile(resolve(realFailureRun, "events.jsonl"), `${realEvents}${invalidLine}\n`, "utf8");
  const realFailure = run(validatorPath, ["--run", realFailureRun, "--json"]);
  assert.equal(realFailure.status, 1, realFailure.stderr);
  assert.equal(jsonReport(realFailure).failures[0].code, "schema-rejected");

  const appendRejectRun = resolve(tempRoot, "append-reject-sample");
  await mkdir(appendRejectRun, { recursive: true });
  await writeFile(resolve(appendRejectRun, "events.jsonl"), realEvents, "utf8");
  const beforeAppend = await readFile(resolve(appendRejectRun, "events.jsonl"), "utf8");
  const appendReject = run(appendPath, [
    "--run", appendRejectRun,
    "--seq", "11",
    "--ts", "2026-08-22T18:10:00",
    "--kind", "note",
    "--stage-id", "technical-verification",
    "--summary", "Missing timezone sample.",
  ]);
  assert.equal(appendReject.status, 1);
  assert.equal(await readFile(resolve(appendRejectRun, "events.jsonl"), "utf8"), beforeAppend);

  console.log(
    "workflow events canonical gate tests passed: live=10; historical-missing=ignored; negative=5; real-failure-sample=hit; append-dual-reject=passed",
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
