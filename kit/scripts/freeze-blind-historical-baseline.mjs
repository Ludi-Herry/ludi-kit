import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const registryPath = resolve(kitRoot, "quality/blind-adoption-registry.json");
const baselinePath = resolve(kitRoot, "quality/blind-harness/historical-baseline-manifest.json");
const schemaPath = resolve(kitRoot, "schema/blind-historical-baseline-manifest.schema.json");
const protectedRunIds = [
  "blind-prd-01-vulnerability-scanning-platform",
  "blind-prd-02",
  "blind-prd-02-replacement-01",
  "blind-prd-03",
  "blind-prd-03-replacement-01",
  "blind-prd-04",
  "blind-prd-04-replacement-01",
  "blind-prd-04-replacement-02"
];
const runRoots = protectedRunIds
  .filter((runId) => runId !== "blind-prd-01-vulnerability-scanning-platform")
  .map((runId) => ({ runId, root: resolve(kitRoot, `quality/blind-runs/${runId}`) }));
const standaloneFiles = [
  {
    runId: "blind-prd-01-vulnerability-scanning-platform",
    path: resolve(kitRoot, "workflows/evidence/blind-prd-vulnerability-platform.json")
  }
];

export function buildHistoricalBaseline({ frozenAtUtc = new Date().toISOString() } = {}) {
  const registry = readJson(registryPath);
  const protectedRuns = protectedRunIds.map((runId) => {
    const run = registry.runs.find((item) => item.runId === runId);
    if (!run) throw new Error(`blind registry omits protected run ${runId}`);
    const bytes = canonicalJsonBytes(run);
    return {
      runId,
      status: run.status,
      qualifying: run.qualifying,
      canonicalBytes: bytes.length,
      sha256: sha256(bytes)
    };
  });
  const files = [];
  for (const item of standaloneFiles) files.push(fileReceipt(item.runId, item.path));
  for (const { runId, root } of runRoots) {
    for (const path of listFiles(root)) files.push(fileReceipt(runId, path));
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    $schema: "../../schema/blind-historical-baseline-manifest.schema.json",
    version: "1.0.0",
    scope: "three-qualifying-five-invalidated-complete-evidence",
    frozenAtUtc,
    registry: {
      path: "quality/blind-adoption-registry.json",
      versionAtFreeze: registry.version,
      protectedRuns
    },
    files
  };
}

export function validateHistoricalBaseline(path = baselinePath) {
  const document = readJson(path);
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(readJson(schemaPath));
  if (!validate(document)) {
    throw new Error(`historical baseline schema failed: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
  }
  const registry = readJson(registryPath);
  const expectedRunIds = [...protectedRunIds];
  const actualRunIds = document.registry.protectedRuns.map((run) => run.runId);
  assertArrayEqual(actualRunIds, expectedRunIds, "protected registry run order");
  for (const receipt of document.registry.protectedRuns) {
    const run = registry.runs.find((item) => item.runId === receipt.runId);
    if (!run) throw new Error(`current registry omits protected run ${receipt.runId}`);
    const bytes = canonicalJsonBytes(run);
    assertEqual(bytes.length, receipt.canonicalBytes, `${receipt.runId} canonical bytes`);
    assertEqual(sha256(bytes), receipt.sha256, `${receipt.runId} canonical SHA-256`);
    assertEqual(run.status, receipt.status, `${receipt.runId} status`);
    assertEqual(run.qualifying, receipt.qualifying, `${receipt.runId} qualifying`);
  }

  const actualFiles = [];
  for (const item of standaloneFiles) actualFiles.push(fileReceipt(item.runId, item.path));
  for (const { runId, root } of runRoots) {
    for (const file of listFiles(root)) actualFiles.push(fileReceipt(runId, file));
  }
  actualFiles.sort((left, right) => left.path.localeCompare(right.path));
  assertArrayEqual(document.files, actualFiles, "protected historical file receipts");
  return { protectedRuns: document.registry.protectedRuns.length, protectedFiles: document.files.length };
}

function fileReceipt(runId, path) {
  const bytes = readFileSync(path);
  return {
    runId,
    path: relative(kitRoot, path).replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: sha256(bytes)
  };
}

function listFiles(root) {
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`protected run root is missing: ${root}`);
  const files = [];
  walk(root);
  return files.sort((left, right) => left.localeCompare(right));

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`historical baseline rejects symbolic link: ${path}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`historical baseline rejects non-file entry: ${path}`);
    }
  }
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

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function assertArrayEqual(actual, expected, label) {
  const left = JSON.stringify(sortValue(actual));
  const right = JSON.stringify(sortValue(expected));
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function runCli() {
  const write = process.argv.includes("--write");
  if (write) {
    if (existsSync(baselinePath)) throw new Error(`historical baseline already exists: ${baselinePath}`);
    const document = buildHistoricalBaseline();
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, canonicalJsonBytes(document), { flag: "wx" });
  }
  const result = validateHistoricalBaseline();
  console.log(
    `freeze-blind-historical-baseline passed: runs=${result.protectedRuns}; files=${result.protectedFiles}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(`freeze-blind-historical-baseline failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export const blindHistoricalBaselinePaths = {
  baselinePath,
  registryPath,
  schemaPath,
  protectedRunIds
};
