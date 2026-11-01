import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "../visual-diff/lib/png.mjs";
import {
  isTianshuAppendOnlySourceReceipt,
  validateTianshuPageRegistryReceiptSuccessor
} from "./validate-image2-golden-holdout-freeze.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const defaultBatchRoot = resolve(kitRoot, "quality/image2-calibration/batch-01");

const fixedThresholds = {
  fullPage: { minSsim: 0.985, maxRms: 0.035, maxChangedPixelRatio: 0.025 },
  criticalRegion: { minSsim: 0.99, maxRms: 0.025, maxChangedPixelRatio: 0.025 },
  pixelDeltaThreshold: 0.06274509803921569
};

const reviewKeys = [
  "version",
  "pairId",
  "reviewerId",
  "reviewedAt",
  "independence",
  "inputs",
  "calibrationLabel",
  "semanticVerdict",
  "pixelFidelityVerdict",
  "interactionEvidenceSupportsTask",
  "blockingFindings",
  "reasonCodes",
  "rationale",
  "confidence",
  "machineResultMatchedExpectation"
];

export function validateImage2CalibrationBatch(batchRootInput = defaultBatchRoot) {
  const batchRoot = resolve(batchRootInput);
  assertDirectory(batchRoot, "Image2 calibration batch root");

  const batch = readJson(resolve(batchRoot, "batch-contract.json"));
  const packet = readJson(resolve(batchRoot, "independent-review-packet.json"));
  assert(batch.version === "1.0.0", "batch contract version must be 1.0.0");
  assert(batch.status === "reviewed" || batch.status === "reviewed-with-one-dispute", "batch must record completed reviews");
  assert(packet.version === "1.0.0", "review packet version must be 1.0.0");
  assert(packet.batchId === batch.batchId, "review packet batchId does not match batch contract");
  assert(packet.status.startsWith("reviews-complete"), "review packet must record completed reviews");
  assert(Array.isArray(batch.pairs) && batch.pairs.length === batch.accounting?.plannedPairsInBatch, "batch pair count does not match accounting");
  assert(Array.isArray(packet.pairs) && packet.pairs.length === batch.pairs.length, "review packet pair count does not match batch");
  assert(Array.isArray(packet.reviewerIds) && packet.reviewerIds.length === 2 && new Set(packet.reviewerIds).size === 2, "review packet must name two distinct reviewers");
  assert(packet.independence?.participatedInImplementationOrEvidence === false, "review packet must exclude implementation participants");
  assert(packet.independence?.reviewersMutuallyIsolatedBeforeSubmission === true, "review packet must require reviewer isolation");
  assert(packet.independence?.machineMetricsHiddenUntilVisualLabelFreeze === true, "review packet must hide metrics until label freeze");
  assert(packet.independence?.otherReviewFilesForbidden === true, "review packet must forbid other review files");

  const canonicalPrefix = canonicalBatchPrefix(batch);
  const resolveEvidence = (value, label) => resolveEvidencePath(value, label, canonicalPrefix, batchRoot);
  const packetByPair = new Map(packet.pairs.map((pair) => [pair.pairId, pair]));
  assert(packetByPair.size === batch.pairs.length, "review packet contains duplicate pairIds");

  const results = batch.pairs.map((pair) => validatePair({
    pair,
    packetPair: packetByPair.get(pair.pairId),
    reviewers: packet.reviewerIds,
    batch,
    resolveEvidence
  }));

  const qualified = results.filter((result) => result.qualified).length;
  const accepted = results.filter((result) => result.formalVerdict === "accepted").length;
  const rejected = results.filter((result) => result.formalVerdict === "rejected").length;
  const disputed = results.filter((result) => result.formalVerdict === "reviewed-disputed").length;
  const accounting = batch.accounting;

  assert(accounting.reviewedPairsInBatch === results.length, "reviewedPairsInBatch is inconsistent");
  assert(accounting.qualifiedFromBatch === qualified, "qualifiedFromBatch is inconsistent");
  assert(accounting.disputedFromBatch === disputed, "disputedFromBatch is inconsistent");
  assert(accounting.qualifiedAfterBatch === accounting.qualifiedBeforeBatch + qualified, "qualifiedAfterBatch is inconsistent");
  assert(accounting.acceptedAfterBatch === accounting.acceptedBeforeBatch + accepted, "acceptedAfterBatch is inconsistent");
  assert(accounting.rejectedAfterBatch === accounting.rejectedBeforeBatch + rejected, "rejectedAfterBatch is inconsistent");
  assert(accounting.disputedAfterBatch === accounting.disputedBeforeBatch + disputed, "disputedAfterBatch is inconsistent");
  assert(accounting.remainingQualifiedPairs === accounting.requiredTotal - accounting.qualifiedAfterBatch, "remainingQualifiedPairs is inconsistent");
  assert(accounting.remainingAcceptedPairs === 12 - accounting.acceptedAfterBatch, "remainingAcceptedPairs is inconsistent");
  assert(accounting.remainingRejectedPairs === 12 - accounting.rejectedAfterBatch, "remainingRejectedPairs is inconsistent");
  assert(batch.boundaries?.rawThresholdChangeAuthorized === false, "batch must not authorize raw threshold changes");
  assert(batch.boundaries?.rawGateOverride === false, "batch must not override the raw gate");
  assert(batch.boundaries?.protectedFinalEligiblePrdRead === false, "batch must preserve the protected PRD read boundary");
  assert(batch.boundaries?.protectedFinalEligiblePrdRegistered === false, "batch must preserve the protected PRD registry boundary");

  return {
    batchId: batch.batchId,
    reviewed: results.length,
    qualified,
    accepted,
    rejected,
    disputed,
    qualifiedAfterBatch: accounting.qualifiedAfterBatch,
    remainingQualifiedPairs: accounting.remainingQualifiedPairs
  };
}

function validatePair({ pair, packetPair, reviewers, batch, resolveEvidence }) {
  assert(packetPair, `${pair.pairId}: review packet entry is missing`);
  assert(pair.qualified === true || pair.qualified === false, `${pair.pairId}: pair qualified flag must be boolean`);
  assert(["accepted", "rejected", "reviewed-disputed"].includes(pair.calibrationLabel), `${pair.pairId}: invalid calibration label`);

  const requestPath = resolveEvidence(pair.request, `${pair.pairId} request`);
  const pairRoot = dirname(requestPath);
  const request = readJson(requestPath);
  const sourceContract = readJson(resolveEvidence(packetPair.sourceContract, `${pair.pairId} source contract`));
  assert(request.requestId === pair.pairId, `${pair.pairId}: requestId mismatch`);
  assert(sourceContract.pairId === pair.pairId, `${pair.pairId}: source contract pairId mismatch`);
  assert(sourceContract.projectId === pair.projectId && sourceContract.pageId === pair.pageId, `${pair.pairId}: source contract identity mismatch`);
  assert(request.viewport?.width === batch.viewport.width && request.viewport?.height === batch.viewport.height && request.viewport?.deviceScaleFactor === batch.viewport.deviceScaleFactor, `${pair.pairId}: request viewport mismatch`);

  const reference = verifyPngReceipt(packetPair.reference, batch.viewport, `${pair.pairId} reference`, resolveEvidence);
  const candidate = verifyPngReceipt(packetPair.candidate, batch.viewport, `${pair.pairId} candidate`, resolveEvidence);
  assert(request.referenceImage === packetPair.reference.path, `${pair.pairId}: request reference path mismatch`);
  assert(request.referencePrompt === pair.prompt, `${pair.pairId}: request prompt path mismatch`);
  const promptPath = resolveEvidence(pair.prompt, `${pair.pairId} prompt`);

  for (const receipt of sourceContract.sources ?? []) verifyFileReceipt(receipt, `${pair.pairId} source receipt`, resolveEvidence);
  const metadata = readJson(resolve(pairRoot, "reference-image.metadata.json"));
  assert(metadata.requestId === pair.pairId && metadata.prompt?.confirmed === true, `${pair.pairId}: reference metadata identity or confirmation mismatch`);
  assert(metadata.workflowId === "image2-to-figma-page" && metadata.generator?.mode === "host-native" && metadata.generator?.tool === "imagegen" && metadata.generator?.modelIntent === "gpt-image-2" && metadata.generator?.variants === 1, `${pair.pairId}: reference generator identity mismatch`);
  assert(metadata.prompt.path === pair.prompt, `${pair.pairId}: reference metadata prompt path mismatch`);
  assert(metadata.prompt.sha256 === sha256(Buffer.from(extractConfirmedPrompt(readFileSync(promptPath, "utf8")), "utf8")), `${pair.pairId}: confirmed prompt SHA-256 mismatch`);
  verifyFileReceipt(metadata.reference, `${pair.pairId} normalized reference metadata`, resolveEvidence, reference);
  verifyFileReceipt(metadata.source, `${pair.pairId} native reference metadata`, resolveEvidence);
  const generationEvidence = readJson(resolve(pairRoot, "reference-generation.evidence.json"));
  assert(generationEvidence.status === "passed" && generationEvidence.workflowIds?.includes("image2-to-figma-page"), `${pair.pairId}: reference generation evidence is not passed`);
  assert(generationEvidence.commands?.some((command) => command.exitCode === 0 && command.command.includes("host-native imagegen") && command.command.includes(metadata.prompt.sha256)), `${pair.pairId}: generation evidence does not bind the confirmed prompt`);

  const target = validateTargetManifest(pairRoot, pair, request, resolveEvidence);

  const browser = readJson(resolveEvidence(packetPair.browserEvidence, `${pair.pairId} browser evidence`));
  assert(browser.requestId === pair.pairId, `${pair.pairId}: browser evidence requestId mismatch`);
  assert(browser.referenceImage?.path === packetPair.reference.path && browser.referenceImage?.sha256 === reference.sha256, `${pair.pairId}: browser reference receipt mismatch`);
  assert(browser.pageEntry?.path === request.pageEntry && browser.pageEntry?.sha256 === target.byPath.get("index.html").sha256, `${pair.pairId}: browser page-entry receipt mismatch`);
  assert(browser.viewport?.requestedWidth === batch.viewport.width && browser.viewport?.requestedHeight === batch.viewport.height && browser.viewport?.deviceScaleFactor === batch.viewport.deviceScaleFactor, `${pair.pairId}: browser viewport mismatch`);
  const browserCandidate = browser.screenshots?.find((shot) => shot.kind === "playwright-full-page");
  assert(browserCandidate?.path === packetPair.candidate.path && browserCandidate?.sha256 === candidate.sha256, `${pair.pairId}: browser candidate receipt mismatch`);
  assert((browser.interactions ?? []).length >= 2 && browser.interactions.every((item) => item.result === "passed"), `${pair.pairId}: Browser/Playwright interaction evidence is not fully passed`);
  assert(Object.values(browser.console ?? {}).every((count) => count === 0), `${pair.pairId}: browser evidence contains runtime warnings or errors`);

  const playwright = readJson(resolve(pairRoot, "playwright-result.json"));
  assert(playwright.pairId === pair.pairId && playwright.status === "passed", `${pair.pairId}: Playwright result is not passed`);
  assert(playwright.viewport?.width === batch.viewport.width && playwright.viewport?.height === batch.viewport.height && playwright.viewport?.deviceScaleFactor === batch.viewport.deviceScaleFactor, `${pair.pairId}: Playwright viewport mismatch`);
  assert(playwright.dimensions?.innerWidth === batch.viewport.width && playwright.dimensions?.innerHeight === batch.viewport.height && playwright.dimensions?.bodyScrollWidth === batch.viewport.width && playwright.dimensions?.bodyScrollHeight === batch.viewport.height, `${pair.pairId}: Playwright dimensions mismatch`);
  assert(playwright.interaction?.result === "passed", `${pair.pairId}: Playwright interaction failed`);
  for (const values of Object.values(playwright.runtimeAudit ?? {})) assert(Array.isArray(values) && values.length === 0, `${pair.pairId}: Playwright runtime audit is not clean`);
  verifyFileReceipt(playwright.screenshots?.fullPage, `${pair.pairId} Playwright full page`, resolveEvidence, candidate);
  const criticalReceipt = verifyFileReceipt(playwright.screenshots?.criticalRegion, `${pair.pairId} Playwright critical region`, resolveEvidence);
  assertJson(playwright.criticalRegion, sourceContract.criticalRegion, `${pair.pairId}: critical region contract mismatch`);
  assert(criticalReceipt.png.width === sourceContract.criticalRegion.width && criticalReceipt.png.height === sourceContract.criticalRegion.height, `${pair.pairId}: critical region PNG dimensions mismatch`);

  const progress = batch.evidenceProgress?.[pair.pairId];
  assert(progress, `${pair.pairId}: batch evidence progress is missing`);
  const run = readJson(resolveEvidence(progress.run, `${pair.pairId} workflow run`));
  assert(run.requestId === pair.pairId && run.status === "failed", `${pair.pairId}: workflow run must preserve the raw failed status`);
  const stages = new Map((run.stages ?? []).map((stage) => [stage.id, stage]));
  assert(stages.size === (run.stages ?? []).length, `${pair.pairId}: workflow stages contain duplicate IDs`);
  for (const id of ["context-freeze", "gpt-image-2", "image-to-html", "page-implementation", "browser-playwright"]) assert(stages.get(id)?.status === "passed", `${pair.pairId}: ${id} stage is not passed`);
  assert(stages.get("visual-diff")?.status === "failed", `${pair.pairId}: visual-diff stage must stay failed`);

  const metrics = readJson(resolveEvidence(packetPair.machineMetricsAfterFreeze, `${pair.pairId} metrics`));
  assert(metrics.result === "fail" && metrics.global?.pass === false && metrics.regions?.length === 1 && metrics.regions[0]?.pass === false, `${pair.pairId}: metrics must preserve global and critical failures`);
  assert(metrics.images?.baselineSha256 === reference.sha256 && metrics.images?.candidateSha256 === candidate.sha256, `${pair.pairId}: metrics image hashes mismatch`);
  assert(metrics.images?.width === batch.viewport.width && metrics.images?.height === batch.viewport.height, `${pair.pairId}: metrics dimensions mismatch`);
  assertJson(metrics.global.thresholds, { ...fixedThresholds.fullPage, pixelDeltaThreshold: fixedThresholds.pixelDeltaThreshold }, `${pair.pairId}: full-page thresholds drifted`);
  assertJson(metrics.regions[0].thresholds, { ...fixedThresholds.criticalRegion, pixelDeltaThreshold: fixedThresholds.pixelDeltaThreshold }, `${pair.pairId}: critical thresholds drifted`);
  assertJson(metrics.regions[0].bounds, withoutName(sourceContract.criticalRegion), `${pair.pairId}: measured critical bounds mismatch`);
  const metricsDir = dirname(resolveEvidence(packetPair.machineMetricsAfterFreeze, `${pair.pairId} metrics`));
  const heatmapPath = resolve(metricsDir, "heatmap.png");
  assertFile(heatmapPath, `${pair.pairId} heatmap`);
  assert(sha256(readFileSync(heatmapPath)) === metrics.artifacts?.heatmapSha256, `${pair.pairId}: heatmap hash mismatch`);

  const decision = readJson(resolveEvidence(progress.decision, `${pair.pairId} calibration decision`));
  const reviewFiles = readdirSync(resolve(pairRoot, "reviews")).filter((name) => name.endsWith(".json"));
  assert(reviewFiles.length === 2, `${pair.pairId}: exactly two review records are required`);
  assert(Array.isArray(decision.reviews) && decision.reviews.length === 2, `${pair.pairId}: decision must bind two reviews`);
  const reviewRecords = decision.reviews.map((summary) => {
    const review = readJson(resolveEvidence(summary.recordPath, `${pair.pairId} review ${summary.reviewerId}`));
    validateReview(review, summary, pair.pairId, reviewers, reference.sha256, candidate.sha256, metrics.result);
    return review;
  });
  assert(new Set(reviewRecords.map((review) => review.reviewerId)).size === 2, `${pair.pairId}: duplicate reviewers are forbidden`);

  const signatures = reviewRecords.map(reviewSignature);
  const reviewsAgree = signatures[0] === signatures[1];
  const formalVerdict = reviewsAgree ? reviewRecords[0].calibrationLabel : "reviewed-disputed";
  const qualified = reviewsAgree;
  assert(pair.calibrationLabel === formalVerdict && pair.qualified === qualified, `${pair.pairId}: batch pair classification does not match reviews`);
  assert(progress.reviewStatus === (qualified ? `qualified-${formalVerdict}` : "reviewed-disputed"), `${pair.pairId}: evidence progress classification mismatch`);

  assert(decision.pairId === pair.pairId && decision.requestId === pair.pairId, `${pair.pairId}: decision identity mismatch`);
  assert(decision.status === "recorded", `${pair.pairId}: decision status must be recorded`);
  assert(decision.evidence?.referenceSha256 === reference.sha256 && decision.evidence?.candidateSha256 === candidate.sha256, `${pair.pairId}: decision image hashes mismatch`);
  assert(decision.evidence?.metricsPath === packetPair.machineMetricsAfterFreeze && decision.evidence?.browserEvidencePath === packetPair.browserEvidence, `${pair.pairId}: decision evidence paths mismatch`);
  assert(resolveEvidence(decision.evidence?.targetManifestPath, `${pair.pairId} decision target manifest`) === resolve(pairRoot, "target/source-manifest.json"), `${pair.pairId}: decision target manifest path mismatch`);
  assertJson(decision.immutableThresholds, fixedThresholds, `${pair.pairId}: decision thresholds drifted`);
  assert(decision.machineVerdict === "failed", `${pair.pairId}: decision machine verdict must stay failed`);
  assert(decision.formalCalibrationVerdict === formalVerdict && decision.qualified === qualified, `${pair.pairId}: decision classification mismatch`);
  assert(decision.rawGateOverride === false && decision.thresholdChangeApproved === false && decision.gateChangeAuthorized === false, `${pair.pairId}: decision altered a frozen gate`);
  assertMeasured(decision.measured?.fullPage, metrics.global, `${pair.pairId} full-page measurement`);
  assertMeasured(decision.measured?.criticalRegion, metrics.regions[0], `${pair.pairId} critical measurement`, true);
  assertJson(decision.studyImpact, {
    qualifiedDelta: qualified ? 1 : 0,
    acceptedDelta: formalVerdict === "accepted" ? 1 : 0,
    rejectedDelta: formalVerdict === "rejected" ? 1 : 0,
    disputedDelta: formalVerdict === "reviewed-disputed" ? 1 : 0
  }, `${pair.pairId}: study impact mismatch`);
  if (formalVerdict === "reviewed-disputed") {
    assert(decision.decision === "hold-disputed-pair" && decision.dispute?.status === "open", `${pair.pairId}: disputed pair must remain held and open`);
  } else {
    assert(decision.decision === "accept-qualified-pair" && decision.dispute === undefined, `${pair.pairId}: qualified pair decision mismatch`);
  }

  return { pairId: pair.pairId, qualified, formalVerdict };
}

function validateReview(review, summary, pairId, reviewers, referenceSha256, candidateSha256, machineResult) {
  assertKeys(review, reviewKeys, `${pairId}: review ${summary.reviewerId}`);
  assert(review.version === "1.0.0" && review.pairId === pairId, `${pairId}: review identity mismatch`);
  assert(review.reviewerId === summary.reviewerId && reviewers.includes(review.reviewerId), `${pairId}: reviewer is not authorized by the packet`);
  assertKeys(review.independence, ["participatedInImplementationOrEvidence", "sawOtherReviewerDecisionBeforeSubmission", "sawMachineMetricsBeforeFreezingLabel", "statement"], `${pairId}: review independence`);
  assert(review.independence.participatedInImplementationOrEvidence === false, `${pairId}: reviewer participated in implementation or evidence`);
  assert(review.independence.sawOtherReviewerDecisionBeforeSubmission === false, `${pairId}: reviewer saw another decision before submission`);
  assert(review.independence.sawMachineMetricsBeforeFreezingLabel === false, `${pairId}: reviewer saw metrics before label freeze`);
  assert(review.independence.statement === "I reviewed the frozen reference and candidate independently.", `${pairId}: independence statement mismatch`);
  assertKeys(review.inputs, ["referenceSha256", "candidateSha256"], `${pairId}: review inputs`);
  assert(review.inputs.referenceSha256 === referenceSha256 && review.inputs.candidateSha256 === candidateSha256, `${pairId}: review input hashes mismatch`);
  assert(["accepted", "rejected"].includes(review.calibrationLabel), `${pairId}: invalid review calibration label`);
  assert(["accepted", "rejected"].includes(review.semanticVerdict), `${pairId}: invalid semantic verdict`);
  assert(["accepted", "rejected"].includes(review.pixelFidelityVerdict), `${pairId}: invalid pixel verdict`);
  assert(["yes", "no"].includes(review.interactionEvidenceSupportsTask), `${pairId}: invalid interaction verdict`);
  assert(Array.isArray(review.blockingFindings) && review.blockingFindings.length > 0, `${pairId}: review blocking findings are missing`);
  assert(Array.isArray(review.reasonCodes) && review.reasonCodes.length > 0, `${pairId}: review reason codes are missing`);
  assert(typeof review.rationale === "string" && review.rationale.trim().length >= 40, `${pairId}: review rationale is incomplete`);
  assert(["high", "medium", "low"].includes(review.confidence), `${pairId}: invalid review confidence`);
  assert(review.machineResultMatchedExpectation === "yes" && machineResult === "fail", `${pairId}: review machine expectation mismatch`);
  if (review.calibrationLabel === "rejected") assert(review.blockingFindings.some((finding) => finding !== "none"), `${pairId}: rejected review requires a blocking finding`);
  assert(summary.calibrationLabel === review.calibrationLabel && summary.semanticVerdict === review.semanticVerdict && summary.pixelFidelityVerdict === review.pixelFidelityVerdict, `${pairId}: decision review summary mismatch`);
  assert(summary.interactionVerdict === (review.interactionEvidenceSupportsTask === "yes" ? "accepted" : "rejected"), `${pairId}: decision interaction summary mismatch`);
}

function verifyPngReceipt(receipt, viewport, label, resolveEvidence) {
  const verified = verifyFileReceipt(receipt, label, resolveEvidence);
  assert(verified.png.width === viewport.width && verified.png.height === viewport.height, `${label}: dimensions do not match batch viewport`);
  return verified;
}

function validateTargetManifest(pairRoot, pair, request, resolveEvidence) {
  const targetRoot = resolve(pairRoot, "target");
  assertDirectory(targetRoot, `${pair.pairId} target root`);
  const manifest = readJson(resolve(targetRoot, "source-manifest.json"));
  const required = ["artifact-meta.json", "index.html", "script.js", "styles.css"];
  assert(manifest.version === "1.0.0" && manifest.algorithm === "sha256(sorted path\\0bytes\\0sha256 joined by LF)", `${pair.pairId}: target source manifest contract mismatch`);
  assert(Array.isArray(manifest.files) && manifest.files.length === required.length, `${pair.pairId}: target source manifest file count mismatch`);
  assertJson(manifest.files.map((file) => file.path).sort(), required, `${pair.pairId}: target source manifest paths mismatch`);
  const actualNames = readdirSync(targetRoot).filter((name) => name !== "source-manifest.json").sort();
  assertJson(actualNames, required, `${pair.pairId}: target source tree contains missing or extra files`);
  const actual = manifest.files.map((receipt) => {
    assert(!receipt.path.includes("/") && !receipt.path.includes("\\"), `${pair.pairId}: target manifest path must be a direct child`);
    const file = resolve(targetRoot, receipt.path);
    assertFile(file, `${pair.pairId} target ${receipt.path}`);
    const bytes = readFileSync(file);
    const entry = { path: receipt.path, bytes: bytes.length, sha256: sha256(bytes) };
    assert(entry.bytes === receipt.bytes && entry.sha256 === receipt.sha256, `${pair.pairId}: target ${receipt.path} receipt mismatch`);
    return entry;
  }).sort((left, right) => left.path.localeCompare(right.path));
  const treeSha256 = sha256(Buffer.from(actual.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join("\n"), "utf8"));
  assert(treeSha256 === manifest.treeSha256, `${pair.pairId}: target source tree SHA-256 mismatch`);
  const byPath = new Map(actual.map((file) => [file.path, file]));
  const artifactMeta = readJson(resolve(targetRoot, "artifact-meta.json"));
  assert(artifactMeta.pairId === pair.pairId && artifactMeta.projectId === pair.projectId && artifactMeta.entry === "index.html", `${pair.pairId}: target artifact identity mismatch`);
  const requestEntry = resolveEvidence(request.pageEntry, `${pair.pairId} request page entry`);
  assert(requestEntry === resolve(targetRoot, "index.html"), `${pair.pairId}: request page entry does not resolve to target index.html`);
  return { manifest, byPath };
}

function verifyFileReceipt(receipt, label, resolveEvidence, expected = undefined) {
  assert(receipt && typeof receipt.path === "string" && typeof receipt.sha256 === "string", `${label}: receipt is incomplete`);
  if (isTianshuAppendOnlySourceReceipt(receipt)) {
    validateTianshuPageRegistryReceiptSuccessor({ kitRootInput: kitRoot, receipt });
    const historical = { path: receipt.path, bytes: receipt.bytes, sha256: receipt.sha256 };
    if (expected) assert(historical.sha256 === expected.sha256, `${label}: receipt differs from expected artifact`);
    return historical;
  }
  const file = resolveEvidence(receipt.path, label);
  const bytes = readFileSync(file);
  const actual = { path: receipt.path, bytes: bytes.length, sha256: sha256(bytes) };
  assert(actual.sha256 === receipt.sha256, `${label}: SHA-256 mismatch`);
  if (typeof receipt.bytes === "number") assert(actual.bytes === receipt.bytes, `${label}: byte count mismatch`);
  if (expected) assert(actual.sha256 === expected.sha256, `${label}: receipt differs from expected artifact`);
  if (file.toLowerCase().endsWith(".png")) actual.png = decodePng(bytes);
  return actual;
}

function canonicalBatchPrefix(batch) {
  const first = batch.pairs?.[0]?.request;
  assert(typeof first === "string", "batch has no canonical request path");
  const marker = "/" + first.split("/").slice(-2).join("/");
  assert(first.endsWith(marker), "cannot derive canonical batch prefix");
  return first.slice(0, -marker.length);
}

function resolveEvidencePath(value, label, canonicalPrefix, batchRoot) {
  assert(typeof value === "string" && value.length > 0 && !isAbsolute(value), `${label}: path must be kit-relative`);
  const normalized = value.replaceAll("\\", "/");
  const target = normalized === canonicalPrefix
    ? batchRoot
    : normalized.startsWith(canonicalPrefix + "/")
      ? resolve(batchRoot, normalized.slice(canonicalPrefix.length + 1))
      : resolve(kitRoot, normalized);
  const allowedRoot = normalized === canonicalPrefix || normalized.startsWith(canonicalPrefix + "/") ? batchRoot : kitRoot;
  assertDescendant(allowedRoot, target, label);
  assertFile(target, label);
  return target;
}

function assertMeasured(decision, metric, label, includeName = false) {
  assert(decision && metric, `${label}: measurement is missing`);
  assert(decision.ssim === metric.ssim && decision.rms === metric.rms && decision.changedPixelRatio === metric.changedPixelRatio, `${label}: measurement mismatch`);
  if (includeName) assert(decision.name === metric.name, `${label}: region name mismatch`);
}

function withoutName(region) {
  return { x: region.x, y: region.y, width: region.width, height: region.height };
}

function extractConfirmedPrompt(markdown) {
  const headings = [...markdown.matchAll(/^## Prompt[ \t]*$/gm)];
  assert(headings.length === 1, "reference prompt must contain exactly one ## Prompt heading");
  const sectionStart = headings[0].index + headings[0][0].length;
  const followingHeading = /^## [^\r\n]+$/gm;
  followingHeading.lastIndex = sectionStart;
  const next = followingHeading.exec(markdown);
  const section = markdown.slice(sectionStart, next?.index ?? markdown.length);
  const fences = [...section.matchAll(/^```text[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm)];
  assert(fences.length === 1, "reference prompt ## Prompt section must contain exactly one fenced text block");
  return fences[0][1].replaceAll("\r\n", "\n");
}

function reviewSignature(review) {
  return [review.calibrationLabel, review.semanticVerdict, review.pixelFidelityVerdict, review.interactionEvidenceSupportsTask].join("|");
}

function assertJson(actual, expected, message) {
  assert(stableJson(actual) === stableJson(expected), message);
}

function assertKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label}: expected an object`);
  const actual = Object.keys(value).sort();
  assertJson(actual, [...expected].sort(), `${label}: object keys drifted`);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${relative(kitRoot, file)} is not valid JSON: ${error.message}`);
  }
}

function assertDirectory(path, label) {
  assert(existsSync(path) && statSync(path).isDirectory(), `${label} is missing: ${path}`);
}

function assertFile(path, label) {
  assert(existsSync(path) && statSync(path).isFile(), `${label} is missing: ${path}`);
}

function assertDescendant(root, target, label) {
  const rel = relative(root, target);
  assert(rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label}: path escapes its allowed root`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  let root = defaultBatchRoot;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root") root = resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return { root };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { root } = parseArgs(process.argv.slice(2));
    const summary = validateImage2CalibrationBatch(root);
    console.log(`validate-image2-calibration passed: reviewed=${summary.reviewed}; qualified=${summary.qualified}; accepted=${summary.accepted}; rejected=${summary.rejected}; disputed=${summary.disputed}; total=${summary.qualifiedAfterBatch}/24; remaining=${summary.remainingQualifiedPairs}`);
  } catch (error) {
    console.error(`validate-image2-calibration failed: ${error.message}`);
    process.exit(1);
  }
}
