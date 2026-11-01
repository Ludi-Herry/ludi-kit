import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Card, DatePicker, Dropdown, Form, Input, Modal, Pagination, Select, Steps, Table, Tabs } from "antd";
import { AuditOutlined, ClockCircleOutlined, FallOutlined, InboxOutlined, MoreOutlined, RightOutlined, RiseOutlined, SafetyCertificateOutlined, ThunderboltOutlined, UserOutlined, WarningOutlined } from "@ant-design/icons";
import type { TianshuBadgeProps } from "../native-ui";
import {
  TianshuBadge as Badge,
  TianshuBulkActionBar as BulkActionBar,
  TianshuDataSection as DataSection,
  TianshuFilterPanel as FilterPanel,
  TianshuForbiddenState as ForbiddenState,
  TianshuFormSection as FormSection,
  TianshuMetricCard as MetricCard,
  TianshuPageHeader as PageHeader,
  TianshuPageLayout as PageLayout
} from "../native-ui";
import {
  emitTianshuNotice,
  navigateTianshu
} from "../demo-actions";
import {
  TianshuAdCampaignsPage as TianshuAdCampaignsPageView,
  TianshuAdReconciliationPage as TianshuAdReconciliationPageView,
  TianshuContentSchedulePage as TianshuContentSchedulePageView,
  TianshuRmaPage as TianshuRmaPageView
} from "./deferred-pages";
import {
  mapTableColumns,
  rowSelectionConfig,
  stepIndex,
  toTabsItems
} from "./ant-data";
import { TianshuFirmwarePage as TianshuFirmwarePageView } from "./firmware-page";
import { ContentVersionPage as ContentVersionPageView } from "./content-version/pages";
import "./styles.css";

export type GeneratedPageId =
  | "dashboard"
  | "production-inbound"
  | "production-flashing"
  | "production-firmware"
  | "production-sn-cert"
  | "platform-rbac"
  | "platform-rbac-forbidden"
  | "production-testing"
  | "production-qc"
  | "production-inventory"
  | "production-shipping"
  | "platform-audit"
  | "production-rma"
  | "ad-campaigns"
  | "ad-reconciliation"
  | "content-schedule"
  | "content-version";

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
    "title": "工作台 · 个人首页",
    "pattern": "dashboard-page",
    "flowIds": [
      "daily-ops-review",
      "production-forward-chain",
      "rbac-setup"
    ],
    "flowCard": {
      "entry": "SideNav > 工作台",
      "previousPages": [],
      "nextPages": [
        "/production/inbound",
        "/production/flashing",
        "/production/sn-cert",
        "/platform/rbac"
      ],
      "userGoal": "一屏看清各域待办与告警，选定下一步动作。",
      "businessState": "汇总生产履约与平台待办，支持从异常信号直接下钻处理。"
    },
    "intentCard": {
      "pageGoal": "聚合生产/平台域待办卡片与告警角标，指引下钻。",
      "firstViewport": [
        "生产 KPI 摘要",
        "待办卡片（烧录失败/SN 冲突/待质检）",
        "告警卡片",
        "快捷入口"
      ],
      "primaryAction": "处理最高优先级待办",
      "secondaryActions": [
        "刷新指标",
        "进入收货入库",
        "进入权限配置"
      ],
      "successCriteria": [
        "待办与告警首屏可见、不滚动。",
        "每张卡片有明确下一步动作和目标页面。",
        "卡片角标语义色符合项目 status-copy 映射。"
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
      "PendingTask",
      "Alert",
      "ProductionBatch",
      "Role"
    ],
    "layoutTree": [
      "PageLayout",
      "PageHeader",
      "MetricCard grid",
      "Card grid (待办/告警)",
      "DataSection (快捷入口)"
    ]
  },
  {
    "id": "production-inbound",
    "route": "/production/inbound",
    "title": "生产 · 收货入库",
    "pattern": "list-page",
    "flowIds": [
      "production-forward-chain"
    ],
    "flowCard": {
      "entry": "SideNav > 生产履约域 > 收货入库",
      "previousPages": [
        "/dashboard"
      ],
      "nextPages": [
        "/production/flashing"
      ],
      "userGoal": "登记到货批次并推进验收入场。",
      "businessState": "生产正向主链第一环，批次入场后才能烧录。"
    },
    "intentCard": {
      "pageGoal": "按批次/供应商/状态筛选到货记录，发现待验收与异常批次。",
      "firstViewport": [
        "页面标题与新建入口",
        "筛选区（批次/供应商/状态/到货时间）",
        "批次表格"
      ],
      "primaryAction": "新建收货登记",
      "secondaryActions": [
        "导出当前筛选结果",
        "重置筛选"
      ],
      "successCriteria": [
        "FilterPanel 出现在 DataSection 之前。",
        "DataGrid 位于 DataSection 内并带分页。",
        "批次状态列使用语义 Badge，文案来自项目 status-copy。"
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
      "InboundBatch",
      "Supplier"
    ],
    "layoutTree": [
      "PageLayout",
      "PageHeader",
      "FilterPanel",
      "DataSection > DataGrid + Pagination"
    ]
  },
  {
    "id": "production-flashing",
    "route": "/production/flashing",
    "title": "生产 · 烧录发证 · 新建烧录任务",
    "pattern": "form-page",
    "flowIds": [
      "production-forward-chain"
    ],
    "flowCard": {
      "entry": "收货入库完成后进入，或 SideNav > 生产履约域 > 烧录发证",
      "previousPages": [
        "/production/inbound"
      ],
      "nextPages": [
        "/production/sn-cert"
      ],
      "userGoal": "为已入场批次创建烧录任务并绑定固件版本。",
      "businessState": "烧录任务承接已入场批次，并绑定受控固件与设备证书。"
    },
    "intentCard": {
      "pageGoal": "分组录入烧录任务：批次选择、固件版本与证书模板绑定、数量确认。",
      "firstViewport": [
        "步骤条（选批次/绑固件/确认）",
        "批次与固件分组表单",
        "提交操作区"
      ],
      "primaryAction": "创建烧录任务",
      "secondaryActions": [
        "存草稿",
        "取消返回"
      ],
      "successCriteria": [
        "表单按业务语义用 FormSection 分组，不塞进单个卡片。",
        "固件版本为必选项，未选时给出明确校验提示。",
        "烧录失败重试/超限报废路径在页面内有说明入口（界面后置、文案先行）。"
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
      "Button",
      "Badge"
    ],
    "dataRequirements": [
      "ProductionBatch",
      "FirmwareVersion",
      "CertTemplate"
    ],
    "layoutTree": [
      "PageLayout",
      "PageHeader",
      "Stepper",
      "FormSection × 3",
      "操作区"
    ]
  },
  {
    "id": "production-firmware",
    "route": "/production/firmware",
    "title": "生产 · 固件版本",
    "pattern": "list-page",
    "flowIds": [
      "production-forward-chain"
    ],
    "flowCard": {
      "entry": "SideNav > 生产履约域 > 固件版本，或新建烧录任务前置选择",
      "previousPages": [
        "/production/inbound",
        "/production/flashing"
      ],
      "nextPages": [
        "/production/flashing",
        "/production/sn-cert"
      ],
      "userGoal": "维护可用于烧录任务的固件版本、签名状态与灰度发布状态。",
      "businessState": "烧录任务只能绑定已签名、已发布且适配目标机型的固件版本。"
    },
    "intentCard": {
      "pageGoal": "按版本号、机型、版本状态和签名状态筛选固件，完成新建草稿、灰度、回滚与停用确认。",
      "firstViewport": [
        "页面标题与新建入口",
        "筛选区（版本号/机型/版本状态/签名状态）",
        "固件版本表格（版本状态与签名状态分列）",
        "分页"
      ],
      "primaryAction": "新建固件版本",
      "secondaryActions": [
        "刷新",
        "导出版本列表",
        "回滚或停用版本"
      ],
      "successCriteria": [
        "版本生命周期与签名状态分列展示，避免混用一个状态字段。",
        "灰度比例只在灰度中版本显示进度，其他状态显示横线。",
        "回滚与停用经过 ConfirmDialog，取消后焦点可回到触发区域。",
        "新建固件版本使用 Drawer，取消后不修改列表。"
      ]
    },
    "componentPlan": [
      "PageLayout",
      "PageHeader",
      "FilterPanel",
      "DataSection",
      "DataGrid",
      "Pagination",
      "Drawer",
      "FormSection",
      "ConfirmDialog",
      "Badge",
      "Button",
      "Input",
      "Select",
      "Textarea"
    ],
    "dataRequirements": [
      "FirmwareVersion",
      "FirmwareSignature",
      "FirmwareRelease"
    ],
    "layoutTree": [
      "PageLayout",
      "PageHeader",
      "FilterPanel",
      "DataSection > DataGrid + Pagination",
      "Drawer",
      "ConfirmDialog"
    ]
  },
  {
    "id": "production-sn-cert",
    "route": "/production/sn-cert",
    "title": "生产 · SN/证书管理",
    "pattern": "list-page",
    "flowIds": [
      "daily-ops-review",
      "production-forward-chain"
    ],
    "flowCard": {
      "entry": "烧录完成后进入，或工作台 SN 冲突卡片下钻",
      "previousPages": [
        "/dashboard",
        "/production/flashing"
      ],
      "nextPages": [
        "/dashboard"
      ],
      "userGoal": "追踪 SN 与证书状态，处理 SN 冲突。",
      "businessState": "证书服务维持设备身份信任；发生 SN 冲突时先隔离，再完成裁决。"
    },
    "intentCard": {
      "pageGoal": "按证书状态/冲突状态筛选 SN 记录，操作按状态机条件显隐。",
      "firstViewport": [
        "Tab（证书 / SN 冲突）",
        "筛选区",
        "SN 表格与状态列"
      ],
      "primaryAction": "处理 SN 冲突",
      "secondaryActions": [
        "吊销证书（仅有效证书可见）",
        "导出"
      ],
      "successCriteria": [
        "证书状态与 SN 冲突状态两组枚举分列、不混用。",
        "行操作按状态机驱动条件显隐（吊销仅对有效证书出现）。",
        "状态语义映射符合项目 status-copy（冲突=danger，已裁决=success）。"
      ]
    },
    "componentPlan": [
      "PageLayout",
      "PageHeader",
      "Tabs",
      "FilterPanel",
      "DataSection",
      "DataGrid",
      "Pagination",
      "Badge",
      "Button"
    ],
    "dataRequirements": [
      "SN",
      "Certificate",
      "SnConflict"
    ],
    "layoutTree": [
      "PageLayout",
      "PageHeader",
      "Tabs",
      "FilterPanel",
      "DataSection > DataGrid + Pagination"
    ]
  },
  {
    "id": "platform-rbac",
    "route": "/platform/rbac",
    "title": "平台 · 账号与权限",
    "pattern": "list-page",
    "flowIds": [
      "rbac-setup"
    ],
    "flowCard": {
      "entry": "SideNav > 平台共享能力 > 账号与权限",
      "previousPages": [
        "/dashboard"
      ],
      "nextPages": [
        "/dashboard"
      ],
      "userGoal": "管理角色与权限点，保证各域最小权限。",
      "businessState": "L0 全局地基，所有业务模块的鉴权前置。"
    },
    "intentCard": {
      "pageGoal": "角色列表与权限点注册表分 Tab 管理，支持启停与分配。",
      "firstViewport": [
        "Tab（角色 / 权限点）",
        "角色表格",
        "新建角色入口"
      ],
      "primaryAction": "新建角色",
      "secondaryActions": [
        "停用角色（二次确认）",
        "查看权限点注册表"
      ],
      "successCriteria": [
        "权限点命名遵循 域:模块[:对象]:动作 并与附录 A 对齐。",
        "所属域 Tag 用全平台统一域色映射（生产=geekblue、广告=purple、内容=cyan、平台=default）。",
        "无权限操作按钮置灰并带 Tooltip 说明缺失权限点。"
      ]
    },
    "componentPlan": [
      "PageLayout",
      "PageHeader",
      "Tabs",
      "FilterPanel",
      "DataSection",
      "Table",
      "Badge",
      "Button"
    ],
    "dataRequirements": [
      "Role",
      "Permission",
      "AuditLog"
    ],
    "layoutTree": [
      "PageLayout",
      "PageHeader",
      "Tabs",
      "FilterPanel",
      "DataSection > Table"
    ]
  },
  {
    "id": "platform-rbac-forbidden",
    "route": "/platform/rbac/forbidden-preview",
    "title": "平台 · 账号与权限 · 无权限",
    "pattern": "detail-page",
    "flowIds": ["rbac-setup"],
    "flowCard": {
      "entry": "路由鉴权拦截 platform:rbac:read",
      "previousPages": ["/dashboard"],
      "nextPages": ["/dashboard"],
      "userGoal": "理解当前无权访问的原因，并获得明确的申请或返回路径。",
      "businessState": "403 页面态；没有权限时不渲染角色与权限点数据。"
    },
    "intentCard": {
      "pageGoal": "展示可访问、可理解、可恢复的整页无权限状态。",
      "firstViewport": ["403 状态码", "无权访问标题", "缺失权限点与下一步", "返回工作台"],
      "primaryAction": "返回工作台",
      "secondaryActions": ["联系管理员申请权限"],
      "successCriteria": [
        "403 数字只做视觉辅助，标题与描述提供完整语义。",
        "描述明确缺失 platform:rbac:read 权限点。",
        "页面不渲染任何角色、用户或权限点数据。"
      ]
    },
    "componentPlan": ["PageLayout", "ForbiddenState", "Button"],
    "dataRequirements": ["Permission"],
    "layoutTree": ["PageLayout", "ForbiddenState"]
  },
  {
    "id": "production-testing",
    "route": "/production/testing",
    "title": "生产 · 测试管理",
    "pattern": "list-page",
    "flowIds": ["production-forward-chain"],
    "flowCard": {
      "entry": "SideNav > 生产履约域 > 测试管理，或烧录发证「进入测试」携 SN 跳入",
      "previousPages": ["/production/sn-cert"],
      "nextPages": ["/production/qc"],
      "userGoal": "跟踪测试记录并按状态机完成判定（合格入库/不合格分流）。",
      "businessState": "测试结论决定设备进入质检、返修或报废流程。"
    },
    "intentCard": {
      "pageGoal": "按 SN/机型/判定结果/设备状态筛选测试记录，行操作按设备状态条件显隐。",
      "firstViewport": ["页面标题与录入入口", "筛选区", "测试记录表格（判定结果与设备状态两列标签）"],
      "primaryAction": "录入测试结果",
      "secondaryActions": ["新建测试方案", "批量导出"],
      "successCriteria": [
        "设备状态与测试判定结果两套枚举分列、不混用（§3.4）。",
        "全状态常驻查看详情；testing 可判定并录入结果，test_failed 可返修/降级/报废，终态仅保留详情。",
        "状态语义映射符合项目 status-copy（不合格=danger，已降级=warning）。"
      ]
    },
    "componentPlan": ["PageLayout", "PageHeader", "FilterPanel", "DataSection", "DataGrid", "Pagination", "Badge", "Button"],
    "dataRequirements": ["TestRecord", "TestScheme", "Station"],
    "layoutTree": ["PageLayout", "PageHeader", "FilterPanel", "DataSection > DataGrid + Pagination"]
  },
  {
    "id": "production-qc",
    "route": "/production/qc",
    "title": "生产 · 质检管理",
    "pattern": "list-page",
    "flowIds": ["production-forward-chain"],
    "flowCard": {
      "entry": "SideNav > 生产履约域 > 质检管理，或测试管理「发起质检」携批次跳入",
      "previousPages": ["/production/testing"],
      "nextPages": ["/production/inventory"],
      "userGoal": "按批次执行质检并给出判定结论（放行/让步/拒收）。",
      "businessState": "生产正向主链第五环；判定结论是质检域自有状态机，设备状态流转由后端联动。"
    },
    "intentCard": {
      "pageGoal": "按批次/检验方式/判定结论筛选质检任务，不良率超 AQL 红色示警。",
      "firstViewport": ["页面标题与新建质检入口", "筛选区", "质检批次表格（不良率与判定结论）"],
      "primaryAction": "新建质检任务",
      "secondaryActions": ["导出"],
      "successCriteria": [
        "判定结论 5 态语义映射符合项目 status-copy（拒收=danger，让步接收降级=warning）。",
        "质检结论与设备状态不在同一字段并列展示（§3.4 硬隔离）。",
        "不良数 >0 与不良率超限有红色行内强调。",
        "全状态常驻查看详情；终态提供高权限撤销判定入口。"
      ]
    },
    "componentPlan": ["PageLayout", "PageHeader", "FilterPanel", "DataSection", "DataGrid", "Pagination", "Badge", "Button"],
    "dataRequirements": ["QcBatch", "DefectCode", "InboundBatch"],
    "layoutTree": ["PageLayout", "PageHeader", "FilterPanel", "DataSection > DataGrid + Pagination"]
  },
  {
    "id": "production-inventory",
    "route": "/production/inventory",
    "title": "生产 · 库存管理",
    "pattern": "list-page",
    "flowIds": ["production-forward-chain"],
    "flowCard": {
      "entry": "SideNav > 生产履约域 > 库存管理，或工作台「库龄预警」卡片跳入",
      "previousPages": ["/production/qc"],
      "nextPages": ["/production/shipping"],
      "userGoal": "掌握在库/可用/冻结/已分配的实时口径并处理调拨与冻结。",
      "businessState": "生产正向主链第六环；in_stock 父状态下的运营子状态由本模块管理。"
    },
    "intentCard": {
      "pageGoal": "按仓库/库存状态/品质等级筛选库存记录，库龄行内色预警。",
      "firstViewport": ["页面标题与调拨入口", "筛选区", "库存表格（四个数量列 + 库龄）", "选中库存后的批量操作浮条"],
      "primaryAction": "新建调拨单",
      "secondaryActions": ["批量冻结", "导出"],
      "successCriteria": [
        "库存子状态与品质等级语义映射符合项目 status-copy（冻结=warning，可用=success）。",
        "库龄预警为行内文本颜色（90–180 天黄、>180 天红），禁止做成 Tag（PRD §五·库存 7.6）。",
        "可用数量 = 在库 − 冻结 − 已分配，口径一致展示。",
        "选择库存后显示选中数量与批量冻结/解冻；批量冻结先经 ConfirmDialog 确认。",
        "全状态常驻查看详情与盘点调整；可用库存提供调拨、冻结及分配出货。"
      ]
    },
    "componentPlan": ["PageLayout", "PageHeader", "FilterPanel", "DataSection", "DataGrid", "Pagination", "BulkActionBar", "ConfirmDialog", "Badge", "Button"],
    "dataRequirements": ["StockRecord", "Warehouse", "TransferOrder"],
    "layoutTree": ["PageLayout", "PageHeader", "FilterPanel", "DataSection > DataGrid + Pagination"]
  },
  {
    "id": "production-shipping",
    "route": "/production/shipping",
    "title": "生产 · 出货管理",
    "pattern": "list-page",
    "flowIds": ["production-forward-chain"],
    "flowCard": {
      "entry": "SideNav > 生产履约域 > 出货管理，或库存管理「分配出货」跳入",
      "previousPages": ["/production/inventory"],
      "nextPages": ["/dashboard"],
      "userGoal": "管理出货单从创建、拣货扫描到发运的全流程。",
      "businessState": "生产正向主链末环；确认出库后设备状态 in_stock → shipped（geekblue 强调态）。"
    },
    "intentCard": {
      "pageGoal": "按出货单号/客户/出货状态筛选出货单，扫描进度颜色示意。",
      "firstViewport": ["页面标题与新建出货单入口", "筛选区", "出货单表格（扫描进度与出货状态）"],
      "primaryAction": "新建出货单",
      "secondaryActions": ["导出"],
      "successCriteria": [
        "出货单 5 态语义映射符合项目 status-copy（已发运=geekblue 强调态，已取消=secondary）。",
        "已扫描数量小于出货数量时橙显、相等时绿显、已取消显示「—」。",
        "列表全状态常驻查看详情；待出库/拣货中可出库扫描，拣货中/已发运可登记物流，未扫描的待出库/拣货中可取消。",
        "确认出库仅在扫描工作台内且已扫描数量等于出货数量时可用；部分扫描提供部分发运。"
      ]
    },
    "componentPlan": ["PageLayout", "PageHeader", "FilterPanel", "DataSection", "DataGrid", "Pagination", "Badge", "Button"],
    "dataRequirements": ["ShippingOrder", "Customer", "LogisticsProvider"],
    "layoutTree": ["PageLayout", "PageHeader", "FilterPanel", "DataSection > DataGrid + Pagination"]
  },
  {
    "id": "platform-audit",
    "route": "/platform/audit",
    "title": "平台 · 审计日志",
    "pattern": "list-page",
    "flowIds": ["audit-traceability"],
    "flowCard": {
      "entry": "SideNav > 平台共享能力 > 审计日志，或工作台「敏感操作告警」卡片预设高风险筛选跳入",
      "previousPages": ["/dashboard"],
      "nextPages": ["/dashboard"],
      "userGoal": "对操作与登录留痕做合规检索与按 SN 追溯。",
      "businessState": "L0 全局地基的界面补齐；日志由后端自动写入，数据只读。"
    },
    "intentCard": {
      "pageGoal": "按操作人/操作类型/所属域/风险等级检索日志；只读，无任何新建入口。",
      "firstViewport": ["页面标题与追溯/导出入口", "筛选区", "日志表格（风险等级与操作结果两列标签、域色 Tag）"],
      "primaryAction": "按 SN 追溯",
      "secondaryActions": ["导出日志"],
      "successCriteria": [
        "页面无新建/编辑/删除入口（只读系统）。",
        "操作结果与风险等级两套标签语义映射符合项目 status-copy（高风险=danger，敏感操作=warning）。",
        "所属域 Tag 用全平台统一域色映射（生产=geekblue、广告=purple、内容=cyan、平台=default）。",
        "高风险行整行浅红强调，失败行整行浅橙强调；同时命中时高风险优先。"
      ]
    },
    "componentPlan": ["PageLayout", "PageHeader", "FilterPanel", "DataSection", "DataGrid", "Pagination", "Badge", "Button"],
    "dataRequirements": ["AuditLog", "Staff"],
    "layoutTree": ["PageLayout", "PageHeader", "FilterPanel", "DataSection > DataGrid + Pagination"]
  },
  {
    "id": "production-rma",
    "route": "/production/rma",
    "title": "生产 · 退货 RMA",
    "pattern": "list-page",
    "flowIds": ["production-reverse-chain"],
    "flowCard": { "entry": "SideNav > 生产履约域 > 退货 RMA", "previousPages": ["/production/shipping"], "nextPages": ["/production/testing", "/production/inventory"], "userGoal": "跟踪退货到件与检测，完成返修、二次入库或报废裁决。", "businessState": "生产逆向链入口；仅灰度角色可见，裁决结果回接设备生命周期。" },
    "intentCard": { "pageGoal": "按 RMA、SN、到件状态和检测结论筛选，完成检测录入与有确认的终态裁决。", "firstViewport": ["灰度与权限说明", "筛选区", "RMA 列表", "批量操作浮条"], "primaryAction": "新建 RMA 单", "secondaryActions": ["导出当前筛选", "批量关闭"], "successCriteria": ["到件、检测结论、裁决和设备状态分列展示。", "返修、二次入库、报废与批量关闭均经过 ConfirmDialog。", "无权限时展示 ForbiddenState。"] },
    "componentPlan": ["PageLayout", "PageHeader", "FilterPanel", "RangePicker", "DataSection", "DataGrid", "Pagination", "BulkActionBar", "Drawer", "DatePicker", "RadioGroup", "CheckboxGroup", "Upload", "ConfirmDialog", "ForbiddenState", "Badge", "Button"],
    "dataRequirements": ["RmaOrder", "RmaInspection", "DeviceLifecycle"],
    "layoutTree": ["PageLayout", "PageHeader", "FilterPanel + RangePicker", "DataSection > DataGrid + Pagination", "BulkActionBar", "Drawer", "ConfirmDialog"]
  },
  {
    "id": "ad-campaigns",
    "route": "/ad/campaigns",
    "title": "广告 · 投放计划",
    "pattern": "list-page",
    "flowIds": ["ad-monetization-chain"],
    "flowCard": { "entry": "SideNav > 广告变现域 > 投放计划", "previousPages": ["/dashboard"], "nextPages": ["/ad/reconciliation"], "userGoal": "沿广告位、广告主、订单到投放计划配置预算、排期、定向与策略。", "businessState": "广告运营主链；投放与生产设备身份数据保持隔离。" },
    "intentCard": { "pageGoal": "筛选投放计划，创建本地计划并安全执行单条或批量暂停。", "firstViewport": ["广告业务链 Stepper", "隐私边界", "筛选区", "计划列表"], "primaryAction": "新建计划", "secondaryActions": ["导出", "批量暂停"], "successCriteria": ["定向仅使用去标识化聚合标签。", "日期、组织树和选择组使用公共控件。", "暂停与批量暂停均经过 ConfirmDialog。"] },
    "componentPlan": ["PageLayout", "PageHeader", "Stepper", "FilterPanel", "RangePicker", "DataSection", "DataGrid", "Pagination", "BulkActionBar", "Drawer", "TreeSelect", "RadioGroup", "CheckboxGroup", "Switch", "ConfirmDialog", "ForbiddenState", "Badge", "Button"],
    "dataRequirements": ["AdPlacement", "Advertiser", "AdOrder", "Campaign"],
    "layoutTree": ["PageLayout", "PageHeader", "Stepper", "FilterPanel", "DataSection > DataGrid + Pagination", "BulkActionBar", "Drawer", "ConfirmDialog"]
  },
  {
    "id": "ad-reconciliation",
    "route": "/ad/reconciliation",
    "title": "广告 · 对账管理",
    "pattern": "list-page",
    "flowIds": ["ad-monetization-chain"],
    "flowCard": { "entry": "SideNav > 广告变现域 > 对账管理", "previousPages": ["/ad/campaigns"], "nextPages": ["/dashboard"], "userGoal": "核对平台与合作方账单差异，按权限查看金额并完成核销。", "businessState": "T+1 定版口径；只读角色保留查询与轨迹，高权限角色可处理差异。" },
    "intentCard": { "pageGoal": "按批次、对象和状态筛选对账记录，显式区分金额权限与处理权限。", "firstViewport": ["口径与权限说明", "筛选区", "对账列表", "差异详情"], "primaryAction": "发起对账", "secondaryActions": ["导出对账明细", "处理差异"], "successCriteria": ["无金额权限时金额全部脱敏。", "T+1 口径与实时竞价口径分开提示。", "核销经过 ConfirmDialog，审计轨迹保持只读。"] },
    "componentPlan": ["PageLayout", "PageHeader", "FilterPanel", "RangePicker", "DataSection", "DataGrid", "Pagination", "Drawer", "Upload", "RadioGroup", "ConfirmDialog", "ForbiddenState", "DescriptionGrid", "Badge", "Button"],
    "dataRequirements": ["ReconciliationBatch", "PartnerBill", "ReconciliationAudit"],
    "layoutTree": ["PageLayout", "PageHeader", "FilterPanel + RangePicker", "DataSection > DataGrid + Pagination", "Drawer", "ConfirmDialog"]
  },
  {
    "id": "content-schedule",
    "route": "/content/schedule",
    "title": "内容 · 排期与发布",
    "pattern": "list-page",
    "flowIds": ["content-publish-chain"],
    "flowCard": { "entry": "SideNav > 内容运营域 > 排期与发布", "previousPages": ["/dashboard"], "nextPages": ["/dashboard"], "userGoal": "管理素材、内容位、排期、审批与上下架。", "businessState": "内容运营主工作台；冲突排期和紧急下架保留独立风险反馈。" },
    "intentCard": { "pageGoal": "在标签页内完成素材上传、排期编排、审批和发布控制。", "firstViewport": ["素材/排期/发布标签", "排期筛选", "冲突状态", "列表与批量操作"], "primaryAction": "新建排期", "secondaryActions": ["上传素材", "发起上下架", "批量取消"], "successCriteria": ["版权到期、排期周期和生效时间使用公共日期控件。", "冲突筛选与排期状态独立表达。", "批量取消和紧急下架均经过 ConfirmDialog。"] },
    "componentPlan": ["PageLayout", "PageHeader", "Tabs", "FilterPanel", "RangePicker", "Switch", "DataSection", "DataGrid", "Pagination", "BulkActionBar", "Drawer", "Upload", "DatePicker", "TreeSelect", "RadioGroup", "CheckboxGroup", "ConfirmDialog", "ForbiddenState", "Badge", "Button"],
    "dataRequirements": ["ContentMaterial", "ContentSlot", "ContentSchedule", "PublishRequest"],
    "layoutTree": ["PageLayout", "PageHeader", "Tabs", "FilterPanel + RangePicker + Switch", "DataSection > DataGrid + Pagination", "BulkActionBar", "Drawer", "ConfirmDialog"]
  },
  {
    "id": "content-version",
    "route": "/content/version",
    "title": "内容 · 版本与回滚",
    "pattern": "list-page",
    "flowIds": ["content-publish-chain"],
    "flowCard": {
      "entry": "SideNav > 内容运营域 > 版本与回滚，或排期与发布页面的版本历史入口",
      "previousPages": ["/content/schedule"],
      "nextPages": ["/content/schedule"],
      "userGoal": "检索内容版本，确认变更差异，并在后续阶段安全回滚到历史版本。",
      "businessState": "内容发布后的追溯与恢复层；版本由发布、编辑和回滚动作自动生成。"
    },
    "intentCard": {
      "pageGoal": "按内容位、版本号、变更类型和状态检索版本历史，进入详情与差异比较。",
      "firstViewport": ["页面标题与数据操作", "筛选区", "版本历史表格", "分页"],
      "primaryAction": "比较版本差异",
      "secondaryActions": ["查看版本详情", "导出记录", "刷新"],
      "successCriteria": [
        "页面无手动新建版本入口。",
        "当前、历史和已回滚状态分别使用稳定语义标签。",
        "比较操作在选择历史版本前保持禁用。",
        "详情与 Diff 在 Drawer 中完成，Diff 字段保持左右对齐。",
        "回滚只接受历史版本，原因至少 10 个字符且必须确认影响范围。",
        "回滚完成后当前版本和已回滚状态同步更新，并恢复到稳定焦点。",
        "窄屏仅在表格内部横向滚动，页面无外层横向溢出。"
      ]
    },
    "componentPlan": ["PageLayout", "PageHeader", "FilterPanel", "DataSection", "DataGrid", "Pagination", "Badge", "Button", "Input", "Select", "Drawer", "DescriptionGrid", "CheckboxGroup", "ConfirmDialog", "FormSection"],
    "dataRequirements": ["ContentVersion", "ContentSnapshot", "ContentSlot", "Staff"],
    "layoutTree": ["PageLayout", "PageHeader", "FilterPanel", "DataSection > DataGrid + Pagination", "Drawer（详情 / Diff）", "ConfirmDialog（回滚）"]
  }
] as GeneratedPagePlan[];

const pageById = Object.fromEntries(pagePlans.map((page) => [page.id, page])) as Record<GeneratedPageId, GeneratedPagePlan>;

function TianshuRmaPage({ page }: { page: GeneratedPagePlan }) {
  return <TianshuRmaPageView key={page.id} />;
}

function TianshuAdCampaignsPage({ page }: { page: GeneratedPagePlan }) {
  return <TianshuAdCampaignsPageView key={page.id} />;
}

function TianshuAdReconciliationPage({ page }: { page: GeneratedPagePlan }) {
  return <TianshuAdReconciliationPageView canProcess canViewAmounts key={page.id} />;
}

function TianshuContentSchedulePage({ page }: { page: GeneratedPagePlan }) {
  return <TianshuContentSchedulePageView key={page.id} />;
}

function TianshuContentVersionPage({ page }: { page: GeneratedPagePlan }) {
  return <ContentVersionPageView key={page.id} />;
}

function TianshuFirmwarePage({ page }: { page: GeneratedPagePlan }) {
  return <TianshuFirmwarePageView key={page.id} />;
}

const generatedComponents = {
  "dashboard": () => <TianshuDashboard page={pageById["dashboard"]} />,
  "production-inbound": () => <InboundListPage page={pageById["production-inbound"]} />,
  "production-flashing": () => <FlashingFormPage page={pageById["production-flashing"]} />,
  "production-firmware": () => <TianshuFirmwarePage page={pageById["production-firmware"]} />,
  "production-sn-cert": () => <SnCertListPage page={pageById["production-sn-cert"]} />,
  "platform-rbac": () => <RbacListPage page={pageById["platform-rbac"]} />,
  "platform-rbac-forbidden": () => <RbacForbiddenPage page={pageById["platform-rbac-forbidden"]} />,
  "production-testing": () => <TestingListPage page={pageById["production-testing"]} />,
  "production-qc": () => <QcListPage page={pageById["production-qc"]} />,
  "production-inventory": () => <InventoryListPage page={pageById["production-inventory"]} />,
  "production-shipping": () => <ShippingListPage page={pageById["production-shipping"]} />,
  "platform-audit": () => <AuditListPage page={pageById["platform-audit"]} />,
  "production-rma": () => <TianshuRmaPage page={pageById["production-rma"]} />,
  "ad-campaigns": () => <TianshuAdCampaignsPage page={pageById["ad-campaigns"]} />,
  "ad-reconciliation": () => <TianshuAdReconciliationPage page={pageById["ad-reconciliation"]} />,
  "content-schedule": () => <TianshuContentSchedulePage page={pageById["content-schedule"]} />,
  "content-version": () => <TianshuContentVersionPage page={pageById["content-version"]} />
} satisfies Record<GeneratedPageId, () => ReactNode>;

export const generatedProjectPages: GeneratedProjectPage[] = pagePlans.map((page) => ({
  id: page.id,
  route: page.route,
  title: page.title,
  pattern: page.pattern,
  component: generatedComponents[page.id]
}));

// ===== 项目层状态文案映射（唯一来源：../status-copy.md，PRD §3.1）=====

type BadgeVariant = NonNullable<TianshuBadgeProps["variant"]>;
type StatusCopyEntry = { label: string; variant: BadgeVariant };

const statusCopy = {
  inbound: {
    "pending-inspection": { label: "待验收", variant: "warning" },
    "received": { label: "已入场", variant: "success" },
    "abnormal": { label: "异常", variant: "danger" }
  },
  flashing: {
    "flashing": { label: "烧录中", variant: "processing" },
    "flash-failed": { label: "烧录失败", variant: "danger" },
    "completed": { label: "已完成", variant: "success" }
  },
  cert: {
    "valid": { label: "有效", variant: "success" },
    "pending": { label: "待发", variant: "processing" },
    "revoked": { label: "已吊销", variant: "secondary" }
  },
  snConflict: {
    "normal": { label: "正常", variant: "secondary" },
    "quarantined": { label: "冲突隔离", variant: "danger" },
    "resolved": { label: "已裁决", variant: "success" }
  },
  role: {
    "enabled": { label: "启用", variant: "success" },
    "disabled": { label: "停用", variant: "secondary" }
  },
  deviceStatus: {
    "testing": { label: "测试中", variant: "processing" },
    "test_failed": { label: "测试不合格", variant: "danger" },
    "in_stock": { label: "合格入库", variant: "success" },
    "scrapped": { label: "已报废", variant: "secondary" }
  },
  testJudge: {
    "pass": { label: "合格", variant: "success" },
    "fail": { label: "不合格", variant: "danger" },
    "pending": { label: "待判定", variant: "processing" },
    "downgraded": { label: "已降级", variant: "warning" },
    "scrapped": { label: "已报废", variant: "secondary" }
  },
  repairMark: {
    "repair": { label: "返修件", variant: "warning" },
    "first_test": { label: "首测", variant: "secondary" }
  },
  qcConclusion: {
    "qc_pending": { label: "待质检", variant: "secondary" },
    "qc_inspecting": { label: "质检中", variant: "processing" },
    "qc_qualified": { label: "合格放行", variant: "success" },
    "qc_concession": { label: "让步接收降级", variant: "warning" },
    "qc_rejected": { label: "拒收", variant: "danger" }
  },
  inspectionMethod: {
    "sampling": { label: "抽检", variant: "secondary" },
    "full_inspection": { label: "全检", variant: "processing" }
  },
  stockStatus: {
    "available": { label: "可用", variant: "success" },
    "frozen": { label: "冻结", variant: "warning" },
    "allocated": { label: "已分配出货", variant: "processing" },
    "degraded": { label: "降级品", variant: "warning" }
  },
  qualityGrade: {
    "good": { label: "良品", variant: "success" },
    "degraded_quality": { label: "降级品", variant: "warning" }
  },
  shippingOrder: {
    "pending": { label: "待出库", variant: "processing" },
    "picking": { label: "拣货中", variant: "processing" },
    "shipped": { label: "已发运", variant: "geekblue" },
    "partial_shipped": { label: "部分发运", variant: "warning" },
    "cancelled": { label: "已取消", variant: "secondary" }
  },
  auditResult: {
    "success": { label: "成功", variant: "success" },
    "failed": { label: "失败", variant: "danger" }
  },
  auditSensitivity: {
    "sensitive": { label: "敏感操作", variant: "warning" }
  },
  auditRisk: {
    "low": { label: "低风险", variant: "secondary" },
    "medium": { label: "中风险", variant: "warning" },
    "high": { label: "高风险", variant: "danger" }
  }
} as const satisfies Record<string, Record<string, StatusCopyEntry>>;

// 业务域 Tag（PRD §3.1.1 非语义维度，全平台固定映射：生产=geekblue、广告=purple、内容=cyan、平台=default）
const domainCopy = {
  production: { label: "生产", variant: "geekblue" },
  ad: { label: "广告", variant: "purple" },
  content: { label: "内容", variant: "cyan" },
  platform: { label: "平台", variant: "secondary" }
} as const satisfies Record<string, StatusCopyEntry>;

type StatusGroup = keyof typeof statusCopy;

function StatusBadge({ group, status }: { group: StatusGroup; status: string }) {
  const table = statusCopy[group] as Record<string, StatusCopyEntry>;
  const copy: StatusCopyEntry = table[status] ?? { label: "未知状态", variant: "info" };
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

function DomainTag({ domain }: { domain: keyof typeof domainCopy }) {
  const copy = domainCopy[domain];
  return <Badge variant={copy.variant} appearance="soft">{copy.label}</Badge>;
}

// ===== 模拟数据（字段与 PRD §五/§八 一致，数值为演示值）=====

const inboundRows = [
  { id: "IB-20260708-001", supplier: "华阳精密（代工厂）", quantity: 500, arrivedAt: "2026-07-08 09:30", status: "received" },
  { id: "IB-20260708-002", supplier: "华阳精密（代工厂）", quantity: 300, arrivedAt: "2026-07-08 14:00", status: "pending-inspection" },
  { id: "IB-20260707-003", supplier: "联创电子", quantity: 200, arrivedAt: "2026-07-07 16:20", status: "abnormal" }
];

const snRows = [
  { sn: "TA26-0001-8842", firmware: "v2.3.1", certStatus: "valid", conflictStatus: "normal", issuedAt: "2026-07-08" },
  { sn: "TA26-0001-8843", firmware: "v2.3.1", certStatus: "pending", conflictStatus: "normal", issuedAt: "—" },
  { sn: "TA26-0001-8617", firmware: "v2.2.9", certStatus: "valid", conflictStatus: "quarantined", issuedAt: "2026-07-05" },
  { sn: "TA26-0001-8320", firmware: "v2.2.9", certStatus: "revoked", conflictStatus: "resolved", issuedAt: "2026-06-30" }
];

const roleRows = [
  { id: "prod-line", role: "产线操作员", domain: "production", users: 18, permissions: 12, status: "enabled" },
  { id: "qc-lead", role: "质检主管", domain: "production", users: 4, permissions: 21, status: "enabled" },
  { id: "platform-admin", role: "平台管理员", domain: "platform", users: 2, permissions: 64, status: "enabled" },
  { id: "legacy-ops", role: "旧运营角色（待清理）", domain: "platform", users: 0, permissions: 8, status: "disabled" }
];

const permissionRows = [
  { id: "p1", key: "production:inbound:batch:create", description: "新建收货登记", domain: "production" },
  { id: "p2", key: "production:flashing:task:create", description: "创建烧录任务", domain: "production" },
  { id: "p3", key: "production:sn-cert:cert:revoke", description: "吊销设备证书", domain: "production" },
  { id: "p4", key: "platform:rbac:role:disable", description: "停用角色", domain: "platform" }
];

// ===== 页面：工作台 · 个人首页（dashboard-page）=====
// 视觉：清新玻璃质感（Glass Fresh）—— 渐变底 + 半透白面板 + 细描边 + 渐变图标块

type DashTone = "blue" | "sky" | "teal" | "violet" | "indigo";
type DashMetric = { key: string; label: string; value: string; sub?: string; delta: string; trend: "up" | "down"; tone: DashTone; icon: ReactNode; series: number[]; unit: string };

const dashQuickRanges = ["昨天", "今天", "近7天", "近30天"] as const;
const dashDates = Array.from({ length: 15 }, (_, i) => {
  const d = new Date(2026, 5, 24 + i);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
});

const dashMetrics: DashMetric[] = [
  { key: "inbound", label: "今日入场批次 / 台数", value: "3", sub: "1,000 台", delta: "1 批待验收", trend: "up", tone: "blue", icon: <InboxOutlined />, unit: "台", series: [620, 540, 580, 760, 710, 690, 820, 905, 860, 780, 840, 1010, 950, 920, 1000] },
  { key: "flashing", label: "烧录任务 / 成功率", value: "2", sub: "99.8%", delta: "1 台失败", trend: "down", tone: "sky", icon: <ThunderboltOutlined />, unit: "台", series: [410, 460, 430, 520, 580, 560, 610, 640, 600, 590, 650, 700, 690, 720, 760] },
  { key: "cert", label: "今日发证", value: "480", sub: "台", delta: "12.4%", trend: "up", tone: "teal", icon: <SafetyCertificateOutlined />, unit: "台", series: [300, 320, 310, 360, 390, 370, 400, 430, 410, 420, 450, 440, 460, 470, 480] },
  { key: "qc", label: "待质检批次 / 待抽检", value: "4", sub: "2 批", delta: "2 批待抽检", trend: "up", tone: "violet", icon: <AuditOutlined />, unit: "批", series: [2, 3, 3, 4, 2, 3, 5, 4, 3, 4, 6, 5, 4, 3, 4] },
  { key: "conflict", label: "SN 冲突 / 待裁决", value: "1", sub: "1 起", delta: "需今日裁决", trend: "down", tone: "indigo", icon: <WarningOutlined />, unit: "起", series: [0, 1, 0, 2, 1, 0, 1, 3, 1, 0, 2, 1, 1, 0, 1] }
];

function smoothPath(points: Array<[number, number]>) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function DashTrendChart({ metric }: { metric: DashMetric }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const height = 300;
  const pad = { top: 16, right: 20, bottom: 34, left: 56 };
  const max = Math.max(...metric.series);
  const min = Math.min(...metric.series);
  const rawStep = Math.max(1, (max - min) / 4);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rawStep) ?? rawStep;
  const yMin = Math.max(0, Math.floor(min / step) * step - (min % step === 0 ? step : 0));
  const yMax = Math.ceil(max / step) * step + (max % step === 0 ? step : 0);
  const ticks = Array.from({ length: Math.round((yMax - yMin) / step) + 1 }, (_, i) => yMax - i * step);
  const x = (i: number) => pad.left + (i * (width - pad.left - pad.right)) / (metric.series.length - 1);
  const y = (v: number) => pad.top + ((yMax - v) * (height - pad.top - pad.bottom)) / (yMax - yMin);
  const pts = metric.series.map((v, i) => [x(i), y(v)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${x(metric.series.length - 1)},${height - pad.bottom} L${x(0)},${height - pad.bottom} Z`;
  return (
    <div className="ts-dash-chart" ref={wrapRef}>
      <svg width={width} height={height} role="img" aria-label={`${metric.label}近 15 天趋势`}>
        <defs>
          <linearGradient id="ts-dash-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="ts-dash-chart__grid" />
            <text x={pad.left - 12} y={y(t) + 4} textAnchor="end" className="ts-dash-chart__axis">{Math.round(t).toLocaleString("zh-CN")}</text>
          </g>
        ))}
        <path d={area} fill="url(#ts-dash-area)" />
        <path d={line} className="ts-dash-chart__line" />
        {pts.map(([px, py], i) => (
          <g key={i}>
            <circle cx={px} cy={py} r={4} className="ts-dash-chart__dot" />
            <text x={px} y={height - 10} textAnchor="middle" className="ts-dash-chart__axis">{dashDates[i]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function TianshuDashboard({ page }: { page: GeneratedPagePlan }) {
  const [range, setRange] = useState<string>("近7天");
  const [activeKey, setActiveKey] = useState(dashMetrics[0].key);
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = dashMetrics.find((item) => item.key === activeKey) ?? dashMetrics[0];
  const activeName = active.label.split(" / ")[0];
  return (
    <PageLayout className="generated-page ts-dash">
      <section className="ts-glass-hero">
        <PageHeader
          title="工作台"
          description={page.intentCard.pageGoal}
          actions={(
            <>
              <span className="ts-updated"><ClockCircleOutlined /> 数据已更新 · 10:30</span>
              <Button type="primary" onClick={() => navigateTianshu("/tianshu/production/flashing")}>{page.intentCard.primaryAction}</Button>
            </>
          )}
        />
        <div className="ts-filter-wrap">
        <div className="ts-filter-strip" role="search" aria-label="工作台筛选">
          <div className="ts-quick-range" role="radiogroup" aria-label="快捷时间">
            {dashQuickRanges.map((item) => (
              <button key={item} type="button" role="radio" aria-checked={range === item} className={range === item ? "is-active" : undefined} onClick={() => setRange(item)}>{item}</button>
            ))}
          </div>
          <DatePicker.RangePicker className="ts-filter-strip__range" placeholder={["2026/07/02", "2026/07/08"]} />
          <Select className="ts-filter-strip__select" defaultValue="all" options={[{ value: "all", label: "全部运营中心" }, { value: "south", label: "华南运营中心" }]} />
          <Select className="ts-filter-strip__select" defaultValue="all" options={[{ value: "all", label: "全部产线" }]} />
          <Select className="ts-filter-strip__select" defaultValue="all" options={[{ value: "all", label: "全部供应商" }]} />
          <div className="ts-filter-strip__actions">
            <Button type="primary" onClick={() => emitTianshuNotice("已按当前条件查询。演示数据保持不变。")}>查询</Button>
            <Button onClick={() => { setRange("近7天"); emitTianshuNotice("筛选条件已重置。"); }}>重置</Button>
          </div>
        </div>
        </div>
      </section>

      <section className="ts-glass-panel" aria-labelledby="ts-dash-overview">
        <header className="ts-section-title">
          <h2 id="ts-dash-overview">生产概览</h2>
          <span>华南运营中心 · 全部产线</span>
          <span className="ts-user-pill"><span className="ts-user-pill__avatar">周</span>周启明</span>
        </header>
        <div className="ts-kpi-rail">
          <div className="ts-kpi-row" ref={scrollRef}>
            {dashMetrics.map((item) => (
              <button key={item.key} type="button" className={`ts-kpi${item.key === activeKey ? " is-active" : ""}`} aria-pressed={item.key === activeKey} onClick={() => setActiveKey(item.key)}>
                <span className="ts-kpi__head">
                  <span>{item.label}</span>
                  <span className={`ts-icon-tile ts-icon-tile--${item.tone}`} aria-hidden="true">{item.icon}</span>
                </span>
                <span className="ts-kpi__value">
                  <strong>{item.value}</strong>
                  {item.sub ? <><i>/</i><em>{item.sub}</em></> : null}
                </span>
                <span className={`ts-delta ts-delta--${item.trend}`}>{item.delta} {item.trend === "up" ? <RiseOutlined /> : <FallOutlined />}</span>
              </button>
            ))}
          </div>
          <button type="button" className="ts-rail-arrow" aria-label="查看更多指标" onClick={() => scrollRef.current?.scrollBy({ left: 320, behavior: "smooth" })}><RightOutlined /></button>
        </div>
        <div className="ts-chart-card">
          <header>
            <div>
              <h3>{activeName}趋势</h3>
              <p>按当前筛选条件展示近 15 天每日变化（单位：{active.unit}）</p>
            </div>
            <span className="ts-legend"><i />{activeName}</span>
          </header>
          <DashTrendChart metric={active} />
        </div>
      </section>

      <div className="generated-two-column">
        <section className="ts-glass-panel ts-glass-panel--list">
          <header className="ts-section-title"><h2>生产待办</h2><span className="ts-section-title__extra"><Badge variant="danger">2 项高优</Badge></span></header>
          <div className="generated-status-list">
            <TodoLine label="烧录失败" value="IB-20260708-001 批次 1 台，重试或登记报废" group="flashing" status="flash-failed" />
            <TodoLine label="SN 冲突" value="TA26-0001-8617 冲突隔离，待裁决" group="snConflict" status="quarantined" />
            <TodoLine label="收货验收" value="IB-20260708-002 批次 300 台待验收" group="inbound" status="pending-inspection" />
          </div>
        </section>
        <section className="ts-glass-panel ts-glass-panel--list">
          <header className="ts-section-title"><h2>平台状态</h2><span className="ts-section-title__extra"><Badge variant="success">正常</Badge></span></header>
          <div className="generated-status-list">
            <TodoLine label="产线 SLA" value="烧录/发证服务在线" group="cert" status="valid" />
            <TodoLine label="证书服务" value="今日已发证 480 台" group="flashing" status="completed" />
            <TodoLine label="权限配置" value="1 个停用角色待清理" group="role" status="disabled" />
          </div>
        </section>
      </div>

      <section className="ts-glass-panel">
        <header className="ts-section-title">
          <h2>快捷入口</h2>
          <span>{page.flowCard.businessState}</span>
          <Button className="ts-section-title__action" onClick={() => emitTianshuNotice("工作台指标已刷新。演示数据保持不变。")}>刷新指标</Button>
        </header>
        <div className="ts-shortcuts">
          {[
            { label: "收货入库", desc: "登记到货批次", tone: "blue", icon: <InboxOutlined />, path: "/tianshu/production/inbound" },
            { label: "烧录发证", desc: "创建烧录任务", tone: "sky", icon: <ThunderboltOutlined />, path: "/tianshu/production/flashing" },
            { label: "SN/证书管理", desc: "裁决冲突与吊销", tone: "teal", icon: <SafetyCertificateOutlined />, path: "/tianshu/production/sn-cert" },
            { label: "账号与权限", desc: "角色与授权", tone: "violet", icon: <UserOutlined />, path: "/tianshu/platform/rbac" }
          ].map((item) => (
            <button key={item.label} type="button" className="ts-shortcut" onClick={() => navigateTianshu(item.path)}>
              <span className={`ts-icon-tile ts-icon-tile--lg ts-icon-tile--${item.tone}`} aria-hidden="true">{item.icon}</span>
              <span><strong>{item.label}</strong><small>{item.desc}</small></span>
              <RightOutlined className="ts-shortcut__arrow" />
            </button>
          ))}
        </div>
      </section>
    </PageLayout>
  );
}

function TodoLine({ label, value, group, status }: { label: string; value: string; group: StatusGroup; status: string }) {
  return (
    <div className="generated-status-line">
      <span>{label}</span>
      <strong>{value}</strong>
      <StatusBadge group={group} status={status} />
    </div>
  );
}

// ===== 页面：生产 · 收货入库（list-page）=====

function InboundListPage({ page }: { page: GeneratedPagePlan }) {
  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={<Button onClick={() => emitTianshuNotice("新建收货登记入口已触发；本地演示未写入外部业务系统。")}>{page.intentCard.primaryAction}</Button>}
      />
      <FilterPanel
        fields={[
          { name: "batchId", label: "批次号", placeholder: "IB-YYYYMMDD-XXX" },
          {
            name: "supplier",
            label: "供应商",
            type: "select",
            options: [
              { label: "华阳精密（代工厂）", value: "huayang" },
              { label: "联创电子", value: "lianchuang" }
            ]
          },
          {
            name: "status",
            label: "状态",
            type: "select",
            options: [
              { label: "待验收", value: "pending-inspection" },
              { label: "已入场", value: "received" },
              { label: "异常", value: "abnormal" }
            ]
          },
          { name: "arrivedAt", label: "到货时间", placeholder: "起 — 止" }
        ]}
      />
      <DataSection
        title="到货批次"
        description={page.flowCard.userGoal}
        toolbar={<Button >{page.intentCard.secondaryActions[0] ?? "导出"}</Button>}
      >
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={inboundRows} columns={mapTableColumns([
            { key: "id", title: "批次号" },
            { key: "supplier", title: "供应商" },
            { key: "quantity", title: "数量（台）" },
            { key: "arrivedAt", title: "到货时间" },
            {
              key: "status",
              title: "状态",
              render: (record) => <StatusBadge group="inbound" status={String(record.status)} />
            }
          ])} pagination={false} rowSelection={{}} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={37} /></div></div>
      </DataSection>
    </PageLayout>
  );
}

// ===== 页面：生产 · 烧录发证 · 新建烧录任务（form-page）=====

function FlashingFormPage({ page }: { page: GeneratedPagePlan }) {
  const [firmwareVersion, setFirmwareVersion] = useState<string>();
  const [showFirmwareError, setShowFirmwareError] = useState(false);
  const firmwareErrorId = "flashing-firmware-error";

  const createFlashingTask = () => {
    const missingFirmware = !firmwareVersion;
    setShowFirmwareError(missingFirmware);
    if (!missingFirmware) {
      emitTianshuNotice("烧录任务已在本地演示中创建，未提交到外部系统。");
    }
  };

  return (
    <PageLayout className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={<Button >存草稿</Button>}
      />
      <Steps current={stepIndex("batch", [
          { key: "batch", title: "选择批次", content: "仅已入场批次可选" },
          { key: "firmware", title: "绑定固件与证书", content: "固件版本必选" },
          { key: "confirm", title: "确认创建", content: "数量与任务参数" }
        ])} items={[
          { key: "batch", title: "选择批次", content: "仅已入场批次可选" },
          { key: "firmware", title: "绑定固件与证书", content: "固件版本必选" },
          { key: "confirm", title: "确认创建", content: "数量与任务参数" }
        ]} />
      <Form layout="vertical" onFinish={createFlashingTask}>
        <FormSection title="批次选择" description="仅列出状态为「已入场」的批次（依赖收货入库前序产出）。">
          <Form.Item label="收货批次"><Select placeholder="选择批次" options={[
              { label: "IB-20260708-001（华阳精密 · 500 台）", value: "IB-20260708-001" }
            ]} /></Form.Item>
          <Form.Item label="本次烧录数量（台）"><Input placeholder="请输入烧录数量" defaultValue="500" /></Form.Item>
        </FormSection>
        <FormSection title="固件与证书" description="固件版本为必选项；仅显示已签名且适配当前机型的版本，证书模板由 PKI 信任根签发。">
          <Form.Item label="固件版本"><Select aria-describedby={showFirmwareError ? firmwareErrorId : undefined} id="flashing-firmware-version" placeholder="固件版本（必选）" status={showFirmwareError ? "error" : undefined} value={firmwareVersion} options={[
              { label: "v2.3.1（当前灰度）", value: "v2.3.1" },
              { label: "v2.3.0（稳定）", value: "v2.3.0" }
            ]} onChange={(nextVersion) => {
              setFirmwareVersion(nextVersion);
              setShowFirmwareError(false);
            }} /></Form.Item>
          {showFirmwareError ? (
            <p className="generated-field-error" id={firmwareErrorId} role="alert">
              请选择固件版本后再创建烧录任务。
            </p>
          ) : null}
          <Form.Item label="证书模板"><Select placeholder="证书模板" options={[
              { label: "量产设备证书 · 标准", value: "prod-standard" }
            ]} /></Form.Item>
        </FormSection>
        <FormSection
          title="备注与异常路径"
          description="烧录失败将自动进入重试队列；连续失败超限时转入报废登记。"
          actions={<StatusBadge group="flashing" status="flash-failed" />}
        >
          <Form.Item label="任务备注"><Input.TextArea placeholder="任务备注（可选）" rows={3} /></Form.Item>
        </FormSection>
        <div className="generated-actions">
          <Button onClick={() => navigateTianshu("/tianshu/production/inbound")}>取消返回</Button>
          <Button htmlType="submit" type="primary">{page.intentCard.primaryAction}</Button>
        </div>
      </Form>
    </PageLayout>
  );
}

// ===== 页面：生产 · SN/证书管理（list-page，Tabs 分证书 / SN 冲突）=====

function SnCertListPage({ page }: { page: GeneratedPagePlan }) {
  const conflictRows = snRows.filter((row) => row.conflictStatus !== "normal");
  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={<Button>{page.intentCard.primaryAction}</Button>}
      />
      <Tabs  items={toTabsItems([
          {
            key: "cert",
            label: "证书",
            content: (
              <div className="generated-tab-panel">
                <FilterPanel
                  fields={[
                    { name: "sn", label: "SN", placeholder: "TA26-XXXX-XXXX" },
                    {
                      name: "certStatus",
                      label: "证书状态",
                      type: "select",
                      options: [
                        { label: "有效", value: "valid" },
                        { label: "待发", value: "pending" },
                        { label: "已吊销", value: "revoked" }
                      ]
                    }
                  ]}
                />
                <DataSection
                  title="SN 与证书"
                  description={page.flowCard.userGoal}
                  toolbar={<Button >导出</Button>}
                >
                  <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="sn" dataSource={snRows} columns={mapTableColumns([
                      { key: "sn", title: "SN", minReadableWidth: 160 },
                      { key: "firmware", title: "固件版本", responsive: ["sm", "md", "lg", "xl", "xxl"] },
                      {
                        key: "certStatus",
                        title: "证书状态",
                        render: (record) => <StatusBadge group="cert" status={String(record.certStatus)} />
                      },
                      {
                        key: "conflictStatus",
                        title: "冲突状态",
                        render: (record) => <StatusBadge group="snConflict" status={String(record.conflictStatus)} />
                      },
                      { key: "issuedAt", title: "发证时间" },
                      {
                        key: "actions",
                        title: "操作",
                        render: (record) =>
                          record.certStatus === "valid" ? (
                            <Button type="text" danger size="small">吊销</Button>
                          ) : (
                            <span className="generated-muted">—</span>
                          )
                      }
                    ])} pagination={false} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={50} total={480} /></div></div>
                </DataSection>
              </div>
            )
          },
          {
            key: "conflict",
            label: "SN 冲突",
            content: (
              <DataSection
                title="冲突隔离区"
                description="SN 冲突设备自动隔离，完成保留方裁决后恢复可用状态。"
              >
                <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="sn" dataSource={conflictRows} columns={mapTableColumns([
                    { key: "sn", title: "SN", minReadableWidth: 160 },
                    { key: "firmware", title: "固件版本", responsive: ["sm", "md", "lg", "xl", "xxl"] },
                    {
                      key: "conflictStatus",
                      title: "冲突状态",
                      render: (record) => <StatusBadge group="snConflict" status={String(record.conflictStatus)} />
                    },
                    {
                      key: "actions",
                      title: "操作",
                      render: (record) =>
                        record.conflictStatus === "quarantined" ? (
                          <Button size="small">裁决</Button>
                        ) : (
                          <span className="generated-muted">已完成</span>
                        )
                    }
                  ])} pagination={false} /></div></div>
              </DataSection>
            )
          }
        ])} />
    </PageLayout>
  );
}

// ===== 页面：平台 · 账号与权限（list-page，Tabs 分角色 / 权限点）=====

function RbacListPage({ page }: { page: GeneratedPagePlan }) {
  const [roles, setRoles] = useState(roleRows);
  const [disableRole, setDisableRole] = useState<(typeof roleRows)[number] | null>(null);

  const confirmDisableRole = () => {
    if (disableRole) {
      setRoles((current) => current.map((role) => role.id === disableRole.id ? { ...role, status: "disabled" } : role));
    }
    setDisableRole(null);
  };

  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={<Button>{page.intentCard.primaryAction}</Button>}
      />
      <Tabs  items={toTabsItems([
          {
            key: "roles",
            label: "角色",
            content: (
              <div className="generated-tab-panel">
                <FilterPanel
                  fields={[
                    { name: "role", label: "角色名", placeholder: "角色名称" },
                    {
                      name: "domain",
                      label: "所属域",
                      type: "select",
                      options: [
                        { label: "生产", value: "production" },
                        { label: "平台", value: "platform" }
                      ]
                    },
                    {
                      name: "status",
                      label: "状态",
                      type: "select",
                      options: [
                        { label: "启用", value: "enabled" },
                        { label: "停用", value: "disabled" }
                      ]
                    }
                  ]}
                />
                <DataSection title="角色列表" description={page.flowCard.userGoal}>
                  <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={roles} columns={mapTableColumns([
                      { key: "role", title: "角色" },
                      {
                        key: "domain",
                        title: "所属域",
                        render: (record) => <DomainTag domain={record.domain as keyof typeof domainCopy} />
                      },
                      { key: "users", title: "用户数" },
                      { key: "permissions", title: "权限点数" },
                      {
                        key: "status",
                        title: "状态",
                        render: (record) => <StatusBadge group="role" status={String(record.status)} />
                      },
                      {
                        key: "actions",
                        title: "操作",
                        render: (record) =>
                          record.status === "enabled" ? (
                            <Button type="text" danger size="small" onClick={() => setDisableRole(record)}>停用</Button>
                          ) : (
                            <Button type="text" size="small" disabled>已停用</Button>
                          )
                      }
                    ])} pagination={false} /></div></div>
                </DataSection>
              </div>
            )
          },
          {
            key: "permissions",
            label: "权限点",
            content: (
              <DataSection
                title="权限点注册表"
                description="权限点按「域:模块[:对象]:动作」统一命名，便于检索、授权和审计。"
              >
                <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={permissionRows} columns={mapTableColumns([
                    { key: "key", title: "权限点" },
                    { key: "description", title: "说明" },
                    {
                      key: "domain",
                      title: "所属域",
                      render: (record) => <DomainTag domain={record.domain as keyof typeof domainCopy} />
                    }
                  ])} pagination={false} /></div></div>
              </DataSection>
            )
          }
        ])} />
      <Modal
        open={Boolean(disableRole)}
        title="停用角色？"
        okText="确认停用"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onCancel={() => setDisableRole(null)}
        onOk={confirmDisableRole}
      >
        {disableRole ? `角色「${disableRole.role}」停用后，其关联用户将失去对应权限；可由管理员重新启用。` : ""}
      </Modal>
    </PageLayout>
  );
}

function RbacForbiddenPage({ page }: { page: GeneratedPagePlan }) {
  return (
    <PageLayout className="generated-page">
      <ForbiddenState
        title="无权访问账号与权限"
        description="当前账号缺少 platform:rbac:read 权限，角色、用户与权限点数据未加载。请联系平台管理员申请权限，或返回工作台。"
        actions={
          <>
            <Button >联系管理员申请权限</Button>
            <Button onClick={() => navigateTianshu("/tianshu/dashboard")}>返回工作台</Button>
          </>
        }
      />
    </PageLayout>
  );
}

// ===== 第二批模拟数据（字段与 PRD §五/§八 一致，数值为演示值）=====

const testingRows = [
  { sn: "TA26-0002-1101", model: "小豆盒 X1", scheme: "整机功能全检 v3", passed: "10/12", judge: "pending", device: "testing", repair: "first_test", station: "T-03 主测线", testedAt: "2026-07-11 15:20" },
  { sn: "TA26-0002-1088", model: "小豆盒 X1", scheme: "整机功能全检 v3", passed: "9/12", judge: "fail", device: "test_failed", repair: "repair", station: "T-03 主测线", testedAt: "2026-07-11 11:04" },
  { sn: "TA26-0001-9930", model: "小豆盒 X2", scheme: "快速抽测 v1", passed: "12/12", judge: "pass", device: "in_stock", repair: "first_test", station: "T-05 副测线", testedAt: "2026-07-10 18:47" },
  { sn: "TA26-0001-9754", model: "小豆盒 X2", scheme: "快速抽测 v1", passed: "11/12", judge: "downgraded", device: "in_stock", repair: "repair", station: "T-05 副测线", testedAt: "2026-07-10 09:12" }
];

const qcRows = [
  { id: "QC-20260711-000018", inbound: "IB-20260708-001", model: "小豆盒 X1", method: "sampling", total: 500, sampled: 50, defects: 2, rate: "4.00%", overAql: true, conclusion: "qc_inspecting", inspector: "何敏", inspectedAt: "2026-07-11 16:02" },
  { id: "QC-20260710-000017", inbound: "IB-20260708-002", model: "小豆盒 X1", method: "full_inspection", total: 300, sampled: 300, defects: 0, rate: "0.00%", overAql: false, conclusion: "qc_qualified", inspector: "何敏", inspectedAt: "2026-07-10 17:40" },
  { id: "QC-20260710-000016", inbound: "IB-20260707-003", model: "小豆盒 X2", method: "sampling", total: 200, sampled: 32, defects: 1, rate: "3.13%", overAql: false, conclusion: "qc_concession", inspector: "周立", inspectedAt: "2026-07-10 14:25" },
  { id: "QC-20260709-000015", inbound: "IB-20260706-001", model: "小豆盒 X2", method: "sampling", total: 400, sampled: 40, defects: 6, rate: "15.00%", overAql: true, conclusion: "qc_rejected", inspector: "周立", inspectedAt: "2026-07-09 19:08" }
];

const inventoryRows = [
  { id: "TA26-0001-9930", model: "小豆盒 X2", warehouse: "WH01 华东主仓", slot: "WH01-A03-S02-L1", stock: "available", device: "in_stock", inStock: 1, usable: 1, allocated: 0, frozen: 0, quality: "good", inboundAt: "2026-07-10 19:02", agingDays: 2 },
  { id: "IB-20260601-004", model: "小豆盒 X1", warehouse: "WH01 华东主仓", slot: "WH01-B01-S04-L2", stock: "allocated", device: "in_stock", inStock: 120, usable: 0, allocated: 120, frozen: 0, quality: "good", inboundAt: "2026-06-01 10:30", agingDays: 41 },
  { id: "IB-20260408-002", model: "小豆盒 X1", warehouse: "WH02 华南分仓", slot: "WH02-A02-S01-L3", stock: "frozen", device: "in_stock", inStock: 60, usable: 0, allocated: 0, frozen: 60, quality: "good", inboundAt: "2026-04-08 09:15", agingDays: 95 },
  { id: "IB-20251220-006", model: "小豆盒 X2", warehouse: "WH02 华南分仓", slot: "WH02-C01-S03-L1", stock: "degraded", device: "in_stock", inStock: 18, usable: 18, allocated: 0, frozen: 0, quality: "degraded_quality", inboundAt: "2025-12-20 15:44", agingDays: 204 }
];

const shippingRows = [
  { id: "SH-20260711-00031", customer: "华南分销渠道 A", model: "TA-G01", quantity: 200, scanned: 200, logistics: "顺丰速运", trackingNo: "SF1381027745023", status: "shipped", shipper: "赵仓", shippedAt: "2026-07-11 17:32" },
  { id: "SH-20260712-00032", customer: "华东直营仓", model: "TA-G01", quantity: 150, scanned: 80, logistics: "—", trackingNo: "—", status: "picking", shipper: "—", shippedAt: "—" },
  { id: "SH-20260712-00033", customer: "北方分销渠道 B", model: "TA-G02", quantity: 100, scanned: 0, logistics: "—", trackingNo: "—", status: "pending", shipper: "—", shippedAt: "—" },
  { id: "SH-20260709-00029", customer: "华南分销渠道 A", model: "TA-G02", quantity: 80, scanned: 0, logistics: "—", trackingNo: "—", status: "cancelled", shipper: "—", shippedAt: "—" }
];

const auditRows = [
  { id: "LOG202607121004321", time: "2026-07-12 10:41:07", operator: "张三 (EMP00123)", opType: "权限变更", target: "role:platform-admin", domain: "platform", summary: "为角色[平台管理员]追加权限点 platform:audit:export", risk: "high", result: "success", sensitive: true },
  { id: "LOG202607121003876", time: "2026-07-12 09:58:33", operator: "李四 (EMP00245)", opType: "状态变更", target: "TA26-0002-1088", domain: "production", summary: "将设备 TA26-0002-1088 状态从[测试中]变更为[测试不合格]", risk: "low", result: "success", sensitive: false },
  { id: "LOG202607112009654", time: "2026-07-11 23:12:50", operator: "王五 (EMP00312)", opType: "导出", target: "ad-billing-2026Q2", domain: "ad", summary: "导出广告计费对账单（含结算金额字段），非工作时段操作", risk: "medium", result: "success", sensitive: true },
  { id: "LOG202607111998210", time: "2026-07-11 20:05:11", operator: "陈六 (EMP00098)", opType: "编辑", target: "content-slot-006", domain: "content", summary: "修改内容位[开机推荐位]的排期策略，参数校验失败", risk: "low", result: "failed", sensitive: false }
];

// ===== 页面：生产 · 测试管理（list-page）=====

function TestingListPage({ page }: { page: GeneratedPagePlan }) {
  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={
          <span className="generated-row-actions">
            <Button >新建测试方案</Button>
            <Button onClick={() => emitTianshuNotice("测试结果录入入口已触发；本地演示未写入外部业务系统。")}>录入测试结果</Button>
          </span>
        }
      />
      <FilterPanel
        fields={[
          { name: "sn", label: "SN", placeholder: "TA26-XXXX-XXXX" },
          {
            name: "model",
            label: "机型",
            type: "select",
            options: [
              { label: "小豆盒 X1", value: "x1" },
              { label: "小豆盒 X2", value: "x2" }
            ]
          },
          {
            name: "judge",
            label: "判定结果",
            type: "select",
            options: [
              { label: "合格", value: "pass" },
              { label: "不合格", value: "fail" },
              { label: "待判定", value: "pending" },
              { label: "已降级", value: "downgraded" },
              { label: "已报废", value: "scrapped" }
            ]
          },
          {
            name: "device",
            label: "设备状态",
            type: "select",
            options: [
              { label: "测试中", value: "testing" },
              { label: "测试不合格", value: "test_failed" },
              { label: "合格入库", value: "in_stock" },
              { label: "已报废", value: "scrapped" }
            ]
          },
          {
            name: "repair",
            label: "是否返修",
            type: "select",
            options: [
              { label: "返修件", value: "repair" },
              { label: "首测", value: "first_test" }
            ]
          }
        ]}
      />
      <DataSection
        title="测试记录"
        description={page.flowCard.userGoal}
        toolbar={<Button >批量导出</Button>}
      >
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="sn" dataSource={testingRows} columns={mapTableColumns([
            { key: "sn", title: "SN" },
            { key: "model", title: "机型" },
            { key: "scheme", title: "测试方案" },
            { key: "passed", title: "通过项" },
            {
              key: "judge",
              title: "判定结果",
              render: (record) => <StatusBadge group="testJudge" status={String(record.judge)} />
            },
            {
              key: "device",
              title: "设备状态",
              render: (record) => <StatusBadge group="deviceStatus" status={String(record.device)} />
            },
            {
              key: "repair",
              title: "返修标记",
              render: (record) => <StatusBadge group="repairMark" status={String(record.repair)} />
            },
            { key: "station", title: "测试工位" },
            { key: "testedAt", title: "测试时间" },
            {
              key: "actions",
              title: "操作",
              render: (record) => (
                <span className="generated-row-actions">
                  <Button type="text" size="small">查看详情</Button>
                  {record.device === "testing" ? (
                    <Dropdown
                      menu={{ items: [
                        { key: "pass", label: "判定合格" },
                        { key: "fail", label: "判定不合格", danger: true },
                        { key: "record", label: "录入结果" }
                      ] }}
                      trigger={["click"]}
                    >
                      <Button aria-label="更多测试操作" icon={<MoreOutlined aria-hidden="true" aria-label={undefined} />} type="text" size="small" />
                    </Dropdown>
                  ) : record.device === "test_failed" ? (
                    <Dropdown
                      menu={{ items: [
                        { key: "retest", label: "返修回测" },
                        { key: "downgrade", label: "降级入库" },
                        { key: "scrap", label: "报废", danger: true }
                      ] }}
                      trigger={["click"]}
                    >
                      <Button aria-label="更多测试操作" icon={<MoreOutlined aria-hidden="true" aria-label={undefined} />} type="text" size="small" />
                    </Dropdown>
                  ) : null}
                </span>
              )
            }
          ])} pagination={false} rowSelection={{}} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={132} /></div></div>
      </DataSection>
    </PageLayout>
  );
}

// ===== 页面：生产 · 质检管理（list-page）=====

function QcListPage({ page }: { page: GeneratedPagePlan }) {
  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={<Button onClick={() => emitTianshuNotice("新建质检任务入口已触发；本地演示未写入外部业务系统。")}>新建质检任务</Button>}
      />
      <FilterPanel
        fields={[
          { name: "batchId", label: "质检批次号", placeholder: "QC-YYYYMMDD-NNNNNN" },
          {
            name: "model",
            label: "机型",
            type: "select",
            options: [
              { label: "小豆盒 X1", value: "x1" },
              { label: "小豆盒 X2", value: "x2" }
            ]
          },
          {
            name: "method",
            label: "检验方式",
            type: "select",
            options: [
              { label: "抽检", value: "sampling" },
              { label: "全检", value: "full_inspection" }
            ]
          },
          {
            name: "conclusion",
            label: "判定结论",
            type: "select",
            options: [
              { label: "待质检", value: "qc_pending" },
              { label: "质检中", value: "qc_inspecting" },
              { label: "合格放行", value: "qc_qualified" },
              { label: "让步接收降级", value: "qc_concession" },
              { label: "拒收", value: "qc_rejected" }
            ]
          }
        ]}
      />
      <DataSection
        title="质检批次"
        description={page.flowCard.userGoal}
        toolbar={<Button >导出</Button>}
      >
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={qcRows} columns={mapTableColumns([
            { key: "id", title: "质检批次号" },
            { key: "inbound", title: "关联收货批次" },
            { key: "model", title: "机型" },
            {
              key: "method",
              title: "检验方式",
              render: (record) => <StatusBadge group="inspectionMethod" status={String(record.method)} />
            },
            { key: "total", title: "批次总数" },
            { key: "sampled", title: "抽样数" },
            {
              key: "defects",
              title: "不良数",
              render: (record) =>
                Number(record.defects) > 0 ? (
                  <span className="generated-count--alert">{String(record.defects)}</span>
                ) : (
                  String(record.defects)
                )
            },
            {
              key: "rate",
              title: "不良率",
              render: (record) =>
                record.overAql ? <span className="generated-count--alert">{String(record.rate)}</span> : String(record.rate)
            },
            {
              key: "conclusion",
              title: "判定结论",
              render: (record) => <StatusBadge group="qcConclusion" status={String(record.conclusion)} />
            },
            { key: "inspector", title: "质检员" },
            { key: "inspectedAt", title: "质检时间" },
            {
              key: "actions",
              title: "操作",
              render: (record) => (
                <span className="generated-row-actions">
                  <Button type="text" size="small">查看详情</Button>
                  {record.conclusion === "qc_pending" ? (
                    <Dropdown menu={{ items: [{ key: "start", label: "开始质检" }] }} trigger={["click"]}>
                      <Button aria-label="更多质检操作" icon={<MoreOutlined aria-hidden="true" aria-label={undefined} />} type="text" size="small" />
                    </Dropdown>
                  ) : record.conclusion === "qc_inspecting" ? (
                    <Dropdown menu={{ items: [
                      { key: "record-defect", label: "录入不良" },
                      { key: "conclude", label: "判定结论" }
                    ] }} trigger={["click"]}>
                      <Button aria-label="更多质检操作" icon={<MoreOutlined aria-hidden="true" aria-label={undefined} />} type="text" size="small" />
                    </Dropdown>
                  ) : record.conclusion === "qc_qualified" ||
                    record.conclusion === "qc_concession" ||
                    record.conclusion === "qc_rejected" ? (
                    <Dropdown menu={{ items: [{ key: "revoke", label: "撤销判定", danger: true }] }} trigger={["click"]}>
                      <Button aria-label="更多质检操作" icon={<MoreOutlined aria-hidden="true" aria-label={undefined} />} type="text" size="small" />
                    </Dropdown>
                  ) : null}
                </span>
              )
            }
          ])} pagination={false} rowSelection={{}} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={57} /></div></div>
      </DataSection>
    </PageLayout>
  );
}

// ===== 页面：生产 · 库存管理（list-page）=====

function InventoryListPage({ page }: { page: GeneratedPagePlan }) {
  const [rows, setRows] = useState(inventoryRows);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [batchFreezeOpen, setBatchFreezeOpen] = useState(false);
  const inventoryFocusRef = useRef<HTMLElement>(null);
  const freezableSelectedCount = rows.filter((row) => selectedRowKeys.includes(row.id) && row.stock === "available").length;

  const openBatchFreeze = () => {
    setBatchFreezeOpen(true);
  };

  const cancelBatchFreeze = () => {
    setBatchFreezeOpen(false);
  };

  const confirmBatchFreeze = () => {
    const selected = new Set(selectedRowKeys);
    setRows((current) => current.map((row) => selected.has(row.id) && row.stock === "available"
      ? { ...row, stock: "frozen", usable: 0, frozen: row.frozen + row.usable }
      : row));
    setBatchFreezeOpen(false);
    setSelectedRowKeys([]);
  };

  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={<Button>新建调拨单</Button>}
      />
      <FilterPanel
        fields={[
          { name: "id", label: "SN / 批次号", placeholder: "SN 或 IB-YYYYMMDD-XXX" },
          {
            name: "warehouse",
            label: "仓库",
            type: "select",
            options: [
              { label: "WH01 华东主仓", value: "wh01" },
              { label: "WH02 华南分仓", value: "wh02" }
            ]
          },
          {
            name: "stock",
            label: "库存状态",
            type: "select",
            options: [
              { label: "可用", value: "available" },
              { label: "冻结", value: "frozen" },
              { label: "已分配出货", value: "allocated" },
              { label: "降级品", value: "degraded" }
            ]
          },
          {
            name: "quality",
            label: "品质等级",
            type: "select",
            options: [
              { label: "良品", value: "good" },
              { label: "降级品", value: "degraded_quality" }
            ]
          }
        ]}
      />
      <DataSection
        ref={inventoryFocusRef}
        title="库存记录"
        description={page.flowCard.userGoal}
        toolbar={
          <span className="generated-row-actions">
            <Button >盘点录入</Button>
            <Button >导出</Button>
          </span>
        }
      >
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={rows} columns={mapTableColumns([
            { key: "id", title: "SN / 批次号" },
            { key: "model", title: "机型" },
            { key: "warehouse", title: "仓库" },
            { key: "slot", title: "库位" },
            {
              key: "stock",
              title: "库存状态",
              render: (record) => <StatusBadge group="stockStatus" status={String(record.stock)} />
            },
            {
              key: "device",
              title: "设备状态",
              render: (record) => <StatusBadge group="deviceStatus" status={String(record.device)} />
            },
            { key: "inStock", title: "在库（台）" },
            {
              key: "usable",
              title: "可用（台）",
              render: (record) =>
                Number(record.usable) <= 0 ? (
                  <span className="generated-count--alert">{String(record.usable)}</span>
                ) : (
                  String(record.usable)
                )
            },
            { key: "allocated", title: "已分配（台）" },
            { key: "frozen", title: "冻结（台）" },
            {
              key: "quality",
              title: "品质等级",
              render: (record) => <StatusBadge group="qualityGrade" status={String(record.quality)} />
            },
            { key: "inboundAt", title: "入库时间" },
            {
              key: "agingDays",
              title: "库龄（天）",
              render: (record) => {
                const days = Number(record.agingDays);
                const tone =
                  days > 180 ? "generated-aging--danger" : days >= 90 ? "generated-aging--warning" : undefined;
                return <span className={tone}>{days}</span>;
              }
            },
            {
              key: "actions",
              title: "操作",
              render: (record) => (
                <span className="generated-row-actions">
                  <Button type="text" size="small">查看详情</Button>
                  <Dropdown
                    menu={{ items: [
                      ...(record.stock === "available"
                        ? [
                            { key: "transfer", label: "调拨" },
                            { key: "freeze", label: "冻结", danger: true },
                            ...(record.device === "in_stock" ? [{ key: "allocate", label: "分配出货" }] : [])
                          ]
                        : record.stock === "frozen"
                          ? [{ key: "unfreeze", label: "解冻" }]
                          : []),
                      { key: "adjust", label: "盘点调整" }
                    ] }}
                    trigger={["click"]}
                  >
                    <Button aria-label="更多库存操作" icon={<MoreOutlined aria-hidden="true" aria-label={undefined} />} type="text" size="small" />
                  </Dropdown>
                </span>
              )
            }
          ])} pagination={false} rowSelection={rowSelectionConfig(selectedRowKeys, setSelectedRowKeys)} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={86} /></div></div>
        <BulkActionBar selectedCount={selectedRowKeys.length} onClearSelection={() => setSelectedRowKeys([])}>
          <Button danger disabled={freezableSelectedCount === 0} onClick={openBatchFreeze}>批量冻结</Button>
          <Button >批量解冻</Button>
        </BulkActionBar>
      </DataSection>
      <Modal
        open={batchFreezeOpen}
        title="批量冻结库存？"
        okText="确认冻结"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onCancel={cancelBatchFreeze}
        onOk={confirmBatchFreeze}
      >
        {`已选 ${selectedRowKeys.length} 条，其中 ${freezableSelectedCount} 条可用记录将被冻结；其他状态会跳过。冻结后不可分配出货，可由有权限的人员解冻。`}
      </Modal>
    </PageLayout>
  );
}

// ===== 页面：生产 · 出货管理（list-page）=====

function scannedCell(record: (typeof shippingRows)[number]) {
  if (record.status === "cancelled") return <span className="generated-muted">—</span>;
  if (record.scanned < record.quantity) return <span className="generated-scan--partial">{record.scanned}</span>;
  return <span className="generated-scan--complete">{record.scanned}</span>;
}

function ShippingListPage({ page }: { page: GeneratedPagePlan }) {
  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={<Button onClick={() => emitTianshuNotice("新建出货单入口已触发；本地演示未写入外部业务系统。")}>新建出货单</Button>}
      />
      <FilterPanel
        fields={[
          { name: "orderId", label: "出货单号", placeholder: "SH-YYYYMMDD-XXXXX" },
          {
            name: "customer",
            label: "客户 / 渠道",
            type: "select",
            options: [
              { label: "华南分销渠道 A", value: "south-a" },
              { label: "华东直营仓", value: "east-direct" },
              { label: "北方分销渠道 B", value: "north-b" }
            ]
          },
          {
            name: "status",
            label: "出货状态",
            type: "select",
            options: [
              { label: "待出库", value: "pending" },
              { label: "拣货中", value: "picking" },
              { label: "已发运", value: "shipped" },
              { label: "部分发运", value: "partial_shipped" },
              { label: "已取消", value: "cancelled" }
            ]
          }
        ]}
      />
      <DataSection
        title="出货单"
        description={page.flowCard.userGoal}
        toolbar={<Button >导出</Button>}
      >
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={shippingRows} columns={mapTableColumns([
            { key: "id", title: "出货单号" },
            { key: "customer", title: "客户 / 渠道" },
            { key: "model", title: "机型" },
            { key: "quantity", title: "出货数量" },
            {
              key: "scanned",
              title: "已扫描",
              render: (record) => scannedCell(record as (typeof shippingRows)[number])
            },
            { key: "logistics", title: "物流商" },
            { key: "trackingNo", title: "物流单号" },
            {
              key: "status",
              title: "出货状态",
              render: (record) => <StatusBadge group="shippingOrder" status={String(record.status)} />
            },
            { key: "shipper", title: "发货人" },
            { key: "shippedAt", title: "发货时间" },
            {
              key: "actions",
              title: "操作",
              render: (record) => (
                <span className="generated-row-actions">
                  <Button type="text" size="small">查看详情</Button>
                  <Dropdown
                    menu={{ items: [
                      ...(record.status === "pending" || record.status === "picking" ? [{ key: "scan", label: "出库扫描" }] : []),
                      ...(record.status === "picking" || record.status === "shipped" ? [{ key: "logistics", label: "登记物流" }] : []),
                      ...((record.status === "pending" || record.status === "picking") && Number(record.scanned) === 0
                        ? [{ key: "cancel", label: "取消出货", danger: true }]
                        : [])
                    ] }}
                    trigger={["click"]}
                  >
                    <Button aria-label="更多出货操作" icon={<MoreOutlined aria-hidden="true" aria-label={undefined} />} type="text" size="small" />
                  </Dropdown>
                </span>
              )
            }
          ])} pagination={false} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={44} /></div></div>
      </DataSection>
    </PageLayout>
  );
}

// ===== 页面：平台 · 审计日志（list-page · 只读，无任何新建/编辑/删除入口）=====

function AuditListPage({ page }: { page: GeneratedPagePlan }) {
  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader
        title={page.title}
        description={page.intentCard.pageGoal}
        actions={
          <span className="generated-row-actions">
            <Button >导出日志</Button>
            <Button onClick={() => emitTianshuNotice("按 SN 追溯入口已触发；本地演示未查询外部审计系统。")}>按 SN 追溯</Button>
          </span>
        }
      />
      <FilterPanel
        advancedContent={(
          <div className="tianshu-ui-filter__field">
            <label>操作时间</label>
            <DatePicker.RangePicker aria-label="操作时间范围" placeholder={["开始日期", "结束日期"]} />
          </div>
        )}
        fields={[
          { name: "operator", label: "操作人", placeholder: "姓名或工号" },
          {
            name: "opType",
            label: "操作类型",
            type: "select",
            options: [
              { label: "登录/登出", value: "login" },
              { label: "新建", value: "create" },
              { label: "编辑", value: "edit" },
              { label: "导出", value: "export" },
              { label: "状态变更", value: "status-change" },
              { label: "权限变更", value: "permission-change" }
            ]
          },
          {
            name: "domain",
            label: "所属域",
            type: "select",
            options: [
              { label: "生产", value: "production" },
              { label: "广告", value: "ad" },
              { label: "内容", value: "content" },
              { label: "平台", value: "platform" }
            ]
          },
          {
            name: "risk",
            label: "风险等级",
            type: "select",
            options: [
              { label: "低风险", value: "low" },
              { label: "中风险", value: "medium" },
              { label: "高风险", value: "high" }
            ]
          },
          {
            name: "result",
            label: "操作结果",
            type: "select",
            options: [
              { label: "成功", value: "success" },
              { label: "失败", value: "failed" }
            ]
          }
        ]}
      />
      <DataSection
        title="审计日志"
        description="日志由平台后端自动写入，禁止手工新增/编辑/删除。"
        toolbar={<Button >批量导出选中条目</Button>}
      >
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table generated-audit-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" rowClassName={(record: (typeof auditRows)[number]) =>
            record.risk === "high"
              ? "generated-audit-row--high"
              : record.result === "failed"
                ? "generated-audit-row--failed"
                : ""
          } dataSource={auditRows} columns={mapTableColumns([
            { key: "id", title: "日志 ID" },
            { key: "time", title: "操作时间" },
            { key: "operator", title: "操作人" },
            {
              key: "opType",
              title: "操作类型",
              render: (record) => (
                <span className="generated-row-actions">
                  <span>{String(record.opType)}</span>
                  {record.sensitive ? <StatusBadge group="auditSensitivity" status="sensitive" /> : null}
                </span>
              )
            },
            { key: "target", title: "操作对象", width: 180 },
            {
              key: "domain",
              title: "所属域",
              render: (record) => <DomainTag domain={record.domain as keyof typeof domainCopy} />
            },
            { key: "summary", title: "操作内容摘要", width: 260 },
            {
              key: "risk",
              title: "风险等级",
              render: (record) => <StatusBadge group="auditRisk" status={String(record.risk)} />
            },
            {
              key: "result",
              title: "操作结果",
              render: (record) => <StatusBadge group="auditResult" status={String(record.result)} />
            },
            {
              key: "actions",
              title: "操作",
              render: () => <Button type="text" size="small">详情</Button>
            }
          ])} pagination={false} rowSelection={{}} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={1024} /></div></div>
      </DataSection>
    </PageLayout>
  );
}
