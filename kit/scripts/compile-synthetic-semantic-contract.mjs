import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const defaultOraclePath = resolve(kitRoot, "harness/synthetic-prd/coverage-oracle.json");
const oracleSchemaPath = resolve(kitRoot, "schema/synthetic-prd-coverage-oracle.schema.json");
const semanticSchemaPath = resolve(kitRoot, "schema/semantic-contract.schema.json");
const compilerVersion = "1.0.0";

export function compileSyntheticSemanticContract({
  inputDir,
  outFile,
  oraclePath = defaultOraclePath,
  write = true
}) {
  if (typeof inputDir !== "string" || inputDir.trim() === "") {
    throw new Error("inputDir is required");
  }
  const absoluteInputDir = resolve(inputDir);
  const absoluteOutFile = resolve(outFile ?? resolve(absoluteInputDir, "semantic-contract.json"));
  if (write && existsSync(absoluteOutFile)) {
    throw new Error(`semantic contract output already exists: ${absoluteOutFile}`);
  }

  const files = readAndVerifyGeneratorFiles(absoluteInputDir);
  const oracleDocument = loadCoverageOracle(oraclePath);
  const profileId = files.manifest.request?.profileId;
  const oracleProfile = oracleDocument.profiles.find((item) => item.profileId === profileId);
  if (!oracleProfile) throw new Error(`coverage oracle has no profile: ${profileId}`);

  assertGeneratorEnvelope(files.manifest, files.request, profileId);
  const rendered = parseRenderedPrd(files.prdText);
  const requirements = parseRequirementMarkers(files.prdText);
  validateRenderedStructure({
    rendered,
    requirements,
    oracleProfile,
    manifest: files.manifest,
    request: files.request,
    projectDescription: files.projectDescription,
    samplePack: files.samplePack
  });

  const contract = buildContract({
    rendered,
    requirements,
    manifest: files.manifest,
    oracleProfile,
    hashes: {
      prdSha256: sha256(files.prdBytes),
      manifestSha256: sha256(files.manifestBytes),
      oracleSha256: sha256(readFileSync(resolve(oraclePath)))
    }
  });
  validateSemanticContract(contract);
  const bytes = canonicalJsonBytes(contract);
  if (write) writeFileSync(absoluteOutFile, bytes, { flag: "wx" });
  return {
    contract,
    bytes,
    sha256: sha256(bytes),
    outFile: absoluteOutFile
  };
}

export function loadCoverageOracle(oraclePath = defaultOraclePath) {
  const absolutePath = resolve(oraclePath);
  const document = readJson(absolutePath);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson(oracleSchemaPath));
  if (!validate(document)) {
    throw new Error(`coverage oracle schema failed: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
  }
  const ids = new Set();
  for (const profile of document.profiles) {
    if (ids.has(profile.profileId)) throw new Error(`duplicate coverage profile: ${profile.profileId}`);
    ids.add(profile.profileId);
    assertEqual(
      profile.expected.flowStepCounts.length,
      profile.expected.flowCount,
      `${profile.profileId} oracle flowStepCounts`
    );
    const expectedRequirements =
      profile.expected.flowStepCounts.reduce((sum, count) => sum + count * 2, 0) +
      profile.expected.flowCount * 2;
    assertEqual(
      profile.expected.requirementCount,
      expectedRequirements,
      `${profile.profileId} oracle requirementCount`
    );
  }
  return document;
}

function readAndVerifyGeneratorFiles(inputDir) {
  const manifestPath = resolve(inputDir, "manifest.json");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (!manifest.files || typeof manifest.files !== "object") {
    throw new Error("synthetic manifest files map is missing");
  }
  const verified = {};
  for (const [name, receipt] of Object.entries(manifest.files)) {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(name)) throw new Error(`unsafe manifest file name: ${name}`);
    const bytes = readFileSync(resolve(inputDir, name));
    assertEqual(bytes.length, receipt.bytes, `${name} byte receipt`);
    assertEqual(sha256(bytes), receipt.sha256, `${name} SHA-256 receipt`);
    verified[name] = bytes;
  }
  for (const required of [
    "generation-request.json",
    "project-description.json",
    "sample-pack.json",
    "synthetic-prd.md"
  ]) {
    if (!verified[required]) throw new Error(`synthetic manifest omits ${required}`);
  }
  return {
    manifest,
    manifestBytes,
    request: JSON.parse(verified["generation-request.json"].toString("utf8")),
    projectDescription: JSON.parse(verified["project-description.json"].toString("utf8")),
    samplePack: JSON.parse(verified["sample-pack.json"].toString("utf8")),
    prdBytes: verified["synthetic-prd.md"],
    prdText: verified["synthetic-prd.md"].toString("utf8")
  };
}

function assertGeneratorEnvelope(manifest, request, profileId) {
  assertEqual(manifest.harnessMode, "synthetic-generation-readiness", "manifest harnessMode");
  assertEqual(manifest.qualifying, false, "manifest qualifying");
  assertEqual(manifest.scoring, false, "manifest scoring");
  assertEqual(manifest.semanticContract?.owner, "blind-readiness-harness", "semantic owner");
  assertEqual(
    manifest.semanticContract?.status,
    "pending-independent-compile",
    "semantic status"
  );
  assertEqual(request.mode, "synthetic-blind-generation-readiness", "request mode");
  assertEqual(request.qualifying, false, "request qualifying");
  assertEqual(request.scoring, false, "request scoring");
  assertEqual(request.source?.profileId, profileId, "request profileId");
  assertEqual(request.projectId, manifest.projectId, "request projectId");
  assertArrayEqual(
    request.harnessOwnedInputs,
    ["semantic-contract.json"],
    "harness-owned input declaration"
  );
  const prohibited = new Set(request.prohibitedProductOutputs ?? []);
  for (const item of ["product-owned flow assertions", "jsdom flow smoke"]) {
    if (!prohibited.has(item)) throw new Error(`request must prohibit ${item}`);
  }
}

function parseRenderedPrd(text) {
  const profileId = matchOne(text, /^- Shape profile：([a-z0-9][a-z0-9-]*)$/m, "shape profile");
  const seed = matchOne(text, /^- Seed：(0|[1-9][0-9]{0,19})$/m, "seed");
  const title = matchOne(text, /^# (.+) 产品需求文档$/m, "PRD title");
  const pageSection = sliceSection(text, "## 2. 页面", "## 3. 实体与样例规模");
  const entitySection = sliceSection(text, "## 3. 实体与样例规模", "## 4. 核心流程");
  const flowSection = sliceSection(text, "## 4. 核心流程", "## 5. Harness requirement IDs");

  const pages = [];
  const pagePattern = /^### (page-[0-9]{2}) (.+)\r?\n\r?\n- 路由：`(\/[a-z0-9/?=&._-]*)`\r?\n- 页面类型：`([a-z-]+)`\r?\n- 目标：(.+)\r?\n- 字段单元：([0-9]+)$/gm;
  for (const match of pageSection.matchAll(pagePattern)) {
    pages.push({
      pageId: match[1],
      title: match[2],
      route: match[3],
      pattern: match[4],
      goal: match[5],
      fieldUnits: Number(match[6])
    });
  }

  const entities = [];
  const entityPattern = /^- (Entity[0-9]{2})：([0-9]+) 个字段，([0-9]+) 条演示记录$/gm;
  for (const match of entitySection.matchAll(entityPattern)) {
    entities.push({ entityId: match[1], fieldCount: Number(match[2]), recordCount: Number(match[3]) });
  }

  const flows = [];
  let currentFlow;
  for (const line of flowSection.split(/\r?\n/)) {
    const flowMatch = line.match(/^### (flow-[0-9]{2})$/);
    if (flowMatch) {
      currentFlow = { flowId: flowMatch[1], steps: [] };
      flows.push(currentFlow);
      continue;
    }
    const stepMatch = line.match(/^([0-9]+)\. 在 (page-[0-9]{2}) 完成步骤，进入 (page-[0-9]{2})。$/);
    if (stepMatch) {
      if (!currentFlow) throw new Error("flow step appears before a flow heading");
      const expectedNumber = currentFlow.steps.length + 1;
      assertEqual(Number(stepMatch[1]), expectedNumber, `${currentFlow.flowId} rendered step number`);
      currentFlow.steps.push({
        stepId: `${currentFlow.flowId}-step-${pad(expectedNumber)}`,
        pageId: stepMatch[2],
        nextPageId: stepMatch[3]
      });
    }
  }
  return { title, profileId, seed, pages, entities, flows };
}

function parseRequirementMarkers(text) {
  const markerLines = text
    .split(/\r?\n/)
    .filter((line) => line.includes("harness-requirement"));
  const requirements = markerLines.map((line, index) => {
    const match = line.match(/^<!-- harness-requirement (\{.*\}) -->$/);
    if (!match) throw new Error(`malformed harness requirement marker at marker ${index + 1}`);
    try {
      return JSON.parse(match[1]);
    } catch (error) {
      throw new Error(`invalid harness requirement JSON at marker ${index + 1}: ${error.message}`);
    }
  });
  if (requirements.length === 0) throw new Error("synthetic PRD has no harness requirement markers");
  return requirements;
}

function validateRenderedStructure({
  rendered,
  requirements,
  oracleProfile,
  manifest,
  request,
  projectDescription,
  samplePack
}) {
  const expected = oracleProfile.expected;
  assertEqual(rendered.profileId, oracleProfile.profileId, "rendered profileId");
  assertEqual(rendered.profileId, manifest.request.profileId, "manifest rendered profileId");
  assertEqual(rendered.seed, manifest.request.seed, "manifest rendered seed");
  assertEqual(rendered.seed, request.source.seed, "request rendered seed");
  assertEqual(rendered.pages.length, expected.pageCount, "rendered page count");
  assertEqual(rendered.flows.length, expected.flowCount, "rendered flow count");
  assertEqual(rendered.entities.length, expected.entityCount, "rendered entity count");
  assertEqual(
    rendered.pages.reduce((sum, page) => sum + page.fieldUnits, 0),
    expected.fieldUnitsTotal,
    "rendered field unit count"
  );
  for (const key of ["pageCount", "flowCount", "entityCount", "fieldUnitsTotal"]) {
    assertEqual(manifest.structure[key], expected[key], `manifest structure ${key}`);
  }
  assertSequentialIds(rendered.pages.map((page) => page.pageId), "page");
  assertSequentialIds(rendered.flows.map((flow) => flow.flowId), "flow");
  assertArrayEqual(
    rendered.flows.map((flow) => flow.steps.length),
    expected.flowStepCounts,
    "rendered flow step counts"
  );

  const projectPages = projectDescription.pages ?? [];
  assertEqual(projectDescription.projectId, manifest.projectId, "project-description projectId");
  assertEqual(projectPages.length, rendered.pages.length, "project-description page count");
  for (const renderedPage of rendered.pages) {
    const projectPage = projectPages.find((page) => page.id === renderedPage.pageId);
    if (!projectPage) throw new Error(`project-description omits ${renderedPage.pageId}`);
    assertEqual(projectPage.route, renderedPage.route, `${renderedPage.pageId} project route`);
    assertEqual(projectPage.pattern, renderedPage.pattern, `${renderedPage.pageId} project pattern`);
    assertEqual(countProjectPageFields(projectPage), renderedPage.fieldUnits, `${renderedPage.pageId} field units`);
  }

  const entityEntries = Object.entries(samplePack.entities ?? {});
  assertEqual(entityEntries.length, rendered.entities.length, "sample-pack entity count");
  for (const renderedEntity of rendered.entities) {
    const records = samplePack.entities?.[renderedEntity.entityId];
    if (!records) throw new Error(`sample-pack omits ${renderedEntity.entityId}`);
    const recordValues = Object.values(records);
    assertEqual(recordValues.length, renderedEntity.recordCount, `${renderedEntity.entityId} record count`);
    if (recordValues.length === 0) throw new Error(`${renderedEntity.entityId} has no records`);
    assertEqual(
      Object.keys(recordValues[0]).length,
      renderedEntity.fieldCount,
      `${renderedEntity.entityId} field count`
    );
  }

  validateRequirements(rendered, requirements, oracleProfile);
  assertEqual(requirements.length, expected.requirementCount, "rendered requirement count");
  assertEqual(manifest.semanticContract.requirementCount, expected.requirementCount, "manifest requirement count");
  const markerIds = requirements.map((item) => item.requirementId).sort();
  assertArrayEqual(request.requiredRequirementIds, markerIds, "generation request requirement IDs");
}

function validateRequirements(rendered, requirements, oracleProfile) {
  const ids = new Set();
  const kinds = new Set(["action", "state", "side-effect", "recovery"]);
  for (const requirement of requirements) {
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
      throw new Error("requirement marker must contain an object");
    }
    assertToken(requirement.requirementId, "requirementId");
    assertToken(requirement.flowId, `${requirement.requirementId} flowId`);
    assertToken(requirement.stepId, `${requirement.requirementId} stepId`);
    if (!kinds.has(requirement.kind)) throw new Error(`unsupported requirement kind: ${requirement.kind}`);
    if (ids.has(requirement.requirementId)) throw new Error(`duplicate requirementId: ${requirement.requirementId}`);
    ids.add(requirement.requirementId);
  }

  const pageMap = new Map(rendered.pages.map((page) => [page.pageId, page]));
  const consumed = new Set();
  for (const flow of rendered.flows) {
    const inFlow = requirements.filter((item) => item.flowId === flow.flowId);
    flow.steps.forEach((step) => {
      const action = exactlyOne(inFlow, (item) => item.kind === "action" && item.stepId === step.stepId, `${step.stepId} action`);
      const state = exactlyOne(inFlow, (item) => item.kind === "state" && item.stepId === step.stepId, `${step.stepId} state`);
      validateActionRequirement(action, step, pageMap);
      assertExactKeys(
        state,
        ["requirementId", "kind", "flowId", "stepId", "pageId", "testId", "route"],
        state.requirementId
      );
      assertEqual(state.pageId, step.nextPageId, `${state.requirementId} pageId`);
      assertEqual(state.route, pageMap.get(step.nextPageId)?.route, `${state.requirementId} route`);
      assertToken(state.testId, `${state.requirementId} testId`);
      consumed.add(action.requirementId);
      consumed.add(state.requirementId);
    });

    const finalStep = flow.steps.at(-1);
    const sideEffect = exactlyOne(inFlow, (item) => item.kind === "side-effect", `${flow.flowId} side-effect`);
    assertExactKeys(
      sideEffect,
      ["requirementId", "kind", "flowId", "stepId", "pageId", "testId"],
      sideEffect.requirementId
    );
    assertEqual(sideEffect.stepId, finalStep.stepId, `${sideEffect.requirementId} stepId`);
    assertEqual(sideEffect.pageId, finalStep.nextPageId, `${sideEffect.requirementId} pageId`);
    assertToken(sideEffect.testId, `${sideEffect.requirementId} testId`);

    const recovery = exactlyOne(inFlow, (item) => item.kind === "recovery", `${flow.flowId} recovery`);
    assertExactKeys(
      recovery,
      [
        "requirementId",
        "kind",
        "flowId",
        "stepId",
        "fromPageId",
        "pageId",
        "actionTestId",
        "stateTestId",
        "route"
      ],
      recovery.requirementId
    );
    assertEqual(recovery.stepId, finalStep.stepId, `${recovery.requirementId} stepId`);
    assertEqual(recovery.fromPageId, finalStep.nextPageId, `${recovery.requirementId} fromPageId`);
    assertEqual(recovery.route, pageMap.get(recovery.pageId)?.route, `${recovery.requirementId} route`);
    assertToken(recovery.actionTestId, `${recovery.requirementId} actionTestId`);
    assertToken(recovery.stateTestId, `${recovery.requirementId} stateTestId`);
    consumed.add(sideEffect.requirementId);
    consumed.add(recovery.requirementId);
  }
  assertEqual(consumed.size, requirements.length, "requirements assigned to rendered flows");

  const expectedKinds = {
    action: oracleProfile.expected.flowStepCounts.reduce((sum, count) => sum + count, 0),
    state: oracleProfile.expected.flowStepCounts.reduce((sum, count) => sum + count, 0),
    "side-effect": oracleProfile.expected.flowCount,
    recovery: oracleProfile.expected.flowCount
  };
  for (const kind of oracleProfile.coverage.perStepKinds.concat(oracleProfile.coverage.perFlowKinds)) {
    assertEqual(
      requirements.filter((item) => item.kind === kind).length,
      expectedKinds[kind],
      `${kind} requirement coverage`
    );
  }
}

function validateActionRequirement(action, step, pageMap) {
  const shared = ["requirementId", "kind", "flowId", "stepId", "pageId", "actionType", "testId", "nextRoute"];
  const special = {
    click: [],
    fill: ["value"],
    select: ["value", "optionTestId"],
    press: ["key"]
  };
  if (!Object.hasOwn(special, action.actionType)) {
    throw new Error(`${action.requirementId} has unsupported actionType ${action.actionType}`);
  }
  assertExactKeys(action, shared.concat(special[action.actionType]), action.requirementId);
  assertEqual(action.pageId, step.pageId, `${action.requirementId} pageId`);
  assertEqual(action.nextRoute, pageMap.get(step.nextPageId)?.route, `${action.requirementId} nextRoute`);
  assertToken(action.testId, `${action.requirementId} testId`);
  if (action.actionType === "fill" && !["string", "number", "boolean"].includes(typeof action.value)) {
    throw new Error(`${action.requirementId} fill value must be scalar`);
  }
  if (action.actionType === "select") {
    if (typeof action.value !== "string" || action.value.length === 0) {
      throw new Error(`${action.requirementId} select value must be a string`);
    }
    assertToken(action.optionTestId, `${action.requirementId} optionTestId`);
  }
  if (action.actionType === "press" && (typeof action.key !== "string" || action.key.length === 0)) {
    throw new Error(`${action.requirementId} key must be a string`);
  }
}

function buildContract({ rendered, requirements, manifest, hashes }) {
  const pageMap = new Map(rendered.pages.map((page) => [page.pageId, page]));
  const flows = rendered.flows.map((flow) => {
    const inFlow = requirements.filter((item) => item.flowId === flow.flowId);
    const sideEffect = inFlow.find((item) => item.kind === "side-effect");
    const recovery = inFlow.find((item) => item.kind === "recovery");
    const steps = flow.steps.map((step, index) => {
      const action = inFlow.find((item) => item.kind === "action" && item.stepId === step.stepId);
      const state = inFlow.find((item) => item.kind === "state" && item.stepId === step.stepId);
      const assertions = [
        { kind: "route", value: state.route },
        { kind: "visibleTestId", testId: state.testId }
      ];
      if (index === flow.steps.length - 1) {
        assertions.push({ kind: "visibleTestId", testId: sideEffect.testId });
      }
      return {
        stepId: step.stepId,
        pageId: step.pageId,
        action: compileAction(action),
        assertions
      };
    });
    steps.push({
      stepId: `${flow.flowId}-recovery`,
      pageId: recovery.fromPageId,
      action: { type: "click", testId: recovery.actionTestId },
      assertions: [
        { kind: "route", value: recovery.route },
        { kind: "visibleTestId", testId: recovery.stateTestId }
      ]
    });
    return { flowId: flow.flowId, steps };
  });
  const requiredTestIds = collectTestIds(flows);
  return {
    $schema: "../../schema/semantic-contract.schema.json",
    version: "1.0.0",
    contractId: `synthetic-contract-${manifest.projectId}`,
    owner: "blind-readiness-harness",
    projectId: manifest.projectId,
    source: {
      kind: "synthetic-prd",
      profileId: rendered.profileId,
      profileSha256: manifest.request.profileSha256,
      seed: rendered.seed,
      prdSha256: hashes.prdSha256,
      manifestSha256: hashes.manifestSha256,
      oracleSha256: hashes.oracleSha256
    },
    compiler: {
      path: "scripts/compile-synthetic-semantic-contract.mjs",
      version: compilerVersion
    },
    entry: {
      route: pageMap.get("page-01")?.route ?? rendered.pages[0].route,
      identityPath: "/artifact-meta.json"
    },
    requiredTestIds,
    flows
  };
}

function compileAction(requirement) {
  if (requirement.actionType === "click") {
    return { type: "click", testId: requirement.testId };
  }
  if (requirement.actionType === "fill") {
    return { type: "fill", testId: requirement.testId, value: String(requirement.value) };
  }
  if (requirement.actionType === "select") {
    return {
      type: "select",
      testId: requirement.testId,
      optionTestId: requirement.optionTestId,
      value: requirement.value
    };
  }
  return { type: "press", testId: requirement.testId, key: requirement.key };
}

function collectTestIds(flows) {
  const values = new Set();
  for (const flow of flows) {
    for (const step of flow.steps) {
      if (step.action.testId) values.add(step.action.testId);
      if (step.action.optionTestId) values.add(step.action.optionTestId);
      for (const assertion of step.assertions) {
        if (assertion.testId) values.add(assertion.testId);
      }
    }
  }
  return [...values].sort();
}

function validateSemanticContract(contract) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const validate = ajv.compile(readJson(semanticSchemaPath));
  if (!validate(contract)) {
    throw new Error(`semantic contract schema failed: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
  }
}

function countProjectPageFields(page) {
  const content = page.content ?? {};
  return (
    (content.metrics?.length ?? 0) +
    (content.filters?.length ?? 0) +
    (content.details?.length ?? 0) +
    (content.fields?.length ?? 0) +
    (content.table?.columns?.length ?? 0)
  );
}

function sliceSection(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  const end = text.indexOf(endHeading);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`cannot isolate PRD section ${startHeading}`);
  }
  return text.slice(start + startHeading.length, end).trim();
}

function matchOne(text, pattern, label) {
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const matches = [...text.matchAll(globalPattern)];
  if (matches.length !== 1) throw new Error(`${label} must appear exactly once`);
  return matches[0][1];
}

function exactlyOne(values, predicate, label) {
  const matches = values.filter(predicate);
  if (matches.length !== 1) throw new Error(`${label} requirement count: expected 1, received ${matches.length}`);
  return matches[0];
}

function assertSequentialIds(ids, prefix) {
  const expected = ids.map((_, index) => `${prefix}-${pad(index + 1)}`);
  assertArrayEqual(ids, expected, `${prefix} IDs`);
}

function assertExactKeys(value, expectedKeys, label) {
  assertArrayEqual(Object.keys(value).sort(), [...expectedKeys].sort(), `${label} keys`);
}

function assertArrayEqual(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
}

function assertToken(value, label) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error(`${label} must use lowercase kebab-case`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(sortValue(value), null, 2)}\n`, "utf8");
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])])
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) throw new Error(`unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const result = compileSyntheticSemanticContract({
    inputDir: options.input,
    outFile: options.out,
    oraclePath: options.oracle ? resolve(options.oracle) : defaultOraclePath
  });
  console.log(
    `compile-synthetic-semantic-contract passed: contract=${result.contract.contractId}; sha256=${result.sha256}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

export const syntheticSemanticCompilerPaths = {
  defaultOraclePath,
  oracleSchemaPath,
  semanticSchemaPath
};
