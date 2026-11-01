import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { failureResult, inspectProjectPage } from "./ai-readable-inspect.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const kitRoot = resolve(dirname(scriptPath), "..");
const repoRoot = resolve(kitRoot, "..");

export function parseCliArgs(values) {
  if (values.includes("--help") || values.includes("-h")) return { help: true };
  if (values[0] !== "inspect") throw cliError("unknown-command", "M0 supports only the inspect command.");

  const parsed = { command: "inspect", projectId: null, pageId: null, json: false };
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--json") {
      if (parsed.json) throw cliError("duplicate-argument", "--json may be provided only once.");
      parsed.json = true;
      continue;
    }
    if (value === "--project" || value === "--page") {
      const next = values[index + 1];
      if (!next || next.startsWith("--")) throw cliError("missing-argument-value", `${value} requires a value.`);
      const key = value === "--project" ? "projectId" : "pageId";
      if (parsed[key] !== null) throw cliError("duplicate-argument", `${value} may be provided only once.`);
      parsed[key] = next;
      index += 1;
      continue;
    }
    throw cliError("unknown-argument", `Unknown argument: ${value}.`);
  }

  if (!parsed.projectId) throw cliError("missing-argument", "--project is required.");
  if (!parsed.pageId) throw cliError("missing-argument", "--page is required.");
  if (!parsed.json) throw cliError("missing-argument", "--json is required in M0.");
  return parsed;
}

export function runCli(values) {
  const jsonRequested = values.includes("--json");
  try {
    const args = parseCliArgs(values);
    if (args.help) return { exitCode: 0, help: usage() };
    return inspectProjectPage({ kitRoot, projectId: args.projectId, pageId: args.pageId });
  } catch (error) {
    if (!jsonRequested) return { exitCode: 5, help: `${error.message}\n\n${usage()}`, stderr: true };
    return {
      exitCode: 5,
      result: failureResult({
        repoRoot,
        projectId: valueAfter(values, "--project"),
        pageId: valueAfter(values, "--page"),
        error
      })
    };
  }
}

function usage() {
  return [
    "Ludi Design CLI M0",
    "",
    "Usage:",
    "  npm run ai-readable -- inspect --project <project-id> --page <page-id> --json"
  ].join("\n");
}

function valueAfter(values, flag) {
  const index = values.indexOf(flag);
  const value = index >= 0 ? values[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

function cliError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

if (resolve(process.argv[1] ?? "") === scriptPath) {
  const output = runCli(process.argv.slice(2));
  if (output.result) process.stdout.write(`${JSON.stringify(output.result, null, 2)}\n`);
  if (output.help) {
    const stream = output.stderr ? process.stderr : process.stdout;
    stream.write(`${output.help}\n`);
  }
  process.exitCode = output.exitCode;
}
