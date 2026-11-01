import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = resolve(kitRoot, "figma/workflow-target-scopes-2026-08-09.json");
const schema = readJson(resolve(kitRoot, "schema/figma-workflow-target-scopes.schema.json"));
const contract = readJson(contractPath);
const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
const validateSchema = ajv.compile(schema);
const errors = validateContract(contract, true);

const negatives = [
  {
    label: "shared-library publish",
    mutate(value) { value.globalBoundary.allowPublishSharedLibrary = true; }
  },
  {
    label: "receipt path escape",
    mutate(value) { value.workflows[0].screenshot.path = "../escape.png"; }
  },
  {
    label: "duplicate target node",
    mutate(value) {
      value.workflows[1].targetNodeId = value.workflows[0].targetNodeId;
      value.workflows[1].targetUrl = value.workflows[0].targetUrl;
    }
  },
  {
    label: "target URL mismatch",
    mutate(value) { value.workflows[0].targetUrl = value.workflows[0].targetUrl.replace("YOUR_NODE_ID", "19249-999"); }
  },
  {
    label: "existing-node mutation",
    mutate(value) { value.globalBoundary.allowMutateExistingNodes = true; }
  },
  {
    label: "viewport drift",
    mutate(value) { value.workflows[3].viewport.width = 1440; }
  },
  {
    label: "global file-local asset creation",
    mutate(value) { value.globalBoundary.allowCreateFileLocalAssetsByDefault = true; }
  },
  {
    label: "cross-workflow asset permission escalation",
    mutate(value) { value.workflows[0].permissions.assetCreation = structuredClone(value.workflows[2].permissions.assetCreation); }
  },
  {
    label: "asset exception target drift",
    mutate(value) { value.globalBoundary.workflowScopedLocalAssetException.targetNodeId = value.workflows[0].targetNodeId; }
  },
  {
    label: "holistic authorized file substitution",
    mutate(value) {
      const replacement = "UnapprovedReplacementFile";
      value.authorization.sourceUrl = value.authorization.sourceUrl.replace(value.file.fileKey, replacement);
      value.file.fileKey = replacement;
      for (const workflow of value.workflows) workflow.targetUrl = workflow.targetUrl.replace("YOUR_FIGMA_FILE_KEY", replacement);
    }
  },
  {
    label: "authorization entry mismatch",
    mutate(value) {
      value.authorization.sourceUrl = value.authorization.sourceUrl.replace("3150-7163", "3150-9999");
      value.file.entryNodeId = "3150:9999";
    }
  },
  {
    label: "isolated page identity drift",
    mutate(value) {
      value.targetPage.nodeId = "19249:999";
      for (const workflow of value.workflows) workflow.pageNodeId = "19249:999";
    }
  },
  {
    label: "workflow node family drift",
    mutate(value) {
      value.workflows[0].groupNodeId = "19249:900";
      value.workflows[0].scopeNodeId = "19249:901";
      value.workflows[0].targetNodeId = "19249:902";
      value.workflows[0].targetUrl = value.workflows[0].targetUrl.replace("YOUR_NODE_ID", "19249-902");
    }
  }
];

for (const { label, mutate } of negatives) {
  const negative = structuredClone(contract);
  mutate(negative);
  if (validateContract(negative, false).length === 0) errors.push(`negative fixture unexpectedly allowed ${label}`);
}

if (errors.length) {
  for (const error of errors) console.error(`validate-figma-workflow-target-scopes failed: ${error}`);
  process.exit(1);
}

console.log(`validate-figma-workflow-target-scopes passed: 4 isolated targets; receipts and scoped permissions verified; negative=${negatives.length}`);

function validateContract(value, checkFiles) {
  const targetErrors = [];
  if (!validateSchema(value)) {
    targetErrors.push(`schema errors: ${ajv.errorsText(validateSchema.errors, { separator: "; " })}`);
    return targetErrors;
  }

  const expected = new Map([
    ["image2-to-figma-page", { mode: "capture-and-native-rebuild", width: 1440, height: 1100, groupNodeId: "19249:402", scopeNodeId: "19249:403", targetNodeId: "YOUR_NODE_ID" }],
    ["prd-antd-to-figma-calibrated-page", { mode: "capture-and-page-readback", width: 1440, height: 1100, groupNodeId: "19249:411", scopeNodeId: "19249:412", targetNodeId: "19249:417" }],
    ["design-system-zero-to-one", { mode: "scoped-native-build", width: 1440, height: 1100, groupNodeId: "19249:420", scopeNodeId: "19249:421", targetNodeId: "19249:426" }],
    ["figma-3d-situation-screen", { mode: "write-output-then-readback", width: 1920, height: 1080, groupNodeId: "19249:429", scopeNodeId: "19249:430", targetNodeId: "19249:435" }]
  ]);

  const authorized = parseFigmaDesignUrl(value.authorization.sourceUrl, "authorization.sourceUrl", targetErrors);
  if (authorized && (authorized.fileKey !== value.file.fileKey || authorized.nodeId !== value.file.entryNodeId)) {
    targetErrors.push("authorization.sourceUrl does not bind file.fileKey and file.entryNodeId");
  }
  if (value.file.fileKey !== "YOUR_FIGMA_FILE_KEY" || value.file.entryNodeId !== "3150:7163" || value.targetPage.nodeId !== "19249:401") {
    targetErrors.push("authorized file, entry node, or isolated target page identity drifted");
  }

  const actualIds = value.workflows.map((workflow) => workflow.workflowId);
  if (new Set(actualIds).size !== expected.size || [...expected.keys()].some((id) => !actualIds.includes(id))) {
    targetErrors.push("workflow set must contain the four canonical Figma target consumers exactly once");
  }

  const nodeIds = new Set();
  for (const workflow of value.workflows) {
    const contractExpectation = expected.get(workflow.workflowId);
    if (!contractExpectation) continue;
    if (workflow.mode !== contractExpectation.mode) targetErrors.push(`${workflow.workflowId} mode drifted`);
    for (const field of ["groupNodeId", "scopeNodeId", "targetNodeId"]) {
      if (workflow[field] !== contractExpectation[field]) targetErrors.push(`${workflow.workflowId} ${field} drifted`);
    }
    if (workflow.viewport.width !== contractExpectation.width || workflow.viewport.height !== contractExpectation.height || workflow.viewport.deviceScaleFactor !== 1) {
      targetErrors.push(`${workflow.workflowId} viewport drifted`);
    }
    if (workflow.pageNodeId !== value.targetPage.nodeId) targetErrors.push(`${workflow.workflowId} pageNodeId does not match the isolated target page`);
    for (const field of ["groupNodeId", "scopeNodeId", "targetNodeId"]) {
      if (nodeIds.has(workflow[field])) targetErrors.push(`${workflow[field]} is reused across workflow targets`);
      nodeIds.add(workflow[field]);
    }
    const targetUrl = parseFigmaDesignUrl(workflow.targetUrl, `${workflow.workflowId} targetUrl`, targetErrors);
    if (!targetUrl || targetUrl.fileKey !== value.file.fileKey || targetUrl.nodeId !== workflow.targetNodeId) {
      targetErrors.push(`${workflow.workflowId} targetUrl does not bind fileKey and targetNodeId`);
    }
    for (const denied of ["existing node mutation", "existing variable mutation", "existing style mutation", "existing component mutation", "shared library publish", "library settings changes"]) {
      if (!workflow.permissions.denied.includes(denied)) targetErrors.push(`${workflow.workflowId} does not deny ${denied}`);
    }
    if (workflow.workflowId === "design-system-zero-to-one") {
      const assetCreation = workflow.permissions.assetCreation;
      if (!assetCreation.allowed) targetErrors.push("design-system-zero-to-one must carry the sole file-local asset creation exception");
      if (assetCreation.workflowId !== workflow.workflowId || assetCreation.targetNodeId !== workflow.targetNodeId) {
        targetErrors.push("design-system-zero-to-one asset creation exception is not bound to its workflow target");
      }
    } else {
      if (workflow.permissions.assetCreation.allowed !== false) targetErrors.push(`${workflow.workflowId} must deny file-local asset creation`);
      if (!workflow.permissions.denied.includes("new file-local variable, style, or component creation")) {
        targetErrors.push(`${workflow.workflowId} does not explicitly deny file-local asset creation`);
      }
    }
    if (checkFiles) validatePngReceipt(workflow.screenshot, `${workflow.workflowId} screenshot`, targetErrors);
  }

  const boundary = value.globalBoundary;
  for (const field of ["allowMutateExistingNodes", "allowDeleteExistingNodes", "allowRenameExistingNodes", "allowMutateExistingVariablesStylesComponents", "allowPublishSharedLibrary", "allowChangeLibrarySettings"]) {
    if (boundary[field] !== false) targetErrors.push(`globalBoundary.${field} must remain false`);
  }
  if (boundary.allowCreateFileLocalAssetsByDefault !== false) targetErrors.push("file-local asset creation must remain denied by default");
  const exception = boundary.workflowScopedLocalAssetException;
  const designSystem = value.workflows.find((workflow) => workflow.workflowId === "design-system-zero-to-one");
  if (!designSystem || JSON.stringify(exception) !== JSON.stringify(designSystem.permissions.assetCreation)) {
    targetErrors.push("global asset creation exception must match the design-system-zero-to-one workflow exception exactly");
  }
  if (value.readback.localVariableCollections.reduce((sum, collection) => sum + collection.variableCount, 0) !== value.readback.localVariableCount) {
    targetErrors.push("readback local variable collection counts do not sum to localVariableCount");
  }
  if (value.readback.componentsOnTargetPage !== 0 || value.readback.newVariablesCreated !== 0 || value.readback.newComponentsCreated !== 0 || value.readback.sharedLibraryPublished !== false) {
    targetErrors.push("initial target creation must not create components, variables, or publish a library");
  }
  if (checkFiles) validatePngReceipt(value.readback.pageScreenshot, "target page screenshot", targetErrors);
  return targetErrors;
}

function validatePngReceipt(receipt, label, targetErrors) {
  let file;
  try {
    file = resolveInsideKit(receipt.path);
  } catch (error) {
    targetErrors.push(`${label}: ${error.message}`);
    return;
  }
  if (!existsSync(file)) {
    targetErrors.push(`${label} is missing: ${receipt.path}`);
    return;
  }
  const bytes = readFileSync(file);
  if (bytes.length !== receipt.bytes) targetErrors.push(`${label} byte count mismatch`);
  if (createHash("sha256").update(bytes).digest("hex") !== receipt.sha256) targetErrors.push(`${label} SHA-256 mismatch`);
  if (bytes.length < 24 || bytes.subarray(1, 4).toString("ascii") !== "PNG") {
    targetErrors.push(`${label} is not a PNG`);
    return;
  }
  if (bytes.readUInt32BE(16) !== receipt.width || bytes.readUInt32BE(20) !== receipt.height) targetErrors.push(`${label} dimensions mismatch`);
}

function resolveInsideKit(file) {
  if (typeof file !== "string" || !file.trim() || isAbsolute(file)) throw new Error(`invalid kit-relative path: ${file}`);
  const target = resolve(kitRoot, file);
  const rel = relative(kitRoot, target);
  if (rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../")) throw new Error(`path escapes kit root: ${file}`);
  return target;
}

function parseFigmaDesignUrl(raw, label, targetErrors) {
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" || url.hostname !== "www.figma.com" || parts[0] !== "design" || !parts[1]) throw new Error("expected an https://www.figma.com/design URL");
    const node = url.searchParams.get("node-id");
    if (!node || !/^[0-9]+-[0-9]+$/.test(node)) throw new Error("missing numeric node-id query");
    return { fileKey: parts[1], nodeId: node.replace("-", ":") };
  } catch (error) {
    targetErrors.push(`${label} is invalid: ${error.message}`);
    return null;
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
