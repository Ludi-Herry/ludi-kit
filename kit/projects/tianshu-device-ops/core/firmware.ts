// 固件与推送页控制器（第 4 阶段 4.4）：双 Tab 解析、筛选匹配与校验、排序、网址/会话记忆初始化、
// 绑定计数、行内与批量操作是否可用、回滚候选、新建推送任务的草稿校验与命中预估、SN 清单解析、
// 任务详情逐台结果筛选，规则只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window；网址参数、本地存储都由调用方传入。
// 口径以 antd 小豆盒现版 generated/FirmwarePage.tsx 为准（本页筛选记忆走 sessionStorage，调用方传入）。

import {
  firmwareStatusMeta,
  models,
  pushTargetDevices,
  pushTaskStatusMeta,
  type Device,
  type FirmwareSignStatus,
  type FirmwareStatus,
  type FirmwareVersion,
  type PushDeviceResult,
  type PushResultStatus,
  type PushTask,
  type PushTaskStatus
} from "../data";
import { nextSortState } from "./sort";
import { readStored, type KeyValueStore } from "./storage";

export type FirmwareTab = "version" | "push-task";

export type VersionFilters = {
  keyword: string;
  models: string[];
  statuses: FirmwareStatus[];
  signStatus: FirmwareSignStatus | "";
  publisher: string;
  releasedRange: [string, string] | null;
  ratioMin: string;
  ratioMax: string;
};
export type TaskFilters = {
  keyword: string;
  versions: string[];
  models: string[];
  statuses: PushTaskStatus[];
  creator: string;
  createdRange: [string, string] | null;
};

export const emptyVersionFilters: VersionFilters = {
  keyword: "",
  models: [],
  statuses: [],
  signStatus: "",
  publisher: "",
  releasedRange: null,
  ratioMin: "",
  ratioMax: ""
};
export const emptyTaskFilters: TaskFilters = { keyword: "", versions: [], models: [], statuses: [], creator: "", createdRange: null };

/** 筛选记忆键：antd 口径写入 sessionStorage，调用方决定实际存储。 */
export const FIRMWARE_STORAGE_KEYS = {
  version: "device-ops:firmware-version-filters",
  pushTask: "device-ops:firmware-task-filters"
} as const;

// ---------- 页签 ----------

/** URL 中的 ?tab 解析为页签；缺省与未知取值都归一到固件版本。 */
export const resolveFirmwareTab = (param: string | null): FirmwareTab => (param === "push-task" ? "push-task" : "version");

/** tab 参数缺失或未知时需要把 URL 补齐为 ?tab=version（替换式跳转）。 */
export const firmwareTabNeedsNormalization = (param: string | null): boolean => param !== "version" && param !== "push-task";

// ---------- 筛选匹配 ----------

const inDayRange = (value: string | null, range: [string, string] | null) => {
  if (!range) return true;
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= range[0] && day <= range[1];
};

/** 版本行是否命中已生效筛选：关键词（版本号子串）+ 机型（任一命中）+ 状态 / 签名状态 / 发布人 + 发布时间范围 + 灰度比例区间。 */
export function matchesVersionFilters(version: FirmwareVersion, filters: VersionFilters): boolean {
  const word = filters.keyword.trim().toLowerCase();
  if (word && !version.version.toLowerCase().includes(word)) return false;
  if (filters.models.length > 0 && !version.models.some((model) => filters.models.includes(model))) return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(version.status)) return false;
  if (filters.signStatus && version.signStatus !== filters.signStatus) return false;
  if (filters.publisher && version.publisher !== filters.publisher) return false;
  if (!inDayRange(version.releasedAt, filters.releasedRange)) return false;
  const ratioMin = filters.ratioMin === "" ? null : Number(filters.ratioMin);
  const ratioMax = filters.ratioMax === "" ? null : Number(filters.ratioMax);
  if (ratioMin !== null || ratioMax !== null) {
    if (version.ratio === null) return false;
    if (ratioMin !== null && version.ratio < ratioMin) return false;
    if (ratioMax !== null && version.ratio > ratioMax) return false;
  }
  return true;
}

/** 任务行是否命中已生效筛选：关键词（任务名称或编号子串）+ 目标版本 / 机型 / 状态 / 创建人 + 创建时间范围。 */
export function matchesTaskFilters(task: PushTask, filters: TaskFilters): boolean {
  const word = filters.keyword.trim().toLowerCase();
  if (word && !task.name.toLowerCase().includes(word) && !task.id.toLowerCase().includes(word)) return false;
  if (filters.versions.length > 0 && !filters.versions.includes(task.versionId)) return false;
  if (filters.models.length > 0 && !filters.models.includes(task.model)) return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false;
  if (filters.creator && task.creator !== filters.creator) return false;
  if (!inDayRange(task.createdAt, filters.createdRange)) return false;
  return true;
}

// ---------- 排序 ----------

export type SortDir = "asc" | "desc";
export type VersionSortKey = "releasedAt" | "ratio";
export type VersionSort = { key: VersionSortKey; dir: SortDir };
export type TaskSortKey = "createdAt" | "ratio" | "failureRate";
export type TaskSort = { key: TaskSortKey; dir: SortDir };

const releasedDesc = (a: FirmwareVersion, b: FirmwareVersion) => (b.releasedAt ?? "").localeCompare(a.releasedAt ?? "");
const createdDesc = (a: FirmwareVersion, b: FirmwareVersion) => b.createdAt.localeCompare(a.createdAt);

/** 版本默认口径：发布时间新的在前，为空沉底；同值按创建时间新的在前。 */
export function compareVersionsDefault(a: FirmwareVersion, b: FirmwareVersion): number {
  return releasedDesc(a, b) || createdDesc(a, b);
}

/** 版本排序：主排序按所选列（比例的空值按 -1 参与），同值时回到默认口径。 */
export function compareVersions(sort: VersionSort) {
  const factor = sort.dir === "desc" ? -1 : 1;
  const primary =
    sort.key === "ratio"
      ? (a: FirmwareVersion, b: FirmwareVersion) => (a.ratio ?? -1) - (b.ratio ?? -1)
      : (a: FirmwareVersion, b: FirmwareVersion) => (a.releasedAt ?? "").localeCompare(b.releasedAt ?? "");
  return (a: FirmwareVersion, b: FirmwareVersion) => factor * primary(a, b) || compareVersionsDefault(a, b);
}

/** 任务默认口径：创建时间新的在前，同值编号大的在前。 */
export function comparePushTasksDefault(a: PushTask, b: PushTask): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

/** 任务排序：主排序按所选列，同值时回到默认口径。 */
export function comparePushTasks(sort: TaskSort) {
  const factor = sort.dir === "desc" ? -1 : 1;
  const primary =
    sort.key === "ratio"
      ? (a: PushTask, b: PushTask) => a.ratio - b.ratio
      : sort.key === "failureRate"
        ? (a: PushTask, b: PushTask) => a.failureRate - b.failureRate
        : (a: PushTask, b: PushTask) => a.createdAt.localeCompare(b.createdAt);
  return (a: PushTask, b: PushTask) => factor * primary(a, b) || comparePushTasksDefault(a, b);
}

/**
 * 点表头切换排序（antd Table 三态）：新列先升序；当前列升序 → 降序 → 清除（null）。
 * 两张表的初始状态都是降序（发布时间 / 创建时间），第一次点那一列就清除；清除后行回到各自的默认口径。
 */
export function nextColumnSort<K extends string, S extends { key: K; dir: SortDir }>(current: S | null, key: K): S | null {
  return nextSortState<S>(current, key);
}

/** 版本行 = 已生效筛选 + 排序（不传或传 null 时用默认口径：antd 数据源即默认口径，清除排序后看到的就是它）。 */
export function deriveVersionRows(versions: FirmwareVersion[], applied: VersionFilters, sort?: VersionSort | null): FirmwareVersion[] {
  return versions.filter((version) => matchesVersionFilters(version, applied)).sort(sort ? compareVersions(sort) : compareVersionsDefault);
}

/** 任务行 = 已生效筛选 + 排序（不传或传 null 时用默认口径）。 */
export function derivePushTaskRows(tasks: PushTask[], applied: TaskFilters, sort?: TaskSort | null): PushTask[] {
  return tasks.filter((task) => matchesTaskFilters(task, applied)).sort(sort ? comparePushTasks(sort) : comparePushTasksDefault);
}

// ---------- 筛选校验与「更多筛选」计数 ----------

/** 灰度比例区间校验：两端需为整数且下限 ≥ 0、上限 ≤ 100、下限不大于上限。返回 null 表示可以应用。 */
export function ratioRangeError(filters: Pick<VersionFilters, "ratioMin" | "ratioMax">): string | null {
  const min = filters.ratioMin === "" ? null : Number(filters.ratioMin);
  const max = filters.ratioMax === "" ? null : Number(filters.ratioMax);
  if ((min !== null && (!Number.isInteger(min) || min < 0)) || (max !== null && (!Number.isInteger(max) || max > 100))) {
    return "灰度比例区间需为 0–100 的整数";
  }
  if (min !== null && max !== null && min > max) return "灰度比例下限不能大于上限";
  return null;
}

export const RELEASED_RANGE_LIMIT_DAYS = 365;
/** 发布时间筛选单次查询不超过 365 天。 */
export function releasedRangeError(range: [string, string]): string | null {
  return (Date.parse(range[1]) - Date.parse(range[0])) / 86400000 > RELEASED_RANGE_LIMIT_DAYS ? "发布时间范围不能超过 365 天" : null;
}

/** 版本 Tab「更多筛选」里已生效的条件数，用于按钮角标与是否默认展开。 */
export function versionMoreCount(filters: VersionFilters): number {
  return [filters.publisher !== "", filters.releasedRange !== null, filters.ratioMin !== "" || filters.ratioMax !== ""].filter(
    Boolean
  ).length;
}

/** 任务 Tab「更多筛选」是否已设条件（创建人或创建时间），决定默认展开与按钮文案。 */
export function pushTaskMoreActive(filters: TaskFilters): boolean {
  return filters.creator !== "" || filters.createdRange !== null;
}

// ---------- 初始化：网址预置优先，其次会话记忆 ----------

export type FirmwareInit = { vDraft: VersionFilters; vApplied: VersionFilters; tDraft: TaskFilters; tApplied: TaskFilters };

/**
 * 进入页面时的初始筛选。网址带 status 时（工作台卡片等入口）识别当前 Tab 的状态枚举并整份预置（草稿与已生效同步），
 * 会话记忆整份让位；status 无法识别时，两个 Tab 各自恢复上次的筛选记忆。
 */
export function initialFirmwareState(options: { search: string; tab: FirmwareTab; storage?: KeyValueStore }): FirmwareInit {
  const statusParam = new URLSearchParams(options.search).get("status");
  if (statusParam) {
    if (options.tab === "version") {
      const statuses = statusParam.split(",").filter((value): value is FirmwareStatus => value in firmwareStatusMeta);
      if (statuses.length > 0) {
        const preset: VersionFilters = { ...emptyVersionFilters, statuses };
        return { vDraft: preset, vApplied: preset, tDraft: emptyTaskFilters, tApplied: emptyTaskFilters };
      }
    } else {
      const statuses = statusParam.split(",").filter((value): value is PushTaskStatus => value in pushTaskStatusMeta);
      if (statuses.length > 0) {
        const preset: TaskFilters = { ...emptyTaskFilters, statuses };
        return { vDraft: emptyVersionFilters, vApplied: emptyVersionFilters, tDraft: preset, tApplied: preset };
      }
    }
  }
  const storedV = readStored<{ draft: VersionFilters; applied: VersionFilters }>(options.storage, FIRMWARE_STORAGE_KEYS.version);
  const storedT = readStored<{ draft: TaskFilters; applied: TaskFilters }>(options.storage, FIRMWARE_STORAGE_KEYS.pushTask);
  return {
    vDraft: storedV ? { ...emptyVersionFilters, ...storedV.draft } : emptyVersionFilters,
    vApplied: storedV ? { ...emptyVersionFilters, ...storedV.applied } : emptyVersionFilters,
    tDraft: storedT ? { ...emptyTaskFilters, ...storedT.draft } : emptyTaskFilters,
    tApplied: storedT ? { ...emptyTaskFilters, ...storedT.applied } : emptyTaskFilters
  };
}

// ---------- 派生视图数据 ----------

/** 「绑定设备数」计数：已出货且当前运行该固件版本的设备数，版本号 → 台数。 */
export function boundDeviceCountByVersion(devices: Device[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const device of devices) {
    if (!device.firmware || !device.shippedAt) continue;
    map.set(device.firmware, (map.get(device.firmware) ?? 0) + 1);
  }
  return map;
}

/** 发布人筛选候选：出现过的发布人按首次出现顺序去重。 */
export const firmwarePublishers = (versions: FirmwareVersion[]): string[] => [
  ...new Set(versions.map((version) => version.publisher).filter((value): value is string => Boolean(value)))
];
/** 创建人筛选候选：按首次出现顺序去重。 */
export const pushTaskCreators = (tasks: PushTask[]): string[] => [...new Set(tasks.map((task) => task.creator))];

/** 版本抽屉「绑定设备」页：已出货且运行该版本的设备。 */
export const boundDevicesForVersion = (devices: Device[], version: FirmwareVersion): Device[] =>
  devices.filter((device) => device.firmware === version.version && device.shippedAt);
/** 版本抽屉「推送任务」页：该版本关联的任务，创建时间新的在前。 */
export const relatedTasksForVersion = (tasks: PushTask[], version: FirmwareVersion): PushTask[] =>
  tasks.filter((task) => task.versionId === version.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

// ---------- 状态流转与操作是否可用 ----------

export type FirmwareVersionAction = "edit" | "submitTest" | "deleteDraft" | "newPushTask" | "rollback" | "disable";
/** 版本行内动作可见性：编辑 / 提交测试 / 删除只对草稿开放；推送只对测试中 · 灰度中；回滚对已全量 · 灰度中；停用对已全量 · 已回滚。 */
export const versionActionAllowed = (version: FirmwareVersion, action: FirmwareVersionAction): boolean => {
  switch (action) {
    case "edit":
    case "submitTest":
    case "deleteDraft":
      return version.status === "draft";
    case "newPushTask":
      return version.status === "testing" || version.status === "canary";
    case "rollback":
      return version.status === "released" || version.status === "canary";
    case "disable":
      return version.status === "released" || version.status === "rolled_back";
  }
};

export type PushTaskAction = "pause" | "resume" | "cancel";
/** 任务动作可见性：执行中可暂停；已暂停可恢复；待执行 / 执行中 / 已暂停可取消。 */
export const pushTaskActionAllowed = (task: PushTask, action: PushTaskAction): boolean => {
  if (action === "pause") return task.status === "running";
  if (action === "resume") return task.status === "paused";
  return task.status === "pending_exec" || task.status === "running" || task.status === "paused";
};

export const FUSED_TASK_NOTE = "已熔断任务不可手动恢复";
/** 已熔断任务展示原因提示，不提供动作。 */
export const pushTaskShowsFusedNote = (task: PushTask): boolean => task.status === "fused";

/** 失败率标红口径：当前失败率严格大于熔断阈值。 */
export const failureRateExceeded = (task: PushTask): boolean => task.failureRate > task.circuitThreshold;

// ---------- 批量停用 ----------

export const BULK_DISABLE_REASON = "仅已全量 / 已回滚的版本可停用";
/** 批量停用是否可用：所选每个版本都存在且状态为已全量 / 已回滚；不可用时的原因见 BULK_DISABLE_REASON。 */
export function bulkDisableEligible(ids: string[], versions: FirmwareVersion[]): boolean {
  return ids.every((id) => {
    const version = versions.find((item) => item.id === id);
    return Boolean(version) && (version!.status === "released" || version!.status === "rolled_back");
  });
}

// ---------- 回滚 ----------

/** 回滚目标候选：排除自身、已全量、机型有交集的历史版本。 */
export function rollbackCandidates(source: FirmwareVersion, versions: FirmwareVersion[]): FirmwareVersion[] {
  return versions.filter(
    (item) => item.id !== source.id && item.status === "released" && item.models.some((model) => source.models.includes(model))
  );
}

/** 回滚确认是否可用：有候选目标、已选目标、原因达到 5 字（与 store 校验同一口径）。 */
export function rollbackConfirmDisabled(input: { candidateCount: number; targetId: string | undefined; reason: string }): boolean {
  return input.candidateCount === 0 || !input.targetId || input.reason.trim().length < 5;
}

// ---------- 新建推送任务 ----------

/** 可作为推送目标的版本：测试中 / 灰度中。 */
export const pushableVersions = (versions: FirmwareVersion[]): FirmwareVersion[] =>
  versions.filter((version) => version.status === "testing" || version.status === "canary");

/** 定向-机型候选：随目标版本联动；未选版本时给到全部机型。 */
export const pushTaskModelOptions = (chosen: FirmwareVersion | undefined): { value: string; label: string }[] =>
  (chosen ? chosen.models : models).map((value) => ({ value, label: value }));

export type PushTaskDraft = { name: string; versionId: string | null; model: string | null; ratio: string; threshold: string };
export type PushTaskDraftField = "name" | "versionId" | "model" | "ratio" | "threshold";

/** 新建推送任务提交前的字段校验；返回空对象表示可以提交。name 的必填按去空白判断、长度按原文。 */
export function pushTaskDraftErrors(draft: PushTaskDraft): Partial<Record<PushTaskDraftField, string>> {
  const errors: Partial<Record<PushTaskDraftField, string>> = {};
  if (!draft.name.trim()) errors.name = "请填写任务名称";
  else if (draft.name.length > 100) errors.name = "任务名称不超过 100 字";
  if (!draft.versionId) errors.versionId = "请选择目标版本";
  if (!draft.model) errors.model = "请选择机型";
  const ratio = Number(draft.ratio);
  if (!draft.ratio || !Number.isInteger(ratio) || ratio < 1 || ratio > 100) errors.ratio = "灰度比例需为 1–100 的整数";
  const threshold = Number(draft.threshold);
  if (!draft.threshold || !Number.isInteger(threshold) || threshold < 1 || threshold > 100) errors.threshold = "熔断阈值需为 1–100 的整数";
  return errors;
}

/**
 * 「预估生效范围」：机型必选；机型 + 批次 + 起始版本按 pushTargetDevices 口径（已出货），再套地区（省份为空的不命中地区条件）；
 * 导入了 SN 清单时只有清单内合法的设备会被命中。预估数 = round(命中 × 比例%)，比例非法按 0% 参与、至少 1 台，命中为 0 时预估 0。
 */
export function estimatePushTarget(input: {
  model: string | null;
  batches: string[];
  provinces: string[];
  fromVersions: string[];
  ratio: number;
  snList?: string[];
}): { hit: number; estimate: number } {
  if (!input.model) return { hit: 0, estimate: 0 };
  const base = pushTargetDevices({ model: input.model, batches: input.batches, fromVersions: input.fromVersions }).filter(
    (device) => input.provinces.length === 0 || (device.province !== null && input.provinces.includes(device.province))
  );
  const hit = input.snList !== undefined ? base.filter((device) => input.snList!.includes(device.sn)) : base;
  const ratio = Number.isInteger(input.ratio) && input.ratio >= 1 && input.ratio <= 100 ? input.ratio : 0;
  return { hit: hit.length, estimate: hit.length === 0 ? 0 : Math.max(1, Math.round((hit.length * ratio) / 100)) };
}

export type SnParseBuckets = { valid: string[]; wrongModel: string[]; duplicated: string[]; unknown: string[] };
/** 解析 SN 清单文本：空白 / 逗号 / 分号分隔，统一转大写去重；未登记进不存在，选了机型后机型不符进非目标机型。 */
export function parseSnList(text: string, devices: Device[], model: string | null): SnParseBuckets {
  const tokens = text
    .split(/[\s,;]+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const result: SnParseBuckets = { valid: [], wrongModel: [], duplicated: [], unknown: [] };
  for (const token of tokens) {
    if (seen.has(token)) {
      result.duplicated.push(token);
      continue;
    }
    seen.add(token);
    const device = devices.find((item) => item.sn === token);
    if (!device) result.unknown.push(token);
    else if (model && device.model !== model) result.wrongModel.push(token);
    else result.valid.push(token);
  }
  return result;
}

// ---------- 任务详情：逐台结果 ----------

/** 逐台结果的失败计数：失败 + 超时。 */
export const pushResultFailedCount = (results: PushDeviceResult[]): number =>
  results.filter((item) => item.result === "failed" || item.result === "timeout").length;

/** 逐台结果筛选：按结果状态 + SN 关键词（子串，忽略大小写）。 */
export function filterPushResults(
  results: PushDeviceResult[],
  query: { result: PushResultStatus | ""; snKeyword: string }
): PushDeviceResult[] {
  const word = query.snKeyword.trim().toLowerCase();
  return results.filter((item) => {
    if (query.result && item.result !== query.result) return false;
    if (word && !item.sn.toLowerCase().includes(word)) return false;
    return true;
  });
}

// ---------- 展示口径的纯文本 ----------

/** 定向条件摘要：多组条件需同时满足，无条件时推全部符合条件的设备。 */
export function targetingText(task: PushTask): string {
  const t = task.targeting;
  const parts: string[] = [];
  if (t.batches.length > 0) parts.push(`批次 ${t.batches.join(" / ")}`);
  if (t.provinces.length > 0) parts.push(`地区 ${t.provinces.join(" / ")}`);
  if (t.fromVersions.length > 0) parts.push(`起始版本 ${t.fromVersions.join(" / ")}`);
  if (t.snFileName) parts.push(`SN 清单 ${t.snFileName}（${t.snList.length} 台）`);
  return parts.length > 0 ? parts.join("；") : "全部符合条件的设备";
}

/** 执行时间窗展示：两端皆空显示「不限」。 */
export function windowText(task: PushTask): string {
  if (!task.windowStart && !task.windowEnd) return "不限";
  return `${task.windowStart ?? "—"} ~ ${task.windowEnd ?? "—"}`;
}

/** KMS 密钥 ID 只显示前缀，完整 ID 不出现在界面；由版本号确定性生成。 */
export function kmsKeyLabel(versionId: string): string {
  let hash = 0;
  for (const char of versionId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `kms:tianshu-fw-****-${(hash % 0xffff).toString(16).padStart(4, "0")}`;
}
