// 数字护照列表页控制器（第 4 阶段 4.4 批次 E）：筛选匹配、提交归一化、默认排序与表头排序切换、
// 出厂日期跨度校验、网址参数与本地记忆初始化、列表计数口径、批量与单行公开操作的可用性与置灰原因、
// 公开范围配置的校验与联动，只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window；网址串与本地存储由调用方传入。
// 口径以 antd 小豆盒现版 generated/PassportListPage.tsx 为准（antd 页面暂不接入，见 docs/PLAN-四底座第4阶段-…）。
// 「设置公开范围 / 生成二维码」的可用性判定与公开范围表单校验同时服务护照详情页（详情页从这里导入，不再另写一份）。

import { defaultPassportPublishConfig, lifecycleMeta } from "../data";
import type { Device, LifecycleState, PassportPublishConfig, QcResult } from "../data";
import { readStored, type KeyValueStore } from "./storage";

// 本地记忆读写都在 storage.ts（各页控制器共用），这里转出以保持页面单入口导入。
export { readStored, writeStored } from "./storage";
export type { KeyValueStore } from "./storage";

/** 出厂日期范围：[开始, 结束]，YYYY-MM-DD，闭区间。 */
export type FactoryDateRange = [string, string] | null;

/** 「是否对外公开」筛选三态。 */
export type PublishStatusFilter = "all" | "published" | "unpublished";
/** 「是否有 RMA 记录」筛选三态。 */
export type RmaStatusFilter = "all" | "has_rma" | "no_rma";

export type PassportFilters = {
  sn: string;
  /** "all" 表示全部机型。 */
  model: string;
  lifecycles: LifecycleState[];
  qc: QcResult[];
  firmware: string[];
  factoryDateRange: FactoryDateRange;
  publishStatus: PublishStatusFilter;
  rmaStatus: RmaStatusFilter;
};

export const emptyPassportFilters: PassportFilters = {
  sn: "",
  model: "all",
  lifecycles: [],
  qc: [],
  firmware: [],
  factoryDateRange: null,
  publishStatus: "all",
  rmaStatus: "all"
};

/** 存储键与 antd 现版一致，前缀与全部设备页区分。 */
export const PASSPORT_STORAGE_KEYS = { filters: "device-ops:passport-filters", columns: "device-ops:passport-columns" } as const;

/** 查询提交时的归一化：SN 去首尾空格（antd handleFilterFinish 口径），其余字段由页面类型保证。 */
export function normalizePassportFilters(filters: PassportFilters): PassportFilters {
  return { ...filters, sn: filters.sn.trim() };
}

/** 八项筛选条件逐项匹配（antd 现版逐项同序）：SN 前缀模糊、机型、生命周期、质检、固件、出厂日期、公开状态、RMA 有/无。 */
export function matchesPassportFilters(device: Device, filters: PassportFilters): boolean {
  const snQuery = filters.sn.toLowerCase();
  if (snQuery && !device.sn.toLowerCase().startsWith(snQuery)) return false;
  if (filters.model !== "all" && device.model !== filters.model) return false;
  if (filters.lifecycles.length > 0 && !filters.lifecycles.includes(device.lifecycle)) return false;
  if (filters.qc.length > 0 && !filters.qc.includes(device.qc)) return false;
  if (filters.firmware.length > 0 && (!device.firmware || !filters.firmware.includes(device.firmware))) return false;
  if (filters.factoryDateRange) {
    if (!device.shippedAt) return false;
    const [start, end] = filters.factoryDateRange;
    if (device.shippedAt < start || device.shippedAt > end) return false;
  }
  if (filters.publishStatus === "published" && !device.passportPublish.publicEnabled) return false;
  if (filters.publishStatus === "unpublished" && device.passportPublish.publicEnabled) return false;
  if (filters.rmaStatus === "has_rma" && device.rmaCount === 0) return false;
  if (filters.rmaStatus === "no_rma" && device.rmaCount > 0) return false;
  return true;
}

/** 是否有任一筛选条件生效（工具条「（已按条件筛选）」与空态口径）。 */
export function hasActiveFilters(filters: PassportFilters): boolean {
  return (
    filters.sn !== "" ||
    filters.model !== "all" ||
    filters.lifecycles.length > 0 ||
    filters.qc.length > 0 ||
    filters.firmware.length > 0 ||
    filters.factoryDateRange !== null ||
    filters.publishStatus !== "all" ||
    filters.rmaStatus !== "all"
  );
}

/** 列表默认排序：出厂日期降序、未出货排在最后、同日期按 SN 升序。 */
export function comparePassportsByDefault(a: Device, b: Device): number {
  if (a.shippedAt && b.shippedAt) return b.shippedAt.localeCompare(a.shippedAt);
  if (a.shippedAt && !b.shippedAt) return -1;
  if (!a.shippedAt && b.shippedAt) return 1;
  return a.sn.localeCompare(b.sn);
}

export type PassportSortKey = "sn" | "lifecycle" | "shippedAt" | "rmaCount";
/** null 表示回到默认排序。 */
export type PassportSortState = { key: PassportSortKey; dir: "asc" | "desc" } | null;

/** 表头排序切换：未排序 → 升序 → 降序 → 回到默认排序。 */
export function togglePassportSort(current: PassportSortState, key: PassportSortKey): PassportSortState {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

// antd 表头 sorter 口径：升序时未出货在前；两次排序基于默认序，Comparable 0 由稳定排序继承默认序。
function compareShippedAtAsc(a: Device, b: Device): number {
  if (a.shippedAt && b.shippedAt) return a.shippedAt.localeCompare(b.shippedAt);
  if (a.shippedAt) return 1;
  if (b.shippedAt) return -1;
  return 0;
}

/** 表头升/降序比较器；用于对「默认排序后的行」再排序（与使用方口径一致）。 */
export function comparePassports(sort: Exclude<PassportSortState, null>): (a: Device, b: Device) => number {
  const factor = sort.dir === "asc" ? 1 : -1;
  return (a: Device, b: Device) => {
    if (sort.key === "sn") return factor * a.sn.localeCompare(b.sn);
    if (sort.key === "lifecycle") return factor * (lifecycleMeta[a.lifecycle].order - lifecycleMeta[b.lifecycle].order);
    if (sort.key === "shippedAt") return factor * compareShippedAtAsc(a, b);
    return factor * (a.rmaCount - b.rmaCount);
  };
}

export const FACTORY_RANGE_MAX_DAYS = 366;

/** 出厂日期跨度校验；返回 null 表示可选，字符串为警告文案（antd：dayjs diff > 366 则提示并清空）。 */
export function factoryDateRangeError(range: FactoryDateRange): string | null {
  if (!range) return null;
  const diff = Math.round((Date.parse(`${range[1]}T00:00:00`) - Date.parse(`${range[0]}T00:00:00`)) / 86400000);
  return diff > FACTORY_RANGE_MAX_DAYS ? `出厂日期跨度不能超过 ${FACTORY_RANGE_MAX_DAYS} 天，请重新选择` : null;
}

/**
 * 进入页面时的初始筛选。网址带 sn（工作台、列表等处跳来）时以网址为准；
 * 否则恢复上次的筛选记忆；都没有则全部默认。
 */
export function initialPassportFilters(options: { search: string; storage?: KeyValueStore }): PassportFilters {
  const params = new URLSearchParams(options.search);
  const urlSn = params.get("sn");
  if (urlSn) return { ...emptyPassportFilters, sn: urlSn.trim() };
  const saved = readStored<Partial<PassportFilters>>(options.storage, PASSPORT_STORAGE_KEYS.filters);
  return normalizePassportFilters(saved ? { ...emptyPassportFilters, ...saved } : emptyPassportFilters);
}

// —— 公开操作的可用性与置灰原因（行内与批量同口径）——
export function canSetPublishScope(device: Pick<Device, "lifecycle">): boolean {
  return device.lifecycle === "shipped";
}
export function canGenerateQrCode(device: Pick<Device, "lifecycle">): boolean {
  return device.lifecycle === "shipped";
}
export const PUBLISH_SCOPE_BLOCKED_REASON = "仅出货设备可设置公开范围";
export const QR_CODE_BLOCKED_REASON = "仅出货设备可生成二维码";
export const BATCH_PUBLISH_BLOCKED_REASON = "选中项中包含不支持此操作的记录（仅出货设备支持公开）";
export const BATCH_CLOSE_BLOCKED_REASON = "选中项中包含不支持此操作的记录（仅已公开设备支持关闭）";

/** 批量设置对外公开：选中非空且全部为出货设备。 */
export function canBatchPublish(selected: Device[]): boolean {
  return selected.length > 0 && selected.every((device) => device.lifecycle === "shipped");
}
/** 批量关闭公开：选中非空且全部当前已公开。 */
export function canBatchClosePublish(selected: Device[]): boolean {
  return selected.length > 0 && selected.every((device) => device.passportPublish.publicEnabled === true);
}

/**
 * 批量设置公开时的基准配置：取第一台触发设备当前的公开配置，强制 publicEnabled 开启；
 * 找不到该设备时按默认公开配置（antd 页面内联 fallback，与 data 层默认配置同形）。
 */
export function batchPublishBaseConfig(first: Device | undefined): PassportPublishConfig {
  return { ...(first?.passportPublish ?? defaultPassportPublishConfig(true)), publicEnabled: true };
}

// —— 公开范围表单校验与联动（列表页与详情页共用，antd 两页抽屉口径一致）——
export const PUBLISH_REMARK_MAX_LENGTH = 200;

/** 公开备注长度校验；返回 null 表示合规。 */
export function publishRemarkError(remark: string): string | null {
  return remark.length > PUBLISH_REMARK_MAX_LENGTH ? `公开备注不超过 ${PUBLISH_REMARK_MAX_LENGTH} 字` : null;
}
/** 「公开 RMA 售后历史」依赖「公开生命周期时间轴」；返回 null 表示合规。 */
export function publishRmaTimelineError(config: Pick<PassportPublishConfig, "showRma" | "showTimeline">): string | null {
  return config.showRma && !config.showTimeline ? "「公开 RMA 售后历史」需要同时开启「公开生命周期时间轴」" : null;
}
/** 切换「公开生命周期时间轴」：关闭时强制关闭「公开 RMA 售后历史」。 */
export function withTimelineToggled(config: PassportPublishConfig, showTimeline: boolean): PassportPublishConfig {
  return showTimeline ? { ...config, showTimeline: true } : { ...config, showTimeline: false, showRma: false };
}
