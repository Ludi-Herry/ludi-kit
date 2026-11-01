import { useState, type ReactNode } from "react";
import { Alert, App, Button, Descriptions, Dropdown, Form, Input, Modal, Result, Select, Skeleton, Space, Tabs, Typography } from "antd";
import { ArrowLeftOutlined, DownloadOutlined, EllipsisOutlined } from "@ant-design/icons";
import { foldedFieldGroups, rmaReasonOptions, rmaSourceOptions, type Device, type RmaReasonCode, type RmaSource } from "../data";
import { deviceOpsStore, useDeviceOpsState } from "../store";
import { CertTag, LifecycleTag, OnlineTag, QcTag, appPath, safeReturnTo, useDataState, usePermission, useQueryParams, useRouter } from "../ui";
import { backLabelFor, canStartRma, deviceDetailScope } from "../core/deviceDetail";

const DASH = "—";
const columnLayout = { xxl: 4, xl: 4, lg: 2, md: 2, sm: 1, xs: 1 };

type CoreItem = { label: string; value: ReactNode };
type CoreGroup = { key: string; label: string; helper?: string; items: CoreItem[] };

function buildCoreGroups(
  device: Device,
  unresolvedCount: number,
  latestAlert: ReactNode,
  // 2026-09-29 批 2：工单数改从 FeedbackTicket 派生；绑定用户数 / 工单数 / 最近工单号改链接。
  openTicketCount: number,
  links: { bindingHref?: string; ticketsHref?: string }
): CoreGroup[] {
  const shipped = Boolean(device.shippedAt);
  const dash = (value: string | number | null | undefined) => (value === null || value === undefined || value === "" ? DASH : value);
  return [
    {
      key: "identity",
      label: "身份与生产",
      items: [
        { label: "SN", value: device.sn },
        { label: "机型", value: device.model },
        { label: "批次", value: device.batch },
        { label: "收货日期", value: device.receivedAt },
        { label: "质检结论", value: <QcTag value={device.qc} /> },
        { label: "出厂日期", value: dash(device.shippedAt) },
        { label: "证书状态", value: <CertTag value={device.cert} /> }
      ]
    },
    {
      key: "runtime",
      label: "运行",
      helper: shipped ? undefined : "设备出货后开始采集运行数据",
      items: [
        { label: "在网状态", value: <OnlineTag value={shipped ? device.online : null} /> },
        { label: "最后心跳", value: dash(device.lastHeartbeat) },
        { label: "离线时长", value: dash(device.offlineDuration) },
        { label: "当前固件版本", value: dash(device.firmware) },
        { label: "推送中目标版本", value: dash(device.targetFirmware) },
        { label: "激活时间", value: dash(device.activatedAt) },
        { label: "地区（省）", value: dash(device.province) },
        {
          label: "存储用量",
          value: device.storageUsed === null ? DASH : `${device.storageUsed} / ${device.storageTotal} TB`
        }
      ]
    },
    {
      key: "service",
      label: "用户与服务",
      items: [
        {
          label: "绑定用户数",
          value: device.boundUsers > 0 && links.bindingHref ? <a href={links.bindingHref}>{device.boundUsers}</a> : device.boundUsers
        },
        { label: "设备管理员", value: dash(device.adminPhone) },
        { label: "保修到期", value: dash(device.warrantyUntil) },
        {
          label: "未关闭工单数",
          value: openTicketCount > 0 && links.ticketsHref ? <a href={links.ticketsHref}>{openTicketCount}</a> : openTicketCount
        }
      ]
    },
    {
      key: "exception",
      label: "异常",
      items: [
        { label: "未处理告警数", value: unresolvedCount },
        { label: "最近一次告警", value: latestAlert },
        { label: "RMA 次数", value: device.rmaCount }
      ]
    }
  ];
}

export function DeviceDetailPage({ sn }: { sn: string }) {
  const { message } = App.useApp();
  const { navigate, pathname, search } = useRouter();
  const params = useQueryParams();
  const dataState = useDataState();
  // 从告警处置点进来时，“返回”回到原来的告警处置（保留分栏、选中项与筛选）。
  const returnTo = safeReturnTo(params.get("from"));
  const { readonly, guard } = usePermission();
  const { devices, alerts, rmas, feedbackTickets } = useDeviceOpsState();
  const [rmaOpen, setRmaOpen] = useState(false);
  const [form] = Form.useForm<{ reason: RmaReasonCode; source: RmaSource; note?: string }>();

  const device = devices.find((item) => item.sn === sn);
  const { related, activeAlerts, latestAlert: latest, topLevel, unresolvedCount, openTicketCount } = deviceDetailScope({ sn, alerts, feedbackTickets });

  const backLink = returnTo ? (
    <a className="device-ops-back" href={returnTo}>
      <ArrowLeftOutlined aria-hidden="true" aria-label={undefined} />
      {backLabelFor(returnTo)}
    </a>
  ) : (
    <a className="device-ops-back" href={appPath("/devices")}>
      <ArrowLeftOutlined aria-hidden="true" aria-label={undefined} />
      全部设备
    </a>
  );

  if (dataState === "loading") {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-detail-head">
          <div className="device-ops-detail-head__main">
            {backLink}
            <Skeleton active paragraph={{ rows: 1 }} title={{ width: 220 }} />
          </div>
        </header>
        <section aria-label="核心信息" className="device-ops-panel">
          <Skeleton active paragraph={{ rows: 9 }} />
        </section>
      </div>
    );
  }

  if (dataState === "error") {
    const retry = () => {
      const next = new URLSearchParams(search);
      next.delete("dataState");
      navigate(`${appPath(pathname)}${next.size ? `?${next}` : ""}`);
    };
    return (
      <div className="device-ops-stack">
        <header className="device-ops-detail-head">
          <div className="device-ops-detail-head__main">{backLink}</div>
        </header>
        <Alert
          action={<Button onClick={retry} size="small">重试</Button>}
          description="网络异常或服务暂时不可用，请稍后重试。"
          showIcon
          title="设备详情加载失败"
          type="error"
        />
      </div>
    );
  }

  if (!device) {
    return (
      <Result
        extra={<Button href={appPath("/devices")} type="primary">返回全部设备</Button>}
        status="404"
        subTitle={`没有 SN 为 ${sn} 的设备，请核对后重新查找。`}
        title="未找到该设备"
      />
    );
  }

  // 2026-09-29 批 2：跳转目标页携带 from，返回回到本设备详情（safeReturnTo 白名单放行）。
  const linkFrom = encodeURIComponent(`${appPath(`/devices/${device.sn}`)}${search}`);
  const coreGroups = buildCoreGroups(
    device,
    unresolvedCount,
    latest ? (
      <>
        {latest.title}
        <span className="device-ops-nowrap">（{latest.lastSeenAt}）</span>
      </>
    ) : (
      DASH
    ),
    openTicketCount,
    {
      bindingHref: `${appPath("/users/binding")}?sn=${encodeURIComponent(device.sn)}&from=${linkFrom}`,
      ticketsHref: `${appPath("/exceptions/feedback")}?sn=${encodeURIComponent(device.sn)}&from=${linkFrom}`
    }
  );
  const foldedGroups = foldedFieldGroups(device, rmas, feedbackTickets);
  const alertsHref = appPath(`/alerts?sn=${device.sn}`);

  const confirmRma = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    // 2026-09-29 批 1：创建 RMA 单（原因枚举 PRD 6 项、含退货来源），不再联动未关闭工单数。
    const result = deviceOpsStore.createRma({
      sn: device.sn,
      reasonCode: values.reason,
      source: values.source,
      description: values.note
    });
    if (!result.ok) {
      message.error(`发起 RMA 失败：${result.reason}`);
      return;
    }
    setRmaOpen(false);
    const rmaHref = `${appPath("/exceptions/rma")}?sn=${encodeURIComponent(device.sn)}`;
    message.success({
      duration: 8,
      content: (
        <span>
          RMA 单 {result.message} 创建成功，设备状态更新为退货 RMA
          {/* 轻提示挂在 Layout 之外的 portal，href 会全量刷新丢失内存 store；统一走 SPA navigate（2026-09-29 集成修正） */}
          <Button onClick={() => navigate(rmaHref)} size="small" type="link">查看 RMA 单</Button>
        </span>
      )
    });
  };

  const renderDescriptions = (items: CoreItem[]) => (
    <Descriptions
      className="device-ops-fields"
      colon={false}
      column={columnLayout}
      items={items.map((item) => ({
        key: item.label,
        label: item.label,
        // 2026-09-29 批 2：工单号改链接，到客户反馈直接打开对应工单。
        children:
          item.label === "最近工单编号" && item.value !== DASH ? (
            <a href={`${appPath("/exceptions/feedback")}?ticket=${encodeURIComponent(String(item.value))}&from=${linkFrom}`}>{item.value}</a>
          ) : (
            item.value
          )
      }))}
      layout="vertical"
      size="small"
    />
  );

  const canRma = canStartRma(device);

  return (
    <div className="device-ops-stack">
      <header className="device-ops-detail-head">
        <div className="device-ops-detail-head__main">
          {backLink}
          <Typography.Title className="device-ops-title device-ops-sn-title" copyable={{ text: device.sn, tooltips: ["复制 SN", "已复制"] }} level={1}>
            {device.sn}
          </Typography.Title>
          <p className="device-ops-detail-head__sub">
            {device.model} · 批次 {device.batch}
          </p>
          <Space size={8}>
            <LifecycleTag value={device.lifecycle} />
            {device.lifecycle === "shipped" && device.online ? <OnlineTag value={device.online} /> : null}
          </Space>
        </div>
        <Space>
          {/* 有未处理告警时“去告警处置”是主操作；发起 RMA 低频且后果重，始终是次按钮。 */}
          {activeAlerts.length > 0 && <Button href={alertsHref} type="primary">去告警处置</Button>}
          {canRma &&
            guard("发起退货", <Button disabled={readonly} onClick={() => setRmaOpen(true)}>发起 RMA</Button>)}
          <Button
            icon={<DownloadOutlined aria-hidden="true" aria-label={undefined} />}
            onClick={() => message.info("护照 PDF 生成中，完成后将通过站内信通知")}
          >
            导出护照 PDF
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: "passport", label: "查看数字护照" },
                { key: "alerts", label: "查看该设备告警" }
              ],
              onClick: ({ key }) => {
                // 2026-09-29 批 1：数字护照上线解锁，携带 from 以便护照详情按白名单回扣来源。
                if (key === "passport") navigate(appPath(`/lifecycle/passport/${device.sn}?from=${encodeURIComponent(`${appPath(`/devices/${device.sn}`)}${search}`)}`));
                if (key === "alerts") navigate(alertsHref);
              }
            }}
          >
            <Button aria-label="更多操作" icon={<EllipsisOutlined aria-hidden="true" aria-label={undefined} />} />
          </Dropdown>
        </Space>
      </header>

      {activeAlerts.length > 0 && (
        <Alert
          action={<a href={alertsHref}>去告警处置</a>}
          description={
            <ul className="device-ops-banner-list">
              {activeAlerts.map((alert) => (
                <li key={alert.id}>{alert.level} · {alert.title}</li>
              ))}
            </ul>
          }
          showIcon
          title={`该设备有 ${activeAlerts.length} 条未处理告警，最高级别 ${topLevel}`}
          type="warning"
        />
      )}

      <section aria-label="核心信息" className="device-ops-panel device-ops-core">
        {coreGroups.map((group) => (
          <div className="device-ops-group" key={group.key}>
            <h2 className="device-ops-group__title">{group.label}</h2>
            {group.helper && <p className="device-ops-group__helper">{group.helper}</p>}
            {renderDescriptions(group.items)}
          </div>
        ))}
      </section>

      <section aria-label="更多信息" className="device-ops-panel">
        <h2 className="device-ops-group__title">更多信息</h2>
        <Tabs
          items={foldedGroups.map((group) => ({
            key: group.key,
            label: group.label,
            children: renderDescriptions(group.items.map((item) => ({ label: item.label, value: item.value })))
          }))}
        />
      </section>

      <Modal
        cancelText="取消"
        destroyOnHidden
        okText="确认发起 RMA"
        onCancel={() => setRmaOpen(false)}
        onOk={confirmRma}
        open={rmaOpen}
        title={`发起 RMA · ${device.sn}`}
      >
        <p className="device-ops-modal-note">发起后设备状态将变为「退货 RMA」，时间轴会新增一条受理记录。</p>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item label="退货原因" name="reason" rules={[{ required: true, message: "请选择退货原因" }]}>
            <Select options={rmaReasonOptions} placeholder="请选择" />
          </Form.Item>
          <Form.Item label="退货来源" name="source" rules={[{ required: true, message: "请选择退货来源" }]}>
            <Select options={rmaSourceOptions} placeholder="请选择" />
          </Form.Item>
          <Form.Item label="问题描述" name="note">
            <Input.TextArea maxLength={200} placeholder="补充设备现象或用户诉求；原因选「其他」时必填" rows={3} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
