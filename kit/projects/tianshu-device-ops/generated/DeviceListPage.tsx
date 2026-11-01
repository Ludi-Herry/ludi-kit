import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Popover,
  Segmented,
  Select,
  Skeleton,
  Space,
  Table,
  type TableColumnsType
} from "antd";
import { DeleteOutlined, DownOutlined, DownloadOutlined, ReloadOutlined, SettingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  batches,
  firmwareVersions,
  lifecycleMeta,
  models,
  onlineMeta,
  phaseMeta,
  provinces,
  qcMeta,
  type Device,
  type LifecycleState,
  type OnlineState,
  type Phase,
  type QcResult
} from "../data";
import { activatedRangeDates, unresolvedAlertCountBySn, useDeviceOpsState } from "../store";
import { LifecycleTag, OnlineTag, SnLink, appPath, useDataState, usePermission, useQueryParams, useRouter } from "../ui";
import {
  activeMoreCount,
  baseViewLabels,
  createSavedView,
  deriveDeviceList,
  emptyFilters,
  initialDeviceListState,
  isDefaultView,
  removeSavedView,
  STORAGE_KEYS,
  viewNameError as viewNameErrorOf,
  withoutPhone
} from "../core/deviceList";
import { readStored, writeStored } from "../core/storage";

type Range = [string, string] | null;
type Filters = {
  sn: string;
  models: string[];
  batches: string[];
  lifecycles: LifecycleState[];
  onlines: OnlineState[];
  firmware: string[];
  provinces: string[];
  activated: Range;
  factory: Range;
  qc: QcResult[];
  phone: string;
};
type PhaseKey = "all" | Phase;
type BaseView = "all" | "abnormal" | "after_sales" | "ready";
type SavedView = { id: string; name: string; base: BaseView; filters: Filters; phase?: PhaseKey };
type StoredViews = { views: SavedView[]; defaultView: string | null };

function toOptions<T extends string>(map: Record<T, { label: string }>) {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value].label }));
}

const modelOptions = models.map((value) => ({ value, label: value }));
const batchOptions = batches.map((value) => ({ value, label: value }));
const firmwareOptions = firmwareVersions.map((value) => ({ value, label: value }));
const provinceOptions = provinces.map((value) => ({ value, label: value }));

const optionalColumns = [
  { key: "model", label: "机型" },
  { key: "batch", label: "批次" },
  { key: "firmware", label: "固件版本" },
  { key: "heartbeat", label: "最后心跳" },
  { key: "shippedAt", label: "出厂日期" }
];

export function DeviceListPage() {
  const { message } = App.useApp();
  const { navigate } = useRouter();
  const params = useQueryParams();
  const dataState = useDataState();
  const { readonly, guard } = usePermission();
  const { devices: storeDevices, alerts } = useDeviceOpsState();
  const devices = dataState === "empty" ? [] : storeDevices;
  const unresolved = useMemo(() => unresolvedAlertCountBySn(alerts), [alerts]);

  const [init] = useState(() =>
    initialDeviceListState({ search: window.location.search, storage: window.localStorage, rangeDates: activatedRangeDates })
  );
  const [draft, setDraft] = useState<Filters>(init.filters);
  const [applied, setApplied] = useState<Filters>(init.filters);
  const [phase, setPhase] = useState<PhaseKey>(init.phase);
  const [viewKey, setViewKey] = useState<string>(init.viewKey);
  const [views, setViews] = useState<SavedView[]>(init.views);
  const [defaultView, setDefaultView] = useState<string | null>(init.defaultView);
  const [moreOpen, setMoreOpen] = useState(() => activeMoreCount(init.filters) > 0);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => readStored<string[]>(window.localStorage, STORAGE_KEYS.columns) ?? []);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewNameError, setViewNameError] = useState("");

  // 手机号是敏感条件，不写入记忆。
  useEffect(() => {
    writeStored(window.localStorage, STORAGE_KEYS.filter, { filters: withoutPhone(applied), phase });
  }, [applied, phase]);

  const persistViews = (nextViews: SavedView[], nextDefault: string | null) => {
    setViews(nextViews);
    setDefaultView(nextDefault);
    writeStored(window.localStorage, STORAGE_KEYS.views, { views: nextViews, defaultView: nextDefault } satisfies StoredViews);
  };

  // 阶段条按“当前视图 + 已生效筛选”统计（阶段本身不参与计数）；行默认按未处理告警数降序（轻重缓急），
  // 同数时最近心跳在前；已选阶段在当前范围内没有设备时回到“全部”，避免停在一个永远为空的阶段上。
  const { activeSaved, base, currentViewLabel, phaseCounts, activePhase, rows } = useMemo(
    () => deriveDeviceList({ devices, unresolved, applied, phase, viewKey, views }),
    [devices, unresolved, applied, phase, viewKey, views]
  );

  const runQuery = () => {
    setApplied(draft);
    setSelectedKeys([]);
  };

  const resetFilters = () => {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setPhase("all");
    setSelectedKeys([]);
  };

  const patchDraft = (patch: Partial<Filters>) => setDraft((current) => ({ ...current, ...patch }));

  const selectView = (key: string) => {
    setViewKey(key);
    const saved = views.find((view) => `my:${view.id}` === key);
    if (saved) {
      setDraft(withoutPhone(saved.filters));
      setApplied(withoutPhone(saved.filters));
      setPhase(saved.phase ?? "all");
    }
    setSelectedKeys([]);
  };

  const removeView = (id: string) => {
    const next = removeSavedView({ views, defaultView }, id);
    persistViews(next.views, next.defaultView);
    if (viewKey === `my:${id}`) setViewKey("all");
    message.success("已删除该视图");
  };

  const saveView = () => {
    const error = viewNameErrorOf(viewName, views);
    if (error) {
      setViewNameError(error);
      return;
    }
    const name = viewName.trim();
    const saved = createSavedView(views, { name, base, filters: draft, phase: activePhase });
    persistViews([...views, saved], defaultView);
    setApplied(draft);
    setViewKey(`my:${saved.id}`);
    setSaveOpen(false);
    setViewName("");
    setViewNameError("");
    message.success(`已保存为「${name}」，可在「我的视图」中找到`);
  };

  const isDefaultKey = (key: string) => isDefaultView(defaultView, key);
  const defaultMark = <span className="device-ops-default-mark">默认</span>;
  const setAsDefault = () => {
    persistViews(views, viewKey);
    message.success(`已将「${currentViewLabel}」设为默认视图`);
  };

  const exportRows = (count: number) => message.success(`已导出 ${count} 台设备的清单`);

  const columns: TableColumnsType<Device> = [
    {
      title: "SN",
      dataIndex: "sn",
      key: "sn",
      width: 156,
      fixed: "left",
      render: (sn: string) => <SnLink sn={sn} />
    },
    // 1200px 以下按列表模板隐藏次要列，保证固定列不压住相邻列、表格不需要横向滚动。
    { title: "机型", dataIndex: "model", key: "model", width: 96, responsive: ["xl"] },
    { title: "批次", dataIndex: "batch", key: "batch", width: 72, responsive: ["xl"] },
    {
      title: "生命周期状态",
      dataIndex: "lifecycle",
      key: "lifecycle",
      width: 116,
      render: (value: LifecycleState) => <LifecycleTag value={value} />
    },
    {
      title: "在网状态",
      dataIndex: "online",
      key: "online",
      width: 96,
      render: (value: OnlineState | null) => <OnlineTag value={value} />
    },
    {
      title: "固件版本",
      dataIndex: "firmware",
      key: "firmware",
      responsive: ["xl"],
      width: 92,
      render: (value: string | null) => value ?? "—"
    },
    {
      title: "最后心跳",
      dataIndex: "lastHeartbeat",
      key: "heartbeat",
      responsive: ["xl"],
      width: 112,
      sorter: (a, b) => (a.lastHeartbeat ?? "").localeCompare(b.lastHeartbeat ?? ""),
      // 心跳都在近期，列内省去年份保证单行，完整时间放在悬停提示里。
      render: (value: string | null) => value ? <span className="device-ops-num" title={value}>{value.slice(5)}</span> : "—"
    },
    {
      title: "未处理告警",
      key: "alerts",
      width: 124,
      align: "right",
      defaultSortOrder: "descend",
      sorter: (a, b) => (unresolved.get(a.sn) ?? 0) - (unresolved.get(b.sn) ?? 0),
      // 0 就显示 0（浅色降噪），“—”只留给不适用的情况。
      render: (_, device) => {
        const count = unresolved.get(device.sn) ?? 0;
        return count > 0 ? (
          <a className="device-ops-num" href={appPath(`/alerts?sn=${device.sn}`)}>{count}</a>
        ) : (
          <span className="device-ops-num device-ops-muted">0</span>
        );
      }
    },
    {
      title: "出厂日期",
      dataIndex: "shippedAt",
      key: "shippedAt",
      width: 112,
      // 低优先列：1600px 以下隐藏，保证固定的操作列不压住相邻列。
      responsive: ["xxl"],
      render: (value: string | null) => <span className="device-ops-num">{value ?? "—"}</span>
    },
    {
      title: "操作",
      key: "actions",
      className: "device-ops-col-actions",
      fixed: "right",
      // 最多三个动作，直接平铺；无权限或未开放的动作保持可见，悬停说明原因。1200px 以下收起“查看护照”，保证表格不横向滚动。
      render: (_, device) => (
        <Space size={0}>
          <Button href={appPath(`/devices/${device.sn}`)} size="small" type="link">查看</Button>
          {device.shippedAt && (
            <Button
              className="device-ops-passport-link"
              href={appPath(`/lifecycle/passport/${device.sn}?from=${encodeURIComponent(appPath("/devices"))}`)}
              size="small"
              type="link"
            >
              查看护照
            </Button>
          )}
          {device.lifecycle === "shipped" &&
            guard("发起退货", <Button disabled={readonly} href={appPath(`/devices/${device.sn}`)} size="small" type="link">发起 RMA</Button>)}
        </Space>
      )
    }
  ];
  const visibleColumns = columns.filter((column) => !hiddenColumns.includes(String(column.key)));

  const emptyText = devices.length === 0 ? (
    <Empty description="暂无设备数据" />
  ) : (
    <Empty description="没有符合条件的设备，请调整筛选条件后重新查询">
      <Button onClick={resetFilters}>重置筛选</Button>
    </Empty>
  );

  const moreCount = activeMoreCount(draft);
  const phaseButtons: { key: PhaseKey; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "production", label: phaseMeta.production.label },
    { key: "running", label: phaseMeta.running.label },
    { key: "after_sales", label: phaseMeta.after_sales.label }
  ];
  const total = phaseCounts.all || 1;

  return (
    <div className="device-ops-stack">
      <header className="device-ops-title-row">
        <h1 className="device-ops-title">全部设备</h1>
        <div className="device-ops-views">
          <Segmented<string>
            aria-label="视图"
            onChange={selectView}
            options={(Object.keys(baseViewLabels) as BaseView[]).map((key) => ({
              value: key,
              label: (
                <span className="device-ops-view-label">
                  {baseViewLabels[key]}
                  {isDefaultKey(key) && defaultMark}
                </span>
              )
            }))}
            value={viewKey.startsWith("my:") ? "" : viewKey}
          />
          <Select
            allowClear
            className="device-ops-views__mine"
            onChange={(value) => selectView(value ?? "all")}
            labelRender={(option) => {
              const saved = views.find((view) => `my:${view.id}` === option.value);
              return (
                <span className="device-ops-view-label">
                  {saved?.name ?? option.label}
                  {isDefaultKey(String(option.value)) && defaultMark}
                </span>
              );
            }}
            optionRender={(option) => (
              <div className="device-ops-view-option">
                <span className="device-ops-view-label">
                  {option.label}
                  {isDefaultKey(String(option.value)) && defaultMark}
                </span>
                <Button
                  aria-label={`删除视图 ${String(option.label)}`}
                  icon={<DeleteOutlined aria-hidden="true" aria-label={undefined} />}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeView(String(option.value).replace("my:", ""));
                  }}
                  size="small"
                  type="text"
                />
              </div>
            )}
            options={views.map((view) => ({ value: `my:${view.id}`, label: view.name }))}
            placeholder={views.length ? `我的视图（${views.length}）` : "我的视图（暂无）"}
            value={activeSaved ? viewKey : undefined}
          />
          {!isDefaultKey(viewKey) && (
            <Button onClick={setAsDefault} type="link">设为默认</Button>
          )}
        </div>
      </header>

      <section aria-label="生命周期阶段" className="device-ops-phase">
        {phaseButtons.map((item) => (
          <button
            aria-pressed={activePhase === item.key}
            className="device-ops-phase__item"
            disabled={item.key !== "all" && phaseCounts[item.key] === 0}
            key={item.key}
            onClick={() => {
              setPhase(item.key);
              setSelectedKeys([]);
            }}
            title={item.key !== "all" && phaseCounts[item.key] === 0 ? "当前视图与筛选下没有该阶段的设备" : undefined}
            type="button"
          >
            <span className="device-ops-phase__label">{item.label}</span>
            <strong className="device-ops-phase__count">{phaseCounts[item.key]}</strong>
            <span className="device-ops-phase__bar">
              <span style={{ width: `${(phaseCounts[item.key] / total) * 100}%` }} />
            </span>
          </button>
        ))}
      </section>

      <section aria-label="筛选" className="device-ops-panel">
        <Form layout="vertical" onFinish={runQuery}>
          <div className="device-ops-filters">
            <Form.Item label="SN">
              <Input allowClear onChange={(event) => patchDraft({ sn: event.target.value })} onPressEnter={runQuery} placeholder="输入完整或部分 SN" value={draft.sn} />
            </Form.Item>
            <Form.Item label="机型">
              <Select allowClear maxTagCount="responsive" mode="multiple" onChange={(value) => patchDraft({ models: value })} options={modelOptions} placeholder="全部机型" value={draft.models} />
            </Form.Item>
            <Form.Item label="批次">
              <Select allowClear maxTagCount="responsive" mode="multiple" onChange={(value) => patchDraft({ batches: value })} options={batchOptions} placeholder="全部批次" value={draft.batches} />
            </Form.Item>
            <Form.Item label="生命周期状态">
              <Select allowClear maxTagCount="responsive" mode="multiple" onChange={(value) => patchDraft({ lifecycles: value })} options={toOptions(lifecycleMeta)} placeholder="全部状态" value={draft.lifecycles} />
            </Form.Item>
            <Form.Item label="在网状态">
              <Select allowClear maxTagCount="responsive" mode="multiple" onChange={(value) => patchDraft({ onlines: value })} options={toOptions(onlineMeta)} placeholder="全部" value={draft.onlines} />
            </Form.Item>
          </div>
          {moreOpen && (
            <div className="device-ops-filters device-ops-filters--more">
              <Form.Item label="固件版本">
                <Select allowClear maxTagCount="responsive" mode="multiple" onChange={(value) => patchDraft({ firmware: value })} options={firmwareOptions} placeholder="全部版本" value={draft.firmware} />
              </Form.Item>
              <Form.Item label="地区（省）">
                <Select allowClear maxTagCount="responsive" mode="multiple" onChange={(value) => patchDraft({ provinces: value })} options={provinceOptions} placeholder="全部地区" value={draft.provinces} />
              </Form.Item>
              <Form.Item label="激活时间">
                <DatePicker.RangePicker
                  onChange={(values) =>
                    patchDraft({ activated: values?.[0] && values[1] ? [values[0].format("YYYY-MM-DD"), values[1].format("YYYY-MM-DD")] : null })
                  }
                  value={draft.activated ? [dayjs(draft.activated[0]), dayjs(draft.activated[1])] : null}
                />
              </Form.Item>
              <Form.Item label="出厂日期">
                <DatePicker.RangePicker
                  onChange={(values) =>
                    patchDraft({ factory: values?.[0] && values[1] ? [values[0].format("YYYY-MM-DD"), values[1].format("YYYY-MM-DD")] : null })
                  }
                  value={draft.factory ? [dayjs(draft.factory[0]), dayjs(draft.factory[1])] : null}
                />
              </Form.Item>
              <Form.Item label="质检结论">
                <Select allowClear maxTagCount="responsive" mode="multiple" onChange={(value) => patchDraft({ qc: value })} options={toOptions(qcMeta)} placeholder="全部结论" value={draft.qc} />
              </Form.Item>
              <Form.Item label="绑定手机号">
                <Input allowClear inputMode="numeric" onChange={(event) => patchDraft({ phone: event.target.value })} onPressEnter={runQuery} placeholder="输入手机号，刷新后不保留" value={draft.phone} />
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
              <Button onClick={() => setSaveOpen(true)}>保存为我的视图</Button>
              <Button htmlType="submit" type="primary">查询</Button>
            </Space>
          </div>
        </Form>
      </section>

      <section aria-label="设备列表" className="device-ops-panel device-ops-panel--table">
        <div className="device-ops-toolbar">
          <span className="device-ops-toolbar__count">
            共 <strong className="device-ops-num">{dataState === "loading" || dataState === "error" ? "—" : rows.length}</strong> 台设备
            {selectedKeys.length > 0 && <>，已选 <strong className="device-ops-num">{selectedKeys.length}</strong> 项</>}
          </span>
          <Space>
            <Button aria-label="刷新" icon={<ReloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => message.success("已刷新")} type="text" />
            {guard(
              "导出",
              <Button disabled={readonly || rows.length === 0} icon={<DownloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => exportRows(rows.length)}>
                导出当前结果
              </Button>
            )}
            <Popover
              content={
                <Checkbox.Group
                  className="device-ops-column-setting"
                  onChange={(checked) => {
                    const hidden = optionalColumns.map((item) => item.key).filter((key) => !checked.includes(key));
                    setHiddenColumns(hidden);
                    writeStored(window.localStorage, STORAGE_KEYS.columns, hidden);
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
            action={<Button onClick={() => { const next = new URLSearchParams(params); next.delete("dataState"); navigate(`${appPath("/devices")}${next.size ? `?${next}` : ""}`); }} size="small">重试</Button>}
            description="网络异常或服务暂时不可用，请稍后重试。"
            showIcon
            title="设备列表加载失败"
            type="error"
          />
        ) : dataState === "loading" ? (
          <Skeleton active paragraph={{ rows: 8 }} title={false} />
        ) : (
          <Table<Device>
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
          <span>已选 <strong className="device-ops-num">{selectedKeys.length}</strong> 项</span>
          <Space>
            {guard(
              "导出",
              <Button disabled={readonly} onClick={() => exportRows(selectedKeys.length)} type="primary">导出所选</Button>
            )}
            <Button onClick={() => setSelectedKeys([])}>取消选择</Button>
          </Space>
        </div>
      )}

      <Modal
        cancelText="取消"
        destroyOnHidden
        okText="保存"
        onCancel={() => { setSaveOpen(false); setViewNameError(""); }}
        onOk={saveView}
        open={saveOpen}
        title="保存为我的视图"
      >
        <Form layout="vertical">
          <Form.Item extra="保存后，当前视图范围、阶段与筛选条件会一起记住" help={viewNameError || undefined} label="视图名称" required validateStatus={viewNameError ? "error" : undefined}>
            <Input maxLength={12} onChange={(event) => { setViewName(event.target.value); setViewNameError(""); }} onPressEnter={saveView} placeholder="例如：华南离线设备" value={viewName} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
