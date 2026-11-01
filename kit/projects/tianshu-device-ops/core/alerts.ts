// 告警处置页控制器（第 4 阶段 4.4 批次 F）：分栏初始化、筛选与计数、排序选择、动作可用性、转工单/标记已处理表单口径、返回网址的规则只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window；网址参数与告警数据都由调用方传入。
// 口径以 antd 小豆盒现版 generated/AlertsPage.tsx 为准（第 4 阶段 antd 页面暂不接入，见 docs/PLAN-四底座第4阶段-…）。
// 状态流转的最终闸门（是否可以指派/静默/重复转工单等）在 store 的 createTicket / assign / resolve / reopen / mute 里；
// 这里只收页面层的「动作是否呈现、表单怎么校验、列表怎么排」规则。

import { alertTypeLabel, staffOptions } from "../data";
import type { AlertLevel, AlertRecord, AlertStatus, AlertType, ResolutionConclusion } from "../data";
import type { TicketForm } from "../store";
import { violatesNotBlank } from "./text";

// —— 分栏与筛选 ——

/** 五个分栏的固定顺序，分栏计数、初始落位与排序都按这个顺序。 */
export const alertStatusOrder: AlertStatus[] = ["open", "processing", "ticketed", "resolved", "muted"];
export const alertLevels: AlertLevel[] = ["P1", "P2", "P3"];

export type AlertFilters = { type: AlertType | undefined; level: AlertLevel | undefined; keyword: string };

export function isAlertType(value: string | null): value is AlertType {
  return value !== null && value in alertTypeLabel;
}

export function isAlertLevel(value: string | null): value is AlertLevel {
  return value !== null && (alertLevels as string[]).includes(value);
}

export function isAlertStatus(value: string | null): value is AlertStatus {
  return value !== null && (alertStatusOrder as string[]).includes(value);
}

export type AlertsInit = AlertFilters & { tab: AlertStatus; selectedId: string | null };

/**
 * 进入页面时的初始状态。?status / ?tab 预置分栏（工作台卡片跳来）；?alert=<id> 定位单条并落到它所在的分栏；
 * 带 ?sn= 从设备页过来时落到该 SN 有结果的第一个分栏；都没有回到「待处理」。?type / ?level 非法值忽略。
 */
export function initialAlertsState(options: { search: string; alerts: AlertRecord[] }): AlertsInit {
  const params = new URLSearchParams(options.search);
  const typeValue = params.get("type");
  const levelValue = params.get("level");
  const keyword = params.get("sn") ?? "";
  const selectedId = params.get("alert") ?? params.get("id");
  const viaStatus = params.get("status") ?? params.get("tab");
  let tab: AlertStatus = "open";
  if (isAlertStatus(viaStatus)) {
    tab = viaStatus;
  } else {
    const viaAlert = params.get("alert");
    const hit = viaAlert ? options.alerts.find((alert) => alert.id === viaAlert) : undefined;
    if (hit) tab = hit.status;
    else if (!keyword) tab = "open";
    else tab = alertStatusOrder.find((status) => options.alerts.some((alert) => alert.status === status && alert.sns.includes(keyword))) ?? "open";
  }
  return {
    type: isAlertType(typeValue) ? typeValue : undefined,
    level: isAlertLevel(levelValue) ? levelValue : undefined,
    keyword,
    tab,
    selectedId
  };
}

/** 类型 / 级别 / 关键词筛选：关键词大小写不敏感，命中告警号、标题、对象或任一 SN。 */
export function matchesAlertFilters(alert: AlertRecord, filters: AlertFilters): boolean {
  if (filters.type && alert.type !== filters.type) return false;
  if (filters.level && alert.level !== filters.level) return false;
  const word = filters.keyword.trim().toLowerCase();
  if (word) {
    const haystack = [alert.id, alert.title, alert.target, ...alert.sns].join(" ").toLowerCase();
    if (!haystack.includes(word)) return false;
  }
  return true;
}

export function filterAlerts(alerts: AlertRecord[], filters: AlertFilters): AlertRecord[] {
  return alerts.filter((alert) => matchesAlertFilters(alert, filters));
}

/** 分栏计数按「当前筛选」统计，和下方列表的范围一致；分栏本身不参与计数。 */
export function alertTabCounts(filtered: AlertRecord[]): Record<AlertStatus, number> {
  const result: Record<AlertStatus, number> = { open: 0, processing: 0, ticketed: 0, resolved: 0, muted: 0 };
  for (const alert of filtered) result[alert.status] += 1;
  return result;
}

/** 当前分栏的列表：按级别 P1→P3，同级按首次发现倒序。 */
export function listAlertsForTab(filtered: AlertRecord[], tab: AlertStatus): AlertRecord[] {
  return filtered
    .filter((alert) => alert.status === tab)
    .sort((a, b) => a.level.localeCompare(b.level) || b.firstSeenAt.localeCompare(a.firstSeenAt));
}

/** 选中项：优先网址 / 上次选中的告警，不在当前列表时回到第一条。 */
export function pickSelectedAlert(list: AlertRecord[], selectedId: string | null): AlertRecord | undefined {
  return list.find((alert) => alert.id === selectedId) ?? list[0];
}

// —— 动作可用性（页面层呈现口径，最终放行仍在 store） ——

/** 已结束：已处理或已静默。详情不再给出修改类动作。 */
export const isTerminalAlertStatus = (status: AlertStatus): boolean => status === "resolved" || status === "muted";
export const isTerminalAlert = (alert: AlertRecord): boolean => isTerminalAlertStatus(alert.status);
/** 未结束的告警可指派 / 标记已处理 / 静默。 */
export const canModifyAlert = (alert: AlertRecord): boolean => !isTerminalAlert(alert);
/** 已转工单或已结束的告警不再重复转工单。 */
export const canTicketAlert = (alert: AlertRecord): boolean => canModifyAlert(alert) && alert.status !== "ticketed";
/** 只有已处理的告警能重新打开。 */
export const canReopenAlert = (alert: AlertRecord): boolean => alert.status === "resolved";

/** 「下一步」建议项是否带动作：devices 一直给；ticket 仅未转工单的进行中告警；resolve 仅未结束告警。 */
export function alertStepActionEnabled(alert: AlertRecord, action: "ticket" | "devices" | "resolve"): boolean {
  if (action === "devices") return true;
  if (action === "ticket") return canTicketAlert(alert);
  return canModifyAlert(alert);
}

// —— 受影响设备的去向 ——

export type AffectedTarget = { kind: "device"; sn: string } | { kind: "devicesBatchOffline"; batch: string } | { kind: "devicesAll" };

/** 单台设备直达详情；批次级告警带「批次 + 离线」筛选去全部设备；其余去全部设备。 */
export function affectedTarget(alert: AlertRecord): AffectedTarget {
  if (alert.sns.length === 1) return { kind: "device", sn: alert.sns[0] };
  if (alert.batch) return { kind: "devicesBatchOffline", batch: alert.batch };
  return { kind: "devicesAll" };
}

export const affectedLabel = (alert: AlertRecord): string => (alert.sns.length === 1 ? "查看设备详情" : "查看受影响设备");

// —— 返回网址 ——

/**
 * 进入详情前记下当前分栏、选中项与筛选，详情页的「返回」据此回到原处。
 * 只组合查询串（不带前导 ?），路径由页面拼接。
 */
export function alertsReturnSearch(input: {
  tab: AlertStatus;
  selectedId: string | null;
  keyword: string;
  type: AlertType | undefined;
  level: AlertLevel | undefined;
}): string {
  const next = new URLSearchParams();
  next.set("tab", input.tab);
  if (input.selectedId) next.set("id", input.selectedId);
  if (input.keyword.trim()) next.set("sn", input.keyword.trim());
  if (input.type) next.set("type", input.type);
  if (input.level) next.set("level", input.level);
  return next.toString();
}

// —— 处置后选中下一条 ——

/** 处理成功且告警离开当前分栏时，自动选中它的下一条（没有下一条取上一条）。 */
export function nextAlertSelectionId(list: AlertRecord[], actedId: string): string | null {
  const index = list.findIndex((alert) => alert.id === actedId);
  const neighbor = list[index + 1] ?? list[index - 1];
  return neighbor?.id ?? null;
}

// —— 转工单表单 ——

/** 弹窗里的类型 / 优先级用中文选项，提交时映射回实体枚举（2026-09-29 批 2：写入 FeedbackTicket 实体，反馈页同源展示）。 */
export const ticketTypeOptions = ["故障", "咨询", "其他"] as const;
export const ticketPriorityOptions = ["紧急", "高", "中", "低"] as const;
export type TicketTypeLabel = (typeof ticketTypeOptions)[number];
export type TicketPriorityLabel = (typeof ticketPriorityOptions)[number];
export const priorityLabelByLevel: Record<AlertLevel, TicketPriorityLabel> = { P1: "紧急", P2: "高", P3: "中" };

const ticketTypeMap = { 故障: "fault", 咨询: "consult", 其他: "suggestion" } as const;
const ticketPriorityMap = { 紧急: "P1", 高: "P2", 中: "P3", 低: "P3" } as const;

/** 转工单弹窗预填「发生了什么 / 影响 / 建议处理」三段，处理人只需补充判断。 */
export function ticketDescription(alert: AlertRecord): string {
  const list = (items: string[]) => items.map((item, index) => `${index + 1}. ${item}`).join("\n");
  return [`发生了什么：${alert.happened}`, `影响：\n${list(alert.impact)}`, `建议处理：\n${list(alert.nextSteps.map((step) => step.text))}`].join("\n\n");
}

export type TicketPrefill = { target: string; type: TicketTypeLabel; priority: TicketPriorityLabel; assignee: string | undefined; description: string };

/** 打开弹窗时的初值：类型默认「故障」，优先级按告警级别映射，处理人沿用已有指派（须在处理人名册内）。 */
export function ticketPrefillFor(alert: AlertRecord): TicketPrefill {
  return {
    target: alert.target,
    type: "故障",
    priority: priorityLabelByLevel[alert.level],
    assignee: alert.assignee && staffOptions.some((item) => item.value === alert.assignee) ? alert.assignee : undefined,
    description: ticketDescription(alert)
  };
}

/** 处理人必填；返回 null 表示可以提交。 */
export function ticketAssigneeError(assignee: string | undefined): string | null {
  return assignee ? null : "请选择处理人";
}

/** 表单中文选项映射回实体枚举；类型未命中回 fault，优先级未命中回告警级别。 */
export function ticketFormPayload(values: { type: string; priority: string; assignee: string; description: string }, fallbackLevel: AlertLevel): TicketForm {
  return {
    assignee: values.assignee,
    type: ticketTypeMap[values.type as TicketTypeLabel] ?? "fault",
    priority: ticketPriorityMap[values.priority as TicketPriorityLabel] ?? fallbackLevel,
    content: values.description
  };
}

// —— 标记已处理表单 ——

/** 处理结论必填；返回 null 表示通过。 */
export function resolveConclusionError(conclusion: ResolutionConclusion | "" | undefined): string | null {
  return conclusion ? null : "请选择处理结论";
}

/**
 * 备注校验，对齐 antd 规则 { required: 结论为「其他」, whitespace: true, message }：
 * 选「其他」时必填；其余结论备注选填，空串通过，但非空的纯空格同样报错，沿用同一条 message。返回 null 表示通过。
 */
export function resolveNoteError(conclusion: ResolutionConclusion | "" | undefined, note: string): string | null {
  return violatesNotBlank(note, conclusion === "其他") ? "选择“其他”时请填写备注" : null;
}
