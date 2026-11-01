import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const decisionPath = resolve(kitRoot, "quality/image2-strategy/image2-routing-strategy-amendment-2026-08-14.json");
const schemaPath = resolve(kitRoot, "schema/image2-routing-strategy-amendment.schema.json");
const manifestPath = resolve(kitRoot, "workflows.manifest.json");
const args = new Set(process.argv.slice(2));
const unexpected = [...args].filter((value) => value !== "--test-fixtures");
if (unexpected.length) fail(`unknown argument ${unexpected[0]}`);

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, formats: { "date-time": true } });
const validateSchema = ajv.compile(readJson(schemaPath));
const decision = readJson(decisionPath);
const manifest = readJson(manifestPath);
const errors = validateCandidate(decision, manifest);

if (args.has("--test-fixtures")) runNegativeFixtures();

if (errors.length) {
  for (const error of errors) console.error(`validate-image2-routing-policy failed: ${error}`);
  process.exit(1);
}

console.log(`validate-image2-routing-policy passed: existing=direct; exploratory=visual-only; restart-5=paused-by-strategy-review 0/2; locks=7`);

function validateCandidate(candidate, candidateManifest) {
  const candidateErrors = [];
  if (!validateSchema(candidate)) {
    candidateErrors.push(`decision schema errors: ${ajv.errorsText(validateSchema.errors, { separator: "; " })}`);
    return candidateErrors;
  }

  const existing = candidate.routing.routes.find((route) => route.id === "existing");
  const exploratory = candidate.routing.routes.find((route) => route.id === "exploratory");
  assert(existing && exploratory && candidate.routing.routes.length === 2, "routing must define exactly existing and exploratory", candidateErrors);
  if (existing) {
    assert(existing.defaultForGeneralB2B === true, "existing must remain the general B2B default", candidateErrors);
    assert(existing.image2Allowed === false, "existing cannot allow Image2", candidateErrors);
    assert(!existing.skillSequence.includes("gpt-image-2") && !existing.skillSequence.includes("Image-to-html"), "existing skill sequence cannot include Image2 or Image-to-html", candidateErrors);
    assert(deepEqual(existing.pipeline, ["design-contract", "figma-or-component-foundation", "pattern-recipe", "implementation", "verification"]), "existing direct pipeline drifted", candidateErrors);
  }
  if (exploratory) {
    assert(exploratory.defaultForGeneralB2B === false && exploratory.image2Allowed === true, "exploratory must stay opt-in with Image2 allowed", candidateErrors);
    assert(exploratory.frozenVisualBriefRequired === true, "exploratory cannot bypass the frozen visual brief", candidateErrors);
    assert(deepEqual(exploratory.allowedVisualGoals, ["composition", "atmosphere", "material", "brand", "visual-direction"]), "exploratory visual goals drifted", candidateErrors);
    assert(deepEqual(exploratory.structuralAuthority, ["copy", "data", "interaction", "component-states", "responsive", "accessibility"]), "exploratory structural authority drifted", candidateErrors);
  }

  assert(candidate.restart5.status === "paused-by-strategy-review" && candidate.restart5.executionAllowed === false, "restart-5 cannot be completed, passed, or executable", candidateErrors);
  assert(candidate.restart5.budget.consumed === 0 && candidate.restart5.budget.hardMaximum === 2 && candidate.restart5.budget.remaining === 2, "restart-5 budget must remain 0/2", candidateErrors);
  assert(candidate.restart5.requestFreshInputsNow === false, "restart-5 cannot request fresh inputs while paused", candidateErrors);
  assert(candidate.restart5.historicalAuthorizationMutationAllowed === false && candidate.restart5.historicalResultRewriteAllowed === false, "historical restart-5 authorization or result cannot be rewritten", candidateErrors);

  const lockValues = [candidate.locks.figma.locked, candidate.locks.image2GenerationLocked, candidate.locks.referenceGenerationLocked, candidate.locks.candidateGenerationLocked, candidate.locks.reviewersLocked, candidate.locks.freshPrivateInputReadLocked, candidate.locks.pushLocked];
  assert(lockValues.every((value) => value === true), "Figma, generation, Reviewer, private-input, and push locks must remain closed", candidateErrors);

  const workflow = candidateManifest.workflows?.find((entry) => entry.id === "image2-to-figma-page");
  assert(workflow, "Image2 workflow is missing from workflows.manifest.json", candidateErrors);
  if (workflow) {
    assert(workflow.routePolicy?.decision === "quality/image2-strategy/image2-routing-strategy-amendment-2026-08-14.json", "manifest route policy decision path drifted", candidateErrors);
    assert(deepEqual(workflow.routePolicy?.routes, candidate.routing.routes), "manifest route policy does not match the append-only decision", candidateErrors);
    assert(workflow.routePolicy?.defaultRoute === "existing" && workflow.routePolicy?.unknownRouteDisposition === "fail-closed", "manifest route policy is not fail-closed", candidateErrors);
    assert(!workflow.tools?.skills?.includes("gpt-image-2") && !workflow.tools?.skills?.includes("Image-to-html"), "manifest global skills still force Image2", candidateErrors);
    assert(workflow.artifacts?.some((entry) => entry.id === "routing-strategy-amendment" && entry.path === workflow.routePolicy.decision), "manifest is missing the strategy amendment artifact", candidateErrors);
    assert(workflow.acceptanceGates?.some((entry) => entry.id === "routing-strategy-amendment"), "manifest is missing the strategy amendment gate", candidateErrors);
    assert(workflow.completion?.summary?.includes("paused-by-strategy-review") && workflow.completion.summary.includes("0/2"), "manifest completion does not record restart-5 paused at 0/2", candidateErrors);
  }

  return candidateErrors;
}

function runNegativeFixtures() {
  const cases = [
    ["existing-forces-image2", (candidate) => {
      const route = candidate.routing.routes.find((entry) => entry.id === "existing");
      route.image2Allowed = true;
      route.skillSequence.push("gpt-image-2");
    }],
    ["exploratory-bypasses-frozen-visual-brief", (candidate) => {
      candidate.routing.routes.find((entry) => entry.id === "exploratory").frozenVisualBriefRequired = false;
    }],
    ["restart-5-claims-completed", (candidate) => {
      candidate.restart5.status = "completed";
      candidate.restart5.executionAllowed = true;
    }],
    ["restart-5-rewrites-history", (candidate) => {
      candidate.restart5.historicalAuthorizationMutationAllowed = true;
      candidate.restart5.historicalResultRewriteAllowed = true;
    }],
    ["unlocks-figma-and-generation", (candidate) => {
      candidate.locks.figma.locked = false;
      candidate.locks.image2GenerationLocked = false;
      candidate.locks.referenceGenerationLocked = false;
    }],
    ["manifest-strategy-artifact-missing", (candidate, candidateManifest) => {
      const workflow = candidateManifest.workflows.find((entry) => entry.id === "image2-to-figma-page");
      workflow.artifacts = workflow.artifacts.filter((entry) => entry.id !== "routing-strategy-amendment");
    }],
    ["manifest-paused-summary-drift", (candidate, candidateManifest) => {
      const workflow = candidateManifest.workflows.find((entry) => entry.id === "image2-to-figma-page");
      workflow.completion.summary = workflow.completion.summary.replace("paused-by-strategy-review", "authorized-pending-input");
    }]
  ];
  for (const [name, mutate] of cases) {
    const candidate = structuredClone(decision);
    const candidateManifest = structuredClone(manifest);
    mutate(candidate, candidateManifest);
    const fixtureErrors = validateCandidate(candidate, candidateManifest);
    if (fixtureErrors.length === 0) errors.push(`negative fixture unexpectedly passed: ${name}`);
  }
}

function assert(condition, message, target) {
  if (!condition) target.push(message);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { fail(`${file} is not valid JSON: ${error.message}`); }
}

function fail(message) {
  console.error(`validate-image2-routing-policy failed: ${message}`);
  process.exit(1);
}
