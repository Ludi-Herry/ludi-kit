import type { ReactNode } from "react";
import type { ThemeConfig } from "antd";
import {
  Button,
  Card,
  ConfigProvider,
  Form,
  Radio,
  Space,
  Typography
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import "antd/dist/reset.css";
import "./styles.css";

export type GeneratedPageId = "radio-coverage-form";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "antd-radio-knowledge-canary",
  "product": {
    "name": "发布策略校验台",
    "description": "用于验证 AntD Radio.Group 冻结知识覆盖的独立非 Holdout 生成器 fixture。"
  },
  "outputMode": "library-native",
  "foundation": "antd"
} as const;

const nativeTheme: ThemeConfig = {
  cssVar: { key: "generated", prefix: "ant" },
  hashed: false
};



function RadioCoverageFormPage() {
  return (
    <NativePageShell title={"发布策略校验"} goal={"选择一个发布模式并提交校验，确认正式 library-native 生成路径可以完整冻结 Radio 组件知识。"}>
      <Card>
        <Form layout="vertical">
          <Form.Item label={"发布模式"} name={"releaseMode"} rules={[{ required: true, message: "发布模式必填" }]}><Radio.Group options={[{"label":"灰度发布","value":"canary"},{"label":"全量发布","value":"full"},{"label":"仅校验","value":"validate-only"}]} /></Form.Item>
          <Form.Item>
            <Space>
              <Button>取消</Button>
              <Button type="primary">提交校验</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </NativePageShell>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "radio-coverage-form", route: "/fixtures/radio-coverage", title: "发布策略校验", pattern: "form-page", component: RadioCoverageFormPage }
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
