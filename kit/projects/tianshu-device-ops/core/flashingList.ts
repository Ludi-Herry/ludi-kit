// 烧录发证列表页控制器（第 4 阶段 4.4 批次 D）：筛选匹配、固件版本联动、最新版本蓝点、排序、行/批量操作可用性的规则只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window；网址参数、本地存储都由调用方传入。
// 口径以 antd 小豆盒现版 generated/FlashingPage.tsx 为准（第 4 阶段 antd 页面暂不接入）。
// 关键约定：烧录时间列初始降序（antd 表格 defaultSortOrder=descend）；用户点表头清除排序后（null）行保持传入顺序，不再套烧录时间兜底；
// 报废强确认的口令文本、失败登记的表单口径与 store.markFlashFailed / scrapFlash 的前置条件同源。

import {
  flashingFailureCategories,
  flashingResultMeta,
  flashingStations,
  lifecycleMeta,
  models,
  type CertState,
  type Device,
  type FlashingFailureCategory,
  type FlashingLogStepState,
  type FlashingRecord,
  type LifecycleState
} from "../data";
import type { NormalizeIntegerOptions } from "./number";
import { nextSortState } from "./sort";
import { readStored, type KeyValueStore } from "./storage";

/** 日期范围：[开始, 结束]，YYYY-MM-DD，闭区间。与 antd 现版本地记忆的写法一致。 */
export type TimeRange = [string, string] | null;

export type FlashingFilters = {
  sn: string;
  lifecycles: LifecycleState[];
  result: FlashingRecord["result"] | null;
  certState: CertState | null;
  startedAt: TimeRange;
  models: string[];
  firmware: string[];
  batch: string;
  stations: string[];
  operator: string | null;
  retryMin: number | null;
  retryMax: number | null;
};

export const FLASHING_STORAGE_KEYS = { filter: "device-ops:flashing-filter", columns: "device-ops:flashing-columns" } as const;
/** 超限报废 C 档强确认的口令文本（行内与批量同一档位）。 */
export const SCRAP_CONFIRM_TEXT = "确认报废";

export const emptyFlashingFilters: FlashingFilters = {
  sn: "",
  lifecycles: [],
  result: null,
  certState: null,
  startedAt: null,
  models: [],
  firmware: [],
  batch: "",
  stations: [],
  operator: null,
  retryMin: null,
  retryMax: null
};

// 烧录时间默认全部时间：当日默认会让首屏只剩一条记录，与验收要点「证书状态列含灰/绿/红三态」冲突，
// 故跟随验收要点；字段保留当日快捷选择，可清空为全部时间（卡片筛选区联动规则）。

/** 日志步骤状态文案（antd logStepMeta 的 label；底色映射是界面层职责，不进控制器）。 */
export const flashingLogStepMeta: Record<FlashingLogStepState, { label: string }> = {
  succeeded: { label: "成功" },
  failed: { label: "失败" },
  processing: { label: "进行中" },
  pending: { label: "待执行" }
};

// —— 筛选选项：以烧录·发证 / 烧录失败为主，生产域其余状态可扩展筛入历史记录（PRD ③）——
export const flashingLifecycleOptions = (["flashing", "flash_failed", "received", "testing", "test_failed", "in_stock"] as LifecycleState[]).map(
  (value) => ({ value, label: lifecycleMeta[value].label })
);
export const flashingModelOptions = models.map((value) => ({ value, label: value }));
export const flashingStationOptions = flashingStations.map((value) => ({ value, label: value }));
export const flashingResultOptions = (Object.keys(flashingResultMeta) as Array<FlashingRecord["result"]>).map((value) => ({
  value,
  label: flashingResultMeta[value].label
}));
export const flashingFailureCategoryOptions = flashingFailureCategories.map((value) => ({ value, label: value }));

/** 「更多筛选」里已生效的条件数，用于按钮角标与是否默认展开。 */
export function activeFlashingMoreCount(filters: FlashingFilters) {
  return [
    filters.models.length > 0,
    filters.firmware.length > 0,
    filters.batch.trim() !== "",
    filters.stations.length > 0,
    filters.operator !== null,
    filters.retryMin !== null || filters.retryMax !== null
  ].filter(Boolean).length;
}

/** 重试次数筛选（下限 / 上限）两个输入框的归整参数：antd InputNumber min=0 max=999 precision=0。失焦 / 回车时用 normalizeInteger(raw, FLASHING_RETRY_FILTER_INTEGER) 归整后再写回。 */
export const FLASHING_RETRY_FILTER_INTEGER: NormalizeIntegerOptions = { min: 0, max: 999 };

const inRange = (day: string, range: TimeRange) => (!range ? true : day >= range[0] && day <= range[1]);

export function matchesFlashingFilters(record: FlashingRecord, device: Device | undefined, filters: FlashingFilters) {
  if (filters.sn.trim() && !record.sn.toLowerCase().includes(filters.sn.trim().toLowerCase())) return false;
  if (filters.lifecycles.length && (!device || !filters.lifecycles.includes(device.lifecycle))) return false;
  if (filters.result && record.result !== filters.result) return false;
  if (filters.certState && record.certState !== filters.certState) return false;
  if (!inRange(record.startedAt.slice(0, 10), filters.startedAt)) return false;
  if (filters.models.length && !filters.models.includes(record.model)) return false;
  if (filters.firmware.length && !filters.firmware.includes(record.firmwareVersion)) return false;
  if (filters.batch.trim() && !(device?.batch ?? "").toLowerCase().includes(filters.batch.trim().toLowerCase())) return false;
  if (filters.stations.length && !filters.stations.includes(record.station)) return false;
  if (filters.operator && record.operator !== filters.operator) return false;
  if (filters.retryMin !== null && record.retryCount < filters.retryMin) return false;
  if (filters.retryMax !== null && record.retryCount > filters.retryMax) return false;
  return true;
}

/** 固件版本筛选数据源：已发布的版本目录（草稿与已停用不出现在生产筛选里）；选中机型时按适用机型联动。 */
export function flashingFilterVersions(
  allVersions: ReadonlyArray<{ version: string; models: string[]; status: string }>,
  selectedModels: string[]
) {
  return allVersions
    .filter((version) => version.status !== "draft" && version.status !== "deprecated")
    .filter((version) => selectedModels.length === 0 || version.models.some((model) => selectedModels.includes(model)))
    .map((version) => ({ value: version.version, label: version.version }));
}

/** 最新版本蓝点：已全量 / 灰度中的最高版本号（确定性比较主、次、修订三段数字）。 */
export function latestPublishedVersion(allVersions: ReadonlyArray<{ version: string; status: string }>): string | null {
  const parse = (version: string) => version.replace(/^v/, "").split(/[.-]/).map(Number);
  const published = allVersions.filter((version) => version.status === "released" || version.status === "canary");
  if (published.length === 0) return null;
  return published.reduce((best, item) => {
    const left = parse(item.version);
    const right = parse(best.version);
    for (let index = 0; index < 3; index += 1) {
      if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) > (right[index] ?? 0) ? item : best;
    }
    return best;
  }, published[0]).version;
}

/** 操作人筛选项：按出现过的操作人去重。 */
export function flashingOperatorOptions(records: FlashingRecord[]) {
  return [...new Set(records.map((record) => record.operator))].map((value) => ({ value, label: value }));
}

export type FlashingSortKey = "firmware" | "retry" | "duration" | "startedAt";
export type FlashingSortState = { key: FlashingSortKey; dir: "asc" | "desc" };

/** 表格列排序：固件版本与烧录时间按字典序，重试次数与耗时按数值（未完成耗时视为 -1）。 */
export const flashingSortComparators: Record<FlashingSortKey, (a: FlashingRecord, b: FlashingRecord) => number> = {
  firmware: (a, b) => a.firmwareVersion.localeCompare(b.firmwareVersion),
  retry: (a, b) => a.retryCount - b.retryCount,
  duration: (a, b) => (a.durationSec ?? -1) - (b.durationSec ?? -1),
  startedAt: (a, b) => a.startedAt.localeCompare(b.startedAt)
};

/** 初始排序：烧录时间倒序（antd 表格烧录时间列 defaultSortOrder=descend）。只是页面刚打开时的状态；清除后是 null，不是它。 */
export const DEFAULT_FLASHING_SORT: FlashingSortState = { key: "startedAt", dir: "desc" };

/** 点表头切换排序（antd Table 三态）：新列先升序；当前列升序 → 降序 → 清除（null）。初始是烧录时间降序，第一次点它就清除。 */
export const toggleFlashingSort = (current: FlashingSortState | null, key: FlashingSortKey): FlashingSortState | null =>
  nextSortState(current, key);

/** 按排序状态取行（返回新数组）：null = 无排序，保持传入顺序；同值也保持传入顺序（antd 稳定排序，无兜底比较）。 */
export function sortFlashingRecords(records: FlashingRecord[], sort: FlashingSortState | null): FlashingRecord[] {
  if (!sort) return records.slice();
  const compare = flashingSortComparators[sort.key];
  const factor = sort.dir === "desc" ? -1 : 1;
  return records.slice().sort((a, b) => factor * compare(a, b));
}

export type FlashingListInit = { filters: FlashingFilters };

/**
 * 进入页面时的初始筛选。网址带 sn / status（工作台「待烧录发证」卡片预置，与卡片计数同源）时以网址为准，
 * 并保留全部记录供追溯（不叠加时间记忆）；否则恢复上次的筛选记忆（本页无隐私字段，全部条件可记忆）。
 */
export function initialFlashingListState(options: { search: string; storage?: KeyValueStore }): FlashingListInit {
  const params = new URLSearchParams(options.search);
  const urlSn = params.get("sn");
  const urlStatus = params.get("status");
  if (urlSn || urlStatus) {
    const lifecycles = (urlStatus ?? "").split(",").filter((value): value is LifecycleState => value in lifecycleMeta);
    return { filters: { ...emptyFlashingFilters, sn: urlSn ?? "", lifecycles, startedAt: null } };
  }
  const memory = readStored<FlashingFilters>(options.storage, FLASHING_STORAGE_KEYS.filter);
  return { filters: memory ? { ...emptyFlashingFilters, ...memory } : emptyFlashingFilters };
}

// —— 行内操作与批量操作的可用性（页面显隐口径，与 store 四个动作的前置条件同源）——

/** 标记成功 / 标记失败：仅设备状态为「烧录·发证」（record.result=processing，store 动作里再复核）。 */
export const canMarkFlash = (device: Device | undefined) => device?.lifecycle === "flashing";
/** 重试烧录：烧录失败且重试未达上限。 */
export const canRetryFlash = (record: FlashingRecord, device: Device | undefined) =>
  device?.lifecycle === "flash_failed" && record.result === "failed" && record.retryCount < record.retryLimit;
/** 超限报废：烧录失败且重试已达上限，设备处于「烧录失败」。 */
export const canScrapFlash = (record: FlashingRecord, device: Device | undefined) =>
  device?.lifecycle === "flash_failed" && record.result === "failed" && record.retryCount >= record.retryLimit;
/** 查看证书详情：证书已签发。 */
export const canViewFlashingCert = (record: FlashingRecord) => record.certState === "cert_issued";

/** 批量操作是否可用及不可用的原因文案（Toolbar Tooltip 同源）。 */
export function flashingBulkAvailability(records: FlashingRecord[], lifecycleOf: (sn: string) => LifecycleState | undefined) {
  const scrapOk =
    records.length > 0 &&
    records.every((record) => record.result === "failed" && record.retryCount >= record.retryLimit && lifecycleOf(record.sn) === "flash_failed");
  return {
    markFail: {
      ok: records.length > 0 && records.every((record) => record.result === "processing"),
      reason: "仅选中行全部为「烧录·发证」时可用"
    },
    scrap: {
      ok: scrapOk,
      reason: "仅选中行全部为「烧录失败」且重试已达上限时可用"
    }
  } as const;
}

/** 失败原因登记的表单口径（antd 提交按钮禁用条件与 store.markFlashFailed 的前置同源）：分类必选、描述必填（≤500 字）。 */
export function flashingFailureFormError(form: { category: FlashingFailureCategory | null; description: string }): string | null {
  if (!form.category) return "请选择失败原因分类";
  const description = form.description.trim();
  if (!description || description.length > 500) return "失败描述必填且不超过 500 字";
  return null;
}
