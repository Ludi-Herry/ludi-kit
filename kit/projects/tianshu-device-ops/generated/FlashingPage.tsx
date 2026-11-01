import { useEffect, useMemo, useState } from "react";
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
  InputNumber,
  Modal,
  Popconfirm,
  Popover,
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
import { DownOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  certMeta,
  flashingStations,
  foldedFieldGroups,
  lifecycleMeta,
  type CertState,
  type FlashingFailureCategory,
  type FlashingLogStepState,
  type FlashingRecord
} from "../data";
import { deviceOpsStore, useDeviceOpsState } from "../store";
import {
  CertTag,
  FlashingResultTag,
  LifecycleTag,
  SnLink,
  appPath,
  returnUrlFrom,
  useDataState,
  usePermission,
  useQueryParams,
  useRouter
} from "../ui";
import "./flashing.css";
import {
  FLASHING_STORAGE_KEYS,
  SCRAP_CONFIRM_TEXT,
  activeFlashingMoreCount,
  canRetryFlash,
  canScrapFlash,
  emptyFlashingFilters,
  flashingBulkAvailability,
  flashingFailureCategoryOptions,
  flashingFilterVersions,
  flashingLifecycleOptions,
  flashingModelOptions,
  flashingOperatorOptions,
  flashingResultOptions,
  flashingStationOptions,
  initialFlashingListState,
  latestPublishedVersion,
  matchesFlashingFilters,
  type FlashingFilters
} from "../core/flashingList";
import { readStored, writeStored } from "../core/storage";

type Filters = FlashingFilters;

const DASH = "—";

// 烧录时间默认全部时间：当日默认会让首屏只剩一条记录，与验收要点「证书状态列含灰/绿/红三态」冲突，
// 故跟随验收要点；字段保留当日快捷选择，可清空为全部时间（卡片筛选区联动规则）。

const logStepMeta: Record<FlashingLogStepState, { label: string; color: string }> = {
  succeeded: { label: "成功", color: "success" },
  failed: { label: "失败", color: "error" },
  processing: { label: "进行中", color: "processing" },
  pending: { label: "待执行", color: "default" }
};

// 设备状态筛选项：以烧录·发证 / 烧录失败为主，生产域其余状态可扩展筛入历史记录（PRD ③）。
const lifecycleOptions = flashingLifecycleOptions;
const modelOptions = flashingModelOptions;
const stationOptions = flashingStationOptions;
const resultOptions = flashingResultOptions;
const certOptions = (Object.keys(certMeta) as CertState[]).map((value) => ({ value, label: certMeta[value].label }));
const failureCategoryOptions = flashingFailureCategoryOptions;

const optionalColumns = [
  { key: "model", label: "机型" },
  { key: "station", label: "烧录工位" },
  { key: "duration", label: "烧录耗时" },
  { key: "operator", label: "操作人" }
];

export function FlashingPage() {
  const { message } = App.useApp();
  const { navigate, pathname, search } = useRouter();
  const params = useQueryParams();
  const dataState = useDataState();
  const { readonly, guard } = usePermission();
  // 固件版本目录用 store 里的完整实体（带机型与发布状态）；data 导出的字符串列表只用于文案对照。
  const { devices, flashingRecords, flashingTasks, firmwareVersions: knownFirmwareVersions } = useDeviceOpsState();
  const records = dataState === "empty" ? [] : flashingRecords;

  const [init] = useState(() => initialFlashingListState({ search: window.location.search, storage: window.localStorage }));
  const [draft, setDraft] = useState<Filters>({ ...init.filters });
  const [applied, setApplied] = useState<Filters>({ ...init.filters });
  const [moreOpen, setMoreOpen] = useState(() => activeFlashingMoreCount(init.filters) > 0);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => readStored<string[]>(window.localStorage, FLASHING_STORAGE_KEYS.columns) ?? []);
  const [detailSn, setDetailSn] = useState<string | null>(null);
  const [certSn, setCertSn] = useState<string | null>(null);
  const [failSn, setFailSn] = useState<string | null>(null);
  const [failCategory, setFailCategory] = useState<FlashingFailureCategory | null>(null);
  const [failDescription, setFailDescription] = useState("");
  const [failPhotos, setFailPhotos] = useState<UploadFile[]>([]);
  const [scrapSn, setScrapSn] = useState<string | null>(null);
  const [scrapConfirm, setScrapConfirm] = useState("");
  const [bulkFailOpen, setBulkFailOpen] = useState(false);
  const [bulkFailCategory, setBulkFailCategory] = useState<FlashingFailureCategory | null>(null);
  const [bulkFailDescription, setBulkFailDescription] = useState("");
  const [bulkScrapOpen, setBulkScrapOpen] = useState(false);
  const [bulkScrapConfirm, setBulkScrapConfirm] = useState("");
  const [actingKey, setActingKey] = useState<string | null>(null);

  // 无隐私字段，筛选条件全部记忆（09-29 口径）。
  useEffect(() => {
    writeStored(window.localStorage, FLASHING_STORAGE_KEYS.filter, applied);
  }, [applied]);

  const deviceBySn = useMemo(() => new Map(devices.map((device) => [device.sn, device])), [devices]);
  const latestVersion = useMemo(() => latestPublishedVersion(knownFirmwareVersions), []);
  const operatorOptions = useMemo(() => flashingOperatorOptions(records), [records]);
  const firmwareOptions = useMemo(() => flashingFilterVersions(knownFirmwareVersions, draft.models), [draft.models]);

  const rows = useMemo(
    () => records.filter((record) => matchesFlashingFilters(record, deviceBySn.get(record.sn), applied)),
    [records, applied, deviceBySn]
  );

  const selectedRecords = useMemo(
    () => selectedKeys.map((sn) => records.find((record) => record.sn === sn)).filter((record): record is FlashingRecord => Boolean(record)),
    [selectedKeys, records]
  );
  const bulkAvailability = flashingBulkAvailability(selectedRecords, (sn) => deviceBySn.get(sn)?.lifecycle);

  const runQuery = () => {
    setApplied(draft);
    setSelectedKeys([]);
  };

  const resetFilters = () => {
    setDraft(emptyFlashingFilters);
    setApplied(emptyFlashingFilters);
    setSelectedKeys([]);
  };

  const patchDraft = (patch: Partial<Filters>) => setDraft((current) => ({ ...current, ...patch }));

  // 行内操作局部 loading（约 300ms），不阻断整页。
  const act = (key: string, run: () => void) => {
    setActingKey(key);
    window.setTimeout(() => {
      run();
      setActingKey(null);
    }, 300);
  };

  const showResult = (result: { ok: boolean; reason?: string; message?: string }, okText?: string) => {
    if (result.ok) message.success(okText ?? result.message ?? "操作成功");
    else message.error(`操作失败：${result.reason}`);
  };

  const doMarkSuccess = (record: FlashingRecord) =>
    act(`success:${record.sn}`, () => {
      const result = deviceOpsStore.markFlashSuccess(record.sn);
      if (result.ok) {
        message.success(
          <span>
            {result.message}，<a href={appPath(`/devices?sn=${record.sn}`)}>去全部设备查看测试中设备</a>
          </span>
        );
      } else message.error(`操作失败：${result.reason}`);
    });

  const doRetry = (record: FlashingRecord) =>
    act(`retry:${record.sn}`, () => showResult(deviceOpsStore.retryFlash(record.sn)));

  const doScrap = (record: FlashingRecord) =>
    act(`scrap:${record.sn}`, () => {
      showResult(deviceOpsStore.scrapFlash(record.sn));
      setScrapSn(null);
      setScrapConfirm("");
    });

  const submitFail = () => {
    if (!failSn || !failCategory) return;
    const description = failDescription.trim();
    if (!description) return;
    act(`fail:${failSn}`, () => {
      showResult(deviceOpsStore.markFlashFailed(failSn, { category: failCategory, description, photoCount: failPhotos.length }));
      setFailSn(null);
      setFailCategory(null);
      setFailDescription("");
      setFailPhotos([]);
    });
  };

  const submitBulkFail = () => {
    if (!bulkFailCategory) return;
    const description = bulkFailDescription.trim();
    if (!description) return;
    let failed = 0;
    for (const record of selectedRecords) {
      const result = deviceOpsStore.markFlashFailed(record.sn, { category: bulkFailCategory, description, photoCount: 0 });
      if (!result.ok) failed += 1;
    }
    message[failed > 0 ? "warning" : "success"](
      failed > 0 ? `已标记 ${selectedRecords.length - failed} 台为烧录失败，${failed} 台标记失败请重试` : `已将 ${selectedRecords.length} 台设备统一标记为烧录失败`
    );
    setBulkFailOpen(false);
    setBulkFailCategory(null);
    setBulkFailDescription("");
    setSelectedKeys([]);
  };

  const submitBulkScrap = () => {
    let failed = 0;
    for (const record of selectedRecords) {
      if (!deviceOpsStore.scrapFlash(record.sn).ok) failed += 1;
    }
    message[failed > 0 ? "warning" : "success"](failed > 0 ? `已报废 ${selectedRecords.length - failed} 台，${failed} 台失败请重试` : `已报废 ${selectedRecords.length} 台设备，进入报废终态`);
    setBulkScrapOpen(false);
    setBulkScrapConfirm("");
    setSelectedKeys([]);
  };

  const exportRows = (count: number) => message.success(`已提交导出任务（共 ${count} 条记录），完成后将通过站内信通知`);

  const retry = () => {
    const next = new URLSearchParams(params);
    next.delete("dataState");
    navigate(`${appPath("/lifecycle/flashing")}${next.size ? `?${next}` : ""}`);
  };

  const columns: TableColumnsType<FlashingRecord> = [
    {
      title: "SN",
      dataIndex: "sn",
      key: "sn",
      width: 150,
      fixed: "left",
      render: (sn: string) => <SnLink sn={sn} />
    },
    // 1200px 以下隐藏次要列，固定列不压住相邻列、页面不横向滚动。
    { title: "机型", dataIndex: "model", key: "model", width: 100, responsive: ["xl"] },
    {
      title: "固件版本",
      dataIndex: "firmwareVersion",
      key: "firmware",
      width: 116,
      sorter: (a, b) => a.firmwareVersion.localeCompare(b.firmwareVersion),
      render: (value: string) => (
        <span className="device-ops-num">
          {value}
          {value === latestVersion && <span className="flashing-latest-dot" title="当前最新版本" />}
        </span>
      )
    },
    { title: "烧录工位", dataIndex: "station", key: "station", width: 96, responsive: ["xl"] },
    {
      title: "证书状态",
      dataIndex: "certState",
      key: "certState",
      width: 96,
      render: (value: CertState) => <CertTag value={value} />
    },
    {
      title: "烧录结果",
      dataIndex: "result",
      key: "result",
      width: 88,
      render: (value: FlashingRecord["result"]) => <FlashingResultTag value={value} />
    },
    {
      title: "设备状态",
      key: "lifecycle",
      width: 112,
      render: (_, record) => {
        const device = deviceBySn.get(record.sn);
        return device ? <LifecycleTag value={device.lifecycle} /> : DASH;
      }
    },
    {
      title: "重试次数",
      dataIndex: "retryCount",
      key: "retry",
      width: 84,
      align: "right",
      sorter: (a, b) => a.retryCount - b.retryCount,
      // 达到上限的次数用 error 色提醒（0 照常显示 0）。
      render: (value: number, record) => (
        <Typography.Text className="device-ops-num" type={value >= record.retryLimit ? "danger" : undefined}>
          {value}
        </Typography.Text>
      )
    },
    {
      // 单位放表头，不在每个单元格重复；尚未烧录完成的显示「—」（不适用）。
      title: <span className="flashing-duration-head">烧录耗时（秒）</span>,
      dataIndex: "durationSec",
      key: "duration",
      width: 112,
      align: "right",
      responsive: ["xl"],
      sorter: (a, b) => (a.durationSec ?? -1) - (b.durationSec ?? -1),
      render: (value: number | null) =>
        value === null ? (
          <span className="device-ops-muted">{DASH}</span>
        ) : (
          <Typography.Text className="device-ops-num" type={value > 120 ? "warning" : undefined}>
            {value}
          </Typography.Text>
        )
    },
    { title: "操作人", dataIndex: "operator", key: "operator", width: 112, responsive: ["xl"] },
    {
      title: "烧录时间",
      dataIndex: "startedAt",
      key: "startedAt",
      width: 168,
      defaultSortOrder: "descend",
      sorter: (a, b) => a.startedAt.localeCompare(b.startedAt),
      render: (value: string) => <span className="device-ops-num">{value}</span>
    },
    {
      title: "操作",
      key: "actions",
      className: "device-ops-col-actions",
      fixed: "right",
      width: 236,
      render: (_, record) => {
        const device = deviceBySn.get(record.sn);
        const flashing = device?.lifecycle === "flashing";
        return (
          <Space size={0}>
            <Button onClick={() => setDetailSn(record.sn)} size="small" type="link">
              查看详情
            </Button>
            {flashing &&
              guard(
                "production:flashing:mark_success",
                <Popconfirm
                  cancelText="取消"
                  okText="确认流转"
                  onConfirm={() => doMarkSuccess(record)}
                  placement="topRight"
                  title={`SN ${record.sn} 将流转至测试中`}
                >
                  <Button disabled={readonly} loading={actingKey === `success:${record.sn}`} size="small" type="link">
                    标记成功
                  </Button>
                </Popconfirm>
              )}
            {flashing &&
              guard(
                "production:flashing:mark_failed",
                <Button disabled={readonly} onClick={() => setFailSn(record.sn)} size="small" type="link">
                  标记失败
                </Button>
              )}
            {canRetryFlash(record, device) &&
              guard(
                "production:flashing:retry",
                <Popconfirm
                  cancelText="取消"
                  okText="确认重试"
                  onConfirm={() => doRetry(record)}
                  placement="topRight"
                  title={`确认对 SN ${record.sn} 重新发起烧录？当前已重试 ${record.retryCount} 次，上限 ${record.retryLimit} 次。确认后设备状态重置为烧录·发证。`}
                >
                  <Button disabled={readonly} loading={actingKey === `retry:${record.sn}`} size="small" type="link">
                    重试烧录
                  </Button>
                </Popconfirm>
              )}
            {canScrapFlash(record, device) &&
              guard(
                "production:flashing:scrap",
                <Button danger disabled={readonly} onClick={() => { setScrapSn(record.sn); setScrapConfirm(""); }} size="small" type="link">
                  超限报废
                </Button>
              )}
            {record.certState === "cert_issued" &&
              guard(
                "production:flashing:cert:view",
                <Button disabled={readonly} onClick={() => setCertSn(record.sn)} size="small" type="link">
                  查看证书详情
                </Button>
              )}
          </Space>
        );
      }
    }
  ];
  const visibleColumns = columns.filter((column) => !hiddenColumns.includes(String(column.key)));

  const currentUrl = returnUrlFrom(pathname, search);
  const moreCount = activeFlashingMoreCount(draft);

  const emptyText = dataState === "empty" ? (
    <Empty description="暂无烧录记录，可点击右上角「新建烧录任务」开始">
      {guard(
        "production:flashing:create",
        <Button disabled={readonly} icon={<PlusOutlined aria-hidden="true" aria-label={undefined} />} href={appPath("/lifecycle/flashing/new")} type="primary">
          新建烧录任务
        </Button>
      )}
    </Empty>
  ) : (
    <Empty description="没有符合条件的烧录记录，请调整筛选条件后重新查询">
      <Button onClick={resetFilters}>重置筛选</Button>
    </Empty>
  );

  const detailRecord = detailSn ? records.find((record) => record.sn === detailSn) ?? null : null;
  const detailDevice = detailRecord ? deviceBySn.get(detailRecord.sn) : undefined;
  const detailTask = detailRecord ? flashingTasks.find((task) => task.taskId === detailRecord.taskId) : undefined;
  const certRecord = certSn ? records.find((record) => record.sn === certSn) ?? null : null;
  const certDevice = certRecord ? deviceBySn.get(certRecord.sn) : undefined;
  const certTask = certRecord ? flashingTasks.find((task) => task.taskId === certRecord.taskId) : undefined;
  // 证书字段与设备详情「证书」折叠组同源（foldedFieldGroups），指纹块只在有 cert:view 权限时渲染。
  const certItems = certDevice ? foldedFieldGroups(certDevice).find((group) => group.key === "certificate")?.items ?? [] : [];
  const certField = (label: string) => certItems.find((item) => item.label === label)?.value ?? DASH;
  const scrapRecord = scrapSn ? records.find((record) => record.sn === scrapSn) ?? null : null;
  const scrapDevice = scrapRecord ? deviceBySn.get(scrapRecord.sn) : undefined;

  return (
    <div className="device-ops-stack">
      <header className="device-ops-title-row">
        <h1 className="device-ops-title">烧录发证</h1>
        {guard(
          "production:flashing:create",
          <Button
            disabled={readonly}
            href={`${appPath("/lifecycle/flashing/new")}?from=${encodeURIComponent(currentUrl)}`}
            icon={<PlusOutlined aria-hidden="true" aria-label={undefined} />}
            type="primary"
          >
            新建烧录任务
          </Button>
        )}
      </header>

      <section aria-label="筛选" className="device-ops-panel">
        <Form layout="vertical" onFinish={runQuery}>
          <div className="device-ops-filters">
            <Form.Item label="SN">
              <Input allowClear onChange={(event) => patchDraft({ sn: event.target.value })} onPressEnter={runQuery} placeholder="输入完整或部分 SN，支持扫码枪" value={draft.sn} />
            </Form.Item>
            <Form.Item label="设备状态">
              <Select allowClear maxTagCount="responsive" mode="multiple" onChange={(value) => patchDraft({ lifecycles: value })} options={lifecycleOptions} placeholder="全部状态" value={draft.lifecycles} />
            </Form.Item>
            <Form.Item label="烧录结果">
              <Select allowClear onChange={(value) => patchDraft({ result: value ?? null })} options={resultOptions} placeholder="全部结果" value={draft.result} />
            </Form.Item>
            <Form.Item label="证书状态">
              <Select allowClear onChange={(value) => patchDraft({ certState: value ?? null })} options={certOptions} placeholder="全部状态" value={draft.certState} />
            </Form.Item>
            <Form.Item extra={draft.startedAt ? undefined : "当前为全部时间"} label="烧录时间">
              <DatePicker.RangePicker
                allowClear
                onChange={(values) =>
                  patchDraft({ startedAt: values?.[0] && values[1] ? [values[0].format("YYYY-MM-DD"), values[1].format("YYYY-MM-DD")] : null })
                }
                value={draft.startedAt ? [dayjs(draft.startedAt[0]), dayjs(draft.startedAt[1])] : null}
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
                  onChange={(value) => patchDraft({ models: value })}
                  options={modelOptions}
                  placeholder="全部机型"
                  value={draft.models}
                />
              </Form.Item>
              <Form.Item extra={draft.models.length === 0 ? "未选机型时显示全部版本" : undefined} label="固件版本">
                <Select allowClear maxTagCount="responsive" mode="multiple" onChange={(value) => patchDraft({ firmware: value })} options={firmwareOptions} placeholder="全部版本" value={draft.firmware} />
              </Form.Item>
              <Form.Item label="批次号">
                <Input allowClear onChange={(event) => patchDraft({ batch: event.target.value })} onPressEnter={runQuery} placeholder="如 B2410" value={draft.batch} />
              </Form.Item>
              <Form.Item label="烧录工位">
                <Select allowClear maxTagCount="responsive" mode="multiple" onChange={(value) => patchDraft({ stations: value })} options={stationOptions} placeholder="全部工位" value={draft.stations} />
              </Form.Item>
              <Form.Item label="操作人">
                <Select allowClear onChange={(value) => patchDraft({ operator: value ?? null })} options={operatorOptions} placeholder="全部操作人" value={draft.operator} />
              </Form.Item>
              <Form.Item label="重试次数（0–999）">
                <div className="flashing-range">
                  <InputNumber aria-label="重试次数下限" max={999} min={0} onChange={(value) => patchDraft({ retryMin: value })} placeholder="最小" precision={0} value={draft.retryMin} />
                  <span className="device-ops-muted">至</span>
                  <InputNumber aria-label="重试次数上限" max={999} min={0} onChange={(value) => patchDraft({ retryMax: value })} placeholder="最大" precision={0} value={draft.retryMax} />
                </div>
              </Form.Item>
            </div>
          )}
          <div className="device-ops-filters__actions">
            <Button aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)} type="link">
              {moreOpen ? "收起更多筛选" : moreCount > 0 ? `更多筛选（已设 ${moreCount} 项）` : "更多筛选"}
              <DownOutlined className={moreOpen ? "device-ops-flip" : undefined} aria-hidden="true" aria-label={undefined} />
            </Button>
            <Space>
              <Button onClick={resetFilters} type="text">
                重置
              </Button>
              <Button htmlType="submit" type="primary">
                查询
              </Button>
            </Space>
          </div>
        </Form>
      </section>

      <section aria-label="烧录记录" className="device-ops-panel device-ops-panel--table">
        <div className="device-ops-toolbar">
          <span className="device-ops-toolbar__count">
            共 <strong className="device-ops-num">{dataState === "loading" || dataState === "error" ? DASH : rows.length}</strong> 条烧录记录
            {selectedKeys.length > 0 && <>，已选 <strong className="device-ops-num">{selectedKeys.length}</strong> 项</>}
          </span>
          <Space>
            <Button aria-label="刷新" icon={<ReloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => message.success("已按当前筛选条件刷新列表")} type="text" />
            {guard(
              "production:flashing:export",
              <Button disabled={readonly || rows.length === 0} icon={<DownloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => exportRows(rows.length)}>
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
                    writeStored(window.localStorage, FLASHING_STORAGE_KEYS.columns, hidden);
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
            action={
              <Button onClick={retry} size="small">
                重试
              </Button>
            }
            description="网络异常或服务暂时不可用，请稍后重试。"
            showIcon
            title="烧录记录加载失败"
            type="error"
          />
        ) : dataState === "loading" ? (
          <Skeleton active paragraph={{ rows: 8 }} title={false} />
        ) : (
          <Table<FlashingRecord>
            columns={visibleColumns}
            dataSource={rows}
            locale={{ emptyText }}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], showSizeChanger: true, showTotal: (count) => `共 ${count} 条` }}
            rowKey="sn"
            rowSelection={{ selectedRowKeys: selectedKeys, onChange: (keys) => setSelectedKeys(keys as string[]) }}
            scroll={{ x: "max-content" }}
          />
        )}
      </section>

      {selectedKeys.length > 0 && (
        <div aria-label="批量操作" className="device-ops-selection-bar" role="region">
          <span>
            已选 <strong className="device-ops-num">{selectedKeys.length}</strong> 项
          </span>
          <Space>
            {guard(
              "production:flashing:mark_failed",
              <Tooltip title={bulkAvailability.markFail.ok ? undefined : bulkAvailability.markFail.reason}>
                <span className="device-ops-guard">
                  <Button disabled={readonly || !bulkAvailability.markFail.ok} onClick={() => setBulkFailOpen(true)} type="primary">
                    批量标记失败
                  </Button>
                </span>
              </Tooltip>
            )}
            {guard(
              "production:flashing:scrap",
              <Tooltip title={bulkAvailability.scrap.ok ? undefined : bulkAvailability.scrap.reason}>
                <span className="device-ops-guard">
                  <Button danger disabled={readonly || !bulkAvailability.scrap.ok} onClick={() => { setBulkScrapOpen(true); setBulkScrapConfirm(""); }}>
                    批量超限报废
                  </Button>
                </span>
              </Tooltip>
            )}
            {guard(
              "production:flashing:export",
              <Button disabled={readonly} onClick={() => exportRows(selectedKeys.length)}>
                批量导出
              </Button>
            )}
            <Button onClick={() => setSelectedKeys([])} type="text">
              取消选择
            </Button>
          </Space>
        </div>
      )}

      {/* 烧录日志详情 Drawer 640px：基础信息 + 日志时间线 + 失败时的错误摘要 */}
      <Drawer destroyOnHidden onClose={() => setDetailSn(null)} open={detailRecord !== null} size={640} title={detailRecord ? `烧录日志详情 · ${detailRecord.sn}` : "烧录日志详情"}>
        {detailRecord && (
          <>
            <section className="flashing-section">
              <h3>基础信息</h3>
              <dl className="flashing-kv">
                <div>
                  <dt>SN</dt>
                  <dd><SnLink sn={detailRecord.sn} /></dd>
                </div>
                <div><dt>机型</dt><dd>{detailRecord.model}</dd></div>
                <div><dt>固件版本</dt><dd className="device-ops-num">{detailRecord.firmwareVersion}</dd></div>
                <div><dt>烧录工位</dt><dd>{detailRecord.station}</dd></div>
                <div><dt>设备状态</dt><dd>{detailDevice ? <LifecycleTag value={detailDevice.lifecycle} /> : DASH}</dd></div>
                <div><dt>烧录结果</dt><dd><FlashingResultTag value={detailRecord.result} /></dd></div>
                <div><dt>证书状态</dt><dd><CertTag value={detailRecord.certState} /></dd></div>
                <div><dt>重试次数</dt><dd className="device-ops-num">{detailRecord.retryCount} / 上限 {detailRecord.retryLimit}</dd></div>
                <div><dt>烧录耗时</dt><dd className="device-ops-num">{detailRecord.durationSec === null ? DASH : `${detailRecord.durationSec} 秒`}</dd></div>
                <div><dt>操作人</dt><dd>{detailRecord.operator}</dd></div>
                <div><dt>烧录时间</dt><dd className="device-ops-num">{detailRecord.startedAt}</dd></div>
                <div><dt>烧录任务</dt><dd>{detailTask ? `${detailTask.taskId}（${detailTask.taskName}）` : detailRecord.taskId}</dd></div>
              </dl>
            </section>
            <section className="flashing-section">
              <h3>日志明细</h3>
              <ol aria-label="烧录日志" className="device-ops-timeline">
                {detailRecord.logSteps.map((step) => (
                  <li key={step.name}>
                    <span>{step.name}</span>
                    <Tag color={logStepMeta[step.status].color}>{logStepMeta[step.status].label}</Tag>
                    <span className="device-ops-num device-ops-timeline__time">{step.at ?? "未开始"}</span>
                    <span className="device-ops-muted">{step.durationSec === null ? DASH : `耗时 ${step.durationSec} 秒`}</span>
                  </li>
                ))}
              </ol>
            </section>
            {detailRecord.result === "failed" && detailRecord.failure && (
              <section className="flashing-section">
                <h3>错误摘要</h3>
                <dl className="flashing-kv">
                  <div><dt>错误分类</dt><dd><Tag color="error">{detailRecord.failure.category}</Tag></dd></div>
                  <div><dt>最后失败时间</dt><dd className="device-ops-num">{detailRecord.logSteps.filter((step) => step.status === "failed").pop()?.at ?? detailRecord.startedAt}</dd></div>
                  <div><dt>现场照片</dt><dd className="device-ops-num">{detailRecord.failure.photoCount} 张</dd></div>
                  <div className="flashing-kv-wide"><dt>错误描述</dt><dd>{detailRecord.failure.description}</dd></div>
                </dl>
              </section>
            )}
          </>
        )}
      </Drawer>

      {/* 失败原因登记 Drawer 480px：提交即确认，不叠加弹窗 */}
      <Drawer
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={() => setFailSn(null)}>取消</Button>
            {guard(
              "production:flashing:mark_failed",
              <Button
                disabled={readonly || !failCategory || failDescription.trim() === ""}
                loading={failSn !== null && actingKey === `fail:${failSn}`}
                onClick={submitFail}
                type="primary"
              >
                确认提交
              </Button>
            )}
          </Space>
        }
        onClose={() => setFailSn(null)}
        open={failSn !== null}
        size={480}
        title="失败原因登记"
      >
        {failSn && (
          <>
            <section className="flashing-section">
              <h3>设备摘要</h3>
              <dl className="flashing-kv">
                <div><dt>SN</dt><dd className="device-ops-num">{failSn}</dd></div>
                <div><dt>机型</dt><dd>{deviceBySn.get(failSn)?.model ?? DASH}</dd></div>
                <div><dt>固件版本</dt><dd className="device-ops-num">{records.find((record) => record.sn === failSn)?.firmwareVersion ?? DASH}</dd></div>
                <div>
                  <dt>当前重试次数</dt>
                  <dd className="device-ops-num">
                    {(() => {
                      const record = records.find((item) => item.sn === failSn);
                      return record ? `${record.retryCount} / 上限 ${record.retryLimit}` : DASH;
                    })()}
                  </dd>
                </div>
              </dl>
            </section>
            <Form layout="vertical">
              <Form.Item label="失败原因分类" required>
                <Select onChange={(value) => setFailCategory(value)} options={failureCategoryOptions} placeholder="选择失败原因分类" value={failCategory} />
              </Form.Item>
              <Form.Item label="失败描述" required>
                <Input.TextArea maxLength={500} onChange={(event) => setFailDescription(event.target.value)} placeholder="描述失败现象与已排查项（不超过 500 字）" rows={4} showCount value={failDescription} />
              </Form.Item>
              <Form.Item extra="现场照片仅登记附件，不随记录上传；jpg / png / jpeg，单张不超过 5 MB，最多 3 张。" label="现场照片（选填，最多 3 张）">
                <Upload
                  accept=".jpg,.jpeg,.png"
                  beforeUpload={(file) => {
                    if (file.size > 5 * 1024 * 1024) {
                      message.error("单张照片不能超过 5 MB");
                      return Upload.LIST_IGNORE;
                    }
                    return false;
                  }}
                  fileList={failPhotos}
                  maxCount={3}
                  onChange={(info) => setFailPhotos(info.fileList)}
                >
                  <Button>选择照片</Button>
                </Upload>
              </Form.Item>
            </Form>
          </>
        )}
      </Drawer>

      {/* 超限报废 C 档强确认：手动输入「确认报废」激活确认按钮 */}
      <Modal
        cancelText="取消"
        destroyOnHidden
        okButtonProps={{ danger: true, disabled: scrapConfirm !== SCRAP_CONFIRM_TEXT }}
        okText="确认报废"
        onCancel={() => setScrapSn(null)}
        onOk={() => scrapRecord && doScrap(scrapRecord)}
        open={scrapRecord !== null}
        title="超限报废确认"
        width={480}
      >
        {scrapRecord && (
          <>
            <Alert showIcon title={`此操作不可逆！设备 SN ${scrapRecord.sn} 将进入报废终态，无法恢复。`} type="error" />
            <dl className="flashing-kv flashing-modal-kv">
              <div><dt>SN</dt><dd className="device-ops-num">{scrapRecord.sn}</dd></div>
              <div><dt>机型</dt><dd>{scrapRecord.model}</dd></div>
              <div><dt>固件版本</dt><dd className="device-ops-num">{scrapRecord.firmwareVersion}</dd></div>
              <div><dt>已重试次数</dt><dd className="device-ops-num">{scrapRecord.retryCount} / 上限 {scrapRecord.retryLimit}</dd></div>
            </dl>
            <Form.Item extra={`请输入「${SCRAP_CONFIRM_TEXT}」以确认操作`} label="确认输入" required>
              <Input onChange={(event) => setScrapConfirm(event.target.value.trim())} placeholder={SCRAP_CONFIRM_TEXT} value={scrapConfirm} />
            </Form.Item>
          </>
        )}
      </Modal>

      {/* 批量标记失败 C 档对话框：列 SN 清单 + 统一原因必填 */}
      <Modal
        cancelText="取消"
        destroyOnHidden
        okButtonProps={{ disabled: !bulkFailCategory || bulkFailDescription.trim() === "" }}
        okText={`确认批量标记失败（${selectedRecords.length}）`}
        onCancel={() => setBulkFailOpen(false)}
        onOk={submitBulkFail}
        open={bulkFailOpen}
        title="批量标记失败"
        width={600}
      >
        <section className="flashing-section">
          <h3>已选设备（{selectedRecords.length} 台）</h3>
          <ul className="flashing-sn-list">
            {selectedRecords.map((record) => (
              <li key={record.sn}>
                <span className="device-ops-num">{record.sn}</span>
                <span className="device-ops-muted">{record.model}</span>
                <span className="device-ops-muted">当前状态：{deviceBySn.get(record.sn) ? lifecycleMeta[deviceBySn.get(record.sn)!.lifecycle].label : DASH}</span>
              </li>
            ))}
          </ul>
        </section>
        <p className="device-ops-modal-note">所有选中设备将统一使用以下失败原因，如需差异化请逐条操作。</p>
        <Form layout="vertical">
          <Form.Item label="失败原因分类" required>
            <Select onChange={(value) => setBulkFailCategory(value)} options={failureCategoryOptions} placeholder="选择失败原因分类" value={bulkFailCategory} />
          </Form.Item>
          <Form.Item label="失败描述" required>
            <Input.TextArea maxLength={500} onChange={(event) => setBulkFailDescription(event.target.value)} placeholder="统一失败描述（不超过 500 字）" rows={3} showCount value={bulkFailDescription} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量超限报废 C 档强确认，与单行同一档位 */}
      <Modal
        cancelText="取消"
        destroyOnHidden
        okButtonProps={{ danger: true, disabled: bulkScrapConfirm !== SCRAP_CONFIRM_TEXT }}
        okText={`确认报废（${selectedRecords.length}）`}
        onCancel={() => setBulkScrapOpen(false)}
        onOk={submitBulkScrap}
        open={bulkScrapOpen}
        title="批量超限报废确认"
        width={480}
      >
        <Alert showIcon title={`此操作不可逆！${selectedRecords.length} 台设备将进入报废终态，无法恢复。`} type="error" />
        <ul className="flashing-sn-list">
          {selectedRecords.map((record) => (
            <li key={record.sn}>
              <span className="device-ops-num">{record.sn}</span>
              <span className="device-ops-muted">{record.model}</span>
              <span className="device-ops-num device-ops-muted">已重试 {record.retryCount} / 上限 {record.retryLimit}</span>
            </li>
          ))}
        </ul>
        <Form.Item extra={`请输入「${SCRAP_CONFIRM_TEXT}」以确认操作`} label="确认输入" required>
          <Input onChange={(event) => setBulkScrapConfirm(event.target.value.trim())} placeholder={SCRAP_CONFIRM_TEXT} value={bulkScrapConfirm} />
        </Form.Item>
      </Modal>

      {/* 证书签发详情 Drawer 560px：指纹块仅 cert:view 权限可见，隔离说明常驻 */}
      <Drawer destroyOnHidden onClose={() => setCertSn(null)} open={certRecord !== null} size={560} title={certRecord ? `证书签发详情 · ${certRecord.sn}` : "证书签发详情"}>
        {certRecord && (
          <>
            <section className="flashing-section">
              <h3>证书基础信息</h3>
              <dl className="flashing-kv">
                <div><dt>证书序列号</dt><dd className="device-ops-num">{certField("证书编号")}</dd></div>
                <div><dt>证书模板</dt><dd>{certTask?.certTemplate ?? DASH}</dd></div>
                <div><dt>签发时间</dt><dd className="device-ops-num">{certField("签发时间")}</dd></div>
                <div><dt>有效期至</dt><dd className="device-ops-num">{certField("有效期至")}</dd></div>
                <div><dt>吊销状态</dt><dd>{certField("吊销状态")}</dd></div>
              </dl>
            </section>
            {readonly ? (
              <section className="flashing-section">
                <h3>设备指纹信息</h3>
                <p className="device-ops-modal-note">当前账号无 production:flashing:cert:view 权限，设备指纹与证书指纹不可见。</p>
              </section>
            ) : (
              <section className="flashing-section">
                <h3>设备指纹信息</h3>
                <dl className="flashing-kv">
                  <div className="flashing-kv-wide">
                    <dt>设备指纹</dt>
                    <dd className="device-ops-num">{certField("固件 hash") === DASH ? DASH : certField("固件 hash").replace("sha256:", "SHA-256 设备指纹 ")}</dd>
                  </div>
                  <div className="flashing-kv-wide"><dt>证书指纹</dt><dd className="device-ops-num">{certField("公钥指纹")}</dd></div>
                </dl>
              </section>
            )}
            <Alert showIcon title="证书指纹属设备身份 ID，仅限生产域查阅，不与广告域数据关联" type="info" />
          </>
        )}
      </Drawer>

    </div>
  );
}
