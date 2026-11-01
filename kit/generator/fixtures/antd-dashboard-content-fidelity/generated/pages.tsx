import type { ReactNode } from "react";
import type { ThemeConfig } from "antd";
import {
  Button,
  Card,
  Col,
  ConfigProvider,
  Row,
  Space,
  Statistic,
  Typography
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import "antd/dist/reset.css";
import "./styles.css";

export type GeneratedPageId = "content-fidelity-canary";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "antd-dashboard-content-fidelity-canary",
  "product": {
    "name": "设备状态校验台",
    "description": "用于验证普通 AntD dashboard 保留业务文案并隔离验收脚手架的独立非 Holdout fixture。"
  },
  "outputMode": "library-native",
  "foundation": "antd"
} as const;

const nativeTheme: ThemeConfig = {
  cssVar: { key: "generated", prefix: "ant" },
  hashed: false
};



function ContentFidelityCanaryPage() {
  return (
    <NativePageShell title={"设备健康概览"} goal={"在一屏内判断设备在线状态和待处理风险。"} actions={<Space><Button>同步状态</Button><Button type="primary">查看异常设备</Button></Space>}>
      <Row gutter={[16, 16]}>
          <Col xs={24} md={8}><Card><Space orientation="vertical" size="small"><Statistic title={"在线网关"} value={128} /><Typography.Text type="secondary" data-testid={"dashboard-metric-delta-0"} data-trend={"up"}>+7</Typography.Text></Space></Card></Col>
          <Col xs={24} md={8}><Card><Space orientation="vertical" size="small"><Statistic title={"告警设备"} value={6} /><Typography.Text type="secondary" data-testid={"dashboard-metric-delta-1"} data-trend={"flat"}>平稳</Typography.Text></Space></Card></Col>
          <Col xs={24} md={8}><Card><Space orientation="vertical" size="small"><Statistic title={"待校准"} value={3} /><Typography.Text type="secondary" data-testid={"dashboard-metric-delta-2"} data-trend={"down"}>-1</Typography.Text></Space></Card></Col>
      </Row>
      
    </NativePageShell>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "content-fidelity-canary", route: "/fixtures/dashboard-content-fidelity", title: "设备健康概览", pattern: "dashboard-page", component: ContentFidelityCanaryPage }
];

function NativePageShell({ title, goal, action, actions, children }: { title: string; goal: string; action?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <ConfigProvider theme={nativeTheme}>
      <main className="generated-page">
        <Space orientation="vertical" size="large" className="generated-stack">
          <header className="generated-native-header">
            <div>
              <Typography.Title level={2}>{title}</Typography.Title>
              <Typography.Paragraph>{goal}</Typography.Paragraph>
            </div>
            {actions ?? (action ? <Button type="primary">{action}</Button> : null)}
          </header>
          {children}
        </Space>
      </main>
    </ConfigProvider>
  );
}
