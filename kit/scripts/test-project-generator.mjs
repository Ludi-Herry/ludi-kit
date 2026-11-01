import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { assertGeneratedDashboardContentFidelity } from "./dashboard-content-fidelity.mjs";
import { assertGeneratedFormContentFidelity } from "./form-content-fidelity.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = resolve(kitRoot, `generator/.tmp-test-${process.pid}`);
const generator = "scripts/generate-project-pages.mjs";
const invalidDescription = "generator/fixtures/invalid/project-description.json";
const allFixtures = [
  {
    id: "kit-consumer-canary",
    description: "generator/fixtures/kit-consumer-canary/project-description.json",
    context: "generator/fixtures/kit-consumer-canary/business-context.json",
    committedOutput: "generator/fixtures/kit-consumer-canary/generated",
    tsconfig: "generator/fixtures/kit-consumer-canary/tsconfig.json",
    outputFiles: ["pages.tsx", "styles.css"],
    requiredImports: ['from "@ai-readable/kit"'],
    forbiddenImports: ['from "antd"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "field-service",
    description: "generator/fixtures/field-service/project-description.json",
    context: "generator/fixtures/field-service/business-context.json",
    committedOutput: "generator/fixtures/field-service/generated",
    tsconfig: "generator/fixtures/field-service/tsconfig.json",
    outputFiles: ["pages.tsx", "styles.css"],
    requiredImports: ['from "@ai-readable/kit"'],
    forbiddenImports: ['from "antd"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "tianshu-firmware",
    description: "generator/fixtures/tianshu-firmware/project-description.json",
    context: "generator/fixtures/tianshu-firmware/business-context.json",
    committedOutput: "generator/fixtures/tianshu-firmware/generated",
    tsconfig: "generator/fixtures/tianshu-firmware/tsconfig.json",
    outputFiles: ["pages.tsx", "generation-knowledge.json", "styles.css"],
    requiredImports: ['from "antd"', 'from "@ant-design/icons"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "antd-radio-knowledge",
    description: "generator/fixtures/antd-radio-knowledge/project-description.json",
    context: "generator/fixtures/antd-radio-knowledge/business-context.json",
    committedOutput: "generator/fixtures/antd-radio-knowledge/generated",
    tsconfig: "generator/fixtures/antd-radio-knowledge/tsconfig.json",
    outputFiles: ["pages.tsx", "generation-knowledge.json", "styles.css"],
    requiredImports: ['from "antd"', 'from "@ant-design/icons"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "antd-simple-list-filtering",
    description: "generator/fixtures/antd-simple-list-filtering/project-description.json",
    context: "generator/fixtures/antd-simple-list-filtering/business-context.json",
    committedOutput: "generator/fixtures/antd-simple-list-filtering/generated",
    tsconfig: "generator/fixtures/antd-simple-list-filtering/tsconfig.json",
    outputFiles: ["pages.tsx", "generation-knowledge.json", "styles.css"],
    requiredImports: ['from "antd"', 'from "@ant-design/icons"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "antd-responsive-list-overflow",
    description: "generator/fixtures/antd-responsive-list-overflow/project-description.json",
    context: "generator/fixtures/antd-responsive-list-overflow/business-context.json",
    committedOutput: "generator/fixtures/antd-responsive-list-overflow/generated",
    tsconfig: "generator/fixtures/antd-responsive-list-overflow/tsconfig.json",
    outputFiles: ["pages.tsx", "generation-knowledge.json", "styles.css"],
    requiredImports: ['from "antd"', 'from "@ant-design/icons"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "antd-dashboard-content-fidelity",
    description: "generator/fixtures/antd-dashboard-content-fidelity/project-description.json",
    context: "generator/fixtures/antd-dashboard-content-fidelity/business-context.json",
    committedOutput: "generator/fixtures/antd-dashboard-content-fidelity/generated",
    tsconfig: "generator/fixtures/antd-dashboard-content-fidelity/tsconfig.json",
    outputFiles: ["pages.tsx", "generation-knowledge.json", "styles.css"],
    requiredImports: ['from "antd"', 'from "@ant-design/icons"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "antd-form-content-fidelity",
    description: "generator/fixtures/antd-form-content-fidelity/project-description.json",
    context: "generator/fixtures/antd-form-content-fidelity/business-context.json",
    committedOutput: "generator/fixtures/antd-form-content-fidelity/generated",
    tsconfig: "generator/fixtures/antd-form-content-fidelity/tsconfig.json",
    outputFiles: ["pages.tsx", "generation-knowledge.json", "styles.css"],
    requiredImports: ['from "antd"', 'from "@ant-design/icons"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "tianshu-content-schedule-golden",
    description: "projects/tianshu-ops/golden-content-schedule/project-description.json",
    context: "projects/tianshu-ops/business-context.json",
    committedOutput: "projects/tianshu-ops/generated/golden-content-schedule",
    outputFiles: ["pages.tsx", "generation-knowledge.json", "styles.css"],
    requiredImports: ['from "antd"', 'from "@ant-design/icons"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "tianshu-rbac-forbidden-golden",
    description: "projects/tianshu-ops/golden-rbac-forbidden/project-description.json",
    context: "projects/tianshu-ops/business-context.json",
    committedOutput: "projects/tianshu-ops/generated/golden-rbac-forbidden",
    outputFiles: ["pages.tsx", "generation-knowledge.json", "styles.css"],
    requiredImports: ['from "antd"', 'from "@ant-design/icons"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "sa-reports-logs-golden",
    description: "projects/sample-platform/golden-reports-logs/project-description.json",
    context: "projects/sample-platform/golden-reports-logs/business-context.json",
    committedOutput: "projects/sample-platform/golden-reports-logs/generated",
    outputFiles: ["pages.tsx", "generation-knowledge.json", "styles.css"],
    requiredImports: ['from "antd"', 'from "@ant-design/icons"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "element-plus"', 'from "./components"']
  },
  {
    id: "vue-element-plus",
    description: "generator/fixtures/vue-element-plus/project-description.json",
    context: "generator/fixtures/vue-element-plus/business-context.json",
    committedOutput: "generator/fixtures/vue-element-plus/generated",
    outputFiles: ["package.json", "index.html", "vite.config.ts", "src/main.ts", "src/App.vue", "styles.css"],
    requiredImports: ['from "element-plus"', 'from "vue"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "antd"', 'from "./components"']
  },
  {
    id: "custom-native",
    description: "generator/fixtures/custom-native/project-description.json",
    context: "generator/fixtures/custom-native/business-context.json",
    committedOutput: "generator/fixtures/custom-native/generated",
    tsconfig: "generator/fixtures/custom-native/tsconfig.json",
    outputFiles: ["components.tsx", "pages.tsx", "styles.css"],
    requiredImports: ['from "./components"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "antd"', 'from "element-plus"']
  },
  {
    id: "sample-flow-project",
    description: "projects/sample-flow-project/project-description.json",
    context: "projects/sample-flow-project/business-context.json",
    committedOutput: "projects/sample-flow-project/generated",
    tsconfig: "projects/sample-flow-project/tsconfig.json",
    outputFiles: ["sample-data.ts", "pages.tsx", "generation-knowledge.json", "styles.css"],
    requiredImports: ['from "antd"', 'from "@ant-design/icons"', 'from "./sample-data"'],
    forbiddenImports: ['from "@ai-readable/kit"', 'from "element-plus"', 'from "./components"'],
    sampleEntities: ["SecuritySource", "Alert"]
  }
];
const fixtures = allFixtures.filter((fixture) => existsSync(resolve(kitRoot, fixture.description)));
const allOutputs = [
  "projects/sample-inventory-erp/generated/pages.tsx",
  "projects/tianshu-ops/generated/pages.tsx",
  "projects/sample-platform/generated/pages.tsx"
];
const existingOutputs = allOutputs.filter((file) => existsSync(resolve(kitRoot, file)));

try {
  mkdirSync(tempRoot, { recursive: true });
  const before = hashFiles(existingOutputs);
  const invalidOut = relative(kitRoot, resolve(tempRoot, "invalid"));
  const deterministic = {};
  const tsc = resolve(kitRoot, "node_modules/typescript/bin/tsc");
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const validateContext = ajv.compile(readJson(resolve(kitRoot, "schema/project-context.schema.json")));

  for (const fixture of fixtures) {
    const firstOut = relative(kitRoot, resolve(tempRoot, `${fixture.id}-first`));
    const secondOut = relative(kitRoot, resolve(tempRoot, `${fixture.id}-second`));
    const generatorArgs = [generator, "--description", fixture.description, "--context", fixture.context, "--out"];
    expectExit(run([...generatorArgs, firstOut]), 0, `${fixture.id} first valid generation`);
    expectExit(run([...generatorArgs, secondOut]), 0, `${fixture.id} second valid generation`);

    const firstHash = hashGenerated(resolve(kitRoot, firstOut), fixture);
    const secondHash = hashGenerated(resolve(kitRoot, secondOut), fixture);
    const committedHash = hashGenerated(resolve(kitRoot, fixture.committedOutput), fixture);
    if (firstHash !== secondHash || firstHash !== committedHash) {
      throw new Error(`${fixture.id} determinism mismatch: first=${firstHash} second=${secondHash} committed=${committedHash}`);
    }
    deterministic[fixture.id] = firstHash;
    assertImportBoundary(resolve(kitRoot, firstOut), fixture);
    if (fixture.sampleEntities) assertSampleDataBinding(resolve(kitRoot, firstOut), fixture);
    if (fixture.id === "tianshu-firmware") assertAntdKnowledgeInput(resolve(kitRoot, firstOut));
    if (fixture.id === "antd-radio-knowledge") assertRadioKnowledgeInput(resolve(kitRoot, firstOut));
    if (fixture.id === "antd-simple-list-filtering") assertSimpleListFilteringInput(resolve(kitRoot, firstOut));
    if (fixture.id === "antd-responsive-list-overflow") assertResponsiveListOverflowOutput(resolve(kitRoot, firstOut));
    if (fixture.id === "antd-dashboard-content-fidelity") assertDashboardContentFidelityInput(resolve(kitRoot, firstOut), fixture);
    if (fixture.id === "antd-form-content-fidelity") assertFormContentFidelityInput(resolve(kitRoot, firstOut), fixture);
    if (fixture.id === "tianshu-content-schedule-golden") assertGoldenOperationalInput(resolve(kitRoot, firstOut));
    if (fixture.id === "tianshu-rbac-forbidden-golden") assertGoldenPermissionInput(resolve(kitRoot, firstOut));
    if (fixture.id === "sa-reports-logs-golden") assertGoldenAnalyticsInput(resolve(kitRoot, firstOut));
    if (fixture.tsconfig) {
      expectExit(run([tsc, "--noEmit", "-p", fixture.tsconfig]), 0, `${fixture.id} generated fixture typecheck`);
    }

    if (fixture.context) {
      const context = readJson(resolve(kitRoot, fixture.context));
      if (!validateContext(context)) throw new Error(`${fixture.id} context schema errors: ${ajv.errorsText(validateContext.errors, { separator: "; " })}`);
    }
  }

  const radioFixture = fixtures.find((fixture) => fixture.id === "antd-radio-knowledge");
  const radioBaseContext = readJson(resolve(kitRoot, radioFixture.context));
  radioBaseContext.frontendFoundation.designPack = {
    path: "foundations/design-packs/antd-6.5.0.json",
    sha256: "3259be1ca4e3be5b0982fc4515b2034a4cd6170090584e0554ee711a66e2a05b"
  };
  const radioBaseContextPath = resolve(tempRoot, "radio-base-pack.business-context.json");
  const radioBaseOutputPath = resolve(tempRoot, "radio-base-pack.generated");
  writeFileSync(radioBaseContextPath, `${JSON.stringify(radioBaseContext, null, 2)}\n`, "utf8");
  const radioBaseResult = run([
    generator,
    "--description",
    radioFixture.description,
    "--context",
    relative(kitRoot, radioBaseContextPath),
    "--out",
    relative(kitRoot, radioBaseOutputPath)
  ]);
  if (radioBaseResult.status === 0 || !radioBaseResult.stderr.includes("AntD knowledge has no frozen CLI reference for generated component Radio")) {
    throw new Error(`base AntD design pack did not fail closed for Radio: ${radioBaseResult.stderr || radioBaseResult.stdout}`);
  }
  if (existsSync(radioBaseOutputPath)) throw new Error("base AntD design pack Radio negative case wrote an output directory");

  const filteringFixture = fixtures.find((fixture) => fixture.id === "antd-simple-list-filtering");
  const filteringDescription = readJson(resolve(kitRoot, filteringFixture.description));
  const filteringNegativeCases = [
    {
      id: "simple-filter-missing-mapping",
      mutate(value) { value.pages[0].content.simpleListFiltering.mappings.pop(); }
    },
    {
      id: "simple-filter-missing-table",
      mutate(value) { delete value.pages[0].content.table; }
    },
    {
      id: "simple-filter-missing-row-key",
      mutate(value) { value.pages[0].content.simpleListFiltering.mappings[0].rowKeys = ["missingKey"]; }
    },
    {
      id: "simple-filter-select-map-incomplete",
      mutate(value) { delete value.pages[0].content.simpleListFiltering.mappings[1].valueMap.normal; }
    },
    {
      id: "simple-filter-text-value-map",
      mutate(value) { value.pages[0].content.simpleListFiltering.mappings[0].valueMap = { ticket: "TK-1001" }; }
    },
    {
      id: "simple-filter-select-maps-to-missing-row",
      mutate(value) { value.pages[0].content.simpleListFiltering.mappings[1].valueMap.urgent = "不存在"; }
    }
  ];
  for (const negativeCase of filteringNegativeCases) {
    const description = structuredClone(filteringDescription);
    negativeCase.mutate(description);
    const descriptionPath = resolve(tempRoot, `${negativeCase.id}.project-description.json`);
    const outputPath = resolve(tempRoot, `${negativeCase.id}.generated`);
    writeFileSync(descriptionPath, `${JSON.stringify(description, null, 2)}\n`, "utf8");
    const result = run([
      generator,
      "--description",
      relative(kitRoot, descriptionPath),
      "--context",
      filteringFixture.context,
      "--out",
      relative(kitRoot, outputPath)
    ]);
    if (result.status === 0) throw new Error(`${negativeCase.id} unexpectedly generated output`);
    if (existsSync(outputPath)) throw new Error(`${negativeCase.id} wrote an output directory`);
  }

  const responsiveFixture = fixtures.find((fixture) => fixture.id === "antd-responsive-list-overflow");
  const responsivePagesSource = readFileSync(resolve(kitRoot, responsiveFixture.committedOutput, "pages.tsx"), "utf8");
  const responsiveStylesSource = readFileSync(resolve(kitRoot, responsiveFixture.committedOutput, "styles.css"), "utf8");
  const responsiveOutputNegativeCases = [
    {
      id: "responsive-list-missing-table-scroll",
      pages: responsivePagesSource.replace(' scroll={{ x: "max-content" }}', ""),
      styles: responsiveStylesSource
    },
    {
      id: "responsive-list-missing-table-class",
      pages: responsivePagesSource.replace(' className="generated-responsive-table"', ""),
      styles: responsiveStylesSource
    },
    {
      id: "responsive-list-missing-stack-shrink",
      pages: responsivePagesSource,
      styles: responsiveStylesSource.replace(".generated-stack > .ant-space-item,", ".generated-stack > .removed-space-item,")
    },
    {
      id: "responsive-list-missing-card-shrink",
      pages: responsivePagesSource,
      styles: responsiveStylesSource.replace(".generated-stack > .ant-space-item > .ant-card,", ".generated-stack > .removed-card,")
    },
    {
      id: "responsive-list-missing-mobile-form-containment",
      pages: responsivePagesSource,
      styles: responsiveStylesSource.replace(".generated-stack .ant-form-inline .ant-form-item {", ".generated-stack .removed-form-item {")
    }
  ];
  for (const negativeCase of responsiveOutputNegativeCases) {
    let rejected = false;
    try {
      assertResponsiveListOverflowSource(negativeCase.pages, negativeCase.styles);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`${negativeCase.id} bypassed responsive overflow verification`);
  }

  const contentFidelityFixture = fixtures.find((fixture) => fixture.id === "antd-dashboard-content-fidelity");
  const contentFidelityDescription = readJson(resolve(kitRoot, contentFidelityFixture.description));
  const contentFidelityInputNegativeCases = [
    {
      id: "content-fidelity-missing-delta",
      mutate(value) { delete value.pages[0].content.metrics[0].delta; }
    },
    {
      id: "content-fidelity-empty-delta",
      mutate(value) { value.pages[0].content.metrics[1].delta = ""; }
    },
    {
      id: "content-fidelity-missing-secondary-action",
      mutate(value) { value.pages[0].intent.secondaryActions = []; }
    },
    {
      id: "content-fidelity-incomplete-contract",
      mutate(value) { delete value.pages[0].content.contentFidelity.metricDeltas; }
    },
    {
      id: "content-fidelity-visible-acceptance-criteria",
      mutate(value) { value.pages[0].content.contentFidelity.acceptanceCriteria = "visible"; }
    }
  ];
  for (const negativeCase of contentFidelityInputNegativeCases) {
    const description = structuredClone(contentFidelityDescription);
    negativeCase.mutate(description);
    const descriptionPath = resolve(tempRoot, `${negativeCase.id}.project-description.json`);
    const outputPath = resolve(tempRoot, `${negativeCase.id}.generated`);
    writeFileSync(descriptionPath, `${JSON.stringify(description, null, 2)}\n`, "utf8");
    const result = run([
      generator,
      "--description",
      relative(kitRoot, descriptionPath),
      "--context",
      contentFidelityFixture.context,
      "--out",
      relative(kitRoot, outputPath)
    ]);
    if (result.status === 0) throw new Error(`${negativeCase.id} unexpectedly generated output`);
    if (existsSync(outputPath)) throw new Error(`${negativeCase.id} wrote an output directory`);
  }

  const validContentFidelitySource = readFileSync(resolve(kitRoot, contentFidelityFixture.committedOutput, "pages.tsx"), "utf8");
  const contentFidelityOutputNegativeCases = [
    { id: "output-missing-positive-delta", mutate(source) { return source.replace(">+7</Typography.Text>", "></Typography.Text>"); } },
    { id: "output-missing-flat-delta", mutate(source) { return source.replace(">平稳</Typography.Text>", "></Typography.Text>"); } },
    { id: "output-missing-negative-delta", mutate(source) { return source.replace(">-1</Typography.Text>", "></Typography.Text>"); } },
    { id: "output-missing-secondary-action", mutate(source) { return source.replace("<Button>同步状态</Button>", "<Button />"); } },
    { id: "output-leaks-acceptance-heading", mutate(source) { return `${source}\n// 验收标准\n`; } },
    { id: "output-leaks-first-acceptance-copy", mutate(source) { return `${source}\n// 首屏展示全部设备状态\n`; } },
    { id: "output-leaks-second-acceptance-copy", mutate(source) { return `${source}\n// 主操作保持唯一\n`; } }
  ];
  for (const negativeCase of contentFidelityOutputNegativeCases) {
    let rejected = false;
    try {
      assertGeneratedDashboardContentFidelity(contentFidelityDescription, negativeCase.mutate(validContentFidelitySource));
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`${negativeCase.id} bypassed generated content fidelity verification`);
  }

  const formFidelityFixture = fixtures.find((fixture) => fixture.id === "antd-form-content-fidelity");
  const formFidelityDescription = readJson(resolve(kitRoot, formFidelityFixture.description));
  const formFidelityInputNegativeCases = [
    {
      id: "form-fidelity-current-step-out-of-range",
      mutate(value) { value.pages[0].content.formPresentation.currentStep = value.pages[0].content.formPresentation.steps.length; }
    },
    {
      id: "form-fidelity-missing-stepper-plan",
      mutate(value) { value.pages[0].componentPlan = value.pages[0].componentPlan.filter((component) => component !== "Stepper"); }
    },
    {
      id: "form-fidelity-missing-section-plan",
      mutate(value) { value.pages[0].componentPlan = value.pages[0].componentPlan.filter((component) => component !== "FormSection"); }
    },
    {
      id: "form-fidelity-missing-secondary-action",
      mutate(value) { value.pages[0].intent.secondaryActions = []; }
    },
    {
      id: "form-fidelity-duplicate-field-assignment",
      mutate(value) { value.pages[0].content.formPresentation.sections[1].fieldNames.push("sourceTask"); }
    },
    {
      id: "form-fidelity-unknown-field-assignment",
      mutate(value) { value.pages[0].content.formPresentation.sections[0].fieldNames = ["missingField"]; }
    },
    {
      id: "form-fidelity-unassigned-field",
      mutate(value) { value.pages[0].content.formPresentation.sections[2].fieldNames = ["quantity"]; }
    },
    {
      id: "form-fidelity-visible-acceptance-criteria",
      mutate(value) { value.pages[0].content.formPresentation.acceptanceCriteria = "visible"; }
    }
  ];
  for (const negativeCase of formFidelityInputNegativeCases) {
    const description = structuredClone(formFidelityDescription);
    negativeCase.mutate(description);
    const descriptionPath = resolve(tempRoot, `${negativeCase.id}.project-description.json`);
    const outputPath = resolve(tempRoot, `${negativeCase.id}.generated`);
    writeFileSync(descriptionPath, `${JSON.stringify(description, null, 2)}\n`, "utf8");
    const result = run([
      generator,
      "--description",
      relative(kitRoot, descriptionPath),
      "--context",
      formFidelityFixture.context,
      "--out",
      relative(kitRoot, outputPath)
    ]);
    if (result.status === 0) throw new Error(`${negativeCase.id} unexpectedly generated output`);
    if (existsSync(outputPath)) throw new Error(`${negativeCase.id} wrote an output directory`);
  }

  const validFormFidelitySource = readFileSync(resolve(kitRoot, formFidelityFixture.committedOutput, "pages.tsx"), "utf8");
  const formFidelityOutputNegativeCases = [
    { id: "form-output-missing-first-step", mutate(source) { return source.replace('{ title: "选择任务" }', '{ title: "" }'); } },
    { id: "form-output-missing-second-step", mutate(source) { return source.replace('{ title: "绑定策略" }', '{ title: "" }'); } },
    { id: "form-output-missing-third-step", mutate(source) { return source.replace('{ title: "确认执行" }', '{ title: "" }'); } },
    { id: "form-output-missing-first-section", mutate(source) { return source.replace('<Typography.Title level={4}>任务来源</Typography.Title>', '<Typography.Title level={4}></Typography.Title>'); } },
    { id: "form-output-missing-second-section", mutate(source) { return source.replace('<Typography.Title level={4}>策略配置</Typography.Title>', '<Typography.Title level={4}></Typography.Title>'); } },
    { id: "form-output-missing-third-section", mutate(source) { return source.replace('<Typography.Title level={4}>数量与备注</Typography.Title>', '<Typography.Title level={4}></Typography.Title>'); } },
    { id: "form-output-missing-first-secondary", mutate(source) { return source.replace('<Button>保存草稿</Button>', '<Button />'); } },
    { id: "form-output-missing-second-secondary", mutate(source) { return source.replace('<Button>返回列表</Button>', '<Button />'); } },
    { id: "form-output-leaks-acceptance-heading", mutate(source) { return `${source}\n// 验收标准\n`; } },
    { id: "form-output-leaks-first-acceptance-copy", mutate(source) { return `${source}\n// 字段按业务语义分组\n`; } },
    { id: "form-output-leaks-second-acceptance-copy", mutate(source) { return `${source}\n// 主操作保持唯一\n`; } }
  ];
  for (const negativeCase of formFidelityOutputNegativeCases) {
    let rejected = false;
    try {
      assertGeneratedFormContentFidelity(formFidelityDescription, negativeCase.mutate(validFormFidelitySource));
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`${negativeCase.id} bypassed generated form content fidelity verification`);
  }

  const goldenFixture = fixtures.find((fixture) => fixture.id === "tianshu-content-schedule-golden");
  const goldenDescription = readJson(resolve(kitRoot, goldenFixture.description));
  const operationalNegativeCases = [
    {
      id: "process-current-out-of-range",
      mutate(value) { value.pages[0].content.operationalList.process.current = value.pages[0].content.operationalList.process.steps.length; }
    },
    {
      id: "missing-default-tab",
      mutate(value) { value.pages[0].content.operationalList.defaultTab = "missing-tab"; }
    },
    {
      id: "missing-hidden-row-key",
      mutate(value) { delete value.pages[0].content.table.rows[0].conflict; }
    },
    {
      id: "conditional-action-without-secondary-action",
      mutate(value) { value.pages[0].content.table.columns.at(-1).actions = ["详情"]; }
    }
  ];
  for (const negativeCase of operationalNegativeCases) {
    const description = structuredClone(goldenDescription);
    negativeCase.mutate(description);
    const descriptionPath = resolve(tempRoot, `${negativeCase.id}.project-description.json`);
    const outputPath = resolve(tempRoot, `${negativeCase.id}.generated`);
    writeFileSync(descriptionPath, `${JSON.stringify(description, null, 2)}\n`, "utf8");
    const result = run([
      generator,
      "--description",
      relative(kitRoot, descriptionPath),
      "--context",
      goldenFixture.context,
      "--out",
      relative(kitRoot, outputPath)
    ]);
    if (result.status === 0) throw new Error(`${negativeCase.id} unexpectedly generated output`);
    if (existsSync(outputPath)) throw new Error(`${negativeCase.id} wrote an output directory`);
  }

  const analyticsFixture = fixtures.find((fixture) => fixture.id === "sa-reports-logs-golden");
  if (analyticsFixture) {
  const analyticsDescription = readJson(resolve(kitRoot, analyticsFixture.description));
  const analyticsNegativeCases = [
    {
      id: "analytics-missing-series-value",
      mutate(value) { delete value.pages[0].content.analytics.trend.rows[0].values.ip; }
    },
    {
      id: "analytics-duplicate-series-key",
      mutate(value) { value.pages[0].content.analytics.trend.series[1].key = "ip"; }
    },
    {
      id: "analytics-out-of-bounds-value",
      mutate(value) { value.pages[0].content.analytics.trend.rows[0].values.ip = 4001; }
    },
    {
      id: "analytics-donut-total-mismatch",
      mutate(value) { value.pages[0].content.analytics.donut.segments[0].value -= 1; }
    },
    {
      id: "analytics-wrong-metric-count",
      mutate(value) { value.pages[0].content.metrics.pop(); }
    }
  ];
  for (const negativeCase of analyticsNegativeCases) {
    const description = structuredClone(analyticsDescription);
    negativeCase.mutate(description);
    const descriptionPath = resolve(tempRoot, `${negativeCase.id}.project-description.json`);
    const outputPath = resolve(tempRoot, `${negativeCase.id}.generated`);
    writeFileSync(descriptionPath, `${JSON.stringify(description, null, 2)}\n`, "utf8");
    const result = run([
      generator,
      "--description",
      relative(kitRoot, descriptionPath),
      "--context",
      analyticsFixture.context,
      "--out",
      relative(kitRoot, outputPath)
    ]);
    if (result.status === 0) throw new Error(`${negativeCase.id} unexpectedly generated output`);
    if (existsSync(outputPath)) throw new Error(`${negativeCase.id} wrote an output directory`);
  }

  }
  const permissionFixture = fixtures.find((fixture) => fixture.id === "tianshu-rbac-forbidden-golden");
  const permissionDescription = readJson(resolve(kitRoot, permissionFixture.description));
  const permissionNegativeCases = [
    {
      id: "permission-description-omits-identifier",
      mutate(value) { value.pages[0].content.permissionState.description = "当前账号缺少访问权限，请联系平台管理员。"; }
    },
    {
      id: "permission-primary-action-mismatch",
      mutate(value) { value.pages[0].content.permissionState.primaryAction.label = "前往工作台"; }
    },
    {
      id: "permission-recovery-route-loops",
      mutate(value) { value.pages[0].content.permissionState.primaryAction.targetRoute = value.pages[0].route; }
    },
    {
      id: "permission-details-conflict",
      mutate(value) { value.pages[0].content.details = [{ label: "角色", value: "受保护数据" }]; }
    }
  ];
  for (const negativeCase of permissionNegativeCases) {
    const description = structuredClone(permissionDescription);
    negativeCase.mutate(description);
    const descriptionPath = resolve(tempRoot, `${negativeCase.id}.project-description.json`);
    const outputPath = resolve(tempRoot, `${negativeCase.id}.generated`);
    writeFileSync(descriptionPath, `${JSON.stringify(description, null, 2)}\n`, "utf8");
    const result = run([
      generator,
      "--description",
      relative(kitRoot, descriptionPath),
      "--context",
      permissionFixture.context,
      "--out",
      relative(kitRoot, outputPath)
    ]);
    if (result.status === 0) throw new Error(`${negativeCase.id} unexpectedly generated output`);
    if (existsSync(outputPath)) throw new Error(`${negativeCase.id} wrote an output directory`);
  }

  const customFixture = fixtures.find((fixture) => fixture.id === "custom-native");
  const crossCwdRoot = resolve(tempRoot, "cross-cwd-consumer");
  const crossCwdDesignPackDir = resolve(crossCwdRoot, "foundations/design-packs");
  mkdirSync(crossCwdDesignPackDir, { recursive: true });
  copyFileSync(resolve(kitRoot, customFixture.description), resolve(crossCwdRoot, "project-description.json"));
  copyFileSync(resolve(kitRoot, customFixture.context), resolve(crossCwdRoot, "business-context.json"));
  copyFileSync(
    resolve(kitRoot, "foundations/design-packs/custom-native-local-0.1.0.json"),
    resolve(crossCwdDesignPackDir, "custom-native-local-0.1.0.json")
  );

  const absoluteGenerator = resolve(kitRoot, generator);
  const crossCwdRelative = runFrom(crossCwdRoot, [
    absoluteGenerator,
    "--description",
    "project-description.json",
    "--context",
    "business-context.json",
    "--out",
    "generated-relative"
  ]);
  expectExit(crossCwdRelative, 0, "cross-cwd relative project generation");
  hashGenerated(resolve(crossCwdRoot, "generated-relative"), customFixture);

  const crossCwdAbsolute = runFrom(crossCwdRoot, [
    absoluteGenerator,
    "--description",
    resolve(crossCwdRoot, "project-description.json"),
    "--context",
    resolve(crossCwdRoot, "business-context.json"),
    "--out",
    resolve(crossCwdRoot, "generated-absolute")
  ]);
  expectExit(crossCwdAbsolute, 0, "cross-cwd absolute project generation");
  hashGenerated(resolve(crossCwdRoot, "generated-absolute"), customFixture);

  const escapedInput = runFrom(crossCwdRoot, [
    absoluteGenerator,
    "--description",
    resolve(kitRoot, customFixture.description),
    "--context",
    "business-context.json",
    "--out",
    "escaped-input"
  ]);
  if (escapedInput.status === 0 || !escapedInput.stderr.includes("escapes the project root")) {
    throw new Error(`cross-cwd escaped input did not fail closed: ${escapedInput.stderr || escapedInput.stdout}`);
  }
  if (existsSync(resolve(crossCwdRoot, "escaped-input"))) {
    throw new Error("cross-cwd escaped input wrote an output directory");
  }

  const invalid = run([generator, "--description", invalidDescription, "--out", invalidOut]);
  if (invalid.status === 0) throw new Error("invalid fixture unexpectedly generated output");
  if (existsSync(resolve(kitRoot, invalidOut))) throw new Error("invalid fixture wrote an output directory");

  const missingContextOut = relative(kitRoot, resolve(tempRoot, "missing-context"));
  const missingContext = run([generator, "--description", fixtures[0].description, "--out", missingContextOut]);
  if (missingContext.status === 0) throw new Error("description generation without --context must fail closed");
  if (existsSync(resolve(kitRoot, missingContextOut))) throw new Error("missing --context wrote an output directory");

  const implicitLegacy = run([generator]);
  if (implicitLegacy.status === 0) throw new Error("implicit sample generation must fail closed");

  const after = hashFiles(existingOutputs);
  for (const file of existingOutputs) {
    if (before[file] !== after[file]) throw new Error(`existing project output changed: ${file}`);
  }

  console.log(
    `project generator tests passed: deterministic=${JSON.stringify(deterministic)}; invalidExit=${invalid.status}; simpleFilteringInvalid=${filteringNegativeCases.length}; responsiveOverflowOutputInvalid=${responsiveOutputNegativeCases.length}; contentFidelityInputInvalid=${contentFidelityInputNegativeCases.length}; contentFidelityOutputInvalid=${contentFidelityOutputNegativeCases.length}; formFidelityInputInvalid=${formFidelityInputNegativeCases.length}; formFidelityOutputInvalid=${formFidelityOutputNegativeCases.length}; operationalInvalid=${operationalNegativeCases.length}; analyticsInvalid=${"excluded"}; permissionInvalid=${permissionNegativeCases.length}; crossCwd=relative+absolute+escape-guard; existingProjects=unchanged`
  );
} finally {
  const rel = relative(resolve(kitRoot, "generator"), tempRoot);
  if (rel && rel !== ".." && !rel.startsWith(`..\\`) && !rel.startsWith("../")) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function run(args) {
  return spawnSync(process.execPath, args, { cwd: kitRoot, encoding: "utf8" });
}

function runFrom(cwd, args) {
  return spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
}

function expectExit(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label} exited ${result.status}: ${result.stderr || result.stdout}`);
  }
}

function hashGenerated(directory, fixture) {
  const files = fixture.outputFiles.map((file) => resolve(directory, file));
  return hashValues(files.map((file) => readFileSync(file)));
}

function hashFiles(files) {
  return Object.fromEntries(files.map((file) => [file, hashValues([readFileSync(resolve(kitRoot, file))])]));
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function assertImportBoundary(directory, fixture) {
  const source = fixture.outputFiles
    .map((file) => readFileSync(resolve(directory, file), "utf8"))
    .join("\n");
  for (const expected of fixture.requiredImports ?? []) {
    if (!source.includes(expected)) throw new Error(`${fixture.id} missing expected import ${expected}`);
  }
  for (const forbidden of fixture.forbiddenImports ?? []) {
    if (source.includes(forbidden)) throw new Error(`${fixture.id} contains forbidden import ${forbidden}`);
  }
}

function assertAntdKnowledgeInput(directory) {
  const input = readJson(resolve(directory, "generation-knowledge.json"));
  if (input.kind !== "frozen-antd-generation-input" || input.foundation?.knowledgeId !== "antd-6.5.0-designer-knowledge") {
    throw new Error("tianshu-firmware generation knowledge metadata is invalid");
  }
  if (input.pages?.length !== 1 || input.pages[0].pattern !== "list-page") {
    throw new Error("tianshu-firmware generation knowledge page selection is invalid");
  }
  const actual = new Set(input.pages[0].actualComponents ?? []);
  for (const component of ["Button", "Card", "ConfigProvider", "Form", "Input", "Select", "Space", "Table", "Typography"]) {
    if (!actual.has(component)) throw new Error(`tianshu-firmware generation knowledge is missing ${component}`);
  }
  if ((input.pages[0].componentReferences ?? []).length !== actual.size) {
    throw new Error("tianshu-firmware generation knowledge does not freeze every actual component reference");
  }
  const blogIds = new Set((input.pages[0].blogArticles ?? []).map((article) => article.id));
  for (const article of ["button-loading-animation", "form-names", "table-scroll-ghost", "virtual-table", "visual-regression"]) {
    if (!blogIds.has(article)) throw new Error(`tianshu-firmware generation knowledge is missing selected Blog article ${article}`);
  }
  for (const maintenanceOnly of ["css-tricks", "v4-ood"]) {
    if (blogIds.has(maintenanceOnly)) throw new Error(`tianshu-firmware generation knowledge selected maintenance-only Blog article ${maintenanceOnly}`);
  }
  if (blogIds.size >= 36) throw new Error("tianshu-firmware generation knowledge loaded the full Blog instead of a page-specific subset");
  const visualCases = new Set(input.pages[0].visualRegressionCases?.selected ?? []);
  for (const testCase of ["golden-page-baseline", "button-loading-layout-stability", "table-horizontal-scroll-alignment"]) {
    if (!visualCases.has(testCase)) throw new Error(`tianshu-firmware generation knowledge is missing visual case ${testCase}`);
  }
}

function assertRadioKnowledgeInput(directory) {
  const input = readJson(resolve(directory, "generation-knowledge.json"));
  const page = input.pages?.[0];
  if (input.kind !== "frozen-antd-generation-input" || input.projectId !== "antd-radio-knowledge-canary") {
    throw new Error("AntD Radio fixture generation knowledge metadata is invalid");
  }
  if (input.foundation?.manifest?.path !== "foundations/knowledge/antd-6.5.0/manifest.radio-coverage.json" || input.foundation.manifest.sha256 !== "7c9722190265dc25976e90541f90b9fb6bfd6de4873360c4d13fe9badc6e97e4") {
    throw new Error("AntD Radio fixture did not freeze the additive knowledge manifest");
  }
  if (input.pages?.length !== 1 || page?.pageId !== "radio-coverage-form" || page.pattern !== "form-page") {
    throw new Error("AntD Radio fixture page selection is invalid");
  }
  const expectedComponents = ["Button", "Card", "ConfigProvider", "Form", "Radio", "Space", "Typography"];
  const actualComponents = page.actualComponents ?? [];
  if (JSON.stringify(actualComponents) !== JSON.stringify(expectedComponents)) {
    throw new Error(`AntD Radio fixture actual components drifted: ${JSON.stringify(actualComponents)}`);
  }
  if ((page.componentReferences ?? []).length !== expectedComponents.length) {
    throw new Error("AntD Radio fixture must freeze every rendered component reference");
  }
  const radioReference = page.componentReferences.find((reference) => reference.component === "Radio");
  if (radioReference?.path !== "foundations/knowledge/antd-6.5.0/component-reference/Radio.json" || radioReference.sha256 !== "1937caa89666e4634fe56adec1b52dd95bc4849b6cac0f8c9471e3a9e2e190f8") {
    throw new Error("AntD Radio fixture component reference receipt is invalid");
  }
  const source = readFileSync(resolve(directory, "pages.tsx"), "utf8");
  if (!source.includes("<Radio.Group")) throw new Error("AntD Radio fixture output does not render Radio.Group");
}

function assertSimpleListFilteringInput(directory) {
  const input = readJson(resolve(directory, "generation-knowledge.json"));
  const page = input.pages?.[0];
  if (input.kind !== "frozen-antd-generation-input" || input.projectId !== "antd-simple-list-filtering-canary") {
    throw new Error("AntD simple list filtering generation knowledge metadata is invalid");
  }
  if (input.pages?.length !== 1 || page?.pageId !== "filtering-canary" || page.pattern !== "list-page") {
    throw new Error("AntD simple list filtering fixture page selection is invalid");
  }
  const source = readFileSync(resolve(directory, "pages.tsx"), "utf8");
  for (const marker of [
    'data-testid="simple-list-filter-submit"',
    'data-testid="simple-list-filter-reset"',
    'data-testid="simple-list-filter-count"',
    "const visibleRows = useMemo(",
    "dataSource={visibleRows}",
    "total: visibleRows.length",
    '"urgent":"紧急"',
    '"normal":"常规"'
  ]) {
    if (!source.includes(marker)) throw new Error(`AntD simple list filtering output is missing ${marker}`);
  }
  if (source.includes("generated-responsive-table") || source.includes('scroll={{ x: "max-content" }}')) {
    throw new Error("AntD four-column simple list unexpectedly opted into wide-table containment");
  }
}

function assertResponsiveListOverflowOutput(directory) {
  const input = readJson(resolve(directory, "generation-knowledge.json"));
  const page = input.pages?.[0];
  if (input.kind !== "frozen-antd-generation-input" || input.projectId !== "antd-responsive-list-overflow-canary") {
    throw new Error("AntD responsive list overflow generation knowledge metadata is invalid");
  }
  if (input.pages?.length !== 1 || page?.pageId !== "responsive-list-canary" || page.pattern !== "list-page") {
    throw new Error("AntD responsive list overflow fixture page selection is invalid");
  }
  assertResponsiveListOverflowSource(
    readFileSync(resolve(directory, "pages.tsx"), "utf8"),
    readFileSync(resolve(directory, "styles.css"), "utf8")
  );
}

function assertResponsiveListOverflowSource(pagesSource, stylesSource) {
  for (const marker of [
    'className="generated-responsive-table"',
    'scroll={{ x: "max-content" }}'
  ]) {
    if (!pagesSource.includes(marker)) throw new Error(`responsive list output is missing ${marker}`);
  }
  for (const marker of [
    ".generated-stack > .ant-space-item,",
    ".generated-stack > .ant-space-item > .ant-card,",
    ".generated-responsive-table {",
    ".generated-stack .ant-form-inline .ant-form-item {"
  ]) {
    if (!stylesSource.includes(marker)) throw new Error(`responsive list styles are missing ${marker}`);
  }
}

function assertDashboardContentFidelityInput(directory, fixture) {
  const input = readJson(resolve(directory, "generation-knowledge.json"));
  const page = input.pages?.[0];
  if (input.kind !== "frozen-antd-generation-input" || input.projectId !== "antd-dashboard-content-fidelity-canary") {
    throw new Error("AntD dashboard content fidelity generation knowledge metadata is invalid");
  }
  if (input.pages?.length !== 1 || page?.pageId !== "content-fidelity-canary" || page.pattern !== "dashboard-page") {
    throw new Error("AntD dashboard content fidelity fixture page selection is invalid");
  }
  const source = readFileSync(resolve(directory, "pages.tsx"), "utf8");
  const description = readJson(resolve(kitRoot, fixture.description));
  assertGeneratedDashboardContentFidelity(description, source);
  for (const marker of [
    'data-testid={"dashboard-metric-delta-0"}',
    'data-testid={"dashboard-metric-delta-1"}',
    'data-testid={"dashboard-metric-delta-2"}',
    'data-trend={"up"}',
    'data-trend={"flat"}',
    'data-trend={"down"}'
  ]) {
    if (!source.includes(marker)) throw new Error(`AntD dashboard content fidelity output is missing ${marker}`);
  }
}

function assertFormContentFidelityInput(directory, fixture) {
  const input = readJson(resolve(directory, "generation-knowledge.json"));
  const page = input.pages?.[0];
  if (input.kind !== "frozen-antd-generation-input" || input.projectId !== "antd-form-content-fidelity-canary") {
    throw new Error("AntD form content fidelity generation knowledge metadata is invalid");
  }
  if (input.pages?.length !== 1 || page?.pageId !== "form-content-fidelity-canary" || page.pattern !== "form-page") {
    throw new Error("AntD form content fidelity fixture page selection is invalid");
  }
  const actualComponents = page.actualComponents ?? [];
  if (!actualComponents.includes("Steps")) {
    throw new Error("AntD form content fidelity fixture did not freeze Steps knowledge");
  }
  const source = readFileSync(resolve(directory, "pages.tsx"), "utf8");
  const description = readJson(resolve(kitRoot, fixture.description));
  assertGeneratedFormContentFidelity(description, source);
  for (const marker of [
    '<Steps current={0}',
    'className="generated-form-section"',
    'className="generated-form-actions"'
  ]) {
    if (!source.includes(marker)) throw new Error(`AntD form content fidelity output is missing ${marker}`);
  }
}

function assertGoldenOperationalInput(directory) {
  const input = readJson(resolve(directory, "generation-knowledge.json"));
  const page = input.pages?.[0];
  if (input.kind !== "frozen-antd-generation-input" || input.projectId !== "tianshu-ops") {
    throw new Error("Golden content schedule generation knowledge metadata is invalid");
  }
  if (input.pages?.length !== 1 || page?.pageId !== "content-schedule" || page.pattern !== "list-page") {
    throw new Error("Golden content schedule page selection is invalid");
  }
  const expectedComponents = [
    "Alert",
    "Button",
    "Card",
    "ConfigProvider",
    "DatePicker",
    "Descriptions",
    "Drawer",
    "Empty",
    "Form",
    "Input",
    "Select",
    "Space",
    "Steps",
    "Switch",
    "Table",
    "Tabs",
    "Tag",
    "Typography",
    "Upload"
  ];
  const actual = new Set(page.actualComponents ?? []);
  for (const component of expectedComponents) {
    if (!actual.has(component)) throw new Error(`Golden content schedule generation knowledge is missing ${component}`);
  }
  if (actual.size !== expectedComponents.length || (page.componentReferences ?? []).length !== actual.size) {
    throw new Error("Golden content schedule must freeze exactly its rendered AntD component references");
  }
  const source = readFileSync(resolve(directory, "pages.tsx"), "utf8");
  for (const contractMarker of [
    "data-testid=\"golden-primary-action\"",
    "data-testid=\"golden-secondary-action\"",
    "DatePicker.RangePicker",
    "rowSelection={{ selectedRowKeys",
    "className=\"generated-query-grid\"",
    "<Steps current={2}",
    "<Tabs activeKey={activeTab}",
    "<Upload.Dragger"
  ]) {
    if (!source.includes(contractMarker)) throw new Error(`Golden content schedule output is missing ${contractMarker}`);
  }
}

function assertGoldenPermissionInput(directory) {
  const input = readJson(resolve(directory, "generation-knowledge.json"));
  const page = input.pages?.[0];
  if (input.kind !== "frozen-antd-generation-input" || input.projectId !== "tianshu-ops") {
    throw new Error("Golden RBAC forbidden generation knowledge metadata is invalid");
  }
  if (input.pages?.length !== 1 || page?.pageId !== "platform-rbac-forbidden" || page.pattern !== "detail-page") {
    throw new Error("Golden RBAC forbidden page selection is invalid");
  }
  const expectedComponents = ["Alert", "Button", "Card", "ConfigProvider", "Drawer", "Space", "Typography"];
  const actual = new Set(page.actualComponents ?? []);
  for (const component of expectedComponents) {
    if (!actual.has(component)) throw new Error(`Golden RBAC forbidden generation knowledge is missing ${component}`);
  }
  if (actual.size !== expectedComponents.length || (page.componentReferences ?? []).length !== actual.size) {
    throw new Error("Golden RBAC forbidden must freeze exactly its rendered AntD component references");
  }
  const source = readFileSync(resolve(directory, "pages.tsx"), "utf8");
  for (const contractMarker of [
    'data-testid="golden-permission-dashboard"',
    'data-testid="golden-permission-request"',
    'data-testid="golden-permission-request-panel"',
    'data-privacy-mode={"no-protected-data"}',
    'href={"/dashboard"}',
    'platform:rbac:read',
    '<Drawer',
    '<Alert showIcon type="info" title='
  ]) {
    if (!source.includes(contractMarker)) throw new Error(`Golden RBAC forbidden output is missing ${contractMarker}`);
  }
  for (const protectedMarker of ["Role[]", "User[]", "Permission[]", "content.table", "<Table"]) {
    if (source.includes(protectedMarker)) throw new Error(`Golden RBAC forbidden output leaked protected-data marker ${protectedMarker}`);
  }
  const styles = readFileSync(resolve(directory, "styles.css"), "utf8");
  for (const contractMarker of [".generated-permission-state", "@media (max-width: 600px)", ".generated-permission-actions"]) {
    if (!styles.includes(contractMarker)) throw new Error(`Golden RBAC forbidden styles are missing ${contractMarker}`);
  }
}

function assertGoldenAnalyticsInput(directory) {
  const input = readJson(resolve(directory, "generation-knowledge.json"));
  const page = input.pages?.[0];
  if (input.kind !== "frozen-antd-generation-input" || input.projectId !== "sample-platform") {
    throw new Error("Golden reports logs generation knowledge metadata is invalid");
  }
  if (input.pages?.length !== 1 || page?.pageId !== "reports-logs" || page.pattern !== "dashboard-page") {
    throw new Error("Golden reports logs page selection is invalid");
  }
  const expectedComponents = ["Alert", "Button", "Card", "Col", "ConfigProvider", "Row", "Space", "Statistic", "Tag", "Typography"];
  const actual = new Set(page.actualComponents ?? []);
  for (const component of expectedComponents) {
    if (!actual.has(component)) throw new Error(`Golden reports logs generation knowledge is missing ${component}`);
  }
  if (actual.size !== expectedComponents.length || (page.componentReferences ?? []).length !== actual.size) {
    throw new Error("Golden reports logs must freeze exactly its rendered AntD component references");
  }
  const source = readFileSync(resolve(directory, "pages.tsx"), "utf8");
  for (const contractMarker of [
    'data-testid="golden-refresh-report"',
    'data-testid="golden-export-report"',
    'anchor.download = "reports-logs.csv"',
    '已导出 · reports-logs.csv',
    'generated-analytics-status__dot--processing',
    'className="generated-chart-point-label"',
    'className="generated-bars__series-index"',
    'className="generated-bars__value"',
    'className="generated-donut__label"',
    'className="generated-donut-legend__index"',
    'className="generated-sr-only"',
    "conic-gradient(",
    "window.setTimeout",
    "不用零值覆盖异常"
  ]) {
    if (!source.includes(contractMarker)) throw new Error(`Golden reports logs output is missing ${contractMarker}`);
  }
  const styles = readFileSync(resolve(directory, "styles.css"), "utf8");
  for (const contractMarker of ["stroke-dasharray: var(--generated-series-dash)", ".generated-analytics-status__dot--processing"]) {
    if (!styles.includes(contractMarker)) throw new Error(`Golden reports logs styles are missing ${contractMarker}`);
  }
  const seriesColors = [...styles.matchAll(/--generated-series-color-(?:blue|cyan|orange|violet):\s*(#[0-9a-f]{6})/gi)].map((match) => match[1]);
  if (seriesColors.length !== 4) throw new Error("Golden reports logs must define exactly four series colors");
  for (const color of seriesColors) {
    if (contrastRatio(color, "#ffffff") < 4.5) throw new Error(`Golden reports logs series color ${color} fails 4.5:1 against white`);
  }
}

function contrastRatio(first, second) {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255);
    const linear = channels.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function assertSampleDataBinding(directory, fixture) {
  const pagesSource = readFileSync(resolve(directory, "pages.tsx"), "utf8");
  const sampleDataSource = readFileSync(resolve(directory, "sample-data.ts"), "utf8");
  for (const entityType of fixture.sampleEntities) {
    if (!pagesSource.includes(`Object.values(sampleEntities.${entityType})`)) {
      throw new Error(`${fixture.id} pages do not read ${entityType} from sample-data.ts`);
    }
  }
  if (!sampleDataSource.includes("samplePackSha256") || !sampleDataSource.includes("export const sampleEntities")) {
    throw new Error(`${fixture.id} generated sample-data.ts is missing provenance or entities`);
  }
}

function hashValues(values) {
  const hash = createHash("sha256");
  for (const value of values) hash.update(value);
  return hash.digest("hex");
}
