// 用户与绑定页控制器（第 4 阶段 4.4 批次 F）：三字段互斥检索、网址带入查询、查用户/查设备的两种结果模式、
// 长期未活跃判定、敏感字段查看门槛、新建客户反馈跳转参数、绑定时间排序与结果分页的规则只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window；网址串、用户/绑定/设备数据、锚点日期都由调用方传入。
// 口径以 antd 小豆盒现版 generated/BindingPage.tsx 为准（第 4 阶段 antd 页面暂不接入，见 docs/PLAN-四底座第4阶段-…）。
// 审计日志写入在 store 的 revealSensitiveField 里（含查看原因必填、不超过 100 字的最终拦截）。

import { maskPhone } from "../data";
import type { AppUser, Binding, Device } from "../data";
import { nextSortDirection } from "./sort";

export type QueryTarget = { type: "phone"; value: string } | { type: "userId"; value: string } | { type: "sn"; value: string };

export type SearchResult =
  | { status: "idle" }
  | { status: "not_found" }
  | { status: "sn_zero_bound"; sn: string }
  | { status: "mode_a"; user: AppUser; boundDevices: { binding: Binding; device?: Device }[] }
  | { status: "mode_b"; sn: string; bindings: { binding: Binding; user?: AppUser }[] };

// —— 三字段互斥检索 ——

export type SearchFieldInputs = { phone: string; userId: string; sn: string };

/** 三个输入框互斥：任一字段有值时另两个置灰；三个都空时不给查询。 */
export function searchFieldStates({ phone, userId, sn }: SearchFieldInputs) {
  const hasPhone = phone.trim().length > 0;
  const hasUserId = userId.trim().length > 0;
  const hasSn = sn.trim().length > 0;
  return {
    hasPhone,
    hasUserId,
    hasSn,
    phoneDisabled: hasUserId || hasSn,
    userIdDisabled: hasPhone || hasSn,
    snDisabled: hasPhone || hasUserId,
    searchDisabled: !hasPhone && !hasUserId && !hasSn
  };
}

/** 手机号必须 11 位完整数字，不支持模糊 / 前缀查询。 */
export const PHONE_QUERY_WARNING = "请输入完整 11 位手机号（不支持模糊/前缀查询）";
export function phoneQueryError(phone: string): string | null {
  const trimmed = phone.trim();
  return trimmed.length !== 11 || !/^\d{11}$/.test(trimmed) ? PHONE_QUERY_WARNING : null;
}

/** 点「查询」时按手机号 → 用户 ID → SN 的优先级取有值的那个发起；手机号先过完整校验。 */
export function searchTargetFromInputs(inputs: SearchFieldInputs): { kind: "none" } | { kind: "invalid"; warning: string } | { kind: "query"; target: QueryTarget } {
  const fields = searchFieldStates(inputs);
  if (fields.searchDisabled) return { kind: "none" };
  if (fields.hasPhone) {
    const error = phoneQueryError(inputs.phone);
    if (error) return { kind: "invalid", warning: error };
    return { kind: "query", target: { type: "phone", value: inputs.phone.trim() } };
  }
  if (fields.hasUserId) return { kind: "query", target: { type: "userId", value: inputs.userId.trim() } };
  return { kind: "query", target: { type: "sn", value: inputs.sn.trim() } };
}

/** ?sn= / ?user_id=（?userId=）/ ?phone= 从别处跳来时按此优先级带入对应字段并触发查询；都没有就不查。 */
export function bindingQueryFromUrl(search: string): QueryTarget | null {
  const params = new URLSearchParams(search);
  const urlSn = params.get("sn");
  const urlUserId = params.get("user_id") || params.get("userId");
  const urlPhone = params.get("phone");
  if (urlSn) return { type: "sn", value: urlSn.trim() };
  if (urlUserId) return { type: "userId", value: urlUserId.trim() };
  if (urlPhone) return { type: "phone", value: urlPhone.trim() };
  return null;
}

/** 查手机号 / 用户 ID → 模式 A（用户 + 绑定设备）；查 SN → 模式 B（设备 + 绑定人）；查不到归 not_found / sn_zero_bound。 */
export function executeBindingLookup(target: QueryTarget, source: { appUsers: AppUser[]; bindings: Binding[]; devices: Device[] }): SearchResult {
  const { appUsers, bindings, devices } = source;
  if (target.type === "phone") {
    const user = appUsers.find((u) => u.phone === target.value);
    if (!user) return { status: "not_found" };
    const userBindings = bindings.filter((b) => b.userId === user.userId);
    const boundDevices = userBindings.map((b) => ({ binding: b, device: devices.find((d) => d.sn === b.sn) }));
    return { status: "mode_a", user, boundDevices };
  }
  if (target.type === "userId") {
    const user = appUsers.find((u) => u.userId.toLowerCase() === target.value.toLowerCase());
    if (!user) return { status: "not_found" };
    const userBindings = bindings.filter((b) => b.userId === user.userId);
    const boundDevices = userBindings.map((b) => ({ binding: b, device: devices.find((d) => d.sn === b.sn) }));
    return { status: "mode_a", user, boundDevices };
  }
  const dev = devices.find((d) => d.sn.toLowerCase() === target.value.toLowerCase());
  const snBindings = bindings.filter((b) => b.sn.toLowerCase() === target.value.toLowerCase());
  if (snBindings.length === 0) {
    if (dev) return { status: "sn_zero_bound", sn: dev.sn };
    return { status: "not_found" };
  }
  const list = snBindings.map((b) => ({ binding: b, user: appUsers.find((u) => u.userId === b.userId) }));
  return { status: "mode_b", sn: dev?.sn || target.value, bindings: list };
}

// —— 长期未活跃 ——

/** 与 antd 版同一锚点日期口径（演示数据的「今天」）；真实运行时由调用方换成当天。 */
export const BINDING_ANCHOR_DAY = "2026-09-28";
/** 距锚点日期超过 30 天标记「长期未活跃」。 */
export function isLongInactive(lastActiveAt: string, todayDay: string): boolean {
  if (!lastActiveAt) return false;
  const baseDate = new Date(`${todayDay}T00:00:00Z`).getTime();
  const targetDate = new Date(`${lastActiveAt.slice(0, 10)}T00:00:00Z`).getTime();
  const diffDays = (baseDate - targetDate) / (1000 * 60 * 60 * 24);
  return diffDays > 30;
}

// —— 敏感字段查看 ——

/** 查看原因必填（去空白后非空）才允许确认；长度不超过 100 字由输入框 maxLength 与 store 双保险。 */
export function canRevealSensitive(reason: string): boolean {
  return reason.trim().length > 0;
}

// —— 新建客户反馈跳转 ——

/** 模式 A 里「为该用户新建客户反馈工单」的跳转参数：带首台绑定设备 SN（若有），手机号始终脱敏。 */
export function feedbackCreateSearch(input: { user: AppUser; firstSn: string | undefined; fromUrl: string }): string {
  const query = new URLSearchParams({
    create: "1",
    userId: input.user.userId,
    phone: maskPhone(input.user.phone),
    appVersion: input.user.appVersion,
    from: input.fromUrl
  });
  if (input.firstSn) query.set("sn", input.firstSn);
  return query.toString();
}

// —— 绑定时间排序与结果分页 ——

export type SortDir = "asc" | "desc";

/** 点表头切换排序（antd Table 三态）：无排序 → 升序 → 降序 → 清除（null，回到原始绑定顺序）。两张结果表都没有默认排序，初始为 null。 */
export const toggleSortDir = (current: SortDir | null): SortDir | null => nextSortDirection(current);

/** 按绑定时间字符串排序；无排序（null）时保持传入的原始顺序。 */
export function sortByBoundAt<T extends { binding: Binding }>(rows: T[], dir: SortDir | null): T[] {
  if (!dir) return rows;
  const factor = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => factor * a.binding.boundAt.localeCompare(b.binding.boundAt));
}

/** 两张结果表固定每页 10 条，超过才分页（antd 口径：pageSize 10、length > 10 时才显示分页器）。 */
export const BIND_TABLE_PAGE_SIZE = 10;
export const showBindingPagination = (count: number): boolean => count > BIND_TABLE_PAGE_SIZE;
