import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(args) {
  const options = {
    pages: "projects/tianshu-ops/pages.json",
    technical: "projects/tianshu-ops/evidence/page-acceptance.technical.json",
    visual: "projects/tianshu-ops/evidence/page-acceptance.visual.json"
  };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!["--pages", "--technical", "--visual"].includes(key)) throw new Error(`unsupported option: ${key}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a file path`);
    options[key.slice(2)] = value;
    index += 1;
  }
  return options;
}

function readJson(relativePath, label) {
  try {
    return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateJson(document, schemaPath, label) {
  const schema = readJson(schemaPath, `${label} schema`);
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  const validate = ajv.compile(schema);
  if (validate(document)) return;
  const details = (validate.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  throw new Error(`${label} schema validation failed: ${details}`);
}

function indexedPages(document, label) {
  const map = new Map();
  for (const page of document.pages ?? []) {
    if (map.has(page.pageId)) throw new Error(`${label} contains duplicate pageId: ${page.pageId}`);
    map.set(page.pageId, page);
  }
  return map;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const pagesDocument = readJson(options.pages, "pages");
  const technical = readJson(options.technical, "technical evidence");
  const visual = readJson(options.visual, "visual evidence");
  validateJson(technical, "schema/page-acceptance.technical.schema.json", "technical evidence");
  validateJson(visual, "schema/page-acceptance.visual.schema.json", "visual evidence");

  if (technical.projectId !== pagesDocument.projectId) throw new Error(`technical projectId ${technical.projectId} does not match pages projectId ${pagesDocument.projectId}`);
  if (visual.projectId !== pagesDocument.projectId) throw new Error(`visual projectId ${visual.projectId} does not match pages projectId ${pagesDocument.projectId}`);
  if (technical.routeBase !== visual.routeBase) throw new Error(`technical routeBase ${technical.routeBase} does not match visual routeBase ${visual.routeBase}`);

  const technicalPages = indexedPages(technical, "technical evidence");
  const visualPages = indexedPages(visual, "visual evidence");
  const plannedPages = pagesDocument.pages ?? [];
  if (plannedPages.length === 0) throw new Error("pages.json has no pages");

  for (const plannedPage of plannedPages) {
    const technicalPage = technicalPages.get(plannedPage.id);
    const visualPage = visualPages.get(plannedPage.id);
    if (!technicalPage) throw new Error(`missing technical evidence for pageId: ${plannedPage.id}`);
    if (!visualPage) throw new Error(`missing visual evidence for pageId: ${plannedPage.id}`);
    if (technicalPage.route !== plannedPage.route) throw new Error(`technical route mismatch for ${plannedPage.id}: ${technicalPage.route} !== ${plannedPage.route}`);
    if (visualPage.route !== plannedPage.route) throw new Error(`visual route mismatch for ${plannedPage.id}: ${visualPage.route} !== ${plannedPage.route}`);
    const expectedFullRoute = `${technical.routeBase}${plannedPage.route}`;
    if (technicalPage.fullRoute !== expectedFullRoute) throw new Error(`technical fullRoute mismatch for ${plannedPage.id}: ${technicalPage.fullRoute} !== ${expectedFullRoute}`);
    if (visualPage.fullRoute !== expectedFullRoute) throw new Error(`visual fullRoute mismatch for ${plannedPage.id}: ${visualPage.fullRoute} !== ${expectedFullRoute}`);
    if (technicalPage.keyInteractions.length < 1) throw new Error(`technical evidence for ${plannedPage.id} must include at least one key interaction`);
    if (!technicalPage.console || !technicalPage.overflow) throw new Error(`technical evidence for ${plannedPage.id} must include console and overflow fields`);
    if (!visualPage.screenshots || !visualPage.review) throw new Error(`visual evidence for ${plannedPage.id} must include screenshots and review fields`);
  }

  if (technicalPages.size !== plannedPages.length) throw new Error(`technical evidence page count ${technicalPages.size} does not match pages.json count ${plannedPages.length}`);
  if (visualPages.size !== plannedPages.length) throw new Error(`visual evidence page count ${visualPages.size} does not match pages.json count ${plannedPages.length}`);

  console.log(`PASS page acceptance: ${plannedPages.length} pages have independent technical and visual evidence`);
} catch (error) {
  console.error(`page acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
