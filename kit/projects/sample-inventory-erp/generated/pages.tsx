import type { ReactNode } from "react";
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

export type GeneratedPageId = "dashboard" | "inventory-list" | "sku-detail" | "purchase-order-form" | "permissions";

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

const pagePlans = [
  {
    "id": "dashboard",
    "route": "/dashboard",
    "title": "运营工作台",
    "pattern": "dashboard-page",
    "flowIds": [
      "daily-operations-review",
      "purchase-order-creation",
      "permission-review"
    ],
    "flowCard": {
      "entry": "SideNav > 工作台",
      "previousPages": [],
      "nextPages": [
        "/inventory",
        "/inventory/:skuId",
        "/settings/permissions"
      ],
      "userGoal": "掌握运营健康度并选定下一步动作。",
      "businessState": "每日运营例会前的巡检。"
    },
    "intentCard": {
      "pageGoal": "一屏扫清库存、采购、财务与权限风险。",
      "firstViewport": [
        "KPI 摘要",
        "临期风险",
        "待审批",
        "结算差异"
      ],
      "primaryAction": "查看风险库存",
      "secondaryActions": [
        "刷新指标",
        "打开权限复核",
        "新建采购单"
      ],
      "successCriteria": [
        "风险首屏可见、不滚动",
        "每张卡片有明确下一步",
        "指标统一时间窗口"
      ]
    },
    "componentPlan": [
      "PageLayout",
      "PageHeader",
      "MetricCard",
      "Card",
      "DataSection",
      "Badge",
      "Button"
    ],
    "dataRequirements": [
      "InventoryBalance",
      "ApprovalTask",
      "PurchaseOrder",
      "Role"
    ],
    "layoutTree": [
      "PageLayout",
      "PageHeader",
      "MetricCard grid",
      "Card grid",
      "DataSection"
    ]
  },
  {
    "id": "inventory-list",
    "route": "/inventory",
    "title": "库存列表",
    "pattern": "list-page",
    "flowIds": [
      "daily-operations-review",
      "purchase-order-creation"
    ],
    "flowCard": {
      "entry": "SideNav > 库存，或工作台风险卡下钻",
      "previousPages": [
        "/dashboard"
      ],
      "nextPages": [
        "/inventory/:skuId",
        "/purchase-orders/new"
      ],
      "userGoal": "按仓库/SKU/状态/临期风险定位库存问题。",
      "businessState": "仓库与采购联合review。"
    },
    "intentCard": {
      "pageGoal": "筛选库存记录，识别需要处理的行。",
      "firstViewport": [
        "页面标题",
        "仓库筛选",
        "状态筛选",
        "数据表格"
      ],
      "primaryAction": "新建采购单",
      "secondaryActions": [
        "导出",
        "打开 SKU 详情",
        "重置筛选"
      ],
      "successCriteria": [
        "FilterPanel 出现在 DataSection 之前",
        "DataGrid 位于 DataSection 内",
        "状态使用 Badge 语义色"
      ]
    },
    "componentPlan": [
      "PageLayout",
      "PageHeader",
      "FilterPanel",
      "DataSection",
      "DataGrid",
      "Pagination",
      "Badge",
      "Button",
      "Select",
      "Input"
    ],
    "dataRequirements": [
      "SKU",
      "Warehouse",
      "InventoryBalance"
    ],
    "layoutTree": [
      "PageLayout",
      "PageHeader",
      "FilterPanel",
      "DataSection > DataGrid + Pagination"
    ]
  },
  {
    "id": "sku-detail",
    "route": "/inventory/:skuId",
    "title": "SKU 详情",
    "pattern": "detail-page",
    "flowIds": [
      "daily-operations-review"
    ],
    "flowCard": {
      "entry": "库存列表行，或工作台风险卡下钻",
      "previousPages": [
        "/dashboard",
        "/inventory"
      ],
      "nextPages": [
        "/purchase-orders/new"
      ],
      "userGoal": "看清单个 SKU 的库存、批次与流水风险。",
      "businessState": "实体级风险处置。"
    },
    "intentCard": {
      "pageGoal": "展示 SKU 身份、稳定属性与活动历史。",
      "firstViewport": [
        "DetailHeader",
        "DescriptionGrid",
        "Tabs"
      ],
      "primaryAction": "新建采购单",
      "secondaryActions": [
        "查看日志",
        "导出流水"
      ],
      "successCriteria": [
        "DetailHeader 携带状态",
        "键值信息用 DescriptionGrid",
        "Tabs 分隔动态与设置"
      ]
    },
    "componentPlan": [
      "PageLayout",
      "DetailHeader",
      "DescriptionGrid",
      "Tabs",
      "Table",
      "Badge",
      "Button",
      "Card"
    ],
    "dataRequirements": [
      "SKU",
      "InventoryBalance",
      "PurchaseOrder"
    ],
    "layoutTree": [
      "PageLayout",
      "DetailHeader",
      "DescriptionGrid",
      "Tabs > Table"
    ]
  },
  {
    "id": "purchase-order-form",
    "route": "/purchase-orders/new",
    "title": "新建采购单",
    "pattern": "form-page",
    "flowIds": [
      "purchase-order-creation"
    ],
    "flowCard": {
      "entry": "库存列表操作，或采购导航",
      "previousPages": [
        "/inventory"
      ],
      "nextPages": [
        "/dashboard"
      ],
      "userGoal": "从低库存需求创建采购单。",
      "businessState": "采购补货流程。"
    },
    "intentCard": {
      "pageGoal": "录入供应商、订单行、交付与复核备注。",
      "firstViewport": [
        "PageHeader",
        "Stepper",
        "供应商 FormSection",
        "订单行 FormSection"
      ],
      "primaryAction": "提交采购单",
      "secondaryActions": [
        "存草稿",
        "取消"
      ],
      "successCriteria": [
        "字段按业务语义分组",
        "主操作只出现一次",
        "长文本用 Textarea"
      ]
    },
    "componentPlan": [
      "PageLayout",
      "PageHeader",
      "Stepper",
      "FormSection",
      "Input",
      "Select",
      "Textarea",
      "Button"
    ],
    "dataRequirements": [
      "Supplier",
      "SKU",
      "PurchaseOrder"
    ],
    "layoutTree": [
      "PageLayout",
      "PageHeader",
      "Stepper",
      "FormSection",
      "Actions"
    ]
  },
  {
    "id": "permissions",
    "route": "/settings/permissions",
    "title": "权限管理",
    "pattern": "list-page",
    "flowIds": [
      "permission-review"
    ],
    "flowCard": {
      "entry": "SideNav > 系统 > 权限管理",
      "previousPages": [
        "/dashboard"
      ],
      "nextPages": [
        "/dashboard"
      ],
      "userGoal": "复核访问风险与角色分配。",
      "businessState": "月度权限复核。"
    },
    "intentCard": {
      "pageGoal": "筛选角色并在表格中检视权限状态。",
      "firstViewport": [
        "PageHeader",
        "FilterPanel",
        "DataSection",
        "DataGrid",
        "Pagination"
      ],
      "primaryAction": "新建角色",
      "secondaryActions": [
        "导出审计日志",
        "打开角色详情"
      ],
      "successCriteria": [
        "角色可筛选",
        "风险状态使用 Badge",
        "可从选中行发起批量复核"
      ]
    },
    "componentPlan": [
      "PageLayout",
      "PageHeader",
      "FilterPanel",
      "DataSection",
      "DataGrid",
      "Pagination",
      "Badge",
      "Button"
    ],
    "dataRequirements": [
      "Role"
    ],
    "layoutTree": [
      "PageLayout",
      "PageHeader",
      "FilterPanel",
      "DataSection > DataGrid + Pagination"
    ]
  }
] as GeneratedPagePlan[];

const pageById = Object.fromEntries(pagePlans.map((page) => [page.id, page])) as Record<GeneratedPageId, GeneratedPagePlan>;

const generatedComponents = {
  "dashboard": () => <GeneratedPage page={pageById["dashboard"]} />,
  "inventory-list": () => <GeneratedPage page={pageById["inventory-list"]} />,
  "sku-detail": () => <GeneratedPage page={pageById["sku-detail"]} />,
  "purchase-order-form": () => <GeneratedPage page={pageById["purchase-order-form"]} />,
  "permissions": () => <GeneratedPage page={pageById["permissions"]} />
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
