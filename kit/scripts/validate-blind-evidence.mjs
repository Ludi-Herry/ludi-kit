import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateEvidenceV12 } from "./blind-protocol-v1.2-lib.mjs";

const values = process.argv.slice(2);

try {
  const evidenceArg = readArg("--evidence");
  const flowArg = readArg("--flow");
  if (!evidenceArg) throw new Error("--evidence is required");
  if (!flowArg) throw new Error("--flow is required");
  const evidencePath = resolve(process.cwd(), evidenceArg);
  const flowPath = resolve(process.cwd(), flowArg);
  const evidence = readJson(evidencePath);
  const flowDocument = readJson(flowPath);
  const evidenceRoot = resolve(
    process.cwd(),
    readArg("--evidence-root") ?? dirname(evidencePath)
  );
  validateEvidenceV12(evidence, { flowDocument, evidenceRoot });
  const expectedSuffix = evidence.status === "passed" ? ".passed.json" : ".failed.json";
  if (!evidencePath.replaceAll("\\", "/").endsWith(expectedSuffix)) {
    throw new Error(`${evidence.status} evidence path must end with ${expectedSuffix}`);
  }
  console.log(
    `validate-blind-evidence passed: ${evidence.runId}; arm=${evidence.arm}; status=${evidence.status}`
  );
} catch (error) {
  console.error(
    `validate-blind-evidence failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}

function readArg(name) {
  const index = values.indexOf(name);
  if (index === -1) return null;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
