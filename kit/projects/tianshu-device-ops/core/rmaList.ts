// 退货 RMA 列表页控制器（第 4 阶段 4.4 批次 C）：筛选匹配、筛选记忆、网址初始化、状态机操作可用性、批量关闭资格与表单校验的规则只写这一份。
// 框架无关：不依赖 React / antd / 任何组件库，也不直接碰 window；网址串、本地存储与当前时间都由调用方传入。
// 口径以 antd 小豆盒现版 generated/RmaPage.tsx 为准（第 4 阶段 antd 页面暂不接入）。antd 里属于界面状态的弹窗开关、日历选择起始日、分页与排序交互仍留在页面。

import { NOW_LABEL, canCloseRmaRecord } from "../data";
import type {
  Device,
  RmaArrivalStatus,
  RmaConclusion,
  RmaDecisionMethod,
  RmaReasonCode,
  RmaRecord,
  RmaSource
} from "../data";
import { nextSortState } from "./sort";
import { readStored, writeStored, type KeyValueStore } from "./storage";
import { violatesNotBlank } from "./text";

/** 日期范围：[开始, 结束]，YYYY-MM-DD，闭区间。与 antd 现版本地记忆的写法一致。 */
export type RmaDayRange = [string, string] | null;

export type RmaFilters = {
  rmaId: string;
  sn: string;
  arrivalStatuses: RmaArrivalStatus[];
  conclusions: RmaConclusion[];
  deviceModels: string[];
  reasons: RmaReasonCode[];
  sources: RmaSource[];
  decisions: RmaDecisionMethod[];
  createdRange: RmaDayRange;
  closedRange: RmaDayRange;
};

/** 可执行裁决的三种处理方式（不含「待裁决」占位）。 */
export type RmaDecision = Exclude<RmaDecisionMethod, "pending_decision">;
export type RmaCreatePrefill = { sn: string; sourceFeedbackId: string };
export type RmaSortState = { key: "createdAt"; dir: "asc" | "desc" };

/** 表单值的框架无关写法：未选的枚举用空串表示；日期用 YYYY-MM-DD 或 null。 */
export type RmaCreateValues = { sn: string; reasonCode: string; source: string; description: string };
export type RmaEditValues = { reasonCode: string; source: string; description: string };
export type RmaInspectValues = { conclusion: string; appearanceScore: string; functionChecks: string[]; inspectNote: string };
export type RmaDecideValues = { decisionNote: string; expectedRepairDate: string | null };

export type RmaCreateErrors = Partial<Record<"sn" | "reasonCode" | "source" | "description", string>>;
export type RmaEditErrors = Partial<Record<"reasonCode" | "source" | "description", string>>;
export type RmaInspectErrors = Partial<Record<"conclusion" | "appearanceScore" | "functionChecks" | "inspectNote", string>>;
export type RmaDecideErrors = Partial<Record<"decisionNote" | "expectedRepairDate", string>>;

export const emptyRmaFilters: RmaFilters = {
  rmaId: "",
  sn: "",
  arrivalStatuses: [],
  conclusions: [],
  deviceModels: [],
  reasons: [],
  sources: [],
  decisions: [],
  createdRange: null,
  closedRange: null
};

export const RMA_STORAGE_KEYS = { filter: "rma_filter_pref", columns: "rma_table_column_pref" } as const;
/** 筛选记忆 24 小时后失效；列设置不过期。 */
export const RMA_FILTER_TTL = 24 * 60 * 60 * 1000;
/** 日期平移，YYYY-MM-DD 闭区间口径。 */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// 公历日序号（1970-01-01 = 0），纯整数运算，不经过毫秒与时区（Howard Hinnant 的 days_from_civil）。
function dayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/**
 * 两个日期之间相差几个自然日（to - from，可为负；格式 YYYY-MM-DD，带时间后缀只取前 10 位）。
 * 按日历日数，不用毫秒除 86400000，所以不受夏令时 / 时区偏移变化影响。日期不合法时返回 NaN。
 * 范围选择器的 366 天跨度用 Math.abs(naturalDayDiff(起点, 当前日)) > RMA_CREATED_RANGE_SPAN_DAYS 判断（antd: Math.abs(current.diff(start, "day")) > 366）。
 */
export function naturalDayDiff(from: string, to: string): number {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return match ? dayNumber(Number(match[1]), Number(match[2]), Number(match[3])) : Number.NaN;
  };
  return parse(to) - parse(from);
}

// 与冻结时间 2026-09-28 对齐的“今天”，范围校验（预计到件 ≤90 天、返修 ≤180 天）以它为原点。
export const RMA_TODAY = NOW_LABEL.slice(0, 10);
export const RMA_ARRIVAL_MAX_DAYS = 90;
export const RMA_REPAIR_MAX_DAYS = 180;
export const RMA_MAX_ARRIVAL_DAY = shiftDay(RMA_TODAY, RMA_ARRIVAL_MAX_DAYS);
export const RMA_MAX_REPAIR_DAY = shiftDay(RMA_TODAY, RMA_REPAIR_MAX_DAYS);
/** 「发起时间」筛选单次范围上限（antd disabledDate 口径）。 */
export const RMA_CREATED_RANGE_SPAN_DAYS = 366;
/** 单号筛选最少位数（PRD：≥4 位触发后端），不足位数不参与过滤。 */
export const RMA_ID_MIN_QUERY_LENGTH = 4;
/** 各路长度上限：新建/编辑的问题描述、检测备注、裁决说明。 */
export const RMA_TEXT_LIMITS = { description: 500, inspectNote: 1000, decisionNote: 500 } as const;
export const RMA_DECISIONS: readonly RmaDecision[] = ["repair", "restock", "scrap"];
/** 初始排序：发起时间降序（antd 表头 defaultSortOrder=descend）。只是页面刚打开时的状态；点表头清除后是 null。 */
export const DEFAULT_RMA_SORT: RmaSortState = { key: "createdAt", dir: "desc" };

/** 点「发起时间」表头切换排序（antd Table 三态）：降序（初始）→ 清除（null）→ 升序 → 降序。 */
export const toggleRmaSort = (current: RmaSortState | null): RmaSortState | null => nextSortState(current, "createdAt");

/** 「更多筛选」里已生效的条件数，用于按钮角标与是否默认展开。 */
export function activeRmaMoreCount(filters: RmaFilters) {
  return [
    filters.deviceModels.length > 0,
    filters.reasons.length > 0,
    filters.sources.length > 0,
    filters.decisions.length > 0,
    filters.createdRange !== null,
    filters.closedRange !== null
  ].filter(Boolean).length;
}

const inRange = (value: string | null, range: RmaDayRange) => {
  if (!range) return true;
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= range[0] && day <= range[1];
};

/** 单条记录是否命中已生效筛选；单号 ≥4 位才参与过滤，SN 精确匹配（大小写不敏感）。 */
export function matchesRmaFilters(record: RmaRecord, applied: RmaFilters) {
  const rmaWord = applied.rmaId.trim().toUpperCase();
  if (rmaWord.length >= RMA_ID_MIN_QUERY_LENGTH && !record.id.toUpperCase().includes(rmaWord)) return false;
  const snWord = applied.sn.trim().toUpperCase();
  if (snWord && record.sn.toUpperCase() !== snWord) return false;
  if (applied.arrivalStatuses.length && !applied.arrivalStatuses.includes(record.arrivalStatus)) return false;
  if (applied.conclusions.length && !applied.conclusions.includes(record.conclusion)) return false;
  if (applied.deviceModels.length && !applied.deviceModels.includes(record.model)) return false;
  if (applied.reasons.length && !applied.reasons.includes(record.reasonCode)) return false;
  if (applied.sources.length && !applied.sources.includes(record.source)) return false;
  if (applied.decisions.length && !applied.decisions.includes(record.decisionMethod)) return false;
  if (!inRange(record.createdAt, applied.createdRange)) return false;
  if (!inRange(record.closedAt, applied.closedRange)) return false;
  return true;
}

/**
 * 列表行：已生效筛选 + 按发起时间排序。不传 sort = 初始排序（降序，antd 表头 defaultSortOrder=descend）；
 * 传 null = 用户清除了排序，行保持传入顺序（antd 数据源就是筛选后的原顺序）。
 */
export function filterRmaRecords(rmas: RmaRecord[], applied: RmaFilters, sort: RmaSortState | null = DEFAULT_RMA_SORT): RmaRecord[] {
  const rows = rmas.filter((record) => matchesRmaFilters(record, applied));
  if (!sort) return rows;
  return rows.sort((a, b) => (sort.dir === "desc" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
}

/** 读筛选记忆：24 小时 TTL，过期或损坏按没有记忆处理；字段不足时用空筛选补齐。 */
export function readRmaFilters(storage: KeyValueStore | undefined, now: number): RmaFilters | null {
  const parsed = readStored<{ savedAt: number; filters: RmaFilters }>(storage, RMA_STORAGE_KEYS.filter);
  if (!parsed || typeof parsed.savedAt !== "number") return null;
  if (now - parsed.savedAt > RMA_FILTER_TTL) return null;
  return { ...emptyRmaFilters, ...parsed.filters };
}

export function writeRmaFilters(storage: KeyValueStore | undefined, filters: RmaFilters, now: number) {
  writeStored(storage, RMA_STORAGE_KEYS.filter, { savedAt: now, filters });
}

export type RmaListInit = { filters: RmaFilters; openId: string | null; createPrefill: RmaCreatePrefill | null };

/**
 * 进入页面时的初始状态。网址带 sn / rma / status 时（从工作台、设备详情、客户反馈跳来）以网址为准，
 * 其中 rma 同时打开详情抽屉；status=open（工作台「待处理 RMA」卡：未关闭且裁决未落）用「处理方式=待裁决」表达，计数与卡片同源。
 * 否则恢复 24 小时筛选记忆。客户反馈「转退货 RMA」带 new=1 时额外打开新建弹窗并预填 SN 与来源工单。
 */
export function initialRmaListState(options: { search: string; storage?: KeyValueStore; now: number }): RmaListInit {
  const params = new URLSearchParams(options.search);
  const urlSn = params.get("sn");
  const urlRma = params.get("rma");
  const urlStatus = params.get("status");
  const createPrefill = params.get("new") === "1" ? { sn: params.get("sn") ?? "", sourceFeedbackId: params.get("source_feedback") ?? "" } : null;
  if (urlSn || urlRma || urlStatus) {
    const filters: RmaFilters = { ...emptyRmaFilters, sn: urlSn ?? "" };
    if (urlRma) filters.rmaId = urlRma;
    if (urlStatus === "open") filters.decisions = ["pending_decision"];
    return { filters, openId: urlRma, createPrefill };
  }
  return { filters: readRmaFilters(options.storage, options.now) ?? emptyRmaFilters, openId: null, createPrefill };
}

/** SN 输入统一归一化：只留数字和大写字母（antd normalize 口径）。 */
export const normalizeRmaSnInput = (raw: string) => (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const RMA_DESCRIPTION_BLANK_MESSAGE = "原因选择「其他」时请填写问题描述";

/**
 * 新建表单校验：返回字段级错误信息，antd Form rules 口径；空对象表示可提交。
 * 问题描述 / 检测备注 / 裁决说明按 antd 的 { required: 条件, whitespace: true } 判定：选填时空串通过，但非空的纯空格同样报错（沿用该条规则的 message）。
 */
export function createRmaErrors(values: RmaCreateValues): RmaCreateErrors {
  const errors: RmaCreateErrors = {};
  const sn = values.sn.trim();
  if (!sn) errors.sn = "请输入 SN";
  else if (!/^[A-Z0-9]+$/.test(sn)) errors.sn = "SN 只能包含数字与大写字母";
  if (!values.reasonCode) errors.reasonCode = "请选择退货原因";
  if (!values.source) errors.source = "请选择退货来源";
  if (violatesNotBlank(values.description, values.reasonCode === "other")) errors.description = RMA_DESCRIPTION_BLANK_MESSAGE;
  else if (values.description.length > RMA_TEXT_LIMITS.description) errors.description = `问题描述不超过 ${RMA_TEXT_LIMITS.description} 字`;
  return errors;
}

/** 编辑表单校验（仅待到件阶段可编辑，由 rmaRowActions 与 store 共同保证）。 */
export function editRmaErrors(values: RmaEditValues): RmaEditErrors {
  const errors: RmaEditErrors = {};
  if (!values.reasonCode) errors.reasonCode = "请选择退货原因";
  if (!values.source) errors.source = "请选择退货来源";
  if (violatesNotBlank(values.description, values.reasonCode === "other")) errors.description = RMA_DESCRIPTION_BLANK_MESSAGE;
  else if (values.description.length > RMA_TEXT_LIMITS.description) errors.description = `问题描述不超过 ${RMA_TEXT_LIMITS.description} 字`;
  return errors;
}

/** 检测表单校验：结论、外观评分必填，功能检测 ≥1 项；结论为「报废」时备注必填。 */
export function inspectRmaErrors(values: RmaInspectValues): RmaInspectErrors {
  const errors: RmaInspectErrors = {};
  if (!values.conclusion) errors.conclusion = "请选择检测结论";
  if (!values.appearanceScore) errors.appearanceScore = "请选择外观评分";
  if (values.functionChecks.length === 0) errors.functionChecks = "功能检测至少选择 1 项";
  if (violatesNotBlank(values.inspectNote, values.conclusion === "scrap")) errors.inspectNote = "检测结论为「报废」时检测备注必填";
  else if (values.inspectNote.length > RMA_TEXT_LIMITS.inspectNote) errors.inspectNote = `检测备注不超过 ${RMA_TEXT_LIMITS.inspectNote} 字`;
  return errors;
}

/** 裁决表单校验：报废必填说明，返修必填预计完成日期。 */
export function decideRmaErrors(values: RmaDecideValues, method: RmaDecision): RmaDecideErrors {
  const errors: RmaDecideErrors = {};
  if (violatesNotBlank(values.decisionNote, method === "scrap")) errors.decisionNote = "报废裁决说明必填";
  else if (values.decisionNote.length > RMA_TEXT_LIMITS.decisionNote) errors.decisionNote = `裁决说明不超过 ${RMA_TEXT_LIMITS.decisionNote} 字`;
  if (method === "repair" && !values.expectedRepairDate) errors.expectedRepairDate = "返修裁决请填写预计返修完成日期";
  return errors;
}

/** 裁决弹窗的流转说明文案。 */
export function rmaDecisionFlowText(method: RmaDecision) {
  return method === "repair"
    ? "确认后设备状态变为「测试不合格」，进入返修回测流程，单据自动关闭。"
    : method === "restock"
      ? "确认后设备重新「合格入库」，单据自动关闭。"
      : "确认后设备进入「报废」并注销证书，单据自动关闭；报废为终态。";
}

export type RmaRowActions = {
  canEdit: boolean;
  canConfirmArrival: boolean;
  canInspect: boolean;
  /** 行操作里唯一露出的裁决方式（与检测结论相符）；当前不可裁决时为 null。 */
  decisionMethod: RmaDecision | null;
  canExportScrapCert: boolean;
};

/**
 * 单行 / 详情抽屉底部可做的操作，按状态机收敛（antd interaction-decisions §5 行操作规则）：
 * 待到件可编辑/确认到件 → 已到件-待检、检测中可录入检测 → 已检测待裁决且设备还在退货 RMA 时只露出与结论相符的裁决 → 设备已报废可导出报废凭证。
 */
export function rmaRowActions(record: RmaRecord, device: Device | undefined): RmaRowActions {
  const pending = record.arrivalStatus === "pending";
  const canDecide = record.arrivalStatus === "inspected" && record.decisionMethod === "pending_decision" && device?.lifecycle === "rma";
  return {
    canEdit: pending,
    canConfirmArrival: pending,
    canInspect: record.arrivalStatus === "arrived_pending_check" || record.arrivalStatus === "inspecting",
    decisionMethod: canDecide && record.conclusion !== "pending_check" ? (record.conclusion as RmaDecision) : null,
    canExportScrapCert: device?.lifecycle === "scrapped"
  };
}

export type RmaCloseEligibility = { ineligibleCount: number; disabled: boolean; reason: string | null };

/** 批量关闭是否可用及原因（antd 批量操作栏口径）：只有已裁决、且设备已离开退货流程的单据可以关闭。 */
export function rmaCloseEligibility(selected: RmaRecord[], deviceBySn: (sn: string) => Device | undefined): RmaCloseEligibility {
  const ineligibleCount = selected.filter((record) => !canCloseRmaRecord(record, deviceBySn(record.sn))).length;
  return {
    ineligibleCount,
    disabled: ineligibleCount > 0,
    reason: ineligibleCount > 0 ? `所选项中有 ${ineligibleCount} 条不满足关闭条件（需已裁决且设备已离开退货流程）` : null
  };
}
