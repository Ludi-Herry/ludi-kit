import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultKitRoot = resolve(scriptDir, "..");

// A3 (PLAN-validation-waste-governance A3 / PLAN-validation-chain-slimming):
// successor bytes for live files (page/flow registries, generated pages) are
// read from their anchor commit when registered, so later authorized appends
// no longer require a new successor-of-successor chain for this gate.
const liveAnchorRegistry = (() => {
  try {
    return JSON.parse(readFileSync(resolve(defaultKitRoot, "quality/image2-history-anchor-registry.json"), "utf8"));
  } catch {
    return { liveReceiptAnchors: [] };
  }
})();
const liveAnchors = new Map((liveAnchorRegistry.liveReceiptAnchors ?? []).map((anchor) => [anchor.path, anchor]));
const findLiveAnchor = (p) => liveAnchors.get(p);
const contractPath = "quality/image2-golden-pages/allocation-and-holdout-freeze-2026-08-09.json";
const schemaPath = "schema/image2-golden-holdout-freeze.schema.json";
const pageRegistryPath = "projects/tianshu-ops/pages.json";
const flowRegistryPath = "projects/tianshu-ops/flows.json";
const generatedPagesPath = "projects/tianshu-ops/generated/pages.tsx";
const pageRegistrySuccessorPath = "quality/image2-golden-pages/page-registry-receipt-successor-2026-08-21.json";
const pageRegistrySuccessorFileReceipt = {
  bytes: 7038,
  sha256: "e9c3449c8ae36a9b462e430f09af478f2c619139415d54794ec70fe0d4a0132f"
};
const historicalPageRegistryReceipt = {
  path: pageRegistryPath,
  bytes: 26863,
  sha256: "49aa0b6d0ea5eebf3fd2c68a2f7f7040b84070490c4e69dfdc30102afa0c9fbd"
};
const historicalFlowRegistryReceipt = {
  path: flowRegistryPath,
  bytes: 6790,
  sha256: "ba34735b097bac8681ef9898e4c94aebcd5c320f67329551d4988bcff875dc44"
};
const historicalGeneratedPagesReceipt = {
  path: generatedPagesPath,
  bytes: 89623,
  sha256: "d02b87fb5945b641b86e6917d22bfe9d9007ece046c7786d87c744a5178cc515"
};
const expectedPageRegistryContractBindings = [
  {
    path: contractPath,
    bytes: 23793,
    sha256: "1811e8cff943d2c33d54076b17b2c721571da06e7402083465e63c950bd3f92d",
    receiptPointer: "/candidatePool/2/inputReceipts/4",
    receipt: {
      role: "pages",
      ...historicalPageRegistryReceipt,
      permittedForGeneration: true
    }
  },
  {
    path: contractPath,
    bytes: 23793,
    sha256: "1811e8cff943d2c33d54076b17b2c721571da06e7402083465e63c950bd3f92d",
    receiptPointer: "/candidatePool/2/sealedImplementationReceipts/0",
    receipt: {
      role: "existing-implementation",
      ...historicalGeneratedPagesReceipt,
      permittedForGeneration: false
    }
  },
  {
    path: contractPath,
    bytes: 23793,
    sha256: "1811e8cff943d2c33d54076b17b2c721571da06e7402083465e63c950bd3f92d",
    receiptPointer: "/candidatePool/2/inputReceipts/5",
    receipt: {
      role: "flows",
      ...historicalFlowRegistryReceipt,
      permittedForGeneration: true
    }
  },
  {
    path: "quality/image2-golden-pages/holdout-restart-3/candidate-pool-inventory-2026-08-11.json",
    bytes: 11446,
    sha256: "43151e401ec3d4e13470536e4539866cf3bb204c49c8990975f622ec2ea85c5d",
    receiptPointer: "/sourcePoolReceipts/3",
    receipt: historicalPageRegistryReceipt
  },
  {
    path: "quality/image2-golden-pages/holdout-restart-3/final-fresh-preimplementation-freeze-2026-08-11.json",
    bytes: 22995,
    sha256: "8d69220611af352671c617ba80eb54125dafc2eec6f9ec814d400560cd1ec53d",
    receiptPointer: "/sealedExistingImplementation/receipts/15",
    receipt: historicalGeneratedPagesReceipt
  },
  {
    path: "quality/image2-golden-pages/holdout-restart-3/final-fresh-preimplementation-freeze-2026-08-11.json",
    bytes: 22995,
    sha256: "8d69220611af352671c617ba80eb54125dafc2eec6f9ec814d400560cd1ec53d",
    receiptPointer: "/sourceReceipts/4",
    receipt: {
      role: "tianshu-page-registry",
      ...historicalPageRegistryReceipt
    }
  },
  {
    path: "quality/image2-golden-pages/holdout-restart-4/iteration-12-preimplementation-freeze-2026-08-12.json",
    bytes: 14721,
    sha256: "3f5ab8ba472db126d547220ffb0648d0c244ba32686fd62c4330a640856024d8",
    receiptPointer: "/source/pageRegistry",
    receipt: historicalPageRegistryReceipt
  }
];

const expectedCandidates = new Map([
  ["content-schedule-antd-v6-20260809", {
    allocation: "golden-1",
    projectId: "tianshu-ops",
    pageId: "content-schedule",
    route: "/content/schedule",
    sourceVariantId: "tianshu-ops/content-schedule/reference-v3"
  }],
  ["reports-logs-antd-v6-20260809", {
    allocation: "golden-2",
    projectId: "sample-platform",
    pageId: "reports-logs",
    route: "/reports/logs",
    sourceVariantId: "sample-platform/reports-logs/reference-v1"
  }],
  ["rbac-forbidden-antd-v6-20260809", {
    allocation: "golden-3",
    projectId: "tianshu-ops",
    pageId: "platform-rbac-forbidden",
    route: "/platform/rbac/forbidden-preview",
    sourceVariantId: "tianshu-ops/platform-rbac-forbidden/reference-v1"
  }],
  ["inventory-list-antd-v6-20260809", {
    allocation: "holdout-a",
    projectId: "sample-inventory-erp",
    pageId: "inventory-list",
    route: "/inventory",
    sourceVariantId: "sample-inventory-erp/inventory-list/reference-v2"
  }],
  ["tianshu-firmware-exploratory-20260717", {
    allocation: "holdout-b",
    projectId: "tianshu-firmware-canary",
    pageId: "production-firmware",
    route: "/production/firmware",
    sourceVariantId: "tianshu-firmware-canary/production-firmware/release-ledger"
  }],
  ["ops-canvas-existing-20260717", {
    allocation: "reserve-unused",
    projectId: "ops-canvas",
    pageId: "design-system-spec",
    route: "/spec/index.html",
    sourceVariantId: "ops-canvas/design-system-spec/reference-v1"
  }]
]);

const expectedAssignments = {
  golden1: "content-schedule-antd-v6-20260809",
  golden2: "reports-logs-antd-v6-20260809",
  golden3: "rbac-forbidden-antd-v6-20260809",
  holdouts: ["inventory-list-antd-v6-20260809", "tianshu-firmware-exploratory-20260717"],
  reserveUnused: "ops-canvas-existing-20260717"
};

const expectedGateIds = [
  "formal-generator",
  "deterministic-output",
  "technical",
  "browser-interaction",
  "responsive",
  "console",
  "visual-semantic",
  "raw-diff-ledger"
];

export function isTianshuPageRegistryReceipt(receipt) {
  return receipt?.path === pageRegistryPath;
}

export function isTianshuAppendOnlySourceReceipt(receipt) {
  return isTianshuPageRegistryReceipt(receipt)
    || receipt?.path === flowRegistryPath
    || receipt?.path === generatedPagesPath;
}

export function validateTianshuPageRegistryReceiptSuccessor({
  kitRootInput = defaultKitRoot,
  receipt = historicalPageRegistryReceipt,
  successorInput = null,
  historicalBytesInput = null,
  currentBytesInput = null,
  checkGit = true,
  checkHistoricalContractFiles = true
} = {}) {
  const kitRoot = resolve(kitRootInput);
  const expectedSourceReceipt = receipt?.path === flowRegistryPath
    ? historicalFlowRegistryReceipt
    : receipt?.path === generatedPagesPath
      ? historicalGeneratedPagesReceipt
      : historicalPageRegistryReceipt;
  assert(isTianshuAppendOnlySourceReceipt(receipt), "append-only source predecessor receipt path drifted");
  assert(receipt.bytes === expectedSourceReceipt.bytes, "append-only source predecessor receipt bytes drifted");
  assert(receipt.sha256 === expectedSourceReceipt.sha256, "append-only source predecessor receipt SHA-256 drifted");

  let successor = successorInput;
  if (successor === null) {
    const successorFile = resolveInside(kitRoot, pageRegistrySuccessorPath, "page-registry successor");
    assert(existsSync(successorFile) && statSync(successorFile).isFile(), `page-registry successor is missing: ${pageRegistrySuccessorPath}`);
    const successorBytes = readFileSync(successorFile);
    assert(successorBytes.length === pageRegistrySuccessorFileReceipt.bytes, "page-registry successor file byte count drifted");
    assert(sha256(successorBytes) === pageRegistrySuccessorFileReceipt.sha256, "page-registry successor file SHA-256 drifted");
    successor = parseJsonBytes(successorBytes, pageRegistrySuccessorPath);
  }

  assertExactKeys(successor, [
    "version", "kind", "revisionId", "recordedAt", "authority", "predecessor",
    "successor", "addition", "flowExtension", "generatedOutputPolicy",
    "validatorReceiptPolicy", "historicalContracts", "preservation"
  ], "page-registry successor");
  assert(successor.version === "1.0.0", "page-registry successor version drifted");
  assert(successor.kind === "image2-content-version-receipt-revision", "content-version receipt revision kind drifted");
  assert(successor.revisionId === "image2-content-version-receipt-revision-2026-08-21", "content-version receipt revisionId drifted");
  assert(successor.recordedAt === "2026-08-21", "page-registry successor recordedAt drifted");

  assertExactKeys(successor.authority, ["classification", "userAuthorization", "repositoryHeadWhenAuthorized"], "page-registry successor authority");
  assert(successor.authority.classification === "user-authorized-content-version-receipt-revision", "content-version receipt revision authority classification drifted");
  assert(successor.authority.userAuthorization === "授权统一 append-only successor，并修改对应 3 个 Image2 validators。停止扩建 Image2 证据框架。采用仓库现有 receipt-revision 模式做最小 unblock，只证明历史 receipt 原样保留和本次已验收页面的必要追加。", "content-version receipt revision user authorization drifted");
  assert(successor.authority.repositoryHeadWhenAuthorized === "f43a5c60b70b5d22fc14d3f4fe0df61202e97ee4", "page-registry successor authorization HEAD drifted");

  assertExactKeys(successor.predecessor, ["path", "sourceCommit", "bytes", "sha256", "pageCount"], "page-registry predecessor");
  assert(successor.predecessor.path === historicalPageRegistryReceipt.path, "page-registry predecessor path drifted");
  assert(successor.predecessor.sourceCommit === successor.authority.repositoryHeadWhenAuthorized, "page-registry predecessor source commit drifted");
  assert(successor.predecessor.bytes === historicalPageRegistryReceipt.bytes, "page-registry predecessor bytes drifted");
  assert(successor.predecessor.sha256 === historicalPageRegistryReceipt.sha256, "page-registry predecessor SHA-256 drifted");
  assert(successor.predecessor.pageCount === 16, "page-registry predecessor page count drifted");

  assertExactKeys(successor.successor, ["path", "bytes", "sha256", "pageCount"], "page-registry current successor");
  assert(successor.successor.path === pageRegistryPath, "page-registry current successor path drifted");
  assert(Number.isInteger(successor.successor.bytes) && successor.successor.bytes > successor.predecessor.bytes, "page-registry current successor bytes are invalid");
  assert(/^[a-f0-9]{64}$/.test(successor.successor.sha256), "page-registry current successor SHA-256 is invalid");
  assert(successor.successor.pageCount === 17, "page-registry current successor page count drifted");
  assert(successor.successor.pageCount === successor.predecessor.pageCount + 1, "page-registry successor must add exactly one page");

  assertExactKeys(successor.addition, [
    "projectId", "pageId", "route", "title", "pattern", "canonicalBytes", "canonicalSha256"
  ], "page-registry successor addition");
  assert(JSON.stringify(successor.addition) === JSON.stringify({
    projectId: "tianshu-ops",
    pageId: "content-version",
    route: "/content/version",
    title: "内容 · 版本与回滚",
    pattern: "list-page",
    canonicalBytes: 1804,
    canonicalSha256: "88c27550a1c2aeaea2afcef92f0dee42b7a58a33bf8c679495d0d28699794079"
  }), "page-registry successor addition drifted");

  assertExactKeys(successor.flowExtension, [
    "path", "sourceCommit", "predecessorBytes", "predecessorSha256", "successorBytes",
    "successorSha256", "flowCount", "flowId", "appendedStep", "appendedSuccessCriterion"
  ], "page-registry successor flow extension");
  assert(JSON.stringify(successor.flowExtension) === JSON.stringify({
    path: flowRegistryPath,
    sourceCommit: "f43a5c60b70b5d22fc14d3f4fe0df61202e97ee4",
    predecessorBytes: 6790,
    predecessorSha256: "ba34735b097bac8681ef9898e4c94aebcd5c320f67329551d4988bcff875dc44",
    successorBytes: 7000,
    successorSha256: "84617ddddfe1803eca09c79cd3095b673da5fdb964c1e1b6c0e4494d864c180e",
    flowCount: 7,
    flowId: "content-publish-chain",
    appendedStep: {
      pageId: "content-version",
      route: "/content/version",
      role: "trace-compare-and-rollback"
    },
    appendedSuccessCriterion: "发布后可定位版本历史，并在回滚前完成差异确认和影响范围确认。"
  }), "page-registry successor flow extension drifted");

  assertExactKeys(successor.generatedOutputPolicy, [
    "path", "sourceCommit", "predecessorBytes", "predecessorSha256",
    "currentReceiptPinned", "validationOwners"
  ], "content-version generated output policy");
  assert(JSON.stringify(successor.generatedOutputPolicy) === JSON.stringify({
    path: generatedPagesPath,
    sourceCommit: "f43a5c60b70b5d22fc14d3f4fe0df61202e97ee4",
    predecessorBytes: 89623,
    predecessorSha256: "d02b87fb5945b641b86e6917d22bfe9d9007ece046c7786d87c744a5178cc515",
    currentReceiptPinned: false,
    validationOwners: ["project-generator-suite", "production-build", "full-validate"]
  }), "content-version generated output policy drifted");

  assertExactKeys(successor.validatorReceiptPolicy, [
    "historicalReceiptCommit", "currentValidatorHashChained", "validationOwners"
  ], "content-version validator receipt policy");
  assert(JSON.stringify(successor.validatorReceiptPolicy) === JSON.stringify({
    historicalReceiptCommit: "f43a5c60b70b5d22fc14d3f4fe0df61202e97ee4",
    currentValidatorHashChained: false,
    validationOwners: ["targeted-validator-tests", "full-validate"]
  }), "content-version validator receipt policy drifted");

  assert(Array.isArray(successor.historicalContracts) && successor.historicalContracts.length === expectedPageRegistryContractBindings.length, "page-registry historical contract bindings drifted");
  assert(JSON.stringify(successor.historicalContracts) === JSON.stringify(expectedPageRegistryContractBindings), "page-registry historical contract bindings drifted");
  assertExactKeys(successor.preservation, [
    "historicalContractFilesEdited", "historicalPagesChanged", "historicalPagesRemoved",
    "existingFlowFieldsRewritten", "flowOrderChanged", "appendedFlowStepCount",
    "appendedFlowSuccessCriterionCount", "historicalGeneratedReceiptPreserved",
    "generatedCurrentReceiptPinned", "validatorCurrentHashChained", "addedPageIds", "image2VerdictsChanged",
    "iterationBudgetChanged", "thresholdsChanged", "figmaLockChanged",
    "privateInputReadOrRegistered", "candidateGenerationStarted"
  ], "page-registry successor preservation");
  assert(JSON.stringify(successor.preservation) === JSON.stringify({
    historicalContractFilesEdited: false,
    historicalPagesChanged: false,
    historicalPagesRemoved: false,
    existingFlowFieldsRewritten: false,
    flowOrderChanged: false,
    appendedFlowStepCount: 1,
    appendedFlowSuccessCriterionCount: 1,
    historicalGeneratedReceiptPreserved: true,
    generatedCurrentReceiptPinned: false,
    validatorCurrentHashChained: false,
    addedPageIds: ["content-version"],
    image2VerdictsChanged: false,
    iterationBudgetChanged: false,
    thresholdsChanged: false,
    figmaLockChanged: false,
    privateInputReadOrRegistered: false,
    candidateGenerationStarted: false
  }), "page-registry successor preservation boundary drifted");

  if (checkGit) {
    const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", successor.predecessor.sourceCommit, "HEAD"], { cwd: kitRoot });
    assert(ancestry.status === 0, "page-registry predecessor source commit is not an ancestor of HEAD");
  }
  const historicalBytes = historicalBytesInput ?? readGitBlob(kitRoot, successor.predecessor.sourceCommit, successor.predecessor.path);
  assert(historicalBytes.length === successor.predecessor.bytes, "page-registry predecessor blob byte count drifted");
  assert(sha256(historicalBytes) === successor.predecessor.sha256, "page-registry predecessor blob SHA-256 drifted");

  const currentFile = resolveInside(kitRoot, successor.successor.path, "page-registry current successor");
  const pageAnchor = currentBytesInput == null ? findLiveAnchor(successor.successor.path) : null;
  const currentBytes = currentBytesInput ?? (pageAnchor
    ? readGitBlob(kitRoot, pageAnchor.sourceCommit, successor.successor.path)
    : readFileSync(currentFile));
  assert(currentBytes.length === successor.successor.bytes, "page-registry current successor byte count drifted");
  assert(sha256(currentBytes) === successor.successor.sha256, "page-registry current successor SHA-256 drifted");

  const historicalDocument = parseJsonBytes(historicalBytes, `${successor.predecessor.sourceCommit}:${successor.predecessor.path}`);
  const currentDocument = parseJsonBytes(currentBytes, successor.successor.path);
  assert(historicalDocument.projectId === successor.addition.projectId, "page-registry predecessor projectId drifted");
  assert(Array.isArray(historicalDocument.pages) && historicalDocument.pages.length === successor.predecessor.pageCount, "page-registry predecessor page inventory drifted");
  assert(currentDocument.projectId === successor.addition.projectId, "page-registry current projectId drifted");
  assert(Array.isArray(currentDocument.pages) && currentDocument.pages.length === successor.successor.pageCount, "page-registry current page inventory drifted");

  const historicalPageIds = new Set(historicalDocument.pages.map((page) => page.id));
  assert(historicalPageIds.size === historicalDocument.pages.length, "page-registry predecessor contains duplicate page ids");
  assert(!historicalPageIds.has(successor.addition.pageId), "page-registry predecessor already contains the successor page");
  const additionMatches = currentDocument.pages.filter((page) => page.id === successor.addition.pageId);
  assert(additionMatches.length === 1, "page-registry successor page must appear exactly once");
  assert(currentDocument.pages.at(-1)?.id === successor.addition.pageId, "page-registry successor page was not appended");

  const currentWithoutAddition = structuredClone(currentDocument);
  currentWithoutAddition.pages = currentWithoutAddition.pages.filter((page) => page.id !== successor.addition.pageId);
  assert(JSON.stringify(currentWithoutAddition) === JSON.stringify(historicalDocument), "page-registry historical pages or registry fields changed");
  const additionBytes = Buffer.from(JSON.stringify(additionMatches[0]));
  assert(additionBytes.length === successor.addition.canonicalBytes, "page-registry successor page canonical byte count drifted");
  assert(sha256(additionBytes) === successor.addition.canonicalSha256, "page-registry successor page canonical SHA-256 drifted");
  assert(additionMatches[0].route === successor.addition.route, "page-registry successor page route drifted");
  assert(additionMatches[0].title === successor.addition.title, "page-registry successor page title drifted");
  assert(additionMatches[0].pattern === successor.addition.pattern, "page-registry successor page pattern drifted");

  const flowExtension = successor.flowExtension;
  const historicalFlowBytes = readGitBlob(kitRoot, flowExtension.sourceCommit, flowExtension.path);
  assert(historicalFlowBytes.length === flowExtension.predecessorBytes, "flow-registry predecessor blob byte count drifted");
  assert(sha256(historicalFlowBytes) === flowExtension.predecessorSha256, "flow-registry predecessor blob SHA-256 drifted");
  const currentFlowFile = resolveInside(kitRoot, flowExtension.path, "flow-registry current successor");
  const flowAnchor = findLiveAnchor(flowExtension.path);
  const currentFlowBytes = flowAnchor
    ? readGitBlob(kitRoot, flowAnchor.sourceCommit, flowExtension.path)
    : readFileSync(currentFlowFile);
  assert(currentFlowBytes.length === flowExtension.successorBytes, "flow-registry current successor byte count drifted");
  assert(sha256(currentFlowBytes) === flowExtension.successorSha256, "flow-registry current successor SHA-256 drifted");
  const historicalFlowDocument = parseJsonBytes(historicalFlowBytes, `${flowExtension.sourceCommit}:${flowExtension.path}`);
  const currentFlowDocument = parseJsonBytes(currentFlowBytes, flowExtension.path);
  assert(Array.isArray(historicalFlowDocument.flows) && historicalFlowDocument.flows.length === flowExtension.flowCount, "flow-registry predecessor inventory drifted");
  assert(Array.isArray(currentFlowDocument.flows) && currentFlowDocument.flows.length === flowExtension.flowCount, "flow-registry current inventory drifted");
  const historicalFlowIds = historicalFlowDocument.flows.map((flow) => flow.id);
  const currentFlowIds = currentFlowDocument.flows.map((flow) => flow.id);
  assert(JSON.stringify(currentFlowIds) === JSON.stringify(historicalFlowIds), "flow-registry order or identities changed");
  assert(new Set(historicalFlowIds).size === historicalFlowIds.length, "flow-registry predecessor contains duplicate flow ids");
  const historicalFlow = historicalFlowDocument.flows.find((flow) => flow.id === flowExtension.flowId);
  const currentFlow = currentFlowDocument.flows.find((flow) => flow.id === flowExtension.flowId);
  assert(historicalFlow && currentFlow, "flow-registry extension target is missing");
  assert(JSON.stringify(currentFlow.steps) === JSON.stringify([...historicalFlow.steps, flowExtension.appendedStep]), "flow-registry successor step is not a single append");
  assert(JSON.stringify(currentFlow.successCriteria) === JSON.stringify([...historicalFlow.successCriteria, flowExtension.appendedSuccessCriterion]), "flow-registry successor criterion is not a single append");
  const currentFlowWithoutAppend = structuredClone(currentFlowDocument);
  const normalizedFlow = currentFlowWithoutAppend.flows.find((flow) => flow.id === flowExtension.flowId);
  normalizedFlow.steps = structuredClone(historicalFlow.steps);
  normalizedFlow.successCriteria = structuredClone(historicalFlow.successCriteria);
  assert(JSON.stringify(currentFlowWithoutAppend) === JSON.stringify(historicalFlowDocument), "flow-registry fields outside the authorized append changed");

  const generatedPolicy = successor.generatedOutputPolicy;
  const historicalGeneratedBytes = readGitBlob(kitRoot, generatedPolicy.sourceCommit, generatedPolicy.path);
  assert(historicalGeneratedBytes.length === generatedPolicy.predecessorBytes, "generated pages predecessor blob byte count drifted");
  assert(sha256(historicalGeneratedBytes) === generatedPolicy.predecessorSha256, "generated pages predecessor blob SHA-256 drifted");

  if (checkHistoricalContractFiles) {
    for (const binding of successor.historicalContracts) {
      const bindingFile = resolveInside(kitRoot, binding.path, "page-registry historical contract");
      const bindingBytes = readFileSync(bindingFile);
      assert(bindingBytes.length === binding.bytes, `page-registry historical contract byte count drifted: ${binding.path}`);
      assert(sha256(bindingBytes) === binding.sha256, `page-registry historical contract SHA-256 drifted: ${binding.path}`);
      const bindingDocument = parseJsonBytes(bindingBytes, binding.path);
      const boundReceipt = readJsonPointer(bindingDocument, binding.receiptPointer);
      assert(JSON.stringify(boundReceipt) === JSON.stringify(binding.receipt), `page-registry historical receipt pointer drifted: ${binding.path}${binding.receiptPointer}`);
    }
  }

  return {
    revisionId: successor.revisionId,
    historicalDocument,
    currentDocument,
    historicalFlowDocument,
    currentFlowDocument,
    addedPageId: successor.addition.pageId
  };
}

export function validateImage2GoldenHoldoutFreeze(kitRootInput = defaultKitRoot, contractInput = null) {
  const kitRoot = resolve(kitRootInput);
  const contract = contractInput ?? readJson(resolve(kitRoot, contractPath));
  const schema = readJson(resolve(kitRoot, schemaPath));
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, formats: { "date-time": true } });
  const validateSchema = ajv.compile(schema);
  if (!validateSchema(contract)) {
    throw new Error(`contract schema validation failed: ${formatAjvErrors(validateSchema.errors)}`);
  }

  assertExactKeys(contract, [
    "$schema", "version", "contractId", "recordedAtUtc", "programId", "repositoryBaseCommit",
    "status", "freezeState", "executionBaseline", "iterationBudget", "candidatePool",
    "assignments", "holdouts", "evaluationGates", "boundaries"
  ], "Image2 Golden/Holdout freeze contract");
  assert(contract.$schema === "../../schema/image2-golden-holdout-freeze.schema.json", "holdout freeze schema path drifted");
  assert(contract.version === "1.0.0", "holdout freeze version must be 1.0.0");
  assert(contract.contractId === "image2-golden-holdout-freeze-2026-08-09", "holdout freeze contractId drifted");
  assert(Number.isFinite(Date.parse(contract.recordedAtUtc)), "holdout freeze recordedAtUtc must be an ISO date-time");
  assert(contract.programId === "image2-golden-pages-v1", "holdout freeze programId drifted");
  assert(contract.repositoryBaseCommit === "6f2b88fdb53b2bfb864f3b1d3941c50bd5be817d", "holdout freeze base commit drifted");
  assert(contract.status === "pre-frozen", "holdout allocation must remain pre-frozen until final evaluation starts");

  const freeze = contract.freezeState;
  assertExactKeys(freeze, [
    "unacceptedCandidateSourceCodeOpened", "unacceptedCandidateScreenshotsOpened",
    "unacceptedCandidateBrowserResultsOpened", "historicalAccountingLabelsKnown",
    "golden2IterationStarted", "golden3IterationStarted", "holdoutEvaluationStarted"
  ], "holdout freeze state");
  assert(freeze.unacceptedCandidateSourceCodeOpened === false, "unaccepted candidate source code must remain unopened at freeze");
  assert(freeze.unacceptedCandidateScreenshotsOpened === false, "unaccepted candidate screenshots must remain unopened at freeze");
  assert(freeze.unacceptedCandidateBrowserResultsOpened === false, "unaccepted candidate browser results must remain unopened at freeze");
  assert(freeze.historicalAccountingLabelsKnown === true, "known historical labels must stay disclosed");
  assert(freeze.golden2IterationStarted === false && freeze.golden3IterationStarted === false, "Golden iteration started before Holdout freeze");
  assert(freeze.holdoutEvaluationStarted === false, "Holdout evaluation started before pre-freeze closed");

  const baseline = contract.executionBaseline;
  assertExactKeys(baseline, [
    "outputMode", "framework", "foundation", "foundationVersion", "iconPackage",
    "designPack", "formalGeneratorRequired", "oneOffHtmlForbidden"
  ], "execution baseline");
  assert(baseline.outputMode === "library-native", "execution outputMode must remain library-native");
  assert(baseline.framework === "react", "execution framework must remain React");
  assert(baseline.foundation === "antd" && baseline.foundationVersion === "6.5.0", "execution foundation must remain antd@6.5.0");
  assert(baseline.iconPackage === "@ant-design/icons", "execution icon package drifted");
  assert(baseline.formalGeneratorRequired === true && baseline.oneOffHtmlForbidden === true, "formal generator boundary drifted");
  validateReceipt(kitRoot, baseline.designPack, "execution design pack", { permitted: true });

  const budget = contract.iterationBudget;
  assertExactKeys(budget, [
    "maxTotalIterations", "consumedAtFreeze", "remainingAtFreeze",
    "reservedFinalHoldoutEvaluations", "maxRemainingGoldenIterations", "countingRule"
  ], "iteration budget");
  assert(budget.maxTotalIterations === 13, "iteration budget must remain 13");
  assert(budget.consumedAtFreeze === 1, "Golden 1 must consume exactly one iteration at freeze");
  assert(budget.remainingAtFreeze === budget.maxTotalIterations - budget.consumedAtFreeze, "remaining iteration budget arithmetic drifted");
  assert(budget.reservedFinalHoldoutEvaluations === 2, "two final Holdout evaluations must remain reserved");
  assert(budget.maxRemainingGoldenIterations === budget.remainingAtFreeze - budget.reservedFinalHoldoutEvaluations, "Golden iteration allowance arithmetic drifted");

  assert(Array.isArray(contract.candidatePool) && contract.candidatePool.length === expectedCandidates.size, "candidate pool must contain exactly six real candidates");
  const candidateIds = new Set();
  const sourceVariantIds = new Set();
  const pageIdentities = new Set();
  const referenceHashes = new Set();
  const candidatesById = new Map();

  for (const candidate of contract.candidatePool) {
    assertExactKeys(candidate, [
      "candidateId", "sourceVariantId", "projectId", "pageId", "route", "sourceContextType",
      "sourceOutputMode", "complexityBand", "archetype", "allocation", "historicalCalibrationLabel",
      "qualityGateResultAtFreeze", "selectionReason", "inputReceipts", "sealedImplementationReceipts",
      "sealedImplementationRoots"
    ], `candidate ${candidate.candidateId ?? "unknown"}`);
    const expected = expectedCandidates.get(candidate.candidateId);
    assert(expected, `unexpected candidate identity: ${candidate.candidateId}`);
    assert(candidate.allocation === expected.allocation, `candidate allocation drifted: ${candidate.candidateId}`);
    assert(candidate.projectId === expected.projectId, `candidate projectId drifted: ${candidate.candidateId}`);
    assert(candidate.pageId === expected.pageId, `candidate pageId drifted: ${candidate.candidateId}`);
    assert(candidate.route === expected.route, `candidate route drifted: ${candidate.candidateId}`);
    assert(candidate.sourceVariantId === expected.sourceVariantId, `candidate source variant drifted: ${candidate.candidateId}`);
    assert(!candidateIds.has(candidate.candidateId), `duplicate candidateId: ${candidate.candidateId}`);
    assert(!sourceVariantIds.has(candidate.sourceVariantId), `duplicate sourceVariantId: ${candidate.sourceVariantId}`);
    const pageIdentity = `${candidate.projectId}:${candidate.pageId}:${candidate.route}`;
    assert(!pageIdentities.has(pageIdentity), `duplicate page identity: ${pageIdentity}`);
    candidateIds.add(candidate.candidateId);
    sourceVariantIds.add(candidate.sourceVariantId);
    pageIdentities.add(pageIdentity);
    candidatesById.set(candidate.candidateId, candidate);

    const receiptPaths = new Set();
    let requestCount = 0;
    let promptCount = 0;
    let referenceCount = 0;
    for (const receipt of candidate.inputReceipts) {
      validateReceipt(kitRoot, receipt, `${candidate.candidateId} input receipt`);
      assert(!receiptPaths.has(receipt.path), `duplicate input receipt path for ${candidate.candidateId}: ${receipt.path}`);
      receiptPaths.add(receipt.path);
      if (receipt.role === "request") requestCount += 1;
      if (receipt.role === "prompt") promptCount += 1;
      if (receipt.role === "reference-image") {
        referenceCount += 1;
        assert(!referenceHashes.has(receipt.sha256), `duplicate reference image SHA-256: ${receipt.sha256}`);
        referenceHashes.add(receipt.sha256);
      }
    }
    assert(requestCount === 1, `candidate must bind exactly one request: ${candidate.candidateId}`);
    assert(promptCount === 1, `candidate must bind exactly one prompt: ${candidate.candidateId}`);
    assert(referenceCount === 1, `candidate must bind exactly one reference image: ${candidate.candidateId}`);

    for (const receipt of candidate.sealedImplementationReceipts) {
      validateReceipt(kitRoot, receipt, `${candidate.candidateId} sealed implementation receipt`, { permitted: false });
      assert(!receiptPaths.has(receipt.path), `sealed implementation overlaps candidate input: ${receipt.path}`);
    }
    for (const rootPath of candidate.sealedImplementationRoots) {
      const sealedRoot = resolveInside(kitRoot, rootPath, `${candidate.candidateId} sealed implementation root`);
      assert(existsSync(sealedRoot), `sealed implementation root is missing: ${rootPath}`);
      for (const receipt of candidate.inputReceipts.filter((entry) => entry.permittedForGeneration)) {
        assert(!pathInsideOrEqual(receipt.path, rootPath), `permitted input enters sealed implementation root: ${receipt.path}`);
      }
    }

    if (candidate.allocation === "golden-1") {
      assert(candidate.qualityGateResultAtFreeze === "accepted", "Golden 1 accepted result drifted");
    } else {
      assert(candidate.qualityGateResultAtFreeze === null, `unaccepted candidate already has a quality-gate result: ${candidate.candidateId}`);
      assert(candidate.sealedImplementationReceipts.length > 0, `unaccepted candidate lacks a sealed implementation receipt: ${candidate.candidateId}`);
    }
  }
  assert(candidateIds.size === expectedCandidates.size, "candidate identities are incomplete");

  assertExactKeys(contract.assignments, ["golden1", "golden2", "golden3", "holdouts", "reserveUnused"], "candidate assignments");
  assert(contract.assignments.golden1 === expectedAssignments.golden1, "Golden 1 assignment drifted");
  assert(contract.assignments.golden2 === expectedAssignments.golden2, "Golden 2 assignment drifted");
  assert(contract.assignments.golden3 === expectedAssignments.golden3, "Golden 3 assignment drifted");
  assert(contract.assignments.reserveUnused === expectedAssignments.reserveUnused, "reserve assignment drifted");
  assertSameSet(contract.assignments.holdouts, expectedAssignments.holdouts, "Holdout assignments drifted");
  const allAssignments = [
    contract.assignments.golden1,
    contract.assignments.golden2,
    contract.assignments.golden3,
    ...contract.assignments.holdouts,
    contract.assignments.reserveUnused
  ];
  assert(new Set(allAssignments).size === expectedCandidates.size, "Golden, Holdout, and reserve assignments overlap");

  assert(Array.isArray(contract.holdouts) && contract.holdouts.length === 2, "exactly two Holdouts must be frozen");
  const holdoutIds = new Set();
  for (const holdout of contract.holdouts) {
    assertExactKeys(holdout, ["candidateId", "identity", "selectionReason", "evaluationPolicy", "reviewPolicy", "inputPolicy"], `Holdout ${holdout.candidateId ?? "unknown"}`);
    assert(expectedAssignments.holdouts.includes(holdout.candidateId), `unexpected Holdout identity: ${holdout.candidateId}`);
    assert(!holdoutIds.has(holdout.candidateId), `duplicate Holdout identity: ${holdout.candidateId}`);
    holdoutIds.add(holdout.candidateId);
    const candidate = candidatesById.get(holdout.candidateId);
    assert(candidate, `Holdout candidate is missing from pool: ${holdout.candidateId}`);
    assert(["holdout-a", "holdout-b"].includes(candidate.allocation), `Holdout candidate allocation drifted: ${holdout.candidateId}`);

    assertExactKeys(holdout.identity, ["projectId", "pageId", "route", "sourceVariantId"], `${holdout.candidateId} identity`);
    assert(holdout.identity.projectId === candidate.projectId, `Holdout projectId does not match candidate: ${holdout.candidateId}`);
    assert(holdout.identity.pageId === candidate.pageId, `Holdout pageId does not match candidate: ${holdout.candidateId}`);
    assert(holdout.identity.route === candidate.route, `Holdout route does not match candidate: ${holdout.candidateId}`);
    assert(holdout.identity.sourceVariantId === candidate.sourceVariantId, `Holdout source variant does not match candidate: ${holdout.candidateId}`);

    const policy = holdout.evaluationPolicy;
    assertExactKeys(policy, [
      "status", "evaluateAfter", "finalEvaluationOnly", "implementationAttemptLimit",
      "derivedGeneratorContractRevisionLimit", "usedForIteration", "repairAllowed", "onFailure"
    ], `${holdout.candidateId} evaluation policy`);
    assert(policy.status === "pre-frozen", `Holdout status drifted: ${holdout.candidateId}`);
    assert(policy.evaluateAfter === "golden-2-and-golden-3-user-accepted", `Holdout evaluation opened too early: ${holdout.candidateId}`);
    assert(policy.finalEvaluationOnly === true, `Holdout must remain final-evaluation-only: ${holdout.candidateId}`);
    assert(policy.implementationAttemptLimit === 1, `Holdout implementation attempt limit must remain one: ${holdout.candidateId}`);
    assert(policy.derivedGeneratorContractRevisionLimit === 1, `Holdout derived contract revision limit must remain one: ${holdout.candidateId}`);
    assert(policy.usedForIteration === false, `Holdout cannot be used for iteration: ${holdout.candidateId}`);
    assert(policy.repairAllowed === false, `Holdout repair is forbidden: ${holdout.candidateId}`);
    assert(policy.onFailure === "stop-and-report-no-go", `Holdout failure action drifted: ${holdout.candidateId}`);

    assertExactKeys(holdout.reviewPolicy, ["independentReviewersRequired", "unanimousAcceptanceRequired", "reviewerResultMayInformRepair"], `${holdout.candidateId} review policy`);
    assert(holdout.reviewPolicy.independentReviewersRequired === 2, `Holdout requires two independent reviewers: ${holdout.candidateId}`);
    assert(holdout.reviewPolicy.unanimousAcceptanceRequired === true, `Holdout acceptance must be unanimous: ${holdout.candidateId}`);
    assert(holdout.reviewPolicy.reviewerResultMayInformRepair === false, `Holdout reviewer results cannot inform repair: ${holdout.candidateId}`);

    assertExactKeys(holdout.inputPolicy, [
      "consumeOnlyFrozenReceipts", "existingGeneratedImplementationAllowed",
      "existingCalibrationTargetAllowed", "resultRootsRemainSealedUntilEvaluation"
    ], `${holdout.candidateId} input policy`);
    assert(holdout.inputPolicy.consumeOnlyFrozenReceipts === true, `Holdout must consume only frozen receipts: ${holdout.candidateId}`);
    assert(holdout.inputPolicy.existingGeneratedImplementationAllowed === false, `existing Holdout implementation cannot be an input: ${holdout.candidateId}`);
    assert(holdout.inputPolicy.existingCalibrationTargetAllowed === false, `existing calibration target cannot be a Holdout input: ${holdout.candidateId}`);
    assert(holdout.inputPolicy.resultRootsRemainSealedUntilEvaluation === true, `Holdout result roots must remain sealed: ${holdout.candidateId}`);

    for (const receipt of candidate.inputReceipts.filter((entry) => entry.permittedForGeneration)) {
      const normalized = normalizeRelative(receipt.path);
      assert(!normalized.includes("/generated/"), `Holdout permitted input includes generated implementation: ${receipt.path}`);
      assert(!normalized.includes("/target/"), `Holdout permitted input includes calibration target: ${receipt.path}`);
      assert(!normalized.includes("/workflow/"), `Holdout permitted input includes workflow result: ${receipt.path}`);
    }
  }
  assertSameSet([...holdoutIds], expectedAssignments.holdouts, "frozen Holdout identities drifted");

  assert(Array.isArray(contract.evaluationGates) && contract.evaluationGates.length === expectedGateIds.length, "evaluation gate count drifted");
  const actualGateIds = contract.evaluationGates.map((gate) => gate.id);
  assertSameSet(actualGateIds, expectedGateIds, "evaluation gate identities drifted");
  assert(contract.evaluationGates.every((gate) => gate.required === true), "every Holdout evaluation gate must remain required");

  const boundaries = contract.boundaries;
  assertExactKeys(boundaries, [
    "newCalibrationBatchAuthorized", "remainingCalibrationPairsPaused", "holdoutRepairAuthorized",
    "holdoutIterationUseAuthorized", "frozenCalibrationEvidenceMutationAuthorized",
    "rawThresholdChangeAuthorized", "rawGateOverride", "protectedFinalEligiblePrdRead",
    "protectedFinalEligiblePrdRegistered", "figmaWriteAuthorizedBeforeGateClose"
  ], "Holdout freeze boundaries");
  assert(boundaries.newCalibrationBatchAuthorized === false, "new calibration batch remains unauthorized");
  assert(boundaries.remainingCalibrationPairsPaused === true, "remaining 19 calibration pairs must stay paused");
  assert(boundaries.holdoutRepairAuthorized === false, "Holdout repair remains unauthorized");
  assert(boundaries.holdoutIterationUseAuthorized === false, "Holdout iteration use remains unauthorized");
  assert(boundaries.frozenCalibrationEvidenceMutationAuthorized === false, "frozen calibration evidence mutation remains unauthorized");
  assert(boundaries.rawThresholdChangeAuthorized === false, "raw threshold changes remain unauthorized");
  assert(boundaries.rawGateOverride === false, "raw gate override remains disabled");
  assert(boundaries.protectedFinalEligiblePrdRead === false, "protected final eligible PRD read boundary drifted");
  assert(boundaries.protectedFinalEligiblePrdRegistered === false, "protected final eligible PRD registry boundary drifted");
  assert(boundaries.figmaWriteAuthorizedBeforeGateClose === false, "Figma write cannot start before the quality gate closes");

  return {
    contractId: contract.contractId,
    candidateCount: candidateIds.size,
    goldenPages: 3,
    holdouts: holdoutIds.size,
    consumedIterations: budget.consumedAtFreeze,
    remainingIterations: budget.remainingAtFreeze,
    reservedHoldoutEvaluations: budget.reservedFinalHoldoutEvaluations,
    golden2: contract.assignments.golden2,
    golden3: contract.assignments.golden3
  };
}

function validateReceipt(kitRoot, receipt, label, options = {}) {
  assertExactKeys(receipt, ["role", "path", "bytes", "sha256", "permittedForGeneration"], `${label} receipt`);
  assert(typeof receipt.role === "string" && receipt.role.length > 0, `${label} role is missing`);
  assert(Number.isInteger(receipt.bytes) && receipt.bytes > 0, `${label} bytes must be positive`);
  assert(/^[a-f0-9]{64}$/.test(receipt.sha256), `${label} SHA-256 is invalid`);
  if (typeof options.permitted === "boolean") {
    assert(receipt.permittedForGeneration === options.permitted, `${label} generation permission drifted`);
  }
  const file = resolveInside(kitRoot, receipt.path, label);
  assert(existsSync(file) && statSync(file).isFile(), `${label} is missing: ${receipt.path}`);
  if (isTianshuAppendOnlySourceReceipt(receipt)) {
    validateTianshuPageRegistryReceiptSuccessor({ kitRootInput: kitRoot, receipt });
    return file;
  }
  const bytes = readFileSync(file);
  assert(bytes.length === receipt.bytes, `${label} byte count mismatch: ${receipt.path}`);
  assert(sha256(bytes) === receipt.sha256, `${label} SHA-256 mismatch: ${receipt.path}`);
  return file;
}

function resolveInside(root, pathValue, label) {
  assert(typeof pathValue === "string" && pathValue.length > 0, `${label} path is missing`);
  assert(!isAbsolute(pathValue), `${label} path must be relative`);
  const resolved = resolve(root, pathValue);
  const rel = relative(root, resolved);
  assert(rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} path escapes kit root`);
  return resolved;
}

function pathInsideOrEqual(pathValue, rootValue) {
  const path = normalizeRelative(pathValue);
  const root = normalizeRelative(rootValue).replace(/\/$/, "");
  return path === root || path.startsWith(`${root}/`);
}

function normalizeRelative(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function assertSameSet(actualValues, expectedValues, message) {
  const actual = [...new Set(actualValues)].sort();
  const expected = [...new Set(expectedValues)].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function readJson(path) {
  assert(existsSync(path), `required JSON is missing: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`invalid JSON ${path}: ${error.message}`);
  }
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    throw new Error(`invalid JSON ${label}: ${error.message}`);
  }
}

function readJsonPointer(value, pointer) {
  assert(typeof pointer === "string" && pointer.startsWith("/"), `invalid JSON pointer: ${pointer}`);
  let current = value;
  for (const encodedSegment of pointer.slice(1).split("/")) {
    const segment = encodedSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    assert(current !== null && typeof current === "object" && Object.hasOwn(current, segment), `missing JSON pointer segment ${segment}: ${pointer}`);
    current = current[segment];
  }
  return current;
}

function readGitBlob(kitRoot, commit, pathValue) {
  try {
    const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: kitRoot,
      encoding: "utf8"
    }).trim();
    const file = resolveInside(kitRoot, pathValue, "page-registry predecessor Git blob");
    const repositoryRelativePath = relative(repositoryRoot, file);
    assert(repositoryRelativePath !== ".." && !repositoryRelativePath.startsWith(`..${sep}`) && !isAbsolute(repositoryRelativePath), "page-registry predecessor path escapes the repository");
    return execFileSync("git", ["show", `${commit}:${normalizeRelative(repositoryRelativePath)}`], {
      cwd: repositoryRoot,
      encoding: null,
      maxBuffer: 5 * 1024 * 1024
    });
  } catch (error) {
    throw new Error(`unable to read page-registry predecessor Git blob: ${error.message}`);
  }
}

function assertExactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} keys drifted`);
}

function formatAjvErrors(errors = []) {
  return (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = validateImage2GoldenHoldoutFreeze();
    console.log(`validate-image2-golden-holdout-freeze passed: candidates=${summary.candidateCount}; golden=3; holdouts=${summary.holdouts}; iterations=${summary.consumedIterations}/13; remaining=${summary.remainingIterations}; reservedHoldouts=${summary.reservedHoldoutEvaluations}; golden2=${summary.golden2}; golden3=${summary.golden3}`);
  } catch (error) {
    console.error(`validate-image2-golden-holdout-freeze failed: ${error.message}`);
    process.exitCode = 1;
  }
}
