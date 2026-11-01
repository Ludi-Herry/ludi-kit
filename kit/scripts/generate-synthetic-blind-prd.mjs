import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const defaultProfilesPath = resolve(kitRoot, "harness/synthetic-prd/shape-profiles.json");
const shapeSchemaPath = resolve(kitRoot, "schema/synthetic-prd-shape-profiles.schema.json");
const projectDescriptionSchemaPath = resolve(kitRoot, "schema/project-description.schema.json");
const projectContextSchemaPath = resolve(kitRoot, "schema/project-context.schema.json");
const samplePackSchemaPath = resolve(kitRoot, "schema/project-sample-pack.schema.json");
const artifactIdentitySchemaPath = resolve(kitRoot, "schema/synthetic-artifact-identity.schema.json");

const generatorVersion = "1.0.0";
const lexiconVersion = "neutral-v1";
const fixedReviewedAt = "2026-08-04";
const uint64Max = (1n << 64n) - 1n;

const subjects = [
  "设备",
  "任务",
  "记录",
  "资源",
  "队列",
  "规则",
  "工单",
  "计划",
  "节点",
  "批次",
  "来源",
  "版本"
];
const attributes = [
  "名称",
  "状态",
  "类型",
  "数量",
  "时间",
  "负责人",
  "优先级",
  "来源",
  "结果",
  "备注",
  "范围",
  "进度"
];
const actions = ["查看", "筛选", "登记", "确认", "更新", "恢复", "提交", "归档"];
const targetFiles = [
  "consumer-business-context.json",
  "consumer-artifact-identity.json",
  "control-business-context.json",
  "control-artifact-identity.json",
  "generation-request.json",
  "manifest.json",
  "project-description.json",
  "sample-pack.json",
  "synthetic-prd.md"
];

export function loadSyntheticProfiles(profilesPath = defaultProfilesPath) {
  const document = readJson(profilesPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const validate = ajv.compile(readJson(shapeSchemaPath));
  if (!validate(document)) {
    throw new Error(`shape profiles schema failed: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
  }
  validateProfileSemantics(document.profiles);
  return document;
}

export function generateSyntheticBlindPrd({
  profileId,
  seed,
  outDir,
  profilesPath = defaultProfilesPath
}) {
  const normalizedSeed = normalizeSeed(seed);
  if (typeof profileId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(profileId)) {
    throw new Error("profileId must use lowercase kebab-case");
  }
  if (typeof outDir !== "string" || outDir.trim() === "") {
    throw new Error("outDir is required");
  }

  const profilesDocument = loadSyntheticProfiles(profilesPath);
  const profile = profilesDocument.profiles.find((candidate) => candidate.profileId === profileId);
  if (!profile) throw new Error(`unknown synthetic PRD profile: ${profileId}`);

  const absoluteOutDir = resolve(outDir);
  assertEmptyOutputDirectory(absoluteOutDir);
  mkdirSync(absoluteOutDir, { recursive: true });

  const profileBytes = canonicalJsonBytes(profile);
  const profileSha256 = sha256(profileBytes);
  const profileSetSha256 = sha256(readFileSync(resolve(profilesPath)));
  const seedMaterial = `${profileId}:${normalizedSeed}:${profileSha256}`;
  const suffix = sha256(seedMaterial).slice(0, 8);
  const projectId = `synthetic-${profileId}-${suffix}`;
  const productName = `合成业务管理台 ${suffix.toUpperCase()}`;
  const artifactIdentities = Object.fromEntries(
    ["consumer", "control"].map((arm) => [
      arm,
      {
        runId: `synthetic-readiness-${profileId}-${suffix}`,
        arm,
        projectId,
        artifactId: deterministicUuid(seedMaterial, `artifact-${arm}`)
      }
    ])
  );

  const samplePack = buildSamplePack({ profile, projectId, seedMaterial });
  const pages = buildPages({ profile, projectId, productName, seedMaterial });
  const requirementModel = buildRequirementModel({ profile, pages, seedMaterial });
  const projectDescription = buildProjectDescription({ projectId, productName, pages });
  const consumerBusinessContext = buildBusinessContext({
    arm: "consumer",
    projectId,
    productName,
    pages,
    requirementModel
  });
  const controlBusinessContext = buildBusinessContext({
    arm: "control",
    projectId,
    productName,
    pages,
    requirementModel
  });
  const generationRequest = buildGenerationRequest({
    profile,
    profileSha256,
    normalizedSeed,
    projectId,
    requirementModel
  });
  const syntheticPrd = buildSyntheticPrdMarkdown({
    profile,
    normalizedSeed,
    productName,
    pages,
    samplePack,
    requirementModel
  });

  validateGeneratedContracts({
    artifactIdentities,
    projectDescription,
    consumerBusinessContext,
    controlBusinessContext,
    samplePack
  });

  const outputs = {
    "consumer-artifact-identity.json": canonicalJsonBytes(artifactIdentities.consumer),
    "consumer-business-context.json": canonicalJsonBytes(consumerBusinessContext),
    "control-artifact-identity.json": canonicalJsonBytes(artifactIdentities.control),
    "control-business-context.json": canonicalJsonBytes(controlBusinessContext),
    "generation-request.json": canonicalJsonBytes(generationRequest),
    "project-description.json": canonicalJsonBytes(projectDescription),
    "sample-pack.json": canonicalJsonBytes(samplePack),
    "synthetic-prd.md": Buffer.from(syntheticPrd, "utf8")
  };

  for (const [name, bytes] of Object.entries(outputs)) {
    writeFileSync(resolve(absoluteOutDir, name), bytes, { flag: "wx" });
  }

  const manifest = {
    $schema: "synthetic-blind-prd-manifest.v1",
    version: "1.0.0",
    harnessMode: "synthetic-generation-readiness",
    qualifying: false,
    scoring: false,
    projectId,
    generator: {
      path: "scripts/generate-synthetic-blind-prd.mjs",
      version: generatorVersion,
      lexiconVersion
    },
    request: {
      profileId,
      profileSha256,
      profileSetSha256,
      seed: normalizedSeed,
      locale: "zh-CN"
    },
    structure: profile.derived,
    semanticContract: {
      owner: "blind-readiness-harness",
      status: "pending-independent-compile",
      requirementCount: requirementModel.requirements.length
    },
    files: Object.fromEntries(
      Object.entries(outputs)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, bytes]) => [name, { bytes: bytes.length, sha256: sha256(bytes) }])
    )
  };
  const manifestBytes = canonicalJsonBytes(manifest);
  writeFileSync(resolve(absoluteOutDir, "manifest.json"), manifestBytes, { flag: "wx" });

  return {
    outDir: absoluteOutDir,
    manifest,
    manifestSha256: sha256(manifestBytes),
    requirementModel
  };
}

function validateProfileSemantics(profiles) {
  const ids = new Set();
  for (const profile of profiles) {
    if (ids.has(profile.profileId)) throw new Error(`duplicate profileId: ${profile.profileId}`);
    ids.add(profile.profileId);
    const pageCount = profile.pagePatterns.length;
    const fieldUnitsTotal = profile.fieldUnitsByPage.reduce((sum, value) => sum + value, 0);
    const fieldDensity = Number((fieldUnitsTotal / pageCount).toFixed(2));
    const expected = profile.derived;
    assertEqual(profile.fieldUnitsByPage.length, pageCount, `${profile.profileId} field page count`);
    assertEqual(profile.flowStepCounts.length, expected.flowCount, `${profile.profileId} flow count`);
    assertEqual(profile.entityFieldCounts.length, expected.entityCount, `${profile.profileId} entity count`);
    assertEqual(
      profile.entityRecordCounts.length,
      expected.entityCount,
      `${profile.profileId} entity record count`
    );
    assertEqual(expected.pageCount, pageCount, `${profile.profileId} derived pageCount`);
    assertEqual(expected.fieldUnitsTotal, fieldUnitsTotal, `${profile.profileId} derived fieldUnitsTotal`);
    assertEqual(expected.fieldDensity, fieldDensity, `${profile.profileId} derived fieldDensity`);
  }
}

function buildPages({ profile, productName, seedMaterial }) {
  return profile.pagePatterns.map((pattern, pageIndex) => {
    const number = pageIndex + 1;
    const id = `page-${pad(number)}`;
    const route = `/${id}`;
    const subject = pick(subjects, seedMaterial, `page-subject-${number}`);
    const title = `${subject}${patternLabel(pattern)} ${number}`;
    const unitCount = profile.fieldUnitsByPage[pageIndex];
    return {
      id,
      route,
      title,
      pattern,
      intent: {
        goal: `在${productName}中完成${subject}信息的查看与处理。`,
        primaryAction: `${pick(actions, seedMaterial, `page-action-${number}`)}${subject}`,
        secondaryActions: [`返回${subject}列表`],
        successCriteria: [
          `${title}在入口路由可访问`,
          `${title}展示 ${unitCount} 个结构字段单元`
        ],
        prdAnchor: `synthetic-page-${pad(number)}`,
        antiPatterns: ["依赖偶然文案定位交互", "省略合同要求的 data-testid"]
      },
      componentPlan: componentPlan(pattern),
      content: buildPageContent({ pattern, unitCount, pageIndex, seedMaterial, profile })
    };
  });
}

function buildPageContent({ pattern, unitCount, pageIndex, seedMaterial, profile }) {
  if (pattern === "dashboard-page") {
    return {
      metrics: Array.from({ length: unitCount }, (_, index) => ({
        label: fieldLabel(seedMaterial, pageIndex, index),
        value: 10 + deterministicNumber(seedMaterial, `metric-${pageIndex}-${index}`, 990),
        unit: "项"
      }))
    };
  }
  if (pattern === "list-page") {
    const filterCount = Math.min(2, Math.max(0, unitCount - 1));
    const columnCount = unitCount - filterCount;
    return {
      filters: Array.from({ length: filterCount }, (_, index) => ({
        name: `filter_${pad(pageIndex + 1)}_${pad(index + 1)}`,
        label: fieldLabel(seedMaterial, pageIndex, index),
        type: "select",
        options: [
          { label: "全部", value: "all" },
          { label: "待处理", value: "pending" },
          { label: "已完成", value: "completed" }
        ]
      })),
      table: {
        title: `示例记录 ${pageIndex + 1}`,
        rowKey: "id",
        dataEntity: `Entity${pad((pageIndex % profile.entityFieldCounts.length) + 1)}`,
        columns: Array.from({ length: columnCount }, (_, index) => ({
          key: `field_${pad(index + 1)}`,
          title: fieldLabel(seedMaterial, pageIndex, filterCount + index)
        }))
      }
    };
  }
  if (pattern === "detail-page") {
    return {
      details: Array.from({ length: unitCount }, (_, index) => ({
        label: fieldLabel(seedMaterial, pageIndex, index),
        value: String(syntheticScalar(seedMaterial, `detail-${pageIndex}-${index}`, index))
      }))
    };
  }
  return {
    fields: Array.from({ length: unitCount }, (_, index) => ({
      name: `field_${pad(pageIndex + 1)}_${pad(index + 1)}`,
      label: fieldLabel(seedMaterial, pageIndex, index),
      control: "input",
      required: index === 0
    }))
  };
}

function buildSamplePack({ profile, projectId, seedMaterial }) {
  const entities = {};
  profile.entityFieldCounts.forEach((fieldCount, entityIndex) => {
    const entityName = `Entity${pad(entityIndex + 1)}`;
    const records = {};
    const recordCount = profile.entityRecordCounts[entityIndex];
    for (let recordIndex = 0; recordIndex < recordCount; recordIndex += 1) {
      const id = `entity-${pad(entityIndex + 1)}-record-${pad(recordIndex + 1)}`;
      const record = { id };
      for (let fieldIndex = 1; fieldIndex < fieldCount; fieldIndex += 1) {
        record[`field_${pad(fieldIndex)}`] = syntheticScalar(
          seedMaterial,
          `entity-${entityIndex}-${recordIndex}-${fieldIndex}`,
          fieldIndex
        );
      }
      records[id] = record;
    }
    entities[entityName] = records;
  });
  return {
    $schema: "../../schema/project-sample-pack.schema.json",
    version: "1.0.0",
    projectId,
    label: "合成 harness 演示数据",
    entities
  };
}

function buildRequirementModel({ profile, pages, seedMaterial }) {
  const requirements = [];
  const flows = profile.flowStepCounts.map((stepCount, flowIndex) => {
    const flowId = `flow-${pad(flowIndex + 1)}`;
    const steps = Array.from({ length: stepCount }, (_, stepIndex) => {
      const stepId = `${flowId}-step-${pad(stepIndex + 1)}`;
      const page = pages[(flowIndex + stepIndex) % pages.length];
      const nextPage = pages[(flowIndex + stepIndex + 1) % pages.length];
      const actionType = ["click", "fill", "select", "press"][stepIndex % 4];
      const actionTestId = `${stepId}-action`;
      const stateTestId = `${stepId}-state`;
      const actionRequirement = {
        requirementId: `${stepId}-action-requirement`,
        kind: "action",
        flowId,
        stepId,
        pageId: page.id,
        actionType,
        testId: actionTestId,
        nextRoute: nextPage.route
      };
      if (actionType === "fill") {
        actionRequirement.value = syntheticScalar(seedMaterial, `${stepId}-fill`, 1);
      }
      if (actionType === "select") {
        actionRequirement.value = "pending";
        actionRequirement.optionTestId = `${stepId}-option-pending`;
      }
      if (actionType === "press") actionRequirement.key = "Enter";
      const stateRequirement = {
        requirementId: `${stepId}-state-requirement`,
        kind: "state",
        flowId,
        stepId,
        pageId: nextPage.id,
        testId: stateTestId,
        route: nextPage.route
      };
      requirements.push(actionRequirement, stateRequirement);
      return { stepId, pageId: page.id, nextPageId: nextPage.id };
    });
    const finalStep = steps.at(-1);
    requirements.push(
      {
        requirementId: `${flowId}-side-effect-requirement`,
        kind: "side-effect",
        flowId,
        stepId: finalStep.stepId,
        pageId: finalStep.nextPageId,
        testId: `${flowId}-side-effect-complete`
      },
      {
        requirementId: `${flowId}-recovery-requirement`,
        kind: "recovery",
        flowId,
        stepId: finalStep.stepId,
        fromPageId: finalStep.nextPageId,
        pageId: pages[flowIndex % pages.length].id,
        actionTestId: `${flowId}-recovery-action`,
        stateTestId: `${flowId}-recovery-complete`,
        route: pages[flowIndex % pages.length].route
      }
    );
    return { flowId, steps };
  });
  return { flows, requirements };
}

function buildProjectDescription({ projectId, productName, pages }) {
  return {
    $schema: "../../schema/project-description.schema.json",
    version: "1.0.0",
    projectId,
    contextType: "real-product",
    product: {
      name: productName,
      description: "用于 blind harness generation readiness 的结构化合成业务产品。"
    },
    pages
  };
}

function buildBusinessContext({ arm, projectId, productName, pages, requirementModel }) {
  return {
    $schema: "../../schema/project-context.schema.json",
    version: "1.0.0",
    projectId,
    contextType: "real-product",
    decision: "synthetic-blind-generation-readiness",
    product: {
      name: productName,
      realCustomer: false,
      audience: ["合成业务操作员", "合成业务负责人"],
      scenario: "使用结构同构、内容虚构的 PRD 验证 generation harness 的完整运行链。"
    },
    sourceOfTruth: [
      "synthetic-prd.md",
      "project-description.json",
      "sample-pack.json",
      "semantic-contract.json"
    ],
    coreFlows: requirementModel.flows.map((flow) => flow.flowId),
    firstPages: pages.map((page) => page.id),
    criticalStates: requirementModel.requirements
      .filter((requirement) => requirement.kind === "state")
      .map((requirement) => requirement.testId),
    boundaries: {
      synthetic: true,
      qualifying: false,
      scoring: false,
      delivery: "local-interactive-demo",
      statePersistence: "current-browser-session",
      realBackendConnection: false
    },
    samplePack: {
      path: `projects/${projectId}/sample-pack.json`,
      version: "1.0.0"
    },
    frontendFoundation: arm === "consumer" ? consumerFoundation() : controlFoundation()
  };
}

function consumerFoundation() {
  return {
    outputMode: "kit-consumer",
    framework: { name: "react", version: "19.2.7" },
    foundation: {
      id: "local",
      displayName: "AI-readable Kit",
      version: "0.1.0",
      packageName: "@ai-readable/kit"
    },
    distribution: "local-package",
    officialSources: {
      principles: "node_modules/@ai-readable/kit/DESIGN.md",
      components: "node_modules/@ai-readable/kit/components.manifest.json",
      templates: "node_modules/@ai-readable/kit/recipes/",
      source: "node_modules/@ai-readable/kit/dist/index.js",
      styles: "node_modules/@ai-readable/kit/dist/styles.css",
      theme: "node_modules/@ai-readable/kit/dist/index.js#AIReadableProvider",
      variables: "node_modules/@ai-readable/kit/tokens.manifest.json"
    },
    license: "private",
    reviewedAt: fixedReviewedAt,
    designPack: {
      path: "foundations/design-packs/local-ai-readable-kit-0.1.0.json",
      sha256: "f16a762bf8d310ca8e5d8306a9b58ffdc6815609c12d475b005e2ad35fdf1c53"
    },
    icons: {
      packageName: "@ai-readable/kit",
      version: "0.1.0",
      source: "node_modules/@ai-readable/kit/dist/index.js"
    },
    theme: { entry: "src/main.tsx", strategy: "AIReadableProvider with package CSS variables" },
    reset: { import: "@ai-readable/kit/styles.css" },
    imports: {
      root: "@ai-readable/kit",
      allowedPackages: ["react", "react-dom", "@ai-readable/kit"],
      forbiddenPackages: ["antd", "@ant-design/icons"],
      namedImportsOnly: true
    },
    adapters: {
      lint: "lint.react-import-boundary",
      build: "build.vite-react",
      browser: "browser.playwright-react",
      visual: "visual.playwright-screenshot"
    }
  };
}

function controlFoundation() {
  return {
    outputMode: "library-native",
    framework: { name: "react", version: "19.2.7" },
    foundation: {
      id: "antd",
      displayName: "Ant Design",
      version: "6.5.0",
      packageName: "antd"
    },
    distribution: "package-native",
    officialSources: {
      principles: "foundations/knowledge/antd-6.5.0/design-language.md",
      components: "foundations/knowledge/antd-6.5.0/component-reference/",
      templates: "foundations/knowledge/antd-6.5.0/page-templates/",
      source: "node_modules/antd/es/index.js",
      styles: "node_modules/antd/dist/reset.css",
      theme: "foundations/design-packs/antd-6.5.0.json",
      variables: "foundations/knowledge/antd-6.5.0/manifest.json"
    },
    license: "MIT",
    reviewedAt: fixedReviewedAt,
    designPack: {
      path: "foundations/design-packs/antd-6.5.0.json",
      sha256: "3259be1ca4e3be5b0982fc4515b2034a4cd6170090584e0554ee711a66e2a05b"
    },
    icons: {
      packageName: "@ant-design/icons",
      version: "6.3.2",
      source: "node_modules/@ant-design/icons/es/index.js"
    },
    theme: { entry: "src/foundation/antd-theme.ts", strategy: "ConfigProvider token theme" },
    reset: { import: "antd/dist/reset.css" },
    imports: {
      root: "antd",
      allowedPackages: ["react", "react-dom", "antd", "@ant-design/icons"],
      forbiddenPackages: ["@ai-readable/kit"],
      namedImportsOnly: true
    },
    adapters: {
      lint: "lint.antd-cli",
      build: "build.vite-react",
      browser: "browser.playwright-react",
      visual: "visual.playwright-screenshot"
    }
  };
}

function buildGenerationRequest({
  profile,
  profileSha256,
  normalizedSeed,
  projectId,
  requirementModel
}) {
  return {
    $schema: "synthetic-generation-request.v1",
    version: "1.0.0",
    requestId: `request-${projectId}`,
    projectId,
    mode: "synthetic-blind-generation-readiness",
    qualifying: false,
    scoring: false,
    source: {
      profileId: profile.profileId,
      profileSha256,
      seed: normalizedSeed
    },
    commonInputs: ["synthetic-prd.md", "project-description.json", "sample-pack.json"],
    harnessOwnedInputs: ["semantic-contract.json"],
    armInputs: {
      consumer: ["consumer-business-context.json", "consumer-artifact-identity.json"],
      control: ["control-business-context.json", "control-artifact-identity.json"]
    },
    requiredScripts: ["typecheck", "build", "preview"],
    requiredRequirementIds: requirementModel.requirements.map((item) => item.requirementId).sort(),
    productResponsibilities: [
      "implement synthetic PRD behavior",
      "expose required data-testid hooks",
      "serve /artifact-meta.json"
    ],
    prohibitedProductOutputs: ["product-owned flow assertions", "jsdom flow smoke"]
  };
}

function buildSyntheticPrdMarkdown({
  profile,
  normalizedSeed,
  productName,
  pages,
  samplePack,
  requirementModel
}) {
  const lines = [
    `# ${productName} 产品需求文档`,
    "",
    "> 本文档由 synthetic blind harness 生成。内容全部虚构，只用于非计分 generation readiness。",
    "",
    "## 1. 目标与边界",
    "",
    "构建一个本地可运行的业务工作台，支持页面间任务处理、状态反馈和恢复路径。",
    "",
    `- Shape profile：${profile.profileId}`,
    `- Seed：${normalizedSeed}`,
    "- 真实后端、真实通知和真实用户数据：不使用",
    "- Qualifying / scoring：false / false",
    "",
    "## 2. 页面",
    ""
  ];
  for (const page of pages) {
    lines.push(`### ${page.id} ${page.title}`);
    lines.push("");
    lines.push(`- 路由：\`${page.route}\``);
    lines.push(`- 页面类型：\`${page.pattern}\``);
    lines.push(`- 目标：${page.intent.goal}`);
    lines.push(`- 字段单元：${countFieldUnits(page)}`);
    lines.push("");
  }
  lines.push("## 3. 实体与样例规模", "");
  for (const [entityName, records] of Object.entries(samplePack.entities)) {
    const firstRecord = Object.values(records)[0];
    lines.push(`- ${entityName}：${Object.keys(firstRecord).length} 个字段，${Object.keys(records).length} 条演示记录`);
  }
  lines.push("", "## 4. 核心流程", "");
  for (const flow of requirementModel.flows) {
    lines.push(`### ${flow.flowId}`, "");
    flow.steps.forEach((step, index) => {
      lines.push(`${index + 1}. 在 ${step.pageId} 完成步骤，进入 ${step.nextPageId}。`);
    });
    lines.push("");
  }
  lines.push("## 5. Harness requirement IDs", "");
  lines.push("以下 requirement 由独立 compiler 读取。产品实现只需暴露列出的 `data-testid`，不得自写 flow 断言。", "");
  for (const requirement of requirementModel.requirements) {
    lines.push(`<!-- harness-requirement ${JSON.stringify(requirement)} -->`);
    lines.push(`- \`${requirement.requirementId}\`：${requirement.kind}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function validateGeneratedContracts({
  artifactIdentities,
  projectDescription,
  consumerBusinessContext,
  controlBusinessContext,
  samplePack
}) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const validateProjectDescription = ajv.compile(readJson(projectDescriptionSchemaPath));
  const validateProjectContext = ajv.compile(readJson(projectContextSchemaPath));
  const validateSamplePack = ajv.compile(readJson(samplePackSchemaPath));
  const validateArtifactIdentity = ajv.compile(readJson(artifactIdentitySchemaPath));
  validateWith(validateProjectDescription, projectDescription, "project-description", ajv);
  validateWith(validateProjectContext, consumerBusinessContext, "consumer context", ajv);
  validateWith(validateProjectContext, controlBusinessContext, "control context", ajv);
  validateWith(validateSamplePack, samplePack, "sample-pack", ajv);
  validateWith(validateArtifactIdentity, artifactIdentities.consumer, "consumer artifact identity", ajv);
  validateWith(validateArtifactIdentity, artifactIdentities.control, "control artifact identity", ajv);
}

function validateWith(validate, document, label, ajv) {
  if (!validate(document)) {
    throw new Error(`${label} schema failed: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
  }
}

function componentPlan(pattern) {
  if (pattern === "dashboard-page") return ["PageLayout", "PageHeader", "MetricCard"];
  if (pattern === "list-page") return ["PageLayout", "PageHeader", "FilterPanel", "DataGrid"];
  if (pattern === "detail-page") return ["PageLayout", "DetailHeader", "DescriptionGrid"];
  return ["PageLayout", "PageHeader", "Form", "Button"];
}

function patternLabel(pattern) {
  return {
    "dashboard-page": "概览",
    "list-page": "列表",
    "detail-page": "详情",
    "form-page": "表单"
  }[pattern];
}

function fieldLabel(seedMaterial, pageIndex, fieldIndex) {
  const subject = pick(subjects, seedMaterial, `field-subject-${pageIndex}-${fieldIndex}`);
  const attribute = pick(attributes, seedMaterial, `field-attribute-${pageIndex}-${fieldIndex}`);
  return `${subject}${attribute} ${fieldIndex + 1}`;
}

function countFieldUnits(page) {
  const content = page.content;
  return (
    (content.metrics?.length ?? 0) +
    (content.filters?.length ?? 0) +
    (content.details?.length ?? 0) +
    (content.fields?.length ?? 0) +
    (content.table?.columns?.length ?? 0)
  );
}

function syntheticScalar(seedMaterial, namespace, index) {
  const kind = index % 4;
  if (kind === 0) return `样例值-${sha256(`${seedMaterial}:${namespace}`).slice(0, 6)}`;
  if (kind === 1) return 100 + deterministicNumber(seedMaterial, namespace, 900);
  if (kind === 2) return deterministicNumber(seedMaterial, namespace, 2) === 1;
  const day = 1 + deterministicNumber(seedMaterial, namespace, 27);
  return `2024-01-${pad(day)}T00:00:00.000Z`;
}

function pick(values, seedMaterial, namespace) {
  return values[deterministicNumber(seedMaterial, namespace, values.length)];
}

function deterministicNumber(seedMaterial, namespace, maxExclusive) {
  const digest = createHash("sha256").update(`${seedMaterial}:${namespace}`).digest();
  return digest.readUInt32BE(0) % maxExclusive;
}

function deterministicUuid(seedMaterial, namespace) {
  const chars = sha256(`${seedMaterial}:${namespace}`).slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) % 4];
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function normalizeSeed(value) {
  const seed = String(value ?? "");
  if (!/^(0|[1-9][0-9]{0,19})$/.test(seed)) {
    throw new Error("seed must be an unsigned 64-bit decimal string");
  }
  if (BigInt(seed) > uint64Max) throw new Error("seed exceeds unsigned 64-bit range");
  return seed;
}

function assertEmptyOutputDirectory(directory) {
  if (!existsSync(directory)) return;
  if (!statSync(directory).isDirectory()) throw new Error(`output path is not a directory: ${directory}`);
  if (readdirSync(directory).length > 0) {
    throw new Error(`output directory must be empty: ${directory}`);
  }
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

function readJson(file) {
  return JSON.parse(readFileSync(resolve(file), "utf8"));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
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
  const result = generateSyntheticBlindPrd({
    profileId: options.profile,
    seed: options.seed,
    outDir: options.out,
    profilesPath: options.profiles ? resolve(options.profiles) : defaultProfilesPath
  });
  console.log(
    `generate-synthetic-blind-prd passed: profile=${result.manifest.request.profileId}; seed=${result.manifest.request.seed}; manifest=${result.manifestSha256}`
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

export const syntheticBlindPrdPaths = {
  defaultProfilesPath,
  shapeSchemaPath,
  targetFiles
};
