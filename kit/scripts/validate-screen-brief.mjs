import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const unexpected = [...args].filter((value) => value !== "--test-fixtures");
if (unexpected.length) {
  console.error(`validate-screen-brief failed: unknown argument ${unexpected[0]}`);
  process.exit(1);
}

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validate = ajv.compile(readJson("schema/screen-brief.schema.json"));
const errors = [];

const positive = readJson("examples/figma-3d-situation-screen/brief.example.json");
if (!validate(positive)) {
  errors.push(`brief.example.json schema errors: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
}

let fixtureCount = 0;
if (args.has("--test-fixtures")) {
  const fixturesDir = resolve(kitRoot, "schema/fixtures/screen-brief");
  if (!existsSync(fixturesDir)) {
    errors.push("schema/fixtures/screen-brief directory is missing");
  } else {
    const fixtures = readdirSync(fixturesDir).filter((file) => file.startsWith("negative-") && file.endsWith(".json")).sort();
    if (fixtures.length === 0) errors.push("schema/fixtures/screen-brief has no negative-*.json fixtures");
    for (const file of fixtures) {
      fixtureCount += 1;
      const candidate = readJson(`schema/fixtures/screen-brief/${file}`);
      if (validate(candidate)) {
        errors.push(`negative fixture unexpectedly passed: ${file}`);
      } else {
        console.log(`validate-screen-brief negative rejected (${file}): ${ajv.errorsText(validate.errors, { separator: "; " })}`);
      }
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(`validate-screen-brief failed: ${error}`);
  process.exit(1);
}

console.log(`validate-screen-brief passed: brief.example.json valid against screen-brief v1; ${fixtureCount} negative fixtures fail closed${args.has("--test-fixtures") ? "" : " (fixtures skipped)"}`);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(resolve(kitRoot, file), "utf8"));
  } catch (error) {
    console.error(`validate-screen-brief failed: ${file} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}
