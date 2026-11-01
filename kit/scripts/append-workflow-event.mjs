import { appendFile, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseWorkflowEventsJsonl,
  validateWorkflowEvent,
  workflowEventsFileName,
} from "./workflow-events-lib.mjs";

const scriptPath = fileURLToPath(import.meta.url);

export async function appendWorkflowEvent({ runDirectory, event }) {
  if (!runDirectory) throw new Error("--run is required");
  const resolvedRunDirectory = resolve(runDirectory);
  const metadata = await stat(resolvedRunDirectory);
  if (!metadata.isDirectory()) throw new Error(`workflow run path is not a directory: ${resolvedRunDirectory}`);

  const eventsPath = resolve(resolvedRunDirectory, workflowEventsFileName);
  let existingText = "";
  try {
    existingText = await readFile(eventsPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const existingEvents = parseWorkflowEventsJsonl(existingText, { source: eventsPath });
  validateWorkflowEvent(event, { source: eventsPath, line: existingEvents.length + 1 });
  const lastSeq = existingEvents.at(-1)?.seq ?? 0;
  if (event.seq <= lastSeq) {
    throw new Error(`workflow event seq must be greater than ${lastSeq}; received=${event.seq}`);
  }
  if (existingEvents.length === 0 && event.seq !== 1) {
    throw new Error(`workflow event stream must start at seq 1; received=${event.seq}`);
  }

  const line = `${JSON.stringify(event)}\n`;
  await appendFile(eventsPath, line, { encoding: "utf8", flag: "a" });
  return { eventsPath, seq: event.seq, bytes: Buffer.byteLength(line) };
}

export function parseAppendArguments(argv) {
  const options = { evidence: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name.startsWith("--") || value === undefined) throw new Error(`invalid argument: ${name}`);
    if (name === "--evidence") {
      options.evidence.push(value);
      index += 1;
      continue;
    }
    const key = name.slice(2);
    if (options[key] !== undefined) throw new Error(`duplicate argument: ${name}`);
    options[key] = value;
    index += 1;
  }
  if (!options.run) throw new Error("--run is required");

  if (options.event) {
    const eventOnlyKeys = new Set(["run", "event"]);
    const unexpected = Object.keys(options).filter((key) => key !== "evidence" && !eventOnlyKeys.has(key));
    if (unexpected.length > 0 || options.evidence.length > 0) {
      throw new Error("--event cannot be combined with individual event fields");
    }
    return { runDirectory: options.run, event: JSON.parse(options.event) };
  }

  for (const required of ["seq", "ts", "kind", "summary"]) {
    if (options[required] === undefined) throw new Error(`--${required} is required`);
  }
  return {
    runDirectory: options.run,
    event: {
      seq: Number(options.seq),
      ts: options.ts,
      kind: options.kind,
      stageId: nullable(options["stage-id"]),
      attemptId: nullable(options["attempt-id"]),
      status: nullable(options.status),
      summary: options.summary,
      evidence: options.evidence,
    },
  };
}

function nullable(value) {
  return value === undefined || value === "null" ? null : value;
}

async function main() {
  const input = parseAppendArguments(process.argv.slice(2));
  const result = await appendWorkflowEvent(input);
  console.log(`workflow event appended: seq=${result.seq}; file=${result.eventsPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`append-workflow-event rejected: ${error.message}`);
    process.exitCode = 1;
  });
}
