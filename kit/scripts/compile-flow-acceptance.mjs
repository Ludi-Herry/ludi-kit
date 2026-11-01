import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectsRoot = resolve(kitRoot, "projects");
const values = process.argv.slice(2);
const projectArg = readArg("--project");
const outArg = readArg("--out");

if (!projectArg || !outArg) {
  console.error("compile-flow-acceptance failed: pass --project projects/<id> --out <file>");
  process.exit(1);
}

const projectRoot = resolve(kitRoot, projectArg);
const outputPath = resolve(kitRoot, outArg);
if (!isInside(projectsRoot, projectRoot) || !isInside(projectRoot, outputPath)) {
  console.error("compile-flow-acceptance failed: project and output must stay inside the selected project");
  process.exit(1);
}
if (existsSync(outputPath)) {
  console.error(`compile-flow-acceptance failed: refusing to overwrite ${relativeToKit(outputPath)}`);
  process.exit(1);
}

const flowsPath = resolve(projectRoot, "flows.json");
const flowsDoc = JSON.parse(readFileSync(flowsPath, "utf8"));
const draft = {
  $schema: "../../schema/project-flow-acceptance.schema.json",
  version: "1.0.0",
  projectId: flowsDoc.projectId,
  flows: (flowsDoc.flows ?? []).map((flow) => ({
    flowId: flow.id,
    status: "draft",
    steps: (flow.steps ?? []).map((step) => ({ pageId: step.pageId }))
  }))
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
console.log(`compiled ${draft.flows.length} draft flow acceptance entries into ${relativeToKit(outputPath)}`);

function readArg(name) {
  const index = values.indexOf(name);
  return index === -1 ? null : values[index + 1];
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(":"));
}

function relativeToKit(file) {
  return relative(kitRoot, file).replaceAll("\\", "/");
}
