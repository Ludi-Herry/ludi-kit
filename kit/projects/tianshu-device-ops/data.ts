// 三页共用同一批设备与告警。数据按下标确定性生成，截图与验收可复现，不使用随机数与当前时间。

export type LifecycleState =
  | "received"
  | "flashing"
  | "flash_failed"
  | "testing"
  | "test_failed"
  | "in_stock"
  | "shipped"
  | "rma"
  | "scrapped";
export type OnlineState = "online" | "offline" | "never_online";
export type Phase = "production" | "running" | "after_sales";
export type QcResult = "qc_pass" | "qc_downgrade" | "qc_fail" | "qc_pending";
// 2026-09-29 批 2 裁决页 8-1：证书状态全局统一到 PRD 三态（未签发 / 签发成功 / 签发失败），含吊销（报废）归签发失败。
export type CertState = "cert_pending" | "cert_issued" | "cert_failed";

export type AlertType = "offline_rate_exceeded" | "offline_duration_exceeded" | "upgrade_fail_rate_exceeded" | "hardware_health";
export type AlertLevel = "P1" | "P2" | "P3";
export type AlertStatus = "open" | "processing" | "ticketed" | "resolved" | "muted";

export const NOW_LABEL = "2026-09-28 15:00";

export const lifecycleMeta: Record<LifecycleState, { label: string; color: string; phase: Phase; order: number }> = {
  received: { label: "收货入场", color: "processing", phase: "production", order: 1 },
  flashing: { label: "烧录·发证", color: "processing", phase: "production", order: 2 },
  flash_failed: { label: "烧录失败", color: "error", phase: "production", order: 3 },
  testing: { label: "测试中", color: "processing", phase: "production", order: 4 },
  test_failed: { label: "测试不合格", color: "error", phase: "production", order: 5 },
  in_stock: { label: "合格入库", color: "success", phase: "production", order: 6 },
  shipped: { label: "出货", color: "geekblue", phase: "running", order: 7 },
  rma: { label: "退货 RMA", color: "warning", phase: "after_sales", order: 8 },
  scrapped: { label: "报废", color: "default", phase: "after_sales", order: 9 }
};

export const phaseMeta: Record<Phase, { label: string; states: LifecycleState[] }> = {
  production: { label: "生产阶段", states: ["received", "flashing", "flash_failed", "testing", "test_failed", "in_stock"] },
  running: { label: "运行阶段", states: ["shipped"] },
  after_sales: { label: "售后阶段", states: ["rma", "scrapped"] }
};

export const onlineMeta: Record<OnlineState, { label: string; color: string }> = {
  online: { label: "在线", color: "success" },
  offline: { label: "离线", color: "warning" },
  never_online: { label: "从未上线", color: "default" }
};

export const qcMeta: Record<QcResult, { label: string; color: string }> = {
  qc_pass: { label: "合格", color: "success" },
  qc_downgrade: { label: "降级合格", color: "warning" },
  qc_fail: { label: "不合格", color: "error" },
  qc_pending: { label: "未质检", color: "default" }
};

export const certMeta: Record<CertState, { label: string; color: string }> = {
  cert_pending: { label: "未签发", color: "default" },
  cert_issued: { label: "签发成功", color: "success" },
  cert_failed: { label: "签发失败", color: "error" }
};

export const alertTypeLabel: Record<AlertType, string> = {
  offline_rate_exceeded: "离线率超阈值",
  offline_duration_exceeded: "单台离线超期",
  upgrade_fail_rate_exceeded: "升级失败率超阈值",
  hardware_health: "硬件健康异常"
};

export const alertStatusMeta: Record<AlertStatus, { label: string; color: string }> = {
  open: { label: "待处理", color: "error" },
  processing: { label: "处理中", color: "processing" },
  ticketed: { label: "已转工单", color: "processing" },
  resolved: { label: "已处理", color: "success" },
  muted: { label: "已静默", color: "default" }
};

export const models = ["TS-N2", "TS-N4 Pro"] as const;
export const batches = ["B2407", "B2408", "B2409", "B2410"] as const;
export const provinces = ["广东", "浙江", "江苏", "四川", "湖北", "北京", "上海", "福建"] as const;
export const firmwareVersions = ["v2.4.0", "v2.3.1", "v2.2.8"] as const;

export type Device = {
  sn: string;
  model: string;
  batch: string;
  receivedAt: string;
  qc: QcResult;
  shippedAt: string | null;
  cert: CertState;
  lifecycle: LifecycleState;
  online: OnlineState | null;
  lastHeartbeat: string | null;
  offlineDuration: string | null;
  offlineDays: number;
  firmware: string | null;
  targetFirmware: string | null;
  activatedAt: string | null;
  province: string | null;
  storageUsed: number | null;
  storageTotal: number;
  boundUsers: number;
  adminPhone: string | null;
  bindPhones: string[];
  warrantyUntil: string | null;
  openTickets: number;
  rmaCount: number;
  // 2026-09-29 批 1：护照公开配置与二维码状态由折叠区字符串提升为实体字段，页间同源。
  passportPublish: PassportPublishConfig;
  qrGenerated: boolean;
};

// 生命周期分布：58 台，多数已出货，覆盖全部九个状态。2026-09-29 批 2 裁决页 8-5：
// 尾部补 10 台生产域设备（8 台收货入场 + 2 台烧录失败），支撑烧录发证页与新建任务第二步预览，与全部设备页计数一致。
const lifecyclePlan: LifecycleState[] = [
  "shipped", "shipped", "shipped", "in_stock", "shipped", "shipped", "rma", "shipped", "shipped", "shipped", "shipped", "scrapped",
  "shipped", "shipped", "shipped", "shipped", "in_stock", "shipped", "shipped", "rma", "shipped", "shipped", "shipped", "shipped",
  "shipped", "shipped", "shipped", "shipped", "shipped", "shipped", "shipped", "shipped", "rma", "shipped", "shipped", "shipped",
  "testing", "test_failed", "in_stock", "flashing", "flash_failed", "received", "testing", "in_stock", "test_failed", "in_stock", "scrapped", "rma",
  "received", "received", "received", "received", "received", "received", "received", "received", "flash_failed", "flash_failed"
];

// B2409 离线集中，对应告警 AL-0928-001；其余批次零星离线与从未上线。
const offlineIndexes = new Set([2, 13, 24, 25, 27, 30, 33]);
const neverOnlineIndexes = new Set([9, 21]);
// 2026-09-29 视觉评审：基准日（NOW_LABEL 当天）有 4 台在线出货设备激活，
// 工作台「今日新激活」、全部设备 ?activated=today、护照时间轴激活节点三处同源一致。
const todayActivatedIndexes = new Set([26, 28, 29, 31]);

const pad = (value: number) => String(value).padStart(2, "0");

function dateFrom(month: number, day: number) {
  const m = month + Math.floor((day - 1) / 28);
  const d = ((day - 1) % 28) + 1;
  return `2026-${pad(m)}-${pad(d)}`;
}

// 批 2 增补的 10 台设备（index 48–57）固定为批次 B2410，收货日期显式给定，均在 NOW_LABEL 之前。
// index 36（测试中，2026-09-30 集成补的成功烧录记录载体）同样显式收敛：派生公式原把它算到 2026-10-03（NOW_LABEL 之后），
// 烧录 / 测试 / 证书时间全部由 receivedAt 派生，收敛后整机时间线落在冻结时间之前且同源一致。
const extraDeviceReceivedAt: Record<number, string> = {
  36: "2026-09-26",
  48: "2026-09-26",
  49: "2026-09-26",
  50: "2026-09-27",
  51: "2026-09-27",
  52: "2026-09-27",
  53: "2026-09-28",
  54: "2026-09-28",
  55: "2026-09-28",
  56: "2026-09-26",
  57: "2026-09-26"
};

function buildDevice(index: number): Device {
  const batchIndex = Math.floor(index / 12);
  const batch = batches[Math.min(batchIndex, batches.length - 1)];
  const month = 7 + Math.min(batchIndex, batches.length - 1);
  const lifecycle = lifecyclePlan[index];
  const model = index % 3 === 0 ? models[1] : models[0];
  const sn = `TS${batch.slice(1)}${String(101 + index * 7).padStart(4, "0")}`;
  const receivedAt = extraDeviceReceivedAt[index] ?? dateFrom(month, 2 + (index % 5));
  const hasShipped = lifecycle === "shipped" || lifecycle === "rma" || (lifecycle === "scrapped" && index === 11);
  const shippedAt = hasShipped ? dateFrom(month, 12 + (index % 9)) : null;
  const isShipped = lifecycle === "shipped";
  const online: OnlineState | null = isShipped
    ? neverOnlineIndexes.has(index) ? "never_online" : offlineIndexes.has(index) ? "offline" : "online"
    : null;
  const offlineDays = online === "offline" ? [0, 1, 2, 9, 3, 1, 12][[...offlineIndexes].indexOf(index)] ?? 1 : 0;
  const offlineHours = online === "offline" ? 2 + (index % 7) : 0;
  const lastHeartbeat = online === "online"
    ? `2026-09-28 14:${pad(58 - (index % 40))}`
    : online === "offline"
      ? `2026-09-${pad(28 - offlineDays)} ${pad(12 - (offlineHours % 10))}:${pad((index * 13) % 60)}`
      : lifecycle === "rma" ? dateFrom(month, 24) + " 09:12" : null;
  const offlineDuration = online === "offline" ? (offlineDays > 0 ? `${offlineDays} 天 ${offlineHours} 小时` : `${offlineHours} 小时 ${(index * 7) % 60} 分`) : null;
  const firmware = lifecycle === "received" || lifecycle === "flashing" || lifecycle === "flash_failed"
    ? null
    : index % 5 === 0 ? "v2.2.8" : index % 4 === 0 ? "v2.4.0" : "v2.3.1";
  const targetFirmware = isShipped && online !== "never_online" && firmware === "v2.3.1" && batch === "B2409" ? "v2.4.0" : null;
  const activatedAt = isShipped && online !== "never_online"
    ? todayActivatedIndexes.has(index)
      ? "2026-09-28"
      : dateFrom(month, 16 + (index % 9))
    : lifecycle === "rma"
      ? dateFrom(month, 17)
      : null;
  const qc: QcResult = lifecycle === "test_failed" ? "qc_fail"
    : lifecycle === "testing" || lifecycle === "received" || lifecycle === "flashing" || lifecycle === "flash_failed" ? "qc_pending"
      : index % 11 === 4 ? "qc_downgrade" : "qc_pass";
  const cert: CertState = lifecycle === "scrapped" ? "cert_failed" : lifecycle === "received" || lifecycle === "flashing" || lifecycle === "flash_failed" ? "cert_pending" : "cert_issued";
  const storageTotal = model === "TS-N4 Pro" ? 8 : 4;
  const storageUsed = activatedAt ? Math.round(storageTotal * (0.18 + ((index * 17) % 70) / 100) * 100) / 100 : null;
  const boundUsers = activatedAt ? 1 + (index % 4) : 0;
  const phoneTail = String(1000 + ((index * 389) % 9000)).slice(0, 4);
  const adminPhone = activatedAt ? `1${3 + (index % 6)}${index % 10}****${phoneTail}` : null;
  const bindPhones = activatedAt ? [`13${index % 10}0000${phoneTail}`] : [];
  const warrantyUntil = shippedAt ? `2028-${shippedAt.slice(5)}` : null;
  const rmaCount = lifecycle === "rma" ? 1 : index === 7 || index === 11 || index === 22 ? 1 : 0;
  // 2026-09-29 批 2：与 FeedbackTicket 种子同源——RMA 设备、index 13/30 各有 1 条未关闭工单；
  // index 33（AL-0928-006 告警文案承诺「该设备有一条未关闭的客户反馈」）对应 FB20260928114000002。
  const openTickets = lifecycle === "rma" ? 1 : index === 13 || index === 30 || index === 33 ? 1 : 0;
  const passportPublished = hasShipped && index % 3 === 0;

  return {
    sn,
    model,
    batch,
    receivedAt,
    qc,
    shippedAt,
    cert,
    lifecycle,
    online,
    lastHeartbeat,
    offlineDuration,
    offlineDays,
    firmware,
    targetFirmware,
    activatedAt,
    province: activatedAt ? provinces[index % provinces.length] : null,
    storageUsed,
    storageTotal,
    boundUsers,
    adminPhone,
    bindPhones,
    warrantyUntil,
    openTickets,
    rmaCount,
    passportPublish: defaultPassportPublishConfig(passportPublished),
    qrGenerated: passportPublished
  };
}

export const seedDevices: Device[] = Array.from({ length: lifecyclePlan.length }, (_, index) => buildDevice(index));

export type DeviceAction = "detail" | "passport" | "rma";

export type NextAction = "ticket" | "devices" | "resolve";
export type NextStep = { text: string; action?: NextAction };
export type AlertEventKind = "found" | "assigned" | "ticketed" | "resolved" | "reopened" | "muted";
export type AlertEvent = { at: string; kind: AlertEventKind; text: string };
export const resolutionConclusions = ["已恢复", "误报", "已更换部件", "其他"] as const;
export type ResolutionConclusion = (typeof resolutionConclusions)[number];
export type AlertResolution = { conclusion: ResolutionConclusion; note: string; at: string; by: string };

export type AlertRecord = {
  id: string;
  type: AlertType;
  level: AlertLevel;
  status: AlertStatus;
  target: string;
  sns: string[];
  batch?: string;
  title: string;
  happened: string;
  impact: string[];
  nextSteps: NextStep[];
  firstSeenAt: string;
  lastSeenAt: string;
  assignee: string | null;
  ticketId: string | null;
  mutedUntil: string | null;
  resolution: AlertResolution | null;
  events: AlertEvent[];
  // 2026-09-29 批 1 动线 3：升级失败类告警可链接到对应推送任务详情。
  pushTaskId: string | null;
  // 2026-09-29 批 2 动线：告警由告警规则触发，三条 hardware_health 为设备自检告警（null，无关联规则）。
  ruleId: string | null;
};

type SeedAlert = Omit<AlertRecord, "resolution" | "events" | "pushTaskId" | "ruleId">;

const snAt = (index: number) => seedDevices[index].sn;
const b2409Offline = seedDevices.filter((device) => device.batch === "B2409" && device.online === "offline");
const b2409Shipped = seedDevices.filter((device) => device.batch === "B2409" && device.lifecycle === "shipped");
const b2409Rate = Math.round((b2409Offline.length / b2409Shipped.length) * 1000) / 10;

const seedAlertBase: SeedAlert[] = [
  {
    id: "AL-0928-001",
    type: "offline_rate_exceeded",
    level: "P1",
    status: "open",
    target: "批次 B2409",
    sns: b2409Offline.map((device) => device.sn),
    batch: "B2409",
    title: `批次 B2409 离线率 ${b2409Rate}%`,
    happened: `批次 B2409 已出货 ${b2409Shipped.length} 台，其中 ${b2409Offline.length} 台离线，离线率 ${b2409Rate}%，超过规则阈值 10%，已持续 2 小时 15 分。`,
    impact: [
      `${b2409Offline.length} 台设备的用户当前无法远程访问存储空间。`,
      "该批次正在推送固件 v2.4.0，离线设备将在重新上线后继续升级。",
      "离线设备集中在同一批次，可能是批次级问题，建议优先排查。"
    ],
    nextSteps: [
      { text: "查看受影响设备，确认离线时间是否集中", action: "devices" },
      { text: "转工单给运维排查网络与固件兼容性", action: "ticket" },
      { text: "排查完成后标记已处理", action: "resolve" }
    ],
    firstSeenAt: "2026-09-28 12:45",
    lastSeenAt: "2026-09-28 14:58",
    assignee: null,
    ticketId: null,
    mutedUntil: null
  },
  {
    id: "AL-0928-002",
    type: "hardware_health",
    level: "P1",
    status: "open",
    target: `设备 ${snAt(14)}`,
    sns: [snAt(14)],
    title: "磁盘 2 出现坏道，健康度 61%",
    happened: `设备 ${snAt(14)} 在 14:20 的自检中发现磁盘 2 出现 38 个坏道，健康度从 92% 降到 61%。`,
    impact: ["磁盘继续恶化可能导致该盘数据不可读。", "设备处于保修期内，可安排上门更换或寄修。"],
    nextSteps: [
      { text: "联系设备管理员提醒备份数据" },
      { text: "转工单给客服安排换盘", action: "ticket" },
      { text: "查看设备详情确认存储用量", action: "devices" }
    ],
    firstSeenAt: "2026-09-28 14:20",
    lastSeenAt: "2026-09-28 14:20",
    assignee: null,
    ticketId: null,
    mutedUntil: null
  },
  {
    id: "AL-0928-003",
    type: "offline_duration_exceeded",
    level: "P2",
    status: "open",
    target: `设备 ${snAt(27)}`,
    sns: [snAt(27)],
    batch: "B2409",
    title: "设备离线已超过 7 天",
    happened: `设备 ${snAt(27)} 最后一次心跳在 9 月 19 日，已连续离线 9 天，超过规则阈值 7 天。`,
    impact: ["长期离线的设备无法接收安全补丁。", "用户可能已停用设备或更换了网络环境。"],
    nextSteps: [{ text: "转工单给客服电话回访", action: "ticket" }, { text: "确认用户仍在使用后，协助恢复联网" }],
    firstSeenAt: "2026-09-26 10:00",
    lastSeenAt: "2026-09-28 14:00",
    assignee: null,
    ticketId: null,
    mutedUntil: null
  },
  {
    id: "AL-0927-004",
    type: "upgrade_fail_rate_exceeded",
    level: "P2",
    status: "processing",
    target: "推送任务 v2.4.0 灰度 20%",
    sns: [snAt(4), snAt(16)].filter(Boolean),
    title: "推送任务 v2.4.0 升级失败率 6.2%",
    happened: "推送任务「v2.4.0 灰度 20%」已下发 258 台，其中 16 台升级失败，失败率 6.2%，超过规则阈值 5%。",
    impact: ["失败设备已自动回滚到 v2.3.1，用户数据不受影响。", "如果不处理，下一阶段扩大灰度可能放大失败数量。"],
    nextSteps: [{ text: "查看失败设备的共同机型与固件版本", action: "devices" }, { text: "确认原因前不扩大灰度范围" }],
    firstSeenAt: "2026-09-27 16:30",
    lastSeenAt: "2026-09-28 09:10",
    assignee: "固件发布 · 沈亦舟",
    ticketId: null,
    mutedUntil: null
  },
  {
    id: "AL-0927-005",
    type: "hardware_health",
    level: "P3",
    status: "processing",
    target: `设备 ${snAt(20)}`,
    sns: [snAt(20)],
    title: "设备温度持续偏高",
    happened: `设备 ${snAt(20)} 近 6 小时机身温度保持在 58–61°C，高于建议上限 55°C。`,
    impact: ["长期高温会缩短磁盘寿命。", "设备仍在正常运行，暂未影响读写。"],
    nextSteps: [{ text: "提醒用户改善摆放位置与通风" }, { text: "24 小时后复查温度" }],
    firstSeenAt: "2026-09-27 21:40",
    lastSeenAt: "2026-09-28 13:40",
    assignee: "运维 · 周启明",
    ticketId: null,
    mutedUntil: null
  },
  {
    id: "AL-0928-006",
    type: "offline_duration_exceeded",
    level: "P2",
    status: "open",
    target: `设备 ${snAt(33)}`,
    sns: [snAt(33)],
    title: "设备离线已超过 7 天",
    happened: `设备 ${snAt(33)} 最后一次心跳在 9 月 16 日，已连续离线 12 天，超过规则阈值 7 天。`,
    impact: ["长期离线的设备无法接收安全补丁。", "该设备有一条未关闭的客户反馈，可能与离线有关。"],
    nextSteps: [{ text: "查看设备详情中的客户反馈记录", action: "devices" }, { text: "转工单给客服合并跟进", action: "ticket" }],
    firstSeenAt: "2026-09-23 10:00",
    lastSeenAt: "2026-09-28 14:00",
    assignee: null,
    ticketId: null,
    mutedUntil: null
  },
  {
    id: "AL-0926-007",
    type: "offline_duration_exceeded",
    level: "P2",
    status: "ticketed",
    target: `设备 ${snAt(13)}`,
    sns: [snAt(13)],
    title: "设备离线已超过 7 天",
    happened: `设备 ${snAt(13)} 在 9 月 18 日后没有心跳，已转客服回访。`,
    impact: ["用户反馈家中网络更换，设备未重新配网。"],
    nextSteps: [{ text: "等待工单处理结果" }],
    firstSeenAt: "2026-09-25 10:00",
    lastSeenAt: "2026-09-28 10:00",
    assignee: "客服 · 许知遥",
    ticketId: "FB20260926143012008",
    mutedUntil: null
  },
  {
    id: "AL-0925-008",
    type: "hardware_health",
    level: "P3",
    status: "resolved",
    target: `设备 ${snAt(5)}`,
    sns: [snAt(5)],
    title: "风扇转速异常",
    happened: `设备 ${snAt(5)} 风扇转速低于下限，用户清理灰尘后恢复正常。`,
    impact: ["已恢复，无后续影响。"],
    nextSteps: [{ text: "无需处理" }],
    firstSeenAt: "2026-09-25 08:12",
    lastSeenAt: "2026-09-25 17:30",
    assignee: "运维 · 周启明",
    ticketId: null,
    mutedUntil: null
  },
  {
    id: "AL-0924-009",
    type: "offline_rate_exceeded",
    level: "P3",
    status: "muted",
    target: "批次 B2407",
    sns: [],
    batch: "B2407",
    title: "批次 B2407 离线率 11.0%",
    happened: "批次 B2407 在 9 月 24 日凌晨网络割接期间离线率短时升高。",
    impact: ["属于计划内维护，割接结束后自动恢复。"],
    nextSteps: [{ text: "静默到期后自动恢复监测" }],
    firstSeenAt: "2026-09-24 01:10",
    lastSeenAt: "2026-09-24 03:40",
    assignee: "运维 · 周启明",
    ticketId: null,
    mutedUntil: "2026-09-29 03:40"
  }
];

const seedAlertExtras: Record<string, { events: AlertEvent[]; resolution?: AlertResolution }> = {
  "AL-0927-004": {
    events: [{ at: "2026-09-27 17:05", kind: "assigned", text: "运维 · 周启明 指派给 固件发布 · 沈亦舟" }]
  },
  "AL-0927-005": {
    events: [{ at: "2026-09-27 22:10", kind: "assigned", text: "系统按规则指派给 运维 · 周启明" }]
  },
  "AL-0926-007": {
    events: [
      { at: "2026-09-25 11:20", kind: "assigned", text: "运维 · 周启明 指派给 客服 · 许知遥" },
      { at: "2026-09-25 11:32", kind: "ticketed", text: "运维 · 周启明 转工单 FB20260926143012008" }
    ]
  },
  "AL-0925-008": {
    events: [
      { at: "2026-09-25 09:00", kind: "assigned", text: "系统按规则指派给 运维 · 周启明" },
      { at: "2026-09-25 17:30", kind: "resolved", text: "运维 · 周启明 标记已处理，结论：已恢复（用户清理灰尘后转速恢复正常）" }
    ],
    resolution: { conclusion: "已恢复", note: "用户清理灰尘后转速恢复正常", at: "2026-09-25 17:30", by: "运维 · 周启明" }
  },
  "AL-0924-009": {
    events: [{ at: "2026-09-24 03:45", kind: "muted", text: "运维 · 周启明 静默至 2026-09-29 03:40（计划内网络割接）" }]
  }
};

const seedAlertPushTaskIds: Record<string, string> = { "AL-0927-004": "PT-20260927-01" };

// 批 2：告警 ↔ 触发规则同源回填（2026-09-29 页面卡）：hardware_health（AL-0928-002 / AL-0927-005 / AL-0925-008）为设备自检，保持 null。
const seedAlertRuleIds: Record<string, string> = {
  "AL-0928-001": "AR-0921-01",
  "AL-0924-009": "AR-0924-01",
  "AL-0928-003": "AR-0921-02",
  "AL-0928-006": "AR-0921-02",
  "AL-0926-007": "AR-0921-02",
  "AL-0927-004": "AR-0926-01"
};

export const seedAlerts: AlertRecord[] = seedAlertBase.map((alert) => {
  const extra = seedAlertExtras[alert.id];
  return {
    ...alert,
    resolution: extra?.resolution ?? null,
    pushTaskId: seedAlertPushTaskIds[alert.id] ?? null,
    ruleId: seedAlertRuleIds[alert.id] ?? null,
    events: [{ at: alert.firstSeenAt, kind: "found", text: "规则触发，系统发现告警" }, ...(extra?.events ?? [])]
  };
});

export const staffOptions = [
  { value: "运维 · 周启明", label: "运维 · 周启明" },
  { value: "运维 · 顾清和", label: "运维 · 顾清和" },
  { value: "客服 · 许知遥", label: "客服 · 许知遥" },
  { value: "固件发布 · 沈亦舟", label: "固件发布 · 沈亦舟" }
];

// ---------- 2026-09-29 扩页批 1 页面卡：共享层新实体 ----------
// 全部按下标确定性生成；状态色严格取页面卡引用的 PRD §3.1 映射，文案见 status-copy.md。

// —— 工作台 ——
export type DashboardCardType = "todo" | "alert" | "stat" | "quick";
export type DashboardCardId =
  | "offline-alerts"
  | "pending-rma"
  | "gray-versions"
  | "fused-push-tasks"
  | "today-activated"
  | "sn-lookup"
  | "pending-flashing"
  | "pending-feedback"
  | "sla-overdue-feedback"
  | "binding-lookup";
export type DashboardCardDef = {
  id: DashboardCardId;
  name: string;
  type: DashboardCardType;
  // 仅告警卡用：high 红点（含 P1 待处理）、mid 橙点；具体值由 store 按实时数据计算。
  severity?: "high" | "mid";
  sourceModule: string;
  defaultRoles: string[];
  targetRoute: string;
  presetFilter: string | null;
  permission: string;
  batch: 1 | 2;
};

export const dashboardCardDefs: DashboardCardDef[] = [
  {
    id: "offline-alerts",
    name: "离线告警",
    type: "alert",
    sourceModule: "在网设备监控",
    defaultRoles: ["运维", "客服", "生产管理", "平台管理员"],
    targetRoute: "/alerts",
    presetFilter: "status=open",
    permission: "production:fleet:view",
    batch: 1
  },
  {
    id: "pending-rma",
    name: "待处理 RMA",
    type: "todo",
    sourceModule: "退货 RMA",
    defaultRoles: ["运维", "客服"],
    // 计数 = isRmaPending（未关闭且未裁决），与 lifecycle=rma 设备的在途单一一对应。
    targetRoute: "/exceptions/rma",
    presetFilter: "status=open",
    permission: "production:rma:view",
    batch: 1
  },
  {
    id: "gray-versions",
    name: "待灰度版本",
    type: "todo",
    sourceModule: "固件与推送",
    defaultRoles: ["运维", "生产管理"],
    targetRoute: "/system/firmware",
    presetFilter: "tab=version&status=testing",
    permission: "production:firmware:view",
    batch: 1
  },
  {
    id: "fused-push-tasks",
    name: "推送任务已熔断",
    type: "alert",
    severity: "high",
    sourceModule: "固件与推送",
    defaultRoles: ["运维", "生产管理"],
    targetRoute: "/system/firmware",
    presetFilter: "tab=push-task&status=fused",
    permission: "production:firmware:push_task:view",
    batch: 1
  },
  {
    id: "today-activated",
    name: "今日新激活",
    type: "stat",
    sourceModule: "在网设备监控",
    defaultRoles: ["运维", "客服"],
    targetRoute: "/devices",
    presetFilter: "activated=today",
    permission: "production:fleet:view",
    batch: 1
  },
  {
    id: "sn-lookup",
    name: "按 SN 查履历",
    type: "quick",
    sourceModule: "数字护照",
    defaultRoles: ["运维", "客服"],
    targetRoute: "/lifecycle/passport",
    presetFilter: "focus=sn",
    permission: "production:passport:view",
    batch: 1
  },
  // 2026-09-29 批 2 补登四张卡：与目标列表预置筛选计数同源。
  {
    id: "pending-flashing",
    name: "待烧录发证",
    type: "todo",
    sourceModule: "烧录发证",
    defaultRoles: ["运维", "生产管理"],
    targetRoute: "/lifecycle/flashing",
    presetFilter: "status=flashing,flash_failed",
    permission: "production:flashing:view",
    batch: 2
  },
  {
    id: "pending-feedback",
    name: "待受理反馈",
    type: "todo",
    sourceModule: "客户反馈",
    defaultRoles: ["运维", "客服"],
    targetRoute: "/exceptions/feedback",
    presetFilter: "status=pending",
    permission: "platform:feedback:view",
    batch: 2
  },
  {
    id: "sla-overdue-feedback",
    name: "反馈 SLA 超时",
    type: "alert",
    severity: "high",
    sourceModule: "客户反馈",
    defaultRoles: ["运维", "客服"],
    targetRoute: "/exceptions/feedback",
    presetFilter: "sla=overdue",
    permission: "platform:feedback:view",
    batch: 2
  },
  {
    id: "binding-lookup",
    name: "查用户绑定",
    type: "quick",
    sourceModule: "用户与绑定",
    defaultRoles: ["运维", "客服"],
    targetRoute: "/users/binding",
    presetFilter: null,
    permission: "platform:app_user:view",
    batch: 2
  }
];

export type DashboardTimeRange = "today" | "week" | "month";
export const dashboardTimeRangeMeta: Record<DashboardTimeRange, string> = { today: "今日", week: "本周", month: "本月" };
export type DashboardPreferences = { orderedCardIds: DashboardCardId[]; timeRange: DashboardTimeRange };
export const defaultDashboardPreferences: DashboardPreferences = {
  orderedCardIds: [
    "offline-alerts",
    "pending-rma",
    "gray-versions",
    "fused-push-tasks",
    "today-activated",
    "sn-lookup",
    "pending-flashing",
    "pending-feedback",
    "sla-overdue-feedback",
    "binding-lookup"
  ],
  timeRange: "today"
};

// —— 数字护照 ——
export type PassportPublishState = "published" | "unpublished";
export const passportPublishMeta: Record<PassportPublishState, { label: string; color: string }> = {
  published: { label: "已公开", color: "success" },
  unpublished: { label: "未公开", color: "default" }
};

// 8 个开关字段名对齐 PRD §五；「公开 RMA 售后历史」依赖「公开生命周期时间轴」。
export type PassportPublishConfig = {
  publicEnabled: boolean;
  showModel: boolean;
  showFirmware: boolean;
  showQc: boolean;
  showShippedDate: boolean;
  showCert: boolean;
  showTimeline: boolean;
  showRma: boolean;
  remark: string;
};

export function defaultPassportPublishConfig(publicEnabled: boolean): PassportPublishConfig {
  return {
    publicEnabled,
    showModel: true,
    showFirmware: true,
    showQc: true,
    showShippedDate: true,
    showCert: false,
    showTimeline: true,
    showRma: false,
    remark: ""
  };
}

export type PassportEventKind =
  | "received"
  | "flash"
  | "flash_failed"
  | "testing"
  | "qc"
  | "inbound"
  | "shipped"
  | "activation"
  | "rma"
  | "repaired"
  | "restocked"
  | "scrapped";

// 事件类型过滤七项（PRD 原文），激活归入出货组后的运行事件。
export const passportEventKindLabel: Record<PassportEventKind, string> = {
  received: "收货入场",
  flash: "烧录·发证",
  flash_failed: "烧录失败",
  testing: "测试",
  qc: "质检",
  inbound: "入库",
  shipped: "出货",
  activation: "激活",
  rma: "RMA 退回",
  repaired: "返修",
  restocked: "二次入库",
  scrapped: "报废"
};

export type PassportEvent = {
  id: string;
  sn: string;
  kind: PassportEventKind;
  colorState: LifecycleState;
  label: string;
  at: string;
  operator: string;
  station?: string;
  summary: string;
  detail?: Record<string, string>;
};

// —— 退货 RMA ——
export type RmaReasonCode =
  | "function_issue"
  | "appearance_damage"
  | "missing_accessory"
  | "logistics_damage"
  | "customer_rejection"
  | "other";
export const rmaReasonMeta: Record<RmaReasonCode, { label: string; color: string }> = {
  function_issue: { label: "功能异常", color: "default" },
  appearance_damage: { label: "外观损坏", color: "default" },
  missing_accessory: { label: "配件缺失", color: "default" },
  logistics_damage: { label: "物流损坏", color: "default" },
  customer_rejection: { label: "客户拒收", color: "default" },
  other: { label: "其他", color: "default" }
};
export const rmaReasonOptions = (Object.keys(rmaReasonMeta) as RmaReasonCode[]).map((value) => ({
  value,
  label: rmaReasonMeta[value].label
}));

export type RmaSource = "ecommerce" | "offline_store" | "direct_customer" | "internal_transfer";
export const rmaSourceMeta: Record<RmaSource, { label: string; color: string }> = {
  ecommerce: { label: "电商平台", color: "default" },
  offline_store: { label: "线下门店", color: "default" },
  direct_customer: { label: "直销客户", color: "default" },
  internal_transfer: { label: "内部调拨", color: "default" }
};
export const rmaSourceOptions = (Object.keys(rmaSourceMeta) as RmaSource[]).map((value) => ({
  value,
  label: rmaSourceMeta[value].label
}));

export type RmaArrivalStatus = "pending" | "arrived_pending_check" | "inspecting" | "inspected" | "closed";
export const rmaArrivalMeta: Record<RmaArrivalStatus, { label: string; color: string }> = {
  pending: { label: "待到件", color: "processing" },
  arrived_pending_check: { label: "已到件-待检", color: "warning" },
  inspecting: { label: "检测中", color: "processing" },
  inspected: { label: "已检测", color: "success" },
  closed: { label: "已关闭", color: "default" }
};

export type RmaConclusion = "pending_check" | "repair" | "restock" | "scrap";
export const rmaConclusionMeta: Record<RmaConclusion, { label: string; color: string }> = {
  pending_check: { label: "待检测", color: "default" },
  repair: { label: "可返修", color: "warning" },
  restock: { label: "可二次入库", color: "success" },
  scrap: { label: "报废", color: "error" }
};

export type RmaDecisionMethod = "pending_decision" | "repair" | "restock" | "scrap";
export const rmaDecisionMeta: Record<RmaDecisionMethod, { label: string; color: string }> = {
  pending_decision: { label: "待裁决", color: "default" },
  repair: { label: "返修", color: "warning" },
  restock: { label: "二次入库", color: "cyan" },
  scrap: { label: "报废", color: "default" }
};

export const RMA_ID_PATTERN = /^RMA-\d{8}-\d{6}$/;
export const rmaAppearanceScores = ["A", "B", "C", "D"] as const;
export type RmaAppearanceScore = (typeof rmaAppearanceScores)[number];
export type RmaAttachment = { name: string; sizeBytes: number; type: string };
export const rmaFunctionCheckOptions = ["开机自检", "磁盘读写", "网络联通", "风扇转速", "噪声温度", "外设接口"] as const;

export type RmaRecord = {
  id: string;
  sn: string;
  model: string;
  reasonCode: RmaReasonCode;
  source: RmaSource;
  description: string | null;
  expectedArrivalDate: string | null;
  attachments: RmaAttachment[];
  arrivalStatus: RmaArrivalStatus;
  arrivedAt: string | null;
  conclusion: RmaConclusion;
  appearanceScore: RmaAppearanceScore | null;
  functionChecks: string[];
  inspectNote: string | null;
  inspectAttachments: RmaAttachment[];
  inspector: string | null;
  inspectedAt: string | null;
  decisionMethod: RmaDecisionMethod;
  decisionNote: string | null;
  expectedRepairDate: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  initiator: string;
  createdAt: string;
  closedAt: string | null;
};

// 未关闭单（含已裁决待批量关闭的历史单）。
export const isRmaOpen = (record: Pick<RmaRecord, "arrivalStatus">) => record.arrivalStatus !== "closed";

// 待处理单（工作台「待处理 RMA」计数与 RMA 页预设筛选同口径）：未关闭且裁决未落——
// 对应 lifecycle=rma 设备的那批单；已裁决但尚未批量关闭的历史单不计入。
export const isRmaPending = (record: Pick<RmaRecord, "arrivalStatus" | "decisionMethod">) =>
  record.arrivalStatus !== "closed" && record.decisionMethod === "pending_decision";

// 批量关闭条件（页面卡）：裁决已落且单据未关闭；设备已离开退货 RMA 流程（入库 / 报废 / 已转测试不合格，含流程走完后再出货）。
export function canCloseRmaRecord(record: RmaRecord, device: Device | undefined): boolean {
  if (record.arrivalStatus === "closed") return false;
  if (record.decisionMethod === "pending_decision") return false;
  if (!device) return false;
  return device.lifecycle !== "rma";
}

// 6 台设备（4 台进行中 + 1 台二次入库历史 + 1 台报废历史），覆盖 5 个到件状态与全部检测结论。
const rmaSeedPlan: Array<{
  deviceIndex: number;
  id: string;
  createdAt: string;
  reasonCode: RmaReasonCode;
  source: RmaSource;
  description: string | null;
  expectedArrivalDate: string | null;
  arrivalStatus: RmaArrivalStatus;
  arrivedAt: string | null;
  conclusion: RmaConclusion;
  appearanceScore: RmaAppearanceScore | null;
  functionChecks: string[];
  inspectNote: string | null;
  inspector: string | null;
  inspectedAt: string | null;
  decisionMethod: RmaDecisionMethod;
  decisionNote: string | null;
  expectedRepairDate: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}> = [
  {
    deviceIndex: 6,
    id: "RMA-20260926-000001",
    createdAt: "2026-09-26 09:40",
    reasonCode: "function_issue",
    source: "ecommerce",
    description: "开机后无法进入系统，通电无任何声音",
    expectedArrivalDate: "2026-10-03",
    arrivalStatus: "pending",
    arrivedAt: null,
    conclusion: "pending_check",
    appearanceScore: null,
    functionChecks: [],
    inspectNote: null,
    inspector: null,
    inspectedAt: null,
    decisionMethod: "pending_decision",
    decisionNote: null,
    expectedRepairDate: null,
    decidedBy: null,
    decidedAt: null
  },
  {
    deviceIndex: 19,
    id: "RMA-20260925-000002",
    createdAt: "2026-09-25 14:15",
    reasonCode: "appearance_damage",
    source: "offline_store",
    description: "外壳划伤变形，用户当场验机拒收",
    expectedArrivalDate: "2026-09-27",
    arrivalStatus: "arrived_pending_check",
    arrivedAt: "2026-09-27 10:12",
    conclusion: "pending_check",
    appearanceScore: null,
    functionChecks: [],
    inspectNote: null,
    inspector: null,
    inspectedAt: null,
    decisionMethod: "pending_decision",
    decisionNote: null,
    expectedRepairDate: null,
    decidedBy: null,
    decidedAt: null
  },
  {
    deviceIndex: 32,
    id: "RMA-20260924-000003",
    createdAt: "2026-09-24 16:05",
    reasonCode: "logistics_damage",
    source: "internal_transfer",
    description: "运输磕碰，开机后盘面异响",
    expectedArrivalDate: "2026-09-26",
    arrivalStatus: "inspecting",
    arrivedAt: "2026-09-26 11:30",
    conclusion: "pending_check",
    appearanceScore: null,
    functionChecks: [],
    inspectNote: null,
    inspector: "质检 · 苏禾",
    inspectedAt: null,
    decisionMethod: "pending_decision",
    decisionNote: null,
    expectedRepairDate: null,
    decidedBy: null,
    decidedAt: null
  },
  {
    deviceIndex: 47,
    id: "RMA-20260922-000004",
    createdAt: "2026-09-22 09:10",
    reasonCode: "function_issue",
    source: "ecommerce",
    description: "频繁掉盘，重启后短暂恢复",
    expectedArrivalDate: "2026-09-23",
    arrivalStatus: "inspected",
    arrivedAt: "2026-09-23 14:00",
    conclusion: "repair",
    appearanceScore: "B",
    functionChecks: ["开机自检", "磁盘读写", "网络联通", "风扇转速"],
    inspectNote: "磁盘 SMART 读数异常，主板可修复",
    inspector: "质检 · 韩默",
    inspectedAt: "2026-09-26 15:40",
    decisionMethod: "pending_decision",
    decisionNote: null,
    expectedRepairDate: null,
    decidedBy: null,
    decidedAt: null
  },
  {
    deviceIndex: 7,
    id: "RMA-20260904-000005",
    createdAt: "2026-09-04 10:20",
    reasonCode: "customer_rejection",
    source: "ecommerce",
    description: "客户未开箱拒收，原包装退回",
    expectedArrivalDate: "2026-09-05",
    arrivalStatus: "inspected",
    arrivedAt: "2026-09-05 09:00",
    conclusion: "restock",
    appearanceScore: "A",
    functionChecks: ["开机自检", "磁盘读写", "网络联通", "风扇转速", "噪声温度", "外设接口"],
    inspectNote: "外观与功能完好，符合二次入库条件",
    inspector: "质检 · 苏禾",
    inspectedAt: "2026-09-06 10:25",
    decisionMethod: "restock",
    decisionNote: "更换主板后二次入库",
    expectedRepairDate: null,
    decidedBy: "生产管理 · 季同",
    decidedAt: "2026-09-10 09:30"
  },
  {
    deviceIndex: 11,
    id: "RMA-20260902-000006",
    createdAt: "2026-09-02 15:40",
    reasonCode: "function_issue",
    source: "offline_store",
    description: "门店展示机通电冒烟",
    expectedArrivalDate: "2026-09-03",
    arrivalStatus: "inspected",
    arrivedAt: "2026-09-03 09:12",
    conclusion: "scrap",
    appearanceScore: "D",
    functionChecks: ["开机自检"],
    inspectNote: "主板烧毁不可修复",
    inspector: "质检 · 韩默",
    inspectedAt: "2026-09-05 11:08",
    decisionMethod: "scrap",
    decisionNote: "经检测不可修复，按流程报废",
    expectedRepairDate: null,
    decidedBy: "生产管理 · 季同",
    decidedAt: "2026-09-08 10:00"
  }
];

export const seedRmaRecords: RmaRecord[] = rmaSeedPlan.map((plan) => {
  const device = seedDevices[plan.deviceIndex];
  const { deviceIndex: _deviceIndex, ...rest } = plan;
  return { ...rest, sn: device.sn, model: device.model, initiator: "客服 · 许知遥", attachments: [], inspectAttachments: [], closedAt: null };
});

export function rmaRecordBySn(sn: string, records: RmaRecord[] = seedRmaRecords): RmaRecord | undefined {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((record) => record.sn === sn);
}

// —— 固件版本与推送任务 ——
export type FirmwareStatus = "draft" | "testing" | "canary" | "released" | "rolled_back" | "deprecated";
export const firmwareStatusMeta: Record<FirmwareStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  testing: { label: "测试中", color: "processing" },
  canary: { label: "灰度中", color: "purple" },
  released: { label: "已全量", color: "success" },
  rolled_back: { label: "已回滚", color: "error" },
  deprecated: { label: "已停用", color: "default" }
};

export type FirmwareSignStatus = "unsigned" | "signing" | "signed" | "sign_failed";
export const firmwareSignStatusMeta: Record<FirmwareSignStatus, { label: string; color: string }> = {
  unsigned: { label: "未签名", color: "default" },
  signing: { label: "签名中", color: "processing" },
  signed: { label: "签名成功", color: "success" },
  sign_failed: { label: "签名失败", color: "error" }
};

export type FirmwareSignMethod = "kms" | "manual";
export type FirmwarePackage = { fileName: string; sizeBytes: number; md5: string };
export type FirmwareEvent = { at: string; operator: string; text: string };
export type FirmwareVersion = {
  id: string;
  version: string;
  models: string[];
  note: string | null;
  status: FirmwareStatus;
  signStatus: FirmwareSignStatus;
  signMethod: FirmwareSignMethod;
  ratio: number | null;
  boundDeviceCount: number;
  publisher: string | null;
  releasedAt: string | null;
  changelog: string;
  issueId: string | null;
  package: FirmwarePackage | null;
  // 手动签名时的签名文件元数据（2026-09-29 集成补齐）；KMS 自动签名恒为 null。
  signFile: { fileName: string; sizeBytes: number } | null;
  createdAt: string;
  events: FirmwareEvent[];
};

const fwPublisher = "固件发布 · 沈亦舟";
const boundCountByFirmware = (version: string) => seedDevices.filter((device) => device.firmware === version && device.shippedAt).length;

export const seedFirmwareVersions: FirmwareVersion[] = [
  {
    id: "v2.4.2-beta.1",
    version: "v2.4.2-beta.1",
    models: ["TS-N4 Pro"],
    note: "夜间稳定性修复候选版",
    status: "draft",
    signStatus: "unsigned",
    signMethod: "kms",
    ratio: null,
    boundDeviceCount: 0,
    publisher: fwPublisher,
    releasedAt: null,
    changelog: "修复长时运行偶发重启问题；优化磁盘休眠策略。",
    issueId: "ISSUE-1042",
    package: null,
    signFile: null,
    createdAt: "2026-09-28 11:20",
    events: [{ at: "2026-09-28 11:20", operator: fwPublisher, text: `创建草稿 ${fwPublisher}` }]
  },
  {
    id: "v2.4.1",
    version: "v2.4.1",
    models: ["TS-N2", "TS-N4 Pro"],
    note: null,
    status: "testing",
    signStatus: "signed",
    signMethod: "kms",
    ratio: null,
    boundDeviceCount: 0,
    publisher: fwPublisher,
    releasedAt: "2026-09-26 10:20",
    changelog: "提升照片索引速度；修复 SMB 大目录枚举卡顿。",
    issueId: "TASK-887",
    package: { fileName: "tianshu-firmware-v2.4.1.bin", sizeBytes: 222298112, md5: "8f1b2c3d4e5f6a7b9c0d1e2f3a4b5c6d" },
    signFile: null,
    createdAt: "2026-09-25 16:30",
    events: [
      { at: "2026-09-25 16:30", operator: fwPublisher, text: "创建版本草稿" },
      { at: "2026-09-26 10:20", operator: fwPublisher, text: "提交测试，KMS 自动签名成功" }
    ]
  },
  {
    id: "v2.4.0",
    version: "v2.4.0",
    models: ["TS-N2", "TS-N4 Pro"],
    note: null,
    status: "canary",
    signStatus: "signed",
    signMethod: "kms",
    ratio: 20,
    boundDeviceCount: boundCountByFirmware("v2.4.0"),
    publisher: fwPublisher,
    releasedAt: "2026-09-18 09:00",
    changelog: "新增多用户时间轴相册；升级内核到 6.6 LTS。",
    issueId: "ISSUE-996",
    package: { fileName: "tianshu-firmware-v2.4.0.bin", sizeBytes: 218103808, md5: "1a2b3c4d5e6f708192a3b4c5d6e7f809" },
    signFile: null,
    createdAt: "2026-09-15 14:00",
    events: [
      { at: "2026-09-15 14:00", operator: fwPublisher, text: "创建版本草稿" },
      { at: "2026-09-15 16:40", operator: fwPublisher, text: "提交测试" },
      { at: "2026-09-18 09:00", operator: fwPublisher, text: "签名成功并发布" },
      { at: "2026-09-15 14:20", operator: fwPublisher, text: "创建推送任务 PT-20260915-01，灰度 10%" },
      { at: "2026-09-27 09:30", operator: fwPublisher, text: "创建推送任务 PT-20260927-01，灰度 20%" }
    ]
  },
  {
    id: "v2.4.0-rc.1",
    version: "v2.4.0-rc.1",
    models: ["TS-N2", "TS-N4 Pro"],
    note: "发布候选，因灰度熔断回滚",
    status: "rolled_back",
    signStatus: "signed",
    signMethod: "kms",
    ratio: null,
    boundDeviceCount: 0,
    publisher: fwPublisher,
    releasedAt: "2026-09-10 10:30",
    changelog: "候选版：新增多用户时间轴相册。",
    issueId: "ISSUE-980",
    package: { fileName: "tianshu-firmware-v2.4.0-rc.1.bin", sizeBytes: 217579520, md5: "90a1b2c3d4e5f60718293a4b5c6d7e8f" },
    signFile: null,
    createdAt: "2026-09-08 14:20",
    events: [
      { at: "2026-09-08 14:20", operator: fwPublisher, text: "创建版本草稿" },
      { at: "2026-09-09 09:10", operator: fwPublisher, text: "提交测试" },
      { at: "2026-09-10 10:30", operator: fwPublisher, text: "签名成功并发布" },
      { at: "2026-09-10 13:05", operator: "系统自动", text: "推送任务 PT-20260910-01 失败率超过熔断阈值，任务熔断" },
      { at: "2026-09-10 17:40", operator: fwPublisher, text: "执行回滚至 v2.3.1，版本标记为已回滚" }
    ]
  },
  {
    id: "v2.3.1",
    version: "v2.3.1",
    models: ["TS-N2", "TS-N4 Pro"],
    note: null,
    status: "released",
    signStatus: "signed",
    signMethod: "kms",
    ratio: null,
    boundDeviceCount: boundCountByFirmware("v2.3.1"),
    publisher: fwPublisher,
    releasedAt: "2026-08-20 09:00",
    changelog: "视频转码性能优化；修复资源回收偶发高 CPU。",
    issueId: "TASK-812",
    package: { fileName: "tianshu-firmware-v2.3.1.bin", sizeBytes: 201326592, md5: "3c4d5e6f70819203a4b5c6d7e8f90a1b" },
    signFile: null,
    createdAt: "2026-08-10 11:00",
    events: [
      { at: "2026-08-10 11:00", operator: fwPublisher, text: "创建版本草稿" },
      { at: "2026-08-20 09:00", operator: fwPublisher, text: "签名成功并发布" },
      { at: "2026-08-18 10:00", operator: fwPublisher, text: "全量推送任务 PT-20260818-01 / PT-20260825-01 完成" }
    ]
  },
  {
    id: "v2.2.8",
    version: "v2.2.8",
    models: ["TS-N2", "TS-N4 Pro"],
    note: null,
    status: "deprecated",
    signStatus: "signed",
    signMethod: "kms",
    ratio: null,
    boundDeviceCount: boundCountByFirmware("v2.2.8"),
    publisher: fwPublisher,
    releasedAt: "2026-06-12 09:00",
    changelog: "安全补丁合集。",
    issueId: null,
    package: { fileName: "tianshu-firmware-v2.2.8.bin", sizeBytes: 189792256, md5: "5e6f70819203a4b5c6d7e8f90a1b2c3d" },
    signFile: null,
    createdAt: "2026-06-01 09:30",
    events: [
      { at: "2026-06-12 09:00", operator: fwPublisher, text: "签名成功并发布" },
      { at: "2026-09-20 10:00", operator: fwPublisher, text: "停用：不再向设备推送更新" }
    ]
  }
];

export type PushTaskStatus = "pending_exec" | "running" | "paused" | "fused" | "completed" | "cancelled";
export const pushTaskStatusMeta: Record<PushTaskStatus, { label: string; color: string }> = {
  pending_exec: { label: "待执行", color: "default" },
  running: { label: "执行中", color: "processing" },
  paused: { label: "已暂停", color: "warning" },
  fused: { label: "已熔断", color: "error" },
  completed: { label: "已完成", color: "success" },
  cancelled: { label: "已取消", color: "default" }
};

export type PushTargeting = { batches: string[]; provinces: string[]; fromVersions: string[]; snFileName: string | null; snList: string[] };
export type PushTaskSummary = { success: number; failed: number; total: number };
export type PushEvent = { at: string; operator: string; text: string };
export type PushTask = {
  id: string;
  name: string;
  versionId: string;
  model: string;
  targeting: PushTargeting;
  ratio: number;
  windowStart: string | null;
  windowEnd: string | null;
  circuitThreshold: number;
  status: PushTaskStatus;
  creator: string;
  createdAt: string;
  summary: PushTaskSummary;
  failureRate: number;
  events: PushEvent[];
};

export type PushResultStatus = "pending_dispatch" | "downloading" | "installing" | "success" | "failed" | "timeout";
export const pushResultMeta: Record<PushResultStatus, { label: string; color: string }> = {
  pending_dispatch: { label: "待下发", color: "default" },
  downloading: { label: "下载中", color: "processing" },
  installing: { label: "安装中", color: "processing" },
  success: { label: "成功", color: "success" },
  failed: { label: "失败", color: "error" },
  timeout: { label: "超时", color: "warning" }
};
export const PUSH_OFFLINE_NOTE = "设备当前离线，将在下次上线时自动执行";
export type PushDeviceResult = {
  taskId: string;
  sn: string;
  fromVersion: string;
  toVersion: string;
  result: PushResultStatus;
  failCode: string | null;
  updatedAt: string;
  offlineNote: string | null;
};

// 定向条件命中设备的确定性估计：机型 + 批次 + 起始固件版本，需同时满足（与新建任务预估同一口径）。
export function pushTargetDevices(input: { model: string; batches: string[]; fromVersions: string[] }): Device[] {
  return seedDevices.filter((device) =>
    device.model === input.model &&
    (input.batches.length === 0 || input.batches.includes(device.batch)) &&
    (input.fromVersions.length === 0 || (device.firmware !== null && input.fromVersions.includes(device.firmware))) &&
    device.lifecycle === "shipped"
  );
}

const resultAt = (date: string, index: number) => `${date} ${pad(9 + (index % 8))}:${pad((index * 13) % 60)}:${pad((index * 7) % 60)}`;

function buildPushResults(
  task: Pick<PushTask, "id" | "versionId"> & { model: string; batches: string[]; fromVersions: string[] },
  decide: (sn: string, position: number, device: Device) => Pick<PushDeviceResult, "result" | "failCode" | "offlineNote">,
  updatedDate: string
): PushDeviceResult[] {
  return pushTargetDevices(task).map((device, position) => {
    const base = decide(device.sn, position, device);
    return {
      taskId: task.id,
      sn: device.sn,
      fromVersion: device.firmware ?? "v2.3.1",
      toVersion: task.versionId,
      result: base.result,
      failCode: base.result === "failed" || base.result === "timeout" ? base.failCode : null,
      offlineNote: base.result === "pending_dispatch" ? PUSH_OFFLINE_NOTE : null,
      updatedAt: resultAt(updatedDate, position)
    };
  });
}

type SeedTaskBase = Omit<PushTask, "summary" | "failureRate"> & { target: { batches: string[]; fromVersions: string[] } };

const pushTaskSeeds: Array<{ base: SeedTaskBase; results: PushDeviceResult[] }> = (() => {
  const mkTarget = (batches: string[], fromVersions: string[]): PushTargeting => ({
    batches,
    provinces: [],
    fromVersions,
    snFileName: null,
    snList: []
  });
  const base = (fields: Omit<SeedTaskBase, "target" | "targeting"> & { targeting: PushTargeting | { batches: string[]; fromVersions: string[] } }): SeedTaskBase => ({
    ...fields,
    targeting:
      "snList" in fields.targeting
        ? (fields.targeting as PushTargeting)
        : mkTarget((fields.targeting as { batches: string[] }).batches, (fields.targeting as { fromVersions: string[] }).fromVersions),
    target:
      "snList" in fields.targeting
        ? { batches: (fields.targeting as PushTargeting).batches, fromVersions: (fields.targeting as PushTargeting).fromVersions }
        : (fields.targeting as { batches: string[]; fromVersions: string[] })
  });

  const gray20 = base({
    id: "PT-20260927-01",
    name: "v2.4.0 灰度 20%",
    versionId: "v2.4.0",
    model: "TS-N2",
    targeting: { batches: ["B2407", "B2408", "B2409"], fromVersions: ["v2.3.1"] },
    ratio: 20,
    windowStart: null,
    windowEnd: null,
    circuitThreshold: 10,
    status: "running",
    creator: fwPublisher,
    createdAt: "2026-09-27 09:30",
    events: [
      { at: "2026-09-27 09:30", operator: fwPublisher, text: "创建并启动推送任务" },
      { at: "2026-09-27 16:30", operator: "系统自动", text: "失败率超过告警阈值 5%，触发告警 AL-0927-004" }
    ]
  });
  let gray20Online = 0;
  const gray20Results = buildPushResults(
    { id: gray20.id, versionId: gray20.versionId, model: gray20.model, ...gray20.target },
    (sn) => {
      const device = seedDevices.find((item) => item.sn === sn);
      if (device?.online !== "online") return { result: "pending_dispatch", failCode: null, offlineNote: PUSH_OFFLINE_NOTE };
      gray20Online += 1;
      // 1/12 失败，失败率 8.3%：触发告警（阈值 5%）但未达熔断阈值 10%，任务仍在执行中。
      if (gray20Online === 1) return { result: "failed", failCode: "FW-E315", offlineNote: null };
      if (gray20Online === 4) return { result: "installing", failCode: null, offlineNote: null };
      if (gray20Online === 5) return { result: "downloading", failCode: null, offlineNote: null };
      return { result: "success", failCode: null, offlineNote: null };
    },
    "2026-09-27"
  );

  const gray10New = base({
    id: "PT-20260928-01",
    name: "v2.4.1 灰度 10%",
    versionId: "v2.4.1",
    model: "TS-N2",
    targeting: { batches: ["B2407"], fromVersions: ["v2.3.1", "v2.2.8"] },
    ratio: 10,
    windowStart: null,
    windowEnd: null,
    circuitThreshold: 10,
    status: "pending_exec",
    creator: fwPublisher,
    createdAt: "2026-09-28 09:40",
    events: [{ at: "2026-09-28 09:40", operator: fwPublisher, text: "创建推送任务，等待进入执行时间窗" }]
  });

  const gray10Paused = base({
    id: "PT-20260915-01",
    name: "v2.4.0 灰度 10%",
    versionId: "v2.4.0",
    model: "TS-N2",
    targeting: { batches: ["B2407"], fromVersions: ["v2.3.1"] },
    ratio: 10,
    windowStart: null,
    windowEnd: null,
    circuitThreshold: 10,
    status: "paused",
    creator: fwPublisher,
    createdAt: "2026-09-15 14:20",
    events: [
      { at: "2026-09-15 14:20", operator: fwPublisher, text: "创建并启动推送任务" },
      { at: "2026-09-18 11:04", operator: "运维 · 周启明", text: "暂停：配合 B2407 网络割接评估" }
    ]
  });
  const gray10PausedResults = buildPushResults(
    { id: gray10Paused.id, versionId: gray10Paused.versionId, model: gray10Paused.model, ...gray10Paused.target },
    (sn) => {
      const device = seedDevices.find((item) => item.sn === sn);
      if (device?.online !== "online") return { result: "pending_dispatch", failCode: null, offlineNote: PUSH_OFFLINE_NOTE };
      return { result: "success", failCode: null, offlineNote: null };
    },
    "2026-09-16"
  );

  const rcGray = base({
    id: "PT-20260910-01",
    name: "v2.4.0-rc.1 灰度 10%",
    versionId: "v2.4.0-rc.1",
    model: "TS-N4 Pro",
    targeting: { batches: ["B2408"], fromVersions: ["v2.3.1", "v2.2.8"] },
    ratio: 10,
    windowStart: null,
    windowEnd: null,
    circuitThreshold: 10,
    status: "fused",
    creator: fwPublisher,
    createdAt: "2026-09-10 10:35",
    events: [
      { at: "2026-09-10 10:35", operator: fwPublisher, text: "创建并启动推送任务" },
      { at: "2026-09-10 13:05", operator: "系统自动", text: "失败率超过熔断阈值 10%，任务熔断，已下发设备自动回滚" }
    ]
  });
  const rcGrayResults = buildPushResults(
    { id: rcGray.id, versionId: rcGray.versionId, model: rcGray.model, ...rcGray.target },
    (sn) => {
      const device = seedDevices.find((item) => item.sn === sn);
      if (device?.online !== "online") return { result: "pending_dispatch", failCode: null, offlineNote: PUSH_OFFLINE_NOTE };
      const position = device ? Number(device.sn.slice(-2)) % 3 : 0;
      if (position === 0) return { result: "failed", failCode: "FW-E210", offlineNote: null };
      if (position === 1) return { result: "failed", failCode: "FW-E402", offlineNote: null };
      return { result: "success", failCode: null, offlineNote: null };
    },
    "2026-09-10"
  );

  const rcExpand = base({
    id: "PT-20260910-02",
    name: "v2.4.0-rc.1 灰度扩大",
    versionId: "v2.4.0-rc.1",
    model: "TS-N4 Pro",
    targeting: { batches: ["B2409"], fromVersions: ["v2.3.1"] },
    ratio: 30,
    windowStart: null,
    windowEnd: null,
    circuitThreshold: 10,
    status: "cancelled",
    creator: fwPublisher,
    createdAt: "2026-09-10 15:20",
    events: [{ at: "2026-09-10 15:20", operator: fwPublisher, text: "创建推送任务" },
      { at: "2026-09-10 17:40", operator: fwPublisher, text: "取消：rc.1 首轮已熔断，改为直接回滚至 v2.3.1" }]
  });
  const rcExpandResults = buildPushResults(
    { id: rcExpand.id, versionId: rcExpand.versionId, model: rcExpand.model, ...rcExpand.target },
    () => ({ result: "pending_dispatch", failCode: null, offlineNote: PUSH_OFFLINE_NOTE }),
    "2026-09-10"
  );

  const fullN2 = base({
    id: "PT-20260818-01",
    name: "v2.3.1 全量推送 · TS-N2",
    versionId: "v2.3.1",
    model: "TS-N2",
    targeting: { batches: ["B2407", "B2408", "B2409", "B2410"], fromVersions: ["v2.2.8"] },
    ratio: 100,
    windowStart: null,
    windowEnd: null,
    circuitThreshold: 10,
    status: "completed",
    creator: fwPublisher,
    createdAt: "2026-08-18 10:00",
    events: [
      { at: "2026-08-18 10:00", operator: fwPublisher, text: "创建并启动推送任务" },
      { at: "2026-08-21 09:12", operator: "系统自动", text: "全部目标设备升级完成，任务结束" }
    ]
  });
  const fullN2Results = buildPushResults(
    { id: fullN2.id, versionId: fullN2.versionId, model: fullN2.model, ...fullN2.target },
    () => ({ result: "success", failCode: null, offlineNote: null }),
    "2026-08-20"
  );

  const fullN4 = base({
    id: "PT-20260825-01",
    name: "v2.3.1 全量推送 · TS-N4 Pro",
    versionId: "v2.3.1",
    model: "TS-N4 Pro",
    targeting: { batches: ["B2407", "B2408", "B2409", "B2410"], fromVersions: ["v2.2.8"] },
    ratio: 100,
    windowStart: null,
    windowEnd: null,
    circuitThreshold: 10,
    status: "completed",
    creator: fwPublisher,
    createdAt: "2026-08-25 10:00",
    events: [
      { at: "2026-08-25 10:00", operator: fwPublisher, text: "创建并启动推送任务" },
      { at: "2026-08-28 08:45", operator: "系统自动", text: "全部目标设备升级完成，任务结束" }
    ]
  });
  const fullN4Results = buildPushResults(
    { id: fullN4.id, versionId: fullN4.versionId, model: fullN4.model, ...fullN4.target },
    () => ({ result: "success", failCode: null, offlineNote: null }),
    "2026-08-27"
  );

  return [
    { base: gray20, results: gray20Results },
    { base: gray10New, results: [] },
    { base: gray10Paused, results: gray10PausedResults },
    { base: rcGray, results: rcGrayResults },
    { base: rcExpand, results: rcExpandResults },
    { base: fullN2, results: fullN2Results },
    { base: fullN4, results: fullN4Results }
  ];
})();

export const seedPushTasks: PushTask[] = pushTaskSeeds.map(({ base, results }) => {
  const { target: _target, ...task } = base;
  const success = results.filter((item) => item.result === "success").length;
  const failed = results.filter((item) => item.result === "failed" || item.result === "timeout").length;
  const total = results.length;
  return {
    ...task,
    summary: total > 0 ? { success, failed, total } : { success: 0, failed: 0, total: pushTargetDevices({ model: task.model, batches: task.targeting.batches, fromVersions: task.targeting.fromVersions }).length },
    failureRate: total > 0 ? Math.round((failed / total) * 1000) / 10 : 0
  };
});

export const seedPushResults: PushDeviceResult[] = pushTaskSeeds.flatMap(({ results }) => results);

// ---------- 2026-09-29 扩页批 2 页面卡：共享层新实体 ----------
// 烧录发证 / 客户反馈 / 告警规则 / 用户与绑定。全部按下标确定性生成；SLA 与工单号都以 NOW_LABEL 为固定基准，截图可复现。

// —— App 用户与绑定关系（页 11）——
export type AccountStatus = "active" | "deactivated" | "banned";
export const accountStatusMeta: Record<AccountStatus, { label: string; color: string }> = {
  active: { label: "正常", color: "success" },
  deactivated: { label: "已注销", color: "default" },
  banned: { label: "已封禁", color: "error" }
};
export type AppUser = {
  userId: string;
  phone: string;
  registeredAt: string;
  appVersion: string;
  lastActiveAt: string;
  accountStatus: AccountStatus;
};
export type BindingRole = "owner" | "member";
export const bindingRoleMeta: Record<BindingRole, { label: string }> = {
  owner: { label: "管理员" },
  member: { label: "成员" }
};
export type Binding = { userId: string; sn: string; role: BindingRole; boundAt: string };
// 敏感查看审计：每次「查看完整」确认后写入（用户与绑定页读明文前必须落审计）。
export type SensitiveViewAudit = { at: string; actor: string; targetUserId: string; field: string; reason: string };

// 手机号存完整值，渲染层按权限脱敏为 1xx****xxxx（PRD 三页口径，不带空格）。
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
}

// 用户 ID 种子格式「U + 6 位数字」（页 11 裁决 5）。
function buildBindingLayer(): { users: AppUser[]; bindings: Binding[] } {
  const users: AppUser[] = [];
  const bindings: Binding[] = [];
  seedDevices.forEach((device, index) => {
    if (!device.activatedAt) return;
    const phone = `13${(3 + index) % 10}${String(1000 + ((index * 389) % 9000)).slice(0, 4)}${String(1000 + ((index * 613) % 9000)).slice(0, 4)}`;
    const accountStatus: AccountStatus = index === 8 ? "deactivated" : index === 24 ? "banned" : "active";
    const lastActiveAt =
      index === 13 ? "2026-08-10" : index === 8 ? "2026-09-02" : index === 24 ? "2026-09-11" : `2026-09-${pad(27 - (index % 6))}`;
    const owner: AppUser = {
      userId: `U${100001 + index}`,
      phone,
      registeredAt: `2025-${pad(3 + (index % 6))}-${pad(3 + ((index * 5) % 25))}`,
      appVersion: `3.${1 + (index % 2)}.${(index * 3) % 7}`,
      lastActiveAt,
      accountStatus
    };
    users.push(owner);
    bindings.push({ userId: owner.userId, sn: device.sn, role: "owner", boundAt: `${device.activatedAt} 08:5${index % 10}` });
    for (let k = 0; k < index % 4; k += 1) {
      const memberIndex = index * 4 + k;
      const member: AppUser = {
        userId: `U${200000 + memberIndex + 1}`,
        phone: `15${(1 + memberIndex) % 10}0000${String(1000 + ((memberIndex * 397) % 9000)).slice(0, 4)}`,
        registeredAt: `2025-${pad(2 + (memberIndex % 8))}-${pad(4 + ((memberIndex * 3) % 24))}`,
        appVersion: `3.${(memberIndex % 2) + 0}.${(memberIndex * 5) % 7}`,
        lastActiveAt: `2026-09-${pad(26 - (memberIndex % 8))}`,
        accountStatus: "active"
      };
      users.push(member);
      bindings.push({ userId: member.userId, sn: device.sn, role: "member", boundAt: `${device.activatedAt} 19:${pad(11 + k * 7)}` });
    }
  });

  // 为典型用户 U100014 补充绑定多台设备（管理员+成员，不同机型与在网状态，满足 PRD 多样化呈现需求）
  const u14 = users.find((u) => u.userId === "U100014");
  if (u14) {
    u14.lastActiveAt = "2026-09-28"; // 正常活跃
    if (!bindings.some((b) => b.userId === "U100014" && b.sn === "TS24070115")) {
      bindings.push({ userId: "U100014", sn: "TS24070115", role: "owner", boundAt: "2025-07-20 14:15" });
    }
    if (!bindings.some((b) => b.userId === "U100014" && b.sn === "TS24070136")) {
      bindings.push({ userId: "U100014", sn: "TS24070136", role: "member", boundAt: "2025-08-05 20:08" });
    }
  }

  return { users, bindings };
}

const seedBindingLayer = buildBindingLayer();
export const seedAppUsers: AppUser[] = seedBindingLayer.users;
export const seedBindings: Binding[] = seedBindingLayer.bindings;
const seedUsersById = new Map(seedAppUsers.map((user) => [user.userId, user]));

// 页 11「Device 派生口径收敛」：boundUsers / adminPhone / bindPhones 全部从 Binding + AppUser 派生，
// 与用户与绑定页同源；手机号按现有脱敏口径渲染。owner 绑定对应用户的手机号即设备管理员。
{
  const bindingsBySn = new Map<string, Binding[]>();
  for (const binding of seedBindings) {
    const list = bindingsBySn.get(binding.sn) ?? [];
    list.push(binding);
    bindingsBySn.set(binding.sn, list);
  }
  for (const device of seedDevices) {
    const list = bindingsBySn.get(device.sn) ?? [];
    const ownerBinding = list.find((binding) => binding.role === "owner");
    const owner = ownerBinding ? seedUsersById.get(ownerBinding.userId) : undefined;
    device.boundUsers = list.length;
    device.adminPhone = owner ? maskPhone(owner.phone) : null;
    device.bindPhones = list.map((binding) => maskPhone(seedUsersById.get(binding.userId)!.phone));
  }
}

// —— 客户反馈工单（页 9）——
export type FeedbackType = "fault" | "suggestion" | "consult" | "complaint";
export const feedbackTypeMeta: Record<FeedbackType, { label: string; color: string }> = {
  fault: { label: "故障", color: "default" },
  suggestion: { label: "建议", color: "default" },
  consult: { label: "咨询", color: "default" },
  complaint: { label: "投诉", color: "default" }
};
export type FeedbackSource = "app" | "agent";
export const feedbackSourceMeta: Record<FeedbackSource, { label: string }> = {
  app: { label: "App 提交" },
  agent: { label: "客服代录" }
};
export type FeedbackPriority = "P1" | "P2" | "P3";
// SLA 目标（PRD 假设值）：P1 4h / P2 24h / P3 72h。
export const slaTargetHourByPriority: Record<FeedbackPriority, number> = { P1: 4, P2: 24, P3: 72 };
export type FeedbackStatus = "pending" | "processing" | "awaiting_user" | "resolved" | "closed" | "rejected";
export const feedbackStatusMeta: Record<FeedbackStatus, { label: string; color: string }> = {
  pending: { label: "待受理", color: "processing" },
  processing: { label: "处理中", color: "processing" },
  awaiting_user: { label: "待用户确认", color: "warning" },
  resolved: { label: "已解决", color: "success" },
  closed: { label: "已关闭", color: "default" },
  rejected: { label: "已驳回", color: "default" }
};
// 工单号统一为 PRD 口径：FB + 14 位时间戳 + 3 位序号。
export const FEEDBACK_ID_PATTERN = /^FB\d{17}$/;
// 终态不可再变更（已关闭 / 已驳回），其余算「未关闭」。
export const isFeedbackOpen = (ticket: Pick<FeedbackTicket, "status">) => ticket.status !== "closed" && ticket.status !== "rejected";
// SLA 计时对 settled 工单停在办结时刻；待受理 / 处理中 / 待用户确认按 NOW_LABEL 计时。
export type SlaState = "normal" | "near" | "overdue";
export type FeedbackReply = { from: "staff" | "user"; content: string; at: string; pushStatus: "pushed" | "not_required" | null };
export type FeedbackFlowEntry = { at: string; operator: string; from: FeedbackStatus | null; to: FeedbackStatus; note?: string };
export type FeedbackTicket = {
  id: string;
  type: FeedbackType;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  source: FeedbackSource;
  userId: string | null;
  sn: string | null;
  appVersion: string | null;
  firmware: string | null;
  contact: string | null;
  content: string;
  attachments: RmaAttachment[];
  assignee: string | null;
  slaTargetHours: number;
  slaDeadlineAt: string;
  submittedAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  // 已解决 / 已关闭 / 已驳回工单的办结时刻；SLA 停表用。
  resolvedAt: string | null;
  replies: FeedbackReply[];
  flow: FeedbackFlowEntry[];
  rejectReason: string | null;
  rmaId: string | null;
  relatedAlertId: string | null;
};

export function toLinearMinutes(label: string): number {
  const [datePart, timePart] = label.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000) * 1440 + Number(timePart.slice(0, 2)) * 60 + Number(timePart.slice(3, 5));
}
export function linearLabel(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / 1440);
  const rest = totalMinutes - days * 1440;
  const date = new Date(days * 86400000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(Math.floor(rest / 60))}:${pad(rest % 60)}`;
}
export function addHoursLabel(label: string, hours: number): string {
  return linearLabel(toLinearMinutes(label) + hours * 60);
}
const NOW_MINUTES = toLinearMinutes(NOW_LABEL);

export const slaClockMinutesOf = (ticket: Pick<FeedbackTicket, "resolvedAt">) =>
  ticket.resolvedAt ? toLinearMinutes(ticket.resolvedAt) : NOW_MINUTES;
export function slaStateOf(ticket: Pick<FeedbackTicket, "resolvedAt" | "slaDeadlineAt" | "slaTargetHours">): SlaState {
  const remaining = toLinearMinutes(ticket.slaDeadlineAt) - slaClockMinutesOf(ticket);
  if (remaining < 0) return "overdue";
  return remaining * 4 < ticket.slaTargetHours * 60 ? "near" : "normal";
}
export function slaRemainingLabel(ticket: Pick<FeedbackTicket, "resolvedAt" | "slaDeadlineAt" | "slaTargetHours">): string {
  const delta = toLinearMinutes(ticket.slaDeadlineAt) - slaClockMinutesOf(ticket);
  if (delta < 0) {
    const hours = Math.floor(-delta / 60);
    return hours >= 1 ? `已超时 ${hours}h` : `已超时 ${-delta} 分钟`;
  }
  const hours = Math.floor(delta / 60);
  const minutes = delta % 60;
  if (hours >= 1) return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
  return `${minutes} 分钟`;
}

const staffReply = (content: string, at: string): FeedbackReply => ({ from: "staff", content, at, pushStatus: "pushed" });
const staffFlow = (at: string, from: FeedbackStatus, to: FeedbackStatus, note?: string): FeedbackFlowEntry => ({ at, operator: "客服 · 许知遥", from, to, note });
const contactOf = (userId: string) => seedUsersById.get(userId)?.phone ?? null;

// 种子工单：覆盖全部 6 个状态、SLA 三态（正常 / 即将超时 / 已超时）、app 与客服代录两种来源；
// FB20260926143012008 关联 AL-0926-007；T5/T6/T10 的 rmaId 与批 1 RMA 单一一对应（转退货 RMA 回写口径）。
export const seedFeedbackTickets: FeedbackTicket[] = [
  {
    id: "FB20260926143012008",
    type: "fault",
    priority: "P2",
    status: "processing",
    source: "app",
    userId: "U100014",
    sn: seedDevices[13].sn,
    appVersion: "3.2.4",
    firmware: "v2.3.1",
    contact: contactOf("U100014"),
    content: "设备从 9 月 18 日起离线，App 里看不到相册；家里换了路由器后设备没有重新配网。",
    attachments: [{ name: "离线提示截图.png", sizeBytes: 238144, type: "png" }],
    assignee: "客服 · 许知遥",
    slaTargetHours: 24,
    slaDeadlineAt: "2026-09-27 14:30",
    submittedAt: "2026-09-26 14:30",
    acceptedAt: "2026-09-26 15:05",
    acceptedBy: "客服 · 许知遥",
    resolvedAt: null,
    replies: [staffReply("已电话联系用户，引导按 App 指引重新配网，等待用户确认恢复情况。", "2026-09-26 19:40")],
    flow: [
      { at: "2026-09-26 14:30", operator: "系统自动", from: null, to: "pending", note: "由告警 AL-0926-007 转工单" },
      staffFlow("2026-09-26 15:05", "pending", "processing")
    ],
    rejectReason: null,
    rmaId: null,
    relatedAlertId: "AL-0926-007"
  },
  {
    id: "FB20260928114000002",
    type: "fault",
    priority: "P1",
    status: "pending",
    source: "app",
    userId: "U100034",
    sn: seedDevices[33].sn,
    appVersion: "3.2.4",
    firmware: "v2.3.1",
    contact: contactOf("U100034"),
    content: "设备显示离线两周，孩子照片同步不了，希望尽快恢复。",
    attachments: [],
    assignee: null,
    slaTargetHours: 4,
    slaDeadlineAt: "2026-09-28 15:40",
    submittedAt: "2026-09-28 11:40",
    acceptedAt: null,
    acceptedBy: null,
    resolvedAt: null,
    replies: [],
    flow: [{ at: "2026-09-28 11:40", operator: "App 用户", from: null, to: "pending" }],
    rejectReason: null,
    rmaId: null,
    relatedAlertId: null
  },
  {
    id: "FB20260927100000003",
    type: "consult",
    priority: "P3",
    status: "pending",
    source: "app",
    userId: "U100026",
    sn: null,
    appVersion: "3.1.4",
    firmware: null,
    contact: contactOf("U100026"),
    content: "相册备份能不能只备份相册里新建的文件夹？现在每次都要手动选。",
    attachments: [],
    assignee: null,
    slaTargetHours: 72,
    slaDeadlineAt: "2026-09-30 10:00",
    submittedAt: "2026-09-27 10:00",
    acceptedAt: null,
    acceptedBy: null,
    resolvedAt: null,
    replies: [],
    flow: [{ at: "2026-09-27 10:00", operator: "App 用户", from: null, to: "pending" }],
    rejectReason: null,
    rmaId: null,
    relatedAlertId: null
  },
  {
    id: "FB20260928093000004",
    type: "fault",
    priority: "P2",
    status: "processing",
    source: "app",
    userId: "U100031",
    sn: seedDevices[30].sn,
    appVersion: "3.2.0",
    firmware: "v2.3.1",
    contact: contactOf("U100031"),
    content: "设备频繁掉线重连，存储服务时好时坏。",
    attachments: [],
    assignee: "客服 · 许知遥",
    slaTargetHours: 24,
    slaDeadlineAt: "2026-09-29 09:30",
    submittedAt: "2026-09-28 09:30",
    acceptedAt: "2026-09-28 10:15",
    acceptedBy: "客服 · 许知遥",
    resolvedAt: null,
    replies: [],
    flow: [
      { at: "2026-09-28 09:30", operator: "App 用户", from: null, to: "pending" },
      staffFlow("2026-09-28 10:15", "pending", "processing")
    ],
    rejectReason: null,
    rmaId: null,
    relatedAlertId: null
  },
  {
    id: "FB20260925161000005",
    type: "fault",
    priority: "P3",
    status: "awaiting_user",
    source: "app",
    userId: "U100007",
    sn: seedDevices[6].sn,
    appVersion: "3.2.4",
    firmware: "v2.4.0",
    contact: contactOf("U100007"),
    content: "无法开机，按电源键没有任何声音，申请退换。",
    attachments: [{ name: "设备照片.png", sizeBytes: 412260, type: "png" }],
    assignee: "客服 · 许知遥",
    slaTargetHours: 72,
    slaDeadlineAt: "2026-09-28 16:10",
    submittedAt: "2026-09-25 16:10",
    acceptedAt: "2026-09-25 16:30",
    acceptedBy: "客服 · 许知遥",
    resolvedAt: null,
    replies: [staffReply("已为您申请退货 RMA，快递到仓后进入检测；如确认换货需求请告知。", "2026-09-26 09:35")],
    flow: [
      { at: "2026-09-25 16:10", operator: "App 用户", from: null, to: "pending" },
      staffFlow("2026-09-25 16:30", "pending", "processing"),
      staffFlow("2026-09-26 09:35", "processing", "awaiting_user", "回复用户，等待确认")
    ],
    rejectReason: null,
    rmaId: "RMA-20260926-000001",
    relatedAlertId: null
  },
  {
    id: "FB20260924112000006",
    type: "complaint",
    priority: "P3",
    status: "resolved",
    source: "app",
    userId: "U100020",
    sn: seedDevices[19].sn,
    appVersion: "3.2.1",
    firmware: "v2.4.0",
    contact: contactOf("U100020"),
    content: "在线下门店买的设备外壳有划痕变形，要求换货。",
    attachments: [],
    assignee: "客服 · 许知遥",
    slaTargetHours: 72,
    slaDeadlineAt: "2026-09-27 11:20",
    submittedAt: "2026-09-24 11:20",
    acceptedAt: "2026-09-24 11:35",
    acceptedBy: "客服 · 许知遥",
    resolvedAt: "2026-09-26 16:00",
    replies: [staffReply("已登记换货，请将设备寄回，到仓后立即安排。", "2026-09-25 14:10")],
    flow: [
      { at: "2026-09-24 11:20", operator: "App 用户", from: null, to: "pending" },
      staffFlow("2026-09-24 11:35", "pending", "processing"),
      staffFlow("2026-09-25 14:10", "processing", "awaiting_user", "回复用户，等待确认"),
      { at: "2026-09-26 16:00", operator: "客服 · 许知遥", from: "awaiting_user", to: "resolved", note: "用户确认解决" }
    ],
    rejectReason: null,
    rmaId: "RMA-20260925-000002",
    relatedAlertId: null
  },
  {
    id: "FB20260922100000007",
    type: "fault",
    priority: "P2",
    status: "closed",
    source: "app",
    userId: "U100006",
    sn: seedDevices[5].sn,
    appVersion: "3.1.6",
    firmware: "v2.2.8",
    contact: contactOf("U100006"),
    content: "风扇异响，担心设备过热。",
    attachments: [],
    assignee: "客服 · 许知遥",
    slaTargetHours: 24,
    slaDeadlineAt: "2026-09-23 10:00",
    submittedAt: "2026-09-22 10:00",
    acceptedAt: "2026-09-22 10:40",
    acceptedBy: "客服 · 许知遥",
    resolvedAt: "2026-09-23 08:30",
    replies: [staffReply("清理风扇灰尘后转速已恢复正常，本次工单单据关闭。", "2026-09-23 08:30")],
    flow: [
      { at: "2026-09-22 10:00", operator: "App 用户", from: null, to: "pending" },
      staffFlow("2026-09-22 10:40", "pending", "processing"),
      staffFlow("2026-09-23 08:30", "processing", "resolved", "用户确认解决"),
      staffFlow("2026-09-25 17:30", "resolved", "closed")
    ],
    rejectReason: null,
    rmaId: null,
    relatedAlertId: null
  },
  {
    id: "FB20260923140000009",
    type: "complaint",
    priority: "P3",
    status: "rejected",
    source: "agent",
    userId: null,
    sn: null,
    appVersion: null,
    firmware: null,
    contact: "13500002236",
    content: "用户来电投诉会员价格政策，超出设备运营支持范围。",
    attachments: [],
    assignee: "客服 · 许知遥",
    slaTargetHours: 72,
    slaDeadlineAt: "2026-09-26 14:00",
    submittedAt: "2026-09-23 14:00",
    acceptedAt: "2026-09-23 14:20",
    acceptedBy: "客服 · 许知遥",
    resolvedAt: "2026-09-23 15:12",
    replies: [],
    flow: [
      { at: "2026-09-23 14:00", operator: "客服 · 许知遥", from: null, to: "pending", note: "客服代录" },
      staffFlow("2026-09-23 14:20", "pending", "processing"),
      staffFlow("2026-09-23 15:12", "processing", "rejected", "驳回")
    ],
    rejectReason: "诉求与设备功能及售后无关，已电话说明并致歉",
    rmaId: null,
    relatedAlertId: null
  },
  {
    id: "FB20260928131000010",
    type: "fault",
    priority: "P1",
    status: "processing",
    source: "app",
    userId: "U100033",
    sn: seedDevices[32].sn,
    appVersion: "3.2.4",
    firmware: "v2.3.1",
    contact: contactOf("U100033"),
    content: "设备到货后开机异响，担心运输途中磕碰损坏数据。",
    attachments: [{ name: "异响视频说明.mp4", sizeBytes: 8913408, type: "mp4" }],
    assignee: "客服 · 许知遥",
    slaTargetHours: 4,
    slaDeadlineAt: "2026-09-28 17:10",
    submittedAt: "2026-09-28 13:10",
    acceptedAt: "2026-09-28 13:25",
    acceptedBy: "客服 · 许知遥",
    resolvedAt: null,
    replies: [staffReply("已联系物流核实途中磕碰记录，同步检测排期。", "2026-09-28 14:05")],
    flow: [
      { at: "2026-09-28 13:10", operator: "App 用户", from: null, to: "pending" },
      staffFlow("2026-09-28 13:25", "pending", "processing")
    ],
    rejectReason: null,
    rmaId: null,
    relatedAlertId: null
  },
  {
    id: "FB20260921102000011",
    type: "fault",
    priority: "P2",
    status: "resolved",
    source: "agent",
    userId: "U100048",
    sn: seedDevices[47].sn,
    appVersion: "3.2.0",
    firmware: "v2.3.1",
    contact: contactOf("U100048"),
    content: "频繁掉盘，重启后短暂恢复。",
    attachments: [],
    assignee: "客服 · 许知遥",
    slaTargetHours: 24,
    slaDeadlineAt: "2026-09-22 10:20",
    submittedAt: "2026-09-21 10:20",
    acceptedAt: "2026-09-21 10:35",
    acceptedBy: "客服 · 许知遥",
    resolvedAt: "2026-09-22 09:26",
    replies: [staffReply("已安排退货检测，设备寄回后按结果处理。", "2026-09-22 09:05")],
    flow: [
      { at: "2026-09-21 10:20", operator: "客服 · 许知遥", from: null, to: "pending", note: "客服代录" },
      staffFlow("2026-09-21 10:35", "pending", "processing"),
      staffFlow("2026-09-22 09:26", "processing", "resolved", "用户确认解决")
    ],
    rejectReason: null,
    rmaId: "RMA-20260922-000004",
    relatedAlertId: null
  },
  {
    id: "FB20260924090000012",
    type: "consult",
    priority: "P3",
    status: "closed",
    source: "agent",
    userId: "U100021",
    sn: seedDevices[20].sn,
    appVersion: "3.2.0",
    firmware: "v2.2.8",
    contact: contactOf("U100021"),
    content: "用户来电询问如何设置相册自动备份只备份指定文件夹。",
    attachments: [],
    assignee: "客服 · 许知遥",
    slaTargetHours: 72,
    slaDeadlineAt: "2026-09-27 09:00",
    submittedAt: "2026-09-24 09:00",
    acceptedAt: "2026-09-24 09:10",
    acceptedBy: "客服 · 许知遥",
    resolvedAt: "2026-09-24 17:40",
    replies: [staffReply("已电话指导完成设置，用户确认问题解决。", "2026-09-24 17:40")],
    flow: [
      { at: "2026-09-24 09:00", operator: "客服 · 许知遥", from: null, to: "pending", note: "客服代录" },
      staffFlow("2026-09-24 09:10", "pending", "processing"),
      staffFlow("2026-09-24 17:40", "processing", "closed", "解决后关闭")
    ],
    rejectReason: null,
    rmaId: null,
    relatedAlertId: null
  }
];

export function latestOpenTicketForSn(sn: string, tickets: FeedbackTicket[] = seedFeedbackTickets): FeedbackTicket | undefined {
  return [...tickets]
    .filter((ticket) => ticket.sn === sn && isFeedbackOpen(ticket))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
}

// —— 烧录发证（页 8）——
export const flashingStations = ["FLASH-01", "FLASH-02", "FLASH-03", "FLASH-04", "FLASH-05", "FLASH-06"] as const;
export const certTemplates = ["标准设备证书模板 v2", "标准设备证书模板 v1（旧产线）"] as const;
export type FlashingTaskScope = "batch" | "sn_range" | "sn_list";
export type FlashingTask = {
  taskId: string;
  taskName: string;
  model: string;
  firmwareVersion: string;
  stations: string[];
  issueCert: boolean;
  certTemplate: string | null;
  scopeType: FlashingTaskScope;
  scopeValue: string;
  retryLimit: number;
  remark: string | null;
  createdBy: string;
  createdAt: string;
};
export type FlashingResult = "processing" | "succeeded" | "failed";
export const flashingResultMeta: Record<FlashingResult, { label: string; color: string }> = {
  processing: { label: "进行中", color: "processing" },
  succeeded: { label: "成功", color: "success" },
  failed: { label: "失败", color: "error" }
};
export type FlashingLogStepState = "succeeded" | "failed" | "processing" | "pending";
export type FlashingLogStep = { name: string; at: string | null; durationSec: number | null; status: FlashingLogStepState };
export const flashingFailureCategories = ["固件下载超时", "写入校验失败", "证书签发失败", "工位硬件故障", "网络中断", "其他"] as const;
export type FlashingFailureCategory = (typeof flashingFailureCategories)[number];
export type FlashingFailure = { category: FlashingFailureCategory; description: string; photoCount: number };
export type FlashingRecord = {
  sn: string;
  taskId: string;
  model: string;
  firmwareVersion: string;
  station: string;
  certState: CertState;
  result: FlashingResult;
  retryCount: number;
  retryLimit: number;
  durationSec: number | null;
  operator: string;
  startedAt: string;
  failure: FlashingFailure | null;
  logSteps: FlashingLogStep[];
};

const flashOperator = "烧录 · 林晚";

export const seedFlashingTasks: FlashingTask[] = [
  {
    taskId: "FT-20260926-01",
    taskName: "B2410 首批烧录",
    model: "TS-N2",
    firmwareVersion: "v2.4.0",
    stations: ["FLASH-01", "FLASH-02", "FLASH-03"],
    issueCert: true,
    certTemplate: "标准设备证书模板 v2",
    scopeType: "batch",
    scopeValue: "B2410",
    retryLimit: 3,
    remark: null,
    createdBy: "生产管理 · 季同",
    createdAt: "2026-09-26 08:30"
  },
  {
    taskId: "FT-20260928-01",
    taskName: "B2410 尾批补烧",
    model: "TS-N4 Pro",
    firmwareVersion: "v2.4.0",
    stations: ["FLASH-05"],
    issueCert: true,
    certTemplate: "标准设备证书模板 v2",
    scopeType: "sn_list",
    scopeValue: "8 台",
    retryLimit: 3,
    remark: "尾批少量补烧",
    createdBy: "生产管理 · 季同",
    createdAt: "2026-09-28 09:10"
  }
];

const logStep = (name: string, at: string | null, durationSec: number | null, status: FlashingLogStepState): FlashingLogStep => ({
  name,
  at,
  durationSec,
  status
});

// 烧录记录与设备状态同源：flashing / flash_failed 设备各一条；index 56 重试已达上限（呈现「超限报废」路径）。
export const seedFlashingRecords: FlashingRecord[] = [
  {
    sn: seedDevices[39].sn,
    taskId: "FT-20260928-01",
    model: seedDevices[39].model,
    firmwareVersion: "v2.4.0",
    station: "FLASH-03",
    certState: "cert_pending",
    result: "processing",
    retryCount: 0,
    retryLimit: 3,
    durationSec: null,
    operator: flashOperator,
    startedAt: "2026-09-28 14:20:36",
    failure: null,
    logSteps: [
      logStep("固件下载", "2026-09-28 14:20:36", 42, "succeeded"),
      logStep("写入", "2026-09-28 14:21:18", null, "processing"),
      logStep("校验", null, null, "pending"),
      logStep("证书签发", null, null, "pending")
    ]
  },
  {
    sn: seedDevices[40].sn,
    taskId: "FT-20260926-01",
    model: seedDevices[40].model,
    firmwareVersion: "v2.4.0",
    station: "FLASH-02",
    certState: "cert_pending",
    result: "failed",
    retryCount: 1,
    retryLimit: 3,
    durationSec: 96,
    operator: flashOperator,
    startedAt: "2026-09-27 10:08:12",
    failure: { category: "写入校验失败", description: "写入第 3 分区后校验和比对失败，重试一次失败特征一致。", photoCount: 2 },
    logSteps: [
      logStep("固件下载", "2026-09-27 10:08:12", 38, "succeeded"),
      logStep("写入", "2026-09-27 10:08:50", 36, "succeeded"),
      logStep("校验", "2026-09-27 10:09:26", 22, "failed"),
      logStep("证书签发", null, null, "pending")
    ]
  },
  {
    sn: seedDevices[56].sn,
    taskId: "FT-20260926-01",
    model: seedDevices[56].model,
    firmwareVersion: "v2.4.0",
    station: "FLASH-05",
    certState: "cert_failed",
    result: "failed",
    retryCount: 3,
    retryLimit: 3,
    durationSec: 118,
    operator: flashOperator,
    startedAt: "2026-09-26 11:42:05",
    failure: { category: "证书签发失败", description: "KMS 签发三次均超时，按超限规则进入处置。", photoCount: 1 },
    logSteps: [
      logStep("固件下载", "2026-09-26 11:42:05", 41, "succeeded"),
      logStep("写入", "2026-09-26 11:42:46", 33, "succeeded"),
      logStep("校验", "2026-09-26 11:43:19", 12, "succeeded"),
      logStep("证书签发", "2026-09-26 11:43:31", 32, "failed")
    ]
  },
  {
    sn: seedDevices[57].sn,
    taskId: "FT-20260926-01",
    model: seedDevices[57].model,
    firmwareVersion: "v2.4.0",
    station: "FLASH-06",
    certState: "cert_pending",
    result: "failed",
    retryCount: 2,
    retryLimit: 3,
    durationSec: 134,
    operator: flashOperator,
    startedAt: "2026-09-26 15:26:40",
    failure: { category: "网络中断", description: "写入阶段工位到产线网关断连 40 秒，任务中断。", photoCount: 0 },
    logSteps: [
      logStep("固件下载", "2026-09-26 15:26:40", 96, "succeeded"),
      logStep("写入", "2026-09-26 15:28:16", 38, "failed"),
      logStep("校验", null, null, "pending"),
      logStep("证书签发", null, null, "pending")
    ]
  },
  // 2026-09-29 集成裁决：补 1 条成功记录（succeeded / cert_issued），挑一台 testing 设备，
  // 保证首屏证书列灰 / 绿 / 红三态同现；与设备详情证书组、护照时间轴烧录节点同源。
  {
    sn: seedDevices[36].sn,
    taskId: "FT-20260928-01",
    model: seedDevices[36].model,
    firmwareVersion: "v2.4.0",
    station: "FLASH-01",
    certState: "cert_issued",
    result: "succeeded",
    retryCount: 0,
    retryLimit: 3,
    durationSec: 97,
    operator: flashOperator,
    startedAt: "2026-09-26 10:50:23",
    failure: null,
    logSteps: [
      logStep("固件下载", "2026-09-26 10:50:23", 34, "succeeded"),
      logStep("写入", "2026-09-26 10:50:57", 35, "succeeded"),
      logStep("校验", "2026-09-26 10:51:32", 19, "succeeded"),
      logStep("证书签发", "2026-09-26 10:51:51", 9, "succeeded")
    ]
  }
];

// —— 告警规则（页 10）——
export type AlertRuleType = Exclude<AlertType, "hardware_health">;
export const ALERT_RULE_ID_PATTERN = /^AR-\d{4}-\d{2}$/;
export type AlertRule = {
  id: string;
  name: string;
  type: AlertRuleType;
  scope: "model" | "batch" | null;
  target: string | null;
  thresholdPct: number | null;
  offlineDays: number | null;
  pushTaskScope: "all" | "specified" | null;
  pushTaskIds: string[];
  notifyUsers: string[];
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
};

// 触发条件摘要确定性生成（页面渲染唯一来源，不手写字段）。
export function describeAlertRule(rule: AlertRule, tasks: PushTask[] = seedPushTasks): string {
  if (rule.type === "offline_rate_exceeded") return `${rule.scope === "batch" ? "批次" : "机型"} ${rule.target ?? ""} 离线率 ≥ ${rule.thresholdPct}%`;
  if (rule.type === "offline_duration_exceeded") return `单台连续离线 ≥ ${rule.offlineDays} 天`;
  if (rule.pushTaskScope === "specified" && rule.pushTaskIds.length > 0) {
    const names = rule.pushTaskIds
      .map((id) => tasks.find((task) => task.id === id)?.name ?? id)
      .join("、");
    return `推送任务 ${names} 升级失败率 ≥ ${rule.thresholdPct}%`;
  }
  return `全部推送任务升级失败率 ≥ ${rule.thresholdPct}%`;
}

// 阈值与冻结告警文案一致（10% / 7 天 / 5%）；最近触发时间 = 对应告警的首次发现时间。
export const seedAlertRules: AlertRule[] = [
  {
    id: "AR-0921-01",
    name: "B2409 批次离线率 ≥10%",
    type: "offline_rate_exceeded",
    scope: "batch",
    target: "B2409",
    thresholdPct: 10,
    offlineDays: null,
    pushTaskScope: null,
    pushTaskIds: [],
    notifyUsers: ["运维 · 周启明", "运维 · 顾清和"],
    enabled: true,
    createdAt: "2026-09-21 09:00",
    lastTriggeredAt: "2026-09-28 12:45"
  },
  {
    id: "AR-0921-02",
    name: "单台离线超 7 天",
    type: "offline_duration_exceeded",
    scope: null,
    target: null,
    thresholdPct: null,
    offlineDays: 7,
    pushTaskScope: null,
    pushTaskIds: [],
    notifyUsers: ["客服 · 许知遥"],
    enabled: true,
    createdAt: "2026-09-21 09:05",
    lastTriggeredAt: "2026-09-26 10:00"
  },
  {
    id: "AR-0926-01",
    name: "v2.4.0 灰度升级失败率 ≥5%",
    type: "upgrade_fail_rate_exceeded",
    scope: null,
    target: null,
    thresholdPct: 5,
    offlineDays: null,
    pushTaskScope: "specified",
    pushTaskIds: ["PT-20260927-01"],
    notifyUsers: ["固件发布 · 沈亦舟"],
    enabled: true,
    createdAt: "2026-09-26 08:30",
    lastTriggeredAt: "2026-09-27 16:30"
  },
  {
    id: "AR-0924-01",
    name: "B2407 割接离线率 ≥10%",
    type: "offline_rate_exceeded",
    scope: "batch",
    target: "B2407",
    thresholdPct: 10,
    offlineDays: null,
    pushTaskScope: null,
    pushTaskIds: [],
    notifyUsers: ["运维 · 周启明"],
    enabled: false,
    createdAt: "2026-09-24 08:00",
    lastTriggeredAt: "2026-09-24 01:10"
  },
  {
    id: "AR-0901-01",
    name: "TS-N4 Pro 离线率 ≥10%",
    type: "offline_rate_exceeded",
    scope: "model",
    target: "TS-N4 Pro",
    thresholdPct: 10,
    offlineDays: null,
    pushTaskScope: null,
    pushTaskIds: [],
    notifyUsers: ["运维 · 周启明"],
    enabled: true,
    createdAt: "2026-09-01 10:00",
    lastTriggeredAt: null
  }
];

// —— 护照时间轴事件（由设备与 RMA 单确定性派生，存量动作会追加）——
function buildPassportEvents(device: Device): PassportEvent[] {
  const index = seedDevices.findIndex((item) => item.sn === device.sn);
  const seed = index < 0 ? 0 : index;
  const events: PassportEvent[] = [];
  const push = (kind: PassportEventKind, colorState: LifecycleState, at: string, operator: string, summary: string, detail?: Record<string, string>, station?: string) =>
    events.push({ id: `PE-${device.sn}-${String(events.length + 1).padStart(2, "0")}`, sn: device.sn, kind, colorState, label: passportEventKindLabel[kind], at, operator, station, summary, detail });
  // 2026-09-29 批 2 P2 修复：day 可能自带时间（RMA 单 / 裁决时间），只保留日期部分，避免「日期 + 两个时间」拼接。
  const at = (day: string, time: string, offset: number) => `${day.slice(0, 10)} ${time}:${pad((offset * 7 + seed) % 60)}`;
  const firmwareHash = `sha256:${(0x3fa9c1 + seed * 7919).toString(16)}…${(0x8e21 + seed * 131).toString(16)}`;
  const passRate = device.qc === "qc_fail" ? "41 / 44" : device.qc === "qc_downgrade" ? "43 / 44" : "44 / 44";

  push("received", "received", at(device.receivedAt, "09:30", 1), "仓务 · 王净", `设备收货入场，批次 ${device.batch}`, undefined, "收货台");

  if (device.lifecycle === "received") return events;
  if (device.lifecycle === "flashing") return events;

  if (device.firmware) {
    push("flash", "flashing", at(device.receivedAt, `10:${pad((seed * 7) % 60)}`, 2), "烧录 · 林晚", `固件 ${device.firmware} 写入并签发证书`, {
      固件版本: device.firmware,
      证书编号: `CERT-${device.sn.slice(2)}`,
      固件哈希: firmwareHash
    }, `烧录工位 FLASH-${pad(1 + (seed % 6))}`);
  }
  if (device.lifecycle === "flash_failed") {
    push("flash_failed", "flash_failed", at(device.receivedAt, "11:10", 3), "烧录 · 林晚", "固件烧录失败，需回炉重烧", undefined, `烧录工位 FLASH-${pad(1 + (seed % 6))}`);
  }

  const tested = !["received", "flashing", "flash_failed"].includes(device.lifecycle) || device.lifecycle === "testing";
  if (tested) {
    const failed = device.lifecycle === "test_failed";
    push("testing", failed ? "test_failed" : "testing", at(device.receivedAt, `15:${pad((seed * 11) % 60)}`, 4), ["测试 · 陈牧", "测试 · 林晚", "测试 · 赵承"][seed % 3], failed ? "测试完成，判定不合格" : "测试完成，判定通过", {
      测试项通过率: passRate,
      判定: failed ? "不合格" : "通过"
    }, "测试台");
  }

  if (device.qc !== "qc_pending") {
    const qcColor: LifecycleState = device.qc === "qc_pass" ? "in_stock" : device.qc === "qc_fail" ? "test_failed" : "rma";
    push("qc", qcColor, at(device.receivedAt, "16:20", 5), ["质检 · 苏禾", "质检 · 韩默"][seed % 2], `质检结论：${qcMeta[device.qc].label}`, {
      质检员: ["苏禾", "韩默"][seed % 2],
      不良代码: device.qc === "qc_fail" ? "E-DSK-03 磁盘读写超时" : device.qc === "qc_downgrade" ? "W-FAN-01 风扇噪声偏高" : "—"
    }, "质检线");
  }

  const stocked = device.shippedAt !== null || device.lifecycle === "in_stock" || device.lifecycle === "scrapped";
  if (stocked) {
    push("inbound", "in_stock", `${device.receivedAt.slice(0, 8)}${pad(Math.min(28, Number(device.receivedAt.slice(8)) + 4))} 10:05`, "仓务 · 王净", "合格品入库上架", { 库位: `A${1 + (seed % 4)}-${pad(3 + (seed % 20))}` });
  }

  if (device.shippedAt) {
    push("shipped", "shipped", at(device.shippedAt, "15:20", 6), "渠道 · 顾清和", "设备出货", {
      物流单号: `SF${String(1402886000 + seed * 3137).padStart(12, "0")}`,
      收货方: ["王*宁", "李*", "陈*远", "周*"][seed % 4]
    });
  }

  if (device.activatedAt) {
    push("activation", "shipped", at(device.activatedAt, "08:40", 7), "系统自动", "设备联网激活，写入激活时间戳");
  }

  const rma = device.rmaCount > 0 ? rmaRecordBySn(device.sn) : undefined;
  if (rma) {
    push("rma", "rma", at(rma.createdAt, "10:30", 8), "客服 · 许知遥", `受理退回申请，创建 RMA 单 ${rma.id}`, {
      "RMA 单号": rma.id,
      退货原因: rmaReasonMeta[rma.reasonCode].label,
      退货来源: rmaSourceMeta[rma.source].label
    });
    if (rma.decisionMethod === "restock" && rma.decidedAt) {
      push("restocked", "in_stock", at(rma.decidedAt, "11:20", 9), rma.decidedBy ?? "生产管理 · 季同", "返修完成，二次入库");
    }
    if (rma.decisionMethod === "scrap" && rma.decidedAt) {
      push("scrapped", "scrapped", at(rma.decidedAt, "14:00", 10), rma.decidedBy ?? "生产管理 · 季同", "不可修复，执行报废", { 报废凭证: `SCR-${device.sn.slice(2)}` });
    }
  }

  if (device.lifecycle === "scrapped" && !rma) {
    push("scrapped", "scrapped", at(device.receivedAt, "17:30", 11), "生产管理 · 季同", "质检判定不可修复，执行报废", { 报废凭证: `SCR-${device.sn.slice(2)}` });
  }

  return events.sort((left, right) => right.at.localeCompare(left.at));
}

export const seedPassportEvents: PassportEvent[] = seedDevices.flatMap((device) => buildPassportEvents(device));

// 设备详情折叠区的 46 个字段，按 6 组确定性生成。
export type FieldItem = { label: string; value: string };
export type FieldGroup = { key: string; label: string; items: FieldItem[] };

// records / tickets 允许传运行态数据（store 内存状态），不传则回退种子。
export function foldedFieldGroups(
  device: Device,
  records: RmaRecord[] = seedRmaRecords,
  tickets: FeedbackTicket[] = seedFeedbackTickets
): FieldGroup[] {
  const index = seedDevices.findIndex((item) => item.sn === device.sn);
  const seed = index < 0 ? 0 : index;
  const shipped = Boolean(device.shippedAt);
  const active = Boolean(device.activatedAt);
  const dash = "—";
  return [
    {
      key: "production",
      label: "生产记录",
      items: [
        { label: "供应商", value: ["华川电子", "启明精密", "中科存储"][seed % 3] },
        { label: "烧录工位", value: `FLASH-${pad(1 + (seed % 6))}` },
        { label: "烧录时间", value: device.firmware ? `${device.receivedAt} 10:${pad((seed * 7) % 60)}` : dash },
        { label: "固件 hash", value: device.firmware ? `sha256:${(0x3fa9c1 + seed * 7919).toString(16)}…${(0x8e21 + seed * 131).toString(16)}` : dash },
        { label: "测试时间", value: device.qc === "qc_pending" && device.lifecycle !== "testing" ? dash : `${device.receivedAt} 15:${pad((seed * 11) % 60)}` },
        { label: "测试项通过率", value: device.qc === "qc_fail" ? "41 / 44" : device.qc === "qc_pending" ? dash : device.qc === "qc_downgrade" ? "43 / 44" : "44 / 44" },
        { label: "测试员", value: ["陈牧", "林晚", "赵承"][seed % 3] },
        { label: "质检员", value: device.qc === "qc_pending" ? dash : ["苏禾", "韩默"][seed % 2] },
        { label: "不良代码", value: device.qc === "qc_fail" ? "E-DSK-03 磁盘读写超时" : device.qc === "qc_downgrade" ? "W-FAN-01 风扇噪声偏高" : dash },
        { label: "库位", value: device.lifecycle === "in_stock" || shipped ? `A${1 + (seed % 4)}-${pad(3 + (seed % 20))}` : dash },
        { label: "入库时间", value: device.lifecycle === "in_stock" || shipped ? `${device.receivedAt.slice(0, 8)}${pad(Math.min(28, Number(device.receivedAt.slice(8)) + 4))}` : dash },
        { label: "生产备注", value: device.qc === "qc_downgrade" ? "降级入库，仅限渠道 B 出货" : dash }
      ]
    },
    {
      key: "shipping",
      label: "出货物流",
      items: [
        { label: "出货单号", value: shipped ? `SO-${device.batch.slice(1)}-${String(310 + seed).padStart(4, "0")}` : dash },
        { label: "渠道", value: shipped ? ["官方商城", "渠道 A", "渠道 B"][seed % 3] : dash },
        { label: "物流公司", value: shipped ? ["顺丰速运", "京东物流"][seed % 2] : dash },
        { label: "物流单号", value: shipped ? `SF${String(1402886000 + seed * 3137).padStart(12, "0")}` : dash },
        { label: "收货方", value: shipped ? ["王*宁", "李*", "陈*远", "周*"][seed % 4] : dash },
        { label: "签收时间", value: device.activatedAt ? `${device.shippedAt?.slice(0, 8)}${pad(Math.min(28, Number(device.shippedAt?.slice(8)) + 2))} 16:20` : dash }
      ]
    },
    {
      key: "certificate",
      label: "证书",
      items: [
        { label: "证书编号", value: device.cert === "cert_pending" ? dash : `CERT-${device.sn.slice(2)}` },
        { label: "签发时间", value: device.cert === "cert_pending" ? dash : `${device.receivedAt} 10:40` },
        { label: "有效期至", value: device.cert === "cert_pending" ? dash : `2031-${device.receivedAt.slice(5)}` },
        { label: "公钥指纹", value: device.cert === "cert_pending" ? dash : `SHA256:${(0x9c42e1 + seed * 6007).toString(16).toUpperCase()}…${(0x51b + seed * 97).toString(16).toUpperCase()}` },
        { label: "吊销状态", value: device.lifecycle === "scrapped" ? "已吊销（报废）" : device.cert === "cert_pending" ? dash : "未吊销" }
      ]
    },
    {
      key: "runtime",
      label: "运行明细",
      items: [
        { label: "心跳间隔", value: active ? "5 分钟" : dash },
        { label: "近 7 天在线率", value: device.online === "online" ? `${96 + (seed % 4)}.${seed % 10}%` : device.online === "offline" ? `${Math.max(8, 70 - device.offlineDays * 9)}.${seed % 10}%` : dash },
        { label: "客户端版本", value: active ? ["Windows 3.2.0", "Android 3.1.4", "tNAS 1.8.2"][seed % 3] : dash },
        { label: "存储总容量", value: `${device.storageTotal} TB` },
        { label: "磁盘数量", value: device.model === "TS-N4 Pro" ? "4" : "2" },
        { label: "磁盘健康", value: !active ? dash : device.sn === seedDevices[14]?.sn ? "磁盘 2 健康度 61%" : "全部正常" },
        { label: "设备温度", value: !active ? dash : device.sn === seedDevices[20]?.sn ? "59°C" : `${41 + (seed % 9)}°C` },
        { label: "网络类型", value: active ? ["有线千兆", "Wi-Fi 6"][seed % 2] : dash },
        { label: "上次重启时间", value: active ? `2026-09-${pad(20 + (seed % 8))} 03:${pad((seed * 3) % 60)}` : dash },
        { label: "固件推送记录", value: device.targetFirmware ? "v2.4.0 灰度 20% · 待设备上线" : active ? "v2.3.1 全量 · 成功" : dash }
      ]
    },
    {
      key: "service",
      label: "用户与服务",
      items: [
        { label: "绑定用户", value: active ? ["管理员 1 人", `成员 ${device.boundUsers - 1} 人`].join("，") : dash },
        { label: "绑定时间", value: device.activatedAt ?? dash },
        { label: "App 版本", value: active ? `3.${1 + (seed % 2)}.${seed % 6}` : dash },
        { label: "保修起始日", value: device.shippedAt ?? dash },
        { label: "保修类型", value: shipped ? (device.model === "TS-N4 Pro" ? "整机 2 年 + 硬盘 3 年" : "整机 2 年") : dash },
        { label: "护照公开状态", value: shipped ? passportPublishMeta[device.passportPublish.publicEnabled ? "published" : "unpublished"].label : dash },
        { label: "护照二维码", value: device.qrGenerated && device.passportPublish.publicEnabled ? "已生成 256px" : dash }
      ]
    },
    {
      key: "after-sales",
      label: "售后",
      items: (() => {
        // RMA 单号 / 原因 / 结论与退货 RMA 页同源（2026-09-29 依据批 1 页面卡统一单号为 RMA-YYYYMMDD-NNNNNN）。
        const record = device.rmaCount > 0 ? rmaRecordBySn(device.sn, records) : undefined;
        const conclusionText = record
          ? record.decisionMethod !== "pending_decision"
            ? rmaDecisionMeta[record.decisionMethod].label
            : record.arrivalStatus === "inspected"
              ? "已检测待裁决"
              : rmaArrivalMeta[record.arrivalStatus].label
          : dash;
        return [
          { label: "RMA 单号", value: record?.id ?? dash },
          { label: "退货原因", value: record ? rmaReasonMeta[record.reasonCode].label : dash },
          { label: "返修结论", value: conclusionText },
          { label: "二次入库时间", value: record?.decisionMethod === "restock" && record.decidedAt ? record.decidedAt.slice(0, 10) : dash },
          { label: "报废凭证", value: device.lifecycle === "scrapped" ? `SCR-${device.sn.slice(2)}` : dash },
          // 2026-09-29 批 2：取自真实 FeedbackTicket（未关闭工单中最近一条），不再拼接伪编号。
          { label: "最近工单编号", value: latestOpenTicketForSn(device.sn, tickets)?.id ?? dash }
        ];
      })()
    }
  ];
}
