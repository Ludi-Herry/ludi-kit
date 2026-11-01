import { readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  kitRoot,
  readWorkflowEventsFile,
  WorkflowEventValidationError,
  workflowEventsFileName,
} from "./workflow-events-lib.mjs";

const scriptPath = fileURLToPath(import.meta.url);

export async function validateWorkflowEventInputs({ runs = [], roots = [] } = {}) {
  const eventFiles = new Set();
  for (const run of runs) {
    const runPath = inputPath(run);
    const metadata = await stat(runPath);
    if (!metadata.isDirectory()) throw new Error(`workflow event run is not a directory: ${run}`);
    eventFiles.add(resolve(runPath, workflowEventsFileName));
  }
  for (const root of roots) {
    await collectEventFiles(inputPath(root), eventFiles);
  }

  const streams = [];
  const failures = [];
  let eventCount = 0;
  for (const path of [...eventFiles].sort()) {
    try {
      const events = await readWorkflowEventsFile(path);
      eventCount += events.length;
      streams.push({ path: displayPath(path), status: "passed", eventCount: events.length });
    } catch (error) {
      const failure = {
        path: displayPath(path),
        status: "failed",
        code: error instanceof WorkflowEventValidationError ? error.code : "read-failed",
        line: error instanceof WorkflowEventValidationError ? error.line : null,
        message: error instanceof Error ? error.message : String(error),
      };
      streams.push(failure);
      failures.push(failure);
    }
  }

  return {
    version: "1.0.0",
    validator: "workflow-events",
    mode: "canonical-gate",
    gateAuthority: true,
    canonicalIntegration: true,
    status: failures.length > 0 ? "failed" : eventFiles.size === 0 ? "passed-empty" : "passed",
    streamCount: eventFiles.size,
    eventCount,
    streams,
    failures,
  };
}

function inputPath(value) {
  return isAbsolute(value) ? resolve(value) : resolve(kitRoot, value);
}

function displayPath(path) {
  const relativePath = relative(kitRoot, path).replaceAll("\\", "/");
  return relativePath.startsWith("../") ? path : relativePath;
}

async function collectEventFiles(directory, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collectEventFiles(path, output);
    if (entry.isFile() && entry.name === workflowEventsFileName) output.add(path);
  }
}

export function parseValidatorArguments(argv) {
  const options = { runs: [], roots: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument !== "--run" && argument !== "--root") throw new Error(`unsupported argument: ${argument}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${argument} requires a path`);
    if (argument === "--run") options.runs.push(value);
    if (argument === "--root") options.roots.push(value);
    index += 1;
  }
  if (options.runs.length === 0 && options.roots.length === 0) options.roots.push("projects");
  return options;
}

async function main() {
  const options = parseValidatorArguments(process.argv.slice(2));
  const report = await validateWorkflowEventInputs(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `validate:workflow-events ${report.status}: mode=${report.mode}; streams=${report.streamCount}; events=${report.eventCount}; gateAuthority=true`,
    );
    for (const failure of report.failures) {
      console.error(`${failure.path}:${failure.line ?? "?"} ${failure.code}: ${failure.message}`);
    }
  }
  if (report.failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`validate:workflow-events failed to run: ${error.message}`);
    process.exitCode = 1;
  });
}
