import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { antComponentsForDescription, resolveAntdGenerationInput, validateAntdKnowledgePack } from "./antd-knowledge.mjs";
import { assertGeneratedDashboardContentFidelity, validateDashboardContentFidelityContract } from "./dashboard-content-fidelity.mjs";
import { assertGeneratedFormContentFidelity, validateFormPresentationContract } from "./form-content-fidelity.mjs";

const root = process.cwd();
const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatorArgs = parseGeneratorArgs(process.argv.slice(2));
const ELEMENT_PLUS_LIST_PAGE_SIZE = 10;

if (generatorArgs.description) {
  runDescriptionGenerator(generatorArgs);
  process.exit(0);
}

if (!generatorArgs.legacySample) {
  console.error(
    "generate-project-pages failed: pass --description <project-description.json> --context <business-context.json> --out <directory>; " +
      "the frozen sample compatibility path requires --legacy-sample"
  );
  process.exit(1);
}

const projectRoot = "projects/sample-inventory-erp";
const pagesDoc = readJson(`${projectRoot}/pages.json`);
const pages = pagesDoc.pages ?? [];
const generatedDir = resolve(root, projectRoot, "generated");

mkdirSync(generatedDir, { recursive: true });
writeFileSync(resolve(generatedDir, "pages.tsx"), buildPagesSource(pages), "utf8");
writeFileSync(resolve(generatedDir, "styles.css"), buildStylesSource(), "utf8");

console.log(`generated ${pages.length} project pages into ${projectRoot}/generated`);

function readJson(file) {
  return JSON.parse(readFileSync(resolve(root, file), "utf8"));
}

function buildPagesSource(projectPages) {
  const pageIdUnion = projectPages.map((page) => JSON.stringify(page.id)).join(" | ");
  const componentEntries = projectPages
    .map((page) => `  ${JSON.stringify(page.id)}: () => <GeneratedPage page={pageById[${JSON.stringify(page.id)}]} />`)
    .join(",\n");

  return `import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  DataGrid,
  DataSection,
  DescriptionGrid,
  DetailHeader,
  FilterPanel,
  FormSection,
  Input,
  MetricCard,
  Pagination,
  PageHeader,
  PageLayout,
  Select,
  Stepper,
  Table,
  Tabs,
  Textarea
} from "@ai-readable/kit";
import "./styles.css";

export type GeneratedPageId = ${pageIdUnion};

type GeneratedPagePlan = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  flowIds: string[];
  flowCard: {
    entry: string;
    previousPages: string[];
    nextPages: string[];
    userGoal: string;
    businessState: string;
  };
  intentCard: {
    pageGoal: string;
    firstViewport: string[];
    primaryAction: string;
    secondaryActions: string[];
    successCriteria: string[];
    prdAnchor?: string;
    referenceImplementations?: string[];
    antiPatterns?: string[];
    viewDecision?: {
      primary: string;
      supporting: string[];
      rationale: string[];
    };
  };
  componentPlan: string[];
  dataRequirements: string[];
  layoutTree: string[];
};

type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: GeneratedPagePlan["pattern"];
  component: () => ReactNode;
};

const pagePlans = ${JSON.stringify(projectPages, null, 2)} as GeneratedPagePlan[];

const pageById = Object.fromEntries(pagePlans.map((page) => [page.id, page])) as Record<GeneratedPageId, GeneratedPagePlan>;

const generatedComponents = {
${componentEntries}
} satisfies Record<GeneratedPageId, () => ReactNode>;

export const generatedProjectPages: GeneratedProjectPage[] = pagePlans.map((page) => ({
  id: page.id,
  route: page.route,
  title: page.title,
  pattern: page.pattern,
  component: generatedComponents[page.id]
}));

const inventoryRows = [
  { id: "SKU-1042", name: "有机燕麦奶", warehouse: "华西仓", available: 148, status: "low", expiry: "2026-07-18" },
  { id: "SKU-2188", name: "冷萃咖啡组合装", warehouse: "华北仓", available: 560, status: "healthy", expiry: "2026-09-02" },
  { id: "SKU-3307", name: "蛋白棒礼盒", warehouse: "华东仓", available: 32, status: "risk", expiry: "2026-07-12" }
];

const permissionRows = [
  { id: "owner", role: "系统负责人", users: 3, permissions: 82, status: "review", owner: "管理员组" },
  { id: "buyer", role: "采购员", users: 12, permissions: 34, status: "active", owner: "采购部" },
  { id: "warehouse", role: "仓库主管", users: 8, permissions: 41, status: "risk", owner: "运营部" }
];

const movementRows = [
  { id: "m1", event: "入库批次到货", quantity: "+240", time: "09:20" },
  { id: "m2", event: "标记临期风险", quantity: "32", time: "08:15" },
  { id: "m3", event: "关联采购单", quantity: "+120", time: "昨天" }
];

type StatusDomain = "inventory" | "permission";

const statusCopyByDomain = {
  inventory: {
    healthy: { label: "充足", variant: "success" },
    low: { label: "偏低", variant: "warning" },
    risk: { label: "风险", variant: "danger" }
  },
  permission: {
    active: { label: "启用", variant: "success" },
    review: { label: "复核中", variant: "warning" },
    risk: { label: "风险", variant: "danger" }
  }
} as const;

function GeneratedPage({ page }: { page: GeneratedPagePlan }) {
  if (page.pattern === "dashboard-page") return <GeneratedDashboardPage page={page} />;
  if (page.pattern === "detail-page") return <GeneratedDetailPage page={page} />;
  if (page.pattern === "form-page") return <GeneratedFormPage page={page} />;
  return <GeneratedListPage page={page} />;
}

function GeneratedDashboardPage({ page }: { page: GeneratedPagePlan }) {
  return (
    <PageLayout className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={<Button>{page.intentCard.primaryAction}</Button>}
      />
      <div className="generated-metric-grid">
        <MetricCard label="账实相符率" value="99.7" unit="%" delta="+0.2%" trend="up" />
        <MetricCard label="结算差异" value="0" delta="达标" trend="flat" />
        <MetricCard label="临期风险" value="8" delta="3 项紧急" trend="down" />
        <MetricCard label="采购单异常" value="2.4" unit="%" delta="-0.4%" trend="up" />
      </div>
      <div className="generated-two-column">
        <Card title="风险队列" extra={<Badge variant="warning">3 项待处理</Badge>}>
          <div className="generated-status-list">
            <StatusLine label="库存偏低" value="有机燕麦奶" tone="warning" />
            <StatusLine label="临期" value="蛋白棒礼盒" tone="danger" />
            <StatusLine label="权限复核" value="仓库主管角色" tone="info" />
          </div>
        </Card>
        <Card title="流程上下文" extra={<Badge variant="primary">{page.flowIds.length} 条流程</Badge>}>
          <div className="generated-chip-list">
            {page.flowIds.map((flowId) => (
              <span key={flowId}>{flowId}</span>
            ))}
          </div>
        </Card>
      </div>
      <DataSection title="今日动态" description={page.flowCard.businessState} toolbar={<Button variant="outline">刷新</Button>}>
        <Table
          rowKey="id"
          dataSource={movementRows}
          columns={[
            { key: "event", title: "事件" },
            { key: "quantity", title: "数量" },
            { key: "time", title: "时间" }
          ]}
        />
      </DataSection>
    </PageLayout>
  );
}

function GeneratedListPage({ page }: { page: GeneratedPagePlan }) {
  const isPermissions = page.id === "permissions";
  const rows = isPermissions ? permissionRows : inventoryRows;

  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={<Button>{page.intentCard.primaryAction}</Button>}
      />
      <FilterPanel
        fields={[
          { name: "keyword", label: "关键字", placeholder: isPermissions ? "角色或归属" : "SKU 或仓库" },
          {
            name: "status",
            label: "状态",
            type: "select",
            options: [
              { label: "充足", value: "healthy" },
              { label: "复核中", value: "review" },
              { label: "风险", value: "risk" }
            ]
          }
        ]}
      />
      <DataSection
        title={isPermissions ? "角色矩阵" : "库存结余"}
        description={page.flowCard.userGoal}
        toolbar={<Button variant="outline">{page.intentCard.secondaryActions[0] ?? "导出"}</Button>}
      >
        {isPermissions ? <PermissionGrid rows={permissionRows} /> : <InventoryGrid rows={inventoryRows} />}
      </DataSection>
    </PageLayout>
  );
}

function InventoryGrid({ rows }: { rows: typeof inventoryRows }) {
  return (
    <DataGrid
      rowKey="id"
      rowSelection
      dataSource={rows}
      columns={[
        { key: "id", title: "SKU" },
        { key: "name", title: "名称" },
        { key: "warehouse", title: "仓库" },
        { key: "available", title: "可用量" },
        {
          key: "status",
          title: "状态",
          render: (record) => <StatusBadge status={String(record.status)} domain="inventory" />
        },
        { key: "expiry", title: "临期日" }
      ]}
      pagination={<Pagination pageSize={20} total={124} />}
    />
  );
}

function PermissionGrid({ rows }: { rows: typeof permissionRows }) {
  return (
    <DataGrid
      rowKey="id"
      rowSelection
      dataSource={rows}
      columns={[
        { key: "role", title: "角色" },
        { key: "users", title: "用户数" },
        { key: "permissions", title: "权限点数" },
        {
          key: "status",
          title: "状态",
          render: (record) => <StatusBadge status={String(record.status)} domain="permission" />
        },
        { key: "owner", title: "归属" }
      ]}
      pagination={<Pagination pageSize={25} total={48} />}
    />
  );
}

function GeneratedDetailPage({ page }: { page: GeneratedPagePlan }) {
  return (
    <PageLayout className="generated-page">
      <DetailHeader
        title="SKU-1042 有机燕麦奶"
        subtitle={page.intentCard.pageGoal}
        avatar="SKU"
        status={<Badge variant="warning">库存偏低</Badge>}
        actions={<Button>{page.intentCard.primaryAction}</Button>}
      />
      <DescriptionGrid
        items={[
          { label: "品类", value: "植物基乳品" },
          { label: "批次策略", value: "跟踪临期" },
          { label: "仓库", value: "华西仓" },
          { label: "可用量", value: "148 件" },
          { label: "预留量", value: "72 件" },
          { label: "下一步", value: page.flowCard.nextPages[0] ?? "复核" }
        ]}
      />
      <Tabs
        items={[
          {
            key: "activity",
            label: "动态",
            content: (
              <Table
                rowKey="id"
                dataSource={movementRows}
                columns={[
                  { key: "event", title: "事件" },
                  { key: "quantity", title: "数量" },
                  { key: "time", title: "时间" }
                ]}
              />
            )
          },
          {
            key: "settings",
            label: "设置",
            content: <Card title="批次控制">临期风险、补货点与仓库路由保持可见，便于复核。</Card>
          }
        ]}
      />
    </PageLayout>
  );
}

function GeneratedFormPage({ page }: { page: GeneratedPagePlan }) {
  return (
    <PageLayout className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={<Button variant="outline">存草稿</Button>}
      />
      <Stepper
        currentKey="supplier"
        items={[
          { key: "supplier", title: "供应商", description: "选择合作方" },
          { key: "lines", title: "订单行", description: "录入 SKU 需求" },
          { key: "review", title: "确认", description: "确认交付信息" }
        ]}
      />
      <FormSection title="供应商" description="选择供应商、账期与负责人。">
        <Select
          label="供应商"
          placeholder="请选择供应商"
          options={[
            { label: "北鲜贸易", value: "north-fresh" },
            { label: "西联食品", value: "westline-foods" }
          ]}
        />
        <Input label="采购负责人" placeholder="请输入采购负责人" defaultValue="采购部" />
      </FormSection>
      <FormSection title="订单行" description="录入 SKU、数量与预计到货。">
        <Input label="SKU" placeholder="请输入 SKU" defaultValue="SKU-1042" />
        <Input label="数量" placeholder="请输入数量" defaultValue="240" />
        <Select
          label="仓库"
          placeholder="请选择仓库"
          options={[
            { label: "华西仓", value: "west-hub" },
            { label: "华北仓", value: "north-hub" }
          ]}
        />
        <Textarea label="复核备注" placeholder="请输入复核备注" rows={3} />
      </FormSection>
      <div className="generated-actions">
        <Button variant="outline">取消</Button>
        <Button>{page.intentCard.primaryAction}</Button>
      </div>
    </PageLayout>
  );
}

function StatusLine({ label, value, tone }: { label: string; value: string; tone: "warning" | "danger" | "info" }) {
  const toneCopy = { warning: "需关注", danger: "高风险", info: "信息" } as const;
  return (
    <div className="generated-status-line">
      <span>{label}</span>
      <strong>{value}</strong>
      <Badge variant={tone}>{toneCopy[tone]}</Badge>
    </div>
  );
}

function StatusBadge({ status, domain = "inventory" }: { status: string; domain?: StatusDomain }) {
  const fallback = { label: status, variant: "info" } as const;
  const domainCopy = domain === "permission" ? statusCopyByDomain.permission : statusCopyByDomain.inventory;
  const copy = domainCopy[status as keyof typeof domainCopy] ?? fallback;
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}
`;
}

function buildStylesSource(description) {
  const operationalStyles = description?.pages?.some((page) => Boolean(page.content.operationalList))
    ? `
.generated-golden-page {
  animation: none;
  width: 100%;
}

.generated-golden-page .generated-stack,
.generated-tab-stack {
  display: flex;
  width: 100%;
}

.generated-golden-page .generated-native-header {
  align-items: flex-start;
  display: flex;
  gap: 24px;
  justify-content: space-between;
}

.generated-golden-page .generated-native-header .ant-typography {
  margin-bottom: 0;
}

.generated-golden-page .generated-native-header h2.ant-typography {
  font-size: 28px;
  line-height: 1.3;
}

.generated-golden-page .generated-native-header .ant-typography + .ant-typography {
  margin-top: 6px;
}

.generated-process-card .ant-card-body {
  display: grid;
  gap: 20px;
  padding: 20px;
}

.generated-section-heading {
  display: grid;
  gap: 4px;
}

.generated-section-heading .ant-typography,
.generated-table-card .ant-card-head .ant-typography {
  margin: 0;
}

.generated-query-card .ant-card-body {
  padding: 16px;
}

.generated-query-grid {
  align-items: end;
  display: grid;
  gap: 14px 16px;
  grid-template-columns: repeat(12, minmax(0, 1fr));
}

.generated-query-grid > .ant-form-item {
  grid-column: span 2;
  margin-bottom: 0;
}

.generated-query-grid > .generated-range-filter,
.generated-query-grid > .generated-switch-filter {
  grid-column: span 3;
}

.generated-query-grid .ant-select,
.generated-query-grid .ant-picker {
  width: 100%;
}

.generated-switch-filter {
  align-items: center;
  display: flex;
  gap: 12px;
  min-height: 32px;
}

.generated-query-actions {
  align-items: center;
  display: flex;
  gap: 8px;
  grid-column: span 2;
  min-height: 32px;
}

.generated-table-card .ant-card-head {
  min-height: 68px;
  padding: 0 16px;
}

.generated-table-card .ant-card-body {
  padding: 0;
}

.generated-table-card .ant-table-wrapper {
  border-top: 1px solid var(--ant-color-border-secondary);
}

.generated-table-card .ant-table-cell .ant-btn-link {
  font-size: 12px;
  padding-inline: 0;
}

.generated-cell-stack {
  display: grid;
  gap: 2px;
}

.generated-cell-stack .ant-typography {
  font-size: 12px;
}

.generated-bulk-bar {
  align-items: center;
  border-top: 1px solid var(--ant-color-border-secondary);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 16px;
}

.generated-empty-card .ant-card-body {
  padding: 64px 24px;
}

@media (max-width: 1199px) {
  .generated-query-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .generated-query-grid > .ant-form-item,
  .generated-query-grid > .generated-range-filter,
  .generated-query-grid > .generated-switch-filter,
  .generated-query-actions {
    grid-column: span 1;
  }
}

@media (max-width: 767px) {
  .generated-golden-page .generated-native-header {
    align-items: stretch;
    flex-direction: column;
  }

  .generated-golden-page .generated-native-header > .ant-space {
    width: 100%;
  }

  .generated-golden-page .generated-native-header > .ant-space .ant-btn {
    flex: 1;
  }

  .generated-query-grid {
    grid-template-columns: 1fr;
  }

  .generated-query-actions .ant-btn {
    flex: 1;
  }
}
`
    : "";
  const analyticsStyles = description?.pages?.some((page) => Boolean(page.content.analytics))
    ? `
.generated-golden-page {
  animation: none;
  min-width: 0;
  width: 100%;
}

.generated-golden-page .generated-stack {
  display: flex;
  width: 100%;
}

.generated-golden-page .generated-native-header {
  align-items: flex-start;
  display: flex;
  gap: 24px;
  justify-content: space-between;
}

.generated-golden-page .generated-native-header > div:first-child {
  min-width: 0;
}

.generated-golden-page .generated-native-header .ant-typography {
  margin-bottom: 0;
}

.generated-golden-page .generated-native-header h2.ant-typography {
  font-size: 28px;
  line-height: 1.3;
}

.generated-golden-page .generated-native-header .ant-typography + .ant-typography {
  margin-top: 6px;
}

.generated-analytics-dashboard {
  --generated-series-color-blue: #0958d9;
  --generated-series-color-cyan: #006d75;
  --generated-series-color-orange: #ad4e00;
  --generated-series-color-violet: #531dab;
  display: grid;
  gap: 20px;
  min-width: 0;
  width: 100%;
}

.generated-analytics-metrics .ant-col {
  display: flex;
}

.generated-analytics-metric {
  width: 100%;
}

.generated-analytics-metric .ant-card-body {
  align-items: center;
  display: flex;
  gap: 16px;
  min-height: 126px;
  padding: 20px;
}

.generated-analytics-metric__icon {
  align-items: center;
  background: #e6f4ff;
  border-radius: 999px;
  color: #1677ff;
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 24px;
  height: 48px;
  justify-content: center;
  width: 48px;
}

.generated-analytics-metric__body {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.generated-analytics-metric__body .ant-statistic-title {
  color: var(--ant-color-text);
  font-size: 15px;
  margin-bottom: 1px;
}

.generated-analytics-metric__body .ant-statistic-content {
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1.2;
}

.generated-analytics-metric__hint {
  color: var(--ant-color-text-secondary);
  font-size: 13px;
}

.generated-analytics-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  min-width: 0;
}

.generated-analytics-card {
  grid-column: span 3;
  min-width: 0;
  overflow: hidden;
}

.generated-analytics-card--trend {
  grid-column: span 6;
}

.generated-analytics-card .ant-card-head {
  min-height: 66px;
  padding: 0 16px;
}

.generated-analytics-card .ant-card-body {
  min-width: 0;
  padding: 16px;
}

.generated-chart-heading {
  display: grid;
  gap: 2px;
}

.generated-chart-heading strong {
  color: var(--ant-color-text);
  font-size: 16px;
}

.generated-chart-heading span,
.generated-chart-caption {
  color: var(--ant-color-text-secondary);
  font-size: 12px;
  font-weight: 400;
}

.generated-chart-legend {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 8px;
}

.generated-chart-legend__item,
.generated-donut-legend__item {
  align-items: center;
  color: var(--ant-color-text-secondary);
  display: inline-flex;
  font-size: 12px;
  gap: 6px;
}

.generated-chart-legend__dot {
  border-top: 2px solid var(--generated-series-color);
  display: inline-block;
  height: 0;
  width: 18px;
}

.generated-donut-legend__dot {
  background: var(--generated-series-color);
  border-radius: 999px;
  display: inline-block;
  height: 8px;
  width: 8px;
}

.generated-series--blue {
  --generated-series-color: #0958d9;
  --generated-series-dash: none;
}

.generated-series--cyan {
  --generated-series-color: #006d75;
  --generated-series-dash: 8 4;
}

.generated-series--orange {
  --generated-series-color: #ad4e00;
  --generated-series-dash: 2 3;
}

.generated-series--violet {
  --generated-series-color: #531dab;
  --generated-series-dash: 10 3 2 3;
}

.generated-trend-scroll {
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
  width: 100%;
}

.generated-trend-chart {
  display: block;
  min-width: 520px;
  width: 100%;
}

.generated-chart-gridline {
  stroke: var(--ant-color-border-secondary);
  stroke-width: 1;
}

.generated-chart-axis-label {
  fill: var(--ant-color-text-secondary);
  font-size: 11px;
}

.generated-chart-line {
  fill: none;
  stroke: var(--generated-series-color);
  stroke-dasharray: var(--generated-series-dash);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.5;
}

.generated-chart-point {
  fill: var(--ant-color-bg-container);
  stroke: var(--generated-series-color);
  stroke-width: 2;
}

.generated-chart-point-label {
  fill: var(--ant-color-text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  paint-order: stroke;
  stroke: var(--ant-color-bg-container);
  stroke-width: 3px;
}

.generated-chart-caption {
  margin: 8px 0 0;
}

.generated-bars {
  display: grid;
  gap: 16px;
  margin-top: 12px;
}

.generated-bars__row {
  display: grid;
  gap: 8px;
  grid-template-columns: 64px minmax(0, 1fr);
}

.generated-bars__category {
  align-self: center;
  color: var(--ant-color-text-secondary);
  font-size: 12px;
}

.generated-bars__group {
  display: grid;
  gap: 5px;
}

.generated-bars__series {
  align-items: center;
  display: grid;
  gap: 5px;
  grid-template-columns: 18px minmax(0, 1fr) 38px;
}

.generated-bars__series-index,
.generated-donut-legend__index {
  color: var(--ant-color-text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  text-align: center;
}

.generated-bars__track {
  background: var(--ant-color-fill-quaternary);
  border-radius: 2px;
  height: 8px;
  overflow: hidden;
}

.generated-bars__fill {
  background: var(--generated-series-color);
  border-radius: 2px;
  display: block;
  height: 100%;
  min-width: 1px;
}

.generated-bars__value {
  color: var(--ant-color-text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.generated-donut-layout {
  align-items: center;
  display: grid;
  gap: 18px;
  justify-items: center;
}

.generated-donut {
  align-items: center;
  aspect-ratio: 1;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  max-width: 190px;
  position: relative;
  width: 72%;
}

.generated-donut::after {
  background: var(--ant-color-bg-container);
  border-radius: 50%;
  content: "";
  inset: 25%;
  position: absolute;
}

.generated-donut__center {
  display: grid;
  gap: 2px;
  justify-items: center;
  position: relative;
  z-index: 1;
}

.generated-donut__center span {
  color: var(--ant-color-text-secondary);
  font-size: 12px;
}

.generated-donut__center strong {
  color: var(--ant-color-text);
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}

.generated-donut__label {
  color: #ffffff;
  display: grid;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  gap: 1px;
  justify-items: center;
  line-height: 1;
  position: absolute;
  text-shadow: 0 1px 2px rgb(0 0 0 / 22%);
  transform: translate(-50%, -50%);
  z-index: 1;
}

.generated-donut-legend {
  display: grid;
  gap: 8px;
  width: 100%;
}

.generated-donut-legend__item {
  display: grid;
  grid-template-columns: auto 16px minmax(0, 1fr) auto;
}

.generated-donut-legend__item strong {
  color: var(--ant-color-text);
  font-variant-numeric: tabular-nums;
}

.generated-analytics-status {
  align-items: center;
  display: inline-flex;
  min-height: 32px;
}

.generated-analytics-status__dot {
  border-radius: 999px;
  display: inline-block;
  height: 8px;
  margin-right: 6px;
  transition: opacity var(--generated-duration-fast) var(--generated-ease-smooth-out);
  width: 8px;
}

.generated-analytics-status__dot--complete {
  background: var(--ant-color-success);
}

.generated-analytics-status__dot--processing {
  background: var(--ant-color-primary);
  opacity: 0.72;
}

.generated-sr-only {
  border: 0;
  clip: rect(0 0 0 0);
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

@media (max-width: 1320px) {
  .generated-analytics-card--trend {
    grid-column: 1 / -1;
  }

  .generated-analytics-card {
    grid-column: span 6;
  }
}

@media (max-width: 767px) {
  .generated-golden-page .generated-native-header {
    align-items: stretch;
    flex-direction: column;
  }

  .generated-golden-page .generated-native-header > .ant-space {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .generated-golden-page .generated-native-header > .ant-space .generated-analytics-status {
    grid-column: 1 / -1;
  }

  .generated-golden-page .generated-native-header > .ant-space .ant-btn {
    width: 100%;
  }

  .generated-analytics-card,
  .generated-analytics-card--trend {
    grid-column: 1 / -1;
  }

  .generated-analytics-metric .ant-card-body {
    min-height: 112px;
    padding: 12px;
    gap: 8px;
  }

  .generated-analytics-metric__icon {
    font-size: 19px;
    height: 38px;
    width: 38px;
  }

  .generated-analytics-metric__body .ant-statistic-title {
    font-size: 13px;
  }

  .generated-analytics-metric__body .ant-statistic-content {
    font-size: 24px;
  }

  .generated-analytics-metric__hint {
    font-size: 11px;
  }
}
`
    : "";
  const permissionStyles = description?.pages?.some((page) => Boolean(page.content.permissionState))
    ? `
.generated-permission-page {
  animation: none;
  min-width: 0;
  width: 100%;
}

.generated-permission-page .generated-stack {
  display: flex;
  width: 100%;
}

.generated-permission-card {
  border-color: var(--ant-color-border-secondary);
  box-shadow: 0 8px 24px rgb(15 23 42 / 4%);
  overflow: hidden;
}

.generated-permission-card .ant-card-body {
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: clamp(560px, calc(100vh - 160px), 820px);
  padding: 52px 32px 64px;
}

.generated-permission-state {
  align-items: center;
  display: flex;
  flex-direction: column;
  max-width: 760px;
  text-align: center;
  width: 100%;
}

.generated-permission-visual {
  align-items: center;
  color: #d9dde3;
  display: flex;
  gap: 34px;
  justify-content: center;
  line-height: 1;
  margin-bottom: 28px;
  min-height: 132px;
  user-select: none;
}

.generated-permission-visual > strong {
  font-size: 118px;
  font-weight: 600;
  letter-spacing: -8px;
}

.generated-permission-shield {
  display: inline-flex;
  font-size: 104px;
  position: relative;
}

.generated-permission-lock {
  background: var(--ant-color-bg-container);
  border-radius: 999px;
  bottom: 4px;
  color: #c7ccd4;
  font-size: 34px;
  padding: 6px;
  position: absolute;
  right: -4px;
}

.generated-permission-state h1.ant-typography {
  font-size: 28px;
  line-height: 1.35;
  margin: 0 0 16px;
}

.generated-permission-description.ant-typography {
  color: var(--ant-color-text-secondary);
  font-size: 15px;
  line-height: 1.8;
  margin: 0;
  max-width: 650px;
}

.generated-permission-identifier {
  align-items: center;
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 6px;
  color: var(--ant-color-text-secondary);
  display: inline-flex;
  font-size: 13px;
  gap: 6px;
  margin-top: 20px;
  padding: 8px 12px;
}

.generated-permission-identifier code {
  color: var(--ant-color-text);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.generated-permission-actions {
  justify-content: center;
  margin-top: 30px;
}

.generated-permission-actions .ant-btn {
  min-width: 144px;
}

.generated-permission-panel {
  display: flex;
  width: 100%;
}

.generated-permission-panel .ant-typography {
  margin-bottom: 0;
}

.generated-permission-panel__identifier {
  background: var(--ant-color-fill-quaternary);
  border-radius: 8px;
  display: grid;
  gap: 8px;
  padding: 16px;
}

.generated-permission-panel-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 600px) {
  .generated-permission-card .ant-card-body {
    min-height: calc(100vh - 160px);
    padding: 38px 20px 44px;
  }

  .generated-permission-visual {
    gap: 18px;
    margin-bottom: 22px;
    min-height: 94px;
  }

  .generated-permission-visual > strong {
    font-size: 78px;
    letter-spacing: -5px;
  }

  .generated-permission-shield {
    font-size: 72px;
  }

  .generated-permission-lock {
    font-size: 24px;
    padding: 4px;
  }

  .generated-permission-state h1.ant-typography {
    font-size: 24px;
  }

  .generated-permission-description.ant-typography {
    font-size: 14px;
  }

  .generated-permission-identifier {
    align-items: flex-start;
    flex-wrap: wrap;
    justify-content: center;
    width: 100%;
  }

  .generated-permission-actions {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .generated-permission-actions .ant-space-item,
  .generated-permission-actions .ant-btn {
    width: 100%;
  }
}
`
    : "";
  const formPresentationStyles = description?.pages?.some((page) => Boolean(page.content.formPresentation))
    ? `
.generated-form-stack {
  display: flex;
  width: 100%;
}

.generated-form-section {
  display: grid;
  gap: 16px;
}

.generated-form-section .ant-typography {
  margin: 0;
}

.generated-form-section .ant-form-item:last-child {
  margin-bottom: 0;
}

@media (max-width: 600px) {
  .generated-form-actions {
    display: flex;
    width: 100%;
  }

  .generated-form-actions .ant-btn {
    flex: 1;
  }
}
`
    : "";
  const responsiveListStyles = description?.pages?.some(
    (page) => Boolean(page.content?.simpleListFiltering) && (page.content?.table?.columns?.length ?? 0) >= 6
  )
    ? `
.generated-stack {
  display: flex;
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.generated-stack > .ant-space-item,
.generated-stack > .ant-space-item > .ant-card,
.generated-responsive-table {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

@media (max-width: 600px) {
  .generated-stack .ant-card-head-wrapper {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .generated-stack .ant-card-extra {
    margin-inline-start: 0;
  }

  .generated-stack .ant-form-inline .ant-form-item {
    margin-inline-end: 0;
    width: 100%;
  }

  .generated-stack .ant-form-inline .ant-form-item-control {
    flex: 1 1 auto;
    min-width: 0;
  }

  .generated-stack .ant-form-inline .ant-input,
  .generated-stack .ant-form-inline .ant-select {
    width: 100%;
  }
}
`
    : "";
  return `:root {
  --generated-duration-fast: 250ms;
  --generated-duration-very-slow: 500ms;
  --generated-ease-smooth-out: cubic-bezier(0.22, 1, 0.36, 1);
  --generated-ease-in-out: ease-in-out;
  --generated-distance-medium: 12px;
  --generated-blur-medium: 3px;
}

.generated-page {
  animation: generated-page-in var(--generated-duration-very-slow) var(--generated-ease-in-out) both;
  max-width: 100%;
}

.generated-metric-grid,
.generated-two-column {
  display: grid;
  gap: var(--spacing-md);
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.generated-two-column {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.generated-status-list,
.generated-chip-list {
  display: grid;
  gap: var(--spacing-sm);
}

.generated-status-line {
  align-items: center;
  border-top: 1px solid var(--color-border);
  display: grid;
  gap: var(--spacing-sm);
  grid-template-columns: minmax(90px, 0.7fr) minmax(0, 1fr) auto;
  padding-top: var(--spacing-sm);
}

.generated-status-line:first-child {
  border-top: 0;
  padding-top: 0;
}

.generated-status-line span {
  color: var(--color-text-secondary);
}

.generated-chip-list {
  align-content: start;
  display: flex;
  flex-wrap: wrap;
}

.generated-chip-list span {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-secondary);
  font-size: 12px;
  padding: 4px 8px;
}

.generated-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  justify-content: flex-end;
}

@keyframes generated-page-in {
  from {
    filter: blur(var(--generated-blur-medium));
    opacity: 0;
    transform: translateY(var(--generated-distance-medium));
  }
  to {
    filter: blur(0);
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 920px) {
  .generated-metric-grid,
  .generated-two-column,
  .generated-status-line {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .generated-page,
  .generated-page * {
    animation-duration: 1ms !important;
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
  }
}
${operationalStyles}${analyticsStyles}${permissionStyles}${formPresentationStyles}${responsiveListStyles}`;
}

function runDescriptionGenerator(args) {
  const descriptionPath = resolveInsideProject(args.description, "description");
  const contextPath = resolveInsideProject(args.context, "context");
  const outputDirectory = resolveInsideProject(args.out, "out");
  const description = readJsonAbsolute(descriptionPath);
  const context = readJsonAbsolute(contextPath);
  const schema = readJsonAbsolute(resolve(kitRoot, "schema/project-description.schema.json"));
  const contextSchema = readJsonAbsolute(resolve(kitRoot, "schema/project-context.schema.json"));
  const samplePackSchema = readJsonAbsolute(resolve(kitRoot, "schema/project-sample-pack.schema.json"));
  const componentsManifest = readJsonAbsolute(resolve(kitRoot, "components.manifest.json"));
  const patternsManifest = readJsonAbsolute(resolve(kitRoot, "patterns.manifest.json"));
  const foundationCatalog = readJsonAbsolute(resolve(kitRoot, "foundations/catalog.json"));
  const adaptersRegistry = readJsonAbsolute(resolve(kitRoot, "foundations/adapters.json"));
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const validate = ajv.compile(schema);
  const validateContext = ajv.compile(contextSchema);
  const validateSamplePack = ajv.compile(samplePackSchema);

  if (!validate(description)) {
    throw new Error(`project description is invalid: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
  }
  if (!validateContext(context)) {
    throw new Error(`project context is invalid: ${ajv.errorsText(validateContext.errors, { separator: "; " })}`);
  }
  if (context.projectId !== description.projectId) {
    throw new Error(`project context id ${context.projectId} does not match description id ${description.projectId}`);
  }

  const samplePack = loadSamplePack(context, contextPath, validateSamplePack, ajv);
  const foundation = validateFrontendFoundation(context.frontendFoundation, foundationCatalog, adaptersRegistry);
  validateDescriptionReferences(description, componentsManifest, patternsManifest, foundation, samplePack);

  const outputFiles = buildDescriptionOutput(description, foundation, samplePack);
  const stylesSource = foundation.foundation.id === "element-plus" ? buildElementPlusStylesSource() : buildStylesSource(description);
  const pagesSource = outputFiles.find((file) => file.path === "pages.tsx")?.source ?? "";
  assertGeneratedDashboardContentFidelity(description, pagesSource);
  assertGeneratedFormContentFidelity(description, pagesSource);

  mkdirSync(outputDirectory, { recursive: true });
  for (const file of outputFiles) {
    const target = resolve(outputDirectory, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.source, "utf8");
  }
  writeFileSync(resolve(outputDirectory, "styles.css"), stylesSource, "utf8");
  console.log(`generated ${description.pages.length} project pages for ${description.projectId} into ${relative(root, outputDirectory) || "."}`);
}

function validateFrontendFoundation(contract, catalog, adaptersRegistry) {
  const candidate = (catalog.candidates ?? []).find((entry) => entry.id === contract.foundation.id);
  if (!candidate) throw new Error(`frontend foundation ${contract.foundation.id} is not registered in foundations/catalog.json`);
  if (!candidate.outputModes.includes(contract.outputMode)) {
    throw new Error(`frontend foundation ${contract.foundation.id} does not support outputMode ${contract.outputMode}`);
  }
  if (candidate.framework !== "any" && candidate.framework !== contract.framework.name) {
    throw new Error(`frontend foundation ${contract.foundation.id} is for ${candidate.framework}, not ${contract.framework.name}`);
  }
  if (candidate.id !== "local" && candidate.packageName !== contract.foundation.packageName) {
    throw new Error(`frontend foundation package mismatch: catalog=${candidate.packageName} context=${contract.foundation.packageName}`);
  }
  const catalogRequiresProjectVersion = ["contract-required", "file-version-or-library-key-required"].includes(candidate.version);
  if (catalogRequiresProjectVersion && contract.foundation.version === candidate.version) {
    throw new Error(`frontend foundation ${candidate.id} requires a concrete project version or library key`);
  }
  if (candidate.id !== "local" && !catalogRequiresProjectVersion && candidate.version !== contract.foundation.version) {
    throw new Error(`frontend foundation version mismatch: catalog=${candidate.version} context=${contract.foundation.version}`);
  }
  if (candidate.id !== "local" && candidate.distribution !== contract.distribution) {
    throw new Error(`frontend foundation distribution mismatch: catalog=${candidate.distribution} context=${contract.distribution}`);
  }

  const designPackFile = resolveInsideProject(contract.designPack.path, "designPack");
  if (!existsSync(designPackFile)) throw new Error(`design pack is missing: ${contract.designPack.path}`);
  const actualHash = sha256File(designPackFile);
  if (actualHash !== contract.designPack.sha256) {
    throw new Error(`design pack hash drift for ${contract.designPack.path}: expected=${contract.designPack.sha256} actual=${actualHash}`);
  }
  const designPack = readJsonAbsolute(designPackFile);
  const knowledgePack =
    contract.foundation.id === "antd"
      ? validateAntdKnowledgePack({ root, designPack, designPackPath: contract.designPack.path })
      : null;

  const registeredAdapters = adaptersRegistry.adapters ?? {};
  const adapterNames = new Set(Object.keys(registeredAdapters));
  for (const [kind, adapterName] of Object.entries(contract.adapters)) {
    if (!adapterNames.has(adapterName)) throw new Error(`frontend foundation ${kind} adapter is not registered: ${adapterName}`);
    if (registeredAdapters[adapterName]?.kind !== kind) {
      throw new Error(`frontend foundation adapter ${adapterName} is not registered for ${kind}`);
    }
  }
  if (contract.outputMode === "library-native" && contract.foundation.id === "antd" && contract.adapters.lint !== "lint.react-antd-project") {
    throw new Error("library-native + antd must use lint.react-antd-project");
  }

  return { ...contract, knowledgePack };
}

function buildDescriptionOutput(description, foundation, samplePack) {
  const sampleOutput = samplePack
    ? [{ path: "sample-data.ts", source: buildSampleDataSource(samplePack) }]
    : [];
  if (foundation.outputMode === "kit-consumer" && foundation.framework.name === "react") {
    return [...sampleOutput, { path: "pages.tsx", source: buildDescriptionPagesSource(description, "@ai-readable/kit") }];
  }
  if (foundation.outputMode === "library-native" && foundation.framework.name === "react" && foundation.foundation.id === "antd") {
    const generationInput = resolveAntdGenerationInput(description, foundation.knowledgePack);
    return [
      ...sampleOutput,
      { path: "pages.tsx", source: buildAntdPagesSource(description) },
      { path: "generation-knowledge.json", source: `${JSON.stringify(generationInput, null, 2)}\n` }
    ];
  }
  if (foundation.outputMode === "library-native" && foundation.framework.name === "vue3" && foundation.foundation.id === "element-plus") {
    return [
      ...sampleOutput,
      { path: "package.json", source: buildVuePackageSource(description, foundation) },
      { path: "index.html", source: buildVueIndexSource(description) },
      { path: "vite.config.ts", source: buildVueViteConfigSource() },
      { path: "src/main.ts", source: buildVueMainSource() },
      { path: "src/App.vue", source: buildElementPlusAppSource(description) }
    ];
  }
  if (foundation.outputMode === "custom-native" && foundation.framework.name === "react") {
    return [
      ...sampleOutput,
      { path: "components.tsx", source: buildCustomNativeComponentsSource() },
      { path: "pages.tsx", source: buildDescriptionPagesSource(description, "./components") }
    ];
  }
  throw new Error(`unsupported frontend foundation output: ${foundation.outputMode}/${foundation.framework.name}/${foundation.foundation.id}`);
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function loadSamplePack(context, contextPath, validateSamplePack, ajv) {
  if (!context.samplePack) return null;
  const samplePackPath = resolveInsideProject(context.samplePack.path, "samplePack");
  if (dirname(samplePackPath) !== dirname(contextPath)) {
    throw new Error(`samplePack must stay beside the project context: ${context.samplePack.path}`);
  }
  if (!existsSync(samplePackPath)) throw new Error(`samplePack is missing: ${context.samplePack.path}`);
  const samplePack = readJsonAbsolute(samplePackPath);
  if (!validateSamplePack(samplePack)) {
    throw new Error(`samplePack is invalid: ${ajv.errorsText(validateSamplePack.errors, { separator: "; " })}`);
  }
  if (samplePack.projectId !== context.projectId) {
    throw new Error(`samplePack project id ${samplePack.projectId} does not match context id ${context.projectId}`);
  }
  if (samplePack.version !== context.samplePack.version) {
    throw new Error(`samplePack version ${samplePack.version} does not match context version ${context.samplePack.version}`);
  }
  return { ...samplePack, sha256: sha256File(samplePackPath) };
}

function validateDescriptionReferences(description, componentsManifest, patternsManifest, foundation, samplePack) {
  const componentNames = new Set((componentsManifest.components ?? []).map((component) => component.name));
  const patternEntries = patternsManifest.patterns ?? {};
  const customNative = foundation.outputMode === "custom-native";
  const pageIds = new Set();
  const routes = new Set();
  const usesSampleData = descriptionUsesSampleData(description);

  if (samplePack && !usesSampleData) {
    throw new Error("samplePack projects must bind at least one generated table through content.table.dataEntity");
  }
  if (!samplePack && usesSampleData) {
    throw new Error("content.table.dataEntity requires business-context.json samplePack");
  }

  for (const page of description.pages) {
    if (pageIds.has(page.id)) throw new Error(`duplicate page id: ${page.id}`);
    if (routes.has(page.route)) throw new Error(`duplicate page route: ${page.route}`);
    pageIds.add(page.id);
    routes.add(page.route);

    const pattern = patternEntries[page.pattern];
    if (!pattern) throw new Error(`page ${page.id} references unknown pattern ${page.pattern}`);
    assertUnique(page.componentPlan, `page ${page.id} component plan`);
    if (customNative) {
      for (const componentName of page.componentPlan) {
        if (!/^[A-Z][A-Za-z0-9]*$/.test(componentName)) {
          throw new Error(`page ${page.id} has invalid custom-native component name ${componentName}`);
        }
      }
    } else {
      for (const componentName of page.componentPlan) {
        if (!componentNames.has(componentName)) throw new Error(`page ${page.id} references unknown component ${componentName}`);
      }
      for (const requiredComponent of pattern.requiredComponents ?? []) {
        if (!page.componentPlan.includes(requiredComponent)) {
          throw new Error(`page ${page.id} is missing required ${page.pattern} component ${requiredComponent}`);
        }
      }
    }

    assertUnique(page.content.filters?.map((filter) => filter.name) ?? [], `page ${page.id} filter name`);
    assertUnique(page.content.fields?.map((field) => field.name) ?? [], `page ${page.id} field name`);
    assertUnique(page.content.table?.columns.map((column) => column.key) ?? [], `page ${page.id} column key`);

    const operationalList = page.content.operationalList;
    if (operationalList) {
      if (operationalList.process.current >= operationalList.process.steps.length) {
        throw new Error(`page ${page.id} process current step is out of range`);
      }
      const tabKeys = operationalList.tabs.map((tab) => tab.key);
      assertUnique(tabKeys, `page ${page.id} operational tab key`);
      if (!tabKeys.includes(operationalList.defaultTab)) {
        throw new Error(`page ${page.id} operational default tab is missing from tabs`);
      }
      assertUnique(operationalList.primaryDrawer.fields.map((field) => field.name), `page ${page.id} primary drawer field name`);
      if (operationalList.secondaryDrawer && !page.intent.secondaryActions[0]) {
        throw new Error(`page ${page.id} secondary drawer requires an intent secondary action`);
      }
    }

    if (page.content.analytics) validateAnalyticsDashboard(page);
    if (page.content.permissionState) validatePermissionState(page, foundation);
    if (page.content.contentFidelity) validateDashboardContentFidelityContract(page, foundation);
    if (page.content.formPresentation) validateFormPresentationContract(page, foundation);

    if (page.content.table) {
      const { rowKey, rows, dataEntity } = page.content.table;
      const resolvedRows = dataEntity ? Object.values(samplePack.entities[dataEntity] ?? {}) : rows;
      if (dataEntity && !samplePack.entities[dataEntity]) {
        throw new Error(`page ${page.id} table references missing sample entity ${dataEntity}`);
      }
      const requiredKeys = [
        rowKey,
        ...page.content.table.columns.map((column) => column.key),
        ...page.content.table.columns.map((column) => column.secondaryKey).filter(Boolean),
        ...page.content.table.columns.map((column) => column.secondaryActionWhenKey).filter(Boolean),
        ...(page.content.filters ?? []).flatMap((filter) => [filter.dataKey, filter.startKey, filter.endKey].filter(Boolean)),
        ...(page.content.simpleListFiltering?.mappings ?? []).flatMap((mapping) => mapping.rowKeys)
      ];
      for (const [index, row] of resolvedRows.entries()) {
        for (const key of requiredKeys) {
          if (!(key in row)) throw new Error(`page ${page.id} sample row ${index} is missing table key ${key}`);
        }
      }
      const rowKeys = resolvedRows.map((row) => row[rowKey]);
      if (rowKeys.some((value) => value === undefined || value === null || value === "")) {
        throw new Error(`page ${page.id} table rowKey ${rowKey} is missing from a row`);
      }
      assertUnique(rowKeys.map(String), `page ${page.id} row key`);
      if (page.content.simpleListFiltering) validateSimpleListFiltering(page, resolvedRows);

      for (const column of page.content.table.columns) {
        if (column.display === "tag" && !column.tagColors) {
          throw new Error(`page ${page.id} tag column ${column.key} requires tagColors`);
        }
        if (column.display === "actions" && !column.actions) {
          throw new Error(`page ${page.id} actions column ${column.key} requires actions`);
        }
        if (column.secondaryActionWhenKey && (column.display !== "actions" || column.actions.length < 2)) {
          throw new Error(`page ${page.id} conditional secondary action column ${column.key} requires two actions`);
        }
      }
    }
  }
}

function validateSimpleListFiltering(page, rows) {
  const filters = page.content.filters ?? [];
  const mappings = page.content.simpleListFiltering.mappings;
  assertUnique(mappings.map((mapping) => mapping.name), `page ${page.id} simple filter mapping name`);
  const filtersByName = new Map(filters.map((filter) => [filter.name, filter]));
  if (mappings.length !== filters.length || mappings.some((mapping) => !filtersByName.has(mapping.name))) {
    throw new Error(`page ${page.id} simple filter mappings must cover every filter exactly once`);
  }
  for (const mapping of mappings) {
    const filter = filtersByName.get(mapping.name);
    if (!["text", "select"].includes(filter.type)) {
      throw new Error(`page ${page.id} simple filter ${mapping.name} only supports text or select`);
    }
    if (filter.type === "text") {
      if (mapping.match !== "contains" || mapping.valueMap) {
        throw new Error(`page ${page.id} text filter ${mapping.name} requires contains without valueMap`);
      }
      continue;
    }
    if (mapping.match !== "equals" || !mapping.valueMap) {
      throw new Error(`page ${page.id} select filter ${mapping.name} requires equals and valueMap`);
    }
    const optionValues = filter.options.map((option) => option.value).sort();
    const mappedValues = Object.keys(mapping.valueMap).sort();
    if (JSON.stringify(optionValues) !== JSON.stringify(mappedValues)) {
      throw new Error(`page ${page.id} select filter ${mapping.name} valueMap must cover every option`);
    }
    const rowValues = new Set(rows.flatMap((row) => mapping.rowKeys.map((key) => String(row[key]))));
    for (const value of Object.values(mapping.valueMap)) {
      if (!rowValues.has(value)) throw new Error(`page ${page.id} select filter ${mapping.name} maps to missing row value ${value}`);
    }
  }
}

function validatePermissionState(page, foundation) {
  const state = page.content.permissionState;
  if (foundation.outputMode !== "library-native" || foundation.framework.name !== "react" || foundation.foundation.id !== "antd") {
    throw new Error(`page ${page.id} permission state requires library-native React + AntD`);
  }
  if (!state.description.includes(state.permissionIdentifier)) {
    throw new Error(`page ${page.id} permission state description must name ${state.permissionIdentifier}`);
  }
  if (page.intent.primaryAction !== state.primaryAction.label) {
    throw new Error(`page ${page.id} permission state primary action must match intent`);
  }
  if (page.intent.secondaryActions[0] !== state.secondaryAction.label) {
    throw new Error(`page ${page.id} permission state secondary action must match intent`);
  }
  if (state.primaryAction.targetRoute === page.route) {
    throw new Error(`page ${page.id} permission state recovery route must leave the forbidden page`);
  }
}

function validateAnalyticsDashboard(page) {
  const analytics = page.content.analytics;
  if (page.content.metrics.length !== 4) {
    throw new Error(`page ${page.id} analytics dashboard requires exactly four metrics`);
  }
  validateAnalyticsChart(page.id, "trend", analytics.trend, analytics.trend.yMax);
  validateAnalyticsChart(page.id, "grouped bars", analytics.groupedBars, analytics.groupedBars.maxValue);
  if (analytics.trend.yMax % analytics.trend.yStep !== 0) {
    throw new Error(`page ${page.id} analytics trend yMax must be divisible by yStep`);
  }

  const segmentKeys = analytics.donut.segments.map((segment) => segment.key);
  const segmentTones = analytics.donut.segments.map((segment) => segment.tone);
  assertUnique(segmentKeys, `page ${page.id} analytics donut segment key`);
  assertUnique(segmentTones, `page ${page.id} analytics donut segment tone`);
  const segmentTotal = analytics.donut.segments.reduce((sum, segment) => sum + segment.value, 0);
  if (segmentTotal !== analytics.donut.centerValue) {
    throw new Error(`page ${page.id} analytics donut segments must sum to centerValue`);
  }
}

function validateAnalyticsChart(pageId, label, chart, upperBound) {
  const keys = chart.series.map((series) => series.key);
  const tones = chart.series.map((series) => series.tone);
  assertUnique(keys, `page ${pageId} analytics ${label} series key`);
  assertUnique(tones, `page ${pageId} analytics ${label} series tone`);
  assertUnique(chart.rows.map((row) => row.label), `page ${pageId} analytics ${label} row label`);
  const expectedKeys = [...keys].sort();
  const numericCountByKey = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const [index, row] of chart.rows.entries()) {
    const actualKeys = Object.keys(row.values).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`page ${pageId} analytics ${label} row ${index} values must match series keys`);
    }
    for (const key of keys) {
      const value = row.values[key];
      if (value === null) continue;
      if (!Number.isFinite(value) || value < 0 || value > upperBound) {
        throw new Error(`page ${pageId} analytics ${label} row ${index} value ${key} is outside chart bounds`);
      }
      numericCountByKey[key] += 1;
    }
  }
  for (const key of keys) {
    if (numericCountByKey[key] === 0) {
      throw new Error(`page ${pageId} analytics ${label} series ${key} has no numeric value`);
    }
  }
}

function buildDescriptionPagesSource(description, importRoot = "@ai-readable/kit") {
  const pageIdUnion = description.pages.map((page) => JSON.stringify(page.id)).join(" | ");
  const rowDeclarations = buildRowDeclarations(description);
  const functions = description.pages.map((page) => renderDescriptionPage(page)).join("\n\n");
  const registry = description.pages
    .map(
      (page) => `  { id: ${JSON.stringify(page.id)}, route: ${JSON.stringify(page.route)}, title: ${JSON.stringify(page.title)}, pattern: ${JSON.stringify(page.pattern)}, component: ${pageFunction(page)} }`
    )
    .join(",\n");

  return `import type { ReactNode } from "react";
import {
  Button,
  Card,
  DataGrid,
  DataSection,
  DescriptionGrid,
  DetailHeader,
  FilterPanel,
  FormSection,
  Input,
  MetricCard,
  PageHeader,
  PageLayout,
  Pagination,
  Select,
  Textarea
} from ${JSON.stringify(importRoot)};
import "./styles.css";${sampleDataImport(description, "./sample-data")}

export type GeneratedPageId = ${pageIdUnion};

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = ${JSON.stringify(
    { projectId: description.projectId, product: description.product },
    null,
    2
  )} as const;

${rowDeclarations}

${functions}

export const generatedProjectPages: GeneratedProjectPage[] = [
${registry}
];
`;
}

function buildAntdPagesSource(description) {
  const antdComponents = antComponentsForDescription(description);
  const usesOperationalList = description.pages.some((page) => Boolean(page.content.operationalList));
  const usesSimpleListFiltering = description.pages.some((page) => Boolean(page.content.simpleListFiltering));
  const usesAnalytics = description.pages.some((page) => Boolean(page.content.analytics));
  const usesPermissionState = description.pages.some((page) => Boolean(page.content.permissionState));
  const usesDashboardContentFidelity = description.pages.some((page) => Boolean(page.content.contentFidelity));
  const reactImport = usesOperationalList
    ? 'import { useMemo, useState, type Key, type ReactNode } from "react";'
    : usesSimpleListFiltering
      ? 'import { useMemo, useState, type ReactNode } from "react";'
      : usesAnalytics || usesPermissionState
      ? 'import { useState, type ReactNode } from "react";'
      : 'import type { ReactNode } from "react";';
  const iconImport = usesAnalytics && usesPermissionState
    ? 'import { ApartmentOutlined, ArrowLeftOutlined, EnvironmentOutlined, ExportOutlined, GlobalOutlined, InfoCircleOutlined, LockOutlined, ReloadOutlined, SafetyCertificateOutlined, TeamOutlined } from "@ant-design/icons";'
    : usesAnalytics
      ? 'import { ApartmentOutlined, EnvironmentOutlined, ExportOutlined, GlobalOutlined, ReloadOutlined, TeamOutlined } from "@ant-design/icons";'
      : usesPermissionState && usesOperationalList
        ? 'import { ArrowLeftOutlined, InfoCircleOutlined, LockOutlined, ReloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";'
        : usesPermissionState
          ? 'import { ArrowLeftOutlined, InfoCircleOutlined, LockOutlined, SafetyCertificateOutlined } from "@ant-design/icons";'
          : 'import { ReloadOutlined } from "@ant-design/icons";';
  const pageIdUnion = description.pages.map((page) => JSON.stringify(page.id)).join(" | ");
  const rowDeclarations = buildRowDeclarations(description);
  const functions = description.pages.map((page) => renderAntdPage(page)).join("\n\n");
  const nativePageShell = buildAntdNativePageShell(usesOperationalList || usesAnalytics, usesPermissionState, usesDashboardContentFidelity);
  const registry = description.pages
    .map(
      (page) => `  { id: ${JSON.stringify(page.id)}, route: ${JSON.stringify(page.route)}, title: ${JSON.stringify(page.title)}, pattern: ${JSON.stringify(page.pattern)}, component: ${pageFunction(page)} }`
    )
    .join(",\n");

  return `${reactImport}
import type { ThemeConfig } from "antd";
import {
${antdComponents.map((component) => `  ${component}`).join(",\n")}
} from "antd";
${iconImport}
import "antd/dist/reset.css";
import "./styles.css";${sampleDataImport(description, "./sample-data")}

export type GeneratedPageId = ${pageIdUnion};

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = ${JSON.stringify(
    { projectId: description.projectId, product: description.product, outputMode: "library-native", foundation: "antd" },
    null,
    2
  )} as const;

const nativeTheme: ThemeConfig = {
  cssVar: { key: "generated", prefix: "ant" },
  hashed: false
};

${rowDeclarations}

${functions}

export const generatedProjectPages: GeneratedProjectPage[] = [
${registry}
];

${nativePageShell}
`;
}

function buildAntdNativePageShell(usesOperationalList, usesPermissionState = false, usesDashboardContentFidelity = false) {
  if (usesPermissionState) {
    return `function NativePageShell({ title, goal, action, actions, bare = false, children }: { title?: string; goal?: string; action?: string; actions?: ReactNode; bare?: boolean; children: ReactNode }) {
  return (
    <ConfigProvider theme={nativeTheme}>
      <main className={bare ? "generated-page generated-golden-page generated-permission-page" : "generated-page generated-golden-page"}>
        <Space orientation="vertical" size="large" className="generated-stack">
          {bare ? null : (
            <header className="generated-native-header">
              <div>
                <Typography.Title level={2}>{title}</Typography.Title>
                <Typography.Paragraph>{goal}</Typography.Paragraph>
              </div>
              {actions ?? (action ? <Button type="primary">{action}</Button> : null)}
            </header>
          )}
          {children}
        </Space>
      </main>
    </ConfigProvider>
  );
}`;
  }
  if (!usesOperationalList) {
    if (usesDashboardContentFidelity) {
      return `function NativePageShell({ title, goal, action, actions, children }: { title: string; goal: string; action?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <ConfigProvider theme={nativeTheme}>
      <main className="generated-page">
        <Space orientation="vertical" size="large" className="generated-stack">
          <header className="generated-native-header">
            <div>
              <Typography.Title level={2}>{title}</Typography.Title>
              <Typography.Paragraph>{goal}</Typography.Paragraph>
            </div>
            {actions ?? (action ? <Button type="primary">{action}</Button> : null)}
          </header>
          {children}
        </Space>
      </main>
    </ConfigProvider>
  );
}`;
    }
    return `function NativePageShell({ title, goal, action, children }: { title: string; goal: string; action?: string; children: ReactNode }) {
  return (
    <ConfigProvider theme={nativeTheme}>
      <main className="generated-page">
        <Space orientation="vertical" size="large" className="generated-stack">
          <header className="generated-native-header">
            <div>
              <Typography.Title level={2}>{title}</Typography.Title>
              <Typography.Paragraph>{goal}</Typography.Paragraph>
            </div>
            {action ? <Button type="primary">{action}</Button> : null}
          </header>
          {children}
        </Space>
      </main>
    </ConfigProvider>
  );
}`;
  }

  return `function NativePageShell({ title, goal, actions, children }: { title: string; goal: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <ConfigProvider theme={nativeTheme}>
      <main className="generated-page generated-golden-page">
        <Space orientation="vertical" size="large" className="generated-stack">
          <header className="generated-native-header">
            <div>
              <Typography.Title level={2}>{title}</Typography.Title>
              <Typography.Paragraph>{goal}</Typography.Paragraph>
            </div>
            {actions}
          </header>
          {children}
        </Space>
      </main>
    </ConfigProvider>
  );
}`;
}

function renderAntdPage(page) {
  if (page.pattern === "dashboard-page" && page.content.analytics) return renderAntdAnalyticsDashboardPage(page);
  if (page.pattern === "dashboard-page") return renderAntdDashboardPage(page);
  if (page.pattern === "list-page") return renderAntdListPage(page);
  if (page.pattern === "detail-page" && page.content.permissionState) return renderAntdPermissionStatePage(page);
  if (page.pattern === "detail-page") return renderAntdDetailPage(page);
  if (page.pattern === "form-page") return renderAntdFormPage(page);
  throw new Error(`unsupported pattern ${page.pattern}`);
}

function renderAntdDashboardPage(page) {
  const contentFidelity = page.content.contentFidelity;
  const metrics = page.content.metrics
    .map((metric, index) => {
      const title = jsxValue(metric.label);
      const value = jsxValue(metric.value);
      const suffix = metric.unit === undefined ? "" : ` suffix=${jsxValue(metric.unit)}`;
      if (contentFidelity) {
        return `          <Col xs={24} md={8}><Card><Space orientation="vertical" size="small"><Statistic title=${title} value=${value}${suffix} /><Typography.Text type="secondary" data-testid=${jsxValue(`dashboard-metric-delta-${index}`)} data-trend=${jsxValue(metric.trend ?? "flat")}>${escapeJsxText(metric.delta)}</Typography.Text></Space></Card></Col>`;
      }
      return `          <Col xs={24} md={8}><Card><Statistic title=${title} value=${value}${suffix} /></Card></Col>`;
    })
    .join("\n");
  const actions = contentFidelity
    ? `<Space>${page.intent.secondaryActions.map((action) => `<Button>${escapeJsxText(action)}</Button>`).join("")}<Button type="primary">${escapeJsxText(page.intent.primaryAction)}</Button></Space>`
    : null;
  const shellAction = actions
    ? `actions={${actions}}`
    : `action=${jsxValue(page.intent.primaryAction)}`;
  const acceptanceContent = contentFidelity ? "" : renderAntdCriteriaCard(page.intent.successCriteria);

  return `function ${pageFunction(page)}() {
  return (
    <NativePageShell title=${jsxValue(page.title)} goal=${jsxValue(page.intent.goal)} ${shellAction}>
      <Row gutter={[16, 16]}>
${metrics}
      </Row>
      ${acceptanceContent}
    </NativePageShell>
  );
}`;
}

function renderAntdAnalyticsDashboardPage(page) {
  const analytics = page.content.analytics;
  const refresh = analytics.refresh;
  const secondaryAction = page.intent.secondaryActions[0] ?? "导出报表";
  const exportCsv = [
    ["指标", "值"],
    ...page.content.metrics.map((metric) => [metric.label, metric.value])
  ]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const metricCards = page.content.metrics.map((metric) => renderAnalyticsMetric(metric)).join("\n");
  return `function ${pageFunction(page)}() {
  const [exported, setExported] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [timestamp, setTimestamp] = useState(${JSON.stringify(refresh.initialTimestamp)});

  function exportReport() {
    const blob = new Blob(["\\uFEFF", ${JSON.stringify(exportCsv)}], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = ${JSON.stringify(`${page.id}.csv`)};
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setExported(true);
    window.setTimeout(() => setExported(false), 1600);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function refreshAnalytics() {
    if (refreshing) return;
    setExported(false);
    setRefreshing(true);
    window.setTimeout(() => {
      setTimestamp(${JSON.stringify(refresh.completedTimestamp)});
      setRefreshing(false);
    }, ${refresh.durationMs});
  }

  return (
    <NativePageShell
      title=${jsxValue(page.title)}
      goal=${jsxValue(page.intent.goal)}
      actions={
        <Space wrap>
          <Button icon={<ExportOutlined />} data-testid="golden-export-report" onClick={exportReport}>${escapeJsxText(secondaryAction)}</Button>
          <Button
            aria-busy={refreshing}
            data-testid="golden-refresh-report"
            icon={<ReloadOutlined />}
            loading={refreshing}
            onClick={refreshAnalytics}
            type="primary"
          >
            {refreshing ? ${JSON.stringify(refresh.loadingLabel)} : ${JSON.stringify(page.intent.primaryAction)}}
          </Button>
          <Tag className="generated-analytics-status" data-testid="golden-report-status">
            <span className={"generated-analytics-status__dot " + (refreshing ? "generated-analytics-status__dot--processing" : "generated-analytics-status__dot--complete")} aria-hidden="true" />
            <span aria-live="polite">{refreshing ? ${JSON.stringify(`${refresh.loadingLabel}…`)} : exported ? ${JSON.stringify(`已导出 · ${page.id}.csv`)} : ${JSON.stringify(`${refresh.completedPrefix} · `)} + timestamp}</span>
          </Tag>
        </Space>
      }
    >
      <div className="generated-analytics-dashboard">
        <Row className="generated-analytics-metrics" gutter={[16, 16]}>
${metricCards}
        </Row>
        <section className="generated-analytics-grid" aria-label="日志统计图表">
          ${renderAnalyticsTrendCard(analytics.trend)}
          ${renderAnalyticsBarsCard(analytics.groupedBars)}
          ${renderAnalyticsDonutCard(analytics.donut)}
        </section>
        <Alert
          showIcon
          type=${jsxValue(analytics.qualityAlert.type)}
          title=${jsxValue(analytics.qualityAlert.title)}
          description=${jsxValue(analytics.qualityAlert.description)}
        />
      </div>
    </NativePageShell>
  );
}`;
}

function renderAnalyticsMetric(metric) {
  const iconByName = {
    global: "GlobalOutlined",
    cluster: "ApartmentOutlined",
    location: "EnvironmentOutlined",
    team: "TeamOutlined"
  };
  const Icon = iconByName[metric.icon] ?? "GlobalOutlined";
  const suffix = metric.unit === undefined ? "" : ` suffix=${jsxValue(metric.unit)}`;
  return `          <Col xs={12} sm={12} xl={6}>
            <Card className="generated-analytics-metric">
              <span className="generated-analytics-metric__icon" aria-hidden="true"><${Icon} /></span>
              <div className="generated-analytics-metric__body">
                <Statistic title=${jsxValue(metric.label)} value=${jsxValue(metric.value)}${suffix} groupSeparator="," />
                ${metric.hint ? `<span className="generated-analytics-metric__hint">${escapeJsxText(metric.hint)}</span>` : ""}
              </div>
            </Card>
          </Col>`;
}

function renderAnalyticsTrendCard(chart) {
  const width = 620;
  const height = 310;
  const left = 48;
  const right = 604;
  const top = 24;
  const bottom = 266;
  const xFor = (index) => left + (index * (right - left)) / (chart.rows.length - 1);
  const yFor = (value) => bottom - (value / chart.yMax) * (bottom - top);
  const ticks = [];
  for (let value = 0; value <= chart.yMax; value += chart.yStep) ticks.push(value);
  const grid = ticks
    .map((value) => {
      const y = yFor(value).toFixed(2);
      return `<line className="generated-chart-gridline" x1=${jsxValue(left)} x2=${jsxValue(right)} y1=${jsxValue(Number(y))} y2=${jsxValue(Number(y))} /><text className="generated-chart-axis-label" textAnchor="end" x=${jsxValue(left - 8)} y=${jsxValue(Number(y) + 4)}>${formatAnalyticsNumber(value)}</text>`;
    })
    .join("\n                ");
  const xLabels = chart.rows
    .map((row, index) => {
      const anchor = index === 0 ? "start" : index === chart.rows.length - 1 ? "end" : "middle";
      return `<text className="generated-chart-axis-label" textAnchor=${jsxValue(anchor)} x=${jsxValue(Number(xFor(index).toFixed(2)))} y="292">${escapeJsxText(row.label)}</text>`;
    })
    .join("\n                ");
  const seriesMarkup = chart.series
    .map((series) => {
      const segments = analyticsLineSegments(chart.rows, series.key, xFor, yFor)
        .map((path) => `<path className="generated-chart-line generated-series--${series.tone}" d=${jsxValue(path)} />`)
        .join("\n                ");
      const points = chart.rows
        .map((row, index) => {
          const value = row.values[series.key];
          if (value === null) return "";
          const x = Number(xFor(index).toFixed(2));
          const y = Number(yFor(value).toFixed(2));
          const anchor = index === 0 ? "start" : index === chart.rows.length - 1 ? "end" : "middle";
          const pointLabel = index === chart.rows.length - 1 ? `${series.label} ${formatAnalyticsNumber(value)}` : formatAnalyticsNumber(value);
          return `<g className="generated-series--${series.tone}"><circle className="generated-chart-point" cx=${jsxValue(x)} cy=${jsxValue(y)} r="3.5" /><text className="generated-chart-point-label" textAnchor=${jsxValue(anchor)} x=${jsxValue(x)} y=${jsxValue(Math.max(12, y - 9))}>${escapeJsxText(pointLabel)}</text></g>`;
        })
        .filter(Boolean)
        .join("\n                ");
      return `${segments}\n                ${points}`;
    })
    .join("\n                ");
  return `<Card
            className="generated-analytics-card generated-analytics-card--trend"
            title={<span className="generated-chart-heading"><strong>${escapeJsxText(chart.title)}</strong><span>${escapeJsxText(chart.description)}</span></span>}
          >
            ${renderAnalyticsLegend(chart.series)}
            <div className="generated-trend-scroll">
              <svg className="generated-trend-chart" role="img" aria-label=${jsxValue(chart.summary)} viewBox=${jsxValue(`0 0 ${width} ${height}`)}>
                <title>${escapeJsxText(chart.summary)}</title>
                ${grid}
                ${xLabels}
                ${seriesMarkup}
              </svg>
            </div>
            <p className="generated-chart-caption">${escapeJsxText(chart.caption)}</p>
            ${renderAnalyticsHiddenTable(chart.summary, chart.series, chart.rows)}
          </Card>`;
}

function analyticsLineSegments(rows, key, xFor, yFor) {
  const segments = [];
  let current = [];
  for (const [index, row] of rows.entries()) {
    const value = row.values[key];
    if (value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push([xFor(index), yFor(value)]);
  }
  if (current.length > 0) segments.push(current);
  return segments.map((points) => points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" "));
}

function renderAnalyticsBarsCard(chart) {
  const rows = chart.rows
    .map((row) => {
      const series = chart.series
        .map((item, seriesIndex) => {
          const value = row.values[item.key];
          if (value === null) {
            return `<div className="generated-bars__series"><span className="generated-bars__series-index" aria-hidden="true">${seriesIndex + 1}</span><span className="generated-bars__track" /><span className="generated-bars__value">缺失</span></div>`;
          }
          const width = `${Math.max(0.5, (value / chart.maxValue) * 100).toFixed(2)}%`;
          return `<div className="generated-bars__series generated-series--${item.tone}" title=${jsxValue(`${row.label} · ${item.label} · ${formatAnalyticsNumber(value)}`)}><span className="generated-bars__series-index" aria-hidden="true">${seriesIndex + 1}</span><span className="generated-bars__track"><span className="generated-bars__fill" style={{ width: ${JSON.stringify(width)} }} /></span><span className="generated-bars__value">${formatAnalyticsNumber(value)}</span></div>`;
        })
        .join("\n                  ");
      return `<div className="generated-bars__row"><strong className="generated-bars__category">${escapeJsxText(row.label)}</strong><div className="generated-bars__group">${series}</div></div>`;
    })
    .join("\n                ");
  return `<Card
            className="generated-analytics-card"
            title={<span className="generated-chart-heading"><strong>${escapeJsxText(chart.title)}</strong><span>${escapeJsxText(chart.description)}</span></span>}
          >
            ${renderAnalyticsLegend(chart.series, true)}
            <div className="generated-bars" role="img" aria-label=${jsxValue(chart.summary)}>
                ${rows}
            </div>
            ${renderAnalyticsHiddenTable(chart.summary, chart.series, chart.rows)}
          </Card>`;
}

function renderAnalyticsDonutCard(chart) {
  let cursor = 0;
  const toneVariable = (tone) => `var(--generated-series-color-${tone})`;
  const slices = chart.segments.map((segment) => {
    const start = (cursor / chart.centerValue) * 100;
    cursor += segment.value;
    const end = (cursor / chart.centerValue) * 100;
    return `${toneVariable(segment.tone)} ${start.toFixed(3)}% ${end.toFixed(3)}%`;
  });
  cursor = 0;
  const labels = chart.segments
    .map((segment, index) => {
      const start = (cursor / chart.centerValue) * 360;
      cursor += segment.value;
      const end = (cursor / chart.centerValue) * 360;
      const angle = ((start + end) / 2) * (Math.PI / 180);
      const left = 50 + Math.sin(angle) * 37;
      const top = 50 - Math.cos(angle) * 37;
      const percentage = (segment.value / chart.centerValue) * 100;
      return `<span className="generated-donut__label" style={{ left: ${JSON.stringify(`${left.toFixed(2)}%`)}, top: ${JSON.stringify(`${top.toFixed(2)}%`)} }}><strong>${index + 1}</strong><span>${percentage.toFixed(1)}%</span></span>`;
    })
    .join("\n                ");
  const legend = chart.segments
    .map((segment, index) => `<div className="generated-donut-legend__item generated-series--${segment.tone}"><span className="generated-donut-legend__dot" aria-hidden="true" /><span className="generated-donut-legend__index">${index + 1}</span><span>${escapeJsxText(segment.label)}</span><strong>${formatAnalyticsNumber(segment.value)}</strong></div>`)
    .join("\n                ");
  const donutSeries = chart.segments.map((segment) => ({ key: segment.key, label: segment.label, tone: segment.tone }));
  const donutRows = [{ label: chart.centerLabel, values: Object.fromEntries(chart.segments.map((segment) => [segment.key, segment.value])) }];
  return `<Card
            className="generated-analytics-card"
            title={<span className="generated-chart-heading"><strong>${escapeJsxText(chart.title)}</strong><span>${escapeJsxText(chart.description)}</span></span>}
          >
            <div className="generated-donut-layout" role="img" aria-label=${jsxValue(chart.summary)}>
              <div className="generated-donut" style={{ background: ${JSON.stringify(`conic-gradient(${slices.join(", ")})`)} }}>
                ${labels}
                <span className="generated-donut__center"><span>${escapeJsxText(chart.centerLabel)}</span><strong>${formatAnalyticsNumber(chart.centerValue)}</strong></span>
              </div>
              <div className="generated-donut-legend">${legend}</div>
            </div>
            ${renderAnalyticsHiddenTable(chart.summary, donutSeries, donutRows)}
          </Card>`;
}

function renderAnalyticsLegend(series, numbered = false) {
  const items = series
    .map((item, index) => `<span className="generated-chart-legend__item generated-series--${item.tone}"><span className="generated-chart-legend__dot" aria-hidden="true" />${numbered ? `<strong>${index + 1}</strong>` : ""}${escapeJsxText(item.label)}</span>`)
    .join("");
  return `<div className="generated-chart-legend" aria-hidden="true">${items}</div>`;
}

function renderAnalyticsHiddenTable(summary, series, rows) {
  const headings = series.map((item) => `<th scope="col">${escapeJsxText(item.label)}</th>`).join("");
  const body = rows
    .map((row) => `<tr><th scope="row">${escapeJsxText(row.label)}</th>${series.map((item) => `<td>${row.values[item.key] === null ? "缺失" : formatAnalyticsNumber(row.values[item.key])}</td>`).join("")}</tr>`)
    .join("");
  return `<table className="generated-sr-only"><caption>${escapeJsxText(summary)}</caption><thead><tr><th scope="col">分类</th>${headings}</tr></thead><tbody>${body}</tbody></table>`;
}

function formatAnalyticsNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function renderAntdListPage(page) {
  if (page.content.operationalList) return renderAntdOperationalListPage(page);
  if (page.content.simpleListFiltering) return renderAntdSimpleFilteredListPage(page);
  const table = page.content.table;
  const fields = (page.content.filters ?? []).map((filter) => renderAntdFilter(filter)).join("\n");
  const columns = JSON.stringify(table.columns.map((column) => ({ title: column.title, dataIndex: column.key, key: column.key })), null, 2);
  const toolbarLabel = page.intent.secondaryActions[0] ?? "刷新";
  return `function ${pageFunction(page)}() {
  return (
    <NativePageShell title=${jsxValue(page.title)} goal=${jsxValue(page.intent.goal)} action=${jsxValue(page.intent.primaryAction)}>
      <Card>
        <Form layout="inline">
${fields}
          <Form.Item><Button icon={<ReloadOutlined />}>筛选</Button></Form.Item>
        </Form>
      </Card>
      <Card title=${jsxValue(table.title)} extra={<Button>${escapeJsxText(toolbarLabel)}</Button>}>
        <Table rowKey=${jsxValue(table.rowKey)} dataSource={${rowsVariable(page)}} columns={${columns}} pagination={{ pageSize: 20, total: ${rowsVariable(page)}.length }} />
      </Card>
    </NativePageShell>
  );
}`;
}

function renderAntdSimpleFilteredListPage(page) {
  const table = page.content.table;
  const rows = rowsVariable(page);
  const fields = (page.content.filters ?? []).map((filter) => renderAntdFilter(filter)).join("\n");
  const columns = JSON.stringify(table.columns.map((column) => ({ title: column.title, dataIndex: column.key, key: column.key })), null, 2);
  const toolbarLabel = page.intent.secondaryActions[0] ?? "刷新";
  const conditions = page.content.simpleListFiltering.mappings.map((mapping) => renderSimpleListFilterCondition(mapping)).join(" &&\n      ");
  const responsiveTableProps = table.columns.length >= 6
    ? ' className="generated-responsive-table" scroll={{ x: "max-content" }}'
    : "";
  return `function ${pageFunction(page)}() {
  const [filterForm] = Form.useForm();
  const [submittedFilters, setSubmittedFilters] = useState<Record<string, unknown>>({});
  const visibleRows = useMemo(
    () => ${rows}.filter((row) =>
      ${conditions}
    ),
    [submittedFilters]
  );

  const resetFilters = () => {
    filterForm.resetFields();
    setSubmittedFilters({});
  };

  return (
    <NativePageShell title=${jsxValue(page.title)} goal=${jsxValue(page.intent.goal)} action=${jsxValue(page.intent.primaryAction)}>
      <Card>
        <Form form={filterForm} layout="inline" onFinish={(values: Record<string, unknown>) => setSubmittedFilters(values)}>
${fields}
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" data-testid="simple-list-filter-submit">筛选</Button>
              <Button icon={<ReloadOutlined />} onClick={resetFilters} data-testid="simple-list-filter-reset">重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card
        title=${jsxValue(table.title)}
        extra={<Space><Typography.Text data-testid="simple-list-filter-count">共 {visibleRows.length} 条</Typography.Text><Button>${escapeJsxText(toolbarLabel)}</Button></Space>}
      >
        <Table${responsiveTableProps} rowKey=${jsxValue(table.rowKey)} dataSource={visibleRows} columns={${columns}} pagination={{ pageSize: 20, total: visibleRows.length }} />
      </Card>
    </NativePageShell>
  );
}`;
}

function renderSimpleListFilterCondition(mapping) {
  const query = `submittedFilters[${JSON.stringify(mapping.name)}]`;
  const rowValues = `[${mapping.rowKeys.map((key) => `row.${key}`).join(", ")}]`;
  if (mapping.match === "contains") {
    return `(!String(${query} ?? "").trim() || ${rowValues}.some((value) => String(value ?? "").toLocaleLowerCase().includes(String(${query} ?? "").trim().toLocaleLowerCase())))`;
  }
  const expected = `((${JSON.stringify(mapping.valueMap)} as Record<string, string>)[String(${query})] ?? String(${query} ?? ""))`;
  return `(!String(${query} ?? "").trim() || ${rowValues}.some((value) => String(value ?? "").toLocaleLowerCase() === String(${expected}).trim().toLocaleLowerCase()))`;
}

function renderAntdOperationalListPage(page) {
  const operational = page.content.operationalList;
  const table = page.content.table;
  const rows = rowsVariable(page);
  const rowType = `${toPascalCase(page.id)}Row`;
  const switchFilters = (page.content.filters ?? []).filter((filter) => filter.type === "switch");
  const nonSwitchFilters = (page.content.filters ?? []).filter((filter) => filter.type !== "switch");
  const switchDeclarations = switchFilters
    .map((filter) => `  const [${toCamelCase(filter.name)}, set${toPascalCase(filter.name)}] = useState(false);`)
    .join("\n");
  const switchDependencies = switchFilters.map((filter) => toCamelCase(filter.name));
  const filterMarkup = (page.content.filters ?? []).map((filter) => renderAntdOperationalFilter(filter)).join("\n");
  const queryConditions = [
    ...nonSwitchFilters.flatMap((filter) => operationalQueryConditions(filter)),
    ...switchFilters.map((filter) => `(!${toCamelCase(filter.name)} || Boolean(row.${filter.dataKey}))`)
  ];
  const queryExpression = queryConditions.length ? queryConditions.join(" &&\n      ") : "true";
  const resetSwitches = switchFilters.map((filter) => `    set${toPascalCase(filter.name)}(false);`).join("\n");
  const columns = table.columns.map((column) => renderAntdOperationalColumn(column, rowType)).join(",\n");
  const tableMinimumWidth = table.columns.reduce((total, column) => total + (column.width ?? 120), 48);
  const stepItems = JSON.stringify(operational.process.steps.map((title) => ({ title })), null, 2);
  const primaryFields = operational.primaryDrawer.fields.map((field) => renderAntdTaskField(field)).join("\n");
  const detailItems = table.columns
    .filter((column) => column.display !== "actions" && !["conflictValue", "statusValue", "startDate", "endDate"].includes(column.key))
    .slice(0, 8)
    .map((column) => `{ key: ${JSON.stringify(column.key)}, label: ${JSON.stringify(column.title)}, children: String(detailRow?.${column.key} ?? "—") }`)
    .join(",\n              ");
  const defaultTab = operational.defaultTab;
  const tabs = operational.tabs
    .map((tab) => {
      if (tab.key !== defaultTab) {
        return `          {
            key: ${JSON.stringify(tab.key)},
            label: ${JSON.stringify(tab.label)},
            children: <Card className="generated-empty-card"><Empty description=${jsxValue(tab.emptyDescription ?? `${tab.label}将在下一阶段接入`)} /></Card>
          }`;
      }
      return `          {
            key: ${JSON.stringify(tab.key)},
            label: ${JSON.stringify(tab.label)},
            children: (
              <Space orientation="vertical" size="middle" className="generated-tab-stack">
                <Card className="generated-query-card">
                  <Form form={queryForm} layout="vertical" className="generated-query-grid" onFinish={(values: Record<string, unknown>) => setQuery(values)}>
${filterMarkup}
                    <div className="generated-query-actions">
                      <Button htmlType="submit" type="primary" data-testid="golden-query">查询</Button>
                      <Button icon={<ReloadOutlined />} onClick={resetQuery}>重置</Button>
                    </div>
                  </Form>
                </Card>
                <Card
                  className="generated-table-card"
                  title={<div><Typography.Title level={4}>${escapeJsxText(table.title)}</Typography.Title><Typography.Text type="secondary">${escapeJsxText(page.intent.successCriteria[0])}</Typography.Text></div>}
                  extra={<Typography.Text type="secondary">共 {visibleRows.length} 条</Typography.Text>}
                >
                  <Table<${rowType}>
                    rowKey=${jsxValue(table.rowKey)}
                    size="middle"
                    dataSource={visibleRows}
                    columns={columns}
                    rowSelection={{ selectedRowKeys, onChange: (keys: Key[]) => setSelectedRowKeys(keys) }}
                    pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => "共 " + total + " 条" }}
                    scroll={{ x: ${tableMinimumWidth} }}
                  />
                  <div className="generated-bulk-bar" aria-live="polite">
                    <Typography.Text type="secondary">已选择 {selectedRowKeys.length} 条排期</Typography.Text>
                    <Button disabled={selectedRowKeys.length === 0}>导出选中</Button>
                  </div>
                </Card>
              </Space>
            )
          }`;
    })
    .join(",\n");
  const secondaryAction = operational.secondaryDrawer && page.intent.secondaryActions[0]
    ? `<Button onClick={() => setSecondaryOpen(true)} data-testid="golden-secondary-action">${escapeJsxText(page.intent.secondaryActions[0])}</Button>`
    : "";
  const secondaryState = operational.secondaryDrawer ? "  const [secondaryOpen, setSecondaryOpen] = useState(false);\n" : "";
  const secondaryDrawer = operational.secondaryDrawer
    ? `
      <Drawer
        open={secondaryOpen}
        title=${jsxValue(operational.secondaryDrawer.title)}
        size={560}
        destroyOnHidden
        mask={{ closable: false }}
        onClose={() => setSecondaryOpen(false)}
        footer={<Space><Button onClick={() => setSecondaryOpen(false)}>取消</Button><Button type="primary" onClick={() => setSecondaryOpen(false)}>${escapeJsxText(operational.secondaryDrawer.submitLabel)}</Button></Space>}
      >
        <Typography.Paragraph type="secondary">${escapeJsxText(operational.secondaryDrawer.description)}</Typography.Paragraph>
        <Upload.Dragger multiple accept=${jsxValue(operational.secondaryDrawer.accept)} beforeUpload={() => false}>
          <Typography.Text strong>点击或拖拽文件到此区域</Typography.Text>
          <Typography.Paragraph type="secondary">文件只进入当前演示任务，不会自动发布。</Typography.Paragraph>
        </Upload.Dragger>
      </Drawer>`
    : "";

  return `function ${pageFunction(page)}() {
  type ${rowType} = (typeof ${rows})[number];
  type DateRangeValue = readonly [{ format: (value: string) => string }, { format: (value: string) => string }] | undefined;
  const [queryForm] = Form.useForm();
  const [query, setQuery] = useState<Record<string, unknown>>({});
${switchDeclarations ? `${switchDeclarations}\n` : ""}  const [activeTab, setActiveTab] = useState(${JSON.stringify(defaultTab)});
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [primaryOpen, setPrimaryOpen] = useState(false);
${secondaryState}  const [detailRow, setDetailRow] = useState<${rowType} | null>(null);
  const visibleRows = useMemo(
    () => ${rows}.filter((row) =>
      ${queryExpression}
    ),
    [query${switchDependencies.length ? `, ${switchDependencies.join(", ")}` : ""}]
  );
  const columns = [
${columns}
  ];

  function resetQuery() {
    queryForm.resetFields();
    setQuery({});
${resetSwitches}
  }

  return (
    <NativePageShell
      title=${jsxValue(page.title)}
      goal=${jsxValue(page.intent.goal)}
      actions={<Space>${secondaryAction}<Button type="primary" onClick={() => setPrimaryOpen(true)} data-testid="golden-primary-action">${escapeJsxText(page.intent.primaryAction)}</Button></Space>}
    >
      <Alert showIcon type="info" title=${jsxValue(operational.notice)} />
      <Card className="generated-process-card">
        <div className="generated-section-heading">
          <Typography.Title level={4}>${escapeJsxText(operational.process.title)}</Typography.Title>
          <Typography.Text type="secondary">${escapeJsxText(operational.process.description)}</Typography.Text>
        </div>
        <Steps current={${operational.process.current}} responsive items={${stepItems}} />
      </Card>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
${tabs}
        ]} />
      <Drawer
        open={primaryOpen}
        title=${jsxValue(operational.primaryDrawer.title)}
        size={600}
        destroyOnHidden
        mask={{ closable: false }}
        onClose={() => setPrimaryOpen(false)}
        footer={<Space><Button onClick={() => setPrimaryOpen(false)}>取消</Button><Button form="golden-primary-form" htmlType="submit" type="primary">${escapeJsxText(operational.primaryDrawer.submitLabel)}</Button></Space>}
      >
        <Typography.Paragraph type="secondary">${escapeJsxText(operational.primaryDrawer.description)}</Typography.Paragraph>
        <Form id="golden-primary-form" layout="vertical" onFinish={() => setPrimaryOpen(false)}>
${primaryFields}
        </Form>
      </Drawer>${secondaryDrawer}
      <Drawer
        open={Boolean(detailRow)}
        title={detailRow ? ${JSON.stringify(`${table.title} · `)} + String(detailRow.${table.rowKey}) : ${JSON.stringify(table.title)}}
        size={520}
        destroyOnHidden
        onClose={() => setDetailRow(null)}
      >
        <Descriptions bordered column={1} items={[
              ${detailItems}
            ]} />
      </Drawer>
    </NativePageShell>
  );
}`;
}

function operationalQueryConditions(filter) {
  const value = `query[${JSON.stringify(filter.name)}]`;
  if (filter.type === "text") {
    const dataKey = filter.dataKey ?? filter.name;
    return [`(!${value} || String(row.${dataKey} ?? "").toLocaleLowerCase().includes(String(${value}).trim().toLocaleLowerCase()))`];
  }
  if (filter.type === "select") {
    const dataKey = filter.dataKey ?? filter.name;
    return [`(!${value} || String(row.${dataKey} ?? "") === String(${value}))`];
  }
  if (filter.type === "date-range") {
    return [
      `(!(${value} as DateRangeValue)?.[0] || row.${filter.endKey} >= (${value} as DateRangeValue)![0].format("YYYY-MM-DD"))`,
      `(!(${value} as DateRangeValue)?.[1] || row.${filter.startKey} <= (${value} as DateRangeValue)![1].format("YYYY-MM-DD"))`
    ];
  }
  return [];
}

function renderAntdOperationalFilter(filter) {
  const testId = `golden-filter-${filter.name}`;
  if (filter.type === "switch") {
    return `                    <div className="generated-switch-filter"><span>${escapeJsxText(filter.label)}</span><Switch checked={${toCamelCase(filter.name)}} onChange={set${toPascalCase(filter.name)}} data-testid=${jsxValue(testId)} /></div>`;
  }
  if (filter.type === "select") {
    return `                    <Form.Item label=${jsxValue(filter.label)} name=${jsxValue(filter.name)}><Select allowClear placeholder=${jsxValue(filter.placeholder ?? `全部${filter.label}`)} options={${JSON.stringify(filter.options)}} data-testid=${jsxValue(testId)} /></Form.Item>`;
  }
  if (filter.type === "date-range") {
    return `                    <Form.Item className="generated-range-filter" label=${jsxValue(filter.label)} name=${jsxValue(filter.name)}><DatePicker.RangePicker allowClear placeholder={['开始日期', '结束日期']} data-testid=${jsxValue(testId)} /></Form.Item>`;
  }
  return `                    <Form.Item label=${jsxValue(filter.label)} name=${jsxValue(filter.name)}><Input allowClear placeholder=${jsxValue(filter.placeholder ?? `请输入${filter.label}`)} data-testid=${jsxValue(testId)} /></Form.Item>`;
}

function renderAntdOperationalColumn(column, rowType) {
  const width = column.width ? `, width: ${column.width}` : "";
  const ellipsis = column.ellipsis ? ", ellipsis: true" : "";
  const base = `    { title: ${JSON.stringify(column.title)}, dataIndex: ${JSON.stringify(column.key)}, key: ${JSON.stringify(column.key)}${width}${ellipsis}`;
  if (column.display === "tag") {
    return `${base}, render: (value: unknown) => { const label = String(value ?? ""); const color = (${JSON.stringify(column.tagColors)} as Record<string, string>)[label] ?? "default"; return label === "—" ? <Typography.Text type="secondary">—</Typography.Text> : <Tag color={color}>{label}</Tag>; } }`;
  }
  if (column.display === "actions") {
    const actions = column.actions ?? [];
    const first = actions[0]
      ? `<Button type="link" size="small" onClick={() => setDetailRow(row)}>${escapeJsxText(actions[0])}</Button>`
      : "";
    const secondButton = actions[1]
      ? `<Button type="link" size="small" onClick={() => setPrimaryOpen(true)}>${escapeJsxText(actions[1])}</Button>`
      : "";
    const second = secondButton && column.secondaryActionWhenKey
      ? `{Boolean(row.${column.secondaryActionWhenKey}) ? ${secondButton} : null}`
      : secondButton;
    return `${base}, render: (_value: unknown, row: ${rowType}) => <Space size={4}>${first}${second}</Space> }`;
  }
  if (column.secondaryKey) {
    const tone = column.secondaryTone ?? "secondary";
    return `${base}, render: (value: unknown, row: ${rowType}) => <div className="generated-cell-stack"><span>{String(value ?? "")}</span><Typography.Text type=${jsxValue(tone)}>{String(row.${column.secondaryKey} ?? "")}</Typography.Text></div> }`;
  }
  return `${base} }`;
}

function renderAntdTaskField(field) {
  const rules = field.required ? ` rules={[{ required: true, message: ${JSON.stringify(`${field.label}必填`)} }]}` : "";
  if (field.control === "select") {
    return `          <Form.Item label=${jsxValue(field.label)} name=${jsxValue(field.name)}${rules}><Select placeholder=${jsxValue(field.placeholder ?? `请选择${field.label}`)} options={${JSON.stringify(field.options)}} /></Form.Item>`;
  }
  if (field.control === "date-range") {
    return `          <Form.Item label=${jsxValue(field.label)} name=${jsxValue(field.name)}${rules}><DatePicker.RangePicker placeholder={['开始日期', '结束日期']} showTime /></Form.Item>`;
  }
  if (field.control === "radio") {
    return `          <Form.Item label=${jsxValue(field.label)} name=${jsxValue(field.name)}${rules}><Radio.Group options={${JSON.stringify(field.options)}} /></Form.Item>`;
  }
  if (field.control === "textarea") {
    return `          <Form.Item label=${jsxValue(field.label)} name=${jsxValue(field.name)}${rules}><Input.TextArea rows={3} placeholder=${jsxValue(field.placeholder ?? `请输入${field.label}`)} /></Form.Item>`;
  }
  return `          <Form.Item label=${jsxValue(field.label)} name=${jsxValue(field.name)}${rules}><Input placeholder=${jsxValue(field.placeholder ?? `请输入${field.label}`)} /></Form.Item>`;
}

function renderAntdPermissionStatePage(page) {
  const state = page.content.permissionState;
  return `function ${pageFunction(page)}() {
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <NativePageShell bare>
      <Card className="generated-permission-card" data-privacy-mode=${jsxValue(state.privacyMode)}>
        <section className="generated-permission-state" aria-labelledby="generated-permission-title" aria-describedby="generated-permission-description">
          <div className="generated-permission-visual" aria-hidden="true">
            <strong>${state.statusCode}</strong>
            <span className="generated-permission-shield">
              <SafetyCertificateOutlined />
              <LockOutlined className="generated-permission-lock" />
            </span>
          </div>
          <Typography.Title id="generated-permission-title" level={1}>${escapeJsxText(state.title)}</Typography.Title>
          <Typography.Paragraph id="generated-permission-description" className="generated-permission-description">
            ${escapeJsxText(state.description)}
          </Typography.Paragraph>
          <div className="generated-permission-identifier">
            <InfoCircleOutlined aria-hidden="true" />
            <span>${escapeJsxText(state.permissionLabel)}：</span>
            <code>${escapeJsxText(state.permissionIdentifier)}</code>
          </div>
          <Space className="generated-permission-actions" size="middle" wrap>
            <Button
              data-testid="golden-permission-dashboard"
              href=${jsxValue(state.primaryAction.targetRoute)}
              icon={<ArrowLeftOutlined />}
              type="primary"
            >
              ${escapeJsxText(state.primaryAction.label)}
            </Button>
            <Button data-testid="golden-permission-request" onClick={() => setRequestOpen(true)}>
              ${escapeJsxText(state.secondaryAction.label)}
            </Button>
          </Space>
        </section>
      </Card>
      <Drawer
        data-testid="golden-permission-request-panel"
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title=${jsxValue(state.requestPanel.title)}
        size="default"
        footer={
          <div className="generated-permission-panel-actions">
            <Button data-testid="golden-permission-request-close" onClick={() => setRequestOpen(false)}>
              ${escapeJsxText(state.requestPanel.closeLabel)}
            </Button>
          </div>
        }
      >
        <Space orientation="vertical" size="large" className="generated-permission-panel">
          <Typography.Paragraph>${escapeJsxText(state.requestPanel.description)}</Typography.Paragraph>
          <div className="generated-permission-panel__identifier">
            <Typography.Text type="secondary">${escapeJsxText(state.permissionLabel)}</Typography.Text>
            <Typography.Text code copyable>${escapeJsxText(state.permissionIdentifier)}</Typography.Text>
          </div>
          <Alert showIcon type="info" title=${jsxValue(state.requestPanel.safetyNote)} />
        </Space>
      </Drawer>
    </NativePageShell>
  );
}`;
}

function renderAntdDetailPage(page) {
  const items = page.content.details.map((detail) => ({ key: detail.label, label: detail.label, children: detail.value }));
  return `function ${pageFunction(page)}() {
  return (
    <NativePageShell title=${jsxValue(page.title)} goal=${jsxValue(page.intent.goal)} action=${jsxValue(page.intent.primaryAction)}>
      <Card>
        <Descriptions bordered column={2} items={${JSON.stringify(items, null, 2)}} />
      </Card>
      ${renderAntdCriteriaCard(page.intent.successCriteria)}
    </NativePageShell>
  );
}`;
}

function renderAntdFormPage(page) {
  const presentation = page.content.formPresentation;
  const fieldsByName = new Map(page.content.fields.map((field) => [field.name, field]));
  const fields = page.content.fields.map((field) => renderAntdField(field)).join("\n");
  const formContent = presentation
    ? `<Space orientation="vertical" size="large" className="generated-form-stack">
          <Steps current={${presentation.currentStep}} responsive items={[${presentation.steps.map((title) => `{ title: ${JSON.stringify(title)} }`).join(", ")}]} />
${presentation.sections.map((section) => `          <section className="generated-form-section">
            <Typography.Title level={4}>${escapeJsxText(section.title)}</Typography.Title>
${section.fieldNames.map((name) => renderAntdField(fieldsByName.get(name))).join("\n")}
          </section>`).join("\n")}
        </Space>`
    : fields;
  const secondaryActions = presentation
    ? page.intent.secondaryActions.map((action) => `<Button>${escapeJsxText(action)}</Button>`).join("\n              ")
    : page.intent.secondaryActions[0]
      ? `<Button>${escapeJsxText(page.intent.secondaryActions[0])}</Button>`
      : "";
  const actionsSpace = presentation ? '<Space className="generated-form-actions">' : "<Space>";
  return `function ${pageFunction(page)}() {
  return (
    <NativePageShell title=${jsxValue(page.title)} goal=${jsxValue(page.intent.goal)}>
      <Card>
        <Form layout="vertical">
${formContent}
          <Form.Item>
            ${actionsSpace}
              ${secondaryActions}
              <Button type="primary">${escapeJsxText(page.intent.primaryAction)}</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </NativePageShell>
  );
}`;
}

function renderAntdFilter(filter) {
  if (filter.type === "select") {
    return `          <Form.Item label=${jsxValue(filter.label)} name=${jsxValue(filter.name)}><Select placeholder=${jsxValue(filter.placeholder ?? `请选择${filter.label}`)} options={${JSON.stringify(filter.options)}} /></Form.Item>`;
  }
  if (filter.type === "date-range") {
    return `          <Form.Item label=${jsxValue(filter.label)} name=${jsxValue(filter.name)}><DatePicker.RangePicker placeholder={['开始日期', '结束日期']} /></Form.Item>`;
  }
  if (filter.type === "switch") {
    return `          <Form.Item label=${jsxValue(filter.label)} name=${jsxValue(filter.name)} valuePropName="checked"><Switch /></Form.Item>`;
  }
  return `          <Form.Item label=${jsxValue(filter.label)} name=${jsxValue(filter.name)}><Input placeholder=${jsxValue(filter.placeholder ?? `请输入${filter.label}`)} /></Form.Item>`;
}

function renderAntdField(field) {
  const rules = field.required ? ` rules={[{ required: true, message: ${JSON.stringify(`${field.label}必填`)} }]}` : "";
  if (field.control === "select") {
    return `          <Form.Item label=${jsxValue(field.label)} name=${jsxValue(field.name)}${rules}><Select placeholder=${jsxValue(field.placeholder ?? `请选择${field.label}`)} options={${JSON.stringify(field.options)}} /></Form.Item>`;
  }
  if (field.control === "textarea") {
    return `          <Form.Item label=${jsxValue(field.label)} name=${jsxValue(field.name)}${rules}><Input.TextArea placeholder=${jsxValue(field.placeholder ?? `请输入${field.label}`)} /></Form.Item>`;
  }
  if (field.control === "date-range") {
    return `          <Form.Item label=${jsxValue(field.label)} name=${jsxValue(field.name)}${rules}><DatePicker.RangePicker placeholder={['开始日期', '结束日期']} /></Form.Item>`;
  }
  if (field.control === "radio") {
    return `          <Form.Item label=${jsxValue(field.label)} name=${jsxValue(field.name)}${rules}><Radio.Group options={${JSON.stringify(field.options)}} /></Form.Item>`;
  }
  return `          <Form.Item label=${jsxValue(field.label)} name=${jsxValue(field.name)}${rules}><Input placeholder=${jsxValue(field.placeholder ?? `请输入${field.label}`)} /></Form.Item>`;
}

function renderAntdCriteriaCard(criteria) {
  const items = criteria.map((item) => `<li>${escapeJsxText(item)}</li>`).join("");
  return `<Card title="验收标准"><ul className="generated-criteria">${items}</ul></Card>`;
}

function buildVuePackageSource(description, foundation) {
  return `${JSON.stringify(
    {
      private: true,
      type: "module",
      scripts: {
        dev: "vite --host 127.0.0.1",
        build: "vite build"
      },
      dependencies: {
        "@vitejs/plugin-vue": "6.0.8",
        vite: "8.1.5",
        vue: foundation.framework.version,
        "element-plus": foundation.foundation.version,
        "@element-plus/icons-vue": foundation.icons.version
      },
      devDependencies: {}
    },
    null,
    2
  )}
`;
}

function buildVueIndexSource(description) {
  return `<link rel="icon" href="data:," /><div id="app" data-project-id=${JSON.stringify(description.projectId)}></div><script type="module" src="/src/main.ts"></script>\n`;
}

function buildVueMainSource() {
  return `import { createApp } from "vue";
import "element-plus/dist/index.css";
import App from "./App.vue";
import "../styles.css";

createApp(App).mount("#app");
`;
}

function buildVueViteConfigSource() {
  return `import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [vue()] });
`;
}

function buildElementPlusAppSource(description) {
  const page = description.pages[0];
  const table = page.content.table;
  const columns = table?.columns ?? [];
  const rows = table?.rows ?? [];
  const sampleImport = table?.dataEntity ? '\nimport { sampleEntities } from "../sample-data";' : "";
  const rowsSource = table?.dataEntity
    ? `Object.values(sampleEntities.${table.dataEntity}) as unknown as Row[]`
    : `${JSON.stringify(rows, null, 2)} as Row[]`;
  const filters = (page.content.filters ?? []).map((filter) => ({
    name: filter.name,
    label: filter.label,
    type: filter.type === "select" ? "select" : "text",
    ...(filter.placeholder ? { placeholder: filter.placeholder } : {}),
    ...(filter.options ? { options: filter.options } : {})
  }));
  const primaryAction = page.intent.primaryAction;
  const secondaryActions = (page.intent.secondaryActions ?? []).map((label) => ({
    label,
    kind: label.includes("刷新") ? "refresh" : "backend"
  }));
  return `<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  ElButton,
  ElCard,
  ElConfigProvider,
  ElForm,
  ElFormItem,
  ElInput,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn
} from "element-plus";${sampleImport}

type Row = Record<string, string | number | boolean | null>;
type Filter = { name: string; label: string; type: "text" | "select"; placeholder?: string; options?: { label: string; value: string }[] };
type PageAction = { label: string; kind: "refresh" | "backend" };

const pageTitle = ${JSON.stringify(page.title)};
const primaryAction = ${JSON.stringify(primaryAction)};
const secondaryActions: PageAction[] = ${JSON.stringify(secondaryActions, null, 2)};
const filters: Filter[] = ${JSON.stringify(filters, null, 2)};
const columns: { key: string; title: string }[] = ${JSON.stringify(columns.map((column) => ({ key: column.key, title: column.title })), null, 2)};
const rowKey = ${JSON.stringify(table?.rowKey ?? "id")};
const rows: Row[] = ${rowsSource};
const pageSize = ${ELEMENT_PLUS_LIST_PAGE_SIZE};

const draft = reactive<Record<string, string>>(Object.fromEntries(filters.map((filter) => [filter.name, ""])));
const applied = ref<Record<string, string>>({ ...draft });
const currentPage = ref(1);
const feedback = ref("");

function matchesFilter(row: Row, filter: Filter, raw: string) {
  const term = raw.trim().toLocaleLowerCase();
  if (!term) return true;
  const values = columns.map((column) => String(row[column.key] ?? "").toLocaleLowerCase());
  if (filter.type === "select") {
    const label = (filter.options ?? []).find((option) => option.value === raw)?.label ?? raw;
    return values.some((value) => value === term || value === label.toLocaleLowerCase());
  }
  return values.some((value) => value.includes(term));
}

const filteredRows = computed(() =>
  rows.filter((row) => filters.every((filter) => matchesFilter(row, filter, applied.value[filter.name] ?? "")))
);
const pagedRows = computed(() => filteredRows.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize));

function applyQuery() {
  applied.value = { ...draft };
  currentPage.value = 1;
  feedback.value = "";
}

function resetQuery() {
  for (const filter of filters) draft[filter.name] = "";
  applyQuery();
}

function runAction(action: PageAction) {
  if (action.kind === "refresh") {
    currentPage.value = 1;
    feedback.value = \`已刷新，当前共 \${filteredRows.value.length} 条。\`;
    return;
  }
  feedback.value = \`「\${action.label}」需要连接后端服务后才能使用，当前尚未接入。\`;
}

function runPrimaryAction() {
  feedback.value = \`「\${primaryAction}」需要连接后端服务后才能使用，当前尚未接入。\`;
}
</script>

<template>
  <ElConfigProvider>
    <main class="generated-page">
      <header class="generated-native-header">
        <div>
          <h1>{{ pageTitle }}</h1>
          <p>${escapeHtml(page.intent.goal)}</p>
        </div>
        <div class="generated-header-actions">
          <ElButton v-for="action in secondaryActions" :key="action.label" @click="runAction(action)">{{ action.label }}</ElButton>
          <ElButton type="primary" @click="runPrimaryAction">{{ primaryAction }}</ElButton>
        </div>
      </header>
      <ElCard class="generated-block" shadow="never">
        <ElForm class="generated-filter-form" label-position="top" @submit.prevent="applyQuery">
          <ElFormItem v-for="filter in filters" :key="filter.name" :label="filter.label">
            <ElSelect v-if="filter.type === 'select'" v-model="draft[filter.name]" :placeholder="filter.placeholder" clearable>
              <ElOption v-for="option in filter.options" :key="option.value" :label="option.label" :value="option.value" />
            </ElSelect>
            <ElInput v-else v-model="draft[filter.name]" :placeholder="filter.placeholder" />
          </ElFormItem>
          <div class="generated-filter-actions">
            <ElButton @click="resetQuery">重置</ElButton>
            <ElButton type="primary" native-type="submit">查询</ElButton>
          </div>
        </ElForm>
      </ElCard>
      <ElCard class="generated-block" shadow="never">
        <div class="generated-data-toolbar">
          <span class="generated-count">共 {{ filteredRows.length }} 条</span>
          <span class="generated-feedback" role="status" aria-live="polite">{{ feedback }}</span>
        </div>
        <ElTable :data="pagedRows" :row-key="rowKey" aria-label="${escapeHtml(table?.title ?? page.title)}">
          <ElTableColumn v-for="column in columns" :key="column.key" :prop="column.key" :label="column.title" />
          <template #empty>没有找到符合条件的记录，请调整条件后点击「查询」，或点击「重置」清空条件。</template>
        </ElTable>
        <ElPagination
          v-if="filteredRows.length > 0"
          v-model:current-page="currentPage"
          class="generated-pagination"
          layout="prev, pager, next"
          prev-text="上一页"
          next-text="下一页"
          :page-size="pageSize"
          :total="filteredRows.length"
        />
      </ElCard>
    </main>
  </ElConfigProvider>
</template>
`;
}

function elementPlusTokenNames() {
  return [
    "--color-bg-page",
    "--color-bg-surface",
    "--color-brand-primary",
    "--color-brand-primary-strong",
    "--color-brand-soft",
    "--color-text-primary",
    "--color-text-secondary",
    "--color-border",
    "--color-status-success",
    "--color-status-warning",
    "--color-status-danger",
    "--color-status-info",
    "--spacing-xs",
    "--spacing-sm",
    "--spacing-md",
    "--spacing-lg",
    "--spacing-xl",
    "--radius-control",
    "--radius-card",
    "--shadow-card"
  ];
}

function buildElementPlusTokenDeclarations() {
  const stylesFile = resolve(kitRoot, "src/styles.css");
  const css = readFileSync(stylesFile, "utf8");
  const block = css.match(/\.rd-root\s*\{([^}]*)\}/)?.[1];
  if (!block) throw new Error("kit token block `.rd-root` is missing from src/styles.css");
  const tokenNames = elementPlusTokenNames();
  const declared = new Map([...block.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)].map((match) => [match[1], match[2].trim()]));
  const missing = tokenNames.filter((name) => !declared.has(name));
  const fontFamily = block.match(/^\s*font-family\s*:\s*([^;]+);/m)?.[1].trim();
  if (!fontFamily) missing.push("font-family");
  if (missing.length) throw new Error(`kit tokens missing from src/styles.css .rd-root: ${missing.join(", ")}`);
  return [...tokenNames.map((name) => `  ${name}: ${declared.get(name)};`), `  --font-family-base: ${fontFamily};`].join("\n");
}

function buildElementPlusStylesSource() {
  return `:root {
  /* kit tokens (read from src/styles.css) */
${buildElementPlusTokenDeclarations()}

  /* Element Plus theme variables mapped to kit tokens */
  --el-color-primary: var(--color-brand-primary);
  --el-color-primary-dark-2: var(--color-brand-primary-strong);
  --el-color-primary-light-3: color-mix(in srgb, var(--color-brand-primary) 70%, var(--color-bg-surface));
  --el-color-primary-light-5: color-mix(in srgb, var(--color-brand-primary) 50%, var(--color-bg-surface));
  --el-color-primary-light-7: color-mix(in srgb, var(--color-brand-primary) 30%, var(--color-bg-surface));
  --el-color-primary-light-8: color-mix(in srgb, var(--color-brand-primary) 20%, var(--color-bg-surface));
  --el-color-primary-light-9: var(--color-brand-soft);
  --el-color-success: var(--color-status-success);
  --el-color-warning: var(--color-status-warning);
  --el-color-danger: var(--color-status-danger);
  --el-color-info: var(--color-status-info);
  --el-bg-color: var(--color-bg-surface);
  --el-bg-color-page: var(--color-bg-page);
  --el-bg-color-overlay: var(--color-bg-surface);
  --el-text-color-primary: var(--color-text-primary);
  --el-text-color-regular: var(--color-text-primary);
  --el-text-color-secondary: var(--color-text-secondary);
  --el-text-color-placeholder: color-mix(in srgb, var(--color-text-secondary) 65%, var(--color-bg-surface));
  --el-border-color: var(--color-border);
  --el-border-color-light: var(--color-border);
  --el-border-color-lighter: var(--color-border);
  --el-border-color-hover: var(--color-brand-primary);
  --el-fill-color-blank: var(--color-bg-surface);
  --el-fill-color-light: var(--color-bg-page);
  --el-fill-color-lighter: var(--color-bg-page);
  --el-border-radius-base: var(--radius-control);
  --el-border-radius-small: var(--radius-control);
  --el-box-shadow-light: var(--shadow-card);
  --el-font-family: var(--font-family-base);
  --el-component-size: 36px;
  --el-card-border-radius: var(--radius-card);
  --el-card-padding: var(--spacing-lg);
  --el-table-header-bg-color: var(--color-bg-page);
  --el-table-header-text-color: var(--color-text-primary);
  --el-table-text-color: var(--color-text-primary);
  --el-table-border-color: var(--color-border);
  --el-table-row-hover-bg-color: var(--color-bg-page);
}

body {
  background: var(--color-bg-page);
  color: var(--color-text-primary);
  font-family: var(--font-family-base);
  margin: 0;
}

.generated-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin: 0 auto;
  max-width: 1600px;
  min-height: 100vh;
  padding: var(--spacing-xl);
}

.generated-native-header {
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-lg);
  justify-content: space-between;
}

.generated-native-header h1 {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.3;
  margin: 0;
}

.generated-native-header p {
  color: var(--color-text-secondary);
  margin: 6px 0 0;
}

.generated-header-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.generated-header-actions .el-button,
.generated-filter-actions .el-button {
  margin: 0;
}

.generated-block {
  --el-card-border-radius: var(--radius-card);
  --el-card-padding: var(--spacing-lg);
}

.generated-block .el-table {
  --el-table-header-bg-color: var(--color-bg-page);
  --el-table-header-text-color: var(--color-text-primary);
  --el-table-text-color: var(--color-text-primary);
  --el-table-border-color: var(--color-border);
  --el-table-row-hover-bg-color: var(--color-bg-page);
}

.generated-page .el-button {
  height: var(--el-component-size);
}

.generated-filter-form {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md) var(--spacing-lg);
}

.generated-filter-form .el-form-item {
  flex: 1 1 220px;
  margin: 0;
  max-width: 320px;
}

.generated-filter-actions {
  display: flex;
  flex: none;
  gap: var(--spacing-sm);
  margin-left: auto;
}

.generated-data-toolbar {
  align-items: center;
  display: flex;
  gap: var(--spacing-md);
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
  min-height: 24px;
}

.generated-count {
  font-weight: 600;
}

.generated-feedback {
  color: var(--color-text-secondary);
}

.generated-pagination {
  justify-content: flex-end;
  margin-top: var(--spacing-md);
}

@media (max-width: 920px) {
  .generated-page {
    padding: var(--spacing-md);
  }

  .generated-filter-form .el-form-item {
    max-width: none;
  }
}
`;
}

function buildCustomNativeComponentsSource() {
  return `import type { ReactNode } from "react";

type BaseProps = { children?: ReactNode; className?: string };
type Option = { label: string; value: string };

export function ProjectThemeProvider({ children }: BaseProps) {
  return <div className="project-theme">{children}</div>;
}

export function PageLayout({ children, className }: BaseProps & { density?: "compact" }) {
  return <main className={className}>{children}</main>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="generated-native-header"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions}</header>;
}

export function Button({ children }: BaseProps & { variant?: string }) {
  return <button type="button">{children}</button>;
}

export function Badge({ children }: BaseProps & { variant?: string }) {
  return <span>{children}</span>;
}

export function Card({ title, children }: BaseProps & { title?: string; extra?: ReactNode }) {
  return <section className="generated-card">{title ? <h2>{title}</h2> : null}{children}</section>;
}

export function MetricCard({ label, value, unit }: { label: string; value: string | number; unit?: string; delta?: string; trend?: "up" | "down" | "flat" }) {
  return <article className="generated-card"><span>{label}</span><strong>{value}{unit ?? ""}</strong></article>;
}

export function FilterPanel({ fields }: { fields: { name: string; label: string; placeholder?: string }[] }) {
  return <form className="generated-actions">{fields.map((field) => <label key={field.name}>{field.label}<input placeholder={field.placeholder} /></label>)}</form>;
}

export function DataSection({ title, children, toolbar }: BaseProps & { title: string; description?: string; toolbar?: ReactNode }) {
  return <section className="generated-card"><header><h2>{title}</h2>{toolbar}</header>{children}</section>;
}

export function DataGrid({ dataSource, rowKey, columns }: { dataSource: Record<string, unknown>[]; rowKey: string; columns: { key: string; title: string }[]; rowSelection?: boolean; pagination?: ReactNode }) {
  return <table><thead><tr>{columns.map((column) => <th key={column.key}>{column.title}</th>)}</tr></thead><tbody>{dataSource.map((row) => <tr key={String(row[rowKey])}>{columns.map((column) => <td key={column.key}>{String(row[column.key] ?? "")}</td>)}</tr>)}</tbody></table>;
}

export function Pagination() {
  return null;
}

export function Table(props: { dataSource: Record<string, unknown>[]; rowKey: string; columns: { key: string; title: string }[] }) {
  return <DataGrid {...props} />;
}

export function Tabs({ items }: { items: { key: string; label: string; content: ReactNode }[] }) {
  return <section>{items.map((item) => <article key={item.key}><h2>{item.label}</h2>{item.content}</article>)}</section>;
}

export function Stepper({ items }: { currentKey?: string; items: { key: string; title: string; description?: string }[] }) {
  return <ol>{items.map((item) => <li key={item.key}><strong>{item.title}</strong>{item.description ? <span>{item.description}</span> : null}</li>)}</ol>;
}

export function DetailHeader({ title, subtitle, actions }: { title: string; subtitle?: string; avatar?: string; status?: ReactNode; actions?: ReactNode }) {
  return <PageHeader title={title} description={subtitle} actions={actions} />;
}

export function DescriptionGrid({ items }: { items: { label: string; value?: string }[] }) {
  return <dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

export function FormSection({ title, description, children }: BaseProps & { title: string; description?: string }) {
  return <section className="generated-card"><h2>{title}</h2>{description ? <p>{description}</p> : null}{children}</section>;
}

export function Input({ label, placeholder }: { label: string; placeholder?: string; defaultValue?: string }) {
  return <label>{label}<input placeholder={placeholder} /></label>;
}

export function Select({ label, placeholder, options }: { label: string; placeholder?: string; options: Option[] }) {
  return <label>{label}<select aria-label={placeholder}>{options.map((option) => <option key={option.value}>{option.label}</option>)}</select></label>;
}

export function Textarea({ label, placeholder }: { label: string; placeholder?: string; rows?: number }) {
  return <label>{label}<textarea placeholder={placeholder} /></label>;
}
`;
}

function renderDescriptionPage(page) {
  if (page.pattern === "dashboard-page") return renderDashboardPage(page);
  if (page.pattern === "list-page") return renderListPage(page);
  if (page.pattern === "detail-page") return renderDetailPage(page);
  if (page.pattern === "form-page") return renderFormPage(page);
  throw new Error(`unsupported pattern ${page.pattern}`);
}

function renderDashboardPage(page) {
  const metrics = page.content.metrics
    .map((metric) => {
      const optional = [
        metric.unit === undefined ? "" : ` unit=${jsxValue(metric.unit)}`,
        metric.delta === undefined ? "" : ` delta=${jsxValue(metric.delta)}`,
        metric.trend === undefined ? "" : ` trend=${jsxValue(metric.trend)}`
      ].join("");
      return `        <MetricCard label=${jsxValue(metric.label)} value=${jsxValue(metric.value)}${optional} />`;
    })
    .join("\n");

  return `function ${pageFunction(page)}() {
  return (
    <PageLayout className="generated-page">
      <PageHeader title=${jsxValue(page.title)} description=${jsxValue(page.intent.goal)} actions={<Button>${escapeJsxText(page.intent.primaryAction)}</Button>} />
      <div className="generated-metric-grid">
${metrics}
      </div>
      ${renderCriteriaCard(page.intent.successCriteria)}
    </PageLayout>
  );
}`;
}

function renderListPage(page) {
  const table = page.content.table;
  const fields = JSON.stringify(page.content.filters ?? [], null, 2);
  const columns = JSON.stringify(table.columns, null, 2);
  const toolbarLabel = page.intent.secondaryActions[0] ?? "刷新";
  return `function ${pageFunction(page)}() {
  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader title=${jsxValue(page.title)} description=${jsxValue(page.intent.goal)} actions={<Button>${escapeJsxText(page.intent.primaryAction)}</Button>} />
      <FilterPanel fields={${fields}} />
      <DataSection title=${jsxValue(table.title)} toolbar={<Button variant="outline">${escapeJsxText(toolbarLabel)}</Button>}>
        <DataGrid
          rowKey=${jsxValue(table.rowKey)}
          dataSource={${rowsVariable(page)}}
          columns={${columns}}
          pagination={<Pagination pageSize={20} total={${rowsVariable(page)}.length} />}
        />
      </DataSection>
    </PageLayout>
  );
}`;
}

function renderDetailPage(page) {
  return `function ${pageFunction(page)}() {
  return (
    <PageLayout className="generated-page">
      <DetailHeader title=${jsxValue(page.title)} subtitle=${jsxValue(page.intent.goal)} actions={<Button>${escapeJsxText(page.intent.primaryAction)}</Button>} />
      <DescriptionGrid items={${JSON.stringify(page.content.details, null, 2)}} />
      ${renderCriteriaCard(page.intent.successCriteria)}
    </PageLayout>
  );
}`;
}

function renderFormPage(page) {
  const fields = page.content.fields.map((field) => renderField(field)).join("\n");
  const secondary = page.intent.secondaryActions[0];
  return `function ${pageFunction(page)}() {
  return (
    <PageLayout className="generated-page">
      <PageHeader title=${jsxValue(page.title)} description=${jsxValue(page.intent.goal)} />
      <FormSection title="基础信息" description="按当前任务填写并复核字段。">
${fields}
      </FormSection>
      <div className="generated-actions">
        ${secondary ? `<Button variant="outline">${escapeJsxText(secondary)}</Button>` : ""}
        <Button>${escapeJsxText(page.intent.primaryAction)}</Button>
      </div>
    </PageLayout>
  );
}`;
}

function renderField(field) {
  const label = `${field.label}${field.required ? "（必填）" : ""}`;
  const placeholder = field.placeholder ?? `请输入${field.label}`;
  if (field.control === "select") {
    return `        <Select label=${jsxValue(label)} placeholder=${jsxValue(field.placeholder ?? `请选择${field.label}`)} options={${JSON.stringify(field.options)}} />`;
  }
  if (field.control === "textarea") {
    return `        <Textarea label=${jsxValue(label)} placeholder=${jsxValue(placeholder)} />`;
  }
  return `        <Input label=${jsxValue(label)} placeholder=${jsxValue(placeholder)} />`;
}

function renderCriteriaCard(criteria) {
  const items = criteria.map((item) => `<li>${escapeJsxText(item)}</li>`).join("");
  return `<Card title="验收标准"><ul className="generated-criteria">${items}</ul></Card>`;
}

function buildSampleDataSource(samplePack) {
  return `export const samplePackSha256 = ${JSON.stringify(samplePack.sha256)} as const;
export const sampleProjectId = ${JSON.stringify(samplePack.projectId)} as const;
export const sampleDataLabel = ${JSON.stringify(samplePack.label)} as const;

export const sampleEntities = ${JSON.stringify(samplePack.entities, null, 2)} as const;
`;
}

function descriptionUsesSampleData(description) {
  return description.pages.some((page) => Boolean(page.content.table?.dataEntity));
}

function buildRowDeclarations(description) {
  return description.pages
    .filter((page) => page.content.table)
    .map((page) => {
      const table = page.content.table;
      const source = table.dataEntity
        ? `Object.values(sampleEntities.${table.dataEntity})`
        : JSON.stringify(table.rows, null, 2);
      return `const ${rowsVariable(page)} = ${source};`;
    })
    .join("\n\n");
}

function sampleDataImport(description, importPath) {
  return descriptionUsesSampleData(description)
    ? `\nimport { sampleEntities } from ${JSON.stringify(importPath)};`
    : "";
}

function pageFunction(page) {
  return `${toPascalCase(page.id)}Page`;
}

function rowsVariable(page) {
  return `${toCamelCase(page.id)}Rows`;
}

function toPascalCase(value) {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

function toCamelCase(value) {
  const pascal = toPascalCase(value);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

function jsxValue(value) {
  return `{${JSON.stringify(value)}}`;
}

function escapeJsxText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("{", "&#123;").replaceAll("}", "&#125;");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} values must be unique`);
}

function resolveInsideProject(file, label) {
  if (!file || typeof file !== "string") throw new Error(`--${label} requires a path`);
  const target = isAbsolute(file) ? resolve(file) : resolve(root, file);
  const rel = relative(root, target);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../")) {
    throw new Error(`--${label} escapes the project root`);
  }
  return target;
}

function readJsonAbsolute(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${relative(kitRoot, file)} is not valid JSON: ${error.message}`);
  }
}

function parseGeneratorArgs(values) {
  const result = { legacySample: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--description") result.description = values[++index];
    else if (value === "--context") result.context = values[++index];
    else if (value === "--out") result.out = values[++index];
    else if (value === "--legacy-sample") result.legacySample = true;
    else throw new Error(`unknown argument ${value}`);
  }
  if (result.description && !result.out) throw new Error("--description requires --out");
  if (result.out && !result.description) throw new Error("--out requires --description");
  if (result.description && !result.context) throw new Error("--description requires --context");
  if (result.context && !result.description) throw new Error("--context requires --description");
  if (result.description && result.legacySample) throw new Error("--description cannot be combined with --legacy-sample");
  return result;
}
