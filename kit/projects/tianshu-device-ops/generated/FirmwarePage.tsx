import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Progress,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Upload,
  type TableColumnsType
} from "antd";
import { DownloadOutlined, DownOutlined, ReloadOutlined, SettingOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  batches,
  firmwareSignStatusMeta,
  firmwareStatusMeta,
  firmwareVersions,
  models,
  provinces,
  pushResultMeta,
  pushTaskStatusMeta,
  type FirmwareSignStatus,
  type FirmwareStatus,
  type FirmwareVersion,
  type PushDeviceResult,
  type PushResultStatus,
  type PushTask,
  type PushTaskStatus
} from "../data";
import { deviceOpsStore, useDeviceOpsState } from "../store";
import {
  FirmwareSignStatusTag,
  FirmwareStatusTag,
  LifecycleTag,
  PushResultTag,
  PushTaskStatusTag,
  appPath,
  returnUrlFrom,
  useDataState,
  usePermission,
  useQueryParams,
  useRouter
} from "../ui";
import "./firmware.css";
import {
  FIRMWARE_STORAGE_KEYS,
  boundDeviceCountByVersion,
  boundDevicesForVersion,
  bulkDisableEligible,
  derivePushTaskRows,
  deriveVersionRows,
  estimatePushTarget,
  filterPushResults,
  firmwarePublishers,
  firmwareTabNeedsNormalization,
  initialFirmwareState,
  kmsKeyLabel,
  parseSnList,
  pushResultFailedCount,
  pushTaskCreators,
  pushTaskModelOptions,
  pushTaskMoreActive,
  pushableVersions,
  ratioRangeError,
  relatedTasksForVersion,
  resolveFirmwareTab,
  rollbackCandidates,
  rollbackConfirmDisabled,
  targetingText,
  versionMoreCount,
  windowText,
  type FirmwareTab,
  type TaskFilters,
  type VersionFilters,
  emptyTaskFilters,
  emptyVersionFilters
} from "../core/firmware";
import { writeStored } from "../core/storage";

const DASH = "—";
function writeStorage(key: string, value: unknown) {
  writeStored(window.sessionStorage, key, value);
}

function toOptions<T extends string>(map: Record<T, { label: string }>) {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value].label }));
}
const modelOptions = models.map((value) => ({ value, label: value }));
const batchOptions = batches.map((value) => ({ value, label: value }));
const provinceOptions = provinces.map((value) => ({ value, label: value }));
const currentFirmwareOptions = firmwareVersions.map((value) => ({ value, label: value }));

const fmtNum = (value: number) => value.toLocaleString("zh-CN");

// 无权限置灰与悬停说明统一走 ui.tsx 的 guard()（span 承接层已在共享层处理）。
function summaryCell(summary: PushTask["summary"]) {
  return (
    <span className="device-ops-num">
      {fmtNum(summary.success)}
      {" / "}
      {summary.failed > 0 ? <span className="firmware-fail">{fmtNum(summary.failed)}</span> : fmtNum(summary.failed)}
      {" / "}
      {fmtNum(summary.total)}
    </span>
  );
}

function failureRateCell(task: PushTask) {
  const risk = task.failureRate > task.circuitThreshold;
  return (
    <span className={risk ? "firmware-fail-rate" : "device-ops-num"} title={`熔断阈值 ${task.circuitThreshold}%`}>
      {task.failureRate}%
    </span>
  );
}

// 页签统一用登记的 antd Tabs（2026-09-29 集成替换自造链接页签与抽屉页签）：
// 双 Tab 仍与 ?tab= 同步——切换时 navigate 到对应地址，刷新与直接打开落在同一状态，各 Tab 地址可分享。
const mainTabItems: Array<{ key: FirmwareTab; label: string }> = [
  { key: "version", label: "固件版本" },
  { key: "push-task", label: "推送任务" }
];

function DescItem({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "firmware-desc__item firmware-desc__item--wide" : "firmware-desc__item"}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

type VersionDrawerProps = {
  versionId: string;
  initialTab: string;
  onClose: () => void;
  taskHref: (taskId: string) => string;
  deviceHref: (sn: string) => string;
  newTaskHref: (versionId: string) => string;
};

function VersionDrawer({ versionId, initialTab, onClose, taskHref, deviceHref, newTaskHref }: VersionDrawerProps) {
  const { message } = App.useApp();
  const { readonly, guard } = usePermission();
  const { firmwareVersions: versions, pushTasks, devices } = useDeviceOpsState();
  const [tab, setTab] = useState(initialTab);
  const version = versions.find((item) => item.id === versionId);
  const boundDevices = useMemo(() => (version ? boundDevicesForVersion(devices, version) : []), [devices, version]);
  const relatedTasks = useMemo(() => (version ? relatedTasksForVersion(pushTasks, version) : []), [pushTasks, version]);

  if (!version) {
    return (
      <Drawer destroyOnHidden onClose={onClose} open title="固件版本详情" size={880}>
        <Empty description={`未找到固件版本 ${versionId}，可能已被删除`} />
      </Drawer>
    );
  }

  const boundColumns: TableColumnsType<(typeof boundDevices)[number]> = [
    {
      title: "SN",
      dataIndex: "sn",
      key: "sn",
      render: (sn: string) => <a href={deviceHref(sn)}>{sn}</a>
    },
    { title: "机型", dataIndex: "model", key: "model" },
    { title: "生命周期状态", dataIndex: "lifecycle", key: "lifecycle", render: (value: (typeof boundDevices)[number]["lifecycle"]) => <LifecycleTag value={value} /> }
  ];
  const taskColumns: TableColumnsType<PushTask> = [
    { title: "任务名称", dataIndex: "name", key: "name", render: (name: string, task) => <a href={taskHref(task.id)}>{name}</a> },
    { title: "任务状态", dataIndex: "status", key: "status", render: (value: PushTaskStatus) => <PushTaskStatusTag value={value} /> },
    { title: "灰度比例", dataIndex: "ratio", key: "ratio", render: (value: number) => <span className="device-ops-num">{value}%</span> },
    { title: "成功 / 失败 / 总数", key: "summary", render: (_, task) => summaryCell(task.summary) },
    { title: "创建时间", dataIndex: "createdAt", key: "createdAt", render: (value: string) => <span className="device-ops-num">{value}</span> }
  ];

  const canPush = version.status === "testing" || version.status === "canary";

  return (
    <Drawer
      destroyOnHidden
      footer={
        canPush
          ? guard(
              "新建推送任务",
              <Button disabled={readonly} href={newTaskHref(version.id)} type="primary">
                新建推送任务
              </Button>
            )
          : null
      }
      onClose={onClose}
      open
      title={`固件版本 ${version.version}`}
      size={880}
    >
      <Tabs
        activeKey={tab}
        items={[
          { key: "basic", label: "基本信息" },
          { key: "bindings", label: "绑定设备" },
          { key: "tasks", label: "推送任务" },
          { key: "history", label: "操作历史" }
        ]}
        onChange={setTab}
        size="small"
      />
      {tab === "basic" && (
        <section aria-label="版本基本信息">
          <dl className="firmware-desc">
            <DescItem label="固件版本号">{version.version}</DescItem>
            <DescItem label="版本状态">
              <FirmwareStatusTag value={version.status} />
            </DescItem>
            <DescItem label="适用机型">
              <Space size={4} wrap>
                {version.models.map((model) => (
                  <Tag key={model}>{model}</Tag>
                ))}
              </Space>
            </DescItem>
            <DescItem label="签名状态">
              <Space size={8} wrap>
                <FirmwareSignStatusTag value={version.signStatus} />
                {version.signStatus === "sign_failed" &&
                  guard(
                    "发布",
                    <Button
                      disabled={readonly}
                      onClick={() => {
                        // A 档直接执行：状态回到签名中（store 动作），轻提示稍后刷新查看结果。
                        const result = deviceOpsStore.retrySign(version.id);
                        if (result.ok) message.info("签名任务已触发，请稍后刷新查看结果");
                        else message.error(`操作失败：${result.reason}，状态未变化`);
                      }}
                      size="small"
                    >
                      重新触发签名
                    </Button>
                  )}
              </Space>
            </DescItem>
            <DescItem label="发布人">{version.publisher ?? DASH}</DescItem>
            <DescItem label="发布时间">
              <span className="device-ops-num">{version.releasedAt ?? DASH}</span>
            </DescItem>
            <DescItem label="目标版本说明" wide>
              {version.note ?? DASH}
            </DescItem>
            <DescItem label="关联问题单号" wide>
              {version.issueId ?? DASH}
            </DescItem>
            <DescItem label="固件包" wide>
              {version.package ? (
                <>
                  {version.package.fileName}
                  <span className="device-ops-muted">（{(version.package.sizeBytes / 1024 / 1024).toFixed(1)} MB · MD5 {version.package.md5}）</span>
                </>
              ) : (
                "未上传"
              )}
            </DescItem>
            <DescItem label="签名方式" wide>
              {version.signMethod === "kms" ? `KMS 自动签名（密钥 ${kmsKeyLabel(version.id)}）` : "手动上传签名文件"}
            </DescItem>
            <DescItem label="变更日志" wide>
              {version.changelog}
            </DescItem>
          </dl>
        </section>
      )}
      {tab === "bindings" && (
        <section aria-label="绑定设备">
          <p className="device-ops-modal-note">已出货且运行 {version.version} 版本的设备共 {boundDevices.length} 台。</p>
          <Table
            columns={boundColumns}
            dataSource={boundDevices}
            locale={{ emptyText: <Empty description="暂无绑定设备" /> }}
            pagination={boundDevices.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
            rowKey="sn"
            size="small"
          />
        </section>
      )}
      {tab === "tasks" && (
        <section aria-label="关联推送任务">
          <Table
            columns={taskColumns}
            dataSource={relatedTasks}
            locale={{ emptyText: <Empty description="该版本还没有推送任务" /> }}
            pagination={false}
            rowKey={(task) => `${task.id}|${task.createdAt}`}
            size="small"
          />
        </section>
      )}
      {tab === "history" && (
        <section aria-label="版本操作历史">
          <ol aria-label="操作历史" className="device-ops-timeline">
            {version.events.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <span className="device-ops-num device-ops-timeline__time">{event.at}</span>
                <span className="device-ops-muted">{event.operator}</span>
                <span>{event.text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Drawer>
  );
}

type TaskDrawerProps = {
  taskId: string;
  onClose: () => void;
  versionHref: (versionId: string) => string;
  deviceHref: (sn: string) => string;
};

function TaskDrawer({ taskId, onClose, versionHref, deviceHref }: TaskDrawerProps) {
  const { message } = App.useApp();
  const { readonly, guard } = usePermission();
  const { pushTasks, pushResults, firmwareVersions } = useDeviceOpsState();
  const [tab, setTab] = useState("basic");
  const [resultFilter, setResultFilter] = useState<PushResultStatus | "">("");
  const [snKeyword, setSnKeyword] = useState("");
  const task = pushTasks.find((item) => item.id === taskId);

  if (!task) {
    return (
      <Drawer destroyOnHidden onClose={onClose} open title="推送任务详情" size={960}>
        <Empty description={`未找到推送任务 ${taskId}`} />
      </Drawer>
    );
  }

  const allResults = pushResults.filter((item) => item.taskId === task.id);
  const version = firmwareVersions.find((item) => item.id === task.versionId);
  const failedCount = pushResultFailedCount(allResults);
  const rows = filterPushResults(allResults, { result: resultFilter, snKeyword });

  const resultColumns: TableColumnsType<PushDeviceResult> = [
    { title: "SN", dataIndex: "sn", key: "sn", render: (sn: string) => <a href={deviceHref(sn)}>{sn}</a> },
    { title: "起始版本", dataIndex: "fromVersion", key: "fromVersion" },
    { title: "目标版本", dataIndex: "toVersion", key: "toVersion" },
    { title: "结果", dataIndex: "result", key: "result", render: (value: PushResultStatus) => <PushResultTag value={value} /> },
    { title: "失败原因码", key: "failCode", render: (_, item) => item.failCode ?? DASH },
    { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (value: string) => <span className="device-ops-num">{value}</span> },
    {
      title: "备注",
      key: "note",
      render: (_, item) => (item.offlineNote ? <span className="device-ops-muted">{item.offlineNote}</span> : DASH)
    }
  ];

  const act = (label: string, run: () => { ok: boolean; reason?: string }) => {
    const result = run();
    if (!result.ok) {
      message.error(`操作失败：${result.reason ?? "未知原因"}，任务状态未变化`);
      return;
    }
    message.success(`任务已${label}`);
  };

  const footer = (
    <Space size={8}>
      {task.status === "running" &&
        guard(
          "暂停推送任务",
          <Popconfirm
            cancelText="取消"
            description="暂停后不再下发新设备，已开始安装的设备会继续完成。"
            disabled={readonly}
            okText="暂停"
            onConfirm={() => act("暂停", () => deviceOpsStore.pauseTask(task.id))}
            title={`暂停任务 ${task.name}？`}
          >
            <Button disabled={readonly}>暂停</Button>
          </Popconfirm>
        )}
      {task.status === "paused" &&
        guard(
          "恢复推送任务",
          <Popconfirm
            cancelText="取消"
            description="恢复后将继续向未下发的目标设备安装。"
            disabled={readonly}
            okText="恢复"
            onConfirm={() => act("恢复", () => deviceOpsStore.resumeTask(task.id))}
            title={`恢复任务 ${task.name}？`}
          >
            <Button disabled={readonly}>恢复</Button>
          </Popconfirm>
        )}
      {(task.status === "pending_exec" || task.status === "running" || task.status === "paused") &&
        guard(
          "取消推送任务",
          <Popconfirm
            cancelText="再想想"
            description="取消后不可恢复，已下发成功的设备不回滚。"
            disabled={readonly}
            okButtonProps={{ danger: true }}
            okText="取消任务"
            onConfirm={() => act("取消", () => deviceOpsStore.cancelTask(task.id))}
            title={`取消任务 ${task.name}？`}
          >
            <Button danger disabled={readonly}>
              取消任务
            </Button>
          </Popconfirm>
        )}
      {task.status === "fused" && <span className="device-ops-muted">已熔断任务不可手动恢复</span>}
    </Space>
  );

  return (
    <Drawer destroyOnHidden footer={footer} onClose={onClose} open title={`推送任务 ${task.name}`} size={960}>
      <Tabs
        activeKey={tab}
        items={[
          { key: "basic", label: "基本信息" },
          { key: "results", label: "逐台结果" },
          { key: "history", label: "操作历史" }
        ]}
        onChange={setTab}
        size="small"
      />
      {tab === "basic" && (
        <section aria-label="任务基本信息">
          <dl className="firmware-desc">
            <DescItem label="任务名称">{task.name}</DescItem>
            <DescItem label="任务状态">
              <PushTaskStatusTag value={task.status} />
            </DescItem>
            <DescItem label="目标版本">
              {version ? <a href={versionHref(version.id)}>{task.versionId}</a> : task.versionId}
            </DescItem>
            <DescItem label="机型">
              <Tag>{task.model}</Tag>
            </DescItem>
            <DescItem label="定向条件" wide>
              {targetingText(task)}
              <span className="device-ops-muted">（多组条件需同时满足）</span>
            </DescItem>
            <DescItem label="灰度比例">
              <span className="device-ops-num">{task.ratio}%</span>
            </DescItem>
            <DescItem label="执行时间窗">
              <span className="device-ops-num">{windowText(task)}</span>
            </DescItem>
            <DescItem label="失败率熔断阈值">
              <span className="device-ops-num">{task.circuitThreshold}%</span>
            </DescItem>
            <DescItem label="当前失败率">{failureRateCell(task)}</DescItem>
            <DescItem label="成功 / 失败 / 总数">{summaryCell(task.summary)}</DescItem>
            <DescItem label="创建人">{task.creator}</DescItem>
            <DescItem label="创建时间" wide>
              <span className="device-ops-num">{task.createdAt}</span>
            </DescItem>
          </dl>
        </section>
      )}
      {tab === "results" && (
        <section aria-label="逐台结果">
          <div className="firmware-result-filters">
            <Select
              allowClear
              aria-label="按结果筛选"
              className="firmware-result-filters__status"
              onChange={(value) => setResultFilter(value ?? "")}
              options={toOptions(pushResultMeta)}
              placeholder="全部结果"
              value={resultFilter || undefined}
            />
            <Input
              allowClear
              aria-label="按 SN 搜索"
              className="firmware-result-filters__sn"
              onChange={(event) => setSnKeyword(event.target.value)}
              placeholder="搜索 SN"
              value={snKeyword}
            />
            {guard(
              "导出",
              <Button
                disabled={readonly || failedCount === 0}
                icon={<DownloadOutlined aria-hidden="true" aria-label={undefined} />}
                onClick={() => message.success("已提交失败清单导出任务，完成后站内信通知")}
              >
                导出失败清单（{failedCount}）
              </Button>
            )}
          </div>
          <Table
            columns={resultColumns}
            dataSource={rows}
            locale={{ emptyText: <Empty description={allResults.length === 0 ? "任务尚未产生下发记录" : "没有符合条件的下发记录，请调整筛选条件后重新查询"} /> }}
            pagination={{ pageSize: 50, showSizeChanger: false, showTotal: (count) => `共 ${count} 条` }}
            rowKey={(item) => `${item.taskId}-${item.sn}`}
            size="small"
          />
        </section>
      )}
      {tab === "history" && (
        <section aria-label="任务操作历史">
          <ol aria-label="操作历史" className="device-ops-timeline">
            {task.events.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <span className="device-ops-num device-ops-timeline__time">{event.at}</span>
                <span className="device-ops-muted">{event.operator}</span>
                <span>{event.text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Drawer>
  );
}

type SnParseResult = { fileName: string; valid: string[]; wrongModel: string[]; duplicated: string[]; unknown: string[] };

type TaskDraft = {
  name: string;
  versionId?: string;
  model?: string;
  batches: string[];
  provinces: string[];
  fromVersions: string[];
  ratio: string;
  windowRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  threshold: string;
};

function CreateTaskDrawer({ presetVersionId, onClose }: { presetVersionId: string | null; onClose: () => void }) {
  const { message } = App.useApp();
  const { readonly, guard } = usePermission();
  const { firmwareVersions: versions } = useDeviceOpsState();
  const [form] = Form.useForm<TaskDraft>();
  const watchedVersionId = Form.useWatch("versionId", form);
  const watchedModel = Form.useWatch("model", form);
  const watchedBatches = Form.useWatch("batches", form) ?? [];
  const watchedProvinces = Form.useWatch("provinces", form) ?? [];
  const watchedFromVersions = Form.useWatch("fromVersions", form) ?? [];
  const watchedRatio = Form.useWatch("ratio", form) ?? "10";
  const [snInfo, setSnInfo] = useState<SnParseResult | null>(null);

  const candidates = pushableVersions(versions);
  const chosen = versions.find((version) => version.id === watchedVersionId);
  const taskModelOptions = pushTaskModelOptions(chosen);

  const ratioInt = Number(watchedRatio);
  const ratioValid = Number.isInteger(ratioInt) && ratioInt >= 1 && ratioInt <= 100;
  const { hit, estimate } = useMemo(
    () =>
      estimatePushTarget({
        model: watchedModel ?? null,
        batches: watchedBatches,
        provinces: watchedProvinces,
        fromVersions: watchedFromVersions,
        ratio: ratioInt,
        snList: snInfo?.valid
      }),
    [watchedModel, watchedBatches, watchedProvinces, watchedFromVersions, ratioInt, snInfo]
  );

  const parseSnFile = (fileName: string, text: string) => {
    setSnInfo({ fileName, ...parseSnList(text, deviceOpsStore.getState().devices, watchedModel ?? null) });
  };

  const readSnFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      message.error("SN 清单仅支持 .csv 文件");
      return Upload.LIST_IGNORE;
    }
    file
      .text()
      .then((text) => parseSnFile(file.name, text))
      .catch(() => message.error("SN 清单读取失败，请确认文件内容"));
    return false;
  };

  const errorCount = snInfo ? snInfo.wrongModel.length + snInfo.duplicated.length + snInfo.unknown.length : 0;
  const downloadErrorList = () => {
    if (!snInfo) return;
    const lines = [
      "类型,SN",
      ...snInfo.unknown.map((sn) => `不存在,${sn}`),
      ...snInfo.wrongModel.map((sn) => `非目标机型,${sn}`),
      ...snInfo.duplicated.map((sn) => `重复,${sn}`)
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sn-error-list-${snInfo.fileName}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const ratioRule = {
    validator: (_: unknown, value: string) => {
      const num = Number(value);
      if (!value || !Number.isInteger(num) || num < 1 || num > 100) return Promise.reject(new Error("灰度比例需为 1–100 的整数"));
      return Promise.resolve();
    }
  };
  const thresholdRule = {
    validator: (_: unknown, value: string) => {
      const num = Number(value);
      if (!value || !Number.isInteger(num) || num < 1 || num > 100) return Promise.reject(new Error("熔断阈值需为 1–100 的整数"));
      return Promise.resolve();
    }
  };

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values || !values.versionId || !values.model) return;
    const result = deviceOpsStore.createPushTask({
      name: values.name,
      versionId: values.versionId,
      model: values.model,
      targeting: {
        batches: values.batches ?? [],
        provinces: values.provinces ?? [],
        fromVersions: values.fromVersions ?? [],
        snFileName: snInfo?.fileName ?? null,
        snList: snInfo?.valid ?? []
      },
      ratio: Number(values.ratio),
      ...(values.windowRange?.[0] ? { windowStart: values.windowRange[0].format("YYYY-MM-DD HH:mm") } : {}),
      ...(values.windowRange?.[1] ? { windowEnd: values.windowRange[1].format("YYYY-MM-DD HH:mm") } : {}),
      circuitThreshold: Number(values.threshold)
    });
    if (!result.ok) {
      message.error(`创建失败：${result.reason}`);
      return;
    }
    message.success(`推送任务 ${result.message} 已创建并启动`);
    onClose();
  };

  return (
    <Drawer
      destroyOnHidden
      footer={
        <Space size={8}>
          <Popconfirm cancelText="继续填写" description="当前填写的内容不会被保存。" okText="放弃" onConfirm={onClose} title="放弃未保存内容？">
            <Button>取消</Button>
          </Popconfirm>
          {guard(
            "新建推送任务",
            <Button disabled={readonly || candidates.length === 0} onClick={submit} type="primary">
              创建并启动
            </Button>
          )}
        </Space>
      }
      onClose={onClose}
      open
      title="新建推送任务"
      size={640}
    >
      <Form
        form={form}
        initialValues={{ versionId: presetVersionId ?? undefined, batches: [], provinces: [], fromVersions: [], ratio: "10", threshold: "10" }}
        layout="vertical"
      >
        <Form.Item label="任务名称" name="name" rules={[{ required: true, whitespace: true, message: "请填写任务名称" }, { max: 100, message: "任务名称不超过 100 字" }]}>
          <Input maxLength={100} placeholder="例如：v2.4.1 灰度 10%" showCount />
        </Form.Item>
        <Form.Item
          extra={presetVersionId ? "从固件版本列表进入，目标版本已锁定。" : "仅「测试中 / 灰度中」的版本可作为目标版本。"}
          label="目标版本"
          name="versionId"
          rules={[{ required: true, message: "请选择目标版本" }]}
        >
          <Select
            disabled={presetVersionId !== null}
            onChange={() => {
              // 换版本后机型候选随之变化，避免带着旧机型的选择。
              form.setFieldValue("model", undefined);
            }}
            options={candidates.map((version) => ({ value: version.id, label: `${version.version}（${firmwareStatusMeta[version.status].label}）` }))}
            placeholder={candidates.length === 0 ? "暂无可推送的版本" : "选择目标版本"}
          />
        </Form.Item>
        <Form.Item label="定向-机型" name="model" rules={[{ required: true, message: "请选择机型" }]}>
          <Select options={taskModelOptions} placeholder="候选随目标版本联动" />
        </Form.Item>
        <Form.Item label="定向-批次" name="batches">
          <Select allowClear maxTagCount="responsive" mode="multiple" options={batchOptions} placeholder="全部批次" />
        </Form.Item>
        <Form.Item label="定向-地区（省）" name="provinces">
          <Select allowClear maxTagCount="responsive" mode="multiple" options={provinceOptions} placeholder="全部地区" />
        </Form.Item>
        <Form.Item label="定向-当前固件版本" name="fromVersions">
          <Select allowClear maxTagCount="responsive" mode="multiple" options={currentFirmwareOptions} placeholder="全部起始版本" />
        </Form.Item>
        <Form.Item extra="导入清单后，只有同时符合机型、批次、地区、当前版本的设备才会推送。" label="导入 SN 清单（.csv）">
          {snInfo ? (
            <div className="firmware-snfile">
              <span className="firmware-snfile__name">{snInfo.fileName}</span>
              <span className="device-ops-num">
                合法 {snInfo.valid.length} 台 · 非目标机型 {snInfo.wrongModel.length} · 重复 {snInfo.duplicated.length} · 不存在 {snInfo.unknown.length}
              </span>
              <Space size={0}>
                {errorCount > 0 && (
                  <Button onClick={downloadErrorList} size="small" type="link">
                    下载错误清单
                  </Button>
                )}
                <Popconfirm cancelText="保留" description="清除后将按其余定向条件推送。" okText="清除" onConfirm={() => setSnInfo(null)} title="清除 SN 清单？">
                  <Button size="small" type="link">
                    清除清单
                  </Button>
                </Popconfirm>
              </Space>
            </div>
          ) : (
            <Upload accept=".csv" beforeUpload={readSnFile} maxCount={1}>
              <Button icon={<UploadOutlined aria-hidden="true" aria-label={undefined} />}>选择 SN 清单</Button>
            </Upload>
          )}
        </Form.Item>
        <div className="device-ops-form-row">
          <Form.Item label="灰度比例（%）" name="ratio" rules={[ratioRule]}>
            <Input inputMode="numeric" placeholder="1–100 的整数" />
          </Form.Item>
          <Form.Item label="失败率熔断阈值（%）" name="threshold" rules={[thresholdRule]}>
            <Input inputMode="numeric" placeholder="1–100 的整数" />
          </Form.Item>
        </div>
        <Form.Item label="执行时间窗（可选）" name="windowRange">
          <DatePicker.RangePicker className="firmware-full" format="YYYY-MM-DD HH:mm" showTime={{ format: "HH:mm" }} />
        </Form.Item>
        <Alert
          className="firmware-estimate"
          description={
            watchedModel
              ? `命中 ${hit} 台设备，按 ${ratioValid ? ratioInt : "—"}% 灰度约推送 ${estimate} 台${snInfo ? `（其中 SN 清单合法 ${snInfo.valid.length} 台）` : ""}。`
              : "选择机型后实时预估命中设备数；比例或定向条件变化会自动重算。"
          }
          showIcon
          title="预估生效范围"
          type="info"
        />
      </Form>
    </Drawer>
  );
}

const optionalVersionColumns = [
  { key: "models", label: "机型" },
  { key: "sign", label: "签名状态" },
  { key: "ratio", label: "灰度比例" },
  { key: "bound", label: "绑定设备数" },
  { key: "publisher", label: "发布人" },
  { key: "releasedAt", label: "发布时间" },
  { key: "changelog", label: "变更摘要" }
];
const optionalTaskColumns = [
  { key: "targetVersion", label: "目标版本" },
  { key: "targeting", label: "定向条件摘要" },
  { key: "ratio", label: "灰度比例" },
  { key: "window", label: "执行时间窗" },
  { key: "failureRate", label: "失败率" },
  { key: "creator", label: "创建人" }
];

export function FirmwarePage() {
  const { message, modal } = App.useApp();
  const { navigate, search, pathname } = useRouter();
  const params = useQueryParams();
  const dataState = useDataState();
  const { readonly, guard } = usePermission();
  const { firmwareVersions: versions, pushTasks, devices } = useDeviceOpsState();

  const rawTab = params.get("tab");
  const tab: FirmwareTab = resolveFirmwareTab(rawTab);

  // 落地即补齐 ?tab=version，保证 URL 与渲染内容一致；未知 tab 取值归一到固件版本。
  useEffect(() => {
    if (!firmwareTabNeedsNormalization(rawTab)) return;
    const next = new URLSearchParams(search);
    next.set("tab", "version");
    navigate(`${appPath(pathname)}?${next}`, true);
  }, [rawTab, search, pathname, navigate]);

  const buildHref = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `${appPath("/system/firmware")}?${next}`;
  };
  const tabHref = (target: FirmwareTab) => buildHref({ tab: target, version: null, task: null, vtab: null, new: null });
  const versionHref = (versionId: string, vtab?: string) => buildHref({ tab: "version", version: versionId, task: null, new: null, vtab: vtab ?? null });
  const taskHref = (taskId: string) => buildHref({ tab: "push-task", task: taskId, version: null, vtab: null, new: null });
  const newTaskHref = (versionId?: string) => buildHref({ tab: "push-task", new: versionId ?? "1", version: null, vtab: null, task: null });
  const deviceHref = (sn: string) => appPath(`/devices/${sn}?from=${encodeURIComponent(returnUrlFrom("/system/firmware", search))}`);
  const newVersionHref = `${appPath("/system/firmware/new")}?from=${encodeURIComponent(returnUrlFrom("/system/firmware", search))}`;
  const editVersionHref = (versionId: string) =>
    `${appPath(`/system/firmware/${encodeURIComponent(versionId)}/edit`)}?from=${encodeURIComponent(returnUrlFrom("/system/firmware", search))}`;

  // 筛选状态按 Tab 分开，切换与刷新后各自保留；URL 预置（工作台卡片等入口）优先于会话记忆。
  const [initial] = useState(() => initialFirmwareState({ search, tab, storage: window.sessionStorage }));
  const [vDraft, setVDraft] = useState<VersionFilters>(initial.vDraft);
  const [vApplied, setVApplied] = useState<VersionFilters>(initial.vApplied);
  const [tDraft, setTDraft] = useState<TaskFilters>(initial.tDraft);
  const [tApplied, setTApplied] = useState<TaskFilters>(initial.tApplied);
  const [vMoreOpen, setVMoreOpen] = useState(() => versionMoreCount(initial.vDraft) > 0);
  const [tMoreOpen, setTMoreOpen] = useState(() => pushTaskMoreActive(initial.tDraft));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 2026-09-29 视觉评审回改：次要列默认收进列设置，保证 1440 首屏核心列（任务状态 / 成功失败总数 / 失败率）不被挤到横向滚动外。
  const [vHidden, setVHidden] = useState<string[]>(["publisher", "changelog"]);
  const [tHidden, setTHidden] = useState<string[]>(["window", "creator", "createdAt"]);
  const [rollbackFor, setRollbackFor] = useState<FirmwareVersion | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | undefined>();
  const [rollbackReason, setRollbackReason] = useState("");
  const [bulkDisableOpen, setBulkDisableOpen] = useState(false);

  useEffect(() => {
    writeStorage(FIRMWARE_STORAGE_KEYS.version, { draft: vDraft, applied: vApplied });
  }, [vDraft, vApplied]);
  useEffect(() => {
    writeStorage(FIRMWARE_STORAGE_KEYS.pushTask, { draft: tDraft, applied: tApplied });
  }, [tDraft, tApplied]);

  const boundCountByVersion = useMemo(() => boundDeviceCountByVersion(devices), [devices]);

  const versionRows = useMemo(
    () => (dataState === "empty" ? [] : deriveVersionRows(versions, vApplied)),
    [versions, vApplied, dataState]
  );

  const taskRows = useMemo(
    () => (dataState === "empty" ? [] : derivePushTaskRows(pushTasks, tApplied)),
    [pushTasks, tApplied, dataState]
  );

  const publisherOptions = useMemo(() => firmwarePublishers(versions).map((value) => ({ value, label: value })), [versions]);
  const creatorOptions = useMemo(() => pushTaskCreators(pushTasks).map((value) => ({ value, label: value })), [pushTasks]);
  const taskVersionOptions = useMemo(() => versions.map((version) => ({ value: version.id, label: version.version })), [versions]);

  const reportAction = (result: { ok: boolean; reason?: string; message?: string }, success: string) => {
    if (!result.ok) {
      message.error(`操作失败：${result.reason}，状态未变化`);
      return false;
    }
    message.success(result.message ?? success);
    return true;
  };

  const runVersionQuery = () => {
    const error = ratioRangeError(vDraft);
    if (error) {
      message.warning(error);
      return;
    }
    setVApplied(vDraft);
    setSelectedIds([]);
  };
  const resetVersionFilters = () => {
    setVDraft(emptyVersionFilters);
    setVApplied(emptyVersionFilters);
    setSelectedIds([]);
  };
  const runTaskQuery = () => {
    setTApplied(tDraft);
  };
  const resetTaskFilters = () => {
    setTDraft(emptyTaskFilters);
    setTApplied(emptyTaskFilters);
  };

  const exportNotice = (scope: string) => message.success(`已提交${scope}导出任务，完成后站内信通知`);

  const versionColumns: TableColumnsType<FirmwareVersion> = [
    {
      title: "固件版本号",
      dataIndex: "version",
      key: "version",
      width: 140,
      fixed: "left",
      render: (_, version) => <a href={versionHref(version.id)}>{version.version}</a>
    },
    {
      title: "机型",
      key: "models",
      width: 120,
      render: (_, version) => (
        <Space size={4} wrap>
          {version.models.map((model) => (
            <Tag key={model}>{model}</Tag>
          ))}
        </Space>
      )
    },
    { title: "版本状态", dataIndex: "status", key: "status", width: 96, render: (value: FirmwareStatus) => <FirmwareStatusTag value={value} /> },
    {
      title: "签名状态",
      dataIndex: "signStatus",
      key: "sign",
      width: 96,
      responsive: ["xl"],
      render: (value: FirmwareSignStatus) => <FirmwareSignStatusTag value={value} />
    },
    {
      title: "灰度比例",
      dataIndex: "ratio",
      key: "ratio",
      width: 140,
      sorter: (a, b) => (a.ratio ?? -1) - (b.ratio ?? -1),
      render: (value: number | null, version) => (version.status === "canary" && value !== null ? <Progress percent={value} size="small" /> : DASH)
    },
    {
      title: "绑定设备数",
      key: "bound",
      width: 102,
      align: "right",
      render: (_, version) => {
        const count = boundCountByVersion.get(version.version) ?? 0;
        return count === 0 ? (
          <span className="device-ops-num device-ops-muted">0</span>
        ) : (
          <a className="device-ops-num" href={versionHref(version.id, "bindings")}>
            {count}
          </a>
        );
      }
    },
    { title: "发布人", dataIndex: "publisher", key: "publisher", width: 150, responsive: ["xl"], render: (value: string | null) => value ?? DASH },
    {
      title: "发布时间",
      dataIndex: "releasedAt",
      key: "releasedAt",
      width: 132,
      responsive: ["xl"],
      sorter: (a, b) => (a.releasedAt ?? "").localeCompare(b.releasedAt ?? ""),
      defaultSortOrder: "descend",
      render: (value: string | null) => <span className="device-ops-num">{value ?? DASH}</span>
    },
    {
      title: "变更摘要",
      dataIndex: "changelog",
      key: "changelog",
      responsive: ["xl"],
      render: (value: string) =>
        value.length > 60 ? (
          <Tooltip title={value}>
            <span className="firmware-clamp">{value.slice(0, 60)}…</span>
          </Tooltip>
        ) : (
          value
        )
    },
    {
      title: "操作",
      key: "actions",
      className: "device-ops-col-actions",
      fixed: "right",
      width: 190,
      render: (_, version) => (
        <Space size={0}>
          <Button href={versionHref(version.id)} size="small" type="link">
            详情
          </Button>
          {version.status === "draft" && (
            <>
              <Button href={editVersionHref(version.id)} size="small" type="link">
                编辑
              </Button>
              {guard(
                "提交测试",
                <Popconfirm
                  cancelText="取消"
                  description="提交后进入测试中，KMS 自动签名。"
                  disabled={readonly}
                  okText="提交测试"
                  onConfirm={() => reportAction(deviceOpsStore.submitVersionForTesting(version.id), `版本 ${version.version} 已提交测试`)}
                  title={`提交测试 ${version.version}？`}
                >
                  <Button disabled={readonly} size="small" type="link">
                    提交测试
                  </Button>
                </Popconfirm>
              )}
              {/* 删除是草稿行第 4 个动作，按行操作规则收进「更多」下拉；收进下拉后改用
                  对话框确认（modal.confirm），沿用原档位语义：danger、写清版本号与后果。
                  只读账号的下拉项置灰，悬停说明缺哪项权限。 */}
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "delete",
                      danger: true,
                      disabled: readonly,
                      label: readonly ? (
                        <Tooltip placement="left" title="当前账号无删除权限">
                          <span>删除</span>
                        </Tooltip>
                      ) : (
                        "删除"
                      )
                    }
                  ],
                  onClick: ({ key }) => {
                    if (key !== "delete") return;
                    modal.confirm({
                      title: `删除草稿 ${version.version}？`,
                      content: `删除后草稿 ${version.version} 不可恢复，已上传的固件包与版本信息一并移除，需要时只能重新创建版本。`,
                      okText: "删除",
                      okButtonProps: { danger: true },
                      cancelText: "取消",
                      onOk: () => reportAction(deviceOpsStore.deleteVersion(version.id), `已删除草稿 ${version.version}`)
                    });
                  }
                }}
              >
                <Button size="small" type="link">
                  更多
                </Button>
              </Dropdown>
            </>
          )}
          {(version.status === "testing" || version.status === "canary") &&
            guard(
              "新建推送任务",
              <Button disabled={readonly} href={newTaskHref(version.id)} size="small" type="link">
                新建推送任务
              </Button>
            )}
          {(version.status === "released" || version.status === "canary") &&
            guard(
              "回滚",
              <Button
                disabled={readonly}
                onClick={() => {
                  setRollbackFor(version);
                  setRollbackTarget(undefined);
                  setRollbackReason("");
                }}
                size="small"
                type="link"
              >
                回滚
              </Button>
            )}
          {(version.status === "released" || version.status === "rolled_back") &&
            guard(
              "停用",
              <Popconfirm
                cancelText="取消"
                description="停用后设备不再推送该版本更新。"
                disabled={readonly}
                okText="停用"
                onConfirm={() => reportAction(deviceOpsStore.disableVersion(version.id), `版本 ${version.version} 已停用`)}
                title={`停用版本 ${version.version}？`}
              >
                <Button disabled={readonly} size="small" type="link">
                  停用
                </Button>
              </Popconfirm>
            )}
        </Space>
      )
    }
  ];

  const taskActionCell = (task: PushTask) => (
    <Space size={0}>
      <Button href={taskHref(task.id)} size="small" type="link">
        查看详情
      </Button>
      {task.status === "running" &&
        guard(
          "暂停推送任务",
          <Popconfirm
            cancelText="取消"
            description="暂停后不再下发新设备，已开始安装的设备会继续完成。"
            disabled={readonly}
            okText="暂停"
            onConfirm={() => reportAction(deviceOpsStore.pauseTask(task.id), "任务已暂停")}
            title={`暂停任务 ${task.name}？`}
          >
            <Button disabled={readonly} size="small" type="link">
              暂停
            </Button>
          </Popconfirm>
        )}
      {task.status === "paused" &&
        guard(
          "恢复推送任务",
          <Popconfirm
            cancelText="取消"
            description="恢复后将继续向未下发的目标设备安装。"
            disabled={readonly}
            okText="恢复"
            onConfirm={() => reportAction(deviceOpsStore.resumeTask(task.id), "任务已恢复执行")}
            title={`恢复任务 ${task.name}？`}
          >
            <Button disabled={readonly} size="small" type="link">
              恢复
            </Button>
          </Popconfirm>
        )}
      {(task.status === "pending_exec" || task.status === "running" || task.status === "paused") &&
        guard(
          "取消推送任务",
          <Popconfirm
            cancelText="再想想"
            description="取消后不可恢复，已下发成功的设备不回滚。"
            disabled={readonly}
            okButtonProps={{ danger: true }}
            okText="取消任务"
            onConfirm={() => reportAction(deviceOpsStore.cancelTask(task.id), "任务已取消")}
            title={`取消任务 ${task.name}？`}
          >
            <Button danger disabled={readonly} size="small" type="link">
              取消
            </Button>
          </Popconfirm>
        )}
    </Space>
  );

  // 2026-09-29 批 2 P2 修复：任务名单元格单行省略 + 悬停全文；表头去掉空格并加宽「成功/失败/总数」与「失败率」，1440 下全部单行不折行。
  const taskColumns: TableColumnsType<PushTask> = [
    {
      title: "任务名称",
      dataIndex: "name",
      key: "name",
      width: 180,
      fixed: "left",
      render: (name: string, task) => (
        <Tooltip title={name}>
          <a className="firmware-task-name" href={taskHref(task.id)}>{name}</a>
        </Tooltip>
      )
    },
    {
      title: "目标版本",
      dataIndex: "versionId",
      key: "targetVersion",
      width:  104,
      render: (versionId: string) => (versions.some((version) => version.id === versionId) ? <a href={versionHref(versionId)}>{versionId}</a> : versionId)
    },
    { title: "机型", dataIndex: "model", key: "model", width: 88, render: (value: string) => <Tag>{value}</Tag> },
    {
      title: "定向条件摘要",
      key: "targeting",
      responsive: ["xl"],
      width:  140,
      render: (_, task) => (
        <Tooltip title={targetingText(task)}>
          <span className="firmware-clamp">{targetingText(task)}</span>
        </Tooltip>
      )
    },
    {
      title: "灰度比例",
      dataIndex: "ratio",
      key: "ratio",
      width:  104,
      sorter: (a, b) => a.ratio - b.ratio,
      render: (value: number) => <Progress percent={value} size="small" />
    },
    { title: "任务状态", dataIndex: "status", key: "status", width: 88, render: (value: PushTaskStatus) => <PushTaskStatusTag value={value} /> },
    {
      title: "执行时间窗",
      key: "window",
      width: 220,
      responsive: ["xl"],
      render: (_, task) => <span className="device-ops-num">{windowText(task)}</span>
    },
    { title: "成功/失败/总数", key: "summary", align: "right", width:  132, render: (_, task) => summaryCell(task.summary) },
    {
      title: "失败率",
      key: "failureRate",
      width:  96,
      align: "right",
      sorter: (a, b) => a.failureRate - b.failureRate,
      render: (_, task) => failureRateCell(task)
    },
    { title: "创建人", dataIndex: "creator", key: "creator", width: 130, responsive: ["xl"] },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 132,
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
      defaultSortOrder: "descend",
      render: (value: string) => <span className="device-ops-num">{value}</span>
    },
    { title: "操作", key: "actions", className: "device-ops-col-actions", fixed: "right", width: 170, render: (_, task) => taskActionCell(task) }
  ];

  const visibleVersionColumns = versionColumns.filter((column) => !vHidden.includes(String(column.key)));
  const visibleTaskColumns = taskColumns.filter((column) => !tHidden.includes(String(column.key)));

  const retry = () => {
    const next = new URLSearchParams(search);
    next.delete("dataState");
    navigate(`${appPath("/system/firmware")}${next.size ? `?${next}` : ""}`);
  };

  const dataBody = (content: ReactNode, errorTitle: string) =>
    dataState === "error" ? (
      <Alert
        action={
          <Button onClick={retry} size="small">
            重试
          </Button>
        }
        description="网络异常或服务暂时不可用，请稍后重试。"
        showIcon
        title={errorTitle}
        type="error"
      />
    ) : dataState === "loading" ? (
      <Skeleton active paragraph={{ rows: 8 }} title={false} />
    ) : (
      content
    );

  const versionEmpty =
    dataState === "empty" ? (
      <Empty
        description={
          <span>
            暂无固件版本，点右上角「新建固件版本」添加一个
            <div className="firmware-empty-action">
              {guard(
                "新建固件版本",
                <Button disabled={readonly} href={newVersionHref} type="primary">
                  新建固件版本
                </Button>
              )}
            </div>
          </span>
        }
      />
    ) : (
      <Empty description="没有符合条件的固件版本，请调整筛选条件后重新查询">
        <Button onClick={resetVersionFilters}>重置筛选</Button>
      </Empty>
    );
  const taskEmpty =
    dataState === "empty" ? (
      <Empty
        description={
          <span>
            暂无推送任务，点右上角「新建推送任务」添加一个
            <div className="firmware-empty-action">
              {guard(
                "新建推送任务",
                <Button disabled={readonly} href={newTaskHref()} type="primary">
                  新建推送任务
                </Button>
              )}
            </div>
          </span>
        }
      />
    ) : (
      <Empty description="没有符合条件的推送任务，请调整筛选条件后重新查询">
        <Button onClick={resetTaskFilters}>重置筛选</Button>
      </Empty>
    );

  const bulkEligibility = bulkDisableEligible(selectedIds, versions);

  const rollbackTargets = rollbackFor ? rollbackCandidates(rollbackFor, versions) : [];

  const columnSettingOptions = (tab === "version" ? optionalVersionColumns : optionalTaskColumns).map((item) => ({ value: item.key, label: item.label }));
  const columnSettingValue = (tab === "version" ? optionalVersionColumns : optionalTaskColumns)
    .map((item) => item.key)
    .filter((key) => !(tab === "version" ? vHidden : tHidden).includes(key));
  // 列设置改登记的 Popover + Checkbox（2026-09-29 集成），与全部设备页同一形态。
  const columnSettingButton = (
    <Popover
      content={
        <Checkbox.Group
          className="device-ops-column-setting"
          onChange={(checked) => {
            const all = columnSettingOptions.map((option) => String(option.value));
            const hidden = all.filter((key) => !checked.includes(key));
            if (tab === "version") setVHidden(hidden);
            else setTHidden(hidden);
          }}
          options={columnSettingOptions}
          value={columnSettingValue}
        />
      }
      placement="bottomRight"
      trigger="click"
    >
      <Button icon={<SettingOutlined aria-hidden="true" aria-label={undefined} />}>列设置</Button>
    </Popover>
  );

  return (
    <div className="device-ops-stack">
      <header className="device-ops-title-row">
        <h1 className="device-ops-title">固件与推送</h1>
        <Space>
          {tab === "version"
            ? guard(
                "新建固件版本",
                <Button disabled={readonly} href={newVersionHref} type="primary">
                  新建固件版本
                </Button>
              )
            : guard(
                "新建推送任务",
                <Button disabled={readonly} href={newTaskHref()} type="primary">
                  新建推送任务
                </Button>
              )}
        </Space>
      </header>

      {/* 页面级页签：直接在标题下方，不套卡片；每个 Tab 的筛选区与表格在下方。 */}
      <Tabs activeKey={tab} items={mainTabItems} onChange={(key) => navigate(tabHref(key as FirmwareTab))} />

      {tab === "version" ? (
        <>
          <section aria-label="固件版本筛选" className="device-ops-panel">
            <Form layout="vertical" onFinish={runVersionQuery}>
              <div className="firmware-filters">
                <Form.Item label="固件版本号">
                  <Input
                    allowClear
                    onChange={(event) => setVDraft((current) => ({ ...current, keyword: event.target.value }))}
                    onPressEnter={runVersionQuery}
                    placeholder="输入完整或部分版本号"
                    value={vDraft.keyword}
                  />
                </Form.Item>
                <Form.Item label="机型">
                  <Select
                    allowClear
                    maxTagCount="responsive"
                    mode="multiple"
                    onChange={(value) => setVDraft((current) => ({ ...current, models: value }))}
                    options={modelOptions}
                    placeholder="全部机型"
                    value={vDraft.models}
                  />
                </Form.Item>
                <Form.Item label="版本状态">
                  <Select
                    allowClear
                    maxTagCount="responsive"
                    mode="multiple"
                    onChange={(value) => setVDraft((current) => ({ ...current, statuses: value }))}
                    options={toOptions(firmwareStatusMeta)}
                    placeholder="全部状态"
                    value={vDraft.statuses}
                  />
                </Form.Item>
                <Form.Item label="签名状态">
                  <Select
                    allowClear
                    onChange={(value) => setVDraft((current) => ({ ...current, signStatus: value ?? "" }))}
                    options={toOptions(firmwareSignStatusMeta)}
                    placeholder="全部"
                    value={vDraft.signStatus || undefined}
                  />
                </Form.Item>
              </div>
              {vMoreOpen && (
                <div className="device-ops-filters device-ops-filters--more">
                  <Form.Item label="发布人">
                    <Select
                      allowClear
                      onChange={(value) => setVDraft((current) => ({ ...current, publisher: value ?? "" }))}
                      options={publisherOptions}
                      placeholder="全部发布人"
                      value={vDraft.publisher || undefined}
                    />
                  </Form.Item>
                  <Form.Item extra="单次查询范围不超过 365 天" label="发布时间">
                    <DatePicker.RangePicker
                      onChange={(values) => {
                        if (values?.[0] && values[1] && values[1].diff(values[0], "day") > 365) {
                          message.warning("发布时间范围不能超过 365 天");
                          return;
                        }
                        setVDraft((current) => ({
                          ...current,
                          releasedRange: values?.[0] && values[1] ? [values[0].format("YYYY-MM-DD"), values[1].format("YYYY-MM-DD")] : null
                        }));
                      }}
                      value={vDraft.releasedRange ? [dayjs(vDraft.releasedRange[0]), dayjs(vDraft.releasedRange[1])] : null}
                    />
                  </Form.Item>
                  <Form.Item label="灰度比例（%）">
                    <div className="firmware-range">
                      <Input
                        aria-label="灰度比例下限"
                        inputMode="numeric"
                        onChange={(event) => setVDraft((current) => ({ ...current, ratioMin: event.target.value }))}
                        placeholder="最小"
                        value={vDraft.ratioMin}
                      />
                      <span className="device-ops-muted">–</span>
                      <Input
                        aria-label="灰度比例上限"
                        inputMode="numeric"
                        onChange={(event) => setVDraft((current) => ({ ...current, ratioMax: event.target.value }))}
                        placeholder="最大"
                        value={vDraft.ratioMax}
                      />
                    </div>
                  </Form.Item>
                </div>
              )}
              <div className="device-ops-filters__actions">
                <Button aria-expanded={vMoreOpen} onClick={() => setVMoreOpen((open) => !open)} type="link">
                  {vMoreOpen ? "收起更多筛选" : versionMoreCount(vDraft) > 0 ? `更多筛选（已设 ${versionMoreCount(vDraft)} 项）` : "更多筛选"}
                  <DownOutlined className={vMoreOpen ? "device-ops-flip" : undefined} aria-hidden="true" aria-label={undefined} />
                </Button>
                <Space>
                  <Button onClick={resetVersionFilters} type="text">
                    重置
                  </Button>
                  <Button htmlType="submit" type="primary">
                    查询
                  </Button>
                </Space>
              </div>
            </Form>
          </section>

          <section aria-label="固件版本列表" className="device-ops-panel device-ops-panel--table">
            <div className="device-ops-toolbar">
              <span className="device-ops-toolbar__count">
                共{" "}
                <strong className="device-ops-num">{dataState === "loading" || dataState === "error" ? DASH : versionRows.length}</strong> 个版本
              </span>
              <Space>
                <Button aria-label="刷新" icon={<ReloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => message.success("已刷新")} type="text" />
                {guard(
                  "导出",
                  <Button
                    disabled={readonly || versionRows.length === 0}
                    icon={<DownloadOutlined aria-hidden="true" aria-label={undefined} />}
                    onClick={() => exportNotice("固件版本列表")}
                  >
                    导出
                  </Button>
                )}
                {columnSettingButton}
              </Space>
            </div>
            {dataBody(
              <Table<FirmwareVersion>
                columns={visibleVersionColumns}
                dataSource={versionRows}
                locale={{ emptyText: versionEmpty }}
                pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (count) => `共 ${count} 条` }}
                rowKey="id"
                rowSelection={{ columnWidth: 48, selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as string[]) }}
                scroll={{ x: "max-content" }}
              />,
              "固件版本列表加载失败"
            )}
          </section>
        </>
      ) : (
        <>
          <section aria-label="推送任务筛选" className="device-ops-panel">
            <Form layout="vertical" onFinish={runTaskQuery}>
              <div className="firmware-filters">
                <Form.Item label="任务名称">
                  <Input
                    allowClear
                    onChange={(event) => setTDraft((current) => ({ ...current, keyword: event.target.value }))}
                    onPressEnter={runTaskQuery}
                    placeholder="输入任务名称或编号"
                    value={tDraft.keyword}
                  />
                </Form.Item>
                <Form.Item label="目标版本">
                  <Select
                    allowClear
                    maxTagCount="responsive"
                    mode="multiple"
                    onChange={(value) => setTDraft((current) => ({ ...current, versions: value }))}
                    options={taskVersionOptions}
                    placeholder="全部版本"
                    value={tDraft.versions}
                  />
                </Form.Item>
                <Form.Item label="机型">
                  <Select
                    allowClear
                    maxTagCount="responsive"
                    mode="multiple"
                    onChange={(value) => setTDraft((current) => ({ ...current, models: value }))}
                    options={modelOptions}
                    placeholder="全部机型"
                    value={tDraft.models}
                  />
                </Form.Item>
                <Form.Item label="任务状态">
                  <Select
                    allowClear
                    maxTagCount="responsive"
                    mode="multiple"
                    onChange={(value) => setTDraft((current) => ({ ...current, statuses: value }))}
                    options={toOptions(pushTaskStatusMeta)}
                    placeholder="全部状态"
                    value={tDraft.statuses}
                  />
                </Form.Item>
              </div>
              {tMoreOpen && (
                <div className="device-ops-filters device-ops-filters--more">
                  <Form.Item label="创建人">
                    <Select
                      allowClear
                      onChange={(value) => setTDraft((current) => ({ ...current, creator: value ?? "" }))}
                      options={creatorOptions}
                      placeholder="全部创建人"
                      value={tDraft.creator || undefined}
                    />
                  </Form.Item>
                  <Form.Item label="创建时间">
                    <DatePicker.RangePicker
                      onChange={(values) =>
                        setTDraft((current) => ({
                          ...current,
                          createdRange: values?.[0] && values[1] ? [values[0].format("YYYY-MM-DD"), values[1].format("YYYY-MM-DD")] : null
                        }))
                      }
                      value={tDraft.createdRange ? [dayjs(tDraft.createdRange[0]), dayjs(tDraft.createdRange[1])] : null}
                    />
                  </Form.Item>
                </div>
              )}
              <div className="device-ops-filters__actions">
                <Button aria-expanded={tMoreOpen} onClick={() => setTMoreOpen((open) => !open)} type="link">
                  {tMoreOpen ? "收起更多筛选" : pushTaskMoreActive(tDraft) ? "更多筛选（已设条件）" : "更多筛选"}
                  <DownOutlined className={tMoreOpen ? "device-ops-flip" : undefined} aria-hidden="true" aria-label={undefined} />
                </Button>
                <Space>
                  <Button onClick={resetTaskFilters} type="text">
                    重置
                  </Button>
                  <Button htmlType="submit" type="primary">
                    查询
                  </Button>
                </Space>
              </div>
            </Form>
          </section>

          <section aria-label="推送任务列表" className="device-ops-panel device-ops-panel--table">
            <div className="device-ops-toolbar">
              <span className="device-ops-toolbar__count">
                共{" "}
                <strong className="device-ops-num">{dataState === "loading" || dataState === "error" ? DASH : taskRows.length}</strong> 个任务
              </span>
              <Space>
                <Button aria-label="刷新" icon={<ReloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => message.success("已刷新")} type="text" />
                {guard(
                  "导出",
                  <Button
                    disabled={readonly || taskRows.length === 0}
                    icon={<DownloadOutlined aria-hidden="true" aria-label={undefined} />}
                    onClick={() => exportNotice("推送任务列表")}
                  >
                    导出
                  </Button>
                )}
                {columnSettingButton}
              </Space>
            </div>
            {dataBody(
              <Table<PushTask>
                columns={visibleTaskColumns}
                dataSource={taskRows}
                locale={{ emptyText: taskEmpty }}
                pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (count) => `共 ${count} 条` }}
                rowKey={(task) => `${task.id}|${task.createdAt}`}
                // 2026-09-29 视觉评审：x 给数值走 fixed 布局——"max-content" 会按内容撑宽，
                // 固定右列在 1440 首屏遮住「成功/失败/总数」与「失败率」；数值小于容器宽时无内部滚动、不遮挡。
                scroll={{ x: 1000 }}
              />,
              "推送任务列表加载失败"
            )}
          </section>
        </>
      )}

      {tab === "version" && selectedIds.length > 0 && (
        <div aria-label="批量操作" className="device-ops-selection-bar" role="region">
          <span>
            已选 <strong className="device-ops-num">{selectedIds.length}</strong> 项
          </span>
          <Space>
            {bulkEligibility ? (
              guard(
                "停用",
                <Button danger disabled={readonly} onClick={() => setBulkDisableOpen(true)}>
                  批量停用
                </Button>
              )
            ) : (
              <Tooltip title="仅已全量 / 已回滚的版本可停用">
                <span className="device-ops-guard">
                  <Button disabled>批量停用</Button>
                </span>
              </Tooltip>
            )}
            {guard("导出", <Button disabled={readonly} onClick={() => exportNotice(`所选 ${selectedIds.length} 个版本`)}>批量导出</Button>)}
            <Button onClick={() => setSelectedIds([])}>取消选择</Button>
          </Space>
        </div>
      )}

      {params.get("version") && (
        <VersionDrawer
          deviceHref={deviceHref}
          initialTab={params.get("vtab") ?? "basic"}
          newTaskHref={newTaskHref}
          onClose={() => navigate(buildHref({ version: null, vtab: null }))}
          taskHref={taskHref}
          versionId={params.get("version") ?? ""}
        />
      )}
      {params.get("task") && (
        <TaskDrawer
          deviceHref={deviceHref}
          onClose={() => navigate(buildHref({ task: null }))}
          taskId={params.get("task") ?? ""}
          versionHref={versionHref}
        />
      )}
      {params.get("new") && tab === "push-task" && (
        <CreateTaskDrawer onClose={() => navigate(buildHref({ new: null }))} presetVersionId={params.get("new") === "1" ? null : params.get("new")} />
      )}

      <Modal
        cancelText="取消"
        destroyOnHidden
        okButtonProps={{ danger: true, disabled: rollbackConfirmDisabled({ candidateCount: rollbackTargets.length, targetId: rollbackTarget, reason: rollbackReason }) }}
        okText="确认回滚"
        onCancel={() => setRollbackFor(null)}
        onOk={() => {
          if (!rollbackFor || !rollbackTarget) return;
          const ok = reportAction(deviceOpsStore.rollbackVersion(rollbackFor.id, { targetVersionId: rollbackTarget, reason: rollbackReason }), "已回滚");
          if (ok) setRollbackFor(null);
        }}
        open={rollbackFor !== null}
        title={rollbackFor ? `回滚版本 ${rollbackFor.version}` : "回滚版本"}
      >
        {rollbackFor && (
          <>
            <Alert
              className="firmware-modal-gap"
              description="将自动创建一条 100% 推送任务，把已升级设备回退到所选历史版本；当前版本标记为「已回滚」。"
              showIcon
              title={`回滚将影响已升级到该版本的 ${boundCountByVersion.get(rollbackFor.version) ?? 0} 台设备`}
              type="warning"
            />
            {rollbackTargets.length === 0 ? (
              <Alert className="firmware-modal-gap" showIcon title="该机型没有已全量的历史版本可以回滚" type="error" />
            ) : (
              <>
                <div className="firmware-field">
                  <span className="firmware-field__label">回滚目标版本</span>
                  <Select
                    aria-label="回滚目标版本"
                    className="firmware-full"
                    onChange={setRollbackTarget}
                    options={rollbackTargets.map((item) => ({ value: item.id, label: item.version }))}
                    placeholder="选择同机型的已全量历史版本"
                    value={rollbackTarget}
                  />
                </div>
                <div className="firmware-field">
                  <span className="firmware-field__label">回滚原因（至少 5 字）</span>
                  <Input.TextArea
                    maxLength={200}
                    onChange={(event) => setRollbackReason(event.target.value)}
                    placeholder="说明回滚原因，将写入操作历史"
                    rows={3}
                    showCount
                    value={rollbackReason}
                  />
                </div>
              </>
            )}
          </>
        )}
      </Modal>

      <Modal
        cancelText="取消"
        destroyOnHidden
        okButtonProps={{ danger: true }}
        okText="确认停用"
        onCancel={() => setBulkDisableOpen(false)}
        onOk={() => {
          const ok = reportAction(deviceOpsStore.disableVersions(selectedIds), `已停用 ${selectedIds.length} 个版本`);
          if (ok) {
            setBulkDisableOpen(false);
            setSelectedIds([]);
          }
        }}
        open={bulkDisableOpen}
        title="批量停用固件版本"
      >
        <p className="device-ops-modal-note">确认停用所选 {selectedIds.length} 个版本？停用后这些版本不再推送给设备，已安装的设备不受影响。</p>
        <ul className="firmware-confirm-list">
          {selectedIds.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      </Modal>

    </div>
  );
}
