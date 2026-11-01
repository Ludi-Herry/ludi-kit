import { useState } from "react";
import { Button, Drawer, Dropdown, Form, Input, Modal, Pagination, Select, Table, Upload } from "antd";
import type { TianshuBadgeProps } from "../native-ui";
import {
  DownloadOutlined,
  MoreOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  TianshuBadge as Badge,
  TianshuDataSection as DataSection,
  TianshuFilterPanel as FilterPanel,
  TianshuFormSection as FormSection,
  TianshuPageHeader as PageHeader,
  TianshuPageLayout as PageLayout,
} from "../native-ui";
import {
  mapTableColumns,
  toAcceptList,
  toUploadFileList
} from "./ant-data";

import "./firmware-styles.css";

type FirmwareLifecycle = "testing" | "canary" | "full" | "deprecated" | "draft" | "stopped";
type SignatureStatus = "success" | "signing" | "unsigned" | "failed";
type FirmwareAction = "rollback" | "stop";

type FirmwareRow = Record<string, unknown> & {
  id: string;
  model: string;
  lifecycle: FirmwareLifecycle;
  signature: SignatureStatus;
  gray: string;
  boundDevices: string;
  publisher: string;
  publishedAt: string;
};

const firmwareRows: FirmwareRow[] = [
  {
    id: "v2.4.0-TJ-M1-beta",
    model: "TJ-M1",
    lifecycle: "testing",
    signature: "success",
    gray: "—",
    boundDevices: "0",
    publisher: "林嘉禾",
    publishedAt: "—"
  },
  {
    id: "v2.3.2-TJ-M1",
    model: "TJ-M1",
    lifecycle: "canary",
    signature: "success",
    gray: "25%",
    boundDevices: "1,280",
    publisher: "周启明",
    publishedAt: "2026-07-16 18:20"
  },
  {
    id: "v2.3.1-TJ-M1",
    model: "TJ-M1",
    lifecycle: "full",
    signature: "success",
    gray: "—",
    boundDevices: "4,896",
    publisher: "周启明",
    publishedAt: "2026-07-11 10:08"
  },
  {
    id: "v1.9.8-TJ-S1",
    model: "TJ-S1",
    lifecycle: "deprecated",
    signature: "success",
    gray: "—",
    boundDevices: "742",
    publisher: "顾言",
    publishedAt: "2026-07-04 15:36"
  },
  {
    id: "v3.0.0-TJ-Pro-rc1",
    model: "TJ-Pro",
    lifecycle: "draft",
    signature: "unsigned",
    gray: "—",
    boundDevices: "0",
    publisher: "沈秋",
    publishedAt: "—"
  },
  {
    id: "v2.2.7-TJ-M1",
    model: "TJ-M1",
    lifecycle: "stopped",
    signature: "failed",
    gray: "—",
    boundDevices: "315",
    publisher: "周启明",
    publishedAt: "2026-06-18 09:24"
  }
];

const lifecycleCopy: Record<FirmwareLifecycle, { label: string; variant: NonNullable<TianshuBadgeProps["variant"]> }> = {
  testing: { label: "测试中", variant: "processing" },
  canary: { label: "灰度中", variant: "warning" },
  full: { label: "已全量", variant: "success" },
  deprecated: { label: "已回滚", variant: "danger" },
  draft: { label: "草稿", variant: "secondary" },
  stopped: { label: "已停用", variant: "secondary" }
};

const signatureCopy: Record<SignatureStatus, { label: string; variant: NonNullable<TianshuBadgeProps["variant"]> }> = {
  success: { label: "签名成功", variant: "success" },
  signing: { label: "签名中", variant: "processing" },
  unsigned: { label: "未签名", variant: "secondary" },
  failed: { label: "签名失败", variant: "danger" }
};

const modelOptions = [
  { label: "全部机型", value: "all" },
  { label: "TJ-M1", value: "tj-m1" },
  { label: "TJ-S1", value: "tj-s1" },
  { label: "TJ-Pro", value: "tj-pro" }
];

const statusOptions = [
  { label: "全部状态", value: "all" },
  { label: "测试中", value: "testing" },
  { label: "灰度中", value: "canary" },
  { label: "已全量", value: "full" },
  { label: "已回滚", value: "deprecated" },
  { label: "草稿", value: "draft" },
  { label: "已停用", value: "stopped" }
];

const signatureOptions = [
  { label: "全部状态", value: "all" },
  { label: "签名成功", value: "success" },
  { label: "签名中", value: "signing" },
  { label: "未签名", value: "unsigned" },
  { label: "签名失败", value: "failed" }
];

function LifecycleBadge({ status }: { status: FirmwareLifecycle }) {
  const copy = lifecycleCopy[status];
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

function SignatureBadge({ status }: { status: SignatureStatus }) {
  const copy = signatureCopy[status];
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

function GrayRatio({ value }: { value: string }) {
  if (value === "—") return <span className="firmware-muted">—</span>;
  return (
    <span className="firmware-gray-ratio" aria-label={`灰度比例 ${value}`}>
      <span>{value}</span>
      <span className="firmware-gray-ratio__bar" aria-hidden="true">
        <span className="firmware-gray-ratio__value" />
      </span>
    </span>
  );
}

export function TianshuFirmwarePage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [version, setVersion] = useState("v2.4.1-TJ-M1");
  const [model, setModel] = useState("tj-m1");
  const [signature, setSignature] = useState("sign-center-a");
  const [releaseNote, setReleaseNote] = useState("修复烧录任务重试后的设备绑定状态同步。");
  const [decision, setDecision] = useState<{ action: FirmwareAction; row: FirmwareRow } | null>(null);
  const [lastNotice, setLastNotice] = useState("数据更新时间 2026-07-17 10:32");
  const [uploads, setUploads] = useState<Array<{ id: string; name: string; status: "success" }>>([]);
  const openDecision = (action: FirmwareAction, row: FirmwareRow) => {
    setDecision({ action, row });
  };

  const cancelDrawer = () => {
    setVersion("v2.4.1-TJ-M1");
    setModel("tj-m1");
    setSignature("sign-center-a");
    setReleaseNote("修复烧录任务重试后的设备绑定状态同步。");
    setUploads([]);
    setDrawerOpen(false);
    setLastNotice("已取消新建固件版本，列表保持不变。");
  };

  const saveDraft = () => {
    setDrawerOpen(false);
    setLastNotice(`已保存 ${version.trim() || "新固件版本"} 草稿，等待上传固件包与签名。`);
  };

  const cancelDecision = () => {
    setLastNotice(decision ? `已取消 ${decision.row.id} 的${decision.action === "rollback" ? "回滚" : "停用"}确认。` : lastNotice);
    setDecision(null);
  };

  const confirmDecision = () => {
    setLastNotice(decision ? `${decision.row.id} 已提交${decision.action === "rollback" ? "回滚" : "停用"}审批。` : lastNotice);
    setDecision(null);
  };

  return (
    <>
      <PageLayout density="compact" className="generated-page firmware-page">
        <PageHeader
          title="固件版本管理"
          description="维护固件、签名和灰度发布状态，为烧录任务提供受控版本。"
          actions={(
            <div className="firmware-page__header-actions">
              <Button icon={<ReloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => setLastNotice("固件版本列表已刷新。")}>
                刷新
              </Button>
              <Button icon={<DownloadOutlined aria-hidden="true" aria-label={undefined} />}>
                导出版本列表
              </Button>
              <Button onClick={() => setDrawerOpen(true)}>新建固件版本</Button>
            </div>
          )}
        />

        <FilterPanel
          className="firmware-filter"
          fields={[
            { name: "version", label: "固件版本号", placeholder: "输入版本号" },
            { name: "model", label: "机型", type: "select", options: modelOptions, placeholder: "全部机型" },
            { name: "lifecycle", label: "版本状态", type: "select", options: statusOptions, placeholder: "全部状态" },
            { name: "signature", label: "签名状态", type: "select", options: signatureOptions, placeholder: "全部状态" }
          ]}
          onSearch={() => setLastNotice("已按当前筛选条件查询固件版本。")}
          onReset={() => setLastNotice("已重置固件筛选条件。")}
        />

        <DataSection title="固件版本" description={`共 24 个版本 · ${lastNotice}`}>
          <div className="tianshu-ui-data-grid tianshu-ui-data-grid--compact"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={firmwareRows} columns={mapTableColumns([
              { key: "id", title: "固件版本号" },
              { key: "model", title: "机型" },
              {
                key: "lifecycle",
                title: "版本状态",
                render: (record) => <LifecycleBadge status={record.lifecycle as FirmwareLifecycle} />
              },
              {
                key: "signature",
                title: "签名状态",
                render: (record) => <SignatureBadge status={record.signature as SignatureStatus} />
              },
              { key: "gray", title: "灰度比例", render: (record) => <GrayRatio value={String(record.gray)} /> },
              { key: "boundDevices", title: "绑定设备数" },
              { key: "publisher", title: "发布人" },
              { key: "publishedAt", title: "发布时间" },
              {
                key: "actions",
                title: "操作",
                render: (record) => (
                  <div className="firmware-row-actions">
                    {record.lifecycle === "canary" || record.lifecycle === "full" ? (
                      <Button danger size="small" type="text" onClick={() => openDecision("rollback", record)}>
                        回滚
                      </Button>
                    ) : (
                      <Button size="small" type="text">查看</Button>
                    )}
                    {record.lifecycle === "deprecated" ? (
                      <Button danger size="small" type="text" onClick={() => openDecision("stop", record)}>
                        停用
                      </Button>
                    ) : record.lifecycle !== "stopped" ? (
                      <Dropdown
                        menu={{
                          items: record.lifecycle === "testing"
                            ? [
                                { key: "edit", label: "编辑" },
                                { key: "canary", label: "发起灰度" }
                              ]
                            : record.lifecycle === "canary"
                              ? [
                                  { key: "view", label: "查看" },
                                  { key: "adjust", label: "调整灰度" }
                                ]
                              : record.lifecycle === "full"
                                ? [
                                    { key: "view", label: "查看" },
                                    { key: "stop", label: "停用", danger: true }
                                  ]
                                : [
                                      { key: "edit", label: "编辑" },
                                      { key: "upload", label: "上传固件" },
                                      { key: "sign", label: "发起签名" }
                                    ],
                          onClick: ({ key }) => {
                            if (key === "rollback") openDecision("rollback", record);
                            if (key === "stop") openDecision("stop", record);
                          }
                        }}
                        trigger={["click"]}
                      >
                        <Button aria-label="更多固件操作" icon={<MoreOutlined aria-hidden="true" aria-label={undefined} />} size="small" type="text" />
                      </Dropdown>
                    ) : null}
                  </div>
                )
              }
            ])} pagination={false} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={6} total={24} /></div></div>
        </DataSection>
      </PageLayout>

      <Drawer
        open={drawerOpen}
        title="新建固件版本"
        size="min(600px, 100vw)"
        onClose={cancelDrawer}
        footer={(
          <div className="firmware-drawer-actions">
            <Button onClick={cancelDrawer}>取消</Button>
            <Button form="firmware-create-form" htmlType="submit" type="primary">保存草稿</Button>
          </div>
        )}
      >
        <Form className="firmware-drawer-body" id="firmware-create-form" layout="vertical" onFinish={saveDraft}>
          <FormSection title="版本信息" description="固件版本号、机型和签名模板必须与烧录任务绑定口径一致。">
            <div className="firmware-drawer-grid">
              <Form.Item label="固件版本号"><Input value={version} onChange={(event) => setVersion(event.currentTarget.value)} /></Form.Item>
              <Form.Item label="适用机型"><Select value={model} options={modelOptions.slice(1)} onChange={setModel} /></Form.Item>
              <Form.Item label="签名模板"><Select value={signature} options={[
                  { label: "生产签名中心 A", value: "sign-center-a" },
                  { label: "生产签名中心 B", value: "sign-center-b" }
                ]} onChange={setSignature} /></Form.Item>
            </div>
          </FormSection>
          <FormSection title="发布说明" description="草稿阶段只保存版本与说明，固件包上传和签名在后续步骤完成。">
            <Form.Item label="变更说明"><Input.TextArea rows={4} value={releaseNote} onChange={(event) => setReleaseNote(event.currentTarget.value)} /></Form.Item>
          </FormSection>
          <FormSection title="固件包" description="选择固件包只进入本地受控状态，不触发网络上传。">
            <Form.Item label="固件包文件"><Upload accept={toAcceptList([".bin", ".zip"])} fileList={toUploadFileList(uploads)} maxCount={1} beforeUpload={() => false} onChange={({ fileList }) => setUploads(fileList.slice(-1).map((file) => ({
                id: file.uid,
                name: file.name,
                status: "success"
              })))} onRemove={() => { setUploads([]); return true; }}><Button>选择固件包</Button></Upload></Form.Item>
          </FormSection>
        </Form>
      </Drawer>

      <Modal open={Boolean(decision)} title={decision?.action === "stop" ? "确认停用固件版本？" : "确认回滚固件版本？"} okText={decision?.action === "stop" ? "确认停用" : "确认回滚"} cancelText="取消" okButtonProps={{ danger: true }} onCancel={cancelDecision} onOk={confirmDecision}>
        {decision
          ? `${decision.row.id} 当前绑定设备数 ${decision.row.boundDevices}。确认后会进入审批流，灰度或全量设备将按规则回退到上一稳定版本。`
          : ""}
      </Modal>
    </>
  );
}
