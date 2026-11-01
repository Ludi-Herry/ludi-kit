import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { encodePng } from "../visual-diff/lib/png.mjs";

const kitRoot = process.cwd();
const tempRoot = resolve(kitRoot, `.tmp-image2-workflow-${process.pid}`);
mkdirSync(tempRoot, { recursive: false });

try {
  const directOutput = resolve(tempRoot, "existing-direct-run.json");
  run([
    "scripts/run-image2-workflow.mjs", "--request", "skills/image2-to-figma-page/fixtures/existing-direct.request.json", "--out", relative(directOutput)
  ], 0);
  const direct = readJson(directOutput);
  assert(direct.designContext === "existing", "existing direct route was not recorded");
  assert(direct.routing.image2Policy === "forbidden", "existing direct route must forbid Image2");
  assert(!direct.stages.some((item) => ["gpt-image-2", "image-to-html"].includes(item.id)), "existing direct route retained an Image2 stage");
  assert(stage(direct, "pattern-recipe").status === "passed", "existing direct route did not freeze its pattern and recipe");
  assert(!direct.stages.some((item) => item.id.startsWith("figma-")), "existing direct route retained a Figma write stage");
  assert(direct.status === "in-progress" && direct.blockers.length === 0, "existing direct route should wait only for its project validation adapters");

  const forcedImage2Output = resolve(tempRoot, "forced-image2-run.json");
  run([
    "scripts/run-image2-workflow.mjs", "--request", "skills/image2-to-figma-page/fixtures/invalid-existing-forces-image2.json", "--out", relative(forcedImage2Output)
  ], 1, "request schema errors");
  assert(!existsSync(forcedImage2Output), "existing route with forced Image2 wrote an output artifact");

  const realFixture = createRealExploratoryFixture();
  const existingOutput = resolve(tempRoot, "exploratory-evidence-run.json");
  run([
    "scripts/run-image2-workflow.mjs", "--request", realFixture.requestPath, "--out", relative(existingOutput)
  ], 0);
  const existing = readJson(existingOutput);
  assert(existing.designContext === "exploratory", "real exploratory route was not recorded");
  assert(existing.status === "external-blocked", "real exploratory route must stop at unavailable Figma target");
  assert(existing.frozenContext.sources.length === 2, "exploratory route must freeze the structured contract and component foundation");
  assert(stage(existing, "gpt-image-2").status === "passed", "real reference metadata did not pass the generation stage");
  assert(stage(existing, "image-to-html").status === "passed", "real reconstruction evidence was not consumed");
  assert(stage(existing, "browser-playwright").status === "passed", "real browser evidence was not consumed");
  assert(stage(existing, "visual-diff").status === "passed", "real visual diff was not recorded as passed");
  assert(stage(existing, "figma-generate-design").status === "external-blocked", "Figma capture must remain externally blocked");

  const validateRunRecord = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, formats: { "date-time": true } })
    .compile(readJson(resolve(kitRoot, "schema/image2-workflow-run.schema.json")));
  const completedBase = { ...existing, status: "completed", blockers: [], stages: existing.stages.map((item) => ({ ...item, status: "passed" })) };
  assert(validateRunRecord(completedBase), "all-passed completed run must satisfy the run schema");
  assert(!validateRunRecord({ ...completedBase, stages: completedBase.stages.map((item, index) => index === 7 ? { ...item, status: "ready" } : item) }), "completed run accepted a ready stage");
  assert(!validateRunRecord({ ...completedBase, stages: completedBase.stages.map((item, index) => index === 7 ? { ...item, status: "external-blocked" } : item) }), "completed run accepted an external-blocked stage");
  assert(!validateRunRecord({ ...completedBase, status: "external-blocked", blockers: existing.blockers }), "external-blocked run accepted no external-blocked stage");
  assert(validateRunRecord({ ...completedBase, status: "in-progress", stages: completedBase.stages.map((item, index) => index === 7 ? { ...item, status: "ready" } : item) }), "in-progress run rejected a ready stage");

  const failedVisualOutput = resolve(tempRoot, "failed-visual-run.json");
  const failedFullPagePng = solidPng(320, 320, [180, 31, 44, 255]);
  const failedCriticalPng = solidPng(40, 40, [180, 31, 44, 255]);
  writeFileSync(realFixture.candidatePath, failedFullPagePng);
  writeFileSync(realFixture.criticalPath, failedCriticalPng);
  const failedBrowserEvidence = {
    ...realFixture.browserEvidence,
    screenshots: realFixture.browserEvidence.screenshots.map((entry) => {
      if (entry.kind === "playwright-critical-region") return screenshot("playwright-critical-region", realFixture.criticalPath, 40, 40, { name: "critical", bounds: { x: 0, y: 0, width: 40, height: 40 } });
      return screenshot(entry.kind, realFixture.candidatePath, 320, 320);
    })
  };
  writeJson(realFixture.browserPath, failedBrowserEvidence);
  run([
    "scripts/run-image2-workflow.mjs", "--request", realFixture.requestPath, "--out", relative(failedVisualOutput)
  ], 1, "status=failed");
  const failedVisual = readJson(failedVisualOutput);
  assert(failedVisual.status === "failed", "threshold failure must produce an overall failed run");
  assert(stage(failedVisual, "visual-diff").status === "failed", "threshold failure must produce a failed visual stage");
  assert(stage(failedVisual, "figma-generate-design").status === "external-blocked", "threshold failure must not advance Figma capture");
  assert(failedVisual.blockers.some((blocker) => blocker.dependency === "visual-diff-thresholds"), "threshold failure must record a visual blocker");
  writeFileSync(realFixture.candidatePath, realFixture.fullPagePng);
  writeFileSync(realFixture.criticalPath, realFixture.criticalPng);
  writeJson(realFixture.browserPath, realFixture.browserEvidence);

  const missingMetadataOutput = resolve(tempRoot, "missing-metadata-run.json");
  rmSync(realFixture.metadataPath);
  run([
    "scripts/run-image2-workflow.mjs", "--request", realFixture.requestPath, "--out", relative(missingMetadataOutput)
  ], 1, "reference image metadata is missing");
  assert(!existsSync(missingMetadataOutput), "missing reference metadata wrote a run artifact");
  writeJson(realFixture.metadataPath, realFixture.metadata);

  const missingOutput = resolve(tempRoot, "missing-reconstruction-run.json");
  rmSync(realFixture.reconstructionPath);
  run([
    "scripts/run-image2-workflow.mjs", "--request", realFixture.requestPath, "--out", relative(missingOutput)
  ], 1, "Image-to-html reconstruction evidence is missing");
  assert(!existsSync(missingOutput), "missing reconstruction evidence wrote a run artifact");
  writeJson(realFixture.reconstructionPath, realFixture.reconstructionEvidence);

  const staleReconstructionOutput = resolve(tempRoot, "stale-reconstruction-run.json");
  writeJson(realFixture.reconstructionPath, {
    ...realFixture.reconstructionEvidence,
    commands: [{ ...realFixture.reconstructionEvidence.commands[0], result: JSON.stringify({ ...realFixture.reconstructionBinding, pageEntrySha256: "0".repeat(64) }) }]
  });
  run([
    "scripts/run-image2-workflow.mjs", "--request", realFixture.requestPath, "--out", relative(staleReconstructionOutput)
  ], 1, "pageEntrySha256 does not match");
  assert(!existsSync(staleReconstructionOutput), "stale reconstruction hashes wrote a run artifact");
  writeJson(realFixture.reconstructionPath, realFixture.reconstructionEvidence);

  const staleDetailsOutput = resolve(tempRoot, "stale-reconstruction-details-run.json");
  writeJson(realFixture.reconstructionDetailsPath, { ...realFixture.reconstructionDetails, measurements: ["changed after evidence"] });
  run([
    "scripts/run-image2-workflow.mjs", "--request", realFixture.requestPath, "--out", relative(staleDetailsOutput)
  ], 1, "reconstructionDetailsSha256 does not match");
  assert(!existsSync(staleDetailsOutput), "stale reconstruction details wrote a run artifact");
  writeJson(realFixture.reconstructionDetailsPath, realFixture.reconstructionDetails);

  const invalidBrowserOutput = resolve(tempRoot, "invalid-browser-run.json");
  writeJson(realFixture.browserPath, {
    ...realFixture.browserEvidence,
    screenshots: realFixture.browserEvidence.screenshots.map((screenshot, index) => index === 1 ? { ...screenshot, sha256: "0".repeat(64) } : screenshot)
  });
  run([
    "scripts/run-image2-workflow.mjs", "--request", realFixture.requestPath, "--out", relative(invalidBrowserOutput)
  ], 1, "browserEvidence screenshot hash mismatch");
  assert(!existsSync(invalidBrowserOutput), "invalid Browser evidence wrote a run artifact");
  writeJson(realFixture.browserPath, realFixture.browserEvidence);

  const invalidRegionOutput = resolve(tempRoot, "invalid-region-run.json");
  writeJson(realFixture.browserPath, {
    ...realFixture.browserEvidence,
    screenshots: realFixture.browserEvidence.screenshots.map((screenshot) => screenshot.kind === "playwright-critical-region" ? { ...screenshot, bounds: { ...screenshot.bounds, x: 1 } } : screenshot)
  });
  run([
    "scripts/run-image2-workflow.mjs", "--request", realFixture.requestPath, "--out", relative(invalidRegionOutput)
  ], 1, "no name-and-bounds-matched Playwright critical-region screenshot");
  assert(!existsSync(invalidRegionOutput), "misbound critical-region evidence wrote a run artifact");
  writeJson(realFixture.browserPath, realFixture.browserEvidence);

  const fixtureRequest = { ...realFixture.request, visualDiffConfig: "visual-diff/fixtures/pass/config.json" };
  const fixtureRequestPath = resolve(tempRoot, "fixture-masquerade.request.json");
  const fixtureOutput = resolve(tempRoot, "fixture-masquerade-run.json");
  writeJson(fixtureRequestPath, fixtureRequest);
  run([
    "scripts/run-image2-workflow.mjs", "--request", relative(fixtureRequestPath), "--out", relative(fixtureOutput)
  ], 1, "visualDiffConfig must not use a fixture path");
  assert(!existsSync(fixtureOutput), "fixture visual diff wrote a real run artifact");

  const exploratoryOutput = resolve(tempRoot, "exploratory-run.json");
  run([
    "scripts/run-image2-workflow.mjs", "--request", "skills/image2-to-figma-page/fixtures/exploratory.request.json", "--out", relative(exploratoryOutput)
  ], 0);
  const exploratory = readJson(exploratoryOutput);
  assert(exploratory.designContext === "exploratory", "exploratory route was not recorded");
  assert(exploratory.frozenContext.selectedDirectionId === "calm-command", "exploratory selection was not frozen");
  assert(stage(exploratory, "gpt-image-2").status === "ready", "exploratory route claimed absent generation evidence");
  assert(stage(exploratory, "browser-playwright").status === "ready", "exploratory route claimed absent browser evidence");
  assert(stage(exploratory, "visual-diff").status === "ready", "exploratory route let a fixture masquerade as a real visual diff");

  const invalidOutput = resolve(tempRoot, "invalid-run.json");
  run([
    "scripts/run-image2-workflow.mjs", "--request", "skills/image2-to-figma-page/fixtures/invalid-missing-existing-context.json", "--out", relative(invalidOutput)
  ], 1);
  assert(!existsSync(invalidOutput), "invalid request wrote an output artifact");

  console.log("test-image2-workflow passed: existingDirect=no-image2; exploratoryEvidence=passed; thresholdFailure=recorded; missingEvidence=blocked; fixtureMasquerade=blocked; figma=external-blocked");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function createRealExploratoryFixture() {
  const promptPath = "design-systems/ops-canvas/workflow/reference-prompt.md";
  const pageEntry = "design-systems/ops-canvas/spec/index.html";
  const exploratoryContext = {
    directions: [
      { id: "calm-command", name: "Calm Command", hypothesis: "A low-noise neutral workspace will reduce scanning time during long shifts." },
      { id: "exception-first", name: "Exception First", hypothesis: "A stronger exception rail will shorten the path from alert to assignment." }
    ],
    selectedDirectionId: "calm-command",
    miniDesignBrief: {
      principles: ["Fast scanning", "Explicit status", "Stable density"],
      colorIntent: "Neutral layered surfaces with one calm blue action color",
      typeIntent: "Compact system typography with tabular operational values",
      density: "compact"
    },
    image2Scope: { visualGoals: ["composition", "visual-direction"], authority: "visual-exploration-only" },
    structuredContract: "design-systems/ops-canvas/Design.md",
    componentFoundation: "design-systems/ops-canvas/component-index.json",
    structuralAuthority: {
      copy: "structured-contract",
      data: "structured-contract",
      interaction: "structured-contract",
      componentStates: "real-components",
      responsive: "structured-contract",
      accessibility: "structured-contract"
    }
  };
  const sources = [exploratoryContext.structuredContract, exploratoryContext.componentFoundation]
    .map((path) => ({ path, sha256: hash(readFileSync(resolve(kitRoot, path))) }));
  const contractSha256 = hash(Buffer.from(stableJson({
    selectedDirectionId: exploratoryContext.selectedDirectionId,
    miniDesignBrief: exploratoryContext.miniDesignBrief,
    image2Scope: exploratoryContext.image2Scope,
    structuralAuthority: exploratoryContext.structuralAuthority,
    sources
  })));
  const referencePath = resolve(tempRoot, "reference-image.png");
  const sourcePath = resolve(tempRoot, "reference-image.original.png");
  const candidatePath = resolve(tempRoot, "candidate.png");
  const criticalPath = resolve(tempRoot, "critical.png");
  const metadataPath = resolve(tempRoot, "reference-image.metadata.json");
  const generationPath = resolve(tempRoot, "reference-generation.evidence.json");
  const reconstructionPath = resolve(tempRoot, "reconstruction.evidence.json");
  const reconstructionDetailsPath = resolve(tempRoot, "reconstruction-details.json");
  const browserPath = resolve(tempRoot, "browser-evidence.json");
  const configPath = resolve(tempRoot, "visual-diff.config.json");
  const requestPath = resolve(tempRoot, "exploratory.request.json");
  const fullPagePng = solidPng(320, 320, [22, 31, 44, 255]);
  const criticalPng = solidPng(40, 40, [22, 31, 44, 255]);
  for (const path of [referencePath, sourcePath, candidatePath]) writeFileSync(path, fullPagePng);
  writeFileSync(criticalPath, criticalPng);

  const referenceArtifact = imageRecord(referencePath, 320, 320);
  const sourceArtifact = imageRecord(sourcePath, 320, 320);
  const promptSha256 = hash(Buffer.from(extractConfirmedPrompt(readFileSync(resolve(kitRoot, promptPath), "utf8")), "utf8"));
  const metadata = {
    version: "1.0.0",
    recordedAt: "2026-07-17T09:00:00.000Z",
    workflowId: "image2-to-figma-page",
    requestId: "image2-real-evidence-test",
    generator: { mode: "host-native", tool: "imagegen", modelIntent: "gpt-image-2", variants: 1 },
    prompt: { path: promptPath, sha256: promptSha256, confirmed: true, confirmedPromptScope: "fenced-text-block-under-prompt-heading" },
    frozenContractSha256: contractSha256,
    source: sourceArtifact,
    reference: referenceArtifact
  };
  writeJson(metadataPath, metadata);

  const generationEvidence = workflowEvidence({
    evidenceId: "image2-real-generation-test",
    summary: "A confirmed prompt produced a real PNG with dimensions and SHA-256 provenance for the test workflow.",
    command: `host-native imagegen using confirmed prompt SHA-256 ${promptSha256}`,
    artifacts: [promptPath, relative(sourcePath), relative(referencePath), relative(metadataPath)]
  });
  writeJson(generationPath, generationEvidence);
  const reconstructionDetails = { version: "1.0.0", measurements: ["320x320 fixture"], componentMappings: ["button"] };
  writeJson(reconstructionDetailsPath, reconstructionDetails);
  const reconstructionBinding = {
    requestId: "image2-real-evidence-test",
    referenceSha256: hash(readFileSync(referencePath)),
    referenceMetadataSha256: hash(readFileSync(metadataPath)),
    reconstructionDetailsSha256: hash(readFileSync(reconstructionDetailsPath)),
    pageEntrySha256: hash(readFileSync(resolve(kitRoot, pageEntry)))
  };
  const reconstructionEvidence = workflowEvidence({
    evidenceId: "image2-real-reconstruction-test",
    summary: "Image-to-html reconstruction mapped the verified reference into the runnable page entry for the test workflow.",
    command: "Image-to-html reconstructed the verified reference into the page entry",
    result: JSON.stringify(reconstructionBinding),
    artifacts: [relative(referencePath), relative(metadataPath), relative(reconstructionDetailsPath), pageEntry]
  });
  writeJson(reconstructionPath, reconstructionEvidence);

  const browserEvidence = {
    version: "1.0.0",
    evidenceId: "image2-real-browser-test",
    requestId: "image2-real-evidence-test",
    url: "http://127.0.0.1:4177/",
    viewport: { requestedWidth: 320, requestedHeight: 320, deviceScaleFactor: 1 },
    pageEntry: { path: pageEntry, sha256: hash(readFileSync(resolve(kitRoot, pageEntry))) },
    referenceImage: { path: relative(referencePath), sha256: hash(readFileSync(referencePath)) },
    tools: ["Codex In-app Browser", "@playwright/cli"],
    screenshots: [
      screenshot("browser-full-page", candidatePath, 320, 320),
      screenshot("playwright-full-page", candidatePath, 320, 320),
      screenshot("playwright-critical-region", criticalPath, 40, 40, { name: "critical", bounds: { x: 0, y: 0, width: 40, height: 40 } })
    ],
    interactions: [{ id: "test-interaction", result: "passed", assertions: { visibleState: "verified" } }],
    console: { browserErrors: 0, playwrightErrors: 0, playwrightWarnings: 0 },
    notes: []
  };
  writeJson(browserPath, browserEvidence);
  writeJson(configPath, {
    schemaVersion: 1,
    baseline: "reference-image.png",
    candidate: "candidate.png",
    output: { metrics: "visual-diff-artifacts/metrics.json", heatmap: "visual-diff-artifacts/heatmap.png" },
    thresholds: fixedThresholds(0.985, 0.035),
    regions: [{ name: "critical", x: 0, y: 0, width: 40, height: 40, thresholds: fixedThresholds(0.99, 0.025) }]
  });

  const request = {
    version: "2.0.0",
    workflowId: "image2-to-figma-page",
    requestId: "image2-real-evidence-test",
    designContext: "exploratory",
    routing: {
      strategyDecisionId: "image2-routing-strategy-amendment-2026-08-14",
      selectedRoute: "exploratory",
      selectionReason: "The evidence fixture explicitly tests a high-variance visual composition route."
    },
    project: { name: "Evidence Test", page: "Exploratory route test page", objective: "Prove all real evidence gates fail closed and pass together.", audience: "Workflow maintainers" },
    viewport: { width: 320, height: 320, deviceScaleFactor: 1 },
    pageEntry,
    referencePrompt: promptPath,
    referenceImage: relative(referencePath),
    visualDiffConfig: relative(configPath),
    browserEvidence: relative(browserPath),
    figmaEvidence: "figma/evidence/ops-canvas.external-blocked.json",
    figmaTarget: { fileKey: null, pageNodeId: null },
    exploratoryContext
  };
  writeJson(requestPath, request);
  return { request, requestPath: relative(requestPath), metadataPath, metadata, reconstructionPath, reconstructionEvidence, reconstructionBinding, reconstructionDetailsPath, reconstructionDetails, browserPath, browserEvidence, candidatePath, criticalPath, fullPagePng, criticalPng };
}

function workflowEvidence({ evidenceId, summary, command, result = "Verified by the isolated image2 workflow test harness.", artifacts }) {
  return {
    version: "1.0.0",
    evidenceId,
    workflowIds: ["image2-to-figma-page"],
    status: "passed",
    recordedAt: "2026-07-17T09:00:00.000Z",
    summary,
    commands: [{ command, exitCode: 0, result }],
    artifacts,
    blockers: []
  };
}

function screenshot(kind, path, width, height, extra = {}) {
  return { kind, format: "png", path: relative(path), width, height, sha256: hash(readFileSync(path)), ...extra };
}

function imageRecord(path, width, height) {
  const bytes = readFileSync(path);
  return { path: relative(path), width, height, sha256: hash(bytes), bytes: bytes.length };
}

function fixedThresholds(minSsim, maxRms) {
  return { minSsim, maxRms, pixelDeltaThreshold: 16 / 255, maxChangedPixelRatio: 0.025 };
}

function solidPng(width, height, rgba) {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return encodePng({ width, height, data });
}

function run(args, expectedExit, expectedMessage) {
  const result = spawnSync(process.execPath, args, { cwd: kitRoot, encoding: "utf8", windowsHide: true });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== expectedExit) throw new Error(`expected exit ${expectedExit}, received ${result.status}: ${output}`);
  if (expectedMessage && !output.includes(expectedMessage)) throw new Error(`expected output to include "${expectedMessage}": ${output}`);
}
function stage(runRecord, id) { return runRecord.stages.find((item) => item.id === id) ?? {}; }
function relative(file) { return file.slice(kitRoot.length + 1).replaceAll("\\", "/"); }
function readJson(file) { return JSON.parse(readFileSync(file, "utf8")); }
function writeJson(file, value) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function extractConfirmedPrompt(markdown) {
  const section = markdown.slice(markdown.indexOf("## Prompt"));
  const match = section.match(/^```text[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/m);
  if (!match) throw new Error("test prompt fixture is missing its fenced Prompt block");
  return match[1].replaceAll("\r\n", "\n");
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function assert(condition, message) { if (!condition) throw new Error(message); }
