// 设备数字护照详情页控制器（第 4 阶段 4.4 批次 E）：时间轴事件分组与过滤、节点颜色、证书指纹脱敏、
// 对外公开预览的事件挑选、返回链接文案、发起 RMA 的可用性判断与表单校验，只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window。
// 口径以 antd 小豆盒现版 generated/PassportDetailPage.tsx 为准（antd 页面暂不接入，见 docs/PLAN-四底座第4阶段-…）。
// 「设置公开范围 / 生成二维码」的可用性判定与公开范围表单校验在 passportList.ts（两页共用一份，这里不重复）。

import type { Device, PassportEvent, PassportEventKind, RmaSource } from "../data";

// —— 时间轴事件类型过滤（PRD 七组：激活归入出货组，RMA 组含返修与二次入库）——
export type PassportEventGroup = "received" | "flash" | "testing" | "qc" | "shipped" | "rma" | "scrapped";

export const EVENT_GROUP_OPTIONS: { label: string; value: PassportEventGroup }[] = [
  { label: "收货", value: "received" },
  { label: "烧录", value: "flash" },
  { label: "测试", value: "testing" },
  { label: "质检", value: "qc" },
  { label: "出货", value: "shipped" },
  { label: "RMA", value: "rma" },
  { label: "报废", value: "scrapped" }
];

export const ALL_EVENT_GROUPS: PassportEventGroup[] = EVENT_GROUP_OPTIONS.map((option) => option.value);

/** 事件归属组；不在七组内的归为 "other"（任何选择下都不显示，保持 antd 现版口径）。 */
export function eventGroupOf(kind: PassportEventKind): PassportEventGroup | "other" {
  if (kind === "received") return "received";
  if (kind === "flash" || kind === "flash_failed") return "flash";
  if (kind === "testing") return "testing";
  if (kind === "qc") return "qc";
  if (kind === "inbound" || kind === "shipped" || kind === "activation") return "shipped";
  if (kind === "rma" || kind === "repaired" || kind === "restocked") return "rma";
  if (kind === "scrapped") return "scrapped";
  return "other";
}

/** 按所选事件组过滤时间轴（antd：组名命中即显示）。 */
export function filterPassportEvents(events: PassportEvent[], selectedGroups: string[]): PassportEvent[] {
  return events.filter((event) => selectedGroups.includes(eventGroupOf(event.kind)));
}

// —— 节点颜色（激活节点沿用 geekblue，PRD 与审定裁决一致）——
export type PassportNodeColor = "blue" | "red" | "green" | "geekblue" | "orange" | "gray";

export function passportNodeColor(kind: PassportEventKind): PassportNodeColor {
  switch (kind) {
    case "received":
    case "flash":
    case "testing":
    case "repaired":
      return "blue";
    case "flash_failed":
      return "red";
    case "qc":
    case "inbound":
    case "restocked":
      return "green";
    case "shipped":
    case "activation":
      return "geekblue";
    case "rma":
      return "orange";
    case "scrapped":
      return "gray";
    default:
      return "blue";
  }
}

/** 证书公钥指纹安全脱敏：未签发显示「—」，已签发 / 签发失败仅展示 SN 首尾片段。 */
export function certFingerprintOf(device: Pick<Device, "cert" | "sn">): string {
  return device.cert === "cert_pending"
    ? "—"
    : `SHA256:${device.sn.slice(2, 6).toUpperCase()}…${device.sn.slice(-4).toUpperCase()}`;
}

/** 对外公开预览「生产流转简述」的事件范围：剔除烧录失败、返修与 RMA 节点（消费者视角）。 */
export function publicTimelineEvents(events: PassportEvent[]): PassportEvent[] {
  return events.filter((event) => !["flash_failed", "repaired", "rma"].includes(event.kind));
}

/** 顶部返回链接文案：来自设备详情 / 全部设备时返回对应页，默认回护照列表。 */
export function passportBackLabel(returnTo: string | null): string {
  if (!returnTo) return "数字护照";
  if (returnTo.includes("/devices/")) return "设备详情";
  if (returnTo.includes("/devices")) return "全部设备";
  return "数字护照";
}

// —— 发起 RMA：仅已出货设备可发起（antd 头部按钮口径）——
export function canStartRma(device: Pick<Device, "lifecycle">): boolean {
  return device.lifecycle === "shipped";
}
export const START_RMA_BLOCKED_REASON = "仅已出货设备可发起退货 RMA";

/** 发起 RMA 对话框的初始退货来源（antd：ecommerce）。 */
export const RMA_DIALOG_DEFAULT_SOURCE: RmaSource = "ecommerce";

export type RmaFormErrors = { reason: string | null; source: string | null };

/** 发起 RMA 表单校验：退货原因与退货来源必填；问题描述选填（antd 无长度校验规则）。 */
export function rmaFormErrors(form: { reason: string; source: string }): RmaFormErrors {
  return { reason: form.reason ? null : "请选择退货原因", source: form.source ? null : "请选择退货来源" };
}
