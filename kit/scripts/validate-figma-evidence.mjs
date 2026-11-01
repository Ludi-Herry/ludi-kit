import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const schema = readJson(resolve(kitRoot, "schema/figma-evidence.schema.json"));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, formats: { "date-time": true } });
const validate = ajv.compile(schema);
const errors = [];
const records = args.file
  ? [resolveInsideKit(args.file)]
  : readdirSync(resolve(kitRoot, "figma/evidence"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => resolve(kitRoot, "figma/evidence", entry.name));

for (const file of records) validateRecord(readJson(file), file, errors);

if (!args.file) {
  const validFixture = resolve(kitRoot, "figma/evidence/fixtures/valid-external-blocked.json");
  validateRecord(readJson(validFixture), validFixture, errors);

  const invalidFixture = resolve(kitRoot, "figma/evidence/fixtures/invalid-placeholder.json");
  const invalidErrors = [];
  validateRecord(readJson(invalidFixture), invalidFixture, invalidErrors);
  if (!invalidErrors.length) errors.push("invalid-placeholder.json unexpectedly passed validation");
}

if (errors.length) {
  for (const error of errors) console.error(`validate-figma-evidence failed: ${error}`);
  process.exit(1);
}

console.log(`validate-figma-evidence passed: ${records.length} evidence record(s); placeholder negative fixture rejected`);

function validateRecord(record, file, targetErrors) {
  for (const [field, value] of Object.entries(record?.target ?? {})) {
    if (typeof value === "string" && isPlaceholder(value)) {
      targetErrors.push(`${relative(kitRoot, file)} target.${field} contains a placeholder value`);
    }
  }

  if (!validate(record)) {
    targetErrors.push(`${relative(kitRoot, file)} schema errors: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
    return;
  }

  if (record.status === "verified") {
    for (const screenshot of record.screenshots) {
      if (screenshot.status !== "passed" || !screenshot.path || !screenshot.sha256) {
        targetErrors.push(`${relative(kitRoot, file)} verified screenshot evidence is incomplete`);
        continue;
      }
      const screenshotPath = resolveInsideKit(screenshot.path);
      if (!existsSync(screenshotPath)) targetErrors.push(`${relative(kitRoot, file)} screenshot is missing: ${screenshot.path}`);
      else if (hashFile(screenshotPath) !== screenshot.sha256) targetErrors.push(`${relative(kitRoot, file)} screenshot hash mismatch: ${screenshot.path}`);
    }
    for (const diff of record.diffs) {
      if (diff.status !== "passed" || !diff.metricsPath || !diff.heatmapPath) {
        targetErrors.push(`${relative(kitRoot, file)} verified diff evidence is incomplete`);
        continue;
      }
      for (const path of [diff.metricsPath, diff.heatmapPath]) {
        if (!existsSync(resolveInsideKit(path))) targetErrors.push(`${relative(kitRoot, file)} diff artifact is missing: ${path}`);
      }
    }
  }
}

function isPlaceholder(value) {
  return /(^|[-_])(todo|tbd|fake|example|placeholder|unknown)([-_]|$)/i.test(value);
}

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function resolveInsideKit(file) {
  if (typeof file !== "string" || !file.trim() || isAbsolute(file)) throw new Error(`invalid kit-relative path: ${file}`);
  const target = resolve(kitRoot, file);
  const rel = relative(kitRoot, target);
  if (rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../")) throw new Error(`path escapes kit root: ${file}`);
  return target;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`validate-figma-evidence failed: ${relative(kitRoot, file)} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--file") result.file = values[++index];
    else {
      console.error(`validate-figma-evidence failed: unknown argument ${values[index]}`);
      process.exit(1);
    }
  }
  return result;
}
