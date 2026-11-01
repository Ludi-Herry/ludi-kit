// 页面区块表（静态数据，2026-10-03；2026-10-04 第 3 期扩到全部 14 页；2026-10-05 第 4 项改为「映射数据 + 一处派生」）。
// 权威划分（两份数据各占一头，不回抄）：
//   - 页面对应关系（本文件 PAGE_BLOCK_MAP）：每块的 selector / name / purpose / layoutTreeItem / firstViewportItem /
//     successCriteria / doNotOnDelete / source，以及它对应 patterns 里的哪个区域 id（region 只存 id 字符串）。
//   - 模式模具（kit/patterns.manifest.json 的 regions）：区域 id 的 locked / owner 唯一权威。
// 生效区块登记 PAGE_REGISTRIES 由 page-mold-derive.mjs 的 deriveRegistries 一处派生
// （编辑器壳经本文件、editor-server/blocks.mjs 读同一派生模块），逐字段等价验收见
// editor-dispatch/G-page-mold-outcome-2026-10-05.md 的 0 差异报告。
// 数据来源：
//   - kit/projects/tianshu-device-ops/pages.json 各页条目（layoutTree、intentCard.firstViewport / pageGoal / successCriteria、flowCard.userGoal）
//   - kit/patterns.manifest.json 的 list-page / detail-page / form-page / dashboard-page（regions 的 id 与 locked、doNot）
//   - kit/projects/tianshu-device-ops/generated/*.tsx 各页根节点（div.device-ops-stack；feedback 为 div.device-ops-page.feedback-page）
//     在默认数据状态下的直接子元素（选择器）；条件渲染直出的元素（横幅、批量操作条）也算直接子元素。
// 用途与规则文字抄原文或压缩，不另编业务含义；每处都在 source 里写明出处字段。
// 合同 layoutTree 里有、但源码中是浮层（Modal / Drawer 走 portal）或嵌在某直接子元素内部的条目不登记为区块，
// 具体清单见 editor-dispatch/G-blocks-phase3-outcome-2026-10-04.md 的对照表。
// 本文件同时被编辑器外壳（右栏）与小豆盒 iframe 子端（DOM 预览）引用，只放纯数据，不依赖 React。

import patternsManifest from "../../../patterns.manifest.json";
import { deriveRegistries } from "./page-mold-derive.mjs";

export type PageBlock = {
  id: string;
  /** 相对于页面根容器的直接子元素选择器（以 :scope > 开头）。 */
  selector: string;
  name: string;
  purpose: string;
  /** pages.json layoutTree 里对应的那一项。 */
  layoutTreeItem: string;
  /** pages.json intentCard.firstViewport 里对应的那一项；不在首屏必需清单里为 null。 */
  firstViewportItem: string | null;
  /** patterns.manifest.json 本页 pattern 的 regions 里对应的区域；没有对应区域为 null。 */
  region: { id: string; locked: boolean; owner: "pattern" | "page" } | null;
  /** 与该区块有关的 successCriteria（原文或压缩）。 */
  successCriteria: string[];
  /** 删除该区块时命中的 patterns.doNot 原文。 */
  doNotOnDelete: string[];
  source: string;
};

export type PageRegistry = {
  pageId: string;
  /** 页面内路径（不含 /device-ops 前缀）。 */
  route: string;
  patternId: string;
  patternLabel: string;
  pageGoal: string;
  rootSelector: string;
  firstViewport: string[];
  requiredComponents: string[];
  blocks: PageBlock[];
};

/** 页面对应关系的区块：region 只存 patterns 区域的 id 字符串；locked / owner 由派生时从 patterns.manifest.json 取。 */
export type PageBlockMapBlock = Omit<PageBlock, "region"> & { region: string | null };
export type PageBlockMapEntry = Omit<PageRegistry, "blocks"> & { blocks: PageBlockMapBlock[] };

export const PAGE_BLOCK_MAP: PageBlockMapEntry[] = [
  {
    pageId: "device-list",
    route: "/devices",
    patternId: "list-page",
    patternLabel: "列表页",
    pageGoal: "按角色默认视角浏览全部设备，用阶段、状态和筛选快速收窄到目标设备。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页面标题与视图切换", "阶段分布条", "筛选区（5 常驻 + 6 收纳）", "设备表格"],
    requiredComponents: ["PageLayout", "PageHeader", "FilterPanel", "DataSection", "DataGrid"],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-title-row",
        name: "页头与视图切换",
        purpose: "按角色默认视角浏览全部设备",
        layoutTreeItem: "PageHeader + 视图切换",
        firstViewportItem: "页面标题与视图切换",
        region: "shell",
        successCriteria: ["默认视图在视图名旁标“默认”"],
        doNotOnDelete: [],
        source:
          "名称与首屏项：intentCard.firstViewport[0]；用途：intentCard.pageGoal 前半句；区域：list-page.regions 的 shell（页头归入壳层，按 layout 列表推断）；规则：successCriteria[5] 压缩"
      },
      {
        id: "phase",
        selector: ':scope > section[aria-label="生命周期阶段"]',
        name: "阶段分布条",
        purpose: "用阶段快速收窄到目标设备",
        layoutTreeItem: "阶段分布条",
        firstViewportItem: "阶段分布条",
        region: null,
        successCriteria: ["阶段条计数按当前视图与已生效筛选重算，互斥阶段置灰显示 0；阶段选择随我的视图保存。"],
        doNotOnDelete: [],
        source:
          "名称与首屏项：layoutTree[1] / firstViewport[1]；用途：pageGoal 中间句；规则：successCriteria[4] 去掉日期前缀；list-page 没有对应区域"
      },
      {
        id: "filter",
        selector: ':scope > section[aria-label="筛选"]',
        name: "筛选区",
        purpose: "用状态和筛选快速收窄到目标设备",
        layoutTreeItem: "筛选区",
        firstViewportItem: "筛选区（5 常驻 + 6 收纳）",
        region: "filter",
        successCriteria: ["常驻筛选恰好 5 个，收纳筛选恰好 6 个。", "刷新后普通条件保留，绑定手机号清空。"],
        doNotOnDelete: ["表格页没有筛选区"],
        source:
          "名称：layoutTree[2]；首屏项：firstViewport[2]；用途：pageGoal 后半句；区域：list-page.regions 的 filter（locked）；规则：successCriteria[0]、[1]；禁止项：list-page.doNot[0]"
      },
      {
        id: "table",
        selector: ':scope > section[aria-label="设备列表"]',
        name: "工具栏与表格",
        purpose: "在一张表里找到需要处理的那台设备，一眼看出轻重缓急",
        layoutTreeItem: "工具栏 + Table",
        firstViewportItem: "设备表格",
        region: "data",
        successCriteria: [
          "空态区分无数据与筛选无结果；加载、失败重试、无导出权限均有处理。",
          "操作列平铺不设更多菜单；默认排序列（未处理告警）在所有宽度可见；0 显示 0。"
        ],
        doNotOnDelete: [],
        source:
          "名称：layoutTree[3]；首屏项：firstViewport[3]；用途：flowCard.userGoal；区域：list-page.regions 的 data；规则：successCriteria[2]、[5] 压缩"
      },
      {
        id: "selection",
        selector: ':scope > [aria-label="批量操作"]',
        name: "底部选中操作条",
        purpose: "批量选中后浮出已选操作条",
        layoutTreeItem: "底部选中操作条",
        firstViewportItem: null,
        region: null,
        successCriteria: ["批量选中后底部浮出已选操作条。"],
        doNotOnDelete: [],
        source: "名称：layoutTree[4]；用途与规则：successCriteria[3]；不在 firstViewport；list-page 没有对应区域；只在选中设备后出现"
      }
    ]
  },
  {
    pageId: "device-detail",
    route: "/devices/:sn",
    patternId: "detail-page",
    patternLabel: "详情页",
    pageGoal: "22 个核心字段支撑日常判断，其余 46 个按需展开，异常时浮到顶部。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["标题区（SN、机型、批次、生命周期、在网）", "异常横幅（有未处理告警时）", "四组核心字段"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-detail-head",
        name: "页头（SN 与状态）",
        purpose: "打开一台设备就能判断它现在好不好、问题在哪、下一步找谁",
        layoutTreeItem: "PageHeader",
        firstViewportItem: "标题区（SN、机型、批次、生命周期、在网）",
        region: "shell",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：flowCard.userGoal；区域：detail-page.regions 的 shell"
      },
      {
        id: "banner",
        selector: ":scope > .ant-alert",
        name: "异常横幅",
        purpose: "异常时浮到顶部，可跳去告警处置",
        layoutTreeItem: "Alert 横幅",
        firstViewportItem: "异常横幅（有未处理告警时）",
        region: null,
        successCriteria: ["有未处理告警时顶部横幅出现并可跳告警处置，无告警不占位。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[1] / firstViewport[1]；用途：pageGoal 后半句；规则：successCriteria[1]；只在有未处理告警时出现"
      },
      {
        id: "core",
        selector: ':scope > section[aria-label="核心信息"]',
        name: "核心字段（4 组）",
        purpose: "22 个核心字段支撑日常判断",
        layoutTreeItem: "核心字段（4 组 Descriptions）",
        firstViewportItem: "四组核心字段",
        region: "hero",
        successCriteria: ["常驻恰好 22 个、折叠恰好 46 个，关键字段不截断。", "未出货设备的运行组显示横线并说明。"],
        doNotOnDelete: ["键值信息用 DataGrid 硬凑"],
        source: "名称与首屏项：layoutTree[2] / firstViewport[2]；用途：pageGoal 前半句；区域：detail-page.regions 的 hero（locked）；规则：successCriteria[0]、[2]；禁止项：detail-page.doNot[1]"
      },
      {
        id: "more",
        selector: ':scope > section[aria-label="更多信息"]',
        name: "折叠区（更多信息 Tabs）",
        purpose: "其余 46 个字段按需展开",
        layoutTreeItem: "折叠区 Tabs（6 组）",
        firstViewportItem: null,
        region: "sections",
        successCriteria: ["常驻恰好 22 个、折叠恰好 46 个，关键字段不截断。"],
        doNotOnDelete: [],
        source: "名称：layoutTree[3]；用途：pageGoal 中间句；区域：detail-page.regions 的 sections；规则：successCriteria[0]；不在 firstViewport"
      }
    ]
  },
  {
    pageId: "alerts",
    route: "/alerts",
    patternId: "list-page",
    patternLabel: "列表页",
    pageGoal: "按状态分栏处理告警，每条告警用三段式说明，直接转工单。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页面标题", "状态分栏（带计数）与筛选", "左侧告警列表", "右侧告警详情"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-title-row",
        name: "页头",
        purpose: "告警处置",
        layoutTreeItem: "PageHeader",
        firstViewportItem: "页面标题",
        region: "shell",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：页面标题；区域：list-page.regions 的 shell"
      },
      {
        id: "filter",
        selector: ':scope > section[aria-label="告警筛选"]',
        name: "状态分栏与筛选",
        purpose: "按状态分栏处理告警，先处理最要紧的",
        layoutTreeItem: "状态 Tabs + 筛选",
        firstViewportItem: "状态分栏（带计数）与筛选",
        region: "filter",
        successCriteria: ["转工单后状态、计数、工单号同步变化。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[1] / firstViewport[1]（Tabs 与筛选在源码同一个 section 内）；用途：pageGoal 前半句 + flowCard.userGoal 前半句；区域：list-page.regions 的 filter（locked）；规则：successCriteria[1]"
      },
      {
        id: "split",
        selector: ":scope > .device-ops-alert-layout",
        name: "告警列表与详情（三段式）",
        purpose: "看懂影响，一步转成工单或处理掉",
        layoutTreeItem: "左列表 + 右详情（三段式）",
        firstViewportItem: "左侧告警列表",
        region: "data",
        successCriteria: ["每条告警详情都有发生了什么、影响、下一步三段。", "标记已处理必填处理结论并写入处置记录；静默需二次确认。"],
        doNotOnDelete: [],
        source: "名称：layoutTree[2]；首屏项：firstViewport[2]（firstViewport[3]「右侧告警详情」与该区块同源）；用途：flowCard.userGoal 后半句；区域：list-page.regions 的 data；规则：successCriteria[0]、[4] 压缩"
      }
    ]
  },
  {
    pageId: "dashboard",
    route: "/dashboard",
    patternId: "dashboard-page",
    patternLabel: "看板页",
    pageGoal: "按角色默认卡片集 + 模块查看权限 + 个性化配置渲染卡片看板。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页面标题", "全局操作行（时间范围 / 刷新全部 / 编辑布局）", "卡片栅格（每卡独立加载）"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-title-row",
        name: "页面标题与全局操作",
        purpose: "每天第一屏的标题、时间范围与刷新、编辑布局入口",
        layoutTreeItem: "页面标题",
        firstViewportItem: "页面标题",
        region: "shell",
        successCriteria: ["时间范围默认「今日」，页头可见「上次刷新时间」。"],
        doNotOnDelete: [],
        source: "名称：layoutTree[0]（layoutTree[1]「全局操作行」在源码里嵌在页头内部，见交回对照表）；首屏项：firstViewport[0]（firstViewport[1] 与页头同源）；区域：dashboard-page.regions 的 shell；规则：successCriteria[3]"
      },
      {
        id: "grid",
        selector: ':scope > section[aria-label="工作台卡片"]',
        name: "卡片栅格（响应式）",
        purpose: "一眼看到今天要处理的待办与告警，点卡片直达目标模块",
        layoutTreeItem: "卡片栅格（响应式）",
        firstViewportItem: "卡片栅格（每卡独立加载）",
        region: "content",
        successCriteria: ["「离线告警」卡角标数字 = 告警待处理条数，点击跳转 /alerts?status=open 行数一致。", "编辑态移除卡片出现带「撤销」的轻提示。", "注入单卡失败后该卡显示「加载失败，点击重试」且其余卡片不受阻塞。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[2] / firstViewport[2]；用途：flowCard.userGoal；区域：dashboard-page.regions 的 content；规则：successCriteria[0]、[1]、[2] 压缩"
      }
    ]
  },
  {
    pageId: "passport-list",
    route: "/lifecycle/passport",
    patternId: "list-page",
    patternLabel: "列表页",
    pageGoal: "档案只读查询列表：10 列字段全取自 PRD，筛选常驻 4 + 收纳 4，批量操作浮出。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页面标题", "筛选区（SN 首位）", "护照表格", "底部批量操作条（选中浮出）"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-title-row",
        name: "页头",
        purpose: "按 SN 或条件查到一台设备的完整履历",
        layoutTreeItem: "页面标题",
        firstViewportItem: "页面标题",
        region: "shell",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：flowCard.userGoal 前半句；区域：list-page.regions 的 shell"
      },
      {
        id: "filter",
        selector: ':scope > section[aria-label="护照查询筛选区"]',
        name: "筛选区",
        purpose: "按条件收窄到目标设备的档案",
        layoutTreeItem: "筛选区（常驻 + 收纳）",
        firstViewportItem: "筛选区（SN 首位）",
        region: "filter",
        successCriteria: ["SN 前缀模糊匹配，重置后恢复出厂日期降序、未出货排最后。"],
        doNotOnDelete: ["表格页没有筛选区"],
        source: "名称与首屏项：layoutTree[1] / firstViewport[1]；用途：pageGoal 前半句压缩；区域：list-page.regions 的 filter（locked）；规则：successCriteria[0]；禁止项：list-page.doNot[0]"
      },
      {
        id: "table",
        selector: ':scope > section[aria-label="数字护照列表"]',
        name: "工具栏与护照表格",
        purpose: "10 列字段全取自 PRD 的只读档案列表",
        layoutTreeItem: "工具栏 + Table",
        firstViewportItem: "护照表格",
        region: "data",
        successCriteria: ["RMA 次数 0 显示浅色 0，≥1 显示橙色数字。", "只读视角下单行与批量操作置灰，悬停写明缺的权限点。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[2] / firstViewport[2]；用途：pageGoal 前半句；区域：list-page.regions 的 data；规则：successCriteria[1]、[3]"
      },
      {
        id: "selection",
        selector: ':scope > [aria-label="批量操作条"]',
        name: "底部选中操作条",
        purpose: "批量选中后浮出已选操作条",
        layoutTreeItem: "底部选中操作条",
        firstViewportItem: "底部批量操作条（选中浮出）",
        region: null,
        successCriteria: ["混合状态选中时对应批量按钮置灰并提示「选中项中包含不支持此操作的记录」。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[3] / firstViewport[3]；用途：pageGoal 后半句压缩；规则：successCriteria[2]；list-page 没有对应区域；源码为 aside 元素，只在选中后出现"
      }
    ]
  },
  {
    pageId: "passport-detail",
    route: "/lifecycle/passport/:sn",
    patternId: "detail-page",
    patternLabel: "详情页",
    pageGoal: "单台设备的全生命周期档案 + 对外公开管理；头部不放 primary，操作区克制。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["PageHeader（SN 大字可复制、机型、状态 Tag、证书状态 Tag）", "基本信息卡", "生命周期时间轴（主体）", "对外公开预览区（仅已公开）"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-detail-head",
        name: "页头与操作区",
        purpose: "头部不放 primary，操作区克制",
        layoutTreeItem: "PageHeader + 操作区",
        firstViewportItem: "PageHeader（SN 大字可复制、机型、状态 Tag、证书状态 Tag）",
        region: "shell",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：pageGoal 后半句；区域：detail-page.regions 的 shell"
      },
      {
        id: "info",
        selector: ':scope > section[aria-label="护照基本信息"]',
        name: "基本信息卡",
        purpose: "确认这台设备经过的每个环节的基础信息",
        layoutTreeItem: "基本信息卡",
        firstViewportItem: "基本信息卡",
        region: "hero",
        successCriteria: [],
        doNotOnDelete: ["键值信息用 DataGrid 硬凑"],
        source: "名称与首屏项：layoutTree[1] / firstViewport[1]；用途：flowCard.userGoal 压缩；区域：detail-page.regions 的 hero（locked）；禁止项：detail-page.doNot[1]"
      },
      {
        id: "timeline",
        selector: ':scope > section[aria-label="生命周期时间轴"]',
        name: "生命周期时间轴",
        purpose: "确认这台设备经过的每个环节",
        layoutTreeItem: "生命周期时间轴（事件类型过滤）",
        firstViewportItem: "生命周期时间轴（主体）",
        region: "sections",
        successCriteria: ["时间轴节点按时间倒序，收货入场为最早节点；事件类型过滤后仅对应节点可见。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[2] / firstViewport[2]；用途：flowCard.userGoal 前半句压缩；区域：detail-page.regions 的 sections；规则：successCriteria[0]"
      },
      {
        id: "public",
        selector: ':scope > section[aria-label="对外公开预览"]',
        name: "对外公开预览区",
        purpose: "管理消费者扫码可见的内容",
        layoutTreeItem: "对外公开预览区",
        firstViewportItem: "对外公开预览区（仅已公开）",
        region: "sections",
        successCriteria: ["未公开设备打开二维码弹窗显示警告条「该设备护照尚未对外公开，扫码将显示 404」。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[3] / firstViewport[3]；用途：flowCard.userGoal 后半句；区域：detail-page.regions 的 sections；规则：successCriteria[2]；只在已公开时出现"
      }
    ]
  },
  {
    pageId: "rma",
    route: "/exceptions/rma",
    patternId: "list-page",
    patternLabel: "列表页",
    pageGoal: "把每条 RMA 单的到件、检测、裁决进度放在一张表里，单行操作由状态机驱动。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页头（标题 + 新建/导出/刷新/列设置）", "筛选区", "表格", "批量操作条（选中浮出）"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-title-row",
        name: "页头",
        purpose: "接住售后的每一台退回设备",
        layoutTreeItem: "页头",
        firstViewportItem: "页头（标题 + 新建/导出/刷新/列设置）",
        region: "shell",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：flowCard.userGoal 前半句；区域：list-page.regions 的 shell"
      },
      {
        id: "filter",
        selector: ':scope > section[aria-label="筛选"]',
        name: "筛选区",
        purpose: "按条件收窄到目标 RMA 单",
        layoutTreeItem: "筛选区（常驻 + 收纳）",
        firstViewportItem: "筛选区",
        region: "filter",
        successCriteria: [],
        doNotOnDelete: ["表格页没有筛选区"],
        source: "名称与首屏项：layoutTree[1] / firstViewport[1]；用途：pageGoal 压缩；区域：list-page.regions 的 filter（locked）；规则：无直接对应条目；禁止项：list-page.doNot[0]"
      },
      {
        id: "table",
        selector: ':scope > section[aria-label="RMA 单列表"]',
        name: "表格与分页",
        purpose: "到件、检测、裁决进度放在一张表里，单行操作由状态机驱动",
        layoutTreeItem: "表格 + 分页",
        firstViewportItem: "表格",
        region: "data",
        successCriteria: ["「已到件-待检」单录入检测提交后行内状态变「已检测」，单行「返修」可点、其余裁决互斥置灰。", "报废裁决需必填裁决说明，确认后设备状态 Tag 变「报废」。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[2] / firstViewport[2]；用途：pageGoal 原文；区域：list-page.regions 的 data；规则：successCriteria[1]、[2] 压缩"
      },
      {
        id: "selection",
        selector: ':scope > [aria-label="批量操作"]',
        name: "底部选中操作条",
        purpose: "批量选中后浮出已选操作条",
        layoutTreeItem: "底部选中操作条",
        firstViewportItem: "批量操作条（选中浮出）",
        region: null,
        successCriteria: ["只读视角下新建/录入检测/裁决/批量关闭置灰并写明权限点。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[3] / firstViewport[3]；用途与规则：successCriteria[3]；list-page 没有对应区域；只在选中后出现"
      }
    ]
  },
  {
    pageId: "firmware",
    route: "/system/firmware",
    patternId: "list-page",
    patternLabel: "列表页",
    pageGoal: "Tab 一管版本从草稿到全量的生命周期，Tab 二管一次定向下发的执行过程。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页面标题 + Tab", "筛选区（常驻 4 + 收纳）", "工具栏 + 表格"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-title-row",
        name: "页头",
        purpose: "固件与推送",
        layoutTreeItem: "页面标题 + Tabs",
        firstViewportItem: "页面标题 + Tab",
        region: "shell",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称：layoutTree[0]（与 tabs 区块同源）；首屏项：firstViewport[0]；用途：页面标题；区域：list-page.regions 的 shell"
      },
      {
        id: "tabs",
        selector: ":scope > .ant-tabs",
        name: "页签（版本 / 推送任务）",
        purpose: "Tab 一管版本生命周期，Tab 二管下发执行过程",
        layoutTreeItem: "页面标题 + Tabs",
        firstViewportItem: null,
        region: null,
        successCriteria: ["打开落地 Tab 一且 URL 为 ?tab=version；切换与刷新后停留原 Tab，两 Tab 筛选各自保留。"],
        doNotOnDelete: [],
        source: "名称：layoutTree[0]（与 header 区块同源）；用途：pageGoal 原文；规则：successCriteria[0]；list-page 没有对应区域；首屏项已在 header 区块标注"
      },
      {
        id: "filter",
        selector: ':scope > section[aria-label="固件版本筛选"], section[aria-label="推送任务筛选"]',
        name: "筛选区（随页签切换）",
        purpose: "按条件收窄版本或推送任务",
        layoutTreeItem: "筛选区",
        firstViewportItem: "筛选区（常驻 4 + 收纳）",
        region: "filter",
        successCriteria: ["切换与刷新后停留原 Tab，两 Tab 筛选各自保留。"],
        doNotOnDelete: ["表格页没有筛选区"],
        source: "名称与首屏项：layoutTree[1] / firstViewport[1]；用途：pageGoal 压缩；区域：list-page.regions 的 filter（locked）；规则：successCriteria[0] 后半句；禁止项：list-page.doNot[0]；两个页签各有一份筛选区，同一时刻只渲染一份"
      },
      {
        id: "table",
        selector: ':scope > section[aria-label="固件版本列表"], section[aria-label="推送任务列表"]',
        name: "工具栏与表格（随页签切换）",
        purpose: "看清每个固件版本推到了哪里、推得顺不顺",
        layoutTreeItem: "工具栏 + Table",
        firstViewportItem: "工具栏 + 表格",
        region: "data",
        successCriteria: ["灰度中行灰度比例渲染进度条，已全量 / 已停用行同列为「—」。", "对已全量版本回滚：Modal 显示影响设备数，确认后版本变「已回滚」且 Tab 二出现比例 100% 的新任务。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[2] / firstViewport[2]；用途：flowCard.userGoal 前半句；区域：list-page.regions 的 data；规则：successCriteria[1]、[2]；两个页签各有一份表格，同一时刻只渲染一份"
      }
    ]
  },
  {
    pageId: "firmware-form",
    route: "/system/firmware/new",
    patternId: "form-page",
    patternLabel: "表单页",
    pageGoal: "作为表单样本：基本信息 + 固件包与签名 + 变更记录三段，校验规则取自 PRD。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页面标题", "基本信息", "固件包与签名", "变更记录", "底部操作"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-detail-head",
        name: "页面标题",
        purpose: "登记一个固件版本",
        layoutTreeItem: "页面标题",
        firstViewportItem: "页面标题",
        region: "shell",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：flowCard.userGoal 压缩；区域：form-page.regions 的 shell"
      },
      {
        id: "form",
        selector: ":scope > form",
        name: "表单主体（基本信息 / 固件包与签名 / 变更记录）",
        purpose: "登记基本信息、固件包与变更记录，提交测试或保存草稿",
        layoutTreeItem: "基本信息",
        firstViewportItem: "基本信息",
        region: "sections",
        successCriteria: ["固件版本号按正则校验且编辑态只读；机型 1–5 个。", "固件包上传后 MD5 自动回填只读；手动签名时签名文件联动必填。", "变更日志必填 10–5000 字，禁纯空白。"],
        doNotOnDelete: ["字段无分组一长条"],
        source: "名称：layoutTree[1]（layoutTree[2]「固件包与签名」、layoutTree[3]「变更记录」在源码里与本区块同在一个 <form> 内，见交回对照表）；首屏项：firstViewport[1]；用途：flowCard.userGoal 原文；区域：form-page.regions 的 sections（locked）；规则：successCriteria[0]、[1]、[2]；禁止项：form-page.doNot[0]"
      },
      {
        id: "actions",
        selector: ":scope > footer.firmware-form-actions",
        name: "底部操作",
        purpose: "提交测试、保存草稿或取消",
        layoutTreeItem: "底部操作",
        firstViewportItem: "底部操作",
        region: "actions",
        successCriteria: ["取消走 B 档气泡确认（放弃未保存内容）。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[4] / firstViewport[4]；用途：flowCard.userGoal 压缩；区域：form-page.regions 的 actions；规则：successCriteria[3]"
      }
    ]
  },
  {
    pageId: "flashing",
    route: "/lifecycle/flashing",
    patternId: "list-page",
    patternLabel: "列表页",
    pageGoal: "一张表看全量烧录记录，状态驱动的行内处置一步完成，新建任务两步走完。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页面标题与工具栏（新建烧录任务 / 导出 / 刷新 / 列设置）", "筛选区（常驻 5 + 收纳 6）", "烧录记录表格"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-title-row",
        name: "页头与工具栏",
        purpose: "产线操作员盯住每台待烧录设备的进度与失败处置",
        layoutTreeItem: "页头",
        firstViewportItem: "页面标题与工具栏（新建烧录任务 / 导出 / 刷新 / 列设置）",
        region: "shell",
        successCriteria: ["只读视角下新建、导出、行内与批量操作全部置灰并写明权限点。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：flowCard.userGoal 前半句；区域：list-page.regions 的 shell；规则：successCriteria[4] 压缩"
      },
      {
        id: "filter",
        selector: ':scope > section[aria-label="筛选"]',
        name: "筛选区",
        purpose: "把全量烧录记录收窄到目标记录",
        layoutTreeItem: "筛选区（常驻 + 收纳）",
        firstViewportItem: "筛选区（常驻 5 + 收纳 6）",
        region: "filter",
        successCriteria: ["常驻筛选恰好 5 个、收纳恰好 6 个。"],
        doNotOnDelete: ["表格页没有筛选区"],
        source: "名称与首屏项：layoutTree[1] / firstViewport[1]；用途：pageGoal 前半句压缩；区域：list-page.regions 的 filter（locked）；规则：successCriteria[0] 前半句；禁止项：list-page.doNot[0]"
      },
      {
        id: "table",
        selector: ':scope > section[aria-label="烧录记录"]',
        name: "工具栏与烧录记录表格",
        purpose: "状态驱动的行内处置一步完成",
        layoutTreeItem: "工具栏 + 表格",
        firstViewportItem: "烧录记录表格",
        region: "data",
        successCriteria: ["重试未超限行走 B 档气泡，确认后状态变烧录·发证且重试次数 +1；重试达上限行走 C 档强确认。", "标记失败打开原因登记抽屉（分类、描述必填，照片 ≤3 张）。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[2] / firstViewport[2]；用途：pageGoal 中间句；区域：list-page.regions 的 data；规则：successCriteria[1]、[2] 与 [3] 压缩"
      },
      {
        id: "selection",
        selector: ':scope > [aria-label="批量操作"]',
        name: "底部选中操作条",
        purpose: "批量选中后浮出已选操作条",
        layoutTreeItem: "底部选中操作条",
        firstViewportItem: null,
        region: null,
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称：layoutTree[3]；用途：沿用列表页批量条语义；不在 firstViewport；list-page 没有对应区域；只在选中后出现"
      }
    ]
  },
  {
    pageId: "flashing-form",
    route: "/lifecycle/flashing/new",
    patternId: "form-page",
    patternLabel: "表单页",
    pageGoal: "两步分步表单样本：机型联动固件版本，批次联动可烧录设备数，C 档预览确认提交。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页面标题", "分步条", "当前步表单", "底部操作"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-detail-head",
        name: "页面标题",
        purpose: "新建一次烧录任务",
        layoutTreeItem: "页面标题",
        firstViewportItem: "页面标题",
        region: "shell",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：flowCard.userGoal 压缩；区域：form-page.regions 的 shell"
      },
      {
        id: "steps",
        selector: ':scope > section[aria-label="分步进度"]',
        name: "分步条",
        purpose: "标明当前在第几步",
        layoutTreeItem: "分步条",
        firstViewportItem: "分步条",
        region: "sections",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[1] / firstViewport[1]；用途：交互语义压缩；区域：form-page.regions 的 sections（locked）"
      },
      {
        id: "form",
        selector: ":scope > form",
        name: "当前步表单（基础配置 / 设备范围）",
        purpose: "两步登记一次烧录任务：基础配置，再圈定设备范围",
        layoutTreeItem: "第一步 基础配置",
        firstViewportItem: "当前步表单",
        region: "sections",
        successCriteria: ["未选机型时固件版本禁用并提示「请先选择机型」；关闭证书签发显示业务警告。", "选择方式切换清空下方字段；选对批次后出现可烧录设备数；SN 列表校验失败回显错误行号。"],
        doNotOnDelete: ["字段无分组一长条"],
        source: "名称：layoutTree[2]（layoutTree[3]「第二步 设备范围」与本区块在同一个 <form> 内分步轮换，见交回对照表）；首屏项：firstViewport[2]；用途：flowCard.userGoal 前半句；区域：form-page.regions 的 sections（locked）；规则：successCriteria[0]、[1]；禁止项：form-page.doNot[0]"
      },
      {
        id: "actions",
        selector: ":scope > footer.flashing-form-actions",
        name: "底部操作",
        purpose: "上一步、下一步或提交",
        layoutTreeItem: "底部操作",
        firstViewportItem: "底部操作",
        region: "actions",
        successCriteria: ["提交前预览弹窗列出任务名称、工位、设备数、重试上限与是否签发证书；确认后回列表且新记录出现。"],
        doNotOnDelete: [],
        source: "名称与首屏项：firstViewport[3]（layoutTree 未单列底部操作，见交回对照表）；用途：交互语义压缩；区域：form-page.regions 的 actions；规则：successCriteria[2]"
      }
    ]
  },
  {
    pageId: "feedback",
    route: "/exceptions/feedback",
    patternId: "list-page",
    patternLabel: "列表页",
    pageGoal: "按状态分组（Tab）+ SLA 优先序处理工单，抽屉内看全上下文并完成受理、回复、指派、驳回、关闭。",
    rootSelector: ".device-ops-page.feedback-page",
    firstViewport: ["页面标题与全局操作", "状态 Tab（带计数）", "筛选区（常驻 5 + 收纳 5）", "工单表格（默认 SLA 剩余升序）"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-title-row",
        name: "页头与全局操作",
        purpose: "接手每一条用户反馈工单",
        layoutTreeItem: "页头",
        firstViewportItem: "页面标题与全局操作",
        region: "shell",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：flowCard.userGoal 前半句；区域：list-page.regions 的 shell；本页根容器为 .device-ops-page.feedback-page（无 .device-ops-stack）"
      },
      {
        id: "banner",
        selector: ":scope > .ant-alert.feedback-overdue-banner",
        name: "SLA 超时横幅",
        purpose: "筛选 SLA=已超时时在顶部预警",
        layoutTreeItem: "SLA 超时横幅",
        firstViewportItem: null,
        region: null,
        successCriteria: ["筛选 SLA=已超时时顶部出现 warning 横幅并已超时行标底；待受理卡计数与预置筛选行数一致。"],
        doNotOnDelete: [],
        source: "名称：layoutTree[3]；用途与规则：successCriteria[2] 压缩；不在 firstViewport；list-page 没有对应区域；只在 SLA 超时筛选或存在超时工单时出现"
      },
      {
        id: "tabs",
        selector: ":scope > .ant-tabs",
        name: "状态分栏",
        purpose: "按状态分组处理工单",
        layoutTreeItem: "状态 Tabs",
        firstViewportItem: "状态 Tab（带计数）",
        region: null,
        successCriteria: ["受理后状态变处理中，受理人与受理时间出现，Tab 计数同步增减。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[1] / firstViewport[1]；用途：pageGoal 前半句；规则：successCriteria[1]；list-page 没有对应区域"
      },
      {
        id: "filter",
        selector: ":scope > section.feedback-filter-panel",
        name: "筛选区",
        purpose: "按 SLA 优先序与条件收窄工单",
        layoutTreeItem: "筛选区（常驻 + 收纳）",
        firstViewportItem: "筛选区（常驻 5 + 收纳 5）",
        region: "filter",
        successCriteria: ["筛选 SLA=已超时时顶部出现 warning 横幅并已超时行标底。"],
        doNotOnDelete: ["表格页没有筛选区"],
        source: "名称与首屏项：layoutTree[2] / firstViewport[2]（源码 section 无 aria-label，用 class 定位）；用途：pageGoal 中间句压缩；区域：list-page.regions 的 filter（locked）；规则：successCriteria[2] 压缩；禁止项：list-page.doNot[0]"
      },
      {
        id: "table",
        selector: ":scope > section.device-ops-panel--table",
        name: "工单表格与分页",
        purpose: "抽屉内看全上下文并完成受理、回复、指派、驳回、关闭",
        layoutTreeItem: "表格 + 分页",
        firstViewportItem: "工单表格（默认 SLA 剩余升序）",
        region: "data",
        successCriteria: ["告警页工单号链接落 ?ticket= 并直接打开对应详情抽屉；回复用户 B 档气泡；驳回 C 档必填原因（5–200 字）。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[4] / firstViewport[3]；用途：pageGoal 后半句；区域：list-page.regions 的 data；规则：successCriteria[0]、[3] 压缩"
      }
    ]
  },
  {
    pageId: "alert-rules",
    route: "/system/alert-rules",
    patternId: "list-page",
    patternLabel: "列表页",
    pageGoal: "一屏看清每条规则盯什么、通知谁、是否在跑；表单按规则类型只出现需要的字段。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页头（标题 + 口径副标题）", "工具栏（状态 Segmented + 类型筛选 + 新建规则）", "规则表格"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.alert-rules-head",
        name: "页头（标题与口径副标题）",
        purpose: "设定什么情况要喊人",
        layoutTreeItem: "页头",
        firstViewportItem: "页头（标题 + 口径副标题）",
        region: "shell",
        successCriteria: [],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：flowCard.userGoal 前半句；区域：list-page.regions 的 shell"
      },
      {
        id: "rules",
        selector: ':scope > section[aria-label="告警规则列表"]',
        name: "工具栏与规则表格",
        purpose: "一屏看清每条规则盯什么、通知谁、是否在跑",
        layoutTreeItem: "规则表格",
        firstViewportItem: "规则表格",
        region: "data",
        successCriteria: ["规则类型标签均为中性色；启用行开关开、停用行开关关；从未触发规则的最近触发显示「—」。", "停用走 B 档气泡，启用直接生效并轻提示；保存成功后列表出现新规则且默认启用。"],
        doNotOnDelete: [],
        source: "名称：layoutTree[2]（layoutTree[1]「工具栏」在源码里位于该区块内部，见交回对照表）；首屏项：firstViewport[2]（firstViewport[1] 与该区块同源）；用途：pageGoal 前半句；区域：list-page.regions 的 data；规则：successCriteria[0]、[2] 压缩"
      }
    ]
  },
  {
    pageId: "binding",
    route: "/users/binding",
    patternId: "list-page",
    patternLabel: "列表页",
    pageGoal: "三字段互斥的精确检索：手机号 / 用户 ID 命中出模式 A 用户卡 + 绑定设备表，SN 命中出模式 B 绑定关系表。",
    rootSelector: ".device-ops-stack",
    firstViewport: ["页面标题", "检索表单（三字段互斥）", "空态（未检索 / 无结果两条文案）"],
    requiredComponents: [],
    blocks: [
      {
        id: "header",
        selector: ":scope > header.device-ops-title-row",
        name: "页头",
        purpose: "精确查到一个 App 用户或一台设备的绑定关系，判断联系谁、设备归谁",
        layoutTreeItem: "页头",
        firstViewportItem: "页面标题",
        region: "shell",
        successCriteria: ["带 ?from= 进入时页头返回回来源页。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[0] / firstViewport[0]；用途：flowCard.userGoal 后半句；区域：list-page.regions 的 shell；规则：successCriteria[3] 压缩"
      },
      {
        id: "search",
        selector: ':scope > section[aria-label="检索表单"]',
        name: "检索表单",
        purpose: "手机号 / 用户 ID / SN 三字段互斥的精确检索",
        layoutTreeItem: "检索表单",
        firstViewportItem: "检索表单（三字段互斥）",
        region: "filter",
        successCriteria: ["三字段互斥：任一字段有值其余两个置灰，三个都空时查询置灰；?user_id= / ?sn= 自动带入并触发查询。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[1] / firstViewport[1]；用途：pageGoal 前半句；区域：list-page.regions 的 filter（locked，检索表单即本页的筛选区等价位）；规则：successCriteria[0]"
      },
      {
        id: "result",
        selector: ':scope > section.binding-state-panel, :scope > .device-ops-stack',
        name: "结果区（用户卡 / 绑定表 / 空态）",
        purpose: "模式 A 出用户卡 + 绑定设备表，模式 B 出绑定关系表，未检索与无结果分别给空态",
        layoutTreeItem: "结果区：用户卡 + 绑定设备表 / SN 反查表",
        firstViewportItem: "空态（未检索 / 无结果两条文案）",
        region: "data",
        successCriteria: ["默认显示 1xx****xxxx；「查看完整」需填写查看原因才确认。", "SN 命中但 0 绑定时单独显示「该设备暂无绑定用户」，与检索无结果区分；模式 B 点用户 ID 切到模式 A。"],
        doNotOnDelete: [],
        source: "名称与首屏项：layoutTree[2] / firstViewport[2]；用途：pageGoal 后半句；区域：list-page.regions 的 data；规则：successCriteria[1] 压缩、[2]、[3] 压缩；空态为 section.binding-state-panel、结果为嵌套 .device-ops-stack，同一时刻只渲染其一"
      }
    ]
  }
];

// 生效区块登记：页面对应关系 × patterns.manifest.json regions，由 deriveRegistries 一处派生；
// 引用方拿到的的形状与逐字段语义同 e5f1728 的静态 PAGE_REGISTRIES 完全一致（0 差异验收）。
export const PAGE_REGISTRIES: PageRegistry[] = deriveRegistries(PAGE_BLOCK_MAP, patternsManifest);

export function registryForRoute(routeId: string): PageRegistry | null {
  return PAGE_REGISTRIES.find((entry) => entry.pageId === routeId) ?? null;
}

export function registryForPath(pathname: string): PageRegistry | null {
  const inner = pathname.replace(/^\/device-ops(?=\/|$)/, "") || "/";
  const exact = PAGE_REGISTRIES.find((entry) => entry.route === inner);
  if (exact) return exact;
  // 动态段匹配：路由里的 :param 段匹配任意非空段（如 /devices/:sn → /devices/TS24070101）。
  const segments = inner.split("/").filter(Boolean);
  return (
    PAGE_REGISTRIES.find((entry) => {
      const pattern = entry.route.split("/").filter(Boolean);
      if (pattern.length !== segments.length || !pattern.some((part) => part.startsWith(":"))) return false;
      return pattern.every((part, index) => (part.startsWith(":") ? segments[index].length > 0 : part === segments[index]));
    }) ?? null
  );
}

export function blockById(registry: PageRegistry, id: string): PageBlock | null {
  return registry.blocks.find((block) => block.id === id) ?? null;
}

// 删除时的合同提示：首屏必需 / 区域被模式锁定 / 命中 doNot。没有命中返回 null，不凑话。
export type ContractHint = { tone: "warn"; lines: string[] };

export function deleteHint(registry: PageRegistry, block: PageBlock): ContractHint | null {
  const lines: string[] = [];
  if (block.firstViewportItem) lines.push(`${block.name}是本页首屏必需区块：${registry.pageGoal}`);
  if (block.region?.locked) lines.push(`${block.name}所在区域由「${registry.patternLabel}」模式锁定，结构按页面合同固定。`);
  for (const text of block.doNotOnDelete) lines.push(`合同禁止：${text}。`);
  return lines.length > 0 ? { tone: "warn", lines } : null;
}

// 替换时的合同提示：与该区块有关的 successCriteria；没有则不显示。
export function replaceCriteria(block: PageBlock): string[] {
  return block.successCriteria;
}
