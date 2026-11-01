import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sampleRoot = resolve(kitRoot, "design-systems/ops-canvas");
const errors = [];
const requiredFiles = [
  "Design.md", "tokens.json", "theme.config.json", "component-index.json", "figma/sync.contract.json",
  "spec/index.html", "spec/styles.css", "spec/app.js", "workflow/existing.request.json", "workflow/reference-prompt.md",
  "workflow/reference-generation.evidence.json", "workflow/reconstruction.evidence.json", "workflow/browser-evidence.json",
  "workflow/visual-diff.evidence.json", "workflow/visual-diff-artifacts/metrics.json", "workflow/visual-diff-artifacts/heatmap.png",
  "workflow/visual-calibration-proposal.md", "workflow/visual-calibration-decision.json",
  "workflow/independent-review-packet-2026-07-30.md",
  "workflow/reviews/ops-canvas-2026-07-17.image2-reviewer-c-20260730.json",
  "workflow/reviews/ops-canvas-2026-07-17.image2-reviewer-d-20260730.json",
  "workflow/delivery-verification.evidence.json", "workflow/existing-run.json"
];
for (const file of requiredFiles) if (!existsSync(resolve(sampleRoot, file))) errors.push(`missing ${file}`);

const tokens = readJson(resolve(sampleRoot, "tokens.json"));
const index = readJson(resolve(sampleRoot, "component-index.json"));
const sync = readJson(resolve(sampleRoot, "figma/sync.contract.json"));
const theme = readJson(resolve(sampleRoot, "theme.config.json"));
const html = readText(resolve(sampleRoot, "spec/index.html"));
const css = readText(resolve(sampleRoot, "spec/styles.css"));
const design = readText(resolve(sampleRoot, "Design.md"));
const browserEvidence = readJson(resolve(sampleRoot, "workflow/browser-evidence.json"));
const visualDiffEvidence = readJson(resolve(sampleRoot, "workflow/visual-diff.evidence.json"));
const visualDiffConfig = readJson(resolve(sampleRoot, "workflow/visual-diff.config.json"));
const visualMetrics = readJson(resolve(sampleRoot, "workflow/visual-diff-artifacts/metrics.json"));
const calibrationDecision = readJson(resolve(sampleRoot, "workflow/visual-calibration-decision.json"));
const calibrationReviewPaths = [
  "design-systems/ops-canvas/workflow/reviews/ops-canvas-2026-07-17.image2-reviewer-c-20260730.json",
  "design-systems/ops-canvas/workflow/reviews/ops-canvas-2026-07-17.image2-reviewer-d-20260730.json"
];
const calibrationReviews = calibrationReviewPaths.map((path) => readJson(resolve(kitRoot, path)));
const existingRun = readJson(resolve(sampleRoot, "workflow/existing-run.json"));
const request = readJson(resolve(sampleRoot, "workflow/existing.request.json"));

for (const category of ["color", "typography", "spacing", "radius", "shadow", "layout", "motion"]) {
  if (!tokens.tokens?.[category] || !Object.keys(tokens.tokens[category]).length) errors.push(`token category ${category} is empty`);
}
for (const [name, token] of Object.entries(tokens.tokens?.color ?? {})) {
  if (!token.light || !token.dark) errors.push(`color.${name} must define light and dark modes`);
}
if (theme.defaultMode !== "light" || !theme.modes?.light || !theme.modes?.dark) errors.push("theme config must define light and dark modes");

const expected = { base: 4, composite: 3, shell: 1 };
for (const [category, count] of Object.entries(expected)) {
  const actual = index.components?.filter((component) => component.category === category).length ?? 0;
  if (actual !== count) errors.push(`component category ${category} expected ${count}, received ${actual}`);
}
const ids = new Set();
for (const component of index.components ?? []) {
  if (ids.has(component.id)) errors.push(`duplicate component id ${component.id}`);
  ids.add(component.id);
  if (component.figmaNodeId !== null) errors.push(`${component.id} must keep figmaNodeId null while audit is external-blocked`);
  if (!html.includes(`data-component="${component.id}"`)) errors.push(`HTML spec does not demonstrate ${component.id}`);
  for (const token of component.tokens ?? []) {
    const separator = token.indexOf(".");
    const category = token.slice(0, separator);
    const name = token.slice(separator + 1);
    if (!tokens.tokens?.[category]?.[name]) errors.push(`${component.id} references unknown token ${token}`);
  }
}

if (sync.status !== "external-blocked" || sync.target?.fileKey !== null || sync.target?.pageNodeId !== null) errors.push("Figma sync contract must remain external-blocked with null target IDs");
const syncIds = new Set((sync.componentSets ?? []).map((component) => component.sourceId));
for (const id of ids) if (!syncIds.has(id)) errors.push(`Figma sync contract is missing ${id}`);
if ((sync.componentSets ?? []).some((component) => component.nodeId !== null || component.autoLayoutRequired !== true)) errors.push("Figma component sets must require Auto Layout and keep unavailable node IDs null");

for (const heading of ["## Foundations", "## Components", "## Figma synchronization"]) if (!design.includes(heading)) errors.push(`Design.md is missing ${heading}`);
for (const contract of ["--motion-quick", "--motion-fast", "prefers-reduced-motion", "grid-template-columns: 240px"]) if (!css.includes(contract)) errors.push(`styles.css is missing ${contract}`);

if (browserEvidence.url !== "http://127.0.0.1:4177/" || browserEvidence.console?.browserErrors !== 0 || browserEvidence.console?.playwrightErrors !== 0) errors.push("browser evidence must use the unique local URL and report zero errors");
for (const screenshot of browserEvidence.screenshots ?? []) {
  const file = resolve(kitRoot, screenshot.path);
  if (!existsSync(file)) errors.push(`browser screenshot is missing: ${screenshot.path}`);
  else if (createHash("sha256").update(readFileSync(file)).digest("hex") !== screenshot.sha256) errors.push(`browser screenshot hash mismatch: ${screenshot.path}`);
}
const filterEvidence = browserEvidence.interactions?.find((interaction) => interaction.id === "work-order-filter");
if (filterEvidence?.assertions?.resultLabel !== "1 result" || filterEvidence.assertions.visibleOrderIds?.join(",") !== "WO-2042") errors.push("browser filter evidence does not prove the unique WO-2042 result");

for (const source of existingRun.frozenContext?.sources ?? []) {
  const file = resolve(kitRoot, source.path);
  if (!existsSync(file)) errors.push(`frozen existing source is missing: ${source.path}`);
  else if (createHash("sha256").update(readFileSync(file)).digest("hex") !== source.sha256) errors.push(`frozen existing source hash mismatch: ${source.path}`);
}
const frozenHash = createHash("sha256").update(stableJson(existingRun.frozenContext?.sources ?? [])).digest("hex");
if (frozenHash !== existingRun.frozenContext?.contractSha256) errors.push("existing route contract hash does not match its frozen sources");
if (existingRun.stages?.find((stage) => stage.id === "browser-playwright")?.status !== "passed") errors.push("existing run must record Browser and Playwright as passed");
const visualStage = existingRun.stages?.find((stage) => stage.id === "visual-diff");
if (request.referenceImage) {
  if (!["passed", "failed"].includes(visualStage?.status)) errors.push("existing run with a reference image must record the real visual diff as passed or failed");
  if (visualStage?.status === "failed" && !visualStage.evidence?.includes("design-systems/ops-canvas/workflow/visual-diff.evidence.json")) errors.push("failed real visual diff must cite its workflow evidence record");
  if (visualStage?.status === "failed" && visualDiffEvidence.status !== "failed") errors.push("failed real visual diff stage must cite a failed workflow evidence record");
  if (visualStage?.status === "failed" && existingRun.status !== "failed") errors.push("existing run must fail when the real visual diff gate fails");
} else if (visualStage?.status !== "ready") errors.push("existing run must keep page visual diff ready until a generated reference image exists");
if (calibrationDecision.status !== "approved") errors.push("visual calibration decision must record approved status");
if (calibrationDecision.decision !== "approve-semantic-exception-and-calibration") errors.push("visual calibration decision must record the approved semantic exception choice");
if (calibrationDecision.outcome !== "accepted-with-semantic-exception") errors.push("visual calibration decision must record the semantic exception outcome");
if (Number.isNaN(Date.parse(calibrationDecision.decidedAt))) errors.push("visual calibration decision must record decidedAt");
if (calibrationDecision.machineVerdict !== "failed" || visualDiffEvidence.status !== "failed" || visualMetrics.result !== "fail" || visualStage?.status !== "failed" || existingRun.status !== "failed") {
  errors.push("semantic approval must not override any raw visual failure record");
}
if (
  calibrationDecision.calibrationStudy?.status !== "authorized" ||
  calibrationDecision.calibrationStudy?.requiredPairs !== 24 ||
  calibrationDecision.calibrationStudy?.collectedPairs !== 2 ||
  calibrationDecision.calibrationStudy?.qualifiedPairs !== 2 ||
  calibrationDecision.calibrationStudy?.completedPairs !== 2 ||
  calibrationDecision.calibrationStudy?.acceptedPairs !== 1 ||
  calibrationDecision.calibrationStudy?.rejectedPairs !== 1 ||
  calibrationDecision.calibrationStudy?.disputedPairs !== 0 ||
  calibrationDecision.calibrationStudy?.gateChangeAuthorized !== false
) {
  errors.push("visual calibration study must remain authorized, incomplete, and unable to change gates");
}
if (calibrationDecision.rawGateOverride !== false || calibrationDecision.thresholdChangeApproved !== false) {
  errors.push("formal calibration reviews must not override the raw gate or approve threshold changes");
}
const reviewerIds = new Set();
for (const review of calibrationReviews) {
  if (review.version !== "1.0.0" || review.pairId !== "ops-canvas-2026-07-17") errors.push("Ops Canvas calibration review identity is invalid");
  if (reviewerIds.has(review.reviewerId)) errors.push(`duplicate Ops Canvas reviewer ID: ${review.reviewerId}`);
  reviewerIds.add(review.reviewerId);
  if (
    review.independence?.participatedInImplementationOrEvidence !== false ||
    review.independence?.sawOtherReviewerDecisionBeforeSubmission !== false ||
    review.independence?.sawMachineMetricsBeforeFreezingLabel !== false
  ) {
    errors.push(`${review.reviewerId} does not satisfy the independent blind-review contract`);
  }
  if (
    review.inputs?.referenceSha256 !== visualMetrics.images?.baselineSha256 ||
    review.inputs?.candidateSha256 !== visualMetrics.images?.candidateSha256
  ) {
    errors.push(`${review.reviewerId} input hashes do not match the frozen Ops Canvas pair`);
  }
  if (!["accepted", "rejected"].includes(review.calibrationLabel) || !["accepted", "rejected"].includes(review.semanticVerdict) || !["accepted", "rejected"].includes(review.pixelFidelityVerdict)) {
    errors.push(`${review.reviewerId} contains an invalid calibration verdict`);
  }
  if (!["yes", "no"].includes(review.interactionEvidenceSupportsTask) || !["yes", "no"].includes(review.machineResultMatchedExpectation)) {
    errors.push(`${review.reviewerId} contains an invalid evidence result`);
  }
  if (Number.isNaN(Date.parse(review.reviewedAt))) errors.push(`${review.reviewerId} reviewedAt is invalid`);
}
const reviewLabels = new Set(calibrationReviews.map((review) => review.calibrationLabel));
if (reviewLabels.size !== 1 || !reviewLabels.has("rejected")) errors.push("Ops Canvas pair must retain the two-reviewer rejected calibration verdict");
if (calibrationDecision.formalCalibrationVerdict !== "rejected") errors.push("Ops Canvas calibration decision must record the formal rejected verdict");
const recordedReviews = calibrationDecision.reviews ?? [];
if (
  recordedReviews.length !== 2 ||
  recordedReviews.some((review) => review.independence !== "independent-blind-calibration-review" || review.calibrationLabel !== "rejected") ||
  calibrationReviewPaths.some((path) => !recordedReviews.some((review) => review.recordPath === path))
) {
  errors.push("Ops Canvas calibration decision must bind both independent rejected review records");
}
if (calibrationDecision.evidence?.referenceSha256 !== visualMetrics.images?.baselineSha256 || calibrationDecision.evidence?.candidateSha256 !== visualMetrics.images?.candidateSha256) {
  errors.push("visual calibration decision hashes must match the real visual metrics");
}
const expectedFullThresholds = {
  minSsim: visualDiffConfig.thresholds?.minSsim,
  maxRms: visualDiffConfig.thresholds?.maxRms,
  maxChangedPixelRatio: visualDiffConfig.thresholds?.maxChangedPixelRatio
};
const expectedRegionThresholds = {
  minSsim: visualDiffConfig.regions?.[0]?.thresholds?.minSsim,
  maxRms: visualDiffConfig.regions?.[0]?.thresholds?.maxRms,
  maxChangedPixelRatio: visualDiffConfig.regions?.[0]?.thresholds?.maxChangedPixelRatio
};
if (stableJson(calibrationDecision.immutableThresholds?.fullPage) !== stableJson(expectedFullThresholds) || stableJson(calibrationDecision.immutableThresholds?.criticalRegion) !== stableJson(expectedRegionThresholds)) {
  errors.push("visual calibration decision thresholds must match the immutable diff config");
}
if (calibrationDecision.immutableThresholds?.pixelDeltaThreshold !== visualDiffConfig.thresholds?.pixelDeltaThreshold || calibrationDecision.immutableThresholds?.pixelDeltaThreshold !== visualDiffConfig.regions?.[0]?.thresholds?.pixelDeltaThreshold) {
  errors.push("visual calibration decision pixel delta must match every immutable diff scope");
}
for (const evidencePath of Object.values(calibrationDecision.evidence ?? {}).filter((value) => typeof value === "string" && !/^[a-f0-9]{64}$/.test(value))) {
  if (!existsSync(resolve(kitRoot, evidencePath))) errors.push(`visual calibration evidence is missing: ${evidencePath}`);
}
if (!existsSync(resolve(kitRoot, calibrationDecision.proposalPath ?? ""))) errors.push("visual calibration proposal path is missing");
if (existingRun.stages?.find((stage) => stage.id === "figma-generate-design")?.status !== "external-blocked") errors.push("existing run must stop Figma capture at the external boundary");
if (existingRun.stages?.find((stage) => stage.id === "figma-component-rebuild")?.status !== "external-blocked") errors.push("existing run must keep Figma component reconstruction at the external boundary");
for (const artifact of Object.values(existingRun.artifacts ?? {})) if (!existsSync(resolve(kitRoot, artifact))) errors.push(`existing run artifact is missing: ${artifact}`);

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, formats: { "date-time": true } });
const validateRequest = ajv.compile(readJson(resolve(kitRoot, "schema/legacy/image2-workflow-request.v1.schema.json")));
if (!validateRequest(request)) errors.push(`legacy v1 existing request schema errors: ${ajv.errorsText(validateRequest.errors, { separator: "; " })}`);
const validateRun = ajv.compile(readJson(resolve(kitRoot, "schema/legacy/image2-workflow-run.v1.schema.json")));
if (!validateRun(existingRun)) errors.push(`legacy v1 existing run schema errors: ${ajv.errorsText(validateRun.errors, { separator: "; " })}`);
const validateWorkflowEvidence = ajv.compile(readJson(resolve(kitRoot, "schema/workflow-evidence.schema.json")));
for (const file of ["reference-generation.evidence.json", "reconstruction.evidence.json", "visual-diff.evidence.json", "delivery-verification.evidence.json"]) {
  const evidence = readJson(resolve(sampleRoot, "workflow", file));
  if (!validateWorkflowEvidence(evidence)) errors.push(`${file} schema errors: ${ajv.errorsText(validateWorkflowEvidence.errors, { separator: "; " })}`);
}

if (errors.length) {
  for (const error of errors) console.error(`validate-design-system-sample failed: ${error}`);
  process.exit(1);
}
console.log(`validate-design-system-sample passed: tokens=${countTokens(tokens.tokens)}; components=${ids.size}; modes=2; figma=external-blocked`);

function countTokens(groups) { return Object.values(groups ?? {}).reduce((count, group) => count + Object.keys(group).length, 0); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function readText(file) { return readFileSync(file, "utf8"); }
function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { console.error(`validate-design-system-sample failed: invalid JSON ${file}: ${error.message}`); process.exit(1); }
}
