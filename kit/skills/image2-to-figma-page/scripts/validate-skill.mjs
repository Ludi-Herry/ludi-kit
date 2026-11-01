import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = resolve(skillRoot, "../..");
const errors = [];
const skillSource = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");
const lines = skillSource.split(/\r?\n/);

validateFrontmatter();
if (lines.length > 500) errors.push(`SKILL.md exceeds 500 lines (${lines.length})`);
for (const term of [
  "designContext", "existing", "exploratory", "`existing` route forbids", "visual-exploration-only", "gpt-image-2", "Image-to-html", "playwright",
  "figma:figma-use", "figma:figma-generate-design", "figma-component-builder",
  "SSIM ≥ 0.985", "normalized RMS ≤ 0.035", "SSIM ≥ 0.990", "normalized RMS ≤ 0.025",
  "external-blocked", "fileKey", "captureId", "Auto Layout"
]) if (!skillSource.includes(term)) errors.push(`SKILL.md is missing required contract term: ${term}`);

for (const file of readdirSync(resolve(skillRoot, "references")).filter((name) => name.endsWith(".md"))) {
  if (!skillSource.includes(`references/${file}`)) errors.push(`SKILL.md does not link references/${file}`);
}

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, formats: { "date-time": true } });
const requestSchema = readJson(resolve(kitRoot, "schema/image2-workflow-request.schema.json"));
const runSchema = readJson(resolve(kitRoot, "schema/image2-workflow-run.schema.json"));
const validateRequest = ajv.compile(requestSchema);
ajv.compile(runSchema);

const evals = readJson(resolve(skillRoot, "evals/evals.json"));
if (evals.skill !== "image2-to-figma-page" || !Array.isArray(evals.cases) || evals.cases.length < 5) errors.push("evals.json must define at least five cases for this skill");
for (const testCase of evals.cases ?? []) {
  const request = readJson(resolve(kitRoot, testCase.request));
  const valid = validateRequest(request);
  if (valid !== testCase.expect.valid) errors.push(`${testCase.id} expected valid=${testCase.expect.valid}, received ${valid}`);
  if (valid && request.designContext === "exploratory") {
    if (!request.exploratoryContext.directions.some((direction) => direction.id === request.exploratoryContext.selectedDirectionId)) {
      errors.push(`${testCase.id} selected direction is absent from directions`);
    }
  }
  if (!valid && testCase.expect.writeArtifacts !== false) errors.push(`${testCase.id} invalid eval must assert writeArtifacts=false`);
}

if (errors.length) {
  for (const error of errors) console.error(`validate-skill failed: ${error}`);
  process.exit(1);
}
console.log(`validate-skill passed: lines=${lines.length}; evals=${evals.cases.length}; routes=2; negative=3`);

function validateFrontmatter() {
  const match = skillSource.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) { errors.push("SKILL.md frontmatter is missing"); return; }
  const fields = match[1].split(/\r?\n/).filter(Boolean).map((line) => line.split(":", 1)[0]);
  if (fields.join(",") !== "name,description") errors.push(`frontmatter fields must be name,description; received ${fields.join(",")}`);
  if (!match[1].includes("name: image2-to-figma-page")) errors.push("frontmatter name is incorrect");
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { console.error(`validate-skill failed: invalid JSON ${file}: ${error.message}`); process.exit(1); }
}
