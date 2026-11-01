import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const auditPath = resolveInsideKit(args.audit, "audit");
const outputPath = resolveInsideKit(args.out, "out");
const audit = readJson(auditPath);
const schema = readJson(resolve(kitRoot, "schema/figma-audit.schema.json"));
const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
const validate = ajv.compile(schema);

if (!validate(audit)) {
  console.error(`build-figma-component-index failed: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
  process.exit(1);
}

for (const value of [audit.fileKey, ...audit.components.flatMap((component) => [component.nodeId, component.componentKey]), ...audit.variables.map((variable) => variable.key)]) {
  if (/(^|[-_])(todo|tbd|fake|example|placeholder|unknown)([-_]|$)/i.test(value)) {
    console.error("build-figma-component-index failed: audit contains placeholder identifiers");
    process.exit(1);
  }
}

const index = {
  version: "1.0.0",
  source: "live-figma-audit",
  fileKey: audit.fileKey,
  auditedAt: audit.auditedAt,
  scope: audit.scope,
  components: audit.components.map((component) => ({
    name: component.name,
    nodeId: component.nodeId,
    componentKey: component.componentKey,
    properties: component.properties,
    usage: { useWhen: component.useWhen, avoidWhen: component.avoidWhen }
  })),
  variables: audit.variables
};

writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`built Figma component index: ${index.components.length} components, ${index.variables.length} variables`);

function resolveInsideKit(file, label) {
  if (!file || typeof file !== "string" || isAbsolute(file)) throw new Error(`--${label} requires a kit-relative path`);
  const target = resolve(kitRoot, file);
  const rel = relative(kitRoot, target);
  if (rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../")) throw new Error(`--${label} escapes the kit root`);
  return target;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`build-figma-component-index failed: ${error.message}`);
    process.exit(1);
  }
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--audit") result.audit = values[++index];
    else if (values[index] === "--out") result.out = values[++index];
    else throw new Error(`unknown argument ${values[index]}`);
  }
  if (!result.audit || !result.out) throw new Error("--audit and --out are required");
  return result;
}
