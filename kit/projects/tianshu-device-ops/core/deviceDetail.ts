// 设备详情页控制器（第 4 阶段 4.4 批次 C）：「返回」来源标签、设备相关告警/工单聚合、发起 RMA 的入口条件与必填校验。
// 框架无关：不依赖 React / antd / 任何组件库，也不直接碰 window / localStorage。
// 口径以 antd 小豆盒现版 generated/DeviceDetailPage.tsx 为准。核心信息四组（身份与生产/运行/用户与服务/异常）与「更多信息」折叠分组
// 是展示结构（字段标签、布局、链接包层），留在页面与 data/foldedFieldGroups，不进控制器。

import type { AlertLevel, AlertRecord, Device, FeedbackTicket } from "../data";
import { openTicketCountBySn, unresolvedAlertCountBySn } from "../store";

/** 「返回」文字跟随来源页；来源经 safeReturnTo 白名单（在 ui 层），未列出的回落为全部设备。 */
export const DEVICE_DETAIL_BACK_LABELS: Array<[string, string]> = [
  ["/alerts", "告警处置"],
  ["/exceptions/feedback", "客户反馈"],
  ["/exceptions/rma", "退货 RMA"],
  ["/system/firmware", "固件与推送"],
  ["/users/binding", "用户与绑定"],
  ["/lifecycle/passport", "数字护照"],
  ["/lifecycle/flashing", "烧录发证"],
  ["/system/alert-rules", "告警规则"],
  ["/dashboard", "工作台"]
];

export function backLabelFor(returnTo: string) {
  const path = returnTo.split("?")[0];
  return DEVICE_DETAIL_BACK_LABELS.find(([route]) => path.endsWith(route) || path.includes(`${route}/`))?.[1] ?? "全部设备";
}

/** 「发起 RMA」入口条件：仅出货设备（antd 行内 canRma 口径）。 */
export const canStartRma = (device: Pick<Device, "lifecycle">) => device.lifecycle === "shipped";

export type DeviceAlertScope = {
  /** 与本设备相关的全部告警。 */
  related: AlertRecord[];
  /** 未处理告警（open / processing），驱动主操作「去告警处置」与警示横幅。 */
  activeAlerts: AlertRecord[];
  /** 最近一条告警（按 lastSeenAt 降序），没有为 undefined。 */
  latestAlert: AlertRecord | undefined;
  /** 未处理告警里最高的级别（按枚举顺序取第一个），没有为 undefined。 */
  topLevel: AlertLevel | undefined;
  unresolvedCount: number;
  openTicketCount: number;
};

/** 设备详情依赖的告警与工单聚合口径（与 RMA 列表「当前设备状态」、工作台计数同源）。 */
export function deviceDetailScope(input: { sn: string; alerts: AlertRecord[]; feedbackTickets: FeedbackTicket[] }): DeviceAlertScope {
  const related = input.alerts.filter((alert) => alert.sns.includes(input.sn));
  const activeAlerts = related.filter((alert) => alert.status === "open" || alert.status === "processing");
  const latestAlert = [...related].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0];
  const topLevel = activeAlerts.map((alert) => alert.level).sort()[0];
  return {
    related,
    activeAlerts,
    latestAlert,
    topLevel,
    unresolvedCount: unresolvedAlertCountBySn(input.alerts).get(input.sn) ?? 0,
    openTicketCount: openTicketCountBySn(input.feedbackTickets).get(input.sn) ?? 0
  };
}

export type StartRmaErrors = { reason?: string; source?: string };

/** 详情页「发起 RMA」弹窗必填校验（antd Form rules 口径）；原因选「其他」时描述必填由 store.createRma 兜底，页面不强拦。 */
export function startRmaErrors(values: { reason: string; source: string }): StartRmaErrors {
  const errors: StartRmaErrors = {};
  if (!values.reason) errors.reason = "请选择退货原因";
  if (!values.source) errors.source = "请选择退货来源";
  return errors;
}
