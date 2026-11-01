import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Alert, Button, Checkbox, DatePicker, Descriptions, Drawer, Form, Input, Modal, Pagination, Radio, Select, Steps, Switch, Table, Tabs, TreeSelect, Upload } from "antd";
import type { TianshuBadgeProps } from "../native-ui";
import {
  TianshuBadge as Badge,
  TianshuBulkActionBar as BulkActionBar,
  TianshuDataSection as DataSection,
  TianshuFilterPanel as FilterPanel,
  TianshuForbiddenState as ForbiddenState,
  TianshuFormSection as FormSection,
  TianshuPageHeader as PageHeader,
  TianshuPageLayout as PageLayout
} from "../native-ui";
import {
  mapTableColumns,
  rowSelectionConfig,
  stepIndex,
  toAcceptList,
  toDescriptionItems,
  toTabsItems,
  toUploadFileList
} from "./ant-data";
import "./deferred-styles.css";

type BadgeTone = NonNullable<TianshuBadgeProps["variant"]>;

function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return <Badge variant={tone}>{label}</Badge>;
}

function DeferredNotice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" | "danger" }) {
  return (
    <div className={`deferred-notice deferred-notice--${tone}`} role={tone === "danger" ? "alert" : "note"}>
      {children}
    </div>
  );
}

function DrawerActions({ children }: { children: ReactNode }) {
  return <div className="deferred-drawer-actions">{children}</div>;
}

const rmaArrivalCopy = {
  pending_arrival: { label: "待到件", tone: "processing" },
  arrived_pending_inspection: { label: "已到件-待检", tone: "warning" },
  under_inspection: { label: "检测中", tone: "processing" },
  inspection_done: { label: "已检测", tone: "success" },
  closed: { label: "已关闭", tone: "secondary" }
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

const rmaConclusionCopy = {
  pending: { label: "待检测", tone: "secondary" },
  repairable: { label: "可返修", tone: "warning" },
  restockable: { label: "可二次入库", tone: "success" },
  scrap: { label: "报废", tone: "danger" }
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

const rmaDecisionCopy = {
  pending: { label: "待裁决", tone: "secondary" },
  repair: { label: "返修", tone: "warning" },
  restock: { label: "二次入库", tone: "cyan" },
  scrap: { label: "报废", tone: "secondary" }
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

const deviceStatusCopy = {
  rma: { label: "退货 RMA", tone: "warning" },
  test_failed: { label: "测试不合格", tone: "danger" },
  in_stock: { label: "合格入库", tone: "success" },
  scrapped: { label: "报废", tone: "secondary" }
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

type RmaRow = Record<string, unknown> & {
  id: string;
  sn: string;
  model: string;
  reason: string;
  source: string;
  arrival: keyof typeof rmaArrivalCopy;
  conclusion: keyof typeof rmaConclusionCopy;
  decision: keyof typeof rmaDecisionCopy;
  deviceStatus: keyof typeof deviceStatusCopy;
  createdAt: string;
};

const initialRmaRows: RmaRow[] = [
  {
    id: "RMA-20260715-000184",
    sn: "TA-G1-26071184",
    model: "TJ-G1-2024",
    reason: "功能异常",
    source: "电商平台",
    arrival: "arrived_pending_inspection",
    conclusion: "pending",
    decision: "pending",
    deviceStatus: "rma",
    createdAt: "2026-07-15 09:42:18"
  },
  {
    id: "RMA-20260714-000179",
    sn: "TA-G1-26070967",
    model: "TJ-G1-2024",
    reason: "外观损坏",
    source: "线下门店",
    arrival: "inspection_done",
    conclusion: "repairable",
    decision: "pending",
    deviceStatus: "rma",
    createdAt: "2026-07-14 16:08:44"
  },
  {
    id: "RMA-20260713-000172",
    sn: "TA-PRO-26070411",
    model: "TJ-PRO-2025",
    reason: "物流损坏",
    source: "直销客户",
    arrival: "inspection_done",
    conclusion: "scrap",
    decision: "pending",
    deviceStatus: "rma",
    createdAt: "2026-07-13 11:26:03"
  },
  {
    id: "RMA-20260710-000151",
    sn: "TA-G1-26068802",
    model: "TJ-G1-2024",
    reason: "客户拒收",
    source: "直销客户",
    arrival: "closed",
    conclusion: "restockable",
    decision: "restock",
    deviceStatus: "in_stock",
    createdAt: "2026-07-10 14:31:52"
  }
];

const rmaReasonLabel: Record<string, string> = {
  functional_defect: "功能异常",
  appearance_damage: "外观损坏",
  missing_accessory: "配件缺失",
  logistics_damage: "物流损坏",
  customer_rejection: "客户拒收",
  other: "其他"
};

const rmaSourceLabel: Record<string, string> = {
  ecommerce: "电商平台",
  offline_store: "线下门店",
  direct_customer: "直销客户",
  internal_transfer: "内部调拨"
};

type RmaDecision = { action: "repair" | "restock" | "scrap"; row: RmaRow } | { action: "close"; row: null };

export type TianshuRmaPageProps = {
  canView?: boolean;
};

export function TianshuRmaPage({ canView = true }: TianshuRmaPageProps) {
  const [rows, setRows] = useState(initialRmaRows);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [createdRange, setCreatedRange] = useState<readonly [string, string] | null>(null);
  const [detailRow, setDetailRow] = useState<RmaRow | null>(null);
  const [inspectionRow, setInspectionRow] = useState<RmaRow | null>(null);
  const [decision, setDecision] = useState<RmaDecision | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSn, setNewSn] = useState("");
  const [newReason, setNewReason] = useState("functional_defect");
  const [newSource, setNewSource] = useState("ecommerce");
  const [expectedArrival, setExpectedArrival] = useState<string | null>(null);
  const [createAttempted, setCreateAttempted] = useState(false);
  const [attachmentCount, setAttachmentCount] = useState(0);
  const [inspectionConclusion, setInspectionConclusion] = useState("repairable");
  const [inspectionChecks, setInspectionChecks] = useState<string[]>(["power"]);
  const [inspectionAttachmentCount, setInspectionAttachmentCount] = useState(0);
  const rmaFocusRef = useRef<HTMLElement>(null);

  const selectedRmaRows = rows.filter((row) => selectedRowKeys.includes(row.id));
  const invalidCloseCount = selectedRmaRows.filter(
    (row) => !(["test_failed", "in_stock", "scrapped"] as RmaRow["deviceStatus"][]).includes(row.deviceStatus)
  ).length;

  const confirmDecision = () => {
    if (!decision) return;
    if (decision.action === "close") {
      const selected = new Set(selectedRowKeys);
      setRows((current) => current.map((row) => selected.has(row.id) ? { ...row, arrival: "closed" } : row));
      setSelectedRowKeys([]);
      setDecision(null);
      return;
    }

    const nextState = {
      repair: { arrival: "closed", decision: "repair", deviceStatus: "test_failed" },
      restock: { arrival: "closed", decision: "restock", deviceStatus: "in_stock" },
      scrap: { arrival: "closed", decision: "scrap", deviceStatus: "scrapped" }
    }[decision.action] as Pick<RmaRow, "arrival" | "decision" | "deviceStatus">;
    setRows((current) => current.map((row) => row.id === decision.row.id ? { ...row, ...nextState } : row));
    setDetailRow(null);
    setDecision(null);
  };

  const createRma = () => {
    setCreateAttempted(true);
    const normalizedSn = newSn.trim().toUpperCase();
    if (!normalizedSn) return;
    const nextId = `RMA-20260715-${String(rows.length + 185).padStart(6, "0")}`;
    setRows((current) => [
      {
        id: nextId,
        sn: normalizedSn,
        model: "待识别",
        reason: rmaReasonLabel[newReason] ?? "其他",
        source: rmaSourceLabel[newSource] ?? "内部调拨",
        arrival: "pending_arrival",
        conclusion: "pending",
        decision: "pending",
        deviceStatus: "rma",
        createdAt: "2026-07-15 12:00:00"
      },
      ...current
    ]);
    setCreateOpen(false);
    setCreateAttempted(false);
    setNewSn("");
    setAttachmentCount(0);
  };

  const submitInspection = () => {
    if (!inspectionRow) return;
    setRows((current) => current.map((row) => row.id === inspectionRow.id
      ? { ...row, arrival: "inspection_done", conclusion: inspectionConclusion as RmaRow["conclusion"] }
      : row));
    setInspectionRow(null);
  };

  const decisionTitle = decision?.action === "close"
    ? "批量关闭 RMA 单？"
    : decision?.action === "scrap"
      ? "确认报废设备？"
      : decision?.action === "restock"
        ? "确认二次入库？"
        : "确认进入返修链路？";
  const decisionDescription = decision?.action === "close"
    ? `将关闭选中的 ${selectedRowKeys.length} 条 RMA 单，关闭后不可重新开启。`
    : decision?.row
      ? `RMA 单 ${decision.row.id} 将执行${rmaDecisionCopy[decision.action].label}裁决并变更设备状态。裁决完成后不可撤销。`
      : "";

  return (
    <>
      {canView ? (
    <PageLayout density="compact" className="deferred-page">
      <PageHeader
        breadcrumb="生产履约域 / 退货 RMA"
        title="退货 RMA"
        description="灰度入口 · 仅 qa_rma_pilot 与授权角色可见。处理到件、检测与返修/二次入库/报废裁决。"
        actions={(
          <div className="deferred-actions">
            <Button >导出当前筛选</Button>
            <Button onClick={() => setCreateOpen(true)}>新建 RMA 单</Button>
          </div>
        )}
      />
      <DeferredNotice tone="warning">
        灰度阶段仅开放给内测角色；设备身份区只展示 SN 与数字护照关联，不展示任何广告域 ID。
      </DeferredNotice>
      <FilterPanel
        advancedContent={(
          <div className="tianshu-ui-filter__field">
            <label>发起时间</label>
            <DatePicker.RangePicker aria-label="RMA 发起时间范围" placeholder={["开始日期", "结束日期"]} onChange={(_dates, dateStrings) => setCreatedRange(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} />
          </div>
        )}
        fields={[
          { name: "rma", label: "RMA 单号", placeholder: "至少输入 4 位前缀" },
          { name: "sn", label: "SN", placeholder: "精确匹配设备序列号" },
          {
            name: "arrival",
            label: "到件状态",
            type: "select",
            options: Object.entries(rmaArrivalCopy).map(([value, copy]) => ({ value, label: copy.label }))
          },
          {
            name: "conclusion",
            label: "检测结论",
            type: "select",
            options: Object.entries(rmaConclusionCopy).map(([value, copy]) => ({ value, label: copy.label }))
          }
        ]}
      />
      <DataSection
        ref={rmaFocusRef}
        title="退货 RMA 单"
        description="默认按发起时间降序；状态裁决成功后自动关闭流程。"
        toolbar={<Button >刷新</Button>}
      >
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={rows} columns={mapTableColumns([
            { key: "id", title: "RMA 单号" },
            { key: "sn", title: "SN" },
            { key: "model", title: "机型" },
            { key: "reason", title: "退货原因" },
            {
              key: "arrival",
              title: "到件状态",
              render: (row) => <StatusBadge {...rmaArrivalCopy[row.arrival as keyof typeof rmaArrivalCopy]} />
            },
            {
              key: "conclusion",
              title: "检测结论",
              render: (row) => <StatusBadge {...rmaConclusionCopy[row.conclusion as keyof typeof rmaConclusionCopy]} />
            },
            {
              key: "decision",
              title: "处理方式",
              render: (row) => <StatusBadge {...rmaDecisionCopy[row.decision as keyof typeof rmaDecisionCopy]} />
            },
            {
              key: "deviceStatus",
              title: "设备状态",
              render: (row) => <StatusBadge {...deviceStatusCopy[row.deviceStatus as keyof typeof deviceStatusCopy]} />
            },
            { key: "createdAt", title: "发起时间", sortable: true },
            {
              key: "actions",
              title: "操作",
              render: (row) => (
                <div className="deferred-row-actions">
                  <Button size="small" type="text" onClick={() => setDetailRow(row)}>详情</Button>
                  {row.arrival === "arrived_pending_inspection" ? (
                    <Button size="small" type="text" onClick={() => setInspectionRow(row)}>录入检测</Button>
                  ) : null}
                  {row.deviceStatus === "rma" && row.conclusion === "repairable" ? (
                    <Button size="small" type="text" onClick={() => setDecision({ action: "repair", row })}>返修</Button>
                  ) : null}
                  {row.deviceStatus === "rma" && row.conclusion === "restockable" ? (
                    <Button size="small" type="text" onClick={() => setDecision({ action: "restock", row })}>二次入库</Button>
                  ) : null}
                  {row.deviceStatus === "rma" && row.conclusion === "scrap" ? (
                    <Button danger size="small" type="text" onClick={() => setDecision({ action: "scrap", row })}>报废</Button>
                  ) : null}
                </div>
              )
            }
          ])} pagination={false} rowSelection={rowSelectionConfig(selectedRowKeys, setSelectedRowKeys)} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={rows.length} /></div></div>
        <BulkActionBar selectedCount={selectedRowKeys.length} onClearSelection={() => setSelectedRowKeys([])}>
          <Button size="small" >导出选中</Button>
          {invalidCloseCount > 0 ? (
            <span className="deferred-readonly-label">所选项中有 {invalidCloseCount} 条不满足关闭条件</span>
          ) : null}
          <Button
            danger
            disabled={invalidCloseCount > 0}
            size="small"
            onClick={() => setDecision({ action: "close", row: null })}
          >
            批量关闭
          </Button>
        </BulkActionBar>
      </DataSection>

      <Drawer
        open={Boolean(detailRow)}
        title={detailRow ? `RMA 详情 · ${detailRow.id}` : "RMA 详情"} destroyOnHidden
        size="min(520px, 100vw)"
        onClose={() => setDetailRow(null)}
        footer={(
          <DrawerActions>
            <Button onClick={() => setDetailRow(null)}>关闭</Button>
            {detailRow?.conclusion === "repairable" && detailRow.deviceStatus === "rma" ? (
              <Button onClick={() => setDecision({ action: "repair", row: detailRow })}>返修裁决</Button>
            ) : null}
            {detailRow?.conclusion === "scrap" && detailRow.deviceStatus === "rma" ? (
              <Button danger onClick={() => setDecision({ action: "scrap", row: detailRow })}>报废裁决</Button>
            ) : null}
          </DrawerActions>
        )}
      >
        {detailRow ? (
          <div className="deferred-drawer-stack">
            <Descriptions column={2} items={toDescriptionItems([
                { label: "RMA 单号", value: detailRow.id },
                { label: "SN", value: detailRow.sn },
                { label: "机型", value: detailRow.model },
                { label: "退货原因", value: detailRow.reason },
                { label: "退货来源", value: detailRow.source },
                { label: "发起时间", value: detailRow.createdAt },
                { label: "到件状态", value: <StatusBadge {...rmaArrivalCopy[detailRow.arrival]} /> },
                { label: "设备状态", value: <StatusBadge {...deviceStatusCopy[detailRow.deviceStatus]} /> }
              ])} bordered={true} size="small" />
            <DeferredNotice>数字护照仅展示生产履约节点：收货、烧录、测试、入库、出货与 RMA。</DeferredNotice>
          </div>
        ) : null}
      </Drawer>

      <Drawer mask={{ closable: false }}
        open={createOpen}
        title="新建 RMA 单" destroyOnHidden
        size="min(600px, 100vw)"
        onClose={() => setCreateOpen(false)}
        footer={(
          <DrawerActions>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button form="rma-create-form" htmlType="submit" type="primary">提交</Button>
          </DrawerActions>
        )}
      >
        <Form className="deferred-drawer-stack" id="rma-create-form" layout="vertical" onFinish={createRma}>
          <Alert showIcon title="灰度阶段：本功能仅对内测角色开放，正式上线后移除此提示。" type="warning" />
          <FormSection title="基本信息">
            <Form.Item label="SN（设备序列号）"><Input placeholder="仅输入大写字母与数字" status={createAttempted && !newSn.trim() ? "error" : undefined} value={newSn} onChange={(event) => setNewSn(event.currentTarget.value)} /></Form.Item>
            {createAttempted && !newSn.trim() ? <p className="deferred-field-error">请输入 SN。</p> : null}
            <Form.Item label="退货原因码"><Select value={newReason} onChange={setNewReason} options={[
                { value: "functional_defect", label: "功能异常" },
                { value: "appearance_damage", label: "外观损坏" },
                { value: "missing_accessory", label: "配件缺失" },
                { value: "logistics_damage", label: "物流损坏" },
                { value: "customer_rejection", label: "客户拒收" },
                { value: "other", label: "其他" }
              ]} /></Form.Item>
            <Form.Item label="退货来源"><Select value={newSource} onChange={setNewSource} options={[
                { value: "ecommerce", label: "电商平台" },
                { value: "offline_store", label: "线下门店" },
                { value: "direct_customer", label: "直销客户" },
                { value: "internal_transfer", label: "内部调拨" }
              ]} /></Form.Item>
          </FormSection>
          <FormSection title="详情补充">
            <Form.Item label="预计到件日期"><DatePicker placeholder="选择日期" onChange={(_date, dateString) => setExpectedArrival(Array.isArray(dateString) ? dateString[0] ?? null : dateString || null)} /></Form.Item>
            <Form.Item label="问题描述"><Input.TextArea placeholder="退货原因选其他时必填，最多 500 字" /></Form.Item>
            <Form.Item extra={`已选择 ${attachmentCount} 个附件`} label="附件（照片/视频）"><Upload accept={toAcceptList([".jpg", ".jpeg", ".png", ".mp4", ".mov"])} beforeUpload={(_file, files) => { setAttachmentCount(files.length); return false; }}><Button>选择文件</Button></Upload></Form.Item>
          </FormSection>
        </Form>
      </Drawer>

      <Drawer mask={{ closable: false }}
        open={Boolean(inspectionRow)}
        title={inspectionRow ? `录入检测 · ${inspectionRow.id}` : "录入检测"} destroyOnHidden
        size="min(600px, 100vw)"
        onClose={() => setInspectionRow(null)}
        footer={(
          <DrawerActions>
            <Button onClick={() => setInspectionRow(null)}>取消</Button>
            <Button form="rma-inspection-form" htmlType="submit" type="primary">提交检测结论</Button>
          </DrawerActions>
        )}
      >
        <Form className="deferred-drawer-stack" id="rma-inspection-form" layout="vertical" onFinish={submitInspection}>
          {inspectionRow ? (
            <Descriptions column={2} items={toDescriptionItems([
              { label: "RMA 单号", value: inspectionRow.id },
              { label: "SN", value: inspectionRow.sn },
              { label: "机型", value: inspectionRow.model },
              { label: "检测人员", value: "QA-0241（当前账号）" }
            ])} bordered={true} size="small" />
          ) : null}
          <FormSection title="检测结论">
            <Form.Item label="检测结论"><Radio.Group value={inspectionConclusion} options={[
                { value: "repairable", label: "可返修" },
                { value: "restockable", label: "可二次入库" },
                { value: "scrap", label: "报废" }
              ]} onChange={(event) => setInspectionConclusion(String(event.target.value))} /></Form.Item>
            <Form.Item label="功能检测结果"><Checkbox.Group value={inspectionChecks} options={[
                { value: "power", label: "开机正常" },
                { value: "network", label: "联网正常" },
                { value: "audio", label: "音频正常" },
                { value: "camera", label: "摄像头正常" },
                { value: "touch", label: "触控正常" }
              ]} onChange={(values) => setInspectionChecks(values.map(String))} /></Form.Item>
            <Form.Item label="检测备注"><Input.TextArea placeholder="报废结论时填写损坏情况与判定依据" /></Form.Item>
            <p className="deferred-muted">已选择 {inspectionAttachmentCount} 个检测附件</p>
            <Form.Item label="检测附件"><Upload accept={toAcceptList([".jpg", ".jpeg", ".png", ".pdf"])} beforeUpload={(_file, files) => { setInspectionAttachmentCount(files.length); return false; }}><Button>选择文件</Button></Upload></Form.Item>
          </FormSection>
        </Form>
      </Drawer>

      <Modal open={Boolean(decision)} title={decisionTitle} okText={decision?.action === "close" ? "确认关闭" : decision?.action === "scrap" ? "确认报废" : "确认裁决"} cancelText="取消" okButtonProps={{ danger: decision?.action === "scrap" || decision?.action === "close" }} onCancel={() => setDecision(null)} onOk={confirmDecision}>{decisionDescription}</Modal>
      </PageLayout>
      ) : (
        <PageLayout className="deferred-page">
          <ForbiddenState
            title="无权访问退货 RMA"
            description="您没有退货 RMA 模块的查看权限，请联系平台管理员申请。"
            actions={<Button >申请权限</Button>}
          />
        </PageLayout>
      )}
    </>
  );
}

const campaignStatusCopy = {
  draft: { label: "草稿", tone: "secondary" },
  pending_review: { label: "待审", tone: "warning" },
  active: { label: "投放中", tone: "processing" },
  paused: { label: "已暂停", tone: "warning" },
  ended: { label: "已结束", tone: "success" },
  budget_exhausted: { label: "超预算停投", tone: "danger" }
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

type CampaignRow = Record<string, unknown> & {
  id: string;
  name: string;
  advertiser: string;
  order: string;
  placements: string;
  budget: number;
  spent: number;
  period: string;
  strategy: "waterfall" | "rtb" | "hybrid";
  status: keyof typeof campaignStatusCopy;
  updatedAt: string;
};

const initialCampaignRows: CampaignRow[] = [
  {
    id: "CP-20260715-0041",
    name: "暑期家庭陪伴计划",
    advertiser: "星河教育科技",
    order: "ORD-20260701-0088",
    placements: "首页 Banner +2",
    budget: 120000,
    spent: 84620,
    period: "2026-07-10 ~ 2026-08-31",
    strategy: "hybrid",
    status: "active",
    updatedAt: "2026-07-15 10:18:42"
  },
  {
    id: "CP-20260714-0038",
    name: "亲子出行品牌周",
    advertiser: "远行汽车",
    order: "ORD-20260628-0064",
    placements: "开屏位 +1",
    budget: 68000,
    spent: 67280,
    period: "2026-07-14 ~ 2026-07-28",
    strategy: "rtb",
    status: "budget_exhausted",
    updatedAt: "2026-07-15 09:54:11"
  },
  {
    id: "CP-20260712-0031",
    name: "母婴会员日预热",
    advertiser: "橙子母婴",
    order: "ORD-20260708-0102",
    placements: "原生推荐位",
    budget: 35000,
    spent: 0,
    period: "2026-07-20 ~ 2026-07-27",
    strategy: "waterfall",
    status: "pending_review",
    updatedAt: "2026-07-14 17:02:09"
  },
  {
    id: "CP-20260709-0022",
    name: "夏夜游戏激励计划",
    advertiser: "跃动游戏",
    order: "ORD-20260620-0047",
    placements: "激励视频位",
    budget: 92000,
    spent: 43810,
    period: "2026-07-01 ~ 2026-07-31",
    strategy: "hybrid",
    status: "paused",
    updatedAt: "2026-07-13 15:36:27"
  }
];

const campaignStrategyCopy = {
  waterfall: "瀑布",
  rtb: "竞价",
  hybrid: "混合"
} as const;

export type TianshuAdCampaignsPageProps = {
  canView?: boolean;
};

export function TianshuAdCampaignsPage({ canView = true }: TianshuAdCampaignsPageProps) {
  const [rows, setRows] = useState(initialCampaignRows);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [detailRow, setDetailRow] = useState<CampaignRow | null>(null);
  const [pauseTarget, setPauseTarget] = useState<CampaignRow | null>(null);
  const [batchPauseOpen, setBatchPauseOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [planName, setPlanName] = useState("");
  const [planAttempted, setPlanAttempted] = useState(false);
  const [orderId, setOrderId] = useState("ORD-20260701-0088");
  const [planPeriod, setPlanPeriod] = useState<readonly [string, string] | null>(null);
  const [engineStrategy, setEngineStrategy] = useState("waterfall");
  const [frequencyEnabled, setFrequencyEnabled] = useState(false);
  const [placementIds, setPlacementIds] = useState<string[]>(["home-banner", "native-feed"]);
  const [regions, setRegions] = useState<string[]>([]);
  const [dayparts, setDayparts] = useState<string[]>(["morning", "afternoon", "evening"]);
  const campaignFocusRef = useRef<HTMLElement>(null);

  const createCampaign = (status: CampaignRow["status"]) => {
    setPlanAttempted(true);
    if (!planName.trim()) return;
    setRows((current) => [
      {
        id: `CP-20260715-${String(current.length + 42).padStart(4, "0")}`,
        name: planName.trim(),
        advertiser: orderId === "ORD-20260701-0088" ? "星河教育科技" : "远行汽车",
        order: orderId,
        placements: "首页 Banner +1",
        budget: 50000,
        spent: 0,
        period: planPeriod ? `${planPeriod[0]} ~ ${planPeriod[1]}` : "待配置",
        strategy: engineStrategy as CampaignRow["strategy"],
        status,
        updatedAt: "2026-07-15 12:00:00"
      },
      ...current
    ]);
    setCreateOpen(false);
    setPlanAttempted(false);
    setPlanName("");
  };

  const confirmPause = () => {
    if (!pauseTarget) return;
    setRows((current) => current.map((row) => row.id === pauseTarget.id ? { ...row, status: "paused" } : row));
    setPauseTarget(null);
  };

  const activeSelectedCount = rows.filter((row) => selectedRowKeys.includes(row.id) && row.status === "active").length;
  const confirmBatchPause = () => {
    const selected = new Set(selectedRowKeys);
    setRows((current) => current.map((row) => selected.has(row.id) && row.status === "active" ? { ...row, status: "paused" } : row));
    setSelectedRowKeys([]);
    setBatchPauseOpen(false);
  };

  return (
    <>
      {canView ? (
    <PageLayout density="compact" className="deferred-page">
      <PageHeader
        breadcrumb="广告变现域 / 投放计划与引擎"
        title="投放计划"
        description="沿广告位 → 广告主/订单 → 投放计划主链配置预算、排期、定向与引擎策略。"
        actions={(
          <div className="deferred-actions">
            <Button >导出</Button>
            <Button onClick={() => setCreateOpen(true)}>新建计划</Button>
          </div>
        )}
      />
      <DataSection title="广告业务链" description="每一步都依赖上一环已启用或已审核的数据。" variant="dense">
        <Steps current={stepIndex("campaign", [
            { key: "placement", title: "广告位" },
            { key: "advertiser", title: "广告主" },
            { key: "order", title: "订单" },
            { key: "campaign", title: "投放计划" }
          ])} items={[
            { key: "placement", title: "广告位" },
            { key: "advertiser", title: "广告主" },
            { key: "order", title: "订单" },
            { key: "campaign", title: "投放计划" }
          ]} />
      </DataSection>
      <DeferredNotice>
        定向仅使用去标识化聚合人群标签，不关联设备 SN、设备证书或设备指纹。
      </DeferredNotice>
      <FilterPanel
        fields={[
          { name: "name", label: "计划名称/ID", placeholder: "输入计划名称或计划 ID" },
          {
            name: "advertiser",
            label: "广告主",
            type: "select",
            options: [
              { value: "star-education", label: "星河教育科技" },
              { value: "travel-auto", label: "远行汽车" },
              { value: "orange-baby", label: "橙子母婴" }
            ]
          },
          {
            name: "strategy",
            label: "引擎策略",
            type: "select",
            options: Object.entries(campaignStrategyCopy).map(([value, label]) => ({ value, label }))
          },
          {
            name: "status",
            label: "计划状态",
            type: "select",
            options: Object.entries(campaignStatusCopy).map(([value, copy]) => ({ value, label: copy.label }))
          }
        ]}
      />
      <DataSection
        ref={campaignFocusRef}
        title="投放计划列表"
        description="已消耗为准实时分钟级口径；预算触顶后由计费系统自动停投。"
        toolbar={<Button >刷新</Button>}
      >
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={rows} columns={mapTableColumns([
            { key: "id", title: "计划 ID" },
            { key: "name", title: "计划名称" },
            { key: "advertiser", title: "关联广告主" },
            { key: "order", title: "关联订单" },
            { key: "placements", title: "投放广告位" },
            {
              key: "budget",
              title: "预算 / 已消耗",
              sortable: true,
              render: (row) => (
                <div className="deferred-budget-cell">
                  <strong>¥{row.spent.toLocaleString()} / ¥{row.budget.toLocaleString()}</strong>
                  <span>{Math.round((row.spent / row.budget) * 100)}% · 准实时</span>
                </div>
              )
            },
            { key: "period", title: "投放周期" },
            {
              key: "strategy",
              title: "引擎策略",
              render: (row) => <StatusBadge label={campaignStrategyCopy[row.strategy as keyof typeof campaignStrategyCopy]} tone="secondary" />
            },
            {
              key: "status",
              title: "计划状态",
              render: (row) => <StatusBadge {...campaignStatusCopy[row.status as keyof typeof campaignStatusCopy]} />
            },
            { key: "updatedAt", title: "更新时间", sortable: true },
            {
              key: "actions",
              title: "操作",
              render: (row) => (
                <div className="deferred-row-actions">
                  <Button size="small" type="text" onClick={() => setDetailRow(row)}>详情</Button>
                  {row.status === "draft" ? <Button size="small" type="text" >编辑</Button> : null}
                  {row.status === "active" ? (
                    <Button danger size="small" type="text" onClick={() => setPauseTarget(row)}>暂停</Button>
                  ) : null}
                  {row.status === "paused" ? (
                    <Button
                      size="small"
                      type="text" onClick={() => setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: "active" } : item))}
                    >
                      恢复投放
                    </Button>
                  ) : null}
                </div>
              )
            }
          ])} pagination={false} rowSelection={rowSelectionConfig(selectedRowKeys, setSelectedRowKeys)} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={rows.length} /></div></div>
        <BulkActionBar selectedCount={selectedRowKeys.length} onClearSelection={() => setSelectedRowKeys([])}>
          {activeSelectedCount === 0 ? <span className="deferred-readonly-label">所选计划中无投放中项</span> : null}
          <Button
            danger
            disabled={activeSelectedCount === 0}
            size="small"
            onClick={() => setBatchPauseOpen(true)}
          >
            批量暂停
          </Button>
          <Button size="small" >批量提交审核</Button>
          <Button size="small" >导出选中</Button>
        </BulkActionBar>
      </DataSection>

      <Drawer
        open={Boolean(detailRow)}
        title={detailRow ? `计划详情 · ${detailRow.id}` : "计划详情"} destroyOnHidden
        size="min(520px, 100vw)"
        onClose={() => setDetailRow(null)}
        footer={<DrawerActions><Button onClick={() => setDetailRow(null)}>关闭</Button></DrawerActions>}
      >
        {detailRow ? (
          <div className="deferred-drawer-stack">
            <Descriptions column={2} items={toDescriptionItems([
                { label: "计划名称", value: detailRow.name },
                { label: "计划状态", value: <StatusBadge {...campaignStatusCopy[detailRow.status]} /> },
                { label: "关联广告主", value: detailRow.advertiser },
                { label: "关联订单", value: detailRow.order },
                { label: "投放广告位", value: detailRow.placements },
                { label: "引擎策略", value: campaignStrategyCopy[detailRow.strategy] },
                { label: "总预算", value: `¥${detailRow.budget.toLocaleString()}` },
                { label: "已消耗", value: `¥${detailRow.spent.toLocaleString()} · 准实时` },
                { label: "投放周期", value: detailRow.period },
                { label: "更新时间", value: detailRow.updatedAt }
              ])} bordered={true} size="small" />
            <DeferredNotice>广告位与自营内容位保持物理隔离；本计划只关联广告变现域 placement。</DeferredNotice>
          </div>
        ) : null}
      </Drawer>

      <Drawer mask={{ closable: false }}
        open={createOpen}
        title="新建投放计划" destroyOnHidden
        size="min(720px, 100vw)"
        onClose={() => setCreateOpen(false)}
        footer={(
          <DrawerActions>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={() => createCampaign("draft")}>保存草稿</Button>
            <Button form="campaign-create-form" htmlType="submit" type="primary">提交审核</Button>
          </DrawerActions>
        )}
      >
        <Form className="deferred-drawer-stack" id="campaign-create-form" layout="vertical" onFinish={() => createCampaign("pending_review")}>
          <FormSection title="基础信息">
            <Form.Item label="计划名称"><Input placeholder="2–80 字，同一广告主下不可重名" status={planAttempted && !planName.trim() ? "error" : undefined} value={planName} onChange={(event) => setPlanName(event.currentTarget.value)} /></Form.Item>
            {planAttempted && !planName.trim() ? <p className="deferred-field-error">请输入计划名称。</p> : null}
            <Form.Item label="关联订单"><Select value={orderId} onChange={setOrderId} options={[
                { value: "ORD-20260701-0088", label: "ORD-20260701-0088 · 星河教育科技" },
                { value: "ORD-20260628-0064", label: "ORD-20260628-0064 · 远行汽车" }
              ]} /></Form.Item>
            <Form.Item label="投放广告位"><Checkbox.Group value={placementIds} options={[
                { value: "home-banner", label: "首页 Banner" },
                { value: "native-feed", label: "原生推荐位" },
                { value: "reward-video", label: "激励视频位" }
              ]} onChange={(values) => setPlacementIds(values.map(String))} /></Form.Item>
          </FormSection>
          <FormSection title="预算与排期">
            <Form.Item label="计划总预算（元）"><Input defaultValue="50000.00" /></Form.Item>
            <Form.Item label="投放周期"><DatePicker.RangePicker onChange={(_dates, dateStrings) => setPlanPeriod(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} /></Form.Item>
          </FormSection>
          <FormSection title="频控与定向" description="仅可使用去标识化聚合维度。">
            <Form.Item label="启用频控"><Switch checked={frequencyEnabled} onChange={setFrequencyEnabled} /></Form.Item>
            {frequencyEnabled ? <Form.Item label="频控次数（次/天/用户）"><Input defaultValue="3" /></Form.Item> : null}
            <Form.Item label="地域定向"><TreeSelect value={regions} treeData={[
                {
                  value: "east",
                  label: "华东",
                  children: [
                    { value: "shanghai", label: "上海" },
                    { value: "zhejiang", label: "浙江" },
                    { value: "jiangsu", label: "江苏" }
                  ]
                },
                {
                  value: "south",
                  label: "华南",
                  children: [
                    { value: "guangdong", label: "广东" },
                    { value: "fujian", label: "福建" }
                  ]
                }
              ]} multiple={true} onChange={(next) => setRegions(Array.isArray(next) ? next.map(String) : next ? [String(next)] : [])} /></Form.Item>
            <Form.Item label="投放时段"><Checkbox.Group value={dayparts} options={[
                { value: "morning", label: "06:00–12:00" },
                { value: "afternoon", label: "12:00–18:00" },
                { value: "evening", label: "18:00–24:00" },
                { value: "night", label: "00:00–06:00" }
              ]} onChange={(values) => setDayparts(values.map(String))} /></Form.Item>
          </FormSection>
          <FormSection title="引擎策略">
            <Form.Item label="引擎策略"><Radio.Group value={engineStrategy} options={[
                { value: "waterfall", label: "瀑布" },
                { value: "rtb", label: "竞价" },
                { value: "hybrid", label: "混合" }
              ]} onChange={(event) => setEngineStrategy(String(event.target.value))} /></Form.Item>
            {engineStrategy !== "waterfall" ? <Form.Item label="出价（元/CPM）"><Input defaultValue="12.50" /></Form.Item> : null}
          </FormSection>
        </Form>
      </Drawer>

      <Modal open={Boolean(pauseTarget)} title="确认暂停投放计划？" okText="确认暂停" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => setPauseTarget(null)} onOk={confirmPause}>{pauseTarget ? `计划「${pauseTarget.name}」将立即停止投放，已消耗预算不退。恢复投放需手动操作。` : ""}</Modal>
      <Modal open={batchPauseOpen} title="批量暂停投放计划？" okText="确认暂停" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => setBatchPauseOpen(false)} onOk={confirmBatchPause}>{`已选 ${selectedRowKeys.length} 个计划，其中 ${activeSelectedCount} 个处于投放中状态并将被暂停，其余计划会被跳过。`}</Modal>
      </PageLayout>
      ) : (
        <PageLayout className="deferred-page">
          <ForbiddenState
            title="无权访问投放计划"
            description="当前账号缺少 ad:campaign:view 权限，请联系平台管理员申请。"
            actions={<Button >申请权限</Button>}
          />
        </PageLayout>
      )}
    </>
  );
}

const reconciliationStatusCopy = {
  pending: { label: "待对账", tone: "secondary" },
  processing: { label: "对账中", tone: "processing" },
  success: { label: "对平", tone: "success" },
  diff_pending: { label: "差异待处理", tone: "warning" },
  diff_appealed: { label: "差异已申诉", tone: "processing" },
  closed: { label: "已核销", tone: "success" }
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

type ReconciliationRow = Record<string, unknown> & {
  id: string;
  target: string;
  targetType: "联盟" | "广告主";
  period: string;
  platformAmount: number;
  partnerAmount: number;
  difference: number;
  differenceRate: number;
  status: keyof typeof reconciliationStatusCopy;
  owner: string;
  completedAt: string;
};

const initialReconciliationRows: ReconciliationRow[] = [
  {
    id: "RC-20260715-0018",
    target: "穿山甲联盟",
    targetType: "联盟",
    period: "2026-07-13 ~ 2026-07-13",
    platformAmount: 284360.42,
    partnerAmount: 267188.18,
    difference: 17172.24,
    differenceRate: 6.04,
    status: "diff_pending",
    owner: "周予安",
    completedAt: "—"
  },
  {
    id: "RC-20260714-0017",
    target: "星河教育科技",
    targetType: "广告主",
    period: "2026-07-12 ~ 2026-07-12",
    platformAmount: 128940.5,
    partnerAmount: 127996.2,
    difference: 944.3,
    differenceRate: 0.73,
    status: "success",
    owner: "林澄",
    completedAt: "—"
  },
  {
    id: "RC-20260713-0015",
    target: "AdMob",
    targetType: "联盟",
    period: "2026-07-11 ~ 2026-07-11",
    platformAmount: 196720.66,
    partnerAmount: 204104.1,
    difference: -7383.44,
    differenceRate: -3.75,
    status: "diff_appealed",
    owner: "周予安",
    completedAt: "—"
  },
  {
    id: "RC-20260712-0013",
    target: "远行汽车",
    targetType: "广告主",
    period: "2026-07-10 ~ 2026-07-10",
    platformAmount: 83420,
    partnerAmount: 83420,
    difference: 0,
    differenceRate: 0,
    status: "closed",
    owner: "林澄",
    completedAt: "2026-07-12 15:42"
  }
];

function formatCurrency(value: number) {
  return `¥${Math.abs(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type TianshuAdReconciliationPageProps = {
  canView?: boolean;
  canViewAmounts?: boolean;
  canProcess?: boolean;
};

export function TianshuAdReconciliationPage({
  canView = true,
  canViewAmounts = false,
  canProcess = false
}: TianshuAdReconciliationPageProps) {
  const [rows, setRows] = useState(initialReconciliationRows);
  const [period, setPeriod] = useState<readonly [string, string] | null>(null);
  const [detailRow, setDetailRow] = useState<ReconciliationRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPeriod, setCreatePeriod] = useState<readonly [string, string] | null>(null);
  const [billFileCount, setBillFileCount] = useState(0);
  const [closeTarget, setCloseTarget] = useState<ReconciliationRow | null>(null);
  const [treatment, setTreatment] = useState("platform");
  const reconciliationFocusRef = useRef<HTMLElement>(null);

  const renderAmount = (value: number, options?: { signed?: boolean }) => {
    if (!canViewAmounts) return <span aria-label="金额已按权限脱敏" className="deferred-masked">••••••</span>;
    const sign = options?.signed && value > 0 ? "+" : value < 0 ? "−" : "";
    return <span>{sign}{formatCurrency(value)}</span>;
  };

  const confirmClose = () => {
    const target = closeTarget;
    if (!target) return;
    setRows((current) => current.map((row) => row.id === target.id
      ? { ...row, status: "closed", completedAt: "2026-07-15 12:00" }
      : row));
    setCloseTarget(null);
    setDetailRow(null);
  };

  const cancelClose = () => {
    setCloseTarget(null);
  };

  const createReconciliation = () => {
    setRows((current) => [
      {
        id: `RC-20260715-${String(current.length + 19).padStart(4, "0")}`,
        target: "穿山甲联盟",
        targetType: "联盟",
        period: createPeriod ? `${createPeriod[0]} ~ ${createPeriod[1]}` : "待配置",
        platformAmount: 0,
        partnerAmount: 0,
        difference: 0,
        differenceRate: 0,
        status: "pending",
        owner: "当前用户",
        completedAt: "—"
      },
      ...current
    ]);
    setCreateOpen(false);
    setBillFileCount(0);
  };

  const resolveDifference = () => {
    if (!detailRow) return;
    setRows((current) => current.map((row) => row.id === detailRow.id ? { ...row, status: "success" } : row));
    setDetailRow(null);
  };

  return (
    <>
      {canView ? (
    <PageLayout density="compact" className="deferred-page">
      <PageHeader
        breadcrumb="广告变现域 / 对账管理"
        title="对账管理"
        description="核对平台口径与联盟/广告主账单，金额统一采用 T+1 定版口径。"
        actions={(
          <div className="deferred-actions">
            <Badge variant={canViewAmounts ? "success" : "secondary"}>{canViewAmounts ? "金额可见" : "金额已脱敏"}</Badge>
            <Button >导出对账明细</Button>
            {canProcess ? <Button onClick={() => setCreateOpen(true)}>发起对账</Button> : null}
          </div>
        )}
      />
      <DeferredNotice tone="warning">
        当前金额数据均为 T+1 定版口径，每日 02:00 更新，与竞价实时口径存在差异，请勿混用。
      </DeferredNotice>
      {!canProcess ? (
        <DeferredNotice>
          当前角色处于只读模式：可查看状态、差异率与处理轨迹，无法发起对账、处理差异或核销。
        </DeferredNotice>
      ) : null}
      <FilterPanel
        fields={[
          { name: "batch", label: "对账批次号", placeholder: "RC-YYYYMMDD-NNNN" },
          {
            name: "target",
            label: "对账对象",
            type: "select",
            options: [
              { value: "pangle", label: "穿山甲联盟" },
              { value: "admob", label: "AdMob" },
              { value: "star-education", label: "星河教育科技" }
            ]
          },
          {
            name: "status",
            label: "对账状态",
            type: "select",
            options: Object.entries(reconciliationStatusCopy).map(([value, copy]) => ({ value, label: copy.label }))
          }
        ]}
      />
      <Form aria-label="对账时间筛选" className="deferred-filter-extension" layout="vertical">
        <Form.Item label="对账周期"><DatePicker.RangePicker onChange={(_dates, dateStrings) => setPeriod(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} /></Form.Item>
      </Form>
      <DataSection
        ref={reconciliationFocusRef}
        className="deferred-reconciliation-section"
        title="对账批次"
        description="差异率超过对象级阈值时进入只读异常或处理流程。"
        toolbar={<Button >刷新</Button>}
      >
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={rows} rowClassName={(row) => row.status === "diff_pending" ? "deferred-row--exception" : ""} columns={mapTableColumns([
            { key: "id", title: "对账批次号" },
            {
              key: "target",
              title: "对账对象",
              render: (row) => (
                <div className="deferred-object-cell">
                  <strong>{row.target}</strong>
                  <span>{row.targetType}</span>
                </div>
              )
            },
            { key: "period", title: "对账周期", sortable: true },
            { key: "platformAmount", title: "平台金额 · T+1", sortable: true, render: (row) => renderAmount(row.platformAmount) },
            { key: "partnerAmount", title: "对方金额", sortable: true, render: (row) => renderAmount(row.partnerAmount) },
            {
              key: "difference",
              title: "差异金额",
              sortable: true,
              render: (row) => (
                <span className={row.difference === 0 ? "deferred-diff--zero" : row.difference > 0 ? "deferred-diff--positive" : "deferred-diff--negative"}>
                  {renderAmount(row.difference, { signed: true })}
                </span>
              )
            },
            {
              key: "differenceRate",
              title: "差异率",
              sortable: true,
              render: (row) => (
                <strong className={Math.abs(row.differenceRate) > 5 ? "deferred-diff--negative" : Math.abs(row.differenceRate) > 1 ? "deferred-diff--warning" : "deferred-diff--positive"}>
                  {row.differenceRate.toFixed(2)}%
                </strong>
              )
            },
            { key: "status", title: "对账状态", render: (row) => <StatusBadge {...reconciliationStatusCopy[row.status as keyof typeof reconciliationStatusCopy]} /> },
            { key: "owner", title: "对账人" },
            { key: "completedAt", title: "完成时间" },
            {
              key: "actions",
              title: "操作",
              render: (row) => (
                <div className="deferred-row-actions">
                  <Button size="small" type="text" onClick={() => setDetailRow(row)}>查看明细</Button>
                  {canProcess && row.status === "diff_pending" ? (
                    <Button size="small" type="text" onClick={() => setDetailRow(row)}>处理差异</Button>
                  ) : null}
                  {canProcess && (row.status === "success" || row.status === "diff_appealed") ? (
                    <Button danger size="small" type="text" onClick={() => setCloseTarget(row)}>核销</Button>
                  ) : null}
                  {!canProcess && row.status === "diff_pending" ? <span className="deferred-readonly-label">只读异常</span> : null}
                </div>
              )
            }
          ])} pagination={false} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={rows.length} /></div></div>
      </DataSection>

      <Drawer
        open={Boolean(detailRow)}
        title={detailRow ? `差异明细 · ${detailRow.id}` : "差异明细"} destroyOnHidden
        size="min(600px, 100vw)"
        onClose={() => setDetailRow(null)}
        footer={(
          <DrawerActions>
            <Button onClick={() => setDetailRow(null)}>关闭</Button>
            {canProcess && detailRow?.status === "success" ? (
              <Button danger onClick={() => setCloseTarget(detailRow)}>核销此批次</Button>
            ) : null}
            {canProcess && detailRow?.status === "diff_pending" ? <Button form="reconciliation-resolve-form" htmlType="submit" type="primary">确认处理</Button> : null}
          </DrawerActions>
        )}
      >
        {detailRow ? (
          <Form className="deferred-drawer-stack" id="reconciliation-resolve-form" layout="vertical" onFinish={resolveDifference}>
            <Descriptions column={2} items={toDescriptionItems([
                { label: "批次号", value: detailRow.id },
                { label: "对账状态", value: <StatusBadge {...reconciliationStatusCopy[detailRow.status]} /> },
                { label: "对账对象", value: detailRow.target },
                { label: "对账周期", value: detailRow.period },
                { label: "平台金额", value: renderAmount(detailRow.platformAmount) },
                { label: "对方金额", value: renderAmount(detailRow.partnerAmount) },
                { label: "差异金额", value: renderAmount(detailRow.difference, { signed: true }) },
                { label: "差异率", value: `${detailRow.differenceRate.toFixed(2)}%` }
              ])} bordered={true} size="small" />
            {!canViewAmounts ? <DeferredNotice>金额字段已按角色权限脱敏，仅保留差异率与状态用于巡检。</DeferredNotice> : null}
            {canProcess && detailRow.status === "diff_pending" ? (
              <FormSection title="差异处理">
                <Form.Item label="处理方式"><Radio.Group value={treatment} options={[
                    { value: "partner", label: "接受对方口径" },
                    { value: "platform", label: "坚持平台口径" },
                    { value: "negotiated", label: "协商调整" }
                  ]} onChange={(event) => setTreatment(String(event.target.value))} /></Form.Item>
                <Form.Item label="差异原因分类"><Select defaultValue="statistics" options={[
                    { value: "statistics", label: "流量统计口径差异" },
                    { value: "timezone", label: "时区对齐问题" },
                    { value: "invalid-traffic", label: "无效流量扣量差异" },
                    { value: "latency", label: "技术对接延迟" },
                    { value: "other", label: "其他" }
                  ]} /></Form.Item>
                <Form.Item label="原因说明"><Input.TextArea placeholder="其他原因时必填，最多 1000 字" /></Form.Item>
              </FormSection>
            ) : null}
          </Form>
        ) : null}
      </Drawer>

      <Drawer mask={{ closable: false }}
        open={createOpen}
        title="发起对账" destroyOnHidden
        size="min(600px, 100vw)"
        onClose={() => setCreateOpen(false)}
        footer={(
          <DrawerActions>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button form="reconciliation-create-form" htmlType="submit" type="primary">提交发起</Button>
          </DrawerActions>
        )}
      >
        <Form className="deferred-drawer-stack" id="reconciliation-create-form" layout="vertical" onFinish={createReconciliation}>
          <FormSection title="对账基本信息">
            <Form.Item label="对账对象"><Select defaultValue="pangle" options={[
                { value: "pangle", label: "穿山甲联盟" },
                { value: "admob", label: "AdMob" },
                { value: "star-education", label: "星河教育科技" }
              ]} /></Form.Item>
            <Form.Item label="对账周期"><DatePicker.RangePicker onChange={(_dates, dateStrings) => setCreatePeriod(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} /></Form.Item>
          </FormSection>
          <FormSection title="账单导入" description={`已选择 ${billFileCount} 份账单文件`}>
            <Form.Item label="对方账单文件"><Upload accept={toAcceptList([".xlsx", ".xls", ".csv"])} beforeUpload={(_file, files) => { setBillFileCount(files.length); return false; }}><Button>选择文件</Button></Upload></Form.Item>
            <Form.Item label="备注"><Input.TextArea placeholder="最多 500 字" /></Form.Item>
          </FormSection>
        </Form>
      </Drawer>

      <Modal open={Boolean(closeTarget)} title="确认核销该批次？" okText="确认核销" cancelText="取消" okButtonProps={{ danger: true }} onCancel={cancelClose} onOk={confirmClose}>{closeTarget ? `对账批次 ${closeTarget.id} 核销后不可撤回，并将同步更新计费结算记录。` : ""}</Modal>
      </PageLayout>
      ) : (
        <PageLayout className="deferred-page">
          <ForbiddenState
            title="无权访问对账管理"
            description="您暂无对账管理查看权限，请联系平台管理员申请。"
            actions={<Button >申请权限</Button>}
          />
        </PageLayout>
      )}
    </>
  );
}

const scheduleStatusCopy = {
  processing: { label: "待生效", tone: "processing" },
  success: { label: "生效中", tone: "success" },
  ended: { label: "已结束", tone: "secondary" },
  error: { label: "冲突待解决", tone: "danger" },
  cancelled: { label: "已取消", tone: "secondary" }
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

const approvalStatusCopy = {
  pending: { label: "待审批", tone: "warning" },
  approved: { label: "审批通过", tone: "success" },
  rejected: { label: "已驳回", tone: "danger" }
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

const publishStatusCopy = {
  scheduled: { label: "待生效", tone: "processing" },
  active: { label: "已生效", tone: "success" },
  inactive: { label: "已下架", tone: "secondary" }
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

type ScheduleRow = Record<string, unknown> & {
  id: string;
  slot: string;
  material: string;
  period: string;
  timeRange: string;
  priority: "P1" | "P2" | "P3";
  conflict: boolean;
  status: keyof typeof scheduleStatusCopy;
  owner: string;
  createdAt: string;
};

type PublishRow = Record<string, unknown> & {
  id: string;
  slot: string;
  material: string;
  operation: "publish" | "unpublish";
  effectiveAt: string;
  approvalStatus: keyof typeof approvalStatusCopy;
  publishStatus: keyof typeof publishStatusCopy;
  emergency: boolean;
  applicant: string;
  updatedAt: string;
};

const initialScheduleRows: ScheduleRow[] = [
  {
    id: "SCH-20260715-00081",
    slot: "首页 Banner 位-顶部",
    material: "暑期家庭陪伴主视觉",
    period: "2026-07-16 ~ 2026-07-31",
    timeRange: "全天",
    priority: "P1",
    conflict: false,
    status: "processing",
    owner: "夏知遥",
    createdAt: "2026-07-15 10:04:18"
  },
  {
    id: "SCH-20260715-00079",
    slot: "首页 Banner 位-顶部",
    material: "会员日预热 Banner",
    period: "2026-07-18 ~ 2026-07-20",
    timeRange: "18:00 ~ 24:00",
    priority: "P2",
    conflict: true,
    status: "error",
    owner: "苏澄",
    createdAt: "2026-07-15 09:21:02"
  },
  {
    id: "SCH-20260714-00073",
    slot: "详情页顶部活动位",
    material: "亲子出行内容专题",
    period: "2026-07-14 ~ 2026-07-21",
    timeRange: "全天",
    priority: "P2",
    conflict: false,
    status: "success",
    owner: "夏知遥",
    createdAt: "2026-07-14 14:32:45"
  }
];

const initialPublishRows: PublishRow[] = [
  {
    id: "PUB-20260715-000126",
    slot: "首页 Banner 位-顶部",
    material: "暑期家庭陪伴主视觉",
    operation: "publish",
    effectiveAt: "2026-07-16 09:00",
    approvalStatus: "pending",
    publishStatus: "scheduled",
    emergency: false,
    applicant: "夏知遥",
    updatedAt: "2026-07-15 10:12:26"
  },
  {
    id: "PUB-20260714-000121",
    slot: "详情页顶部活动位",
    material: "亲子出行内容专题",
    operation: "publish",
    effectiveAt: "审批通过后立即生效",
    approvalStatus: "approved",
    publishStatus: "active",
    emergency: false,
    applicant: "苏澄",
    updatedAt: "2026-07-14 15:11:38"
  },
  {
    id: "PUB-20260712-000110",
    slot: "首页弹窗位",
    material: "旧版会员权益说明",
    operation: "unpublish",
    effectiveAt: "审批通过后立即生效",
    approvalStatus: "approved",
    publishStatus: "inactive",
    emergency: true,
    applicant: "夏知遥",
    updatedAt: "2026-07-12 18:42:04"
  }
];

export type TianshuContentSchedulePageProps = {
  canView?: boolean;
};

export function TianshuContentSchedulePage({ canView = true }: TianshuContentSchedulePageProps) {
  const [activeTab, setActiveTab] = useState("schedule");
  const [scheduleRows, setScheduleRows] = useState(initialScheduleRows);
  const [publishRows, setPublishRows] = useState(initialPublishRows);
  const [conflictOnly, setConflictOnly] = useState(false);
  const [selectedScheduleKeys, setSelectedScheduleKeys] = useState<string[]>([]);
  const [scheduleFilterPeriod, setScheduleFilterPeriod] = useState<readonly [string, string] | null>(null);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [scheduleDetail, setScheduleDetail] = useState<ScheduleRow | null>(null);
  const [publishDetail, setPublishDetail] = useState<PublishRow | null>(null);
  const [approvalRow, setApprovalRow] = useState<PublishRow | null>(null);
  const [emergencyRow, setEmergencyRow] = useState<PublishRow | null>(null);
  const [cancelSchedulesOpen, setCancelSchedulesOpen] = useState(false);
  const [materialFileCount, setMaterialFileCount] = useState(0);
  const [materialCategories, setMaterialCategories] = useState<string[]>(["campaign"]);
  const [copyrightStatus, setCopyrightStatus] = useState("no_restriction");
  const [copyrightExpiry, setCopyrightExpiry] = useState<string | null>(null);
  const [scheduleSlot, setScheduleSlot] = useState("home-banner");
  const [scheduleMaterial, setScheduleMaterial] = useState("summer-family");
  const [schedulePriority, setSchedulePriority] = useState("P2");
  const [schedulePeriod, setSchedulePeriod] = useState<readonly [string, string] | null>(null);
  const [timeMode, setTimeMode] = useState("all-day");
  const [publishOperation, setPublishOperation] = useState("publish");
  const [effectiveMode, setEffectiveMode] = useState("immediate");
  const [effectiveAt, setEffectiveAt] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState("approve");
  const [approvalComment, setApprovalComment] = useState("");
  const [approvalAttempted, setApprovalAttempted] = useState(false);
  const scheduleFocusRef = useRef<HTMLElement>(null);
  const publishFocusRef = useRef<HTMLElement>(null);

  const visibleScheduleRows = useMemo(
    () => conflictOnly ? scheduleRows.filter((row) => row.conflict) : scheduleRows,
    [conflictOnly, scheduleRows]
  );

  const createSchedule = () => {
    setScheduleRows((current) => [
      {
        id: `SCH-20260715-${String(current.length + 82).padStart(5, "0")}`,
        slot: scheduleSlot === "home-banner" ? "首页 Banner 位-顶部" : "详情页顶部活动位",
        material: scheduleMaterial === "summer-family" ? "暑期家庭陪伴主视觉" : "亲子出行内容专题",
        period: schedulePeriod ? `${schedulePeriod[0]} ~ ${schedulePeriod[1]}` : "待配置",
        timeRange: timeMode === "all-day" ? "全天" : "18:00 ~ 24:00",
        priority: schedulePriority as ScheduleRow["priority"],
        conflict: false,
        status: "processing",
        owner: "当前用户",
        createdAt: "2026-07-15 12:00:00"
      },
      ...current
    ]);
    setScheduleOpen(false);
  };

  const createPublish = () => {
    setPublishRows((current) => [
      {
        id: `PUB-20260715-${String(current.length + 127).padStart(6, "0")}`,
        slot: "首页 Banner 位-顶部",
        material: "暑期家庭陪伴主视觉",
        operation: publishOperation as PublishRow["operation"],
        effectiveAt: effectiveMode === "immediate" ? "审批通过后立即生效" : effectiveAt ?? "待配置",
        approvalStatus: "pending",
        publishStatus: "scheduled",
        emergency: false,
        applicant: "当前用户",
        updatedAt: "2026-07-15 12:00:00"
      },
      ...current
    ]);
    setPublishOpen(false);
  };

  const startApproval = (row: PublishRow) => {
    setApprovalRow(row);
    setApprovalResult("approve");
    setApprovalComment("");
    setApprovalAttempted(false);
  };

  const closeApproval = () => {
    setApprovalRow(null);
    setApprovalComment("");
    setApprovalAttempted(false);
  };

  const submitApproval = () => {
    if (!approvalRow) return;
    setApprovalAttempted(true);
    if (approvalResult === "reject" && !approvalComment.trim()) return;
    setPublishRows((current) => current.map((row) => row.id === approvalRow.id
      ? {
          ...row,
          approvalStatus: approvalResult === "approve" ? "approved" : "rejected",
          publishStatus: approvalResult === "approve" && row.effectiveAt === "审批通过后立即生效" ? "active" : row.publishStatus,
          updatedAt: "2026-07-15 12:00:00"
        }
      : row));
    closeApproval();
  };

  const cancelSelectedSchedules = () => {
    const selected = new Set(selectedScheduleKeys);
    setScheduleRows((current) => current.map((row) => selected.has(row.id) && (row.status === "processing" || row.status === "error")
      ? { ...row, status: "cancelled", conflict: false }
      : row));
    setSelectedScheduleKeys([]);
    setCancelSchedulesOpen(false);
  };

  const emergencyTakeDown = () => {
    if (!emergencyRow) return;
    setPublishRows((current) => current.map((row) => row.id === emergencyRow.id
      ? { ...row, publishStatus: "inactive", emergency: true, updatedAt: "2026-07-15 12:00:00" }
      : row));
    setEmergencyRow(null);
  };

  return (
    <>
      {canView ? (
    <PageLayout density="compact" className="deferred-page">
      <PageHeader
        breadcrumb="内容运营域 / 排期与上下架"
        title="内容排期与上下架"
        description="贯通内容素材 → 内容位 → 排期 → 上下架审批，保持自营内容口径独立。"
        actions={(
          <div className="deferred-actions">
            <Button onClick={() => setMaterialOpen(true)}>上传内容素材</Button>
            {activeTab === "schedule" ? (
              <Button onClick={() => setScheduleOpen(true)}>新建排期</Button>
            ) : (
              <Button onClick={() => setPublishOpen(true)}>发起上架</Button>
            )}
          </div>
        )}
      />
      <DeferredNotice>
        本页只管理自营内容素材与内容位；广告素材、广告位与商业化标识保持独立入口。
      </DeferredNotice>
      <DataSection title="内容运营主链" description="素材通过审核并绑定内容位后，才能进入排期与上下架审批。" variant="dense">
        <Steps current={stepIndex(activeTab === "schedule" ? "schedule" : "publish", [
            { key: "material", title: "内容素材" },
            { key: "slot", title: "内容位" },
            { key: "schedule", title: "排期" },
            { key: "publish", title: "上下架" }
          ])} items={[
            { key: "material", title: "内容素材" },
            { key: "slot", title: "内容位" },
            { key: "schedule", title: "排期" },
            { key: "publish", title: "上下架" }
          ]} />
      </DataSection>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={toTabsItems([
          {
            key: "schedule",
            label: "排期管理",
            content: (
              <SchedulePanel
                conflictOnly={conflictOnly}
                filterPeriod={scheduleFilterPeriod}
                focusFallbackRef={scheduleFocusRef}
                rows={visibleScheduleRows}
                selectedRowKeys={selectedScheduleKeys}
                onConflictOnlyChange={setConflictOnly}
                onFilterPeriodChange={setScheduleFilterPeriod}
                onSelectionChange={setSelectedScheduleKeys}
                onViewDetail={setScheduleDetail}
              />
            )
          },
          {
            key: "publish",
            label: "上下架审批",
            content: (
              <PublishPanel
                focusFallbackRef={publishFocusRef}
                rows={publishRows}
                onEmergencyTakeDown={setEmergencyRow}
                onStartApproval={startApproval}
                onViewDetail={setPublishDetail}
              />
            )
          }
        ])} />
      {activeTab === "schedule" ? (
        <BulkActionBar selectedCount={selectedScheduleKeys.length} onClearSelection={() => setSelectedScheduleKeys([])}>
          <Button danger size="small" onClick={() => setCancelSchedulesOpen(true)}>批量取消</Button>
          <Button size="small">导出选中</Button>
        </BulkActionBar>
      ) : null}

      <Drawer mask={{ closable: false }}
        open={materialOpen}
        title="上传内容素材" destroyOnHidden
        size="min(600px, 100vw)"
        onClose={() => setMaterialOpen(false)}
        footer={(
          <DrawerActions>
            <Button onClick={() => setMaterialOpen(false)}>取消</Button>
            <Button form="content-material-form" htmlType="submit" type="primary">上传为草稿</Button>
          </DrawerActions>
        )}
      >
        <Form className="deferred-drawer-stack" id="content-material-form" layout="vertical" onFinish={() => setMaterialOpen(false)}>
          <FormSection title="文件与基本信息" description={`已选择 ${materialFileCount} 个文件`}>
            <Form.Item label="内容素材文件"><Upload accept={toAcceptList([".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".zip", ".txt", ".docx"])} beforeUpload={(_file, files) => { setMaterialFileCount(files.length); return false; }}><Button>选择文件</Button></Upload></Form.Item>
            <Form.Item label="素材名称"><Input placeholder="2–100 字，内容域内不可重名" /></Form.Item>
            <Form.Item label="素材分类"><TreeSelect value={materialCategories} treeData={[
                {
                  value: "campaign",
                  label: "活动",
                  children: [
                    { value: "summer", label: "暑期活动" },
                    { value: "member-day", label: "会员日" }
                  ]
                },
                {
                  value: "brand",
                  label: "品牌",
                  children: [
                    { value: "product", label: "产品内容" },
                    { value: "guide", label: "使用指南" }
                  ]
                }
              ]} multiple={true} onChange={(next) => setMaterialCategories(Array.isArray(next) ? next.map(String) : next ? [String(next)] : [])} /></Form.Item>
            <Form.Item label="素材描述"><Input.TextArea placeholder="最多 500 字" /></Form.Item>
          </FormSection>
          <FormSection title="版权信息">
            <Form.Item label="版权状态"><Radio.Group value={copyrightStatus} options={[
                { value: "no_restriction", label: "无版权限制" },
                { value: "licensed", label: "有版权已授权" },
                { value: "pending_confirm", label: "版权待确认" }
              ]} onChange={(event) => setCopyrightStatus(String(event.target.value))} /></Form.Item>
            {copyrightStatus !== "no_restriction" ? <Form.Item label="版权来源"><Input.TextArea placeholder="填写授权主体与凭证来源" /></Form.Item> : null}
            {copyrightStatus === "licensed" ? <Form.Item label="版权有效期"><DatePicker onChange={(_date, dateString) => setCopyrightExpiry(Array.isArray(dateString) ? dateString[0] ?? null : dateString || null)} /></Form.Item> : null}
          </FormSection>
        </Form>
      </Drawer>

      <Drawer mask={{ closable: false }}
        open={scheduleOpen}
        title="新建排期" destroyOnHidden
        size="min(600px, 100vw)"
        onClose={() => setScheduleOpen(false)}
        footer={(
          <DrawerActions>
            <Button onClick={() => setScheduleOpen(false)}>取消</Button>
            <Button form="content-schedule-form" htmlType="submit" type="primary">提交并检测冲突</Button>
          </DrawerActions>
        )}
      >
        <Form className="deferred-drawer-stack" id="content-schedule-form" layout="vertical" onFinish={createSchedule}>
          <FormSection title="基本信息">
            <Form.Item label="内容位"><Select value={scheduleSlot} onChange={setScheduleSlot} options={[
                { value: "home-banner", label: "首页 Banner 位-顶部" },
                { value: "detail-top", label: "详情页顶部活动位" }
              ]} /></Form.Item>
            <Form.Item label="内容素材"><Select value={scheduleMaterial} onChange={setScheduleMaterial} options={[
                { value: "summer-family", label: "暑期家庭陪伴主视觉 · 已通过" },
                { value: "family-trip", label: "亲子出行内容专题 · 已通过" }
              ]} /></Form.Item>
            <Form.Item label="优先级"><Radio.Group value={schedulePriority} options={[
                { value: "P1", label: "P1 高" },
                { value: "P2", label: "P2 中" },
                { value: "P3", label: "P3 低" }
              ]} onChange={(event) => setSchedulePriority(String(event.target.value))} /></Form.Item>
            <Form.Item label="备注"><Input.TextArea placeholder="最多 200 字" /></Form.Item>
          </FormSection>
          <FormSection title="时间配置">
            <Form.Item label="排期周期"><DatePicker.RangePicker onChange={(_dates, dateStrings) => setSchedulePeriod(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} /></Form.Item>
            <Form.Item label="时段类型"><Radio.Group value={timeMode} options={[
                { value: "all-day", label: "全天" },
                { value: "custom", label: "自定义时段" }
              ]} onChange={(event) => setTimeMode(String(event.target.value))} /></Form.Item>
            {timeMode === "custom" ? <Form.Item label="自定义时段"><Input placeholder="HH:mm ~ HH:mm，至少 15 分钟" /></Form.Item> : null}
          </FormSection>
        </Form>
      </Drawer>

      <Drawer mask={{ closable: false }}
        open={publishOpen}
        title="发起上架/下架" destroyOnHidden
        size="min(600px, 100vw)"
        onClose={() => setPublishOpen(false)}
        footer={(
          <DrawerActions>
            <Button onClick={() => setPublishOpen(false)}>取消</Button>
            <Button form="content-publish-form" htmlType="submit" type="primary">提交审批</Button>
          </DrawerActions>
        )}
      >
        <Form id="content-publish-form" layout="vertical" onFinish={createPublish}>
          <FormSection title="发布申请">
            <Form.Item label="操作类型"><Radio.Group value={publishOperation} options={[
                { value: "publish", label: "上架" },
                { value: "unpublish", label: "下架" }
              ]} onChange={(event) => setPublishOperation(String(event.target.value))} /></Form.Item>
            <Form.Item label="内容位"><Select defaultValue="home-banner" options={[
                { value: "home-banner", label: "首页 Banner 位-顶部" },
                { value: "detail-top", label: "详情页顶部活动位" }
              ]} /></Form.Item>
            <Form.Item label="内容素材"><Select defaultValue="summer-family" options={[
                { value: "summer-family", label: "暑期家庭陪伴主视觉" },
                { value: "family-trip", label: "亲子出行内容专题" }
              ]} /></Form.Item>
            <Form.Item label="生效方式"><Radio.Group value={effectiveMode} options={[
                { value: "immediate", label: "审批通过后立即生效" },
                { value: "scheduled", label: "预约时间生效" }
              ]} onChange={(event) => setEffectiveMode(String(event.target.value))} /></Form.Item>
            {effectiveMode === "scheduled" ? (
              <Form.Item label="计划生效时间"><DatePicker showTime={true} onChange={(_date, dateString) => setEffectiveAt(Array.isArray(dateString) ? dateString[0] ?? null : dateString || null)} /></Form.Item>
            ) : null}
            <Form.Item label="申请原因"><Input.TextArea placeholder="必填，最多 500 字" /></Form.Item>
          </FormSection>
        </Form>
      </Drawer>

      <Drawer
        open={Boolean(scheduleDetail)}
        title={scheduleDetail ? `排期详情 · ${scheduleDetail.id}` : "排期详情"} destroyOnHidden
        size="min(520px, 100vw)"
        onClose={() => setScheduleDetail(null)}
        footer={<DrawerActions><Button onClick={() => setScheduleDetail(null)}>关闭</Button></DrawerActions>}
      >
        {scheduleDetail ? (
          <div className="deferred-drawer-stack">
            <Descriptions column={2} items={toDescriptionItems([
              { label: "内容位", value: scheduleDetail.slot },
              { label: "内容素材", value: scheduleDetail.material },
              { label: "排期周期", value: scheduleDetail.period },
              { label: "时段", value: scheduleDetail.timeRange },
              { label: "优先级", value: scheduleDetail.priority },
              { label: "排期状态", value: <StatusBadge {...scheduleStatusCopy[scheduleDetail.status]} /> },
              { label: "创建人", value: scheduleDetail.owner },
              { label: "创建时间", value: scheduleDetail.createdAt }
            ])} bordered={true} size="small" />
            {scheduleDetail.conflict ? (
              <DeferredNotice tone="danger">该排期与同一内容位的高优先级排期重叠，请调整时段或取消本排期。</DeferredNotice>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(publishDetail)}
        title={publishDetail ? `发布单详情 · ${publishDetail.id}` : "发布单详情"} destroyOnHidden
        size="min(520px, 100vw)"
        onClose={() => setPublishDetail(null)}
        footer={(
          <DrawerActions>
            <Button onClick={() => setPublishDetail(null)}>关闭</Button>
            {publishDetail?.approvalStatus === "pending" ? (
              <Button onClick={() => { setApprovalRow(publishDetail); setPublishDetail(null); }}>审批</Button>
            ) : null}
            {publishDetail?.publishStatus === "active" ? (
              <Button danger onClick={() => { setEmergencyRow(publishDetail); setPublishDetail(null); }}>紧急下架</Button>
            ) : null}
          </DrawerActions>
        )}
      >
        {publishDetail ? (
          <div className="deferred-drawer-stack">
            <Descriptions column={2} items={toDescriptionItems([
              { label: "内容位", value: publishDetail.slot },
              { label: "内容素材", value: publishDetail.material },
              { label: "操作类型", value: publishDetail.operation === "publish" ? "上架" : "下架" },
              { label: "计划生效", value: publishDetail.effectiveAt },
              { label: "审批状态", value: <StatusBadge {...approvalStatusCopy[publishDetail.approvalStatus]} /> },
              { label: "发布状态", value: <StatusBadge {...publishStatusCopy[publishDetail.publishStatus]} /> },
              { label: "申请人", value: publishDetail.applicant },
              { label: "操作时间", value: publishDetail.updatedAt }
            ])} bordered={true} size="small" />
            {publishDetail.emergency ? <DeferredNotice tone="danger">该发布单通过紧急下架执行，操作人与原因已同步写入审计轨迹。</DeferredNotice> : null}
          </div>
        ) : null}
      </Drawer>

      <Drawer mask={{ closable: false }}
        open={Boolean(approvalRow)}
        title={approvalRow ? `审批发布单 · ${approvalRow.id}` : "审批发布单"} destroyOnHidden
        size="min(600px, 100vw)"
        onClose={closeApproval}
        footer={(
          <DrawerActions>
            <Button onClick={closeApproval}>取消</Button>
            <Button form="content-approval-form" htmlType="submit" type="primary">确认提交</Button>
          </DrawerActions>
        )}
      >
        <Form className="deferred-drawer-stack" id="content-approval-form" layout="vertical" onFinish={submitApproval}>
          {approvalRow ? (
            <Descriptions column={2} items={toDescriptionItems([
              { label: "内容位", value: approvalRow.slot },
              { label: "内容素材", value: approvalRow.material },
              { label: "操作类型", value: approvalRow.operation === "publish" ? "上架" : "下架" },
              { label: "计划生效", value: approvalRow.effectiveAt },
              { label: "申请人", value: approvalRow.applicant },
              { label: "当前状态", value: <StatusBadge {...approvalStatusCopy[approvalRow.approvalStatus]} /> }
            ])} bordered={true} size="small" />
          ) : null}
          <FormSection title="审批结论">
            <Form.Item label="审批结果"><Radio.Group value={approvalResult} options={[
                { value: "approve", label: "通过" },
                { value: "reject", label: "驳回" }
              ]} onChange={(event) => setApprovalResult(String(event.target.value))} /></Form.Item>
            <Form.Item label="审批意见"><Input.TextArea aria-describedby={approvalAttempted && approvalResult === "reject" && !approvalComment.trim() ? "content-approval-comment-error" : undefined} placeholder={approvalResult === "reject" ? "驳回时必填" : "通过时可选"} status={approvalAttempted && approvalResult === "reject" && !approvalComment.trim() ? "error" : undefined} value={approvalComment} onChange={(event) => setApprovalComment(event.currentTarget.value)} /></Form.Item>
            {approvalAttempted && approvalResult === "reject" && !approvalComment.trim() ? (
              <p className="deferred-field-error" id="content-approval-comment-error" role="alert">驳回时必须填写审批意见。</p>
            ) : null}
          </FormSection>
        </Form>
      </Drawer>

      <Modal open={cancelSchedulesOpen} title="批量取消排期？" okText="确认取消" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => setCancelSchedulesOpen(false)} onOk={cancelSelectedSchedules}>{`已选 ${selectedScheduleKeys.length} 项；仅待生效或冲突待解决的排期会被取消，取消后不可恢复。`}</Modal>
      <Modal open={Boolean(emergencyRow)} title="确认紧急下架？" okText="确认下架" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => setEmergencyRow(null)} onOk={emergencyTakeDown}>{emergencyRow ? `将立即从内容位「${emergencyRow.slot}」撤下素材「${emergencyRow.material}」，无需审批，操作不可撤销。` : ""}</Modal>
      </PageLayout>
      ) : (
        <PageLayout className="deferred-page">
          <ForbiddenState
            title="无权访问内容排期"
            description="无访问权限，请联系平台管理员申请 content:schedule:view。"
            actions={<Button >申请权限</Button>}
          />
        </PageLayout>
      )}
    </>
  );
}

type SchedulePanelProps = {
  conflictOnly: boolean;
  filterPeriod: readonly [string, string] | null;
  focusFallbackRef: RefObject<HTMLElement | null>;
  rows: ScheduleRow[];
  selectedRowKeys: string[];
  onConflictOnlyChange: (checked: boolean) => void;
  onFilterPeriodChange: (value: readonly [string, string] | null) => void;
  onSelectionChange: (keys: string[]) => void;
  onViewDetail: (row: ScheduleRow) => void;
};

function SchedulePanel({
  conflictOnly,
  filterPeriod,
  focusFallbackRef,
  rows,
  selectedRowKeys,
  onConflictOnlyChange,
  onFilterPeriodChange,
  onSelectionChange,
  onViewDetail
}: SchedulePanelProps) {
  return (
    <div className="deferred-tab-panel">
      <FilterPanel
        fields={[
          { name: "schedule", label: "排期 ID", placeholder: "SCH-YYYYMMDD-NNNNN" },
          {
            name: "slot",
            label: "内容位",
            type: "select",
            options: [
              { value: "home-banner", label: "首页 Banner 位-顶部" },
              { value: "detail-top", label: "详情页顶部活动位" }
            ]
          },
          {
            name: "status",
            label: "排期状态",
            type: "select",
            options: Object.entries(scheduleStatusCopy).map(([value, copy]) => ({ value, label: copy.label }))
          },
          {
            name: "priority",
            label: "优先级",
            type: "select",
            options: [
              { value: "P1", label: "P1 高" },
              { value: "P2", label: "P2 中" },
              { value: "P3", label: "P3 低" }
            ]
          }
        ]}
      />
      <Form aria-label="排期补充筛选" className="deferred-filter-extension deferred-filter-extension--spread" layout="vertical">
        <Form.Item label="排期周期"><DatePicker.RangePicker onChange={(_dates, dateStrings) => onFilterPeriodChange(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} /></Form.Item>
        <Form.Item label="仅查看冲突排期"><Switch checked={conflictOnly} onChange={onConflictOnlyChange} /></Form.Item>
      </Form>
      <DataSection ref={focusFallbackRef} title="排期列表" description="优先级使用中性层级；冲突状态单独使用危险语义。">
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={rows} columns={mapTableColumns([
            { key: "id", title: "排期 ID" },
            { key: "slot", title: "内容位" },
            {
              key: "material",
              title: "内容素材",
              render: (row) => (
                <div className="deferred-object-cell">
                  <strong>{row.material}</strong>
                  <span>审核通过</span>
                </div>
              )
            },
            { key: "period", title: "排期周期", sortable: true },
            { key: "timeRange", title: "时段" },
            {
              key: "priority",
              title: "优先级",
              render: (row) => <span className={`deferred-priority deferred-priority--${row.priority.toLowerCase()}`}>{row.priority}</span>
            },
            { key: "conflict", title: "冲突", render: (row) => row.conflict ? <StatusBadge label="冲突" tone="danger" /> : "—" },
            { key: "status", title: "排期状态", render: (row) => <StatusBadge {...scheduleStatusCopy[row.status as keyof typeof scheduleStatusCopy]} /> },
            { key: "owner", title: "创建人" },
            { key: "createdAt", title: "创建时间", sortable: true },
            {
              key: "actions",
              title: "操作",
              render: (row) => (
                <div className="deferred-row-actions">
                  <Button size="small" type="text" onClick={() => onViewDetail(row)}>详情</Button>
                  {row.status === "error" ? (
                    <Button size="small" type="text" onClick={() => onViewDetail(row)}>冲突调整</Button>
                  ) : null}
                </div>
              )
            }
          ])} pagination={false} rowSelection={rowSelectionConfig(selectedRowKeys, onSelectionChange)} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={rows.length} /></div></div>
      </DataSection>
    </div>
  );
}

type PublishPanelProps = {
  focusFallbackRef: RefObject<HTMLElement | null>;
  rows: PublishRow[];
  onEmergencyTakeDown: (row: PublishRow) => void;
  onStartApproval: (row: PublishRow) => void;
  onViewDetail: (row: PublishRow) => void;
};

function PublishPanel({ focusFallbackRef, rows, onEmergencyTakeDown, onStartApproval, onViewDetail }: PublishPanelProps) {
  return (
    <div className="deferred-tab-panel">
      <FilterPanel
        fields={[
          { name: "publish", label: "发布单 ID", placeholder: "PUB-YYYYMMDD-NNNNNN" },
          {
            name: "operation",
            label: "操作类型",
            type: "select",
            options: [
              { value: "publish", label: "上架" },
              { value: "unpublish", label: "下架" }
            ]
          },
          {
            name: "approval",
            label: "审批状态",
            type: "select",
            options: Object.entries(approvalStatusCopy).map(([value, copy]) => ({ value, label: copy.label }))
          },
          {
            name: "publishStatus",
            label: "发布状态",
            type: "select",
            options: Object.entries(publishStatusCopy).map(([value, copy]) => ({ value, label: copy.label }))
          }
        ]}
      />
      <DataSection ref={focusFallbackRef} title="上下架发布单" description="审批状态与发布状态分别展示，紧急下架会保留独立标记。">
        <div className="tianshu-ui-data-grid"><div className="tianshu-ui-table-wrap"><Table className="tianshu-ui-table" size="middle" scroll={{ x: "max-content" }} rowKey="id" dataSource={rows} columns={mapTableColumns([
            { key: "id", title: "发布单 ID" },
            { key: "slot", title: "内容位" },
            { key: "material", title: "内容素材" },
            {
              key: "operation",
              title: "操作类型",
              render: (row) => <StatusBadge label={row.operation === "publish" ? "上架" : "下架"} tone="secondary" />
            },
            { key: "effectiveAt", title: "计划生效时间", sortable: true },
            { key: "approvalStatus", title: "审批状态", render: (row) => <StatusBadge {...approvalStatusCopy[row.approvalStatus as keyof typeof approvalStatusCopy]} /> },
            {
              key: "publishStatus",
              title: "发布状态",
              render: (row) => (
                <div className="deferred-badge-group">
                  <StatusBadge {...publishStatusCopy[row.publishStatus as keyof typeof publishStatusCopy]} />
                  {row.emergency ? <StatusBadge label="紧急" tone="danger" /> : null}
                </div>
              )
            },
            { key: "applicant", title: "申请人" },
            { key: "updatedAt", title: "操作时间", sortable: true },
            {
              key: "actions",
              title: "操作",
              render: (row) => (
                <div className="deferred-row-actions">
                  <Button size="small" type="text" onClick={() => onViewDetail(row)}>查看详情</Button>
                  {row.approvalStatus === "pending" ? (
                    <Button size="small" type="text" onClick={() => onStartApproval(row)}>审批</Button>
                  ) : null}
                  {row.publishStatus === "active" && row.operation === "publish" ? (
                    <Button danger size="small" type="text" onClick={() => onEmergencyTakeDown(row)}>紧急下架</Button>
                  ) : null}
                </div>
              )
            }
          ])} pagination={false} /></div><div className="tianshu-ui-data-grid__pagination"><Pagination responsive showSizeChanger={false} pageSize={20} total={rows.length} /></div></div>
      </DataSection>
    </div>
  );
}
