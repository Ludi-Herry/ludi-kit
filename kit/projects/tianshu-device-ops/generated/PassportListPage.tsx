import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  QRCode,
  Select,
  Skeleton,
  Space,
  Table,
  Tooltip,
  Typography,
  type TableColumnsType
} from "antd";
import {
  DownOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  SettingOutlined,
  UpOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  firmwareVersions,
  lifecycleMeta,
  models,
  qcMeta,
  type Device,
  type LifecycleState,
  type PassportPublishConfig,
  type QcResult
} from "../data";
import { latestEventBySn, useDeviceOpsState, deviceOpsStore } from "../store";
import {
  appPath,
  returnUrlFrom,
  useDataState,
  usePermission,
  useQueryParams,
  useRouter,
  LifecycleTag,
  PassportPublishTag,
  QcTag,
  SnLink
} from "../ui";
import {
  PASSPORT_STORAGE_KEYS,
  batchPublishBaseConfig,
  canBatchClosePublish,
  canBatchPublish,
  comparePassportsByDefault,
  emptyPassportFilters,
  publishRmaTimelineError
} from "../core/passportList";
import "./passport.css";

type DateRange = [string, string] | null;

type FilterFormValues = {
  sn: string;
  model: string | "all";
  lifecycles: LifecycleState[];
  qc: QcResult[];
  firmware: string[];
  factoryDateRange: DateRange;
  publishStatus: "all" | "published" | "unpublished";
  rmaStatus: "all" | "has_rma" | "no_rma";
};

const ALL_COLUMN_KEYS = [
  "sn",
  "model",
  "firmware",
  "lifecycle",
  "qc",
  "shippedAt",
  "latestEvent",
  "publishStatus",
  "rmaCount",
  "actions"
] as const;

type ColumnKey = (typeof ALL_COLUMN_KEYS)[number];

const columnTitles: Record<ColumnKey, string> = {
  sn: "SN",
  model: "机型",
  firmware: "固件版本",
  lifecycle: "生命周期状态",
  qc: "质检结论",
  shippedAt: "出厂日期",
  latestEvent: "最近事件",
  publishStatus: "是否对外公开",
  rmaCount: "RMA 次数",
  actions: "操作"
};

export function PassportListPage() {
  const { modal, message } = App.useApp();
  const { pathname, search, navigate } = useRouter();
  const queryParams = useQueryParams();
  const dataState = useDataState();
  const { readonly, guard } = usePermission();

  const { devices, passportEvents } = useDeviceOpsState();

  const [filterForm] = Form.useForm<FilterFormValues>();
  const [expandMoreFilters, setExpandMoreFilters] = useState(false);
  const [filters, setFilters] = useState<FilterFormValues>(() => {
    const urlSn = queryParams.get("sn");
    if (urlSn) {
      return { ...emptyPassportFilters, sn: urlSn.trim() };
    }
    try {
      const saved = localStorage.getItem(PASSPORT_STORAGE_KEYS.filters);
      if (saved) {
        return { ...emptyPassportFilters, ...JSON.parse(saved) };
      }
    } catch {
      // 忽略读取错误
    }
    return emptyPassportFilters;
  });

  const snInputRef = useRef<any>(null);

  // 处理 ?focus=sn 或 ?sn=
  useEffect(() => {
    const focus = queryParams.get("focus");
    const urlSn = queryParams.get("sn");
    if (urlSn) {
      filterForm.setFieldValue("sn", urlSn.trim());
      setFilters((prev) => ({ ...prev, sn: urlSn.trim() }));
    }
    if (focus === "sn" || urlSn) {
      setTimeout(() => {
        snInputRef.current?.focus?.();
      }, 50);
    }
  }, [queryParams, filterForm]);

  // 列设置显隐状态
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() => {
    try {
      const saved = localStorage.getItem(PASSPORT_STORAGE_KEYS.columns);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // 忽略
    }
    return [...ALL_COLUMN_KEYS];
  });

  const [colSettingOpen, setColSettingOpen] = useState(false);

  // 表格多选行
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // 设置公开范围 Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);

  // 生成二维码 Modal
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrSn, setQrSn] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 导出弹窗
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"page" | "all">("page");

  // 批量设置公开范围 Modal
  const [batchPublishModalOpen, setBatchPublishModalOpen] = useState(false);
  const [batchCloseModalOpen, setBatchCloseModalOpen] = useState(false);

  // 筛选提交
  const handleFilterFinish = (values: FilterFormValues) => {
    const nextFilters: FilterFormValues = {
      sn: (values.sn || "").trim(),
      model: values.model || "all",
      lifecycles: Array.isArray(values.lifecycles) ? values.lifecycles : [],
      qc: Array.isArray(values.qc) ? values.qc : [],
      firmware: Array.isArray(values.firmware) ? values.firmware : [],
      factoryDateRange: values.factoryDateRange || null,
      publishStatus: values.publishStatus || "all",
      rmaStatus: values.rmaStatus || "all"
    };
    setFilters(nextFilters);
    try {
      localStorage.setItem(PASSPORT_STORAGE_KEYS.filters, JSON.stringify(nextFilters));
    } catch {
      // 忽略
    }
  };

  const handleReset = () => {
    filterForm.resetFields();
    setSelectedModel(undefined);
    setFilters(emptyPassportFilters);
    try {
      localStorage.removeItem(PASSPORT_STORAGE_KEYS.filters);
    } catch {
      // 忽略
    }
  };

  // 出厂日期范围选择限制 366 天
  const handleFactoryDateChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      const diff = dates[1].diff(dates[0], "day");
      if (diff > 366) {
        message.warning("出厂日期跨度不能超过 366 天，请重新选择");
        filterForm.setFieldValue("factoryDateRange", null);
        return;
      }
      filterForm.setFieldValue("factoryDateRange", [
        dates[0].format("YYYY-MM-DD"),
        dates[1].format("YYYY-MM-DD")
      ]);
    } else {
      filterForm.setFieldValue("factoryDateRange", null);
    }
  };

  // 选定机型联动固件版本选项
  const [selectedModel, setSelectedModel] = useState<string | undefined>(filters.model);
  const firmwareOptions = useMemo(() => {
    return firmwareVersions.map((v) => ({ label: v, value: v }));
  }, []);

  // 过滤数据
  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      // 1. SN 模糊前缀匹配
      if (filters.sn) {
        const query = filters.sn.toLowerCase();
        if (!device.sn.toLowerCase().startsWith(query)) {
          return false;
        }
      }
      // 2. 机型
      if (filters.model && filters.model !== "all") {
        if (device.model !== filters.model) return false;
      }
      // 3. 当前生命周期
      if (filters.lifecycles && filters.lifecycles.length > 0) {
        if (!filters.lifecycles.includes(device.lifecycle)) return false;
      }
      // 4. 质检结论
      if (filters.qc && filters.qc.length > 0) {
        if (!filters.qc.includes(device.qc)) return false;
      }
      // 5. 固件版本
      if (filters.firmware && filters.firmware.length > 0) {
        if (!device.firmware || !filters.firmware.includes(device.firmware)) return false;
      }
      // 6. 出厂日期
      if (filters.factoryDateRange) {
        if (!device.shippedAt) return false;
        const [start, end] = filters.factoryDateRange;
        if (device.shippedAt < start || device.shippedAt > end) return false;
      }
      // 7. 是否对外公开
      if (filters.publishStatus && filters.publishStatus !== "all") {
        const isPub = device.passportPublish.publicEnabled;
        if (filters.publishStatus === "published" && !isPub) return false;
        if (filters.publishStatus === "unpublished" && isPub) return false;
      }
      // 8. 是否有 RMA 记录
      if (filters.rmaStatus && filters.rmaStatus !== "all") {
        if (filters.rmaStatus === "has_rma" && device.rmaCount === 0) return false;
        if (filters.rmaStatus === "no_rma" && device.rmaCount > 0) return false;
      }
      return true;
    });
  }, [devices, filters]);

  // 默认排序规则：出厂日期降序，未出货排在最后
  const sortedDevices = useMemo(() => {
    return [...filteredDevices].sort(comparePassportsByDefault);
  }, [filteredDevices]);

  // 打开 Drawer
  const openPublishDrawer = (device: Device) => {
    setEditingDevice(device);
    setDrawerOpen(true);
  };

  const handleSavePublish = (values: PassportPublishConfig) => {
    if (!editingDevice) return;
    const res = deviceOpsStore.savePassportPublish(editingDevice.sn, values);
    if (res.ok) {
      message.success(`已保存设备 ${editingDevice.sn} 的公开范围设置`);
      setDrawerOpen(false);
    } else {
      message.error(res.reason);
    }
  };

  const handleCloseSinglePublish = (device: Device) => {
    const res = deviceOpsStore.closePassportPublish(device.sn);
    if (res.ok) {
      message.success(`已关闭设备 ${device.sn} 的对外公开`);
    } else {
      message.error(res.reason);
    }
  };

  // 打开二维码 Modal
  const openQrModal = (sn: string) => {
    setQrSn(sn);
    setCopied(false);
    setQrModalOpen(true);
  };

  const qrDevice = useMemo(() => {
    if (!qrSn) return null;
    return devices.find((d) => d.sn === qrSn) ?? null;
  }, [qrSn, devices]);

  const passportQrUrl = qrSn ? `${window.location.origin}${appPath(`/lifecycle/passport/${qrSn}`)}` : "";

  const handleCopyQrUrl = () => {
    if (!passportQrUrl) return;
    navigator.clipboard?.writeText(passportQrUrl);
    setCopied(true);
    message.success("公开护照链接已复制到剪贴板");
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const handleDownloadQrPng = () => {
    if (!qrSn) return;
    message.info(`护照二维码下载任务已提交：passport-qr-${qrSn}-256.png`);
  };

  // 批量操作判断
  const selectedDevices = useMemo(() => {
    return devices.filter((d) => selectedRowKeys.includes(d.sn));
  }, [devices, selectedRowKeys]);

  const allSelectedShipped = useMemo(() => canBatchPublish(selectedDevices), [selectedDevices]);

  const allSelectedPublished = useMemo(() => canBatchClosePublish(selectedDevices), [selectedDevices]);

  const handleBatchPublish = () => {
    if (selectedRowKeys.length === 0) return;
    const res = deviceOpsStore.batchApplyPassportPublish(
      selectedRowKeys,
      batchPublishBaseConfig(devices.find((d) => d.sn === selectedRowKeys[0]))
    );
    if (res.ok) {
      message.success(res.message);
      setBatchPublishModalOpen(false);
      setSelectedRowKeys([]);
    } else {
      message.error(res.reason);
    }
  };

  const handleBatchClose = () => {
    if (selectedRowKeys.length === 0) return;
    const res = deviceOpsStore.batchClosePassportPublish(selectedRowKeys);
    if (res.ok) {
      message.success(res.message);
      setBatchCloseModalOpen(false);
      setSelectedRowKeys([]);
    } else {
      message.error(res.reason);
    }
  };

  const handleBatchExport = () => {
    message.success(`已提交 ${selectedRowKeys.length} 台设备的护照导出任务，完成后将通过站内信通知`);
  };

  const handleExportList = () => {
    const count = exportScope === "page" ? Math.min(20, sortedDevices.length) : sortedDevices.length;
    message.success(`已提交 ${count} 条护照记录导出任务，脱敏数据生成后将通过站内信通知`);
    setExportModalOpen(false);
  };

  // 列定义
  const columns: TableColumnsType<Device> = useMemo(() => {
    const rawCols: Record<ColumnKey, TableColumnsType<Device>[number]> = {
      sn: {
        title: "SN",
        dataIndex: "sn",
        key: "sn",
        width: 140,
        fixed: "left",
        sorter: (a, b) => a.sn.localeCompare(b.sn),
        render: (sn: string) => <SnLink sn={sn} />
      },
      model: {
        title: "机型",
        dataIndex: "model",
        key: "model",
        width: 110
      },
      firmware: {
        title: "固件版本",
        dataIndex: "firmware",
        key: "firmware",
        width: 100,
        render: (fw: string | null) => fw ?? <span className="device-ops-muted">—</span>
      },
      lifecycle: {
        title: "生命周期状态",
        dataIndex: "lifecycle",
        key: "lifecycle",
        width: 150,
        sorter: (a, b) => lifecycleMeta[a.lifecycle].order - lifecycleMeta[b.lifecycle].order,
        render: (state: LifecycleState) => <LifecycleTag value={state} />
      },
      qc: {
        title: "质检结论",
        dataIndex: "qc",
        key: "qc",
        width: 100,
        render: (qc: QcResult) => <QcTag value={qc} />
      },
      shippedAt: {
        title: "出厂日期",
        dataIndex: "shippedAt",
        key: "shippedAt",
        width: 120,
        sorter: (a, b) => {
          if (a.shippedAt && b.shippedAt) return a.shippedAt.localeCompare(b.shippedAt);
          if (a.shippedAt) return 1;
          if (b.shippedAt) return -1;
          return 0;
        },
        render: (date: string | null) => (date ? <span className="device-ops-num">{date}</span> : <span className="device-ops-muted">—</span>)
      },
      latestEvent: {
        title: "最近事件",
        key: "latestEvent",
        responsive: ["xl"],
        width: 240,
        ellipsis: true,
        render: (_: any, record: Device) => {
          const ev = latestEventBySn(passportEvents, record.sn);
          if (!ev) return <span className="device-ops-muted">—</span>;
          const fullText = `${ev.label} · ${ev.operator} · ${ev.summary} (${ev.at})`;
          const displayText = `${ev.label} · ${ev.operator} · ${ev.at}`;
          return (
            <Tooltip title={fullText} placement="topLeft">
              <span
                className="passport-event-cell"
                style={{
                  display: "inline-block",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  verticalAlign: "bottom"
                }}
              >
                {displayText}
              </span>
            </Tooltip>
          );
        }
      },
      publishStatus: {
        title: "是否对外公开",
        key: "publishStatus",
        width: 120,
        render: (_: any, record: Device) => <PassportPublishTag published={record.passportPublish.publicEnabled} />
      },
      rmaCount: {
        title: "RMA 次数",
        dataIndex: "rmaCount",
        key: "rmaCount",
        width: 100,
        sorter: (a, b) => a.rmaCount - b.rmaCount,
        render: (count: number) => {
          if (count === 0) {
            return <span className="device-ops-num device-ops-muted">0</span>;
          }
          return <span className="device-ops-num passport-rma-count">{count}</span>;
        }
      },
      actions: {
        title: "操作",
        key: "actions",
        fixed: "right",
        width: 340,
        render: (_: any, record: Device) => {
          const isShipped = record.lifecycle === "shipped";
          const isPublished = record.passportPublish.publicEnabled;
          const fromParam = encodeURIComponent(returnUrlFrom(pathname, search));

          // 1. 设置公开范围（2026-09-29 集成：无权限统一走 guard() 并写明权限点；
          // 其余 disabled 按钮也在 Tooltip 内垫 span，否则 antd v6 下悬停不弹出）
          let publishBtn: ReactNode;
          if (!isShipped) {
            publishBtn = (
              <Tooltip title="仅出货设备可设置公开范围">
                <span className="device-ops-guard">
                  <Button disabled size="small" type="link">
                    设置公开范围
                  </Button>
                </span>
              </Tooltip>
            );
          } else if (readonly) {
            publishBtn = guard(
              "production:passport:publish",
              <Button disabled size="small" type="link">
                设置公开范围
              </Button>
            );
          } else {
            publishBtn = (
              <Button
                size="small"
                type="link"
                onClick={() => openPublishDrawer(record)}
              >
                设置公开范围
              </Button>
            );
          }

          // 2. 生成二维码
          let qrBtn: ReactNode;
          if (!isShipped) {
            qrBtn = (
              <Tooltip title="仅出货设备可生成二维码">
                <span className="device-ops-guard">
                  <Button disabled size="small" type="link">
                    生成二维码
                  </Button>
                </span>
              </Tooltip>
            );
          } else if (readonly) {
            qrBtn = guard(
              "production:passport:qrcode",
              <Button disabled size="small" type="link">
                生成二维码
              </Button>
            );
          } else {
            qrBtn = (
              <Button
                size="small"
                type="link"
                onClick={() => openQrModal(record.sn)}
              >
                生成二维码
              </Button>
            );
          }

          // 3. 关闭公开：已公开时才存在，是第 4 个动作，按行操作规则（露出查看+至多 2 个
          // 状态动作）收进「更多」下拉；收进下拉后 B 档气泡确认改用对话框确认（modal.confirm）。
          // 只读账号的下拉项置灰，悬停说明缺哪项权限。
          let moreBtn: ReactNode;
          if (isPublished) {
            moreBtn = (
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "close-publish",
                      danger: true,
                      disabled: readonly,
                      label: readonly ? (
                        <Tooltip placement="left" title="当前账号无 production:passport:publish 权限">
                          <span>关闭公开</span>
                        </Tooltip>
                      ) : (
                        "关闭公开"
                      )
                    }
                  ],
                  onClick: ({ key }) => {
                    if (key !== "close-publish") return;
                    modal.confirm({
                      title: `关闭设备 ${record.sn} 的对外公开？`,
                      content: `关闭后设备 ${record.sn} 的数字护照立即对外不可见，消费者扫码将返回 404；内部档案数据不受影响，之后可重新设置公开范围恢复。`,
                      okText: "关闭公开",
                      cancelText: "取消",
                      onOk: () => handleCloseSinglePublish(record)
                    });
                  }
                }}
              >
                <Button size="small" type="link">
                  更多
                </Button>
              </Dropdown>
            );
          }

          return (
            <Space size={4} wrap={false} style={{ whiteSpace: "nowrap" }}>
              <a href={appPath(`/lifecycle/passport/${record.sn}?from=${fromParam}`)}>
                查看详情
              </a>
              {publishBtn}
              {qrBtn}
              {moreBtn}
            </Space>
          );
        }
      }
    };

    return visibleColumns.map((key) => rawCols[key]).filter(Boolean);
  }, [visibleColumns, passportEvents, pathname, search, readonly, guard]);

  // 五态与骨架屏
  if (dataState === "loading") {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-title-row">
          <h1 className="device-ops-title">数字护照</h1>
        </header>
        <section className="device-ops-panel">
          <Skeleton active paragraph={{ rows: 3 }} />
        </section>
        <section className="device-ops-panel device-ops-panel--table">
          <Skeleton active paragraph={{ rows: 8 }} />
        </section>
      </div>
    );
  }

  if (dataState === "error") {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-title-row">
          <h1 className="device-ops-title">数字护照</h1>
        </header>
        <section className="device-ops-panel">
          <Alert
            title="护照记录加载失败"
            description="获取设备数字护照数据异常，请检查网络或联系华南运营中心管理员。"
            type="error"
            showIcon
            action={
              <Button type="primary" onClick={() => window.location.reload()}>
                重试
              </Button>
            }
          />
        </section>
      </div>
    );
  }

  const isFiltered =
    Boolean(filters.sn) ||
    filters.model !== "all" ||
    filters.lifecycles.length > 0 ||
    filters.qc.length > 0 ||
    filters.firmware.length > 0 ||
    Boolean(filters.factoryDateRange) ||
    filters.publishStatus !== "all" ||
    filters.rmaStatus !== "all";

  return (
    <div className="device-ops-stack">
      <header className="device-ops-title-row">
        <h1 className="device-ops-title">数字护照</h1>
      </header>

      {/* 筛选面板 */}
      <section className="device-ops-panel" aria-label="护照查询筛选区">
        <Form
          form={filterForm}
          initialValues={filters}
          layout="vertical"
          onFinish={handleFilterFinish}
          onValuesChange={(_changed) => {
            if (_changed.model !== undefined) setSelectedModel(_changed.model);
          }}
        >
          {/* 常驻 4 字段 */}
          <div className="passport-filters">
            <Form.Item label="SN" name="sn">
              <Input
                allowClear
                placeholder="输入 SN 前缀模糊查找"
                ref={snInputRef}
                onPressEnter={() => filterForm.submit()}
              />
            </Form.Item>
            <Form.Item label="机型" name="model">
              <Select
                options={[
                  { label: "全部机型", value: "all" },
                  ...models.map((m) => ({ label: m, value: m }))
                ]}
                placeholder="选择机型"
              />
            </Form.Item>
            <Form.Item label="生命周期状态" name="lifecycles">
              <Select
                mode="multiple"
                maxTagCount="responsive"
                allowClear
                options={Object.entries(lifecycleMeta).map(([k, v]) => ({
                  label: v.label,
                  value: k
                }))}
                placeholder="全选或指定状态"
              />
            </Form.Item>
            <Form.Item label="质检结论" name="qc">
              <Select
                mode="multiple"
                maxTagCount="responsive"
                allowClear
                options={Object.entries(qcMeta).map(([k, v]) => ({
                  label: v.label,
                  value: k
                }))}
                placeholder="全选或指定结论"
              />
            </Form.Item>
          </div>

          {/* 收纳 4 字段 */}
          {expandMoreFilters && (
            <div className="passport-filters--more">
              <Form.Item label="固件版本" name="firmware">
                <Select
                  mode="multiple"
                  maxTagCount="responsive"
                  allowClear
                  options={firmwareOptions}
                  placeholder="选择固件版本"
                />
              </Form.Item>
              <Form.Item label="出厂日期" name="factoryDateRange">
                <DatePicker.RangePicker
                  className="device-ops-full"
                  onChange={handleFactoryDateChange}
                />
              </Form.Item>
              <Form.Item label="是否对外公开" name="publishStatus">
                <Select
                  options={[
                    { label: "全部公开状态", value: "all" },
                    { label: "已公开", value: "published" },
                    { label: "未公开", value: "unpublished" }
                  ]}
                />
              </Form.Item>
              <Form.Item label="是否有 RMA 记录" name="rmaStatus">
                <Select
                  options={[
                    { label: "全部", value: "all" },
                    { label: "有 RMA 记录", value: "has_rma" },
                    { label: "无 RMA 记录", value: "no_rma" }
                  ]}
                />
              </Form.Item>
            </div>
          )}

          {/* 操作行：更多筛选开关在左，查询/重置在右 */}
          <div className="passport-filters__actions">
            <Button
              type="link"
              onClick={() => setExpandMoreFilters(!expandMoreFilters)}
              style={{ padding: 0 }}
            >
              {expandMoreFilters ? "收起更多筛选" : "展开更多筛选"}
              {expandMoreFilters ? <UpOutlined /> : <DownOutlined />}
            </Button>
            <Space>
              <Button onClick={handleReset} type="text">重置</Button>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
            </Space>
          </div>
        </Form>
      </section>

      {/* 表格区 */}
      <section className="device-ops-panel device-ops-panel--table" aria-label="数字护照列表">
        <div className="device-ops-toolbar">
          <div className="device-ops-toolbar__count">
            共 <span className="device-ops-num">{filteredDevices.length}</span> 条档案记录
            {isFiltered && <span className="device-ops-muted">（已按条件筛选）</span>}
          </div>
          <Space>
            <Button
              aria-label="刷新"
              icon={<ReloadOutlined />}
              type="text"
              onClick={() => {
                message.success("已刷新到最新数据");
              }}
            />
            {guard(
              "导出护照列表",
              <Button
                icon={<DownloadOutlined />}
                onClick={() => setExportModalOpen(true)}
              >
                导出护照列表
              </Button>
            )}
            <Button icon={<SettingOutlined />} onClick={() => setColSettingOpen(true)}>
              列设置
            </Button>
          </Space>
        </div>

        <Table
          rowKey="sn"
          columns={columns}
          dataSource={sortedDevices}
          pagination={{
            defaultPageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: ["20", "50", "100"],
            showTotal: (total) => `共 ${total} 条`
          }}
          rowSelection={{
            columnWidth: 48,
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as string[])
          }}
          scroll={{ x: 1200 }}
          locale={{
            emptyText: isFiltered ? (
              <Empty
                description="没有符合条件的护照记录，请调整筛选条件后重新查询"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button onClick={handleReset}>
                  重置筛选
                </Button>
              </Empty>
            ) : (
              <Empty description="暂无设备护照记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )
          }}
        />
      </section>

      {/* 批量操作悬浮条 */}
      {selectedRowKeys.length > 0 && (
        <aside className="device-ops-selection-bar" aria-label="批量操作条">
          <Space>
            <span>
              已选择 <strong className="device-ops-num">{selectedRowKeys.length}</strong> 台设备
            </span>
            <Button size="small" type="link" onClick={() => setSelectedRowKeys([])}>
              取消选择
            </Button>
          </Space>
          <Space>
            {/* 批量设置对外公开：必须全部是 shipped */}
            {allSelectedShipped ? (
              guard(
                "批量设置对外公开",
                <Button type="primary" onClick={() => setBatchPublishModalOpen(true)}>
                  批量设置对外公开
                </Button>
              )
            ) : (
              <Tooltip title="选中项中包含不支持此操作的记录（仅出货设备支持公开）">
                <span className="device-ops-guard">
                  <Button disabled type="primary">
                    批量设置对外公开
                  </Button>
                </span>
              </Tooltip>
            )}

            {/* 批量关闭公开：必须全部是已公开 */}
            {allSelectedPublished ? (
              guard(
                "批量关闭对外公开",
                <Button onClick={() => setBatchCloseModalOpen(true)}>
                  批量关闭公开
                </Button>
              )
            ) : (
              <Tooltip title="选中项中包含不支持此操作的记录（仅已公开设备支持关闭）">
                <span className="device-ops-guard">
                  <Button disabled>
                    批量关闭公开
                  </Button>
                </span>
              </Tooltip>
            )}

            {/* 批量导出 */}
            {guard(
              "批量导出",
              <Button icon={<DownloadOutlined />} onClick={handleBatchExport}>
                批量导出
              </Button>
            )}
          </Space>
        </aside>
      )}

      {/* 列设置 Drawer / Modal */}
      <Modal
        title="自定义显示列"
        open={colSettingOpen}
        onCancel={() => setColSettingOpen(false)}
        footer={[
          <Button key="reset" onClick={() => setVisibleColumns([...ALL_COLUMN_KEYS])}>
            恢复默认
          </Button>,
          <Button
            key="ok"
            type="primary"
            onClick={() => {
              try {
                localStorage.setItem(PASSPORT_STORAGE_KEYS.columns, JSON.stringify(visibleColumns));
              } catch {
                // 忽略
              }
              setColSettingOpen(false);
              message.success("已保存列设置偏好");
            }}
          >
            完成
          </Button>
        ]}
        width={420}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "8px 0" }}>
          {ALL_COLUMN_KEYS.map((key) => (
            <Checkbox
              key={key}
              checked={visibleColumns.includes(key)}
              disabled={key === "sn" || key === "actions"}
              onChange={(e) => {
                if (e.target.checked) {
                  setVisibleColumns([...visibleColumns, key]);
                } else {
                  setVisibleColumns(visibleColumns.filter((k) => k !== key));
                }
              }}
            >
              {columnTitles[key]}
            </Checkbox>
          ))}
        </div>
      </Modal>

      {/* 设置公开范围 Drawer */}
      <Drawer
        title={`设置公开范围 · ${editingDevice?.sn ?? ""}`}
        open={drawerOpen}
        destroyOnHidden
        onClose={() => setDrawerOpen(false)}
        size={480}
      >
        {drawerOpen && editingDevice && (
          <ListPublishDrawerContent
            device={editingDevice}
            onSave={handleSavePublish}
            onCancel={() => setDrawerOpen(false)}
          />
        )}
      </Drawer>

      {/* 生成二维码 Modal */}
      <Modal
        title={`数字护照二维码 · ${qrSn ?? ""}`}
        open={qrModalOpen}
        onCancel={() => setQrModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setQrModalOpen(false)}>
            关闭
          </Button>,
          <Button key="copy" onClick={handleCopyQrUrl}>
            {copied ? "已复制" : "复制链接"}
          </Button>,
          <Button key="download" type="primary" onClick={handleDownloadQrPng}>
            下载 PNG
          </Button>
        ]}
        width={480}
      >
        <div className="passport-qr-modal">
          {qrDevice && !qrDevice.passportPublish.publicEnabled && (
            <Alert
              title="该设备护照尚未对外公开，扫码将显示 404，请先设置公开范围"
              type="warning"
              showIcon
              style={{ width: "100%", textAlign: "left" }}
            />
          )}

          <div className="passport-qr-box">
            <QRCode value={passportQrUrl} size={180} type="svg" bordered={false} />
          </div>

          <div className="passport-qr-url">
            {passportQrUrl}
          </div>
          <span className="device-ops-muted" style={{ fontSize: 12 }}>
            扫描上方二维码可直达本设备的消费者公开数字档案
          </span>
        </div>
      </Modal>

      {/* 导出范围选择 Modal */}
      <Modal
        title="导出护照列表"
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        onOk={handleExportList}
        okText="确认导出"
        width={440}
      >
        <div style={{ padding: "12px 0" }}>
          <p style={{ color: "var(--do-text-secondary)", marginBottom: 16 }}>
            请选择导出的数据范围，导出的文件将自动对证书指纹等敏感信息进行脱敏。
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="radio"
                name="exportScope"
                checked={exportScope === "page"}
                onChange={() => setExportScope("page")}
              />
              <span>当前页记录（至多 20 条）</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="radio"
                name="exportScope"
                checked={exportScope === "all"}
                onChange={() => setExportScope("all")}
              />
              <span>全部筛选结果（共 {sortedDevices.length} 条）</span>
            </label>
          </div>
        </div>
      </Modal>

      {/* 批量设置公开范围 Modal (C档对话框) */}
      <Modal
        title="批量设置对外公开"
        open={batchPublishModalOpen}
        onCancel={() => setBatchPublishModalOpen(false)}
        onOk={handleBatchPublish}
        okText="确认应用"
        width={480}
      >
        <div style={{ padding: "12px 0" }}>
          <Alert
            title={`即将对已选 ${selectedRowKeys.length} 台出货设备统一开启对外公开`}
            description="已选中的设备将开启对外公开，并应用默认对外展示配置。外部扫码者将可查验对应设备的数字护照。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <p style={{ color: "var(--do-text-secondary)", fontSize: 13 }}>
            注意：只有已出货的设备才能设置对外公开；单独调整某一台的公开字段，请在该行操作中设置。
          </p>
        </div>
      </Modal>

      {/* 批量关闭公开 Modal (C档对话框) */}
      <Modal
        title="批量关闭对外公开"
        open={batchCloseModalOpen}
        onCancel={() => setBatchCloseModalOpen(false)}
        onOk={handleBatchClose}
        okText="确认关闭"
        okButtonProps={{ danger: true }}
        width={480}
      >
        <div style={{ padding: "12px 0" }}>
          <Alert
            title={`确认关闭已选 ${selectedRowKeys.length} 台设备的对外公开？`}
            description="关闭后，这批设备的对外护照将立即不可见，消费者扫码将返回 404 页面。"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <p style={{ color: "var(--do-text-secondary)", fontSize: 13 }}>
            该操作影响对外可见性，已核对对象均为当前已公开设备。后续可随时重新开启。
          </p>
        </div>
      </Modal>
    </div>
  );
}

function ListPublishDrawerContent({
  device,
  onSave,
  onCancel
}: {
  device: Device;
  onSave: (values: PassportPublishConfig) => void;
  onCancel: () => void;
}) {
  const { modal, message } = App.useApp();
  const [form] = Form.useForm<PassportPublishConfig>();
  const [dirty, setDirty] = useState(false);
  const [watchedTimeline, setWatchedTimeline] = useState(device.passportPublish.showTimeline);
  const [watchedPublic, setWatchedPublic] = useState(device.passportPublish.publicEnabled);
  const [watchedRma, setWatchedRma] = useState(device.passportPublish.showRma);

  const handleClose = () => {
    if (dirty) {
      modal.confirm({
        title: "确认关闭？",
        content: "当前设置尚未保存，关闭将丢失修改。",
        okText: "放弃修改并关闭",
        cancelText: "继续编辑",
        onOk: onCancel
      });
    } else {
      onCancel();
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const publishError = publishRmaTimelineError(values);
      if (publishError) {
        message.error(publishError);
        return;
      }
      onSave(values);
    } catch {
      // 校验未通过
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Space>
          <Button onClick={handleClose}>取消</Button>
          <Button type="primary" onClick={handleSave}>
            保存设置
          </Button>
        </Space>
      </div>

      <div className="passport-drawer-note">
        以下设置决定消费者扫码后可见字段，请核对公开范围后保存。内部工号与敏感信息将自动脱敏。
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={device.passportPublish}
        onValuesChange={(_changed, allValues) => {
          setDirty(true);
          setWatchedTimeline(allValues.showTimeline);
          setWatchedPublic(allValues.publicEnabled);
          setWatchedRma(allValues.showRma);
          // 联动：时间轴关闭时强制关闭 RMA 历史
          if (!allValues.showTimeline && allValues.showRma) {
            form.setFieldValue("showRma", false);
            setWatchedRma(false);
          }
        }}
      >
        <Form.Item name="publicEnabled" valuePropName="checked">
          <Checkbox>
            <strong>开启对外公开</strong>（关闭时扫码将显示 404）
          </Checkbox>
        </Form.Item>

        <div style={{ borderTop: "1px dashed var(--do-border)", margin: "16px 0", paddingTop: 16 }}>
          <Typography.Text strong style={{ display: "block", marginBottom: 12 }}>
            消费者可见字段配置
          </Typography.Text>

          <Form.Item name="showModel" valuePropName="checked">
            <Checkbox>公开设备机型</Checkbox>
          </Form.Item>

          <Form.Item name="showFirmware" valuePropName="checked">
            <Checkbox>公开当前固件版本</Checkbox>
          </Form.Item>

          <Form.Item name="showQc" valuePropName="checked">
            <Checkbox>公开出厂质检结论</Checkbox>
          </Form.Item>

          <Form.Item name="showShippedDate" valuePropName="checked">
            <Checkbox>公开出厂日期与保修状态</Checkbox>
          </Form.Item>

          <Form.Item name="showCert" valuePropName="checked">
            <Checkbox>公开证书信息（公钥指纹安全脱敏）</Checkbox>
          </Form.Item>

          <Form.Item name="showTimeline" valuePropName="checked">
            <Checkbox>公开生命周期时间轴（生产至出货节点）</Checkbox>
          </Form.Item>

          <Form.Item name="showRma" valuePropName="checked">
            <Checkbox disabled={!watchedTimeline}>
              公开 RMA 售后历史
              {!watchedTimeline && (
                <span className="device-ops-muted" style={{ marginLeft: 8 }}>
                  （需同时开启生命周期时间轴）
                </span>
              )}
            </Checkbox>
          </Form.Item>
        </div>

        <Form.Item
          label="对外公开备注（消费者扫码可见）"
          name="remark"
          rules={[{ max: 200, message: "公开备注不超过 200 字" }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="可输入对消费者的说明，如官方正品保障承诺等（不超过 200 字）"
          />
        </Form.Item>
      </Form>

      {/* 抽屉底部预览 */}
      <div className="passport-drawer-preview">
        <div className="passport-drawer-preview__title">对外展示预览（消费者视角）</div>
        <div className="passport-drawer-preview__item">
          <span>对外公开状态</span>
          <span>{watchedPublic ? "已开启" : "已关闭（404）"}</span>
        </div>
        <div className="passport-drawer-preview__item">
          <span>生命周期时间轴</span>
          <span>{watchedTimeline ? "显示（工号脱敏）" : "隐藏"}</span>
        </div>
        <div className="passport-drawer-preview__item">
          <span>售后 RMA 记录</span>
          <span>{watchedRma ? "公开" : "未公开"}</span>
        </div>
      </div>
    </>
  );
}
