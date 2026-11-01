// 工作台页控制器（第 4 阶段 4.4）：卡片可见性、计数、Top 5 明细、提示文案、角标语义、状态注入与网址参数规则只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window；网址串与数据切片由调用方传入。
// 口径以 antd 小豆盒现版 generated/DashboardPage.tsx 为准。卡片增删 / 移动 / 撤销移除、时间范围切换与刷新时间流转在 ../store，这里不重复。

import {
  dashboardCardDefs,
  type AlertRecord,
  type DashboardCardDef,
  type DashboardCardId,
  type DashboardCardType,
  type DashboardTimeRange,
  type Device,
  type FeedbackTicket,
  type FirmwareVersion,
  type PushTask,
  type RmaRecord
} from "../data";
import {
  activatedCountInRange,
  alertOpenCount,
  flashingPendingCount,
  fusedTaskCount,
  overdueTicketCount,
  pendingRmaCount,
  pendingTicketCount,
  testingVersionCount
} from "../store";

export const cardById = new Map(dashboardCardDefs.map((def) => [def.id, def]));

export const cardTypeLabel: Record<DashboardCardType, string> = { todo: "待办", alert: "告警", stat: "统计", quick: "快捷入口" };

/** 大数字旁的行内小字口径；快捷键与无数据卡没有这个单位。 */
export const metricUnit: Partial<Record<DashboardCardId, string>> = {
  "offline-alerts": "条待处理",
  "pending-rma": "单待处理",
  "gray-versions": "个版本待灰度",
  "fused-push-tasks": "个任务已熔断",
  // 2026-09-29 批 2 补登四张卡。
  "pending-flashing": "台待处理",
  "pending-feedback": "单待受理",
  "sla-overdue-feedback": "单已超时"
};

/** quick 卡行内文案按卡定义。 */
export const quickCardText: Partial<Record<DashboardCardId, string>> = {
  "sn-lookup": "按 SN 查询设备完整履历",
  "binding-lookup": "按手机号 / 用户 ID / SN 查询绑定关系"
};

/** 整页与单卡的数据态；injected 指向被 ?dataState=<state>:<卡片id> 单独注入的那张卡。 */
export type DashboardWholeState = "ready" | "loading" | "error" | "empty";
export type DashboardCardInjection = { id: DashboardCardId; state: "loading" | "error" };
export type DashboardDataState = { whole: DashboardWholeState; injected: DashboardCardInjection | null };

/**
 * 卡片级五态模拟：?dataState=loading|error|empty 作用到整页；
 * ?dataState=error:<卡片id> / ?dataState=loading:<卡片id> 只注入单张卡片（其余卡片不受影响）。
 * 状态名或卡片 id 不合法时整页回退 ready，不注入。
 */
export function parseDataState(raw: string | null): DashboardDataState {
  if (raw === "loading" || raw === "error" || raw === "empty") return { whole: raw, injected: null };
  if (raw && raw.includes(":")) {
    const [state, id] = raw.split(":");
    if ((state === "loading" || state === "error") && cardById.has(id as DashboardCardId)) {
      return { whole: "ready", injected: { id: id as DashboardCardId, state } };
    }
  }
  return { whole: "ready", injected: null };
}

/**
 * 卡片级查看权限模拟：?perm=no:<权限点>（可逗号分隔多个），如 ?perm=no:production:rma:view，
 * 被剥夺权限的卡片不渲染也不进添加卡片可用库；?perm=readonly 只管操作权限，不影响卡片可见。
 */
export function parseDeniedPermissions(raw: string | null): Set<string> {
  if (!raw || !raw.startsWith("no:")) return new Set();
  return new Set(raw.slice(3).split(",").filter(Boolean));
}

/** 无权限卡片不渲染也不占位：看板与可用库用同一份过滤结果。 */
export function visibleCardDefs(denied: ReadonlySet<string>): DashboardCardDef[] {
  return dashboardCardDefs.filter((def) => !denied.has(def.permission));
}

/** 看板 = 已保存顺序 ∩ 当前可见卡片，顺序以后者为准。 */
export function deriveDashboardBoard(orderedCardIds: readonly DashboardCardId[], defs: readonly DashboardCardDef[]): DashboardCardDef[] {
  return orderedCardIds
    .map((id) => defs.find((def) => def.id === id))
    .filter((def): def is DashboardCardDef => Boolean(def));
}

/** 各卡计数：数字 = 目标列表预置筛选行数，与 store 的选择器同源唯一口径；quick 卡没有数字。 */
export function dashboardCardCounts(input: {
  alerts: AlertRecord[];
  devices: Device[];
  firmwareVersions: FirmwareVersion[];
  pushTasks: PushTask[];
  rmas: RmaRecord[];
  feedbackTickets: FeedbackTicket[];
  timeRange: DashboardTimeRange;
}): Record<DashboardCardId, number> {
  return {
    "offline-alerts": alertOpenCount(input.alerts),
    "pending-rma": pendingRmaCount(input.rmas),
    "gray-versions": testingVersionCount(input.firmwareVersions),
    "fused-push-tasks": fusedTaskCount(input.pushTasks),
    "today-activated": activatedCountInRange(input.devices, input.timeRange),
    "sn-lookup": 0,
    "pending-flashing": flashingPendingCount(input.devices),
    "pending-feedback": pendingTicketCount(input.feedbackTickets),
    "sla-overdue-feedback": overdueTicketCount(input.feedbackTickets),
    "binding-lookup": 0
  };
}

/** Top 5 待处理告警：级别升序（P1 在前），同级按首次发现时间新→旧。 */
export function openAlertsTopFive(alerts: AlertRecord[]): AlertRecord[] {
  return alerts
    .filter((alert) => alert.status === "open")
    .sort((a, b) => a.level.localeCompare(b.level) || b.firstSeenAt.localeCompare(a.firstSeenAt))
    .slice(0, 5);
}

/** Top 5 已熔断任务：创建时间新→旧。 */
export function fusedTasksTopFive(tasks: PushTask[]): PushTask[] {
  return tasks
    .filter((task) => task.status === "fused")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
}

/** Top 5 浮层只对已定义明细的两张告警卡开放；SLA 超时卡的明细在目标列表查看。 */
export const topFiveCardIds: readonly DashboardCardId[] = ["offline-alerts", "fused-push-tasks"];

/** 每张卡的行内说明；离线告警卡依是否含 open P1 给出两条不同提示。 */
export function dashboardHint(def: DashboardCardDef, alertsP1: boolean): string {
  if (def.id === "offline-alerts") return alertsP1 ? "含 P1 告警，请优先处理" : "无 P1 告警，按发现时间顺序处理";
  if (def.id === "pending-rma") return "还没有裁决结果的退货单";
  if (def.id === "gray-versions") return "状态为测试中、等待发起灰度推送";
  if (def.id === "fused-push-tasks") return "失败率超熔断阈值已自动停止，不可手动恢复";
  if (def.id === "today-activated") return "数字随右上角的时间范围变化";
  if (def.id === "pending-flashing") return "烧录·发证与烧录失败状态的设备";
  if (def.id === "pending-feedback") return "SLA 首次响应计时仍在走的工单";
  if (def.id === "sla-overdue-feedback") return "超出 SLA 目标的未办结工单，优先受理";
  if (def.id === "binding-lookup") return "输入完整 SN 才能查到";
  return "直达数字护照，查设备全生命周期履历";
}

/** 角标语义：告警卡 high（含 P1 待处理）/ mid，其余待办与统计卡 normal。各底座把 high/mid/normal 映射到本库色名（antd red/orange/blue、shadcn error/warning/processing）。 */
export type DashboardBadgeTone = "high" | "mid" | "normal";
export function dashboardBadgeTone(def: DashboardCardDef, alertsP1: boolean): DashboardBadgeTone {
  if (def.type !== "alert") return "normal";
  return def.id === "offline-alerts" && !alertsP1 ? "mid" : "high";
}

/** 某张卡当前的数据态：整页 loading 覆盖一切；其后是被单卡注入的那一张。 */
export function dashboardCardState(id: DashboardCardId, whole: DashboardWholeState, injected: DashboardCardInjection | null): "ready" | "loading" | "error" {
  if (whole === "loading") return "loading";
  if (injected?.id === id) return injected.state;
  return "ready";
}

/** 卡片跳转的查询串：有预置筛选时带 ?，其余原样拼接。路由前缀（appPath）由各底座适配。 */
export function dashboardCardQuery(def: DashboardCardDef): string {
  return def.presetFilter ? `?${def.presetFilter}` : "";
}

/** 重试只去掉 dataState 参数，保留其余网址参数；返回不带问号的查询串。 */
export function retrySearch(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("dataState");
  return params.toString();
}

/** 整页注入 empty，或正常情况下看板一张卡都没有时，显示空工作台引导。 */
export function showDashboardGuide(whole: DashboardWholeState, boardLength: number): boolean {
  return whole === "empty" || (whole === "ready" && boardLength === 0);
}

/** 添加卡片抽屉：按来源模块分组，组序与卡序都跟随注册表。 */
export function dashboardDrawerGroups(defs: readonly DashboardCardDef[]): { module: string; defs: DashboardCardDef[] }[] {
  const groups: { module: string; defs: DashboardCardDef[] }[] = [];
  for (const def of defs) {
    const group = groups.find((item) => item.module === def.sourceModule);
    if (group) group.defs.push(def);
    else groups.push({ module: def.sourceModule, defs: [def] });
  }
  return groups;
}

/** 加入所选：按注册表顺序依次加到看板末尾，维持确定性，与勾选先后无关。 */
export function dashboardCardsToAdd(selected: readonly DashboardCardId[]): DashboardCardDef[] {
  return dashboardCardDefs.filter((def) => selected.includes(def.id));
}

/** 计数为 0 时的卡体文案：待办卡与告警卡分开。 */
export function dashboardEmptyBodyText(type: DashboardCardType): string {
  return type === "todo" ? "今日无待办" : "暂无告警";
}
