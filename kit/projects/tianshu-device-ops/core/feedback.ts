// 客户反馈页控制器（第 4 阶段 4.4 批次 B）：筛选匹配、状态 Tab 联动与计数、列设置、本地记忆（24 小时 TTL）、
// 批量指派可用性、状态流转允许性、排序与表单校验规则只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window；网址串、本地存储与当前时间毫秒值都由调用方传入。
// 口径以 antd 小豆盒现版 generated/FeedbackPage.tsx 为准（antd 页面暂不接入；排序同值保持原顺序、校验用原始输入不预裁剪，均与 antd 一致）。

import {
  NOW_LABEL,
  feedbackStatusMeta,
  isFeedbackOpen,
  slaStateOf,
  toLinearMinutes,
  type Device,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackTicket,
  type FeedbackType,
  type SlaState
} from "../data";
import type { FeedbackManualForm } from "../store";
import { nextSortState } from "./sort";
import { readStored, type KeyValueStore } from "./storage";

// 本地记忆读写各页控制器共用，这里转出以保持页面单点导入（同 deviceList.ts 约定；与 deviceList 的转出指向同一绑定，不冲突）。
export { readStored, writeStored } from "./storage";
export type { KeyValueStore } from "./storage";

export type SlaStateFilter = SlaState | "all";
export type FeedbackTabKey = FeedbackStatus | "all";
/** 提交时间范围：[开始, 结束]，「YYYY-MM-DD HH:mm」字符串闭区间比较（与 antd RangePicker 写出的边界一致：起 00:00、止 23:59）。 */
export type SubmittedRange = [string, string] | null;

export type FeedbackFilters = {
  ticketId: string;
  slaState: SlaStateFilter;
  priorities: FeedbackPriority[];
  types: FeedbackType[];
  submittedRange: SubmittedRange;
  statuses: FeedbackStatus[];
  sn: string;
  appVersions: string[];
  firmwares: string[];
  assignee: string;
};

export type FeedbackSortKey = "priority" | "sla" | "submittedAt";
export type FeedbackSort = { key: FeedbackSortKey; dir: "asc" | "desc" };
/** 行内主推动作：按当前状态决定；其余动作（指派 / 驳回 / 转 RMA）在详情抽屉里。 */
export type RowPrimaryAction = "receive" | "reply" | "resolve" | "close";
export type ManualFieldErrors = { content?: string; sn?: string };
export type ManualPrefill = { open: boolean; userId: string | null; contact: string | null; sn: string | null; appVersion: string | null };
export type StoredFilterPref = { savedAt: number; values: Partial<FeedbackFilters> };

/** 本地记忆键与 antd 现版一致（同一产品同一份记忆）。筛选偏好带 TTL；sn / assignee / ticketId 属隐私与单查字段，不写入。 */
export const FEEDBACK_STORAGE_KEYS = { filter: "tianshu_feedback_filter_pref", columns: "tianshu_feedback_column_pref" } as const;
export const FILTER_PREF_TTL = 24 * 60 * 60 * 1000;

export const PRIORITY_OPTIONS: { label: string; value: FeedbackPriority }[] = [
  { label: "P1", value: "P1" },
  { label: "P2", value: "P2" },
  { label: "P3", value: "P3" }
];

export const TYPE_OPTIONS: { label: string; value: FeedbackType }[] = [
  { label: "故障", value: "fault" },
  { label: "建议", value: "suggestion" },
  { label: "咨询", value: "consult" },
  { label: "投诉", value: "complaint" }
];

export const SLA_STATE_OPTIONS: { label: string; value: SlaStateFilter }[] = [
  { label: "全部", value: "all" },
  { label: "正常", value: "normal" },
  { label: "即将超时", value: "near" },
  { label: "已超时", value: "overdue" }
];

// 六个状态的标签与 data.ts 的 feedbackStatusMeta 同源；「全部」是页面附加项。
export const STATUS_TABS: { key: FeedbackTabKey; label: string }[] = [
  { key: "all", label: "全部" },
  ...(["pending", "processing", "awaiting_user", "resolved", "closed", "rejected"] as FeedbackStatus[]).map((key) => ({
    key: key as FeedbackTabKey,
    label: feedbackStatusMeta[key].label
  }))
];

export const ALL_COLUMN_KEYS = [
  "id",
  "type",
  "priority",
  "status",
  "sla",
  "assignee",
  "sn",
  "appVersion",
  "firmware",
  "contact",
  "submittedAt"
] as const;

export type FeedbackColumnKey = (typeof ALL_COLUMN_KEYS)[number];

export const COLUMN_LABELS: Record<FeedbackColumnKey, string> = {
  id: "反馈编号",
  type: "类型",
  priority: "优先级",
  status: "状态",
  sn: "关联 SN",
  appVersion: "App 版本",
  firmware: "固件版本",
  contact: "联系方式",
  assignee: "处理人",
  sla: "SLA 剩余时间",
  submittedAt: "提交时间"
};

// 固定必显列置灰不可取消；操作列不在可选集内，始终显示。
export const FIXED_COLUMN_KEYS: readonly FeedbackColumnKey[] = ["id", "sla"];

/** 默认排序：SLA 剩余时间升序（轻重缓急），与 antd 列 defaultSortOrder 一致。 */
export const FEEDBACK_DEFAULT_SORT: FeedbackSort = { key: "sla", dir: "asc" };
/** 导出上限：超过 5,000 条要求先缩小筛选范围。 */
export const EXPORT_LIMIT = 5000;
/** 默认提交时间范围：以固定基准时刻往前推 30 个日历日，起点落在当天 00:00（antd dayjs 口径）。 */
export const DEFAULT_RANGE_DAYS = 30;

const pad2 = (value: number) => String(value).padStart(2, "0");

/** 「YYYY-MM-DD HH:mm」往前推 days 个日历日，只保留日期部分。 */
function subtractDaysDate(nowLabel: string, days: number): string {
  const [datePart] = nowLabel.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function defaultSubmittedRange(nowLabel: string = NOW_LABEL): [string, string] {
  return [`${subtractDaysDate(nowLabel, DEFAULT_RANGE_DAYS)} 00:00`, nowLabel];
}

/** 初始筛选：其余为空，提交时间默认最近 30 天。页面始终先浅拷贝再改，本对象不会被原地改动。 */
export const initialFeedbackFilters: FeedbackFilters = {
  ticketId: "",
  slaState: "all",
  priorities: [],
  types: [],
  submittedRange: defaultSubmittedRange(),
  statuses: [],
  sn: "",
  appVersions: [],
  firmwares: [],
  assignee: ""
};

/** 填了反馈编号就只按编号精确单查（大小写不敏感），其余字段在界面上置灰。 */
export const isTicketIdOnlySearch = (filters: FeedbackFilters) => Boolean(filters.ticketId.trim());

/** 「更多筛选」里已生效的条件数（状态 / 关联 SN / App 版本 / 固件版本 / 处理人，各占 1 项）。 */
export function countActiveMoreFilters(filters: FeedbackFilters) {
  return [
    filters.statuses.length > 0,
    Boolean(filters.sn.trim()),
    filters.appVersions.length > 0,
    filters.firmwares.length > 0,
    Boolean(filters.assignee.trim())
  ].filter(Boolean).length;
}

/** Tab 与状态筛选联动：恰好选中一个状态时 Tab 停在该状态，否则回到「全部」。 */
export const tabKeyForStatuses = (statuses: FeedbackStatus[]): FeedbackTabKey => (statuses.length === 1 ? statuses[0] : "all");
export const statusesForTab = (key: FeedbackTabKey): FeedbackStatus[] => (key === "all" ? [] : [key]);

const matchesTicketId = (ticket: FeedbackTicket, filters: FeedbackFilters) =>
  ticket.id.toUpperCase() === filters.ticketId.trim().toUpperCase();

/** 除状态外的全部条件（Tab 计数与列表过滤共用的范围口径）。 */
function matchesScopeFilters(ticket: FeedbackTicket, filters: FeedbackFilters) {
  if (filters.slaState !== "all" && slaStateOf(ticket) !== filters.slaState) return false;
  if (filters.priorities.length > 0 && !filters.priorities.includes(ticket.priority)) return false;
  if (filters.types.length > 0 && !filters.types.includes(ticket.type)) return false;
  if (filters.submittedRange) {
    const [start, end] = filters.submittedRange;
    if (ticket.submittedAt < start || ticket.submittedAt > end) return false;
  }
  if (filters.sn.trim() && (!ticket.sn || !ticket.sn.toLowerCase().includes(filters.sn.trim().toLowerCase()))) return false;
  if (filters.appVersions.length > 0 && (!ticket.appVersion || !filters.appVersions.includes(ticket.appVersion))) return false;
  if (filters.firmwares.length > 0 && (!ticket.firmware || !filters.firmwares.includes(ticket.firmware))) return false;
  if (filters.assignee.trim() && (!ticket.assignee || !ticket.assignee.includes(filters.assignee.trim()))) return false;
  return true;
}

/** 列表行过滤：编号单查短路；否则状态集合 + 其余范围条件。 */
export function matchesFeedbackFilters(ticket: FeedbackTicket, filters: FeedbackFilters) {
  if (filters.ticketId.trim()) return matchesTicketId(ticket, filters);
  if (filters.statuses.length > 0 && !filters.statuses.includes(ticket.status)) return false;
  return matchesScopeFilters(ticket, filters);
}

/** 状态 Tab 上的计数：排除状态条件本身，统计其余条件命中下各状态的条数。 */
export function statusTabCounts(tickets: FeedbackTicket[], filters: FeedbackFilters): Record<FeedbackTabKey, number> {
  const scoped = tickets.filter((ticket) => (filters.ticketId.trim() ? matchesTicketId(ticket, filters) : matchesScopeFilters(ticket, filters)));
  const counts = { all: scoped.length } as Record<FeedbackTabKey, number>;
  for (const tab of STATUS_TABS) {
    if (tab.key === "all") continue;
    counts[tab.key] = scoped.filter((ticket) => ticket.status === tab.key).length;
  }
  return counts;
}

/** 超时预警 Banner 的数字：当前列表范围内未关闭且 SLA 已超时的工单数。 */
export const overdueOpenCount = (rows: FeedbackTicket[]) =>
  rows.filter((ticket) => isFeedbackOpen(ticket) && slaStateOf(ticket) === "overdue").length;

/** App 版本筛选选项从工单数据提取（种子与运行态一致，antd 同源）。 */
export function collectAppVersionOptions(tickets: FeedbackTicket[]): { label: string; value: string }[] {
  const set = new Set<string>();
  for (const ticket of tickets) if (ticket.appVersion) set.add(ticket.appVersion);
  return Array.from(set).map((value) => ({ label: value, value }));
}

/** SLA 剩余分钟数：已办结工单停在办结时刻，其余按固定基准时刻计时（种子可复现口径）。 */
export const slaDeltaMinutes = (ticket: FeedbackTicket) =>
  toLinearMinutes(ticket.slaDeadlineAt) - (ticket.resolvedAt ? toLinearMinutes(ticket.resolvedAt) : toLinearMinutes(NOW_LABEL));

const sortComparators: Record<FeedbackSortKey, (a: FeedbackTicket, b: FeedbackTicket) => number> = {
  sla: (a, b) => slaDeltaMinutes(a) - slaDeltaMinutes(b),
  priority: (a, b) => a.priority.localeCompare(b.priority),
  submittedAt: (a, b) => a.submittedAt.localeCompare(b.submittedAt)
};

/**
 * 比较器：只按所选列排序，同值保持过滤后列表的原有相对顺序（antd Table 稳定排序口径）。
 * sort 为 null（已清除排序）时返回恒等比较器：稳定排序下行保持传入顺序（antd 数据源就是过滤后的原顺序，没有兜底比较）。
 */
export function compareTickets(sort: FeedbackSort | null) {
  if (!sort) return () => 0;
  const primary = sortComparators[sort.key];
  const factor = sort.dir === "desc" ? -1 : 1;
  return (a: FeedbackTicket, b: FeedbackTicket) => factor * primary(a, b);
}

/** 点表头切换排序（antd Table 三态）：新列先升序；当前列升序 → 降序 → 清除（null）。默认状态是 SLA 升序，第一次点它变降序。 */
export const toggleFeedbackSort = (current: FeedbackSort | null, key: FeedbackSortKey): FeedbackSort | null => nextSortState(current, key);

// —— 状态流转允许性（与 store 的写入口径一致；store 仍是最终裁决）——

/** 批量指派 / 行勾选：仅待受理 / 处理中。 */
export const isAssignable = (ticket: Pick<FeedbackTicket, "status">) =>
  ticket.status === "pending" || ticket.status === "processing";
export const canReceive = (ticket: Pick<FeedbackTicket, "status">) => ticket.status === "pending";
export const canReply = (ticket: Pick<FeedbackTicket, "status">) =>
  ticket.status === "processing" || ticket.status === "awaiting_user";
export const canResolve = (ticket: Pick<FeedbackTicket, "status">) =>
  ticket.status === "processing" || ticket.status === "awaiting_user";
export const canClose = (ticket: Pick<FeedbackTicket, "status">) => ticket.status === "resolved";
export const canReject = (ticket: Pick<FeedbackTicket, "status">) =>
  ticket.status === "pending" || ticket.status === "processing";

/** 行内主推动作：待受理→受理；处理中→回复用户；待用户确认→标记已解决；已解决→关闭；终态无。 */
export function rowPrimaryAction(status: FeedbackStatus): RowPrimaryAction | null {
  if (status === "pending") return "receive";
  if (status === "processing") return "reply";
  if (status === "awaiting_user") return "resolve";
  if (status === "resolved") return "close";
  return null;
}

/** 本页全选框三态：本页可选行全勾 → true；本页有任意选中 → indeterminate；否则 false。 */
export function headerCheckboxState(selectablePageIds: string[], pageIds: string[], selected: string[]): boolean | "indeterminate" {
  if (selectablePageIds.length > 0 && selectablePageIds.every((id) => selected.includes(id))) return true;
  return pageIds.some((id) => selected.includes(id)) ? "indeterminate" : false;
}

/** 列设置勾选：固定必显列不可改；重新勾上时按合同列序归位。 */
export function toggleColumnVisible(current: FeedbackColumnKey[], key: FeedbackColumnKey, visible: boolean): FeedbackColumnKey[] {
  if (FIXED_COLUMN_KEYS.includes(key)) return current;
  if (visible) return ALL_COLUMN_KEYS.filter((item) => current.includes(item) || item === key);
  return current.filter((item) => item !== key);
}

/** 列设置记忆初始化：非法键丢弃，恢复后为空则回退全部列。 */
export function initialVisibleColumns(storage?: KeyValueStore): FeedbackColumnKey[] {
  const parsed = readStored<unknown>(storage, FEEDBACK_STORAGE_KEYS.columns);
  if (Array.isArray(parsed) && parsed.length > 0) {
    const keys = parsed.filter((key): key is FeedbackColumnKey => (ALL_COLUMN_KEYS as readonly string[]).includes(key as string));
    if (keys.length > 0) return keys;
  }
  return [...ALL_COLUMN_KEYS];
}

/**
 * 筛选偏好写入负载：不记隐私与单查字段（反馈编号 / 关联 SN / 处理人），
 * savedAt 毫秒时间戳由调用方给（页面传 Date.now()，测试可控）。
 */
export function filterPrefToStore(filters: FeedbackFilters, savedAt: number): StoredFilterPref {
  return {
    savedAt,
    values: {
      slaState: filters.slaState,
      priorities: [...filters.priorities],
      types: [...filters.types],
      submittedRange: filters.submittedRange ? ([...filters.submittedRange] as [string, string]) : null,
      statuses: [...filters.statuses],
      appVersions: [...filters.appVersions],
      firmwares: [...filters.firmwares]
    }
  };
}

export type FeedbackPageInit = { filters: FeedbackFilters; currentTicketId: string | null; manualPrefill: ManualPrefill };

/**
 * 进入页面时的初始状态：先恢复 24 小时内的筛选记忆，再以网址预置参数覆盖
 * （ticket / sn / sla / status 从工作台、设备详情等处跳来）。ticket 同时驱动详情抽屉打开；
 * create=1 时带上用户与绑定页预填代录弹窗的上下文（手机号沿用带来值不还原明文）。
 */
export function initialFeedbackState(options: { search: string; storage?: KeyValueStore; now: number }): FeedbackPageInit {
  const params = new URLSearchParams(options.search);
  const filters: FeedbackFilters = {
    ...initialFeedbackFilters,
    priorities: [...initialFeedbackFilters.priorities],
    types: [...initialFeedbackFilters.types],
    statuses: [...initialFeedbackFilters.statuses],
    appVersions: [...initialFeedbackFilters.appVersions],
    firmwares: [...initialFeedbackFilters.firmwares],
    submittedRange: initialFeedbackFilters.submittedRange ? ([...initialFeedbackFilters.submittedRange] as [string, string]) : null
  };
  const stored = readStored<StoredFilterPref>(options.storage, FEEDBACK_STORAGE_KEYS.filter);
  if (stored && stored.savedAt && options.now - stored.savedAt < FILTER_PREF_TTL && stored.values) {
    Object.assign(filters, stored.values);
  }
  const urlTicket = params.get("ticket");
  if (urlTicket) filters.ticketId = urlTicket;
  const urlSn = params.get("sn");
  if (urlSn) filters.sn = urlSn;
  const urlSla = params.get("sla");
  if (urlSla === "overdue" || urlSla === "near" || urlSla === "normal") filters.slaState = urlSla;
  const urlStatus = params.get("status");
  if (urlStatus && STATUS_TABS.some((tab) => tab.key === urlStatus) && urlStatus !== "all") {
    filters.statuses = [urlStatus as FeedbackStatus];
  }
  const create = params.get("create") === "1";
  return {
    filters,
    currentTicketId: urlTicket,
    manualPrefill: {
      open: create,
      userId: create ? params.get("userId") : null,
      contact: create ? params.get("phone") : null,
      sn: create ? params.get("sn") : null,
      appVersion: create ? params.get("appVersion") : null
    }
  };
}

/**
 * 客服代录提交前规整：antd Form 未触碰字段是 undefined；页面状态用空字符串起步，提交时还原为 undefined（内容保持原始输入，store 自行 trim 校验）。
 * 关联 SN 去掉首尾空格再提交，只有空格时按未关联处理：字段校验按去空格后的 SN 判断存在，store 按原串精确匹配，不规整会出现「校验通过、提交失败」。
 * antd 现版把原串直接交给 store，有同样的问题，这里有意不跟随（Owner 2026-10-12 按建议定口径，见 phase4-4/RULE-DIFF R13、R14）。
 */
export function normalizeManualForm(form: FeedbackManualForm): FeedbackManualForm {
  const blank = (value?: string | null) => (value === "" || value === null ? undefined : value);
  return { ...form, sn: blank(form.sn?.trim()), userId: blank(form.userId), contact: blank(form.contact), appVersion: blank(form.appVersion) };
}

/** 回复表单校验（antd 文案）：必填 + 不超过 500 字，校验原始输入。 */
export function replyContentError(content: string): string | null {
  if (!content) return "请输入回复内容";
  if (content.length > 500) return "回复内容不得超过 500 字";
  return null;
}

/** 驳回表单校验（antd 文案）：必填 5–200 字，校验原始输入。 */
export function rejectReasonError(reason: string): string | null {
  if (!reason) return "驳回原因必填";
  if (reason.length < 5) return "驳回原因至少 5 个字";
  if (reason.length > 200) return "驳回原因不得超过 200 字";
  return null;
}

/** 客服代录表单校验（antd 文案）：内容必填 ≤500 字；关联 SN 选填但必须在系统内存在（存在性按去掉首尾空格后判断，与 antd 校验器一致）。 */
export function manualTicketFieldErrors(form: Pick<FeedbackManualForm, "content" | "sn">, devices: Pick<Device, "sn">[]): ManualFieldErrors {
  const errors: ManualFieldErrors = {};
  if (!form.content) errors.content = "请输入反馈内容";
  else if (form.content.length > 500) errors.content = "内容不得超过 500 字";
  const sn = form.sn?.trim();
  if (sn && !devices.some((device) => device.sn === sn)) errors.sn = "系统内未找到该 SN 对应的设备";
  return errors;
}

/** 导出上限：超出 5,000 条返回警告文案（antd 原话），否则返回 null 可以导出。 */
export const exportBlockedReason = (count: number): string | null =>
  count > EXPORT_LIMIT ? "导出记录超出 5,000 条上限，请缩小筛选范围后重试" : null;

/** 指派弹窗默认处理人：第一位「客服」，没有客服时取列表第一位。 */
export const defaultAssigneeValue = (staff: readonly { value: string }[]): string =>
  (staff.find((option) => option.value.startsWith("客服")) ?? staff[0]).value;
