import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  resolveProjectPath,
  verifyFrozenArtifact
} from "./same-artifact-lib.mjs";
import { validateFlowV12 } from "./blind-protocol-v1.2-lib.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectsRoot = resolve(kitRoot, "projects");
const values = process.argv.slice(2);
const projectArg = readArg("--project");
const projectRootArg = readArg("--project-root");
const runFixtures = values.includes("--test-fixtures");
const requireApproved = values.includes("--require-approved");
const requireSameArtifact = values.includes("--require-same-artifact");
const errors = [];
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const schema = readJson(resolve(kitRoot, "schema/project-flow-acceptance.schema.json"));
const validateSchema = ajv.compile(schema);

let documentCount = 0;
let approvedCount = 0;
let draftCount = 0;

for (const project of projectRoots()) validateProject(project.root, project.enforceDirectoryName);
if (runFixtures) runFixtureTests();
if (requireApproved && approvedCount === 0) errors.push("no approved flow acceptance found");

if (errors.length > 0) {
  for (const error of errors) console.error(`validate-flow-acceptance failed: ${error}`);
  process.exit(1);
}

console.log(`validate-flow-acceptance passed: ${documentCount} documents, ${approvedCount} approved flows, ${draftCount} draft flows`);

function validateProject(projectRoot, enforceDirectoryName) {
  const acceptancePath = resolve(projectRoot, "flow-acceptance.json");
  if (!existsSync(acceptancePath)) return;
  const acceptance = tryReadJson(acceptancePath);
  const projectName = projectRoot.split(/[\\/]/).at(-1);
  if (!acceptance) return;
  if (!validateSchema(acceptance)) {
    errors.push(`${relativeToKit(acceptancePath)}: ${ajv.errorsText(validateSchema.errors, { separator: "; " })}`);
    return;
  }
  documentCount += 1;
  if (enforceDirectoryName && acceptance.projectId !== projectName) {
    errors.push(`${relativeToKit(acceptancePath)}: projectId must match ${projectName}`);
  }
  if (requireSameArtifact && !["1.1.0", "1.2.0"].includes(acceptance.version)) {
    errors.push(`${relativeToKit(acceptancePath)}: --require-same-artifact requires version 1.1.0 or 1.2.0`);
  }

  let artifactContext = null;
  if (acceptance.version === "1.1.0") {
    try {
      artifactContext = verifyFrozenArtifact(projectRoot);
    } catch (error) {
      errors.push(`${relativeToKit(acceptancePath)}: ${error.message}`);
    }
  }
  if (acceptance.version === "1.2.0") {
    try {
      validateFlowV12(acceptance);
    } catch (error) {
      errors.push(`${relativeToKit(acceptancePath)}: ${error.message}`);
    }
  }

  const flowsDoc = tryReadJson(artifactContext?.contractFiles.flows ?? resolve(projectRoot, "flows.json"));
  const pagesDoc = tryReadJson(artifactContext?.contractFiles.pages ?? resolve(projectRoot, "pages.json"));
  const samplePack = tryReadJson(artifactContext?.contractFiles.samplePack ?? resolve(projectRoot, "sample-pack.json"));
  if (!flowsDoc || !pagesDoc || !samplePack) return;

  const sourceFlows = new Map((flowsDoc.flows ?? []).map((flow) => [flow.id, flow]));
  const pages = new Map((pagesDoc.pages ?? []).map((page) => [page.id, page]));
  const routePaths = new Set((pagesDoc.pages ?? []).map((page) => page.route));
  const seenFlowIds = new Set();

  for (const flow of acceptance.flows) {
    if (seenFlowIds.has(flow.flowId)) errors.push(`${relativeToKit(acceptancePath)}: duplicate flowId ${flow.flowId}`);
    seenFlowIds.add(flow.flowId);
    const sourceFlow = sourceFlows.get(flow.flowId);
    if (!sourceFlow) {
      errors.push(`${relativeToKit(acceptancePath)}: missing flows.json entry ${flow.flowId}`);
      continue;
    }
    if (flow.status === "draft") {
      draftCount += 1;
      continue;
    }

    approvedCount += 1;
    validateApprovedFlow({
      flow,
      sourceFlow,
      pages,
      routePaths,
      samplePack,
      projectRoot,
      acceptancePath,
      version: acceptance.version
    });
  }
}

function validateApprovedFlow({ flow, sourceFlow, pages, routePaths, samplePack, projectRoot, acceptancePath, version }) {
  const sourcePageIds = new Set((sourceFlow.steps ?? []).map((step) => step.pageId));
  const coveredPages = new Set();

  for (const objectRef of flow.objectRefs) {
    const [entityType, entityId] = objectRef.split("/");
    if (!samplePack.entities?.[entityType]?.[entityId]) {
      errors.push(`${relativeToKit(acceptancePath)}: ${flow.flowId} objectRef ${objectRef} is missing from sample-pack.json`);
    }
  }

  for (const step of flow.steps) {
    const page = pages.get(step.pageId);
    if (!page) {
      errors.push(`${relativeToKit(acceptancePath)}: ${flow.flowId} references missing page ${step.pageId}`);
      continue;
    }
    coveredPages.add(step.pageId);
    if (!sourcePageIds.has(step.pageId)) {
      errors.push(`${relativeToKit(acceptancePath)}: ${flow.flowId} page ${step.pageId} is not in flows.json`);
    }
    const expectedPath = routePath(step.expectedRoute);
    if (!routePaths.has(expectedPath)) {
      errors.push(`${relativeToKit(acceptancePath)}: ${flow.flowId} expectedRoute ${step.expectedRoute} has no page route`);
    }
    for (const assertionRef of step.assertionRefs) {
      if (!assertionRefExists(assertionRef, flow.flowId, sourceFlow, pages)) {
        errors.push(`${relativeToKit(acceptancePath)}: ${flow.flowId} assertionRef does not resolve: ${assertionRef}`);
      }
    }
  }

  if (coveredPages.size < 2) {
    errors.push(`${relativeToKit(acceptancePath)}: approved flow ${flow.flowId} must cover at least two pages`);
  }
  if (new Set(flow.steps.map((step) => step.expectedState)).size < 2) {
    errors.push(`${relativeToKit(acceptancePath)}: approved flow ${flow.flowId} needs an observable state change`);
  }
  if (flow.result.route !== flow.steps.at(-1).expectedRoute) {
    errors.push(`${relativeToKit(acceptancePath)}: ${flow.flowId} result.route must equal the final expectedRoute`);
  }
  if (version === "1.1.0" && typeof flow.result.recovery !== "string") {
    errors.push(`${relativeToKit(acceptancePath)}: ${flow.flowId} result.recovery is required for same-artifact acceptance`);
  }

  const specPathError = validateSpecPath(flow, projectRoot, version);
  if (specPathError) {
    errors.push(`${relativeToKit(acceptancePath)}: ${flow.flowId} ${specPathError}`);
  }
}

function validateSpecPath(flow, projectRoot, version) {
  if (version === "1.0.0") {
    const specPath = resolve(kitRoot, flow.specPath);
    return flow.specPath.startsWith("projects/") && isInside(projectRoot, specPath) && existsSync(specPath)
      ? null
      : "legacy specPath must exist inside the kit project";
  }
  if (version === "1.1.0") {
    return validateRelativeSpecPath(flow, projectRoot, "same-artifact project");
  }
  if (version === "1.2.0") {
    return validateRelativeSpecPath(flow, projectRoot, "blind evaluator");
  }
  return `unsupported flow acceptance version ${JSON.stringify(version)}`;
}

function validateRelativeSpecPath(flow, projectRoot, scope) {
  if (!flow.specPath.startsWith("e2e/flows/")) {
    return `${scope} specPath must be relative to its root`;
  }
  try {
    resolveProjectPath(projectRoot, flow.specPath, {
      label: `${flow.flowId} specPath`,
      type: "file"
    });
    return null;
  } catch (error) {
    return error.message;
  }
}

function assertionRefExists(reference, flowId, sourceFlow, pages) {
  const flowMatch = /^flows\.json#([a-z0-9-]+)\.successCriteria\[(\d+)\]$/.exec(reference);
  if (flowMatch) {
    return flowMatch[1] === flowId && Number(flowMatch[2]) < (sourceFlow.successCriteria?.length ?? 0);
  }
  const pageMatch = /^pages\.json#([a-z0-9-]+)\.intentCard\.prdAnchor$/.exec(reference);
  if (pageMatch) {
    return typeof pages.get(pageMatch[1])?.intentCard?.prdAnchor === "string";
  }
  return false;
}

function runFixtureTests() {
  const draft = {
    version: "1.0.0",
    projectId: "fixture",
    flows: [{ flowId: "review", status: "draft", steps: [{ pageId: "one" }] }]
  };
  const approved = {
    version: "1.0.0",
    projectId: "fixture",
    flows: [{
      flowId: "review",
      status: "approved",
      objectRefs: ["Alert/alert-1"],
      specPath: "projects/fixture/e2e/flows/review.spec.mjs",
      steps: [
        {
          pageId: "one",
          action: "open",
          expectedRoute: "/two",
          expectedState: "filtered",
          assertionRefs: ["flows.json#review.successCriteria[0]"]
        },
        {
          pageId: "two",
          action: "inspect",
          expectedRoute: "/two#open",
          expectedState: "drawer-open",
          assertionRefs: ["pages.json#two.intentCard.prdAnchor"]
        }
      ],
      result: { route: "/two#open", sideEffect: "drawer opens" }
    }]
  };
  if (!validateSchema(draft)) errors.push(`draft fixture failed schema: ${ajv.errorsText(validateSchema.errors)}`);
  if (!validateSchema(approved)) errors.push(`approved fixture failed schema: ${ajv.errorsText(validateSchema.errors)}`);
  const sameArtifact = structuredClone(approved);
  sameArtifact.version = "1.1.0";
  sameArtifact.artifactUnderTest = {
    artifactId: "11111111-1111-4111-8111-111111111111",
    receiptPath: "evidence/artifact-under-test.json"
  };
  sameArtifact.flows[0].specPath = "e2e/flows/review.spec.mjs";
  if (!validateSchema(sameArtifact)) {
    errors.push(`same-artifact fixture failed schema: ${ajv.errorsText(validateSchema.errors)}`);
  }
  const missingArtifact = structuredClone(sameArtifact);
  delete missingArtifact.artifactUnderTest;
  if (validateSchema(missingArtifact)) errors.push("flow 1.1 fixture without artifactUnderTest unexpectedly passed schema");
  const legacyWithArtifact = structuredClone(approved);
  legacyWithArtifact.artifactUnderTest = sameArtifact.artifactUnderTest;
  if (validateSchema(legacyWithArtifact)) errors.push("flow 1.0 fixture with artifactUnderTest unexpectedly passed schema");
  const invalidApproved = structuredClone(approved);
  delete invalidApproved.flows[0].steps[0].assertionRefs;
  if (validateSchema(invalidApproved)) errors.push("approved fixture without assertionRefs unexpectedly passed schema");
  const blindV12 = structuredClone(sameArtifact);
  blindV12.version = "1.2.0";
  blindV12.runId = "blind-prd-02-replacement-01";
  blindV12.arm = "consumer";
  blindV12.artifactUnderTest = {
    artifactId: "11111111-1111-4111-8111-111111111111",
    receiptSha256: "a".repeat(64),
    sealSha256: "b".repeat(64)
  };
  blindV12.evaluator = {
    evaluatorId: "eval-blind-prd-02-replacement-01",
    revision: 1
  };
  blindV12.flows[0].steps[1].expectedRoute = "/one#open";
  blindV12.flows[0].result.route = "/one#open";
  blindV12.flows[0].result.recovery = "return restores the prior list state";
  blindV12.flows[0].result.recoveryInteractionId = "review-recovery";
  blindV12.flows[0].result.recoveryExpectedRoute = "/two";
  blindV12.flows[0].steps = blindV12.flows[0].steps.map((step, index) => ({
    stepId: `review-step-${index + 1}`,
    interactionId: `review-interaction-${index + 1}`,
    runtimeAssertions: [{
      assertionId: `review-runtime-${index + 1}`,
      assertionRef: step.assertionRefs[0],
      targetId: `review-state-${index + 1}`,
      matcher: "visible",
      attribute: null,
      expected: true
    }],
    ...step
  }));
  blindV12.flows[0].result.sideEffectAssertions = [{
    assertionId: "review-side-effect",
    targetId: "review-side-effect-state",
    matcher: "text-includes",
    attribute: null,
    expected: "restored"
  }];
  try {
    validateFlowV12(blindV12);
  } catch (error) {
    errors.push(`flow 1.2 fixture failed: ${error.message}`);
  }
  const fixtureProjectRoot = resolve(projectsRoot, "sample-flow-project");
  const evaluatorRelativeSpecError = validateSpecPath({
    flowId: "fixture-v12",
    specPath: "e2e/flows/security-source-to-asset-review.spec.mjs"
  }, fixtureProjectRoot, "1.2.0");
  if (evaluatorRelativeSpecError) {
    errors.push(`flow 1.2 evaluator-relative spec fixture failed: ${evaluatorRelativeSpecError}`);
  }
  const legacySpecAcceptedByV12 = validateSpecPath({
    flowId: "fixture-v12",
    specPath: "projects/sample-flow-project/e2e/flows/security-source-to-asset-review.spec.mjs"
  }, fixtureProjectRoot, "1.2.0") === null;
  if (legacySpecAcceptedByV12) {
    errors.push("flow 1.2 legacy specPath unexpectedly passed the evaluator-relative rule");
  }
  if (errors.length === 0) {
    console.log("flow-acceptance fixture tests passed: 1.0-compatible; 1.1-artifact-required; 1.2-stable-identity; 1.2-evaluator-relative-spec; missing-assertion=blocked; declarative-runtime-assertions=required");
  }
}

function projectRoots() {
  if (projectArg && projectRootArg) {
    errors.push("--project and --project-root cannot be used together");
    return [];
  }
  if (projectRootArg) {
    return [{ root: resolve(process.cwd(), projectRootArg), enforceDirectoryName: false }];
  }
  if (projectArg) {
    const target = resolve(kitRoot, projectArg);
    if (!isInside(projectsRoot, target)) {
      errors.push(`--project escapes projects/: ${projectArg}`);
      return [];
    }
    return [{ root: target, enforceDirectoryName: true }];
  }
  if (!existsSync(projectsRoot)) return [];
  return readdirSync(projectsRoot)
    .map((name) => resolve(projectsRoot, name))
    .filter((path) => statSync(path).isDirectory())
    .map((root) => ({ root, enforceDirectoryName: true }));
}

function readArg(name) {
  const index = values.indexOf(name);
  return index === -1 ? null : values[index + 1];
}

function tryReadJson(file) {
  if (!existsSync(file)) {
    errors.push(`${relativeToKit(file)} is missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${relativeToKit(file)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function routePath(route) {
  return route.split(/[?#]/, 1)[0];
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(":"));
}

function relativeToKit(file) {
  return relative(kitRoot, file).replaceAll("\\", "/");
}
