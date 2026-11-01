import { useMemo, useState, type ReactNode } from "react";
import type { ThemeConfig } from "antd";
import {
  Button,
  Card,
  ConfigProvider,
  Form,
  Input,
  Select,
  Space,
  Table,
  Typography
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import "antd/dist/reset.css";
import "./styles.css";

export type GeneratedPageId = "filtering-canary";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "antd-simple-list-filtering-canary",
  "product": {
    "name": "筛选行为校验台",
    "description": "用于验证简单列表筛选能把已提交的文本与下拉条件应用到业务表格的独立非 Holdout fixture。"
  },
  "outputMode": "library-native",
  "foundation": "antd"
} as const;

const nativeTheme: ThemeConfig = {
  cssVar: { key: "generated", prefix: "ant" },
  hashed: false
};

const filteringCanaryRows = [
  {
    "id": "TK-1001",
    "customer": "北岸实验室",
    "priority": "紧急",
    "owner": "林师傅"
  },
  {
    "id": "TK-1002",
    "customer": "新桥仓储",
    "priority": "常规",
    "owner": "周师傅"
  },
  {
    "id": "TK-1003",
    "customer": "东港数据中心",
    "priority": "紧急",
    "owner": "待分派"
  }
];

function FilteringCanaryPage() {
  const [filterForm] = Form.useForm();
  const [submittedFilters, setSubmittedFilters] = useState<Record<string, unknown>>({});
  const visibleRows = useMemo(
    () => filteringCanaryRows.filter((row) =>
      (!String(submittedFilters["keyword"] ?? "").trim() || [row.id, row.customer].some((value) => String(value ?? "").toLocaleLowerCase().includes(String(submittedFilters["keyword"] ?? "").trim().toLocaleLowerCase()))) &&
      (!String(submittedFilters["priority"] ?? "").trim() || [row.priority].some((value) => String(value ?? "").toLocaleLowerCase() === String((({"urgent":"紧急","normal":"常规"} as Record<string, string>)[String(submittedFilters["priority"])] ?? String(submittedFilters["priority"] ?? ""))).trim().toLocaleLowerCase()))
    ),
    [submittedFilters]
  );

  const resetFilters = () => {
    filterForm.resetFields();
    setSubmittedFilters({});
  };

  return (
    <NativePageShell title={"待处理任务"} goal={"按任务编号或客户名称和优先级筛选待处理任务，并可一键恢复完整列表。"} action={"新建任务"}>
      <Card>
        <Form form={filterForm} layout="inline" onFinish={(values: Record<string, unknown>) => setSubmittedFilters(values)}>
          <Form.Item label={"关键字"} name={"keyword"}><Input placeholder={"任务编号或客户"} /></Form.Item>
          <Form.Item label={"优先级"} name={"priority"}><Select placeholder={"请选择优先级"} options={[{"label":"紧急","value":"urgent"},{"label":"常规","value":"normal"}]} /></Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" data-testid="simple-list-filter-submit">筛选</Button>
              <Button icon={<ReloadOutlined />} onClick={resetFilters} data-testid="simple-list-filter-reset">重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card
        title={"任务列表"}
        extra={<Space><Typography.Text data-testid="simple-list-filter-count">共 {visibleRows.length} 条</Typography.Text><Button>导出</Button></Space>}
      >
        <Table rowKey={"id"} dataSource={visibleRows} columns={[
  {
    "title": "任务编号",
    "dataIndex": "id",
    "key": "id"
  },
  {
    "title": "客户",
    "dataIndex": "customer",
    "key": "customer"
  },
  {
    "title": "优先级",
    "dataIndex": "priority",
    "key": "priority"
  },
  {
    "title": "负责人",
    "dataIndex": "owner",
    "key": "owner"
  }
]} pagination={{ pageSize: 20, total: visibleRows.length }} />
      </Card>
    </NativePageShell>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "filtering-canary", route: "/fixtures/simple-list-filtering", title: "待处理任务", pattern: "list-page", component: FilteringCanaryPage }
];

function NativePageShell({ title, goal, action, children }: { title: string; goal: string; action?: string; children: ReactNode }) {
  return (
    <ConfigProvider theme={nativeTheme}>
      <main className="generated-page">
        <Space orientation="vertical" size="large" className="generated-stack">
          <header className="generated-native-header">
            <div>
              <Typography.Title level={2}>{title}</Typography.Title>
              <Typography.Paragraph>{goal}</Typography.Paragraph>
            </div>
            {action ? <Button type="primary">{action}</Button> : null}
          </header>
          {children}
        </Space>
      </main>
    </ConfigProvider>
  );
}
