import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectsRoot = resolve(kitRoot, "projects");
const args = new Set(process.argv.slice(2));
const errors = [];
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const schema = readJson(resolve(kitRoot, "schema/project-sample-pack.schema.json"));
const validateSchema = ajv.compile(schema);

let packCount = 0;
let entityTypeCount = 0;
let objectCount = 0;

if (existsSync(projectsRoot)) {
  for (const projectName of readdirSync(projectsRoot)) {
    const projectRoot = resolve(projectsRoot, projectName);
    if (!statSync(projectRoot).isDirectory()) continue;
    validateProjectSamplePack(projectName, projectRoot);
  }
}

if (args.has("--test-fixtures")) runFixtureTests();

if (errors.length > 0) {
  for (const error of errors) console.error(`validate-sample-pack failed: ${error}`);
  process.exit(1);
}

console.log(`validate-sample-pack passed: ${packCount} sample packs, ${entityTypeCount} entity types, ${objectCount} objects`);

function validateProjectSamplePack(projectName, projectRoot) {
  const contextPath = resolve(projectRoot, "business-context.json");
  if (!existsSync(contextPath)) return;
  const context = tryReadJson(contextPath);
  if (!context?.samplePack) return;

  const expectedPath = resolve(projectRoot, "sample-pack.json");
  const packPath = resolve(kitRoot, context.samplePack.path);
  if (!isInside(projectRoot, packPath) || packPath !== expectedPath) {
    errors.push(`${relativeToKit(contextPath)}: samplePack.path must resolve to ${relativeToKit(expectedPath)}`);
    return;
  }
  if (!existsSync(packPath)) {
    errors.push(`${relativeToKit(packPath)} is missing`);
    return;
  }

  const raw = readFileSync(packPath, "utf8");
  for (const duplicate of findDuplicateJsonKeys(raw)) {
    errors.push(`${relativeToKit(packPath)}: duplicate JSON key ${duplicate}`);
  }
  const pack = tryParseJson(raw, packPath);
  if (!pack) return;

  if (!validateSchema(pack)) {
    errors.push(`${relativeToKit(packPath)}: ${ajv.errorsText(validateSchema.errors, { separator: "; " })}`);
    return;
  }
  if (pack.projectId !== projectName || pack.projectId !== context.projectId) {
    errors.push(`${relativeToKit(packPath)}: projectId must match directory and business-context.json`);
  }
  if (pack.version !== context.samplePack.version) {
    errors.push(`${relativeToKit(packPath)}: version must match business-context.json samplePack.version`);
  }

  packCount += 1;
  entityTypeCount += Object.keys(pack.entities).length;
  for (const [entityType, entities] of Object.entries(pack.entities)) {
    objectCount += Object.keys(entities).length;
    for (const [entityId, entity] of Object.entries(entities)) {
      if (entity.id !== entityId) {
        errors.push(`${relativeToKit(packPath)}: ${entityType}/${entityId} id must equal its object key`);
      }
      for (const issue of validateComparableFields(entity)) {
        errors.push(`${relativeToKit(packPath)}: ${entityType}/${entityId} ${issue}`);
      }
    }
  }

  validateDataRequirements(projectRoot, pack);
  validateGeneratedSampleData(projectRoot, packPath);
  validateFreezeEvidence(projectRoot, packPath, pack);
}

function validateDataRequirements(projectRoot, pack) {
  const pagesPath = resolve(projectRoot, "pages.json");
  const pagesDoc = tryReadJson(pagesPath);
  if (!pagesDoc) return;
  const entityTypes = new Set(Object.keys(pack.entities));
  for (const page of pagesDoc.pages ?? []) {
    for (const requirement of page.dataRequirements ?? []) {
      if (!entityTypes.has(requirement)) {
        errors.push(`${relativeToKit(pagesPath)}: page ${page.id} dataRequirements references missing entity ${requirement}`);
      }
    }
  }
}

function validateGeneratedSampleData(projectRoot, packPath) {
  const generatedDataPath = resolve(projectRoot, "generated/sample-data.ts");
  const generatedPagesPath = resolve(projectRoot, "generated/pages.tsx");
  if (!existsSync(generatedDataPath)) {
    errors.push(`${relativeToKit(generatedDataPath)} is missing`);
    return;
  }
  const expectedHash = sha256(readFileSync(packPath));
  const generatedData = readFileSync(generatedDataPath, "utf8");
  if (!generatedData.includes(`samplePackSha256 = "${expectedHash}"`)) {
    errors.push(`${relativeToKit(generatedDataPath)} does not match the current sample-pack SHA-256`);
  }
  if (!existsSync(generatedPagesPath)) {
    errors.push(`${relativeToKit(generatedPagesPath)} is missing`);
    return;
  }
  const generatedPages = readFileSync(generatedPagesPath, "utf8");
  if (!generatedPages.includes('from "./sample-data"')) {
    errors.push(`${relativeToKit(generatedPagesPath)} must read sample entities from generated/sample-data.ts`);
  }
}

function validateFreezeEvidence(projectRoot, packPath, pack) {
  const freezePath = resolve(projectRoot, "evidence/sample-pack-freeze.json");
  const freeze = tryReadJson(freezePath);
  if (!freeze) return;
  const expectedHash = sha256(readFileSync(packPath));
  if (freeze.projectId !== pack.projectId) {
    errors.push(`${relativeToKit(freezePath)}: projectId must match sample-pack.json`);
  }
  if (freeze.samplePack?.path !== relativeToKit(packPath)) {
    errors.push(`${relativeToKit(freezePath)}: samplePack.path must point to ${relativeToKit(packPath)}`);
  }
  if (freeze.samplePack?.sha256 !== expectedHash) {
    errors.push(`${relativeToKit(freezePath)}: samplePack.sha256 does not match the current sample pack`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(freeze.frozenAt ?? "")) {
    errors.push(`${relativeToKit(freezePath)}: frozenAt must use YYYY-MM-DD`);
  }
}

function validateComparableFields(entity) {
  const issues = [];
  for (const [field, value] of Object.entries(entity)) {
    if (/(At|DateTime)$/.test(field) && typeof value === "string") {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
        issues.push(`${field} must be an ISO 8601 timestamp with timezone`);
      }
    }
    if (/(On|Date)$/.test(field) && typeof value === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      issues.push(`${field} must use YYYY-MM-DD`);
    }
    if (typeof value === "number" && /(Amount|Price|Cost)$/i.test(field)) {
      const stem = field.replace(/(Amount|Price|Cost)$/i, "");
      const hasCurrency =
        typeof entity.currency === "string" ||
        typeof entity[`${stem}Currency`] === "string";
      if (!hasCurrency) issues.push(`${field} needs currency or ${stem}Currency`);
    }
    if (typeof value === "number" && /Quantity$/i.test(field)) {
      const stem = field.replace(/Quantity$/i, "");
      const hasUnit =
        typeof entity.quantityUnit === "string" ||
        typeof entity[`${stem}Unit`] === "string";
      if (!hasUnit) issues.push(`${field} needs quantityUnit or ${stem}Unit`);
    }
  }
  return issues;
}

function runFixtureTests() {
  const valid = {
    version: "1.0.0",
    projectId: "fixture",
    label: "demonstration data",
    entities: {
      Alert: {
        "alert-1": {
          id: "alert-1",
          status: "open",
          occurredAt: "2026-07-24T09:30:00-07:00"
        }
      }
    }
  };
  if (!validateSchema(valid)) errors.push(`fixture valid sample pack failed schema: ${ajv.errorsText(validateSchema.errors)}`);
  if (validateSchema({ ...valid, label: "production records" })) {
    errors.push("fixture production label unexpectedly passed schema");
  }
  const duplicates = findDuplicateJsonKeys('{"entities":{"Alert":{"alert-1":{"id":"alert-1"},"alert-1":{"id":"alert-1"}}}}');
  if (!duplicates.includes("entities.Alert.alert-1")) errors.push("fixture duplicate entity key was not detected");
  if (validateComparableFields({ id: "x", occurredAt: "24 July", totalAmount: 10 }).length !== 2) {
    errors.push("fixture comparable field guards did not detect timestamp and currency issues");
  }
  if (errors.length === 0) {
    console.log("sample-pack fixture tests passed: schema=valid+invalid; duplicateKeys=detected; comparableFields=guarded");
  }
}

function findDuplicateJsonKeys(source) {
  const duplicates = [];
  let index = 0;

  parseValue([]);
  return duplicates;

  function parseValue(path) {
    skipWhitespace();
    const token = source[index];
    if (token === "{") return parseObject(path);
    if (token === "[") return parseArray(path);
    if (token === '"') return parseString();
    while (index < source.length && !/[\s,\]}]/.test(source[index])) index += 1;
  }

  function parseObject(path) {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (source[index] === "}") {
      index += 1;
      return;
    }
    while (index < source.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) duplicates.push([...path, key].join("."));
      keys.add(key);
      skipWhitespace();
      if (source[index] !== ":") return;
      index += 1;
      parseValue([...path, key]);
      skipWhitespace();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      if (source[index] !== ",") return;
      index += 1;
    }
  }

  function parseArray(path) {
    index += 1;
    skipWhitespace();
    let itemIndex = 0;
    if (source[index] === "]") {
      index += 1;
      return;
    }
    while (index < source.length) {
      parseValue([...path, String(itemIndex)]);
      itemIndex += 1;
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      if (source[index] !== ",") return;
      index += 1;
    }
  }

  function parseString() {
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source[index] === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index));
      }
      index += 1;
    }
    return "";
  }

  function skipWhitespace() {
    while (index < source.length && /\s/.test(source[index])) index += 1;
  }
}

function tryReadJson(file) {
  if (!existsSync(file)) {
    errors.push(`${relativeToKit(file)} is missing`);
    return null;
  }
  return tryParseJson(readFileSync(file, "utf8"), file);
}

function tryParseJson(raw, file) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    errors.push(`${relativeToKit(file)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(":"));
}

function relativeToKit(file) {
  return relative(kitRoot, file).replaceAll("\\", "/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
