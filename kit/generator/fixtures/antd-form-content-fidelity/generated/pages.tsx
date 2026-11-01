import type { ReactNode } from "react";
import type { ThemeConfig } from "antd";
import {
  Button,
  Card,
  ConfigProvider,
  Form,
  Input,
  Select,
  Space,
  Steps,
  Typography
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import "antd/dist/reset.css";
import "./styles.css";

export type GeneratedPageId = "form-content-fidelity-canary";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "antd-form-content-fidelity-canary",
  "product": {
    "name": "批处理任务校验台",
    "description": "用于验证普通 AntD form 保留业务步骤、分组和操作文案并隔离验收脚手架的独立非 Holdout fixture。"
  },
  "outputMode": "library-native",
  "foundation": "antd"
} as const;

const nativeTheme: ThemeConfig = {
  cssVar: { key: "generated", prefix: "ant" },
  hashed: false
};



function FormContentFidelityCanaryPage() {
  return (
    <NativePageShell title={"新建批处理任务"} goal={"分组录入任务来源、执行策略与数量备注。"}>
      <Card>
        <Form layout="vertical">
<Space orientation="vertical" size="large" className="generated-form-stack">
          <Steps current={0} responsive items={[{ title: "选择任务" }, { title: "绑定策略" }, { title: "确认执行" }]} />
          <section className="generated-form-section">
            <Typography.Title level={4}>任务来源</Typography.Title>
          <Form.Item label={"来源任务"} name={"sourceTask"} rules={[{ required: true, message: "来源任务必填" }]}><Select placeholder={"请选择来源任务"} options={[{"label":"TASK-DEMO-01","value":"task-demo-01"}]} /></Form.Item>
          </section>
          <section className="generated-form-section">
            <Typography.Title level={4}>策略配置</Typography.Title>
          <Form.Item label={"执行策略"} name={"policy"} rules={[{ required: true, message: "执行策略必填" }]}><Select placeholder={"请选择执行策略"} options={[{"label":"标准策略","value":"standard"}]} /></Form.Item>
          </section>
          <section className="generated-form-section">
            <Typography.Title level={4}>数量与备注</Typography.Title>
          <Form.Item label={"执行数量"} name={"quantity"} rules={[{ required: true, message: "执行数量必填" }]}><Input placeholder={"输入执行数量"} /></Form.Item>
          <Form.Item label={"执行备注"} name={"note"}><Input.TextArea placeholder={"补充异常处理说明"} /></Form.Item>
          </section>
        </Space>
          <Form.Item>
            <Space className="generated-form-actions">
              <Button>保存草稿</Button>
              <Button>返回列表</Button>
              <Button type="primary">创建任务</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </NativePageShell>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "form-content-fidelity-canary", route: "/fixtures/form-content-fidelity", title: "新建批处理任务", pattern: "form-page", component: FormContentFidelityCanaryPage }
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
