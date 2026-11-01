import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { assertProjectDescriptionConsistency } from "./project-description-consistency-lib.mjs";

const root = process.cwd();
const projectsDir = resolve(root, "projects");
const fail = (message) => {
  console.error(`validate-projects failed: ${message}`);
  process.exitCode = 1;
};

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(resolve(root, file), "utf8"));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
    return null;
  }
};

if (!existsSync(projectsDir)) {
  console.log("validate-projects skipped: no projects directory");
  process.exit(0);
}

const componentsManifest = readJson("components.manifest.json");
const patternsManifest = readJson("patterns.manifest.json");
const componentNames = new Set((componentsManifest?.components ?? []).map((component) => component.name));
const patternNames = new Set(Object.keys(patternsManifest?.patterns ?? {}));
const contextTypes = new Set(["validation-sandbox", "real-product"]);

let projectCount = 0;
let pageCount = 0;

for (const projectName of readdirSync(projectsDir)) {
  if (!statSync(resolve(projectsDir, projectName)).isDirectory()) continue;

  const projectRoot = `projects/${projectName}`;
  const businessContextFile = `${projectRoot}/business-context.json`;
  if (!existsSync(resolve(root, businessContextFile))) fail(`${businessContextFile} is missing`);
  if (!existsSync(resolve(root, projectRoot, "prd.mdx"))) fail(`${projectRoot}/prd.mdx is missing`);
  if (!existsSync(resolve(root, projectRoot, "flows.json"))) fail(`${projectRoot}/flows.json is missing`);
  if (!existsSync(resolve(root, projectRoot, "pages.json"))) fail(`${projectRoot}/pages.json is missing`);

  const businessContext = readJson(businessContextFile);
  const flowsDoc = readJson(`${projectRoot}/flows.json`);
  const pagesDoc = readJson(`${projectRoot}/pages.json`);
  const projectDescriptionFile = `${projectRoot}/project-description.json`;
  const projectDescription = existsSync(resolve(root, projectDescriptionFile))
    ? readJson(projectDescriptionFile)
    : null;
  const flows = flowsDoc?.flows ?? [];
  const pages = pagesDoc?.pages ?? [];
  const flowIds = new Set(flows.map((flow) => flow.id));
  const pageIds = new Set(pages.map((page) => page.id));
  const routes = new Set();
  const generatedPagesFile = resolve(root, projectRoot, "generated/pages.tsx");
  const generatedStylesFile = resolve(root, projectRoot, "generated/styles.css");
  const generatedSource = existsSync(generatedPagesFile) ? readFileSync(generatedPagesFile, "utf8") : "";

  projectCount += 1;
  pageCount += pages.length;

  validateBusinessContext(projectName, projectRoot, businessContextFile, businessContext);
  if (pagesDoc && projectDescription) {
    try {
      assertProjectDescriptionConsistency(pagesDoc, projectDescription, projectRoot);
    } catch (error) {
      fail(error.message);
    }
  }

  if (!generatedSource) fail(`${projectRoot}/generated/pages.tsx is missing`);
  if (!existsSync(generatedStylesFile)) fail(`${projectRoot}/generated/styles.css is missing`);

  for (const flow of flows) {
    if (!flow.id || !flow.title || !flow.entry) fail(`${projectRoot}: flow is missing id/title/entry`);
    for (const step of flow.steps ?? []) {
      if (!pageIds.has(step.pageId)) fail(`${projectRoot}: flow ${flow.id} references missing page ${step.pageId}`);
    }
  }

  for (const page of pages) {
    if (!page.id || !page.route || !page.title) fail(`${projectRoot}: page is missing id/route/title`);
    if (!patternNames.has(page.pattern)) fail(`${projectRoot}: page ${page.id} references missing pattern ${page.pattern}`);
    if (routes.has(page.route)) fail(`${projectRoot}: duplicate route ${page.route}`);
    routes.add(page.route);

    for (const flowId of page.flowIds ?? []) {
      if (!flowIds.has(flowId)) fail(`${projectRoot}: page ${page.id} references missing flow ${flowId}`);
    }

    for (const componentName of page.componentPlan ?? []) {
      if (!componentNames.has(componentName)) fail(`${projectRoot}: page ${page.id} references missing component ${componentName}`);
    }

    if (!page.flowCard?.userGoal || !page.intentCard?.pageGoal) {
      fail(`${projectRoot}: page ${page.id} needs flowCard.userGoal and intentCard.pageGoal`);
    }
    if (!Array.isArray(page.intentCard?.successCriteria) || page.intentCard.successCriteria.length === 0) {
      fail(`${projectRoot}: page ${page.id} needs intentCard.successCriteria`);
    }
    validateOptionalIntentCardFields(projectRoot, page);
    if (
      generatedSource &&
      !generatedSource.includes(`"id": "${page.id}"`) &&
      !generatedSource.includes(`id: "${page.id}"`)
    ) {
      fail(`${projectRoot}: generated pages missing page id ${page.id}`);
    }
  }

  validateGeneratedImports(projectRoot, businessContext, generatedSource);
}

validateViewDecisionFixtures();

if (!process.exitCode) {
  console.log(`validate-projects passed: ${projectCount} projects, ${pageCount} pages; viewDecision fixtures passed`);
}

function validateBusinessContext(projectName, projectRoot, file, context) {
  if (!context) return;

  if (context.projectId !== projectName) fail(`${file}: projectId must match ${projectName}`);
  if (!contextTypes.has(context.contextType)) {
    fail(`${file}: contextType must be validation-sandbox or real-product`);
  }
  if (!context.decision) fail(`${file}: decision is required`);
  if (!context.product?.name) fail(`${file}: product.name is required`);
  if (!Array.isArray(context.product?.audience) || context.product.audience.length === 0) {
    fail(`${file}: product.audience needs at least one entry`);
  }
  if (!context.product?.scenario) fail(`${file}: product.scenario is required`);

  for (const source of context.sourceOfTruth ?? []) {
    if (!existsSync(resolve(root, source))) fail(`${file}: sourceOfTruth points to missing file ${source}`);
  }

  if (context.contextType === "validation-sandbox") {
    validateSandboxContext(file, context);
  }

  if (context.contextType === "real-product") {
    validateRealProductContext(file, context);
  }
}

function validateSandboxContext(file, context) {
  const doNotUseFor = context.boundaries?.doNotUseFor ?? [];
  if (context.decision !== "pipeline-only") fail(`${file}: validation-sandbox decision must be pipeline-only`);
  if (context.product?.realCustomer !== false) fail(`${file}: validation-sandbox product.realCustomer must be false`);
  if (!doNotUseFor.includes("business component roadmap")) {
    fail(`${file}: validation-sandbox must block business component roadmap usage`);
  }
  if (!doNotUseFor.includes("third-party UI baseline decision")) {
    fail(`${file}: validation-sandbox must block third-party UI baseline decisions`);
  }
  if (context.thirdPartyBaseline?.status !== "blocked-until-real-brief") {
    fail(`${file}: validation-sandbox thirdPartyBaseline.status must be blocked-until-real-brief`);
  }
  if (context.businessComponentPolicy?.status !== "blocked-until-real-brief") {
    fail(`${file}: validation-sandbox businessComponentPolicy.status must be blocked-until-real-brief`);
  }
}

function validateRealProductContext(file, context) {
  if (context.product?.realCustomer !== true) fail(`${file}: real-product product.realCustomer must be true`);
  requireNonEmptyArray(file, context.coreFlows, "coreFlows");
  requireNonEmptyArray(file, context.firstPages, "firstPages");
  requireNonEmptyArray(file, context.criticalStates, "criticalStates");

  const candidate = context.thirdPartyBaseline?.candidate;
  if (!["shadcn", "antd", "defer"].includes(candidate)) {
    fail(`${file}: real-product thirdPartyBaseline.candidate must be shadcn, antd, or defer`);
  }
}

function requireNonEmptyArray(file, value, field) {
  if (!Array.isArray(value) || value.length === 0) fail(`${file}: ${field} needs at least one entry`);
}

function validateOptionalIntentCardFields(projectRoot, page) {
  const prdAnchor = page.intentCard?.prdAnchor;
  if (prdAnchor !== undefined && (typeof prdAnchor !== "string" || prdAnchor.trim() === "")) {
    fail(`${projectRoot}: page ${page.id} intentCard.prdAnchor must be a non-empty string when provided`);
  }

  for (const field of ["referenceImplementations", "antiPatterns"]) {
    const value = page.intentCard?.[field];
    if (
      value !== undefined &&
      (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim() === ""))
    ) {
      fail(`${projectRoot}: page ${page.id} intentCard.${field} must be a non-empty string array when provided`);
    }
  }

  for (const message of collectViewDecisionErrors(page.intentCard?.viewDecision)) {
    fail(`${projectRoot}: page ${page.id} intentCard.viewDecision ${message}`);
  }
}

function collectViewDecisionErrors(viewDecision) {
  if (viewDecision === undefined) return [];
  if (!viewDecision || typeof viewDecision !== "object" || Array.isArray(viewDecision)) {
    return ["must be an object when provided"];
  }

  const errors = [];
  const allowedFields = new Set(["primary", "supporting", "rationale"]);
  const unknownFields = Object.keys(viewDecision).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) errors.push(`contains unknown fields: ${unknownFields.join(", ")}`);

  if (typeof viewDecision.primary !== "string" || viewDecision.primary.trim() === "") {
    errors.push("primary must be a non-empty string");
  }

  for (const field of ["supporting", "rationale"]) {
    const value = viewDecision[field];
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.some((entry) => typeof entry !== "string" || entry.trim() === "")
    ) {
      errors.push(`${field} must be a non-empty string array`);
    } else if (new Set(value.map((entry) => entry.trim())).size !== value.length) {
      errors.push(`${field} entries must be unique`);
    }
  }

  if (
    typeof viewDecision.primary === "string" &&
    Array.isArray(viewDecision.supporting) &&
    viewDecision.supporting.some((entry) =>
      typeof entry === "string" && entry.trim() === viewDecision.primary.trim()
    )
  ) {
    errors.push("primary must not be repeated in supporting");
  }
  return errors;
}

function validateViewDecisionFixtures() {
  const valid = collectViewDecisionErrors({
    primary: "告警名称与严重级别",
    supporting: ["源 IP、目标资产与发生时间"],
    rationale: ["窄屏先保证识别稳定对象并进入处置链路。"]
  });
  if (valid.length > 0) fail(`valid intentCard.viewDecision fixture failed: ${valid.join("; ")}`);

  const invalid = collectViewDecisionErrors({
    primary: "告警名称与严重级别",
    supporting: ["告警名称与严重级别"],
    rationale: []
  });
  if (
    !invalid.includes("primary must not be repeated in supporting") ||
    !invalid.includes("rationale must be a non-empty string array")
  ) {
    fail(`invalid intentCard.viewDecision fixture did not fail closed: ${invalid.join("; ")}`);
  }
}

function validateGeneratedImports(projectRoot, context, generatedSource) {
  if (!generatedSource) return;
  const foundation = context?.frontendFoundation;
  if (!foundation) return;

  for (const forbidden of foundation.imports?.forbiddenPackages ?? []) {
    if (generatedSource.includes(forbidden)) fail(`${projectRoot}: generated pages contain forbidden foundation import ${forbidden}`);
  }

  const allowedImports = foundation.imports?.allowedPackages ?? [];
  const hasAllowedUiImport = allowedImports
    .filter((entry) => entry !== "react" && entry !== "react-dom")
    .some((entry) => generatedSource.includes(`from "${entry}"`) || generatedSource.includes(`from '${entry}'`));

  if (!hasAllowedUiImport) {
    fail(`${projectRoot}: generated pages must import from the selected frontend foundation boundary`);
  }
}
