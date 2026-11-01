import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptPath = fileURLToPath(import.meta.url);
export const kitRoot = resolve(dirname(scriptPath), "..");
export const workflowEventSchemaPath = resolve(kitRoot, "schema/workflow-events.schema.json");
export const workflowEventsFileName = "events.jsonl";

const schema = JSON.parse(await readFile(workflowEventSchemaPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validateSchema = ajv.compile(schema);

export class WorkflowEventValidationError extends Error {
  constructor(message, { source = null, line = null, code = "invalid-workflow-event" } = {}) {
    super(message);
    this.name = "WorkflowEventValidationError";
    this.source = source;
    this.line = line;
    this.code = code;
  }
}

export function formatAjvErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
}

export function validateWorkflowEvent(event, { source = null, line = null } = {}) {
  if (!validateSchema(event)) {
    throw new WorkflowEventValidationError(
      `workflow event schema rejected: ${formatAjvErrors(validateSchema.errors)}`,
      { source, line, code: "schema-rejected" },
    );
  }

  if (Number.isNaN(Date.parse(event.ts))) {
    throw new WorkflowEventValidationError("workflow event ts is not a real ISO8601 date-time", {
      source,
      line,
      code: "invalid-timestamp",
    });
  }

  return event;
}

export function parseWorkflowEventsJsonl(text, { source = "events.jsonl" } = {}) {
  const events = [];
  const lines = text.split(/\r?\n/);
  let previousSeq = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (rawLine.trim() === "") continue;
    const line = index + 1;
    let event;
    try {
      event = JSON.parse(rawLine);
    } catch (error) {
      throw new WorkflowEventValidationError(
        `workflow event line is not valid JSON: ${error.message}`,
        { source, line, code: "invalid-json-line" },
      );
    }

    validateWorkflowEvent(event, { source, line });
    if (event.seq <= previousSeq) {
      throw new WorkflowEventValidationError(
        `workflow event seq must increase monotonically: previous=${previousSeq}; received=${event.seq}`,
        { source, line, code: "seq-not-monotonic" },
      );
    }
    if (events.length === 0 && event.seq !== 1) {
      throw new WorkflowEventValidationError(
        `workflow event stream must start at seq 1; received=${event.seq}`,
        { source, line, code: "seq-must-start-at-one" },
      );
    }

    events.push(event);
    previousSeq = event.seq;
  }

  return events;
}

export async function readWorkflowEventsFile(path, { allowMissing = false } = {}) {
  try {
    const text = await readFile(path, "utf8");
    return parseWorkflowEventsJsonl(text, { source: path });
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return [];
    throw error;
  }
}
