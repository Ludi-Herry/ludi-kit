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

export type GeneratedPageId = "inventory-list";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "sample-inventory-erp",
  "product": {
    "name": "云仓 ERP 库存终评",
    "description": "供仓库与采购人员识别库存风险并进入采购补货操作的冻结 Holdout 页面。"
  },
  "outputMode": "library-native",
  "foundation": "antd"
} as const;

const nativeTheme: ThemeConfig = {
  cssVar: { key: "generated", prefix: "ant" },
  hashed: false
};

const inventoryListRows = [
  {
    "sku": "SKU-1042",
    "name": "有机燕麦奶",
    "warehouse": "华西仓",
    "available": 148,
    "status": "低库存",
    "expiryDate": "2026-08-18",
    "needsAction": true,
    "operations": "查看 · 新建采购单",
    "searchText": "SKU-1042 有机燕麦奶 华西仓"
  },
  {
    "sku": "SKU-2188",
    "name": "冷萃咖啡组合装",
    "warehouse": "华北仓",
    "available": 560,
    "status": "充足",
    "expiryDate": "2026-10-02",
    "needsAction": false,
    "operations": "查看",
    "searchText": "SKU-2188 冷萃咖啡组合装 华北仓"
  },
  {
    "sku": "SKU-3307",
    "name": "蛋白棒礼盒",
    "warehouse": "华东仓",
    "available": 32,
    "status": "临期风险",
    "expiryDate": "2026-08-12",
    "needsAction": true,
    "operations": "查看 · 新建采购单",
    "searchText": "SKU-3307 蛋白棒礼盒 华东仓"
  },
  {
    "sku": "SKU-4421",
    "name": "无糖椰子水",
    "warehouse": "华西仓",
    "available": 84,
    "status": "低库存",
    "expiryDate": "2026-09-05",
    "needsAction": true,
    "operations": "查看 · 新建采购单",
    "searchText": "SKU-4421 无糖椰子水 华西仓"
  },
  {
    "sku": "SKU-5096",
    "name": "每日坚果组合",
    "warehouse": "华北仓",
    "available": 726,
    "status": "充足",
    "expiryDate": "2026-12-20",
    "needsAction": false,
    "operations": "查看",
    "searchText": "SKU-5096 每日坚果组合 华北仓"
  },
  {
    "sku": "SKU-6180",
    "name": "儿童酸奶杯",
    "warehouse": "华东仓",
    "available": 46,
    "status": "临期风险",
    "expiryDate": "2026-08-15",
    "needsAction": true,
    "operations": "查看 · 新建采购单",
    "searchText": "SKU-6180 儿童酸奶杯 华东仓"
  }
];

function InventoryListPage() {
  type InventoryListRow = (typeof inventoryListRows)[number];
  type DateRangeValue = readonly [{ format: (value: string) => string }, { format: (value: string) => string }] | undefined;
  const [queryForm] = Form.useForm();
  const [query, setQuery] = useState<Record<string, unknown>>({});
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("inventory");
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<InventoryListRow | null>(null);
  const visibleRows = useMemo(
    () => inventoryListRows.filter((row) =>
      (!query["keyword"] || String(row.searchText ?? "").toLocaleLowerCase().includes(String(query["keyword"]).trim().toLocaleLowerCase())) &&
      (!query["warehouse"] || String(row.warehouse ?? "") === String(query["warehouse"])) &&
      (!query["status"] || String(row.status ?? "") === String(query["status"])) &&
      (!needsActionOnly || Boolean(row.needsAction))
    ),
    [query, needsActionOnly]
  );
  const columns = [
    { title: "SKU", dataIndex: "sku", key: "sku", width: 112 },
    { title: "名称", dataIndex: "name", key: "name", width: 146, ellipsis: true },
    { title: "仓库", dataIndex: "warehouse", key: "warehouse", width: 86 },
    { title: "可用量", dataIndex: "available", key: "available", width: 76 },
    { title: "状态", dataIndex: "status", key: "status", width: 94, render: (value: unknown) => { const label = String(value ?? ""); const color = ({"低库存":"gold","临期风险":"red","充足":"green"} as Record<string, string>)[label] ?? "default"; return label === "—" ? <Typography.Text type="secondary">—</Typography.Text> : <Tag color={color}>{label}</Tag>; } },
    { title: "临期日", dataIndex: "expiryDate", key: "expiryDate", width: 108 },
    { title: "操作", dataIndex: "operations", key: "operations", width: 164 }
  ];

  function resetQuery() {
    queryForm.resetFields();
    setQuery({});
    setNeedsActionOnly(false);
  }

  return (
    <NativePageShell
      title={"库存列表"}
      goal={"筛选库存记录，识别需要处理的行。"}
      actions={<Space><Button type="primary" onClick={() => setPrimaryOpen(true)} data-testid="golden-primary-action">新建采购单</Button></Space>}
    >
      <Alert showIcon type="info" title={"库存风险数据为冻结演示样本；新建采购单只验证交互，不会提交真实业务数据。"} />
      <Card className="generated-process-card">
        <div className="generated-section-heading">
          <Typography.Title level={4}>库存补货处理链</Typography.Title>
          <Typography.Text type="secondary">识别风险库存后创建采购单，并跟踪供应商确认与到货入库。</Typography.Text>
        </div>
        <Steps current={1} responsive items={[
  {
    "title": "识别风险"
  },
  {
    "title": "创建采购单"
  },
  {
    "title": "供应商确认"
  },
  {
    "title": "到货入库"
  }
]} />
      </Card>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: "inventory",
            label: "库存结余",
            children: (
              <Space orientation="vertical" size="middle" className="generated-tab-stack">
                <Card className="generated-query-card">
                  <Form form={queryForm} layout="vertical" className="generated-query-grid" onFinish={(values: Record<string, unknown>) => setQuery(values)}>
                    <Form.Item label={"关键字"} name={"keyword"}><Input allowClear placeholder={"SKU 或仓库"} data-testid={"golden-filter-keyword"} /></Form.Item>
                    <Form.Item label={"仓库"} name={"warehouse"}><Select allowClear placeholder={"全部仓库"} options={[{"label":"华西仓","value":"华西仓"},{"label":"华北仓","value":"华北仓"},{"label":"华东仓","value":"华东仓"}]} data-testid={"golden-filter-warehouse"} /></Form.Item>
                    <Form.Item label={"状态"} name={"status"}><Select allowClear placeholder={"全部状态"} options={[{"label":"充足","value":"充足"},{"label":"低库存","value":"低库存"},{"label":"临期风险","value":"临期风险"}]} data-testid={"golden-filter-status"} /></Form.Item>
                    <div className="generated-switch-filter"><span>仅看需处理</span><Switch checked={needsActionOnly} onChange={setNeedsActionOnly} data-testid={"golden-filter-needsActionOnly"} /></div>
                    <div className="generated-query-actions">
                      <Button htmlType="submit" type="primary" data-testid="golden-query">查询</Button>
                      <Button icon={<ReloadOutlined />} onClick={resetQuery}>重置</Button>
                    </div>
                  </Form>
                </Card>
                <Card
                  className="generated-table-card"
                  title={<div><Typography.Title level={4}>库存结余</Typography.Title><Typography.Text type="secondary">共 124 条 · 数据更新时间 2026-08-09 10:32</Typography.Text></div>}
                  extra={<Typography.Text type="secondary">共 {visibleRows.length} 条</Typography.Text>}
                >
                  <Table<InventoryListRow>
                    rowKey={"sku"}
                    size="middle"
                    dataSource={visibleRows}
                    columns={columns}
                    rowSelection={{ selectedRowKeys, onChange: (keys: Key[]) => setSelectedRowKeys(keys) }}
                    pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => "共 " + total + " 条" }}
                    scroll={{ x: 834 }}
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
            key: "purchase-tasks",
            label: "采购待办",
            children: <Card className="generated-empty-card"><Empty description={"当前没有待处理的采购任务"} /></Card>
          }
        ]} />
      <Drawer
        open={primaryOpen}
        title={"新建采购单"}
        size={600}
        destroyOnHidden
        mask={{ closable: false }}
        onClose={() => setPrimaryOpen(false)}
        footer={<Space><Button onClick={() => setPrimaryOpen(false)}>取消</Button><Button form="golden-primary-form" htmlType="submit" type="primary">保存采购单草稿</Button></Space>}
      >
        <Typography.Paragraph type="secondary">从库存风险上下文创建补货需求；提交只关闭当前演示面板。</Typography.Paragraph>
        <Form id="golden-primary-form" layout="vertical" onFinish={() => setPrimaryOpen(false)}>
          <Form.Item label={"供应商"} name={"supplier"} rules={[{ required: true, message: "供应商必填" }]}><Select placeholder={"请选择供应商"} options={[{"label":"川西食品供应链","value":"west-food"},{"label":"华北冷链供应","value":"north-cold"}]} /></Form.Item>
          <Form.Item label={"SKU"} name={"sku"} rules={[{ required: true, message: "SKU必填" }]}><Input placeholder={"输入需要补货的 SKU"} /></Form.Item>
          <Form.Item label={"采购数量"} name={"quantity"} rules={[{ required: true, message: "采购数量必填" }]}><Input placeholder={"输入采购数量"} /></Form.Item>
          <Form.Item label={"预计到货周期"} name={"arrival"} rules={[{ required: true, message: "预计到货周期必填" }]}><DatePicker.RangePicker placeholder={['开始日期', '结束日期']} showTime /></Form.Item>
          <Form.Item label={"采购说明"} name={"remark"}><Input.TextArea rows={3} placeholder={"补充库存风险与采购说明"} /></Form.Item>
        </Form>
      </Drawer>
      <Drawer
        open={Boolean(detailRow)}
        title={detailRow ? "库存结余 · " + String(detailRow.sku) : "库存结余"}
        size={520}
        destroyOnHidden
        onClose={() => setDetailRow(null)}
      >
        <Descriptions bordered column={1} items={[
              { key: "sku", label: "SKU", children: String(detailRow?.sku ?? "—") },
              { key: "name", label: "名称", children: String(detailRow?.name ?? "—") },
              { key: "warehouse", label: "仓库", children: String(detailRow?.warehouse ?? "—") },
              { key: "available", label: "可用量", children: String(detailRow?.available ?? "—") },
              { key: "status", label: "状态", children: String(detailRow?.status ?? "—") },
              { key: "expiryDate", label: "临期日", children: String(detailRow?.expiryDate ?? "—") },
              { key: "operations", label: "操作", children: String(detailRow?.operations ?? "—") }
            ]} />
      </Drawer>
    </NativePageShell>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "inventory-list", route: "/inventory", title: "库存列表", pattern: "list-page", component: InventoryListPage }
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
