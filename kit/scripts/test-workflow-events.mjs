import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { appendWorkflowEvent } from "./append-workflow-event.mjs";
import {
  parseWorkflowEventsJsonl,
  readWorkflowEventsFile,
  validateWorkflowEvent,
  WorkflowEventValidationError,
} from "./workflow-events-lib.mjs";

const fixtureRoot = resolve(import.meta.dirname, "fixtures/workflow-events");
const tempRoot = await mkdtemp(resolve(tmpdir(), "ai-readable-workflow-events-"));

const baseEvent = {
  seq: 1,
  ts: "2026-08-22T15:04:05+08:00",
  kind: "stage-start",
  stageId: "route-selection",
  attemptId: null,
  status: null,
  summary: "Started route selection.",
  evidence: ["projects/tianshu-ops/workflow/content-version-existing/request.json"],
};

try {
  const validEvents = await readWorkflowEventsFile(resolve(fixtureRoot, "valid/events.jsonl"));
  assert.equal(validEvents.length, 3);
  assert.equal(validEvents[2].status, "in-progress");

  const negativeCases = [
    ["bad-json", "invalid-json-line"],
    ["seq-rollback", "seq-not-monotonic"],
    ["ts-no-timezone", "schema-rejected"],
    ["evidence-traversal", "schema-rejected"],
    ["invalid-kind", "schema-rejected"],
  ];
  for (const [name, expectedCode] of negativeCases) {
    await assert.rejects(
      () => readWorkflowEventsFile(resolve(fixtureRoot, `negative/${name}/events.jsonl`)),
      (error) => error instanceof WorkflowEventValidationError && error.code === expectedCode,
      name,
    );
  }

  const runDirectory = resolve(tempRoot, "run");
  await mkdir(runDirectory, { recursive: true });
  await appendWorkflowEvent({ runDirectory, event: baseEvent });
  await appendWorkflowEvent({
    runDirectory,
    event: { ...baseEvent, seq: 2, ts: "2026-08-22T15:04:06+08:00", kind: "note", summary: "Note." },
  });
  const appendedPath = resolve(runDirectory, "events.jsonl");
  const beforeRejectedAppend = await readFile(appendedPath, "utf8");
  await assert.rejects(
    () => appendWorkflowEvent({ runDirectory, event: { ...baseEvent, seq: 2 } }),
    /seq must be greater than 2/,
  );
  assert.equal(await readFile(appendedPath, "utf8"), beforeRejectedAppend);

  for (const invalidEvent of [
    { ...baseEvent, ts: "2026-08-22T15:04:05" },
    { ...baseEvent, evidence: ["../outside.json"] },
    { ...baseEvent, kind: "stage-rewrite" },
  ]) {
    assert.throws(() => validateWorkflowEvent(invalidEvent), WorkflowEventValidationError);
  }

  const badExistingRun = resolve(tempRoot, "bad-existing-run");
  await mkdir(badExistingRun, { recursive: true });
  const badExisting = "{bad-json\n";
  await writeFile(resolve(badExistingRun, "events.jsonl"), badExisting, "utf8");
  await assert.rejects(() => appendWorkflowEvent({ runDirectory: badExistingRun, event: baseEvent }));
  assert.equal(await readFile(resolve(badExistingRun, "events.jsonl"), "utf8"), badExisting);

  const cliRunDirectory = resolve(tempRoot, "cli-run");
  await mkdir(cliRunDirectory, { recursive: true });
  const cliResult = spawnSync(process.execPath, [
    resolve(import.meta.dirname, "append-workflow-event.mjs"),
    "--run", cliRunDirectory,
    "--seq", "1",
    "--ts", "2026-08-22T15:05:00+08:00",
    "--kind", "stage-start",
    "--stage-id", "route-selection",
    "--summary", "CLI append.",
    "--evidence", "projects/tianshu-ops/workflow/content-version-existing/request.json",
  ], { encoding: "utf8" });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.match(cliResult.stdout, /workflow event appended: seq=1/);
  assert.equal((await readWorkflowEventsFile(resolve(cliRunDirectory, "events.jsonl"))).length, 1);

  assert.equal(parseWorkflowEventsJsonl(beforeRejectedAppend).length, 2);
  console.log("workflow events tests passed: positive=1; negative=5; append-only=preserved; cli=passed");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
