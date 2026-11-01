import { useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  QRCode,
  Result,
  Select,
  Skeleton,
  Space,
  Tag,
  Timeline,
  Tooltip,
  Typography
} from "antd";
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CopyOutlined,
  DownOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  QrcodeOutlined,
  SettingOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  lifecycleMeta,
  qcMeta,
  certMeta,
  passportEventKindLabel,
  rmaReasonOptions,
  rmaSourceOptions,
  type Device,
  type PassportEvent,
  type PassportPublishConfig,
  type RmaReasonCode,
  type RmaSource
} from "../data";
import { passportEventsBySn, useDeviceOpsState, deviceOpsStore } from "../store";
import {
  appPath,
  returnUrlFrom,
  safeReturnTo,
  useDataState,
  usePermission,
  useQueryParams,
  useRouter,
  CertTag,
  LifecycleTag,
  PassportPublishTag,
  QcTag
} from "../ui";
import {
  ALL_EVENT_GROUPS,
  EVENT_GROUP_OPTIONS,
  certFingerprintOf,
  filterPassportEvents,
  passportBackLabel,
  passportNodeColor,
  publicTimelineEvents
} from "../core/passportDetail";
import { publishRmaTimelineError } from "../core/passportList";
import "./passport.css";

export function PassportDetailPage({ sn }: { sn: string }) {
  const { modal, message } = App.useApp();
  const { pathname, search, navigate } = useRouter();
  const queryParams = useQueryParams();
  const dataState = useDataState();
  const { readonly, guard } = usePermission();

  const { devices, passportEvents } = useDeviceOpsState();

  // 当前设备
  const device = devices.find((d) => d.sn === sn);

  // 来源返回
  const returnTo = safeReturnTo(queryParams.get("from"));
  const backLabel = passportBackLabel(returnTo);
  let backHref = appPath("/lifecycle/passport");
  if (returnTo) {
    backHref = returnTo;
  }

  // 事件类型复选框过滤
  const [selectedEventGroups, setSelectedEventGroups] = useState<string[]>([...ALL_EVENT_GROUPS]);

  // 时间轴节点折叠展开详情
  const [expandedEventIds, setExpandedEventIds] = useState<Record<string, boolean>>({});

  const toggleEventDetail = (id: string) => {
    setExpandedEventIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 生成二维码 Modal
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // 设置公开范围 Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 发起 RMA Modal (C档对话框)
  const [rmaModalOpen, setRmaModalOpen] = useState(false);

  // 节点数据获取与过滤
  const allEvents = useMemo(() => {
    return passportEventsBySn(passportEvents, sn);
  }, [passportEvents, sn]);

  const filteredEvents = useMemo(
    () => filterPassportEvents(allEvents, selectedEventGroups),
    [allEvents, selectedEventGroups]
  );

  // 公开护照 URL
  const passportQrUrl = `${window.location.origin}${appPath(`/lifecycle/passport/${sn}`)}`;

  const handleCopyQrUrl = () => {
    navigator.clipboard?.writeText(passportQrUrl);
    setCopied(true);
    message.success("公开护照链接已复制到剪贴板");
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const handleDownloadQrPng = () => {
    message.info(`护照二维码下载任务已提交：passport-qr-${sn}-256.png`);
  };

  const handleExportPdf = () => {
    message.success(`设备 ${sn} 的护照 PDF 导出任务已提交，完成后将通过站内信通知`);
  };

  // 打开公开设置 Drawer
  const openPublishDrawer = () => {
    setDrawerOpen(true);
  };

  const handleSavePublish = (values: PassportPublishConfig) => {
    const res = deviceOpsStore.savePassportPublish(sn, values);
    if (res.ok) {
      message.success(`已保存设备 ${sn} 的公开范围设置`);
      setDrawerOpen(false);
    } else {
      message.error(res.reason);
    }
  };

  // 五态
  if (dataState === "loading") {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-detail-head">
          <Skeleton.Input active style={{ width: 280 }} />
        </header>
        <section className="device-ops-panel">
          <Skeleton active paragraph={{ rows: 4 }} />
        </section>
        <section className="device-ops-panel">
          <Skeleton active paragraph={{ rows: 8 }} />
        </section>
      </div>
    );
  }

  if (dataState === "error") {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-title-row">
          <a className="device-ops-back" href={backHref}>
            <ArrowLeftOutlined /> {backLabel}
          </a>
        </header>
        <section className="device-ops-panel">
          <Alert
            title="护照详情加载失败"
            description={`设备 ${sn} 的档案信息获取异常，请检查网络或重试。`}
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

  // 找不到设备
  if (!device) {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-title-row">
          <a className="device-ops-back" href={backHref}>
            <ArrowLeftOutlined /> {backLabel}
          </a>
        </header>
        <section className="device-ops-panel">
          <Result
            status="404"
            title="未找到该 SN 的护照记录"
            subTitle={`设备「${sn}」暂未生成数字档案或 SN 输入有误。护照记录由生产环节自动写入，若有疑问请联系华南运营中心质检部门。`}
            extra={[
              <Button key="passport" type="primary" href={appPath("/lifecycle/passport")}>
                返回数字护照查询
              </Button>,
              <Button key="devices" href={appPath("/devices")}>
                查看全部设备
              </Button>
            ]}
          />
        </section>
      </div>
    );
  }

  const isShipped = device.lifecycle === "shipped";
  const isPublished = device.passportPublish.publicEnabled;
  const currentReturnUrl = encodeURIComponent(returnUrlFrom(pathname, search));

  // 头部操作按钮配置
  let qrBtn: ReactNode = (
    <Button icon={<QrcodeOutlined />} onClick={() => setQrModalOpen(true)}>
      生成二维码
    </Button>
  );
  if (!isShipped) {
    qrBtn = (
      <Tooltip title="仅出货设备可生成二维码">
        <span className="device-ops-guard">
          <Button disabled icon={<QrcodeOutlined />}>
            生成二维码
          </Button>
        </span>
      </Tooltip>
    );
  } else {
    qrBtn = guard("生成二维码", qrBtn);
  }

  let publishBtn: ReactNode = (
    <Button icon={<SettingOutlined />} onClick={openPublishDrawer}>
      设置公开范围
    </Button>
  );
  if (!isShipped) {
    publishBtn = (
      <Tooltip title="仅出货设备可设置公开范围">
        <span className="device-ops-guard">
          <Button disabled icon={<SettingOutlined />}>
            设置公开范围
          </Button>
        </span>
      </Tooltip>
    );
  } else {
    publishBtn = guard("设置对外公开", publishBtn);
  }

  const exportPdfBtn = guard(
    "导出护照 PDF",
    <Button icon={<DownloadOutlined />} onClick={handleExportPdf}>
      导出护照 PDF
    </Button>
  );

  let rmaBtn: ReactNode = (
    <Button onClick={() => setRmaModalOpen(true)}>
      发起 RMA
    </Button>
  );
  if (!isShipped) {
    rmaBtn = (
      <Tooltip title="仅已出货设备可发起退货 RMA">
        <span className="device-ops-guard">
          <Button disabled>发起 RMA</Button>
        </span>
      </Tooltip>
    );
  } else {
    rmaBtn = guard("发起 RMA", rmaBtn);
  }

  // 证书公钥指纹安全脱敏
  const certFingerprint = certFingerprintOf(device);

  return (
    <div className="device-ops-stack">
      {/* 顶部 PageHeader */}
      <header className="device-ops-detail-head">
        <div className="device-ops-detail-head__main">
          <a className="device-ops-back" href={backHref}>
            <ArrowLeftOutlined /> {backLabel}
          </a>
          <Space align="center" size="middle" wrap>
            <Typography.Title className="device-ops-title device-ops-sn-title" copyable={{ text: device.sn, tooltips: ["复制 SN", "已复制"] }} level={1}>
              {device.sn}
            </Typography.Title>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {device.model}
            </Typography.Text>
            <LifecycleTag value={device.lifecycle} />
            <CertTag value={device.cert} />
          </Space>
          <div className="passport-detail-header-sub">
            <span>出厂日期：{device.shippedAt ? <span className="device-ops-num">{device.shippedAt}</span> : "—"}</span>
            <span>当前固件版本：{device.firmware ?? "—"}</span>
          </div>
        </div>

        {/* 头部操作区：按规则不放 primary，全为 default 次按钮或文字链 */}
        <Space wrap>
          {qrBtn}
          {publishBtn}
          {exportPdfBtn}
          {rmaBtn}
          <a
            href={appPath(`/devices/${sn}?from=${currentReturnUrl}`)}
            style={{ marginLeft: 8 }}
          >
            查看设备详情
          </a>
        </Space>
      </header>

      {/* 基本信息卡（9 字段） */}
      <section className="device-ops-panel" aria-label="护照基本信息">
        <Descriptions
          bordered
          column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}
          size="middle"
          title="档案基本信息"
        >
          <Descriptions.Item label="SN">
            <Typography.Text copyable={{ text: device.sn, tooltips: ["复制 SN", "已复制"] }}>
              {device.sn}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="机型">{device.model}</Descriptions.Item>
          <Descriptions.Item label="固件版本">{device.firmware ?? <span className="device-ops-muted">—</span>}</Descriptions.Item>
          <Descriptions.Item label="证书指纹">
            <span style={{ fontFamily: "monospace", fontSize: 12 }}>{certFingerprint}</span>
          </Descriptions.Item>
          <Descriptions.Item label="质检结论">
            <QcTag value={device.qc} />
          </Descriptions.Item>
          <Descriptions.Item label="出厂日期">
            {device.shippedAt ? <span className="device-ops-num">{device.shippedAt}</span> : <span className="device-ops-muted">—</span>}
          </Descriptions.Item>
          <Descriptions.Item label="是否对外公开">
            <PassportPublishTag published={device.passportPublish.publicEnabled} />
          </Descriptions.Item>
          <Descriptions.Item label="RMA 次数">
            {device.rmaCount === 0 ? (
              <span className="device-ops-num device-ops-muted">0</span>
            ) : (
              <span className="device-ops-num passport-rma-count">{device.rmaCount}</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="公开二维码链接">
            {device.passportPublish.publicEnabled ? (
              <Typography.Text copyable={{ text: passportQrUrl, tooltips: ["复制链接", "已复制"] }}>
                <span className="device-ops-muted" style={{ fontSize: 12 }}>{passportQrUrl}</span>
              </Typography.Text>
            ) : (
              <span className="device-ops-muted">—</span>
            )}
          </Descriptions.Item>
        </Descriptions>
      </section>

      {/* 生命周期时间轴（主体） */}
      <section className="passport-timeline-panel" aria-label="生命周期时间轴">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            生命周期时间轴
          </Typography.Title>
          <span className="device-ops-muted" style={{ fontSize: 13 }}>
            共 <span className="device-ops-num">{filteredEvents.length}</span> 个事件（按时间从新到旧排列）
          </span>
        </div>

        {/* 事件类型过滤复选框 */}
        <div className="passport-timeline-filter">
          <span className="passport-timeline-filter__label">事件类型过滤：</span>
          <Checkbox.Group
            options={EVENT_GROUP_OPTIONS}
            value={selectedEventGroups}
            onChange={(values) => setSelectedEventGroups(values as string[])}
          />
          {selectedEventGroups.length < ALL_EVENT_GROUPS.length && (
            <Button
              size="small"
              type="link"
              onClick={() => setSelectedEventGroups([...ALL_EVENT_GROUPS])}
            >
              重置过滤
            </Button>
          )}
        </div>

        {/* Timeline 组件 */}
        {filteredEvents.length === 0 ? (
          <Empty description="当前筛选条件下暂无时间轴事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Timeline
            items={filteredEvents.map((ev) => {
              const isExpanded = Boolean(expandedEventIds[ev.id]);
              const hasDetail = ev.detail && Object.keys(ev.detail).length > 0;

              return {
                key: ev.id,
                color: passportNodeColor(ev.kind),
                content: (
                  <div className="passport-timeline-node">
                    <div className="passport-timeline-node__head">
                      <Tag color={lifecycleMeta[ev.colorState]?.color ?? "default"}>
                        {ev.label}
                      </Tag>
                      <span className="passport-timeline-node__time">{ev.at}</span>
                      <span className="passport-timeline-node__operator">{ev.operator}</span>
                      {ev.station && <span className="passport-timeline-node__station">（{ev.station}）</span>}
                    </div>

                    <div className="passport-timeline-node__summary">{ev.summary}</div>

                    {/* 附加数据折叠区 */}
                    {hasDetail && (
                      <div>
                        <span
                          className="passport-timeline-node__toggle"
                          onClick={() => toggleEventDetail(ev.id)}
                        >
                          {isExpanded ? "收起详情" : "展开详情"}
                          {isExpanded ? <UpOutlined /> : <DownOutlined />}
                        </span>
                        {isExpanded && (
                          <div className="passport-timeline-node__detail">
                            {Object.entries(ev.detail!).map(([k, v]) => (
                              <div key={k} className="passport-timeline-node__detail-row">
                                <span className="passport-timeline-node__detail-label">{k}：</span>
                                <span className="passport-timeline-node__detail-val">
                                  {k === "RMA 单号" ? (
                                    <a href={appPath(`/exceptions/rma?rma=${encodeURIComponent(v)}`)}>
                                      {v}
                                    </a>
                                  ) : (
                                    v
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              };
            })}
          />
        )}
      </section>

      {/* 对外公开预览区（仅已公开时显示） */}
      {isPublished && (
        <section className="passport-preview-card" aria-label="对外公开预览">
          <div className="passport-preview-head">
            <h3>对外公开预览（消费者扫码视角）</h3>
            <span>消费者扫码将查看以下脱敏后的数字档案</span>
          </div>

          <div className="passport-preview-content">
            <div className="passport-preview-group">
              <div className="passport-preview-group__title">基本信息</div>
              <div className="passport-preview-grid">
                <div className="passport-preview-item">
                  <span className="passport-preview-item__label">设备 SN：</span>
                  <span className="passport-preview-item__value">{device.sn}</span>
                </div>
                {device.passportPublish.showModel && (
                  <div className="passport-preview-item">
                    <span className="passport-preview-item__label">设备机型：</span>
                    <span className="passport-preview-item__value">{device.model}</span>
                  </div>
                )}
                {device.passportPublish.showFirmware && (
                  <div className="passport-preview-item">
                    <span className="passport-preview-item__label">出厂固件：</span>
                    <span className="passport-preview-item__value">{device.firmware ?? "—"}</span>
                  </div>
                )}
                {device.passportPublish.showQc && (
                  <div className="passport-preview-item">
                    <span className="passport-preview-item__label">出厂质检：</span>
                    <span className="passport-preview-item__value">{qcMeta[device.qc]?.label}</span>
                  </div>
                )}
                {device.passportPublish.showShippedDate && (
                  <div className="passport-preview-item">
                    <span className="passport-preview-item__label">出厂日期：</span>
                    <span className="passport-preview-item__value">{device.shippedAt ?? "—"}</span>
                  </div>
                )}
                {device.passportPublish.showCert && (
                  <div className="passport-preview-item">
                    <span className="passport-preview-item__label">证书指纹：</span>
                    <span className="passport-preview-item__value">{certFingerprint}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 对外时间轴 */}
            {device.passportPublish.showTimeline && (
              <div className="passport-preview-group">
                <div className="passport-preview-group__title">生产流转简述</div>
                <div className="passport-preview-timeline">
                  {publicTimelineEvents(allEvents)
                    .map((ev) => (
                      <div key={ev.id} className="passport-preview-event">
                        <span className="passport-preview-event__time">{ev.at.slice(0, 10)}</span>
                        <span>{ev.label} · 官方验证通过</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* RMA 历史 */}
            {device.passportPublish.showRma && (
              <div className="passport-preview-group">
                <div className="passport-preview-group__title">售后履历</div>
                <div style={{ fontSize: 13, color: "var(--do-text)" }}>
                  {device.rmaCount === 0 ? "官方正品，无售后退换返修记录" : `经官方售后检测处理，累计返修 ${device.rmaCount} 次`}
                </div>
              </div>
            )}

            {/* 备注 */}
            {device.passportPublish.remark && (
              <div className="passport-preview-group">
                <div className="passport-preview-group__title">官方寄语</div>
                <div style={{ fontSize: 13, color: "var(--do-text)" }}>{device.passportPublish.remark}</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 生成二维码 Modal */}
      <Modal
        title={`数字护照二维码 · ${sn}`}
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
          {!isPublished && (
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

          <div className="passport-qr-url">{passportQrUrl}</div>
          <span className="device-ops-muted" style={{ fontSize: 12 }}>
            扫描上方二维码可直达本设备的消费者公开数字档案
          </span>
        </div>
      </Modal>

      {/* 设置公开范围 Drawer */}
      <Drawer
        title={`设置公开范围 · ${sn}`}
        open={drawerOpen}
        destroyOnHidden
        onClose={() => setDrawerOpen(false)}
        size={480}
      >
        {drawerOpen && (
          <DetailPublishDrawerContent
            device={device}
            onSave={(values) => {
              const res = deviceOpsStore.savePassportPublish(sn, values);
              if (res.ok) {
                message.success(`已保存设备 ${sn} 的公开范围设置`);
                setDrawerOpen(false);
              } else {
                message.error(res.reason);
              }
            }}
            onCancel={() => setDrawerOpen(false)}
          />
        )}
      </Drawer>

      {/* 发起 RMA Modal (C 档二次确认对话框) */}
      <Modal
        title={`发起退货 RMA · ${sn}`}
        open={rmaModalOpen}
        destroyOnHidden
        onCancel={() => setRmaModalOpen(false)}
        footer={null}
        width={520}
      >
        {rmaModalOpen && (
          <DetailRmaModalContent
            onOk={(values) => {
              // 2026-09-29 集成修正：统一走 createRma（创建 RMA 单并联动护照时间轴），原 startRma 已随批 1 移除。
              const res = deviceOpsStore.createRma({ sn, reasonCode: values.reasonCode, source: values.source, description: values.description });
              if (res.ok) {
                message.success(`RMA 单 ${res.message} 创建成功，设备状态更新为退货 RMA`);
                setRmaModalOpen(false);
              } else {
                message.error(res.reason);
              }
            }}
            onCancel={() => setRmaModalOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}

function DetailPublishDrawerContent({
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
          if (!allValues.showTimeline && allValues.showRma) {
            form.setFieldValue("showRma", false);
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
            <Checkbox>公开设备机型（{device.model}）</Checkbox>
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
    </>
  );
}

function DetailRmaModalContent({
  onOk,
  onCancel
}: {
  onOk: (values: { reasonCode: RmaReasonCode; source: RmaSource; description?: string }) => void;
  onCancel: () => void;
}) {
  const [form] = Form.useForm<{ reasonCode: RmaReasonCode; source: RmaSource; description?: string }>();

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onOk(values);
    } catch {
      // 校验未通过
    }
  };

  return (
    <div style={{ padding: "8px 0" }}>
      <Alert
        title="发起后设备状态将变为「退货 RMA」，时间轴会新增一条受理记录"
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical" initialValues={{ source: "ecommerce" }}>
        {/* 2026-09-29 集成：自画原生 select 换回 generation-plan 登记的 antd Select。 */}
        <Form.Item
          label="退货原因"
          name="reasonCode"
          rules={[{ required: true, message: "请选择退货原因" }]}
        >
          <Select options={rmaReasonOptions} placeholder="请选择退货原因" />
        </Form.Item>

        <Form.Item
          label="退货来源"
          name="source"
          rules={[{ required: true, message: "请选择退货来源" }]}
        >
          <Select options={rmaSourceOptions} placeholder="请选择退货来源" />
        </Form.Item>

        <Form.Item label="问题描述（选填）" name="description">
          <Input.TextArea rows={3} placeholder="输入客户退货反馈与初判情况（500 字以内）" />
        </Form.Item>
      </Form>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, gap: 8 }}>
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" onClick={handleSubmit}>
          确认发起 RMA
        </Button>
      </div>
    </div>
  );
}
