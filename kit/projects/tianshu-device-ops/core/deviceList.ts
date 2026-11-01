// 全部设备页控制器（第 4 阶段 4.3 试点）：筛选、视图、阶段计数、排序、选择与本地记忆的规则只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window；网址参数、本地存储、日期范围换算都由调用方传入。
// 口径以 antd 小豆盒现版 generated/DeviceListPage.tsx 为准（第 4 阶段 antd 页面暂不接入，见 docs/PLAN-四底座第4阶段-…）。

import { lifecycleMeta, onlineMeta } from "../data";
import type { Device, LifecycleState, OnlineState, Phase, QcResult } from "../data";
import { nextSortState } from "./sort";
import { readStored, type KeyValueStore } from "./storage";

// 本地记忆读写已移到 storage.ts（各页控制器共用），这里转出以保持原有导入不变。
export { readStored, writeStored } from "./storage";
export type { KeyValueStore } from "./storage";

/** 日期范围：[开始, 结束]，YYYY-MM-DD，闭区间。与 antd 现版本地记忆的写法一致。 */
export type DayRange = [string, string] | null;

export type DeviceFilters = {
  sn: string;
  models: string[];
  batches: string[];
  lifecycles: LifecycleState[];
  onlines: OnlineState[];
  firmware: string[];
  provinces: string[];
  activated: DayRange;
  factory: DayRange;
  qc: QcResult[];
  phone: string;
};
export type PhaseKey = "all" | Phase;
export type BaseView = "all" | "abnormal" | "after_sales" | "ready";
export type SavedView = { id: string; name: string; base: BaseView; filters: DeviceFilters; phase?: PhaseKey };
export type StoredViews = { views: SavedView[]; defaultView: string | null };
export type SortKey = "alerts" | "heartbeat";
export type SortState = { key: SortKey; dir: "asc" | "desc" };

export const emptyFilters: DeviceFilters = {
  sn: "",
  models: [],
  batches: [],
  lifecycles: [],
  onlines: [],
  firmware: [],
  provinces: [],
  activated: null,
  factory: null,
  qc: [],
  phone: ""
};

export const STORAGE_KEYS = { views: "device-ops:views", filter: "device-ops:last-filter", columns: "device-ops:list-columns" } as const;
/** 本账号（运维）第一次进来先看需要处理的设备。 */
export const ROLE_DEFAULT_VIEW: BaseView = "abnormal";
export const baseViewLabels: Record<BaseView, string> = { all: "全部设备", abnormal: "运行异常", after_sales: "售后中", ready: "待出货" };
export const DEFAULT_SORT: SortState = { key: "alerts", dir: "desc" };

/** 手机号是敏感条件，不写入记忆、不存进视图。 */
export const withoutPhone = (filters: DeviceFilters): DeviceFilters => ({ ...filters, phone: "" });

/** 「更多筛选」里已生效的条件数，用于按钮角标与是否默认展开。 */
export function activeMoreCount(filters: DeviceFilters) {
  return [
    filters.firmware.length > 0,
    filters.provinces.length > 0,
    filters.activated !== null,
    filters.factory !== null,
    filters.qc.length > 0,
    filters.phone.trim() !== ""
  ].filter(Boolean).length;
}

const inRange = (value: string | null, range: DayRange) => {
  if (!range) return true;
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= range[0] && day <= range[1];
};

export function matchesFilters(device: Device, filters: DeviceFilters, phase: PhaseKey) {
  if (filters.sn.trim() && !device.sn.toLowerCase().includes(filters.sn.trim().toLowerCase())) return false;
  if (filters.models.length && !filters.models.includes(device.model)) return false;
  if (filters.batches.length && !filters.batches.includes(device.batch)) return false;
  if (filters.lifecycles.length && !filters.lifecycles.includes(device.lifecycle)) return false;
  if (filters.onlines.length && (!device.online || !filters.onlines.includes(device.online))) return false;
  if (filters.firmware.length && (!device.firmware || !filters.firmware.includes(device.firmware))) return false;
  if (filters.provinces.length && (!device.province || !filters.provinces.includes(device.province))) return false;
  if (!inRange(device.activatedAt, filters.activated)) return false;
  if (!inRange(device.shippedAt, filters.factory)) return false;
  if (filters.qc.length && !filters.qc.includes(device.qc)) return false;
  if (filters.phone.trim() && !device.bindPhones.some((phone) => phone.includes(filters.phone.trim()))) return false;
  if (phase !== "all" && lifecycleMeta[device.lifecycle].phase !== phase) return false;
  return true;
}

/** 内置视图的范围：运行异常 = 离线或有未处理告警；售后中 = RMA；待出货 = 在库。 */
export function viewMatches(device: Device, base: BaseView, unresolved: Map<string, number>) {
  if (base === "abnormal") return device.online === "offline" || (unresolved.get(device.sn) ?? 0) > 0;
  if (base === "after_sales") return device.lifecycle === "rma";
  if (base === "ready") return device.lifecycle === "in_stock";
  return true;
}

export type DeviceListInit = { filters: DeviceFilters; phase: PhaseKey; viewKey: string; views: SavedView[]; defaultView: string | null };

/** 接入控制器前 shadcn 把日期范围存成 {from, to}，同一存储键；读到旧格式时转成 [开始, 结束]，无法识别的按未设置处理。 */
function toDayRange(value: unknown): DayRange {
  if (Array.isArray(value)) return value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string" ? [value[0], value[1]] : null;
  if (value && typeof value === "object") {
    const { from, to } = value as { from?: unknown; to?: unknown };
    if (typeof from === "string" && typeof to === "string") return [from.slice(0, 10), to.slice(0, 10)];
  }
  return null;
}
const restoreFilters = (stored: Partial<DeviceFilters> | undefined): DeviceFilters => ({
  ...emptyFilters,
  ...stored,
  activated: toDayRange(stored?.activated),
  factory: toDayRange(stored?.factory),
  phone: ""
});

/**
 * 进入页面时的初始状态。网址带 sn / batch / online / activated 时（从工作台、告警等处跳来）以网址为准并回到「全部设备」；
 * 否则恢复上次的筛选记忆和默认视图。rangeDates 把 today / week / month 换算成日期范围（与工作台卡片计数同源，由 store 提供）。
 */
export function initialDeviceListState(options: {
  search: string;
  storage?: KeyValueStore;
  rangeDates: (range: "today" | "week" | "month") => [string, string];
}): DeviceListInit {
  const params = new URLSearchParams(options.search);
  const urlSn = params.get("sn");
  const urlBatch = params.get("batch");
  const urlOnline = params.get("online");
  const urlActivated = params.get("activated");
  const activatedRange = urlActivated === "today" || urlActivated === "week" || urlActivated === "month" ? options.rangeDates(urlActivated) : null;
  const stored = readStored<StoredViews>(options.storage, STORAGE_KEYS.views);
  const views = (stored?.views ?? []).map((view) => ({ ...view, filters: restoreFilters(view.filters) }));
  if (urlSn || urlBatch || urlOnline || activatedRange) {
    return {
      filters: {
        ...emptyFilters,
        sn: urlSn ?? "",
        batches: urlBatch ? [urlBatch] : [],
        onlines: urlOnline && urlOnline in onlineMeta ? [urlOnline as OnlineState] : [],
        activated: activatedRange
      },
      phase: "all",
      viewKey: "all",
      views,
      defaultView: stored?.defaultView ?? null
    };
  }
  const memory = readStored<{ filters: DeviceFilters; phase: PhaseKey }>(options.storage, STORAGE_KEYS.filter);
  const defaultView = stored?.defaultView ?? null;
  const viewKey =
    defaultView && (defaultView in baseViewLabels || views.some((view) => `my:${view.id}` === defaultView)) ? defaultView : ROLE_DEFAULT_VIEW;
  return {
    filters: memory ? restoreFilters(memory.filters) : emptyFilters,
    phase: memory?.phase ?? "all",
    viewKey,
    views,
    defaultView
  };
}

/**
 * 排序：主排序按所选列，同值时回到默认口径（未处理告警降序、最近心跳在前）。
 * sort 为 null（点表头清除后）= 默认口径本身：antd 的数据源本来就按「告警降序、心跳降序」排好，清除排序后看到的就是这个顺序。
 */
export function compareDevices(sort: SortState | null, unresolved: Map<string, number>) {
  const alerts = (d: Device) => unresolved.get(d.sn) ?? 0;
  const heartbeat = (d: Device) => d.lastHeartbeat ?? "";
  const fallback = (a: Device, b: Device) => alerts(b) - alerts(a) || heartbeat(b).localeCompare(heartbeat(a));
  if (!sort) return fallback;
  const primary = sort.key === "alerts" ? (a: Device, b: Device) => alerts(a) - alerts(b) : (a: Device, b: Device) => heartbeat(a).localeCompare(heartbeat(b));
  const factor = sort.dir === "desc" ? -1 : 1;
  return (a: Device, b: Device) => factor * primary(a, b) || fallback(a, b);
}

/** 点表头切换排序（antd Table 三态）：新列先升序；当前列升序 → 降序 → 清除（null）。默认状态是告警列降序，第一次点它就清除。 */
export const toggleSort = (current: SortState | null, key: SortKey): SortState | null => nextSortState(current, key);

/** 由状态推导出页面要显示的一切：当前视图、阶段计数、实际生效的阶段、排序后的行。 */
export function deriveDeviceList(input: {
  devices: Device[];
  unresolved: Map<string, number>;
  applied: DeviceFilters;
  phase: PhaseKey;
  viewKey: string;
  views: SavedView[];
  /** 不传 = 初始排序（DEFAULT_SORT）；null = 用户点表头清除了排序，行顺序回到默认口径。 */
  sort?: SortState | null;
}) {
  const activeSaved = input.viewKey.startsWith("my:") ? input.views.find((view) => `my:${view.id}` === input.viewKey) : undefined;
  const base: BaseView = activeSaved ? activeSaved.base : (input.viewKey as BaseView);
  // 阶段条按「当前视图 + 已生效筛选」统计，和下方表格的范围一致；阶段本身不参与计数。
  const scoped = input.devices.filter((device) => viewMatches(device, base, input.unresolved) && matchesFilters(device, input.applied, "all"));
  const phaseCounts: Record<PhaseKey, number> = { all: scoped.length, production: 0, running: 0, after_sales: 0 };
  for (const device of scoped) phaseCounts[lifecycleMeta[device.lifecycle].phase] += 1;
  // 已选阶段在当前范围内没有设备时回到「全部」，避免停在一个永远为空的阶段上。
  const activePhase: PhaseKey = input.phase !== "all" && phaseCounts[input.phase] === 0 ? "all" : input.phase;
  const rows = scoped
    .filter((device) => activePhase === "all" || lifecycleMeta[device.lifecycle].phase === activePhase)
    .sort(compareDevices(input.sort === undefined ? DEFAULT_SORT : input.sort, input.unresolved));
  return {
    activeSaved,
    base,
    currentViewLabel: activeSaved ? activeSaved.name : baseViewLabels[base],
    scoped,
    phaseCounts,
    activePhase,
    rows,
    moreCount: activeMoreCount(input.applied)
  };
}

/** 保存视图的名称校验；返回 null 表示可以保存。 */
export function viewNameError(name: string, views: SavedView[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "请填写视图名称";
  if (views.some((view) => view.name === trimmed)) return "已有同名视图，请换一个名称";
  return null;
}

/** 新建视图：编号取现有最大编号 + 1；手机号不存进视图。 */
export function createSavedView(views: SavedView[], input: { name: string; base: BaseView; filters: DeviceFilters; phase: PhaseKey }): SavedView {
  const id = String(views.reduce((max, view) => Math.max(max, Number(view.id)), 0) + 1);
  return { id, name: input.name.trim(), base: input.base, filters: withoutPhone(input.filters), phase: input.phase };
}

/** 删除视图：若删的是默认视图，默认视图回到角色默认（null）。 */
export function removeSavedView(stored: StoredViews, id: string): StoredViews {
  return { views: stored.views.filter((view) => view.id !== id), defaultView: stored.defaultView === `my:${id}` ? null : stored.defaultView };
}

/** 某个视图是否为当前默认视图（没设过默认时，角色默认视图就是默认）。 */
export const isDefaultView = (defaultView: string | null, key: string) => defaultView === key || (defaultView === null && key === ROLE_DEFAULT_VIEW);

/** 本页全选框的三态：全选 / 部分选中 / 未选。 */
export function pageSelectionState(pageKeys: string[], selected: string[]): boolean | "indeterminate" {
  const all = pageKeys.length > 0 && pageKeys.every((key) => selected.includes(key));
  if (all) return true;
  return pageKeys.some((key) => selected.includes(key)) ? "indeterminate" : false;
}
