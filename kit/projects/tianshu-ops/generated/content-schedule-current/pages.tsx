import { useMemo, useState, type Key, type ReactNode } from "react";
import type { ThemeConfig } from "antd";
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import "antd/dist/reset.css";
import "./styles.css";

export type GeneratedPageId = "content-schedule";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "tianshu-ops",
  "product": {
    "name": "天枢内容排期与发布",
    "description": "供内容运营人员管理自营内容素材、内容位、排期冲突与上下架审批的高密度生产页面。"
  },
  "outputMode": "library-native",
  "foundation": "antd"
} as const;

const nativeTheme: ThemeConfig = {
  cssVar: { key: "generated", prefix: "ant" },
  hashed: false
};

const contentScheduleRows = [
  {
    "id": "SCH-20260715-00081",
    "slot": "首页 Banner 位-顶部",
    "material": "暑期家庭伴主视觉",
    "materialStatus": "审核通过",
    "period": "2026-07-16 ~ 2026-07-31",
    "startDate": "2026-07-16",
    "endDate": "2026-07-31",
    "timeRange": "全天",
    "priority": "P1",
    "conflict": false,
    "conflictLabel": "—",
    "status": "待生效",
    "owner": "夏知遥",
    "createdAt": "2026-07-15 10:04",
    "operations": ""
  },
  {
    "id": "SCH-20260715-00079",
    "slot": "首页 Banner 位-底部",
    "material": "会员日预热 Banner",
    "materialStatus": "审核通过",
    "period": "2026-07-18 ~ 2026-07-20",
    "startDate": "2026-07-18",
    "endDate": "2026-07-20",
    "timeRange": "18:00 ~ 24:00",
    "priority": "P2",
    "conflict": true,
    "conflictLabel": "冲突",
    "status": "冲突待解决",
    "owner": "苏澄",
    "createdAt": "2026-07-15 09:21",
    "operations": ""
  },
  {
    "id": "SCH-20260714-00073",
    "slot": "详情页顶部活动位",
    "material": "亲子出行内容专题",
    "materialStatus": "审核通过",
    "period": "2026-07-14 ~ 2026-07-21",
    "startDate": "2026-07-14",
    "endDate": "2026-07-21",
    "timeRange": "全天",
    "priority": "P2",
    "conflict": false,
    "conflictLabel": "—",
    "status": "生效中",
    "owner": "夏知遥",
    "createdAt": "2026-07-14 14:32",
    "operations": ""
  }
];

function ContentSchedulePage() {
  type ContentScheduleRow = (typeof contentScheduleRows)[number];
  type DateRangeValue = readonly [{ format: (value: string) => string }, { format: (value: string) => string }] | undefined;
  const [queryForm] = Form.useForm();
  const [query, setQuery] = useState<Record<string, unknown>>({});
  const [conflictOnly, setConflictOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("schedule");
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<ContentScheduleRow | null>(null);
  const visibleRows = useMemo(
    () => contentScheduleRows.filter((row) =>
      (!query["scheduleId"] || String(row.id ?? "").toLocaleLowerCase().includes(String(query["scheduleId"]).trim().toLocaleLowerCase())) &&
      (!query["slot"] || String(row.slot ?? "") === String(query["slot"])) &&
      (!query["status"] || String(row.status ?? "") === String(query["status"])) &&
      (!query["priority"] || String(row.priority ?? "") === String(query["priority"])) &&
      (!(query["period"] as DateRangeValue)?.[0] || row.endDate >= (query["period"] as DateRangeValue)![0].format("YYYY-MM-DD")) &&
      (!(query["period"] as DateRangeValue)?.[1] || row.startDate <= (query["period"] as DateRangeValue)![1].format("YYYY-MM-DD")) &&
      (!conflictOnly || Boolean(row.conflict))
    ),
    [query, conflictOnly]
  );
  const columns = [
    { title: "排期 ID", dataIndex: "id", key: "id", width: 132, ellipsis: true },
    { title: "内容位", dataIndex: "slot", key: "slot", width: 112, ellipsis: true },
    { title: "内容素材", dataIndex: "material", key: "material", width: 128, ellipsis: true, render: (value: unknown, row: ContentScheduleRow) => <div className="generated-cell-stack"><span>{String(value ?? "")}</span><Typography.Text type={"success"}>{String(row.materialStatus ?? "")}</Typography.Text></div> },
    { title: "排期周期", dataIndex: "period", key: "period", width: 108 },
    { title: "时段", dataIndex: "timeRange", key: "timeRange", width: 78 },
    { title: "优先级", dataIndex: "priority", key: "priority", width: 58 },
    { title: "冲突", dataIndex: "conflictLabel", key: "conflictLabel", width: 54, render: (value: unknown) => { const label = String(value ?? ""); const color = ({"冲突":"red","—":"default"} as Record<string, string>)[label] ?? "default"; return label === "—" ? <Typography.Text type="secondary">—</Typography.Text> : <Tag color={color}>{label}</Tag>; } },
    { title: "排期状态", dataIndex: "status", key: "status", width: 88, render: (value: unknown) => { const label = String(value ?? ""); const color = ({"待生效":"gold","冲突待解决":"red","生效中":"green"} as Record<string, string>)[label] ?? "default"; return label === "—" ? <Typography.Text type="secondary">—</Typography.Text> : <Tag color={color}>{label}</Tag>; } },
    { title: "创建人", dataIndex: "owner", key: "owner", width: 60 },
    { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 116 },
    { title: "操作", dataIndex: "operations", key: "operations", width: 132, fixed: "right" as const, render: (_value: unknown, row: ContentScheduleRow) => <Space size={4}><Button type="link" size="small" onClick={() => setDetailRow(row)}>详情</Button>{Boolean(row.conflict) ? <Button type="link" size="small" onClick={() => setPrimaryOpen(true)}>冲突调整</Button> : null}</Space> }
  ];

  function resetQuery() {
    queryForm.resetFields();
    setQuery({});
    setConflictOnly(false);
  }

  return (
    <NativePageShell
      title={"内容排期与上下架"}
      goal={"贯通内容素材、内容位、排期和上下架审批，保持自营内容入口独立并让冲突排期可快速识别与处理。"}
      actions={<Space><Button onClick={() => setSecondaryOpen(true)} data-testid="golden-secondary-action">上传内容素材</Button><Button type="primary" onClick={() => setPrimaryOpen(true)} data-testid="golden-primary-action">新建排期</Button></Space>}
    >
      <Alert showIcon type="info" title={"本页只管理自营内容素材与内容位；广告素材、广告位与商业化标识保持独立入口。"} />
      <Card className="generated-process-card">
        <div className="generated-section-heading">
          <Typography.Title level={4}>内容运营主链</Typography.Title>
          <Typography.Text type="secondary">素材通过审核并绑定内容位后，才能进入排期与上下架审批。</Typography.Text>
        </div>
        <Steps current={2} responsive items={[
  {
    "title": "内容素材"
  },
  {
    "title": "内容位"
  },
  {
    "title": "排期"
  },
  {
    "title": "上下架"
  }
]} />
      </Card>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: "schedule",
            label: "排期管理",
            children: (
              <Space orientation="vertical" size="middle" className="generated-tab-stack">
                <Card className="generated-query-card">
                  <Form form={queryForm} layout="vertical" className="generated-query-grid" onFinish={(values: Record<string, unknown>) => setQuery(values)}>
                    <Form.Item label={"排期 ID"} name={"scheduleId"}><Input allowClear placeholder={"SCH-YYYYMMDD-NNNNN"} data-testid={"golden-filter-scheduleId"} /></Form.Item>
                    <Form.Item label={"内容位"} name={"slot"}><Select allowClear placeholder={"全部内容位"} options={[{"label":"首页 Banner 位-顶部","value":"首页 Banner 位-顶部"},{"label":"首页 Banner 位-底部","value":"首页 Banner 位-底部"},{"label":"详情页顶部活动位","value":"详情页顶部活动位"}]} data-testid={"golden-filter-slot"} /></Form.Item>
                    <Form.Item label={"排期状态"} name={"status"}><Select allowClear placeholder={"全部状态"} options={[{"label":"待生效","value":"待生效"},{"label":"冲突待解决","value":"冲突待解决"},{"label":"生效中","value":"生效中"}]} data-testid={"golden-filter-status"} /></Form.Item>
                    <Form.Item label={"优先级"} name={"priority"}><Select allowClear placeholder={"全部优先级"} options={[{"label":"P1","value":"P1"},{"label":"P2","value":"P2"},{"label":"P3","value":"P3"}]} data-testid={"golden-filter-priority"} /></Form.Item>
                    <Form.Item className="generated-range-filter" label={"排期周期"} name={"period"}><DatePicker.RangePicker allowClear placeholder={['开始日期', '结束日期']} data-testid={"golden-filter-period"} /></Form.Item>
                    <div className="generated-switch-filter"><span>仅查看冲突排期</span><Switch checked={conflictOnly} onChange={setConflictOnly} data-testid={"golden-filter-conflictOnly"} /></div>
                    <div className="generated-query-actions">
                      <Button htmlType="submit" type="primary" data-testid="golden-query">查询</Button>
                      <Button icon={<ReloadOutlined />} onClick={resetQuery}>重置</Button>
                    </div>
                  </Form>
                </Card>
                <Card
                  className="generated-table-card"
                  title={<div><Typography.Title level={4}>排期列表</Typography.Title><Typography.Text type="secondary">优先级使用中性层级，冲突与排期状态分别使用危险和生命周期语义</Typography.Text></div>}
                  extra={<Typography.Text type="secondary">共 {visibleRows.length} 条</Typography.Text>}
                >
                  <Table<ContentScheduleRow>
                    rowKey={"id"}
                    size="middle"
                    dataSource={visibleRows}
                    columns={columns}
                    rowSelection={{ selectedRowKeys, onChange: (keys: Key[]) => setSelectedRowKeys(keys) }}
                    pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => "共 " + total + " 条" }}
                    scroll={{ x: 1180 }}
                  />
                  <div className="generated-bulk-bar" aria-live="polite">
                    <Typography.Text type="secondary">已选择 {selectedRowKeys.length} 条排期</Typography.Text>
                    <Button disabled={selectedRowKeys.length === 0}>导出选中</Button>
                  </div>
                </Card>
              </Space>
            )
          },
          {
            key: "approval",
            label: "上下架审批",
            children: <Card className="generated-empty-card"><Empty description={"当前没有待处理的上下架审批"} /></Card>
          }
        ]} />
      <Drawer
        open={primaryOpen}
        title={"新建排期"}
        size={600}
        destroyOnHidden
        mask={{ closable: false }}
        onClose={() => setPrimaryOpen(false)}
        footer={<Space><Button onClick={() => setPrimaryOpen(false)}>取消</Button><Button form="golden-primary-form" htmlType="submit" type="primary">提交并检测冲突</Button></Space>}
      >
        <Typography.Paragraph type="secondary">选择已审核素材、内容位与生效周期；提交后先执行冲突检测。</Typography.Paragraph>
        <Form id="golden-primary-form" layout="vertical" onFinish={() => setPrimaryOpen(false)}>
          <Form.Item label={"内容位"} name={"slot"} rules={[{ required: true, message: "内容位必填" }]}><Select placeholder={"请选择内容位"} options={[{"label":"首页 Banner 位-顶部","value":"home-banner-top"},{"label":"首页 Banner 位-底部","value":"home-banner-bottom"},{"label":"详情页顶部活动位","value":"detail-top"}]} /></Form.Item>
          <Form.Item label={"内容素材"} name={"material"} rules={[{ required: true, message: "内容素材必填" }]}><Select placeholder={"请选择内容素材"} options={[{"label":"暑期家庭伴主视觉","value":"summer-family"},{"label":"会员日预热 Banner","value":"member-day"},{"label":"亲子出行内容专题","value":"family-trip"}]} /></Form.Item>
          <Form.Item label={"优先级"} name={"priority"} rules={[{ required: true, message: "优先级必填" }]}><Select placeholder={"请选择优先级"} options={[{"label":"P1","value":"P1"},{"label":"P2","value":"P2"},{"label":"P3","value":"P3"}]} /></Form.Item>
          <Form.Item label={"排期周期"} name={"period"} rules={[{ required: true, message: "排期周期必填" }]}><DatePicker.RangePicker placeholder={['开始日期', '结束日期']} showTime /></Form.Item>
          <Form.Item label={"排期说明"} name={"remark"}><Input.TextArea rows={3} placeholder={"补充适用场景、时段或冲突处理说明"} /></Form.Item>
        </Form>
      </Drawer>
      <Drawer
        open={secondaryOpen}
        title={"上传内容素材"}
        size={560}
        destroyOnHidden
        mask={{ closable: false }}
        onClose={() => setSecondaryOpen(false)}
        footer={<Space><Button onClick={() => setSecondaryOpen(false)}>取消</Button><Button type="primary" onClick={() => setSecondaryOpen(false)}>上传为草稿</Button></Space>}
      >
        <Typography.Paragraph type="secondary">上传文件后将进入素材审核，审核通过后才可绑定排期。</Typography.Paragraph>
        <Upload.Dragger multiple accept={".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.zip"} beforeUpload={() => false}>
          <Typography.Text strong>点击或拖拽文件到此区域</Typography.Text>
          <Typography.Paragraph type="secondary">文件只进入当前演示任务，不会自动发布。</Typography.Paragraph>
        </Upload.Dragger>
      </Drawer>
      <Drawer
        open={Boolean(detailRow)}
        title={detailRow ? "排期列表 · " + String(detailRow.id) : "排期列表"}
        size={520}
        destroyOnHidden
        onClose={() => setDetailRow(null)}
      >
        <Descriptions bordered column={1} items={[
              { key: "id", label: "排期 ID", children: String(detailRow?.id ?? "—") },
              { key: "slot", label: "内容位", children: String(detailRow?.slot ?? "—") },
              { key: "material", label: "内容素材", children: String(detailRow?.material ?? "—") },
              { key: "period", label: "排期周期", children: String(detailRow?.period ?? "—") },
              { key: "timeRange", label: "时段", children: String(detailRow?.timeRange ?? "—") },
              { key: "priority", label: "优先级", children: String(detailRow?.priority ?? "—") },
              { key: "conflictLabel", label: "冲突", children: String(detailRow?.conflictLabel ?? "—") },
              { key: "status", label: "排期状态", children: String(detailRow?.status ?? "—") }
            ]} />
      </Drawer>
    </NativePageShell>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "content-schedule", route: "/content/schedule", title: "内容排期与上下架", pattern: "list-page", component: ContentSchedulePage }
];

function NativePageShell({ title, goal, actions, children }: { title: string; goal: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <ConfigProvider theme={nativeTheme}>
      <main className="generated-page generated-golden-page">
        <Space orientation="vertical" size="large" className="generated-stack">
          <header className="generated-native-header">
            <div>
              <Typography.Title level={2}>{title}</Typography.Title>
              <Typography.Paragraph>{goal}</Typography.Paragraph>
            </div>
            {actions}
          </header>
          {children}
        </Space>
      </main>
    </ConfigProvider>
  );
}
