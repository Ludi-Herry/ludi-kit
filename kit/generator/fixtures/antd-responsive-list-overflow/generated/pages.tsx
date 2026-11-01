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

export type GeneratedPageId = "responsive-list-canary";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "antd-responsive-list-overflow-canary",
  "product": {
    "name": "响应式列表校验台",
    "description": "用于验证多列表格、筛选栏和卡片操作在 390px 视口保持页面级零横向溢出的独立非 Holdout fixture。"
  },
  "outputMode": "library-native",
  "foundation": "antd"
} as const;

const nativeTheme: ThemeConfig = {
  cssVar: { key: "generated", prefix: "ant" },
  hashed: false
};

const responsiveListCanaryRows = [
  {
    "deviceId": "SIM-DEVICE-20260813-000001",
    "source": "东区边缘接入节点-17",
    "zone": "模拟一区",
    "severity": "高",
    "detectedAt": "2026-08-13 10:24:36",
    "owner": "值班工程师甲",
    "status": "待确认"
  },
  {
    "deviceId": "SIM-DEVICE-20260813-000002",
    "source": "西区边缘接入节点-08",
    "zone": "模拟二区",
    "severity": "中",
    "detectedAt": "2026-08-13 10:18:02",
    "owner": "值班工程师乙",
    "status": "处理中"
  }
];

function ResponsiveListCanaryPage() {
  const [filterForm] = Form.useForm();
  const [submittedFilters, setSubmittedFilters] = useState<Record<string, unknown>>({});
  const visibleRows = useMemo(
    () => responsiveListCanaryRows.filter((row) =>
      (!String(submittedFilters["keyword"] ?? "").trim() || [row.deviceId].some((value) => String(value ?? "").toLocaleLowerCase().includes(String(submittedFilters["keyword"] ?? "").trim().toLocaleLowerCase()))) &&
      (!String(submittedFilters["severity"] ?? "").trim() || [row.severity].some((value) => String(value ?? "").toLocaleLowerCase() === String((({"high":"高","medium":"中"} as Record<string, string>)[String(submittedFilters["severity"])] ?? String(submittedFilters["severity"] ?? ""))).trim().toLocaleLowerCase()))
    ),
    [submittedFilters]
  );

  const resetFilters = () => {
    filterForm.resetFields();
    setSubmittedFilters({});
  };

  return (
    <NativePageShell title={"设备事件队列"} goal={"按设备编号和等级筛选模拟事件，并在桌面与移动视口安全浏览完整列表。"} action={"登记事件"}>
      <Card>
        <Form form={filterForm} layout="inline" onFinish={(values: Record<string, unknown>) => setSubmittedFilters(values)}>
          <Form.Item label={"设备编号"} name={"keyword"}><Input placeholder={"输入模拟设备编号"} /></Form.Item>
          <Form.Item label={"事件等级"} name={"severity"}><Select placeholder={"请选择事件等级"} options={[{"label":"高","value":"high"},{"label":"中","value":"medium"}]} /></Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" data-testid="simple-list-filter-submit">筛选</Button>
              <Button icon={<ReloadOutlined />} onClick={resetFilters} data-testid="simple-list-filter-reset">重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card
        title={"模拟事件列表"}
        extra={<Space><Typography.Text data-testid="simple-list-filter-count">共 {visibleRows.length} 条</Typography.Text><Button>返回接入配置</Button></Space>}
      >
        <Table className="generated-responsive-table" scroll={{ x: "max-content" }} rowKey={"deviceId"} dataSource={visibleRows} columns={[
  {
    "title": "设备编号",
    "dataIndex": "deviceId",
    "key": "deviceId"
  },
  {
    "title": "接入来源",
    "dataIndex": "source",
    "key": "source"
  },
  {
    "title": "所属区域",
    "dataIndex": "zone",
    "key": "zone"
  },
  {
    "title": "事件等级",
    "dataIndex": "severity",
    "key": "severity"
  },
  {
    "title": "发现时间",
    "dataIndex": "detectedAt",
    "key": "detectedAt"
  },
  {
    "title": "当前负责人",
    "dataIndex": "owner",
    "key": "owner"
  },
  {
    "title": "处置状态",
    "dataIndex": "status",
    "key": "status"
  }
]} pagination={{ pageSize: 20, total: visibleRows.length }} />
      </Card>
    </NativePageShell>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "responsive-list-canary", route: "/fixtures/responsive-list-overflow", title: "设备事件队列", pattern: "list-page", component: ResponsiveListCanaryPage }
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
