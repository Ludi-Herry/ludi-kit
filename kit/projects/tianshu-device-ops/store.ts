import { useSyncExternalStore } from "react";
import {
  NOW_LABEL,
  addHoursLabel,
  canCloseRmaRecord,
  defaultDashboardPreferences,
  flashingFailureCategories,
  flashingStations,
  isFeedbackOpen,
  isRmaPending,
  passportEventKindLabel,
  pushTargetDevices,
  resolutionConclusions,
  rmaArrivalMeta,
  rmaConclusionMeta,
  rmaDecisionMeta,
  rmaReasonMeta,
  rmaSourceMeta,
  seedAlerts,
  seedAlertRules,
  seedAppUsers,
  seedBindings,
  seedDevices,
  seedFeedbackTickets,
  seedFirmwareVersions,
  seedFlashingRecords,
  seedFlashingTasks,
  seedPassportEvents,
  seedPushResults,
  seedPushTasks,
  seedRmaRecords,
  slaStateOf,
  slaTargetHourByPriority,
  type AlertEvent,
  type AlertRecord,
  type AlertRule,
  type AlertRuleType,
  type AppUser,
  type Binding,
  type DashboardCardId,
  type DashboardTimeRange,
  type Device,
  type FeedbackPriority,
  type FeedbackReply,
  type FeedbackStatus,
  type FeedbackTicket,
  type FeedbackType,
  type FirmwareEvent,
  type FirmwareVersion,
  type FlashingFailureCategory,
  type FlashingRecord,
  type FlashingTask,
  type FlashingTaskScope,
  type PassportEvent,
  type PassportPublishConfig,
  type PushDeviceResult,
  type PushEvent,
  type PushTask,
  type ResolutionConclusion,
  type RmaAppearanceScore,
  type RmaAttachment,
  type RmaConclusion,
  type RmaDecisionMethod,
  type RmaReasonCode,
  type RmaRecord,
  type RmaSource,
  type SensitiveViewAudit
} from "./data";

type DashboardState = {
  orderedCardIds: DashboardCardId[];
  timeRange: DashboardTimeRange;
  lastRefreshedAt: string | null;
  lastRemoved: { id: DashboardCardId; index: number } | null;
};
type State = {
  devices: Device[];
  alerts: AlertRecord[];
  rmas: RmaRecord[];
  firmwareVersions: FirmwareVersion[];
  pushTasks: PushTask[];
  pushResults: PushDeviceResult[];
  passportEvents: PassportEvent[];
  dashboard: DashboardState;
  // 2026-09-29 批 2 新实体：烧录发证 / 客户反馈 / 告警规则 / App 用户与绑定 / 敏感查看审计。
  flashingTasks: FlashingTask[];
  flashingRecords: FlashingRecord[];
  feedbackTickets: FeedbackTicket[];
  alertRules: AlertRule[];
  appUsers: AppUser[];
  bindings: Binding[];
  sensitiveAudits: SensitiveViewAudit[];
  rmaCounter: number;
  pushTaskCounter: number;
};
export type ActionResult = { ok: true; message?: string } | { ok: false; reason: string };
export type TicketForm = { assignee: string; type?: FeedbackType; priority?: FeedbackPriority; content?: string };
export type ResolveForm = { conclusion: ResolutionConclusion; note: string };
export type RmaCreateForm = {
  sn: string;
  reasonCode: RmaReasonCode;
  source: RmaSource;
  description?: string;
  expectedArrivalDate?: string;
  attachments?: RmaAttachment[];
  // 2026-09-29 批 2：客户反馈「转退货 RMA」传入，创建成功后回写工单 rmaId。
  sourceFeedbackId?: string;
};
export type RmaInspectForm = {
  conclusion: RmaConclusion;
  appearanceScore: RmaAppearanceScore;
  functionChecks: string[];
  inspectNote?: string;
  inspectAttachments?: RmaAttachment[];
};
export type RmaDecideForm = { method: RmaDecisionMethod; decisionNote?: string; expectedRepairDate?: string };
export type FirmwareVersionForm = {
  version: string;
  models: string[];
  note?: string;
  changelog: string;
  issueId?: string;
  package?: { fileName: string; sizeBytes: number; md5: string };
  signMethod: "kms" | "manual";
  // 手动签名时的签名文件元数据（文件名、大小），不落文件内容。
  signFile?: { fileName: string; sizeBytes: number } | null;
};
export type PushTaskCreateForm = {
  name: string;
  versionId: string;
  model: string;
  targeting: { batches?: string[]; provinces?: string[]; fromVersions?: string[]; snFileName?: string | null; snList?: string[] };
  ratio: number;
  windowStart?: string;
  windowEnd?: string;
  circuitThreshold: number;
};

// 当前账号：所有处置动作都以此署名写入处置记录。
const ACTOR = "运维 · 周启明";

// 新生成编号的「现在」：NOW_LABEL 精确到分，时间戳补秒位 00（FB 工单号为 14 位时间戳）。
const NOW_STAMP = `${NOW_LABEL.replace(/[-: ]/g, "")}00`;

// 只在内存里保存：刷新页面后回到初始数据。
let state: State = {
  devices: seedDevices.map((device) => ({ ...device, bindPhones: [...device.bindPhones], passportPublish: { ...device.passportPublish } })),
  alerts: seedAlerts.map((alert) => ({
    ...alert,
    sns: [...alert.sns],
    impact: [...alert.impact],
    nextSteps: alert.nextSteps.map((step) => ({ ...step })),
    resolution: alert.resolution ? { ...alert.resolution } : null,
    events: alert.events.map((event) => ({ ...event }))
  })),
  rmas: seedRmaRecords.map((record) => ({
    ...record,
    attachments: record.attachments.map((item) => ({ ...item })),
    inspectAttachments: record.inspectAttachments.map((item) => ({ ...item })),
    functionChecks: [...record.functionChecks]
  })),
  firmwareVersions: seedFirmwareVersions.map((version) => ({
    ...version,
    models: [...version.models],
    package: version.package ? { ...version.package } : null,
    signFile: version.signFile ? { ...version.signFile } : null,
    events: version.events.map((event) => ({ ...event }))
  })),
  pushTasks: seedPushTasks.map((task) => ({
    ...task,
    targeting: { ...task.targeting, batches: [...task.targeting.batches], provinces: [...task.targeting.provinces], fromVersions: [...task.targeting.fromVersions], snList: [...task.targeting.snList] },
    summary: { ...task.summary },
    events: task.events.map((event) => ({ ...event }))
  })),
  pushResults: seedPushResults.map((item) => ({ ...item })),
  passportEvents: seedPassportEvents.map((event) => ({ ...event, detail: event.detail ? { ...event.detail } : undefined })),
  dashboard: { ...defaultDashboardPreferences, lastRefreshedAt: null, lastRemoved: null },
  flashingTasks: seedFlashingTasks.map((task) => ({ ...task, stations: [...task.stations] })),
  flashingRecords: seedFlashingRecords.map((record) => ({
    ...record,
    failure: record.failure ? { ...record.failure } : null,
    logSteps: record.logSteps.map((step) => ({ ...step }))
  })),
  feedbackTickets: seedFeedbackTickets.map((ticket) => ({
    ...ticket,
    attachments: ticket.attachments.map((item) => ({ ...item })),
    replies: ticket.replies.map((reply) => ({ ...reply })),
    flow: ticket.flow.map((entry) => ({ ...entry }))
  })),
  alertRules: seedAlertRules.map((rule) => ({ ...rule, pushTaskIds: [...rule.pushTaskIds], notifyUsers: [...rule.notifyUsers] })),
  appUsers: seedAppUsers.map((user) => ({ ...user })),
  bindings: seedBindings.map((binding) => ({ ...binding })),
  sensitiveAudits: [],
  rmaCounter: seedRmaRecords.length,
  // 2026-09-29 集成修正：计数从种子任务同前缀的最大序号起算，首次新建不再与种子撞号。
  pushTaskCounter: seedPushTasks.reduce((max, task) => {
    const match = /^PT-20260928-(\d+)$/.exec(task.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0)
};
const listeners = new Set<() => void>();

function commit(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

function patchAlert(id: string, patch: Partial<AlertRecord>, event?: AlertEvent) {
  commit({
    ...state,
    alerts: state.alerts.map((alert) =>
      alert.id === id ? { ...alert, ...patch, events: event ? [...alert.events, event] : alert.events } : alert
    )
  });
}

function patchDevice(sn: string, patch: Partial<Device>) {
  commit({
    ...state,
    devices: state.devices.map((device) => (device.sn === sn ? { ...device, ...patch } : device))
  });
}

function patchRma(id: string, patch: Partial<RmaRecord>) {
  commit({
    ...state,
    rmas: state.rmas.map((record) => (record.id === id ? { ...record, ...patch } : record))
  });
}

function appendPassportEvents(events: PassportEvent[]) {
  if (events.length === 0) return;
  commit({ ...state, passportEvents: [...state.passportEvents, ...events].sort((a, b) => b.at.localeCompare(a.at)) });
}

let passportEventCounter = 0;
function makePassportEvent(sn: string, kind: PassportEvent["kind"], colorState: PassportEvent["colorState"], operator: string, summary: string, detail?: Record<string, string>): PassportEvent {
  passportEventCounter += 1;
  return {
    id: `PE-${sn}-run-${String(passportEventCounter).padStart(2, "0")}`,
    sn,
    kind,
    colorState,
    label: passportEventKindLabel[kind],
    at: `${NOW_LABEL}:00`,
    operator,
    summary,
    detail
  };
}

// 只读视角（?perm=readonly）下动作统一返回无权限原因，与界面置灰口径一致（2026-09-29 批 1 起所有动作强制）。
function readonlyReason(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("perm") === "readonly" ? "当前账号为只读视角，无此操作权限" : null;
}

const isTerminal = (alert: AlertRecord) => alert.status === "resolved" || alert.status === "muted";

function patchVersion(id: string, patch: Partial<FirmwareVersion>, event?: FirmwareEvent) {
  commit({
    ...state,
    firmwareVersions: state.firmwareVersions.map((version) =>
      version.id === id ? { ...version, ...patch, events: event ? [...version.events, event] : version.events } : version
    )
  });
}

function patchTask(id: string, patch: Partial<PushTask>, event?: PushEvent) {
  commit({
    ...state,
    pushTasks: state.pushTasks.map((task) =>
      task.id === id ? { ...task, ...patch, events: event ? [...task.events, event] : task.events } : task
    )
  });
}

const versionById = (id: string) => state.firmwareVersions.find((version) => version.id === id);

export const deviceOpsStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getState: () => state,

  // 2026-09-29 批 2：转工单同时写入 FeedbackTicket 实体（页 9 同源）；
  // 工单号统一 PRD 口径「FB + 14 位时间戳 + 3 位序号」，时间戳取 NOW_LABEL，序号按同时间戳下既有工单递增。
  createTicket(alertId: string, form: TicketForm): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const alert = state.alerts.find((item) => item.id === alertId);
    if (!alert) return { ok: false, reason: "告警不存在" };
    if (isTerminal(alert) || alert.status === "ticketed") return { ok: false, reason: `告警 ${alertId} 已${alert.status === "ticketed" ? "转工单" : "结束"}，无法重复转工单` };
    const seq = state.feedbackTickets.filter((ticket) => ticket.id.startsWith(`FB${NOW_STAMP}`)).length + 1;
    const ticketId = `FB${NOW_STAMP}${String(seq).padStart(3, "0")}`;
    const single = alert.sns.length === 1 ? alert.sns[0] : null;
    const device = single ? state.devices.find((item) => item.sn === single) : undefined;
    const owner = single ? state.bindings.find((binding) => binding.sn === single && binding.role === "owner") : undefined;
    const ownerUser = owner ? state.appUsers.find((user) => user.userId === owner.userId) : undefined;
    const ticket: FeedbackTicket = {
      id: ticketId,
      type: form.type ?? "fault",
      priority: form.priority ?? alert.level,
      status: "pending",
      source: "app",
      userId: ownerUser?.userId ?? null,
      sn: single,
      appVersion: ownerUser?.appVersion ?? null,
      firmware: device?.firmware ?? null,
      contact: ownerUser?.phone ?? null,
      content: form.content?.trim() || alert.happened,
      attachments: [],
      assignee: form.assignee,
      slaTargetHours: slaTargetHourByPriority[form.priority ?? alert.level],
      slaDeadlineAt: addHoursLabel(NOW_LABEL, slaTargetHourByPriority[form.priority ?? alert.level]),
      submittedAt: NOW_LABEL,
      acceptedAt: null,
      acceptedBy: null,
      resolvedAt: null,
      replies: [],
      flow: [{ at: NOW_LABEL, operator: ACTOR, from: null, to: "pending", note: `由告警 ${alertId} 转工单` }],
      rejectReason: null,
      rmaId: null,
      relatedAlertId: alertId
    };
    commit({
      ...state,
      feedbackTickets: [ticket, ...state.feedbackTickets],
      alerts: state.alerts.map((item) =>
        item.id === alertId
          ? {
              ...item,
              status: "ticketed",
              ticketId,
              assignee: form.assignee,
              events: [...item.events, { at: NOW_LABEL, kind: "ticketed", text: `${ACTOR} 转工单 ${ticketId}，处理人 ${form.assignee}` }]
            }
          : item
      )
    });
    return { ok: true, message: ticketId };
  },

  assign(alertId: string, staff: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const alert = state.alerts.find((item) => item.id === alertId);
    if (!alert) return { ok: false, reason: "告警不存在" };
    if (isTerminal(alert)) return { ok: false, reason: `告警 ${alertId} 已结束，无法指派` };
    patchAlert(
      alertId,
      { status: alert.status === "ticketed" ? "ticketed" : "processing", assignee: staff },
      { at: NOW_LABEL, kind: "assigned", text: `${ACTOR} 指派给 ${staff}` }
    );
    return { ok: true };
  },

  resolve(alertId: string, form: ResolveForm): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const alert = state.alerts.find((item) => item.id === alertId);
    if (!alert) return { ok: false, reason: "告警不存在" };
    if (isTerminal(alert)) return { ok: false, reason: `告警 ${alertId} 已结束` };
    if (!resolutionConclusions.includes(form.conclusion)) return { ok: false, reason: "请选择处理结论" };
    const note = form.note.trim();
    if (form.conclusion === "其他" && !note) return { ok: false, reason: "选择“其他”时请填写备注" };
    patchAlert(
      alertId,
      { status: "resolved", resolution: { conclusion: form.conclusion, note, at: NOW_LABEL, by: ACTOR } },
      { at: NOW_LABEL, kind: "resolved", text: `${ACTOR} 标记已处理，结论：${form.conclusion}${note ? `（${note}）` : ""}` }
    );
    return { ok: true };
  },

  reopen(alertId: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const alert = state.alerts.find((item) => item.id === alertId);
    if (!alert) return { ok: false, reason: "告警不存在" };
    if (alert.status !== "resolved") return { ok: false, reason: `告警 ${alertId} 不是已处理状态，无法重新打开` };
    patchAlert(alertId, { status: "open", resolution: null }, { at: NOW_LABEL, kind: "reopened", text: `${ACTOR} 重新打开，回到待处理` });
    return { ok: true };
  },

  mute(alertId: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const alert = state.alerts.find((item) => item.id === alertId);
    if (!alert) return { ok: false, reason: "告警不存在" };
    if (isTerminal(alert)) return { ok: false, reason: `告警 ${alertId} 已结束，无法静默` };
    patchAlert(
      alertId,
      { status: "muted", mutedUntil: "2026-09-29 15:00" },
      { at: NOW_LABEL, kind: "muted", text: `${ACTOR} 静默 24 小时，至 2026-09-29 15:00` }
    );
    return { ok: true };
  },

  // —— 退货 RMA（2026-09-29 批 1：替代原 startRma，创建 RMA 单，不再联动 openTickets）——
  createRma(form: RmaCreateForm): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const device = state.devices.find((item) => item.sn === form.sn);
    if (!device) return { ok: false, reason: `未找到设备 ${form.sn}` };
    if (device.lifecycle === "rma") return { ok: false, reason: `设备 ${form.sn} 已在退货 RMA 流程中，不可重复发起` };
    if (device.lifecycle !== "shipped") return { ok: false, reason: `设备 ${form.sn} 当前不是出货状态，无法发起退货 RMA` };
    const description = (form.description ?? "").trim();
    if (form.reasonCode === "other" && !description) return { ok: false, reason: "原因选择「其他」时请填写问题描述" };
    const counter = state.rmaCounter + 1;
    const id = `RMA-20260928-${String(counter).padStart(6, "0")}`;
    const record: RmaRecord = {
      id,
      sn: device.sn,
      model: device.model,
      reasonCode: form.reasonCode,
      source: form.source,
      description: description || null,
      expectedArrivalDate: form.expectedArrivalDate ?? null,
      attachments: (form.attachments ?? []).map((item) => ({ ...item })),
      arrivalStatus: "pending",
      arrivedAt: null,
      conclusion: "pending_check",
      appearanceScore: null,
      functionChecks: [],
      inspectNote: null,
      inspectAttachments: [],
      inspector: null,
      inspectedAt: null,
      decisionMethod: "pending_decision",
      decisionNote: null,
      expectedRepairDate: null,
      decidedBy: null,
      decidedAt: null,
      initiator: ACTOR,
      createdAt: NOW_LABEL,
      closedAt: null
    };
    // 转退货 RMA 来源：创建成功后回写工单的关联 RMA 单号（页 9 卡片动线 1）。
    if (form.sourceFeedbackId) {
      const ticket = state.feedbackTickets.find((item) => item.id === form.sourceFeedbackId);
      if (!ticket) return { ok: false, reason: `未找到客户反馈工单 ${form.sourceFeedbackId}` };
      if (ticket.rmaId) return { ok: false, reason: `工单 ${form.sourceFeedbackId} 已关联 RMA 单 ${ticket.rmaId}` };
    }
    commit({
      ...state,
      rmaCounter: counter,
      rmas: [...state.rmas, record].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)),
      devices: state.devices.map((item) =>
        item.sn === device.sn ? { ...item, lifecycle: "rma" as const, online: null, lastHeartbeat: null, offlineDuration: null, offlineDays: 0, rmaCount: item.rmaCount + 1 } : item
      ),
      feedbackTickets: form.sourceFeedbackId
        ? state.feedbackTickets.map((ticket) =>
            ticket.id === form.sourceFeedbackId
              ? {
                  ...ticket,
                  rmaId: id,
                  flow: [...ticket.flow, { at: NOW_LABEL, operator: ACTOR, from: ticket.status, to: ticket.status, note: `转退货 RMA ${id}` }]
                }
              : ticket
          )
        : state.feedbackTickets
    });
    appendPassportEvents([
      makePassportEvent(device.sn, "rma", "rma", ACTOR, `受理退回申请，创建 RMA 单 ${id}`, {
        "RMA 单号": id,
        退货原因: rmaReasonMeta[form.reasonCode].label,
        退货来源: rmaSourceMeta[form.source].label
      })
    ]);
    return { ok: true, message: id };
  },

  editRma(id: string, form: { reasonCode?: RmaReasonCode; source?: RmaSource; description?: string }): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const record = state.rmas.find((item) => item.id === id);
    if (!record) return { ok: false, reason: `未找到 RMA 单 ${id}` };
    if (record.arrivalStatus !== "pending") return { ok: false, reason: "设备到件后单据锁定，仅待到件阶段可编辑" };
    const description = form.description !== undefined ? form.description.trim() : (record.description ?? "");
    const reasonCode = form.reasonCode ?? record.reasonCode;
    if (reasonCode === "other" && !description) return { ok: false, reason: "原因选择「其他」时请填写问题描述" };
    patchRma(id, { reasonCode, source: form.source ?? record.source, description: description || null });
    return { ok: true };
  },

  confirmArrival(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const record = state.rmas.find((item) => item.id === id);
    if (!record) return { ok: false, reason: `未找到 RMA 单 ${id}` };
    if (record.arrivalStatus !== "pending") return { ok: false, reason: `单据 ${id} 当前状态不能确认到件` };
    patchRma(id, { arrivalStatus: "arrived_pending_check", arrivedAt: NOW_LABEL });
    return { ok: true };
  },

  // 「检测中」在提交检测后才流转；取消不改变状态（2026-09-29 页面卡裁决）。
  submitInspection(id: string, form: RmaInspectForm): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const record = state.rmas.find((item) => item.id === id);
    if (!record) return { ok: false, reason: `未找到 RMA 单 ${id}` };
    if (record.arrivalStatus !== "arrived_pending_check" && record.arrivalStatus !== "inspecting") {
      return { ok: false, reason: `单据 ${id} 当前状态为「${rmaArrivalMeta[record.arrivalStatus].label}」，无法录入检测` };
    }
    if (form.conclusion === "scrap" && !(form.inspectNote ?? "").trim()) return { ok: false, reason: "检测结论为「报废」时检测备注必填" };
    if (form.functionChecks.length === 0) return { ok: false, reason: "功能检测至少选择 1 项" };
    patchRma(id, {
      arrivalStatus: "inspected",
      conclusion: form.conclusion,
      appearanceScore: form.appearanceScore,
      functionChecks: [...form.functionChecks],
      inspectNote: (form.inspectNote ?? "").trim() || null,
      inspectAttachments: (form.inspectAttachments ?? []).map((item) => ({ ...item })),
      inspector: ACTOR,
      inspectedAt: NOW_LABEL
    });
    return { ok: true };
  },

  decide(id: string, form: RmaDecideForm): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const record = state.rmas.find((item) => item.id === id);
    if (!record) return { ok: false, reason: `未找到 RMA 单 ${id}` };
    if (record.arrivalStatus !== "inspected" || record.conclusion === "pending_check") {
      return { ok: false, reason: `单据 ${id} 尚未完成检测，无法裁决` };
    }
    if (record.decisionMethod !== "pending_decision") return { ok: false, reason: `单据 ${id} 已完成裁决，不可重复执行` };
    if (form.method === "pending_decision") return { ok: false, reason: "请选择处理方式" };
    if (record.conclusion !== form.method) {
      return { ok: false, reason: `处理方式「${rmaDecisionMeta[form.method].label}」与检测结论「${rmaConclusionMeta[record.conclusion].label}」不匹配` };
    }
    if (form.method === "scrap" && !(form.decisionNote ?? "").trim()) return { ok: false, reason: "报废裁决说明必填" };
    if (form.method === "repair" && !form.expectedRepairDate) return { ok: false, reason: "返修裁决请填写预计返修完成日期" };
    const lifecycleMap = { repair: "test_failed", restock: "in_stock", scrap: "scrapped" } as const;
    const nextLifecycle = lifecycleMap[form.method];
    patchRma(id, {
      decisionMethod: form.method,
      decisionNote: (form.decisionNote ?? "").trim() || null,
      expectedRepairDate: form.expectedRepairDate ?? null,
      decidedBy: ACTOR,
      decidedAt: NOW_LABEL,
      arrivalStatus: "closed",
      closedAt: NOW_LABEL
    });
    commit({
      ...state,
      devices: state.devices.map((device) =>
        device.sn === record.sn
          ? {
              ...device,
              lifecycle: nextLifecycle,
              online: null,
              lastHeartbeat: form.method === "repair" ? device.lastHeartbeat : null,
              cert: form.method === "scrap" ? "cert_failed" : device.cert,
              activatedAt: form.method === "restock" ? null : device.activatedAt,
              province: form.method === "restock" ? null : device.province
            }
          : device
      )
    });
    const eventKind = form.method === "repair" ? "repaired" : form.method === "restock" ? "restocked" : "scrapped";
    const eventColor = form.method === "repair" ? "test_failed" : form.method === "restock" ? "in_stock" : "scrapped";
    const eventSummary =
      form.method === "repair"
        ? "裁决返修，设备转入测试不合格，进入返修回测流程"
        : form.method === "restock"
          ? "裁决二次入库，设备重新入库"
          : "裁决报废，设备与证书注销";
    appendPassportEvents([
      makePassportEvent(record.sn, eventKind, eventColor, ACTOR, eventSummary, { "RMA 单号": id })
    ]);
    return {
      ok: true,
      message: form.method === "repair" ? "设备状态已变为测试不合格，进入返修回测流程" : `单据 ${id} 已裁决为「${rmaDecisionMeta[form.method].label}」并关闭`
    };
  },

  closeBatch(ids: string[]): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const records = ids.map((id) => state.rmas.find((item) => item.id === id));
    const missing = ids.find((id, index) => !records[index]);
    if (missing) return { ok: false, reason: `未找到 RMA 单 ${missing}` };
    const ineligible = (records as RmaRecord[]).filter(
      (record) => !canCloseRmaRecord(record, state.devices.find((device) => device.sn === record.sn))
    );
    if (ineligible.length > 0) return { ok: false, reason: `所选项中有 ${ineligible.length} 条不满足关闭条件（需已裁决且设备已离开退货流程）` };
    commit({
      ...state,
      rmas: state.rmas.map((record) =>
        ids.includes(record.id) ? { ...record, arrivalStatus: "closed" as const, closedAt: NOW_LABEL } : record
      )
    });
    return { ok: true, message: `已关闭 ${ids.length} 条 RMA 单` };
  },

  // —— 数字护照公开配置 ——
  savePassportPublish(sn: string, config: PassportPublishConfig): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const device = state.devices.find((item) => item.sn === sn);
    if (!device) return { ok: false, reason: `未找到设备 ${sn}` };
    if (device.lifecycle !== "shipped") return { ok: false, reason: "仅出货设备可设置公开范围" };
    if (config.showRma && !config.showTimeline) return { ok: false, reason: "「公开 RMA 售后历史」需要同时开启「公开生命周期时间轴」" };
    patchDevice(sn, { passportPublish: { ...config } });
    return { ok: true };
  },

  closePassportPublish(sn: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const device = state.devices.find((item) => item.sn === sn);
    if (!device) return { ok: false, reason: `未找到设备 ${sn}` };
    patchDevice(sn, { passportPublish: { ...device.passportPublish, publicEnabled: false } });
    return { ok: true };
  },

  batchApplyPassportPublish(sns: string[], config: PassportPublishConfig): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    if (config.showRma && !config.showTimeline) return { ok: false, reason: "「公开 RMA 售后历史」需要同时开启「公开生命周期时间轴」" };
    const blocked = sns.filter((sn) => state.devices.find((device) => device.sn === sn)?.lifecycle !== "shipped");
    if (blocked.length > 0) return { ok: false, reason: "选中项中包含不支持此操作的记录" };
    commit({
      ...state,
      devices: state.devices.map((device) => (sns.includes(device.sn) ? { ...device, passportPublish: { ...config } } : device))
    });
    return { ok: true, message: `已对 ${sns.length} 台应用公开配置` };
  },

  batchClosePassportPublish(sns: string[]): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const blocked = sns.filter((sn) => state.devices.find((device) => device.sn === sn)?.passportPublish.publicEnabled !== true);
    if (blocked.length > 0) return { ok: false, reason: "选中项中包含不支持此操作的记录" };
    commit({
      ...state,
      devices: state.devices.map((device) =>
        sns.includes(device.sn) ? { ...device, passportPublish: { ...device.passportPublish, publicEnabled: false } } : device
      )
    });
    return { ok: true, message: `已关闭 ${sns.length} 台设备的对外公开` };
  },

  // —— 固件版本 ——
  saveFirmwareVersion(id: string | null, form: FirmwareVersionForm, submit: boolean): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    if (!/^v\d+\.\d+\.\d+(-[a-zA-Z0-9_-]+)?$/.test(form.version) || form.version.length > 50) {
      return { ok: false, reason: "固件版本号格式不正确（如 v2.4.0 或 v2.4.0-rc.1）" };
    }
    if (form.models.length < 1 || form.models.length > 5) return { ok: false, reason: "机型需选择 1–5 个" };
    const changelog = form.changelog.trim();
    if (changelog.length < 10 || changelog.length > 5000) return { ok: false, reason: "变更日志需 10–5000 字" };
    if (form.issueId && !/^(ISSUE|BUG|TASK)-\d+$/.test(form.issueId)) return { ok: false, reason: "关联问题单号格式应为 ISSUE-123 / BUG-123 / TASK-123" };

    if (id === null) {
      if (state.firmwareVersions.some((version) => version.id === form.version)) return { ok: false, reason: `版本 ${form.version} 已存在` };
      const version: FirmwareVersion = {
        id: form.version,
        version: form.version,
        models: [...form.models],
        note: form.note?.trim() || null,
        status: submit ? "testing" : "draft",
        signStatus: submit ? "signed" : "unsigned",
        signMethod: form.signMethod,
        ratio: null,
        boundDeviceCount: 0,
        publisher: ACTOR,
        releasedAt: submit ? NOW_LABEL : null,
        changelog,
        issueId: form.issueId || null,
        package: form.package ? { ...form.package } : null,
        signFile: form.signMethod === "manual" && form.signFile ? { ...form.signFile } : null,
        createdAt: NOW_LABEL,
        events: [
          { at: NOW_LABEL, operator: ACTOR, text: submit ? "创建版本并提交测试" : "创建版本草稿" }
        ]
      };
      commit({ ...state, firmwareVersions: [...state.firmwareVersions, version] });
      return { ok: true, message: submit ? `版本 ${form.version} 已提交测试` : `草稿 ${form.version} 已保存` };
    }
    const version = versionById(id);
    if (!version) return { ok: false, reason: `未找到版本 ${id}` };
    if (version.status !== "draft") return { ok: false, reason: "仅草稿状态的版本可编辑" };
    commit({
      ...state,
      firmwareVersions: state.firmwareVersions.map((item) =>
        item.id === id
          ? {
              ...item,
              models: [...form.models],
              note: form.note?.trim() || null,
              changelog,
              issueId: form.issueId || null,
              package: form.package ? { ...form.package } : item.package,
              signMethod: form.signMethod,
              signFile: form.signMethod === "manual" ? (form.signFile ? { ...form.signFile } : item.signFile) : null,
              status: submit ? "testing" : "draft",
              signStatus: submit ? "signed" : item.signStatus,
              releasedAt: submit ? NOW_LABEL : item.releasedAt,
              publisher: submit ? ACTOR : item.publisher,
              events: [...item.events, { at: NOW_LABEL, operator: ACTOR, text: submit ? "提交测试" : "保存草稿修改" }]
            }
          : item
      )
    });
    return { ok: true, message: submit ? `版本 ${id} 已提交测试` : `草稿 ${id} 已保存` };
  },

  submitVersionForTesting(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const version = versionById(id);
    if (!version) return { ok: false, reason: `未找到版本 ${id}` };
    if (version.status !== "draft") return { ok: false, reason: "仅草稿可提交测试" };
    patchVersion(id, { status: "testing", signStatus: "signed", publisher: ACTOR, releasedAt: NOW_LABEL }, { at: NOW_LABEL, operator: ACTOR, text: "提交测试，签名成功" });
    return { ok: true };
  },

  // 签名失败后的「重新触发签名」：A 档直接执行，状态回到签名中，结果稍后刷新查看。
  retrySign(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const version = versionById(id);
    if (!version) return { ok: false, reason: `未找到版本 ${id}` };
    if (version.signStatus !== "sign_failed") return { ok: false, reason: "仅签名失败的版本可重新触发签名" };
    patchVersion(id, { signStatus: "signing" }, { at: NOW_LABEL, operator: ACTOR, text: "重新触发签名，等待签名结果" });
    return { ok: true };
  },

  deleteVersion(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const version = versionById(id);
    if (!version) return { ok: false, reason: `未找到版本 ${id}` };
    if (version.status !== "draft") return { ok: false, reason: "仅草稿可删除，删除后不可恢复" };
    const taskIds = state.pushTasks.filter((task) => task.versionId === id).map((task) => task.id);
    commit({
      ...state,
      firmwareVersions: state.firmwareVersions.filter((item) => item.id !== id),
      pushTasks: state.pushTasks.filter((task) => task.versionId !== id),
      pushResults: state.pushResults.filter((item) => !taskIds.includes(item.taskId))
    });
    return { ok: true, message: `已删除草稿 ${id}` };
  },

  disableVersion(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const version = versionById(id);
    if (!version) return { ok: false, reason: `未找到版本 ${id}` };
    if (version.status !== "released" && version.status !== "rolled_back") return { ok: false, reason: "仅已全量 / 已回滚的版本可停用" };
    patchVersion(id, { status: "deprecated", ratio: null }, { at: NOW_LABEL, operator: ACTOR, text: "停用：不再向设备推送更新" });
    return { ok: true };
  },

  disableVersions(ids: string[]): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const ineligible = ids.filter((id) => {
      const version = versionById(id);
      return !version || (version.status !== "released" && version.status !== "rolled_back");
    });
    if (ineligible.length > 0) return { ok: false, reason: "所选版本包含不可停用的状态" };
    commit({
      ...state,
      firmwareVersions: state.firmwareVersions.map((version) =>
        ids.includes(version.id)
          ? { ...version, status: "deprecated" as const, ratio: null, events: [...version.events, { at: NOW_LABEL, operator: ACTOR, text: "批量停用" }] }
          : version
      )
    });
    return { ok: true, message: `已停用 ${ids.length} 个版本，这些版本不再推送给设备，已安装的设备不受影响` };
  },

  rollbackVersion(id: string, form: { targetVersionId: string; reason: string }): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const version = versionById(id);
    if (!version) return { ok: false, reason: `未找到版本 ${id}` };
    if (version.status !== "released" && version.status !== "canary") return { ok: false, reason: "仅已全量 / 灰度中的版本可回滚" };
    const target = versionById(form.targetVersionId);
    if (!target || target.status !== "released") return { ok: false, reason: "请选择同机型的已全量历史版本作为回滚目标" };
    if ((form.reason ?? "").trim().length < 5) return { ok: false, reason: "回滚原因至少 5 字" };
    patchVersion(id, { status: "rolled_back", ratio: null }, { at: NOW_LABEL, operator: ACTOR, text: `回滚至 ${target.version}：${form.reason.trim()}` });
    const counter = state.pushTaskCounter + 1;
    const task: PushTask = {
      id: `PT-20260928-${String(counter).padStart(2, "0")}`,
      name: `${version.version} 回滚 · 推送 ${target.version}`,
      versionId: target.id,
      model: version.models[0],
      targeting: { batches: [], provinces: [], fromVersions: [version.version], snFileName: null, snList: [] },
      ratio: 100,
      windowStart: null,
      windowEnd: null,
      circuitThreshold: 10,
      status: "running",
      creator: ACTOR,
      createdAt: NOW_LABEL,
      summary: { success: 0, failed: 0, total: version.boundDeviceCount },
      failureRate: 0,
      events: [{ at: NOW_LABEL, operator: ACTOR, text: `版本 ${version.version} 回滚自动创建 100% 推送任务` }]
    };
    commit({
      ...state,
      pushTaskCounter: counter,
      pushTasks: [...state.pushTasks, task].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    });
    return { ok: true, message: `已回滚为 ${target.version}，回滚推送任务 ${task.id} 已启动` };
  },

  // —— 推送任务 ——
  createPushTask(form: PushTaskCreateForm): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const version = versionById(form.versionId);
    if (!version) return { ok: false, reason: `未找到固件版本 ${form.versionId}` };
    if (version.status !== "testing" && version.status !== "canary") return { ok: false, reason: "目标版本需为测试中或灰度中" };
    if (!form.name.trim() || form.name.trim().length > 100) return { ok: false, reason: "任务名称必填且不超过 100 字" };
    if (form.ratio < 1 || form.ratio > 100 || !Number.isInteger(form.ratio)) return { ok: false, reason: "灰度比例需为 1–100 的整数" };
    if (form.circuitThreshold < 1 || form.circuitThreshold > 100) return { ok: false, reason: "熔断阈值需为 1–100" };
    if (!form.model.trim()) return { ok: false, reason: "定向-机型必选" };
    const counter = state.pushTaskCounter + 1;
    const id = `PT-20260928-${String(counter).padStart(2, "0")}`;
    const targeting = {
      batches: form.targeting.batches ?? [],
      provinces: form.targeting.provinces ?? [],
      fromVersions: form.targeting.fromVersions ?? [],
      snFileName: form.targeting.snFileName ?? null,
      snList: form.targeting.snList ?? []
    };
    const pool = pushTargetDevices({ model: form.model, batches: targeting.batches, fromVersions: targeting.fromVersions });
    const estimated = Math.max(1, Math.round((pool.length * form.ratio) / 100));
    const task: PushTask = {
      id,
      name: form.name.trim(),
      versionId: form.versionId,
      model: form.model,
      targeting,
      ratio: form.ratio,
      windowStart: form.windowStart ?? null,
      windowEnd: form.windowEnd ?? null,
      circuitThreshold: form.circuitThreshold,
      status: "running",
      creator: ACTOR,
      createdAt: NOW_LABEL,
      summary: { success: 0, failed: 0, total: estimated },
      failureRate: 0,
      events: [{ at: NOW_LABEL, operator: ACTOR, text: `创建并启动推送任务，预估命中 ${pool.length} 台` }]
    };
    commit({
      ...state,
      pushTaskCounter: counter,
      pushTasks: [...state.pushTasks, task].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    });
    // 首次执行联动：测试中 → 灰度中（版本状态只由推送任务驱动）。
    if (version.status === "testing") {
      patchVersion(form.versionId, { status: "canary", ratio: form.ratio }, { at: NOW_LABEL, operator: "系统自动", text: `首个推送任务 ${id} 启动，版本进入灰度中` });
    } else {
      patchVersion(form.versionId, { ratio: form.ratio }, { at: NOW_LABEL, operator: ACTOR, text: `创建推送任务 ${id}，当前灰度 ${form.ratio}%` });
    }
    return { ok: true, message: id };
  },

  pauseTask(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const task = state.pushTasks.find((item) => item.id === id);
    if (!task) return { ok: false, reason: `未找到推送任务 ${id}` };
    if (task.status !== "running") return { ok: false, reason: "仅执行中的任务可暂停" };
    patchTask(id, { status: "paused" }, { at: NOW_LABEL, operator: ACTOR, text: "暂停推送，已下发设备不受影响" });
    return { ok: true };
  },

  resumeTask(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const task = state.pushTasks.find((item) => item.id === id);
    if (!task) return { ok: false, reason: `未找到推送任务 ${id}` };
    if (task.status !== "paused") return { ok: false, reason: "仅已暂停的任务可恢复；已熔断任务不可手动恢复" };
    patchTask(id, { status: "running" }, { at: NOW_LABEL, operator: ACTOR, text: "恢复推送执行" });
    return { ok: true };
  },

  cancelTask(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const task = state.pushTasks.find((item) => item.id === id);
    if (!task) return { ok: false, reason: `未找到推送任务 ${id}` };
    if (task.status === "fused" || task.status === "completed" || task.status === "cancelled") {
      return { ok: false, reason: "该状态的任务不可取消" };
    }
    patchTask(id, { status: "cancelled" }, { at: NOW_LABEL, operator: ACTOR, text: "取消：取消后不可恢复，已下发成功的设备不回滚" });
    return { ok: true };
  },

  // —— 工作台偏好（内存 store，刷新复原）——
  setDashboardTimeRange(range: DashboardTimeRange): ActionResult {
    commit({ ...state, dashboard: { ...state.dashboard, timeRange: range } });
    return { ok: true };
  },

  refreshDashboard(): ActionResult {
    commit({ ...state, dashboard: { ...state.dashboard, lastRefreshedAt: NOW_LABEL } });
    return { ok: true };
  },

  moveDashboardCard(fromIndex: number, toIndex: number): ActionResult {
    const ordered = [...state.dashboard.orderedCardIds];
    if (fromIndex < 0 || fromIndex >= ordered.length || toIndex < 0 || toIndex >= ordered.length) return { ok: false, reason: "排序位置无效" };
    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);
    commit({ ...state, dashboard: { ...state.dashboard, orderedCardIds: ordered } });
    return { ok: true };
  },

  removeDashboardCard(id: DashboardCardId): ActionResult {
    const ordered = [...state.dashboard.orderedCardIds];
    const index = ordered.indexOf(id);
    if (index < 0) return { ok: false, reason: "该卡片不在看板上" };
    ordered.splice(index, 1);
    commit({ ...state, dashboard: { ...state.dashboard, orderedCardIds: ordered, lastRemoved: { id, index } } });
    return { ok: true };
  },

  undoRemoveDashboardCard(): ActionResult {
    const removed = state.dashboard.lastRemoved;
    if (!removed) return { ok: false, reason: "没有可撤销的移除" };
    const ordered = [...state.dashboard.orderedCardIds];
    ordered.splice(Math.min(removed.index, ordered.length), 0, removed.id);
    commit({ ...state, dashboard: { ...state.dashboard, orderedCardIds: ordered, lastRemoved: null } });
    return { ok: true };
  },

  addDashboardCardAt(id: DashboardCardId, index?: number): ActionResult {
    if (state.dashboard.orderedCardIds.includes(id)) return { ok: false, reason: "该卡片已在看板上" };
    const ordered = [...state.dashboard.orderedCardIds];
    ordered.splice(index === undefined ? ordered.length : Math.min(index, ordered.length), 0, id);
    commit({ ...state, dashboard: { ...state.dashboard, orderedCardIds: ordered, lastRemoved: state.dashboard.lastRemoved?.id === id ? null : state.dashboard.lastRemoved } });
    return { ok: true };
  },

  // —— 烧录发证（2026-09-29 批 2 页面卡 · 页 8）——
  // 处置即流转：动作回写烧录记录与 Device.lifecycle / cert，全部设备与设备详情同源变化。
  createFlashingTask(form: FlashingTaskForm): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const taskName = form.taskName.trim();
    if (!taskName || taskName.length > 64) return { ok: false, reason: "任务名称必填且不超过 64 字" };
    // 任务名称允许中间空格（2026-09-29 主线程裁决：只去首尾空格），与种子「B2410 首批烧录」同款写法可触发查重。
    if (!/^[一-龥A-Za-z0-9_\-. ]+$/.test(taskName)) return { ok: false, reason: "任务名称仅支持中文、字母、数字、空格与 _-. 字符" };
    if (state.flashingTasks.some((task) => task.taskName === taskName)) return { ok: false, reason: "任务名称已存在" };
    if (!form.model) return { ok: false, reason: "请选择机型" };
    if (!form.firmwareVersion) return { ok: false, reason: "请选择固件版本" };
    const stations = form.stations.filter((station) => (flashingStations as readonly string[]).includes(station));
    if (stations.length < 1 || stations.length > 20) return { ok: false, reason: "烧录工位需选择 1–20 个" };
    if (form.issueCert && !form.certTemplate?.trim()) return { ok: false, reason: "开启证书签发时证书模板必选" };
    if (!form.scopeValue.trim()) return { ok: false, reason: "请选择设备范围" };
    if (!Number.isInteger(form.retryLimit) || form.retryLimit < 1 || form.retryLimit > 10) return { ok: false, reason: "重试上限需为 1–10 的整数，超过上限转入报废流程" };
    const seq = state.flashingTasks.filter((task) => task.taskId.startsWith("FT-20260928-")).length + 1;
    const task: FlashingTask = {
      taskId: `FT-20260928-${String(seq).padStart(2, "0")}`,
      taskName,
      model: form.model,
      firmwareVersion: form.firmwareVersion,
      stations: [...stations],
      issueCert: form.issueCert,
      certTemplate: form.issueCert ? form.certTemplate!.trim() : null,
      scopeType: form.scopeType,
      scopeValue: form.scopeValue.trim(),
      retryLimit: form.retryLimit,
      remark: form.remark?.trim() || null,
      createdBy: ACTOR,
      createdAt: NOW_LABEL
    };
    // 2026-09-29 集成裁决（批 2 验收要点 4）：除写 FlashingTask 外，为范围内每台收货入场设备
    // 生成进行中的烧录记录并回写设备生命周期，确认后回列表首行即可看到新记录。
    const scoped = form.scopeSns
      .map((sn) => state.devices.find((device) => device.sn === sn))
      .filter((device): device is Device => Boolean(device));
    const newRecords: FlashingRecord[] = scoped.map((device, index) => ({
      sn: device.sn,
      taskId: task.taskId,
      model: device.model,
      firmwareVersion: task.firmwareVersion,
      station: stations[index % stations.length],
      certState: "cert_pending",
      result: "processing",
      retryCount: 0,
      retryLimit: task.retryLimit,
      durationSec: null,
      operator: ACTOR,
      startedAt: `${NOW_LABEL}:00`,
      failure: null,
      logSteps: [
        { name: "固件下载", at: `${NOW_LABEL}:00`, durationSec: null, status: "processing" },
        { name: "写入", at: null, durationSec: null, status: "pending" },
        { name: "校验", at: null, durationSec: null, status: "pending" },
        { name: "证书签发", at: null, durationSec: null, status: "pending" }
      ]
    }));
    const scopedSns = new Set(scoped.map((device) => device.sn));
    commit({
      ...state,
      flashingTasks: [...state.flashingTasks, task],
      flashingRecords: [...state.flashingRecords, ...newRecords],
      devices: state.devices.map((device) => (scopedSns.has(device.sn) ? { ...device, lifecycle: "flashing" as const } : device))
    });
    return { ok: true, message: task.taskId };
  },

  // 标记成功（→测试中）：仅烧录进行中（result=processing）。
  markFlashSuccess(sn: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const record = state.flashingRecords.find((item) => item.sn === sn);
    const device = state.devices.find((item) => item.sn === sn);
    if (!record || !device) return { ok: false, reason: `未找到 SN ${sn} 的烧录记录` };
    if (record.result !== "processing") return { ok: false, reason: `SN ${sn} 当前不是烧录进行中，无法标记成功` };
    const durationSec = 80 + (Number(sn.slice(-2)) % 40);
    const issueCert = state.flashingTasks.find((task) => task.taskId === record.taskId)?.issueCert ?? true;
    commit({
      ...state,
      flashingRecords: state.flashingRecords.map((item) =>
        item.sn === sn
          ? {
              ...item,
              result: "succeeded" as const,
              certState: issueCert ? ("cert_issued" as const) : item.certState,
              durationSec,
              logSteps: item.logSteps.map((step) => (step.status === "processing" ? { ...step, status: "succeeded" as const, at: NOW_LABEL, durationSec: 12 } : step))
            }
          : item
      ),
      devices: state.devices.map((item) =>
        item.sn === sn ? { ...item, lifecycle: "testing" as const, cert: issueCert ? ("cert_issued" as const) : item.cert, firmware: record.firmwareVersion } : item
      )
    });
    appendPassportEvents([
      makePassportEvent(sn, "flash", "flashing", ACTOR, issueCert ? "固件烧录成功并签发证书，移交测试" : "固件烧录成功，按任务配置未签发证书，移交测试", { 固件版本: record.firmwareVersion, 烧录任务: record.taskId })
    ]);
    return { ok: true, message: `SN ${sn} 已流转至测试中` };
  },

  // 标记失败（→烧录失败）：失败原因登记（分类必填、描述必填 ≤500 字、照片 ≤3 张），提交即确认。
  markFlashFailed(sn: string, form: { category: FlashingFailureCategory; description: string; photoCount: number }): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const record = state.flashingRecords.find((item) => item.sn === sn);
    if (!record) return { ok: false, reason: `未找到 SN ${sn} 的烧录记录` };
    if (record.result !== "processing") return { ok: false, reason: `SN ${sn} 当前不是烧录进行中，无法标记失败` };
    if (!flashingFailureCategories.includes(form.category)) return { ok: false, reason: "请选择失败原因分类" };
    const description = form.description.trim();
    if (!description || description.length > 500) return { ok: false, reason: "失败描述必填且不超过 500 字" };
    if (!Number.isInteger(form.photoCount) || form.photoCount < 0 || form.photoCount > 3) return { ok: false, reason: "现场照片最多 3 张" };
    commit({
      ...state,
      flashingRecords: state.flashingRecords.map((item) =>
        item.sn === sn
          ? {
              ...item,
              result: "failed" as const,
              retryCount: item.retryCount,
              durationSec: 80 + (Number(sn.slice(-2)) % 40),
              failure: { category: form.category, description, photoCount: form.photoCount },
              logSteps: item.logSteps.map((step) => (step.status === "processing" ? { ...step, status: "failed" as const, at: NOW_LABEL } : step))
            }
          : item
      ),
      devices: state.devices.map((item) => (item.sn === sn ? { ...item, lifecycle: "flash_failed" as const } : item))
    });
    appendPassportEvents([makePassportEvent(sn, "flash_failed", "flash_failed", ACTOR, `固件烧录失败（${form.category}），需回炉重烧`)]);
    return { ok: true };
  },

  // 重试烧录（→烧录·发证）：仅烧录失败且重试 < 上限，确认后重试次数 +1。
  retryFlash(sn: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const record = state.flashingRecords.find((item) => item.sn === sn);
    if (!record) return { ok: false, reason: `未找到 SN ${sn} 的烧录记录` };
    if (record.result !== "failed") return { ok: false, reason: `SN ${sn} 当前不是烧录失败状态，无法重试` };
    if (record.retryCount >= record.retryLimit) return { ok: false, reason: `SN ${sn} 已重试 ${record.retryCount} 次，达到上限 ${record.retryLimit} 次，请走超限报废` };
    commit({
      ...state,
      flashingRecords: state.flashingRecords.map((item) =>
        item.sn === sn
          ? {
              ...item,
              result: "processing" as const,
              retryCount: item.retryCount + 1,
              durationSec: null,
              failure: null,
              startedAt: `${NOW_LABEL}:00`,
              logSteps: [
                { name: "固件下载", at: `${NOW_LABEL}:00`, durationSec: null, status: "processing" as const },
                { name: "写入", at: null, durationSec: null, status: "pending" as const },
                { name: "校验", at: null, durationSec: null, status: "pending" as const },
                { name: "证书签发", at: null, durationSec: null, status: "pending" as const }
              ]
            }
          : item
      ),
      devices: state.devices.map((item) => (item.sn === sn ? { ...item, lifecycle: "flashing" as const } : item))
    });
    return { ok: true, message: `已对 SN ${sn} 重新发起烧录，当前状态为烧录·发证` };
  },

  // 超限报废（→报废）：仅烧录失败且重试 ≥ 上限；证书状态随之变为签发失败。
  scrapFlash(sn: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const record = state.flashingRecords.find((item) => item.sn === sn);
    if (!record) return { ok: false, reason: `未找到 SN ${sn} 的烧录记录` };
    if (record.result !== "failed" || record.retryCount < record.retryLimit) {
      return { ok: false, reason: `SN ${sn} 不满足报废条件（需烧录失败且重试达到上限）` };
    }
    if (state.devices.find((item) => item.sn === sn)?.lifecycle !== "flash_failed") {
      return { ok: false, reason: `SN ${sn} 当前不在烧录失败状态，不能报废` };
    }
    commit({
      ...state,
      devices: state.devices.map((item) =>
        item.sn === sn ? { ...item, lifecycle: "scrapped" as const, cert: "cert_failed" as const, firmware: null, targetFirmware: null } : item
      ),
      flashingRecords: state.flashingRecords.map((item) => (item.sn === sn ? { ...item, certState: "cert_failed" as const } : item))
    });
    appendPassportEvents([makePassportEvent(sn, "scrapped", "scrapped", ACTOR, `重试达到上限 ${record.retryLimit} 次，执行报废`, { 报废凭证: `SCR-${sn.slice(2)}` })]);
    return { ok: true, message: `SN ${sn} 已报废，证书状态更新为签发失败` };
  },

  // —— 客户反馈（2026-09-29 批 2 页面卡 · 页 9），全部动作写 flow 流转记录 ——
  receiveTicket(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const ticket = state.feedbackTickets.find((item) => item.id === id);
    if (!ticket) return { ok: false, reason: `未找到工单 ${id}` };
    if (ticket.status !== "pending") return { ok: false, reason: `工单 ${id} 当前不是待受理状态` };
    commit({
      ...state,
      feedbackTickets: state.feedbackTickets.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "processing" as const,
              acceptedAt: NOW_LABEL,
              acceptedBy: ACTOR,
              assignee: ACTOR,
              flow: [...item.flow, { at: NOW_LABEL, operator: ACTOR, from: "pending" as const, to: "processing" as const }]
            }
          : item
      )
    });
    return { ok: true, message: "已受理，SLA 首次响应计时停止" };
  },

  assignTickets(ids: string[], staff: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const eligible = ids.filter((id) => {
      const ticket = state.feedbackTickets.find((item) => item.id === id);
      return ticket && (ticket.status === "pending" || ticket.status === "processing");
    });
    if (eligible.length !== ids.length) return { ok: false, reason: "仅待受理 / 处理中的工单可指派" };
    commit({
      ...state,
      feedbackTickets: state.feedbackTickets.map((ticket) =>
        ids.includes(ticket.id)
          ? { ...ticket, assignee: staff, flow: [...ticket.flow, { at: NOW_LABEL, operator: ACTOR, from: ticket.status, to: ticket.status, note: `指派给 ${staff}` }] }
          : ticket
      )
    });
    return { ok: true, message: ids.length === 1 ? `已指派给 ${staff}` : `已将 ${ids.length} 条工单指派给 ${staff}` };
  },

  // 回复用户：推送用户 App 消息；markAwaiting 时状态进入待用户确认。
  replyTicket(id: string, form: { content: string; markAwaiting: boolean }): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const ticket = state.feedbackTickets.find((item) => item.id === id);
    if (!ticket) return { ok: false, reason: `未找到工单 ${id}` };
    if (ticket.status !== "processing" && ticket.status !== "awaiting_user") return { ok: false, reason: `工单 ${id} 当前状态不可回复` };
    const content = form.content.trim();
    if (!content) return { ok: false, reason: "回复内容必填" };
    const nextStatus: FeedbackStatus = form.markAwaiting ? "awaiting_user" : "processing";
    const reply: FeedbackReply = { from: "staff", content, at: NOW_LABEL, pushStatus: "pushed" };
    commit({
      ...state,
      feedbackTickets: state.feedbackTickets.map((item) =>
        item.id === id
          ? {
              ...item,
              status: nextStatus,
              replies: [...item.replies, reply],
              flow: [...item.flow, { at: NOW_LABEL, operator: ACTOR, from: item.status, to: nextStatus, note: "回复用户" }]
            }
          : item
      )
    });
    return { ok: true, message: form.markAwaiting ? "已回复并等待用户确认" : "已回复用户" };
  },

  resolveTicket(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const ticket = state.feedbackTickets.find((item) => item.id === id);
    if (!ticket) return { ok: false, reason: `未找到工单 ${id}` };
    if (ticket.status !== "awaiting_user" && ticket.status !== "processing") return { ok: false, reason: `工单 ${id} 当前状态不可标记已解决` };
    commit({
      ...state,
      feedbackTickets: state.feedbackTickets.map((item) =>
        item.id === id
          ? { ...item, status: "resolved" as const, resolvedAt: NOW_LABEL, flow: [...item.flow, { at: NOW_LABEL, operator: ACTOR, from: item.status, to: "resolved" as const }] }
          : item
      )
    });
    return { ok: true, message: "已标记为已解决，SLA 计时停止" };
  },

  closeTicket(id: string): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const ticket = state.feedbackTickets.find((item) => item.id === id);
    if (!ticket) return { ok: false, reason: `未找到工单 ${id}` };
    if (ticket.status !== "resolved") return { ok: false, reason: `工单 ${id} 当前不是已解决状态，无法关闭` };
    commit({
      ...state,
      feedbackTickets: state.feedbackTickets.map((item) =>
        item.id === id ? { ...item, status: "closed" as const, flow: [...item.flow, { at: NOW_LABEL, operator: ACTOR, from: "resolved" as const, to: "closed" as const }] } : item
      )
    });
    return { ok: true, message: `工单 ${id} 已关闭，不再可变更` };
  },

  // 驳回（终态）：原因必填 5–200 字，写入回复历史并推送用户。
  rejectTicket(id: string, form: { reason: string }): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const ticket = state.feedbackTickets.find((item) => item.id === id);
    if (!ticket) return { ok: false, reason: `未找到工单 ${id}` };
    if (ticket.status !== "pending" && ticket.status !== "processing") return { ok: false, reason: `工单 ${id} 当前状态不可驳回` };
    const reason = form.reason.trim();
    if (reason.length < 5 || reason.length > 200) return { ok: false, reason: "驳回原因必填，5–200 字" };
    commit({
      ...state,
      feedbackTickets: state.feedbackTickets.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "rejected" as const,
              rejectReason: reason,
              resolvedAt: NOW_LABEL,
              replies: [...item.replies, { from: "staff" as const, content: reason, at: NOW_LABEL, pushStatus: "pushed" as const }],
              flow: [...item.flow, { at: NOW_LABEL, operator: ACTOR, from: item.status, to: "rejected" as const, note: "驳回" }]
            }
          : item
      )
    });
    return { ok: true, message: `工单 ${id} 已驳回，进入终态仅可查看` };
  },

  // 客服代录：误建走「驳回」纠错，不提供删除。
  createManualTicket(form: FeedbackManualForm): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const content = form.content.trim();
    if (!content) return { ok: false, reason: "反馈内容必填" };
    if (form.sn && !state.devices.some((device) => device.sn === form.sn)) return { ok: false, reason: `未找到设备 ${form.sn}` };
    const seq = state.feedbackTickets.filter((ticket) => ticket.id.startsWith(`FB${NOW_STAMP}`)).length + 1;
    const id = `FB${NOW_STAMP}${String(seq).padStart(3, "0")}`;
    const owner = form.sn ? state.bindings.find((binding) => binding.sn === form.sn && binding.role === "owner") : undefined;
    const ownerUser = owner ? state.appUsers.find((user) => user.userId === owner.userId) : undefined;
    const device = form.sn ? state.devices.find((item) => item.sn === form.sn) : undefined;
    const ticket: FeedbackTicket = {
      id,
      type: form.type,
      priority: form.priority,
      status: "pending",
      source: "agent",
      userId: form.userId ?? ownerUser?.userId ?? null,
      sn: form.sn ?? null,
      appVersion: ownerUser?.appVersion ?? form.appVersion ?? null,
      firmware: device?.firmware ?? null,
      contact: form.contact ?? ownerUser?.phone ?? null,
      content,
      attachments: [],
      assignee: null,
      slaTargetHours: slaTargetHourByPriority[form.priority],
      slaDeadlineAt: addHoursLabel(NOW_LABEL, slaTargetHourByPriority[form.priority]),
      submittedAt: NOW_LABEL,
      acceptedAt: null,
      acceptedBy: null,
      resolvedAt: null,
      replies: [],
      flow: [{ at: NOW_LABEL, operator: ACTOR, from: null, to: "pending", note: "客服代录" }],
      rejectReason: null,
      rmaId: null,
      relatedAlertId: null
    };
    commit({ ...state, feedbackTickets: [ticket, ...state.feedbackTickets] });
    return { ok: true, message: id };
  },

  // —— 告警规则（2026-09-29 批 2 页面卡 · 页 10）：只有停用，没有删除 ——
  createRule(form: AlertRuleForm): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const invalid = validateAlertRuleForm(form);
    if (invalid) return { ok: false, reason: invalid };
    const seq = state.alertRules.filter((rule) => rule.id.startsWith("AR-0928-")).length + 1;
    const rule: AlertRule = {
      id: `AR-0928-${String(seq).padStart(2, "0")}`,
      name: form.name.trim(),
      type: form.type,
      scope: form.scope ?? null,
      target: form.target ?? null,
      thresholdPct: form.thresholdPct ?? null,
      offlineDays: form.offlineDays ?? null,
      pushTaskScope: form.pushTaskScope ?? null,
      pushTaskIds: [...(form.pushTaskIds ?? [])],
      notifyUsers: [...form.notifyUsers],
      // 新规则默认启用（PRD ⑥）。
      enabled: true,
      createdAt: NOW_LABEL,
      lastTriggeredAt: null
    };
    commit({ ...state, alertRules: [...state.alertRules, rule] });
    return { ok: true, message: `规则「${rule.name}」已保存并启用` };
  },

  updateRule(id: string, form: AlertRuleForm): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const rule = state.alertRules.find((item) => item.id === id);
    if (!rule) return { ok: false, reason: `未找到规则 ${id}` };
    const invalid = validateAlertRuleForm(form);
    if (invalid) return { ok: false, reason: invalid };
    commit({
      ...state,
      alertRules: state.alertRules.map((item) =>
        item.id === id
          ? {
              ...item,
              name: form.name.trim(),
              type: form.type,
              scope: form.scope ?? null,
              target: form.target ?? null,
              thresholdPct: form.thresholdPct ?? null,
              offlineDays: form.offlineDays ?? null,
              pushTaskScope: form.pushTaskScope ?? null,
              pushTaskIds: [...(form.pushTaskIds ?? [])],
              notifyUsers: [...form.notifyUsers]
            }
          : item
      )
    });
    return { ok: true, message: `规则「${form.name.trim()}」已保存${rule.enabled ? "并启用" : ""}` };
  },

  setRuleEnabled(id: string, enabled: boolean): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    const rule = state.alertRules.find((item) => item.id === id);
    if (!rule) return { ok: false, reason: `未找到规则 ${id}` };
    if (rule.enabled === enabled) return { ok: false, reason: enabled ? `规则「${rule.name}」已在启用状态` : `规则「${rule.name}」已在停用状态` };
    commit({ ...state, alertRules: state.alertRules.map((item) => (item.id === id ? { ...item, enabled } : item)) });
    return { ok: true, message: enabled ? `已启用，按最新配置生效` : `已停用「${rule.name}」，停用期间的告警不会补发` };
  },

  // —— 用户与绑定敏感查看审计（页 11）：确认后写审计日志，明文保留到刷新为止 ——
  revealSensitiveField(form: { targetUserId: string; field: string; reason: string }): ActionResult {
    const denied = readonlyReason();
    if (denied) return { ok: false, reason: denied };
    if (!state.appUsers.some((user) => user.userId === form.targetUserId)) return { ok: false, reason: `未找到用户 ${form.targetUserId}` };
    const reason = form.reason.trim();
    if (!reason || reason.length > 100) return { ok: false, reason: "查看原因必填，不超过 100 字" };
    commit({
      ...state,
      sensitiveAudits: [...state.sensitiveAudits, { at: NOW_LABEL, actor: ACTOR, targetUserId: form.targetUserId, field: form.field, reason }]
    });
    return { ok: true, message: "已记录审计日志" };
  }
};

// —— 批 2 表单与校验 ——
export type FlashingTaskForm = {
  taskName: string;
  model: string;
  firmwareVersion: string;
  stations: string[];
  issueCert: boolean;
  certTemplate?: string | null;
  scopeType: FlashingTaskScope;
  scopeValue: string;
  // 第二步实时预览命中的收货入场设备 SN（确认后逐台生成烧录记录并回写生命周期）。
  scopeSns: string[];
  retryLimit: number;
  remark?: string;
};

export type FeedbackManualForm = {
  type: FeedbackType;
  priority: FeedbackPriority;
  content: string;
  sn?: string | null;
  userId?: string | null;
  contact?: string | null;
  appVersion?: string | null;
};

export type AlertRuleForm = {
  name: string;
  type: AlertRuleType;
  scope?: "model" | "batch";
  target?: string;
  thresholdPct?: number;
  offlineDays?: number;
  pushTaskScope?: "all" | "specified";
  pushTaskIds?: string[];
  notifyUsers: string[];
};

function validateAlertRuleForm(form: AlertRuleForm): string | null {
  const name = form.name.trim();
  if (!name || name.length > 50) return "规则名称必填且不超过 50 字";
  if (form.type === "offline_rate_exceeded") {
    if (!form.scope) return "请选择适用范围（机型 / 批次）";
    if (!form.target) return "请选择目标对象";
    if (form.thresholdPct === undefined || form.thresholdPct < 1 || form.thresholdPct > 100) return "阈值需为 1–100 的整数";
  }
  if (form.type === "offline_duration_exceeded" && (form.offlineDays === undefined || !Number.isInteger(form.offlineDays) || form.offlineDays < 1 || form.offlineDays > 90)) {
    return "离线天数需为 1–90 的整数";
  }
  if (form.type === "upgrade_fail_rate_exceeded") {
    if (form.thresholdPct === undefined || form.thresholdPct < 1 || form.thresholdPct > 100) return "阈值需为 1–100 的整数";
    if (form.pushTaskScope === "specified" && (!form.pushTaskIds || form.pushTaskIds.length === 0)) return "指定任务时至少选择 1 个推送任务";
  }
  if (form.notifyUsers.length === 0) return "请选择通知对象";
  return null;
}

export function useDeviceOpsState() {
  return useSyncExternalStore(deviceOpsStore.subscribe, deviceOpsStore.getState, deviceOpsStore.getState);
}

// 待处理与处理中都算“未处理”，已转工单后由工单接管。
export function unresolvedAlertCountBySn(alerts: AlertRecord[]) {
  const counts = new Map<string, number>();
  for (const alert of alerts) {
    if (alert.status !== "open" && alert.status !== "processing") continue;
    for (const sn of alert.sns) counts.set(sn, (counts.get(sn) ?? 0) + 1);
  }
  return counts;
}

// —— 批 2 选择器（工作台新卡计数 = 目标列表预置筛选行数，同源唯一口径）——
// 「待烧录发证」= 烧录·发证 + 烧录失败状态的设备数（烧录记录页 status=flashing,flash_failed 筛选行数）。
export const flashingPendingCount = (devices: Device[]) =>
  devices.filter((device) => device.lifecycle === "flashing" || device.lifecycle === "flash_failed").length;
// 「待受理反馈」= 客户反馈页 status=pending 筛选行数。
export const pendingTicketCount = (tickets: FeedbackTicket[]) => tickets.filter((ticket) => ticket.status === "pending").length;
// 「反馈 SLA 超时」= 已超时筛选行数；已解决 / 终态工单不再计时，不计入。
export const overdueTicketCount = (tickets: FeedbackTicket[]) =>
  tickets.filter((ticket) => (ticket.status === "pending" || ticket.status === "processing" || ticket.status === "awaiting_user") && slaStateOf(ticket) === "overdue").length;
// 设备详情「未关闭工单数」：已关闭 / 已驳回以外都算未关闭。
export function openTicketCountBySn(tickets: FeedbackTicket[]) {
  const counts = new Map<string, number>();
  for (const ticket of tickets) {
    if (!ticket.sn || !isFeedbackOpen(ticket)) continue;
    counts.set(ticket.sn, (counts.get(ticket.sn) ?? 0) + 1);
  }
  return counts;
}
// 用户与绑定：某 SN 的全部绑定关系（模式 B 反查）与按用户 ID 找用户。
export const bindingsForSn = (bindings: Binding[], sn: string) => bindings.filter((binding) => binding.sn === sn);
export const userById = (users: AppUser[], userId: string) => users.find((user) => user.userId === userId);

// —— 批 1 选择器 ——
export function passportEventsBySn(events: PassportEvent[], sn: string) {
  return events.filter((event) => event.sn === sn).sort((a, b) => b.at.localeCompare(a.at));
}

export function latestEventBySn(events: PassportEvent[], sn: string) {
  return passportEventsBySn(events, sn)[0] ?? null;
}

export const alertOpenCount = (alerts: AlertRecord[]) => alerts.filter((alert) => alert.status === "open").length;
export const offlineAlertHasP1 = (alerts: AlertRecord[]) => alerts.some((alert) => alert.status === "open" && alert.level === "P1");
// 工作台「待处理 RMA」计数与 RMA 页 ?status=open 预设筛选同口径（data.ts isRmaPending）。
export const pendingRmaCount = (rmas: RmaRecord[]) => rmas.filter(isRmaPending).length;
export const testingVersionCount = (versions: FirmwareVersion[]) => versions.filter((version) => version.status === "testing").length;
export const fusedTaskCount = (tasks: PushTask[]) => tasks.filter((task) => task.status === "fused").length;

// NOW_LABEL 为项目冻结时间 2026-09-28；范围含今天往前推，起始日确定性写死，避免时区换算。
const rangeStart: Record<DashboardTimeRange, string> = { today: "2026-09-28", week: "2026-09-22", month: "2026-08-30" };
// 工作台「今日新激活」卡片跳全部设备时的预置激活时间范围，与卡片计数同一口径。
export function activatedRangeDates(range: DashboardTimeRange): [string, string] {
  return [rangeStart[range], "2026-09-28"];
}
export function activatedCountInRange(devices: Device[], range: DashboardTimeRange) {
  const [start, end] = activatedRangeDates(range);
  return devices.filter((device) => device.activatedAt !== null && device.activatedAt >= start && device.activatedAt <= end).length;
}
