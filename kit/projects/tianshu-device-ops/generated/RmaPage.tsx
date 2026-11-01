import { useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Radio,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  type TableColumnsType,
  type UploadFile
} from "antd";
import { DownOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  NOW_LABEL,
  models,
  rmaAppearanceScores,
  rmaArrivalMeta,
  rmaConclusionMeta,
  rmaDecisionMeta,
  rmaFunctionCheckOptions,
  rmaReasonMeta,
  rmaReasonOptions,
  rmaSourceMeta,
  rmaSourceOptions,
  type Device,
  type RmaAppearanceScore,
  type RmaArrivalStatus,
  type RmaAttachment,
  type RmaConclusion,
  type RmaDecisionMethod,
  type RmaReasonCode,
  type RmaRecord,
  type RmaSource
} from "../data";
import { deviceOpsStore, passportEventsBySn, useDeviceOpsState, type ActionResult } from "../store";
import { LifecycleTag, RmaArrivalTag, RmaConclusionTag, RmaDecisionTag, appPath, useDataState, usePermission, useQueryParams, useRouter } from "../ui";
import {
  RMA_DECISIONS,
  RMA_FILTER_TTL,
  RMA_STORAGE_KEYS,
  activeRmaMoreCount,
  emptyRmaFilters,
  matchesRmaFilters,
  normalizeRmaSnInput,
  rmaCloseEligibility,
  rmaDecisionFlowText,
  writeRmaFilters
} from "../core/rmaList";
import "./rma.css";

// —— 退货 RMA（2026-09-29 扩页批 1 页面卡 · 页 6）——
// 状态机驱动单行操作：待到件可编辑/确认到件 → 待检可录入检测 → 已检测按结论互斥裁决 → 终态只剩查看/凭证。
// 数据来源：seed+store（RmaRecord × Device）；权限点按 PRD 附录 A（create/inspect/decision/export/close），
// 「确认到件」按页面卡裁决挂 production:rma:inspect；报废凭证按裁决挂 production:rma:export。

type Range = [string, string] | null;
type Filters = {
  rmaId: string;
  sn: string;
  arrivalStatuses: RmaArrivalStatus[];
  conclusions: RmaConclusion[];
  deviceModels: string[];
  reasons: RmaReasonCode[];
  sources: RmaSource[];
  decisions: RmaDecisionMethod[];
  createdRange: Range;
  closedRange: Range;
};
type Decision = Exclude<RmaDecisionMethod, "pending_decision">;
type CreateFormValues = { sn: string; reasonCode: RmaReasonCode; source: RmaSource; description?: string; expectedArrivalDate?: Dayjs };
type EditFormValues = { reasonCode: RmaReasonCode; source: RmaSource; description?: string };
type InspectFormValues = { conclusion: RmaConclusion; appearanceScore: RmaAppearanceScore; functionChecks: string[]; inspectNote?: string };
type DecideFormValues = { decisionNote?: string; expectedRepairDate?: Dayjs };

// 与冻结时间 2026-09-28 对齐的“今天”，范围校验（预计到件 ≤90 天、返修 ≤180 天）以它为原点。
const TODAY = dayjs(NOW_LABEL.slice(0, 10));

const DASH = "—";

function readFilters(): Filters | null {
  try {
    const raw = window.localStorage.getItem(RMA_STORAGE_KEYS.filter);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; filters: Filters };
    if (Date.now() - parsed.savedAt > RMA_FILTER_TTL) return null;
    return { ...emptyRmaFilters, ...parsed.filters };
  } catch {
    return null;
  }
}

function writeFilters(filters: Filters) {
  writeRmaFilters(window.localStorage, filters, Date.now());
}

function readHiddenColumns(): string[] {
  try {
    const raw = window.localStorage.getItem(RMA_STORAGE_KEYS.columns);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeHiddenColumns(hidden: string[]) {
  try {
    window.localStorage.setItem(RMA_STORAGE_KEYS.columns, JSON.stringify(hidden));
  } catch {
    // 同上。
  }
}

const toOptions = <T extends string>(map: Record<T, { label: string }>) =>
  (Object.keys(map) as T[]).map((value) => ({ value, label: map[value].label }));

const arrivalStatusOptions = toOptions(rmaArrivalMeta);
const conclusionOptions = toOptions(rmaConclusionMeta);
const decisionOptions = toOptions(rmaDecisionMeta);
const modelOptions = models.map((value) => ({ value, label: value }));
const functionCheckOptions = rmaFunctionCheckOptions.map((value) => ({ value, label: value }));

const optionalColumns = [
  { key: "model", label: "机型" },
  { key: "source", label: "退货来源" },
  { key: "closedAt", label: "关闭时间" }
];

const formatSize = (sizeBytes: number) =>
  sizeBytes >= 1024 * 1024 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;

const toAttachments = (files: UploadFile[]): RmaAttachment[] =>
  files.map((file) => ({
    name: file.name,
    sizeBytes: file.size ?? file.originFileObj?.size ?? 0,
    type: file.type || file.originFileObj?.type || file.name.split(".").pop()?.toLowerCase() || "unknown"
  }));

const attachmentList = (items: RmaAttachment[], emptyText = "暂无附件") =>
  items.length === 0 ? (
    <span className="device-ops-muted">{emptyText}</span>
  ) : (
    <ul className="rma-attachments">
      {items.map((item) => (
        <li key={item.name}>
          <span>{item.name}</span>
          <span className="rma-attachments__size">{formatSize(item.sizeBytes)}</span>
        </li>
      ))}
    </ul>
  );

const NOT_BLANK_RULE = { required: true, whitespace: true };

export function RmaPage() {
  const { message } = App.useApp();
  const { navigate, search } = useRouter();
  const params = useQueryParams();
  const dataState = useDataState();
  const { readonly, guard } = usePermission();
  const { rmas, devices, passportEvents } = useDeviceOpsState();

  const deviceBySn = useMemo(() => new Map<string, Device>(devices.map((device) => [device.sn, device])), [devices]);
  // 返回本页时恢复当前跳转参数；普通条件另有 24 小时筛选记忆兜底。
  const returnUrl = `${appPath("/exceptions/rma")}${search}`;

  const [init] = useState(() => {
    const urlSn = params.get("sn");
    const urlRma = params.get("rma");
    const urlStatus = params.get("status");
    if (urlSn || urlRma || urlStatus) {
      const filters: Filters = { ...emptyRmaFilters, sn: urlSn ?? "" };
      if (urlRma) filters.rmaId = urlRma;
      // 工作台「待处理 RMA」卡（status=open = 未关闭且裁决未落）：用「处理方式=待裁决」表达，计数与卡片同源。
      if (urlStatus === "open") filters.decisions = ["pending_decision"];
      return { filters, openId: urlRma };
    }
    return { filters: readFilters() ?? emptyRmaFilters, openId: null as string | null };
  });

  const [draft, setDraft] = useState<Filters>(init.filters);
  const [applied, setApplied] = useState<Filters>(init.filters);
  const [moreOpen, setMoreOpen] = useState(() => activeRmaMoreCount(init.filters) > 0);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(readHiddenColumns);

  // 2026-09-29 批 2 动线 1：客户反馈「转退货 RMA」带 ?new=1&sn=…&source_feedback=FB… 直达，
  // 打开新建弹窗并预填 SN 与来源工单；创建成功后由 store 回写工单「关联 RMA 单号」。
  const [createPrefill, setCreatePrefill] = useState<{ sn: string; sourceFeedbackId: string } | null>(() =>
    params.get("new") === "1" ? { sn: params.get("sn") ?? "", sourceFeedbackId: params.get("source_feedback") ?? "" } : null
  );
  const [createOpen, setCreateOpen] = useState(createPrefill !== null);
  const [createFiles, setCreateFiles] = useState<UploadFile[]>([]);
  const [createForm] = Form.useForm<CreateFormValues>();
  const createReason = Form.useWatch("reasonCode", createForm);

  const [editing, setEditing] = useState<RmaRecord | null>(null);
  const [editForm] = Form.useForm<EditFormValues>();
  const editReason = Form.useWatch("reasonCode", editForm);

  const [detailId, setDetailId] = useState<string | null>(init.openId);
  const current = useMemo(() => rmas.find((record) => record.id === detailId) ?? null, [rmas, detailId]);

  const [inspectId, setInspectId] = useState<string | null>(null);
  const inspectRecord = useMemo(() => rmas.find((record) => record.id === inspectId) ?? null, [rmas, inspectId]);
  const [inspectFiles, setInspectFiles] = useState<UploadFile[]>([]);
  const [inspectForm] = Form.useForm<InspectFormValues>();
  const inspectConclusion = Form.useWatch("conclusion", inspectForm);
  const [inspecting, setInspecting] = useState(false);

  const [decision, setDecision] = useState<{ id: string; method: Decision } | null>(null);
  const decideRecord = useMemo(() => (decision ? (rmas.find((record) => record.id === decision.id) ?? null) : null), [rmas, decision]);
  const [decideForm] = Form.useForm<DecideFormValues>();
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);

  const [bulkCloseOpen, setBulkCloseOpen] = useState(false);
  const [createdStart, setCreatedStart] = useState<Dayjs | null>(null);

  const rows = useMemo(() => rmas.filter((record) => matchesRmaFilters(record, applied)), [rmas, applied]);

  const patchDraft = (patch: Partial<Filters>) => setDraft((currentDraft) => ({ ...currentDraft, ...patch }));

  const runQuery = () => {
    setApplied(draft);
    setSelectedKeys([]);
    writeFilters(draft);
  };

  const resetFilters = () => {
    setDraft(emptyRmaFilters);
    setApplied(emptyRmaFilters);
    setSelectedKeys([]);
    setCreatedStart(null);
    writeFilters(emptyRmaFilters);
  };

  const showResult = (result: ActionResult, failurePrefix: string) => {
    if (!result.ok) {
      message.error(`${failurePrefix}：${result.reason}`);
      return false;
    }
    return true;
  };

  const exportAll = () => message.success(`已提交导出任务（${rows.length} 条），完成后将通过站内信通知`);
  const exportScrapCert = (record: RmaRecord) => message.success(`已提交 ${record.id} 的报废凭证生成任务，完成后将通过站内信通知`);

  const doConfirmArrival = (id: string) => {
    if (showResult(deviceOpsStore.confirmArrival(id), "确认到件失败")) {
      message.success("已确认到件，单据进入「已到件-待检」");
    }
  };

  const openEdit = (record: RmaRecord) => {
    setEditing(record);
    editForm.setFieldsValue({
      reasonCode: record.reasonCode,
      source: record.source,
      description: record.description ?? undefined
    });
  };

  const submitEdit = async () => {
    const values = await editForm.validateFields().catch(() => null);
    if (!values || !editing) return;
    if (showResult(deviceOpsStore.editRma(editing.id, values), "编辑失败")) {
      setEditing(null);
      message.success(`RMA 单 ${editing.id} 已更新，设备到件后单据将锁定`);
    }
  };

  const submitCreate = async () => {
    const values = await createForm.validateFields().catch(() => null);
    if (!values) return;
    const result = deviceOpsStore.createRma({
      sn: values.sn,
      reasonCode: values.reasonCode,
      source: values.source,
      description: values.description,
      expectedArrivalDate: values.expectedArrivalDate ? values.expectedArrivalDate.format("YYYY-MM-DD") : undefined,
      attachments: toAttachments(createFiles),
      sourceFeedbackId: createPrefill?.sourceFeedbackId || undefined
    });
    if (!result.ok) {
      message.error(`新建 RMA 单失败：${result.reason}`);
      return;
    }
    setCreateOpen(false);
    setCreateFiles([]);
    const fromFeedback = createPrefill?.sourceFeedbackId;
    setCreatePrefill(null);
    message.success(
      fromFeedback ? `RMA 单 ${result.message} 创建成功并已回写工单 ${fromFeedback}，到件状态为「待到件」` : `RMA 单 ${result.message} 创建成功，到件状态为「待到件」`
    );
  };

  const openInspect = (id: string) => {
    setInspectId(id);
    setInspectFiles([]);
  };

  const submitInspect = async () => {
    const values = await inspectForm.validateFields().catch(() => null);
    if (!values || !inspectRecord) return;
    setInspecting(true);
    const result = deviceOpsStore.submitInspection(inspectRecord.id, {
      conclusion: values.conclusion,
      appearanceScore: values.appearanceScore,
      functionChecks: values.functionChecks,
      inspectNote: values.inspectNote,
      inspectAttachments: toAttachments(inspectFiles)
    });
    setInspecting(false);
    if (!showResult(result, "检测提交失败")) return;
    setInspectId(null);
    message.success(`检测已提交，单据进入「已检测」，结论：${rmaConclusionMeta[values.conclusion].label}`);
  };

  const openDecision = (id: string, method: Decision) => {
    setDecision({ id, method });
    setDecideError(null);
  };

  const submitDecide = async () => {
    const values = await decideForm.validateFields().catch(() => null);
    if (!values || !decision) return;
    setDeciding(true);
    const result = deviceOpsStore.decide(decision.id, {
      method: decision.method,
      decisionNote: values.decisionNote,
      expectedRepairDate: values.expectedRepairDate ? values.expectedRepairDate.format("YYYY-MM-DD") : undefined
    });
    setDeciding(false);
    if (!result.ok) {
      // 裁决失败：Modal 顶部展示原因，不关闭。
      setDecideError(result.reason);
      return;
    }
    setDecision(null);
    message.success(result.message ?? "裁决完成");
  };

  const deviceHref = (sn: string) => `${appPath(`/devices/${sn}`)}?from=${encodeURIComponent(returnUrl)}`;

  const columns: TableColumnsType<RmaRecord> = [
    {
      title: "RMA 单号",
      dataIndex: "id",
      key: "id",
      fixed: "left",
      width: 180,
      render: (id: string) => (
        <Button onClick={() => setDetailId(id)} size="small" type="link">
          {id}
        </Button>
      )
    },
    {
      title: "SN",
      dataIndex: "sn",
      key: "sn",
      width: 128,
      render: (sn: string) => (
        <Typography.Text className="device-ops-sn" copyable={{ text: sn, tooltips: ["复制 SN", "已复制"] }}>
          <a href={deviceHref(sn)}>{sn}</a>
        </Typography.Text>
      )
    },
    { title: "机型", dataIndex: "model", key: "model", responsive: ["xl"], width: 96 },
    {
      title: "退货原因",
      dataIndex: "reasonCode",
      key: "reasonCode",
      width: 108,
      render: (value: RmaReasonCode) => <Tag color={rmaReasonMeta[value].color}>{rmaReasonMeta[value].label}</Tag>
    },
    {
      title: "退货来源",
      dataIndex: "source",
      key: "source",
      responsive: ["xl"],
      width: 108,
      render: (value: RmaSource) => <Tag color={rmaSourceMeta[value].color}>{rmaSourceMeta[value].label}</Tag>
    },
    {
      title: "到件状态",
      dataIndex: "arrivalStatus",
      key: "arrivalStatus",
      width: 118,
      render: (value: RmaArrivalStatus) => <RmaArrivalTag value={value} />
    },
    {
      title: "检测结论",
      dataIndex: "conclusion",
      key: "conclusion",
      width: 108,
      render: (value: RmaConclusion) => <RmaConclusionTag value={value} />
    },
    {
      title: "处理方式",
      dataIndex: "decisionMethod",
      key: "decisionMethod",
      width: 96,
      render: (value: RmaDecisionMethod) => <RmaDecisionTag value={value} />
    },
    {
      title: "当前设备状态",
      key: "deviceLifecycle",
      width: 112,
      render: (_, record) => {
        const device = deviceBySn.get(record.sn);
        return device ? <LifecycleTag value={device.lifecycle} /> : DASH;
      }
    },
    {
      title: "发起时间",
      dataIndex: "createdAt",
      key: "createdAt",
      defaultSortOrder: "descend",
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
      width: 152,
      render: (value: string) => <span className="device-ops-num">{value}</span>
    },
    {
      title: "关闭时间",
      dataIndex: "closedAt",
      key: "closedAt",
      responsive: ["xl"],
      width: 152,
      render: (value: string | null) => <span className="device-ops-num">{value ?? DASH}</span>
    },
    {
      title: "操作",
      key: "actions",
      className: "device-ops-col-actions",
      fixed: "right",
      render: (_, record) => {
        const device = deviceBySn.get(record.sn);
        const canDecideTask =
          record.arrivalStatus === "inspected" && record.decisionMethod === "pending_decision" && device?.lifecycle === "rma";
        const scrapped = device?.lifecycle === "scrapped";
        return (
          <Space size={0}>
            <Button onClick={() => setDetailId(record.id)} size="small" type="link">
              查看
            </Button>
            {record.arrivalStatus === "pending" &&
              guard(
                "production:rma:create",
                <Button disabled={readonly} onClick={() => openEdit(record)} size="small" type="link">
                  编辑
                </Button>
              )}
            {record.arrivalStatus === "pending" &&
              guard(
                "production:rma:inspect",
                <Popconfirm
                  cancelText="取消"
                  okText="确认到件"
                  onConfirm={() => doConfirmArrival(record.id)}
                  title="确认设备实物已到仓？"
                >
                  <Button disabled={readonly} size="small" type="link">
                    确认到件
                  </Button>
                </Popconfirm>
              )}
            {(record.arrivalStatus === "arrived_pending_check" || record.arrivalStatus === "inspecting") &&
              guard(
                "production:rma:inspect",
                <Button disabled={readonly} onClick={() => openInspect(record.id)} size="small" type="link">
                  录入检测
                </Button>
              )}
            {/* 行操作规则（interaction-decisions §5）：只露出与检测结论相符的裁决，其余两种不显示 */}
            {canDecideTask &&
              RMA_DECISIONS.filter((method) => record.conclusion === method).map((method) =>
                guard(
                  "production:rma:decision",
                  <Button
                    disabled={readonly}
                    key={method}
                    onClick={() => openDecision(record.id, method)}
                    size="small"
                    type="link"
                  >
                    {rmaDecisionMeta[method].label}
                  </Button>
                )
              )}
            {scrapped &&
              guard(
                "production:rma:export",
                <Button disabled={readonly} onClick={() => exportScrapCert(record)} size="small" type="link">
                  导出报废凭证
                </Button>
              )}
          </Space>
        );
      }
    }
  ];
  const visibleColumns = columns.filter((column) => !hiddenColumns.includes(String(column.key)));

  const moreCount = activeRmaMoreCount(draft);

  const emptyText =
    dataState === "empty" ? (
      <Empty
        description={
          <span>
            暂无退货 RMA 单
            <br />
            <span className="rma-empty-sub">需要退货，点右上角「新建 RMA 单」</span>
          </span>
        }
      >
        {guard(
          "production:rma:create",
          <Button disabled={readonly} icon={<PlusOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => setCreateOpen(true)} type="primary">
            新建 RMA 单
          </Button>
        )}
      </Empty>
    ) : (
      <Empty description="没有符合条件的 RMA 单，请调整筛选条件后重新查询">
        <Button onClick={resetFilters}>重置筛选</Button>
      </Empty>
    );

  const retry = () => {
    const next = new URLSearchParams(search);
    next.delete("dataState");
    navigate(`${appPath("/exceptions/rma")}${next.size ? `?${next}` : ""}`);
  };

  // 详情抽屉底部至多一个 primary，按状态机收敛；到件确认与录入检测挂 inspect，裁决挂 decision。
  const detailFooter = (() => {
    if (!current) return undefined;
    const device = deviceBySn.get(current.sn);
    if (current.arrivalStatus === "pending") {
      return guard(
        "production:rma:inspect",
        <Popconfirm cancelText="取消" okText="确认到件" onConfirm={() => doConfirmArrival(current.id)} title="确认设备实物已到仓？">
          <Button disabled={readonly} type="primary">
            确认到件
          </Button>
        </Popconfirm>
      );
    }
    if (current.arrivalStatus === "arrived_pending_check" || current.arrivalStatus === "inspecting") {
      return guard(
        "production:rma:inspect",
        <Button disabled={readonly} onClick={() => openInspect(current.id)} type="primary">
          录入检测
        </Button>
      );
    }
    if (current.arrivalStatus === "inspected" && current.decisionMethod === "pending_decision" && device?.lifecycle === "rma") {
      return guard(
        "production:rma:decision",
        <Button disabled={readonly} onClick={() => openDecision(current.id, current.conclusion as Decision)} type="primary">
          处理裁决
        </Button>
      );
    }
    if (device?.lifecycle === "scrapped") {
      return guard(
        "production:rma:export",
        <Button disabled={readonly} onClick={() => exportScrapCert(current)} type="primary">
          导出报废凭证
        </Button>
      );
    }
    return undefined;
  })();

  const renderDetail = (record: RmaRecord) => {
    const device = deviceBySn.get(record.sn);
    const history = passportEventsBySn(passportEvents, record.sn).filter((event) =>
      ["received", "flash", "testing", "inbound", "shipped", "rma"].includes(event.kind)
    );
    return (
      <>
        <section className="rma-section">
          <h3>单据信息</h3>
          <dl className="rma-kv">
            <div>
              <dt>SN</dt>
              <dd>
                <Typography.Text className="device-ops-sn" copyable={{ text: record.sn, tooltips: ["复制 SN", "已复制"] }}>
                  <a href={deviceHref(record.sn)}>{record.sn}</a>
                </Typography.Text>
              </dd>
            </div>
            <div><dt>机型</dt><dd>{record.model}</dd></div>
            <div><dt>退货原因</dt><dd><Tag color={rmaReasonMeta[record.reasonCode].color}>{rmaReasonMeta[record.reasonCode].label}</Tag></dd></div>
            <div><dt>退货来源</dt><dd><Tag color={rmaSourceMeta[record.source].color}>{rmaSourceMeta[record.source].label}</Tag></dd></div>
            <div><dt>发起人</dt><dd>{record.initiator}</dd></div>
            <div><dt>发起时间</dt><dd className="device-ops-num">{record.createdAt}</dd></div>
            <div><dt>预计到件日期</dt><dd className="device-ops-num">{record.expectedArrivalDate ?? DASH}</dd></div>
            <div><dt>到件时间</dt><dd className="device-ops-num">{record.arrivedAt ?? DASH}</dd></div>
            <div className="rma-kv-wide"><dt>问题描述</dt><dd>{record.description ?? DASH}</dd></div>
            <div className="rma-kv-wide"><dt>附件</dt><dd>{attachmentList(record.attachments)}</dd></div>
          </dl>
        </section>
        <section className="rma-section">
          <h3>进度状态</h3>
          <dl className="rma-kv">
            <div><dt>到件状态</dt><dd><RmaArrivalTag value={record.arrivalStatus} /></dd></div>
            <div><dt>检测结论</dt><dd><RmaConclusionTag value={record.conclusion} /></dd></div>
            <div><dt>处理方式</dt><dd><RmaDecisionTag value={record.decisionMethod} /></dd></div>
            <div><dt>当前设备状态</dt><dd>{device ? <LifecycleTag value={device.lifecycle} /> : DASH}</dd></div>
            <div><dt>发起时间</dt><dd className="device-ops-num">{record.createdAt}</dd></div>
            <div><dt>关闭时间</dt><dd className="device-ops-num">{record.closedAt ?? DASH}</dd></div>
          </dl>
        </section>
        <section className="rma-section">
          <h3>检测与裁决</h3>
          <dl className="rma-kv">
            <div><dt>检测人员</dt><dd>{record.inspector ?? DASH}</dd></div>
            <div><dt>检测时间</dt><dd className="device-ops-num">{record.inspectedAt ?? DASH}</dd></div>
            <div><dt>外观评分</dt><dd>{record.appearanceScore ?? DASH}</dd></div>
            <div><dt>功能检测</dt><dd>{record.functionChecks.length ? record.functionChecks.join("、") : DASH}</dd></div>
            <div className="rma-kv-wide"><dt>检测备注</dt><dd>{record.inspectNote ?? DASH}</dd></div>
            <div className="rma-kv-wide"><dt>检测附件</dt><dd>{attachmentList(record.inspectAttachments)}</dd></div>
            <div><dt>裁决人员</dt><dd>{record.decidedBy ?? DASH}</dd></div>
            <div><dt>裁决时间</dt><dd className="device-ops-num">{record.decidedAt ?? DASH}</dd></div>
            <div><dt>预计返修完成</dt><dd className="device-ops-num">{record.expectedRepairDate ?? DASH}</dd></div>
            <div className="rma-kv-wide"><dt>裁决说明</dt><dd>{record.decisionNote ?? DASH}</dd></div>
          </dl>
        </section>
        <section className="rma-section">
          <h3>设备履历关联</h3>
          {history.length === 0 ? (
            <span className="device-ops-muted">暂无该 SN 的履历记录</span>
          ) : (
            <ul className="rma-history">
              {history.map((event) => (
                <li key={event.id}>
                  <span className="rma-history__kind">{event.label}</span>
                  <span className="rma-history__body">
                    {event.summary}
                    <span className="rma-history__at">{event.at}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="rma-detail-links">
            <a href={`${appPath(`/lifecycle/passport/${record.sn}`)}?from=${encodeURIComponent(returnUrl)}`}>查看完整护照</a>
          </p>
        </section>
      </>
    );
  };

  const selectedRecords = rows.filter((record) => selectedKeys.includes(record.id));
  const ineligibleCount = rmaCloseEligibility(selectedRecords, (sn) => deviceBySn.get(sn)).ineligibleCount;

  const bulkCloseSubmit = () => {
    const result = deviceOpsStore.closeBatch(selectedKeys);
    if (!showResult(result, "批量关闭失败")) return;
    setBulkCloseOpen(false);
    setSelectedKeys([]);
    message.success(`已关闭 ${selectedKeys.length} 条 RMA 单，关闭后不可重新开启`);
  };

  // 上传只记元数据（文件名、大小、类型），不真实上传（批 1 页面卡裁决）。
  const beforeUploadFor = (files: UploadFile[], limit: number, maxMB: number) => (file: UploadFile) => {
    if ((file.size ?? 0) > maxMB * 1024 * 1024) {
      message.error(`「${file.name}」超过 ${maxMB}MB，请压缩后再添加`);
      return Upload.LIST_IGNORE;
    }
    if (files.length >= limit) {
      message.warning(`附件最多 ${limit} 个`);
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  return (
    <div className="device-ops-stack">
      <header className="device-ops-title-row">
        <h1 className="device-ops-title">退货 RMA</h1>
        {guard(
          "production:rma:create",
          <Button disabled={readonly} icon={<PlusOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => setCreateOpen(true)} type="primary">
            新建 RMA 单
          </Button>
        )}
      </header>

      <section aria-label="筛选" className="device-ops-panel">
        <Form layout="vertical" onFinish={runQuery}>
          <div className="device-ops-filters">
            <Form.Item label="RMA 单号">
              <Input
                allowClear
                onChange={(event) => patchDraft({ rmaId: event.target.value })}
                onPressEnter={runQuery}
                placeholder="输入完整或部分单号，4 位起生效"
                value={draft.rmaId}
              />
            </Form.Item>
            <Form.Item label="SN">
              <Input
                allowClear
                onChange={(event) => patchDraft({ sn: normalizeRmaSnInput(event.target.value) })}
                onPressEnter={runQuery}
                placeholder="输入完整 SN，精确匹配"
                value={draft.sn}
              />
            </Form.Item>
            <Form.Item label="到件状态">
              <Select
                allowClear
                maxTagCount="responsive"
                mode="multiple"
                onChange={(value) => patchDraft({ arrivalStatuses: value })}
                options={arrivalStatusOptions}
                placeholder="全部状态"
                value={draft.arrivalStatuses}
              />
            </Form.Item>
            <Form.Item label="检测结论">
              <Select
                allowClear
                maxTagCount="responsive"
                mode="multiple"
                onChange={(value) => patchDraft({ conclusions: value })}
                options={conclusionOptions}
                placeholder="全部结论"
                value={draft.conclusions}
              />
            </Form.Item>
          </div>
          {moreOpen && (
            <div className="device-ops-filters device-ops-filters--more">
              <Form.Item label="机型">
                <Select
                  allowClear
                  maxTagCount="responsive"
                  mode="multiple"
                  onChange={(value) => patchDraft({ deviceModels: value })}
                  options={modelOptions}
                  placeholder="全部机型"
                  value={draft.deviceModels}
                />
              </Form.Item>
              <Form.Item label="退货原因">
                <Select
                  allowClear
                  maxTagCount="responsive"
                  mode="multiple"
                  onChange={(value) => patchDraft({ reasons: value })}
                  options={rmaReasonOptions}
                  placeholder="全部原因"
                  value={draft.reasons}
                />
              </Form.Item>
              <Form.Item label="退货来源">
                <Select
                  allowClear
                  maxTagCount="responsive"
                  mode="multiple"
                  onChange={(value) => patchDraft({ sources: value })}
                  options={rmaSourceOptions}
                  placeholder="全部来源"
                  value={draft.sources}
                />
              </Form.Item>
              <Form.Item label="处理方式">
                <Select
                  allowClear
                  maxTagCount="responsive"
                  mode="multiple"
                  onChange={(value) => patchDraft({ decisions: value })}
                  options={decisionOptions}
                  placeholder="全部处理方式"
                  value={draft.decisions}
                />
              </Form.Item>
              <Form.Item label="发起时间">
                <DatePicker.RangePicker
                  disabledDate={(current, info) =>
                    // 与起始日相差超过 366 天的日期不可选（单次范围 ≤366 天）。
                    createdStart && (info as { range?: string }).range === "end" ? Math.abs(current.diff(createdStart, "day")) > 366 : false
                  }
                  onCalendarChange={(values) => setCreatedStart(values?.[0] ?? null)}
                  onChange={(values) =>
                    patchDraft({ createdRange: values?.[0] && values[1] ? [values[0].format("YYYY-MM-DD"), values[1].format("YYYY-MM-DD")] : null })
                  }
                  value={draft.createdRange ? [dayjs(draft.createdRange[0]), dayjs(draft.createdRange[1])] : null}
                />
              </Form.Item>
              <Form.Item label="关闭时间">
                <DatePicker.RangePicker
                  onChange={(values) =>
                    patchDraft({ closedRange: values?.[0] && values[1] ? [values[0].format("YYYY-MM-DD"), values[1].format("YYYY-MM-DD")] : null })
                  }
                  value={draft.closedRange ? [dayjs(draft.closedRange[0]), dayjs(draft.closedRange[1])] : null}
                />
              </Form.Item>
            </div>
          )}
          <div className="device-ops-filters__actions">
            <Button aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)} type="link">
              {moreOpen ? "收起更多筛选" : moreCount > 0 ? `更多筛选（已设 ${moreCount} 项）` : "更多筛选"}
              <DownOutlined className={moreOpen ? "device-ops-flip" : undefined} aria-hidden="true" aria-label={undefined} />
            </Button>
            <Space>
              <Button onClick={resetFilters} type="text">重置</Button>
              <Button htmlType="submit" type="primary">查询</Button>
            </Space>
          </div>
        </Form>
      </section>

      <section aria-label="RMA 单列表" className="device-ops-panel device-ops-panel--table">
        <div className="device-ops-toolbar">
          <span className="device-ops-toolbar__count">
            共 <strong className="device-ops-num">{dataState === "loading" || dataState === "error" ? DASH : rows.length}</strong> 条
            {selectedKeys.length > 0 && <>，已选 <strong className="device-ops-num">{selectedKeys.length}</strong> 项</>}
          </span>
          <Space>
            <Button aria-label="刷新" icon={<ReloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => message.success("已刷新到最新数据")} type="text" />
            {guard(
              "production:rma:export",
              <Button disabled={readonly} icon={<DownloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={exportAll}>
                导出
              </Button>
            )}
            <Popover
              content={
                <Checkbox.Group
                  className="device-ops-column-setting"
                  onChange={(checked) => {
                    const hidden = optionalColumns.map((item) => item.key).filter((key) => !checked.includes(key));
                    setHiddenColumns(hidden);
                    writeHiddenColumns(hidden);
                  }}
                  options={optionalColumns.map((item) => ({ value: item.key, label: item.label }))}
                  value={optionalColumns.map((item) => item.key).filter((key) => !hiddenColumns.includes(key))}
                />
              }
              placement="bottomRight"
              trigger="click"
            >
              <Button icon={<SettingOutlined aria-hidden="true" aria-label={undefined} />}>列设置</Button>
            </Popover>
          </Space>
        </div>
        {dataState === "error" ? (
          <Alert
            action={<Button onClick={retry} size="small">重试</Button>}
            description="网络异常或服务暂时不可用，请稍后重试。"
            showIcon
            title="RMA 单列表加载失败"
            type="error"
          />
        ) : dataState === "loading" ? (
          <Skeleton active paragraph={{ rows: 8 }} title={false} />
        ) : (
          <Table<RmaRecord>
            columns={visibleColumns}
            dataSource={dataState === "empty" ? [] : rows}
            locale={{ emptyText }}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], showSizeChanger: true, showTotal: (count) => `共 ${count} 条` }}
            rowKey="id"
            rowSelection={{ selectedRowKeys: selectedKeys, onChange: (keys) => setSelectedKeys(keys as string[]) }}
            scroll={{ x: "max-content" }}
          />
        )}
      </section>

      {selectedKeys.length > 0 && (
        <div aria-label="批量操作" className="device-ops-selection-bar" role="region">
          <span>已选 <strong className="device-ops-num">{selectedKeys.length}</strong> 项</span>
          <Space>
            {guard(
              "production:rma:export",
              <Button disabled={readonly} onClick={() => message.success(`已提交导出任务（选中 ${selectedKeys.length} 条），完成后将通过站内信通知`)} type="primary">
                批量导出选中
              </Button>
            )}
            {guard(
              "production:rma:close",
              <Tooltip title={ineligibleCount > 0 ? `所选项中有 ${ineligibleCount} 条不满足关闭条件（需已裁决且设备已离开退货流程）` : undefined}>
                <Button disabled={readonly || ineligibleCount > 0} onClick={() => setBulkCloseOpen(true)}>
                  批量关闭
                </Button>
              </Tooltip>
            )}
            <Button onClick={() => setSelectedKeys([])}>取消选择</Button>
          </Space>
        </div>
      )}

      {/* 详情抽屉 720px：单据信息 / 进度状态 / 检测与裁决 / 设备履历关联四区。 */}
      <Drawer
        destroyOnHidden
        footer={detailFooter}
        onClose={() => setDetailId(null)}
        open={current !== null}
        title={current ? `RMA 单 ${current.id}` : "RMA 单详情"}
        size={720}
      >
        {current && renderDetail(current)}
      </Drawer>

      {/* 检测抽屉 600px：提交后才流转「已检测」，取消不改变状态。 */}
      <Drawer
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={() => setInspectId(null)}>取消</Button>
            <Button loading={inspecting} onClick={submitInspect} type="primary">提交检测</Button>
          </Space>
        }
        onClose={() => setInspectId(null)}
        open={inspectRecord !== null}
        title={inspectRecord ? `录入检测 · ${inspectRecord.id}` : "录入检测"}
        size={600}
      >
        {inspectRecord && (
          <>
            <div className="rma-readonly-bar">
              <span><strong>SN</strong> {inspectRecord.sn}</span>
              <span><strong>机型</strong> {inspectRecord.model}</span>
              <span><strong>退货原因</strong> {rmaReasonMeta[inspectRecord.reasonCode].label}</span>
              <span><strong>到件时间</strong> {inspectRecord.arrivedAt ?? DASH}</span>
            </div>
            <Form form={inspectForm} layout="vertical" preserve={false}>
              <Form.Item label="检测结论" name="conclusion" rules={[{ required: true, message: "请选择检测结论" }]}>
                <Radio.Group
                  options={[
                    { value: "repair", label: "可返修" },
                    { value: "restock", label: "可二次入库" },
                    { value: "scrap", label: "报废" }
                  ]}
                />
              </Form.Item>
              <Form.Item label="外观评分" name="appearanceScore" rules={[{ required: true, message: "请选择外观评分" }]}>
                <Radio.Group options={rmaAppearanceScores.map((value) => ({ value, label: value }))} />
              </Form.Item>
              <Form.Item label="功能检测" name="functionChecks" rules={[{ min: 1, required: true, type: "array", message: "功能检测至少选择 1 项" }]}>
                <Select mode="multiple" options={functionCheckOptions} placeholder="至少选择 1 项" />
              </Form.Item>
              <Form.Item
                label="检测备注"
                name="inspectNote"
                rules={[{ ...NOT_BLANK_RULE, required: inspectConclusion === "scrap", message: "检测结论为「报废」时检测备注必填" }, { max: 1000, message: "检测备注不超过 1000 字" }]}
              >
                <Input.TextArea maxLength={1000} placeholder={inspectConclusion === "scrap" ? "报废结论必填备注" : "补充检测情况（选填）"} rows={3} showCount />
              </Form.Item>
              <Form.Item
                label="检测附件"
                extra="最多 10 个附件，单个不超过 10MB，支持 jpg / jpeg / png / pdf"
              >
                <Upload
                  accept=".jpg,.jpeg,.png,.pdf"
                  beforeUpload={beforeUploadFor(inspectFiles, 10, 10)}
                  fileList={inspectFiles}
                  onChange={({ fileList }) => setInspectFiles(fileList.slice(0, 10))}
                >
                  <Button icon={<UploadOutlined aria-hidden="true" aria-label={undefined} />}>添加附件</Button>
                </Upload>
              </Form.Item>
              <div className="device-ops-form-row">
                <Form.Item label="检测人员工号">
                  <Input readOnly value="运维 · 周启明" />
                </Form.Item>
                <Form.Item label="检测时间">
                  <Input readOnly value="提交时自动填入" />
                </Form.Item>
              </div>
            </Form>
          </>
        )}
      </Drawer>

      {/* 新建 RMA 单 600px：基本信息 / 详情补充两组；到件前可编辑。 */}
      <Modal
        cancelText="取消"
        destroyOnHidden
        okText="确认创建"
        onCancel={() => {
          setCreateOpen(false);
          setCreatePrefill(null);
        }}
        onOk={submitCreate}
        open={createOpen}
        title="新建 RMA 单"
        width={600}
      >
        <p className="device-ops-modal-note">SN 需存在且当前为出货状态；同一 SN 在退货流程未关闭时不可重复发起。</p>
        <Form
          form={createForm}
          initialValues={
            createPrefill
              ? {
                  sn: createPrefill.sn || undefined,
                  description: createPrefill.sourceFeedbackId ? `由客户反馈工单 ${createPrefill.sourceFeedbackId} 转入退货：` : undefined
                }
              : undefined
          }
          layout="vertical"
          preserve={false}
        >
          <h3 className="rma-form-group">基本信息</h3>
          <Form.Item
            label="SN"
            name="sn"
            normalize={normalizeRmaSnInput}
            rules={[{ required: true, message: "请输入 SN" }, { message: "SN 只能包含数字与大写字母", pattern: /^[A-Z0-9]+$/ }]}
          >
            <Input placeholder="输入设备 SN，自动转大写" />
          </Form.Item>
          <div className="device-ops-form-row">
            <Form.Item label="退货原因" name="reasonCode" rules={[{ required: true, message: "请选择退货原因" }]}>
              <Select options={rmaReasonOptions} placeholder="请选择" />
            </Form.Item>
            <Form.Item label="退货来源" name="source" rules={[{ required: true, message: "请选择退货来源" }]}>
              <Select options={rmaSourceOptions} placeholder="请选择" />
            </Form.Item>
          </div>
          <Form.Item label="预计到件日期" name="expectedArrivalDate">
            <DatePicker
              className="device-ops-full"
              disabledDate={(current) => current.isBefore(TODAY, "day") || current.isAfter(TODAY.add(90, "day"), "day")}
              format="YYYY-MM-DD"
              placeholder={`今日起 90 天内（${TODAY.format("YYYY-MM-DD")} 起算）`}
            />
          </Form.Item>
          <h3 className="rma-form-group">详情补充</h3>
          <Form.Item
            label="问题描述"
            name="description"
            rules={[{ ...NOT_BLANK_RULE, required: createReason === "other", message: "原因选择「其他」时请填写问题描述" }, { max: 500, message: "问题描述不超过 500 字" }]}
          >
            <Input.TextArea maxLength={500} placeholder={createReason === "other" ? "请描述具体问题" : "补充设备现象或用户诉求（选填）"} rows={4} showCount />
          </Form.Item>
          <Form.Item label="附件" extra="最多 5 个附件，单个不超过 20MB，支持 jpg / jpeg / png / mp4 / mov">
            <Upload
              accept=".jpg,.jpeg,.png,.mp4,.mov"
              beforeUpload={beforeUploadFor(createFiles, 5, 20)}
              fileList={createFiles}
              onChange={({ fileList }) => setCreateFiles(fileList.slice(0, 5))}
            >
              <Button icon={<UploadOutlined aria-hidden="true" aria-label={undefined} />}>添加附件</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑（仅待到件阶段）：原因码 / 来源 / 描述，到件后锁定。 */}
      <Modal
        cancelText="取消"
        destroyOnHidden
        okText="保存修改"
        onCancel={() => setEditing(null)}
        onOk={submitEdit}
        open={editing !== null}
        title={editing ? `编辑 RMA 单 ${editing.id}` : "编辑 RMA 单"}
        width={600}
      >
        <p className="device-ops-modal-note">设备到件后单据锁定，仅待到件阶段可修改。</p>
        <Form form={editForm} layout="vertical" preserve={false}>
          <div className="device-ops-form-row">
            <Form.Item label="退货原因" name="reasonCode" rules={[{ required: true, message: "请选择退货原因" }]}>
              <Select options={rmaReasonOptions} placeholder="请选择" />
            </Form.Item>
            <Form.Item label="退货来源" name="source" rules={[{ required: true, message: "请选择退货来源" }]}>
              <Select options={rmaSourceOptions} placeholder="请选择" />
            </Form.Item>
          </div>
          <Form.Item
            label="问题描述"
            name="description"
            rules={[{ ...NOT_BLANK_RULE, required: editReason === "other", message: "原因选择「其他」时请填写问题描述" }, { max: 500, message: "问题描述不超过 500 字" }]}
          >
            <Input.TextArea maxLength={500} placeholder={editReason === "other" ? "请描述具体问题" : "补充设备现象或用户诉求（选填）"} rows={4} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 裁决 520px（C 档）：警示 + 只读信息 + 流转说明；确认按钮「确认裁决」，报废时 danger。 */}
      <Modal
        cancelText="取消"
        confirmLoading={deciding}
        destroyOnHidden
        okButtonProps={{ danger: decision?.method === "scrap" }}
        okText="确认裁决"
        onCancel={() => setDecision(null)}
        onOk={submitDecide}
        open={decision !== null && decideRecord !== null}
        title={decision && decideRecord ? `处理裁决 · ${decideRecord.id}` : "处理裁决"}
        width={520}
      >
        {decision && decideRecord && (
          <>
            <Alert showIcon title="变更设备状态，不可撤销" type="warning" />
            {decideError && <Alert className="rma-modal-alert" showIcon title={`裁决失败：${decideError}`} type="error" />}
            <div className="rma-decide-summary">
              <div className="rma-decide-row">
                <span className="rma-decide-key">RMA 单号</span>
                {decideRecord.id}
              </div>
              <div className="rma-decide-row">
                <span className="rma-decide-key">SN</span>
                <a href={deviceHref(decideRecord.sn)}>{decideRecord.sn}</a>
              </div>
              <div className="rma-decide-row">
                <span className="rma-decide-key">检测结论</span>
                <RmaConclusionTag value={decideRecord.conclusion} />
              </div>
              <div className="rma-decide-row">
                <span className="rma-decide-key">预选处理方式</span>
                <RmaDecisionTag value={decision.method} />
              </div>
              <div className="rma-decide-row">
                <span className="rma-decide-key">流转说明</span>
                {rmaDecisionFlowText(decision.method)}
              </div>
            </div>
            <Form form={decideForm} layout="vertical" preserve={false}>
              <Form.Item
                label="裁决说明"
                name="decisionNote"
                rules={[{ ...NOT_BLANK_RULE, required: decision.method === "scrap", message: "报废裁决说明必填" }, { max: 500, message: "裁决说明不超过 500 字" }]}
              >
                <Input.TextArea maxLength={500} placeholder={decision.method === "scrap" ? "报废裁决必填说明" : "补充裁决依据（选填）"} rows={3} showCount />
              </Form.Item>
              {decision.method === "repair" && (
                <Form.Item label="预计返修完成日期" name="expectedRepairDate" rules={[{ required: true, message: "返修裁决请填写预计返修完成日期" }]}>
                  <DatePicker
                    className="device-ops-full"
                    disabledDate={(current) => current.isBefore(TODAY, "day") || current.isAfter(TODAY.add(180, "day"), "day")}
                    format="YYYY-MM-DD"
                    placeholder={`今日起 180 天内（${TODAY.format("YYYY-MM-DD")} 起算）`}
                  />
                </Form.Item>
              )}
              <Form.Item label="裁决人员工号">
                <Input readOnly value="运维 · 周启明" />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* 批量关闭（C 档）：写清对象、数量与后果。 */}
      <Modal
        cancelText="取消"
        okText="确认关闭"
        onCancel={() => setBulkCloseOpen(false)}
        onOk={bulkCloseSubmit}
        open={bulkCloseOpen}
        title="批量关闭 RMA 单"
      >
        <p>确认关闭选中的 {selectedKeys.length} 条 RMA 单？关闭后不可重新开启。</p>
        <p className="device-ops-modal-note">只有已裁决、且设备已离开退货流程的单据可以关闭。</p>
      </Modal>

    </div>
  );
}
