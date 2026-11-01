import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { decodePng } from "../visual-diff/lib/png.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const requestPath = resolveInsideKit(args.request);
const outputPath = resolveInsideKit(args.out);
const request = readJson(requestPath);
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, formats: { "date-time": true } });
const validateRequest = ajv.compile(readJson(resolve(kitRoot, "schema/image2-workflow-request.schema.json")));
const validateRun = ajv.compile(readJson(resolve(kitRoot, "schema/image2-workflow-run.schema.json")));
const validateWorkflowEvidence = ajv.compile(readJson(resolve(kitRoot, "schema/workflow-evidence.schema.json")));
const confirmedPromptScope = "fenced-text-block-under-prompt-heading";

if (!validateRequest(request)) fail(`request schema errors: ${ajv.errorsText(validateRequest.errors, { separator: "; " })}`);
assertNoPlaceholder(request.figmaTarget.fileKey, "figmaTarget.fileKey");
assertNoPlaceholder(request.figmaTarget.pageNodeId, "figmaTarget.pageNodeId");

const sources = request.designContext === "existing" ? freezeExisting(request.existingContext) : freezeExploratory(request.exploratoryContext);
const pagePath = requireFile(request.pageEntry, "pageEntry");
const promptPath = request.designContext === "exploratory" ? requireFile(request.referencePrompt, "referencePrompt") : null;
const referenceImagePath = request.referenceImage ? requireFile(request.referenceImage, "referenceImage") : null;
const configPath = requireFile(request.visualDiffConfig, "visualDiffConfig");
const browserEvidencePath = request.browserEvidence ? requireFile(request.browserEvidence, "browserEvidence") : null;
const figmaEvidencePath = requireFile(request.figmaEvidence, "figmaEvidence");

const frozenPayload = request.designContext === "existing"
  ? sources
  : {
      selectedDirectionId: request.exploratoryContext.selectedDirectionId,
      miniDesignBrief: request.exploratoryContext.miniDesignBrief,
      image2Scope: request.exploratoryContext.image2Scope,
      structuralAuthority: request.exploratoryContext.structuralAuthority,
      sources
    };
const frozenContext = {
  kind: request.designContext === "existing" ? "existing-design-system" : "mini-design-brief",
  contractSha256: hash(Buffer.from(stableJson(frozenPayload))),
  sources,
  selectedDirectionId: request.designContext === "exploratory" ? request.exploratoryContext.selectedDirectionId : null
};

const browserEvidence = browserEvidencePath ? validateBrowserRecord(browserEvidencePath, request, { pagePath, referenceImagePath }) : null;
let referenceRecord = null;
let reconstructionRecord = null;
const visualConfig = readJson(configPath);
let realVisualContract = null;

if (referenceImagePath) {
  if (!browserEvidence) fail("browserEvidence is required when referenceImage is supplied");
  referenceRecord = validateReferenceRecord({
    request,
    referenceImagePath,
    promptPath,
    pagePath,
    frozenContext
  });
  reconstructionRecord = validateReconstructionRecord({
    request,
    referenceImagePath,
    metadataPath: referenceRecord.metadataPath,
    pagePath
  });
  realVisualContract = validateRealVisualConfig({
    configPath,
    visualConfig,
    referenceImagePath,
    referenceRecord,
    browserEvidence
  });
}

const visual = spawnSync(process.execPath, [resolve(kitRoot, "scripts/visual-diff.mjs"), "--config", configPath], {
  cwd: kitRoot,
  encoding: "utf8",
  windowsHide: true
});
if (![0, 1].includes(visual.status)) fail(`visual diff gate exited ${visual.status}: ${(visual.stderr || visual.stdout).trim()}`);
const visualFailed = visual.status === 1;

const configDirectory = dirname(configPath);
const metricsFile = resolveConfigPath(configDirectory, visualConfig.output.metrics, "output.metrics");
const heatmapFile = resolveConfigPath(configDirectory, visualConfig.output.heatmap, "output.heatmap");
if (realVisualContract) validateVisualMetrics(metricsFile, heatmapFile, visualConfig, realVisualContract, visualFailed ? "fail" : "pass");
const metricsPath = relativeToKit(metricsFile);
const heatmapPath = relativeToKit(heatmapFile);
const figmaEvidence = relativeToKit(figmaEvidencePath);

const figmaBlocked = request.figmaTarget.fileKey === null || request.figmaTarget.pageNodeId === null;
const blockers = [];
if (visualFailed) {
  blockers.push({
    dependency: "visual-diff-thresholds",
    reason: "The executed visual comparison produced valid metrics and failed one or more immutable thresholds.",
    resumeRequirements: ["Review the recorded metrics and heatmap, then iterate pixel fidelity or approve a separately recorded calibration decision"]
  });
}
if (figmaBlocked && request.designContext === "exploratory") {
  blockers.push({
      dependency: "figma-authorized-target",
      reason: "No real authorized Figma fileKey and target page node were supplied for capture and component reconstruction.",
      resumeRequirements: ["Provide a real Figma fileKey", "Grant read and write scope", "Provide or approve the target page node"]
  });
}

const visualStage = visualFailed
  ? { id: "visual-diff", status: "failed", summary: "The executed comparison produced valid full-image and critical-region metrics and failed the immutable thresholds.", evidence: realVisualContract ? [relativeToKit(referenceImagePath), relativeToKit(configPath), metricsPath, heatmapPath] : [relativeToKit(configPath), metricsPath, heatmapPath] }
  : realVisualContract
    ? { id: "visual-diff", status: "passed", summary: "The real reference, Playwright full-page capture, critical regions, and generated metrics passed the immutable thresholds.", evidence: [relativeToKit(referenceImagePath), relativeToKit(configPath), metricsPath, heatmapPath] }
    : { id: "visual-diff", status: "ready", summary: "The immutable diff runner fixture passed; page comparison awaits a recorded generated reference image.", evidence: [metricsPath, heatmapPath] };

const run = {
  $schema: relative(dirname(outputPath), resolve(kitRoot, "schema/image2-workflow-run.schema.json")).replaceAll("\\", "/"),
  version: "2.0.0",
  runId: `${request.requestId}-run`,
  requestId: request.requestId,
  designContext: request.designContext,
  routing: request.designContext === "existing"
    ? {
        strategyDecisionId: request.routing.strategyDecisionId,
        selectedRoute: "existing",
        image2Policy: "forbidden",
        pipeline: ["design-contract", "figma-or-component-foundation", "pattern-recipe", "implementation", "verification"]
      }
    : {
        strategyDecisionId: request.routing.strategyDecisionId,
        selectedRoute: "exploratory",
        image2Policy: "allowed-visual-exploration-only",
        pipeline: ["frozen-visual-brief", "gpt-image-2", "image-to-html", "implementation", "verification"]
      },
  status: visualFailed ? "failed" : request.designContext === "exploratory" && figmaBlocked ? "external-blocked" : "in-progress",
  recordedAt: new Date().toISOString(),
  frozenContext,
  stages: request.designContext === "existing"
    ? existingStages({ sources, pagePath, browserEvidence, browserEvidencePath, visualStage, figmaEvidence, request })
    : exploratoryStages({ sources, pagePath, promptPath, referenceImagePath, referenceRecord, reconstructionRecord, browserEvidence, browserEvidencePath, visualStage, figmaBlocked, figmaEvidence, request }),
  artifacts: { pageEntry: relativeToKit(pagePath), visualMetrics: metricsPath, visualHeatmap: heatmapPath, figmaEvidence },
  blockers
};

if (!validateRun(run)) fail(`run schema errors: ${ajv.errorsText(validateRun.errors, { separator: "; " })}`);
writeFileSync(outputPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
const outcome = visualFailed ? "recorded" : "passed";
console.log(`run-image2-workflow ${outcome}: route=${request.designContext}; status=${run.status}; output=${relativeToKit(outputPath)}`);
if (visualFailed) process.exitCode = 1;

function existingStages({ sources, pagePath, browserEvidence, browserEvidencePath, visualStage, figmaEvidence, request }) {
  return [
    { id: "design-contract-freeze", status: "passed", summary: "Frozen the structured design, token, and sync contracts before page work.", evidence: sources.slice(0, 4).map((source) => source.path) },
    { id: "component-foundation", status: "passed", summary: "The real component index and Figma or local foundation are present and receipt-bound.", evidence: [request.existingContext.componentIndex, request.existingContext.figmaSyncContract] },
    { id: "pattern-recipe", status: "passed", summary: "The pattern manifest, selected recipe, and page rules are frozen for direct implementation.", evidence: [request.existingContext.patternManifest, request.existingContext.recipe, request.existingContext.rules] },
    { id: "page-implementation", status: "passed", summary: "The direct page entry is present without an Image2 reference or reconstruction stage.", evidence: [relativeToKit(pagePath)] },
    { id: "browser-playwright", status: browserEvidence ? "passed" : "ready", summary: browserEvidence ? "Validated Browser and Playwright evidence for the unique local URL, interaction gate, and clean console." : "The page is ready for the project Browser and Playwright interaction gate.", evidence: browserEvidencePath ? [relativeToKit(browserEvidencePath)] : [relativeToKit(pagePath)] },
    { ...visualStage, id: "visual-validation" },
    { id: "technical-validation", status: "ready", summary: "Project-owned typecheck, build, import, token, interaction, responsive, and accessibility adapters remain required.", evidence: [relativeToKit(pagePath), request.existingContext.rules] },
    { id: "delivery-readiness", status: "ready", summary: "Delivery becomes complete after the project technical, Browser, interaction, responsive, accessibility, and visual adapters pass.", evidence: [relativeToKit(pagePath), figmaEvidence] }
  ];
}

function exploratoryStages({ sources, pagePath, promptPath, referenceImagePath, referenceRecord, reconstructionRecord, browserEvidence, browserEvidencePath, visualStage, figmaBlocked, figmaEvidence, request }) {
  return [
    { id: "context-freeze", status: "passed", summary: "Frozen the selected visual brief, Image2 scope, structured contract, and component foundation before generation.", evidence: sources.map((source) => source.path) },
    referenceRecord
      ? { id: "gpt-image-2", status: "passed", summary: "The confirmed prompt produced one real reference image with matching dimensions and SHA-256 evidence.", evidence: [relativeToKit(promptPath), relativeToKit(referenceImagePath), relativeToKit(referenceRecord.metadataPath), relativeToKit(referenceRecord.generationEvidencePath)] }
      : { id: "gpt-image-2", status: "ready", summary: "The frozen visual brief permits one visual-exploration reference when separately authorized.", evidence: [relativeToKit(promptPath)] },
    reconstructionRecord
      ? { id: "image-to-html", status: "passed", summary: "Image-to-html evidence matches the generated reference while structural authority remains with the frozen contract and components.", evidence: [relativeToKit(reconstructionRecord.evidencePath), relativeToKit(reconstructionRecord.detailsPath)] }
      : { id: "image-to-html", status: "ready", summary: "The reconstruction adapter is ready after a real Image2 reference has been frozen.", evidence: ["skills/image2-to-figma-page/SKILL.md"] },
    { id: "page-implementation", status: "passed", summary: "The local page entry and structured product contract are present.", evidence: [relativeToKit(pagePath), request.exploratoryContext.structuredContract, request.exploratoryContext.componentFoundation] },
    { id: "browser-playwright", status: browserEvidence ? "passed" : "ready", summary: browserEvidence ? "Validated Browser and Playwright evidence for the unique local URL, screenshots, interaction gate, and clean console." : "The page is ready for the unique local URL and Playwright interaction capture gate.", evidence: browserEvidencePath ? [relativeToKit(browserEvidencePath)] : [relativeToKit(pagePath)] },
    visualStage,
    { id: "figma-generate-design", status: figmaBlocked ? "external-blocked" : "ready", summary: figmaBlocked ? "Figma capture stopped at the authorized-target boundary." : "Figma target is available for generate-design capture.", evidence: [figmaEvidence] },
    { id: "figma-component-rebuild", status: figmaBlocked ? "external-blocked" : "ready", summary: figmaBlocked ? "Variable binding, Auto Layout, and component reconstruction require the authorized Figma target." : "Component rebuilding can continue against the supplied target.", evidence: [request.exploratoryContext.componentFoundation, figmaEvidence] }
  ];
}

function validateReferenceRecord({ request, referenceImagePath, promptPath, frozenContext }) {
  const imageStem = basename(referenceImagePath, extname(referenceImagePath));
  const metadataPath = requireAbsoluteFile(resolve(dirname(referenceImagePath), `${imageStem}.metadata.json`), "reference image metadata");
  const generationEvidencePath = requireAbsoluteFile(resolve(dirname(referenceImagePath), "reference-generation.evidence.json"), "reference generation evidence");
  const metadata = readJson(metadataPath);
  const referenceInfo = readPngInfo(referenceImagePath, "referenceImage");

  if (metadata?.version !== "1.0.0" || metadata.workflowId !== request.workflowId || metadata.requestId !== request.requestId) {
    fail("reference image metadata does not identify the current workflow and request");
  }
  if (metadata.generator?.mode !== "host-native" || metadata.generator?.tool !== "imagegen" || metadata.generator?.modelIntent !== "gpt-image-2" || metadata.generator?.variants !== 1) {
    fail("reference image metadata must record a real gpt-image-2 generation");
  }
  if (metadata.prompt?.confirmed !== true) fail("reference image metadata must record prompt.confirmed=true");
  if (metadata.prompt?.confirmedPromptScope !== confirmedPromptScope) fail(`reference image metadata must record prompt.confirmedPromptScope=${confirmedPromptScope}`);
  assertRecordedPath(metadata.prompt?.path, promptPath, "reference metadata prompt.path");
  const confirmedPrompt = extractConfirmedPrompt(readFileSync(promptPath, "utf8"));
  if (metadata.prompt?.sha256 !== hash(Buffer.from(confirmedPrompt, "utf8"))) fail("reference metadata prompt SHA-256 does not match the confirmed fenced Prompt block");
  if (metadata.frozenContractSha256 !== frozenContext.contractSha256) fail("reference metadata frozen contract SHA-256 does not match the current frozen context");
  assertImageRecord(metadata.reference, referenceImagePath, referenceInfo, "reference metadata reference");
  if (referenceInfo.width !== request.viewport.width || referenceInfo.height !== request.viewport.height) {
    fail(`referenceImage dimensions ${referenceInfo.width}x${referenceInfo.height} do not match request viewport ${request.viewport.width}x${request.viewport.height}`);
  }

  if (!isPlainObject(metadata.source)) fail("reference metadata source is required");
  const sourcePath = requireFile(metadata.source.path, "reference metadata source.path");
  const sourceInfo = readPngInfo(sourcePath, "reference metadata source");
  assertImageRecord(metadata.source, sourcePath, sourceInfo, "reference metadata source");

  const generationEvidence = validateWorkflowEvidenceRecord(generationEvidencePath, "reference generation evidence");
  requirePassedEvidence(generationEvidence, "reference generation evidence", [
    relativeToKit(promptPath),
    relativeToKit(referenceImagePath),
    relativeToKit(metadataPath)
  ]);
  if (!generationEvidence.commands.some((command) => command.exitCode === 0 && command.command.includes("host-native imagegen") && command.command.includes(metadata.prompt.sha256))) {
    fail("reference generation evidence must bind a successful host-native imagegen command to the confirmed prompt SHA-256");
  }

  return { metadataPath, generationEvidencePath, referenceInfo };
}

function validateReconstructionRecord({ request, referenceImagePath, metadataPath, pagePath }) {
  const evidencePath = requireAbsoluteFile(resolve(dirname(referenceImagePath), "reconstruction.evidence.json"), "Image-to-html reconstruction evidence");
  const detailsPath = requireAbsoluteFile(resolve(dirname(referenceImagePath), "reconstruction-details.json"), "Image-to-html reconstruction details");
  const evidence = validateWorkflowEvidenceRecord(evidencePath, "Image-to-html reconstruction evidence");
  if (!evidence.workflowIds.includes(request.workflowId)) fail("Image-to-html reconstruction evidence does not identify the current workflow");
  requirePassedEvidence(evidence, "Image-to-html reconstruction evidence", [
    relativeToKit(referenceImagePath),
    relativeToKit(metadataPath),
    relativeToKit(detailsPath),
    relativeToKit(pagePath)
  ]);
  const command = evidence.commands.find((entry) => entry.exitCode === 0 && /image-to-html/i.test(entry.command));
  if (!command) fail("Image-to-html reconstruction evidence must contain a successful Image-to-html command");
  let binding;
  try { binding = JSON.parse(command.result); }
  catch { fail("Image-to-html reconstruction command result must be JSON hash evidence"); }
  const expected = {
    requestId: request.requestId,
    referenceSha256: hash(readFileSync(referenceImagePath)),
    referenceMetadataSha256: hash(readFileSync(metadataPath)),
    reconstructionDetailsSha256: hash(readFileSync(detailsPath)),
    pageEntrySha256: hash(readFileSync(pagePath))
  };
  for (const [field, value] of Object.entries(expected)) {
    if (binding?.[field] !== value) fail(`Image-to-html reconstruction evidence ${field} does not match the current workflow inputs`);
  }
  return { evidencePath, detailsPath };
}

function validateBrowserRecord(file, request, { pagePath, referenceImagePath }) {
  const evidence = readJson(file);
  if (evidence?.version !== "1.0.0" || typeof evidence.evidenceId !== "string" || !evidence.evidenceId.trim()) {
    fail("browserEvidence must record version and evidenceId");
  }
  if (evidence.requestId !== request.requestId) fail("browserEvidence requestId does not match the current request");
  assertFileBinding(evidence.pageEntry, pagePath, "browserEvidence pageEntry");
  if (referenceImagePath) assertFileBinding(evidence.referenceImage, referenceImagePath, "browserEvidence referenceImage");
  let localUrl;
  try { localUrl = new URL(evidence.url); }
  catch { fail("browserEvidence.url must be a valid local URL"); }
  if (localUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(localUrl.hostname) || !localUrl.port) {
    fail("browserEvidence.url must use a unique localhost port");
  }
  const viewport = evidence.viewport;
  if (viewport?.requestedWidth !== request.viewport.width || viewport?.requestedHeight !== request.viewport.height || viewport?.deviceScaleFactor !== request.viewport.deviceScaleFactor) {
    fail("browserEvidence viewport does not match the request viewport");
  }
  if (!Array.isArray(evidence.tools) || !evidence.tools.includes("Codex In-app Browser") || !evidence.tools.includes("@playwright/cli")) {
    fail("browserEvidence must identify both Browser and Playwright tools");
  }
  if (!Array.isArray(evidence.screenshots) || evidence.screenshots.length === 0) fail("browserEvidence screenshots are required");

  const screenshots = evidence.screenshots.map((screenshot, index) => {
    if (!isPlainObject(screenshot) || typeof screenshot.path !== "string" || typeof screenshot.sha256 !== "string") {
      fail(`browserEvidence screenshots[${index}] is incomplete`);
    }
    const screenshotPath = requireFile(screenshot.path, `browserEvidence screenshots[${index}].path`);
    const actualSha256 = hash(readFileSync(screenshotPath));
    if (actualSha256 !== screenshot.sha256) fail(`browserEvidence screenshot hash mismatch: ${screenshot.path}`);
    if (!Number.isInteger(screenshot.width) || screenshot.width < 1 || !Number.isInteger(screenshot.height) || screenshot.height < 1) {
      fail(`browserEvidence screenshot dimensions are invalid: ${screenshot.path}`);
    }
    return { ...screenshot, absolutePath: screenshotPath };
  });
  if (!screenshots.some((screenshot) => screenshot.kind === "browser-full-page")) fail("browserEvidence requires a Browser full-page screenshot");
  const playwrightFullPages = screenshots.filter((screenshot) => screenshot.kind === "playwright-full-page");
  if (playwrightFullPages.length !== 1) fail("browserEvidence requires exactly one Playwright full-page screenshot");
  const criticalRegions = screenshots.filter((screenshot) => screenshot.kind === "playwright-critical-region");
  if (criticalRegions.length === 0) fail("browserEvidence requires at least one Playwright critical-region screenshot");

  for (const screenshot of [playwrightFullPages[0], ...criticalRegions]) {
    if (screenshot.format !== "png") fail(`Playwright visual evidence must use PNG: ${screenshot.path}`);
    const image = readPngInfo(screenshot.absolutePath, `browserEvidence ${screenshot.kind}`);
    if (image.width !== screenshot.width || image.height !== screenshot.height) fail(`browserEvidence screenshot dimensions do not match the PNG: ${screenshot.path}`);
  }

  if (!Array.isArray(evidence.interactions) || evidence.interactions.length === 0 || evidence.interactions.some((interaction) => interaction?.result !== "passed" || !isPlainObject(interaction.assertions))) {
    fail("browserEvidence must record at least one passed interaction with visible-state assertions");
  }
  if (evidence.console?.browserErrors !== 0 || evidence.console?.playwrightErrors !== 0) {
    fail("browserEvidence must report zero Browser and Playwright errors");
  }
  for (const [name, count] of Object.entries(evidence.console ?? {})) {
    if (/error/i.test(name) && count !== 0) fail(`browserEvidence console.${name} must equal 0`);
  }

  return { record: evidence, fullPage: playwrightFullPages[0], criticalRegions };
}

function validateRealVisualConfig({ configPath, visualConfig, referenceImagePath, referenceRecord, browserEvidence }) {
  const configRelativePath = relativeToKit(configPath);
  if (configRelativePath.split("/").includes("fixtures")) fail("visualDiffConfig must not use a fixture path when referenceImage is supplied");
  if (!isPlainObject(visualConfig) || !isPlainObject(visualConfig.output)) fail("real visualDiffConfig is incomplete");

  const configDirectory = dirname(configPath);
  const baselinePath = resolveConfigPath(configDirectory, visualConfig.baseline, "baseline");
  const candidatePath = resolveConfigPath(configDirectory, visualConfig.candidate, "candidate");
  const metricsPath = resolveConfigPath(configDirectory, visualConfig.output.metrics, "output.metrics");
  const heatmapPath = resolveConfigPath(configDirectory, visualConfig.output.heatmap, "output.heatmap");
  if (!samePath(baselinePath, referenceImagePath)) fail("visualDiffConfig baseline must resolve to request.referenceImage");
  if (!samePath(candidatePath, browserEvidence.fullPage.absolutePath)) fail("visualDiffConfig candidate must resolve to the Playwright full-page screenshot in browserEvidence");
  assertDescendant(configDirectory, metricsPath, "visual diff metrics output");
  assertDescendant(configDirectory, heatmapPath, "visual diff heatmap output");

  const candidateInfo = readPngInfo(candidatePath, "visual diff candidate");
  if (candidateInfo.sha256 !== browserEvidence.fullPage.sha256) fail("visual diff candidate SHA-256 does not match browserEvidence");
  if (candidateInfo.width !== browserEvidence.fullPage.width || candidateInfo.height !== browserEvidence.fullPage.height) {
    fail("visual diff candidate dimensions do not match browserEvidence");
  }
  if (candidateInfo.width !== referenceRecord.referenceInfo.width || candidateInfo.height !== referenceRecord.referenceInfo.height) {
    fail(`real visual diff dimensions differ: reference is ${referenceRecord.referenceInfo.width}x${referenceRecord.referenceInfo.height}, candidate is ${candidateInfo.width}x${candidateInfo.height}`);
  }

  if (!Array.isArray(visualConfig.regions) || visualConfig.regions.length === 0) fail("real visualDiffConfig requires critical regions");
  const candidateImage = decodePngFile(candidatePath, "visual diff candidate");
  const unmatchedRegions = [...browserEvidence.criticalRegions];
  for (const region of visualConfig.regions) {
    const match = unmatchedRegions.findIndex((screenshot) => screenshot.name === region?.name && sameBounds(screenshot.bounds, region));
    if (match < 0) fail(`visual diff region ${region?.name ?? "<unnamed>"} has no name-and-bounds-matched Playwright critical-region screenshot`);
    const [screenshot] = unmatchedRegions.splice(match, 1);
    assertRegionCrop(candidateImage, screenshot.absolutePath, region);
  }

  return {
    baselinePath,
    candidatePath,
    metricsPath,
    heatmapPath,
    referenceInfo: referenceRecord.referenceInfo,
    candidateInfo
  };
}

function validateVisualMetrics(metricsPath, heatmapPath, visualConfig, contract, expectedResult) {
  requireAbsoluteFile(metricsPath, "visual diff metrics");
  requireAbsoluteFile(heatmapPath, "visual diff heatmap");
  const metrics = readJson(metricsPath);
  if (metrics?.schemaVersion !== 1 || metrics.result !== expectedResult || !Array.isArray(metrics.failures)) fail(`visual diff metrics do not record the expected ${expectedResult} comparison`);
  const measuredSections = [metrics.global, ...(metrics.regions ?? [])];
  if (expectedResult === "pass" && (metrics.failures.length !== 0 || measuredSections.some((section) => section?.pass !== true))) fail("visual diff metrics do not record a clean passing comparison");
  if (expectedResult === "fail" && (metrics.failures.length === 0 || !measuredSections.some((section) => section?.pass === false))) fail("visual diff metrics do not record a threshold failure");
  if (metrics.images?.baseline !== visualConfig.baseline || metrics.images?.candidate !== visualConfig.candidate) {
    fail("visual diff metrics inputs do not match visualDiffConfig");
  }
  if (metrics.images?.width !== contract.referenceInfo.width || metrics.images?.height !== contract.referenceInfo.height) {
    fail("visual diff metrics dimensions do not match the verified reference image");
  }
  if (metrics.images?.baselineSha256 !== contract.referenceInfo.sha256 || metrics.images?.candidateSha256 !== contract.candidateInfo.sha256) {
    fail("visual diff metrics image hashes do not match the verified inputs");
  }
  if (!Array.isArray(metrics.regions) || metrics.regions.length !== visualConfig.regions.length) fail("visual diff metrics critical regions do not match visualDiffConfig");
  for (const [index, region] of visualConfig.regions.entries()) {
    const measured = metrics.regions[index];
    if (measured?.name !== region.name || typeof measured.pass !== "boolean" || !Array.isArray(measured.failures)) fail(`visual diff metrics region ${region.name} is incomplete`);
    if ((measured.pass && measured.failures.length !== 0) || (!measured.pass && measured.failures.length === 0)) fail(`visual diff metrics region ${region.name} has inconsistent pass and failure fields`);
    for (const field of ["x", "y", "width", "height"]) {
      if (measured.bounds?.[field] !== region[field]) fail(`visual diff metrics region ${region.name} bounds do not match visualDiffConfig`);
    }
  }
  if (metrics.artifacts?.metrics !== visualConfig.output.metrics || metrics.artifacts?.heatmap !== visualConfig.output.heatmap) {
    fail("visual diff metrics artifact paths do not match visualDiffConfig");
  }
  if (metrics.artifacts?.heatmapSha256 !== hash(readFileSync(heatmapPath))) fail("visual diff heatmap SHA-256 does not match metrics");
}

function validateWorkflowEvidenceRecord(file, label) {
  const evidence = readJson(file);
  if (!validateWorkflowEvidence(evidence)) fail(`${label} schema errors: ${ajv.errorsText(validateWorkflowEvidence.errors, { separator: "; " })}`);
  return evidence;
}

function requirePassedEvidence(evidence, label, requiredArtifacts) {
  if (evidence.status !== "passed" || evidence.blockers.length !== 0) fail(`${label} must be passed with no blockers`);
  if (!evidence.workflowIds.includes(request.workflowId)) fail(`${label} does not identify the current workflow`);
  if (evidence.commands.length === 0 || evidence.commands.some((command) => command.exitCode !== 0)) fail(`${label} must contain at least one successful command record`);
  for (const path of requiredArtifacts) {
    if (!evidence.artifacts.some((artifact) => samePath(resolveInsideKit(artifact), resolveInsideKit(path)))) fail(`${label} does not cite required artifact: ${path}`);
  }
}

function assertImageRecord(record, expectedPath, image, label) {
  if (!isPlainObject(record)) fail(`${label} is required`);
  assertRecordedPath(record.path, expectedPath, `${label}.path`);
  if (record.width !== image.width || record.height !== image.height || record.sha256 !== image.sha256 || record.bytes !== image.bytes) {
    fail(`${label} dimensions, SHA-256, or byte count do not match the PNG artifact`);
  }
}

function assertRecordedPath(recordedPath, expectedPath, label) {
  if (typeof recordedPath !== "string" || !samePath(resolveInsideKit(recordedPath), expectedPath)) fail(`${label} does not match the expected kit path`);
}

function assertFileBinding(record, expectedPath, label) {
  if (!isPlainObject(record)) fail(`${label} is required`);
  assertRecordedPath(record.path, expectedPath, `${label}.path`);
  if (record.sha256 !== hash(readFileSync(expectedPath))) fail(`${label}.sha256 does not match the current artifact`);
}

function extractConfirmedPrompt(markdown) {
  const headings = [...markdown.matchAll(/^## Prompt[ \t]*$/gm)];
  if (headings.length !== 1) fail("referencePrompt must contain exactly one ## Prompt heading");
  const sectionStart = headings[0].index + headings[0][0].length;
  const followingHeading = /^## [^\r\n]+$/gm;
  followingHeading.lastIndex = sectionStart;
  const next = followingHeading.exec(markdown);
  const section = markdown.slice(sectionStart, next?.index ?? markdown.length);
  const fences = [...section.matchAll(/^```text[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm)];
  if (fences.length !== 1) fail("referencePrompt ## Prompt section must contain exactly one fenced text block");
  return fences[0][1].replaceAll("\r\n", "\n");
}

function readPngInfo(file, label) {
  const bytes = readFileSync(file);
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    fail(`${label} is not a valid PNG with an IHDR header`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1) fail(`${label} has invalid PNG dimensions`);
  return { width, height, sha256: hash(bytes), bytes: bytes.length };
}

function decodePngFile(file, label) {
  try { return decodePng(readFileSync(file)); }
  catch (error) { fail(`${label} is not a decodable PNG: ${error.message}`); }
}

function sameBounds(bounds, region) {
  return isPlainObject(bounds) && ["x", "y", "width", "height"].every((field) => bounds[field] === region?.[field]);
}

function assertRegionCrop(candidate, screenshotPath, region) {
  if (region.x < 0 || region.y < 0 || region.x + region.width > candidate.width || region.y + region.height > candidate.height) {
    fail(`visual diff region ${region.name} is outside the candidate image`);
  }
  const screenshot = decodePngFile(screenshotPath, `browserEvidence region ${region.name}`);
  if (screenshot.width !== region.width || screenshot.height !== region.height) fail(`browserEvidence region ${region.name} dimensions do not match its bounds`);
  for (let y = 0; y < region.height; y += 1) {
    const candidateOffset = ((region.y + y) * candidate.width + region.x) * 4;
    const screenshotOffset = y * screenshot.width * 4;
    const candidateRow = candidate.data.subarray(candidateOffset, candidateOffset + region.width * 4);
    const screenshotRow = screenshot.data.subarray(screenshotOffset, screenshotOffset + region.width * 4);
    if (!candidateRow.every((value, index) => value === screenshotRow[index])) fail(`browserEvidence region ${region.name} pixels do not match the Playwright full-page candidate crop`);
  }
}

function resolveConfigPath(directory, value, label) {
  if (typeof value !== "string" || !value.trim() || isAbsolute(value)) fail(`${label} must be a relative path inside kit`);
  const target = resolve(directory, value);
  assertInsideKit(target, label);
  return target;
}

function requireAbsoluteFile(file, label) {
  assertInsideKit(file, label);
  if (!existsSync(file)) fail(`${label} is missing: ${relativeToKit(file)}`);
  return file;
}

function assertInsideKit(file, label) {
  const rel = relative(kitRoot, file);
  if (rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../") || isAbsolute(rel)) fail(`${label} escapes kit root`);
}

function assertDescendant(directory, file, label) {
  const rel = relative(directory, file);
  if (rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../") || isAbsolute(rel)) fail(`${label} must stay under the real visualDiffConfig directory`);
}

function samePath(left, right) {
  const normalize = (value) => process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
  return normalize(left) === normalize(right);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function freezeExisting(context) {
  return Object.values(context).map((path) => {
    const file = requireFile(path, "existingContext source");
    return { path: relativeToKit(file), sha256: hash(readFileSync(file)) };
  });
}

function freezeExploratory(context) {
  if (!context.directions.some((direction) => direction.id === context.selectedDirectionId)) {
    fail("exploratoryContext.selectedDirectionId must reference one of the proposed directions");
  }
  return [context.structuredContract, context.componentFoundation].map((path) => {
    const file = requireFile(path, "exploratoryContext source");
    return { path: relativeToKit(file), sha256: hash(readFileSync(file)) };
  });
}

function requireFile(path, label) {
  const file = resolveInsideKit(path);
  if (!existsSync(file)) fail(`${label} is missing: ${path}`);
  return file;
}

function resolveInsideKit(path) {
  if (typeof path !== "string" || !path.trim() || isAbsolute(path)) fail(`invalid kit-relative path: ${path}`);
  const target = resolve(kitRoot, path);
  const rel = relative(kitRoot, target);
  if (rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../")) fail(`path escapes kit root: ${path}`);
  return target;
}

function relativeToKit(path) {
  return relative(kitRoot, path).replaceAll("\\", "/");
}

function assertNoPlaceholder(value, label) {
  if (typeof value === "string" && /(^|[-_])(todo|tbd|fake|example|placeholder|unknown)([-_]|$)/i.test(value)) fail(`${label} contains a placeholder value`);
}

function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { fail(`${relativeToKit(file)} is not valid JSON: ${error.message}`); }
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--request") result.request = values[++index];
    else if (values[index] === "--out") result.out = values[++index];
    else fail(`unknown argument ${values[index]}`);
  }
  if (!result.request || !result.out) fail("--request and --out are required");
  return result;
}

function fail(message) {
  console.error(`run-image2-workflow failed: ${message}`);
  process.exit(1);
}
